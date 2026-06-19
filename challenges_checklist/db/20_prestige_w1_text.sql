-- ============================================================
-- 20_prestige_w1_text.sql
-- Semana 1 prestigio: reescritura de texto (explosiva+escopeta) y
-- sustitución del prestigio de 3 escopetas → asalto+francotirador
-- misma partida. Idempotente por descripción actual.
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
  delete from match_rule_progress where challenge_id = v;
  delete from challenge_distinct_progress where challenge_id = v;
  return v;
end $f$;

create or replace function pg_temp.act(c text) returns uuid language sql as $$ select id from action_types where code=c $$;
create or replace function pg_temp.tag(c text) returns uuid language sql as $$ select id from tags where code=c $$;

do $$
declare v uuid;
begin
  -- A) Reescritura formal (reglas intactas: kill explosive + shotgun, same_match)
  select c.id into v
  from challenges c
  join challenge_weeks w on w.id = c.week_id
  join seasons s on s.id = w.season_id
  where s.code = 'season_8' and c.is_prestige
    and c.description ilike '%eliminaci%n con explosivo y escopeta%'
  order by c.created_at limit 1;
  if v is not null then
    update challenges set description = 'Consigue una eliminación con un arma explosiva y una escopeta en la misma partida'
    where id = v;
  end if;

  -- B) 3 escopetas → asalto + francotirador misma partida
  v := pg_temp.findclear('%3 eliminaciones con escopeta en una sola partida%');
  if v is not null then
    update challenges set
      description = 'Consigue una eliminación con un fusil de asalto y un fusil de francotirador en la misma partida',
      kind = 'progress',
      unit = 'count',
      match_scope = 'same_match',
      target_value = 2,
      current_value = 0,
      is_completed = false,
      rules_operator = 'and'
    where id = v;
    insert into challenge_rules(challenge_id, action_type_id, required_tag_id)
      values (v, pg_temp.act('kill'), pg_temp.tag('assault'));
    insert into challenge_rules(challenge_id, action_type_id, required_tag_id)
      values (v, pg_temp.act('kill'), pg_temp.tag('sniper'));
  end if;
end $$;
