-- ============================================================
-- 15_prestige_manual_guard.sql — Las RPC manuales del tracker tampoco pueden
-- AÑADIR progreso a un desafío de prestigio hasta que todos los normales (no
-- meta, no prestigio) de su semana estén completos. Quitar progreso siempre
-- está permitido (igual que el resto de RPC manuales). (report_event ya lo
-- bloquea desde db/13; esto cubre toggle/slider/±1 del panel.)
-- ============================================================

create or replace function public.prestige_locked(p_challenge_id uuid)
returns boolean
language sql
security definer
set search_path to 'public'
as $$
  select coalesce(c.is_prestige, false)
    and exists (
      select 1 from challenges nrm
      where nrm.week_id = c.week_id
        and nrm.is_meta = false
        and nrm.is_prestige = false
        and nrm.is_completed = false
    )
  from challenges c
  where c.id = p_challenge_id;
$$;

-- toggle (simple): solo bloquea al COMPLETAR (no al desmarcar)
create or replace function public.toggle_challenge_completion(p_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select kind, is_meta, match_scope, is_completed, line_id
  into v
  from challenges
  where id = p_challenge_id;

  if not found or v.kind <> 'simple' or v.is_meta then
    return;
  end if;

  if not v.is_completed and public.prestige_locked(p_challenge_id) then
    raise exception 'Completa los desafíos normales de la semana para desbloquear el prestigio';
  end if;

  if not v.is_completed
     and (v.match_scope in ('same_match', 'different_matches') or v.line_id is not null)
     and not exists (select 1 from matches where is_active = true) then
    raise exception 'Requiere una partida activa';
  end if;

  update challenges
  set is_completed = not is_completed,
      current_value = case when is_completed then 0 else coalesce(target_value, 1) end
  where id = p_challenge_id;

  if v.is_completed then
    delete from match_rule_progress where challenge_id = p_challenge_id;
    delete from challenge_distinct_progress where challenge_id = p_challenge_id;
  end if;
end;
$function$;

-- increase (progress ±N): solo bloquea al SUMAR (p_increase_value > 0)
create or replace function public.increase_challenge_progress(p_challenge_id uuid, p_increase_value bigint)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v record;
  v_match uuid;
  v_rule uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select kind, is_meta, match_scope, line_id into v
  from challenges
  where id = p_challenge_id;

  if not found or v.kind <> 'progress' or v.is_meta then
    return;
  end if;

  if p_increase_value > 0 and public.prestige_locked(p_challenge_id) then
    raise exception 'Completa los desafíos normales de la semana para desbloquear el prestigio';
  end if;

  select id into v_match from matches where is_active = true limit 1;

  if p_increase_value > 0
     and (v.match_scope in ('same_match', 'different_matches') or v.line_id is not null)
     and v_match is null then
    raise exception 'Requiere una partida activa';
  end if;

  if v.match_scope = 'different_matches' then
    if abs(p_increase_value) <> 1 then
      raise exception 'Los desafíos de partidas diferentes avanzan de 1 en 1';
    end if;

    select id into v_rule
    from challenge_rules
    where challenge_id = p_challenge_id
    limit 1;

    if v_rule is not null then
      if p_increase_value = 1 then
        if exists (
          select 1 from match_rule_progress
          where challenge_id = p_challenge_id and match_id = v_match
        ) then
          raise exception 'Ya se sumó progreso en esta partida';
        end if;

        insert into match_rule_progress (match_id, challenge_id, challenge_rule_id, amount)
        values (v_match, p_challenge_id, v_rule, 1);
      else
        delete from match_rule_progress
        where id = (
          select id from match_rule_progress
          where challenge_id = p_challenge_id and match_id is not null
          order by (match_id is not distinct from v_match) desc, created_at desc
          limit 1
        );
      end if;

      update challenges
      set current_value = least(
        (select count(distinct match_id) from match_rule_progress
         where challenge_id = p_challenge_id and match_id is not null),
        target_value)
      where id = p_challenge_id;

      return;
    end if;
  end if;

  update challenges
  set current_value = greatest(0, least(coalesce(current_value, 0) + p_increase_value, target_value))
  where id = p_challenge_id;
end;
$function$;

-- update (slider): solo bloquea si el nuevo valor SUBE
create or replace function public.update_challenge_progress(p_challenge_id uuid, p_current_value bigint)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select kind, is_meta, match_scope, current_value, line_id into v
  from challenges
  where id = p_challenge_id;

  if not found or v.kind <> 'progress' or v.is_meta then
    return;
  end if;

  if p_current_value > coalesce(v.current_value, 0) and public.prestige_locked(p_challenge_id) then
    raise exception 'Completa los desafíos normales de la semana para desbloquear el prestigio';
  end if;

  if v.match_scope = 'different_matches'
     and p_current_value > coalesce(v.current_value, 0) then
    raise exception 'Los desafíos de partidas diferentes avanzan de 1 en 1';
  end if;

  if p_current_value > coalesce(v.current_value, 0)
     and (v.match_scope in ('same_match', 'different_matches') or v.line_id is not null)
     and not exists (select 1 from matches where is_active = true) then
    raise exception 'Requiere una partida activa';
  end if;

  update challenges
  set current_value = greatest(0, least(p_current_value, target_value))
  where id = p_challenge_id;

  if p_current_value <= 0 then
    delete from match_rule_progress where challenge_id = p_challenge_id;
    delete from challenge_distinct_progress where challenge_id = p_challenge_id;
  end if;
end;
$function$;
