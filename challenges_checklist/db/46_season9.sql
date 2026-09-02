-- ============================================================
-- 46_season9.sql — Temporada 9: semanas, catálogo y desafíos normales
-- Fuente: Fortnite wiki (Season 9 weekly challenges). Idempotente.
-- ============================================================

-- ── Semanas ─────────────────────────────────────────────────────────────────
insert into public.challenge_weeks (season_id, week_number, display_name, display_name_en)
select s.id, n, 'Semana ' || n, 'Week ' || n
from public.seasons s
cross join generate_series(1, 10) as n
where s.code = 'season_9'
  and not exists (
    select 1 from public.challenge_weeks w
    where w.season_id = s.id and w.week_number = n
  );

-- ── Catálogo nuevo ──────────────────────────────────────────────────────────
insert into public.game_objects (code, display_name, display_name_en, is_weapon) values
  ('slipstream',    'Túnel de viento',           'Slipstream',        false),
  ('air_vent',      'Respiradero de aire',       'Air Vent',          false),
  ('loot_carrier',  'Transportador de botín',    'Loot Carrier',      false),
  ('storm_flip',    'Inversor de tormenta',      'Storm Flip',        false),
  ('air_strike',    'Ataque aéreo',              'Air Strike',        false),
  ('chug_splash',   'Salpicón Saludable',        'Chug Splash',       false),
  ('grenade',       'Granada',                   'Grenade',           false),
  ('dynamite',      'Dinamita',                  'Dynamite',          false),
  ('stink_bomb',    'Bomba apestosa',            'Stink Bomb',        false),
  ('trap',          'Trampa',                    'Trap',              false),
  ('driftboard',     'Patineta',                  'Driftboard',        false),
  ('quad_crasher',  'Quadcrasher',               'Quadcrasher',       false)
on conflict (code) do nothing;

insert into public.game_object_tags (object_id, tag_id)
select o.id, t.id
from (values
  ('slipstream',   'device'),
  ('air_vent',     'device'),
  ('loot_carrier', 'device'),
  ('storm_flip',   'throwable'),
  ('air_strike',   'throwable'),
  ('chug_splash',  'consumable'),
  ('grenade',      'throwable'),
  ('dynamite',     'throwable'),
  ('stink_bomb',   'throwable'),
  ('trap',         'trap'),
  ('driftboard',   'vehicle'),
  ('quad_crasher', 'vehicle'),
  ('chug_jug',     'consumable')
) v(obj, tag)
join public.game_objects o on o.code = v.obj
join public.tags t on t.code = v.tag
on conflict do nothing;

insert into public.locations (code, display_name, display_name_en, named_location) values
  ('neo_tilted',           'Neorrecostados',                      'Neo Tilted',                    true),
  ('mega_mall',            'Mega Mall',                           'Mega Mall',                     true),
  ('pressure_plant',       'Planta de presión',                   'Pressure Plant',                true),
  ('sky_platform_1',       'Plataforma cerca de Conductos Cambiantes',  'Sky Platform near Shifty Shafts',   false),
  ('sky_platform_2',       'Plataforma cerca de Cráter Catastrófico',   'Sky Platform near Dusty Divot',     false),
  ('sky_platform_3',       'Plataforma cerca de Terreno Tormentoso',    'Sky Platform near Fatal Fields',    false),
  ('sky_platform_4',       'Plataforma cerca de Palmeras Paradisíacas','Sky Platform near Paradise Palms',  false),
  ('sky_platform_5',       'Plataforma cerca de Planta de presión',     'Sky Platform near Pressure Plant',  false),
  ('sky_platform_6',       'Plataforma cerca de Parque Placentero',     'Sky Platform near Pleasant Park',   false),
  ('sky_platform_7',       'Plataforma cerca de Laguna Fortuna',        'Sky Platform near Loot Lake',       false),
  ('giant_phone_snow',     'Teléfono gigante de la nieve',              'Giant Phone (Snow)',                false),
  ('giant_phone_jungle',   'Teléfono gigante de la selva',              'Giant Phone (Jungle)',              false),
  ('truck_monster',        'Monstruo de camiones',                'Truck Monster',                 false),
  ('dancing_fish_trophy',  'Trofeo del pez bailarín',             'Giant Dancing Fish Trophy',     false),
  ('hologram_tomato',      'Cabeza de tomate holográfica',        'Holographic Tomato Head',       false),
  ('hologram_durr',        'Cabeza de Durr Burger holográfica',   'Holographic Durr Burger Head',  false),
  ('dumpling_head',        'Cabeza de dumpling gigante',          'Giant Dumpling Head',           false),
  ('desert_race_track',    'Pista de carreras del desierto',      'Desert Race Track',             false),
  ('snowy_race_track',     'Pista de carreras nevada',            'Snowy Race Track',              false),
  ('grasslands_race_track','Pista de carreras de pradera',        'Grasslands Race Track',         false),
  ('wind_turbine_1',       'Turbina eólica 1',                    'Wind Turbine 1',                false),
  ('wind_turbine_2',       'Turbina eólica 2',                    'Wind Turbine 2',                false),
  ('wind_turbine_3',       'Turbina eólica 3',                    'Wind Turbine 3',                false),
  ('wind_turbine_4',       'Turbina eólica 4',                    'Wind Turbine 4',                false),
  ('wind_turbine_5',       'Turbina eólica 5',                    'Wind Turbine 5',                false),
  ('clock_1',              'Reloj 1',                             'Clock 1',                       false),
  ('clock_2',              'Reloj 2',                             'Clock 2',                       false),
  ('clock_3',              'Reloj 3',                             'Clock 3',                       false),
  ('solar_array_snow',     'Panel solar (nieve)',                 'Solar Array (Snow)',            false),
  ('solar_array_desert',   'Panel solar (desierto)',              'Solar Array (Desert)',          false),
  ('solar_array_jungle',   'Panel solar (jungla)',                'Solar Array (Jungle)',          false),
  ('hot_spot',             'Punto caliente',                      'Hot Spot',                      false),
  ('psa_sign_1',           'Letrero de aviso público 1',          'PSA Sign 1',                    false),
  ('psa_sign_2',           'Letrero de aviso público 2',          'PSA Sign 2',                    false),
  ('psa_sign_3',           'Letrero de aviso público 3',          'PSA Sign 3',                    false),
  ('psa_sign_4',           'Letrero de aviso público 4',          'PSA Sign 4',                    false),
  ('psa_sign_5',           'Letrero de aviso público 5',          'PSA Sign 5',                    false),
  ('pirate_ship',          'Barco pirata',                        'Pirate Ship',                   false),
  ('viking_ship',          'Barco vikingo',                       'Viking Ship',                   false),
  ('fork_knife',           'Tenedor y cuchillo',                  'Fork Knife',                    false),
  ('umbrella_landmark',    'Paraguas gigante',                    'Umbrella',                      false),
  ('robot_factory',        'Fábrica de robots',                 'Robot Factory',                 false)
on conflict (code) do nothing;

-- ── Helpers ─────────────────────────────────────────────────────────────────
create or replace function pg_temp.ch9(
  p_week int,
  p_desc text,
  p_kind challenge_kind,
  p_unit text,
  p_scope match_scope,
  p_target bigint,
  p_op rule_group_operator default null,
  p_line text default null,
  p_phase int default null
) returns uuid
language plpgsql as $h$
declare
  v_week_id uuid;
  v_line_id uuid;
  v_id uuid;
begin
  select w.id into strict v_week_id
  from public.challenge_weeks w
  join public.seasons s on s.id = w.season_id
  where s.code = 'season_9' and w.week_number = p_week;

  if p_line is not null then
    select id into v_line_id from public.challenge_lines where name = p_line;
    if v_line_id is null then
      insert into public.challenge_lines (name) values (p_line) returning id into v_line_id;
    end if;
  end if;

  insert into public.challenges
    (description, kind, unit, match_scope, rules_operator,
     current_value, target_value, is_completed, week_id, line_id, phase_order)
  values
    (p_desc, p_kind, p_unit, p_scope, p_op,
     0, p_target, false, v_week_id, v_line_id, p_phase)
  returning id into v_id;

  return v_id;
end;
$h$;

create or replace function pg_temp.rule9(
  p_ch uuid,
  p_action text,
  p_uobj text default null,
  p_utag text default null,
  p_tobj text default null,
  p_ttag text default null,
  p_loc text default null
) returns uuid
language plpgsql as $h$
declare
  v_id uuid;
begin
  insert into public.challenge_rules
    (challenge_id, action_type_id,
     required_object_id, required_tag_id,
     target_object_id, target_tag_id, location_id)
  values (
    p_ch,
    (select id from public.action_types where code = p_action),
    case when p_uobj is null then null else (select id from public.game_objects where code = p_uobj) end,
    case when p_utag is null then null else (select id from public.tags where code = p_utag) end,
    case when p_tobj is null then null else (select id from public.game_objects where code = p_tobj) end,
    case when p_ttag is null then null else (select id from public.tags where code = p_ttag) end,
    case when p_loc is null then null else (select id from public.locations where code = p_loc) end
  )
  returning id into v_id;

  if (select action_type_id from public.challenge_rules where id = v_id) is null then
    raise exception 'action_type % no existe', p_action;
  end if;

  return v_id;
end;
$h$;

create or replace function pg_temp.cond9(p_rule uuid, p_key text, p_label text)
returns void
language sql as $h$
  insert into public.rule_conditions (challenge_rule_id, condition_key, condition_value)
  values (p_rule, p_key, p_label);
$h$;

-- ── Ingesta ─────────────────────────────────────────────────────────────────
do $$
declare
  c uuid;
  r uuid;
  loc text;
begin
  delete from public.challenges
  where week_id in (
    select w.id from public.challenge_weeks w
    join public.seasons s on s.id = w.season_id
    where s.code = 'season_9'
  );
  delete from public.challenge_lines l
  where not exists (select 1 from public.challenges ch where ch.line_id = l.id);

  -- ================= SEMANA 1 =================
  c := pg_temp.ch9(1, 'Fase 1 de 2: Recorre el túnel de viento alrededor de Neorrecostados', 'simple', 'count', 'any_match', 1, null, 'S9W1 — Túnel de viento', 1);
  r := pg_temp.rule9(c, 'use', 'slipstream', null, null, null, 'neo_tilted');
  c := pg_temp.ch9(1, 'Fase 2 de 2: Recorre el túnel de viento alrededor de Mega Mall', 'simple', 'count', 'any_match', 1, null, 'S9W1 — Túnel de viento', 2);
  r := pg_temp.rule9(c, 'use', 'slipstream', null, null, null, 'mega_mall');

  c := pg_temp.ch9(1, 'Visita todas las plataformas del cielo', 'progress', 'count', 'any_match', 7, 'and');
  foreach loc in array array[
    'sky_platform_1', 'sky_platform_2', 'sky_platform_3', 'sky_platform_4',
    'sky_platform_5', 'sky_platform_6', 'sky_platform_7'
  ] loop
    r := pg_temp.rule9(c, 'visit', null, null, null, null, loc);
  end loop;

  c := pg_temp.ch9(1, 'Inflige daño a un oponente en los 10 s posteriores a usar una bomba de sombra', 'progress', 'value', 'any_match', 200);
  r := pg_temp.rule9(c, 'damage');
  perform pg_temp.cond9(r, 'after_shadow_bomb', 'En los 10 s tras usar una bomba de sombra');

  c := pg_temp.ch9(1, 'Recoge un objeto legendario en diferentes partidas', 'progress', 'count', 'different_matches', 5);
  r := pg_temp.rule9(c, 'search');
  perform pg_temp.cond9(r, 'legendary_rarity', 'Rareza legendaria');

  c := pg_temp.ch9(1, 'Registra cofres en Aterrizaje Afortunado o Balsa Botín', 'progress', 'count', 'any_match', 7, 'or');
  r := pg_temp.rule9(c, 'search', null, null, 'chest', null, 'lucky_landing');
  r := pg_temp.rule9(c, 'search', null, null, 'chest', null, 'loot_lake');

  c := pg_temp.ch9(1, 'Consigue eliminaciones con armas con mira', 'progress', 'count', 'any_match', 3);
  r := pg_temp.rule9(c, 'kill', null, 'scoped');

  c := pg_temp.ch9(1, 'Fase 1 de 3: Inflige daño a oponentes desde al menos 2 pisos por encima', 'progress', 'value', 'any_match', 300, null, 'S9W1 — Daño desde arriba', 1);
  r := pg_temp.rule9(c, 'damage');
  perform pg_temp.cond9(r, 'from_2_stories_above', 'Desde al menos 2 pisos por encima');
  c := pg_temp.ch9(1, 'Fase 2 de 3: Inflige daño a oponentes desde al menos 4 pisos por encima', 'progress', 'value', 'any_match', 300, null, 'S9W1 — Daño desde arriba', 2);
  r := pg_temp.rule9(c, 'damage');
  perform pg_temp.cond9(r, 'from_4_stories_above', 'Desde al menos 4 pisos por encima');
  c := pg_temp.ch9(1, 'Fase 3 de 3: Inflige daño a oponentes desde al menos 6 pisos por encima', 'progress', 'value', 'any_match', 300, null, 'S9W1 — Daño desde arriba', 3);
  r := pg_temp.rule9(c, 'damage');
  perform pg_temp.cond9(r, 'from_6_stories_above', 'Desde al menos 6 pisos por encima');

  -- ================= SEMANA 2 =================
  c := pg_temp.ch9(2, 'Lánzate con un respiradero de aire en diferentes partidas', 'progress', 'count', 'different_matches', 5);
  r := pg_temp.rule9(c, 'use', 'air_vent');

  c := pg_temp.ch9(2, 'Fase 1 de 5: Aterriza en Costas Clasistas', 'simple', 'count', 'any_match', 1, null, 'S9W2 — Aterriza en distintos lugares I', 1);
  r := pg_temp.rule9(c, 'land', null, null, null, null, 'snobby_shores');
  c := pg_temp.ch9(2, 'Fase 2 de 5: Aterriza en Terreno Tormentoso', 'simple', 'count', 'any_match', 1, null, 'S9W2 — Aterriza en distintos lugares I', 2);
  r := pg_temp.rule9(c, 'land', null, null, null, null, 'fatal_fields');
  c := pg_temp.ch9(2, 'Fase 3 de 5: Aterriza en Escalones Estivales', 'simple', 'count', 'any_match', 1, null, 'S9W2 — Aterriza en distintos lugares I', 3);
  r := pg_temp.rule9(c, 'land', null, null, null, null, 'sunny_steps');
  c := pg_temp.ch9(2, 'Fase 4 de 5: Aterriza en Cráter Catastrófico', 'simple', 'count', 'any_match', 1, null, 'S9W2 — Aterriza en distintos lugares I', 4);
  r := pg_temp.rule9(c, 'land', null, null, null, null, 'dusty_divot');
  c := pg_temp.ch9(2, 'Fase 5 de 5: Aterriza en Villa Vivaracha', 'simple', 'count', 'any_match', 1, null, 'S9W2 — Aterriza en distintos lugares I', 5);
  r := pg_temp.rule9(c, 'land', null, null, null, null, 'happy_hamlet');

  c := pg_temp.ch9(2, 'Consigue eliminaciones en Escalones Estivales o Conductos Cambiantes', 'progress', 'count', 'any_match', 3, 'or');
  r := pg_temp.rule9(c, 'kill', null, null, null, null, 'sunny_steps');
  r := pg_temp.rule9(c, 'kill', null, null, null, null, 'shifty_shafts');

  c := pg_temp.ch9(2, 'Inflige daño con pistolas a oponentes', 'progress', 'value', 'any_match', 500);
  r := pg_temp.rule9(c, 'damage', null, 'pistol');

  c := pg_temp.ch9(2, 'Visita el Teléfono Gigante de la nieve, el Teléfono Gigante de la selva, un monstruo de camiones y un trofeo del pez bailarín', 'progress', 'count', 'any_match', 4, 'and');
  r := pg_temp.rule9(c, 'visit', null, null, null, null, 'giant_phone_snow');
  r := pg_temp.rule9(c, 'visit', null, null, null, null, 'giant_phone_jungle');
  r := pg_temp.rule9(c, 'visit', null, null, null, null, 'truck_monster');
  r := pg_temp.rule9(c, 'visit', null, null, null, null, 'dancing_fish_trophy');

  c := pg_temp.ch9(2, 'Registra cofres en 3 lugares con nombre diferentes en una sola partida', 'progress', 'distinct_location', 'same_match', 3);
  r := pg_temp.rule9(c, 'search', null, null, 'chest');

  c := pg_temp.ch9(2, 'Fase 1 de 3: Inflige daño a oponentes desde al menos 50 m de distancia', 'progress', 'value', 'any_match', 300, null, 'S9W2 — Daño a distancia', 1);
  r := pg_temp.rule9(c, 'damage');
  perform pg_temp.cond9(r, 'min_50m', 'A 50 m o más');
  c := pg_temp.ch9(2, 'Fase 2 de 3: Inflige daño a oponentes desde al menos 75 m de distancia', 'progress', 'value', 'any_match', 300, null, 'S9W2 — Daño a distancia', 2);
  r := pg_temp.rule9(c, 'damage');
  perform pg_temp.cond9(r, 'min_75m', 'A 75 m o más');
  c := pg_temp.ch9(2, 'Fase 3 de 3: Inflige daño a oponentes desde al menos 100 m de distancia', 'progress', 'value', 'any_match', 300, null, 'S9W2 — Daño a distancia', 3);
  r := pg_temp.rule9(c, 'damage');
  perform pg_temp.cond9(r, 'min_100m', 'A 100 m o más');

  -- ================= SEMANA 3 =================
  c := pg_temp.ch9(3, 'Fase 1 de 3: Haz un truco con una patineta', 'simple', 'count', 'any_match', 1, null, 'S9W3 — Trucos con vehículos', 1);
  r := pg_temp.rule9(c, 'use', 'driftboard');
  perform pg_temp.cond9(r, 'driftboard_trick', 'Truco con patineta');
  c := pg_temp.ch9(3, 'Fase 2 de 3: Consigue 3 s de vuelo en un Quadcrasher', 'progress', 'value', 'any_match', 3, null, 'S9W3 — Trucos con vehículos', 2);
  r := pg_temp.rule9(c, 'use', 'quad_crasher');
  perform pg_temp.cond9(r, 'quad_airtime_3s', '3 s de vuelo en Quadcrasher');
  c := pg_temp.ch9(3, 'Fase 3 de 3: Destruye estructuras de oponentes con un vehículo', 'progress', 'count', 'any_match', 3, null, 'S9W3 — Trucos con vehículos', 3);
  r := pg_temp.rule9(c, 'destroy', null, 'vehicle');
  perform pg_temp.cond9(r, 'opponent_structure', 'Estructura de un oponente');

  c := pg_temp.ch9(3, 'Registra cofres en Casas Cabañiles o Pico Polar', 'progress', 'count', 'any_match', 7, 'or');
  r := pg_temp.rule9(c, 'search', null, null, 'chest', null, 'lonely_lodge');
  r := pg_temp.rule9(c, 'search', null, null, 'chest', null, 'polar_peak');

  c := pg_temp.ch9(3, 'Inflige daño a un oponente en los 10 s posteriores a usar un túnel de viento', 'progress', 'value', 'any_match', 200);
  r := pg_temp.rule9(c, 'damage');
  perform pg_temp.cond9(r, 'after_slipstream', 'En los 10 s tras usar un túnel de viento');

  c := pg_temp.ch9(3, 'Fase 1 de 3: Visita Villa Vivaracha y Conductos Cambiantes en una sola partida', 'progress', 'count', 'same_match', 2, 'and', 'S9W3 — Visita dos zonas en una partida', 1);
  r := pg_temp.rule9(c, 'visit', null, null, null, null, 'happy_hamlet');
  r := pg_temp.rule9(c, 'visit', null, null, null, null, 'shifty_shafts');
  c := pg_temp.ch9(3, 'Fase 2 de 3: Visita Escalones Estivales y Cráter Catastrófico en una sola partida', 'progress', 'count', 'same_match', 2, 'and', 'S9W3 — Visita dos zonas en una partida', 2);
  r := pg_temp.rule9(c, 'visit', null, null, null, null, 'sunny_steps');
  r := pg_temp.rule9(c, 'visit', null, null, null, null, 'dusty_divot');
  c := pg_temp.ch9(3, 'Fase 3 de 3: Visita Lomas Lúgubres y Salpiconeros Salados en una sola partida', 'progress', 'count', 'same_match', 2, 'and', 'S9W3 — Visita dos zonas en una partida', 3);
  r := pg_temp.rule9(c, 'visit', null, null, null, null, 'haunted_hills');
  r := pg_temp.rule9(c, 'visit', null, null, null, null, 'salty_springs');

  c := pg_temp.ch9(3, 'Lanza el disco volador y atrápalo antes de que caiga', 'simple', 'count', 'any_match', 1);
  r := pg_temp.rule9(c, 'misc');
  perform pg_temp.cond9(r, 'flying_disc_catch', '🥏 Disco volador atrapado en el aire');

  c := pg_temp.ch9(3, 'Consigue eliminaciones con armas explosivas', 'progress', 'count', 'any_match', 3);
  r := pg_temp.rule9(c, 'kill', null, 'explosive');

  c := pg_temp.ch9(3, 'Inflige daño con armas distintas en una sola partida', 'progress', 'count', 'same_match', 5);
  r := pg_temp.rule9(c, 'misc');
  perform pg_temp.cond9(r, 'five_weapons_same_match', '5 armas distintas en la misma partida');

  -- ================= SEMANA 4 =================
  c := pg_temp.ch9(4, 'Inflige daño con fusiles de francotirador a oponentes', 'progress', 'value', 'any_match', 500);
  r := pg_temp.rule9(c, 'damage', null, 'sniper');

  c := pg_temp.ch9(4, 'Fase 1 de 3: Baila dentro de una cabeza de tomate holográfica', 'simple', 'count', 'any_match', 1, null, 'S9W4 — Baila en cabezas holográficas', 1);
  r := pg_temp.rule9(c, 'dance', null, null, null, null, 'hologram_tomato');
  c := pg_temp.ch9(4, 'Fase 2 de 3: Baila dentro de una cabeza de Durr Burger holográfica', 'simple', 'count', 'any_match', 1, null, 'S9W4 — Baila en cabezas holográficas', 2);
  r := pg_temp.rule9(c, 'dance', null, null, null, null, 'hologram_durr');
  c := pg_temp.ch9(4, 'Fase 3 de 3: Baila encima de una cabeza de dumpling gigante', 'simple', 'count', 'any_match', 1, null, 'S9W4 — Baila en cabezas holográficas', 3);
  r := pg_temp.rule9(c, 'dance', null, null, null, null, 'dumpling_head');

  c := pg_temp.ch9(4, 'Consigue eliminaciones con armas legendarias', 'progress', 'count', 'any_match', 3);
  r := pg_temp.rule9(c, 'kill');
  perform pg_temp.cond9(r, 'legendary_weapon', 'Arma legendaria');

  c := pg_temp.ch9(4, 'Destruye un transportador de botín en diferentes partidas', 'progress', 'count', 'different_matches', 3);
  r := pg_temp.rule9(c, 'destroy', 'loot_carrier');

  c := pg_temp.ch9(4, 'Fase 1 de 5: Aterriza en Pico Polar', 'simple', 'count', 'any_match', 1, null, 'S9W4 — Aterriza en distintos lugares II', 1);
  r := pg_temp.rule9(c, 'land', null, null, null, null, 'polar_peak');
  c := pg_temp.ch9(4, 'Fase 2 de 5: Aterriza en Laguna Fortuna', 'simple', 'count', 'any_match', 1, null, 'S9W4 — Aterriza en distintos lugares II', 2);
  r := pg_temp.rule9(c, 'land', null, null, null, null, 'lazy_lagoon');
  c := pg_temp.ch9(4, 'Fase 3 de 5: Aterriza en Salpiconeros Salados', 'simple', 'count', 'any_match', 1, null, 'S9W4 — Aterriza en distintos lugares II', 3);
  r := pg_temp.rule9(c, 'land', null, null, null, null, 'salty_springs');
  c := pg_temp.ch9(4, 'Fase 4 de 5: Aterriza en El Bloque', 'simple', 'count', 'any_match', 1, null, 'S9W4 — Aterriza en distintos lugares II', 4);
  r := pg_temp.rule9(c, 'land', null, null, null, null, 'the_block');
  c := pg_temp.ch9(4, 'Fase 5 de 5: Aterriza en Casas Cabañiles', 'simple', 'count', 'any_match', 1, null, 'S9W4 — Aterriza en distintos lugares II', 5);
  r := pg_temp.rule9(c, 'land', null, null, null, null, 'lonely_lodge');

  c := pg_temp.ch9(4, 'Consigue eliminaciones en Lomas Lúgubres o Cráter Catastrófico', 'progress', 'count', 'any_match', 3, 'or');
  r := pg_temp.rule9(c, 'kill', null, null, null, null, 'haunted_hills');
  r := pg_temp.rule9(c, 'kill', null, null, null, null, 'dusty_divot');

  c := pg_temp.ch9(4, 'Visita lugares con nombre diferentes en una sola partida', 'progress', 'distinct_location', 'same_match', 5);
  r := pg_temp.rule9(c, 'visit');

  -- ================= SEMANA 5 =================
  c := pg_temp.ch9(5, 'Inflige daño a oponentes con granadas, dinamita o bomba apestosa', 'progress', 'value', 'any_match', 200, 'or');
  r := pg_temp.rule9(c, 'damage', 'grenade');
  r := pg_temp.rule9(c, 'damage', 'dynamite');
  r := pg_temp.rule9(c, 'damage', 'stink_bomb');

  c := pg_temp.ch9(5, 'Registra cofres en Salpiconeros Salados o Aeroparque Ártico', 'progress', 'count', 'any_match', 7, 'or');
  r := pg_temp.rule9(c, 'search', null, null, 'chest', null, 'salty_springs');
  r := pg_temp.rule9(c, 'search', null, null, 'chest', null, 'frosty_flights');

  c := pg_temp.ch9(5, 'Elimina a un oponente en diferentes partidas', 'progress', 'count', 'different_matches', 5);
  r := pg_temp.rule9(c, 'kill');

  c := pg_temp.ch9(5, 'Fase 1 de 3: Completa una vuelta a la pista de carreras del desierto', 'simple', 'count', 'any_match', 1, null, 'S9W5 — Pistas de carreras', 1);
  r := pg_temp.rule9(c, 'misc');
  perform pg_temp.cond9(r, 'race_track_lap_desert', '🏁 Vuelta completa — pista del desierto');
  c := pg_temp.ch9(5, 'Fase 2 de 3: Completa una vuelta a la pista de carreras nevada', 'simple', 'count', 'any_match', 1, null, 'S9W5 — Pistas de carreras', 2);
  r := pg_temp.rule9(c, 'misc');
  perform pg_temp.cond9(r, 'race_track_lap_snow', '🏁 Vuelta completa — pista nevada');
  c := pg_temp.ch9(5, 'Fase 3 de 3: Completa una vuelta a la pista de carreras de pradera', 'simple', 'count', 'any_match', 1, null, 'S9W5 — Pistas de carreras', 3);
  r := pg_temp.rule9(c, 'misc');
  perform pg_temp.cond9(r, 'race_track_lap_grasslands', '🏁 Vuelta completa — pista de pradera');

  c := pg_temp.ch9(5, 'Coloca una trampa en diferentes partidas', 'progress', 'count', 'different_matches', 5);
  r := pg_temp.rule9(c, 'use', 'trap');

  c := pg_temp.ch9(5, 'Visita turbinas eólicas diferentes en una sola partida', 'progress', 'count', 'same_match', 5, 'and');
  foreach loc in array array[
    'wind_turbine_1', 'wind_turbine_2', 'wind_turbine_3', 'wind_turbine_4', 'wind_turbine_5'
  ] loop
    r := pg_temp.rule9(c, 'visit', null, null, null, null, loc);
  end loop;

  c := pg_temp.ch9(5, 'Consigue eliminaciones en plataformas del cielo', 'progress', 'count', 'any_match', 3, 'or');
  foreach loc in array array[
    'sky_platform_1', 'sky_platform_2', 'sky_platform_3', 'sky_platform_4',
    'sky_platform_5', 'sky_platform_6', 'sky_platform_7'
  ] loop
    r := pg_temp.rule9(c, 'kill', null, null, null, null, loc);
  end loop;

  -- ================= SEMANA 6 =================
  c := pg_temp.ch9(6, 'Fase 1 de 5: Aterriza en Aterrizaje Afortunado', 'simple', 'count', 'any_match', 1, null, 'S9W6 — Aterriza en distintos lugares III', 1);
  r := pg_temp.rule9(c, 'land', null, null, null, null, 'lucky_landing');
  c := pg_temp.ch9(6, 'Fase 2 de 5: Aterriza en Balsa Botín', 'simple', 'count', 'any_match', 1, null, 'S9W6 — Aterriza en distintos lugares III', 2);
  r := pg_temp.rule9(c, 'land', null, null, null, null, 'loot_lake');
  c := pg_temp.ch9(6, 'Fase 3 de 5: Aterriza en Conductos Cambiantes', 'simple', 'count', 'any_match', 1, null, 'S9W6 — Aterriza en distintos lugares III', 3);
  r := pg_temp.rule9(c, 'land', null, null, null, null, 'shifty_shafts');
  c := pg_temp.ch9(6, 'Fase 4 de 5: Aterriza en Aeroparque Ártico', 'simple', 'count', 'any_match', 1, null, 'S9W6 — Aterriza en distintos lugares III', 4);
  r := pg_temp.rule9(c, 'land', null, null, null, null, 'frosty_flights');
  c := pg_temp.ch9(6, 'Fase 5 de 5: Aterriza en Lomas Lúgubres', 'simple', 'count', 'any_match', 1, null, 'S9W6 — Aterriza en distintos lugares III', 5);
  r := pg_temp.rule9(c, 'land', null, null, null, null, 'haunted_hills');

  c := pg_temp.ch9(6, 'Inflige daño con subfusiles a oponentes', 'progress', 'value', 'any_match', 500);
  r := pg_temp.rule9(c, 'damage', null, 'smg');

  c := pg_temp.ch9(6, 'Fase 1 de 3: Registra cofres en un punto caliente', 'progress', 'count', 'any_match', 3, null, 'S9W6 — Punto caliente', 1);
  r := pg_temp.rule9(c, 'search', null, null, 'chest');
  perform pg_temp.cond9(r, 'hot_spot', '🔥 Punto caliente');
  c := pg_temp.ch9(6, 'Fase 2 de 3: Registra cajas de munición en un punto caliente', 'progress', 'count', 'any_match', 3, null, 'S9W6 — Punto caliente', 2);
  r := pg_temp.rule9(c, 'search', null, null, 'ammo_box');
  perform pg_temp.cond9(r, 'hot_spot', '🔥 Punto caliente');
  c := pg_temp.ch9(6, 'Fase 3 de 3: Consigue una eliminación en un punto caliente', 'simple', 'count', 'any_match', 1, null, 'S9W6 — Punto caliente', 3);
  r := pg_temp.rule9(c, 'kill');
  perform pg_temp.cond9(r, 'hot_spot', '🔥 Punto caliente');

  c := pg_temp.ch9(6, 'Inflige daño a un vehículo conducido por un oponente', 'progress', 'value', 'any_match', 200);
  r := pg_temp.rule9(c, 'damage', null, null, null, 'vehicle');
  perform pg_temp.cond9(r, 'driven_by_opponent', 'Conducido por un rival');

  c := pg_temp.ch9(6, 'Usa un inversor de tormenta en diferentes partidas', 'progress', 'count', 'different_matches', 3);
  r := pg_temp.rule9(c, 'use', 'storm_flip');

  c := pg_temp.ch9(6, 'Usa vehículos diferentes en una sola partida', 'progress', 'count', 'same_match', 2);
  r := pg_temp.rule9(c, 'use', null, 'vehicle');

  c := pg_temp.ch9(6, 'Consigue eliminaciones en El Bloque o Terreno Tormentoso', 'progress', 'count', 'any_match', 3, 'or');
  r := pg_temp.rule9(c, 'kill', null, null, null, null, 'the_block');
  r := pg_temp.rule9(c, 'kill', null, null, null, null, 'fatal_fields');

  -- ================= SEMANA 7 =================
  c := pg_temp.ch9(7, 'Registra cofres en Cruce Chatarra o Neorrecostados', 'progress', 'count', 'any_match', 7, 'or');
  r := pg_temp.rule9(c, 'search', null, null, 'chest', null, 'junk_juction');
  r := pg_temp.rule9(c, 'search', null, null, 'chest', null, 'neo_tilted');

  c := pg_temp.ch9(7, 'Registra cajas de munición en lugares con nombre diferentes', 'progress', 'distinct_location', 'any_match', 7);
  r := pg_temp.rule9(c, 'search', null, null, 'ammo_box');

  c := pg_temp.ch9(7, 'Consigue eliminaciones con armas con silenciador', 'progress', 'count', 'any_match', 3);
  r := pg_temp.rule9(c, 'kill', null, 'suppresed');

  c := pg_temp.ch9(7, 'Inflige daño a oponentes mientras montas en un vehículo', 'progress', 'value', 'any_match', 200);
  r := pg_temp.rule9(c, 'damage');
  perform pg_temp.cond9(r, 'while_on_vehicle', 'Montando en un vehículo');

  c := pg_temp.ch9(7, 'Fase 1 de 3: Visita El Bloque y Balsa Botín en una sola partida', 'progress', 'count', 'same_match', 2, 'and', 'S9W7 — Visita dos zonas en una partida', 1);
  r := pg_temp.rule9(c, 'visit', null, null, null, null, 'the_block');
  r := pg_temp.rule9(c, 'visit', null, null, null, null, 'loot_lake');
  c := pg_temp.ch9(7, 'Fase 2 de 3: Visita Terreno Tormentoso y Neorrecostados en una sola partida', 'progress', 'count', 'same_match', 2, 'and', 'S9W7 — Visita dos zonas en una partida', 2);
  r := pg_temp.rule9(c, 'visit', null, null, null, null, 'fatal_fields');
  r := pg_temp.rule9(c, 'visit', null, null, null, null, 'neo_tilted');
  c := pg_temp.ch9(7, 'Fase 3 de 3: Visita Costas Clasistas y Mega Mall en una sola partida', 'progress', 'count', 'same_match', 2, 'and', 'S9W7 — Visita dos zonas en una partida', 3);
  r := pg_temp.rule9(c, 'visit', null, null, null, null, 'snobby_shores');
  r := pg_temp.rule9(c, 'visit', null, null, null, null, 'mega_mall');

  c := pg_temp.ch9(7, 'Registra un cofre, usa una máquina expendedora y una hoguera acogedora en una sola partida', 'progress', 'count', 'same_match', 3, 'and');
  r := pg_temp.rule9(c, 'search', null, null, 'chest');
  r := pg_temp.rule9(c, 'use', 'vending_machine');
  r := pg_temp.rule9(c, 'use', 'campfire');

  c := pg_temp.ch9(7, 'Consigue eliminaciones a 5 m o menos', 'progress', 'count', 'any_match', 3);
  r := pg_temp.rule9(c, 'kill');
  perform pg_temp.cond9(r, 'max_5m', 'A 5 m o menos');

  -- ================= SEMANA 8 =================
  c := pg_temp.ch9(8, 'Aplica escudos', 'progress', 'value', 'any_match', 400, 'or');
  r := pg_temp.rule9(c, 'gain', 'mushroom');
  r := pg_temp.rule9(c, 'gain', 'small_shield');
  r := pg_temp.rule9(c, 'gain', 'shield_potion');
  r := pg_temp.rule9(c, 'gain', 'chug_splash');

  c := pg_temp.ch9(8, 'Visita relojes diferentes', 'progress', 'count', 'any_match', 3, 'and');
  r := pg_temp.rule9(c, 'visit', null, null, null, null, 'clock_1');
  r := pg_temp.rule9(c, 'visit', null, null, null, null, 'clock_2');
  r := pg_temp.rule9(c, 'visit', null, null, null, null, 'clock_3');

  c := pg_temp.ch9(8, 'Consigue eliminaciones en Costas Clasistas o Mega Mall', 'progress', 'count', 'any_match', 7, 'or');
  r := pg_temp.rule9(c, 'kill', null, null, null, null, 'snobby_shores');
  r := pg_temp.rule9(c, 'kill', null, null, null, null, 'mega_mall');

  c := pg_temp.ch9(8, 'Inflige daño con fusiles de asalto a oponentes', 'progress', 'value', 'any_match', 500);
  r := pg_temp.rule9(c, 'damage', null, 'rifle');

  c := pg_temp.ch9(8, 'Fase 1 de 5: Aterriza en Palmeras Paradisíacas', 'simple', 'count', 'any_match', 1, null, 'S9W8 — Aterriza en distintos lugares IV', 1);
  r := pg_temp.rule9(c, 'land', null, null, null, null, 'paradise_palms');
  c := pg_temp.ch9(8, 'Fase 2 de 5: Aterriza en Neorrecostados', 'simple', 'count', 'any_match', 1, null, 'S9W8 — Aterriza en distintos lugares IV', 2);
  r := pg_temp.rule9(c, 'land', null, null, null, null, 'neo_tilted');
  c := pg_temp.ch9(8, 'Fase 3 de 5: Aterriza en Mega Mall', 'simple', 'count', 'any_match', 1, null, 'S9W8 — Aterriza en distintos lugares IV', 3);
  r := pg_temp.rule9(c, 'land', null, null, null, null, 'mega_mall');
  c := pg_temp.ch9(8, 'Fase 4 de 5: Aterriza en Parque Placentero', 'simple', 'count', 'any_match', 1, null, 'S9W8 — Aterriza en distintos lugares IV', 4);
  r := pg_temp.rule9(c, 'land', null, null, null, null, 'pleasant_park');
  c := pg_temp.ch9(8, 'Fase 5 de 5: Aterriza en Cruce Chatarra', 'simple', 'count', 'any_match', 1, null, 'S9W8 — Aterriza en distintos lugares IV', 5);
  r := pg_temp.rule9(c, 'land', null, null, null, null, 'junk_juction');

  c := pg_temp.ch9(8, 'Usa un respiradero volcánico, un respiradero de aire y una tirolina en una sola partida', 'progress', 'count', 'same_match', 3, 'and');
  r := pg_temp.rule9(c, 'use', 'volcano_vent');
  r := pg_temp.rule9(c, 'use', 'air_vent');
  r := pg_temp.rule9(c, 'use', 'zipline');

  c := pg_temp.ch9(8, 'Consigue eliminaciones fuera de lugares con nombre', 'progress', 'count', 'any_match', 5);
  r := pg_temp.rule9(c, 'kill');
  perform pg_temp.cond9(r, 'outside_named_location', 'Fuera de lugares con nombre');

  -- ================= SEMANA 9 =================
  c := pg_temp.ch9(9, 'Usa un bidón de plasma o Salpicón Saludable en diferentes partidas', 'progress', 'count', 'different_matches', 3, 'or');
  r := pg_temp.rule9(c, 'use', 'chug_jug');
  r := pg_temp.rule9(c, 'use', 'chug_splash');

  c := pg_temp.ch9(9, 'Visita un panel solar en la nieve, el desierto y la jungla', 'progress', 'count', 'any_match', 3, 'and');
  r := pg_temp.rule9(c, 'visit', null, null, null, null, 'solar_array_snow');
  r := pg_temp.rule9(c, 'visit', null, null, null, null, 'solar_array_desert');
  r := pg_temp.rule9(c, 'visit', null, null, null, null, 'solar_array_jungle');

  c := pg_temp.ch9(9, 'Fase 1 de 5: Consigue una eliminación con un arma de rareza común', 'simple', 'count', 'any_match', 1, null, 'S9W9 — Elimina por rareza', 1);
  r := pg_temp.rule9(c, 'kill');
  perform pg_temp.cond9(r, 'common_rarity', 'Rareza común');
  c := pg_temp.ch9(9, 'Fase 2 de 5: Consigue una eliminación con un arma de rareza poco común', 'simple', 'count', 'any_match', 1, null, 'S9W9 — Elimina por rareza', 2);
  r := pg_temp.rule9(c, 'kill');
  perform pg_temp.cond9(r, 'uncommon_rarity', 'Rareza poco común');
  c := pg_temp.ch9(9, 'Fase 3 de 5: Consigue una eliminación con un arma de rareza rara', 'simple', 'count', 'any_match', 1, null, 'S9W9 — Elimina por rareza', 3);
  r := pg_temp.rule9(c, 'kill');
  perform pg_temp.cond9(r, 'rare_rarity', 'Rareza rara');
  c := pg_temp.ch9(9, 'Fase 4 de 5: Consigue una eliminación con un arma de rareza épica', 'simple', 'count', 'any_match', 1, null, 'S9W9 — Elimina por rareza', 4);
  r := pg_temp.rule9(c, 'kill');
  perform pg_temp.cond9(r, 'epic_rarity', 'Rareza épica');
  c := pg_temp.ch9(9, 'Fase 5 de 5: Consigue una eliminación con un arma de rareza legendaria', 'simple', 'count', 'any_match', 1, null, 'S9W9 — Elimina por rareza', 5);
  r := pg_temp.rule9(c, 'kill');
  perform pg_temp.cond9(r, 'legendary_rarity', 'Rareza legendaria');

  c := pg_temp.ch9(9, 'Inflige daño de disparos a la cabeza a oponentes', 'progress', 'value', 'any_match', 500);
  r := pg_temp.rule9(c, 'damage');
  perform pg_temp.cond9(r, 'headshot', 'Disparo a la cabeza');

  c := pg_temp.ch9(9, 'Registra cofres en Laguna Fortuna o Villa Vivaracha', 'progress', 'count', 'any_match', 7, 'or');
  r := pg_temp.rule9(c, 'search', null, null, 'chest', null, 'lazy_lagoon');
  r := pg_temp.rule9(c, 'search', null, null, 'chest', null, 'happy_hamlet');

  c := pg_temp.ch9(9, 'Consigue eliminaciones en lugares con nombre diferentes', 'progress', 'distinct_location', 'any_match', 5);
  r := pg_temp.rule9(c, 'kill');

  c := pg_temp.ch9(9, 'Inflige daño a un oponente en los 10 s posteriores a usar un respiradero volcánico', 'progress', 'value', 'any_match', 200);
  r := pg_temp.rule9(c, 'damage');
  perform pg_temp.cond9(r, 'after_volcano_vent', 'En los 10 s tras usar un respiradero volcánico');

  -- ================= SEMANA 10 =================
  c := pg_temp.ch9(10, 'Usa un ataque aéreo en diferentes partidas', 'progress', 'count', 'different_matches', 3);
  r := pg_temp.rule9(c, 'use', 'air_strike');

  c := pg_temp.ch9(10, 'Inflige daño con escopetas a oponentes', 'progress', 'value', 'any_match', 200);
  r := pg_temp.rule9(c, 'damage', null, 'shotgun');

  c := pg_temp.ch9(10, 'Registra cajas de munición en una sola partida', 'progress', 'count', 'same_match', 7);
  r := pg_temp.rule9(c, 'search', null, null, 'ammo_box');

  c := pg_temp.ch9(10, 'Fase 1 de 2: Marca el número en el Teléfono Gigante de la nieve', 'simple', 'count', 'any_match', 1, null, 'S9W10 — Teléfonos gigantes', 1);
  r := pg_temp.rule9(c, 'misc');
  perform pg_temp.cond9(r, 'dial_durr_burger', '📞 Teléfono Gigante de la nieve');
  c := pg_temp.ch9(10, 'Fase 2 de 2: Marca el número en el Teléfono Gigante de la Jungla', 'simple', 'count', 'any_match', 1, null, 'S9W10 — Teléfonos gigantes', 2);
  r := pg_temp.rule9(c, 'misc');
  perform pg_temp.cond9(r, 'dial_pizza_pit', '📞 Teléfono Gigante de la Jungla');

  c := pg_temp.ch9(10, 'Fase 1 de 3: Recolecta madera de un barco pirata o vikingo', 'progress', 'value', 'any_match', 100, 'or', 'S9W10 — Recolecta materiales', 1);
  r := pg_temp.rule9(c, 'harvest', null, null, 'wood', null, 'pirate_ship');
  r := pg_temp.rule9(c, 'harvest', null, null, 'wood', null, 'viking_ship');
  c := pg_temp.ch9(10, 'Fase 2 de 3: Recolecta piedra de un Tenedor y cuchillo o un paraguas gigante', 'progress', 'value', 'any_match', 100, 'or', 'S9W10 — Recolecta materiales', 2);
  r := pg_temp.rule9(c, 'harvest', null, null, 'stone', null, 'fork_knife');
  r := pg_temp.rule9(c, 'harvest', null, null, 'stone', null, 'umbrella_landmark');
  c := pg_temp.ch9(10, 'Fase 3 de 3: Recolecta metal de una fábrica de robots', 'progress', 'value', 'any_match', 100, null, 'S9W10 — Recolecta materiales', 3);
  r := pg_temp.rule9(c, 'harvest', null, null, 'metal', null, 'robot_factory');

  c := pg_temp.ch9(10, 'Consigue eliminaciones en Parque Placentero o Palmeras Paradisíacas', 'progress', 'count', 'any_match', 3, 'or');
  r := pg_temp.rule9(c, 'kill', null, null, null, null, 'pleasant_park');
  r := pg_temp.rule9(c, 'kill', null, null, null, null, 'paradise_palms');

  c := pg_temp.ch9(10, 'Inflige daño con el pico a oponentes', 'progress', 'value', 'any_match', 200);
  r := pg_temp.rule9(c, 'damage', 'pickaxe');
end $$;

-- Condiciones nuevas que requieren arma
update public.rule_conditions set requires_weapon = true
where condition_key in ('min_75m', 'min_100m', 'from_2_stories_above', 'from_4_stories_above', 'from_6_stories_above');

-- ── Meta semanal ────────────────────────────────────────────────────────────
insert into public.challenges
  (description, kind, unit, match_scope, current_value, target_value,
   is_completed, week_id, is_meta)
select
  'Completa todos los desafíos de la semana',
  'progress', 'count', 'any_match', 0,
  greatest((select count(distinct coalesce(c.line_id::text, c.id::text))
            from public.challenges c
            where c.week_id = w.id and c.is_meta = false and c.is_prestige = false), 1),
  false, w.id, true
from public.challenge_weeks w
join public.seasons s on s.id = w.season_id
where s.code = 'season_9'
  and not exists (
    select 1 from public.challenges c where c.week_id = w.id and c.is_meta
  );

-- ── Desbloquear temporada ───────────────────────────────────────────────────
update public.seasons
set is_locked = false
where code = 'season_9';

drop function if exists pg_temp.ch9(int, text, challenge_kind, text, match_scope, bigint, rule_group_operator, text, int);
drop function if exists pg_temp.rule9(uuid, text, text, text, text, text, text);
drop function if exists pg_temp.cond9(uuid, text, text);
