-- ============================================================
-- 48_s9_search_use_actions.sql
--   S9 W1: objeto legendario → acción Buscar (no Recoger).
--   S9 W5: colocar trampa → acción Usar (no Colocar).
--   Elimina action_types pickup/place si ya no se usan.
-- ============================================================

update public.challenge_rules cr
set action_type_id = (select id from public.action_types where code = 'search'),
    required_object_id = null,
    required_tag_id = null
from public.challenges c
where cr.challenge_id = c.id
  and c.description = 'Recoge un objeto legendario en diferentes partidas';

update public.challenge_rules cr
set action_type_id = (select id from public.action_types where code = 'use')
from public.challenges c
where cr.challenge_id = c.id
  and c.description = 'Coloca una trampa en diferentes partidas';

delete from public.action_types
where code in ('pickup', 'place')
  and not exists (
    select 1 from public.challenge_rules cr
    where cr.action_type_id = action_types.id
  );
