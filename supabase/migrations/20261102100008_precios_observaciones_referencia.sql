-- Motor de precios — observaciones de proveedores como fuente de referencia.
-- Contrato: /contrato-precios.md sección 2 corregida por 2bis (2-nov-2026).
--   * Comparabilidad y publicación en price_observations / price_suppliers (2bis-2/3).
--   * RPC publish_price_observations / invalidate_price_observation (SECURITY DEFINER: los
--     usuarios no tienen UPDATE sobre price_observations; la RPC verifica rol y tenant).
--   * resolve_observed_price: mediana en numeric entre proveedores, una observación
--     vigente por proveedor (2bis-1), ventana de 90 días, DESACTUALIZADO a los 31 días (2bis-6).
--   * resolved_reference_price gana observation_count / price_status / resolution (2bis-5).
--   * resolve_reference_price: fuente SUPPLIER_OBSERVED (prioridad 2), CATALOG_UNVERIFIED,
--     OBSERVATION_STALE y modo FROZEN leyendo budget_cost_snapshot_prices (2bis-7), con el
--     nuevos parámetros finales p_snapshot_id y p_budget_item_id (desambigua un componente
--     repetido en varios ítems). La firma cambia: se elimina la versión de 9 args.
-- Depende de 20261102100001 y 20261102100005. budget_cost_snapshot_prices se crea en
-- 20261102100009 (plpgsql resuelve el nombre en tiempo de ejecución).
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Comparabilidad y publicación (sin defaults silenciosos: DESCONOCIDA / NULL)
-- ---------------------------------------------------------------------------
ALTER TABLE public.price_observations
  ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'DESCONOCIDA',
  ADD COLUMN IF NOT EXISTS includes_vat boolean,
  ADD COLUMN IF NOT EXISTS commercial_condition text NOT NULL DEFAULT 'DESCONOCIDA',
  ADD COLUMN IF NOT EXISTS is_valid boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS invalidated_at timestamptz,
  ADD COLUMN IF NOT EXISTS invalidation_reason text,
  ADD COLUMN IF NOT EXISTS invalidated_by uuid,
  ADD COLUMN IF NOT EXISTS publication_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS published_by uuid,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE public.price_observations
  DROP CONSTRAINT IF EXISTS price_observations_commercial_condition_check,
  DROP CONSTRAINT IF EXISTS price_observations_publication_status_check,
  DROP CONSTRAINT IF EXISTS price_observations_published_complete_check,
  DROP CONSTRAINT IF EXISTS price_observations_invalidation_check;
ALTER TABLE public.price_observations
  ADD CONSTRAINT price_observations_commercial_condition_check
    CHECK (commercial_condition IN ('LISTA','CONTADO','MAYORISTA','OTRA','DESCONOCIDA')),
  ADD CONSTRAINT price_observations_publication_status_check
    CHECK (publication_status IN ('pending','published','rejected')),
  -- Una observación publicada tiene todos sus atributos de comparabilidad declarados.
  ADD CONSTRAINT price_observations_published_complete_check
    CHECK (publication_status <> 'published'
           OR (region <> 'DESCONOCIDA' AND commercial_condition <> 'DESCONOCIDA'
               AND includes_vat IS NOT NULL AND published_by IS NOT NULL
               AND published_at IS NOT NULL)),
  ADD CONSTRAINT price_observations_invalidation_check
    CHECK (is_valid OR (invalidated_at IS NOT NULL AND invalidation_reason IS NOT NULL));

CREATE INDEX IF NOT EXISTS price_obs_published_lookup_idx
  ON public.price_observations
     (organization_id, master_material_id, region, currency, commercial_condition,
      supplier_id, observed_on DESC, created_at DESC)
  WHERE publication_status = 'published';

ALTER TABLE public.price_suppliers
  ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'DESCONOCIDA',
  ADD COLUMN IF NOT EXISTS supplier_type text NOT NULL DEFAULT 'DESCONOCIDO';
ALTER TABLE public.price_suppliers
  DROP CONSTRAINT IF EXISTS price_suppliers_supplier_type_check;
ALTER TABLE public.price_suppliers
  ADD CONSTRAINT price_suppliers_supplier_type_check
    CHECK (supplier_type IN ('CORRALON','FABRICANTE','DISTRIBUIDOR','FERRETERIA','OTRO','DESCONOCIDO'));

-- Publicación e invalidación SOLO por RPC (SECURITY DEFINER): authenticated conserva
-- únicamente SELECT sobre price_observations (política price_observations_read, 100005).
REVOKE UPDATE ON public.price_observations FROM authenticated;
DROP POLICY IF EXISTS price_observations_curate ON public.price_observations;

-- Defensa en profundidad (los usuarios no tienen UPDATE): transiciones permitidas
-- pending → published | rejected; válida → inválida. Nunca al revés. Fuera de las RPC de
-- curaduría (GUC local obraflow.curation_rpc) ningún cambio de estado es admisible.
CREATE OR REPLACE FUNCTION public.price_observations_guard_curation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF (NEW.publication_status <> OLD.publication_status OR NEW.is_valid <> OLD.is_valid)
     AND current_setting('obraflow.curation_rpc', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Curation changes are only allowed through the curation RPCs'
      USING ERRCODE = '42501';
  END IF;
  IF OLD.publication_status <> 'pending'
     AND NEW.publication_status <> OLD.publication_status THEN
    RAISE EXCEPTION 'Publication status is final once published or rejected'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.publication_status = 'published' AND OLD.publication_status <> 'published' THEN
    IF v_uid IS NOT NULL AND NEW.published_by IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'published_by must be the current user' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NOT OLD.is_valid AND NEW.is_valid THEN
    RAISE EXCEPTION 'An invalidated observation cannot be revalidated'
      USING ERRCODE = '23514';
  END IF;
  IF OLD.is_valid AND NOT NEW.is_valid
     AND v_uid IS NOT NULL AND NEW.invalidated_by IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'invalidated_by must be the current user' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS price_observations_guard_curation ON public.price_observations;
CREATE TRIGGER price_observations_guard_curation
  BEFORE UPDATE ON public.price_observations
  FOR EACH ROW EXECUTE FUNCTION public.price_observations_guard_curation();

-- ---------------------------------------------------------------------------
-- 2. Publicación e invalidación (SECURITY DEFINER, rol owner/admin/editor, solo filas de la org)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_price_observations(
  p_organization_id uuid,
  p_observation_ids uuid[],
  p_region text,
  p_includes_vat boolean,
  p_commercial_condition text
) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_region text := upper(btrim(p_region));
  v_condition text := upper(btrim(p_commercial_condition));
  v_count integer;
  v_foreign integer;
  v_not_pending integer;
BEGIN
  IF v_uid IS NULL OR NOT public.is_org_member_with_role(
       p_organization_id, ARRAY['owner','admin','editor']::text[]) THEN
    RAISE EXCEPTION 'FORBIDDEN: organization not accessible' USING ERRCODE = '42501';
  END IF;
  IF p_observation_ids IS NULL OR cardinality(p_observation_ids) = 0
     OR cardinality(p_observation_ids) > 5000 THEN
    RAISE EXCEPTION 'Invalid observation id list' USING ERRCODE = '22023';
  END IF;
  IF v_region IS NULL OR v_region = '' OR v_region = 'DESCONOCIDA'
     OR p_includes_vat IS NULL
     OR v_condition NOT IN ('LISTA','CONTADO','MAYORISTA','OTRA') THEN
    RAISE EXCEPTION 'Region, includes_vat and commercial_condition must be declared explicitly'
      USING ERRCODE = '22023';
  END IF;
  -- Ningún id puede pertenecer a otra organización (ni ser inexistente).
  SELECT count(*) INTO v_foreign
  FROM unnest(p_observation_ids) AS x(id)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.price_observations o
    WHERE o.id = x.id AND o.organization_id = p_organization_id
  );
  IF v_foreign > 0 THEN
    RAISE EXCEPTION 'FORBIDDEN: % observation(s) not accessible', v_foreign
      USING ERRCODE = '42501';
  END IF;
  -- Todas deben estar pendientes y vigentes: nada se publica a medias.
  SELECT count(*) INTO v_not_pending
  FROM public.price_observations o
  WHERE o.organization_id = p_organization_id
    AND o.id = ANY (p_observation_ids)
    AND (o.publication_status <> 'pending' OR NOT o.is_valid);
  IF v_not_pending > 0 THEN
    RAISE EXCEPTION '% observation(s) already published, rejected or invalidated', v_not_pending
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('obraflow.curation_rpc', 'on', true);
  UPDATE public.price_observations o
     SET region = v_region,
         includes_vat = p_includes_vat,
         commercial_condition = v_condition,
         publication_status = 'published',
         published_by = v_uid,
         published_at = now()
   WHERE o.organization_id = p_organization_id
     AND o.id = ANY (p_observation_ids)
     AND o.publication_status = 'pending'
     AND o.is_valid;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM set_config('obraflow.curation_rpc', 'off', true);
  RETURN v_count;
END
$fn$;
REVOKE ALL ON FUNCTION public.publish_price_observations(uuid,uuid[],text,boolean,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_price_observations(uuid,uuid[],text,boolean,text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.invalidate_price_observation(
  p_organization_id uuid,
  p_observation_id uuid,
  p_reason text
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_reason text := nullif(btrim(p_reason), '');
  v_count integer;
BEGIN
  IF v_uid IS NULL OR NOT public.is_org_member_with_role(
       p_organization_id, ARRAY['owner','admin','editor']::text[]) THEN
    RAISE EXCEPTION 'FORBIDDEN: organization not accessible' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Invalidation reason required (1-500 chars)' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.price_observations o
    WHERE o.id = p_observation_id AND o.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: observation not accessible' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('obraflow.curation_rpc', 'on', true);
  UPDATE public.price_observations o
     SET is_valid = false,
         invalidated_at = now(),
         invalidated_by = v_uid,
         invalidation_reason = v_reason
   WHERE o.id = p_observation_id
     AND o.organization_id = p_organization_id
     AND o.is_valid;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM set_config('obraflow.curation_rpc', 'off', true);
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Observation already invalidated' USING ERRCODE = '22023';
  END IF;
END
$fn$;
REVOKE ALL ON FUNCTION public.invalidate_price_observation(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invalidate_price_observation(uuid,uuid,text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. resolve_observed_price: mediana por proveedor, en numeric
-- ---------------------------------------------------------------------------
-- Semántica temporal: p_as_of >= hoy → CURRENT (is_valid y publicada hoy);
-- p_as_of < hoy → AS_OF (publicada e invalidada, si lo fue, respecto de esa fecha).
-- Los filtros de comparabilidad son explícitos y se devuelven en resolution.filters
-- desde resolve_reference_price; aquí nunca se mezclan regiones, monedas, IVA ni condición.
CREATE OR REPLACE FUNCTION public.resolve_observed_price(
  p_organization_id uuid,
  p_master_material_id uuid,
  p_as_of date DEFAULT current_date,
  p_region text DEFAULT 'AMBA',
  p_currency text DEFAULT 'ARS',
  p_includes_vat boolean DEFAULT false,
  p_commercial_condition text DEFAULT 'LISTA',
  p_window_days integer DEFAULT 90
) RETURNS TABLE (
  price numeric,
  unit text,
  currency text,
  observation_count integer,
  newest_observed_on date,
  oldest_observed_on date,
  observation_ids uuid[],
  price_status text,
  supplier_count integer
)
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_as_of date := COALESCE(p_as_of, current_date);
  v_current boolean := COALESCE(p_as_of, current_date) >= current_date;
  v_unit text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: organization not accessible' USING ERRCODE = '42501';
  END IF;
  IF p_master_material_id IS NULL OR p_window_days IS NULL OR p_window_days < 1
     OR p_window_days > 3650 OR p_region IS NULL OR p_currency IS NULL
     OR p_includes_vat IS NULL OR p_commercial_condition IS NULL THEN
    RAISE EXCEPTION 'Invalid observed-price filters' USING ERRCODE = '22023';
  END IF;

  SELECT m.unit INTO v_unit
  FROM public.master_materials m
  WHERE m.id = p_master_material_id
    AND (m.organization_id IS NULL OR m.organization_id = p_organization_id::text);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FORBIDDEN: material not accessible' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH cand AS (
    SELECT o.id, o.supplier_id, o.normalized_price, o.observed_on, o.created_at
    FROM public.price_observations o
    WHERE o.organization_id = p_organization_id
      AND o.master_material_id = p_master_material_id
      AND o.publication_status = 'published'
      AND o.region = upper(btrim(p_region))
      AND o.currency = upper(btrim(p_currency))
      AND o.includes_vat = p_includes_vat
      AND o.commercial_condition = upper(btrim(p_commercial_condition))
      AND o.observed_on > v_as_of - p_window_days
      AND o.observed_on <= v_as_of
      AND CASE WHEN v_current THEN o.is_valid
               ELSE o.published_at::date <= v_as_of
                    AND (o.invalidated_at IS NULL OR o.invalidated_at::date > v_as_of)
          END
  ),
  per_supplier AS (
    SELECT DISTINCT ON (c.supplier_id) c.*
    FROM cand c
    ORDER BY c.supplier_id, c.observed_on DESC, c.created_at DESC, c.id DESC
  ),
  ranked AS (
    SELECT ps.normalized_price,
           row_number() OVER (ORDER BY ps.normalized_price, ps.id) AS rn,
           count(*) OVER () AS n
    FROM per_supplier ps
  ),
  median AS (
    -- Elemento(s) central(es) promediados en numeric: nunca pasa por float8.
    SELECT avg(r.normalized_price) AS price
    FROM ranked r
    WHERE r.rn IN ((r.n + 1) / 2, (r.n + 2) / 2)
  ),
  agg AS (
    SELECT (SELECT count(*) FROM cand)::integer AS observation_count,
           count(*)::integer AS supplier_count,
           max(ps.observed_on) AS newest_observed_on,
           min(ps.observed_on) AS oldest_observed_on,
           array_agg(ps.id ORDER BY ps.observed_on DESC, ps.created_at DESC, ps.id DESC)
             AS observation_ids
    FROM per_supplier ps
  )
  SELECT m.price, v_unit, upper(btrim(p_currency)),
         a.observation_count, a.newest_observed_on, a.oldest_observed_on,
         a.observation_ids,
         CASE WHEN a.newest_observed_on >= v_as_of - 30 THEN 'RELEVADO'
              ELSE 'DESACTUALIZADO' END,
         a.supplier_count
  FROM median m CROSS JOIN agg a
  WHERE a.supplier_count > 0;
END
$fn$;
REVOKE ALL ON FUNCTION public.resolve_observed_price(uuid,uuid,date,text,text,boolean,text,integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_observed_price(uuid,uuid,date,text,text,boolean,text,integer)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Tipo resolved_reference_price: trazabilidad (2bis-5)
-- ---------------------------------------------------------------------------
DO $type$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute
                 WHERE attrelid = 'public.resolved_reference_price'::regclass
                   AND attname = 'observation_count' AND NOT attisdropped) THEN
    ALTER TYPE public.resolved_reference_price ADD ATTRIBUTE observation_count integer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute
                 WHERE attrelid = 'public.resolved_reference_price'::regclass
                   AND attname = 'price_status' AND NOT attisdropped) THEN
    ALTER TYPE public.resolved_reference_price ADD ATTRIBUTE price_status text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute
                 WHERE attrelid = 'public.resolved_reference_price'::regclass
                   AND attname = 'resolution' AND NOT attisdropped) THEN
    ALTER TYPE public.resolved_reference_price ADD ATTRIBUTE resolution jsonb;
  END IF;
END
$type$;

-- ---------------------------------------------------------------------------
-- 5. resolve_reference_price con SUPPLIER_OBSERVED y FROZEN (firma de 11 args)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.resolve_reference_price(
  uuid,uuid,uuid,uuid,uuid,date,text,text,text);
DROP FUNCTION IF EXISTS public.resolve_reference_price(
  uuid,uuid,uuid,uuid,uuid,date,text,text,text,uuid);

CREATE OR REPLACE FUNCTION public.resolve_reference_price(
    p_organization_id uuid,
    p_master_material_id uuid DEFAULT NULL,
    p_resource_id uuid DEFAULT NULL,
    p_component_id uuid DEFAULT NULL,
    p_project_id uuid DEFAULT NULL,
    p_effective_date date DEFAULT CURRENT_DATE,
    p_mode text DEFAULT 'CURRENT',
    p_required_unit text DEFAULT NULL,
    p_expected_currency text DEFAULT 'ARS',
    p_snapshot_id uuid DEFAULT NULL,
    p_budget_item_id uuid DEFAULT NULL
)
RETURNS public.resolved_reference_price
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
    v_result public.resolved_reference_price;
    v_mat_id uuid := p_master_material_id;
    v_res_id uuid := p_resource_id;
    v_component_mat uuid;
    v_component_res uuid;
    v_sub_task_id uuid;
    v_linked_res uuid;
    v_global_source uuid;
    v_legacy_price numeric;
    v_component_unit text;
    v_material_org text;
    v_resource_org uuid;
    v_project_currency text;
    v_currency text;
    v_required_unit text;
    v_date date := COALESCE(p_effective_date, CURRENT_DATE);
    v_snapshot_project uuid;
    v_frozen record;
    v_frozen_ids uuid[];
    v_frozen_variants integer;
    v_obs record;
    v_obs_region text := 'AMBA';
    v_obs_vat boolean := false;
    v_obs_condition text := 'LISTA';
    v_obs_window integer := 90;
BEGIN
    -- Autorización explícita: no fiarse del ID suministrado por el navegador.
    IF (SELECT auth.uid()) IS NULL
       OR NOT public.is_org_member(p_organization_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: organization not accessible'
            USING ERRCODE = '42501';
    END IF;

    IF p_mode NOT IN ('CURRENT', 'AS_OF', 'FROZEN') OR p_mode IS NULL THEN
        RAISE EXCEPTION 'Invalid pricing mode' USING ERRCODE = '22023';
    END IF;
    IF p_mode = 'FROZEN' AND (p_snapshot_id IS NULL OR p_component_id IS NULL) THEN
        RAISE EXCEPTION 'FROZEN requires p_snapshot_id and p_component_id'
            USING ERRCODE = '22023';
    END IF;
    IF p_mode = 'CURRENT' AND v_date <> CURRENT_DATE THEN
        RAISE EXCEPTION
            'Use AS_OF for dates other than today'
            USING ERRCODE = '22023';
    END IF;

    IF p_project_id IS NOT NULL THEN
        SELECT p.currency INTO v_project_currency
        FROM public.projects p
        WHERE p.id = p_project_id
          AND p.organization_id = p_organization_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'FORBIDDEN: project not accessible'
                USING ERRCODE = '42501';
        END IF;
    END IF;
    v_currency := upper(btrim(COALESCE(
        NULLIF(v_project_currency, ''),
        NULLIF(p_expected_currency, ''), 'ARS'
    )));
    SELECT NULL::numeric AS price, NULL::text AS unit, NULL::text AS currency,
           0 AS observation_count, NULL::date AS newest_observed_on,
           NULL::date AS oldest_observed_on, NULL::uuid[] AS observation_ids,
           NULL::text AS price_status, 0 AS supplier_count
      INTO v_obs;

    IF p_component_id IS NOT NULL THEN
        SELECT c.master_material_id, c.resource_id, c.last_known_unit_price,
               c.unit, c.sub_master_task_id
          INTO v_component_mat, v_component_res, v_legacy_price,
               v_component_unit, v_sub_task_id
        FROM public.master_task_materials c
        JOIN public.master_tasks mt ON mt.id = c.master_task_id
        WHERE c.id = p_component_id
          AND (mt.organization_id = p_organization_id
               OR mt.organization_id IS NULL);
        IF NOT FOUND THEN
            RAISE EXCEPTION 'FORBIDDEN: APU component not accessible'
                USING ERRCODE = '42501';
        END IF;
        IF v_sub_task_id IS NOT NULL THEN
            RAISE EXCEPTION 'Nested APU must be calculated recursively'
                USING ERRCODE = '22023';
        END IF;
        IF p_master_material_id IS NOT NULL
           AND v_component_mat IS DISTINCT FROM p_master_material_id THEN
            RAISE EXCEPTION 'Material/component ID mismatch'
                USING ERRCODE = '22023';
        END IF;
        IF p_resource_id IS NOT NULL
           AND v_component_res IS DISTINCT FROM p_resource_id THEN
            RAISE EXCEPTION 'Resource/component ID mismatch'
                USING ERRCODE = '22023';
        END IF;
        v_mat_id := COALESCE(v_mat_id, v_component_mat);
        v_res_id := COALESCE(v_res_id, v_component_res);
    END IF;
    v_required_unit := NULLIF(btrim(
        COALESCE(p_required_unit, v_component_unit, '')
    ), '');

    -- FROZEN: solo lee lo persistido por freeze_budget_prices. Nunca recalcula.
    IF p_mode = 'FROZEN' THEN
        SELECT s.project_id INTO v_snapshot_project
        FROM public.budget_cost_snapshots s
        WHERE s.id = p_snapshot_id
          AND s.organization_id = p_organization_id
          AND (p_project_id IS NULL OR s.project_id = p_project_id);
        IF NOT FOUND THEN
            RAISE EXCEPTION 'FORBIDDEN: snapshot not accessible'
                USING ERRCODE = '42501';
        END IF;
        -- Un componente repetido en varios ítems tiene varias filas: con p_budget_item_id se
        -- toma la suya; sin él, solo si todas coinciden en (unit_price, currency, unit, source).
        SELECT count(DISTINCT (f.unit_price, f.currency, f.unit, f.source)),
               array_agg(f.id ORDER BY f.budget_item_id, f.id)
          INTO v_frozen_variants, v_frozen_ids
        FROM public.budget_cost_snapshot_prices f
        WHERE f.snapshot_id = p_snapshot_id
          AND f.component_id = p_component_id
          AND f.organization_id = p_organization_id
          AND (p_budget_item_id IS NULL OR f.budget_item_id = p_budget_item_id);
        IF COALESCE(v_frozen_variants, 0) > 1 THEN
            RAISE EXCEPTION 'FROZEN_AMBIGUOUS_COMPONENT: pass p_budget_item_id'
                USING ERRCODE = '22023';
        END IF;
        SELECT f.* INTO v_frozen
        FROM public.budget_cost_snapshot_prices f
        WHERE f.snapshot_id = p_snapshot_id
          AND f.component_id = p_component_id
          AND f.organization_id = p_organization_id
          AND (p_budget_item_id IS NULL OR f.budget_item_id = p_budget_item_id)
        ORDER BY f.budget_item_id, f.id
        LIMIT 1;
        IF NOT FOUND THEN
            v_result.price := NULL;
            v_result.unit := v_required_unit;
            v_result.currency := v_currency;
            v_result.source := 'NO_PRICE';
            v_result.warnings := ARRAY['FROZEN_PRICE_MISSING']::text[];
            v_result.effective_date := NULL;
            v_result.reference_id := NULL;
            v_result.is_usable := false;
            v_result.observation_count := 0;
            v_result.price_status := 'SIN_PRECIO';
            v_result.resolution := jsonb_build_object(
                'method', 'frozen_snapshot', 'snapshot_id', p_snapshot_id,
                'project_id', v_snapshot_project, 'budget_item_id', p_budget_item_id,
                'found', false);
            RETURN v_result;
        END IF;
        v_result.price := v_frozen.unit_price;
        v_result.unit := v_frozen.unit;
        v_result.currency := v_frozen.currency;
        v_result.source := 'FROZEN_SNAPSHOT';
        v_result.warnings := COALESCE(v_frozen.warnings, '{}'::text[]);
        v_result.effective_date := v_frozen.effective_date;
        v_result.reference_id := v_frozen.reference_id;
        v_result.is_usable := v_frozen.is_usable;
        v_result.observation_count := v_frozen.observation_count;
        v_result.price_status := 'FROZEN';
        v_result.resolution := jsonb_build_object(
            'method', 'frozen_snapshot', 'snapshot_id', p_snapshot_id,
            'project_id', v_snapshot_project, 'found', true,
            'budget_item_id', v_frozen.budget_item_id,
            'frozen_price_id', v_frozen.id,
            'frozen_price_ids', to_jsonb(v_frozen_ids),
            'original_source', v_frozen.source,
            'original_price_status', v_frozen.price_status,
            'original_resolution', v_frozen.resolution,
            'resolved_at', v_frozen.resolved_at);
        RETURN v_result;
    END IF;

    IF v_mat_id IS NOT NULL THEN
        SELECT m.organization_id, m.global_resource_id, m.global_source_id
          INTO v_material_org, v_linked_res, v_global_source
        FROM public.master_materials m
        WHERE m.id = v_mat_id AND m.is_active;
        IF NOT FOUND
           OR (v_material_org IS NOT NULL
               AND v_material_org <> p_organization_id::text) THEN
            RAISE EXCEPTION 'FORBIDDEN: material not accessible'
                USING ERRCODE = '42501';
        END IF;
        -- Nunca combinar dos IDs cuyo vínculo técnico no esté acreditado.
        IF v_res_id IS NOT NULL
           AND v_linked_res IS DISTINCT FROM v_res_id THEN
            RAISE EXCEPTION 'Material/resource link not verified'
                USING ERRCODE = '22023';
        END IF;
        v_res_id := COALESCE(v_res_id, v_linked_res);

        -- 2. Observaciones publicadas de proveedores (mediana por proveedor).
        SELECT * INTO v_obs
        FROM public.resolve_observed_price(
            p_organization_id, v_mat_id, v_date, v_obs_region, v_currency,
            v_obs_vat, v_obs_condition, v_obs_window);
    END IF;

    IF v_res_id IS NOT NULL THEN
        SELECT r.organization_id INTO v_resource_org
        FROM public.resources r
        WHERE r.id = v_res_id AND r.is_active;
        IF NOT FOUND OR (
            v_resource_org IS NOT NULL
            AND v_resource_org <> p_organization_id
        ) THEN
            RAISE EXCEPTION 'FORBIDDEN: resource not accessible'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Una sola consulta PostgreSQL para las siete fuentes de prioridad.
    -- AS_OF excluye valores "actuales" sin historial verificable.
    WITH candidates AS (
        -- 1. Override explícito del proyecto, primero el del componente.
        SELECT o.price, o.unit, o.currency,
               'PROJECT_OVERRIDE'::text AS source,
               o.effective_date, o.id AS reference_id, 1 AS priority
        FROM (
            SELECT x.*
            FROM public.project_price_overrides x
            WHERE p_project_id IS NOT NULL
              AND x.project_id = p_project_id
              AND x.organization_id = p_organization_id
              AND x.effective_date <= v_date
              AND (p_mode = 'CURRENT' OR x.created_at::date <= v_date)
              AND (
                  (x.target_kind='COMPONENT'
                   AND x.target_id = p_component_id)
                  OR (x.target_kind='MASTER_MATERIAL'
                      AND x.target_id = v_mat_id)
                  OR (x.target_kind='RESOURCE'
                      AND x.target_id = v_res_id)
              )
            ORDER BY CASE x.target_kind
                         WHEN 'COMPONENT' THEN 1
                         WHEN 'MASTER_MATERIAL' THEN 2 ELSE 3 END,
                     x.effective_date DESC, x.created_at DESC, x.id DESC
            LIMIT 1
        ) o

        UNION ALL
        -- 2. Mediana de observaciones publicadas de proveedores (CURRENT y AS_OF).
        SELECT v_obs.price, v_obs.unit, v_obs.currency,
               'SUPPLIER_OBSERVED'::text, v_obs.newest_observed_on,
               v_obs.observation_ids[1], 2
        WHERE v_obs.price IS NOT NULL

        UNION ALL
        -- 3. Material propio, incluyendo copia del global o vínculo al recurso.
        SELECT m.unit_price, m.unit, m.currency,
               'ORG_MASTER'::text, m.last_price_update::date, m.id, 3
        FROM public.master_materials m
        WHERE p_mode = 'CURRENT'
          AND m.is_active AND m.unit_price > 0
          AND m.organization_id = p_organization_id::text
          AND (m.id = v_mat_id
               OR (v_mat_id IS NOT NULL AND m.global_source_id = v_mat_id)
               OR (v_res_id IS NOT NULL AND m.global_resource_id = v_res_id))

        UNION ALL
        -- 4. Material global, solo mediante identidad existente.
        SELECT m.unit_price, m.unit, m.currency,
               'GLOBAL_MASTER'::text, m.last_price_update::date, m.id, 4
        FROM public.master_materials m
        WHERE p_mode = 'CURRENT'
          AND m.is_active AND m.unit_price > 0
          AND m.organization_id IS NULL
          AND (m.id = v_mat_id
               OR (v_global_source IS NOT NULL AND m.id = v_global_source))

        UNION ALL
        -- 5. Snapshot fechado del recurso de esta organización.
        SELECT s.cost, r.unit, btrim(s.currency::text),
               'RESOURCE_SNAPSHOT'::text, s.effective_date, s.id, 5
        FROM public.resources r
        JOIN LATERAL (
            SELECT s.*
            FROM public.resource_cost_snapshots s
            WHERE s.tenant_id = p_organization_id
              AND s.resource_id = r.id
              AND s.effective_date <= v_date
              AND s.cost > 0
            ORDER BY s.effective_date DESC, s.created_at DESC, s.id DESC
            LIMIT 1
        ) s ON true
        WHERE r.id = v_res_id
          AND r.is_active
          AND (r.organization_id = p_organization_id
               OR r.organization_id IS NULL)

        UNION ALL
        -- 6. Costo base legacy sin historial: CURRENT solamente.
        SELECT r.base_cost, r.unit, 'ARS'::text,
               'RESOURCE_BASE'::text, NULL::date, r.id, 6
        FROM public.resources r
        WHERE p_mode = 'CURRENT'
          AND r.id = v_res_id AND r.is_active AND r.base_cost > 0
          AND (r.organization_id = p_organization_id
               OR r.organization_id IS NULL)

        UNION ALL
        -- 7. Último precio guardado en APU: siempre provisional.
        SELECT v_legacy_price, v_component_unit, NULL::text,
               'LEGACY_FALLBACK'::text, NULL::date, p_component_id, 7
        WHERE p_mode = 'CURRENT'
          AND p_component_id IS NOT NULL AND v_legacy_price > 0
    ),
    chosen AS (
        SELECT *
        FROM candidates
        ORDER BY priority ASC, effective_date DESC NULLS LAST,
                 reference_id ASC
        LIMIT 1
    )
    SELECT c.price, c.unit, c.currency,
           COALESCE(c.source, 'NO_PRICE'),
           array_remove(ARRAY[
               CASE WHEN c.price IS NULL THEN
                   CASE WHEN p_mode = 'AS_OF'
                     THEN 'HISTORICAL_PRICE_UNAVAILABLE'
                     ELSE 'PRICE_NOT_FOUND' END
               END,
               CASE WHEN c.source = 'SUPPLIER_OBSERVED'
                     AND v_obs.price_status = 'DESACTUALIZADO'
                    THEN 'OBSERVATION_STALE' END,
               CASE WHEN c.source = 'LEGACY_FALLBACK'
                    THEN 'LEGACY_PRICE_UNVERIFIED' END,
               CASE WHEN c.source = 'RESOURCE_BASE'
                    THEN 'BASE_COST_ASSUMED_ARS' END,
               CASE WHEN c.source IN ('ORG_MASTER','GLOBAL_MASTER')
                    THEN 'CATALOG_UNVERIFIED' END,
               CASE WHEN c.price IS NOT NULL
                     AND v_required_unit IS NOT NULL
                     AND lower(btrim(c.unit)) <> lower(v_required_unit)
                    THEN 'UNIT_MISMATCH' END,
               CASE WHEN c.price IS NOT NULL
                     AND (c.currency IS NULL
                          OR upper(btrim(c.currency)) <> v_currency)
                    THEN 'CURRENCY_UNKNOWN_OR_MISMATCH' END
           ]::text[], NULL),
           c.effective_date, c.reference_id,
           (c.price > 0
            AND c.source <> 'LEGACY_FALLBACK'
            AND (v_required_unit IS NULL
                 OR lower(btrim(c.unit)) = lower(v_required_unit))
            AND upper(btrim(c.currency)) = v_currency),
           CASE WHEN c.source = 'SUPPLIER_OBSERVED'
                THEN v_obs.observation_count ELSE 0 END,
           CASE WHEN c.price IS NULL THEN 'SIN_PRECIO'
                WHEN c.source = 'SUPPLIER_OBSERVED' THEN v_obs.price_status
                WHEN c.source = 'PROJECT_OVERRIDE' THEN 'RELEVADO'
                ELSE 'CATALOG_UNVERIFIED' END,
           CASE WHEN c.source = 'SUPPLIER_OBSERVED' THEN
               jsonb_build_object(
                   'method', 'median_by_supplier',
                   'window_days', v_obs_window,
                   'as_of', v_date,
                   'mode', p_mode,
                   'filters', jsonb_build_object(
                       'region', v_obs_region, 'currency', v_currency,
                       'includes_vat', v_obs_vat,
                       'commercial_condition', v_obs_condition),
                   'observation_ids', to_jsonb(v_obs.observation_ids),
                   'observation_count', v_obs.observation_count,
                   'supplier_count', v_obs.supplier_count,
                   'newest_observed_on', v_obs.newest_observed_on,
                   'oldest_observed_on', v_obs.oldest_observed_on)
           ELSE
               jsonb_build_object(
                   'method', 'single_source',
                   'source', COALESCE(c.source, 'NO_PRICE'),
                   'as_of', v_date,
                   'mode', p_mode,
                   'observed_candidates', COALESCE(v_obs.observation_count, 0))
           END
      INTO v_result
    FROM (SELECT 1) anchor
    LEFT JOIN chosen c ON true;

    RETURN v_result;
END;
$fn$;

-- No publicar la función para visitantes sin sesión.
REVOKE ALL ON FUNCTION public.resolve_reference_price(
    uuid,uuid,uuid,uuid,uuid,date,text,text,text,uuid,uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_reference_price(
    uuid,uuid,uuid,uuid,uuid,date,text,text,text,uuid,uuid
) TO authenticated;

COMMIT;
