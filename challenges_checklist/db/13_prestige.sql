-- ============================================================
-- 13_prestige.sql — Desafíos de PRESTIGIO (estilo Temporada X)
--   * Nueva columna challenges.is_prestige. Son desafíos EXTRA por semana,
--     versiones más difíciles/únicas de los objetivos normales.
--   * Se DESBLOQUEAN al completar TODOS los desafíos normales de la semana
--     (como el "Prestige" de la Temporada X). El bloqueo se aplica en
--     report_event (no avanzan antes de tiempo) y en la UI.
--   * No cuentan para el meta semanal normal (trigger sync_week_meta).
--   * Contenido: Semana 1 de Season 8 como plantilla (5 desafíos). Replicar
--     el patrón del bloque DO para más semanas.
-- ============================================================

alter table public.challenges
  add column if not exists is_prestige boolean not null default false;

-- 1) El meta semanal NORMAL ignora los desafíos de prestigio --------------
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

  -- cada línea de fases cuenta como UN desafío; el prestigio NO cuenta
  select count(*), count(*) filter (where done)
  into v_total, v_done
  from (
    select bool_and(is_completed) as done
    from challenges
    where week_id = v_week and is_meta = false and is_prestige = false
    group by coalesce(line_id::text, id::text)
  ) units;

  update challenges
  set target_value = greatest(v_total, 1),
      current_value = least(v_done, greatest(v_total, 1))
  where week_id = v_week and is_meta = true;

  return null;
end;
$fn$;

-- 2) report_event: los desafíos de prestigio NO avanzan hasta que todos los
--    desafíos normales (no meta) de su semana estén completos --------------
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
  v_eff record;
  v_imp record;
  v_imp_obj uuid;
  v_imp_tag uuid;
  v_sub jsonb;
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
      c.target_value, c.line_id,
      array_agg(distinct cr.id) as matched_rule_ids,
      (select count(*) from challenge_rules t where t.challenge_id = c.id) as total_rules
    from challenges c
    join challenge_rules cr on cr.challenge_id = c.id
    join action_types act on act.id = cr.action_type_id
    where c.is_completed = false
      and c.is_meta = false
      and act.code = p_action_code
      -- PRESTIGIO bloqueado: solo avanza si todos los normales de su semana
      -- (no meta, no prestigio) ya están completos
      and (
        c.is_prestige = false
        or not exists (
          select 1 from challenges nrm
          where nrm.week_id = c.week_id
            and nrm.is_meta = false
            and nrm.is_prestige = false
            and nrm.is_completed = false
        )
      )
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
            and prev.phase_order < c.phase_order
            and (prev.is_completed = false or prev.completed_in_match is not null)
        )
      )
    group by c.id
  loop
    if (v_ch.match_scope in ('same_match', 'different_matches') or v_ch.line_id is not null)
       and v_match_id is null then
      v_skipped := v_skipped || jsonb_build_object(
        'id', v_ch.id, 'description', v_ch.description, 'reason', 'no_active_match'
      );
      continue;
    end if;

    if v_ch.unit = 'distinct_location' then
      v_named := false;
      if p_location_id is not null then
        select named_location into v_named from locations where id = p_location_id;
      end if;

      if not coalesce(v_named, false) then
        v_skipped := v_skipped || jsonb_build_object(
          'id', v_ch.id, 'description', v_ch.description, 'reason', 'named_location_required'
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
      set is_completed = true, current_value = coalesce(target_value, 1)
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
    into v_row from challenges where id = v_ch.id;

    v_updated := v_updated || jsonb_build_object(
      'id', v_row.id, 'description', v_row.description,
      'current_value', v_row.current_value, 'target_value', v_row.target_value,
      'is_completed', v_row.is_completed
    );
  end loop;

  -- consumibles
  if p_used_object_id is not null then
    for v_eff in
      select effect_action, amount_per_use
      from object_effects
      where object_id = p_used_object_id and trigger_action = p_action_code
    loop
      v_sub := public.report_event(
        v_eff.effect_action, p_amount * v_eff.amount_per_use,
        p_used_object_id, null, null, null, null, '{}'
      );
      v_updated := v_updated || coalesce(v_sub->'updated', '[]'::jsonb);
      v_skipped := v_skipped || coalesce(v_sub->'skipped', '[]'::jsonb);
    end loop;
  end if;

  -- visita implícita
  if p_action_code <> 'visit' and p_location_id is not null then
    v_sub := public.report_event('visit', 1, null, null, null, null, p_location_id, '{}');
    v_updated := v_updated || coalesce(v_sub->'updated', '[]'::jsonb);
    v_skipped := v_skipped || coalesce(v_sub->'skipped', '[]'::jsonb);
  end if;

  -- implicaciones declaradas
  for v_imp in
    select implied_action, implied_object_code
    from event_implications
    where trigger_action = p_action_code
      and (trigger_condition is null
           or trigger_condition = any(coalesce(p_conditions, '{}')))
  loop
    if v_imp.implied_object_code is not null then
      select id into v_imp_obj from game_objects where code = v_imp.implied_object_code;
      v_imp_tag := null;
    else
      v_imp_obj := p_used_object_id;
      v_imp_tag := p_used_tag_id;
    end if;

    if v_imp_obj is not null or v_imp_tag is not null then
      v_sub := public.report_event(
        v_imp.implied_action, 1, v_imp_obj, v_imp_tag, null, null, null, '{}'
      );
      v_updated := v_updated || coalesce(v_sub->'updated', '[]'::jsonb);
      v_skipped := v_skipped || coalesce(v_sub->'skipped', '[]'::jsonb);
    end if;
  end loop;

  return jsonb_build_object(
    'updated', v_updated, 'skipped', v_skipped,
    'has_active_match', v_match_id is not null
  );
end;
$fn$;

-- 3) Contenido de prestigio: Semana 1 (Season 8) --------------------------
do $$
declare
  v_week uuid;
  v_ch uuid;
  a_kill uuid; a_damage uuid; a_use uuid; a_visit uuid;
  t_shotgun uuid; t_explosive uuid;
  o_vent uuid;
  loc text;
begin
  select w.id into v_week
  from challenge_weeks w join seasons s on s.id = w.season_id
  where s.code = 'season_8' and w.week_number = 1;

  if v_week is null then
    raise notice 'Semana 1 de season_8 no encontrada'; return;
  end if;

  -- idempotente: no re-sembrar
  if exists (select 1 from challenges where week_id = v_week and is_prestige = true) then
    raise notice 'Prestigio de la semana 1 ya existe'; return;
  end if;

  select id into a_kill   from action_types where code = 'kill';
  select id into a_damage from action_types where code = 'damage';
  select id into a_use    from action_types where code = 'use';
  select id into a_visit  from action_types where code = 'visit';
  select id into t_shotgun   from tags where code = 'shotgun';
  select id into t_explosive from tags where code = 'explosive';
  select id into o_vent from game_objects where code = 'volcano_vent';

  -- P1 — escopeta, misma partida (más difícil: 3 en una sola)
  insert into challenges (description, kind, unit, match_scope, current_value,
    target_value, is_completed, week_id, is_meta, is_prestige, rules_operator)
  values ('Consigue 3 eliminaciones con escopeta en una sola partida',
    'progress', 'count', 'same_match', 0, 3, false, v_week, false, true, 'and')
  returning id into v_ch;
  insert into challenge_rules (challenge_id, action_type_id, required_tag_id)
  values (v_ch, a_kill, t_shotgun);

  -- P2 — daño con explosivos (cantidad alta)
  insert into challenges (description, kind, unit, match_scope, current_value,
    target_value, is_completed, week_id, is_meta, is_prestige, rules_operator)
  values ('Inflige 750 de daño a oponentes con armas explosivas',
    'progress', 'value', 'any_match', 0, 750, false, v_week, false, true, 'and')
  returning id into v_ch;
  insert into challenge_rules (challenge_id, action_type_id, required_tag_id)
  values (v_ch, a_damage, t_explosive);

  -- P3 — las 3 caras gigantes en una sola partida
  insert into challenges (description, kind, unit, match_scope, current_value,
    target_value, is_completed, week_id, is_meta, is_prestige, rules_operator)
  values ('Visita las 3 caras gigantes en una sola partida',
    'progress', 'count', 'same_match', 0, 3, false, v_week, false, true, 'and')
  returning id into v_ch;
  foreach loc in array array['giant_face_desert','giant_face_jungle','giant_face_snow'] loop
    insert into challenge_rules (challenge_id, action_type_id, location_id)
    values (v_ch, a_visit, (select id from locations where code = loc));
  end loop;

  -- P4 — respiraderos volcánicos en 5 partidas diferentes
  insert into challenges (description, kind, unit, match_scope, current_value,
    target_value, is_completed, week_id, is_meta, is_prestige, rules_operator)
  values ('Usa respiraderos volcánicos en 5 partidas diferentes',
    'progress', 'count', 'different_matches', 0, 5, false, v_week, false, true, 'and')
  returning id into v_ch;
  insert into challenge_rules (challenge_id, action_type_id, required_object_id)
  values (v_ch, a_use, o_vent);

  -- P5 — los 7 campamentos piratas en una sola partida
  insert into challenges (description, kind, unit, match_scope, current_value,
    target_value, is_completed, week_id, is_meta, is_prestige, rules_operator)
  values ('Visita los 7 campamentos piratas en una sola partida',
    'progress', 'count', 'same_match', 0, 7, false, v_week, false, true, 'and')
  returning id into v_ch;
  foreach loc in array array['pirate_camp_snow','pirate_camp_dusty','pirate_camp_volcano',
    'pirate_camp_paradise','pirate_camp_pleasant','pirate_camp_crater','pirate_camp_lagoon'] loop
    insert into challenge_rules (challenge_id, action_type_id, location_id)
    values (v_ch, a_visit, (select id from locations where code = loc));
  end loop;
end $$;
