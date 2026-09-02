-- ============================================================
-- 52_s9_w10_phones.sql — S9 W10: letreros PSA → teléfonos nieve/jungla
-- ============================================================

create or replace function pg_temp.s9_w10() returns uuid
language sql as $$
  select w.id from public.challenge_weeks w
  join public.seasons s on s.id = w.season_id
  where s.code = 'season_9' and w.week_number = 10
$$;

create or replace function pg_temp.ch9w10(
  p_desc text,
  p_kind challenge_kind,
  p_unit text,
  p_scope match_scope,
  p_target bigint,
  p_op rule_group_operator default null,
  p_line text default null,
  p_phase int default null
) returns uuid
language plpgsql as $h$
declare
  v_week_id uuid;
  v_line_id uuid;
  v_id uuid;
begin
  select pg_temp.s9_w10() into strict v_week_id;

  if p_line is not null then
    select id into v_line_id from public.challenge_lines where name = p_line;
    if v_line_id is null then
      insert into public.challenge_lines (name) values (p_line) returning id into v_line_id;
    end if;
  end if;

  insert into public.challenges
    (description, kind, unit, match_scope, rules_operator,
     current_value, target_value, is_completed, week_id, line_id, phase_order)
  values
    (p_desc, p_kind, p_unit, p_scope, p_op,
     0, p_target, false, v_week_id, v_line_id, p_phase)
  returning id into v_id;

  return v_id;
end;
$h$;

create or replace function pg_temp.rl9w10(
  p_ch uuid,
  p_action text
) returns uuid
language plpgsql as $h$
declare
  v_id uuid;
begin
  insert into public.challenge_rules
    (challenge_id, action_type_id)
  values (
    p_ch,
    (select id from public.action_types where code = p_action)
  )
  returning id into v_id;
  return v_id;
end;
$h$;

create or replace function pg_temp.cn9w10(p_rule uuid, p_key text, p_label text)
returns void language sql as $h$
  insert into public.rule_conditions (challenge_rule_id, condition_key, condition_value)
  values (p_rule, p_key, p_label);
$h$;

do $$
declare
  c uuid;
  r uuid;
  v_line uuid;
begin
  if pg_temp.s9_w10() is null then
    raise exception 'season_9 week 10 not found';
  end if;

  select id into v_line from public.challenge_lines where name = 'S9W10 — Teléfonos gigantes';

  delete from public.rule_conditions rc
  using public.challenge_rules cr, public.challenges c
  where rc.challenge_rule_id = cr.id
    and cr.challenge_id = c.id
    and c.week_id = pg_temp.s9_w10()
    and (
      c.description ilike '%letreros de aviso%'
      or (v_line is not null and c.line_id = v_line)
    );

  delete from public.challenge_rules cr
  using public.challenges c
  where cr.challenge_id = c.id
    and c.week_id = pg_temp.s9_w10()
    and (
      c.description ilike '%letreros de aviso%'
      or (v_line is not null and c.line_id = v_line)
    );

  delete from public.challenges c
  where c.week_id = pg_temp.s9_w10()
    and (
      c.description ilike '%letreros de aviso%'
      or (v_line is not null and c.line_id = v_line)
    );

  c := pg_temp.ch9w10(
    'Fase 1 de 2: Marca el número en el Teléfono Gigante de la nieve',
    'simple', 'count', 'any_match', 1, null, 'S9W10 — Teléfonos gigantes', 1
  );
  r := pg_temp.rl9w10(c, 'misc');
  perform pg_temp.cn9w10(r, 'dial_durr_burger', '📞 Teléfono Gigante de la nieve');

  c := pg_temp.ch9w10(
    'Fase 2 de 2: Marca el número en el Teléfono Gigante de la Jungla',
    'simple', 'count', 'any_match', 1, null, 'S9W10 — Teléfonos gigantes', 2
  );
  r := pg_temp.rl9w10(c, 'misc');
  perform pg_temp.cn9w10(r, 'dial_pizza_pit', '📞 Teléfono Gigante de la Jungla');

  update public.challenges c
  set target_value = sub.cnt
  from (
    select count(*)::bigint as cnt
    from public.challenges x
    where x.week_id = pg_temp.s9_w10()
      and not x.is_meta
      and not coalesce(x.is_prestige, false)
  ) sub
  where c.week_id = pg_temp.s9_w10() and c.is_meta;
end $$;

drop function if exists pg_temp.cn9w10(uuid, text, text);
drop function if exists pg_temp.rl9w10(uuid, text);
drop function if exists pg_temp.ch9w10(text, challenge_kind, text, match_scope, bigint, rule_group_operator, text, int);
drop function if exists pg_temp.s9_w10();
