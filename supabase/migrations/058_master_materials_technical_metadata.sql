-- =============================================================================
-- Migration 058: Add technical metadata fields to master_materials
-- Fecha: 2026-05-25
--
-- Adds optional technical data for materials:
--   technical_yield      — numeric output per unit (e.g. 12 m² per liter of paint)
--   technical_yield_unit — unit for the yield value (e.g. "m²/l", "kg/m²")
--   technical_notes      — free-text technical observation
--
-- Safe: ADD COLUMN IF NOT EXISTS — fully idempotent.
-- =============================================================================

ALTER TABLE public.master_materials
  ADD COLUMN IF NOT EXISTS technical_yield numeric;

COMMENT ON COLUMN public.master_materials.technical_yield IS
  'Rendimiento técnico del material. Cantidad de unidad producida por unidad del material. '
  'Ejemplo: pintura con technical_yield=12, technical_yield_unit="m²/l" → 1 litro cubre 12 m².';

ALTER TABLE public.master_materials
  ADD COLUMN IF NOT EXISTS technical_yield_unit text;

COMMENT ON COLUMN public.master_materials.technical_yield_unit IS
  'Unidad del rendimiento técnico. Ejemplos: "m²/l", "kg/m²", "ml/un", "m²/rollo", "un/m²".';

ALTER TABLE public.master_materials
  ADD COLUMN IF NOT EXISTS technical_notes text;

COMMENT ON COLUMN public.master_materials.technical_notes IS
  'Observación técnica libre. Notas de aplicación, condiciones de uso, referencias normativas, etc.';

-- ---------------------------------------------------------------------------
-- Notify PostgREST to reload schema cache
-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
