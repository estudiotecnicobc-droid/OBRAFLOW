-- =============================================================================
-- 008a — Cost Versioning: Tablas
-- =============================================================================
-- QUÉ HACE: crea enums, 4 tablas, índices, triggers de timestamps y ALTER resources.
-- PREREQUISITOS: ninguno (primer archivo de la serie).
-- IDEMPOTENTE: sí (IF NOT EXISTS / DO $$ EXCEPTION $$).
-- VERIFICAR DESPUÉS:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--     AND table_name IN ('cost_indices','cost_index_values',
--                        'resource_pricing_rules','resource_cost_snapshots');
--   -- Debe devolver 4 filas.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 0. HELPERS DE TIMESTAMPS
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

-- Función legacy — se mantiene por compatibilidad con código existente.
-- Devuelve el tenant activo desde JWT app_metadata o session setting.
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
-- 1. ENUMS
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE public.pricing_rule_type AS ENUM (
    'FIXED_MANUAL',
    'DIRECT_IMPORT',
    'INDEX_MULTIPLIER',
    'COMPOSITE_INDEX',
    'LABOR_FORMULA'
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
  category    text,
  provider    text,
  frequency   public.index_frequency NOT NULL DEFAULT 'MONTHLY',
  description text,
  is_active   boolean                NOT NULL DEFAULT true,
  metadata    jsonb                  NOT NULL DEFAULT '{}',
  created_at  timestamptz            NOT NULL DEFAULT now(),
  updated_at  timestamptz            NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cost_indices_global_code_uidx
  ON public.cost_indices (code) WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS cost_indices_tenant_code_uidx
  ON public.cost_indices (tenant_id, code) WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cost_indices_tenant_active_idx
  ON public.cost_indices (tenant_id, is_active);

DROP TRIGGER IF EXISTS cost_indices_updated_at ON public.cost_indices;
CREATE TRIGGER cost_indices_updated_at
  BEFORE UPDATE ON public.cost_indices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE  public.cost_indices IS 'Índices de costo (CAC, IPC, ICC…). tenant_id NULL = oficial global.';

-- =============================================================================
-- 3. cost_index_values + trigger de variación
-- =============================================================================

-- Función del trigger: calcula variation_pct al insertar
CREATE OR REPLACE FUNCTION public.calc_index_variation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev numeric;
BEGIN
  SELECT value INTO v_prev
  FROM public.cost_index_values
  WHERE index_id = NEW.index_id
    AND (period_year * 12 + period_month) = (NEW.period_year * 12 + NEW.period_month) - 1;

  IF v_prev IS NOT NULL AND v_prev <> 0 THEN
    NEW.variation_pct := ROUND(((NEW.value - v_prev) / v_prev) * 100, 4);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.cost_index_values (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  index_id         uuid          NOT NULL REFERENCES public.cost_indices(id) ON DELETE CASCADE,
  period_year      smallint      NOT NULL CHECK (period_year  BETWEEN 2000 AND 2100),
  period_month     smallint      NOT NULL CHECK (period_month BETWEEN 1    AND 12),
  value            numeric(18,6) NOT NULL CHECK (value > 0),
  variation_pct    numeric(8,4),
  published_at     date,
  source_reference text,
  metadata         jsonb         NOT NULL DEFAULT '{}',
  created_at       timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT cost_index_values_period_unique UNIQUE (index_id, period_year, period_month)
);

CREATE INDEX IF NOT EXISTS cost_index_values_index_period_idx
  ON public.cost_index_values (index_id, period_year DESC, period_month DESC);

DROP TRIGGER IF EXISTS cost_index_values_calc_variation ON public.cost_index_values;
CREATE TRIGGER cost_index_values_calc_variation
  BEFORE INSERT ON public.cost_index_values
  FOR EACH ROW EXECUTE FUNCTION public.calc_index_variation();

COMMENT ON TABLE public.cost_index_values IS 'Valores mensuales históricos por índice. No modificar una vez publicados.';

-- =============================================================================
-- 4. resource_pricing_rules
-- Constraint mínimo aquí; constraint endurecido se aplica en 008c.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.resource_pricing_rules (
  id             uuid                     PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid                     NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  resource_id    uuid                     NOT NULL REFERENCES public.resources(id)     ON DELETE CASCADE,
  rule_name      text                     NOT NULL,
  rule_type      public.pricing_rule_type NOT NULL,
  index_id       uuid      REFERENCES public.cost_indices(id) ON DELETE SET NULL,
  base_date      date,
  base_cost      numeric(18,4),
  formula_config jsonb     NOT NULL DEFAULT '{}',
  is_active      boolean   NOT NULL DEFAULT true,
  priority       smallint  NOT NULL DEFAULT 0,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS resource_pricing_rules_lookup_idx
  ON public.resource_pricing_rules (tenant_id, resource_id, is_active, priority DESC);

CREATE INDEX IF NOT EXISTS resource_pricing_rules_index_fk_idx
  ON public.resource_pricing_rules (index_id) WHERE index_id IS NOT NULL;

DROP TRIGGER IF EXISTS resource_pricing_rules_updated_at ON public.resource_pricing_rules;
CREATE TRIGGER resource_pricing_rules_updated_at
  BEFORE UPDATE ON public.resource_pricing_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.resource_pricing_rules IS 'Regla de pricing por recurso. Define estrategia de cálculo al generar snapshots.';

-- =============================================================================
-- 5. resource_cost_snapshots
-- Histórico inmutable. No se modifica: se crean nuevos snapshots.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.resource_cost_snapshots (
  id                  uuid                        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid                        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  resource_id         uuid                        NOT NULL REFERENCES public.resources(id)     ON DELETE CASCADE,
  effective_date      date                        NOT NULL,
  cost                numeric(18,4)               NOT NULL CHECK (cost >= 0),
  currency            char(3)                     NOT NULL DEFAULT 'ARS',
  source_type         public.snapshot_source_type NOT NULL,
  source_reference    text,
  pricing_rule_id     uuid REFERENCES public.resource_pricing_rules(id) ON DELETE SET NULL,
  index_id            uuid REFERENCES public.cost_indices(id) ON DELETE SET NULL,
  index_base_value    numeric(18,6),
  index_current_value numeric(18,6),
  adjustment_factor   numeric(12,6),
  metadata            jsonb NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resource_cost_snapshots_unique
    UNIQUE (tenant_id, resource_id, effective_date, source_type)
);

CREATE INDEX IF NOT EXISTS resource_cost_snapshots_lookup_idx
  ON public.resource_cost_snapshots (tenant_id, resource_id, effective_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS resource_cost_snapshots_period_idx
  ON public.resource_cost_snapshots (tenant_id, effective_date);

CREATE INDEX IF NOT EXISTS resource_cost_snapshots_rule_idx
  ON public.resource_cost_snapshots (pricing_rule_id) WHERE pricing_rule_id IS NOT NULL;

COMMENT ON TABLE public.resource_cost_snapshots IS
  'Histórico inmutable de costos por recurso. Nunca modificar: crear nuevo snapshot para correcciones.';

-- =============================================================================
-- 6. ALTER resources: columnas de caché y notas
-- =============================================================================

ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS current_snapshot_id uuid
    REFERENCES public.resource_cost_snapshots(id) ON DELETE SET NULL;

ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS pricing_notes text;

COMMENT ON COLUMN public.resources.current_snapshot_id IS
  'Caché del snapshot vigente HOY. Mantenido por trigger sync_current_snapshot_cache.';

COMMENT ON COLUMN public.resources.base_cost IS
  'Fallback si no existe snapshot vigente para la fecha solicitada.';

COMMIT;
