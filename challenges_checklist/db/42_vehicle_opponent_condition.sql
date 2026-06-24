-- 42: prestigio S1 destruir vehículo — condición «conducido por un oponente»
-- (igual que el normal W1 de daño a vehículo; sin esto Boloncho cuenta sin rival)

insert into rule_conditions (
  challenge_rule_id, condition_key, condition_value, requires_weapon
)
select cr.id, 'driven_by_opponent', '🚗 Conducido por un oponente', false
from challenge_rules cr
join challenges c on c.id = cr.challenge_id
join challenge_weeks w on w.id = c.week_id
join seasons s on s.id = w.season_id
join action_types at on at.id = cr.action_type_id
join tags t on t.id = cr.target_tag_id
where s.code = 'season_8'
  and w.week_number = 1
  and c.is_prestige = true
  and c.description ilike '%Destruye un vehículo conducido por un oponente%'
  and at.code = 'destroy'
  and t.code = 'vehicle'
  and not exists (
    select 1 from rule_conditions rc
    where rc.challenge_rule_id = cr.id
      and rc.condition_key = 'driven_by_opponent'
  );

-- Unificar etiqueta del normal W1 (antes «Conducido por un rival»)
update rule_conditions rc
set condition_value = '🚗 Conducido por un oponente'
from challenge_rules cr
join challenges c on c.id = cr.challenge_id
join challenge_weeks w on w.id = c.week_id
join seasons s on s.id = w.season_id
where rc.challenge_rule_id = cr.id
  and rc.condition_key = 'driven_by_opponent'
  and s.code = 'season_8'
  and w.week_number = 1
  and c.is_prestige = false
  and c.description ilike '%vehículo conducido por un oponente%';
