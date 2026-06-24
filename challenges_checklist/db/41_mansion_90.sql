-- 41: prestigio S6 mansión superhéroes — sobrevivir 90 jugadores (antes 75)

update challenges c
set description = 'Aterriza en la mansión de superhéroes al caer del autobús de batalla y sobrevive a 90 jugadores en la misma partida'
from challenge_weeks w
join seasons s on s.id = w.season_id
where c.week_id = w.id
  and s.code = 'season_8'
  and w.week_number = 6
  and c.is_prestige
  and c.phase_order = 1
  and c.description ilike '%mansión de superhéroes%';

update challenges c
set description = 'Sobrevive a 90 jugadores en la misma partida',
    target_value = 90,
    current_value = least(coalesce(c.current_value, 0), 90)
from challenge_weeks w
join seasons s on s.id = w.season_id
where c.week_id = w.id
  and s.code = 'season_8'
  and w.week_number = 6
  and c.is_prestige
  and c.phase_order = 2
  and c.description ilike '%Sobrevive a %jugadores%'
  and exists (
    select 1 from challenges p
    where p.line_id = c.line_id
      and p.phase_order = 1
      and p.description ilike '%mansión de superhéroes%'
  );
