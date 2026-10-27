-- =============================================================================
-- Migration 018: Budget Cost Snapshots + Staleness Detection
-- Fecha: 2026-04-12
--
-- Problema que resuelve:
--   Hoy el presupuesto muestra costos calculados con snapshots congelados
--   al momento de importación del APU. Si el precio de un material cambia,
--   el presupuesto no se entera.
--
--   Necesitamos:
--   a) Un registro inmutable de "este presupuesto fue calculado con estos precios
--      en esta fecha base" → tabla budget_cost_snapshots
--   b) Detectar si hay cambios de precios más recientes que invalidan el snapshot
--      → RPC get_budget_cost_staleness
--   c) Un recálculo controlado (por decisión del usuario, no automático)
--      → RPC snapshot_budget_costs
--
-- Regla de negocio:
--   · Los presupuestos NUNCA se recalculan solos.
--   · El usuario decide cuándo tomar un nuevo snapshot.
--   · El frontend muestra "hay precios más nuevos" cuando staleness = true.
--   · Los snapshots son inmutables: nueva ejecución crea nueva fila.
--
-- Tablas nuevas:
--   · budget_cost_snapshots — historial de cálculos de presupuesto
--
-- RPCs nuevas:
--   · snapshot_budget_costs          — calcula y persiste
--   · get_budget_cost_staleness      — detecta cambios de precio
--   · get_budget_for_calculator      — extrae items del presupuesto como CalcItems
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. Tabla budget_cost_snapshots
-- =============================================================================
-- Un snapshot por ejecución de cálculo. Inmutable: no se actualiza, solo inserta.
-- El FE carga el snapshot más reciente para mostrar costos del presupuesto.

CREATE TABLE IF NOT EXISTS public.budget_cost_snapshots (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid         NOT NULL
                     REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id  uuid         NOT NULL
                     REFERENCES public.organizations(id) ON DELETE CASCADE,
  cost_date        date         NOT NULL,
  -- Items que fueron la entrada del cálculo: [{master_task_id, quantity}]
  input_items      jsonb        NOT NULL DEFAULT '[]',
  -- Resultado completo de calculate_consolidated_resources (materials, labor, equipment, totals)
  result           jsonb        NOT NULL DEFAULT '{}',
  -- Metadatos de trazabilidad
  computed_at      timestamptz  NOT NULL DEFAULT now(),
  created_by       uuid         REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT bcs_cost_date_not_future
    CHECK (cost_date <= CURRENT_DATE + interval '1 day')
);

CREATE INDEX IF NOT EXISTS bcs_project_id_computed_idx
  ON public.budget_cost_snapshots (project_id, computed_at DESC);

CREATE INDEX IF NOT EXISTS bcs_org_id_idx
  ON public.budget_cost_snapshots (organization_id);

ALTER TABLE public.budget_cost_snapshots ENABLE ROW LEVEL SECURITY;

-- SELECT: miembros de la org
CREATE POLICY "bcs_select" ON public.budget_cost_snapshots
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- INSERT: miembros de la org (el RPC usa SECURITY INVOKER → hereda permisos del caller)
CREATE POLICY "bcs_insert" ON public.budget_cost_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- DELETE: solo owner/admin
CREATE POLICY "bcs_delete" ON public.budget_cost_snapshots
  FOR DELETE TO authenticated
  USING (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

COMMENT ON TABLE public.budget_cost_snapshots IS
  'Historial inmutable de cálculos de costo de presupuesto. '
  'Cada fila es una foto punto en el tiempo de qué costaba el presupuesto '
  'en una fecha base determinada. Los presupuestos no se recalculan solos: '
  'el usuario ejecuta un nuevo cálculo que genera una nueva fila.';


-- =============================================================================
-- 2. RPC: get_budget_for_calculator
-- =============================================================================
-- Extrae los items de un presupuesto activo como input para calculate_consolidated_resources.
-- Resuelve la cadena: budget_items → tasks.master_task_id → acumula cantidades.
-- Retorna: [{ master_task_id, quantity, taskName, budgetItemCount }]

CREATE OR REPLACE FUNCTION public.get_budget_for_calculator(
  p_project_id       uuid,
  p_organization_id  text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
WITH
budget_raw AS (
  SELECT
    t.master_task_id,
    mt.name                        AS master_task_name,
    SUM(bi.quantity)               AS total_qty,
    count(bi.id)                   AS item_count
  FROM public.budget_items bi
  INNER JOIN public.tasks t
          ON t.id = bi.task_id
         AND t.master_task_id IS NOT NULL
  INNER JOIN public.master_tasks mt
          ON mt.id = t.master_task_id
         AND mt.is_active = true
  WHERE bi.project_id        = p_project_id
    AND bi.quantity           > 0
    AND t.organization_id::text = p_organization_id
  GROUP BY t.master_task_id, mt.name
),
items_without_master AS (
  SELECT count(*) AS cnt
  FROM public.budget_items bi
  INNER JOIN public.tasks t ON t.id = bi.task_id
  WHERE bi.project_id = p_project_id
    AND t.master_task_id IS NULL
)
SELECT jsonb_build_object(
  'items', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'master_task_id', master_task_id,
      'quantity',       ROUND(total_qty::numeric, 4),
      'taskName',       master_task_name,
      'itemCount',      item_count
    ) ORDER BY master_task_name)
    FROM budget_raw
  ), '[]'::jsonb),
  'itemsWithoutMaster', (SELECT cnt FROM items_without_master),
  'projectId', p_project_id
);
$$;

GRANT EXECUTE ON FUNCTION public.get_budget_for_calculator(uuid, text)
  TO authenticated;

COMMENT ON FUNCTION public.get_budget_for_calculator IS
  'Extrae los APUs y cantidades acumuladas de un presupuesto para usar como input '
  'de calculate_consolidated_resources. Resuelve budget_items → tasks.master_task_id. '
  'Acumula cantidades si el mismo APU aparece en múltiples ítems del presupuesto.';


-- =============================================================================
-- 3. RPC: snapshot_budget_costs
-- =============================================================================
-- Recalcula los costos del presupuesto y guarda el resultado como snapshot inmutable.
-- No modifica budget_items ni tasks: solo persiste el cálculo.
-- Retorna el snapshot creado (id, computed_at, totals).

CREATE OR REPLACE FUNCTION public.snapshot_budget_costs(
  p_project_id       uuid,
  p_organization_id  text,
  p_cost_date        date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_input_items jsonb;
  v_calc_result jsonb;
  v_snapshot_id uuid;
  v_org_uuid    uuid;
  v_org_text    text := p_organization_id;
BEGIN
  -- Resolver organization_id como UUID (para FK de budget_cost_snapshots)
  BEGIN
    v_org_uuid := p_organization_id::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    -- org_id legacy (ej: 'org_a') → buscar el UUID real
    SELECT id INTO v_org_uuid
    FROM public.organizations
    WHERE id::text = p_organization_id
    LIMIT 1;

    IF v_org_uuid IS NULL THEN
      RETURN jsonb_build_object('error', 'Organización no encontrada: ' || p_organization_id);
    END IF;
  END;

  -- 1. Extraer items del presupuesto
  SELECT jsonb_path_query_array(
    public.get_budget_for_calculator(p_project_id, p_organization_id),
    '$.items'
  ) INTO v_input_items;

  IF jsonb_array_length(v_input_items) = 0 THEN
    RETURN jsonb_build_object(
      'error', 'No hay ítems de presupuesto con APU maestro asignado'
    );
  END IF;

  -- 2. Calcular costos consolidados (reutiliza RPC 015/017)
  SELECT public.calculate_consolidated_resources(
    v_input_items,
    p_organization_id,
    p_cost_date
  ) INTO v_calc_result;

  -- 3. Persistir snapshot
  INSERT INTO public.budget_cost_snapshots (
    project_id,
    organization_id,
    cost_date,
    input_items,
    result,
    created_by
  )
  VALUES (
    p_project_id,
    v_org_uuid,
    p_cost_date,
    v_input_items,
    v_calc_result,
    auth.uid()
  )
  RETURNING id INTO v_snapshot_id;

  -- 4. Retornar resumen del snapshot creado
  RETURN jsonb_build_object(
    'snapshotId',  v_snapshot_id,
    'projectId',   p_project_id,
    'costDate',    p_cost_date,
    'itemCount',   jsonb_array_length(v_input_items),
    'totals',      v_calc_result->'totals',
    'computedAt',  to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.snapshot_budget_costs(uuid, text, date)
  TO authenticated;

COMMENT ON FUNCTION public.snapshot_budget_costs IS
  'Calcula los costos consolidados del presupuesto y guarda el resultado como '
  'snapshot inmutable en budget_cost_snapshots. El presupuesto en sí no se modifica. '
  'Requiere que las tareas del presupuesto tengan master_task_id asignado. '
  'SECURITY INVOKER: el RLS del caller aplica (el usuario debe ser miembro de la org).';


-- =============================================================================
-- 4. RPC: get_budget_cost_staleness
-- =============================================================================
-- Detecta si los precios de materiales cambiaron después del último snapshot.
-- No recalcula; solo avisa que hay diferencias potenciales.
-- Regla: un material es "stale" si master_materials.updated_at > last_snapshot.computed_at
--
-- Retorna:
--   { isStale, lastSnapshotAt, staleCount, staleResources[], lastSnapshot{} }

CREATE OR REPLACE FUNCTION public.get_budget_cost_staleness(
  p_project_id       uuid,
  p_organization_id  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_last_snapshot   record;
  v_stale_count     integer := 0;
  v_stale_resources jsonb   := '[]'::jsonb;
BEGIN
  -- 1. Obtener el snapshot más reciente
  SELECT id, computed_at, cost_date, result->'totals' AS totals
  INTO v_last_snapshot
  FROM public.budget_cost_snapshots
  WHERE project_id = p_project_id
  ORDER BY computed_at DESC
  LIMIT 1;

  -- Si no hay snapshot, el presupuesto nunca fue calculado
  IF v_last_snapshot IS NULL THEN
    RETURN jsonb_build_object(
      'isStale',        NULL,
      'neverCalculated', true,
      'lastSnapshotAt', NULL,
      'staleCount',     0,
      'staleResources', '[]'::jsonb
    );
  END IF;

  -- 2. Detectar materiales con precio actualizado después del snapshot
  -- Cadena: budget_items → tasks.master_task_id → master_task_materials.master_material_id
  --         → master_materials.updated_at > v_last_snapshot.computed_at
  SELECT
    count(DISTINCT mm.id),
    COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
      'materialId',   mm.id,
      'materialName', mm.name,
      'updatedAt',    to_char(mm.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )), '[]'::jsonb)
  INTO v_stale_count, v_stale_resources
  FROM public.budget_items bi
  INNER JOIN public.tasks t
          ON t.id = bi.task_id
         AND t.master_task_id IS NOT NULL
  INNER JOIN public.master_task_materials mtm
          ON mtm.master_task_id = t.master_task_id
  INNER JOIN public.master_materials mm
          ON mm.id = mtm.master_material_id
         AND mm.is_active = true
  WHERE bi.project_id              = p_project_id
    AND t.organization_id::text    = p_organization_id
    AND mm.updated_at              > v_last_snapshot.computed_at;

  -- 3. Respuesta
  RETURN jsonb_build_object(
    'isStale',         v_stale_count > 0,
    'neverCalculated', false,
    'lastSnapshotAt',  to_char(
      v_last_snapshot.computed_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS"Z"'
    ),
    'lastSnapshotCostDate', v_last_snapshot.cost_date,
    'lastSnapshotTotals',   v_last_snapshot.totals,
    'staleCount',      v_stale_count,
    'staleResources',  v_stale_resources
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_budget_cost_staleness(uuid, text)
  TO authenticated;

COMMENT ON FUNCTION public.get_budget_cost_staleness IS
  'Detecta si los precios de materiales del presupuesto cambiaron después '
  'del último snapshot de costos. No recalcula: solo informa. '
  'Devuelve isStale=true si algún master_material.updated_at > last_snapshot.computed_at. '
  'Devuelve neverCalculated=true si no existe ningún snapshot previo.';


-- =============================================================================
-- 5. Vista: v_budget_snapshot_summary (para listado en UI)
-- =============================================================================
-- Resumen de snapshots por proyecto para mostrar en BudgetEditor o Reportes.

CREATE OR REPLACE VIEW public.v_budget_snapshot_summary
WITH (security_invoker = true) AS
SELECT
  bcs.id,
  bcs.project_id,
  bcs.organization_id,
  bcs.cost_date,
  bcs.computed_at,
  bcs.created_by,
  jsonb_array_length(bcs.input_items)                AS item_count,
  (bcs.result->'totals'->>'grandTotal')::numeric     AS grand_total,
  (bcs.result->'totals'->>'material')::numeric       AS total_material,
  (bcs.result->'totals'->>'labor')::numeric          AS total_labor,
  (bcs.result->'totals'->>'equipment')::numeric      AS total_equipment
FROM public.budget_cost_snapshots bcs;

-- security_invoker=true permite aplicar RLS de la tabla base según el usuario llamador.
GRANT SELECT ON public.v_budget_snapshot_summary TO authenticated;

COMMENT ON VIEW public.v_budget_snapshot_summary IS
  'Resumen desnormalizado de budget_cost_snapshots para listado en UI. '
  'Expone totales y metadata sin el detalle completo de result.';

COMMIT;
