-- ============================================================
-- 54_admin_bulk_season.sql — Acciones admin acotadas a una temporada
-- ============================================================

create or replace function public.assert_season(p_season_code text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_id uuid;
begin
  if p_season_code is null or btrim(p_season_code) = '' then
    raise exception 'Debes indicar la temporada (p_season_code)';
  end if;
  select s.id into v_id from public.seasons s where s.code = p_season_code;
  if v_id is null then
    raise exception 'Temporada no encontrada: %', p_season_code;
  end if;
  return v_id;
end;
$fn$;

-- Reemplazar firmas sin parámetro (global) por temporada obligatoria
drop function if exists public.complete_normals();
drop function if exists public.complete_prestiges();
drop function if exists public.reset_normals();
drop function if exists public.reset_prestiges();
drop function if exists public.reset_matches();
drop function if exists public.reset_all_progress();

create or replace function public.complete_normals(p_season_code text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  perform public.assert_admin();
  perform public.assert_season(p_season_code);

  update public.challenges c
  set current_value = coalesce(c.target_value, 1),
      is_completed = true
  from public.challenge_weeks w
  join public.seasons s on s.id = w.season_id
  where c.week_id = w.id
    and s.code = p_season_code
    and c.is_meta = false
    and c.is_prestige = false;
end;
$fn$;

create or replace function public.complete_prestiges(p_season_code text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  perform public.assert_admin();
  perform public.assert_season(p_season_code);

  update public.challenges c
  set current_value = coalesce(c.target_value, 1),
      is_completed = true
  from public.challenge_weeks w
  join public.seasons s on s.id = w.season_id
  where c.week_id = w.id
    and s.code = p_season_code
    and c.is_meta = false
    and c.is_prestige = true;
end;
$fn$;

create or replace function public.reset_normals(p_season_code text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  perform public.assert_admin();
  perform public.assert_season(p_season_code);

  delete from public.match_rule_progress mrp
  where mrp.challenge_id in (
    select c.id
    from public.challenges c
    join public.challenge_weeks w on w.id = c.week_id
    join public.seasons s on s.id = w.season_id
    where s.code = p_season_code
      and c.is_meta = false
      and c.is_prestige = false
  );

  delete from public.challenge_distinct_progress cdp
  where cdp.challenge_id in (
    select c.id
    from public.challenges c
    join public.challenge_weeks w on w.id = c.week_id
    join public.seasons s on s.id = w.season_id
    where s.code = p_season_code
      and c.is_meta = false
      and c.is_prestige = false
  );

  update public.challenges c
  set current_value = 0,
      is_completed = false,
      completed_in_match = null
  from public.challenge_weeks w
  join public.seasons s on s.id = w.season_id
  where c.week_id = w.id
    and s.code = p_season_code
    and c.is_meta = false
    and c.is_prestige = false;
end;
$fn$;

create or replace function public.reset_prestiges(p_season_code text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  perform public.assert_admin();
  perform public.assert_season(p_season_code);

  delete from public.match_rule_progress mrp
  where mrp.challenge_id in (
    select c.id
    from public.challenges c
    join public.challenge_weeks w on w.id = c.week_id
    join public.seasons s on s.id = w.season_id
    where s.code = p_season_code
      and c.is_meta = false
      and c.is_prestige = true
  );

  delete from public.challenge_distinct_progress cdp
  where cdp.challenge_id in (
    select c.id
    from public.challenges c
    join public.challenge_weeks w on w.id = c.week_id
    join public.seasons s on s.id = w.season_id
    where s.code = p_season_code
      and c.is_meta = false
      and c.is_prestige = true
  );

  update public.challenges c
  set current_value = 0,
      is_completed = false,
      completed_in_match = null
  from public.challenge_weeks w
  join public.seasons s on s.id = w.season_id
  where c.week_id = w.id
    and s.code = p_season_code
    and c.is_meta = false
    and c.is_prestige = true;
end;
$fn$;

create or replace function public.reset_matches(p_season_code text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  perform public.assert_admin();
  perform public.assert_season(p_season_code);

  delete from public.match_rule_progress mrp
  where mrp.match_id is not null
    and mrp.challenge_id in (
      select c.id
      from public.challenges c
      join public.challenge_weeks w on w.id = c.week_id
      join public.seasons s on s.id = w.season_id
      where s.code = p_season_code
        and c.is_meta = false
    );

  delete from public.challenge_distinct_progress cdp
  where cdp.match_id is not null
    and cdp.challenge_id in (
      select c.id
      from public.challenges c
      join public.challenge_weeks w on w.id = c.week_id
      join public.seasons s on s.id = w.season_id
      where s.code = p_season_code
        and c.is_meta = false
    );

  update public.challenges c
  set current_value = 0
  from public.challenge_weeks w
  join public.seasons s on s.id = w.season_id
  where c.week_id = w.id
    and s.code = p_season_code
    and c.match_scope = 'same_match'
    and c.kind = 'progress'
    and c.is_completed = false
    and coalesce(c.current_value, 0) <> 0;

  update public.challenges c
  set completed_in_match = null
  from public.challenge_weeks w
  join public.seasons s on s.id = w.season_id
  where c.week_id = w.id
    and s.code = p_season_code
    and c.completed_in_match is not null;
end;
$fn$;

create or replace function public.reset_all_progress(p_season_code text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  perform public.assert_admin();
  perform public.assert_season(p_season_code);

  delete from public.match_rule_progress mrp
  where mrp.challenge_id in (
    select c.id
    from public.challenges c
    join public.challenge_weeks w on w.id = c.week_id
    join public.seasons s on s.id = w.season_id
    where s.code = p_season_code
      and c.is_meta = false
  );

  delete from public.challenge_distinct_progress cdp
  where cdp.challenge_id in (
    select c.id
    from public.challenges c
    join public.challenge_weeks w on w.id = c.week_id
    join public.seasons s on s.id = w.season_id
    where s.code = p_season_code
      and c.is_meta = false
  );

  update public.challenges c
  set current_value = 0,
      is_completed = false,
      completed_in_match = null
  from public.challenge_weeks w
  join public.seasons s on s.id = w.season_id
  where c.week_id = w.id
    and s.code = p_season_code
    and c.is_meta = false;
end;
$fn$;

grant execute on function public.assert_season(text) to authenticated;
grant execute on function public.complete_normals(text) to authenticated;
grant execute on function public.complete_prestiges(text) to authenticated;
grant execute on function public.reset_normals(text) to authenticated;
grant execute on function public.reset_prestiges(text) to authenticated;
grant execute on function public.reset_matches(text) to authenticated;
grant execute on function public.reset_all_progress(text) to authenticated;
