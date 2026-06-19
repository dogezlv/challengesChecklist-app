-- ============================================================
-- 22_prestige_w3_w5.sql
-- Prestigios personalizados semanas 3–5. Idempotente por semana +
-- descripción actual del prestigio. Son desafíos independientes por semana;
-- solo se desbloquean al completar todos los normales de la semana.
-- ============================================================

-- ── Catálogo nuevo ─────────────────────────────────────────────────────────
insert into public.game_objects (code, display_name, display_name_en, is_weapon)
values
  ('slurp_juice', 'Jugo de sorbete', 'Slurp Juice', false),
  ('quad_crasher', 'Quad Crasher', 'Quadcrasher', false),
  ('driftboard', 'Patineta', 'Driftboard', false),
  ('camo_bush', 'Arbusto', 'Bush', false)
on conflict (code) do nothing;

insert into public.game_object_tags (object_id, tag_id)
select o.id, t.id
from public.game_objects o
cross join public.tags t
where (o.code, t.code) in (
  ('quad_crasher', 'vehicle'),
  ('driftboard', 'vehicle')
)
on conflict do nothing;

insert into public.object_effects (object_id, trigger_action, effect_action, amount_per_use)
select o.id, 'use', 'gain', 25
from public.game_objects o
where o.code = 'slurp_juice'
on conflict do nothing;

insert into public.locations (code, display_name, display_name_en, named_location)
values
  ('pleasant_park_soccer', 'Cancha de fútbol de Parque Placentero', 'Pleasant Park Soccer Field', false),
  ('tilted_towers_clock', 'Torre del reloj de Rascacielos Recortados', 'Tilted Towers Clock Tower', false)
on conflict (code) do nothing;

-- ── Helpers ─────────────────────────────────────────────────────────────────
create or replace function pg_temp.findclear_w(p_week int, p_match text)
returns uuid language plpgsql as $f$
declare v uuid;
begin
  select c.id into v
  from challenges c
  join challenge_weeks w on w.id = c.week_id
  join seasons s on s.id = w.season_id
  where s.code = 'season_8'
    and w.week_number = p_week
    and c.is_prestige
    and c.description ilike p_match
  order by c.created_at
  limit 1;
  if v is null then
    raise notice 'sin match S% (ya cambiado?): %', p_week, p_match;
    return null;
  end if;
  delete from rule_conditions
  where challenge_rule_id in (select id from challenge_rules where challenge_id = v);
  delete from challenge_rules where challenge_id = v;
  delete from match_rule_progress where challenge_id = v;
  delete from challenge_distinct_progress where challenge_id = v;
  return v;
end $f$;

create or replace function pg_temp.act(c text) returns uuid language sql as $$
  select id from action_types where code = c
$$;
create or replace function pg_temp.tag(c text) returns uuid language sql as $$
  select id from tags where code = c
$$;
create or replace function pg_temp.obj(c text) returns uuid language sql as $$
  select id from game_objects where code = c
$$;
create or replace function pg_temp.loc(c text) returns uuid language sql as $$
  select id from locations where code = c
$$;

do $$
declare v uuid; r uuid;
begin
  -- ═══════════════════════════════════════════════════════════════════════════
  -- SEMANA 3
  -- ═══════════════════════════════════════════════════════════════════════════

  -- #3 biomas → eliminaciones en la jungla
  v := pg_temp.findclear_w(3, '%Inflige da%o de disparos a la cabeza a oponentes%');
  if v is not null then
    update challenges set
      description = 'Consigue eliminaciones en la jungla',
      kind = 'progress', unit = 'count', match_scope = 'any_match',
      target_value = 3, current_value = 0, is_completed = false,
      rules_operator = 'and'
    where id = v;
    insert into challenge_rules (challenge_id, action_type_id, location_id)
    values (v, pg_temp.act('kill'), pg_temp.loc('jungle'));
  end if;

  -- #4 visitas → 3 POIs misma partida
  v := pg_temp.findclear_w(3, '%Busca donde se posa la lupa%');
  if v is not null then
    update challenges set
      description = 'Visita Aeroparque Ártico, Terreno Tormentoso y Balsa Botín en una sola partida',
      kind = 'progress', unit = 'count', match_scope = 'same_match',
      target_value = 3, current_value = 0, is_completed = false,
      rules_operator = 'and'
    where id = v;
    insert into challenge_rules (challenge_id, action_type_id, location_id) values
      (v, pg_temp.act('visit'), pg_temp.loc('frosty_flights')),
      (v, pg_temp.act('visit'), pg_temp.loc('fatal_fields')),
      (v, pg_temp.act('visit'), pg_temp.loc('lucky_landing'));
  end if;

  -- #7 armas → pistola + francotirador misma partida
  v := pg_temp.findclear_w(3, '%Registra cofres en la jungla%');
  if v is not null then
    update challenges set
      description = 'Consigue eliminaciones con pistola y fusil de francotirador en la misma partida',
      kind = 'progress', unit = 'count', match_scope = 'same_match',
      target_value = 2, current_value = 0, is_completed = false,
      rules_operator = 'and'
    where id = v;
    insert into challenge_rules (challenge_id, action_type_id, required_tag_id) values
      (v, pg_temp.act('kill'), pg_temp.tag('pistol')),
      (v, pg_temp.act('kill'), pg_temp.tag('sniper'));
  end if;

  -- #8 cofres → eliminaciones Escalones / Terreno Tormentoso
  v := pg_temp.findclear_w(3, '%Coloca 2 objetos de trampa diferentes%');
  if v is not null then
    update challenges set
      description = 'Consigue eliminaciones en Escalones Estivales o Terreno Tormentoso',
      kind = 'progress', unit = 'count', match_scope = 'any_match',
      target_value = 3, current_value = 0, is_completed = false,
      rules_operator = 'or'
    where id = v;
    insert into challenge_rules (challenge_id, action_type_id, location_id) values
      (v, pg_temp.act('kill'), pg_temp.loc('sunny_steps')),
      (v, pg_temp.act('kill'), pg_temp.loc('fatal_fields'));
  end if;

  -- #10 trampas → eliminaciones con trampas
  v := pg_temp.findclear_w(3, '%Consigue eliminaciones con subfusil%');
  if v is not null then
    update challenges set
      description = 'Consigue eliminaciones con trampas',
      kind = 'progress', unit = 'count', match_scope = 'any_match',
      target_value = 2, current_value = 0, is_completed = false,
      rules_operator = 'and'
    where id = v;
    insert into challenge_rules (challenge_id, action_type_id, required_tag_id)
    values (v, pg_temp.act('kill'), pg_temp.tag('trap'));
  end if;

  -- #11 headshot daño → eliminaciones headshot
  v := pg_temp.findclear_w(3, '%Registra cofres en Escalones Estivales o Terreno Tormentoso%');
  if v is not null then
    update challenges set
      description = 'Consigue eliminaciones con disparos a la cabeza',
      kind = 'progress', unit = 'count', match_scope = 'any_match',
      target_value = 3, current_value = 0, is_completed = false,
      rules_operator = 'and'
    where id = v;
    insert into challenge_rules (challenge_id, action_type_id)
    values (v, pg_temp.act('kill'))
    returning id into r;
    insert into rule_conditions (challenge_rule_id, condition_key, condition_value)
    values (r, 'headshot', 'Disparo a la cabeza');
  end if;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- SEMANA 4
  -- ═══════════════════════════════════════════════════════════════════════════

  -- #12 aterrizajes → cancha + torre reloj
  v := pg_temp.findclear_w(4, '%Elimina oponentes en Villa Vivaracha o Parque Placentero%');
  if v is not null then
    update challenges set
      description = 'Visita la cancha de fútbol de Parque Placentero y la torre del reloj de Rascacielos Recortados en la misma partida',
      kind = 'progress', unit = 'count', match_scope = 'same_match',
      target_value = 2, current_value = 0, is_completed = false,
      rules_operator = 'and'
    where id = v;
    insert into challenge_rules (challenge_id, action_type_id, location_id) values
      (v, pg_temp.act('visit'), pg_temp.loc('pleasant_park_soccer')),
      (v, pg_temp.act('visit'), pg_temp.loc('tilted_towers_clock'));
  end if;

  -- #17 sobrevivir → gana partida (prestigio derivado: target 50, same_match)
  select c.id into v
  from challenges c
  join challenge_weeks w on w.id = c.week_id
  join seasons s on s.id = w.season_id
  where s.code = 'season_8' and w.week_number = 4 and c.is_prestige
    and c.target_value = 50 and c.match_scope = 'same_match'
  order by c.created_at limit 1;
  if v is not null then
    delete from rule_conditions where challenge_rule_id in (select id from challenge_rules where challenge_id = v);
    delete from challenge_rules where challenge_id = v;
    delete from match_rule_progress where challenge_id = v;
    delete from challenge_distinct_progress where challenge_id = v;
    update challenges set
      description = 'Gana una partida',
      kind = 'progress', unit = 'count', match_scope = 'any_match',
      target_value = 1, current_value = 0, is_completed = false,
      rules_operator = 'and'
    where id = v;
    insert into challenge_rules (challenge_id, action_type_id)
    values (v, pg_temp.act('outlast'))
    returning id into r;
    insert into rule_conditions (challenge_rule_id, condition_key, condition_value)
    values (r, 'win_match', 'Ganaste la partida');
  end if;

  -- #21 tesoros → suministros + enterrado misma partida
  v := pg_temp.findclear_w(4, '%Aterriza en Parque Placentero (2 veces%');
  if v is not null then
    update challenges set
      description = 'Busca una entrega de suministros y un tesoro enterrado en la misma partida',
      kind = 'progress', unit = 'count', match_scope = 'same_match',
      target_value = 2, current_value = 0, is_completed = false,
      rules_operator = 'and'
    where id = v;
    insert into challenge_rules (challenge_id, action_type_id, target_object_id) values
      (v, pg_temp.act('search'), pg_temp.obj('supply_drop')),
      (v, pg_temp.act('search'), pg_temp.obj('buried_treasure'));
  end if;

  -- #22 cañón → impacto como bola de cañón
  v := pg_temp.findclear_w(4, '%Busca tesoros enterrados (en una sola partida)%');
  if v is not null then
    update challenges set
      description = 'Impacta a un enemigo contigo como bola de cañón',
      kind = 'progress', unit = 'count', match_scope = 'any_match',
      target_value = 1, current_value = 0, is_completed = false,
      rules_operator = 'and'
    where id = v;
    insert into challenge_rules (challenge_id, action_type_id, required_object_id)
    values (v, pg_temp.act('damage'), pg_temp.obj('the_baller'));
  end if;

  -- #23 mira+silenciada → mismo objetivo (prestigio)
  v := pg_temp.findclear_w(4, '%Sobrevive a 80 oponentes en una sola partida%');
  if v is not null then
    update challenges set
      description = 'Consigue una eliminación con un arma con mira y otra con un arma silenciada en la misma partida',
      kind = 'progress', unit = 'count', match_scope = 'same_match',
      target_value = 2, current_value = 0, is_completed = false,
      rules_operator = 'and'
    where id = v;
    insert into challenge_rules (challenge_id, action_type_id, required_tag_id) values
      (v, pg_temp.act('kill'), pg_temp.tag('scoped')),
      (v, pg_temp.act('kill'), pg_temp.tag('suppresed'));
  end if;

  -- #24 boloncho → destruye 5 bolonchos misma partida
  v := pg_temp.findclear_w(4, '%Usa el Boloncho en diferentes partidas%');
  if v is not null then
    update challenges set
      description = 'Destruye 5 bolonchos en la misma partida',
      kind = 'progress', unit = 'count', match_scope = 'same_match',
      target_value = 5, current_value = 0, is_completed = false,
      rules_operator = 'and'
    where id = v;
    insert into challenge_rules (challenge_id, action_type_id, target_object_id)
    values (v, pg_temp.act('destroy'), pg_temp.obj('the_baller'));
  end if;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- SEMANA 5
  -- ═══════════════════════════════════════════════════════════════════════════

  -- #25 escudo → jugo de sorbete
  v := pg_temp.findclear_w(5, '%Inflige da%o con armas con mira a oponentes%');
  if v is not null then
    update challenges set
      description = 'Gana escudo con un jugo de sorbete',
      kind = 'progress', unit = 'value', match_scope = 'any_match',
      target_value = 150, current_value = 0, is_completed = false,
      rules_operator = 'and'
    where id = v;
    insert into challenge_rules (challenge_id, action_type_id, required_object_id)
    values (v, pg_temp.act('gain'), pg_temp.obj('slurp_juice'));
  end if;

  -- #28 volcán/tirolina/vehículo → volcán + patineta + arbusto
  v := pg_temp.findclear_w(5, '%Registra cofres en Palmeras Paradis%acas o Conductos Cambiantes%');
  if v is not null then
    update challenges set
      description = 'Usa el volcán para impulsarte, una patineta y un arbusto en la misma partida',
      kind = 'progress', unit = 'count', match_scope = 'same_match',
      target_value = 3, current_value = 0, is_completed = false,
      rules_operator = 'and'
    where id = v;
    insert into challenge_rules (challenge_id, action_type_id, required_object_id) values
      (v, pg_temp.act('use'), pg_temp.obj('volcano_vent')),
      (v, pg_temp.act('use'), pg_temp.obj('driftboard')),
      (v, pg_temp.act('use'), pg_temp.obj('camo_bush'));
  end if;

  -- #29 pista → vuelta con Quad Crasher
  v := pg_temp.findclear_w(5, '%Gana escudo con pociones de escudo%');
  if v is not null then
    update challenges set
      description = 'Completa una vuelta a la pista de carreras de Villa Vivaracha con un Quad Crasher',
      kind = 'progress', unit = 'count', match_scope = 'any_match',
      target_value = 1, current_value = 0, is_completed = false,
      rules_operator = 'and'
    where id = v;
    insert into challenge_rules (challenge_id, action_type_id, required_object_id, required_tag_id)
    values (v, pg_temp.act('use'), pg_temp.obj('quad_crasher'), pg_temp.tag('misc'))
    returning id into r;
    insert into rule_conditions (challenge_rule_id, condition_key, condition_value)
    values (r, 'race_track_lap', '🏁 Vuelta completa a la pista de carreras');
  end if;

  -- #31 campamentos → eliminaciones en campamentos diferentes
  v := pg_temp.findclear_w(5, '%Consigue 15 botes en un solo lanzamiento%');
  if v is not null then
    update challenges set
      description = 'Elimina oponentes en campamentos piratas diferentes',
      kind = 'progress', unit = 'count', match_scope = 'different_matches',
      target_value = 4, current_value = 0, is_completed = false,
      rules_operator = 'or'
    where id = v;
    insert into challenge_rules (challenge_id, action_type_id, location_id)
    select v, pg_temp.act('kill'), l.id
    from locations l
    where l.code like 'pirate_camp_%';
  end if;

  -- #32 mira daño → eliminaciones con mira
  v := pg_temp.findclear_w(5, '%Elimina oponentes en campamentos piratas (en una sola partida)%');
  if v is not null then
    update challenges set
      description = 'Elimina oponentes con armas con mira',
      kind = 'progress', unit = 'count', match_scope = 'any_match',
      target_value = 2, current_value = 0, is_completed = false,
      rules_operator = 'and'
    where id = v;
    insert into challenge_rules (challenge_id, action_type_id, required_tag_id)
    values (v, pg_temp.act('kill'), pg_temp.tag('scoped'));
  end if;

  -- #33 pelota → cañón pirata hacia el volcán
  v := pg_temp.findclear_w(5, '%Usa un respiradero volc%nico, una tirolina y un veh%culo%');
  if v is not null then
    update challenges set
      description = 'Usa un cañón pirata para dispararte hacia dentro del volcán',
      kind = 'progress', unit = 'count', match_scope = 'any_match',
      target_value = 1, current_value = 0, is_completed = false,
      rules_operator = 'and'
    where id = v;
    insert into challenge_rules (challenge_id, action_type_id, required_object_id)
    values (v, pg_temp.act('use'), pg_temp.obj('pirate_cannon'))
    returning id into r;
    insert into rule_conditions (challenge_rule_id, condition_key, condition_value)
    values (r, 'cannon_into_volcano', '🌋 Disparo hacia dentro del volcán');
  end if;
end $$;
