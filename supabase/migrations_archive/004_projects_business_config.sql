-- ============================================================
-- Migración 004: BusinessConfig — Coeficiente de Pase K
--               en tabla public.projects
-- Fecha: 2026-03-15
-- Tabla afectada: public.projects
--
-- Contexto:
--   El modelo PricingConfig (generalExpensesPercent, etc.) vive
--   solo en TypeScript y nunca llegó a Supabase.
--   El nuevo modelo BusinessConfig (ggd_pct, ggi_pct, profit_pct,
--   tax_pct) es el modelo K real que sí se persiste.
--
-- Estrategia:
--   · ADD COLUMN IF NOT EXISTS — idempotente.
--   · Nullable sin DEFAULT: filas existentes quedan con NULL.
--     El frontend toma DEFAULT_BUSINESS_CONFIG del store cuando
--     el valor de DB es NULL.
--   · numeric(8,6): permite valores entre 0 y 99.999999 con
--     6 decimales (ej: 0.085000 = 8.5%).
--   · No elimina ni renombra nada.
-- ============================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS ggd_pct    numeric(8,6),
  ADD COLUMN IF NOT EXISTS ggi_pct    numeric(8,6),
  ADD COLUMN IF NOT EXISTS profit_pct numeric(8,6),
  ADD COLUMN IF NOT EXISTS tax_pct    numeric(8,6);

-- Check constraints: cuando se definen, deben ser >= 0.
-- Usan bloque DO $$ porque PostgreSQL no soporta
-- ADD CONSTRAINT IF NOT EXISTS para check constraints.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'projects_ggd_pct_non_negative'
      AND conrelid = 'public.projects'::regclass
      AND contype  = 'c'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_ggd_pct_non_negative
        CHECK (ggd_pct IS NULL OR ggd_pct >= 0);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'projects_ggi_pct_non_negative'
      AND conrelid = 'public.projects'::regclass
      AND contype  = 'c'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_ggi_pct_non_negative
        CHECK (ggi_pct IS NULL OR ggi_pct >= 0);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'projects_profit_pct_non_negative'
      AND conrelid = 'public.projects'::regclass
      AND contype  = 'c'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_profit_pct_non_negative
        CHECK (profit_pct IS NULL OR profit_pct >= 0);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'projects_tax_pct_non_negative'
      AND conrelid = 'public.projects'::regclass
      AND contype  = 'c'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_tax_pct_non_negative
        CHECK (tax_pct IS NULL OR tax_pct >= 0);
  END IF;
END;
$$;

-- Comentarios en columnas nuevas
COMMENT ON COLUMN public.projects.ggd_pct IS
  'Gastos Generales Directos — decimal (0.08 = 8%). '
  'NULL = proyecto no tiene BusinessConfig definida; frontend usa DEFAULT_BUSINESS_CONFIG.';

COMMENT ON COLUMN public.projects.ggi_pct IS
  'Gastos Generales Indirectos (incl. financieros) — decimal (0.07 = 7%). '
  'NULL = sin config definida.';

COMMENT ON COLUMN public.projects.profit_pct IS
  'Beneficio / Utilidad — decimal (0.10 = 10%). '
  'Se aplica sobre subtotal (CD + GGD + GGI).';

COMMENT ON COLUMN public.projects.tax_pct IS
  'Impuestos IVA / IIBB — decimal (0.21 = 21%). '
  'Se aplica sobre precio de venta antes de impuestos.';
