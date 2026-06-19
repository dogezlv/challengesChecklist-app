-- ============================================================
-- 18_prestige_adapt.sql — Adapta los prestigios de db/17 que NO encajaban con
-- el resto del sistema (motor auto-trackeable). Varios de db/17 llevaban
-- matices que report_event no puede verificar ("antes de 10 s", "y gana la
-- partida", "sin recibir daño", "no registres cofres") o un objeto inexistente
-- ("bidón de plasma"). Aquí se reescriben a objetivos equivalentes pero
-- 100% trackeables, con la redacción de estilo del resto.
-- Idempotente: si no encuentra el texto viejo, salta el bloque.
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

create or replace function pg_temp.act(c text) returns uuid language sql as $$ select id from action_types where code=c $$;
create or replace function pg_temp.tag(c text) returns uuid language sql as $$ select id from tags where code=c $$;
create or replace function pg_temp.obj(c text) returns uuid language sql as $$ select id from game_objects where code=c $$;
create or replace function pg_temp.loc(c text) returns uuid language sql as $$ select id from locations where code=c $$;

do $$
declare v uuid;
begin
  -- #5) "puntos cardinales opuestos" no se puede forzar → 2 puntos cardinales
  -- cualesquiera en una sola partida (mismas reglas, solo texto).
  update challenges set description='Visita 2 puntos cardinales del mapa en una sola partida'
  where id in (
    select c.id from challenges c join challenge_weeks w on w.id=c.week_id join seasons s on s.id=w.season_id
    where s.code='season_8' and c.is_prestige and c.description ilike '%puntos cardinales opuestos%'
  );

  -- #7) "antes de 10 s de aterrizar" no es trackeable → entregas de suministros
  -- en 2 partidas diferentes (search + supply_drop).
  v := pg_temp.findclear('%entrega de suministros antes de 10 segundos%');
  if v is not null then
    update challenges set description='Registra entregas de suministros en 2 partidas diferentes',
      kind='progress', unit='count', match_scope='different_matches', target_value=2, current_value=0, is_completed=false, rules_operator='and' where id=v;
    insert into challenge_rules(challenge_id, action_type_id, target_object_id) values (v, pg_temp.act('search'), pg_temp.obj('supply_drop'));
  end if;

  -- #8) "y gana la partida" no es trackeable → aterriza en Palmeras Paradisíacas
  -- en 3 partidas diferentes (land + paradise_palms).
  v := pg_temp.findclear('%Aterriza en Palmeras Paradis%acas y gana%');
  if v is not null then
    update challenges set description='Aterriza en Palmeras Paradisíacas en 3 partidas diferentes',
      kind='progress', unit='count', match_scope='different_matches', target_value=3, current_value=0, is_completed=false, rules_operator='and' where id=v;
    insert into challenge_rules(challenge_id, action_type_id, location_id) values (v, pg_temp.act('land'), pg_temp.loc('paradise_palms'));
  end if;

  -- #9) "sin recibir daño entre ellas" no es trackeable y la regla no tenía arma
  -- → 3 eliminaciones con fusil de francotirador (kill + tag sniper).
  v := pg_temp.findclear('%eliminaciones sin recibir da%o entre ellas%');
  if v is not null then
    update challenges set description='Consigue 3 eliminaciones con fusil de francotirador',
      kind='progress', unit='count', match_scope='any_match', target_value=3, current_value=0, is_completed=false, rules_operator='and' where id=v;
    insert into challenge_rules(challenge_id, action_type_id, required_tag_id) values (v, pg_temp.act('kill'), pg_temp.tag('sniper'));
  end if;

  -- #10) condición negativa "no registres cofres" no es trackeable → conserva
  -- solo la parte de sobrevivir (outlast), en una sola partida.
  v := pg_temp.findclear('%No registres ning%n cofre en ubicaciones con nombre%');
  if v is not null then
    update challenges set description='Sobrevive a 75 oponentes en una sola partida',
      kind='progress', unit='value', match_scope='same_match', target_value=75, current_value=0, is_completed=false, rules_operator='and' where id=v;
    insert into challenge_rules(challenge_id, action_type_id) values (v, pg_temp.act('outlast'));
  end if;

  -- #11) "bidón de plasma" no existe como objeto → gana 300 de salud o escudo
  -- (gain; se alimenta del sistema de efectos de consumibles).
  v := pg_temp.findclear('%Gana salud o escudo con un bid%n de plasma%');
  if v is not null then
    update challenges set description='Gana 300 de salud o escudo',
      kind='progress', unit='value', match_scope='any_match', target_value=300, current_value=0, is_completed=false, rules_operator='and' where id=v;
    insert into challenge_rules(challenge_id, action_type_id) values (v, pg_temp.act('gain'));
  end if;
end $$;
