-- ============================================================
-- Migración 021: Agrega commercial_unit y conversion_factor
--               a las tablas materials y master_materials.
-- Fecha: 2026-04-13
-- Seguro: ADD COLUMN IF NOT EXISTS; no toca datos existentes.
-- Propósito:
--   · materials y master_materials son los catálogos editables de la org.
--   · La unidad comercial (ej: "bolsa 50 kg") y el factor de conversión
--     (ej: 50 kg/bolsa) permiten mostrar cuántas unidades comerciales
--     comprar a partir de la cantidad técnica calculada.
--   · Los servicios TypeScript ya leen estas columnas (materialFromRow,
--     masterMaterialsService.fromRow) — de forma segura si no existen.
--   · Esta migración hace que los datos persistan y que los paneles de
--     edición los puedan guardar en el futuro.
-- ============================================================

-- ── materials ────────────────────────────────────────────────────────────────

ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS commercial_unit    TEXT,
  ADD COLUMN IF NOT EXISTS conversion_factor  NUMERIC CHECK (conversion_factor > 0);

COMMENT ON COLUMN public.materials.commercial_unit IS
  'Etiqueta de la unidad de compra. Ej: "bolsa 50 kg", "barra 12 m".';

COMMENT ON COLUMN public.materials.conversion_factor IS
  'Cuántas unidades técnicas hay en 1 unidad comercial. '
  'Ej: bolsa 50 kg → conversion_factor = 50. '
  'Fórmula: qty_compra = CEIL(qty_tecnica / conversion_factor).';

-- Constraint: si se carga commercial_unit, el factor es obligatorio
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mat_commercial_unit_requires_factor'
      AND conrelid = 'public.materials'::regclass
  ) THEN
    ALTER TABLE public.materials
      ADD CONSTRAINT mat_commercial_unit_requires_factor
        CHECK (commercial_unit IS NULL OR conversion_factor IS NOT NULL);
  END IF;
END $$;

-- ── master_materials ─────────────────────────────────────────────────────────

ALTER TABLE public.master_materials
  ADD COLUMN IF NOT EXISTS commercial_unit    TEXT,
  ADD COLUMN IF NOT EXISTS conversion_factor  NUMERIC CHECK (conversion_factor > 0);

COMMENT ON COLUMN public.master_materials.commercial_unit IS
  'Etiqueta de la unidad de compra. Ej: "bolsa 50 kg", "barra 12 m".';

COMMENT ON COLUMN public.master_materials.conversion_factor IS
  'Cuántas unidades técnicas hay en 1 unidad comercial. '
  'Ej: bolsa 50 kg → conversion_factor = 50. '
  'Fórmula: qty_compra = CEIL(qty_tecnica / conversion_factor).';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mm_commercial_unit_requires_factor'
      AND conrelid = 'public.master_materials'::regclass
  ) THEN
    ALTER TABLE public.master_materials
      ADD CONSTRAINT mm_commercial_unit_requires_factor
        CHECK (commercial_unit IS NULL OR conversion_factor IS NOT NULL);
  END IF;
END $$;
