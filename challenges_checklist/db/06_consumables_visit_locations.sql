-- ============================================================
-- 06_consumables_visit_locations.sql
--   * object_effects: consumibles con efecto (manzana +5 vida, seta +5
--     escudo — valores de la Temporada 8). report_event v3: al registrar
--     'use' de un objeto con efecto, dispara un evento 'gain' sintético
--     (cantidad × valor) que avanza los desafíos de ganar vida/escudo.
--   * Visitar/bailar son LUGARES: los objetivos-objeto de esas categorías
--     (aguas termales, dinosaurio, escultura de hielo, conejo de madera,
--     cerdo de piedra, llama de metal) pasan a locations; los letreros del
--     tesoro obtienen lugar propio (conservando de qué POI son).
--   * El cactus pierde la restricción de lugar 'desert' (no hay cactus en
--     otro sitio).
-- ============================================================

-- 1. Consumibles con efecto
create table if not exists public.object_effects (
  id uuid primary key default gen_random_uuid(),
  object_id uuid not null references public.game_objects(id) on delete cascade,
  trigger_action text not null default 'use',  -- acción que lo dispara
  effect_action text not null default 'gain',  -- acción sintética emitida
  amount_per_use bigint not null,              -- vida/escudo por unidad
  created_at timestamptz default now(),
  unique (object_id, trigger_action, effect_action)
);

alter table public.object_effects enable row level security;
drop policy if exists "Authenticated can read object_effects" on public.object_effects;
create policy "Authenticated can read object_effects"
  on public.object_effects for select to authenticated using (true);
grant select on public.object_effects to authenticated;

insert into public.object_effects (object_id, trigger_action, effect_action, amount_per_use)
select o.id, 'use', 'gain', v.amount
from (values ('apple', 5), ('mushroom', 5)) as v(code, amount)
join public.game_objects o on o.code = v.code
on conflict do nothing;

-- 2. Objetivos de visitar/bailar → lugares (named_location = false)
do $$
declare
  o record;
  v_loc uuid;
begin
  for o in
    select distinct go.id, go.code, go.display_name
    from challenge_rules cr
    join action_types at on at.id = cr.action_type_id
    join game_objects go on go.id = cr.target_object_id
    where at.code in ('visit', 'dance')
      and go.code <> 'treasure_signpost'
  loop
    select id into v_loc from locations where code = o.code;
    if v_loc is null then
      insert into locations (code, display_name, named_location)
      values (o.code, o.display_name, false)
      returning id into v_loc;
    end if;

    update challenge_rules cr
    set location_id = v_loc,
        target_object_id = null
    from action_types at
    where at.id = cr.action_type_id
      and at.code in ('visit', 'dance')
      and cr.target_object_id = o.id;
  end loop;
end $$;

-- letreros del tesoro: lugar propio por POI
do $$
declare
  p text[];
  v_loc uuid;
begin
  foreach p slice 1 in array array[
    ['paradise_palms', 'treasure_signpost_paradise', 'Letrero del tesoro de Palmeras Paradisíacas'],
    ['junk_juction',   'treasure_signpost_junk',     'Letrero del tesoro de Cruce Chatarra']
  ]
  loop
    select id into v_loc from locations where code = p[2];
    if v_loc is null then
      insert into locations (code, display_name, named_location)
      values (p[2], p[3], false)
      returning id into v_loc;
    end if;

    update challenge_rules cr
    set location_id = v_loc,
        target_object_id = null
    from game_objects go, locations old_l, action_types at
    where go.id = cr.target_object_id and go.code = 'treasure_signpost'
      and old_l.id = cr.location_id and old_l.code = p[1]
      and at.id = cr.action_type_id and at.code = 'visit';
  end loop;
end $$;

-- 3. Cactus sin restricción de lugar
update challenge_rules cr
set location_id = null
from game_objects go, locations l, action_types at
where go.id = cr.target_object_id and go.code = 'cactus'
  and l.id = cr.location_id and l.code = 'desert'
  and at.id = cr.action_type_id and at.code = 'destroy';

-- 4. report_event v3: + efectos de consumibles
create or replace function public.report_event(
  p_action_code text,
  p_amount bigint default 1,
  p_used_object_id uuid default null,
  p_used_tag_id uuid default null,
  p_target_object_id uuid default null,
  p_target_tag_id uuid default null,
  p_location_id uuid default null,
  p_conditions text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_match_id uuid;
  v_ch record;
  v_rule_id uuid;
  v_rules_hit bigint;
  v_matches_hit bigint;
  v_match_amount bigint;
  v_locations_hit bigint;
  v_named boolean;
  v_row record;
  v_eff record;
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

  select id into v_match_id
  from matches
  where is_active = true
  order by started_at desc
  limit 1;

  for v_ch in
    select
      c.id, c.description, c.kind, c.unit, c.match_scope, c.rules_operator,
      c.target_value,
      array_agg(distinct cr.id) as matched_rule_ids,
      (select count(*) from challenge_rules t where t.challenge_id = c.id) as total_rules
    from challenges c
    join challenge_rules cr on cr.challenge_id = c.id
    join action_types act on act.id = cr.action_type_id
    where c.is_completed = false
      and c.is_meta = false
      and act.code = p_action_code
      and (cr.required_object_id is null or cr.required_object_id = p_used_object_id)
      and (
        cr.required_tag_id is null
        or cr.required_tag_id = p_used_tag_id
        or (p_used_object_id is not null and exists (
              select 1 from game_object_tags got
              where got.object_id = p_used_object_id
                and got.tag_id = cr.required_tag_id))
      )
      and (cr.target_object_id is null or cr.target_object_id = p_target_object_id)
      and (
        cr.target_tag_id is null
        or cr.target_tag_id = p_target_tag_id
        or (p_target_object_id is not null and exists (
              select 1 from game_object_tags got
              where got.object_id = p_target_object_id
                and got.tag_id = cr.target_tag_id))
      )
      and (cr.location_id is null or cr.location_id = p_location_id)
      and not exists (
        select 1 from rule_conditions rc
        where rc.challenge_rule_id = cr.id
          and not (rc.condition_key = any(coalesce(p_conditions, '{}')))
      )
      and (
        c.line_id is null or c.phase_order is null
        or not exists (
          select 1 from challenges prev
          where prev.line_id = c.line_id
            and prev.is_completed = false
            and prev.phase_order < c.phase_order
        )
      )
    group by c.id
  loop
    if v_ch.match_scope in ('same_match', 'different_matches') and v_match_id is null then
      v_skipped := v_skipped || jsonb_build_object(
        'id', v_ch.id,
        'description', v_ch.description,
        'reason', 'no_active_match'
      );
      continue;
    end if;

    if v_ch.unit = 'distinct_location' then
      -- cuenta lugares con nombre diferentes; repetir lugar no suma
      v_named := false;
      if p_location_id is not null then
        select named_location into v_named from locations where id = p_location_id;
      end if;

      if not coalesce(v_named, false) then
        v_skipped := v_skipped || jsonb_build_object(
          'id', v_ch.id,
          'description', v_ch.description,
          'reason', 'named_location_required'
        );
        continue;
      end if;

      if v_ch.match_scope = 'same_match' then
        insert into challenge_distinct_progress (challenge_id, match_id, location_id)
        values (v_ch.id, v_match_id, p_location_id)
        on conflict (challenge_id, match_id, location_id) where match_id is not null do nothing;

        select count(*) into v_locations_hit
        from challenge_distinct_progress
        where challenge_id = v_ch.id and match_id = v_match_id;
      else
        insert into challenge_distinct_progress (challenge_id, match_id, location_id)
        values (v_ch.id, null, p_location_id)
        on conflict (challenge_id, location_id) where match_id is null do nothing;

        select count(*) into v_locations_hit
        from challenge_distinct_progress
        where challenge_id = v_ch.id and match_id is null;
      end if;

      update challenges
      set current_value = least(v_locations_hit, target_value)
      where id = v_ch.id;

    elsif v_ch.kind = 'simple' then
      update challenges
      set is_completed = true,
          current_value = coalesce(target_value, 1)
      where id = v_ch.id;

    elsif v_ch.match_scope = 'any_match' then
      if v_ch.rules_operator = 'and' and v_ch.total_rules > 1 then
        foreach v_rule_id in array v_ch.matched_rule_ids loop
          insert into match_rule_progress (match_id, challenge_id, challenge_rule_id, amount)
          values (null, v_ch.id, v_rule_id, 1)
          on conflict (challenge_rule_id) where match_id is null do nothing;
        end loop;

        select count(*) into v_rules_hit
        from match_rule_progress
        where challenge_id = v_ch.id and match_id is null;

        update challenges
        set current_value = least(v_rules_hit, target_value)
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

        select count(*) into v_rules_hit
        from match_rule_progress
        where challenge_id = v_ch.id and match_id = v_match_id;

        if v_rules_hit >= v_ch.total_rules then
          update challenges set current_value = target_value where id = v_ch.id;
        else
          update challenges
          set current_value = least(v_rules_hit, target_value)
          where id = v_ch.id;
        end if;
      else
        v_rule_id := v_ch.matched_rule_ids[1];

        insert into match_rule_progress (match_id, challenge_id, challenge_rule_id, amount)
        values (v_match_id, v_ch.id, v_rule_id, p_amount)
        on conflict (match_id, challenge_rule_id) where match_id is not null
        do update set amount = match_rule_progress.amount + excluded.amount;

        select amount into v_match_amount
        from match_rule_progress
        where challenge_id = v_ch.id
          and challenge_rule_id = v_rule_id
          and match_id = v_match_id;

        update challenges
        set current_value = least(v_match_amount, target_value)
        where id = v_ch.id;
      end if;

    else -- different_matches: una vez por partida
      foreach v_rule_id in array v_ch.matched_rule_ids loop
        insert into match_rule_progress (match_id, challenge_id, challenge_rule_id, amount)
        values (v_match_id, v_ch.id, v_rule_id, 1)
        on conflict (match_id, challenge_rule_id) where match_id is not null do nothing;
      end loop;

      select count(distinct match_id) into v_matches_hit
      from match_rule_progress
      where challenge_id = v_ch.id and match_id is not null;

      update challenges
      set current_value = least(v_matches_hit, target_value)
      where id = v_ch.id;
    end if;

    select id, description, current_value, target_value, is_completed
    into v_row
    from challenges
    where id = v_ch.id;

    v_updated := v_updated || jsonb_build_object(
      'id', v_row.id,
      'description', v_row.description,
      'current_value', v_row.current_value,
      'target_value', v_row.target_value,
      'is_completed', v_row.is_completed
    );
  end loop;

  -- consumibles: usar el objeto dispara su efecto sintético
  -- (p. ej. 3 manzanas → gain de 15 de vida con la manzana como objeto)
  if p_used_object_id is not null then
    for v_eff in
      select effect_action, amount_per_use
      from object_effects
      where object_id = p_used_object_id
        and trigger_action = p_action_code
    loop
      v_sub := public.report_event(
        v_eff.effect_action,
        p_amount * v_eff.amount_per_use,
        p_used_object_id, null, null, null, null, '{}'
      );
      v_updated := v_updated || coalesce(v_sub->'updated', '[]'::jsonb);
      v_skipped := v_skipped || coalesce(v_sub->'skipped', '[]'::jsonb);
    end loop;
  end if;

  return jsonb_build_object(
    'updated', v_updated,
    'skipped', v_skipped,
    'has_active_match', v_match_id is not null
  );
end;
$fn$;
