-- ────────────────────────────────────────────────────────────────────────────
-- 016_apu_technical_report_rpc.sql
--
-- RPC: get_apu_technical_report
-- Devuelve el desglose técnico completo de un APU privado (master_task).
--
-- Cubre dos esquemas de composición:
--   PATH A (legacy):  master_task_materials / master_task_labor / master_task_equipment
--   PATH B (catálogo): catalog_task_yields JOIN resources
--
-- Resolución de costos (en orden de prioridad):
--   MATERIALES : master_materials.unit_price  > last_known_unit_price
--   LABOR      : labor_categories (live, con cargas sociales) > snapshot_hourly_rate
--   EQUIPOS    : tools.cost_per_hour  > snapshot_cost_per_hour
--   PATH B     : resources.base_cost
--
-- Seguridad: SECURITY INVOKER — el RLS del caller aplica a todas las tablas.
--
-- Parámetros:
--   p_master_task_id   UUID del APU a reportar
--   p_organization_id  tenant ID (text — compatible con 'org_a' y UUIDs reales)
--   p_cost_date        fecha base de costos (preparado para snapshots futuros)
--
-- Respuesta JSONB:
--   { masterTaskId, code, name, unit, category, dailyYield, workdayHours,
--     fixedCost, fixedCostDescription, isPathA, costDate,
--     lines: APUReportLine[], subtotals, totalDirectCost, computedAt }
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_apu_technical_report(
  p_master_task_id  uuid,
  p_organization_id text,
  p_cost_date       date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
WITH

-- ── 0. Cabecera del APU ───────────────────────────────────────────────────
task_hdr AS (
  SELECT
    mt.id,
    mt.code,
    mt.name,
    mt.unit,
    mt.category,
    mt.description,
    mt.specifications,
    mt.daily_yield,
    COALESCE(mt.fixed_cost, 0)             AS fixed_cost,
    mt.fixed_cost_description
  FROM master_tasks mt
  WHERE mt.id              = p_master_task_id
    AND mt.organization_id::text = p_organization_id
    AND mt.is_active       = true
),

-- ── 1. Detección de PATH ──────────────────────────────────────────────────
path_flag AS (
  SELECT (
    EXISTS (SELECT 1 FROM master_task_materials WHERE master_task_id = p_master_task_id)
    OR EXISTS (SELECT 1 FROM master_task_labor    WHERE master_task_id = p_master_task_id)
    OR EXISTS (SELECT 1 FROM master_task_equipment WHERE master_task_id = p_master_task_id)
  ) AS is_path_a
),

-- ═══════════════════════════════════════════════════════════════════════════
-- PATH A — Esquema legacy
-- ═══════════════════════════════════════════════════════════════════════════

-- A1. Materiales (sin APU anidado)
a_mat AS (
  SELECT
    mtm.id::text                                                      AS line_id,
    'MATERIAL'::text                                                  AS rtype,
    COALESCE(mm.code, '')                                             AS rcode,
    mtm.material_name                                                 AS rname,
    mtm.unit,
    mtm.quantity,
    COALESCE(mtm.conversion_factor, 1.0)                             AS conv_factor,
    COALESCE(mtm.waste_percent, 0)                                    AS waste_pct,
    NULL::numeric                                                     AS workers,
    NULL::numeric                                                     AS hours_pu,
    COALESCE(mm.unit_price, mtm.last_known_unit_price, 0)            AS base_cost,
    NULL::numeric                                                     AS soc_pct,
    CASE
      WHEN mm.unit_price IS NOT NULL          THEN 'RESOURCE_BASE'
      WHEN mtm.last_known_unit_price IS NOT NULL THEN 'LEGACY_PRICE'
      ELSE 'LEGACY_PRICE'
    END                                                               AS cost_src,
    NULL::text                                                        AS line_note
  FROM master_task_materials mtm
  LEFT JOIN master_materials mm
         ON mm.id = mtm.master_material_id AND mm.is_active = true
  WHERE mtm.master_task_id      = p_master_task_id
    AND mtm.sub_master_task_id IS NULL
    AND (SELECT is_path_a FROM path_flag)
),

-- A2. APUs anidados (se muestran como SUBCONTRACT sin expandir)
a_nested AS (
  SELECT
    mtm.id::text                                                      AS line_id,
    'SUBCONTRACT'::text                                               AS rtype,
    ''                                                                AS rcode,
    mtm.material_name                                                 AS rname,
    mtm.unit,
    mtm.quantity,
    1.0::numeric                                                      AS conv_factor,
    COALESCE(mtm.waste_percent, 0)                                    AS waste_pct,
    NULL::numeric                                                     AS workers,
    NULL::numeric                                                     AS hours_pu,
    COALESCE(mtm.last_known_unit_price, 0)                           AS base_cost,
    NULL::numeric                                                     AS soc_pct,
    'LEGACY_PRICE'::text                                              AS cost_src,
    'APU anidado — costo estimado'::text                             AS line_note
  FROM master_task_materials mtm
  WHERE mtm.master_task_id    = p_master_task_id
    AND mtm.sub_master_task_id IS NOT NULL
    AND (SELECT is_path_a FROM path_flag)
),

-- A3. Mano de obra
-- Tarifa efectiva = basic_hourly_rate × (1 + (social_charges + insurance) / 100)
-- HH/u = (trabajadores × 9h) / rendimiento_diario
a_lab AS (
  SELECT
    mtl.id::text                                                                   AS line_id,
    'LABOR'::text                                                                  AS rtype,
    ''                                                                             AS rcode,
    COALESCE(lc.role, mtl.labor_category_name)                                    AS rname,
    'HH'::text                                                                     AS unit,
    mtl.quantity                                                                   AS quantity,
    1.0::numeric                                                                   AS conv_factor,
    0::numeric                                                                     AS waste_pct,
    mtl.quantity                                                                   AS workers,
    CASE WHEN th.daily_yield > 0
         THEN ROUND((mtl.quantity * 9.0) / th.daily_yield, 6)
         ELSE 0
    END                                                                            AS hours_pu,
    COALESCE(lc.basic_hourly_rate, mtl.snapshot_hourly_rate, 0)                  AS base_cost,
    CASE WHEN lc.id IS NOT NULL
         THEN COALESCE(lc.social_charges_percent, 0) + COALESCE(lc.insurance_percent, 0)
         ELSE NULL
    END                                                                            AS soc_pct,
    CASE WHEN lc.id IS NOT NULL THEN 'RESOURCE_BASE' ELSE 'LEGACY_PRICE' END      AS cost_src,
    NULL::text                                                                     AS line_note
  FROM master_task_labor mtl
  CROSS JOIN task_hdr th
  LEFT JOIN labor_categories lc ON lc.id::text = mtl.labor_category_id
  WHERE mtl.master_task_id = p_master_task_id
    AND (SELECT is_path_a FROM path_flag)
),

-- A4. Equipos
a_equ AS (
  SELECT
    mte.id::text                                                      AS line_id,
    'EQUIPMENT'::text                                                 AS rtype,
    ''                                                                AS rcode,
    COALESCE(t.name, mte.tool_name)                                   AS rname,
    'HM'::text                                                        AS unit,
    mte.hours_per_unit                                                AS quantity,
    1.0::numeric                                                      AS conv_factor,
    0::numeric                                                        AS waste_pct,
    NULL::numeric                                                     AS workers,
    mte.hours_per_unit                                                AS hours_pu,
    COALESCE(t.cost_per_hour, mte.snapshot_cost_per_hour, 0)         AS base_cost,
    NULL::numeric                                                     AS soc_pct,
    CASE WHEN t.id IS NOT NULL THEN 'RESOURCE_BASE' ELSE 'LEGACY_PRICE' END AS cost_src,
    NULL::text                                                        AS line_note
  FROM master_task_equipment mte
  LEFT JOIN tools t ON t.id::text = mte.tool_id
  WHERE mte.master_task_id = p_master_task_id
    AND (SELECT is_path_a FROM path_flag)
),

-- ═══════════════════════════════════════════════════════════════════════════
-- PATH B — Catálogo de recursos
-- ═══════════════════════════════════════════════════════════════════════════
b_lines AS (
  SELECT
    cty.id::text                                                               AS line_id,
    r.type::text                                                               AS rtype,
    COALESCE(r.code, '')                                                       AS rcode,
    r.name                                                                     AS rname,
    r.unit,
    cty.quantity,
    1.0::numeric                                                               AS conv_factor,
    0::numeric                                                                 AS waste_pct,
    -- Para LABOR en PATH B: quantity = HH/u directas (sin workers intermedios)
    CASE WHEN r.type = 'LABOR' THEN cty.quantity ELSE NULL END                AS workers,
    CASE WHEN r.type IN ('LABOR','EQUIPMENT') THEN cty.quantity ELSE NULL END AS hours_pu,
    COALESCE(r.base_cost, 0)                                                   AS base_cost,
    CASE WHEN r.type = 'LABOR' THEN COALESCE(r.social_charges_pct, 0)
         ELSE NULL
    END                                                                        AS soc_pct,
    'RESOURCE_BASE'::text                                                      AS cost_src,
    NULL::text                                                                 AS line_note
  FROM catalog_task_yields cty
  JOIN resources r ON r.id = cty.resource_id AND r.is_active = true
  WHERE cty.master_task_id = p_master_task_id
    AND NOT (SELECT is_path_a FROM path_flag)
),

-- ── 2. Unión de todas las líneas ──────────────────────────────────────────
raw_lines AS (
  SELECT * FROM a_mat
  UNION ALL SELECT * FROM a_nested
  UNION ALL SELECT * FROM a_lab
  UNION ALL SELECT * FROM a_equ
  UNION ALL SELECT * FROM b_lines
),

-- ── 3. Cálculo de costo efectivo y aporte ────────────────────────────────
computed AS (
  SELECT
    rl.*,
    -- Costo efectivo por unidad (después de cargas para LABOR, conversión para MAT)
    CASE rl.rtype
      WHEN 'MATERIAL'    THEN rl.base_cost * rl.conv_factor
      WHEN 'LABOR'       THEN rl.base_cost * (1.0 + COALESCE(rl.soc_pct, 0) / 100.0)
      WHEN 'EQUIPMENT'   THEN rl.base_cost
      WHEN 'SUBCONTRACT' THEN rl.base_cost
      ELSE rl.base_cost
    END                                                                AS eff_unit,
    -- Aporte al costo unitario del APU
    CASE rl.rtype
      WHEN 'MATERIAL'    THEN rl.base_cost * rl.conv_factor
                              * rl.quantity * (1.0 + rl.waste_pct / 100.0)
      WHEN 'LABOR'       THEN rl.base_cost * (1.0 + COALESCE(rl.soc_pct, 0) / 100.0)
                              * COALESCE(rl.hours_pu, 0)
      WHEN 'EQUIPMENT'   THEN rl.base_cost * COALESCE(rl.hours_pu, rl.quantity)
      WHEN 'SUBCONTRACT' THEN rl.base_cost * rl.quantity * (1.0 + rl.waste_pct / 100.0)
      ELSE rl.base_cost
    END                                                                AS contrib
  FROM raw_lines rl
),

-- ── 4. Subtotales por tipo ────────────────────────────────────────────────
subs AS (
  SELECT
    COALESCE(SUM(CASE WHEN rtype = 'MATERIAL'    THEN contrib ELSE 0 END), 0) AS mat,
    COALESCE(SUM(CASE WHEN rtype = 'LABOR'       THEN contrib ELSE 0 END), 0) AS lab,
    COALESCE(SUM(CASE WHEN rtype = 'EQUIPMENT'   THEN contrib ELSE 0 END), 0) AS equ,
    COALESCE(SUM(CASE WHEN rtype = 'SUBCONTRACT' THEN contrib ELSE 0 END), 0) AS sub
  FROM computed
),

-- ── 5. Serialización de líneas a JSONB ───────────────────────────────────
lines_json AS (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'id',               c.line_id,
        'resourceType',     c.rtype,
        'resourceCode',     NULLIF(c.rcode, ''),
        'resourceName',     c.rname,
        'unit',             c.unit,
        'quantity',         c.quantity,
        'conversionFactor', c.conv_factor,
        'wastePercent',     c.waste_pct,
        'workers',          c.workers,
        'hoursPerUnit',     c.hours_pu,
        'baseCost',         ROUND(c.base_cost, 4),
        'socialChargesPct', c.soc_pct,
        'effectiveUnitCost',ROUND(c.eff_unit,  4),
        'contribution',     ROUND(c.contrib,   4),
        'costSource',       c.cost_src,
        'note',             c.line_note
      ))
      ORDER BY
        CASE c.rtype
          WHEN 'MATERIAL'    THEN 1
          WHEN 'LABOR'       THEN 2
          WHEN 'EQUIPMENT'   THEN 3
          WHEN 'SUBCONTRACT' THEN 4
          ELSE 5
        END,
        c.rname
    ),
    '[]'::jsonb
  ) AS arr
  FROM computed c
)

-- ── 6. Resultado final ────────────────────────────────────────────────────
SELECT COALESCE(
  (
    SELECT jsonb_build_object(
      'masterTaskId',         th.id,
      'code',                 th.code,
      'name',                 th.name,
      'unit',                 th.unit,
      'category',             th.category,
      'description',          th.description,
      'specifications',       th.specifications,
      'dailyYield',           th.daily_yield,
      'workdayHours',         9,
      'fixedCost',            th.fixed_cost,
      'fixedCostDescription', th.fixed_cost_description,
      'isPathA',              (SELECT is_path_a FROM path_flag),
      'costDate',             p_cost_date,
      'lines',                (SELECT arr FROM lines_json),
      'subtotals', jsonb_build_object(
        'material',    ROUND((SELECT mat FROM subs), 4),
        'labor',       ROUND((SELECT lab FROM subs), 4),
        'equipment',   ROUND((SELECT equ FROM subs), 4),
        'subcontract', ROUND((SELECT sub FROM subs), 4),
        'fixed',       ROUND(th.fixed_cost, 4)
      ),
      'totalDirectCost', ROUND(
        (SELECT mat + lab + equ + sub FROM subs) + th.fixed_cost,
        4
      ),
      'computedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )
    FROM task_hdr th
  ),
  jsonb_build_object('error', 'APU no encontrado o sin acceso')
);
$$;

COMMENT ON FUNCTION public.get_apu_technical_report IS
  'Reporte técnico completo de un APU: línea por recurso con costo base, '
  'cargas sociales, costo efectivo y aporte al costo unitario. '
  'Cubre PATH A (master_task_materials/labor/equipment) y PATH B (catalog_task_yields). '
  'SECURITY INVOKER: el RLS del caller controla el acceso.';
