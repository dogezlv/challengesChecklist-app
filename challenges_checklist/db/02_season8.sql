-- ============================================================
-- 02_season8.sql — Catálogo + desafíos de Season 8 (semanas 1-10)
-- Idempotente: borra los challenges de Season 8 y los re-inserta.
-- Fuente: app/challenges.html (Fortnite wiki). Correcciones aplicadas:
--   * W7 tenía dos "Stage 3 of 3" -> fases 2 y 3
--   * W8 "Stage 2 of 5" -> fase 2 de 2
--   * W10 "Eliminate at Tilted/Block 0/300" -> 0/3 (errata del wiki)
--   * W10 letreros 0/100 -> 0/1 (errata del wiki)
-- ============================================================

-- ---------- Catálogo ----------
insert into public.action_types (code, display_name) values
  ('destroy', 'Destruir'),
  ('harvest', 'Recolectar'),
  ('outlast', 'Sobrevivir a oponentes'),
  ('revive', 'Reanimar')
on conflict (code) do nothing;

insert into public.locations (code, display_name, named_location) values
  ('desert', 'Desierto (bioma)', false),
  ('jungle', 'Jungla (bioma)', false),
  ('snow', 'Nieve (bioma)', false),
  ('pirate_camp', 'Campamento pirata', false),
  ('north_point', 'Punto más al norte', false),
  ('south_point', 'Punto más al sur', false),
  ('east_point', 'Punto más al este', false),
  ('west_point', 'Punto más al oeste', false),
  ('high_elevation', 'Elevación más alta', false),
  ('race_track', 'Pista de carreras (Villa Vivaracha)', false)
on conflict (code) do nothing;

insert into public.game_objects (code, display_name) values
  ('chest', 'Cofre'),
  ('ammo_box', 'Caja de munición'),
  ('supply_drop', 'Entrega de suministros'),
  ('volcano_vent', 'Respiradero volcánico'),
  ('zipline', 'Tirolina'),
  ('vending_machine', 'Máquina expendedora'),
  ('reboot_van', 'Furgoneta de reinicio'),
  ('campfire', 'Hoguera acogedora'),
  ('the_baller', 'The Baller'),
  ('pirate_cannon', 'Cañón pirata'),
  ('balloon', 'Globos'),
  ('bouncy_ball', 'Pelota saltarina'),
  ('boom_bow', 'Boom Bow'),
  ('infantry_rifle', 'Fusil de infantería'),
  ('heavy_ar', 'Fusil de asalto pesado'),
  ('pickaxe', 'Pico'),
  ('apple', 'Manzana'),
  ('mushroom', 'Seta'),
  ('small_shield', 'Poción de escudo pequeña'),
  ('shield_potion', 'Poción de escudo'),
  ('medkit', 'Botiquín'),
  ('wood', 'Madera'),
  ('stone', 'Piedra'),
  ('metal', 'Metal'),
  ('cactus', 'Cactus'),
  ('buried_treasure', 'Tesoro enterrado'),
  ('jigsaw_piece', 'Pieza de puzle'),
  ('treasure_signpost', 'Letrero del mapa del tesoro'),
  ('big_telephone', 'Teléfono gigante'),
  ('treasure_map_magnify', 'Lupa del mapa del tesoro (pantalla de carga)'),
  ('treasure_map_knife', 'Cuchillo del mapa del tesoro (pantalla de carga)'),
  ('ice_sculpture', 'Esculturas de hielo'),
  ('dinosaur', 'Dinosaurios'),
  ('hot_spring', 'Aguas termales'),
  ('giant_face', 'Cara gigante'),
  ('wooden_rabbit', 'Conejo de madera'),
  ('stone_pig', 'Cerdo de piedra'),
  ('metal_llama', 'Llama de metal')
on conflict (code) do nothing;

insert into public.game_object_tags (object_id, tag_id)
select o.id, t.id
from (values
  ('chest', 'containers'),
  ('ammo_box', 'containers'),
  ('supply_drop', 'containers'),
  ('volcano_vent', 'device'),
  ('zipline', 'device'),
  ('vending_machine', 'device'),
  ('reboot_van', 'device'),
  ('campfire', 'device'),
  ('the_baller', 'vehicle'),
  ('pirate_cannon', 'vehicle'),
  ('balloon', 'utility'),
  ('bouncy_ball', 'utility'),
  ('boom_bow', 'bow'),
  ('boom_bow', 'explosive'),
  ('infantry_rifle', 'rifle'),
  ('heavy_ar', 'rifle'),
  ('pickaxe', 'melee'),
  ('apple', 'foraged'),
  ('apple', 'consumable'),
  ('mushroom', 'foraged'),
  ('mushroom', 'consumable'),
  ('small_shield', 'consumable'),
  ('shield_potion', 'consumable'),
  ('medkit', 'consumable'),
  ('wood', 'material'),
  ('stone', 'material'),
  ('metal', 'material'),
  ('flintknock', 'pistol')
) v(obj, tag)
join public.game_objects o on o.code = v.obj
join public.tags t on t.code = v.tag
on conflict do nothing;

-- ---------- Helpers temporales ----------
create or replace function pg_temp.ch(
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
  where s.code = 'season_8' and w.week_number = p_week;

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

create or replace function pg_temp.rule(
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

create or replace function pg_temp.cond(p_rule uuid, p_key text, p_label text)
returns void
language sql as $h$
  insert into public.rule_conditions (challenge_rule_id, condition_key, condition_value)
  values (p_rule, p_key, p_label);
$h$;

-- ---------- Ingesta ----------
do $$
declare
  c uuid;
  r uuid;
begin
  -- Limpiar Season 8 (cascada borra rules, conditions y match_rule_progress)
  delete from public.challenges
  where week_id in (
    select w.id from public.challenge_weeks w
    join public.seasons s on s.id = w.season_id
    where s.code = 'season_8'
  );
  delete from public.challenge_lines l
  where not exists (select 1 from public.challenges ch where ch.line_id = l.id);
  delete from public.match_rule_progress;

  -- ================= SEMANA 1 =================
  c := pg_temp.ch(1, 'Visita todos los campamentos piratas', 'progress', 'count', 'any_match', 7);
  r := pg_temp.rule(c, 'visit', null, null, null, null, 'pirate_camp');

  c := pg_temp.ch(1, 'Registra cofres en Metrópoli Mercantil o Cruce Chatarra', 'progress', 'count', 'any_match', 7, 'or');
  r := pg_temp.rule(c, 'search', null, null, 'chest', null, 'retail_row');
  r := pg_temp.rule(c, 'search', null, null, 'chest', null, 'junk_juction');

  c := pg_temp.ch(1, 'Fase 1 de 3: Inflige daño con una escopeta y un arma explosiva en una sola partida', 'progress', 'count', 'same_match', 2, 'and', 'S8W1 — Daño con dos armas en una partida', 1);
  r := pg_temp.rule(c, 'damage', null, 'shotgun');
  r := pg_temp.rule(c, 'damage', null, 'explosive');

  c := pg_temp.ch(1, 'Fase 2 de 3: Inflige daño con una pistola y un fusil de asalto en una sola partida', 'progress', 'count', 'same_match', 2, 'and', 'S8W1 — Daño con dos armas en una partida', 2);
  r := pg_temp.rule(c, 'damage', null, 'pistol');
  r := pg_temp.rule(c, 'damage', null, 'rifle');

  c := pg_temp.ch(1, 'Fase 3 de 3: Inflige daño con un fusil de francotirador y un subfusil en una sola partida', 'progress', 'count', 'same_match', 2, 'and', 'S8W1 — Daño con dos armas en una partida', 3);
  r := pg_temp.rule(c, 'damage', null, 'sniper');
  r := pg_temp.rule(c, 'damage', null, 'smg');

  c := pg_temp.ch(1, 'Visita una cara gigante en el desierto, la jungla y la nieve', 'progress', 'count', 'any_match', 3, 'and');
  r := pg_temp.rule(c, 'visit', null, null, 'giant_face', null, 'desert');
  r := pg_temp.rule(c, 'visit', null, null, 'giant_face', null, 'jungle');
  r := pg_temp.rule(c, 'visit', null, null, 'giant_face', null, 'snow');

  c := pg_temp.ch(1, 'Usa un respiradero volcánico en diferentes partidas', 'progress', 'count', 'different_matches', 5);
  r := pg_temp.rule(c, 'use', 'volcano_vent');

  c := pg_temp.ch(1, 'Consigue una eliminación con escopeta, fusil de asalto y arma explosiva', 'progress', 'count', 'any_match', 3, 'and');
  r := pg_temp.rule(c, 'kill', null, 'shotgun');
  r := pg_temp.rule(c, 'kill', null, 'rifle');
  r := pg_temp.rule(c, 'kill', null, 'explosive');

  c := pg_temp.ch(1, 'Inflige daño a un vehículo conducido por un oponente', 'progress', 'value', 'any_match', 200);
  r := pg_temp.rule(c, 'damage', null, null, null, 'vehicle');
  perform pg_temp.cond(r, 'driven_by_opponent', 'Conducido por un rival');

  -- ================= SEMANA 2 =================
  c := pg_temp.ch(2, 'Fase 1 de 5: Aterriza en El Bloque', 'simple', 'count', 'any_match', 1, null, 'S8W2 — Aterriza en distintos lugares I', 1);
  r := pg_temp.rule(c, 'land', null, null, null, null, 'the_block');
  c := pg_temp.ch(2, 'Fase 2 de 5: Aterriza en Cráter Catastrófico', 'simple', 'count', 'any_match', 1, null, 'S8W2 — Aterriza en distintos lugares I', 2);
  r := pg_temp.rule(c, 'land', null, null, null, null, 'dusty_divot');
  c := pg_temp.ch(2, 'Fase 3 de 5: Aterriza en Pico Polar', 'simple', 'count', 'any_match', 1, null, 'S8W2 — Aterriza en distintos lugares I', 3);
  r := pg_temp.rule(c, 'land', null, null, null, null, 'polar_peak');
  c := pg_temp.ch(2, 'Fase 4 de 5: Aterriza en Costas Clasistas', 'simple', 'count', 'any_match', 1, null, 'S8W2 — Aterriza en distintos lugares I', 4);
  r := pg_temp.rule(c, 'land', null, null, null, null, 'snobby_shores');
  c := pg_temp.ch(2, 'Fase 5 de 5: Aterriza en Palmeras Paradisíacas', 'simple', 'count', 'any_match', 1, null, 'S8W2 — Aterriza en distintos lugares I', 5);
  r := pg_temp.rule(c, 'land', null, null, null, null, 'paradise_palms');

  c := pg_temp.ch(2, 'Inflige daño a entregas de suministros mientras descienden', 'progress', 'value', 'any_match', 200);
  r := pg_temp.rule(c, 'damage', null, null, 'supply_drop');
  perform pg_temp.cond(r, 'descending', 'Mientras desciende');

  c := pg_temp.ch(2, 'Consigue eliminaciones en Salpiconeros Salados o Lomas Lúgubres', 'progress', 'count', 'any_match', 3, 'or');
  r := pg_temp.rule(c, 'kill', null, null, null, null, 'salty_springs');
  r := pg_temp.rule(c, 'kill', null, null, null, null, 'haunted_hills');

  c := pg_temp.ch(2, 'Fase 1 de 3: Gana salud con manzanas', 'progress', 'value', 'any_match', 25, null, 'S8W2 — Recupera salud', 1);
  r := pg_temp.rule(c, 'gain', 'apple');
  c := pg_temp.ch(2, 'Fase 2 de 3: Gana salud con una hoguera acogedora', 'progress', 'value', 'any_match', 50, null, 'S8W2 — Recupera salud', 2);
  r := pg_temp.rule(c, 'gain', 'campfire');
  c := pg_temp.ch(2, 'Fase 3 de 3: Gana salud con un botiquín', 'progress', 'value', 'any_match', 50, null, 'S8W2 — Recupera salud', 3);
  r := pg_temp.rule(c, 'gain', 'medkit');

  c := pg_temp.ch(2, 'Visita los puntos más al norte, sur, este y oeste de la isla', 'progress', 'count', 'any_match', 4, 'and');
  r := pg_temp.rule(c, 'visit', null, null, null, null, 'north_point');
  r := pg_temp.rule(c, 'visit', null, null, null, null, 'south_point');
  r := pg_temp.rule(c, 'visit', null, null, null, null, 'east_point');
  r := pg_temp.rule(c, 'visit', null, null, null, null, 'west_point');

  c := pg_temp.ch(2, 'Inflige daño a oponentes con un cañón pirata', 'progress', 'value', 'any_match', 100);
  r := pg_temp.rule(c, 'damage', 'pirate_cannon');

  c := pg_temp.ch(2, 'Registra un cofre en 3 lugares con nombre diferentes en una sola partida', 'progress', 'count', 'same_match', 3);
  r := pg_temp.rule(c, 'search', null, null, 'chest');

  -- ================= SEMANA 3 =================
  c := pg_temp.ch(3, 'Fase 1 de 3: Visita Terreno Tormentoso y Salpiconeros Salados en una sola partida', 'progress', 'count', 'same_match', 2, 'and', 'S8W3 — Visita dos zonas en una partida', 1);
  r := pg_temp.rule(c, 'visit', null, null, null, null, 'fatal_fields');
  r := pg_temp.rule(c, 'visit', null, null, null, null, 'salty_springs');
  c := pg_temp.ch(3, 'Fase 2 de 3: Visita Lomas Lúgubres y Rascacielos Recortados en una sola partida', 'progress', 'count', 'same_match', 2, 'and', 'S8W3 — Visita dos zonas en una partida', 2);
  r := pg_temp.rule(c, 'visit', null, null, null, null, 'haunted_hills');
  r := pg_temp.rule(c, 'visit', null, null, null, null, 'tilted_towers');
  c := pg_temp.ch(3, 'Fase 3 de 3: Visita Aeroparque Ártico y Balsa Botín en una sola partida', 'progress', 'count', 'same_match', 2, 'and', 'S8W3 — Visita dos zonas en una partida', 3);
  r := pg_temp.rule(c, 'visit', null, null, null, null, 'frosty_flights');
  r := pg_temp.rule(c, 'visit', null, null, null, null, 'loot_lake');

  c := pg_temp.ch(3, 'Fase 1 de 3: Destruye cactus en el desierto', 'progress', 'count', 'any_match', 30, null, 'S8W3 — Busca en los biomas', 1);
  r := pg_temp.rule(c, 'destroy', null, null, 'cactus', null, 'desert');
  c := pg_temp.ch(3, 'Fase 2 de 3: Registra cajas de munición en el bioma nevado', 'progress', 'count', 'any_match', 7, null, 'S8W3 — Busca en los biomas', 2);
  r := pg_temp.rule(c, 'search', null, null, 'ammo_box', null, 'snow');
  c := pg_temp.ch(3, 'Fase 3 de 3: Registra cofres en la jungla', 'progress', 'count', 'any_match', 2, null, 'S8W3 — Busca en los biomas', 3);
  r := pg_temp.rule(c, 'search', null, null, 'chest', null, 'jungle');

  c := pg_temp.ch(3, 'Coloca 2 objetos de trampa diferentes en una sola partida', 'progress', 'count', 'same_match', 2);
  r := pg_temp.rule(c, 'use', null, 'trap');

  c := pg_temp.ch(3, 'Busca donde se posa la lupa en la pantalla de carga del mapa del tesoro', 'simple', 'count', 'any_match', 1);
  r := pg_temp.rule(c, 'search', null, null, 'treasure_map_magnify');

  c := pg_temp.ch(3, 'Registra cofres en Escalones Estivales o Terreno Tormentoso', 'progress', 'count', 'any_match', 7, 'or');
  r := pg_temp.rule(c, 'search', null, null, 'chest', null, 'sunny_steps');
  r := pg_temp.rule(c, 'search', null, null, 'chest', null, 'fatal_fields');

  c := pg_temp.ch(3, 'Inflige daño de disparos a la cabeza a oponentes', 'progress', 'value', 'any_match', 500);
  r := pg_temp.rule(c, 'damage');
  perform pg_temp.cond(r, 'headshot', 'Disparo a la cabeza');

  c := pg_temp.ch(3, 'Consigue eliminaciones con subfusil, pistola o fusil de francotirador', 'progress', 'count', 'any_match', 3, 'or');
  r := pg_temp.rule(c, 'kill', null, 'smg');
  r := pg_temp.rule(c, 'kill', null, 'pistol');
  r := pg_temp.rule(c, 'kill', null, 'sniper');

  -- ================= SEMANA 4 =================
  c := pg_temp.ch(4, 'Inflige daño con fusiles de francotirador a oponentes', 'progress', 'value', 'any_match', 500);
  r := pg_temp.rule(c, 'damage', null, 'sniper');

  c := pg_temp.ch(4, 'Fase 1 de 5: Aterriza en Rascacielos Recortados', 'simple', 'count', 'any_match', 1, null, 'S8W4 — Aterriza en distintos lugares II', 1);
  r := pg_temp.rule(c, 'land', null, null, null, null, 'tilted_towers');
  c := pg_temp.ch(4, 'Fase 2 de 5: Aterriza en Cruce Chatarra', 'simple', 'count', 'any_match', 1, null, 'S8W4 — Aterriza en distintos lugares II', 2);
  r := pg_temp.rule(c, 'land', null, null, null, null, 'junk_juction');
  c := pg_temp.ch(4, 'Fase 3 de 5: Aterriza en Metrópoli Mercantil', 'simple', 'count', 'any_match', 1, null, 'S8W4 — Aterriza en distintos lugares II', 3);
  r := pg_temp.rule(c, 'land', null, null, null, null, 'retail_row');
  c := pg_temp.ch(4, 'Fase 4 de 5: Aterriza en Villa Vivaracha', 'simple', 'count', 'any_match', 1, null, 'S8W4 — Aterriza en distintos lugares II', 4);
  r := pg_temp.rule(c, 'land', null, null, null, null, 'happy_hamlet');
  c := pg_temp.ch(4, 'Fase 5 de 5: Aterriza en Parque Placentero', 'simple', 'count', 'any_match', 1, null, 'S8W4 — Aterriza en distintos lugares II', 5);
  r := pg_temp.rule(c, 'land', null, null, null, null, 'pleasant_park');

  c := pg_temp.ch(4, 'Usa The Baller en diferentes partidas', 'progress', 'count', 'different_matches', 5);
  r := pg_temp.rule(c, 'use', 'the_baller');

  c := pg_temp.ch(4, 'Consigue una eliminación con un arma con mira y otra con un arma silenciada', 'progress', 'count', 'any_match', 2, 'and');
  r := pg_temp.rule(c, 'kill', null, 'scoped');
  r := pg_temp.rule(c, 'kill', null, 'suppresed');

  c := pg_temp.ch(4, 'Lánzate a través de estructuras con un cañón pirata', 'progress', 'count', 'any_match', 25);
  r := pg_temp.rule(c, 'use', 'pirate_cannon');
  perform pg_temp.cond(r, 'through_structure', 'A través de una estructura');

  c := pg_temp.ch(4, 'Busca tesoros enterrados', 'progress', 'count', 'any_match', 2);
  r := pg_temp.rule(c, 'search', null, null, 'buried_treasure');

  c := pg_temp.ch(4, 'Elimina oponentes en Villa Vivaracha o Parque Placentero', 'progress', 'count', 'any_match', 3, 'or');
  r := pg_temp.rule(c, 'kill', null, null, null, null, 'happy_hamlet');
  r := pg_temp.rule(c, 'kill', null, null, null, null, 'pleasant_park');

  c := pg_temp.ch(4, 'Fase 1 de 3: Sobrevive a 60 oponentes en una sola partida', 'progress', 'value', 'same_match', 60, null, 'S8W4 — Sobrevive a oponentes', 1);
  r := pg_temp.rule(c, 'outlast');
  c := pg_temp.ch(4, 'Fase 2 de 3: Sobrevive a 70 oponentes en una sola partida', 'progress', 'value', 'same_match', 70, null, 'S8W4 — Sobrevive a oponentes', 2);
  r := pg_temp.rule(c, 'outlast');
  c := pg_temp.ch(4, 'Fase 3 de 3: Sobrevive a 80 oponentes en una sola partida', 'progress', 'value', 'same_match', 80, null, 'S8W4 — Sobrevive a oponentes', 3);
  r := pg_temp.rule(c, 'outlast');

  -- ================= SEMANA 5 =================
  c := pg_temp.ch(5, 'Inflige daño con armas con mira a oponentes', 'progress', 'value', 'any_match', 200);
  r := pg_temp.rule(c, 'damage', null, 'scoped');

  c := pg_temp.ch(5, 'Registra cofres en Palmeras Paradisíacas o Conductos Cambiantes', 'progress', 'count', 'any_match', 7, 'or');
  r := pg_temp.rule(c, 'search', null, null, 'chest', null, 'paradise_palms');
  r := pg_temp.rule(c, 'search', null, null, 'chest', null, 'shifty_shafts');

  c := pg_temp.ch(5, 'Completa una vuelta a la pista de carreras de Villa Vivaracha', 'simple', 'count', 'any_match', 1);
  r := pg_temp.rule(c, 'visit', null, null, null, null, 'race_track');

  c := pg_temp.ch(5, 'Consigue 15 botes en un solo lanzamiento con la pelota saltarina', 'simple', 'count', 'any_match', 1);
  r := pg_temp.rule(c, 'use', 'bouncy_ball');
  perform pg_temp.cond(r, 'bounces_15', '15 botes en un solo lanzamiento');

  c := pg_temp.ch(5, 'Fase 1 de 3: Gana escudo con setas', 'progress', 'value', 'any_match', 50, null, 'S8W5 — Recupera escudo', 1);
  r := pg_temp.rule(c, 'gain', 'mushroom');
  c := pg_temp.ch(5, 'Fase 2 de 3: Gana escudo con pociones de escudo pequeñas', 'progress', 'value', 'any_match', 100, null, 'S8W5 — Recupera escudo', 2);
  r := pg_temp.rule(c, 'gain', 'small_shield');
  c := pg_temp.ch(5, 'Fase 3 de 3: Gana escudo con pociones de escudo', 'progress', 'value', 'any_match', 100, null, 'S8W5 — Recupera escudo', 3);
  r := pg_temp.rule(c, 'gain', 'shield_potion');

  c := pg_temp.ch(5, 'Usa un respiradero volcánico, una tirolina y un vehículo en la misma partida', 'progress', 'count', 'same_match', 3, 'and');
  r := pg_temp.rule(c, 'use', 'volcano_vent');
  r := pg_temp.rule(c, 'use', 'zipline');
  r := pg_temp.rule(c, 'use', null, 'vehicle');

  c := pg_temp.ch(5, 'Elimina oponentes en campamentos piratas', 'progress', 'count', 'any_match', 3);
  r := pg_temp.rule(c, 'kill', null, null, null, null, 'pirate_camp');
  -- nota: el wiki listaba "eliminaciones en las plataformas del cielo" en W5,
  -- pero las plataformas del cielo son de la Temporada 9; se omite.

  -- ================= SEMANA 6 =================
  c := pg_temp.ch(6, 'Visita un conejo de madera, un cerdo de piedra y una llama de metal', 'progress', 'count', 'any_match', 3, 'and');
  r := pg_temp.rule(c, 'visit', null, null, 'wooden_rabbit');
  r := pg_temp.rule(c, 'visit', null, null, 'stone_pig');
  r := pg_temp.rule(c, 'visit', null, null, 'metal_llama');

  c := pg_temp.ch(6, 'Visita las elevaciones más altas de la isla', 'progress', 'count', 'any_match', 5);
  r := pg_temp.rule(c, 'visit', null, null, null, null, 'high_elevation');

  c := pg_temp.ch(6, 'Elimina oponentes en Laguna Fortuna o Aeroparque Ártico', 'progress', 'count', 'any_match', 3, 'or');
  r := pg_temp.rule(c, 'kill', null, null, null, null, 'lazy_lagoon');
  r := pg_temp.rule(c, 'kill', null, null, null, null, 'frosty_flights');

  c := pg_temp.ch(6, 'Fase 1 de 5: Aterriza en Terreno Tormentoso', 'simple', 'count', 'any_match', 1, null, 'S8W6 — Aterriza en distintos lugares III', 1);
  r := pg_temp.rule(c, 'land', null, null, null, null, 'fatal_fields');
  c := pg_temp.ch(6, 'Fase 2 de 5: Aterriza en Laguna Fortuna', 'simple', 'count', 'any_match', 1, null, 'S8W6 — Aterriza en distintos lugares III', 2);
  r := pg_temp.rule(c, 'land', null, null, null, null, 'lazy_lagoon');
  c := pg_temp.ch(6, 'Fase 3 de 5: Aterriza en Conductos Cambiantes', 'simple', 'count', 'any_match', 1, null, 'S8W6 — Aterriza en distintos lugares III', 3);
  r := pg_temp.rule(c, 'land', null, null, null, null, 'shifty_shafts');
  c := pg_temp.ch(6, 'Fase 4 de 5: Aterriza en Aeroparque Ártico', 'simple', 'count', 'any_match', 1, null, 'S8W6 — Aterriza en distintos lugares III', 4);
  r := pg_temp.rule(c, 'land', null, null, null, null, 'frosty_flights');
  c := pg_temp.ch(6, 'Fase 5 de 5: Aterriza en Escalones Estivales', 'simple', 'count', 'any_match', 1, null, 'S8W6 — Aterriza en distintos lugares III', 5);
  r := pg_temp.rule(c, 'land', null, null, null, null, 'sunny_steps');

  c := pg_temp.ch(6, 'Busca donde apunta el cuchillo en la pantalla de carga del mapa del tesoro', 'simple', 'count', 'any_match', 1);
  r := pg_temp.rule(c, 'search', null, null, 'treasure_map_knife');

  -- simple: cualquier regla que coincida lo completa (la BD prohíbe rules_operator en kind=simple)
  c := pg_temp.ch(6, 'Consigue una eliminación con una Flint-Knock o un Boom Bow', 'simple', 'count', 'any_match', 1);
  r := pg_temp.rule(c, 'kill', 'flintknock');
  r := pg_temp.rule(c, 'kill', 'boom_bow');

  c := pg_temp.ch(6, 'Usa 2 objetos arrojadizos diferentes en una sola partida', 'progress', 'count', 'same_match', 2);
  r := pg_temp.rule(c, 'use', null, 'throwable');

  -- ================= SEMANA 7 =================
  c := pg_temp.ch(7, 'Inflige daño con el pico a oponentes', 'progress', 'value', 'any_match', 100);
  r := pg_temp.rule(c, 'damage', 'pickaxe');

  c := pg_temp.ch(7, 'Fase 1 de 3: Visita Cruce Chatarra y El Bloque en una sola partida', 'progress', 'count', 'same_match', 2, 'and', 'S8W7 — Visita dos zonas en una partida II', 1);
  r := pg_temp.rule(c, 'visit', null, null, null, null, 'junk_juction');
  r := pg_temp.rule(c, 'visit', null, null, null, null, 'the_block');
  c := pg_temp.ch(7, 'Fase 2 de 3: Visita Parque Placentero y Cráter Catastrófico en una sola partida', 'progress', 'count', 'same_match', 2, 'and', 'S8W7 — Visita dos zonas en una partida II', 2);
  r := pg_temp.rule(c, 'visit', null, null, null, null, 'pleasant_park');
  r := pg_temp.rule(c, 'visit', null, null, null, null, 'dusty_divot');
  c := pg_temp.ch(7, 'Fase 3 de 3: Visita Villa Vivaracha y Costas Clasistas en una sola partida', 'progress', 'count', 'same_match', 2, 'and', 'S8W7 — Visita dos zonas en una partida II', 3);
  r := pg_temp.rule(c, 'visit', null, null, null, null, 'happy_hamlet');
  r := pg_temp.rule(c, 'visit', null, null, null, null, 'snobby_shores');

  c := pg_temp.ch(7, 'Visita campamentos piratas en una sola partida', 'progress', 'count', 'same_match', 3);
  r := pg_temp.rule(c, 'visit', null, null, null, null, 'pirate_camp');

  c := pg_temp.ch(7, 'Inflige daño a jugadores desde arriba', 'progress', 'value', 'any_match', 500);
  r := pg_temp.rule(c, 'damage');
  perform pg_temp.cond(r, 'from_above', 'Desde arriba');

  c := pg_temp.ch(7, 'Registra cofres en Balsa Botín o Costas Clasistas', 'progress', 'count', 'any_match', 7, 'or');
  r := pg_temp.rule(c, 'search', null, null, 'chest', null, 'loot_lake');
  r := pg_temp.rule(c, 'search', null, null, 'chest', null, 'snobby_shores');

  c := pg_temp.ch(7, 'Fase 1 de 2: Inflige daño a un oponente mientras montas en una tirolina', 'simple', 'count', 'any_match', 1, null, 'S8W7 — Daño y tirolinas', 1);
  r := pg_temp.rule(c, 'damage');
  perform pg_temp.cond(r, 'while_on_zipline', 'Montando en tirolina');
  c := pg_temp.ch(7, 'Fase 2 de 2: Inflige daño a un oponente que monta en una tirolina', 'simple', 'count', 'any_match', 1, null, 'S8W7 — Daño y tirolinas', 2);
  r := pg_temp.rule(c, 'damage');
  perform pg_temp.cond(r, 'target_on_zipline', 'El objetivo monta en tirolina');

  c := pg_temp.ch(7, 'Elimina oponentes en 5 lugares con nombre diferentes', 'progress', 'count', 'any_match', 5);
  r := pg_temp.rule(c, 'kill');

  -- ================= SEMANA 8 =================
  c := pg_temp.ch(8, 'Fase 1 de 2: Busca el letrero del mapa del tesoro en Palmeras Paradisíacas', 'simple', 'count', 'any_match', 1, null, 'S8W8 — Tesoro de Palmeras Paradisíacas', 1);
  r := pg_temp.rule(c, 'search', null, null, 'treasure_signpost', null, 'paradise_palms');
  c := pg_temp.ch(8, 'Fase 2 de 2: Sigue el letrero del mapa del tesoro de Palmeras Paradisíacas', 'simple', 'count', 'any_match', 1, null, 'S8W8 — Tesoro de Palmeras Paradisíacas', 2);
  r := pg_temp.rule(c, 'visit', null, null, 'treasure_signpost', null, 'paradise_palms');

  c := pg_temp.ch(8, 'Usa máquinas expendedoras en diferentes partidas', 'progress', 'count', 'different_matches', 3);
  r := pg_temp.rule(c, 'use', 'vending_machine');

  c := pg_temp.ch(8, 'Inflige daño a oponentes usando al menos un globo', 'progress', 'value', 'any_match', 100);
  r := pg_temp.rule(c, 'damage');
  perform pg_temp.cond(r, 'while_balloon', 'Usando al menos un globo');

  c := pg_temp.ch(8, 'Busca piezas de puzle debajo de puentes y en cuevas', 'progress', 'count', 'any_match', 7);
  r := pg_temp.rule(c, 'search', null, null, 'jigsaw_piece');

  c := pg_temp.ch(8, 'Fase 1 de 2: Marca el número de Durr Burger en el teléfono gigante al oeste de Terreno Tormentoso', 'simple', 'count', 'any_match', 1, null, 'S8W8 — Teléfonos gigantes', 1);
  r := pg_temp.rule(c, 'use', 'big_telephone');
  perform pg_temp.cond(r, 'dial_durr_burger', 'Número de Durr Burger (oeste de Terreno Tormentoso)');
  c := pg_temp.ch(8, 'Fase 2 de 2: Marca el número de Pizza Pit en el teléfono gigante al este de El Bloque', 'simple', 'count', 'any_match', 1, null, 'S8W8 — Teléfonos gigantes', 2);
  r := pg_temp.rule(c, 'use', 'big_telephone');
  perform pg_temp.cond(r, 'dial_pizza_pit', 'Número de Pizza Pit (este de El Bloque)');

  c := pg_temp.ch(8, 'Elimina oponentes en Cráter Catastrófico o Aterrizaje Afortunado', 'progress', 'count', 'any_match', 7, 'or');
  r := pg_temp.rule(c, 'kill', null, null, null, null, 'dusty_divot');
  r := pg_temp.rule(c, 'kill', null, null, null, null, 'lucky_landing');

  c := pg_temp.ch(8, 'Elimina oponentes a al menos 50 m de distancia', 'progress', 'count', 'any_match', 2);
  r := pg_temp.rule(c, 'kill');
  perform pg_temp.cond(r, 'min_50m', 'A 50 m o más');

  -- ================= SEMANA 9 =================
  c := pg_temp.ch(9, 'Fase 1 de 5: Aterriza en Balsa Botín', 'simple', 'count', 'any_match', 1, null, 'S8W9 — Aterriza en distintos lugares IV', 1);
  r := pg_temp.rule(c, 'land', null, null, null, null, 'loot_lake');
  c := pg_temp.ch(9, 'Fase 2 de 5: Aterriza en Aterrizaje Afortunado', 'simple', 'count', 'any_match', 1, null, 'S8W9 — Aterriza en distintos lugares IV', 2);
  r := pg_temp.rule(c, 'land', null, null, null, null, 'lucky_landing');
  c := pg_temp.ch(9, 'Fase 3 de 5: Aterriza en Salpiconeros Salados', 'simple', 'count', 'any_match', 1, null, 'S8W9 — Aterriza en distintos lugares IV', 3);
  r := pg_temp.rule(c, 'land', null, null, null, null, 'salty_springs');
  c := pg_temp.ch(9, 'Fase 4 de 5: Aterriza en Casas Cabañiles', 'simple', 'count', 'any_match', 1, null, 'S8W9 — Aterriza en distintos lugares IV', 4);
  r := pg_temp.rule(c, 'land', null, null, null, null, 'lonely_lodge');
  c := pg_temp.ch(9, 'Fase 5 de 5: Aterriza en Lomas Lúgubres', 'simple', 'count', 'any_match', 1, null, 'S8W9 — Aterriza en distintos lugares IV', 5);
  r := pg_temp.rule(c, 'land', null, null, null, null, 'haunted_hills');

  c := pg_temp.ch(9, 'Registra cofres en Pico Polar o Casas Cabañiles', 'progress', 'count', 'any_match', 7, 'or');
  r := pg_temp.rule(c, 'search', null, null, 'chest', null, 'polar_peak');
  r := pg_temp.rule(c, 'search', null, null, 'chest', null, 'lonely_lodge');

  c := pg_temp.ch(9, 'Monta en 3 respiraderos volcánicos diferentes sin aterrizar', 'simple', 'count', 'any_match', 1);
  r := pg_temp.rule(c, 'use', 'volcano_vent');
  perform pg_temp.cond(r, 'three_vents_no_landing', '3 respiraderos diferentes sin aterrizar');

  c := pg_temp.ch(9, 'Fase 1 de 3: Baila entre tres esculturas de hielo', 'simple', 'count', 'any_match', 1, null, 'S8W9 — Baila entre monumentos', 1);
  r := pg_temp.rule(c, 'dance', null, null, 'ice_sculpture');
  c := pg_temp.ch(9, 'Fase 2 de 3: Baila entre tres dinosaurios', 'simple', 'count', 'any_match', 1, null, 'S8W9 — Baila entre monumentos', 2);
  r := pg_temp.rule(c, 'dance', null, null, 'dinosaur');
  c := pg_temp.ch(9, 'Fase 3 de 3: Baila entre cuatro aguas termales', 'simple', 'count', 'any_match', 1, null, 'S8W9 — Baila entre monumentos', 3);
  r := pg_temp.rule(c, 'dance', null, null, 'hot_spring');

  c := pg_temp.ch(9, 'Inflige daño a oponentes desde abajo', 'progress', 'value', 'any_match', 500);
  r := pg_temp.rule(c, 'damage');
  perform pg_temp.cond(r, 'from_below', 'Desde abajo');

  c := pg_temp.ch(9, 'Reanima a un compañero en una furgoneta de reinicio', 'simple', 'count', 'any_match', 1);
  r := pg_temp.rule(c, 'revive', 'reboot_van');

  c := pg_temp.ch(9, 'Elimina a un oponente en diferentes partidas', 'progress', 'count', 'different_matches', 5);
  r := pg_temp.rule(c, 'kill');

  -- ================= SEMANA 10 =================
  c := pg_temp.ch(10, 'Lánzate a través de los aros en llamas con un cañón pirata', 'progress', 'count', 'any_match', 3);
  r := pg_temp.rule(c, 'use', 'pirate_cannon');
  perform pg_temp.cond(r, 'flaming_hoop', 'A través de un aro en llamas');

  c := pg_temp.ch(10, 'Fase 1 de 3: Recolecta 500 de madera en una sola partida', 'progress', 'value', 'same_match', 500, null, 'S8W10 — Recolecta materiales en una partida', 1);
  r := pg_temp.rule(c, 'harvest', null, null, 'wood');
  c := pg_temp.ch(10, 'Fase 2 de 3: Recolecta 400 de piedra en una sola partida', 'progress', 'value', 'same_match', 400, null, 'S8W10 — Recolecta materiales en una partida', 2);
  r := pg_temp.rule(c, 'harvest', null, null, 'stone');
  c := pg_temp.ch(10, 'Fase 3 de 3: Recolecta 300 de metal en una sola partida', 'progress', 'value', 'same_match', 300, null, 'S8W10 — Recolecta materiales en una partida', 3);
  r := pg_temp.rule(c, 'harvest', null, null, 'metal');

  c := pg_temp.ch(10, 'Elimina oponentes en Rascacielos Recortados o El Bloque', 'progress', 'count', 'any_match', 3, 'or');
  r := pg_temp.rule(c, 'kill', null, null, null, null, 'tilted_towers');
  r := pg_temp.rule(c, 'kill', null, null, null, null, 'the_block');

  c := pg_temp.ch(10, 'Inflige daño con un fusil de infantería o un fusil de asalto pesado', 'progress', 'value', 'any_match', 500, 'or');
  r := pg_temp.rule(c, 'damage', 'infantry_rifle');
  r := pg_temp.rule(c, 'damage', 'heavy_ar');

  c := pg_temp.ch(10, 'Fase 1 de 2: Busca el letrero del mapa del tesoro en Cruce Chatarra', 'simple', 'count', 'any_match', 1, null, 'S8W10 — Tesoro de Cruce Chatarra', 1);
  r := pg_temp.rule(c, 'search', null, null, 'treasure_signpost', null, 'junk_juction');
  c := pg_temp.ch(10, 'Fase 2 de 2: Sigue el letrero del mapa del tesoro de Cruce Chatarra', 'simple', 'count', 'any_match', 1, null, 'S8W10 — Tesoro de Cruce Chatarra', 2);
  r := pg_temp.rule(c, 'visit', null, null, 'treasure_signpost', null, 'junk_juction');

  c := pg_temp.ch(10, 'Inflige daño en los 10 segundos posteriores a usar un respiradero volcánico', 'progress', 'value', 'any_match', 100);
  r := pg_temp.rule(c, 'damage');
  perform pg_temp.cond(r, 'after_volcano_vent', 'En los 10 s tras usar un respiradero volcánico');

  c := pg_temp.ch(10, 'Elimina oponentes a menos de 5 m de distancia', 'progress', 'count', 'any_match', 2);
  r := pg_temp.rule(c, 'kill');
  perform pg_temp.cond(r, 'max_5m', 'A menos de 5 m');
end $$;

drop function pg_temp.ch(int, text, challenge_kind, text, match_scope, bigint, rule_group_operator, text, int);
drop function pg_temp.rule(uuid, text, text, text, text, text, text);
drop function pg_temp.cond(uuid, text, text);
