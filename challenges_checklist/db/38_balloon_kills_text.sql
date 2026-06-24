-- 38: prestigio S8 — eliminar con globos: texto 3 globos (objetivo ya era 3)

update challenges c
set description = 'Elimina oponentes usando al menos 3 globos',
    target_value = 3
from challenge_weeks w
join seasons s on s.id = w.season_id
where c.week_id = w.id
  and s.code = 'season_8'
  and w.week_number = 8
  and c.is_prestige = true
  and c.description ilike 'Elimina oponentes usando al menos % globo%';

update rule_conditions rc
set condition_value = '🎈 Usando globos'
from challenge_rules cr
join challenges c on c.id = cr.challenge_id
join challenge_weeks w on w.id = c.week_id
join seasons s on s.id = w.season_id
where rc.challenge_rule_id = cr.id
  and rc.condition_key = 'while_balloon'
  and s.code = 'season_8'
  and w.week_number = 8
  and c.is_prestige = true
  and c.description = 'Elimina oponentes usando al menos 3 globos';

-- Si ya tenía 3+ eliminaciones, marcar completado
update challenges c
set is_completed = true,
    current_value = 3
from challenge_weeks w
join seasons s on s.id = w.season_id
where c.week_id = w.id
  and s.code = 'season_8'
  and w.week_number = 8
  and c.is_prestige = true
  and c.description = 'Elimina oponentes usando al menos 3 globos'
  and c.current_value >= 3
  and not c.is_completed;
