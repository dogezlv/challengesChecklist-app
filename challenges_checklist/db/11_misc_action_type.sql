-- 11: "Misceláneo" deja de ser un TAG de objeto (mostrado bajo la acción
--     "usar") y pasa a ser su PROPIO TIPO DE ACCIÓN, con su sección en el
--     panel (como matar/dañar). El tag misc se elimina por completo.

-- 1) nuevo tipo de acción
insert into action_types (code, display_name, display_name_en)
select 'misc', 'Misceláneo', 'Miscellaneous'
where not exists (select 1 from action_types where code = 'misc');

-- 2) las reglas misceláneas (teléfonos, pelota saltarina, pista de carreras)
--    dejan de ser "usar + tag misc": ahora son acción "misc" sin objeto/tag.
--    Cada una se distingue solo por su condición (marcar número, 15 botes,
--    vuelta completa…), que el motor ya usa para emparejar el evento.
update challenge_rules
set action_type_id = (select id from action_types where code = 'misc'),
    required_tag_id = null
where required_tag_id = (select id from tags where code = 'misc');

-- 3) eliminar el tag misc (ya no hay objetos ni reglas que lo referencien)
update challenge_rules set target_tag_id = null
where target_tag_id = (select id from tags where code = 'misc');
delete from game_object_tags
where tag_id = (select id from tags where code = 'misc');
delete from tags where code = 'misc';
