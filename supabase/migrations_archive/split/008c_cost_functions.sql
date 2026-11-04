-- =============================================================================
-- 008c — Cost Versioning: Funciones, Triggers y Seeds
-- =============================================================================
-- QUÉ HACE:
--   · Helpers de validación para constraints (is_valid_positive_number, validate_composite_components)
--   · Constraint endurecido en resource_pricing_rules
--   · Trigger sync_current_snapshot_cache (mantiene resources.current_snapshot_id)
--   · RPCs finales: get_resource_cost, get_resource_snapshot, generate_monthly_snapshots,
--     upsert_index_value (versiones con todos los fixes de hardening + service_role bypass)
--   · Seeds: 8 índices globales oficiales (CAC, ICC, IPC, UOCRA, etc.)
--
-- PREREQUISITOS:
--   · 008a ejecutado (tablas + enums)
--   · 008b ejecutado (RLS)
--   · Migración 007 ejecutada (is_org_member, is_org_member_with_role)
--
-- IDEMPOTENTE: sí (CREATE OR REPLACE, DROP TRIGGER IF EXISTS, ON CONFLICT DO NOTHING).
--
-- VERIFICAR DESPUÉS:
--   SELECT routine_name FROM information_schema.routines
--   WHERE routine_schema = 'public'
--     AND routine_name IN ('get_resource_cost','get_resource_snapshot',
--                          'generate_monthly_snapshots','upsert_index_value',
--                          'sync_current_snapshot_cache');
--   -- Debe devolver 5 filas.
--
--   SELECT count(*) FROM public.cost_indices WHERE tenant_id IS NULL;
--   -- Debe devolver 8.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. HELPERS DE VALIDACIÓN (para CHECK constraints en resource_pricing_rules)
-- IMMUTABLE: seguros para constraints e índices.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_valid_positive_number(v jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT v IS NOT NULL
     AND jsonb_typeof(v) = 'number'
     AND (v::text)::numeric > 0
$$;

CREATE OR REPLACE FUNCTION public.validate_composite_components(cfg jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    jsonb_typeof(cfg -> 'components') = 'array'
    AND jsonb_array_length(cfg -> 'components') >= 1
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(cfg -> 'components') c
      WHERE
        (c ->> 'index_id') IS NULL
        OR (c -> 'weight') IS NULL
        OR jsonb_typeof(c -> 'weight') <> 'number'
        OR (c ->> 'weight')::numeric <= 0
        OR (c -> 'base_period') IS NULL
        OR jsonb_typeof(c -> 'base_period') <> 'object'
        OR (c -> 'base_period' ->> 'year')  IS NULL
        OR (c -> 'base_period' ->> 'month') IS NULL
    )
$$;

-- =============================================================================
-- 2. CONSTRAINT ENDURECIDO en resource_pricing_rules
-- Reemplaza el constraint básico de 008a con validaciones completas.
-- =============================================================================

ALTER TABLE public.resource_pricing_rules
  DROP CONSTRAINT IF EXISTS resource_pricing_rules_type_check;

ALTER TABLE public.resource_pricing_rules
  ADD CONSTRAINT resource_pricing_rules_type_check CHECK (
    (rule_type = 'FIXED_MANUAL'
      AND base_cost IS NOT NULL)

    OR (rule_type = 'DIRECT_IMPORT')

    OR (rule_type = 'INDEX_MULTIPLIER'
      AND index_id  IS NOT NULL
      AND base_date IS NOT NULL
      AND base_cost IS NOT NULL)

    OR (rule_type = 'COMPOSITE_INDEX'
      AND base_cost IS NOT NULL
      AND public.validate_composite_components(formula_config))

    OR (rule_type = 'LABOR_FORMULA'
      AND base_cost IS NOT NULL
      AND public.is_valid_positive_number(formula_config -> 'base_hourly_rate')
      AND (formula_config ->> 'index_id') IS NOT NULL
      AND jsonb_typeof(formula_config -> 'base_period') = 'object'
      AND (formula_config -> 'base_period' ->> 'year')  IS NOT NULL
      AND (formula_config -> 'base_period' ->> 'month') IS NOT NULL)
  );

-- =============================================================================
-- 3. TRIGGER: sync_current_snapshot_cache
-- Mantiene resources.current_snapshot_id como caché del snapshot vigente HOY.
-- Dispara AFTER INSERT OR DELETE en resource_cost_snapshots.
-- Snapshot futuro (effective_date > CURRENT_DATE) en INSERT no actualiza la caché.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sync_current_snapshot_cache()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_resource_id uuid;
  v_tenant_id   uuid;
  v_snap_id     uuid;
BEGIN
  v_resource_id := CASE TG_OP WHEN 'DELETE' THEN OLD.resource_id ELSE NEW.resource_id END;
  v_tenant_id   := CASE TG_OP WHEN 'DELETE' THEN OLD.tenant_id   ELSE NEW.tenant_id   END;

  -- Snapshot futuro en INSERT: no es vigente hoy, no actualizar caché
  IF TG_OP = 'INSERT' AND NEW.effective_date > CURRENT_DATE THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_snap_id
  FROM public.resource_cost_snapshots
  WHERE tenant_id    = v_tenant_id
    AND resource_id  = v_resource_id
    AND effective_date <= CURRENT_DATE
    AND source_type   <> 'FALLBACK_BASE_COST'
  ORDER BY effective_date DESC, created_at DESC
  LIMIT 1;

  UPDATE public.resources
  SET current_snapshot_id = v_snap_id
  WHERE id = v_resource_id;

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS resource_cost_snapshots_sync_cache ON public.resource_cost_snapshots;

CREATE TRIGGER resource_cost_snapshots_sync_cache
  AFTER INSERT OR DELETE ON public.resource_cost_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.sync_current_snapshot_cache();

COMMENT ON COLUMN public.resources.current_snapshot_id IS
  'Caché del snapshot vigente HOY (effective_date <= CURRENT_DATE). '
  'Mantenido automáticamente por trigger sync_current_snapshot_cache. '
  'Para consultas históricas usar get_resource_cost(id, tenant, date).';

-- =============================================================================
-- 4. get_resource_cost
-- Retorna el costo vigente para (recurso, tenant, fecha).
-- Fallback a resources.base_cost si no hay snapshot.
-- Guards: autorización de membresía + accesibilidad del recurso.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_resource_cost(
  p_resource_id uuid,
  p_tenant_id   uuid,
  p_date        date DEFAULT CURRENT_DATE
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost numeric;
BEGIN
  -- Guard 1: autorización (service_role = auth.uid() IS NULL, bypassa)
  IF auth.uid() IS NOT NULL AND NOT is_org_member(p_tenant_id) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: el usuario no es miembro del tenant %', p_tenant_id
      USING ERRCODE = '42501';
  END IF;

  -- Guard 2: el recurso debe ser global o del tenant
  IF NOT EXISTS (
    SELECT 1 FROM public.resources r
    WHERE r.id = p_resource_id
      AND (r.organization_id IS NULL OR r.organization_id::text = p_tenant_id::text)
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: recurso % no accesible para tenant %', p_resource_id, p_tenant_id
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    (
      SELECT s.cost
      FROM public.resource_cost_snapshots s
      WHERE s.tenant_id    = p_tenant_id
        AND s.resource_id  = p_resource_id
        AND s.effective_date <= p_date
      ORDER BY s.effective_date DESC, s.created_at DESC
      LIMIT 1
    ),
    (SELECT base_cost FROM public.resources WHERE id = p_resource_id)
  ) INTO v_cost;

  RETURN v_cost;
END;
$$;

-- =============================================================================
-- 5. get_resource_snapshot
-- Retorna el snapshot completo con trazabilidad.
-- Fallback a base_cost con is_fallback=true si no existe snapshot.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_resource_snapshot(
  p_resource_id uuid,
  p_tenant_id   uuid,
  p_date        date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  snapshot_id         uuid,
  resource_id         uuid,
  effective_date      date,
  cost                numeric,
  currency            char(3),
  source_type         public.snapshot_source_type,
  source_reference    text,
  pricing_rule_id     uuid,
  index_id            uuid,
  index_base_value    numeric,
  index_current_value numeric,
  adjustment_factor   numeric,
  metadata            jsonb,
  is_fallback         boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_org_member(p_tenant_id) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: el usuario no es miembro del tenant %', p_tenant_id
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.resources r
    WHERE r.id = p_resource_id
      AND (r.organization_id IS NULL OR r.organization_id::text = p_tenant_id::text)
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: recurso % no accesible para tenant %', p_resource_id, p_tenant_id
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT
      s.id, s.resource_id, s.effective_date, s.cost, s.currency,
      s.source_type, s.source_reference, s.pricing_rule_id, s.index_id,
      s.index_base_value, s.index_current_value, s.adjustment_factor,
      s.metadata, false
    FROM public.resource_cost_snapshots s
    WHERE s.tenant_id    = p_tenant_id
      AND s.resource_id  = p_resource_id
      AND s.effective_date <= p_date
    ORDER BY s.effective_date DESC, s.created_at DESC
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY
      SELECT
        NULL::uuid, r.id, NULL::date, r.base_cost, 'ARS'::char(3),
        'FALLBACK_BASE_COST'::public.snapshot_source_type,
        NULL::text, NULL::uuid, NULL::uuid,
        NULL::numeric, NULL::numeric, NULL::numeric,
        '{"fallback":true}'::jsonb, true
      FROM public.resources r
      WHERE r.id = p_resource_id;
  END IF;
END;
$$;

-- =============================================================================
-- 6. generate_monthly_snapshots
-- Genera snapshots para todas las reglas activas del tenant en un período.
-- Retorna una fila por recurso: 'created' | 'skipped' | 'error: ...'
-- SERVICE_ROLE BYPASS: auth.uid() IS NULL = service_role (scripts de automatización).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.generate_monthly_snapshots(
  p_tenant_id uuid,
  p_year      smallint,
  p_month     smallint,
  p_overwrite boolean DEFAULT false
)
RETURNS TABLE (
  resource_id   uuid,
  resource_code text,
  rule_type     public.pricing_rule_type,
  cost          numeric,
  status        text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eff_date         date;
  v_rule             record;
  v_base_idx_val     numeric;
  v_curr_idx_val     numeric;
  v_factor           numeric;
  v_cost             numeric;
  v_status           text;
  v_src              public.snapshot_source_type;
  v_base_hourly      numeric;
  v_hours            numeric;
  v_multiplier       numeric;
  v_lf_index_id      uuid;
  v_lf_base_yr       smallint;
  v_lf_base_mo       smallint;
  v_comp_row         jsonb;
  v_comp_index_id    uuid;
  v_comp_weight      numeric;
  v_comp_base_yr     smallint;
  v_comp_base_mo     smallint;
  v_comp_base_val    numeric;
  v_comp_curr_val    numeric;
  v_weighted_sum     numeric;
  v_comps            jsonb;
  v_i                int;
BEGIN
  -- auth.uid() IS NULL = service_role → bypass permitido para automatización
  IF auth.uid() IS NOT NULL
     AND NOT is_org_member_with_role(p_tenant_id, ARRAY['owner','admin','editor'])
  THEN
    RAISE EXCEPTION 'UNAUTHORIZED: tenant %', p_tenant_id;
  END IF;

  v_eff_date := make_date(p_year::int, p_month::int, 1);

  FOR v_rule IN
    SELECT DISTINCT ON (rpr.resource_id)
      rpr.*, r.code AS res_code
    FROM public.resource_pricing_rules rpr
    JOIN public.resources r ON r.id = rpr.resource_id
    WHERE rpr.tenant_id = p_tenant_id AND rpr.is_active = true
    ORDER BY rpr.resource_id, rpr.priority DESC
  LOOP
    v_cost   := NULL;
    v_status := 'error';
    v_src    := NULL;

    IF NOT p_overwrite AND EXISTS (
      SELECT 1 FROM public.resource_cost_snapshots
      WHERE tenant_id     = p_tenant_id
        AND resource_id   = v_rule.resource_id
        AND effective_date = v_eff_date
        AND source_type   <> 'FALLBACK_BASE_COST'
    ) THEN
      resource_id   := v_rule.resource_id;
      resource_code := v_rule.res_code;
      rule_type     := v_rule.rule_type;
      cost          := NULL;
      status        := 'skipped';
      RETURN NEXT; CONTINUE;
    END IF;

    IF v_rule.rule_type = 'FIXED_MANUAL' THEN
      v_cost := v_rule.base_cost; v_src := 'MANUAL'; v_status := 'created';

    ELSIF v_rule.rule_type = 'DIRECT_IMPORT' THEN
      resource_id := v_rule.resource_id; resource_code := v_rule.res_code;
      rule_type := v_rule.rule_type; cost := NULL;
      status := 'skipped: requiere importación directa'; RETURN NEXT; CONTINUE;

    ELSIF v_rule.rule_type = 'INDEX_MULTIPLIER' THEN
      SELECT value INTO v_base_idx_val FROM public.cost_index_values
      WHERE index_id = v_rule.index_id
        AND period_year  = EXTRACT(YEAR  FROM v_rule.base_date)::smallint
        AND period_month = EXTRACT(MONTH FROM v_rule.base_date)::smallint;
      SELECT value INTO v_curr_idx_val FROM public.cost_index_values
      WHERE index_id = v_rule.index_id AND period_year = p_year AND period_month = p_month;
      IF v_base_idx_val IS NULL OR v_curr_idx_val IS NULL OR v_base_idx_val = 0 THEN
        resource_id := v_rule.resource_id; resource_code := v_rule.res_code;
        rule_type := v_rule.rule_type; cost := NULL;
        status := 'error: índice sin valor para el período'; RETURN NEXT; CONTINUE;
      END IF;
      v_factor := v_curr_idx_val / v_base_idx_val;
      v_cost   := ROUND(v_rule.base_cost * v_factor, 4);
      v_src    := 'INDEX_CALCULATION'; v_status := 'created';

    ELSIF v_rule.rule_type = 'LABOR_FORMULA' THEN
      v_base_hourly := (v_rule.formula_config ->>'base_hourly_rate')::numeric;
      v_hours       := COALESCE((v_rule.formula_config ->>'hours_per_unit')::numeric, 1);
      v_multiplier  := COALESCE((v_rule.formula_config ->>'category_multiplier')::numeric, 1);
      v_lf_index_id := (v_rule.formula_config ->>'index_id')::uuid;
      v_lf_base_yr  := (v_rule.formula_config -> 'base_period' ->>'year')::smallint;
      v_lf_base_mo  := (v_rule.formula_config -> 'base_period' ->>'month')::smallint;
      SELECT value INTO v_base_idx_val FROM public.cost_index_values
      WHERE index_id = v_lf_index_id AND period_year = v_lf_base_yr AND period_month = v_lf_base_mo;
      SELECT value INTO v_curr_idx_val FROM public.cost_index_values
      WHERE index_id = v_lf_index_id AND period_year = p_year AND period_month = p_month;
      IF v_base_idx_val IS NULL OR v_curr_idx_val IS NULL OR v_base_idx_val = 0 THEN
        resource_id := v_rule.resource_id; resource_code := v_rule.res_code;
        rule_type := v_rule.rule_type; cost := NULL;
        status := 'error: índice laboral sin valor'; RETURN NEXT; CONTINUE;
      END IF;
      v_factor := v_curr_idx_val / v_base_idx_val;
      v_cost   := ROUND(v_base_hourly * v_hours * v_multiplier * v_factor, 4);
      v_src    := 'LABOR_CALCULATION'; v_status := 'created';

    ELSIF v_rule.rule_type = 'COMPOSITE_INDEX' THEN
      v_comps := v_rule.formula_config -> 'components';
      v_weighted_sum := 0;
      FOR v_i IN 0 .. jsonb_array_length(v_comps) - 1 LOOP
        v_comp_row      := v_comps -> v_i;
        v_comp_index_id := (v_comp_row ->>'index_id')::uuid;
        v_comp_weight   := (v_comp_row ->>'weight')::numeric;
        v_comp_base_yr  := (v_comp_row -> 'base_period' ->>'year')::smallint;
        v_comp_base_mo  := (v_comp_row -> 'base_period' ->>'month')::smallint;
        SELECT value INTO v_comp_base_val FROM public.cost_index_values
        WHERE index_id = v_comp_index_id AND period_year = v_comp_base_yr AND period_month = v_comp_base_mo;
        SELECT value INTO v_comp_curr_val FROM public.cost_index_values
        WHERE index_id = v_comp_index_id AND period_year = p_year AND period_month = p_month;
        IF v_comp_base_val IS NULL OR v_comp_curr_val IS NULL OR v_comp_base_val = 0 THEN
          v_weighted_sum := NULL; EXIT;
        END IF;
        v_weighted_sum := v_weighted_sum + v_comp_weight * (v_comp_curr_val / v_comp_base_val);
      END LOOP;
      IF v_weighted_sum IS NULL THEN
        resource_id := v_rule.resource_id; resource_code := v_rule.res_code;
        rule_type := v_rule.rule_type; cost := NULL;
        status := 'error: componente compuesto sin valor'; RETURN NEXT; CONTINUE;
      END IF;
      v_cost   := ROUND(v_rule.base_cost * v_weighted_sum, 4);
      v_src    := 'COMPOSITE_CALCULATION'; v_status := 'created';
    END IF;

    IF v_cost IS NOT NULL THEN
      IF p_overwrite THEN
        INSERT INTO public.resource_cost_snapshots (
          tenant_id, resource_id, effective_date, cost, currency,
          source_type, pricing_rule_id, index_id,
          index_base_value, index_current_value, adjustment_factor, metadata
        ) VALUES (
          p_tenant_id, v_rule.resource_id, v_eff_date, v_cost, 'ARS', v_src, v_rule.id,
          CASE WHEN v_rule.rule_type = 'INDEX_MULTIPLIER' THEN v_rule.index_id ELSE NULL END,
          CASE WHEN v_rule.rule_type = 'INDEX_MULTIPLIER' THEN v_base_idx_val  ELSE NULL END,
          CASE WHEN v_rule.rule_type = 'INDEX_MULTIPLIER' THEN v_curr_idx_val  ELSE NULL END,
          CASE WHEN v_rule.rule_type = 'INDEX_MULTIPLIER' THEN v_factor        ELSE NULL END,
          jsonb_build_object('generated_by','generate_monthly_snapshots',
            'rule_name', v_rule.rule_name, 'rule_type', v_rule.rule_type::text)
        )
        ON CONFLICT (tenant_id, resource_id, effective_date, source_type)
        DO UPDATE SET
          cost = EXCLUDED.cost, pricing_rule_id = EXCLUDED.pricing_rule_id,
          index_id = EXCLUDED.index_id, index_base_value = EXCLUDED.index_base_value,
          index_current_value = EXCLUDED.index_current_value,
          adjustment_factor = EXCLUDED.adjustment_factor, metadata = EXCLUDED.metadata;
      ELSE
        INSERT INTO public.resource_cost_snapshots (
          tenant_id, resource_id, effective_date, cost, currency,
          source_type, pricing_rule_id, index_id,
          index_base_value, index_current_value, adjustment_factor, metadata
        ) VALUES (
          p_tenant_id, v_rule.resource_id, v_eff_date, v_cost, 'ARS', v_src, v_rule.id,
          CASE WHEN v_rule.rule_type = 'INDEX_MULTIPLIER' THEN v_rule.index_id ELSE NULL END,
          CASE WHEN v_rule.rule_type = 'INDEX_MULTIPLIER' THEN v_base_idx_val  ELSE NULL END,
          CASE WHEN v_rule.rule_type = 'INDEX_MULTIPLIER' THEN v_curr_idx_val  ELSE NULL END,
          CASE WHEN v_rule.rule_type = 'INDEX_MULTIPLIER' THEN v_factor        ELSE NULL END,
          jsonb_build_object('generated_by','generate_monthly_snapshots',
            'rule_name', v_rule.rule_name, 'rule_type', v_rule.rule_type::text)
        )
        ON CONFLICT (tenant_id, resource_id, effective_date, source_type) DO NOTHING;
      END IF;
    END IF;

    resource_id   := v_rule.resource_id;
    resource_code := v_rule.res_code;
    rule_type     := v_rule.rule_type;
    cost          := v_cost;
    status        := v_status;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- =============================================================================
-- 7. upsert_index_value
-- Carga o actualiza el valor mensual de un índice.
-- Globales (tenant_id IS NULL): solo service_role.
-- Privados: owner o admin del tenant.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.upsert_index_value(
  p_index_code     text,
  p_year           smallint,
  p_month          smallint,
  p_value          numeric,
  p_published_at   date    DEFAULT NULL,
  p_source_ref     text    DEFAULT NULL,
  p_tenant_id      uuid    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_index_id  uuid;
  v_result_id uuid;
BEGIN
  IF p_tenant_id IS NULL THEN
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'FORBIDDEN: índices globales solo con service_role'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT is_org_member_with_role(p_tenant_id, ARRAY['owner','admin']) THEN
      RAISE EXCEPTION 'FORBIDDEN: se requiere owner o admin para tenant %', p_tenant_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT id INTO v_index_id
  FROM public.cost_indices
  WHERE code = p_index_code
    AND (
      (p_tenant_id IS NULL AND tenant_id IS NULL)
      OR tenant_id = p_tenant_id
    )
  LIMIT 1;

  IF v_index_id IS NULL THEN
    RAISE EXCEPTION 'Índice no encontrado: code=%, tenant=%', p_index_code, p_tenant_id
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.cost_index_values
    (index_id, period_year, period_month, value, published_at, source_reference)
  VALUES
    (v_index_id, p_year, p_month, p_value, p_published_at, p_source_ref)
  ON CONFLICT (index_id, period_year, period_month)
  DO UPDATE SET
    value            = EXCLUDED.value,
    published_at     = COALESCE(EXCLUDED.published_at,     cost_index_values.published_at),
    source_reference = COALESCE(EXCLUDED.source_reference, cost_index_values.source_reference)
  RETURNING id INTO v_result_id;

  RETURN v_result_id;
END;
$$;

-- =============================================================================
-- 8. SEEDS: índices globales oficiales
-- Idempotente: ON CONFLICT DO NOTHING.
-- =============================================================================

INSERT INTO public.cost_indices (id, tenant_id, code, name, category, provider, frequency, description)
VALUES
  (gen_random_uuid(), NULL, 'CAC',      'Costo de la Construcción (CAC)',     'GENERAL',   'INDEC',   'MONTHLY', 'Índice general de costos de la construcción — INDEC'),
  (gen_random_uuid(), NULL, 'ICC',      'Índice del Costo de la Construcción','GENERAL',   'CAMARCO', 'MONTHLY', 'ICC elaborado por CAMARCO'),
  (gen_random_uuid(), NULL, 'IPC',      'Índice de Precios al Consumidor',    'GENERAL',   'INDEC',   'MONTHLY', 'IPC Nacional — INDEC'),
  (gen_random_uuid(), NULL, 'UOCRA',    'Índice Salarial UOCRA Oficial',      'LABOR',     'UOCRA',   'MONTHLY', 'Escala salarial UOCRA — Oficial Albañil'),
  (gen_random_uuid(), NULL, 'UOCRA-AYU','Índice Salarial UOCRA Ayudante',     'LABOR',     'UOCRA',   'MONTHLY', 'Escala salarial UOCRA — Ayudante'),
  (gen_random_uuid(), NULL, 'CAC-MAT',  'CAC — Componente Materiales',        'MATERIALS', 'INDEC',   'MONTHLY', 'Sub-índice materiales del CAC'),
  (gen_random_uuid(), NULL, 'CAC-MO',   'CAC — Componente Mano de Obra',      'LABOR',     'INDEC',   'MONTHLY', 'Sub-índice mano de obra del CAC'),
  (gen_random_uuid(), NULL, 'CAC-EQ',   'CAC — Componente Equipos y Gastos',  'EQUIPMENT', 'INDEC',   'MONTHLY', 'Sub-índice equipos y gastos generales del CAC')
ON CONFLICT DO NOTHING;

COMMIT;
