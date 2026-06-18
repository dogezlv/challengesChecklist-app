-- 12: RPC para que un ADMIN reinicie todo el progreso y las partidas desde el
--     panel de supervisión. Equivale al "Full progress reset" de CLAUDE.md,
--     pero protegido: solo usuarios en admin_users pueden ejecutarlo.

create or replace function public.reset_all_progress()
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
    raise exception 'Solo un administrador puede reiniciar el progreso';
  end if;

  -- tablas hijas de matches primero (FK a match_id). El `where true` es para
  -- esquivar la guarda sql_safe_updates ("DELETE requires a WHERE clause")
  -- que aplica al rol que ejecuta el RPC.
  delete from challenge_distinct_progress where true;
  delete from match_rule_progress where true;

  -- limpiar progreso y referencias a partidas (completed_in_match) antes de
  -- borrar las partidas; el trigger trg_sync_week_meta recalcula los meta
  update challenges
  set current_value = 0,
      is_completed = false,
      completed_in_match = null
  where is_meta = false;

  delete from matches where true;
end;
$fn$;
