-- ============================================================
-- 31_bridges_chest_prestige.sql
--   * W8 normal: puentes diferentes (visit ×4, any_match)
--   * W8 prestigio (ex jigsaw): puentes misma partida
--   * W8 prestigio (ex tesoro Palmeras 2×): cofres/munición El Bloque o Hotel
--   * W10 prestigio (ex tesoro Chatarra 2×): cofres/munición Aeródromo Ártico
-- ============================================================

insert into public.locations (code, display_name, display_name_en, named_location)
values
  ('bridge_lucky_landing', 'Puente cerca de Aterrizaje Afortunado', 'Bridge near Lucky Landing', false),
  ('bridge_shifty_shafts', 'Puente cerca de Conductos Cambiantes', 'Bridge near Shifty Shafts', false),
  ('bridge_mexican_village', 'Puente cerca de Pueblo Mexicano', 'Bridge near Mexican Village', false),
  ('bridge_paradise_palms', 'Puente cerca de Palmeras Paradisíacas', 'Bridge near Paradise Palms', false),
  ('block_hotel', 'Hotel (cerca de El Bloque)', 'Hotel near The Block', false)
on conflict (code) do update set
  display_name = excluded.display_name,
  display_name_en = excluded.display_name_en;

-- ── W8 normal: puentes diferentes ───────────────────────────────────────────
do $$
declare v uuid;
begin
  select c.id into v
  from challenges c
  join challenge_weeks w on w.id = c.week_id
  join seasons s on s.id = w.season_id
  where s.code = 'season_8' and w.week_number = 8 and c.is_prestige = false
    and c.description ilike '%piezas de puzle%puentes%'
  limit 1;
  if v is null then return; end if;

  delete from rule_conditions
  where challenge_rule_id in (select id from challenge_rules where challenge_id = v);
  delete from challenge_rules where challenge_id = v;
  delete from match_rule_progress where challenge_id = v;
  delete from challenge_distinct_progress where challenge_id = v;

  update challenges set
    description = 'Pasa por debajo de puentes diferentes',
    kind = 'progress', unit = 'count', match_scope = 'any_match',
    target_value = 4, current_value = 0, is_completed = false,
    rules_operator = 'and'
  where id = v;

  insert into challenge_rules (challenge_id, action_type_id, location_id)
  select v, (select id from action_types where code = 'visit'), l.id
  from locations l
  where l.code in (
    'bridge_lucky_landing', 'bridge_shifty_shafts',
    'bridge_mexican_village', 'bridge_paradise_palms'
  );
end $$;

-- ── W8 prestigio: puentes misma partida ─────────────────────────────────────
do $$
declare v uuid;
begin
  select c.id into v
  from challenges c
  join challenge_weeks w on w.id = c.week_id
  join seasons s on s.id = w.season_id
  where s.code = 'season_8' and w.week_number = 8 and c.is_prestige
    and (c.description ilike '%piezas de puzle%puentes%'
      or c.description ilike '%puentes diferentes%')
  limit 1;
  if v is null then return; end if;

  delete from rule_conditions
  where challenge_rule_id in (select id from challenge_rules where challenge_id = v);
  delete from challenge_rules where challenge_id = v;
  delete from match_rule_progress where challenge_id = v;

  update challenges set
    description = 'Pasa por debajo de puentes diferentes en la misma partida',
    kind = 'progress', unit = 'count', match_scope = 'same_match',
    target_value = 4, current_value = 0, is_completed = false,
    rules_operator = 'and'
  where id = v;

  insert into challenge_rules (challenge_id, action_type_id, location_id)
  select v, (select id from action_types where code = 'visit'), l.id
  from locations l
  where l.code in (
    'bridge_lucky_landing', 'bridge_shifty_shafts',
    'bridge_mexican_village', 'bridge_paradise_palms'
  );
end $$;

-- ── W8 prestigio: cofres/munición El Bloque o Hotel ─────────────────────────
do $$
declare v uuid;
begin
  select c.id into v
  from challenges c
  join challenge_weeks w on w.id = c.week_id
  join seasons s on s.id = w.season_id
  where s.code = 'season_8' and w.week_number = 8 and c.is_prestige
    and (c.description ilike '%letrero del mapa del tesoro%Palmeras%'
      or c.description ilike '%mapa del tesoro%Palmeras%2 veces%')
  limit 1;
  if v is null then return; end if;

  delete from rule_conditions
  where challenge_rule_id in (select id from challenge_rules where challenge_id = v);
  delete from challenge_rules where challenge_id = v;
  delete from match_rule_progress where challenge_id = v;

  update challenges set
    description = 'Registra cofres o cajas de munición en El Bloque o el Hotel',
    kind = 'progress', unit = 'count', match_scope = 'any_match',
    target_value = 15, current_value = 0, is_completed = false,
    rules_operator = 'or'
  where id = v;

  insert into challenge_rules (challenge_id, action_type_id, target_object_id, location_id)
  select v, (select id from action_types where code = 'search'),
         (select id from game_objects where code = 'chest'),
         (select id from locations where code = 'the_block');
  insert into challenge_rules (challenge_id, action_type_id, target_object_id, location_id)
  select v, (select id from action_types where code = 'search'),
         (select id from game_objects where code = 'ammo_box'),
         (select id from locations where code = 'the_block');
  insert into challenge_rules (challenge_id, action_type_id, target_object_id, location_id)
  select v, (select id from action_types where code = 'search'),
         (select id from game_objects where code = 'chest'),
         (select id from locations where code = 'block_hotel');
  insert into challenge_rules (challenge_id, action_type_id, target_object_id, location_id)
  select v, (select id from action_types where code = 'search'),
         (select id from game_objects where code = 'ammo_box'),
         (select id from locations where code = 'block_hotel');
end $$;

-- ── W10 prestigio: cofres/munición Aeródromo Ártico ─────────────────────────
do $$
declare v uuid;
begin
  select c.id into v
  from challenges c
  join challenge_weeks w on w.id = c.week_id
  join seasons s on s.id = w.season_id
  where s.code = 'season_8' and w.week_number = 10 and c.is_prestige
    and (c.description ilike '%letrero del mapa del tesoro%Chatarra%'
      or c.description ilike '%mapa del tesoro%Chatarra%2 veces%')
  limit 1;
  if v is null then return; end if;

  delete from rule_conditions
  where challenge_rule_id in (select id from challenge_rules where challenge_id = v);
  delete from challenge_rules where challenge_id = v;
  delete from match_rule_progress where challenge_id = v;

  update challenges set
    description = 'Registra cofres o cajas de munición en Aeródromo Ártico',
    kind = 'progress', unit = 'count', match_scope = 'any_match',
    target_value = 15, current_value = 0, is_completed = false,
    rules_operator = 'or'
  where id = v;

  insert into challenge_rules (challenge_id, action_type_id, target_object_id, location_id)
  select v, (select id from action_types where code = 'search'),
         (select id from game_objects where code = 'chest'),
         (select id from locations where code = 'frosty_flights');
  insert into challenge_rules (challenge_id, action_type_id, target_object_id, location_id)
  select v, (select id from action_types where code = 'search'),
         (select id from game_objects where code = 'ammo_box'),
         (select id from locations where code = 'frosty_flights');
end $$;
