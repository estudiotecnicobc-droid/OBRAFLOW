-- =============================================================================
-- Migration 008: Cost Versioning & Pricing Layer
-- Tablas: cost_indices · cost_index_values · resource_pricing_rules · resource_cost_snapshots
-- Ajuste: resources (ADD COLUMN current_snapshot_id, pricing_notes)
-- RPCs: get_resource_cost · get_resource_snapshot · generate_monthly_snapshots
-- RLS: multi-tenant via is_org_member() (tenant_id ≡ organization_id del sistema)
-- Nota: tenant_id en nuevas tablas es UUID que referencia public.organizations(id)
-- =============================================================================

BEGIN;

-- =============================================================================
-- 0. HELPERS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Resolución de tenant activo: primero JWT claim, luego session setting.
-- La app debe inyectar organization_id en app_metadata al hacer login/cambio de org.
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF((auth.jwt() -> 'app_metadata' ->> 'organization_id'), '')::uuid,
    NULLIF(current_setting('app.tenant_id', true), '')::uuid
  )
$$;

-- =============================================================================
-- 1. TIPOS / ENUMS
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE public.pricing_rule_type AS ENUM (
    'FIXED_MANUAL',      -- base_cost fijo, se actualiza manualmente
    'DIRECT_IMPORT',     -- costo viene de un batch de importación externo
    'INDEX_MULTIPLIER',  -- base_cost * (indice_actual / indice_base)
    'COMPOSITE_INDEX',   -- suma ponderada de múltiples índices
    'LABOR_FORMULA'      -- tarifa_hora * horas * multiplicador_categoria * factor_indice
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.snapshot_source_type AS ENUM (
    'MANUAL',
    'IMPORT',
    'INDEX_CALCULATION',
    'LABOR_CALCULATION',
    'COMPOSITE_CALCULATION',
    'FALLBACK_BASE_COST'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.index_frequency AS ENUM (
    'MONTHLY',
    'QUARTERLY',
    'ANNUAL',
    'IRREGULAR'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- 2. cost_indices
-- tenant_id IS NULL  → índice oficial global (CAC, IPC, ICC, UOCRA…)
-- tenant_id = UUID   → índice personalizado de la organización
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cost_indices (
  id          uuid                   PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid                   REFERENCES public.organizations(id) ON DELETE CASCADE,
  code        text                   NOT NULL,
  name        text                   NOT NULL,
  category    text,                  -- 'MATERIALS' | 'LABOR' | 'EQUIPMENT' | 'GENERAL'
  provider    text,                  -- 'INDEC' | 'UOCRA' | 'CAMARCO' | 'CUSTOM'
  frequency   public.index_frequency NOT NULL DEFAULT 'MONTHLY',
  description text,
  is_active   boolean                NOT NULL DEFAULT true,
  metadata    jsonb                  NOT NULL DEFAULT '{}',
  created_at  timestamptz            NOT NULL DEFAULT now(),
  updated_at  timestamptz            NOT NULL DEFAULT now()
);

-- Unicidad: un código no puede repetirse dentro del mismo scope (global o por-org)
CREATE UNIQUE INDEX IF NOT EXISTS cost_indices_global_code_uidx
  ON public.cost_indices (code)
  WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cost_indices_tenant_code_uidx
  ON public.cost_indices (tenant_id, code)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cost_indices_tenant_active_idx
  ON public.cost_indices (tenant_id, is_active);

CREATE TRIGGER cost_indices_updated_at
  BEFORE UPDATE ON public.cost_indices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE  public.cost_indices IS 'Índices de costo (CAC, IPC, ICC…). tenant_id NULL = oficial global.';
COMMENT ON COLUMN public.cost_indices.metadata IS '{"base_year":2016,"base_month":1,"unit":"pesos","url":"..."}';

-- =============================================================================
-- 3. cost_index_values
-- Valores mensuales de cada índice. Inmutables una vez publicados.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cost_index_values (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  index_id         uuid          NOT NULL REFERENCES public.cost_indices(id) ON DELETE CASCADE,
  period_year      smallint      NOT NULL CHECK (period_year  BETWEEN 2000 AND 2100),
  period_month     smallint      NOT NULL CHECK (period_month BETWEEN 1    AND 12),
  value            numeric(18,6) NOT NULL CHECK (value > 0),
  variation_pct    numeric(8,4),   -- variación vs. mes anterior, calculada por trigger
  published_at     date,
  source_reference text,           -- URL, boletín, resolución oficial, etc.
  metadata         jsonb         NOT NULL DEFAULT '{}',
  created_at       timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT cost_index_values_period_unique
    UNIQUE (index_id, period_year, period_month)
);

CREATE INDEX IF NOT EXISTS cost_index_values_index_period_idx
  ON public.cost_index_values (index_id, period_year DESC, period_month DESC);

-- Trigger: calcula variation_pct automáticamente al insertar
CREATE OR REPLACE FUNCTION public.calc_index_variation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev numeric;
BEGIN
  SELECT value INTO v_prev
  FROM public.cost_index_values
  WHERE index_id     = NEW.index_id
    AND (period_year * 12 + period_month)
      = (NEW.period_year * 12 + NEW.period_month) - 1;

  IF v_prev IS NOT NULL AND v_prev <> 0 THEN
    NEW.variation_pct := ROUND(((NEW.value - v_prev) / v_prev) * 100, 4);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cost_index_values_calc_variation
  BEFORE INSERT ON public.cost_index_values
  FOR EACH ROW EXECUTE FUNCTION public.calc_index_variation();

COMMENT ON TABLE  public.cost_index_values IS 'Valores mensuales históricos por índice. No modificar una vez publicados.';
COMMENT ON COLUMN public.cost_index_values.variation_pct IS 'Variación % respecto al mes anterior. Calculada automáticamente por trigger.';

-- =============================================================================
-- 4. resource_pricing_rules
-- Define cómo se calcula el costo de un recurso al generar snapshots.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.resource_pricing_rules (
  id             uuid                     PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid                     NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  resource_id    uuid                     NOT NULL REFERENCES public.resources(id)     ON DELETE CASCADE,
  rule_name      text                     NOT NULL,
  rule_type      public.pricing_rule_type NOT NULL,

  -- Índice base para INDEX_MULTIPLIER, COMPOSITE_INDEX y LABOR_FORMULA
  index_id       uuid      REFERENCES public.cost_indices(id) ON DELETE SET NULL,
  base_date      date,     -- fecha de referencia del base_cost (inicio del cálculo)
  base_cost      numeric(18,4),

  -- Config flexible para reglas complejas
  -- INDEX_MULTIPLIER  : no requiere formula_config
  -- COMPOSITE_INDEX   : {"components":[{"index_id":"uuid","weight":0.7,"base_period":{"year":2024,"month":1}},…]}
  -- LABOR_FORMULA     : {"base_hourly_rate":1500,"hours_per_unit":8,"category_multiplier":1.15,
  --                       "index_id":"uuid","base_period":{"year":2024,"month":1}}
  formula_config jsonb     NOT NULL DEFAULT '{}',

  is_active      boolean   NOT NULL DEFAULT true,
  priority       smallint  NOT NULL DEFAULT 0,  -- mayor valor = mayor precedencia cuando hay múltiples reglas activas
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT resource_pricing_rules_type_check CHECK (
       (rule_type = 'FIXED_MANUAL'    AND base_cost IS NOT NULL)
    OR (rule_type = 'DIRECT_IMPORT')
    OR (rule_type = 'INDEX_MULTIPLIER'
        AND index_id IS NOT NULL AND base_date IS NOT NULL AND base_cost IS NOT NULL)
    OR (rule_type = 'COMPOSITE_INDEX'
        AND jsonb_typeof(formula_config -> 'components') = 'array')
    OR (rule_type = 'LABOR_FORMULA'
        AND base_cost IS NOT NULL
        AND formula_config ? 'base_hourly_rate')
  )
);

-- Índice clave: obtener la regla de mayor prioridad activa por recurso
CREATE INDEX IF NOT EXISTS resource_pricing_rules_lookup_idx
  ON public.resource_pricing_rules (tenant_id, resource_id, is_active, priority DESC);

CREATE INDEX IF NOT EXISTS resource_pricing_rules_index_fk_idx
  ON public.resource_pricing_rules (index_id)
  WHERE index_id IS NOT NULL;

CREATE TRIGGER resource_pricing_rules_updated_at
  BEFORE UPDATE ON public.resource_pricing_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE  public.resource_pricing_rules IS 'Regla activa de pricing por recurso. Define estrategia de cálculo al generar snapshots.';
COMMENT ON COLUMN public.resource_pricing_rules.priority IS 'A mayor valor, mayor precedencia. Solo la regla de mayor prioridad activa aplica.';
COMMENT ON COLUMN public.resource_pricing_rules.formula_config IS
  'Config para COMPOSITE_INDEX y LABOR_FORMULA. Ver comentario de tabla para estructura.';

-- =============================================================================
-- 5. resource_cost_snapshots
-- Histórico inmutable de costos calculados. NO se modifican; se crean nuevos.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.resource_cost_snapshots (
  id                  uuid                       PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid                       NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  resource_id         uuid                       NOT NULL REFERENCES public.resources(id)     ON DELETE CASCADE,
  effective_date      date                       NOT NULL,  -- primer día del mes para snapshots mensuales
  cost                numeric(18,4)              NOT NULL CHECK (cost >= 0),
  currency            char(3)                    NOT NULL DEFAULT 'ARS',
  source_type         public.snapshot_source_type NOT NULL,
  source_reference    text,        -- import_batch_id, URL, "Manual Marzo 2026", etc.
  pricing_rule_id     uuid         REFERENCES public.resource_pricing_rules(id) ON DELETE SET NULL,

  -- Trazabilidad del cálculo
  index_id            uuid         REFERENCES public.cost_indices(id) ON DELETE SET NULL,
  index_base_value    numeric(18,6),  -- valor del índice en base_date de la regla
  index_current_value numeric(18,6),  -- valor del índice en effective_date
  adjustment_factor   numeric(12,6),  -- index_current_value / index_base_value

  metadata            jsonb        NOT NULL DEFAULT '{}',
  created_at          timestamptz  NOT NULL DEFAULT now(),

  -- Un snapshot por tipo de fuente por recurso por fecha
  CONSTRAINT resource_cost_snapshots_unique
    UNIQUE (tenant_id, resource_id, effective_date, source_type)
);

-- Índice crítico para get_resource_cost (lookup por tenant+resource+fecha)
CREATE INDEX IF NOT EXISTS resource_cost_snapshots_lookup_idx
  ON public.resource_cost_snapshots (tenant_id, resource_id, effective_date DESC, created_at DESC);

-- Índice para consultas por período (generar informe de base de costos)
CREATE INDEX IF NOT EXISTS resource_cost_snapshots_period_idx
  ON public.resource_cost_snapshots (tenant_id, effective_date);

CREATE INDEX IF NOT EXISTS resource_cost_snapshots_rule_idx
  ON public.resource_cost_snapshots (pricing_rule_id)
  WHERE pricing_rule_id IS NOT NULL;

COMMENT ON TABLE  public.resource_cost_snapshots IS
  'Histórico inmutable de costos por recurso. Nunca modificar: crear nuevo snapshot si hay corrección.';
COMMENT ON COLUMN public.resource_cost_snapshots.adjustment_factor IS
  'Factor aplicado: index_current / index_base. cost = rule.base_cost * adjustment_factor.';
COMMENT ON COLUMN public.resource_cost_snapshots.metadata IS
  '{"generated_by":"generate_monthly_snapshots","rule_name":"...","notes":"CAC Ene 2026"}';

-- =============================================================================
-- 6. AJUSTE resources
-- current_snapshot_id: caché del snapshot más reciente (desnormalizado, solo lectura).
-- La fuente de verdad sigue siendo resource_cost_snapshots.
-- =============================================================================

ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS current_snapshot_id uuid
    REFERENCES public.resource_cost_snapshots(id) ON DELETE SET NULL;

ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS pricing_notes text;

COMMENT ON COLUMN public.resources.current_snapshot_id IS
  'FK al snapshot más reciente. Caché de lectura rápida. Fuente de verdad = resource_cost_snapshots.';
COMMENT ON COLUMN public.resources.base_cost IS
  'Costo de referencia / fallback si no existe snapshot vigente para la fecha solicitada.';

-- =============================================================================
-- 7. RLS
-- =============================================================================

-- ── cost_indices ─────────────────────────────────────────────────────────────

ALTER TABLE public.cost_indices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cost_indices_select_global"  ON public.cost_indices;
DROP POLICY IF EXISTS "cost_indices_select_private" ON public.cost_indices;
DROP POLICY IF EXISTS "cost_indices_insert"          ON public.cost_indices;
DROP POLICY IF EXISTS "cost_indices_update"          ON public.cost_indices;
DROP POLICY IF EXISTS "cost_indices_delete"          ON public.cost_indices;

-- Índices globales (oficiales): cualquier autenticado puede leer
CREATE POLICY "cost_indices_select_global" ON public.cost_indices
  FOR SELECT TO authenticated
  USING (tenant_id IS NULL);

-- Índices privados de la org: solo miembros
CREATE POLICY "cost_indices_select_private" ON public.cost_indices
  FOR SELECT TO authenticated
  USING (tenant_id IS NOT NULL AND is_org_member(tenant_id));

-- Crear índices propios: solo editor/admin/owner
CREATE POLICY "cost_indices_insert" ON public.cost_indices
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id IS NOT NULL
    AND is_org_member_with_role(tenant_id, ARRAY['owner','admin','editor'])
  );

-- Los índices globales solo los edita service_role (fuera de RLS)
CREATE POLICY "cost_indices_update" ON public.cost_indices
  FOR UPDATE TO authenticated
  USING  (tenant_id IS NOT NULL AND is_org_member_with_role(tenant_id, ARRAY['owner','admin']))
  WITH CHECK (tenant_id IS NOT NULL AND is_org_member_with_role(tenant_id, ARRAY['owner','admin']));

CREATE POLICY "cost_indices_delete" ON public.cost_indices
  FOR DELETE TO authenticated
  USING (tenant_id IS NOT NULL AND is_org_member_with_role(tenant_id, ARRAY['owner','admin']));

-- ── cost_index_values ────────────────────────────────────────────────────────

ALTER TABLE public.cost_index_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cost_index_values_select" ON public.cost_index_values;
DROP POLICY IF EXISTS "cost_index_values_insert" ON public.cost_index_values;
DROP POLICY IF EXISTS "cost_index_values_update" ON public.cost_index_values;
DROP POLICY IF EXISTS "cost_index_values_delete" ON public.cost_index_values;

-- Lectura: visible si el índice padre es global o del tenant
CREATE POLICY "cost_index_values_select" ON public.cost_index_values
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cost_indices ci
      WHERE ci.id = index_id
        AND (ci.tenant_id IS NULL OR is_org_member(ci.tenant_id))
    )
  );

-- Escritura: solo en índices privados del tenant (los globales = service_role)
CREATE POLICY "cost_index_values_insert" ON public.cost_index_values
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cost_indices ci
      WHERE ci.id = index_id
        AND ci.tenant_id IS NOT NULL
        AND is_org_member_with_role(ci.tenant_id, ARRAY['owner','admin','editor'])
    )
  );

CREATE POLICY "cost_index_values_update" ON public.cost_index_values
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cost_indices ci
      WHERE ci.id = index_id
        AND ci.tenant_id IS NOT NULL
        AND is_org_member_with_role(ci.tenant_id, ARRAY['owner','admin'])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cost_indices ci
      WHERE ci.id = index_id
        AND ci.tenant_id IS NOT NULL
        AND is_org_member_with_role(ci.tenant_id, ARRAY['owner','admin'])
    )
  );

CREATE POLICY "cost_index_values_delete" ON public.cost_index_values
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cost_indices ci
      WHERE ci.id = index_id
        AND ci.tenant_id IS NOT NULL
        AND is_org_member_with_role(ci.tenant_id, ARRAY['owner','admin'])
    )
  );

-- ── resource_pricing_rules ───────────────────────────────────────────────────

ALTER TABLE public.resource_pricing_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "resource_pricing_rules_select" ON public.resource_pricing_rules;
DROP POLICY IF EXISTS "resource_pricing_rules_insert" ON public.resource_pricing_rules;
DROP POLICY IF EXISTS "resource_pricing_rules_update" ON public.resource_pricing_rules;
DROP POLICY IF EXISTS "resource_pricing_rules_delete" ON public.resource_pricing_rules;

CREATE POLICY "resource_pricing_rules_select" ON public.resource_pricing_rules
  FOR SELECT TO authenticated
  USING (is_org_member(tenant_id));

CREATE POLICY "resource_pricing_rules_insert" ON public.resource_pricing_rules
  FOR INSERT TO authenticated
  WITH CHECK (is_org_member_with_role(tenant_id, ARRAY['owner','admin','editor']));

CREATE POLICY "resource_pricing_rules_update" ON public.resource_pricing_rules
  FOR UPDATE TO authenticated
  USING  (is_org_member_with_role(tenant_id, ARRAY['owner','admin','editor']))
  WITH CHECK (is_org_member_with_role(tenant_id, ARRAY['owner','admin','editor']));

CREATE POLICY "resource_pricing_rules_delete" ON public.resource_pricing_rules
  FOR DELETE TO authenticated
  USING (is_org_member_with_role(tenant_id, ARRAY['owner','admin']));

-- ── resource_cost_snapshots ──────────────────────────────────────────────────

ALTER TABLE public.resource_cost_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "resource_cost_snapshots_select" ON public.resource_cost_snapshots;
DROP POLICY IF EXISTS "resource_cost_snapshots_insert" ON public.resource_cost_snapshots;
DROP POLICY IF EXISTS "resource_cost_snapshots_delete" ON public.resource_cost_snapshots;
-- No hay UPDATE policy: los snapshots son inmutables.

CREATE POLICY "resource_cost_snapshots_select" ON public.resource_cost_snapshots
  FOR SELECT TO authenticated
  USING (is_org_member(tenant_id));

-- Generación de snapshots: normalmente vía RPC SECURITY DEFINER, pero permitimos a editor+
CREATE POLICY "resource_cost_snapshots_insert" ON public.resource_cost_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (is_org_member_with_role(tenant_id, ARRAY['owner','admin','editor']));

CREATE POLICY "resource_cost_snapshots_delete" ON public.resource_cost_snapshots
  FOR DELETE TO authenticated
  USING (is_org_member_with_role(tenant_id, ARRAY['owner','admin']));

-- =============================================================================
-- 8. RPCs
-- =============================================================================

-- ── 8a. get_resource_cost ─────────────────────────────────────────────────────
-- Retorna el costo vigente de un recurso para una fecha dada.
-- Fallback a resources.base_cost si no hay snapshot.

CREATE OR REPLACE FUNCTION public.get_resource_cost(
  p_resource_id uuid,
  p_tenant_id   uuid,
  p_date        date DEFAULT CURRENT_DATE
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT cost
      FROM public.resource_cost_snapshots
      WHERE tenant_id    = p_tenant_id
        AND resource_id  = p_resource_id
        AND effective_date <= p_date
      ORDER BY effective_date DESC, created_at DESC
      LIMIT 1
    ),
    (SELECT base_cost FROM public.resources WHERE id = p_resource_id)
  )
$$;

-- ── 8b. get_resource_snapshot ────────────────────────────────────────────────
-- Retorna el snapshot completo (con trazabilidad) más cercano a p_date.

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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Caso normal: snapshot existente
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
  LIMIT 1

  UNION ALL

  -- Fallback: no existe snapshot, devuelve base_cost con flag is_fallback = true
  SELECT
    NULL::uuid, r.id, NULL::date, r.base_cost, 'ARS'::char(3),
    'FALLBACK_BASE_COST'::public.snapshot_source_type,
    NULL, NULL::uuid, NULL::uuid,
    NULL::numeric, NULL::numeric, NULL::numeric,
    '{"fallback":true}'::jsonb, true
  FROM public.resources r
  WHERE r.id = p_resource_id
    AND NOT EXISTS (
      SELECT 1 FROM public.resource_cost_snapshots s2
      WHERE s2.tenant_id    = p_tenant_id
        AND s2.resource_id  = p_resource_id
        AND s2.effective_date <= p_date
    )
  LIMIT 1
$$;

-- ── 8c. generate_monthly_snapshots ───────────────────────────────────────────
-- Genera snapshots para todas las reglas activas del tenant en un período.
-- Retorna una fila por recurso con status: 'created' | 'skipped' | 'error: ...'
-- p_overwrite = true reemplaza snapshots ya existentes del período.

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

    -- Saltar si ya existe y no se quiere sobreescribir
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
        status := 'error: índice sin valor para el período';
        RETURN NEXT; CONTINUE;
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
        v_comp_row    := v_comps -> v_i;
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

    -- ── Insertar snapshot ────────────────────────────────────────────────────
    IF v_cost IS NOT NULL THEN
      INSERT INTO public.resource_cost_snapshots (
        tenant_id, resource_id, effective_date, cost, currency,
        source_type, pricing_rule_id, index_id,
        index_base_value, index_current_value, adjustment_factor,
        metadata
      ) VALUES (
        p_tenant_id,
        v_rule.resource_id,
        v_eff_date,
        v_cost,
        'ARS',
        v_src,
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

      -- Actualiza caché en resources si el snapshot es igual o posterior al actual
      UPDATE public.resources r
      SET current_snapshot_id = (
        SELECT id FROM public.resource_cost_snapshots
        WHERE tenant_id    = p_tenant_id
          AND resource_id  = v_rule.resource_id
          AND effective_date <= CURRENT_DATE
        ORDER BY effective_date DESC, created_at DESC
        LIMIT 1
      )
      WHERE r.id = v_rule.resource_id;
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

-- ── 8d. upsert_index_value ────────────────────────────────────────────────────
-- Carga o actualiza el valor mensual de un índice (por code o id).

CREATE OR REPLACE FUNCTION public.upsert_index_value(
  p_index_code     text,
  p_year           smallint,
  p_month          smallint,
  p_value          numeric,
  p_published_at   date    DEFAULT NULL,
  p_source_ref     text    DEFAULT NULL,
  p_tenant_id      uuid    DEFAULT NULL   -- NULL = índice global (requiere service_role)
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_index_id uuid;
  v_snap_id  uuid;
BEGIN
  SELECT id INTO v_index_id
  FROM public.cost_indices
  WHERE code = p_index_code
    AND (
      (p_tenant_id IS NULL AND tenant_id IS NULL) OR
      tenant_id = p_tenant_id
    )
  LIMIT 1;

  IF v_index_id IS NULL THEN
    RAISE EXCEPTION 'Índice no encontrado: code=%, tenant=%', p_index_code, p_tenant_id;
  END IF;

  INSERT INTO public.cost_index_values
    (index_id, period_year, period_month, value, published_at, source_reference)
  VALUES
    (v_index_id, p_year, p_month, p_value, p_published_at, p_source_ref)
  ON CONFLICT (index_id, period_year, period_month)
  DO UPDATE SET
    value            = EXCLUDED.value,
    published_at     = COALESCE(EXCLUDED.published_at, cost_index_values.published_at),
    source_reference = COALESCE(EXCLUDED.source_reference, cost_index_values.source_reference)
  RETURNING id INTO v_snap_id;

  RETURN v_snap_id;
END;
$$;

-- =============================================================================
-- 9. SEEDS: índices oficiales globales (se cargan con service_role)
-- =============================================================================

INSERT INTO public.cost_indices (id, tenant_id, code, name, category, provider, frequency, description)
VALUES
  (gen_random_uuid(), NULL, 'CAC',         'Costo de la Construcción (CAC)',          'GENERAL',   'INDEC',   'MONTHLY', 'Índice general de costos de la construcción — INDEC'),
  (gen_random_uuid(), NULL, 'ICC',         'Índice del Costo de la Construcción',     'GENERAL',   'CAMARCO', 'MONTHLY', 'ICC elaborado por CAMARCO'),
  (gen_random_uuid(), NULL, 'IPC',         'Índice de Precios al Consumidor',         'GENERAL',   'INDEC',   'MONTHLY', 'IPC Nacional — INDEC'),
  (gen_random_uuid(), NULL, 'UOCRA',       'Índice Salarial UOCRA Oficial',           'LABOR',     'UOCRA',   'MONTHLY', 'Escala salarial oficial UOCRA — Oficial Albañil'),
  (gen_random_uuid(), NULL, 'UOCRA_AYU',   'Índice Salarial UOCRA Ayudante',          'LABOR',     'UOCRA',   'MONTHLY', 'Escala salarial oficial UOCRA — Ayudante'),
  (gen_random_uuid(), NULL, 'CAC_MAT',     'CAC — Componente Materiales',             'MATERIALS', 'INDEC',   'MONTHLY', 'Sub-índice materiales del CAC'),
  (gen_random_uuid(), NULL, 'CAC_MO',      'CAC — Componente Mano de Obra',           'LABOR',     'INDEC',   'MONTHLY', 'Sub-índice mano de obra del CAC'),
  (gen_random_uuid(), NULL, 'CAC_EQ',      'CAC — Componente Equipos y Gastos',       'EQUIPMENT', 'INDEC',   'MONTHLY', 'Sub-índice equipos y gastos generales del CAC')
ON CONFLICT DO NOTHING;

COMMIT;
