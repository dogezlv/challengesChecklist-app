-- ============================================================
-- 14_prestige_all_weeks.sql — Prestigio para TODAS las semanas (7 por semana)
--   * Semana 1: ya tenía 5 (db/13) → se añaden 2 para llegar a 7.
--   * Semanas 2-10: se DERIVAN de los desafíos normales reales de cada semana
--     (una versión por "unidad": cada línea de fases cuenta como una, tomando
--     su fase final), copiando sus reglas y condiciones y subiendo la
--     dificultad (más cantidad / en una sola partida / más partidas). Así cada
--     prestigio es temático de su semana. Máx. 7 por semana.
--   * Idempotente por semana (no re-siembra si ya hay prestigio).
-- ============================================================

-- Semana 1 → completar a 7 -------------------------------------------------
do $$
declare v_week uuid; v_ch uuid;
begin
  select w.id into v_week from challenge_weeks w join seasons s on s.id = w.season_id
  where s.code = 'season_8' and w.week_number = 1;

  if not exists (select 1 from challenges where week_id = v_week and is_prestige
                 and description = 'Inflige 600 de daño con fusiles de asalto') then
    insert into challenges (description, kind, unit, match_scope, current_value,
      target_value, is_completed, week_id, is_meta, is_prestige, rules_operator)
    values ('Inflige 600 de daño con fusiles de asalto', 'progress', 'value',
      'any_match', 0, 600, false, v_week, false, true, 'and')
    returning id into v_ch;
    insert into challenge_rules (challenge_id, action_type_id, required_tag_id)
    values (v_ch, (select id from action_types where code = 'damage'),
            (select id from tags where code = 'rifle'));
  end if;

  if not exists (select 1 from challenges where week_id = v_week and is_prestige
                 and description = 'Registra 8 cofres en una sola partida') then
    insert into challenges (description, kind, unit, match_scope, current_value,
      target_value, is_completed, week_id, is_meta, is_prestige, rules_operator)
    values ('Registra 8 cofres en una sola partida', 'progress', 'count',
      'same_match', 0, 8, false, v_week, false, true, 'and')
    returning id into v_ch;
    insert into challenge_rules (challenge_id, action_type_id)
    values (v_ch, (select id from action_types where code = 'search'));
  end if;
end $$;

-- Semanas 2-10 → derivar 7 prestigios de los desafíos normales -------------
do $$
declare
  wk record; src record; r record;
  v_ch uuid; v_rule uuid;
  v_desc text; v_target int; v_rules int; v_n int;
  v_kind challenges.kind%type;
  v_unit challenges.unit%type;
  v_scope challenges.match_scope%type;
begin
  for wk in
    select w.id, w.week_number
    from challenge_weeks w join seasons s on s.id = w.season_id
    where s.code = 'season_8' and w.week_number between 2 and 10
    order by w.week_number
  loop
    -- idempotencia
    if exists (select 1 from challenges where week_id = wk.id and is_prestige) then
      continue;
    end if;

    v_n := 0;
    for src in
      select distinct on (coalesce(c.line_id, c.id)) c.*
      from challenges c
      where c.week_id = wk.id and c.is_meta = false and c.is_prestige = false
      order by coalesce(c.line_id, c.id), c.phase_order desc nulls last, c.created_at
    loop
      exit when v_n >= 7;
      v_n := v_n + 1;

      select count(*) into v_rules from challenge_rules where challenge_id = src.id;
      v_desc  := regexp_replace(src.description, '^Fase [0-9]+ de [0-9]+:\s*', '');
      v_kind  := src.kind;
      v_unit  := src.unit;
      v_scope := src.match_scope;
      v_target := coalesce(src.target_value, 1);

      if src.kind = 'simple' then
        v_kind := 'progress'; v_unit := 'count'; v_scope := 'same_match'; v_target := 2;
        v_desc := v_desc || ' (2 veces en una sola partida)';
      elsif src.unit = 'value' then
        v_target := v_target * 3;                          -- mucho más daño/salud
      elsif src.unit = 'distinct_location' then
        v_scope := 'same_match'; v_target := v_target + 2;
      elsif src.match_scope = 'different_matches' then
        v_target := v_target + 2;                          -- en más partidas
      elsif src.match_scope = 'any_match' then
        v_scope := 'same_match';                           -- todo en una partida
        if v_rules <= 1 then v_target := v_target * 2; else v_target := v_rules; end if;
        v_desc := v_desc || ' (en una sola partida)';
      else -- ya es same_match
        if v_unit = 'count' and v_rules > 1 then v_target := v_rules;
        else v_target := v_target * 2; end if;
      end if;

      insert into challenges (description, kind, unit, match_scope, current_value,
        target_value, is_completed, week_id, is_meta, is_prestige, rules_operator)
      values (v_desc, v_kind, v_unit, v_scope, 0, greatest(v_target, 1), false,
        wk.id, false, true, coalesce(src.rules_operator, 'and'))
      returning id into v_ch;

      -- copiar reglas (+ sus condiciones)
      for r in select * from challenge_rules where challenge_id = src.id loop
        insert into challenge_rules (challenge_id, action_type_id, required_object_id,
          required_tag_id, target_object_id, target_tag_id, location_id)
        values (v_ch, r.action_type_id, r.required_object_id, r.required_tag_id,
          r.target_object_id, r.target_tag_id, r.location_id)
        returning id into v_rule;

        insert into rule_conditions (challenge_rule_id, condition_key, condition_value, requires_weapon)
        select v_rule, condition_key, condition_value, requires_weapon
        from rule_conditions where challenge_rule_id = r.id;
      end loop;
    end loop;
  end loop;
end $$;
