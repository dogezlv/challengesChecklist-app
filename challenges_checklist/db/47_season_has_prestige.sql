-- ============================================================
-- 47_season_has_prestige.sql
--   seasons.has_prestige: controla si la UI muestra vista prestigio.
--   S8 = sí; S9/S10 = no (sin desafíos de prestigio).
-- ============================================================

alter table public.seasons
  add column if not exists has_prestige boolean not null default false;

update public.seasons
set has_prestige = true
where code = 'season_8';

update public.seasons
set has_prestige = false
where code in ('season_9', 'season_10');

-- Meta S9: sin mención a prestigios
update public.challenges c
set description = 'Completa todos los desafíos de la semana'
from public.challenge_weeks w
join public.seasons s on s.id = w.season_id
where c.week_id = w.id
  and c.is_meta
  and s.code = 'season_9';
