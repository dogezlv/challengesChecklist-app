-- ============================================================
-- 49_s9_w3_challenges.sql — Semana 9 T3: desafíos oficiales corregidos
-- Idempotente: borra normales S9 W3 y re-inserta.
-- ============================================================

create or replace function pg_temp.s9_w3() returns uuid
language sql as $$
  select w.id from public.challenge_weeks w
  join public.seasons s on s.id = w.season_id
  where s.code = 'season_9' and w.week_number = 3
$$;

create or replace function pg_temp.ch9w3(
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
  select pg_temp.s9_w3() into strict v_week_id;

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

create or replace function pg_temp.rl9w3(
  p_ch uuid,
  p_action text,
  p_uobj text default null,
  p_utag text default null,
  p_tobj text default null,
  p_ttag text default null,
  p_loc text default null
) returns uuid
language plpgsql as $h$
declare v_id uuid;
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
  return v_id;
end;
$h$;

create or replace function pg_temp.cn9w3(p_rule uuid, p_key text, p_label text)
returns void language sql as $h$
  insert into public.rule_conditions (challenge_rule_id, condition_key, condition_value)
  values (p_rule, p_key, p_label);
$h$;

do $$
declare
  c uuid;
  r uuid;
begin
  if pg_temp.s9_w3() is null then
    raise exception 'season_9 week 3 not found';
  end if;

  delete from public.challenges
  where week_id = pg_temp.s9_w3()
    and not is_meta;

  -- Gratis
  c := pg_temp.ch9w3('Fase 1 de 3: Haz un truco con una patineta', 'simple', 'count', 'any_match', 1, null, 'S9W3 — Trucos con vehículos', 1);
  r := pg_temp.rl9w3(c, 'use', 'driftboard');
  perform pg_temp.cn9w3(r, 'driftboard_trick', 'Truco con patineta');

  c := pg_temp.ch9w3('Fase 2 de 3: Consigue 3 s de vuelo en un Quadcrasher', 'progress', 'value', 'any_match', 3, null, 'S9W3 — Trucos con vehículos', 2);
  r := pg_temp.rl9w3(c, 'use', 'quad_crasher');
  perform pg_temp.cn9w3(r, 'quad_airtime_3s', '3 s de vuelo en Quadcrasher');

  c := pg_temp.ch9w3('Fase 3 de 3: Destruye estructuras de oponentes con un vehículo', 'progress', 'count', 'any_match', 3, null, 'S9W3 — Trucos con vehículos', 3);
  r := pg_temp.rl9w3(c, 'destroy', null, 'vehicle');
  perform pg_temp.cn9w3(r, 'opponent_structure', 'Estructura de un oponente');

  c := pg_temp.ch9w3('Registra cofres en Casas Cabañiles o Pico Polar', 'progress', 'count', 'any_match', 7, 'or');
  r := pg_temp.rl9w3(c, 'search', null, null, 'chest', null, 'lonely_lodge');
  r := pg_temp.rl9w3(c, 'search', null, null, 'chest', null, 'polar_peak');

  c := pg_temp.ch9w3('Inflige daño a un oponente en los 10 s posteriores a usar un túnel de viento', 'progress', 'value', 'any_match', 200);
  r := pg_temp.rl9w3(c, 'damage');
  perform pg_temp.cn9w3(r, 'after_slipstream', 'En los 10 s tras usar un túnel de viento');

  -- Pase de batalla
  c := pg_temp.ch9w3('Fase 1 de 3: Visita Villa Vivaracha y Conductos Cambiantes en una sola partida', 'progress', 'count', 'same_match', 2, 'and', 'S9W3 — Visita dos zonas en una partida', 1);
  r := pg_temp.rl9w3(c, 'visit', null, null, null, null, 'happy_hamlet');
  r := pg_temp.rl9w3(c, 'visit', null, null, null, null, 'shifty_shafts');

  c := pg_temp.ch9w3('Fase 2 de 3: Visita Escalones Estivales y Cráter Catastrófico en una sola partida', 'progress', 'count', 'same_match', 2, 'and', 'S9W3 — Visita dos zonas en una partida', 2);
  r := pg_temp.rl9w3(c, 'visit', null, null, null, null, 'sunny_steps');
  r := pg_temp.rl9w3(c, 'visit', null, null, null, null, 'dusty_divot');

  c := pg_temp.ch9w3('Fase 3 de 3: Visita Lomas Lúgubres y Salpiconeros Salados en una sola partida', 'progress', 'count', 'same_match', 2, 'and', 'S9W3 — Visita dos zonas en una partida', 3);
  r := pg_temp.rl9w3(c, 'visit', null, null, null, null, 'haunted_hills');
  r := pg_temp.rl9w3(c, 'visit', null, null, null, null, 'salty_springs');

  c := pg_temp.ch9w3('Lanza el disco volador y atrápalo antes de que caiga', 'simple', 'count', 'any_match', 1);
  r := pg_temp.rl9w3(c, 'misc');
  perform pg_temp.cn9w3(r, 'flying_disc_catch', '🥏 Disco volador atrapado en el aire');

  c := pg_temp.ch9w3('Consigue eliminaciones con armas explosivas', 'progress', 'count', 'any_match', 3);
  r := pg_temp.rl9w3(c, 'kill', null, 'explosive');

  c := pg_temp.ch9w3('Inflige daño con armas distintas en una sola partida', 'progress', 'count', 'same_match', 5);
  r := pg_temp.rl9w3(c, 'misc');
  perform pg_temp.cn9w3(r, 'five_weapons_same_match', '5 armas distintas en la misma partida');
end $$;

-- Meta: recalcular target semanal
update public.challenges c
set target_value = greatest((
  select count(distinct coalesce(n.line_id::text, n.id::text))
  from public.challenges n
  where n.week_id = c.week_id and not n.is_meta and not n.is_prestige
), 1)
where c.week_id = pg_temp.s9_w3() and c.is_meta;

drop function if exists pg_temp.cn9w3(uuid, text, text);
drop function if exists pg_temp.rl9w3(uuid, text, text, text, text, text, text);
drop function if exists pg_temp.ch9w3(text, challenge_kind, text, match_scope, bigint, rule_group_operator, text, int);
drop function if exists pg_temp.s9_w3();
