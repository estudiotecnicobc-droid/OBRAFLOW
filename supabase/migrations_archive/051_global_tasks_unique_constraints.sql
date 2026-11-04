-- Migración 051: índices únicos para el catálogo global de APUs
-- Previene duplicados de nombre y código en master_tasks con organization_id IS NULL.
--
-- Acción previa automática: soft-delete de duplicados existentes (mantiene el más antiguo).
-- Si no hay duplicados, los DO $$ blocks son no-ops seguros.

-- ── Resolución de duplicados de nombre ───────────────────────────────────────
DO $$
DECLARE
  dup RECORD;
BEGIN
  FOR dup IN
    SELECT lower(name) AS key, array_agg(id ORDER BY created_at ASC) AS ids
    FROM public.master_tasks
    WHERE organization_id IS NULL AND is_active = true
    GROUP BY lower(name)
    HAVING count(*) > 1
  LOOP
    UPDATE public.master_tasks SET is_active = false
      WHERE id = ANY(dup.ids[2:]);
  END LOOP;
END $$;

-- ── Resolución de duplicados de código ───────────────────────────────────────
DO $$
DECLARE
  dup RECORD;
BEGIN
  FOR dup IN
    SELECT lower(code) AS key, array_agg(id ORDER BY created_at ASC) AS ids
    FROM public.master_tasks
    WHERE organization_id IS NULL AND code IS NOT NULL AND is_active = true
    GROUP BY lower(code)
    HAVING count(*) > 1
  LOOP
    UPDATE public.master_tasks SET is_active = false
      WHERE id = ANY(dup.ids[2:]);
  END LOOP;
END $$;

-- ── Índice único por nombre (catálogo global, case-insensitive) ───────────────
CREATE UNIQUE INDEX IF NOT EXISTS master_tasks_global_name_active_uidx
  ON public.master_tasks (lower(name))
  WHERE organization_id IS NULL AND is_active = true;

COMMENT ON INDEX public.master_tasks_global_name_active_uidx IS
  'Garantiza que no existan dos APUs activos del catálogo global con el mismo nombre (case-insensitive). '
  'Parcial: solo aplica a organization_id IS NULL AND is_active = true.';

-- ── Índice único por código (catálogo global, case-insensitive) ──────────────
CREATE UNIQUE INDEX IF NOT EXISTS master_tasks_global_code_active_uidx
  ON public.master_tasks (lower(code))
  WHERE organization_id IS NULL AND code IS NOT NULL AND is_active = true;

COMMENT ON INDEX public.master_tasks_global_code_active_uidx IS
  'Garantiza que no existan dos APUs activos del catálogo global con el mismo código (case-insensitive). '
  'Parcial: solo aplica a organization_id IS NULL AND code IS NOT NULL AND is_active = true.';
