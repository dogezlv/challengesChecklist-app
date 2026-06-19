-- ============================================================
-- 17_prestige_rewrite_w1_w2.sql — Reescritura de 11 desafíos de prestigio
-- (Semana 1 y 2) a objetivos a medida. Cambia descripción/tipo/escala y
-- reconstruye las reglas. Varios objetivos llevan una condición manual que el
-- supervisor controla (p. ej. "sin recibir daño"); la regla cubre la acción
-- base para que el tracker muestre el control adecuado.
-- Idempotente: si ya se aplicó (no encuentra el texto viejo) lo salta.
-- ============================================================

create or replace function pg_temp.findclear(p_match text)
returns uuid language plpgsql as $f$
declare v uuid;
begin
  select c.id into v
  from challenges c
  join challenge_weeks w on w.id = c.week_id
  join seasons s on s.id = w.season_id
  where s.code = 'season_8' and c.is_prestige and c.description ilike p_match
  order by c.created_at limit 1;
  if v is null then
    raise notice 'sin match (ya cambiado?): %', p_match; return null;
  end if;
  delete from rule_conditions where challenge_rule_id in (select id from challenge_rules where challenge_id = v);
  delete from challenge_rules where challenge_id = v;
  return v;
end $f$;

-- atajos de id por código
create or replace function pg_temp.act(c text) returns uuid language sql as $$ select id from action_types where code=c $$;
create or replace function pg_temp.tag(c text) returns uuid language sql as $$ select id from tags where code=c $$;
create or replace function pg_temp.obj(c text) returns uuid language sql as $$ select id from game_objects where code=c $$;
create or replace function pg_temp.loc(c text) returns uuid language sql as $$ select id from locations where code=c $$;

do $$
declare v uuid;
begin
  -- 1) respiraderos: 15 distintos en la misma partida
  v := pg_temp.findclear('%respiraderos volc%nicos en 5 partidas%');
  if v is not null then
    update challenges set description='Usa 15 respiraderos volcánicos diferentes en la misma partida',
      kind='progress', unit='count', match_scope='same_match', target_value=15, current_value=0, is_completed=false, rules_operator='and' where id=v;
    insert into challenge_rules(challenge_id, action_type_id, required_object_id) values (v, pg_temp.act('use'), pg_temp.obj('volcano_vent'));
  end if;

  -- 2) eliminaciones en Metrópoli Mercantil o Cruce Chatarra (0/7)
  v := pg_temp.findclear('%Registra 8 cofres%');
  if v is not null then
    update challenges set description='Consigue eliminaciones en Metrópoli Mercantil o Cruce Chatarra',
      kind='progress', unit='count', match_scope='any_match', target_value=7, current_value=0, is_completed=false, rules_operator='or' where id=v;
    insert into challenge_rules(challenge_id, action_type_id, location_id) values (v, pg_temp.act('kill'), pg_temp.loc('retail_row'));
    insert into challenge_rules(challenge_id, action_type_id, location_id) values (v, pg_temp.act('kill'), pg_temp.loc('junk_juction'));
  end if;

  -- 3) destruye 3 vehículos conducidos por un oponente
  v := pg_temp.findclear('%Inflige 600 de da%o con fusiles%');
  if v is not null then
    update challenges set description='Destruye 3 vehículos conducidos por un oponente',
      kind='progress', unit='count', match_scope='any_match', target_value=3, current_value=0, is_completed=false, rules_operator='and' where id=v;
    insert into challenge_rules(challenge_id, action_type_id, target_tag_id) values (v, pg_temp.act('destroy'), pg_temp.tag('vehicle'));
  end if;

  -- 4) una eliminación con explosivo Y escopeta en la misma partida
  v := pg_temp.findclear('%750 de da%o a oponentes con armas explosivas%');
  if v is not null then
    update challenges set description='Consigue una eliminación con explosivo y escopeta en la misma partida',
      kind='progress', unit='count', match_scope='same_match', target_value=2, current_value=0, is_completed=false, rules_operator='and' where id=v;
    insert into challenge_rules(challenge_id, action_type_id, required_tag_id) values (v, pg_temp.act('kill'), pg_temp.tag('explosive'));
    insert into challenge_rules(challenge_id, action_type_id, required_tag_id) values (v, pg_temp.act('kill'), pg_temp.tag('shotgun'));
  end if;

  -- 5) 2 puntos cardinales opuestos en la misma partida
  v := pg_temp.findclear('%puntos m%s al norte, sur, este y oeste%');
  if v is not null then
    update challenges set description='Visita 2 puntos cardinales opuestos en el mapa en la misma partida',
      kind='progress', unit='count', match_scope='same_match', target_value=2, current_value=0, is_completed=false, rules_operator='and' where id=v;
    insert into challenge_rules(challenge_id, action_type_id, location_id) values (v, pg_temp.act('visit'), pg_temp.loc('north_point'));
    insert into challenge_rules(challenge_id, action_type_id, location_id) values (v, pg_temp.act('visit'), pg_temp.loc('south_point'));
    insert into challenge_rules(challenge_id, action_type_id, location_id) values (v, pg_temp.act('visit'), pg_temp.loc('east_point'));
    insert into challenge_rules(challenge_id, action_type_id, location_id) values (v, pg_temp.act('visit'), pg_temp.loc('west_point'));
  end if;

  -- 6) una eliminación con el cañón pirata
  v := pg_temp.findclear('%da%o a oponentes con un ca%n pirata%');
  if v is not null then
    update challenges set description='Consigue una eliminación con el cañón pirata',
      kind='progress', unit='count', match_scope='any_match', target_value=1, current_value=0, is_completed=false, rules_operator='and' where id=v;
    insert into challenge_rules(challenge_id, action_type_id, required_object_id) values (v, pg_temp.act('kill'), pg_temp.obj('pirate_cannon'));
  end if;

  -- 7) registra una entrega de suministros antes de 10 s de aterrizar
  v := pg_temp.findclear('%da%o a entregas de suministros%');
  if v is not null then
    update challenges set description='Registra una entrega de suministros antes de 10 segundos de que aterrice',
      kind='progress', unit='count', match_scope='any_match', target_value=1, current_value=0, is_completed=false, rules_operator='and' where id=v;
    insert into challenge_rules(challenge_id, action_type_id, target_object_id) values (v, pg_temp.act('search'), pg_temp.obj('supply_drop'));
  end if;

  -- 8) aterriza en Palmeras Paradisíacas y gana la partida
  v := pg_temp.findclear('%Aterriza en Palmeras Paradis%acas%');
  if v is not null then
    update challenges set description='Aterriza en Palmeras Paradisíacas y gana la partida',
      kind='progress', unit='count', match_scope='any_match', target_value=1, current_value=0, is_completed=false, rules_operator='and' where id=v;
    insert into challenge_rules(challenge_id, action_type_id, location_id) values (v, pg_temp.act('land'), pg_temp.loc('paradise_palms'));
  end if;

  -- 9) eliminaciones sin recibir daño entre ellas (0/3)
  v := pg_temp.findclear('%eliminaciones en Salpiconeros Salados o Lomas L%gubres%');
  if v is not null then
    update challenges set description='Consigue eliminaciones sin recibir daño entre ellas',
      kind='progress', unit='count', match_scope='any_match', target_value=3, current_value=0, is_completed=false, rules_operator='and' where id=v;
    insert into challenge_rules(challenge_id, action_type_id) values (v, pg_temp.act('kill'));
  end if;

  -- 10) no registres cofres con nombre y sobrevive a 75 jugadores
  v := pg_temp.findclear('%Registra un cofre en 3 lugares con nombre%');
  if v is not null then
    update challenges set description='No registres ningún cofre en ubicaciones con nombre y sobrevive a 75 jugadores',
      kind='progress', unit='value', match_scope='same_match', target_value=75, current_value=0, is_completed=false, rules_operator='and' where id=v;
    insert into challenge_rules(challenge_id, action_type_id) values (v, pg_temp.act('outlast'));
  end if;

  -- 11) gana salud o escudo con un bidón de plasma (0/180)
  v := pg_temp.findclear('%Gana salud con un botiqu%n%');
  if v is not null then
    update challenges set description='Gana salud o escudo con un bidón de plasma',
      kind='progress', unit='value', match_scope='any_match', target_value=180, current_value=0, is_completed=false, rules_operator='and' where id=v;
    insert into challenge_rules(challenge_id, action_type_id) values (v, pg_temp.act('gain'));
  end if;
end $$;
