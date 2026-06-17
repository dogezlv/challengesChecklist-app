-- 10: tag Misceláneo (teléfonos/pelota/pista), nombres oficiales en español,
--     reemplazo de la misión de aros en llamas por "cañón pirata en todos los
--     campamentos", y desafíos de partidas diferentes limitados a ±1 por partida.

-- 1) Nombres oficiales en español (fortnite.fandom.com/es):
--    Flint-Knock Pistol = "Pistola de mecha", Boom Bow = "Arco explosivo".
update game_objects set display_name = 'Pistola de mecha' where code = 'flintknock';
update game_objects set display_name = 'Arco explosivo' where code = 'boom_bow';

update challenges
set description = 'Consigue una eliminación con una pistola de mecha o un arco explosivo'
where id = '7a8768a2-5f54-4877-8748-b7d6485e5286';

-- 2) Tag Misceláneo: misiones raras que no giran en torno a un arma/objeto real
insert into tags (code, display_name, display_name_en, is_weapon)
select 'misc', 'Misceláneo', 'Miscellaneous', false
where not exists (select 1 from tags where code = 'misc');

-- 3) Teléfonos y pelota saltarina pasan a ser misiones misceláneas (tag, sin objeto)
update challenge_rules
set required_object_id = null,
    required_tag_id = (select id from tags where code = 'misc')
where id in (
  '573b97c2-7ce7-41d9-8910-22ff5735e5a9', -- teléfono: número de Durr Burger
  'd5e424fc-481c-4911-8fa1-5090f313c99f', -- teléfono: número de Pizza Pit
  '5c5af01d-3e6c-4533-bbd9-a95ae1d6434b'  -- pelota saltarina: 15 botes
);

-- emoji de teléfono en las condiciones de marcado
update rule_conditions
set condition_value = '📞 Número de Durr Burger (oeste de Terreno Tormentoso)'
where condition_key = 'dial_durr_burger';

update rule_conditions
set condition_value = '📞 Número de Pizza Pit (este de El Bloque)'
where condition_key = 'dial_pizza_pit';

-- la pista de carreras deja de ser un "visitar lugar": misión miscelánea
-- (use + tag misc + condición), igual que los teléfonos
update challenge_rules
set action_type_id = (select id from action_types where code = 'use'),
    location_id = null,
    required_tag_id = (select id from tags where code = 'misc')
where id = '4279828c-3f6a-4bd6-9971-bcf29a2ace12';

insert into rule_conditions (challenge_rule_id, condition_key, condition_value)
select '4279828c-3f6a-4bd6-9971-bcf29a2ace12', 'race_track_lap', '🏁 Vuelta completa a la pista de carreras'
where not exists (select 1 from rule_conditions where condition_key = 'race_track_lap');

-- el teléfono gigante deja de ser un objeto
delete from game_object_tags
where object_id = (select id from game_objects where code = 'big_telephone');

delete from game_objects where code = 'big_telephone';

-- 4) Reemplazo: fuera "aros en llamas", entra "cañón pirata en todos los
--    campamentos piratas" (7 reglas AND, una por campamento; acumulador global)
delete from rule_conditions
where challenge_rule_id in (
  select id from challenge_rules
  where challenge_id = 'a0c83468-509d-4641-a424-7d18cf23a86d'
);
delete from match_rule_progress where challenge_id = 'a0c83468-509d-4641-a424-7d18cf23a86d';
delete from challenge_distinct_progress where challenge_id = 'a0c83468-509d-4641-a424-7d18cf23a86d';
delete from challenge_rules where challenge_id = 'a0c83468-509d-4641-a424-7d18cf23a86d';
delete from challenges where id = 'a0c83468-509d-4641-a424-7d18cf23a86d';

with ch as (
  insert into challenges
    (description, kind, unit, match_scope, rules_operator,
     current_value, target_value, week_id, is_meta, created_at)
  values
    ('Utiliza un cañón pirata en todos los campamentos piratas para llegar a una ubicación con nombre',
     'progress', 'count', 'any_match', 'and',
     0, 7, '34d6ede8-94a8-45a9-bc2c-267275ba3122', false,
     '2026-06-10T10:46:03.74133+00:00') -- conserva el orden del desafío sustituido
  returning id
)
insert into challenge_rules (challenge_id, action_type_id, required_object_id, location_id)
select ch.id,
       (select id from action_types where code = 'use'),
       (select id from game_objects where code = 'pirate_cannon'),
       l.id
from ch, locations l
where l.code like 'pirate_camp_%';

-- 5) Partidas diferentes: el avance manual va de 1 en 1 y solo una vez por
--    partida; el registro queda en match_rule_progress (igual que report_event),
--    así el panel sabe si ya se sumó en la partida activa.
create or replace function public.increase_challenge_progress(p_challenge_id uuid, p_increase_value bigint)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
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
        -- -1: quita preferentemente el registro de la partida actual
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
    -- sin regla no hay acumulador por partida: cae al avance simple de ±1
  end if;

  update challenges
  set current_value = greatest(0, least(coalesce(current_value, 0) + p_increase_value, target_value))
  where id = p_challenge_id;
end;
$fn$;

-- el ajuste directo (slider) no puede saltarse el límite por partida
create or replace function public.update_challenge_progress(p_challenge_id uuid, p_current_value bigint)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
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
$fn$;

-- 6) Limpieza defensiva: las misiones tocadas arrancan sin progreso
update challenges
set current_value = 0, is_completed = false
where id in (
  'ab480185-28c3-4396-ae6e-c2e62a6c3e4e', -- teléfono fase 1
  '1de7720f-44c7-4a4f-ab68-5bc69eb51d84', -- teléfono fase 2
  '7131cb9f-d9fc-4501-997f-83532aef6369', -- pelota saltarina
  'ad04076c-f0b3-4dc6-ab68-8a82ee49f5f9'  -- pista de carreras
) and (current_value <> 0 or is_completed);
