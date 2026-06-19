-- ============================================================
-- 23_misc_volcano_jungle.sql
-- Misceláneo independiente (ganar/aterrizar/bola cañón/pista quad),
-- volcán como objeto distinto del respiradero, jungla con POIs,
-- condición de llegada en misión de cañones pirata, iconos/catálogo.
-- Idempotente por descripción / claves conocidas.
-- ============================================================

insert into public.game_objects (code, display_name, display_name_en, is_weapon)
values ('volcano', 'Volcán', 'Volcano', false)
on conflict (code) do nothing;

create or replace function pg_temp.act(c text) returns uuid language sql as $$
  select id from action_types where code = c
$$;
create or replace function pg_temp.obj(c text) returns uuid language sql as $$
  select id from game_objects where code = c
$$;
create or replace function pg_temp.loc(c text) returns uuid language sql as $$
  select id from locations where code = c
$$;
create or replace function pg_temp.misc_id() returns uuid language sql as $$
  select id from action_types where code = 'misc'
$$;

-- ── Prestigio S3: eliminaciones jungla (bioma + POIs de jungla) ─────────────
do $$
declare v uuid;
begin
  select c.id into v
  from challenges c
  join challenge_weeks w on w.id = c.week_id
  join seasons s on s.id = w.season_id
  where s.code = 'season_8' and w.week_number = 3 and c.is_prestige
    and c.description = 'Consigue eliminaciones en la jungla'
  limit 1;
  if v is null then return; end if;
  delete from rule_conditions where challenge_rule_id in (select id from challenge_rules where challenge_id = v);
  delete from challenge_rules where challenge_id = v;
  delete from match_rule_progress where challenge_id = v;
  update challenges set rules_operator = 'or' where id = v;
  insert into challenge_rules (challenge_id, action_type_id, location_id) values
    (v, pg_temp.act('kill'), pg_temp.loc('jungle')),
    (v, pg_temp.act('kill'), pg_temp.loc('lazy_lagoon')),
    (v, pg_temp.act('kill'), pg_temp.loc('pirate_camp_lagoon')),
    (v, pg_temp.act('kill'), pg_temp.loc('pirate_camp_paradise'));
end $$;

-- ── Prestigio S4: gana partida → misc ───────────────────────────────────────
do $$
declare v uuid; r uuid;
begin
  select c.id into v
  from challenges c
  join challenge_weeks w on w.id = c.week_id
  join seasons s on s.id = w.season_id
  where s.code = 'season_8' and w.week_number = 4 and c.is_prestige
    and c.description = 'Gana una partida'
  limit 1;
  if v is null then return; end if;
  delete from rule_conditions where challenge_rule_id in (select id from challenge_rules where challenge_id = v);
  delete from challenge_rules where challenge_id = v;
  delete from match_rule_progress where challenge_id = v;
  update challenges set match_scope = 'any_match', rules_operator = 'and', target_value = 1 where id = v;
  insert into challenge_rules (challenge_id, action_type_id)
  values (v, pg_temp.misc_id()) returning id into r;
  insert into rule_conditions (challenge_rule_id, condition_key, condition_value)
  values (r, 'win_match', '🏆 Ganaste la partida');
end $$;

-- ── Prestigio S4: impacto bola de cañón → misc ──────────────────────────────
do $$
declare v uuid; r uuid;
begin
  select c.id into v
  from challenges c
  join challenge_weeks w on w.id = c.week_id
  join seasons s on s.id = w.season_id
  where s.code = 'season_8' and w.week_number = 4 and c.is_prestige
    and c.description ilike '%Impacta a un enemigo contigo como bola de ca%'
  limit 1;
  if v is null then return; end if;
  delete from rule_conditions where challenge_rule_id in (select id from challenge_rules where challenge_id = v);
  delete from challenge_rules where challenge_id = v;
  delete from match_rule_progress where challenge_id = v;
  insert into challenge_rules (challenge_id, action_type_id)
  values (v, pg_temp.misc_id()) returning id into r;
  insert into rule_conditions (challenge_rule_id, condition_key, condition_value)
  values (r, 'baller_cannon_hit', '💥 Impactaste a un enemigo como bola de cañón');
end $$;

-- ── Prestigio S5: volcán (objeto) + patineta + arbusto ───────────────────────
do $$
declare v uuid;
begin
  select c.id into v
  from challenges c
  join challenge_weeks w on w.id = c.week_id
  join seasons s on s.id = w.season_id
  where s.code = 'season_8' and w.week_number = 5 and c.is_prestige
    and c.description ilike '%Usa el volc% para impulsarte%'
  limit 1;
  if v is null then return; end if;
  delete from rule_conditions where challenge_rule_id in (select id from challenge_rules where challenge_id = v);
  delete from challenge_rules where challenge_id = v;
  delete from match_rule_progress where challenge_id = v;
  insert into challenge_rules (challenge_id, action_type_id, required_object_id) values
    (v, pg_temp.act('use'), pg_temp.obj('volcano')),
    (v, pg_temp.act('use'), pg_temp.obj('driftboard')),
    (v, pg_temp.act('use'), pg_temp.obj('camo_bush'));
end $$;

-- ── Prestigio S5: pista con Quad Crasher → misc ─────────────────────────────
do $$
declare v uuid; r uuid;
begin
  select c.id into v
  from challenges c
  join challenge_weeks w on w.id = c.week_id
  join seasons s on s.id = w.season_id
  where s.code = 'season_8' and w.week_number = 5 and c.is_prestige
    and c.description ilike '%Quad Crasher%'
  limit 1;
  if v is null then return; end if;
  delete from rule_conditions where challenge_rule_id in (select id from challenge_rules where challenge_id = v);
  delete from challenge_rules where challenge_id = v;
  delete from match_rule_progress where challenge_id = v;
  insert into challenge_rules (challenge_id, action_type_id)
  values (v, pg_temp.misc_id()) returning id into r;
  insert into rule_conditions (challenge_rule_id, condition_key, condition_value)
  values (r, 'race_track_lap_quad', '🏁 Vuelta completa con Quad Crasher en Villa Vivaracha');
end $$;

-- ── Prestigio S1 W2: aterrizar Palmeras + ganar (2 misc independientes) ─────
do $$
declare v uuid; r uuid;
begin
  select c.id into v
  from challenges c
  join challenge_weeks w on w.id = c.week_id
  join seasons s on s.id = w.season_id
  where s.code = 'season_8' and c.is_prestige
    and c.description = 'Aterriza en Palmeras Paradisíacas y gana la partida'
  limit 1;
  if v is null then return; end if;
  delete from rule_conditions where challenge_rule_id in (select id from challenge_rules where challenge_id = v);
  delete from challenge_rules where challenge_id = v;
  delete from match_rule_progress where challenge_id = v;
  update challenges set
    kind = 'progress', unit = 'count', match_scope = 'any_match',
    target_value = 2, rules_operator = 'and'
  where id = v;
  insert into challenge_rules (challenge_id, action_type_id)
  values (v, pg_temp.misc_id()) returning id into r;
  insert into rule_conditions (challenge_rule_id, condition_key, condition_value)
  values (r, 'land_paradise_palms', '🪂 Aterrizaste en Palmeras Paradisíacas');
  insert into challenge_rules (challenge_id, action_type_id)
  values (v, pg_temp.misc_id()) returning id into r;
  insert into rule_conditions (challenge_rule_id, condition_key, condition_value)
  values (r, 'win_match', '🏆 Ganaste la partida');
end $$;

-- ── Misión normal: pista de carreras → misc (consistencia) ───────────────────
update challenge_rules cr
set action_type_id = pg_temp.misc_id(),
    required_tag_id = null,
    required_object_id = null,
    location_id = null
from challenges c
where cr.challenge_id = c.id
  and cr.id = '4279828c-3f6a-4bd6-9971-bcf29a2ace12';

-- ── Cañón pirata en todos los camps: condición de llegada por campamento ─────
insert into rule_conditions (challenge_rule_id, condition_key, condition_value)
select cr.id,
       'cannon_arrived_named',
       '📍 Llegaste a una ubicación con nombre desde ' || l.display_name
from challenge_rules cr
join challenges c on c.id = cr.challenge_id
join locations l on l.id = cr.location_id
join game_objects go on go.id = cr.required_object_id
where c.description ilike '%ca%on pirata en todos los campamentos piratas%'
  and go.code = 'pirate_cannon'
  and l.code like 'pirate_camp_%'
  and not exists (
    select 1 from rule_conditions rc
    where rc.challenge_rule_id = cr.id and rc.condition_key = 'cannon_arrived_named'
  );
