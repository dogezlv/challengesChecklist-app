-- ============================================================
-- 39_search_target_fixup.sql
-- Reglas "search": el contenedor va en target_object (no required_object).
-- db/31 insertó cofre/munición en required_object_id por error.
-- Idempotente: solo corrige filas con target vacío y required relleno.
-- ============================================================

update public.challenge_rules cr
set
  target_object_id = cr.required_object_id,
  required_object_id = null
from public.action_types at
where at.id = cr.action_type_id
  and at.code = 'search'
  and cr.required_object_id is not null
  and cr.target_object_id is null;

update public.challenge_rules cr
set
  target_tag_id = cr.required_tag_id,
  required_tag_id = null
from public.action_types at
where at.id = cr.action_type_id
  and at.code = 'search'
  and cr.required_tag_id is not null
  and cr.target_tag_id is null;
