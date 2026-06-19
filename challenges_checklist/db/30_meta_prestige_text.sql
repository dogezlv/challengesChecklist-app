-- ============================================================
-- 30_meta_prestige_text.sql
-- Meta semanal: recompensa → desbloqueo de prestigios
-- ============================================================

update public.challenges
set description = 'Completa todos los desafíos de la semana para desbloquear los prestigios'
where is_meta = true
  and description = 'Completa todos los desafíos de la semana para ganar la recompensa';
