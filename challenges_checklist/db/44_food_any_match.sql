-- 44: prestigio S8 W6 — consumir 5 alimentos distintos (no misma partida)

update challenges c
set
  match_scope = 'any_match',
  current_value = 0,
  is_completed = false
from challenge_weeks w
join seasons s on s.id = w.season_id
where c.week_id = w.id
  and s.code = 'season_8'
  and w.week_number = 6
  and c.is_prestige
  and c.description ilike '%Consume diferentes tipos de alimento%';

delete from match_rule_progress mrp
using challenges c
join challenge_weeks w on w.id = c.week_id
join seasons s on s.id = w.season_id
where mrp.challenge_id = c.id
  and s.code = 'season_8'
  and w.week_number = 6
  and c.is_prestige
  and c.description ilike '%Consume diferentes tipos de alimento%';
