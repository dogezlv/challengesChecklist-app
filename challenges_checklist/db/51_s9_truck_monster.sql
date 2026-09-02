-- ============================================================
-- 51_s9_truck_monster.sql — S9 W2: piano gigante → monstruo de camiones
-- ============================================================

update public.locations
set
  code = 'truck_monster',
  display_name = 'Monstruo de camiones',
  display_name_en = 'Truck Monster'
where code = 'big_piano';

update public.challenges c
set description = 'Visita un teléfono gigante, un monstruo de camiones y un trofeo del pez bailarín'
from public.challenge_weeks w
join public.seasons s on s.id = w.season_id
where c.week_id = w.id
  and s.code = 'season_9'
  and w.week_number = 2
  and c.description like '%piano gigante%';
