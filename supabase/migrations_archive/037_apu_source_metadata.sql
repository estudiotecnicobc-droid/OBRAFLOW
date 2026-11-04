-- ============================================================
-- MIGRATION 037 — source_metadata en master_tasks
--
-- Agrega columna jsonb nullable para trazabilidad al origen
-- del cómputo cuando el APU fue generado desde la calculadora
-- Chandías.
--
-- No afecta ningún APU existente (columna nullable).
-- No requiere cambio en RLS.
-- IDEMPOTENTE: IF NOT EXISTS.
-- ============================================================

ALTER TABLE public.master_tasks
  ADD COLUMN IF NOT EXISTS source_metadata jsonb;

COMMENT ON COLUMN public.master_tasks.source_metadata IS
  'Trazabilidad al cómputo origen. '
  'Campo: { source, catalogTaskId, catalogTaskName, catalogTaskUnit, '
  'totalQuantity, itemCount, inputItems[], steelDiameterMm?, snapshotDate }. '
  'Presente solo en APUs generados desde la calculadora Chandías.';
