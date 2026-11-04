-- ============================================================
-- Migración 003: Controles de Calidad + Unidad Comercial /
--               Factor de Conversión
-- Fecha: 2026-03-14
-- Tablas afectadas:
--   · public.tasks        → quality_controls (jsonb)
--   · public.resources    → commercial_unit, conversion_factor
--   · public.task_yields  → commercial_unit, conversion_factor
-- Estrategia: totalmente idempotente.
--   · ADD COLUMN        → IF NOT EXISTS (soportado en PG 9.6+)
--   · ADD CONSTRAINT    → bloque DO $$ con consulta a pg_constraint
--                         (PostgreSQL NO soporta ADD CONSTRAINT IF NOT EXISTS)
--   · CREATE INDEX      → IF NOT EXISTS (soportado en PG 9.5+)
--   No elimina ni renombra columnas existentes.
--   Compatible con datos actuales (columnas nullable o con DEFAULT).
-- ============================================================


-- ── 1. tasks.quality_controls ────────────────────────────────────────────────
-- NOT NULL + DEFAULT constante: en PG 11+ es operación de solo metadatos,
-- sin rewrite de tabla. Las filas existentes reciben el DEFAULT automáticamente.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS quality_controls jsonb
    NOT NULL
    DEFAULT '{"reception": [], "execution": [], "notes": null}'::jsonb;

-- Check: rechaza cualquier valor que no sea un objeto JSON
-- (bloquea arrays, strings, números en el nivel de DB).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname      = 'tasks_quality_controls_is_object'
      AND conrelid     = 'public.tasks'::regclass
      AND contype      = 'c'
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_quality_controls_is_object
        CHECK (jsonb_typeof(quality_controls) = 'object');
  END IF;
END;
$$;

COMMENT ON COLUMN public.tasks.quality_controls IS
  'Controles de calidad asociados a la tarea. '
  'Estructura: {"reception": [...], "execution": [...], "notes": string|null}. '
  'reception  = controles en recepción/acopio de materiales; '
  'execution  = controles durante la ejecución en obra; '
  'notes      = observaciones libres de calidad.';

-- Índice GIN: permite queries eficientes del tipo
--   WHERE quality_controls @> '{"reception": [...]}'
--   WHERE quality_controls ? 'clave'
CREATE INDEX IF NOT EXISTS idx_tasks_quality_controls_gin
  ON public.tasks USING gin (quality_controls);


-- ── 2. resources: unidad comercial + factor de conversión ────────────────────
-- Ambas columnas nullable: no rompe filas existentes.
-- La correlación commercial_unit ↔ conversion_factor se valida en la capa
-- de servicio para mantener flexibilidad en cargas parciales.

ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS commercial_unit text;

ALTER TABLE public.resources
  ADD COLUMN IF NOT EXISTS conversion_factor numeric(14,6);

-- Check: conversion_factor debe ser estrictamente positivo si está definido.
-- NULL es válido (sin conversión definida / relación 1:1 implícita).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname      = 'resources_conversion_factor_positive'
      AND conrelid     = 'public.resources'::regclass
      AND contype      = 'c'
  ) THEN
    ALTER TABLE public.resources
      ADD CONSTRAINT resources_conversion_factor_positive
        CHECK (conversion_factor IS NULL OR conversion_factor > 0);
  END IF;
END;
$$;

-- Enriquecemos el comentario de 'unit' para dejar claro el rol
-- de cada campo en el contexto del nuevo par comercial.
COMMENT ON COLUMN public.resources.unit IS
  'Unidad técnica/base del recurso: la que se usa en todos los cálculos '
  'internos de rendimientos y costos. Ejemplos: kg, m3, hh, hora, m2.';

COMMENT ON COLUMN public.resources.commercial_unit IS
  'Unidad de compra o comercial del recurso. NULL = la unidad comercial '
  'es idéntica a la unidad base (unit). '
  'Ejemplos: bolsa_50kg, litro, caja_x10, rollo_50m.';

COMMENT ON COLUMN public.resources.conversion_factor IS
  'Cuántas unidades base (unit) contiene 1 unidad comercial (commercial_unit). '
  'Debe ser > 0 cuando está definido. NULL si no aplica o si la relación es 1:1. '
  'Ejemplo: unit = kg, commercial_unit = bolsa_50kg → conversion_factor = 50. '
  'Fórmula: cantidad_comercial = cantidad_base / conversion_factor.';


-- ── 3. task_yields: unidad comercial + factor de conversión ──────────────────
-- Override a nivel de yield individual.
-- Semántica: NULL = heredar el valor del recurso asociado (resources).
-- Cubre el caso donde el mismo recurso se compra en distintas presentaciones
-- según el contexto de cada tarea.

ALTER TABLE public.task_yields
  ADD COLUMN IF NOT EXISTS commercial_unit text;

ALTER TABLE public.task_yields
  ADD COLUMN IF NOT EXISTS conversion_factor numeric(14,6);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname      = 'task_yields_conversion_factor_positive'
      AND conrelid     = 'public.task_yields'::regclass
      AND contype      = 'c'
  ) THEN
    ALTER TABLE public.task_yields
      ADD CONSTRAINT task_yields_conversion_factor_positive
        CHECK (conversion_factor IS NULL OR conversion_factor > 0);
  END IF;
END;
$$;

COMMENT ON COLUMN public.task_yields.commercial_unit IS
  'Override de unidad comercial a nivel de yield. '
  'NULL = hereda de resources.commercial_unit del recurso asociado.';

COMMENT ON COLUMN public.task_yields.conversion_factor IS
  'Override de factor de conversión a nivel de yield. Debe ser > 0 si definido. '
  'NULL = hereda de resources.conversion_factor del recurso asociado. '
  'Fórmula: cantidad_comercial = quantity / conversion_factor.';
