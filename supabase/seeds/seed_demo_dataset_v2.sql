-- Seed demo dataset v2 — columnas corregidas según servicios TypeScript verificados
-- Diferencias respecto a v1:
--   materials:        price → cost
--   labor_categories: name → role, cost_per_hour → basic_hourly_rate, eliminado unit
--   tools:            sin cambio en columnas core (code agregado)
--
-- PREREQUISITO: ejecutar migración 020_add_code_to_base_tables.sql antes de este seed.
--
-- Variables:
--   v_org_uuid = UUID real para master_tasks (tabla con organization_id uuid)
--   v_org_text = ID de texto para materials/tools/labor_categories (organization_id text)
--   Ajustar antes de ejecutar.

begin;

do $$
declare
  v_org_uuid uuid := '00000000-0000-0000-0000-000000000001';
  v_org_text text := 'org_demo';
begin

  -- ========== MATERIALES ==========
  -- Columna real: cost (no price)
  insert into public.materials (id, organization_id, code, name, unit, cost, category, description)
  values
    (gen_random_uuid(), v_org_text, 'I1000', 'CAL HIDRÁULICA EN POLVO',          'KG',  0.376,  'AGLOMERANTES', 'Unidad de cómputo en KG.'),
    (gen_random_uuid(), v_org_text, 'I1001', 'CEMENTO PORTLAND',                  'KG',  0.5,    'AGLOMERANTES', 'Unidad de cómputo en KG. Unidad comercial: bolsa 50 kg.'),
    (gen_random_uuid(), v_org_text, 'I1002', 'ARENA x M3',                        'M3',  82.686, 'ARIDO',        ''),
    (gen_random_uuid(), v_org_text, 'I1025', 'TABLA DE 1" SALIGNA BRUTO',         'M2',  15.0,   'MADERAS',      ''),
    (gen_random_uuid(), v_org_text, 'MAT_TMP_001', 'Ladrillo Hueco 27x18x33',    'UN',  22.31,  'Mampostería',  'Código autogenerado por falta de ID en archivo origen.')
  on conflict (organization_id, code) do update
    set name        = excluded.name,
        unit        = excluded.unit,
        cost        = excluded.cost,
        category    = excluded.category,
        description = excluded.description;

  -- ========== HERRAMIENTAS / EQUIPOS ==========
  -- cost_per_hour puede ser NULL (maquinaria con costo anualizado)
  insert into public.tools (id, organization_id, code, name, category, cost_per_hour)
  values
    (gen_random_uuid(), v_org_text, 'I1747',     'RETROEXCAVADORA 150 HP', 'MAQUINARIA',  null),
    (gen_random_uuid(), v_org_text, 'EQ_TMP_001', 'Desmalesadora',         'HERRAMIENTA', null)
  on conflict (organization_id, code) do update
    set name         = excluded.name,
        category     = excluded.category,
        cost_per_hour = excluded.cost_per_hour;

  -- ========== CATEGORÍAS DE MANO DE OBRA ==========
  -- Columnas reales: role (no name), basic_hourly_rate (no cost_per_hour)
  -- social_charges_percent e insurance_percent requeridos por el tipo; se inicializan en 0
  insert into public.labor_categories (id, organization_id, code, role, basic_hourly_rate, social_charges_percent, insurance_percent)
  values
    (gen_random_uuid(), v_org_text, 'I1004',     'OFICIAL',               21.0457,  0, 0),
    (gen_random_uuid(), v_org_text, 'I1005',     'AYUDANTE',              17.8336,  0, 0),
    (gen_random_uuid(), v_org_text, 'MO_TMP_001','Oficial Especializado', 146.8633, 0, 0)
  on conflict (organization_id, code) do update
    set role              = excluded.role,
        basic_hourly_rate = excluded.basic_hourly_rate;

  -- ========== TAREAS MAESTRAS (APU) ==========
  -- organization_id es UUID aquí
  insert into public.master_tasks (id, organization_id, code, name, unit, category, description)
  values
    (gen_random_uuid(), v_org_uuid, 'T1001',
     'CASILLA HABITABLE', 'M2', '02 TRABAJOS PRELIMINARES',
     'Por m2 de superficie cubierta. Solo tablas de 1"x4", 1"x6" y tirantes 3"x3". Cálculo referencial histórico.'),
    (gen_random_uuid(), v_org_uuid, 'TAREA_TMP_001',
     'Mampostería de ladrillo hueco cerámico 27 x 18 x 33', 'M2', '4.1. Mampostería',
     'Incluye dosificación de mortero.'),
    (gen_random_uuid(), v_org_uuid, 'TAREA_TMP_002',
     'Azotado hidrofugo', 'M2', '9. Revoques',
     'CONTROL DE RECEPCION DE MATERIALES. CONTROL DE EJECUCION DE OBRA.'),
    (gen_random_uuid(), v_org_uuid, 'TAREA_TMP_003',
     'EXCAVACIONES - Bases de hormigón armado', 'M3', '2. Movimiento de Suelos',
     'Excavación para bases de hormigón armado y vigas de encadenado.')
  on conflict (organization_id, code) do update
    set name        = excluded.name,
        unit        = excluded.unit,
        category    = excluded.category,
        description = excluded.description;

  -- ========== MATERIALES POR APU (tablas hijo) ==========
  -- T1001 → tabla de madera
  insert into public.master_task_materials
    (id, master_task_id, master_material_id, material_name, unit, quantity, last_known_unit_price)
  select
    gen_random_uuid(), mt.id, null, m.name, 'M2', 7.0, m.cost
  from public.master_tasks mt
  join public.materials   m  on m.organization_id = v_org_text and m.code = 'I1025'
  where mt.organization_id = v_org_uuid and mt.code = 'T1001'
    and not exists (
      select 1 from public.master_task_materials x
      where x.master_task_id = mt.id and x.material_name = m.name
    );

  -- TAREA_TMP_001 → ladrillo + aglomerantes + arena
  insert into public.master_task_materials
    (id, master_task_id, master_material_id, material_name, unit, quantity, last_known_unit_price)
  select
    gen_random_uuid(), mt.id, null, m.name, src.unit, src.quantity, m.cost
  from (values
    ('TAREA_TMP_001', 'MAT_TMP_001', 'UN',  15.0),
    ('TAREA_TMP_001', 'I1000',       'KG',   3.175),
    ('TAREA_TMP_001', 'I1001',       'KG',   3.6),
    ('TAREA_TMP_001', 'I1002',       'M3',   0.021)
  ) as src(task_code, material_code, unit, quantity)
  join public.master_tasks mt on mt.organization_id = v_org_uuid and mt.code = src.task_code
  join public.materials    m  on m.organization_id  = v_org_text and m.code  = src.material_code
  where not exists (
    select 1 from public.master_task_materials x
    where x.master_task_id = mt.id and x.material_name = m.name
  );

  -- ========== MANO DE OBRA POR APU ==========
  insert into public.master_task_labor
    (id, master_task_id, labor_category_id, labor_category_name, quantity)
  select
    gen_random_uuid(), mt.id, lc.id, lc.role, src.quantity
  from (values
    ('T1001',        'I1004', 6.5),
    ('T1001',        'I1005', 3.0),
    ('TAREA_TMP_001','I1004', 0.74),
    ('TAREA_TMP_001','I1005', 0.5),
    ('TAREA_TMP_003','I1004', 1.08),
    ('TAREA_TMP_003','I1005', 2.16)
  ) as src(task_code, labor_code, quantity)
  join public.master_tasks     mt on mt.organization_id = v_org_uuid and mt.code = src.task_code
  join public.labor_categories lc on lc.organization_id = v_org_text and lc.code = src.labor_code
  where not exists (
    select 1 from public.master_task_labor x
    where x.master_task_id = mt.id and x.labor_category_name = lc.role
  );

end $$;

commit;
