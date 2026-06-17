-- ============================================================
-- 01_engine.sql — Motor de eventos para el panel de supervisión
--   * challenges.unit: 'count' (cada evento suma 1) | 'value' (se suman cantidades)
--   * match_rule_progress: acumulador por (partida, regla); match_id null = acumulador global
--   * report_event(): aplica un evento a todas las reglas coincidentes
--   * start_match()/end_active_match(): resetean progreso same_match incompleto
-- ============================================================

-- 1. challenges.unit
alter table public.challenges
  add column if not exists unit text not null default 'count';

do $$ begin
  alter table public.challenges
    add constraint challenges_unit_check check (unit in ('count', 'value'));
exception when duplicate_object then null; end $$;

-- 2. match_rule_progress: amount + match_id opcional
alter table public.match_rule_progress
  add column if not exists amount bigint not null default 1;

alter table public.match_rule_progress
  alter column match_id drop not null;

alter table public.match_rule_progress
  drop constraint if exists match_rule_progress_match_id_challenge_rule_id_key;

create unique index if not exists mrp_match_rule_unique
  on public.match_rule_progress (match_id, challenge_rule_id)
  where match_id is not null;

create unique index if not exists mrp_global_rule_unique
  on public.match_rule_progress (challenge_rule_id)
  where match_id is null;

-- 3. report_event
create or replace function public.report_event(
  p_action_code text,
  p_amount bigint default 1,
  p_used_object_id uuid default null,
  p_used_tag_id uuid default null,
  p_target_object_id uuid default null,
  p_target_tag_id uuid default null,
  p_location_id uuid default null,
  p_conditions text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_match_id uuid;
  v_ch record;
  v_rule_id uuid;
  v_rules_hit bigint;
  v_matches_hit bigint;
  v_match_amount bigint;
  v_row record;
  v_updated jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if coalesce(p_amount, 0) <= 0 then
    raise exception 'p_amount must be > 0';
  end if;

  select id into v_match_id
  from matches
  where is_active = true
  order by started_at desc
  limit 1;

  for v_ch in
    select
      c.id, c.description, c.kind, c.unit, c.match_scope, c.rules_operator,
      c.target_value,
      array_agg(distinct cr.id) as matched_rule_ids,
      (select count(*) from challenge_rules t where t.challenge_id = c.id) as total_rules
    from challenges c
    join challenge_rules cr on cr.challenge_id = c.id
    join action_types act on act.id = cr.action_type_id
    where c.is_completed = false
      and act.code = p_action_code
      and (cr.required_object_id is null or cr.required_object_id = p_used_object_id)
      and (
        cr.required_tag_id is null
        or cr.required_tag_id = p_used_tag_id
        or (p_used_object_id is not null and exists (
              select 1 from game_object_tags got
              where got.object_id = p_used_object_id
                and got.tag_id = cr.required_tag_id))
      )
      and (cr.target_object_id is null or cr.target_object_id = p_target_object_id)
      and (
        cr.target_tag_id is null
        or cr.target_tag_id = p_target_tag_id
        or (p_target_object_id is not null and exists (
              select 1 from game_object_tags got
              where got.object_id = p_target_object_id
                and got.tag_id = cr.target_tag_id))
      )
      and (cr.location_id is null or cr.location_id = p_location_id)
      and not exists (
        select 1 from rule_conditions rc
        where rc.challenge_rule_id = cr.id
          and not (rc.condition_key = any(coalesce(p_conditions, '{}')))
      )
      and (
        c.line_id is null or c.phase_order is null
        or not exists (
          select 1 from challenges prev
          where prev.line_id = c.line_id
            and prev.is_completed = false
            and prev.phase_order < c.phase_order
        )
      )
    group by c.id
  loop
    if v_ch.match_scope in ('same_match', 'different_matches') and v_match_id is null then
      v_skipped := v_skipped || jsonb_build_object(
        'id', v_ch.id,
        'description', v_ch.description,
        'reason', 'no_active_match'
      );
      continue;
    end if;

    if v_ch.kind = 'simple' then
      update challenges
      set is_completed = true,
          current_value = coalesce(target_value, 1)
      where id = v_ch.id;

    elsif v_ch.match_scope = 'any_match' then
      if v_ch.rules_operator = 'and' and v_ch.total_rules > 1 then
        -- cada regla cuenta una sola vez (acumulador global, match_id null)
        foreach v_rule_id in array v_ch.matched_rule_ids loop
          insert into match_rule_progress (match_id, challenge_id, challenge_rule_id, amount)
          values (null, v_ch.id, v_rule_id, 1)
          on conflict (challenge_rule_id) where match_id is null do nothing;
        end loop;

        select count(*) into v_rules_hit
        from match_rule_progress
        where challenge_id = v_ch.id and match_id is null;

        update challenges
        set current_value = least(v_rules_hit, target_value)
        where id = v_ch.id;
      else
        update challenges
        set current_value = least(coalesce(current_value, 0) + p_amount, target_value)
        where id = v_ch.id;
      end if;

    elsif v_ch.match_scope = 'same_match' then
      if v_ch.total_rules > 1 then
        -- cada regla una vez por partida; completa si todas en la misma partida
        foreach v_rule_id in array v_ch.matched_rule_ids loop
          insert into match_rule_progress (match_id, challenge_id, challenge_rule_id, amount)
          values (v_match_id, v_ch.id, v_rule_id, 1)
          on conflict (match_id, challenge_rule_id) where match_id is not null do nothing;
        end loop;

        select count(*) into v_rules_hit
        from match_rule_progress
        where challenge_id = v_ch.id and match_id = v_match_id;

        if v_rules_hit >= v_ch.total_rules then
          update challenges set current_value = target_value where id = v_ch.id;
        else
          update challenges
          set current_value = least(v_rules_hit, target_value)
          where id = v_ch.id;
        end if;
      else
        -- regla única: acumula cantidad dentro de la partida activa
        v_rule_id := v_ch.matched_rule_ids[1];

        insert into match_rule_progress (match_id, challenge_id, challenge_rule_id, amount)
        values (v_match_id, v_ch.id, v_rule_id, p_amount)
        on conflict (match_id, challenge_rule_id) where match_id is not null
        do update set amount = match_rule_progress.amount + excluded.amount;

        select amount into v_match_amount
        from match_rule_progress
        where challenge_id = v_ch.id
          and challenge_rule_id = v_rule_id
          and match_id = v_match_id;

        update challenges
        set current_value = least(v_match_amount, target_value)
        where id = v_ch.id;
      end if;

    else -- different_matches: una vez por partida
      foreach v_rule_id in array v_ch.matched_rule_ids loop
        insert into match_rule_progress (match_id, challenge_id, challenge_rule_id, amount)
        values (v_match_id, v_ch.id, v_rule_id, 1)
        on conflict (match_id, challenge_rule_id) where match_id is not null do nothing;
      end loop;

      select count(distinct match_id) into v_matches_hit
      from match_rule_progress
      where challenge_id = v_ch.id and match_id is not null;

      update challenges
      set current_value = least(v_matches_hit, target_value)
      where id = v_ch.id;
    end if;

    select id, description, current_value, target_value, is_completed
    into v_row
    from challenges
    where id = v_ch.id;

    v_updated := v_updated || jsonb_build_object(
      'id', v_row.id,
      'description', v_row.description,
      'current_value', v_row.current_value,
      'target_value', v_row.target_value,
      'is_completed', v_row.is_completed
    );
  end loop;

  return jsonb_build_object(
    'updated', v_updated,
    'skipped', v_skipped,
    'has_active_match', v_match_id is not null
  );
end;
$fn$;

-- 4. start/end match: el progreso "en una sola partida" se pierde al cambiar de partida
create or replace function public.start_match()
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_match_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if exists (select 1 from public.matches where is_active = true) then
    raise exception 'There is already an active match';
  end if;

  update public.challenges
  set current_value = 0
  where match_scope = 'same_match'
    and kind = 'progress'
    and is_completed = false
    and coalesce(current_value, 0) <> 0;

  insert into public.matches (is_active, started_by)
  values (true, auth.uid())
  returning id into v_match_id;

  return v_match_id;
end;
$fn$;

create or replace function public.end_active_match()
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.matches
  set is_active = false,
      ended_at = now(),
      ended_by = auth.uid()
  where is_active = true;

  update public.challenges
  set current_value = 0
  where match_scope = 'same_match'
    and kind = 'progress'
    and is_completed = false
    and coalesce(current_value, 0) <> 0;
end;
$fn$;

-- 5. apply_match_rule queda reemplazada por report_event
drop function if exists public.apply_match_rule(uuid);

-- 6. RLS: lectura para cualquier usuario autenticado (supervisores)
alter table public.seasons enable row level security;
alter table public.challenge_weeks enable row level security;
alter table public.matches enable row level security;
alter table public.match_rule_progress enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'action_types', 'tags', 'game_objects', 'game_object_tags', 'locations',
    'challenge_rules', 'rule_conditions', 'challenge_lines',
    'seasons', 'challenge_weeks', 'matches', 'match_rule_progress'
  ]
  loop
    execute format('drop policy if exists "Authenticated can read %s" on public.%I', t, t);
    execute format(
      'create policy "Authenticated can read %s" on public.%I for select to authenticated using (true)',
      t, t
    );
  end loop;
end $$;
