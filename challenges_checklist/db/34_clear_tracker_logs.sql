-- ============================================================
-- 34_clear_tracker_logs.sql — Borrar historial del tracker (admin)
-- ============================================================

create or replace function public.clear_tracker_logs()
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_count bigint;
begin
  perform public.assert_admin();
  delete from tracker_activity_logs where id is not null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;

grant execute on function public.clear_tracker_logs() to authenticated;
