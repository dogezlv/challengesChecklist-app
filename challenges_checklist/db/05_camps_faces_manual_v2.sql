-- ============================================================
-- 05_camps_faces_manual_v2.sql
--   * Campamentos piratas: de 1 location genérica a 7 lugares separados.
--     - "Visita todos los campamentos piratas" → 7 reglas AND (cada
--       campamento cuenta una vez, acumulador global del motor).
--     - "Elimina oponentes en campamentos piratas" → 7 reglas OR
--       (cualquier campamento suma).
--     - "Visita campamentos piratas en una sola partida" → 7 reglas
--       same_match (cada campamento cuenta una vez por partida).
--   * Caras gigantes: cada cara es su propio lugar (desierto/jungla/nieve)
--     en vez de objeto giant_face + bioma.
--   * RPCs manuales v2:
--     - toggle: arregla current_value (0/1 visual), descompletar no exige
--       partida activa y limpia acumuladores.
--     - increase/update: la partida activa solo se exige para AUMENTAR;
--       quitar progreso siempre se permite. Llegar a 0 limpia acumuladores.
--     - reset_challenge_progress: nuevo botón "quitar progreso /
--       descompletar" (pone 0, descompleta y limpia acumuladores).
-- ============================================================

-- 1. Lugares nuevos (no son "lugares con nombre" del mapa: no deben contar
--    para desafíos de lugares con nombre diferentes)
insert into public.locations (code, display_name, named_location)
select v.code, v.display_name, false
from (values
  ('pirate_camp_snow',     'Campamento pirata: bioma de nieve'),
  ('pirate_camp_dusty',    'Campamento pirata: cerca de Terreno Tormentoso'),
  ('pirate_camp_volcano',  'Campamento pirata: cerca del volcán'),
  ('pirate_camp_paradise', 'Campamento pirata: cerca de Palmeras Paradisíacas'),
  ('pirate_camp_pleasant', 'Campamento pirata: cerca de Parque Placentero'),
  ('pirate_camp_crater',   'Campamento pirata: cerca de Cráter Catastrófico'),
  ('pirate_camp_lagoon',   'Campamento pirata: cerca de Laguna Fortuna'),
  ('giant_face_desert',    'Cara gigante del desierto'),
  ('giant_face_jungle',    'Cara gigante de la jungla'),
  ('giant_face_snow',      'Cara gigante de la nieve')
) as v(code, display_name)
where not exists (select 1 from public.locations l where l.code = v.code);

-- 2. Caras gigantes: la regla pasa de (visit + objeto giant_face + bioma)
--    a (visit + lugar cara-gigante-X)
do $$
declare
  p text[];
begin
  foreach p slice 1 in array array[
    ['desert', 'giant_face_desert'],
    ['jungle', 'giant_face_jungle'],
    ['snow',   'giant_face_snow']
  ]
  loop
    update public.challenge_rules cr
    set location_id = (select id from public.locations where code = p[2]),
        target_object_id = null
    from public.locations old_l, public.game_objects go
    where old_l.id = cr.location_id
      and old_l.code = p[1]
      and go.id = cr.target_object_id
      and go.code = 'giant_face';
  end loop;
end $$;

-- 3. Campamentos piratas: 7 lugares, reglas nuevas por desafío
do $$
declare
  v_old uuid;
  v_visit uuid;
  v_kill uuid;
  v_ch_all uuid;
  v_ch_kill uuid;
  v_ch_same uuid;
  v_loc uuid;
  c text;
begin
  select id into v_old from public.locations where code = 'pirate_camp';
  if v_old is null then
    return; -- ya migrado
  end if;

  select id into v_visit from public.action_types where code = 'visit';
  select id into v_kill from public.action_types where code = 'kill';

  select id into v_ch_all from public.challenges
    where description = 'Visita todos los campamentos piratas';
  select id into v_ch_kill from public.challenges
    where description = 'Elimina oponentes en campamentos piratas';
  select id into v_ch_same from public.challenges
    where description = 'Visita campamentos piratas en una sola partida';

  delete from public.challenge_rules where location_id = v_old;

  foreach c in array array[
    'pirate_camp_snow', 'pirate_camp_dusty', 'pirate_camp_volcano',
    'pirate_camp_paradise', 'pirate_camp_pleasant', 'pirate_camp_crater',
    'pirate_camp_lagoon'
  ]
  loop
    select id into v_loc from public.locations where code = c;
    insert into public.challenge_rules (challenge_id, action_type_id, location_id)
    values
      (v_ch_all, v_visit, v_loc),
      (v_ch_kill, v_kill, v_loc),
      (v_ch_same, v_visit, v_loc);
  end loop;

  -- AND: cada campamento cuenta una sola vez (acumulador global del motor)
  update public.challenges set rules_operator = 'and' where id = v_ch_all;
  -- OR: cualquier campamento suma / cuenta una vez por partida (same_match)
  update public.challenges set rules_operator = 'or'
  where id in (v_ch_kill, v_ch_same);

  delete from public.locations where id = v_old;
end $$;

-- 4. RPCs manuales v2
drop function if exists public.assert_manual_update_allowed(uuid);

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

  select kind, is_meta, match_scope, is_completed
  into v
  from challenges
  where id = p_challenge_id;

  if not found or v.kind <> 'simple' or v.is_meta then
    return;
  end if;

  -- completar exige partida activa en desafíos de partida; descompletar no
  if not v.is_completed
     and v.match_scope in ('same_match', 'different_matches')
     and not exists (select 1 from matches where is_active = true) then
    raise exception 'Requiere una partida activa';
  end if;

  update challenges
  set is_completed = not is_completed,
      current_value = case when is_completed then 0 else coalesce(target_value, 1) end
  where id = p_challenge_id;

  if v.is_completed then -- se descompletó: limpia acumuladores
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

  select kind, is_meta, match_scope into v
  from challenges
  where id = p_challenge_id;

  if not found or v.kind <> 'progress' or v.is_meta then
    return;
  end if;

  -- solo aumentar exige partida activa
  if p_increase_value > 0
     and v.match_scope in ('same_match', 'different_matches')
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

  select kind, is_meta, match_scope, current_value into v
  from challenges
  where id = p_challenge_id;

  if not found or v.kind <> 'progress' or v.is_meta then
    return;
  end if;

  -- solo aumentar exige partida activa; bajar el progreso siempre se puede
  if p_current_value > coalesce(v.current_value, 0)
     and v.match_scope in ('same_match', 'different_matches')
     and not exists (select 1 from matches where is_active = true) then
    raise exception 'Requiere una partida activa';
  end if;

  update challenges
  set current_value = greatest(0, least(p_current_value, target_value))
  where id = p_challenge_id;

  if p_current_value <= 0 then -- volver a 0 limpia acumuladores
    delete from match_rule_progress where challenge_id = p_challenge_id;
    delete from challenge_distinct_progress where challenge_id = p_challenge_id;
  end if;
end;
$fn$;

-- Botón "quitar progreso / descompletar": pone 0, descompleta y limpia
-- acumuladores. No exige partida activa (es una corrección).
create or replace function public.reset_challenge_progress(p_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update challenges
  set current_value = 0,
      is_completed = false
  where id = p_challenge_id
    and is_meta = false;

  delete from match_rule_progress where challenge_id = p_challenge_id;
  delete from challenge_distinct_progress where challenge_id = p_challenge_id;
end;
$fn$;
