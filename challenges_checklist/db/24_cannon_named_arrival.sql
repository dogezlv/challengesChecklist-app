-- ============================================================
-- 24_cannon_named_arrival.sql
-- Cañón pirata: campamento origem (condición) + POI con nombre (p_location_id).
-- Jungla prestigio: añade Escalones Estivales. Motor: arrived_named_location.
-- Idempotente.
-- ============================================================

-- ── Jungla prestigio S3: + Escalones Estivales ───────────────────────────────
do $$
declare v uuid;
begin
  select c.id into v
  from challenges c
  join challenge_weeks w on w.id = c.week_id
  join seasons s on s.id = w.season_id
  where s.code = 'season_8' and w.week_number = 3 and c.is_prestige
    and c.description = 'Consigue eliminaciones en la jungla'
  limit 1;
  if v is null then return; end if;
  if exists (
    select 1 from challenge_rules cr
    join locations l on l.id = cr.location_id
    where cr.challenge_id = v and l.code = 'sunny_steps'
  ) then return; end if;
  insert into challenge_rules (challenge_id, action_type_id, location_id)
  select v, (select id from action_types where code = 'kill'), l.id
  from locations l where l.code = 'sunny_steps';
end $$;

-- ── Cañón en todos los camps: origen por condición, destino con nombre ───────
do $$
declare
  v_ch uuid;
  rec record;
  v_code text;
  v_label text;
begin
  select c.id into v_ch
  from challenges c
  where c.description ilike '%ca%on pirata en todos los campamentos piratas%'
  limit 1;
  if v_ch is null then return; end if;

  for rec in
    select cr.id as rule_id, cr.location_id, rc.condition_key as from_key
    from challenge_rules cr
    join game_objects go on go.id = cr.required_object_id
    left join rule_conditions rc
      on rc.challenge_rule_id = cr.id and rc.condition_key like 'from_pirate_camp_%'
    where cr.challenge_id = v_ch and go.code = 'pirate_cannon'
  loop
    if rec.location_id is not null then
      select code, display_name into v_code, v_label
      from locations where id = rec.location_id;
    elsif rec.from_key is not null then
      v_code := substring(rec.from_key from 6);
      select display_name into v_label from locations where code = v_code;
    else
      continue;
    end if;

    update challenge_rules set location_id = null where id = rec.rule_id;
    delete from rule_conditions where challenge_rule_id = rec.rule_id;
    insert into rule_conditions (challenge_rule_id, condition_key, condition_value)
    values
      (rec.rule_id, 'from_' || v_code, 'Cañón desde ' || v_label),
      (rec.rule_id, 'arrived_named_location', 'Llegaste a una ubicación con nombre');
  end loop;
end $$;

-- ── report_event: exigir POI con nombre cuando la regla lo pide ─────────────
create or replace function public.report_event(
  p_action_code text, p_amount bigint default 1,
  p_used_object_id uuid default null, p_used_tag_id uuid default null,
  p_target_object_id uuid default null, p_target_tag_id uuid default null,
  p_location_id uuid default null, p_conditions text[] default '{}'
)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_match_id uuid;
  v_ch record;
  v_rule_id uuid;
  v_rules_hit bigint;
  v_matches_hit bigint;
  v_match_amount bigint;
  v_locations_hit bigint;
  v_best_hit bigint;
  v_group_done boolean;
  v_named boolean;
  v_row record;
  v_eff record;
  v_imp record;
  v_imp_obj uuid;
  v_imp_tag uuid;
  v_sub jsonb;
  v_updated jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'p_amount must be > 0';
  end if;

  select id into v_match_id from matches where is_active = true order by started_at desc limit 1;

  for v_ch in
    select
      c.id, c.description, c.kind, c.unit, c.match_scope, c.rules_operator,
      c.target_value, c.line_id,
      array_agg(distinct cr.id) as matched_rule_ids,
      (select count(*) from challenge_rules t where t.challenge_id = c.id) as total_rules
    from challenges c
    join challenge_rules cr on cr.challenge_id = c.id
    join action_types act on act.id = cr.action_type_id
    where c.is_completed = false
      and c.is_meta = false
      and act.code = p_action_code
      and (
        c.is_prestige = false
        or not exists (
          select 1 from challenges nrm
          where nrm.week_id = c.week_id
            and nrm.is_meta = false
            and nrm.is_prestige = false
            and (nrm.is_completed = false or nrm.completed_in_match is not null)
        )
      )
      and (cr.required_object_id is null or cr.required_object_id = p_used_object_id)
      and (
        cr.required_tag_id is null
        or cr.required_tag_id = p_used_tag_id
        or (p_used_object_id is not null and exists (
              select 1 from game_object_tags got
              where got.object_id = p_used_object_id and got.tag_id = cr.required_tag_id))
      )
      and (cr.target_object_id is null or cr.target_object_id = p_target_object_id)
      and (
        cr.target_tag_id is null
        or cr.target_tag_id = p_target_tag_id
        or (p_target_object_id is not null and exists (
              select 1 from game_object_tags got
              where got.object_id = p_target_object_id and got.tag_id = cr.target_tag_id))
      )
      and (cr.location_id is null or cr.location_id = p_location_id)
      and not exists (
        select 1 from rule_conditions rc
        where rc.challenge_rule_id = cr.id
          and not (rc.condition_key = any(coalesce(p_conditions, '{}')))
      )
      and (
        not exists (
          select 1 from rule_conditions rc2
          where rc2.challenge_rule_id = cr.id
            and rc2.condition_key = 'arrived_named_location'
        )
        or (
          p_location_id is not null
          and exists (
            select 1 from locations loc
            where loc.id = p_location_id and loc.named_location = true
          )
        )
      )
      and (
        c.line_id is null or c.phase_order is null
        or not exists (
          select 1 from challenges prev
          where prev.line_id = c.line_id
            and prev.phase_order < c.phase_order
            and (prev.is_completed = false or prev.completed_in_match is not null)
        )
      )
    group by c.id
  loop
    if (v_ch.match_scope in ('same_match', 'different_matches') or v_ch.line_id is not null)
       and v_match_id is null then
      v_skipped := v_skipped || jsonb_build_object(
        'id', v_ch.id, 'description', v_ch.description, 'reason', 'no_active_match'
      );
      continue;
    end if;

    if v_ch.unit = 'distinct_location' then
      v_named := false;
      if p_location_id is not null then
        select named_location into v_named from locations where id = p_location_id;
      end if;
      if not coalesce(v_named, false) then
        v_skipped := v_skipped || jsonb_build_object(
          'id', v_ch.id, 'description', v_ch.description, 'reason', 'named_location_required'
        );
        continue;
      end if;
      if v_ch.match_scope = 'same_match' then
        insert into challenge_distinct_progress (challenge_id, match_id, location_id)
        values (v_ch.id, v_match_id, p_location_id)
        on conflict (challenge_id, match_id, location_id) where match_id is not null do nothing;
        select count(*) into v_locations_hit
        from challenge_distinct_progress where challenge_id = v_ch.id and match_id = v_match_id;
      else
        insert into challenge_distinct_progress (challenge_id, match_id, location_id)
        values (v_ch.id, null, p_location_id)
        on conflict (challenge_id, location_id) where match_id is null do nothing;
        select count(*) into v_locations_hit
        from challenge_distinct_progress where challenge_id = v_ch.id and match_id is null;
      end if;
      update challenges set current_value = least(v_locations_hit, target_value) where id = v_ch.id;

    elsif v_ch.kind = 'simple' then
      update challenges set is_completed = true, current_value = coalesce(target_value, 1) where id = v_ch.id;

    elsif v_ch.match_scope = 'any_match' then
      if v_ch.rules_operator = 'and' and v_ch.total_rules > 1 then
        foreach v_rule_id in array v_ch.matched_rule_ids loop
          insert into match_rule_progress (match_id, challenge_id, challenge_rule_id, amount)
          values (null, v_ch.id, v_rule_id, 1)
          on conflict (challenge_rule_id) where match_id is null do nothing;
        end loop;
        select coalesce(max(hit), 0), coalesce(bool_or(hit >= need), false)
        into v_best_hit, v_group_done
        from (
          select count(*) need, count(mrp.challenge_rule_id) hit
          from challenge_rules cr
          left join match_rule_progress mrp
            on mrp.challenge_rule_id = cr.id and mrp.match_id is null
          where cr.challenge_id = v_ch.id
          group by coalesce(cr.rule_group, 0)
        ) g;
        update challenges
        set current_value = case when v_group_done then target_value else least(v_best_hit, target_value) end
        where id = v_ch.id;
      else
        update challenges
        set current_value = least(coalesce(current_value, 0) + p_amount, target_value)
        where id = v_ch.id;
      end if;

    elsif v_ch.match_scope = 'same_match' then
      if v_ch.total_rules > 1 then
        foreach v_rule_id in array v_ch.matched_rule_ids loop
          insert into match_rule_progress (match_id, challenge_id, challenge_rule_id, amount)
          values (v_match_id, v_ch.id, v_rule_id, 1)
          on conflict (match_id, challenge_rule_id) where match_id is not null do nothing;
        end loop;
        select coalesce(max(hit), 0), coalesce(bool_or(hit >= need), false)
        into v_best_hit, v_group_done
        from (
          select count(*) need, count(mrp.challenge_rule_id) hit
          from challenge_rules cr
          left join match_rule_progress mrp
            on mrp.challenge_rule_id = cr.id and mrp.match_id = v_match_id
          where cr.challenge_id = v_ch.id
          group by coalesce(cr.rule_group, 0)
        ) g;
        update challenges
        set current_value = case when v_group_done then target_value else least(v_best_hit, target_value) end
        where id = v_ch.id;
      else
        v_rule_id := v_ch.matched_rule_ids[1];
        insert into match_rule_progress (match_id, challenge_id, challenge_rule_id, amount)
        values (v_match_id, v_ch.id, v_rule_id, p_amount)
        on conflict (match_id, challenge_rule_id) where match_id is not null
        do update set amount = match_rule_progress.amount + excluded.amount;
        select amount into v_match_amount
        from match_rule_progress
        where challenge_id = v_ch.id and challenge_rule_id = v_rule_id and match_id = v_match_id;
        update challenges set current_value = least(v_match_amount, target_value) where id = v_ch.id;
      end if;

    else
      foreach v_rule_id in array v_ch.matched_rule_ids loop
        insert into match_rule_progress (match_id, challenge_id, challenge_rule_id, amount)
        values (v_match_id, v_ch.id, v_rule_id, 1)
        on conflict (match_id, challenge_rule_id) where match_id is not null do nothing;
      end loop;
      select count(distinct match_id) into v_matches_hit
      from match_rule_progress where challenge_id = v_ch.id and match_id is not null;
      update challenges set current_value = least(v_matches_hit, target_value) where id = v_ch.id;
    end if;

    select id, description, current_value, target_value, is_completed
    into v_row from challenges where id = v_ch.id;
    v_updated := v_updated || jsonb_build_object(
      'id', v_row.id, 'description', v_row.description,
      'current_value', v_row.current_value, 'target_value', v_row.target_value,
      'is_completed', v_row.is_completed
    );
  end loop;

  if p_used_object_id is not null then
    for v_eff in
      select effect_action, amount_per_use
      from object_effects
      where object_id = p_used_object_id and trigger_action = p_action_code
    loop
      v_sub := public.report_event(
        v_eff.effect_action, p_amount * v_eff.amount_per_use,
        p_used_object_id, null, null, null, null, '{}'
      );
      v_updated := v_updated || coalesce(v_sub->'updated', '[]'::jsonb);
      v_skipped := v_skipped || coalesce(v_sub->'skipped', '[]'::jsonb);
    end loop;
  end if;

  if p_action_code <> 'visit' and p_location_id is not null then
    v_sub := public.report_event('visit', 1, null, null, null, null, p_location_id, '{}');
    v_updated := v_updated || coalesce(v_sub->'updated', '[]'::jsonb);
    v_skipped := v_skipped || coalesce(v_sub->'skipped', '[]'::jsonb);
  end if;

  for v_imp in
    select implied_action, implied_object_code
    from event_implications
    where trigger_action = p_action_code
      and (trigger_condition is null or trigger_condition = any(coalesce(p_conditions, '{}')))
  loop
    if v_imp.implied_object_code is not null then
      select id into v_imp_obj from game_objects where code = v_imp.implied_object_code;
      v_imp_tag := null;
    else
      v_imp_obj := p_used_object_id; v_imp_tag := p_used_tag_id;
    end if;
    if v_imp_obj is not null or v_imp_tag is not null then
      v_sub := public.report_event(v_imp.implied_action, 1, v_imp_obj, v_imp_tag, null, null, null, '{}');
      v_updated := v_updated || coalesce(v_sub->'updated', '[]'::jsonb);
      v_skipped := v_skipped || coalesce(v_sub->'skipped', '[]'::jsonb);
    end if;
  end loop;

  return jsonb_build_object(
    'updated', v_updated, 'skipped', v_skipped, 'has_active_match', v_match_id is not null
  );
end;
$function$;
