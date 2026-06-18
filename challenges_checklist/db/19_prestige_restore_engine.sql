-- ============================================================
-- 19_prestige_restore_engine.sql
-- Revierte db/18 (que había simplificado 6 prestigios) y RESTAURA los
-- objetivos originales de db/17, pero esta vez AMPLIANDO la BD/motor para que
-- funcionen de verdad:
--   * challenge_rules.rule_group: grupos de reglas. El motor completa un
--     desafío multi-regla cuando se cumplen TODAS las reglas de ALGÚN grupo
--     (AND dentro del grupo, OR entre grupos). Sin grupo = un único grupo
--     implícito (comportamiento de siempre). Permite "puntos cardinales
--     opuestos" = (norte ∧ sur) ∨ (este ∧ oeste).
--   * game_objects 'chug_jug' (Bidón de plasma) + object_effect use→gain.
--   * rule_conditions para los matices que el supervisor confirma a mano
--     (antes de 10 s, ganar la partida, sin recibir daño, sin cofres).
-- Idempotente: matchea por el texto actual; si no lo encuentra, salta.
-- ============================================================

-- ── A. Columna de grupos de reglas ──────────────────────────────────────────
alter table public.challenge_rules
  add column if not exists rule_group smallint;

-- ── B. Bidón de plasma como objeto consumible ───────────────────────────────
insert into public.game_objects (code, display_name, display_name_en, is_weapon)
values ('chug_jug', 'Bidón de plasma', 'Chug Jug', false)
on conflict (code) do nothing;

-- efecto: usar el bidón otorga salud/escudo (Chug Jug T8 = cura total)
insert into public.object_effects (object_id, trigger_action, effect_action, amount_per_use)
select o.id, 'use', 'gain', 200
from public.game_objects o where o.code = 'chug_jug'
on conflict do nothing;

-- ── C. Restaurar los 6 objetivos + scaffolding ──────────────────────────────
create or replace function pg_temp.findclear(p_match text)
returns uuid language plpgsql as $f$
declare v uuid;
begin
  select c.id into v
  from challenges c
  join challenge_weeks w on w.id = c.week_id
  join seasons s on s.id = w.season_id
  where s.code = 'season_8' and c.is_prestige and c.description ilike p_match
  order by c.created_at limit 1;
  if v is null then
    raise notice 'sin match (ya cambiado?): %', p_match; return null;
  end if;
  delete from rule_conditions where challenge_rule_id in (select id from challenge_rules where challenge_id = v);
  delete from challenge_rules where challenge_id = v;
  delete from match_rule_progress where challenge_id = v;
  delete from challenge_distinct_progress where challenge_id = v;
  return v;
end $f$;

create or replace function pg_temp.act(c text) returns uuid language sql as $$ select id from action_types where code=c $$;
create or replace function pg_temp.tag(c text) returns uuid language sql as $$ select id from tags where code=c $$;
create or replace function pg_temp.obj(c text) returns uuid language sql as $$ select id from game_objects where code=c $$;
create or replace function pg_temp.loc(c text) returns uuid language sql as $$ select id from locations where code=c $$;

do $$
declare v uuid; r uuid;
begin
  -- #5) puntos cardinales OPUESTOS: (norte ∧ sur) ∨ (este ∧ oeste)
  v := pg_temp.findclear('%puntos cardinales del mapa%');
  if v is not null then
    update challenges set description='Visita 2 puntos cardinales opuestos en el mapa en la misma partida',
      kind='progress', unit='count', match_scope='same_match', target_value=2, current_value=0, is_completed=false, rules_operator='and' where id=v;
    insert into challenge_rules(challenge_id, action_type_id, location_id, rule_group) values (v, pg_temp.act('visit'), pg_temp.loc('north_point'), 1);
    insert into challenge_rules(challenge_id, action_type_id, location_id, rule_group) values (v, pg_temp.act('visit'), pg_temp.loc('south_point'), 1);
    insert into challenge_rules(challenge_id, action_type_id, location_id, rule_group) values (v, pg_temp.act('visit'), pg_temp.loc('east_point'),  2);
    insert into challenge_rules(challenge_id, action_type_id, location_id, rule_group) values (v, pg_temp.act('visit'), pg_temp.loc('west_point'),  2);
  end if;

  -- #7) entrega de suministros registrada en los primeros 10 s tras aterrizar
  v := pg_temp.findclear('%entregas de suministros en 2 partidas%');
  if v is not null then
    update challenges set description='Registra una entrega de suministros antes de 10 segundos de que aterrice',
      kind='progress', unit='count', match_scope='any_match', target_value=1, current_value=0, is_completed=false, rules_operator='and' where id=v;
    insert into challenge_rules(challenge_id, action_type_id, target_object_id) values (v, pg_temp.act('search'), pg_temp.obj('supply_drop')) returning id into r;
    insert into rule_conditions(challenge_rule_id, condition_key, condition_value) values (r, 'within_10s_landing', 'En los primeros 10 s tras aterrizar');
  end if;

  -- #8) aterriza en Palmeras Paradisíacas Y gana la partida
  v := pg_temp.findclear('%Palmeras Paradis%acas en 3 partidas%');
  if v is not null then
    update challenges set description='Aterriza en Palmeras Paradisíacas y gana la partida',
      kind='progress', unit='count', match_scope='any_match', target_value=1, current_value=0, is_completed=false, rules_operator='and' where id=v;
    insert into challenge_rules(challenge_id, action_type_id, location_id) values (v, pg_temp.act('land'), pg_temp.loc('paradise_palms')) returning id into r;
    insert into rule_conditions(challenge_rule_id, condition_key, condition_value) values (r, 'win_match', 'Ganaste la partida');
  end if;

  -- #9) 3 eliminaciones sin recibir daño entre ellas
  v := pg_temp.findclear('%eliminaciones con fusil de francotirador%');
  if v is not null then
    update challenges set description='Consigue eliminaciones sin recibir daño entre ellas',
      kind='progress', unit='count', match_scope='any_match', target_value=3, current_value=0, is_completed=false, rules_operator='and' where id=v;
    insert into challenge_rules(challenge_id, action_type_id) values (v, pg_temp.act('kill')) returning id into r;
    insert into rule_conditions(challenge_rule_id, condition_key, condition_value) values (r, 'no_damage_between', 'Sin recibir daño entre ellas');
  end if;

  -- #10) sobrevive a 75 jugadores sin registrar cofres con nombre
  v := pg_temp.findclear('%Sobrevive a 75 oponentes%');
  if v is not null then
    update challenges set description='No registres ningún cofre en ubicaciones con nombre y sobrevive a 75 jugadores',
      kind='progress', unit='value', match_scope='same_match', target_value=75, current_value=0, is_completed=false, rules_operator='and' where id=v;
    insert into challenge_rules(challenge_id, action_type_id) values (v, pg_temp.act('outlast')) returning id into r;
    insert into rule_conditions(challenge_rule_id, condition_key, condition_value) values (r, 'no_named_chests', 'Sin abrir cofres con nombre');
  end if;

  -- #11) gana salud o escudo con un bidón de plasma
  v := pg_temp.findclear('%Gana 300 de salud o escudo%');
  if v is not null then
    update challenges set description='Gana salud o escudo con un bidón de plasma',
      kind='progress', unit='value', match_scope='any_match', target_value=180, current_value=0, is_completed=false, rules_operator='and' where id=v;
    insert into challenge_rules(challenge_id, action_type_id, required_object_id) values (v, pg_temp.act('gain'), pg_temp.obj('chug_jug'));
  end if;
end $$;

-- ── D. report_event con soporte de grupos de reglas ─────────────────────────
create or replace function public.report_event(
  p_action_code text, p_amount bigint default 1,
  p_used_object_id uuid default null, p_used_tag_id uuid default null,
  p_target_object_id uuid default null, p_target_tag_id uuid default null,
  p_location_id uuid default null, p_conditions text[] default '{}'
)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_match_id uuid;
  v_ch record;
  v_rule_id uuid;
  v_rules_hit bigint;
  v_matches_hit bigint;
  v_match_amount bigint;
  v_locations_hit bigint;
  v_best_hit bigint;
  v_group_done boolean;
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

  select id into v_match_id from matches where is_active = true order by started_at desc limit 1;

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
      and (
        c.is_prestige = false
        or not exists (
          select 1 from challenges nrm
          where nrm.week_id = c.week_id
            and nrm.is_meta = false
            and nrm.is_prestige = false
            and (nrm.is_completed = false or nrm.completed_in_match is not null)
        )
      )
      and (cr.required_object_id is null or cr.required_object_id = p_used_object_id)
      and (
        cr.required_tag_id is null
        or cr.required_tag_id = p_used_tag_id
        or (p_used_object_id is not null and exists (
              select 1 from game_object_tags got
              where got.object_id = p_used_object_id and got.tag_id = cr.required_tag_id))
      )
      and (cr.target_object_id is null or cr.target_object_id = p_target_object_id)
      and (
        cr.target_tag_id is null
        or cr.target_tag_id = p_target_tag_id
        or (p_target_object_id is not null and exists (
              select 1 from game_object_tags got
              where got.object_id = p_target_object_id and got.tag_id = cr.target_tag_id))
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
        from challenge_distinct_progress where challenge_id = v_ch.id and match_id = v_match_id;
      else
        insert into challenge_distinct_progress (challenge_id, match_id, location_id)
        values (v_ch.id, null, p_location_id)
        on conflict (challenge_id, location_id) where match_id is null do nothing;
        select count(*) into v_locations_hit
        from challenge_distinct_progress where challenge_id = v_ch.id and match_id is null;
      end if;
      update challenges set current_value = least(v_locations_hit, target_value) where id = v_ch.id;

    elsif v_ch.kind = 'simple' then
      update challenges set is_completed = true, current_value = coalesce(target_value, 1) where id = v_ch.id;

    elsif v_ch.match_scope = 'any_match' then
      if v_ch.rules_operator = 'and' and v_ch.total_rules > 1 then
        foreach v_rule_id in array v_ch.matched_rule_ids loop
          insert into match_rule_progress (match_id, challenge_id, challenge_rule_id, amount)
          values (null, v_ch.id, v_rule_id, 1)
          on conflict (challenge_rule_id) where match_id is null do nothing;
        end loop;
        -- grupos: AND dentro del grupo, OR entre grupos (acumulador global)
        select coalesce(max(hit), 0), coalesce(bool_or(hit >= need), false)
        into v_best_hit, v_group_done
        from (
          select count(*) need, count(mrp.challenge_rule_id) hit
          from challenge_rules cr
          left join match_rule_progress mrp
            on mrp.challenge_rule_id = cr.id and mrp.match_id is null
          where cr.challenge_id = v_ch.id
          group by coalesce(cr.rule_group, 0)
        ) g;
        update challenges
        set current_value = case when v_group_done then target_value else least(v_best_hit, target_value) end
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
        -- grupos: AND dentro del grupo, OR entre grupos (por partida)
        select coalesce(max(hit), 0), coalesce(bool_or(hit >= need), false)
        into v_best_hit, v_group_done
        from (
          select count(*) need, count(mrp.challenge_rule_id) hit
          from challenge_rules cr
          left join match_rule_progress mrp
            on mrp.challenge_rule_id = cr.id and mrp.match_id = v_match_id
          where cr.challenge_id = v_ch.id
          group by coalesce(cr.rule_group, 0)
        ) g;
        update challenges
        set current_value = case when v_group_done then target_value else least(v_best_hit, target_value) end
        where id = v_ch.id;
      else
        v_rule_id := v_ch.matched_rule_ids[1];
        insert into match_rule_progress (match_id, challenge_id, challenge_rule_id, amount)
        values (v_match_id, v_ch.id, v_rule_id, p_amount)
        on conflict (match_id, challenge_rule_id) where match_id is not null
        do update set amount = match_rule_progress.amount + excluded.amount;
        select amount into v_match_amount
        from match_rule_progress
        where challenge_id = v_ch.id and challenge_rule_id = v_rule_id and match_id = v_match_id;
        update challenges set current_value = least(v_match_amount, target_value) where id = v_ch.id;
      end if;

    else -- different_matches: una vez por partida
      foreach v_rule_id in array v_ch.matched_rule_ids loop
        insert into match_rule_progress (match_id, challenge_id, challenge_rule_id, amount)
        values (v_match_id, v_ch.id, v_rule_id, 1)
        on conflict (match_id, challenge_rule_id) where match_id is not null do nothing;
      end loop;
      select count(distinct match_id) into v_matches_hit
      from match_rule_progress where challenge_id = v_ch.id and match_id is not null;
      update challenges set current_value = least(v_matches_hit, target_value) where id = v_ch.id;
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
      and (trigger_condition is null or trigger_condition = any(coalesce(p_conditions, '{}')))
  loop
    if v_imp.implied_object_code is not null then
      select id into v_imp_obj from game_objects where code = v_imp.implied_object_code;
      v_imp_tag := null;
    else
      v_imp_obj := p_used_object_id; v_imp_tag := p_used_tag_id;
    end if;
    if v_imp_obj is not null or v_imp_tag is not null then
      v_sub := public.report_event(v_imp.implied_action, 1, v_imp_obj, v_imp_tag, null, null, null, '{}');
      v_updated := v_updated || coalesce(v_sub->'updated', '[]'::jsonb);
      v_skipped := v_skipped || coalesce(v_sub->'skipped', '[]'::jsonb);
    end if;
  end loop;

  return jsonb_build_object(
    'updated', v_updated, 'skipped', v_skipped, 'has_active_match', v_match_id is not null
  );
end;
$function$;
