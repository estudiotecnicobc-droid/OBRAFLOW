-- =============================================================================
-- Migration 017: Unidad Comercial en APU + Constraints de Nomenclatura
-- Fecha: 2026-04-12
--
-- Problemas que resuelve:
--   1. La calculadora no sabe qué etiqueta mostrar en "A comprar"
--      (ej: "bolsas" vs "kg") porque master_task_materials solo tiene
--      conversion_factor (número) pero no el nombre de la unidad comercial.
--   2. No existe constraint que evite códigos duplicados de APU en la misma org.
--   3. La RPC 015 no propaga conversionFactor ni commercialUnit en la respuesta.
--
-- Estrategia incremental:
--   · ADD COLUMN IF NOT EXISTS — idempotente
--   · UNIQUE INDEX parcial   — solo afecta codes NOT NULL + is_active = true
--   · CREATE OR REPLACE RPC  — reemplaza 015 sin cambiar firma
--   · Nueva RPC de detección de duplicados
--
-- Tablas afectadas:
--   · master_task_materials (ADD COLUMN commercial_unit)
--   · master_tasks (CREATE UNIQUE INDEX)
--
-- Nuevas funciones:
--   · calculate_consolidated_resources  (reemplaza 015, misma firma)
--   · detect_duplicate_apu_codes        (nueva)
-- =============================================================================

-- =============================================================================
-- 1. commercial_unit en master_task_materials
-- =============================================================================
-- Ya existe conversion_factor (migration 010).
-- Agregamos commercial_unit: etiqueta de la unidad de compra.
--   Ejemplo: conversion_factor = 50, commercial_unit = 'bolsa 50 kg'
--   → pantalla: "24 bolsas 50 kg" en lugar de "1200 kg"
--   → fórmula: qty_comercial = CEIL(qty_base / conversion_factor)
--
-- NULL = sin presentación comercial; la unidad técnica (unit) es suficiente.

ALTER TABLE public.master_task_materials
  ADD COLUMN IF NOT EXISTS commercial_unit TEXT;

COMMENT ON COLUMN public.master_task_materials.commercial_unit IS
  'Etiqueta de la unidad comercial de compra. '
  'Ejemplo: "bolsa 50 kg", "barra 12 m", "caja x 10 unid". '
  'NULL = sin presentación comercial especial; se usa la unidad técnica (unit). '
  'Fórmula de conversión: qty_compra = CEIL(total_qty / conversion_factor). '
  'Correlación: commercial_unit IS NOT NULL implica conversion_factor IS NOT NULL.';

-- Check: si hay nombre comercial debe haber factor
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'mtm_commercial_unit_requires_factor'
      AND conrelid = 'public.master_task_materials'::regclass
      AND contype  = 'c'
  ) THEN
    ALTER TABLE public.master_task_materials
      ADD CONSTRAINT mtm_commercial_unit_requires_factor
        CHECK (commercial_unit IS NULL OR conversion_factor IS NOT NULL);
  END IF;
END;
$$;


-- =============================================================================
-- 2. UNIQUE constraint en master_tasks (code por org, solo activos)
-- =============================================================================
-- Previene la convivencia de MAM-001 y T1001 con el mismo nombre
-- si se aplica el código en ambos. Solo afecta registros con code NOT NULL
-- y is_active = true, para no bloquear el soft-delete.

CREATE UNIQUE INDEX IF NOT EXISTS master_tasks_org_code_active_uidx
  ON public.master_tasks (organization_id, code)
  WHERE code IS NOT NULL AND is_active = true;

COMMENT ON INDEX public.master_tasks_org_code_active_uidx IS
  'Garantiza que dos APUs activos de la misma organización no compartan código. '
  'Parcial (WHERE code IS NOT NULL AND is_active = true): '
  '· Permite codes NULL (APUs sin código asignado). '
  '· Permite reusar un código después de soft-delete (is_active = false).';


-- =============================================================================
-- 3. RPC: calculate_consolidated_resources (reemplaza 015)
--    Cambios respecto a 015:
--    · leg_mat incluye conversion_factor y commercial_unit de master_task_materials
--    · La respuesta materials[] incluye conversionFactor y commercialUnit
--    · Se agrega purchaseQuantity = CEIL(total_qty / conversion_factor) cuando aplica
--    · PATH B incluye commercial_unit y conversion_factor de resources
-- =============================================================================

CREATE OR REPLACE FUNCTION public.calculate_consolidated_resources(
  p_items            jsonb,
  p_organization_id  text,
  p_cost_date        date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Guard: lista vacía
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object(
      'materials',   '[]'::jsonb,
      'labor',       '[]'::jsonb,
      'equipment',   '[]'::jsonb,
      'apuSummary',  '[]'::jsonb,
      'totals',      jsonb_build_object('material',0,'labor',0,'equipment',0,'grandTotal',0),
      'computedAt',  to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    );
  END IF;

  WITH
  -- ── 1. Parsear items ────────────────────────────────────────────────────────
  input_items AS (
    SELECT
      elem->>'master_task_id'      AS task_id,
      (elem->>'quantity')::numeric AS qty
    FROM jsonb_array_elements(p_items) AS elem
    WHERE (elem->>'quantity')::numeric > 0
  ),

  -- ── 2. Validar tareas ───────────────────────────────────────────────────────
  valid_tasks AS (
    SELECT
      mt.id,
      mt.id::text   AS id_txt,
      mt.name,
      mt.daily_yield,
      ii.qty        AS req_qty
    FROM master_tasks mt
    INNER JOIN input_items ii ON ii.task_id = mt.id::text
    WHERE mt.is_active = true
      AND mt.organization_id::text = p_organization_id
  ),

  -- ═════════════════════════════════════════════════════════════════════════
  -- PATH A — legacy: master_task_materials / labor / equipment
  -- ═════════════════════════════════════════════════════════════════════════

  leg_mat AS (
    SELECT
      vt.id_txt                                                             AS task_id,
      vt.name                                                               AS task_name,
      vt.req_qty,
      COALESCE(
        mtm.master_material_id::text,
        LOWER(TRIM(mtm.material_name))
      )                                                                     AS agg_key,
      COALESCE(mm.code, '')                                                 AS code,
      mtm.material_name                                                     AS rname,
      mtm.unit,
      -- conversión comercial (010: conversion_factor + 017: commercial_unit)
      COALESCE(mtm.conversion_factor, 1.0)                                  AS conv_factor,
      mtm.commercial_unit,                                                  -- nuevo en 017
      -- cantidad técnica por unidad con desperdicio
      mtm.quantity * (1.0 + COALESCE(mtm.waste_percent, 0) / 100.0)       AS qty_pu,
      -- precio: live > snapshot > 0
      COALESCE(mm.unit_price, mtm.last_known_unit_price, 0)                AS uprice
    FROM valid_tasks vt
    INNER JOIN master_task_materials mtm ON mtm.master_task_id = vt.id
    LEFT  JOIN master_materials mm
           ON mm.id = mtm.master_material_id
          AND mm.is_active = true
  ),

  leg_lab AS (
    SELECT
      vt.id_txt                                                             AS task_id,
      vt.name                                                               AS task_name,
      vt.req_qty,
      mtl.labor_category_id                                                 AS agg_key,
      COALESCE(lc.role, mtl.labor_category_name)                           AS rname,
      'HH'                                                                  AS unit,
      CASE WHEN vt.daily_yield > 0
           THEN (mtl.quantity * 9.0) / vt.daily_yield
           ELSE 0
      END                                                                   AS qty_pu,
      COALESCE(
        lc.basic_hourly_rate * (
          1.0 + (COALESCE(lc.social_charges_percent, 0)
               + COALESCE(lc.insurance_percent, 0)) / 100.0
        ),
        mtl.snapshot_hourly_rate,
        0
      )                                                                     AS uprice
    FROM valid_tasks vt
    INNER JOIN master_task_labor mtl ON mtl.master_task_id = vt.id
    LEFT  JOIN labor_categories lc ON lc.id::text = mtl.labor_category_id
  ),

  leg_equ AS (
    SELECT
      vt.id_txt                                                             AS task_id,
      vt.name                                                               AS task_name,
      vt.req_qty,
      mte.tool_id                                                           AS agg_key,
      COALESCE(t.name, mte.tool_name)                                      AS rname,
      'HM'                                                                  AS unit,
      mte.hours_per_unit                                                    AS qty_pu,
      COALESCE(t.cost_per_hour, mte.snapshot_cost_per_hour, 0)            AS uprice
    FROM valid_tasks vt
    INNER JOIN master_task_equipment mte ON mte.master_task_id = vt.id
    LEFT  JOIN tools t ON t.id::text = mte.tool_id
  ),

  -- ═════════════════════════════════════════════════════════════════════════
  -- PATH B — catálogo: catalog_task_yields JOIN resources
  -- ═════════════════════════════════════════════════════════════════════════

  catalog_tasks AS (
    SELECT vt.id_txt, vt.name, vt.daily_yield, vt.req_qty
    FROM valid_tasks vt
    WHERE NOT EXISTS (SELECT 1 FROM master_task_materials WHERE master_task_id = vt.id)
      AND NOT EXISTS (SELECT 1 FROM master_task_labor    WHERE master_task_id = vt.id)
      AND NOT EXISTS (SELECT 1 FROM master_task_equipment WHERE master_task_id = vt.id)
  ),

  cat_yields AS (
    SELECT
      ct.id_txt                                   AS task_id,
      ct.name                                     AS task_name,
      ct.daily_yield,
      ct.req_qty,
      cty.quantity,
      r.id::text                                  AS resource_id,
      r.name                                      AS resource_name,
      r.unit                                      AS resource_unit,
      COALESCE(r.base_cost, 0)                    AS base_cost,
      r.type                                      AS resource_type,
      -- unidad comercial de resources (migration 003)
      COALESCE(cty.conversion_factor, r.conversion_factor, 1.0) AS conv_factor,
      COALESCE(cty.commercial_unit,   r.commercial_unit)         AS commercial_unit
    FROM catalog_tasks ct
    INNER JOIN catalog_task_yields cty ON cty.master_task_id = ct.id_txt::uuid
    INNER JOIN resources r             ON r.id = cty.resource_id AND r.is_active = true
  ),

  cat_mat AS (
    SELECT
      task_id, task_name, req_qty,
      resource_id    AS agg_key,
      ''             AS code,
      resource_name  AS rname,
      resource_unit  AS unit,
      conv_factor,
      commercial_unit,
      quantity       AS qty_pu,
      base_cost      AS uprice
    FROM cat_yields WHERE resource_type IN ('MATERIAL', 'SUBCONTRACT')
  ),

  cat_lab AS (
    SELECT
      task_id, task_name, req_qty,
      resource_id   AS agg_key,
      resource_name AS rname,
      'HH'          AS unit,
      quantity      AS qty_pu,
      base_cost     AS uprice
    FROM cat_yields WHERE resource_type = 'LABOR'
  ),

  cat_equ AS (
    SELECT
      task_id, task_name, req_qty,
      resource_id   AS agg_key,
      resource_name AS rname,
      'HM'          AS unit,
      quantity      AS qty_pu,
      base_cost     AS uprice
    FROM cat_yields WHERE resource_type = 'EQUIPMENT'
  ),

  -- ── UNION (materials incluye conv_factor + commercial_unit) ───────────────
  all_mat AS (
    SELECT task_id, task_name, req_qty, agg_key, code, rname, unit,
           conv_factor, commercial_unit, qty_pu, uprice
    FROM leg_mat
    UNION ALL
    SELECT task_id, task_name, req_qty, agg_key, code, rname, unit,
           conv_factor, commercial_unit, qty_pu, uprice
    FROM cat_mat
  ),

  -- labor y equipo no tienen conversión comercial
  all_lab AS (
    SELECT task_id, task_name, req_qty, agg_key, rname, unit, qty_pu, uprice
    FROM leg_lab
    UNION ALL
    SELECT task_id, task_name, req_qty, agg_key, rname, unit, qty_pu, uprice
    FROM cat_lab
  ),

  all_equ AS (
    SELECT task_id, task_name, req_qty, agg_key, rname, unit, qty_pu, uprice
    FROM leg_equ
    UNION ALL
    SELECT task_id, task_name, req_qty, agg_key, rname, unit, qty_pu, uprice
    FROM cat_equ
  ),

  -- ── Agregación cross-APU ──────────────────────────────────────────────────
  agg_mat AS (
    SELECT
      agg_key,
      MAX(code)                                              AS code,
      MAX(rname)                                             AS rname,
      MAX(unit)                                             AS unit,
      -- conv_factor y commercial_unit son propiedades del recurso (no de la tarea)
      -- → MAX es correcto; si difieren entre fuentes el usuario debe normalizar
      MAX(conv_factor)                                       AS conv_factor,
      MAX(commercial_unit)                                   AS commercial_unit,
      SUM(qty_pu * req_qty)                                  AS total_qty,
      SUM(qty_pu * req_qty * uprice)                         AS total_cost,
      array_agg(DISTINCT task_name ORDER BY task_name)       AS sources
    FROM all_mat
    GROUP BY agg_key
  ),

  agg_lab AS (
    SELECT
      agg_key,
      MAX(rname)                                             AS rname,
      MAX(unit)                                             AS unit,
      SUM(qty_pu * req_qty)                                  AS total_qty,
      SUM(qty_pu * req_qty * uprice)                         AS total_cost,
      array_agg(DISTINCT task_name ORDER BY task_name)       AS sources
    FROM all_lab
    GROUP BY agg_key
  ),

  agg_equ AS (
    SELECT
      agg_key,
      MAX(rname)                                             AS rname,
      MAX(unit)                                             AS unit,
      SUM(qty_pu * req_qty)                                  AS total_qty,
      SUM(qty_pu * req_qty * uprice)                         AS total_cost,
      array_agg(DISTINCT task_name ORDER BY task_name)       AS sources
    FROM all_equ
    GROUP BY agg_key
  ),

  -- ── Resumen por APU ───────────────────────────────────────────────────────
  apu_costs AS (
    SELECT task_id, SUM(qty_pu * uprice) AS mat_uc FROM all_mat GROUP BY task_id
  ),
  apu_lab_costs AS (
    SELECT task_id, SUM(qty_pu * uprice) AS lab_uc FROM all_lab GROUP BY task_id
  ),
  apu_equ_costs AS (
    SELECT task_id, SUM(qty_pu * uprice) AS equ_uc FROM all_equ GROUP BY task_id
  )

  -- ── JSON final ────────────────────────────────────────────────────────────
  SELECT jsonb_build_object(

    'materials', COALESCE((
      SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'resourceId',       agg_key,
        'code',             NULLIF(code, ''),
        'name',             rname,
        'unit',             unit,
        'totalQuantity',    ROUND(total_qty::numeric, 4),
        'unitCost',         ROUND(
          CASE WHEN total_qty > 0 THEN total_cost / total_qty ELSE 0 END::numeric, 2),
        'totalCost',        ROUND(total_cost::numeric, 2),
        -- Conversión comercial (NUEVO en 017)
        'conversionFactor', CASE WHEN conv_factor > 1 THEN conv_factor ELSE NULL END,
        'commercialUnit',   commercial_unit,
        -- qty_compra = CEIL(total_qty / conversion_factor); solo si CF > 1
        'purchaseQuantity', CASE
          WHEN conv_factor > 1
          THEN CEIL(total_qty / conv_factor)::integer
          ELSE NULL
        END,
        'sourceTaskNames',  sources
      )) ORDER BY rname)
      FROM agg_mat
    ), '[]'::jsonb),

    'labor', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'resourceId',      agg_key,
        'name',            rname,
        'unit',            unit,
        'totalQuantity',   ROUND(total_qty::numeric, 4),
        'unitCost',        ROUND(
          CASE WHEN total_qty > 0 THEN total_cost / total_qty ELSE 0 END::numeric, 2),
        'totalCost',       ROUND(total_cost::numeric, 2),
        'sourceTaskNames', sources
      ) ORDER BY rname)
      FROM agg_lab
    ), '[]'::jsonb),

    'equipment', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'resourceId',      agg_key,
        'name',            rname,
        'unit',            unit,
        'totalQuantity',   ROUND(total_qty::numeric, 4),
        'unitCost',        ROUND(
          CASE WHEN total_qty > 0 THEN total_cost / total_qty ELSE 0 END::numeric, 2),
        'totalCost',       ROUND(total_cost::numeric, 2),
        'sourceTaskNames', sources
      ) ORDER BY rname)
      FROM agg_equ
    ), '[]'::jsonb),

    'apuSummary', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'masterTaskId',  vt.id_txt,
        'name',          vt.name,
        'requestedQty',  vt.req_qty,
        'unitCosts', jsonb_build_object(
          'material',  ROUND(COALESCE(ac.mat_uc,  0)::numeric, 2),
          'labor',     ROUND(COALESCE(alc.lab_uc, 0)::numeric, 2),
          'equipment', ROUND(COALESCE(aec.equ_uc, 0)::numeric, 2),
          'total',     ROUND((
            COALESCE(ac.mat_uc,  0) +
            COALESCE(alc.lab_uc, 0) +
            COALESCE(aec.equ_uc, 0)
          )::numeric, 2)
        )
      ) ORDER BY vt.name)
      FROM valid_tasks vt
      LEFT JOIN apu_costs     ac  ON ac.task_id  = vt.id_txt
      LEFT JOIN apu_lab_costs alc ON alc.task_id = vt.id_txt
      LEFT JOIN apu_equ_costs aec ON aec.task_id = vt.id_txt
    ), '[]'::jsonb),

    'totals', jsonb_build_object(
      'material',
        COALESCE((SELECT ROUND(SUM(total_cost)::numeric, 2) FROM agg_mat), 0),
      'labor',
        COALESCE((SELECT ROUND(SUM(total_cost)::numeric, 2) FROM agg_lab), 0),
      'equipment',
        COALESCE((SELECT ROUND(SUM(total_cost)::numeric, 2) FROM agg_equ), 0),
      'grandTotal',
        COALESCE((SELECT ROUND(SUM(total_cost)::numeric, 2) FROM agg_mat), 0) +
        COALESCE((SELECT ROUND(SUM(total_cost)::numeric, 2) FROM agg_lab), 0) +
        COALESCE((SELECT ROUND(SUM(total_cost)::numeric, 2) FROM agg_equ), 0)
    ),

    'computedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')

  )
  INTO v_result;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_consolidated_resources(jsonb, text, date)
  TO authenticated;

COMMENT ON FUNCTION public.calculate_consolidated_resources IS
  'v2 (migration 017): agrega conversionFactor, commercialUnit y purchaseQuantity '
  'en el array materials[]. Fórmula compra: CEIL(totalQuantity / conversionFactor). '
  'PATH A usa master_task_materials.conversion_factor + commercial_unit. '
  'PATH B usa COALESCE(catalog_task_yields, resources) para ambos campos.';


-- =============================================================================
-- 4. RPC: detect_duplicate_apu_codes
-- =============================================================================
-- Retorna APUs con código duplicado en la misma organización.
-- Útil para detectar la convivencia de nomenclatura vieja (T1001) y nueva (MAM-001)
-- cuando ambas conviven como APUs diferentes pero con el mismo code.
-- También detecta duplicados por nombre.

CREATE OR REPLACE FUNCTION public.detect_duplicate_apu_codes(
  p_organization_id text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
WITH
dup_by_code AS (
  SELECT
    code,
    count(*)                                           AS qty,
    array_agg(jsonb_build_object(
      'id',   id,
      'name', name,
      'code', code,
      'isActive', is_active
    ) ORDER BY name)                                   AS tasks
  FROM master_tasks
  WHERE organization_id::text = p_organization_id
    AND code IS NOT NULL
  GROUP BY code
  HAVING count(*) > 1
),
dup_by_name AS (
  SELECT
    name,
    count(*)                                           AS qty,
    array_agg(jsonb_build_object(
      'id',   id,
      'name', name,
      'code', code,
      'isActive', is_active
    ) ORDER BY code NULLS LAST)                        AS tasks
  FROM master_tasks
  WHERE organization_id::text = p_organization_id
  GROUP BY name
  HAVING count(*) > 1
)
SELECT jsonb_build_object(
  'duplicatesByCode', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'code', code, 'count', qty, 'tasks', tasks
    ) ORDER BY code)
    FROM dup_by_code
  ), '[]'::jsonb),
  'duplicatesByName', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'name', name, 'count', qty, 'tasks', tasks
    ) ORDER BY name)
    FROM dup_by_name
  ), '[]'::jsonb),
  'checkedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
);
$$;

GRANT EXECUTE ON FUNCTION public.detect_duplicate_apu_codes(text)
  TO authenticated;

COMMENT ON FUNCTION public.detect_duplicate_apu_codes IS
  'Detecta APUs con código o nombre duplicado en la organización. '
  'Incluye activos e inactivos para detectar conflictos de nombrado legacy/nuevo.';
