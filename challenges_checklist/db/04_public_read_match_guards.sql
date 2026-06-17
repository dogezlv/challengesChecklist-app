-- ============================================================
-- 04_public_read_match_guards.sql
--   * Lectura pública (rol anon) de lo que muestra la checklist "/":
--     seasons, challenge_weeks, challenges y challenge_lines. Con esto el
--     Realtime de `challenges` también llega a visitantes sin sesión.
--   * Las RPCs manuales (toggle / aumentar / fijar progreso) ahora:
--       - exigen usuario autenticado (antes cualquiera podía llamarlas);
--       - exigen partida activa si el desafío es de 'misma partida' o
--         'partidas diferentes', igual que report_event.
-- ============================================================

-- 1. Lectura anónima para la checklist pública
--    (el GRANT es necesario además de la política: `challenges` no tenía
--    privilegios de tabla para anon)
grant select on public.seasons, public.challenge_weeks,
  public.challenges, public.challenge_lines to anon;

do $$
declare
  t text;
begin
  foreach t in array array[
    'seasons', 'challenge_weeks', 'challenges', 'challenge_lines'
  ]
  loop
    execute format('drop policy if exists "Anyone can read %s" on public.%I', t, t);
    execute format(
      'create policy "Anyone can read %s" on public.%I for select to anon using (true)',
      t, t
    );
  end loop;
end $$;

-- 2. RPCs manuales con autenticación + partida activa según match_scope
create or replace function public.assert_manual_update_allowed(p_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_scope text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select match_scope into v_scope
  from challenges
  where id = p_challenge_id;

  if v_scope in ('same_match', 'different_matches')
     and not exists (select 1 from matches where is_active = true) then
    raise exception 'Requiere una partida activa';
  end if;
end;
$fn$;

create or replace function public.toggle_challenge_completion(p_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  perform public.assert_manual_update_allowed(p_challenge_id);

  update public.challenges
  set is_completed = not is_completed
  where id = p_challenge_id
    and kind = 'simple'
    and is_meta = false;
end;
$fn$;

create or replace function public.increase_challenge_progress(p_challenge_id uuid, p_increase_value bigint)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  perform public.assert_manual_update_allowed(p_challenge_id);

  update public.challenges
  set current_value = greatest(0, least(current_value + p_increase_value, target_value))
  where id = p_challenge_id
    and kind = 'progress'
    and is_meta = false;
end;
$fn$;

create or replace function public.update_challenge_progress(p_challenge_id uuid, p_current_value bigint)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  perform public.assert_manual_update_allowed(p_challenge_id);

  update public.challenges
  set current_value = greatest(0, least(p_current_value, target_value))
  where id = p_challenge_id
    and kind = 'progress'
    and is_meta = false;
end;
$fn$;
