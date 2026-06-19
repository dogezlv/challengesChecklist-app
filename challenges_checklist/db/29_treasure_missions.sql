-- ============================================================
-- 29_treasure_missions.sql
--   * Cañón S10: quitar condición from_named_location (solo campamentos)
--   * Lupa/cuchillo: Busca → Visita (estatuas hielo / mansión superhéroes)
--   * Prestigios emparejados: aterrizar + sobrevivir 75 misma partida
--   * Tesoros W8/W10: eliminar fase 1, fase 2 → bailar en mapa del tesoro
-- ============================================================

-- ── Ubicaciones nuevas ───────────────────────────────────────────────────────
insert into public.locations (code, display_name, display_name_en, named_location)
values
  ('ice_sculpture', 'Estatuas de hielo', 'Ice Sculptures', false),
  ('hero_mansion', 'Mansión de superhéroes', 'Hero Manor', false),
  ('treasure_map_1_arctic_airport', 'Mapa del tesoro 1 - Aeródromo Ártico', 'Treasure Map 1 - Frosty Flights', false),
  ('treasure_map_2_forknife', 'Mapa del tesoro 2 - Forknife', 'Treasure Map 2 - Fork Knife', false)
on conflict (code) do update set
  display_name = excluded.display_name,
  display_name_en = excluded.display_name_en;

-- ── Cañón: sin POI de salida ─────────────────────────────────────────────────
delete from rule_conditions rc
using challenge_rules cr, game_objects go, challenges c
where rc.challenge_rule_id = cr.id
  and go.id = cr.required_object_id
  and go.code = 'pirate_cannon'
  and c.id = cr.challenge_id
  and c.is_prestige = true
  and rc.condition_key = 'from_named_location';

-- ── W3 normal: lupa → visita estatuas de hielo ───────────────────────────────
do $$
declare v uuid; r uuid;
begin
  select c.id into v from challenges c
  join challenge_weeks w on w.id = c.week_id
  join seasons s on s.id = w.season_id
  where s.code = 'season_8' and w.week_number = 3 and c.is_prestige = false
    and c.description ilike '%lupa%pantalla de carga%'
  limit 1;
  if v is null then return; end if;

  update challenges set
    description = 'Visita donde se posa la lupa en la pantalla de carga del mapa del tesoro',
    kind = 'simple', unit = 'count', match_scope = 'any_match', target_value = 1
  where id = v;

  delete from rule_conditions where challenge_rule_id in (select id from challenge_rules where challenge_id = v);
  delete from challenge_rules where challenge_id = v;
  delete from match_rule_progress where challenge_id = v;

  insert into challenge_rules (challenge_id, action_type_id, location_id)
  values (v, (select id from action_types where code = 'visit'),
          (select id from locations where code = 'ice_sculpture'));
end $$;

-- ── W6 normal: cuchillo → visita mansión de superhéroes ──────────────────────
do $$
declare v uuid;
begin
  select c.id into v from challenges c
  join challenge_weeks w on w.id = c.week_id
  join seasons s on s.id = w.season_id
  where s.code = 'season_8' and w.week_number = 6 and c.is_prestige = false
    and c.description ilike '%cuchillo%pantalla de carga%'
  limit 1;
  if v is null then return; end if;

  update challenges set
    description = 'Visita donde apunta el cuchillo en la pantalla de carga del mapa del tesoro',
    kind = 'simple', unit = 'count', match_scope = 'any_match', target_value = 1
  where id = v;

  delete from rule_conditions where challenge_rule_id in (select id from challenge_rules where challenge_id = v);
  delete from challenge_rules where challenge_id = v;
  delete from match_rule_progress where challenge_id = v;

  insert into challenge_rules (challenge_id, action_type_id, location_id)
  values (v, (select id from action_types where code = 'visit'),
          (select id from locations where code = 'hero_mansion'));
end $$;

-- ── W3 prestigio emparejado con lupa: aterrizar hielo → sobrevivir 75 ───────
do $$
declare
  v uuid;
  v_line uuid;
  r uuid;
begin
  select c.id into v from challenges c
  join challenge_weeks w on w.id = c.week_id
  join seasons s on s.id = w.season_id
  where s.code = 'season_8' and w.week_number = 3 and c.is_prestige
    and (c.description ilike '%Visita Aeroparque%' or c.description ilike '%Aeroparque Ártico%')
  limit 1;
  if v is null then return; end if;

  delete from rule_conditions where challenge_rule_id in (select id from challenge_rules where challenge_id = v);
  delete from challenge_rules where challenge_id = v;
  delete from match_rule_progress where challenge_id = v;

  select line_id into v_line from challenges where id = v;
  if v_line is not null then
    delete from challenges where line_id = v_line and id <> v;
    delete from challenge_lines where id = v_line;
  end if;

  insert into challenge_lines (name)
  values ('Prestigio S3 — Estatuas de hielo')
  returning id into v_line;

  update challenges set
    description = 'Aterriza en las estatuas de hielo al caer del autobús de batalla y sobrevive a 75 jugadores en la misma partida',
    kind = 'simple', unit = 'count', match_scope = 'same_match', target_value = 1,
    line_id = v_line, phase_order = 1, current_value = 0, is_completed = false,
    rules_operator = null
  where id = v;

  insert into challenge_rules (challenge_id, action_type_id, location_id)
  values (v, (select id from action_types where code = 'land'),
          (select id from locations where code = 'ice_sculpture'))
  returning id into r;
  insert into rule_conditions (challenge_rule_id, condition_key, condition_value)
  values (r, 'from_battle_bus', 'Al caer del autobús de batalla');

  insert into challenges (
    week_id, description, kind, unit, match_scope, target_value,
    is_prestige, is_meta, line_id, phase_order, rules_operator
  )
  select w.id,
    'Sobrevive a 75 jugadores en la misma partida',
    'progress', 'value', 'same_match', 75,
    true, false, v_line, 2, 'and'
  from challenge_weeks w join seasons s on s.id = w.season_id
  where s.code = 'season_8' and w.week_number = 3;

  insert into challenge_rules (challenge_id, action_type_id)
  select c.id, (select id from action_types where code = 'outlast')
  from challenges c where c.line_id = v_line and c.phase_order = 2;
end $$;

-- ── W6 prestigio cuchillo: aterrizar mansión → sobrevivir 75 ─────────────────
do $$
declare
  v uuid;
  v_line uuid;
  r uuid;
begin
  select c.id into v from challenges c
  join challenge_weeks w on w.id = c.week_id
  join seasons s on s.id = w.season_id
  where s.code = 'season_8' and w.week_number = 6 and c.is_prestige
    and c.description ilike '%cuchillo%pantalla de carga%'
  limit 1;
  if v is null then return; end if;

  delete from rule_conditions where challenge_rule_id in (select id from challenge_rules where challenge_id = v);
  delete from challenge_rules where challenge_id = v;
  delete from match_rule_progress where challenge_id = v;

  select line_id into v_line from challenges where id = v;
  if v_line is not null then
    delete from challenges where line_id = v_line and id <> v;
    delete from challenge_lines where id = v_line;
  end if;

  insert into challenge_lines (name)
  values ('Prestigio S6 — Mansión de superhéroes')
  returning id into v_line;

  update challenges set
    description = 'Aterriza en la mansión de superhéroes al caer del autobús de batalla y sobrevive a 75 jugadores en la misma partida',
    kind = 'simple', unit = 'count', match_scope = 'same_match', target_value = 1,
    line_id = v_line, phase_order = 1, current_value = 0, is_completed = false,
    rules_operator = null
  where id = v;

  insert into challenge_rules (challenge_id, action_type_id, location_id)
  values (v, (select id from action_types where code = 'land'),
          (select id from locations where code = 'hero_mansion'))
  returning id into r;
  insert into rule_conditions (challenge_rule_id, condition_key, condition_value)
  values (r, 'from_battle_bus', 'Al caer del autobús de batalla');

  insert into challenges (
    week_id, description, kind, unit, match_scope, target_value,
    is_prestige, is_meta, line_id, phase_order, rules_operator
  )
  select w.id,
    'Sobrevive a 75 jugadores en la misma partida',
    'progress', 'value', 'same_match', 75,
    true, false, v_line, 2, 'and'
  from challenge_weeks w join seasons s on s.id = w.season_id
  where s.code = 'season_8' and w.week_number = 6;

  insert into challenge_rules (challenge_id, action_type_id)
  select c.id, (select id from action_types where code = 'outlast')
  from challenges c where c.line_id = v_line and c.phase_order = 2;
end $$;

-- ── W8: quitar fase 1 tesoro Palmeras; fase 2 → bailar mapa 1 ───────────────
do $$
declare
  v_line uuid;
  v_phase1 uuid;
  v_phase2 uuid;
begin
  select cl.id into v_line
  from challenge_lines cl
  where cl.name ilike '%Palmeras%'
  limit 1;

  if v_line is null then
    select c.line_id into v_line from challenges c
    join challenge_weeks w on w.id = c.week_id
    join seasons s on s.id = w.season_id
    where s.code = 'season_8' and w.week_number = 8 and c.is_prestige = false
      and c.description ilike '%letrero del mapa del tesoro%Palmeras%'
      and c.phase_order = 1
    limit 1;
  end if;

  select c.id into v_phase1 from challenges c
  where c.line_id = v_line and c.phase_order = 1;
  select c.id into v_phase2 from challenges c
  where c.line_id = v_line and c.phase_order = 2;

  if v_phase1 is not null then
    delete from rule_conditions where challenge_rule_id in (select id from challenge_rules where challenge_id = v_phase1);
    delete from challenge_rules where challenge_id = v_phase1;
    delete from match_rule_progress where challenge_id = v_phase1;
    delete from challenge_distinct_progress where challenge_id = v_phase1;
    delete from challenges where id = v_phase1;
  end if;

  if v_phase2 is null then
    select c.id into v_phase2 from challenges c
    join challenge_weeks w on w.id = c.week_id
    join seasons s on s.id = w.season_id
    where s.code = 'season_8' and w.week_number = 8 and c.is_prestige = false
      and c.description ilike '%mapa del tesoro%Palmeras%'
    limit 1;
  end if;

  if v_phase2 is null then return; end if;

  update challenges set
    description = 'Baila en el objetivo del mapa del tesoro que solía estar en Palmeras Paradisíacas',
    kind = 'simple', unit = 'count', match_scope = 'any_match', target_value = 1,
    line_id = null, phase_order = null, current_value = 0, is_completed = false
  where id = v_phase2;

  delete from rule_conditions where challenge_rule_id in (select id from challenge_rules where challenge_id = v_phase2);
  delete from challenge_rules where challenge_id = v_phase2;
  delete from match_rule_progress where challenge_id = v_phase2;

  insert into challenge_rules (challenge_id, action_type_id, location_id)
  values (v_phase2, (select id from action_types where code = 'dance'),
          (select id from locations where code = 'treasure_map_1_arctic_airport'));

  if v_line is not null then
    delete from challenge_lines where id = v_line
      and not exists (select 1 from challenges where line_id = v_line);
  end if;
end $$;

-- ── W10: quitar fase 1 tesoro Chatarra; fase 2 → bailar mapa 2 ──────────────
do $$
declare
  v_line uuid;
  v_phase1 uuid;
  v_phase2 uuid;
begin
  select cl.id into v_line
  from challenge_lines cl
  where cl.name ilike '%Chatarra%'
  limit 1;

  if v_line is null then
    select c.line_id into v_line from challenges c
    join challenge_weeks w on w.id = c.week_id
    join seasons s on s.id = w.season_id
    where s.code = 'season_8' and w.week_number = 10 and c.is_prestige = false
      and c.description ilike '%letrero del mapa del tesoro%Chatarra%'
      and c.phase_order = 1
    limit 1;
  end if;

  select c.id into v_phase1 from challenges c
  where c.line_id = v_line and c.phase_order = 1;
  select c.id into v_phase2 from challenges c
  where c.line_id = v_line and c.phase_order = 2;

  if v_phase1 is not null then
    delete from rule_conditions where challenge_rule_id in (select id from challenge_rules where challenge_id = v_phase1);
    delete from challenge_rules where challenge_id = v_phase1;
    delete from match_rule_progress where challenge_id = v_phase1;
    delete from challenge_distinct_progress where challenge_id = v_phase1;
    delete from challenges where id = v_phase1;
  end if;

  if v_phase2 is null then
    select c.id into v_phase2 from challenges c
    join challenge_weeks w on w.id = c.week_id
    join seasons s on s.id = w.season_id
    where s.code = 'season_8' and w.week_number = 10 and c.is_prestige = false
      and c.description ilike '%mapa del tesoro%Chatarra%'
    limit 1;
  end if;

  if v_phase2 is null then return; end if;

  update challenges set
    description = 'Baila en el objetivo del mapa del tesoro que solía estar en Cruce Chatarra',
    kind = 'simple', unit = 'count', match_scope = 'any_match', target_value = 1,
    line_id = null, phase_order = null, current_value = 0, is_completed = false
  where id = v_phase2;

  delete from rule_conditions where challenge_rule_id in (select id from challenge_rules where challenge_id = v_phase2);
  delete from challenge_rules where challenge_id = v_phase2;
  delete from match_rule_progress where challenge_id = v_phase2;

  insert into challenge_rules (challenge_id, action_type_id, location_id)
  values (v_phase2, (select id from action_types where code = 'dance'),
          (select id from locations where code = 'treasure_map_2_forknife'));

  if v_line is not null then
    delete from challenge_lines where id = v_line
      and not exists (select 1 from challenges where line_id = v_line);
  end if;
end $$;
