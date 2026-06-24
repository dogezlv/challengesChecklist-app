-- 43: apuestas custom (sin semanas), semanas incompletas, winning_outcome_id

alter table public.betting_pools
  add column if not exists pool_kind text not null default 'week_race'
    check (pool_kind in ('week_race', 'custom'));

alter table public.betting_pools
  add column if not exists winning_outcome_id uuid;

alter table public.betting_pool_outcomes
  alter column week_id drop not null;

-- week_number: número de semana o orden en apuestas libres
alter table public.betting_pool_outcomes
  alter column week_number drop not null;

alter table public.betting_pool_outcomes
  drop constraint if exists betting_pool_outcomes_pool_id_week_id_key;

create unique index if not exists idx_betting_outcomes_pool_week
  on public.betting_pool_outcomes(pool_id, week_id)
  where week_id is not null;

do $$ begin
  alter table public.betting_pools
    add constraint betting_pools_winning_outcome_id_fkey
    foreign key (winning_outcome_id) references public.betting_pool_outcomes(id);
exception when duplicate_object then null;
end $$;

-- Trigger: solo carreras por semana
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

  for v_pool in
    select p.id, p.win_mode, p.season_id, p.status
    from betting_pools p
    where p.pool_kind = 'week_race'
      and p.status in ('open', 'locked')
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
