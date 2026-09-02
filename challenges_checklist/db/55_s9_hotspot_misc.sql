-- ============================================================
-- 55_s9_hotspot_misc.sql
-- S9 W5: pistas de carreras → misceláneo (condición por pista).
-- S9 W6: punto caliente → POI con nombre + condición marcable.
-- Idempotente por línea de fase / descripción.
-- ============================================================

create or replace function pg_temp.misc_id() returns uuid language sql as $$
  select id from public.action_types where code = 'misc'
$$;

-- ── W5: visit + ubicación → misc + condición distinta por pista ─────────────
do $$
declare
  r uuid;
  misc uuid := pg_temp.misc_id();
begin
  select cr.id into r
  from public.challenge_rules cr
  join public.challenges c on c.id = cr.challenge_id
  join public.challenge_lines cl on cl.id = c.line_id
  join public.challenge_weeks w on w.id = c.week_id
  join public.seasons s on s.id = w.season_id
  where s.code = 'season_9' and w.week_number = 5
    and cl.name = 'S9W5 — Pistas de carreras' and c.phase_order = 1
  limit 1;
  if r is not null then
    update public.challenge_rules
    set action_type_id = misc, location_id = null
    where id = r;
    delete from public.rule_conditions where challenge_rule_id = r;
    insert into public.rule_conditions (challenge_rule_id, condition_key, condition_value)
    values (r, 'race_track_lap_desert', '🏁 Vuelta completa — pista del desierto');
  end if;

  select cr.id into r
  from public.challenge_rules cr
  join public.challenges c on c.id = cr.challenge_id
  join public.challenge_lines cl on cl.id = c.line_id
  join public.challenge_weeks w on w.id = c.week_id
  join public.seasons s on s.id = w.season_id
  where s.code = 'season_9' and w.week_number = 5
    and cl.name = 'S9W5 — Pistas de carreras' and c.phase_order = 2
  limit 1;
  if r is not null then
    update public.challenge_rules
    set action_type_id = misc, location_id = null
    where id = r;
    delete from public.rule_conditions where challenge_rule_id = r;
    insert into public.rule_conditions (challenge_rule_id, condition_key, condition_value)
    values (r, 'race_track_lap_snow', '🏁 Vuelta completa — pista nevada');
  end if;

  select cr.id into r
  from public.challenge_rules cr
  join public.challenges c on c.id = cr.challenge_id
  join public.challenge_lines cl on cl.id = c.line_id
  join public.challenge_weeks w on w.id = c.week_id
  join public.seasons s on s.id = w.season_id
  where s.code = 'season_9' and w.week_number = 5
    and cl.name = 'S9W5 — Pistas de carreras' and c.phase_order = 3
  limit 1;
  if r is not null then
    update public.challenge_rules
    set action_type_id = misc, location_id = null
    where id = r;
    delete from public.rule_conditions where challenge_rule_id = r;
    insert into public.rule_conditions (challenge_rule_id, condition_key, condition_value)
    values (r, 'race_track_lap_grasslands', '🏁 Vuelta completa — pista de pradera');
  end if;
end $$;

-- ── W6: punto caliente fijo → POI con nombre + condición hot_spot ─────────
do $$
declare
  r uuid;
begin
  -- Fase 1: cofres
  select cr.id into r
  from public.challenge_rules cr
  join public.challenges c on c.id = cr.challenge_id
  join public.challenge_lines cl on cl.id = c.line_id
  join public.challenge_weeks w on w.id = c.week_id
  join public.seasons s on s.id = w.season_id
  where s.code = 'season_9' and w.week_number = 6
    and cl.name = 'S9W6 — Punto caliente' and c.phase_order = 1
  limit 1;
  if r is not null then
    update public.challenge_rules set location_id = null where id = r;
    delete from public.rule_conditions where challenge_rule_id = r;
    insert into public.rule_conditions (challenge_rule_id, condition_key, condition_value)
    values (r, 'hot_spot', '🔥 Punto caliente');
  end if;

  -- Fase 2: munición
  select cr.id into r
  from public.challenge_rules cr
  join public.challenges c on c.id = cr.challenge_id
  join public.challenge_lines cl on cl.id = c.line_id
  join public.challenge_weeks w on w.id = c.week_id
  join public.seasons s on s.id = w.season_id
  where s.code = 'season_9' and w.week_number = 6
    and cl.name = 'S9W6 — Punto caliente' and c.phase_order = 2
  limit 1;
  if r is not null then
    update public.challenge_rules set location_id = null where id = r;
    delete from public.rule_conditions where challenge_rule_id = r;
    insert into public.rule_conditions (challenge_rule_id, condition_key, condition_value)
    values (r, 'hot_spot', '🔥 Punto caliente');
  end if;

  -- Fase 3: eliminación
  select cr.id into r
  from public.challenge_rules cr
  join public.challenges c on c.id = cr.challenge_id
  join public.challenge_lines cl on cl.id = c.line_id
  join public.challenge_weeks w on w.id = c.week_id
  join public.seasons s on s.id = w.season_id
  where s.code = 'season_9' and w.week_number = 6
    and cl.name = 'S9W6 — Punto caliente' and c.phase_order = 3
  limit 1;
  if r is not null then
    update public.challenge_rules set location_id = null where id = r;
    delete from public.rule_conditions where challenge_rule_id = r;
    insert into public.rule_conditions (challenge_rule_id, condition_key, condition_value)
    values (r, 'hot_spot', '🔥 Punto caliente');
  end if;
end $$;
