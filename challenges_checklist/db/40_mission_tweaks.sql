-- ============================================================
-- 40_mission_tweaks.sql — Ajustes de misiones S8 (prestigio + engine)
-- ============================================================

-- ── Objetos nuevos ────────────────────────────────────────────────────────────
insert into public.game_objects (code, display_name, display_name_en, is_weapon)
values
  ('coconut', 'Coco', 'Coconut', false),
  ('pepper', 'Pimiento picante', 'Pepper', false),
  ('banana', 'Banana', 'Banana', false),
  ('infinity_blade', 'Espada del infinito', 'Infinity Blade', true)
on conflict (code) do update set
  display_name = excluded.display_name,
  display_name_en = excluded.display_name_en,
  is_weapon = excluded.is_weapon;

insert into public.game_object_tags (object_id, tag_id)
select o.id, t.id
from game_objects o
cross join tags t
where o.code in ('coconut', 'pepper', 'banana')
  and t.code in ('foraged', 'consumable')
on conflict do nothing;

-- Bidón/sorbete: ganar cantidad parcial vía categoría «ganar», no auto-efecto al usar
delete from public.object_effects oe
using public.game_objects o
where oe.object_id = o.id and o.code in ('chug_jug', 'slurp_juice');

-- ── W2: bidón de plasma 200 ───────────────────────────────────────────────────
update challenges c
set description = 'Gana salud o escudo con un bidón de plasma',
    target_value = 200
from challenge_weeks w
join seasons s on s.id = w.season_id
where c.week_id = w.id and s.code = 'season_8' and w.week_number = 2
  and c.is_prestige and c.description ilike '%bidón de plasma%';

-- ── W3: restaurar visita 3 POIs (db/29 la sustituyó por estatuas de hielo) ───
do $$
declare
  v_week uuid;
  v_id uuid;
begin
  select w.id into v_week
  from challenge_weeks w join seasons s on s.id = w.season_id
  where s.code = 'season_8' and w.week_number = 3;

  if v_week is null then return; end if;

  select c.id into v_id from challenges c
  where c.week_id = v_week and c.is_prestige
    and c.description ilike '%Visita Aeroparque Ártico%Terreno Tormentoso%Balsa Botín%'
  limit 1;

  if v_id is not null then return; end if;

  insert into challenges (
    week_id, description, kind, unit, match_scope, target_value,
    is_prestige, is_meta, rules_operator, current_value, is_completed
  ) values (
    v_week,
    'Visita Aeroparque Ártico, Terreno Tormentoso y Balsa Botín en una sola partida',
    'progress', 'count', 'same_match', 3,
    true, false, 'and', 0, false
  ) returning id into v_id;

  insert into challenge_rules (challenge_id, action_type_id, location_id)
  select v_id, (select id from action_types where code = 'visit'), l.id
  from locations l
  where l.code in ('frosty_flights', 'fatal_fields', 'loot_lake');
end $$;

-- ── W3 prestigio estatuas hielo: sobrevivir 90 jugadores ─────────────────────
update challenges c
set description = 'Aterriza en las estatuas de hielo al caer del autobús de batalla y sobrevive a 90 jugadores en la misma partida'
from challenge_weeks w join seasons s on s.id = w.season_id
where c.week_id = w.id and s.code = 'season_8' and w.week_number = 3
  and c.is_prestige and c.phase_order = 1
  and c.description ilike '%estatuas de hielo%';

update challenges c
set description = 'Sobrevive a 90 jugadores en la misma partida',
    target_value = 90, current_value = least(coalesce(c.current_value, 0), 90)
from challenge_weeks w join seasons s on s.id = w.season_id
where c.week_id = w.id and s.code = 'season_8' and w.week_number = 3
  and c.is_prestige and c.phase_order = 2
  and c.description ilike '%Sobrevive a %jugadores%';

-- ── W4: 6 bolonchos ───────────────────────────────────────────────────────────
update challenges c
set description = 'Destruye 6 bolonchos en la misma partida', target_value = 6
from challenge_weeks w join seasons s on s.id = w.season_id
where c.week_id = w.id and s.code = 'season_8' and w.week_number = 4
  and c.is_prestige and c.description ilike '%boloncho%';

-- ── W5: pelota 30 botes ───────────────────────────────────────────────────────
update challenges c
set description = 'Consigue 30 botes en un solo lanzamiento con la pelota saltarina dentro de un animal'
from challenge_weeks w join seasons s on s.id = w.season_id
where c.week_id = w.id and s.code = 'season_8' and w.week_number = 5
  and c.is_prestige and c.description ilike '%pelota saltarina%';

update rule_conditions rc
set condition_key = 'thirty_bounces_in_animal',
    condition_value = '🦴 30 botes seguidos dentro de un animal'
from challenge_rules cr
join challenges c on c.id = cr.challenge_id
join challenge_weeks w on w.id = c.week_id
join seasons s on s.id = w.season_id
where rc.challenge_rule_id = cr.id
  and rc.condition_key = 'fifteen_bounces_in_animal'
  and s.code = 'season_8' and w.week_number = 5 and c.is_prestige;

-- ── W6: consumir 5 tipos de alimento distintos ────────────────────────────────
do $$
declare v_id uuid;
begin
  select c.id into v_id
  from challenges c
  join challenge_weeks w on w.id = c.week_id
  join seasons s on s.id = w.season_id
  where s.code = 'season_8' and w.week_number = 6 and c.is_prestige
    and c.description ilike '%objetos arrojadizos%'
  limit 1;
  if v_id is null then return; end if;

  update challenges set
    description = 'Consume diferentes tipos de alimento',
    kind = 'progress', unit = 'count', match_scope = 'same_match',
    target_value = 5, rules_operator = 'and', current_value = 0, is_completed = false
  where id = v_id;

  delete from rule_conditions where challenge_rule_id in (select id from challenge_rules where challenge_id = v_id);
  delete from challenge_rules where challenge_id = v_id;
  delete from match_rule_progress where challenge_id = v_id;

  insert into challenge_rules (challenge_id, action_type_id, required_object_id)
  select v_id, (select id from action_types where code = 'use'), o.id
  from game_objects o
  where o.code in ('apple', 'mushroom', 'coconut', 'pepper', 'banana');
end $$;

-- ── W8: espada del infinito (ex teléfonos gigantes) ───────────────────────────
do $$
declare v_id uuid;
begin
  select c.id into v_id
  from challenges c
  join challenge_weeks w on w.id = c.week_id
  join seasons s on s.id = w.season_id
  where s.code = 'season_8' and w.week_number = 8 and c.is_prestige
    and (c.description ilike '%teléfonos gigantes%' or c.description ilike '%teléfono gigante%')
  limit 1;
  if v_id is null then return; end if;

  update challenges set
    description = 'Consigue una eliminación usando la espada del infinito',
    kind = 'progress', unit = 'count', match_scope = 'any_match',
    target_value = 1, rules_operator = 'and', current_value = 0, is_completed = false
  where id = v_id;

  delete from rule_conditions where challenge_rule_id in (select id from challenge_rules where challenge_id = v_id);
  delete from challenge_rules where challenge_id = v_id;
  delete from match_rule_progress where challenge_id = v_id;

  insert into challenge_rules (challenge_id, action_type_id, required_object_id)
  values (v_id, (select id from action_types where code = 'kill'),
          (select id from game_objects where code = 'infinity_blade'));
end $$;

-- ── W8 prestigio: puentes nevados y desérticos ────────────────────────────────
update challenges c
set description = 'Pasa por debajo de puentes nevados y desérticos en la misma partida'
from challenge_weeks w join seasons s on s.id = w.season_id
where c.week_id = w.id and s.code = 'season_8' and w.week_number = 8
  and c.is_prestige and c.description ilike '%puentes%partida%';

-- ── W9: texto reanimación ─────────────────────────────────────────────────────
update challenges c
set description = 'Elimina a un oponente después de que te reanimen en una furgoneta de reinicio'
from challenge_weeks w join seasons s on s.id = w.season_id
where c.week_id = w.id and s.code = 'season_8' and w.week_number = 9
  and c.is_prestige
  and c.description ilike '%furgoneta de reinicio%';

update rule_conditions rc
set condition_value = '🔁 Te reanimaron en furgoneta de reinicio'
from challenge_rules cr
join challenges c on c.id = cr.challenge_id
join challenge_weeks w on w.id = c.week_id
join seasons s on s.id = w.season_id
where rc.challenge_rule_id = cr.id
  and rc.condition_key = 'target_revived'
  and s.code = 'season_8' and w.week_number = 9 and c.is_prestige;

-- ── W10: materiales 500 c/u → progreso 0/1500 ────────────────────────────────
update challenges c
set description = 'Recolecta 500 de cada material en la misma partida',
    target_value = 1500,
    current_value = least(coalesce(c.current_value, 0), 1500)
from challenge_weeks w join seasons s on s.id = w.season_id
where c.week_id = w.id and s.code = 'season_8' and w.week_number = 10
  and c.is_prestige and c.description ilike 'Recolecta 500 de cada material%';

-- ── report_event: AND+value+same_match suma por regla (cap 500 c/u en S10) ───
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
  v_per_rule_cap bigint;
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
        not exists (
          select 1 from rule_conditions rc3
          where rc3.challenge_rule_id = cr.id
            and rc3.condition_key = 'named_landing_after_3_vents'
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
      if v_ch.rules_operator = 'or' and v_ch.unit = 'value' and v_ch.total_rules > 1 then
        foreach v_rule_id in array v_ch.matched_rule_ids loop
          insert into match_rule_progress (match_id, challenge_id, challenge_rule_id, amount)
          values (v_match_id, v_ch.id, v_rule_id, p_amount)
          on conflict (match_id, challenge_rule_id) where match_id is not null
          do update set amount = match_rule_progress.amount + excluded.amount;
        end loop;
        select coalesce(sum(amount), 0) into v_match_amount
        from match_rule_progress
        where challenge_id = v_ch.id and match_id = v_match_id;
        update challenges set current_value = least(v_match_amount, target_value) where id = v_ch.id;
      elsif v_ch.rules_operator = 'and' and v_ch.unit = 'value' and v_ch.total_rules > 1 then
        v_per_rule_cap := v_ch.target_value / v_ch.total_rules;
        foreach v_rule_id in array v_ch.matched_rule_ids loop
          insert into match_rule_progress (match_id, challenge_id, challenge_rule_id, amount)
          values (v_match_id, v_ch.id, v_rule_id, p_amount)
          on conflict (match_id, challenge_rule_id) where match_id is not null
          do update set amount = least(
            match_rule_progress.amount + excluded.amount,
            v_per_rule_cap
          );
        end loop;
        select coalesce(sum(least(coalesce(mrp.amount, 0), v_per_rule_cap)), 0),
               coalesce(bool_and(coalesce(mrp.amount, 0) >= v_per_rule_cap), false)
        into v_match_amount, v_group_done
        from challenge_rules cr
        left join match_rule_progress mrp
          on mrp.challenge_rule_id = cr.id and mrp.match_id = v_match_id
        where cr.challenge_id = v_ch.id;
        update challenges
        set current_value = case
          when v_group_done then target_value
          else least(v_match_amount, target_value)
        end
        where id = v_ch.id;
      elsif v_ch.total_rules > 1 then
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
