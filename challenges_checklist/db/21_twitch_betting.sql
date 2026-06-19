-- ============================================================
-- 21_twitch_betting.sql — Apuestas Twitch (Predictions) por semana
-- Pool configurable, detección automática semana ganadora, sorteo.
-- ============================================================

-- ---------- Tipos ----------
do $$ begin
  create type public.betting_pool_status as enum (
    'draft', 'open', 'locked', 'pending_resolve', 'resolved', 'cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.betting_win_mode as enum ('normales', 'normales_prestigio');
exception when duplicate_object then null;
end $$;

-- ---------- Semana completada (timestamp por modo) ----------
alter table public.challenge_weeks
  add column if not exists fully_completed_at timestamptz,
  add column if not exists fully_completed_prestige_at timestamptz;

-- ---------- Tokens OAuth del streamer (solo service role) ----------
create table if not exists public.twitch_tokens (
  id uuid primary key default gen_random_uuid(),
  broadcaster_id text not null unique,
  broadcaster_login text,
  broadcaster_name text,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scopes text,
  updated_at timestamptz not null default now()
);

alter table public.twitch_tokens enable row level security;
-- sin políticas: solo service role

-- ---------- Pools de apuesta ----------
create table if not exists public.betting_pools (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete cascade,
  title text not null,
  win_mode public.betting_win_mode not null default 'normales_prestigio',
  duration_seconds int not null default 600
    check (duration_seconds >= 30 and duration_seconds <= 1800),
  status public.betting_pool_status not null default 'draft',
  twitch_prediction_id text,
  opened_at timestamptz,
  winning_week_id uuid references public.challenge_weeks(id),
  winning_week_set_at timestamptz,
  raffle_seed text,
  raffle_winner_twitch_user_id text,
  raffle_winner_login text,
  raffle_winner_display_name text,
  resolve_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_betting_pools_season_status
  on public.betting_pools(season_id, status);

-- ---------- Outcomes ligados a semanas ----------
create table if not exists public.betting_pool_outcomes (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.betting_pools(id) on delete cascade,
  week_id uuid not null references public.challenge_weeks(id) on delete cascade,
  week_number int not null,
  outcome_title text not null,
  twitch_outcome_id text,
  unique (pool_id, week_id)
);

create index if not exists idx_betting_pool_outcomes_pool
  on public.betting_pool_outcomes(pool_id);

-- ---------- Apuestas acumuladas (EventSub progress) ----------
create table if not exists public.betting_prediction_bets (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.betting_pools(id) on delete cascade,
  twitch_user_id text not null,
  twitch_login text,
  twitch_display_name text,
  twitch_outcome_id text not null,
  points_wagered int not null default 0 check (points_wagered >= 0),
  updated_at timestamptz not null default now(),
  unique (pool_id, twitch_user_id, twitch_outcome_id)
);

create index if not exists idx_betting_prediction_bets_pool_outcome
  on public.betting_prediction_bets(pool_id, twitch_outcome_id);

-- ---------- Snapshot sorteo (acertantes) ----------
create table if not exists public.betting_raffle_entries (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.betting_pools(id) on delete cascade,
  twitch_user_id text not null,
  twitch_login text,
  twitch_display_name text,
  points_wagered int not null default 0,
  unique (pool_id, twitch_user_id)
);

-- ---------- Helpers ----------
create or replace function public.week_is_complete(
  p_week_id uuid,
  p_mode public.betting_win_mode
) returns boolean
language sql
stable
as $$
  select not exists (
    select 1 from public.challenges c
    where c.week_id = p_week_id
      and not c.is_meta
      and not c.is_completed
      and (p_mode = 'normales_prestigio' or not c.is_prestige)
  );
$$;

create or replace function public.week_completion_pct(
  p_week_id uuid,
  p_mode public.betting_win_mode
) returns numeric
language sql
stable
as $$
  select coalesce(
    round(
      100.0 * count(*) filter (where c.is_completed)
      / nullif(count(*), 0),
      1
    ),
    0
  )
  from public.challenges c
  where c.week_id = p_week_id
    and not c.is_meta
    and (p_mode = 'normales_prestigio' or not c.is_prestige);
$$;

-- Marca timestamps de semana completa
create or replace function public.trg_mark_week_fully_complete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_week_id uuid;
  v_pool record;
begin
  v_week_id := coalesce(new.week_id, old.week_id);
  if v_week_id is null then
    return new;
  end if;

  if public.week_is_complete(v_week_id, 'normales')
     and (select fully_completed_at from challenge_weeks where id = v_week_id) is null then
    update challenge_weeks set fully_completed_at = now() where id = v_week_id;
  end if;

  if public.week_is_complete(v_week_id, 'normales_prestigio')
     and (select fully_completed_prestige_at from challenge_weeks where id = v_week_id) is null then
    update challenge_weeks set fully_completed_prestige_at = now() where id = v_week_id;
  end if;

  -- Pool activo: primera semana que cumple win_mode gana
  for v_pool in
    select p.id, p.win_mode, p.season_id, p.status
    from betting_pools p
    where p.status in ('open', 'locked')
      and p.winning_week_id is null
  loop
    if exists (
      select 1 from challenge_weeks w
      where w.id = v_week_id
        and w.season_id = v_pool.season_id
        and public.week_is_complete(w.id, v_pool.win_mode)
    ) then
      update betting_pools
      set winning_week_id = v_week_id,
          winning_week_set_at = now(),
          status = 'pending_resolve',
          updated_at = now()
      where id = v_pool.id
        and winning_week_id is null;
    end if;
  end loop;

  return new;
end;
$fn$;

drop trigger if exists trg_mark_week_fully_complete on public.challenges;
create trigger trg_mark_week_fully_complete
  after update of is_completed, current_value on public.challenges
  for each row
  execute function public.trg_mark_week_fully_complete();

-- ---------- RLS lectura pública ----------
alter table public.betting_pools enable row level security;
alter table public.betting_pool_outcomes enable row level security;
alter table public.betting_raffle_entries enable row level security;

grant select on public.betting_pools, public.betting_pool_outcomes,
  public.betting_raffle_entries to anon, authenticated;

drop policy if exists "Anyone can read betting_pools" on public.betting_pools;
create policy "Anyone can read betting_pools"
  on public.betting_pools for select to anon, authenticated using (true);

drop policy if exists "Anyone can read betting_pool_outcomes" on public.betting_pool_outcomes;
create policy "Anyone can read betting_pool_outcomes"
  on public.betting_pool_outcomes for select to anon, authenticated using (true);

drop policy if exists "Anyone can read betting_raffle_entries" on public.betting_raffle_entries;
create policy "Anyone can read betting_raffle_entries"
  on public.betting_raffle_entries for select to anon, authenticated using (true);

-- betting_prediction_bets: solo service role (datos sensibles de apuestas)
alter table public.betting_prediction_bets enable row level security;

-- Realtime para páginas públicas (idempotente)
do $$
begin
  alter publication supabase_realtime add table public.betting_pools;
exception
  when duplicate_object then null;
end $$;
