-- ============================================================
-- 07_i18n_weapons_phases.sql
--   * i18n: display_name queda en ESPAÑOL (lo que muestra la UI) y se añade
--     display_name_en con el nombre en inglés (nada se borra).
--   * Temporadas: "Temporada 8" + se registran 9 y 10 bloqueadas (is_locked).
--   * is_weapon en tags/objetos + requires_weapon en condiciones: las
--     condiciones de distancia/manera solo aplican a armas normales.
--   * Fases por partida: las líneas de fases requieren partida activa y la
--     siguiente fase solo se desbloquea al TERMINAR la partida en la que se
--     completó la anterior (challenges.completed_in_match).
--   * event_implications + visita implícita por lugar: dañar desde una
--     tirolina también cuenta como usar la tirolina; cualquier acción en un
--     lugar cuenta como visitarlo.
--   * Letreros del mapa del tesoro pasan a la categoría Consumir/Usar.
--   * undo_rule_event(): despresionar un botón de opción (quita ese registro).
-- ============================================================

-- 1. Columnas i18n
alter table public.game_objects   add column if not exists display_name_en text;
alter table public.tags           add column if not exists display_name_en text;
alter table public.locations      add column if not exists display_name_en text;
alter table public.action_types   add column if not exists display_name_en text;
alter table public.challenge_weeks add column if not exists display_name_en text;
alter table public.seasons        add column if not exists display_name_en text;
alter table public.seasons        add column if not exists is_locked boolean not null default false;

-- tags: el nombre actual es inglés → consérvalo y pon el español
update public.tags set display_name_en = coalesce(display_name_en, display_name);
update public.tags t set display_name = v.es from (values
  ('assault',   'Armas de asalto'),
  ('bow',       'Arcos'),
  ('consumable','Consumibles'),
  ('containers','Contenedores'),
  ('crossbow',  'Ballestas'),
  ('device',    'Dispositivos'),
  ('explosive', 'Armas explosivas'),
  ('foraged',   'Objetos del entorno'),
  ('marksman',  'Fusiles de tirador'),
  ('material',  'Materiales'),
  ('melee',     'Armas cuerpo a cuerpo'),
  ('pistol',    'Pistolas'),
  ('ranged',    'Consumibles a distancia'),
  ('rifle',     'Fusiles de asalto'),
  ('scoped',    'Armas con mira'),
  ('shotgun',   'Escopetas'),
  ('smg',       'Subfusiles'),
  ('sniper',    'Fusiles de francotirador'),
  ('suppresed', 'Armas con silenciador'),
  ('throwable', 'Objetos arrojadizos'),
  ('trap',      'Trampas'),
  ('utility',   'Objetos utilitarios'),
  ('vehicle',   'Vehículos')
) as v(code, es) where t.code = v.code;

-- objetos: el nombre actual es español → añade el inglés oficial
update public.game_objects o set display_name_en = v.en from (values
  ('ammo_box', 'Ammo Box'), ('apple', 'Apple'), ('balloon', 'Balloons'),
  ('big_telephone', 'Big Telephone'), ('boom_bow', 'Boom Bow'),
  ('bouncy_ball', 'Bouncy Ball'), ('buried_treasure', 'Buried Treasure'),
  ('cactus', 'Cactus'), ('campfire', 'Cozy Campfire'), ('chest', 'Chest'),
  ('dinosaur', 'Dinosaurs'), ('flintknock', 'Flint-Knock Pistol'),
  ('giant_face', 'Giant Face'), ('heavy_ar', 'Heavy Assault Rifle'),
  ('hot_spring', 'Hot Springs'), ('ice_sculpture', 'Ice Sculptures'),
  ('infantry_rifle', 'Infantry Rifle'), ('jigsaw_piece', 'Jigsaw Puzzle Piece'),
  ('medkit', 'Med Kit'), ('metal', 'Metal'), ('metal_llama', 'Metal Llama'),
  ('mushroom', 'Mushroom'), ('pickaxe', 'Pickaxe'),
  ('pirate_cannon', 'Pirate Cannon'), ('reboot_van', 'Reboot Van'),
  ('shield_potion', 'Shield Potion'), ('small_shield', 'Small Shield Potion'),
  ('stone', 'Stone'), ('stone_pig', 'Stone Pig'),
  ('supply_drop', 'Supply Drop'), ('the_baller', 'The Baller'),
  ('treasure_map_knife', 'Treasure Map Knife (loading screen)'),
  ('treasure_map_magnify', 'Treasure Map Magnifying Glass (loading screen)'),
  ('treasure_signpost', 'Treasure Map Signpost'),
  ('vending_machine', 'Vending Machine'), ('volcano_vent', 'Volcano Vent'),
  ('wood', 'Wood'), ('wooden_rabbit', 'Wooden Rabbit'), ('zipline', 'Zipline')
) as v(code, en) where o.code = v.code;
-- los que tenían nombre en inglés reciben su español oficial
update public.game_objects set display_name = 'Arco Bum' where code = 'boom_bow';
update public.game_objects set display_name = 'Pistola de pedernal' where code = 'flintknock';
update public.game_objects set display_name_en = coalesce(display_name_en, display_name);

-- acciones: español actual + inglés
update public.action_types a set display_name_en = v.en from (values
  ('damage', 'Damage'), ('dance', 'Dance'), ('destroy', 'Destroy'),
  ('gain', 'Gain'), ('harvest', 'Harvest'), ('kill', 'Eliminate'),
  ('land', 'Land'), ('outlast', 'Outlast Opponents'), ('revive', 'Revive'),
  ('search', 'Search'), ('use', 'Consume/Use'), ('visit', 'Visit')
) as v(code, en) where a.code = v.code;

-- lugares: español (latino) actual + inglés oficial
update public.locations l set display_name_en = v.en from (values
  ('desert', 'Desert'), ('jungle', 'Jungle'), ('snow', 'Snow'),
  ('dusty_divot', 'Dusty Divot'), ('east_point', 'Easternmost Point'),
  ('fatal_fields', 'Fatal Fields'), ('frosty_flights', 'Frosty Flights'),
  ('happy_hamlet', 'Happy Hamlet'), ('haunted_hills', 'Haunted Hills'),
  ('high_elevation', 'Highest Elevations'), ('junk_juction', 'Junk Junction'),
  ('lazy_lagoon', 'Lazy Lagoon'), ('lonely_lodge', 'Lonely Lodge'),
  ('loot_lake', 'Loot Lake'), ('lucky_landing', 'Lucky Landing'),
  ('north_point', 'Northernmost Point'), ('paradise_palms', 'Paradise Palms'),
  ('pleasant_park', 'Pleasant Park'), ('polar_peak', 'Polar Peak'),
  ('race_track', 'Happy Hamlet Race Track'), ('retail_row', 'Retail Row'),
  ('salty_springs', 'Salty Springs'), ('shifty_shafts', 'Shifty Shafts'),
  ('snobby_shores', 'Snobby Shores'), ('south_point', 'Southernmost Point'),
  ('sunny_steps', 'Sunny Steps'), ('the_block', 'The Block'),
  ('tilted_towers', 'Tilted Towers'), ('west_point', 'Westernmost Point'),
  ('pirate_camp_snow', 'Pirate Camp: Snow Biome'),
  ('pirate_camp_dusty', 'Pirate Camp near Fatal Fields'),
  ('pirate_camp_volcano', 'Pirate Camp near the Volcano'),
  ('pirate_camp_paradise', 'Pirate Camp near Paradise Palms'),
  ('pirate_camp_pleasant', 'Pirate Camp near Pleasant Park'),
  ('pirate_camp_crater', 'Pirate Camp near Dusty Divot'),
  ('pirate_camp_lagoon', 'Pirate Camp near Lazy Lagoon'),
  ('giant_face_desert', 'Desert Giant Face'),
  ('giant_face_jungle', 'Jungle Giant Face'),
  ('giant_face_snow', 'Snow Giant Face'),
  ('hot_spring', 'Hot Springs'), ('dinosaur', 'Dinosaurs'),
  ('ice_sculpture', 'Ice Sculptures'), ('wooden_rabbit', 'Wooden Rabbit'),
  ('stone_pig', 'Stone Pig'), ('metal_llama', 'Metal Llama'),
  ('treasure_signpost_paradise', 'Paradise Palms Treasure Signpost'),
  ('treasure_signpost_junk', 'Junk Junction Treasure Signpost')
) as v(code, en) where l.code = v.code;
update public.locations set display_name_en = coalesce(display_name_en, display_name);

-- semanas y temporadas
update public.challenge_weeks
set display_name_en = coalesce(display_name_en, 'Week ' || week_number),
    display_name = 'Semana ' || week_number;

update public.seasons
set display_name_en = coalesce(display_name_en, 'Season 8'),
    display_name = 'Temporada 8'
where code = 'season_8';

insert into public.seasons (code, display_name, display_name_en, is_locked)
select v.code, v.es, v.en, true
from (values
  ('season_9',  'Temporada 9',  'Season 9'),
  ('season_10', 'Temporada 10', 'Season 10')
) as v(code, es, en)
where not exists (select 1 from public.seasons s where s.code = v.code);

-- 2. Armas y condiciones que requieren arma
alter table public.tags add column if not exists is_weapon boolean not null default false;
alter table public.game_objects add column if not exists is_weapon boolean not null default false;
alter table public.rule_conditions add column if not exists requires_weapon boolean not null default false;

update public.tags set is_weapon = true where code in (
  'assault', 'bow', 'crossbow', 'explosive', 'marksman', 'pistol', 'rifle',
  'scoped', 'shotgun', 'smg', 'sniper', 'suppresed', 'throwable'
);
update public.game_objects set is_weapon = true where code in (
  'boom_bow', 'flintknock', 'heavy_ar', 'infantry_rifle'
);
-- condiciones de distancia/manera que solo un arma normal puede cumplir
update public.rule_conditions set requires_weapon = true where condition_key in (
  'min_50m', 'max_5m', 'from_above', 'from_below', 'headshot',
  'while_on_zipline', 'target_on_zipline', 'descending'
);

-- 3. Letreros del mapa del tesoro → Consumir/Usar
update public.challenge_rules cr
set action_type_id = (select id from public.action_types where code = 'use')
from public.locations l, public.action_types at
where l.id = cr.location_id
  and l.code in ('treasure_signpost_paradise', 'treasure_signpost_junk')
  and at.id = cr.action_type_id
  and at.code = 'visit';

-- 4. Fases por partida
alter table public.challenges
  add column if not exists completed_in_match uuid references public.matches(id) on delete set null;

create or replace function public.sync_challenge_completion()
returns trigger
language plpgsql
set search_path to 'public'
as $fn$
begin
  if new.kind = 'progress' then
    new.is_completed := new.current_value >= new.target_value;
  end if;

  -- registra en qué partida se completó (para el bloqueo de fases);
  -- end_active_match() lo limpia al terminar la partida
  if tg_op = 'UPDATE' then
    if new.is_completed and not old.is_completed then
      new.completed_in_match := (select id from matches where is_active = true limit 1);
    elsif old.is_completed and not new.is_completed then
      new.completed_in_match := null;
    end if;
  end if;

  return new;
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

  -- al terminar la partida se desbloquea la siguiente fase de cada línea
  update public.challenges
  set completed_in_match = null
  where completed_in_match is not null;
end;
$fn$;

-- 5. Implicaciones entre acciones
create table if not exists public.event_implications (
  id uuid primary key default gen_random_uuid(),
  trigger_action text not null,
  trigger_condition text,            -- null = siempre que coincida la acción
  implied_action text not null,
  implied_object_code text,          -- null = el mismo objeto/tag usado
  created_at timestamptz default now(),
  unique (trigger_action, trigger_condition, implied_action, implied_object_code)
);
alter table public.event_implications enable row level security;
drop policy if exists "Authenticated can read event_implications" on public.event_implications;
create policy "Authenticated can read event_implications"
  on public.event_implications for select to authenticated using (true);
grant select on public.event_implications to authenticated;

insert into public.event_implications (trigger_action, trigger_condition, implied_action, implied_object_code)
select * from (values
  ('damage', 'while_on_zipline',   'use', 'zipline'),
  ('damage', 'after_volcano_vent', 'use', 'volcano_vent'),
  ('damage', null,                 'use', null),  -- dañar con un objeto = usarlo
  ('kill',   null,                 'use', null)   -- eliminar con un objeto = usarlo
) as v(a, c, ia, io)
where not exists (
  select 1 from public.event_implications e
  where e.trigger_action = v.a
    and e.trigger_condition is not distinct from v.c
    and e.implied_action = v.ia
    and e.implied_object_code is not distinct from v.io
);

-- 6. Deshacer el registro de una opción (despresionar un botón)
create or replace function public.undo_rule_event(p_rule_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_ch record;
  v_match uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select c.id, c.match_scope, c.is_meta, c.target_value
  into v_ch
  from challenges c
  join challenge_rules cr on cr.challenge_id = c.id
  where cr.id = p_rule_id;

  if not found or v_ch.is_meta then
    return;
  end if;

  select id into v_match from matches where is_active = true limit 1;

  if v_ch.match_scope = 'any_match' then
    delete from match_rule_progress
    where challenge_rule_id = p_rule_id and match_id is null;

    update challenges
    set current_value = least(
      (select count(*) from match_rule_progress
       where challenge_id = v_ch.id and match_id is null),
      target_value)
    where id = v_ch.id;

  elsif v_ch.match_scope = 'same_match' then
    if v_match is null then return; end if;

    delete from match_rule_progress
    where challenge_rule_id = p_rule_id and match_id = v_match;

    update challenges
    set current_value = least(
      (select count(*) from match_rule_progress
       where challenge_id = v_ch.id and match_id = v_match),
      target_value)
    where id = v_ch.id;

  else -- different_matches: quita preferentemente el registro de la partida actual
    delete from match_rule_progress
    where id = (
      select id from match_rule_progress
      where challenge_rule_id = p_rule_id and match_id is not null
      order by (match_id is not distinct from v_match) desc
      limit 1
    );

    update challenges
    set current_value = least(
      (select count(distinct match_id) from match_rule_progress
       where challenge_id = v_ch.id and match_id is not null),
      target_value)
    where id = v_ch.id;
  end if;
end;
$fn$;

-- 7. RPCs manuales: las fases también exigen partida activa para AÑADIR
create or replace function public.toggle_challenge_completion(p_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select kind, is_meta, match_scope, is_completed, line_id
  into v
  from challenges
  where id = p_challenge_id;

  if not found or v.kind <> 'simple' or v.is_meta then
    return;
  end if;

  if not v.is_completed
     and (v.match_scope in ('same_match', 'different_matches') or v.line_id is not null)
     and not exists (select 1 from matches where is_active = true) then
    raise exception 'Requiere una partida activa';
  end if;

  update challenges
  set is_completed = not is_completed,
      current_value = case when is_completed then 0 else coalesce(target_value, 1) end
  where id = p_challenge_id;

  if v.is_completed then
    delete from match_rule_progress where challenge_id = p_challenge_id;
    delete from challenge_distinct_progress where challenge_id = p_challenge_id;
  end if;
end;
$fn$;

create or replace function public.increase_challenge_progress(p_challenge_id uuid, p_increase_value bigint)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select kind, is_meta, match_scope, line_id into v
  from challenges
  where id = p_challenge_id;

  if not found or v.kind <> 'progress' or v.is_meta then
    return;
  end if;

  if p_increase_value > 0
     and (v.match_scope in ('same_match', 'different_matches') or v.line_id is not null)
     and not exists (select 1 from matches where is_active = true) then
    raise exception 'Requiere una partida activa';
  end if;

  update challenges
  set current_value = greatest(0, least(coalesce(current_value, 0) + p_increase_value, target_value))
  where id = p_challenge_id;
end;
$fn$;

create or replace function public.update_challenge_progress(p_challenge_id uuid, p_current_value bigint)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select kind, is_meta, match_scope, current_value, line_id into v
  from challenges
  where id = p_challenge_id;

  if not found or v.kind <> 'progress' or v.is_meta then
    return;
  end if;

  if p_current_value > coalesce(v.current_value, 0)
     and (v.match_scope in ('same_match', 'different_matches') or v.line_id is not null)
     and not exists (select 1 from matches where is_active = true) then
    raise exception 'Requiere una partida activa';
  end if;

  update challenges
  set current_value = greatest(0, least(p_current_value, target_value))
  where id = p_challenge_id;

  if p_current_value <= 0 then
    delete from match_rule_progress where challenge_id = p_challenge_id;
    delete from challenge_distinct_progress where challenge_id = p_challenge_id;
  end if;
end;
$fn$;
