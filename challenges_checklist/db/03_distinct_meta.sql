-- ============================================================
-- 03_distinct_meta.sql
--   * unit 'distinct_location': desafíos "en X lugares diferentes" registran
--     en qué lugares ya se hizo la acción (sin criterio humano; repetir
--     un lugar no suma).
--   * Desafío meta semanal "Completa todos los desafíos": auto-calculado por
--     trigger, no controlable por ningún usuario. Las líneas de fases cuentan
--     como UN desafío (completo solo cuando todas sus fases lo están) y el
--     target es el total de desafíos de la semana.
-- ============================================================

-- 1. challenges.is_meta + unit ampliado
alter table public.challenges
  add column if not exists is_meta boolean not null default false;

alter table public.challenges drop constraint if exists challenges_unit_check;
alter table public.challenges
  add constraint challenges_unit_check check (unit in ('count', 'value', 'distinct_location'));

-- 2. Registro de lugares ya contados por desafío
create table if not exists public.challenge_distinct_progress (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  match_id uuid references public.matches(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  created_at timestamptz default now()
);

create unique index if not exists cdp_any_unique
  on public.challenge_distinct_progress (challenge_id, location_id)
  where match_id is null;

create unique index if not exists cdp_match_unique
  on public.challenge_distinct_progress (challenge_id, match_id, location_id)
  where match_id is not null;

alter table public.challenge_distinct_progress enable row level security;
drop policy if exists "Authenticated can read challenge_distinct_progress" on public.challenge_distinct_progress;
create policy "Authenticated can read challenge_distinct_progress"
  on public.challenge_distinct_progress for select to authenticated using (true);

-- 3. report_event v2 (añade unit = distinct_location)
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
  v_locations_hit bigint;
  v_named boolean;
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
      and c.is_meta = false
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

    if v_ch.unit = 'distinct_location' then
      -- cuenta lugares con nombre diferentes; repetir lugar no suma
      v_named := false;
      if p_location_id is not null then
        select named_location into v_named from locations where id = p_location_id;
      end if;

      if not coalesce(v_named, false) then
        v_skipped := v_skipped || jsonb_build_object(
          'id', v_ch.id,
          'description', v_ch.description,
          'reason', 'named_location_required'
        );
        continue;
      end if;

      if v_ch.match_scope = 'same_match' then
        insert into challenge_distinct_progress (challenge_id, match_id, location_id)
        values (v_ch.id, v_match_id, p_location_id)
        on conflict (challenge_id, match_id, location_id) where match_id is not null do nothing;

        select count(*) into v_locations_hit
        from challenge_distinct_progress
        where challenge_id = v_ch.id and match_id = v_match_id;
      else
        insert into challenge_distinct_progress (challenge_id, match_id, location_id)
        values (v_ch.id, null, p_location_id)
        on conflict (challenge_id, location_id) where match_id is null do nothing;

        select count(*) into v_locations_hit
        from challenge_distinct_progress
        where challenge_id = v_ch.id and match_id is null;
      end if;

      update challenges
      set current_value = least(v_locations_hit, target_value)
      where id = v_ch.id;

    elsif v_ch.kind = 'simple' then
      update challenges
      set is_completed = true,
          current_value = coalesce(target_value, 1)
      where id = v_ch.id;

    elsif v_ch.match_scope = 'any_match' then
      if v_ch.rules_operator = 'and' and v_ch.total_rules > 1 then
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

-- 4. Trigger: el desafío meta de la semana se recalcula solo
create or replace function public.sync_week_meta()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_week uuid;
  v_done bigint;
  v_total bigint;
begin
  if tg_op = 'DELETE' then
    if old.is_meta then
      return null;
    end if;
    v_week := old.week_id;
  else
    if new.is_meta then
      return null; -- evita recursión al actualizar el propio meta
    end if;
    v_week := new.week_id;
  end if;

  if v_week is null then
    return null;
  end if;

  -- cada línea de fases cuenta como UN desafío; está hecho solo si TODAS
  -- sus fases están completas
  select count(*), count(*) filter (where done)
  into v_total, v_done
  from (
    select bool_and(is_completed) as done
    from challenges
    where week_id = v_week and is_meta = false
    group by coalesce(line_id::text, id::text)
  ) units;

  update challenges
  set target_value = greatest(v_total, 1),
      current_value = least(v_done, greatest(v_total, 1))
  where week_id = v_week and is_meta = true;

  return null;
end;
$fn$;

-- nota: los progress se completan con updates que solo tocan current_value
-- (is_completed lo cambia el trigger BEFORE), por eso se escucha también current_value
drop trigger if exists trg_sync_week_meta on public.challenges;
create trigger trg_sync_week_meta
after insert or update of is_completed, current_value or delete on public.challenges
for each row execute function public.sync_week_meta();

-- 5. Las RPCs manuales no pueden tocar desafíos meta
create or replace function public.toggle_challenge_completion(p_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  update public.challenges
  set is_completed = not is_completed
  where id = p_challenge_id
    and kind = 'simple'
    and is_meta = false;
end;
$fn$;

create or replace function public.increase_challenge_progress(p_challenge_id uuid, p_increase_value bigint)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  update public.challenges
  set current_value = greatest(0, least(current_value + p_increase_value, target_value))
  where id = p_challenge_id
    and kind = 'progress'
    and is_meta = false;
end;
$fn$;

create or replace function public.update_challenge_progress(p_challenge_id uuid, p_current_value bigint)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  update public.challenges
  set current_value = greatest(0, least(p_current_value, target_value))
  where id = p_challenge_id
    and kind = 'progress'
    and is_meta = false;
end;
$fn$;

-- 6. Datos: pasar los desafíos "lugares diferentes" a distinct_location
update public.challenges
set unit = 'distinct_location'
where description in (
  'Registra un cofre en 3 lugares con nombre diferentes en una sola partida',
  'Elimina oponentes en 5 lugares con nombre diferentes'
);

-- 7. Datos: desafío meta "Completa todos" por semana (idempotente).
--    El target es el nº de desafíos de la semana (líneas de fases = 1);
--    el trigger lo mantiene al día si luego cambian los desafíos.
insert into public.challenges
  (description, kind, unit, match_scope, current_value, target_value,
   is_completed, week_id, is_meta)
select
  'Completa todos los desafíos de la semana para desbloquear los prestigios',
  'progress', 'count', 'any_match', 0,
  greatest((select count(distinct coalesce(c.line_id::text, c.id::text))
            from public.challenges c
            where c.week_id = w.id and c.is_meta = false), 1),
  false, w.id, true
from public.challenge_weeks w
join public.seasons s on s.id = w.season_id
where s.code = 'season_8'
  and not exists (
    select 1 from public.challenges c where c.week_id = w.id and c.is_meta
  );
