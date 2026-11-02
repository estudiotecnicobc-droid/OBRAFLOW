-- Motor de precios — snapshot congelado por componente (contrato 2.4 + 2bis-4/7).
--   * budget_cost_snapshots: la migración 018 NO está aplicada en producción y no se puede
--     aplicar tal cual (get_budget_for_calculator compara tasks.master_task_id uuid con '').
--     Aquí se crea la tabla con la misma definición de la 018 (IF NOT EXISTS, políticas
--     guardadas) para que esta migración funcione con o sin 018. No se crean las funciones
--     de la 018. Se agrega reference_pricing_status (revisión GPT).
--   * budget_cost_snapshot_prices: detalle inmutable por (snapshot, ítem, componente).
--   * freeze_budget_prices: una sola transacción. Arma la cabecera con el mismo `result` que
--     snapshot_budget_costs (calculate_consolidated_resources, 057) más el bloque
--     reference_pricing, en un único INSERT: la 018 no concede UPDATE sobre snapshots y no se
--     abre aquí (inmutabilidad). Luego inserta el detalle resuelto con resolve_reference_price.
--   * get_frozen_budget_prices: lectura con verificación de membresía.
--   * Trigger BEFORE DELETE: un snapshot con detalle congelado no se elimina.
-- Depende de 20261102100008 y de calculate_consolidated_resources(jsonb,text,date) (057).
BEGIN;

DO $pre$
BEGIN
  IF to_regprocedure('public.calculate_consolidated_resources(jsonb,text,date)') IS NULL THEN
    RAISE EXCEPTION 'Falta calculate_consolidated_resources (migración 057): aplicar antes';
  END IF;
END $pre$;

-- ---------------------------------------------------------------------------
-- 1. budget_cost_snapshots (misma definición que 018; idempotente)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.budget_cost_snapshots (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid         NOT NULL
                     REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id  uuid         NOT NULL
                     REFERENCES public.organizations(id) ON DELETE CASCADE,
  cost_date        date         NOT NULL,
  input_items      jsonb        NOT NULL DEFAULT '[]',
  result           jsonb        NOT NULL DEFAULT '{}',
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

DO $pol$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'budget_cost_snapshots' AND policyname = 'bcs_select') THEN
    CREATE POLICY "bcs_select" ON public.budget_cost_snapshots
      FOR SELECT TO authenticated
      USING (organization_id IN (SELECT organization_id FROM public.organization_members
                                 WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'budget_cost_snapshots' AND policyname = 'bcs_insert') THEN
    CREATE POLICY "bcs_insert" ON public.budget_cost_snapshots
      FOR INSERT TO authenticated
      WITH CHECK (organization_id IN (SELECT organization_id FROM public.organization_members
                                      WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'budget_cost_snapshots' AND policyname = 'bcs_delete') THEN
    CREATE POLICY "bcs_delete" ON public.budget_cost_snapshots
      FOR DELETE TO authenticated
      USING (organization_id IN (SELECT om.organization_id FROM public.organization_members om
                                 WHERE om.user_id = auth.uid() AND om.role IN ('owner','admin')));
  END IF;
END $pol$;

-- Sin UPDATE: los snapshots son inmutables (regla de la 018).
REVOKE ALL ON public.budget_cost_snapshots FROM PUBLIC, anon;
REVOKE UPDATE ON public.budget_cost_snapshots FROM authenticated;
GRANT SELECT, INSERT, DELETE ON public.budget_cost_snapshots TO authenticated;

ALTER TABLE public.budget_cost_snapshots
  ADD COLUMN IF NOT EXISTS reference_pricing_status text;
ALTER TABLE public.budget_cost_snapshots
  DROP CONSTRAINT IF EXISTS bcs_reference_pricing_status_check;
ALTER TABLE public.budget_cost_snapshots
  ADD CONSTRAINT bcs_reference_pricing_status_check
    CHECK (reference_pricing_status IS NULL
           OR reference_pricing_status IN ('reconciled','pending_reconciliation','partial'));
COMMENT ON COLUMN public.budget_cost_snapshots.reference_pricing_status IS
  'Estado de conciliación entre el motor de precios de referencia (budget_cost_snapshot_prices) '
  'y el motor legacy (result.totals). NULL: snapshot anterior al motor, sin detalle congelado. '
  'reconciled: totales de materiales coinciden (±0,01) y todos los componentes son usables. '
  'pending_reconciliation: los totales divergen en más de 0,01 — el snapshot NO es un '
  'presupuesto definitivo hasta revisar la diferencia. '
  'partial: hay componentes sin precio usable o anidados no congelados.';

-- ---------------------------------------------------------------------------
-- 2. budget_cost_snapshot_prices: detalle congelado por ítem y componente
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.budget_cost_snapshot_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES public.budget_cost_snapshots(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  project_id uuid NOT NULL REFERENCES public.projects(id),
  budget_item_id uuid NOT NULL,
  master_task_id uuid NOT NULL,
  component_id uuid NOT NULL,            -- master_task_materials.id
  master_material_id uuid,
  resource_id uuid,
  -- cantidad del componente por unidad de APU × (1 + desperdicio) × cantidad del ítem
  quantity numeric(20,8) NOT NULL,
  unit text NOT NULL,
  -- NULL solo cuando source = 'NO_PRICE' (no se congela un 0 como si fuera precio).
  unit_price numeric(20,6),
  currency text NOT NULL,
  source text NOT NULL,
  reference_id uuid,
  price_status text NOT NULL,
  effective_date date,
  unit_factor numeric(20,8) NOT NULL DEFAULT 1,
  warnings text[] NOT NULL DEFAULT '{}',
  is_usable boolean NOT NULL DEFAULT false,
  observation_count integer,
  resolution jsonb,
  resolved_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  UNIQUE (snapshot_id, budget_item_id, component_id),
  CHECK (unit_price IS NOT NULL OR source = 'NO_PRICE'),
  CHECK (NOT is_usable OR unit_price > 0)
);
CREATE INDEX IF NOT EXISTS bcsp_snapshot_component_idx
  ON public.budget_cost_snapshot_prices (snapshot_id, component_id);
CREATE INDEX IF NOT EXISTS bcsp_org_project_idx
  ON public.budget_cost_snapshot_prices (organization_id, project_id);

ALTER TABLE public.budget_cost_snapshot_prices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.budget_cost_snapshot_prices FROM PUBLIC, anon, authenticated;
-- Sin UPDATE/DELETE para authenticated: el detalle congelado es inmutable.
GRANT SELECT, INSERT ON public.budget_cost_snapshot_prices TO authenticated;

DROP POLICY IF EXISTS bcsp_select ON public.budget_cost_snapshot_prices;
CREATE POLICY bcsp_select ON public.budget_cost_snapshot_prices
  FOR SELECT TO authenticated
  USING (public.is_org_member(budget_cost_snapshot_prices.organization_id));

DROP POLICY IF EXISTS bcsp_insert ON public.budget_cost_snapshot_prices;
CREATE POLICY bcsp_insert ON public.budget_cost_snapshot_prices
  FOR INSERT TO authenticated
  WITH CHECK (
    budget_cost_snapshot_prices.created_by = (SELECT auth.uid())
    AND public.is_org_member_with_role(budget_cost_snapshot_prices.organization_id,
                                       ARRAY['owner','admin','editor']::text[])
    AND EXISTS (
      SELECT 1 FROM public.budget_cost_snapshots s
      WHERE s.id = budget_cost_snapshot_prices.snapshot_id
        AND s.organization_id = budget_cost_snapshot_prices.organization_id
        AND s.project_id = budget_cost_snapshot_prices.project_id
    )
  );

-- Un snapshot con detalle congelado no se elimina (ni en cascada desde el proyecto).
CREATE OR REPLACE FUNCTION public.budget_cost_snapshots_block_frozen_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.budget_cost_snapshot_prices f WHERE f.snapshot_id = OLD.id) THEN
    RAISE EXCEPTION 'Snapshot congelado: no se puede eliminar' USING ERRCODE = '55006';
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS budget_cost_snapshots_block_frozen_delete ON public.budget_cost_snapshots;
CREATE TRIGGER budget_cost_snapshots_block_frozen_delete
  BEFORE DELETE ON public.budget_cost_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.budget_cost_snapshots_block_frozen_delete();

-- ---------------------------------------------------------------------------
-- 3. freeze_budget_prices
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.freeze_budget_prices(
  p_project_id uuid,
  p_organization_id uuid,
  p_cost_date date DEFAULT current_date
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_date date := COALESCE(p_cost_date, current_date);
  v_mode text;
  v_snapshot_id uuid := gen_random_uuid();
  v_input_items jsonb;
  v_legacy jsonb;
  v_legacy_total numeric;
  v_rows jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_item record;
  v_comp record;
  v_res public.resolved_reference_price;
  v_qty numeric;
  v_item_count integer := 0;
  v_component_count integer := 0;
  v_unusable integer := 0;
  v_nested integer := 0;
  v_errors integer := 0;
  v_labor_rows integer := 0;
  v_equipment_rows integer := 0;
  v_total numeric := 0;
  v_divergence numeric;
  v_status text;
  v_warnings text[] := '{}';
  v_block jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_org_member_with_role(
       p_organization_id, ARRAY['owner','admin','editor']::text[]) THEN
    RAISE EXCEPTION 'FORBIDDEN: organization not accessible' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.projects p
                 WHERE p.id = p_project_id AND p.organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: project not accessible' USING ERRCODE = '42501';
  END IF;
  IF v_date > current_date THEN
    RAISE EXCEPTION 'Cost date cannot be in the future' USING ERRCODE = '22023';
  END IF;
  v_mode := CASE WHEN v_date = current_date THEN 'CURRENT' ELSE 'AS_OF' END;

  -- Ítems del presupuesto con APU maestro (misma cadena que get_budget_for_calculator, 018),
  -- agregados por APU para el motor legacy.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'master_task_id', x.master_task_id,
           'quantity', round(x.total_qty, 4),
           'taskName', x.name,
           'itemCount', x.item_count) ORDER BY x.name), '[]'::jsonb)
    INTO v_input_items
  FROM (
    SELECT mt.id AS master_task_id, mt.name, sum(bi.quantity) AS total_qty, count(bi.id) AS item_count
    FROM public.budget_items bi
    JOIN public.tasks t ON t.id = bi.task_id AND t.master_task_id IS NOT NULL
    JOIN public.master_tasks mt ON mt.id = t.master_task_id AND mt.is_active
    WHERE bi.project_id = p_project_id
      AND bi.quantity > 0
      AND t.organization_id = p_organization_id
    GROUP BY mt.id, mt.name
  ) x;
  IF jsonb_array_length(v_input_items) = 0 THEN
    RAISE EXCEPTION 'No hay ítems de presupuesto con APU maestro asignado' USING ERRCODE = '22023';
  END IF;

  v_legacy := public.calculate_consolidated_resources(v_input_items, p_organization_id::text, v_date);
  v_legacy_total := COALESCE((v_legacy->'totals'->>'material')::numeric, 0);

  -- Detalle por ítem y componente.
  FOR v_item IN
    SELECT bi.id AS budget_item_id, bi.quantity AS item_qty, mt.id AS master_task_id
    FROM public.budget_items bi
    JOIN public.tasks t ON t.id = bi.task_id AND t.master_task_id IS NOT NULL
    JOIN public.master_tasks mt ON mt.id = t.master_task_id AND mt.is_active
    WHERE bi.project_id = p_project_id
      AND bi.quantity > 0
      AND t.organization_id = p_organization_id
    ORDER BY bi.sort_order NULLS LAST, bi.created_at, bi.id
  LOOP
    v_item_count := v_item_count + 1;

    SELECT count(*) INTO v_labor_rows FROM public.master_task_labor l
      WHERE l.master_task_id = v_item.master_task_id;
    v_skipped := v_skipped || CASE WHEN v_labor_rows > 0 THEN jsonb_build_array(jsonb_build_object(
      'budgetItemId', v_item.budget_item_id, 'masterTaskId', v_item.master_task_id,
      'kind', 'LABOR', 'rows', v_labor_rows, 'reason', 'OUT_OF_SCOPE_MATERIALS_ONLY')) ELSE '[]'::jsonb END;
    SELECT count(*) INTO v_equipment_rows FROM public.master_task_equipment e
      WHERE e.master_task_id = v_item.master_task_id;
    v_skipped := v_skipped || CASE WHEN v_equipment_rows > 0 THEN jsonb_build_array(jsonb_build_object(
      'budgetItemId', v_item.budget_item_id, 'masterTaskId', v_item.master_task_id,
      'kind', 'EQUIPMENT', 'rows', v_equipment_rows, 'reason', 'OUT_OF_SCOPE_MATERIALS_ONLY')) ELSE '[]'::jsonb END;

    FOR v_comp IN
      SELECT c.id, c.master_material_id, c.resource_id, c.sub_master_task_id, c.unit,
             c.quantity, COALESCE(c.waste_percent, 0) AS waste_percent
      FROM public.master_task_materials c
      WHERE c.master_task_id = v_item.master_task_id
      ORDER BY c.id
    LOOP
      IF v_comp.sub_master_task_id IS NOT NULL THEN
        v_nested := v_nested + 1;
        v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
          'budgetItemId', v_item.budget_item_id, 'masterTaskId', v_item.master_task_id,
          'componentId', v_comp.id, 'kind', 'NESTED_APU',
          'subMasterTaskId', v_comp.sub_master_task_id, 'reason', 'NESTED_APU_NOT_FROZEN'));
        CONTINUE;
      END IF;

      -- Misma regla que calculate_consolidated_resources: qty_pu = quantity × (1 + waste/100).
      v_qty := v_comp.quantity * (1 + v_comp.waste_percent / 100.0) * v_item.item_qty;
      v_component_count := v_component_count + 1;

      BEGIN
        v_res := public.resolve_reference_price(
          p_organization_id := p_organization_id,
          p_component_id := v_comp.id,
          p_project_id := p_project_id,
          p_effective_date := v_date,
          p_mode := v_mode);
      EXCEPTION WHEN OTHERS THEN
        -- Un componente irresoluble no bloquea el congelado: queda trazado como NO_PRICE.
        v_errors := v_errors + 1;
        v_res := NULL;
        v_res.source := 'NO_PRICE';
        v_res.unit := v_comp.unit;
        v_res.currency := 'ARS';
        v_res.warnings := ARRAY['RESOLVER_ERROR', SQLSTATE, left(SQLERRM, 200)];
        v_res.is_usable := false;
        v_res.price_status := 'SIN_PRECIO';
        v_res.observation_count := 0;
        v_res.resolution := jsonb_build_object('method', 'error', 'sqlstate', SQLSTATE);
      END;

      IF NOT COALESCE(v_res.is_usable, false) THEN
        v_unusable := v_unusable + 1;
      END IF;
      IF v_res.price IS NOT NULL THEN
        v_total := v_total + v_qty * v_res.price;
      END IF;

      v_rows := v_rows || jsonb_build_object(
        'budget_item_id', v_item.budget_item_id,
        'master_task_id', v_item.master_task_id,
        'component_id', v_comp.id,
        'master_material_id', v_comp.master_material_id,
        'resource_id', v_comp.resource_id,
        'quantity', v_qty,
        'unit', COALESCE(v_res.unit, v_comp.unit),
        'unit_price', v_res.price,
        'currency', COALESCE(v_res.currency, 'ARS'),
        'source', COALESCE(v_res.source, 'NO_PRICE'),
        'reference_id', v_res.reference_id,
        'price_status', COALESCE(v_res.price_status, 'SIN_PRECIO'),
        'effective_date', v_res.effective_date,
        'warnings', to_jsonb(COALESCE(v_res.warnings, '{}'::text[])),
        'is_usable', COALESCE(v_res.is_usable, false),
        'observation_count', v_res.observation_count,
        'resolution', v_res.resolution);
    END LOOP;
  END LOOP;

  v_total := round(v_total, 2);
  v_divergence := round(v_total - v_legacy_total, 2);
  IF abs(v_divergence) > 0.01 THEN
    v_warnings := v_warnings || 'TOTALS_DIVERGE_FROM_LEGACY_ENGINE'::text;
    v_status := 'pending_reconciliation';
  ELSIF v_unusable > 0 OR v_nested > 0 THEN
    v_status := 'partial';
  ELSE
    v_status := 'reconciled';
  END IF;
  IF v_unusable > 0 THEN v_warnings := v_warnings || 'UNUSABLE_COMPONENT_PRICES'::text; END IF;
  IF v_nested > 0 THEN v_warnings := v_warnings || 'NESTED_APU_SKIPPED'::text; END IF;
  IF v_errors > 0 THEN v_warnings := v_warnings || 'RESOLVER_ERRORS'::text; END IF;

  v_block := jsonb_build_object(
    'engine', 'reference_price_v1',
    'mode', v_mode,
    'costDate', v_date,
    'status', v_status,
    'itemCount', v_item_count,
    'componentCount', v_component_count,
    'unusableCount', v_unusable,
    'nestedSkippedCount', v_nested,
    'resolverErrorCount', v_errors,
    'materialsTotal', v_total,
    'legacyMaterialsTotal', v_legacy_total,
    'divergence', v_divergence,
    'warnings', to_jsonb(v_warnings),
    'skipped', v_skipped);

  -- Cabecera: mismas columnas y mismo `result` que snapshot_budget_costs (018) + reference_pricing.
  INSERT INTO public.budget_cost_snapshots (
    id, project_id, organization_id, cost_date, input_items, result, created_by,
    reference_pricing_status
  ) VALUES (
    v_snapshot_id, p_project_id, p_organization_id, v_date, v_input_items,
    jsonb_set(v_legacy, '{reference_pricing}', v_block, true), v_uid, v_status
  );

  INSERT INTO public.budget_cost_snapshot_prices (
    snapshot_id, organization_id, project_id, budget_item_id, master_task_id, component_id,
    master_material_id, resource_id, quantity, unit, unit_price, currency, source, reference_id,
    price_status, effective_date, unit_factor, warnings, is_usable, observation_count, resolution,
    created_by
  )
  SELECT v_snapshot_id, p_organization_id, p_project_id, r.budget_item_id, r.master_task_id,
         r.component_id, r.master_material_id, r.resource_id, r.quantity, r.unit, r.unit_price,
         r.currency, r.source, r.reference_id, r.price_status, r.effective_date, 1,
         COALESCE(r.warnings, '{}'::text[]), r.is_usable, r.observation_count, r.resolution, v_uid
  FROM jsonb_to_recordset(v_rows) AS r(
    budget_item_id uuid, master_task_id uuid, component_id uuid, master_material_id uuid,
    resource_id uuid, quantity numeric, unit text, unit_price numeric, currency text,
    source text, reference_id uuid, price_status text, effective_date date, warnings text[],
    is_usable boolean, observation_count integer, resolution jsonb);

  RETURN jsonb_build_object(
    'snapshotId', v_snapshot_id,
    'projectId', p_project_id,
    'costDate', v_date,
    'mode', v_mode,
    'status', v_status,
    'itemCount', v_item_count,
    'componentCount', v_component_count,
    'unusableCount', v_unusable,
    'nestedSkippedCount', v_nested,
    'materialsTotal', v_total,
    'legacyMaterialsTotal', v_legacy_total,
    'divergence', v_divergence,
    'legacyTotals', v_legacy->'totals',
    'warnings', to_jsonb(v_warnings));
END
$fn$;
REVOKE ALL ON FUNCTION public.freeze_budget_prices(uuid,uuid,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.freeze_budget_prices(uuid,uuid,date) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. get_frozen_budget_prices
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_frozen_budget_prices(p_snapshot_id uuid)
RETURNS SETOF public.budget_cost_snapshot_prices
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE v_org uuid;
BEGIN
  SELECT s.organization_id INTO v_org
  FROM public.budget_cost_snapshots s WHERE s.id = p_snapshot_id;
  IF auth.uid() IS NULL OR v_org IS NULL OR NOT public.is_org_member(v_org) THEN
    RAISE EXCEPTION 'FORBIDDEN: snapshot not accessible' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT f.* FROM public.budget_cost_snapshot_prices f
    WHERE f.snapshot_id = p_snapshot_id AND f.organization_id = v_org
    ORDER BY f.budget_item_id, f.component_id;
END
$fn$;
REVOKE ALL ON FUNCTION public.get_frozen_budget_prices(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_frozen_budget_prices(uuid) TO authenticated;

COMMIT;
