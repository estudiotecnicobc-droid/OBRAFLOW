-- =============================================================================
-- Migration 056: Add commercial_unit and conversion_factor to catalog_task_yields
-- Fecha: 2026-05-25
--
-- Root cause fix:
--   The RPC calculate_consolidated_resources (PATH B) references:
--     cty.conversion_factor  →  catalog_task_yields.conversion_factor
--     cty.commercial_unit    →  catalog_task_yields.commercial_unit
--   These columns were never added to catalog_task_yields.
--
--   History of the gap:
--     · Migration 003 added them to resources + task_yields
--     · Migration 017 added commercial_unit to master_task_materials
--     · catalog_task_yields was missed throughout
--
--   Result: RPC fails at runtime with "column cty.conversion_factor does not exist",
--   which triggered the false "falta ejecutar migración 017" frontend message.
--
-- Safe: ADD COLUMN IF NOT EXISTS, DO block constraint check — fully idempotent.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add commercial_unit to catalog_task_yields
-- ---------------------------------------------------------------------------
ALTER TABLE public.catalog_task_yields
  ADD COLUMN IF NOT EXISTS commercial_unit text;

COMMENT ON COLUMN public.catalog_task_yields.commercial_unit IS
  'Override de unidad comercial a nivel de yield de catálogo. '
  'NULL = hereda de resources.commercial_unit del recurso asociado. '
  'Ejemplo: "bolsa 50 kg", "barra 12 m".';

-- ---------------------------------------------------------------------------
-- 2. Add conversion_factor to catalog_task_yields
-- ---------------------------------------------------------------------------
ALTER TABLE public.catalog_task_yields
  ADD COLUMN IF NOT EXISTS conversion_factor numeric(14,6);

COMMENT ON COLUMN public.catalog_task_yields.conversion_factor IS
  'Override de factor de conversión a nivel de yield de catálogo. '
  'NULL = hereda de resources.conversion_factor del recurso asociado. '
  'Debe ser > 0 cuando está definido.';

-- ---------------------------------------------------------------------------
-- 3. Check constraint (idempotente via DO block)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname  = 'cty_conversion_factor_positive'
      AND conrelid = 'public.catalog_task_yields'::regclass
      AND contype  = 'c'
  ) THEN
    ALTER TABLE public.catalog_task_yields
      ADD CONSTRAINT cty_conversion_factor_positive
        CHECK (conversion_factor IS NULL OR conversion_factor > 0);
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Notify PostgREST to reload schema cache
-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
