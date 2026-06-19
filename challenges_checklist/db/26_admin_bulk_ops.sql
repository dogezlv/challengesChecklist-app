-- ============================================================
-- 26_admin_bulk_ops.sql — Acciones masivas de admin (tracker)
--   Completar / reiniciar normales, prestigios o partidas por separado.
--   Todas exigen fila en admin_users (mismo guard que reset_all_progress).
-- ============================================================

create or replace function public.assert_admin()
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from admin_users where user_id = auth.uid()) then
    raise exception 'Solo un administrador puede ejecutar esta acción';
  end if;
end;
$fn$;

-- Marca todos los desafíos normales (no meta, no prestigio) como completados.
create or replace function public.complete_normals()
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  perform public.assert_admin();
  update challenges
  set current_value = coalesce(target_value, 1),
      is_completed = true
  where is_meta = false and is_prestige = false;
end;
$fn$;

create or replace function public.complete_prestiges()
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  perform public.assert_admin();
  update challenges
  set current_value = coalesce(target_value, 1),
      is_completed = true
  where is_meta = false and is_prestige = true;
end;
$fn$;

-- Reinicia progreso de normales (conserva partidas y progreso de prestigio).
create or replace function public.reset_normals()
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  perform public.assert_admin();

  delete from match_rule_progress
  where challenge_id in (
    select id from challenges where is_meta = false and is_prestige = false
  );
  delete from challenge_distinct_progress
  where challenge_id in (
    select id from challenges where is_meta = false and is_prestige = false
  );

  update challenges
  set current_value = 0,
      is_completed = false,
      completed_in_match = null
  where is_meta = false and is_prestige = false;
end;
$fn$;

create or replace function public.reset_prestiges()
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  perform public.assert_admin();

  delete from match_rule_progress
  where challenge_id in (
    select id from challenges where is_meta = false and is_prestige = true
  );
  delete from challenge_distinct_progress
  where challenge_id in (
    select id from challenges where is_meta = false and is_prestige = true
  );

  update challenges
  set current_value = 0,
      is_completed = false,
      completed_in_match = null
  where is_meta = false and is_prestige = true;
end;
$fn$;

-- Borra partidas y progreso ligado a partidas; desbloquea fases/prestigio
-- (equivalente a terminar todas las partidas y limpiar acumuladores por match).
create or replace function public.reset_matches()
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  perform public.assert_admin();

  delete from match_rule_progress where match_id is not null;
  delete from challenge_distinct_progress where match_id is not null;

  update challenges
  set current_value = 0
  where match_scope = 'same_match'
    and kind = 'progress'
    and is_completed = false
    and coalesce(current_value, 0) <> 0;

  update challenges
  set completed_in_match = null
  where completed_in_match is not null;

  delete from matches where true;
end;
$fn$;

-- reset_all_progress: reutiliza assert_admin
create or replace function public.reset_all_progress()
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  perform public.assert_admin();

  delete from challenge_distinct_progress where true;
  delete from match_rule_progress where true;

  update challenges
  set current_value = 0,
      is_completed = false,
      completed_in_match = null
  where is_meta = false;

  delete from matches where true;
end;
$fn$;

grant execute on function public.complete_normals() to authenticated;
grant execute on function public.complete_prestiges() to authenticated;
grant execute on function public.reset_normals() to authenticated;
grant execute on function public.reset_prestiges() to authenticated;
grant execute on function public.reset_matches() to authenticated;
