-- ============================================================
-- Migración 014: sort_order en budget_items
-- Fecha: 2026-04-01
-- Tabla afectada: public.budget_items
--
-- Contexto:
--   El presupuesto mostraba ítems ordenados por created_at.
--   No había forma de que el usuario reordenara filas manualmente.
--
-- Estrategia:
--   · ADD COLUMN IF NOT EXISTS — idempotente.
--   · Nullable sin DEFAULT: filas existentes quedan con NULL.
--     listForProject ordena por sort_order NULLS LAST, created_at ASC
--     → comportamiento idéntico al actual hasta que el usuario reordene.
--   · En el primer reordenamiento el frontend asigna valores (10, 20, ...)
--     a todos los ítems del proyecto y persiste el nuevo orden.
-- ============================================================

ALTER TABLE public.budget_items
  ADD COLUMN IF NOT EXISTS sort_order integer;

COMMENT ON COLUMN public.budget_items.sort_order IS
  'Orden de visualización dentro del presupuesto. '
  'NULL = sin orden explícito (se usa created_at). '
  'Los valores son múltiplos de 10 para dejar espacio a inserciones futuras.';
