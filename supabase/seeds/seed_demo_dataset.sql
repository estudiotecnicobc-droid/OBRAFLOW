-- Seed demo dataset para catálogo base de Presupuestos/APU
-- Fuente del dataset normalizado: archivo subido por el usuario fileciteturn3file0
-- Antes de ejecutar:
--   1) Ajustá v_org_uuid si tu tabla master_tasks usa UUID real.
--   2) Ajustá v_org_text si tus tablas materials/tools/labor_categories usan organization_id TEXT.
--   3) Si alguna tabla usa UUID en vez de TEXT, convertí esa constante.

begin;

do $$
declare
  v_org_uuid uuid := '00000000-0000-0000-0000-000000000001';
  v_org_text text := 'org_demo';
begin
  -- ========== BASE TABLES ==========
  insert into public.materials (id, organization_id, code, name, unit, price, category, description)
  values
    (gen_random_uuid(), v_org_text, 'I1000', 'CAL HIDRÁULICA EN POLVO', 'KG', 0.376, 'AGLOMERANTES', 'Unidad de cómputo en KG.'),
    (gen_random_uuid(), v_org_text, 'I1001', 'CEMENTO PORTLAND', 'KG', 0.5, 'AGLOMERANTES', 'Unidad de cómputo en KG. Planilla modelo indica unidad comercial bolsa 50kg.'),
    (gen_random_uuid(), v_org_text, 'I1002', 'ARENA x M3', 'M3', 82.686, 'ARIDO', ''),
    (gen_random_uuid(), v_org_text, 'I1025', 'TABLA DE 1" SALIGNA BRUTO', 'M2', 15.0, 'MADERAS', ''),
    (gen_random_uuid(), v_org_text, 'MAT_TMP_001', 'Ladrillo Hueco 27x18x33', 'UN', 22.31, 'Mampostería', 'Código autogenerado por falta de ID en archivo origen.')
  on conflict (organization_id, code) do update
    set name = excluded.name,
        unit = excluded.unit,
        price = excluded.price,
        category = excluded.category,
        description = excluded.description;

  insert into public.tools (id, organization_id, code, name, unit, cost_per_hour, description)
  values
    (gen_random_uuid(), v_org_text, 'I1747', 'RETROEXCAVADORA 150 HP', 'AÑO', null, 'DEPRECIACION+INTERESES+REP Y REP | El costo está anualizado (95004.0), requiere conversión a hora para APU estándar.'),
    (gen_random_uuid(), v_org_text, 'EQ_TMP_001', 'desmalesadora', 'UN', null, 'Costo extraído como monto global/diario de la tarea Limpieza de Terreno. cost_per_hour is null.')
  on conflict (organization_id, code) do update
    set name = excluded.name,
        unit = excluded.unit,
        cost_per_hour = excluded.cost_per_hour,
        description = excluded.description;

  insert into public.labor_categories (id, organization_id, code, name, unit, cost_per_hour)
  values
    (gen_random_uuid(), v_org_text, 'I1004', 'OFICIAL', 'H', 21.0457),
    (gen_random_uuid(), v_org_text, 'I1005', 'AYUDANTE', 'H', 17.8336),
    (gen_random_uuid(), v_org_text, 'MO_TMP_001', 'Oficial Especializado', 'H', 146.8633)
  on conflict (organization_id, code) do update
    set name = excluded.name,
        unit = excluded.unit,
        cost_per_hour = excluded.cost_per_hour;

  insert into public.master_tasks (id, organization_id, code, name, unit, category, description)
  values
    (gen_random_uuid(), v_org_uuid, 'T1001', 'CASILLA HABITABLE', 'M2', '02 TRABAJOS PRELIMINARES', 'por m2 de superficie cubierta. Solo se usan tablas de 1" x 4", y de 1" x 6" y tirantes de 3" x 3"... | Cálculo referencial histórico.'),
    (gen_random_uuid(), v_org_uuid, 'TAREA_TMP_001', 'Mampostería de ladrillo hueco cerámico 27 x 18 x 33', 'M2', '4.1. Mampostería', 'Incluye dosificación de mortero. | No posee código de tarea. Se asume rubro por nombre de archivo.'),
    (gen_random_uuid(), v_org_uuid, 'TAREA_TMP_002', 'Azotado hidrofugo *1', 'M2', '9. Revoques', 'CONTROL DE RECEPCION DE MATERIALES... CONTROL DE EJECUCION DE OBRA... | Contiene metadatos ricos de Controles de Gestión en la descripción.'),
    (gen_random_uuid(), v_org_uuid, 'TAREA_TMP_003', 'EXCAVACIONES - Bases de hormigón armado', 'M3', '2. Movimiento de Suelos', 'Excavación para bases de hormigón armado y vigas de encadenado')
  on conflict (organization_id, code) do update
    set name = excluded.name,
        unit = excluded.unit,
        category = excluded.category,
        description = excluded.description;

  -- ========== CHILD TABLES ==========
  insert into public.master_task_materials (id, master_task_id, master_material_id, material_name, unit, quantity, last_known_unit_price)
  select gen_random_uuid(), mt.id, null, m.name, 'M2', 7.0, m.price
  from public.master_tasks mt
  join public.materials m on m.organization_id = v_org_text and m.code = 'I1025'
  where mt.organization_id = v_org_uuid and mt.code = 'T1001'
    and not exists (
      select 1 from public.master_task_materials x where x.master_task_id = mt.id and x.material_name = m.name
    );

  insert into public.master_task_materials (id, master_task_id, master_material_id, material_name, unit, quantity, last_known_unit_price)
  select gen_random_uuid(), mt.id, null, m.name, src.unit, src.quantity, m.price
  from (values
    ('TAREA_TMP_001','MAT_TMP_001','UN',15.0),
    ('TAREA_TMP_001','I1000','KG',3.175),
    ('TAREA_TMP_001','I1001','KG',3.6),
    ('TAREA_TMP_001','I1002','M3',0.021)
  ) as src(task_code, material_code, unit, quantity)
  join public.master_tasks mt on mt.organization_id = v_org_uuid and mt.code = src.task_code
  join public.materials m on m.organization_id = v_org_text and m.code = src.material_code
  where not exists (
    select 1 from public.master_task_materials x where x.master_task_id = mt.id and x.material_name = m.name
  );

  insert into public.master_task_labor (id, master_task_id, labor_category_id, labor_category_name, quantity)
  select gen_random_uuid(), mt.id, lc.id, lc.name, src.quantity
  from (values
    ('T1001','I1004',6.5),
    ('T1001','I1005',3.0),
    ('TAREA_TMP_001','I1004',0.74),
    ('TAREA_TMP_001','I1005',0.5),
    ('TAREA_TMP_003','I1004',1.08),
    ('TAREA_TMP_003','I1005',2.16)
  ) as src(task_code, labor_code, quantity)
  join public.master_tasks mt on mt.organization_id = v_org_uuid and mt.code = src.task_code
  join public.labor_categories lc on lc.organization_id = v_org_text and lc.code = src.labor_code
  where not exists (
    select 1 from public.master_task_labor x where x.master_task_id = mt.id and x.labor_category_name = lc.name
  );
end $$;

commit;
