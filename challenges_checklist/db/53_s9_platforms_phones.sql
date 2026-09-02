-- ============================================================
-- 53_s9_platforms_phones.sql — Plataformas con nombre de POI;
-- W2 visita: teléfonos nieve + selva (en lugar de teléfono genérico)
-- ============================================================

insert into public.locations (code, display_name, display_name_en, named_location)
values
  ('giant_phone_snow',   'Teléfono gigante de la nieve', 'Giant Phone (Snow)',   false),
  ('giant_phone_jungle', 'Teléfono gigante de la selva', 'Giant Phone (Jungle)', false)
on conflict (code) do update set
  display_name = excluded.display_name,
  display_name_en = excluded.display_name_en;

update public.locations set display_name = 'Plataforma cerca de Conductos Cambiantes',  display_name_en = 'Sky Platform near Shifty Shafts'   where code = 'sky_platform_1';
update public.locations set display_name = 'Plataforma cerca de Cráter Catastrófico',   display_name_en = 'Sky Platform near Dusty Divot'     where code = 'sky_platform_2';
update public.locations set display_name = 'Plataforma cerca de Terreno Tormentoso',    display_name_en = 'Sky Platform near Fatal Fields'    where code = 'sky_platform_3';
update public.locations set display_name = 'Plataforma cerca de Palmeras Paradisíacas', display_name_en = 'Sky Platform near Paradise Palms'  where code = 'sky_platform_4';
update public.locations set display_name = 'Plataforma cerca de Planta de presión',     display_name_en = 'Sky Platform near Pressure Plant'  where code = 'sky_platform_5';
update public.locations set display_name = 'Plataforma cerca de Parque Placentero',     display_name_en = 'Sky Platform near Pleasant Park'   where code = 'sky_platform_6';
update public.locations set display_name = 'Plataforma cerca de Laguna Fortuna',        display_name_en = 'Sky Platform near Loot Lake'       where code = 'sky_platform_7';

-- Semana 2: sustituir regla teléfono genérico por nieve + selva
do $$
declare
  v_ch uuid;
  v_old_loc uuid;
  v_snow uuid;
  v_jungle uuid;
begin
  select l.id into v_old_loc from public.locations l where l.code = 'giant_phone_visit';
  select l.id into v_snow from public.locations l where l.code = 'giant_phone_snow';
  select l.id into v_jungle from public.locations l where l.code = 'giant_phone_jungle';

  select c.id into v_ch
  from public.challenges c
  join public.challenge_weeks w on w.id = c.week_id
  join public.seasons s on s.id = w.season_id
  where s.code = 'season_9' and w.week_number = 2
    and c.description ilike '%tel%fono%'
    and c.description ilike '%monstruo%'
    and not c.is_meta
  limit 1;

  if v_ch is null then
    return;
  end if;

  update public.challenges
  set
    description = 'Visita el Teléfono Gigante de la nieve, el Teléfono Gigante de la selva, un monstruo de camiones y un trofeo del pez bailarín',
    target_value = 4
  where id = v_ch;

  if v_old_loc is not null then
    delete from public.rule_conditions rc
    using public.challenge_rules cr
    where rc.challenge_rule_id = cr.id
      and cr.challenge_id = v_ch
      and cr.location_id = v_old_loc;

    delete from public.challenge_rules cr
    where cr.challenge_id = v_ch and cr.location_id = v_old_loc;
  end if;

  if v_snow is not null and not exists (
    select 1 from public.challenge_rules cr
    where cr.challenge_id = v_ch and cr.location_id = v_snow
  ) then
    insert into public.challenge_rules (challenge_id, action_type_id, location_id)
    values (
      v_ch,
      (select id from public.action_types where code = 'visit'),
      v_snow
    );
  end if;

  if v_jungle is not null and not exists (
    select 1 from public.challenge_rules cr
    where cr.challenge_id = v_ch and cr.location_id = v_jungle
  ) then
    insert into public.challenge_rules (challenge_id, action_type_id, location_id)
    values (
      v_ch,
      (select id from public.action_types where code = 'visit'),
      v_jungle
    );
  end if;

  -- Recalcular progreso (una visita por regla en acumulador global)
  update public.challenges c
  set
    current_value = coalesce(sub.hits, 0),
    is_completed = coalesce(sub.hits, 0) >= c.target_value
  from (
    select count(*)::bigint as hits
    from public.challenge_rules cr
    where cr.challenge_id = v_ch
      and exists (
        select 1 from public.match_rule_progress mrp
        where mrp.challenge_rule_id = cr.id and mrp.match_id is null
      )
  ) sub
  where c.id = v_ch;
end $$;
