-- ============================================================
-- P0 DIAGNOSTIC: APU Mampostería 18 cm — Auditoría matemática
-- Fecha: 2026-05-30
-- Propósito: SELECT-only. No modifica datos.
-- Contexto: Proyectos QA_E2E muestran 45 ladrillos / 45 m³ arena /
--           45 kg cemento en lugar de 270 / 0.45 / 22.5 para 45 m².
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- ADVERTENCIA METODOLÓGICA
-- Los rendimientos y precios de la tabla siguiente son valores
-- PROVISIONALES DEL FIXTURE QA, elegidos para verificar que la
-- multiplicación lineal qty × precio funciona. NO son una receta
-- editorial validada por Chandías, Di Fiore ni otra fuente técnica.
-- No sembrar en el Catálogo Global sin revisión profesional.
-- ─────────────────────────────────────────────────────────────
-- 0. Valores provisionales del fixture QA para Muro 18 cm
--    (APU por m²)
--    Material          | Rendimiento fixture | Precio ref. fixture
--    ------------------+--------------------+--------------------
--    Ladrillo hueco 18 | 6 u/m²             | ~$250/u
--    Arena gruesa      | 0.01 m³/m²         | ~$12.000/m³
--    Cemento portland  | 0.5 kg/m²          | ~$250/kg
--    MO Albañil        | no cargada en test | —
--    ------------------+--------------------+--------------------
--    Nota: WORKDAY_HOURS real del sistema = 9 h
--          (masterTaskCostService.ts + calculationService.ts)
-- ─────────────────────────────────────────────────────────────


-- ─────────────────────────────────────────────────────────────
-- 1. Proyectos QA_E2E activos
-- ─────────────────────────────────────────────────────────────
SELECT
    p.id                   AS project_id,
    p.name                 AS project_name,
    p.organization_id,
    p.created_at
FROM projects p
WHERE p.name ILIKE 'QA_E2E%'
ORDER BY p.created_at DESC
LIMIT 20;


-- ─────────────────────────────────────────────────────────────
-- 2. Tasks (APUs) importados a proyectos QA_E2E
--    Filtra por nombre que contenga muro / mampostería
-- ─────────────────────────────────────────────────────────────
SELECT
    t.id                   AS task_id,
    t.name                 AS task_name,
    t.unit,
    t.category,
    t.daily_yield,
    t.labor_cost,
    t.is_active,
    t.organization_id,
    p.name                 AS project_name
FROM tasks t
JOIN projects p ON p.organization_id = t.organization_id
WHERE p.name ILIKE 'QA_E2E%'
  AND (
        t.name ILIKE '%muro%'
     OR t.name ILIKE '%mampo%'
     OR t.name ILIKE '%ladrillo%'
     OR t.name ILIKE '%18%'
  )
ORDER BY t.created_at DESC
LIMIT 30;


-- ─────────────────────────────────────────────────────────────
-- 3. Task yields de esos APUs
--    Muestra: material, unidad, quantity (rendimiento/m²), precio
-- ─────────────────────────────────────────────────────────────
SELECT
    ty.id                  AS yield_id,
    ty.task_id,
    ty.material_id,
    m.name                 AS material_name,
    m.unit                 AS material_unit,
    ty.quantity            AS yield_qty,        -- rendimiento por unidad de APU
    m.cost                 AS current_unit_cost,
    (ty.quantity * m.cost) AS partial_cost_per_unit,
    -- Diagnóstico: ¿el yield es 1 (bug) o el valor correcto?
    CASE
        WHEN ty.quantity = 1 THEN '⚠️ SOSPECHOSO: qty=1 (posible default, no editado)'
        WHEN ty.quantity = 0 THEN '🔴 ERROR: qty=0'
        WHEN ty.quantity IS NULL THEN '🔴 ERROR: qty=NULL'
        ELSE '✅ qty=' || ty.quantity::text
    END                    AS qty_flag
FROM task_yields ty
JOIN tasks t       ON t.id = ty.task_id
JOIN materials m   ON m.id = ty.material_id
JOIN projects p    ON p.organization_id = t.organization_id
WHERE p.name ILIKE 'QA_E2E%'
  AND (
        t.name ILIKE '%muro%'
     OR t.name ILIKE '%mampo%'
     OR t.name ILIKE '%ladrillo%'
     OR t.name ILIKE '%18%'
  )
ORDER BY t.id, m.name;


-- ─────────────────────────────────────────────────────────────
-- 4. Labor yields del APU (mano de obra)
-- ─────────────────────────────────────────────────────────────
SELECT
    tly.id                 AS labor_yield_id,
    tly.task_id,
    lc.name                AS labor_category,
    tly.quantity           AS labor_qty,
    lc.daily_rate,
    -- MO por unidad APU = (basicHourlyRate × cargosFactor × 9h × labor_qty) / daily_yield
    -- WORKDAY_HOURS = 9 (constante real en calculationService.ts y masterTaskCostService.ts)
    -- daily_yield debe leerse de la tabla tasks
    CASE
        WHEN tly.quantity IS NULL THEN '🔴 qty=NULL'
        WHEN tly.quantity = 0    THEN '⚠️ qty=0 (sin MO)'
        ELSE '✅ qty=' || tly.quantity::text
    END                    AS labor_qty_flag
FROM task_labor_yields tly
JOIN tasks t             ON t.id = tly.task_id
JOIN labor_categories lc ON lc.id = tly.labor_category_id
JOIN projects p          ON p.organization_id = t.organization_id
WHERE p.name ILIKE 'QA_E2E%'
  AND (
        t.name ILIKE '%muro%'
     OR t.name ILIKE '%mampo%'
     OR t.name ILIKE '%ladrillo%'
     OR t.name ILIKE '%18%'
  )
ORDER BY t.id;


-- ─────────────────────────────────────────────────────────────
-- 5. Budget items del APU (cómo aparece en el presupuesto)
-- ─────────────────────────────────────────────────────────────
SELECT
    bi.id                  AS budget_item_id,
    bi.task_id,
    bi.quantity            AS presupuesto_qty,   -- 45 m² si se ingresó bien
    bi.sort_order,
    bi.computation_item_id,
    t.name                 AS task_name,
    t.unit                 AS task_unit,
    t.daily_yield,
    t.labor_cost           AS task_labor_cost_snapshot,
    p.name                 AS project_name
FROM budget_items bi
JOIN tasks t    ON t.id = bi.task_id
JOIN projects p ON p.id = bi.project_id
WHERE p.name ILIKE 'QA_E2E%'
  AND (
        t.name ILIKE '%muro%'
     OR t.name ILIKE '%mampo%'
     OR t.name ILIKE '%ladrillo%'
     OR t.name ILIKE '%18%'
  )
ORDER BY bi.created_at DESC
LIMIT 20;


-- ─────────────────────────────────────────────────────────────
-- 6. Computation items (si la sesión Chandías fue guardada)
-- ─────────────────────────────────────────────────────────────
SELECT
    ci.id                  AS computation_item_id,
    ci.chandias_task_id,
    ci.master_task_id,
    ci.quantity,
    ci.unidad,
    ci.dims                AS dimensions_json,
    ci.sort_order,
    cs.id                  AS session_id,
    cs.status              AS session_status,
    p.name                 AS project_name
FROM computation_items ci
JOIN project_computations cs ON cs.id = ci.computation_session_id
JOIN projects p              ON p.id = cs.project_id
WHERE p.name ILIKE 'QA_E2E%'
ORDER BY ci.sort_order
LIMIT 30;


-- ─────────────────────────────────────────────────────────────
-- 7. Master task (APU maestra en el catálogo de empresa)
--    Busca el APU fuente en master_tasks
-- ─────────────────────────────────────────────────────────────
SELECT
    mt.id,
    mt.name,
    mt.unit,
    mt.category,
    mt.daily_yield,
    mt.organization_id,
    mt.is_active,
    -- Si organization_id IS NULL → es global
    CASE WHEN mt.organization_id IS NULL THEN '🌐 GLOBAL' ELSE '🏢 ORG' END AS scope
FROM master_tasks mt
WHERE (
        mt.name ILIKE '%muro%'
     OR mt.name ILIKE '%mampo%'
     OR mt.name ILIKE '%ladrillo%'
     OR mt.name ILIKE '%18%'
  )
  AND mt.is_active = true
ORDER BY mt.organization_id NULLS FIRST, mt.name;


-- ─────────────────────────────────────────────────────────────
-- 8. Master task materials del APU maestra
--    Rendimientos almacenados en el catálogo de empresa
-- ─────────────────────────────────────────────────────────────
SELECT
    mtm.id,
    mtm.master_task_id,
    mtm.name               AS material_name,
    mtm.unit               AS material_unit,
    mtm.quantity           AS yield_qty,         -- rendimiento por unidad
    mtm.waste_percent,
    mtm.last_known_unit_price,
    mtm.master_material_id,
    -- Diagnóstico
    CASE
        WHEN mtm.quantity = 1        THEN '⚠️ qty=1 (posible sin editar)'
        WHEN mtm.quantity = 0        THEN '🔴 qty=0'
        WHEN mtm.quantity IS NULL    THEN '🔴 qty=NULL'
        ELSE '✅ qty=' || mtm.quantity::text
    END                    AS qty_flag,
    CASE
        WHEN mtm.last_known_unit_price = 0   THEN '🔴 precio=0'
        WHEN mtm.last_known_unit_price IS NULL THEN '⚠️ precio=NULL'
        ELSE '✅ precio=' || mtm.last_known_unit_price::text
    END                    AS price_flag
FROM master_task_materials mtm
JOIN master_tasks mt ON mt.id = mtm.master_task_id
WHERE (
        mt.name ILIKE '%muro%'
     OR mt.name ILIKE '%mampo%'
     OR mt.name ILIKE '%ladrillo%'
     OR mt.name ILIKE '%18%'
  )
  AND mt.is_active = true
ORDER BY mt.organization_id NULLS FIRST, mt.name, mtm.name;


-- ─────────────────────────────────────────────────────────────
-- 9. Detección global: yields sospechosos en todos los APUs
--    (no solo QA, para detectar contaminación en catálogo)
-- ─────────────────────────────────────────────────────────────
SELECT
    'task_yields'          AS table_name,
    ty.id,
    t.name                 AS task_name,
    m.name                 AS material_name,
    ty.quantity,
    'qty=1 sospechoso'     AS issue
FROM task_yields ty
JOIN tasks t     ON t.id = ty.task_id
JOIN materials m ON m.id = ty.material_id
WHERE ty.quantity = 1
  AND t.name NOT ILIKE '%seed%'  -- excluir datos de seed si los hay
  AND t.is_active = true

UNION ALL

SELECT
    'master_task_materials',
    mtm.id,
    mt.name,
    mtm.name,
    mtm.quantity,
    'qty=1 sospechoso'
FROM master_task_materials mtm
JOIN master_tasks mt ON mt.id = mtm.master_task_id
WHERE mtm.quantity = 1
  AND mt.is_active = true

ORDER BY table_name, task_name, material_name
LIMIT 100;


-- ─────────────────────────────────────────────────────────────
-- 10. Reconstrucción del costo unitario (verificación de fórmulas)
--     Replica la lógica de calculationService.calculateUnitPrice()
--     para un task_id específico del proyecto QA.
--
-- INSTRUCCIONES:
--   1. Ejecutar consultas 1-5 primero para obtener el task_id correcto.
--   2. Reemplazar '<TASK_ID>' (dos ocurrencias) con el UUID real.
--   3. Descomentar el bloque WITH...SELECT y ejecutarlo.
--
-- Nota: calculationService.ts usa basicHourlyRate × cargosFactor × 9h.
--       Esta consulta aproxima con daily_rate / daily_yield si no hay
--       access directo a basicHourlyRate desde SQL.
-- ─────────────────────────────────────────────────────────────

/*
WITH
task_data AS (
    SELECT id, daily_yield, labor_cost
    FROM tasks
    WHERE id = '<TASK_ID>'
),
material_cost AS (
    SELECT
        SUM(ty.quantity * m.cost) AS total_material_cost,
        COUNT(*)                   AS material_count
    FROM task_yields ty
    JOIN materials m ON m.id = ty.material_id
    WHERE ty.task_id = '<TASK_ID>'
),
labor_cost_derived AS (
    -- WORKDAY_HOURS = 9 según calculationService.ts y masterTaskCostService.ts
    -- lc.basic_hourly_rate × cargos_factor × 9h × qty / daily_yield
    -- Aproximación simplificada: si labor_categories expone daily_rate,
    -- usar daily_rate × qty / daily_yield (sin multiplicar por horas)
    SELECT
        SUM( (lc.daily_rate * tly.quantity) / NULLIF(t.daily_yield, 0) ) AS total_labor_cost
    FROM task_labor_yields tly
    JOIN labor_categories lc ON lc.id = tly.labor_category_id
    JOIN tasks t             ON t.id = tly.task_id
    WHERE tly.task_id = '<TASK_ID>'
)
SELECT
    td.daily_yield,
    td.labor_cost         AS labor_cost_snapshot,
    mc.total_material_cost,
    mc.material_count,
    COALESCE(lc.total_labor_cost, td.labor_cost) AS effective_labor_cost,
    mc.total_material_cost
        + COALESCE(lc.total_labor_cost, td.labor_cost) AS unit_cost_per_m2,
    -- Para 45 m²:
    45 * (mc.total_material_cost
        + COALESCE(lc.total_labor_cost, td.labor_cost)) AS total_cost_45m2
FROM task_data td
CROSS JOIN material_cost mc
CROSS JOIN labor_cost_derived lc;
*/
