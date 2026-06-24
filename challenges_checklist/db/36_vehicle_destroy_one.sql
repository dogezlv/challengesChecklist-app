-- 36: prestigio S1 — destruir 1 vehículo de oponente (antes 3)

update challenges c
set description = 'Destruye un vehículo conducido por un oponente',
    target_value = 1
from challenge_weeks w
join seasons s on s.id = w.season_id
where c.week_id = w.id
  and s.code = 'season_8'
  and w.week_number = 1
  and c.is_prestige = true
  and c.description ilike 'Destruye 3 vehículos conducidos por un oponente';

-- Si ya tenía progreso suficiente, marcar completado con el nuevo objetivo
update challenges c
set is_completed = true,
    current_value = greatest(c.current_value, 1)
from challenge_weeks w
join seasons s on s.id = w.season_id
where c.week_id = w.id
  and s.code = 'season_8'
  and w.week_number = 1
  and c.is_prestige = true
  and c.description = 'Destruye un vehículo conducido por un oponente'
  and c.current_value >= 1
  and not c.is_completed;
