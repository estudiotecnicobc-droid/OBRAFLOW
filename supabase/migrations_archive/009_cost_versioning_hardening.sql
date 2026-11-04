-- =============================================================================
-- Migration 009: Cost Versioning — Hardening
-- =============================================================================
-- FIX 1: aislamiento tenant/recurso en get_resource_cost + get_resource_snapshot
-- FIX 2: semántica correcta de p_overwrite en generate_monthly_snapshots
-- FIX 3: validaciones endurecidas en resource_pricing_rules (LABOR_FORMULA + COMPOSITE_INDEX)
-- FIX 4: trigger para mantener resources.current_snapshot_id como caché de hoy
-- FIX 5: autorización explícita en upsert_index_value (SECURITY DEFINER)
-- =============================================================================

BEGIN;

-- =============================================================================
-- FIX 3 — Helpers para CHECK constraints (deben existir antes del constraint)
-- IMMUTABLE: seguro para uso en índices y constraints
-- =============================================================================

-- Valida que un valor jsonb sea un número positivo
CREATE OR REPLACE FUNCTION public.is_valid_positive_number(v jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT v IS NOT NULL
     AND jsonb_typeof(v) = 'number'
     AND (v::text)::numeric > 0
$$;

-- Valida estructura del array de componentes para COMPOSITE_INDEX
-- Cada componente debe tener: index_id (not null), weight (number > 0), base_period (object con year y month)
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
        -- index_id requerido y no nulo
        (c ->> 'index_id') IS NULL
        -- weight requerido, número y positivo
        OR (c -> 'weight') IS NULL
        OR jsonb_typeof(c -> 'weight') <> 'number'
        OR (c ->> 'weight')::numeric <= 0
        -- base_period requerido con year y month
        OR (c -> 'base_period') IS NULL
        OR jsonb_typeof(c -> 'base_period') <> 'object'
        OR (c -> 'base_period' ->> 'year')  IS NULL
        OR (c -> 'base_period' ->> 'month') IS NULL
    )
$$;

-- =============================================================================
-- FIX 3 — DROP + ADD constraint endurecido en resource_pricing_rules
-- Cambios respecto a 008:
--   · LABOR_FORMULA: valida base_hourly_rate > 0, index_id, base_period estructurado
--   · COMPOSITE_INDEX: valida componentes con validate_composite_components() + base_cost NOT NULL
--   · INDEX_MULTIPLIER: sin cambio
--   · FIXED_MANUAL: sin cambio
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
-- FIX 4 — Trigger: mantener resources.current_snapshot_id como caché de hoy
-- Reemplaza el UPDATE manual que estaba dentro de generate_monthly_snapshots.
-- current_snapshot_id = snapshot más reciente con effective_date <= CURRENT_DATE.
-- Snapshots futuros (effective_date > hoy) no actualizan la caché.
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

  -- Snapshot futuro en INSERT: no actualizar caché, no es vigente aún
  IF TG_OP = 'INSERT' AND NEW.effective_date > CURRENT_DATE THEN
    RETURN NEW;
  END IF;

  -- Resolver el snapshot vigente más reciente (no FALLBACK)
  SELECT id INTO v_snap_id
  FROM public.resource_cost_snapshots
  WHERE tenant_id    = v_tenant_id
    AND resource_id  = v_resource_id
    AND effective_date <= CURRENT_DATE
    AND source_type   <> 'FALLBACK_BASE_COST'
  ORDER BY effective_date DESC, created_at DESC
  LIMIT 1;

  -- Actualizar caché (NULL si no existe snapshot → vuelve a fallback)
  UPDATE public.resources
  SET current_snapshot_id = v_snap_id
  WHERE id = v_resource_id;

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- Idempotente
DROP TRIGGER IF EXISTS resource_cost_snapshots_sync_cache ON public.resource_cost_snapshots;

CREATE TRIGGER resource_cost_snapshots_sync_cache
  AFTER INSERT OR DELETE ON public.resource_cost_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.sync_current_snapshot_cache();

COMMENT ON COLUMN public.resources.current_snapshot_id IS
  'Caché del snapshot vigente HOY (effective_date <= CURRENT_DATE). '
  'Mantenido automáticamente por trigger sync_current_snapshot_cache. '
  'NO usar para consultas históricas: usar get_resource_cost(id, tenant, date) o get_resource_snapshot().';

-- =============================================================================
-- FIX 1 — get_resource_cost: aislamiento tenant/recurso explícito
-- Agrega dos guards antes de resolver el costo:
--   1. is_org_member(p_tenant_id)          → el caller pertenece al tenant
--   2. resource accesible para ese tenant → org IS NULL (global) o org = tenant
-- Convertida a plpgsql para poder usar RAISE.
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
  -- Guard 1: autorización
  IF NOT is_org_member(p_tenant_id) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: el usuario no es miembro del tenant %', p_tenant_id
      USING ERRCODE = '42501';
  END IF;

  -- Guard 2: el recurso debe pertenecer al tenant o ser global
  IF NOT EXISTS (
    SELECT 1 FROM public.resources r
    WHERE r.id = p_resource_id
      AND (r.organization_id IS NULL OR r.organization_id = p_tenant_id)
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: recurso % no accesible para tenant %', p_resource_id, p_tenant_id
      USING ERRCODE = '42501';
  END IF;

  -- Snapshot más reciente ≤ p_date; fallback a base_cost
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
-- FIX 1 — get_resource_snapshot: mismos guards de aislamiento
-- Convertida a plpgsql; comportamiento de RETURN QUERY idéntico al SQL original.
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
  -- Guard 1: autorización
  IF NOT is_org_member(p_tenant_id) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: el usuario no es miembro del tenant %', p_tenant_id
      USING ERRCODE = '42501';
  END IF;

  -- Guard 2: recurso accesible
  IF NOT EXISTS (
    SELECT 1 FROM public.resources r
    WHERE r.id = p_resource_id
      AND (r.organization_id IS NULL OR r.organization_id = p_tenant_id)
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: recurso % no accesible para tenant %', p_resource_id, p_tenant_id
      USING ERRCODE = '42501';
  END IF;

  -- Snapshot más reciente ≤ p_date
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

  -- Fallback si no se encontró snapshot
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
-- FIX 2 + FIX 4 — generate_monthly_snapshots
-- Cambios respecto a 008:
--   FIX 2: INSERT condicional según p_overwrite
--     · p_overwrite=true  → ON CONFLICT DO UPDATE  (sobreescribe)
--     · p_overwrite=false → ON CONFLICT DO NOTHING (nunca pisa)
--   FIX 4: removido el UPDATE manual de resources.current_snapshot_id
--     → el trigger sync_current_snapshot_cache lo maneja automáticamente
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
  -- LABOR_FORMULA
  v_base_hourly      numeric;
  v_hours            numeric;
  v_multiplier       numeric;
  v_lf_index_id      uuid;
  v_lf_base_yr       smallint;
  v_lf_base_mo       smallint;
  -- COMPOSITE_INDEX
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
  IF NOT is_org_member_with_role(p_tenant_id, ARRAY['owner','admin','editor']) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: tenant %', p_tenant_id;
  END IF;

  v_eff_date := make_date(p_year::int, p_month::int, 1);

  -- Itera la regla de mayor prioridad activa por recurso
  FOR v_rule IN
    SELECT DISTINCT ON (rpr.resource_id)
      rpr.*,
      r.code AS res_code
    FROM public.resource_pricing_rules rpr
    JOIN public.resources r ON r.id = rpr.resource_id
    WHERE rpr.tenant_id = p_tenant_id
      AND rpr.is_active = true
    ORDER BY rpr.resource_id, rpr.priority DESC
  LOOP
    v_cost   := NULL;
    v_status := 'error';
    v_src    := NULL;

    -- Skip si ya existe snapshot para este período y no se quiere sobreescribir
    -- Se evalúa por cualquier source distinto de FALLBACK (conservador: protege todo tipo)
    IF NOT p_overwrite AND EXISTS (
      SELECT 1 FROM public.resource_cost_snapshots
      WHERE tenant_id    = p_tenant_id
        AND resource_id  = v_rule.resource_id
        AND effective_date = v_eff_date
        AND source_type   <> 'FALLBACK_BASE_COST'
    ) THEN
      resource_id   := v_rule.resource_id;
      resource_code := v_rule.res_code;
      rule_type     := v_rule.rule_type;
      cost          := NULL;
      status        := 'skipped';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- ── FIXED_MANUAL ────────────────────────────────────────────────────────
    IF v_rule.rule_type = 'FIXED_MANUAL' THEN
      v_cost   := v_rule.base_cost;
      v_src    := 'MANUAL';
      v_status := 'created';

    -- ── DIRECT_IMPORT ────────────────────────────────────────────────────────
    ELSIF v_rule.rule_type = 'DIRECT_IMPORT' THEN
      resource_id   := v_rule.resource_id;
      resource_code := v_rule.res_code;
      rule_type     := v_rule.rule_type;
      cost          := NULL;
      status        := 'skipped: requiere importación directa';
      RETURN NEXT;
      CONTINUE;

    -- ── INDEX_MULTIPLIER ─────────────────────────────────────────────────────
    ELSIF v_rule.rule_type = 'INDEX_MULTIPLIER' THEN
      SELECT value INTO v_base_idx_val
      FROM public.cost_index_values
      WHERE index_id     = v_rule.index_id
        AND period_year  = EXTRACT(YEAR  FROM v_rule.base_date)::smallint
        AND period_month = EXTRACT(MONTH FROM v_rule.base_date)::smallint;

      SELECT value INTO v_curr_idx_val
      FROM public.cost_index_values
      WHERE index_id     = v_rule.index_id
        AND period_year  = p_year
        AND period_month = p_month;

      IF v_base_idx_val IS NULL OR v_curr_idx_val IS NULL OR v_base_idx_val = 0 THEN
        resource_id := v_rule.resource_id; resource_code := v_rule.res_code;
        rule_type := v_rule.rule_type; cost := NULL;
        status := 'error: índice sin valor para el período'; RETURN NEXT; CONTINUE;
      END IF;

      v_factor := v_curr_idx_val / v_base_idx_val;
      v_cost   := ROUND(v_rule.base_cost * v_factor, 4);
      v_src    := 'INDEX_CALCULATION';
      v_status := 'created';

    -- ── LABOR_FORMULA ────────────────────────────────────────────────────────
    ELSIF v_rule.rule_type = 'LABOR_FORMULA' THEN
      v_base_hourly  := (v_rule.formula_config ->>'base_hourly_rate')::numeric;
      v_hours        := COALESCE((v_rule.formula_config ->>'hours_per_unit')::numeric, 1);
      v_multiplier   := COALESCE((v_rule.formula_config ->>'category_multiplier')::numeric, 1);
      v_lf_index_id  := (v_rule.formula_config ->>'index_id')::uuid;
      v_lf_base_yr   := (v_rule.formula_config -> 'base_period' ->>'year')::smallint;
      v_lf_base_mo   := (v_rule.formula_config -> 'base_period' ->>'month')::smallint;

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
      v_src    := 'LABOR_CALCULATION';
      v_status := 'created';

    -- ── COMPOSITE_INDEX ──────────────────────────────────────────────────────
    ELSIF v_rule.rule_type = 'COMPOSITE_INDEX' THEN
      v_comps        := v_rule.formula_config -> 'components';
      v_weighted_sum := 0;

      FOR v_i IN 0 .. jsonb_array_length(v_comps) - 1 LOOP
        v_comp_row       := v_comps -> v_i;
        v_comp_index_id  := (v_comp_row ->>'index_id')::uuid;
        v_comp_weight    := (v_comp_row ->>'weight')::numeric;
        v_comp_base_yr   := (v_comp_row -> 'base_period' ->>'year')::smallint;
        v_comp_base_mo   := (v_comp_row -> 'base_period' ->>'month')::smallint;

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
      v_src    := 'COMPOSITE_CALCULATION';
      v_status := 'created';
    END IF;

    -- ── Insertar snapshot ─────────────────────────────────────────────────────
    -- FIX 2: ON CONFLICT condicional según p_overwrite
    --   p_overwrite=true  → DO UPDATE (sobreescribe el snapshot existente)
    --   p_overwrite=false → DO NOTHING (defensa en profundidad ante race conditions)
    -- El trigger sync_current_snapshot_cache actualiza resources.current_snapshot_id
    IF v_cost IS NOT NULL THEN
      IF p_overwrite THEN
        INSERT INTO public.resource_cost_snapshots (
          tenant_id, resource_id, effective_date, cost, currency,
          source_type, pricing_rule_id, index_id,
          index_base_value, index_current_value, adjustment_factor,
          metadata
        ) VALUES (
          p_tenant_id, v_rule.resource_id, v_eff_date, v_cost, 'ARS', v_src,
          v_rule.id,
          CASE WHEN v_rule.rule_type = 'INDEX_MULTIPLIER' THEN v_rule.index_id ELSE NULL END,
          CASE WHEN v_rule.rule_type = 'INDEX_MULTIPLIER' THEN v_base_idx_val  ELSE NULL END,
          CASE WHEN v_rule.rule_type = 'INDEX_MULTIPLIER' THEN v_curr_idx_val  ELSE NULL END,
          CASE WHEN v_rule.rule_type = 'INDEX_MULTIPLIER' THEN v_factor        ELSE NULL END,
          jsonb_build_object(
            'generated_by', 'generate_monthly_snapshots',
            'rule_name',    v_rule.rule_name,
            'rule_type',    v_rule.rule_type::text
          )
        )
        ON CONFLICT (tenant_id, resource_id, effective_date, source_type)
        DO UPDATE SET
          cost                = EXCLUDED.cost,
          pricing_rule_id     = EXCLUDED.pricing_rule_id,
          index_id            = EXCLUDED.index_id,
          index_base_value    = EXCLUDED.index_base_value,
          index_current_value = EXCLUDED.index_current_value,
          adjustment_factor   = EXCLUDED.adjustment_factor,
          metadata            = EXCLUDED.metadata;
      ELSE
        -- p_overwrite=false: nunca sobreescribir (defensa ante race condition)
        INSERT INTO public.resource_cost_snapshots (
          tenant_id, resource_id, effective_date, cost, currency,
          source_type, pricing_rule_id, index_id,
          index_base_value, index_current_value, adjustment_factor,
          metadata
        ) VALUES (
          p_tenant_id, v_rule.resource_id, v_eff_date, v_cost, 'ARS', v_src,
          v_rule.id,
          CASE WHEN v_rule.rule_type = 'INDEX_MULTIPLIER' THEN v_rule.index_id ELSE NULL END,
          CASE WHEN v_rule.rule_type = 'INDEX_MULTIPLIER' THEN v_base_idx_val  ELSE NULL END,
          CASE WHEN v_rule.rule_type = 'INDEX_MULTIPLIER' THEN v_curr_idx_val  ELSE NULL END,
          CASE WHEN v_rule.rule_type = 'INDEX_MULTIPLIER' THEN v_factor        ELSE NULL END,
          jsonb_build_object(
            'generated_by', 'generate_monthly_snapshots',
            'rule_name',    v_rule.rule_name,
            'rule_type',    v_rule.rule_type::text
          )
        )
        ON CONFLICT (tenant_id, resource_id, effective_date, source_type)
        DO NOTHING;
      END IF;
      -- Nota: resources.current_snapshot_id se actualiza por trigger
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
-- FIX 5 — upsert_index_value: autorización explícita en función SECURITY DEFINER
-- Regla:
--   p_tenant_id IS NULL → solo service_role puede modificar índices globales
--                         (auth.uid() IS NULL es el indicador en Supabase)
--   p_tenant_id IS NOT NULL → requiere owner o admin del tenant
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
  v_index_id uuid;
  v_result_id uuid;
BEGIN
  -- ── FIX 5: Autorización explícita ──────────────────────────────────────────
  IF p_tenant_id IS NULL THEN
    -- Índices globales: solo service_role (auth.uid() IS NULL en Supabase para service_role)
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'FORBIDDEN: índices globales solo pueden modificarse con service_role'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    -- Índices privados: requiere owner o admin del tenant
    IF NOT is_org_member_with_role(p_tenant_id, ARRAY['owner','admin']) THEN
      RAISE EXCEPTION 'FORBIDDEN: se requiere rol owner o admin para modificar índices del tenant %', p_tenant_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Resolver index_id por code + scope
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

COMMIT;
