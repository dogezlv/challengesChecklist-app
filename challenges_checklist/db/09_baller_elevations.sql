-- ============================================================
-- 09_baller_elevations.sql
--   * The Baller → nombre en español "Boloncho" (display_name_en conserva
--     "The Baller"); también en la descripción del desafío.
--   * "Las elevaciones más altas de la isla": de 1 lugar genérico a 5
--     lugares separados (Submarino, Castillo, Volcán, Árboles, Costas
--     Clasistas), con regla AND por lugar (cada uno cuenta una vez), y el
--     desafío pasa de VISITAR a BAILAR en ellas.
-- ============================================================

-- 1. The Baller → Boloncho
update public.game_objects
set display_name = 'Boloncho',
    display_name_en = 'The Baller'
where code = 'the_baller';

update public.challenges
set description = replace(description, 'The Baller', 'el Boloncho')
where description like '%The Baller%';

-- 2. Elevaciones más altas: 5 lugares + bailar
insert into public.locations (code, display_name, display_name_en, named_location)
select v.code, v.es, v.en, false
from (values
  ('high_point_submarine', 'Punto más alto (Submarino)',        'Highest Point (Submarine)'),
  ('high_point_castle',    'Punto más alto (Castillo)',         'Highest Point (Castle)'),
  ('high_point_volcano',   'Punto más alto (Volcán)',           'Highest Point (Volcano)'),
  ('high_point_trees',     'Punto más alto (Árboles)',          'Highest Point (Trees)'),
  ('high_point_snobby',    'Punto más alto (Costas Clasistas)', 'Highest Point (Snobby Shores)')
) as v(code, es, en)
where not exists (select 1 from public.locations l where l.code = v.code);

do $$
declare
  v_old uuid;
  v_ch uuid;
  v_dance uuid;
  v_loc uuid;
  c text;
begin
  select id into v_old from public.locations where code = 'high_elevation';
  if v_old is null then
    return; -- ya migrado
  end if;

  select id into v_dance from public.action_types where code = 'dance';

  select id into v_ch from public.challenges
  where description = 'Visita las elevaciones más altas de la isla';

  delete from public.challenge_rules where location_id = v_old;

  foreach c in array array[
    'high_point_submarine', 'high_point_castle', 'high_point_volcano',
    'high_point_trees', 'high_point_snobby'
  ]
  loop
    select id into v_loc from public.locations where code = c;
    insert into public.challenge_rules (challenge_id, action_type_id, location_id)
    values (v_ch, v_dance, v_loc);
  end loop;

  update public.challenges
  set description = 'Baila en las elevaciones más altas de la isla',
      rules_operator = 'and' -- cada punto cuenta una sola vez
  where id = v_ch;

  delete from public.locations where id = v_old;
end $$;
