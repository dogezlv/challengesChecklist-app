-- ============================================================
-- 25_prestige_rewrite.sql
-- Reescritura COMPLETA de los prestigios de la Temporada 8 (semanas 1–10)
-- según la lista oficial del usuario. Los prestigios son su propia cosa por
-- semana: NO están ligados a desafíos normales más allá de que se desbloquean
-- al completar todos los normales de la semana (lógica intacta en db/16).
--
-- Estrategia: por cada semana se BORRAN todos los prestigios existentes (y sus
-- reglas/condiciones/progreso) y se RECREAN desde cero con esta lista. Así no
-- quedan duplicados ni desafíos viejos. Idempotente: re-ejecutar deja el mismo
-- estado final.
--
-- Nota S7: la lista trae dos veces el mismo texto "Registra cofres o cajas de
-- munición en zonas vikingas (0/15)"; se unifica en UN solo desafío cuyo
-- alcance incluye la villa vikinga (sin nombre) y Costas Clasistas.
-- ============================================================

-- ── Catálogo nuevo ──────────────────────────────────────────────────────────
insert into public.game_objects (code, display_name, display_name_en, is_weapon)
values
  ('impulse_grenade', 'Granada de impulso', 'Impulse Grenade', false),
  ('shadow_bomb',     'Bomba de sombra',    'Shadow Bomb',     false),
  ('pirate_flag',     'Bandera pirata',     'Pirate Flag',     false)
on conflict (code) do nothing;

insert into public.game_object_tags (object_id, tag_id)
select o.id, t.id
from public.game_objects o
cross join public.tags t
where (o.code, t.code) in (
  ('impulse_grenade', 'throwable'),
  ('shadow_bomb',     'throwable')
)
on conflict do nothing;

insert into public.locations (code, display_name, display_name_en, named_location)
values
  ('sunny_steps_pyramid', 'Punta de la pirámide estival',        'Sunny Steps Pyramid Tip',  false),
  ('grain_silo',          'Silo de grano',                       'Grain Silo',               false),
  ('submarine',           'Submarino',                           'Submarine',                false),
  ('snowy_mine',          'Mina nevada',                         'Snowy Mine',               false),
  ('frozen_toilet',       'Inodoro congelado',                   'Frozen Toilet',            false),
  ('lava_square',         'Pozo de lava cuadrado',               'Square Lava Pit',          false),
  ('viking_village',      'Villa vikinga',                       'Viking Village',           false),
  ('giant_phone_durr',    'Teléfono gigante de Durr Burger',     'Durr Burger Giant Phone',  false),
  ('giant_phone_pizza',   'Teléfono gigante de Pizza Pit',       'Pizza Pit Giant Phone',    false),
  ('volcano_affected',    'Zona afectada por el volcán',         'Volcano-Affected Zone',    false),
  ('tomato_head_durr',    'Cabeza de tomate (Durr Burger)',      'Tomato Head (Durr Burger)',false),
  ('tomato_head_town',    'Cabeza de tomate (Pueblo Tomate)',    'Tomato Head (Tomato Town)',false),
  ('throne',              'Trono',                               'Throne',                   false),
  ('watchtower',          'Puesto de vigilancia elevado',        'Elevated Watchtower',      false)
on conflict (code) do nothing;

-- ── Helpers (pg_temp: viven solo en esta sesión) ────────────────────────────
create or replace function pg_temp.act(c text) returns uuid language sql as $$
  select id from action_types where code = c $$;
create or replace function pg_temp.tg(c text) returns uuid language sql as $$
  select id from tags where code = c $$;
create or replace function pg_temp.ob(c text) returns uuid language sql as $$
  select id from game_objects where code = c $$;
create or replace function pg_temp.lc(c text) returns uuid language sql as $$
  select id from locations where code = c $$;

create or replace function pg_temp.wk(p_week int) returns uuid language sql as $$
  select w.id from challenge_weeks w
  join seasons s on s.id = w.season_id
  where s.code = 'season_8' and w.week_number = p_week $$;

-- Crea un prestigio y devuelve su id.
create or replace function pg_temp.mk(
  p_week int, p_desc text, p_kind text, p_unit text, p_scope text,
  p_target int, p_op text default 'and'
) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into challenges (description, kind, unit, match_scope, current_value,
    target_value, is_completed, week_id, is_meta, is_prestige, rules_operator)
  values (p_desc, p_kind::challenge_kind, p_unit, p_scope::match_scope, 0,
    greatest(p_target, 1), false,
    pg_temp.wk(p_week), false, true, p_op::rule_group_operator)
  returning id into v;
  return v;
end $$;

-- Añade una regla a un desafío y devuelve su id.
create or replace function pg_temp.rl(
  p_ch uuid, p_act text,
  p_req_obj text default null, p_req_tag text default null,
  p_tgt_obj text default null, p_tgt_tag text default null,
  p_loc text default null, p_grp int default null
) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into challenge_rules (challenge_id, action_type_id, required_object_id,
    required_tag_id, target_object_id, target_tag_id, location_id, rule_group)
  values (p_ch, pg_temp.act(p_act), pg_temp.ob(p_req_obj), pg_temp.tg(p_req_tag),
    pg_temp.ob(p_tgt_obj), pg_temp.tg(p_tgt_tag), pg_temp.lc(p_loc), p_grp)
  returning id into v;
  return v;
end $$;

-- Añade una condición (checkmark supervisor) a una regla.
create or replace function pg_temp.cn(
  p_rule uuid, p_key text, p_val text, p_req_weapon boolean default false
) returns void language sql as $$
  insert into rule_conditions (challenge_rule_id, condition_key, condition_value, requires_weapon)
  values (p_rule, p_key, p_val, p_req_weapon);
$$;

-- ── Borrar TODOS los prestigios S8 (cascada manual) ─────────────────────────
do $$
declare v_ids uuid[];
begin
  select array_agg(c.id) into v_ids
  from challenges c
  join challenge_weeks w on w.id = c.week_id
  join seasons s on s.id = w.season_id
  where s.code = 'season_8' and c.is_prestige = true;

  if v_ids is null then return; end if;

  delete from rule_conditions
   where challenge_rule_id in (select id from challenge_rules where challenge_id = any(v_ids));
  delete from match_rule_progress where challenge_id = any(v_ids);
  delete from challenge_distinct_progress where challenge_id = any(v_ids);
  delete from challenge_rules where challenge_id = any(v_ids);
  delete from challenges where id = any(v_ids);
end $$;

-- ── Recrear prestigios ──────────────────────────────────────────────────────
do $$
declare v uuid; r uuid; cmp text;
begin
  -- ═══════════════════════════════ SEMANA 1 ═══════════════════════════════
  v := pg_temp.mk(1, 'Visita las 3 caras gigantes en una sola partida', 'progress', 'count', 'same_match', 3);
  perform pg_temp.rl(v, 'visit', null, null, null, null, 'giant_face_desert');
  perform pg_temp.rl(v, 'visit', null, null, null, null, 'giant_face_jungle');
  perform pg_temp.rl(v, 'visit', null, null, null, null, 'giant_face_snow');

  v := pg_temp.mk(1, 'Usa 15 respiraderos volcánicos diferentes en la misma partida', 'progress', 'count', 'same_match', 15);
  perform pg_temp.rl(v, 'use', 'volcano_vent');

  v := pg_temp.mk(1, 'Consigue eliminaciones en Metrópoli Mercantil o Cruce Chatarra', 'progress', 'count', 'any_match', 3, 'or');
  perform pg_temp.rl(v, 'kill', null, null, null, null, 'retail_row');
  perform pg_temp.rl(v, 'kill', null, null, null, null, 'junk_juction');

  v := pg_temp.mk(1, 'Destruye un vehículo conducido por un oponente', 'progress', 'count', 'any_match', 1);
  perform pg_temp.rl(v, 'destroy', null, null, null, 'vehicle');

  v := pg_temp.mk(1, 'Consigue una eliminación con un arma explosiva y una escopeta en la misma partida', 'progress', 'count', 'same_match', 2);
  perform pg_temp.rl(v, 'kill', null, 'explosive');
  perform pg_temp.rl(v, 'kill', null, 'shotgun');

  v := pg_temp.mk(1, 'Visita todos los campamentos piratas en una misma partida', 'progress', 'count', 'same_match', 7);
  perform pg_temp.rl(v, 'visit', null, null, null, null, l.code)
  from locations l where l.code like 'pirate_camp_%';

  v := pg_temp.mk(1, 'Consigue una eliminación con un fusil de asalto y un fusil de francotirador en la misma partida', 'progress', 'count', 'same_match', 2);
  perform pg_temp.rl(v, 'kill', null, 'assault');
  perform pg_temp.rl(v, 'kill', null, 'sniper');

  -- ═══════════════════════════════ SEMANA 2 ═══════════════════════════════
  v := pg_temp.mk(2, 'Consigue una eliminación con el cañón pirata', 'progress', 'count', 'any_match', 1);
  perform pg_temp.rl(v, 'kill', 'pirate_cannon');

  v := pg_temp.mk(2, 'Registra entregas de suministro que hayas derribado', 'progress', 'count', 'any_match', 2);
  r := pg_temp.rl(v, 'search', null, null, 'supply_drop');
  perform pg_temp.cn(r, 'shot_down_supply', '💥 Entrega derribada por ti');

  v := pg_temp.mk(2, 'Visita 2 puntos cardinales opuestos en el mapa en la misma partida', 'progress', 'count', 'same_match', 2);
  perform pg_temp.rl(v, 'visit', null, null, null, null, 'north_point', 1);
  perform pg_temp.rl(v, 'visit', null, null, null, null, 'south_point', 1);
  perform pg_temp.rl(v, 'visit', null, null, null, null, 'east_point', 2);
  perform pg_temp.rl(v, 'visit', null, null, null, null, 'west_point', 2);

  v := pg_temp.mk(2, 'Gana salud o escudo con un bidón de plasma', 'progress', 'value', 'any_match', 180);
  perform pg_temp.rl(v, 'gain', 'chug_jug');

  v := pg_temp.mk(2, 'Consigue eliminaciones sin recibir daño entre ellas', 'progress', 'count', 'any_match', 3);
  r := pg_temp.rl(v, 'kill');
  perform pg_temp.cn(r, 'no_damage_between', '🛡️ Sin recibir daño entre eliminaciones');

  v := pg_temp.mk(2, 'Aterriza en Palmeras Paradisíacas al caer del autobús de batalla y gana la partida', 'progress', 'count', 'same_match', 2);
  r := pg_temp.rl(v, 'land', null, null, null, null, 'paradise_palms');
  perform pg_temp.cn(r, 'from_battle_bus', '🚌 Al caer del autobús de batalla');
  r := pg_temp.rl(v, 'misc');
  perform pg_temp.cn(r, 'win_match', '🏆 Ganaste la partida');

  v := pg_temp.mk(2, 'No registres ningún cofre en ubicaciones con nombre y sobrevive a 90 jugadores', 'progress', 'value', 'same_match', 90);
  r := pg_temp.rl(v, 'outlast');
  perform pg_temp.cn(r, 'no_named_chests', '🚫 Sin abrir cofres en ubicaciones con nombre');

  -- ═══════════════════════════════ SEMANA 3 ═══════════════════════════════
  v := pg_temp.mk(3, 'Visita Aeroparque Ártico, Terreno Tormentoso y Balsa Botín en una sola partida', 'progress', 'count', 'same_match', 3);
  perform pg_temp.rl(v, 'visit', null, null, null, null, 'frosty_flights');
  perform pg_temp.rl(v, 'visit', null, null, null, null, 'fatal_fields');
  perform pg_temp.rl(v, 'visit', null, null, null, null, 'loot_lake');

  v := pg_temp.mk(3, 'Consigue eliminaciones con trampas', 'progress', 'count', 'any_match', 2);
  perform pg_temp.rl(v, 'kill', null, 'trap');

  v := pg_temp.mk(3, 'Consigue eliminaciones con disparos a la cabeza', 'progress', 'count', 'any_match', 3);
  r := pg_temp.rl(v, 'kill');
  perform pg_temp.cn(r, 'headshot', '🎯 Disparo a la cabeza', true);

  v := pg_temp.mk(3, 'Consigue eliminaciones con pistola y fusil de francotirador en la misma partida', 'progress', 'count', 'same_match', 2);
  perform pg_temp.rl(v, 'kill', null, 'pistol');
  perform pg_temp.rl(v, 'kill', null, 'sniper');

  v := pg_temp.mk(3, 'Baila en la punta de la pirámide estival más alta y sobre un silo de grano en la misma partida', 'progress', 'count', 'same_match', 2);
  perform pg_temp.rl(v, 'dance', null, null, null, null, 'sunny_steps_pyramid');
  perform pg_temp.rl(v, 'dance', null, null, null, null, 'grain_silo');

  v := pg_temp.mk(3, 'Inflige daño en el bioma de la jungla', 'progress', 'value', 'any_match', 500);
  perform pg_temp.rl(v, 'damage', null, null, null, null, 'jungle');

  -- ═══════════════════════════════ SEMANA 4 ═══════════════════════════════
  v := pg_temp.mk(4, 'Gana una partida', 'progress', 'count', 'any_match', 1);
  r := pg_temp.rl(v, 'misc');
  perform pg_temp.cn(r, 'win_match', '🏆 Ganaste la partida');

  v := pg_temp.mk(4, 'Inflige daño con armas con mira o con armas silenciadas en la misma partida', 'progress', 'value', 'same_match', 500);
  r := pg_temp.rl(v, 'damage');
  perform pg_temp.cn(r, 'scoped_or_suppressed', '🔭 Arma con mira o silenciada', true);

  v := pg_temp.mk(4, 'Impacta a un enemigo contigo como bola de cañón', 'progress', 'count', 'any_match', 1);
  r := pg_temp.rl(v, 'misc');
  perform pg_temp.cn(r, 'baller_cannon_hit', '💥 Impacto como bola de cañón');

  v := pg_temp.mk(4, 'Baila en una cancha de fútbol y en la punta de una torre del reloj en la misma partida', 'progress', 'count', 'same_match', 2);
  perform pg_temp.rl(v, 'dance', null, null, null, null, 'pleasant_park_soccer');
  perform pg_temp.rl(v, 'dance', null, null, null, null, 'tilted_towers_clock');

  v := pg_temp.mk(4, 'Destruye 5 bolonchos en la misma partida', 'progress', 'count', 'same_match', 5);
  perform pg_temp.rl(v, 'destroy', null, null, 'the_baller');

  v := pg_temp.mk(4, 'Busca una entrega de suministros y un tesoro enterrado en la misma partida', 'progress', 'count', 'same_match', 2);
  perform pg_temp.rl(v, 'search', null, null, 'supply_drop');
  perform pg_temp.rl(v, 'search', null, null, 'buried_treasure');

  v := pg_temp.mk(4, 'Elimina un oponente 30 segundos después de aterrizar en Villa Vivaracha o Parque Placentero', 'progress', 'count', 'any_match', 1, 'or');
  r := pg_temp.rl(v, 'kill', null, null, null, null, 'happy_hamlet');
  perform pg_temp.cn(r, 'within_30s_landing', '⏱️ En 30 s tras aterrizar');
  r := pg_temp.rl(v, 'kill', null, null, null, null, 'pleasant_park');
  perform pg_temp.cn(r, 'within_30s_landing', '⏱️ En 30 s tras aterrizar');

  -- ═══════════════════════════════ SEMANA 5 ═══════════════════════════════
  v := pg_temp.mk(5, 'Gana escudo con un jugo de sorbete', 'progress', 'value', 'any_match', 150);
  perform pg_temp.rl(v, 'gain', 'slurp_juice');

  v := pg_temp.mk(5, 'Completa una vuelta a la pista de carreras de Villa Vivaracha con un Quad Crasher', 'progress', 'count', 'any_match', 1);
  r := pg_temp.rl(v, 'misc');
  perform pg_temp.cn(r, 'race_track_lap_quad', '🏁 Vuelta completa con Quad Crasher');

  v := pg_temp.mk(5, 'Elimina oponentes en campamentos piratas diferentes', 'progress', 'count', 'different_matches', 3, 'or');
  perform pg_temp.rl(v, 'kill', null, null, null, null, l.code)
  from locations l where l.code like 'pirate_camp_%';

  v := pg_temp.mk(5, 'Elimina oponentes con armas con mira', 'progress', 'count', 'any_match', 3);
  perform pg_temp.rl(v, 'kill', null, 'scoped');

  v := pg_temp.mk(5, 'Usa el volcán para impulsarte, una patineta y un arbusto en la misma partida', 'progress', 'count', 'same_match', 3);
  perform pg_temp.rl(v, 'use', 'volcano');
  perform pg_temp.rl(v, 'use', 'driftboard');
  perform pg_temp.rl(v, 'use', 'camo_bush');

  v := pg_temp.mk(5, 'Usa un cañón pirata para dispararte hacia dentro del volcán', 'progress', 'count', 'any_match', 1);
  r := pg_temp.rl(v, 'use', 'pirate_cannon');
  perform pg_temp.cn(r, 'cannon_into_volcano', '🌋 Disparo hacia dentro del volcán');

  v := pg_temp.mk(5, 'Consigue 15 botes en un solo lanzamiento con la pelota saltarina dentro de un animal', 'progress', 'count', 'any_match', 1);
  r := pg_temp.rl(v, 'use', 'bouncy_ball');
  perform pg_temp.cn(r, 'fifteen_bounces_in_animal', '🦴 15 botes seguidos dentro de un animal');

  -- ═══════════════════════════════ SEMANA 6 ═══════════════════════════════
  v := pg_temp.mk(6, 'Consigue eliminaciones con la pistola de mecha y el arco explosivo en la misma partida', 'progress', 'count', 'same_match', 2);
  perform pg_temp.rl(v, 'kill', 'flintknock');
  perform pg_temp.rl(v, 'kill', 'boom_bow');

  v := pg_temp.mk(6, 'Elimina oponentes con objetos arrojadizos', 'progress', 'count', 'any_match', 3);
  perform pg_temp.rl(v, 'kill', null, 'throwable');

  v := pg_temp.mk(6, 'Visita un conejo de madera, un cerdo de piedra y una llama de metal en la misma partida', 'progress', 'count', 'same_match', 3);
  perform pg_temp.rl(v, 'visit', null, null, null, null, 'wooden_rabbit');
  perform pg_temp.rl(v, 'visit', null, null, null, null, 'stone_pig');
  perform pg_temp.rl(v, 'visit', null, null, null, null, 'metal_llama');

  v := pg_temp.mk(6, 'Baila sobre un submarino y dentro de una mina nevada en la misma partida', 'progress', 'count', 'same_match', 2);
  perform pg_temp.rl(v, 'dance', null, null, null, null, 'submarine');
  perform pg_temp.rl(v, 'dance', null, null, null, null, 'snowy_mine');

  v := pg_temp.mk(6, 'Busca donde apunta el cuchillo en la pantalla de carga del mapa del tesoro', 'progress', 'count', 'any_match', 1);
  perform pg_temp.rl(v, 'search', null, null, 'treasure_map_knife');

  v := pg_temp.mk(6, 'Aterriza en una de las elevaciones más altas de la isla al caer del autobús de batalla y gana la partida', 'progress', 'count', 'same_match', 2);
  r := pg_temp.rl(v, 'misc');
  perform pg_temp.cn(r, 'land_high_point', '⛰️ Aterrizaste en una elevación alta');
  r := pg_temp.rl(v, 'misc');
  perform pg_temp.cn(r, 'win_match', '🏆 Ganaste la partida');

  v := pg_temp.mk(6, 'Inflige daño en el bioma nevado y el bioma selvático en la misma partida', 'progress', 'count', 'same_match', 2);
  perform pg_temp.rl(v, 'damage', null, null, null, null, 'snow');
  perform pg_temp.rl(v, 'damage', null, null, null, null, 'jungle');

  -- ═══════════════════════════════ SEMANA 7 ═══════════════════════════════
  v := pg_temp.mk(7, 'Elimina a un oponente con el pico', 'progress', 'count', 'any_match', 1);
  perform pg_temp.rl(v, 'kill', 'pickaxe');

  v := pg_temp.mk(7, 'Elimina a oponentes desde arriba', 'progress', 'count', 'any_match', 3);
  r := pg_temp.rl(v, 'kill');
  perform pg_temp.cn(r, 'from_above', '⬆️ Desde arriba');

  v := pg_temp.mk(7, 'Elimina a un oponente mientras montas una tirolina', 'progress', 'count', 'any_match', 1);
  r := pg_temp.rl(v, 'kill');
  perform pg_temp.cn(r, 'while_on_zipline', '🪢 Mientras montas una tirolina');

  v := pg_temp.mk(7, 'Visita un inodoro congelado y un pozo de lava cuadrado en la misma partida', 'progress', 'count', 'same_match', 2);
  perform pg_temp.rl(v, 'visit', null, null, null, null, 'frozen_toilet');
  perform pg_temp.rl(v, 'visit', null, null, null, null, 'lava_square');

  -- Zonas vikingas: villa vikinga (sin nombre) + Costas Clasistas, cofres/munición
  v := pg_temp.mk(7, 'Registra cofres o cajas de munición en zonas vikingas', 'progress', 'count', 'any_match', 15, 'or');
  perform pg_temp.rl(v, 'search', null, null, 'chest',    null, 'viking_village');
  perform pg_temp.rl(v, 'search', null, null, 'ammo_box', null, 'viking_village');
  perform pg_temp.rl(v, 'search', null, null, 'chest',    null, 'snobby_shores');
  perform pg_temp.rl(v, 'search', null, null, 'ammo_box', null, 'snobby_shores');

  v := pg_temp.mk(7, 'Elimina oponentes en 3 lugares con nombre diferentes en la misma partida', 'progress', 'distinct_location', 'same_match', 3);
  perform pg_temp.rl(v, 'kill');

  -- Zonas piratas: cofres/munición en los 7 campamentos
  v := pg_temp.mk(7, 'Registra cofres o cajas de munición en campamentos piratas', 'progress', 'count', 'any_match', 15, 'or');
  perform pg_temp.rl(v, 'search', null, null, 'chest',    null, l.code)
  from locations l where l.code like 'pirate_camp_%';
  perform pg_temp.rl(v, 'search', null, null, 'ammo_box', null, l.code)
  from locations l where l.code like 'pirate_camp_%';

  -- ═══════════════════════════════ SEMANA 8 ═══════════════════════════════
  v := pg_temp.mk(8, 'Busca piezas de puzle debajo de puentes y en cuevas en una sola partida', 'progress', 'count', 'same_match', 14);
  perform pg_temp.rl(v, 'search', null, null, 'jigsaw_piece');

  v := pg_temp.mk(8, 'Gana una partida usando solo armas de máquinas expendedoras', 'progress', 'count', 'any_match', 1);
  r := pg_temp.rl(v, 'misc');
  perform pg_temp.cn(r, 'win_match', '🏆 Ganaste la partida');
  perform pg_temp.cn(r, 'only_vending_weapons', '🥤 Solo armas de máquina expendedora');

  v := pg_temp.mk(8, 'Sigue el letrero del mapa del tesoro de Palmeras Paradisíacas (2 veces en una sola partida)', 'progress', 'count', 'same_match', 2);
  perform pg_temp.rl(v, 'use', null, null, null, null, 'treasure_signpost_paradise');

  v := pg_temp.mk(8, 'Visita los teléfonos gigantes en la misma partida', 'progress', 'count', 'same_match', 2);
  perform pg_temp.rl(v, 'visit', null, null, null, null, 'giant_phone_durr');
  perform pg_temp.rl(v, 'visit', null, null, null, null, 'giant_phone_pizza');

  v := pg_temp.mk(8, 'Elimina oponentes usando al menos 3 globos', 'progress', 'count', 'any_match', 3);
  r := pg_temp.rl(v, 'kill');
  perform pg_temp.cn(r, 'while_balloon', '🎈 Usando globos');

  v := pg_temp.mk(8, 'Inflige daño de caída a un oponente usando granadas de impulso en diferentes partidas', 'progress', 'count', 'different_matches', 2);
  r := pg_temp.rl(v, 'damage', 'impulse_grenade');
  perform pg_temp.cn(r, 'fall_damage', '🪂 Daño de caída');

  v := pg_temp.mk(8, 'Elimina oponentes en zonas afectadas por el volcán', 'progress', 'count', 'any_match', 7);
  perform pg_temp.rl(v, 'kill', null, null, null, null, 'volcano_affected');

  -- ═══════════════════════════════ SEMANA 9 ═══════════════════════════════
  v := pg_temp.mk(9, 'Elimina oponentes desde abajo', 'progress', 'count', 'any_match', 3);
  r := pg_temp.rl(v, 'kill');
  perform pg_temp.cn(r, 'from_below', '⬇️ Desde abajo');

  v := pg_temp.mk(9, 'Elimina oponentes antes de que se cierre el primer círculo de la tormenta', 'progress', 'count', 'any_match', 5);
  r := pg_temp.rl(v, 'kill');
  perform pg_temp.cn(r, 'before_first_circle', '🌀 Antes del primer círculo');

  v := pg_temp.mk(9, 'Aterriza en una ubicación con nombre tras montar en 3 respiraderos volcánicos diferentes sin aterrizar', 'progress', 'count', 'any_match', 1);
  r := pg_temp.rl(v, 'misc');
  perform pg_temp.cn(r, 'named_landing_after_3_vents', '🌋 Aterrizaje con nombre tras 3 respiraderos');

  v := pg_temp.mk(9, 'Baila sobre 2 cabezas de tomate diferentes', 'progress', 'count', 'any_match', 2);
  perform pg_temp.rl(v, 'dance', null, null, null, null, 'tomato_head_durr');
  perform pg_temp.rl(v, 'dance', null, null, null, null, 'tomato_head_town');

  v := pg_temp.mk(9, 'Baila sobre un trono y sobre un puesto de vigilancia elevado en la misma partida', 'progress', 'count', 'same_match', 2);
  perform pg_temp.rl(v, 'dance', null, null, null, null, 'throne');
  perform pg_temp.rl(v, 'dance', null, null, null, null, 'watchtower');

  v := pg_temp.mk(9, 'Elimina a un oponente después de ser reanimado por una furgoneta de reinicio', 'progress', 'count', 'any_match', 1);
  r := pg_temp.rl(v, 'kill');
  perform pg_temp.cn(r, 'target_revived', '🔁 Reanimado por furgoneta de reinicio');

  v := pg_temp.mk(9, 'Elimina a oponentes en la misma partida', 'progress', 'count', 'same_match', 7);
  perform pg_temp.rl(v, 'kill');

  -- ═══════════════════════════════ SEMANA 10 ══════════════════════════════
  v := pg_temp.mk(10, 'Utiliza un cañón pirata en ubicaciones con nombre para llegar a campamentos piratas diferentes', 'progress', 'count', 'any_match', 3);
  r := pg_temp.rl(v, 'use', 'pirate_cannon');
  perform pg_temp.cn(r, 'cannon_named_to_camp', '🏴‍☠️ Desde ubicación con nombre a un campamento distinto');

  v := pg_temp.mk(10, 'Elimina un oponente en los 10 segundos posteriores a usar un respiradero volcánico', 'progress', 'count', 'any_match', 1);
  r := pg_temp.rl(v, 'kill');
  perform pg_temp.cn(r, 'after_volcano_vent', '🌋 En 10 s tras usar un respiradero');

  v := pg_temp.mk(10, 'Sigue el letrero del mapa del tesoro de Cruce Chatarra (2 veces en una sola partida)', 'progress', 'count', 'same_match', 2);
  perform pg_temp.rl(v, 'use', null, null, null, null, 'treasure_signpost_junk');

  v := pg_temp.mk(10, 'Elimina oponentes con un fusil de infantería y un fusil de asalto pesado en la misma partida', 'progress', 'count', 'same_match', 2);
  perform pg_temp.rl(v, 'kill', 'infantry_rifle');
  perform pg_temp.rl(v, 'kill', 'heavy_ar');

  v := pg_temp.mk(10, 'Recolecta 500 de cada material en la misma partida', 'progress', 'value', 'same_match', 500);
  perform pg_temp.rl(v, 'harvest', null, null, 'wood');
  perform pg_temp.rl(v, 'harvest', null, null, 'stone');
  perform pg_temp.rl(v, 'harvest', null, null, 'metal');

  v := pg_temp.mk(10, 'Usa bombas de sombra en diferentes partidas', 'progress', 'count', 'different_matches', 5);
  perform pg_temp.rl(v, 'use', 'shadow_bomb');

  v := pg_temp.mk(10, 'Destruye banderas piratas', 'progress', 'count', 'any_match', 15);
  perform pg_temp.rl(v, 'destroy', null, null, 'pirate_flag');
end $$;
