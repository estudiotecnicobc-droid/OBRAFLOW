-- ────────────────────────────────────────────────────────────────────────────
-- 015_consolidated_calculator_rpc.sql
--
-- RPC para cálculo consolidado de recursos desde múltiples APUs.
-- Cubre dos esquemas de composición:
--   PATH A (legacy):  master_task_materials / master_task_labor / master_task_equipment
--   PATH B (catálogo): catalog_task_yields JOIN resources
--
-- Seguridad: SECURITY INVOKER → el RLS del caller se aplica a todas las tablas.
--
-- Parámetros:
--   p_items           – JSONB: [{"master_task_id":"uuid","quantity":10.0}, ...]
--   p_organization_id – tenant ID (text — compatible con IDs legacy 'org_a')
--   p_cost_date       – fecha base de costos (preparado para resource_cost_snapshots).
--                       Actualmente reservado; las tablas usan precio vigente.
--
-- Respuesta JSONB:
--   { materials, labor, equipment, apuSummary, totals, computedAt }
-- ────────────────────────────────────────────────────────────────────────────

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
  -- Guard: lista vacía → respuesta vacía bien formada
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
  -- ── 1. Parsear items de entrada ────────────────────────────────────────────
  input_items AS (
    SELECT
      elem->>'master_task_id'      AS task_id,
      (elem->>'quantity')::numeric AS qty
    FROM jsonb_array_elements(p_items) AS elem
    WHERE (elem->>'quantity')::numeric > 0
  ),

  -- ── 2. Validar tareas (el RLS del caller restringe acceso por org) ─────────
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

  -- ═══════════════════════════════════════════════════════════════════════════
  -- PATH A — Esquema legacy: master_task_materials / labor / equipment
  -- ═══════════════════════════════════════════════════════════════════════════

  leg_mat AS (
    SELECT
      vt.id_txt                                                           AS task_id,
      vt.name                                                             AS task_name,
      vt.req_qty,
      COALESCE(
        mtm.master_material_id::text,
        LOWER(TRIM(mtm.material_name))
      )                                                                   AS agg_key,
      COALESCE(mm.code, '')                                               AS code,
      mtm.material_name                                                   AS rname,
      mtm.unit,
      -- cantidad por unidad con desperdicio
      mtm.quantity * (1.0 + COALESCE(mtm.waste_percent, 0) / 100.0)     AS qty_pu,
      -- precio: live Supabase > snapshot guardado en APU > 0
      COALESCE(mm.unit_price, mtm.last_known_unit_price, 0)              AS uprice
    FROM valid_tasks vt
    INNER JOIN master_task_materials mtm ON mtm.master_task_id = vt.id
    LEFT  JOIN master_materials mm
           ON mm.id = mtm.master_material_id
          AND mm.is_active = true
  ),

  leg_lab AS (
    SELECT
      vt.id_txt                                                           AS task_id,
      vt.name                                                             AS task_name,
      vt.req_qty,
      mtl.labor_category_id                                               AS agg_key,
      -- nombre: live si el JOIN funciona, sino snapshot
      COALESCE(lc.role, mtl.labor_category_name)                         AS rname,
      'HH'                                                                AS unit,
      -- HH/unidad = (trabajadores × 9h) / rendimiento_diario
      CASE WHEN vt.daily_yield > 0
           THEN (mtl.quantity * 9.0) / vt.daily_yield
           ELSE 0
      END                                                                 AS qty_pu,
      -- tarifa efectiva: live si JOIN de laborCategoryId a labor_categories funciona,
      -- sino snapshot_hourly_rate capturado al crear el APU
      COALESCE(
        lc.basic_hourly_rate * (
          1.0 + (COALESCE(lc.social_charges_percent, 0)
               + COALESCE(lc.insurance_percent, 0)) / 100.0
        ),
        mtl.snapshot_hourly_rate,
        0
      )                                                                   AS uprice
    FROM valid_tasks vt
    INNER JOIN master_task_labor mtl ON mtl.master_task_id = vt.id
    LEFT  JOIN labor_categories lc ON lc.id::text = mtl.labor_category_id
  ),

  leg_equ AS (
    SELECT
      vt.id_txt                                                           AS task_id,
      vt.name                                                             AS task_name,
      vt.req_qty,
      mte.tool_id                                                         AS agg_key,
      COALESCE(t.name, mte.tool_name)                                     AS rname,
      'HM'                                                                AS unit,
      mte.hours_per_unit                                                  AS qty_pu,
      COALESCE(t.cost_per_hour, mte.snapshot_cost_per_hour, 0)           AS uprice
    FROM valid_tasks vt
    INNER JOIN master_task_equipment mte ON mte.master_task_id = vt.id
    LEFT  JOIN tools t ON t.id::text = mte.tool_id
  ),

  -- ═══════════════════════════════════════════════════════════════════════════
  -- PATH B — Esquema catálogo: catalog_task_yields JOIN resources
  -- Solo para tareas sin datos en el esquema legacy (clonadas desde catálogo).
  -- ═══════════════════════════════════════════════════════════════════════════

  catalog_tasks AS (
    SELECT vt.id_txt, vt.name, vt.daily_yield, vt.req_qty
    FROM valid_tasks vt
    WHERE NOT EXISTS (
      SELECT 1 FROM master_task_materials WHERE master_task_id = vt.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM master_task_labor WHERE master_task_id = vt.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM master_task_equipment WHERE master_task_id = vt.id
    )
  ),

  cat_yields AS (
    SELECT
      ct.id_txt                 AS task_id,
      ct.name                   AS task_name,
      ct.daily_yield,
      ct.req_qty,
      cty.quantity,
      r.id::text                AS resource_id,
      r.name                    AS resource_name,
      r.unit                    AS resource_unit,
      COALESCE(r.base_cost, 0)  AS base_cost,
      r.type                    AS resource_type
    FROM catalog_tasks ct
    INNER JOIN catalog_task_yields cty ON cty.master_task_id = ct.id_txt::uuid
    INNER JOIN resources r             ON r.id = cty.resource_id
  ),

  cat_mat AS (
    SELECT
      task_id, task_name, req_qty,
      resource_id   AS agg_key,
      ''            AS code,
      resource_name AS rname,
      resource_unit AS unit,
      quantity      AS qty_pu,
      base_cost     AS uprice
    FROM cat_yields WHERE resource_type IN ('MATERIAL', 'SUBCONTRACT')
  ),

  cat_lab AS (
    SELECT
      task_id, task_name, req_qty,
      resource_id   AS agg_key,
      resource_name AS rname,
      'HH'          AS unit,
      -- En catálogo, quantity = HH/unidad (ya calculado), base_cost = tarifa/HH
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

  -- ── 3. UNION de ambas rutas ────────────────────────────────────────────────
  all_mat AS (
    SELECT task_id, task_name, req_qty, agg_key, code, rname, unit, qty_pu, uprice
    FROM leg_mat
    UNION ALL
    SELECT task_id, task_name, req_qty, agg_key, code, rname, unit, qty_pu, uprice
    FROM cat_mat
  ),

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

  -- ── 4. Agregación consolidada cross-APU ────────────────────────────────────
  agg_mat AS (
    SELECT
      agg_key,
      MAX(code)                                                  AS code,
      MAX(rname)                                                 AS rname,
      MAX(unit)                                                  AS unit,
      SUM(qty_pu * req_qty)                                      AS total_qty,
      SUM(qty_pu * req_qty * uprice)                             AS total_cost,
      array_agg(DISTINCT task_name ORDER BY task_name)           AS sources
    FROM all_mat
    GROUP BY agg_key
  ),

  agg_lab AS (
    SELECT
      agg_key,
      MAX(rname)                                                 AS rname,
      MAX(unit)                                                  AS unit,
      SUM(qty_pu * req_qty)                                      AS total_qty,
      SUM(qty_pu * req_qty * uprice)                             AS total_cost,
      array_agg(DISTINCT task_name ORDER BY task_name)           AS sources
    FROM all_lab
    GROUP BY agg_key
  ),

  agg_equ AS (
    SELECT
      agg_key,
      MAX(rname)                                                 AS rname,
      MAX(unit)                                                  AS unit,
      SUM(qty_pu * req_qty)                                      AS total_qty,
      SUM(qty_pu * req_qty * uprice)                             AS total_cost,
      array_agg(DISTINCT task_name ORDER BY task_name)           AS sources
    FROM all_equ
    GROUP BY agg_key
  ),

  -- ── 5. Resumen por APU (para el tab "Por APU" en el frontend) ─────────────
  apu_costs AS (
    SELECT
      task_id,
      SUM(qty_pu * uprice)  AS mat_uc
    FROM all_mat
    GROUP BY task_id
  ),
  apu_lab_costs AS (
    SELECT
      task_id,
      SUM(qty_pu * uprice)  AS lab_uc
    FROM all_lab
    GROUP BY task_id
  ),
  apu_equ_costs AS (
    SELECT
      task_id,
      SUM(qty_pu * uprice)  AS equ_uc
    FROM all_equ
    GROUP BY task_id
  )

  -- ── 6. Construir JSON de respuesta ─────────────────────────────────────────
  SELECT jsonb_build_object(

    -- Lista de materiales consolidados
    'materials', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'resourceId',      agg_key,
        'code',            code,
        'name',            rname,
        'unit',            unit,
        'totalQuantity',   ROUND(total_qty::numeric, 4),
        'unitCost',        ROUND(
          CASE WHEN total_qty > 0 THEN total_cost / total_qty ELSE 0 END::numeric, 2),
        'totalCost',       ROUND(total_cost::numeric, 2),
        'sourceTaskNames', sources
      ) ORDER BY rname)
      FROM agg_mat
    ), '[]'::jsonb),

    -- Lista de mano de obra consolidada
    'labor', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'resourceId',      agg_key,
        'code',            '',
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

    -- Lista de equipos consolidada
    'equipment', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'resourceId',      agg_key,
        'code',            '',
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

    -- Resumen de costo unitario por APU (tab "Por APU")
    'apuSummary', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'masterTaskId',  vt.id_txt,
        'name',          vt.name,
        'requestedQty',  vt.req_qty,
        'unitCosts', jsonb_build_object(
          'material',  ROUND(COALESCE(ac.mat_uc, 0)::numeric, 2),
          'labor',     ROUND(COALESCE(alc.lab_uc, 0)::numeric, 2),
          'equipment', ROUND(COALESCE(aec.equ_uc, 0)::numeric, 2),
          'total',     ROUND((
            COALESCE(ac.mat_uc, 0) +
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

    -- Totales globales
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

-- Permisos: solo usuarios autenticados (RLS del caller sigue aplicando)
GRANT EXECUTE ON FUNCTION public.calculate_consolidated_resources(jsonb, text, date)
  TO authenticated;

-- ─── Notas de extensión futura ────────────────────────────────────────────────
-- Para precios históricos via resource_cost_snapshots:
--   1. Agregar una CTE `price_snapshot` que resuelva cost para cada resource_id
--      WHERE effective_date <= p_cost_date ORDER BY effective_date DESC LIMIT 1.
--   2. Hacer LEFT JOIN en leg_mat/cat_mat usando resource_id → price_snapshot.
--   3. COALESCE(snapshot.cost, mm.unit_price, ...) en el campo uprice.
-- La firma de la función ya acepta p_cost_date para no necesitar cambios de API.
