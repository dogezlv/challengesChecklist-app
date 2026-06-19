-- ============================================================
-- 28_s10_cannon_fix.sql
-- db/27 S10 block no aplicó: ilike '%ca%on%' no matchea 'cañón'.
-- Recrea 7 reglas (campamento destino) + from_named_location.
-- ============================================================

do $$
declare v uuid; r uuid; c text;
begin
  select c.id into v
  from challenges c
  join challenge_weeks w on w.id = c.week_id
  join seasons s on s.id = w.season_id
  where s.code = 'season_8' and w.week_number = 10 and c.is_prestige
    and c.description ilike '%campamentos piratas diferentes%'
  limit 1;
  if v is null then return; end if;

  delete from rule_conditions
  where challenge_rule_id in (select id from challenge_rules where challenge_id = v);
  delete from challenge_rules where challenge_id = v;
  delete from match_rule_progress where challenge_id = v;

  update challenges set
    kind = 'progress', unit = 'count', match_scope = 'any_match',
    target_value = 3, current_value = 0, is_completed = false,
    rules_operator = 'and'
  where id = v;

  foreach c in array array[
    'pirate_camp_snow', 'pirate_camp_dusty', 'pirate_camp_volcano',
    'pirate_camp_paradise', 'pirate_camp_pleasant', 'pirate_camp_crater',
    'pirate_camp_lagoon'
  ]
  loop
    insert into challenge_rules (challenge_id, action_type_id, required_object_id, location_id)
    values (
      v,
      (select id from action_types where code = 'use'),
      (select id from game_objects where code = 'pirate_cannon'),
      (select id from locations where code = c)
    )
    returning id into r;
  end loop;
end $$;
