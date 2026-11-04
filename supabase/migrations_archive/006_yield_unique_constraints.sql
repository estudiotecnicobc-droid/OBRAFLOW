-- ============================================================
-- Migración 006: UNIQUE constraints en tablas de yields
--               + DEFAULT defensivo en budget_items.dependencies
-- Fecha: 2026-03-15
--
-- Problema:
--   tasksService.upsertYield/upsertLaborYield/upsertToolYield usan
--   supabase.upsert({ onConflict: 'col_a,col_b' }), lo que mapea a
--   INSERT ... ON CONFLICT (col_a, col_b) DO UPDATE.
--   PostgreSQL requiere un UNIQUE constraint o PRIMARY KEY exacto
--   sobre esas columnas para que ON CONFLICT funcione.
--   Las tres tablas no tenían ese constraint → error 42P10.
--
-- Estrategia: totalmente idempotente.
--   · Cada ALTER TABLE ADD CONSTRAINT está envuelta en DO $$
--     con consulta a pg_constraint (PG no soporta
--     ADD CONSTRAINT IF NOT EXISTS para UNIQUE).
--   · Si ya existen filas duplicadas en alguna tabla, la migración
--     fallará con "could not create unique index". En ese caso,
--     ejecutar primero el script de limpieza del comentario al final.
-- ============================================================


-- ── 1. task_yields: UNIQUE (task_id, material_id) ────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname   = 'task_yields_task_material_unique'
      AND conrelid  = 'public.task_yields'::regclass
      AND contype   IN ('u', 'p')   -- unique o primary key
  ) THEN
    ALTER TABLE public.task_yields
      ADD CONSTRAINT task_yields_task_material_unique
        UNIQUE (task_id, material_id);
  END IF;
END;
$$;

COMMENT ON CONSTRAINT task_yields_task_material_unique ON public.task_yields IS
  'Garantiza que un mismo material no se repita en los rendimientos de una tarea. '
  'Requerido por tasksService.upsertYield (ON CONFLICT DO UPDATE).';


-- ── 2. task_labor_yields: UNIQUE (task_id, labor_category_id) ───────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname   = 'task_labor_yields_task_labor_unique'
      AND conrelid  = 'public.task_labor_yields'::regclass
      AND contype   IN ('u', 'p')
  ) THEN
    ALTER TABLE public.task_labor_yields
      ADD CONSTRAINT task_labor_yields_task_labor_unique
        UNIQUE (task_id, labor_category_id);
  END IF;
END;
$$;

COMMENT ON CONSTRAINT task_labor_yields_task_labor_unique ON public.task_labor_yields IS
  'Garantiza unicidad de categoría de mano de obra por tarea. '
  'Requerido por tasksService.upsertLaborYield (ON CONFLICT DO UPDATE).';


-- ── 3. task_tool_yields: UNIQUE (task_id, tool_id) ──────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname   = 'task_tool_yields_task_tool_unique'
      AND conrelid  = 'public.task_tool_yields'::regclass
      AND contype   IN ('u', 'p')
  ) THEN
    ALTER TABLE public.task_tool_yields
      ADD CONSTRAINT task_tool_yields_task_tool_unique
        UNIQUE (task_id, tool_id);
  END IF;
END;
$$;

COMMENT ON CONSTRAINT task_tool_yields_task_tool_unique ON public.task_tool_yields IS
  'Garantiza unicidad de herramienta/equipo por tarea. '
  'Requerido por tasksService.upsertToolYield (ON CONFLICT DO UPDATE).';


-- ── 4. budget_items.dependencies: DEFAULT defensivo ──────────────────────────
-- dependencies es NOT NULL en DB.
-- El frontend ahora siempre envía [] como fallback (budgetItemToRow).
-- Este DEFAULT protege inserciones directas desde SQL o futuras
-- rutas que no pasen por el mapper.
-- NOTA: Solo funciona si el tipo de la columna es jsonb.
--       Si la migración falla aquí, omitir este bloque — el fix del
--       código es suficiente.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'budget_items'
      AND column_name  = 'dependencies'
      AND data_type    = 'jsonb'
  ) THEN
    EXECUTE 'ALTER TABLE public.budget_items
               ALTER COLUMN dependencies SET DEFAULT ''[]''::jsonb';
  END IF;
END;
$$;


-- ── Script de limpieza (solo si la migración falla por duplicados) ───────────
-- Ejecutar manualmente ANTES de re-intentar la migración:
--
-- -- Deduplicar task_yields (mantiene el registro con mayor ctid):
-- DELETE FROM public.task_yields a
-- USING public.task_yields b
-- WHERE a.task_id = b.task_id
--   AND a.material_id = b.material_id
--   AND a.ctid < b.ctid;
--
-- -- Deduplicar task_labor_yields:
-- DELETE FROM public.task_labor_yields a
-- USING public.task_labor_yields b
-- WHERE a.task_id = b.task_id
--   AND a.labor_category_id = b.labor_category_id
--   AND a.ctid < b.ctid;
--
-- -- Deduplicar task_tool_yields:
-- DELETE FROM public.task_tool_yields a
-- USING public.task_tool_yields b
-- WHERE a.task_id = b.task_id
--   AND a.tool_id = b.tool_id
--   AND a.ctid < b.ctid;
