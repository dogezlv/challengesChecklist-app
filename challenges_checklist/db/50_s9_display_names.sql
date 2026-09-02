-- ============================================================
-- 50_s9_display_names.sql — Nombres oficiales en español (S9)
-- Neo Tilted → Neorrecostados; Chug Splash → Salpicón Saludable;
-- Bomba pestilente → Bomba apestosa
-- ============================================================

update public.locations
set display_name = 'Neorrecostados'
where code = 'neo_tilted';

update public.game_objects
set display_name = 'Salpicón Saludable'
where code = 'chug_splash';

update public.game_objects
set display_name = 'Bomba apestosa'
where code = 'stink_bomb';

update public.challenges c
set description = replace(c.description, 'Neo Tilted', 'Neorrecostados')
from public.challenge_weeks w
join public.seasons s on s.id = w.season_id
where c.week_id = w.id
  and s.code = 'season_9'
  and c.description like '%Neo Tilted%';

update public.challenges c
set description = replace(c.description, 'Chug Splash', 'Salpicón Saludable')
from public.challenge_weeks w
join public.seasons s on s.id = w.season_id
where c.week_id = w.id
  and s.code = 'season_9'
  and c.description like '%Chug Splash%';

update public.challenges c
set description = replace(c.description, 'bombas pestilentes', 'bomba apestosa')
from public.challenge_weeks w
join public.seasons s on s.id = w.season_id
where c.week_id = w.id
  and s.code = 'season_9'
  and c.description like '%bombas pestilentes%';
