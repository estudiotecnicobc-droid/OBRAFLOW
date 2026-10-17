-- =============================================================================
-- Migration 057: Add commercial_unit and conversion_factor to public.resources
-- Fecha: 2026-05-25
--
-- Root cause:
--   Migration 003 defined these columns but was never executed in production.
--   The RPC calculate_consolidated_resources (PATH B) references r.conversion_factor
--   and r.commercial_unit, causing "column r.conversion_factor does not exist" at runtime.
--
--   Same pattern as migration 056 (catalog_task_yields) — early migrations were
--   skipped when the production DB was bootstrapped.
--
-- Safe: ADD COLUMN IF NOT EXISTS + DO block constraint + CREATE OR REPLACE — fully idempotent.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add commercial_unit to resources
-- ---------------------------------------------------------------------------
ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS commercial_unit text;

COMMENT ON COLUMN public.resources.commercial_unit IS
  'Unidad de compra o comercial del recurso. NULL = unidad base (unit). '
  'Ejemplos: "bolsa 50 kg", "litro", "barra 12 m".';

-- ---------------------------------------------------------------------------
-- 2. Add conversion_factor to resources
-- ---------------------------------------------------------------------------
ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS conversion_factor numeric(14,6);

COMMENT ON COLUMN public.resources.conversion_factor IS
  'Cuántas unidades base (unit) contiene 1 unidad comercial. '
  'Debe ser > 0 cuando está definido. NULL = sin conversión (relación 1:1). '
  'Ejemplo: unit=kg, commercial_unit=bolsa 50kg → conversion_factor=50.';

-- ---------------------------------------------------------------------------
-- 3. Default values for existing rows
--    conversion_factor = 1 where NULL (neutral: 1 unidad base = 1 unidad comercial)
--    commercial_unit   = unit where NULL (heredar unidad técnica como comercial)
-- ---------------------------------------------------------------------------
UPDATE public.resources
  SET conversion_factor = 1
  WHERE conversion_factor IS NULL;

UPDATE public.resources
  SET commercial_unit = unit
  WHERE commercial_unit IS NULL AND unit IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Check constraint (idempotent via DO block)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'resources_conversion_factor_positive'
      AND conrelid = 'public.resources'::regclass
      AND contype  = 'c'
  ) THEN
    ALTER TABLE public.resources
      ADD CONSTRAINT resources_conversion_factor_positive
        CHECK (conversion_factor IS NULL OR conversion_factor > 0);
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Recreate RPC with explicit defensive COALESCEs
--    All COALESCE calls in PATH B already have fallback 1.0 for conversion_factor
--    and NULL for commercial_unit — this is just a safety republish after the
--    schema is now complete.
-- ---------------------------------------------------------------------------
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
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object(
      'materials',  '[]'::jsonb,
      'labor',      '[]'::jsonb,
      'equipment',  '[]'::jsonb,
      'apuSummary', '[]'::jsonb,
      'totals',     jsonb_build_object('material',0,'labor',0,'equipment',0,'grandTotal',0),
      'computedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    );
  END IF;

  WITH
  input_items AS (
    SELECT
      elem->>'master_task_id'      AS task_id,
      (elem->>'quantity')::numeric AS qty
    FROM jsonb_array_elements(p_items) AS elem
    WHERE (elem->>'quantity')::numeric > 0
  ),

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

  -- PATH A: master_task_materials
  leg_mat AS (
    SELECT
      vt.id_txt                                                              AS task_id,
      vt.name                                                                AS task_name,
      vt.req_qty,
      COALESCE(mtm.master_material_id::text, LOWER(TRIM(mtm.material_name))) AS agg_key,
      COALESCE(mm.code, '')                                                  AS code,
      mtm.material_name                                                      AS rname,
      mtm.unit,
      COALESCE(mtm.conversion_factor, 1.0)                                   AS conv_factor,
      mtm.commercial_unit,
      mtm.quantity * (1.0 + COALESCE(mtm.waste_percent, 0) / 100.0)        AS qty_pu,
      COALESCE(mm.unit_price, mtm.last_known_unit_price, 0)                 AS uprice
    FROM valid_tasks vt
    INNER JOIN master_task_materials mtm ON mtm.master_task_id = vt.id
    LEFT  JOIN master_materials mm
           ON mm.id = mtm.master_material_id AND mm.is_active = true
  ),

  leg_lab AS (
    SELECT
      vt.id_txt  AS task_id,
      vt.name    AS task_name,
      vt.req_qty,
      mtl.labor_category_id AS agg_key,
      COALESCE(lc.role, mtl.labor_category_name) AS rname,
      'HH'       AS unit,
      CASE WHEN vt.daily_yield > 0
           THEN (mtl.quantity * 9.0) / vt.daily_yield
           ELSE 0
      END        AS qty_pu,
      COALESCE(
        lc.basic_hourly_rate * (1.0 + (COALESCE(lc.social_charges_percent,0) + COALESCE(lc.insurance_percent,0)) / 100.0),
        mtl.snapshot_hourly_rate,
        0
      ) AS uprice
    FROM valid_tasks vt
    INNER JOIN master_task_labor mtl ON mtl.master_task_id = vt.id
    LEFT  JOIN labor_categories lc ON lc.id::text = mtl.labor_category_id
  ),

  leg_equ AS (
    SELECT
      vt.id_txt  AS task_id,
      vt.name    AS task_name,
      vt.req_qty,
      mte.tool_id AS agg_key,
      COALESCE(t.name, mte.tool_name) AS rname,
      'HM'       AS unit,
      mte.hours_per_unit AS qty_pu,
      COALESCE(t.cost_per_hour, mte.snapshot_cost_per_hour, 0) AS uprice
    FROM valid_tasks vt
    INNER JOIN master_task_equipment mte ON mte.master_task_id = vt.id
    LEFT  JOIN tools t ON t.id::text = mte.tool_id
  ),

  -- PATH B: catalog_task_yields (all conversion columns now exist after 056 + 057)
  catalog_tasks AS (
    SELECT vt.id_txt, vt.name, vt.daily_yield, vt.req_qty
    FROM valid_tasks vt
    WHERE NOT EXISTS (SELECT 1 FROM master_task_materials WHERE master_task_id = vt.id)
      AND NOT EXISTS (SELECT 1 FROM master_task_labor    WHERE master_task_id = vt.id)
      AND NOT EXISTS (SELECT 1 FROM master_task_equipment WHERE master_task_id = vt.id)
  ),

  cat_yields AS (
    SELECT
      ct.id_txt    AS task_id,
      ct.name      AS task_name,
      ct.daily_yield,
      ct.req_qty,
      cty.quantity,
      r.id::text   AS resource_id,
      r.name       AS resource_name,
      r.unit       AS resource_unit,
      COALESCE(r.base_cost, 0) AS base_cost,
      r.type       AS resource_type,
      COALESCE(cty.conversion_factor, r.conversion_factor, 1.0) AS conv_factor,
      COALESCE(cty.commercial_unit,   r.commercial_unit)         AS commercial_unit
    FROM catalog_tasks ct
    INNER JOIN catalog_task_yields cty ON cty.master_task_id = ct.id_txt::uuid
    INNER JOIN resources r ON r.id = cty.resource_id AND r.is_active = true
  ),

  cat_mat AS (
    SELECT task_id, task_name, req_qty, resource_id AS agg_key, '' AS code,
           resource_name AS rname, resource_unit AS unit,
           conv_factor, commercial_unit, quantity AS qty_pu, base_cost AS uprice
    FROM cat_yields WHERE resource_type IN ('MATERIAL', 'SUBCONTRACT')
  ),

  cat_lab AS (
    SELECT task_id, task_name, req_qty, resource_id AS agg_key,
           resource_name AS rname, 'HH' AS unit, quantity AS qty_pu, base_cost AS uprice
    FROM cat_yields WHERE resource_type = 'LABOR'
  ),

  cat_equ AS (
    SELECT task_id, task_name, req_qty, resource_id AS agg_key,
           resource_name AS rname, 'HM' AS unit, quantity AS qty_pu, base_cost AS uprice
    FROM cat_yields WHERE resource_type = 'EQUIPMENT'
  ),

  all_mat AS (
    SELECT task_id, task_name, req_qty, agg_key, code, rname, unit, conv_factor, commercial_unit, qty_pu, uprice FROM leg_mat
    UNION ALL
    SELECT task_id, task_name, req_qty, agg_key, code, rname, unit, conv_factor, commercial_unit, qty_pu, uprice FROM cat_mat
  ),

  all_lab AS (
    SELECT task_id, task_name, req_qty, agg_key, rname, unit, qty_pu, uprice FROM leg_lab
    UNION ALL
    SELECT task_id, task_name, req_qty, agg_key, rname, unit, qty_pu, uprice FROM cat_lab
  ),

  all_equ AS (
    SELECT task_id, task_name, req_qty, agg_key, rname, unit, qty_pu, uprice FROM leg_equ
    UNION ALL
    SELECT task_id, task_name, req_qty, agg_key, rname, unit, qty_pu, uprice FROM cat_equ
  ),

  agg_mat AS (
    SELECT
      agg_key,
      MAX(code)                                        AS code,
      MAX(rname)                                       AS rname,
      MAX(unit)                                        AS unit,
      MAX(conv_factor)                                 AS conv_factor,
      MAX(commercial_unit)                             AS commercial_unit,
      SUM(qty_pu * req_qty)                            AS total_qty,
      SUM(qty_pu * req_qty * uprice)                   AS total_cost,
      array_agg(DISTINCT task_name ORDER BY task_name) AS sources
    FROM all_mat
    GROUP BY agg_key
  ),

  agg_lab AS (
    SELECT
      agg_key,
      MAX(rname)                                       AS rname,
      MAX(unit)                                        AS unit,
      SUM(qty_pu * req_qty)                            AS total_qty,
      SUM(qty_pu * req_qty * uprice)                   AS total_cost,
      array_agg(DISTINCT task_name ORDER BY task_name) AS sources
    FROM all_lab
    GROUP BY agg_key
  ),

  agg_equ AS (
    SELECT
      agg_key,
      MAX(rname)                                       AS rname,
      MAX(unit)                                        AS unit,
      SUM(qty_pu * req_qty)                            AS total_qty,
      SUM(qty_pu * req_qty * uprice)                   AS total_cost,
      array_agg(DISTINCT task_name ORDER BY task_name) AS sources
    FROM all_equ
    GROUP BY agg_key
  ),

  apu_costs     AS (SELECT task_id, SUM(qty_pu * uprice) AS mat_uc FROM all_mat GROUP BY task_id),
  apu_lab_costs AS (SELECT task_id, SUM(qty_pu * uprice) AS lab_uc FROM all_lab GROUP BY task_id),
  apu_equ_costs AS (SELECT task_id, SUM(qty_pu * uprice) AS equ_uc FROM all_equ GROUP BY task_id)

  SELECT jsonb_build_object(

    'materials', COALESCE((
      SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'resourceId',       agg_key,
        'code',             NULLIF(code, ''),
        'name',             rname,
        'unit',             unit,
        'totalQuantity',    ROUND(total_qty::numeric, 4),
        'unitCost',         ROUND(CASE WHEN total_qty > 0 THEN total_cost / total_qty ELSE 0 END::numeric, 2),
        'totalCost',        ROUND(total_cost::numeric, 2),
        'conversionFactor', CASE WHEN conv_factor > 1 THEN conv_factor ELSE NULL END,
        'commercialUnit',   commercial_unit,
        'purchaseQuantity', CASE WHEN conv_factor > 1 THEN CEIL(total_qty / conv_factor)::integer ELSE NULL END,
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
        'unitCost',        ROUND(CASE WHEN total_qty > 0 THEN total_cost / total_qty ELSE 0 END::numeric, 2),
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
        'unitCost',        ROUND(CASE WHEN total_qty > 0 THEN total_cost / total_qty ELSE 0 END::numeric, 2),
        'totalCost',       ROUND(total_cost::numeric, 2),
        'sourceTaskNames', sources
      ) ORDER BY rname)
      FROM agg_equ
    ), '[]'::jsonb),

    'apuSummary', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'masterTaskId', vt.id_txt,
        'name',         vt.name,
        'requestedQty', vt.req_qty,
        'unitCosts', jsonb_build_object(
          'material',  ROUND(COALESCE(ac.mat_uc,  0)::numeric, 2),
          'labor',     ROUND(COALESCE(alc.lab_uc, 0)::numeric, 2),
          'equipment', ROUND(COALESCE(aec.equ_uc, 0)::numeric, 2),
          'total',     ROUND((COALESCE(ac.mat_uc,0)+COALESCE(alc.lab_uc,0)+COALESCE(aec.equ_uc,0))::numeric, 2)
        )
      ) ORDER BY vt.name)
      FROM valid_tasks vt
      LEFT JOIN apu_costs     ac  ON ac.task_id  = vt.id_txt
      LEFT JOIN apu_lab_costs alc ON alc.task_id = vt.id_txt
      LEFT JOIN apu_equ_costs aec ON aec.task_id = vt.id_txt
    ), '[]'::jsonb),

    'totals', jsonb_build_object(
      'material',   COALESCE((SELECT ROUND(SUM(total_cost)::numeric, 2) FROM agg_mat), 0),
      'labor',      COALESCE((SELECT ROUND(SUM(total_cost)::numeric, 2) FROM agg_lab), 0),
      'equipment',  COALESCE((SELECT ROUND(SUM(total_cost)::numeric, 2) FROM agg_equ), 0),
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
  'v3 (migration 057): resources.conversion_factor + commercial_unit now exist. '
  'PATH A: master_task_materials. PATH B: catalog_task_yields + resources. '
  'All conversion columns guarded with COALESCE(..., 1.0).';

-- ---------------------------------------------------------------------------
-- 5. Notify PostgREST to reload schema cache
-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
