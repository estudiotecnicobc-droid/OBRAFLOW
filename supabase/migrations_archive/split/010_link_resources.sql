-- =============================================================================
-- 010 — Link master_task sub-tables and projects to resources
-- =============================================================================
-- QUÉ HACE: agrega columnas FK a resources en tablas de composición de APU
--           maestro y cost_base a projects.
--
-- PREREQUISITOS:
--   · Serie split: 008a → 008b → 008c ejecutados (tabla resources con base_cost)
--   · O bien: 008 monolítico + 009 ejecutados
--
-- IDEMPOTENTE: sí (ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS).
--
-- VERIFICAR DESPUÉS:
--   SELECT column_name, data_type
--   FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name IN ('master_task_materials','master_task_labor',
--                        'master_task_equipment','projects')
--     AND column_name IN ('resource_id','sub_master_task_id','conversion_factor',
--                         'snapshot_hourly_rate','snapshot_cost_per_hour','cost_base')
--   ORDER BY table_name, column_name;
--   -- Debe devolver 6 filas.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. master_task_materials: resource_id + sub_master_task_id + conversion_factor
-- =============================================================================

ALTER TABLE public.master_task_materials
  ADD COLUMN IF NOT EXISTS resource_id        uuid
    REFERENCES public.resources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sub_master_task_id uuid
    REFERENCES public.master_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conversion_factor  numeric(10,6);

COMMENT ON COLUMN public.master_task_materials.resource_id IS
  'FK al recurso en el catálogo. Si está presente, el motor usa get_resource_cost() '
  'en lugar de last_known_unit_price.';

COMMENT ON COLUMN public.master_task_materials.sub_master_task_id IS
  'FK a otro MasterTask (APU anidado). El motor calcula el costo del sub-APU recursivamente.';

COMMENT ON COLUMN public.master_task_materials.conversion_factor IS
  'Factor unidad rendimiento → unidad base del recurso. '
  'Ej: bolsa 50kg de cemento → conversion_factor=50, unit="KG". '
  'NULL = el motor lo infiere por parsing de la unidad.';

-- =============================================================================
-- 2. master_task_labor: resource_id + snapshot_hourly_rate
-- =============================================================================

ALTER TABLE public.master_task_labor
  ADD COLUMN IF NOT EXISTS resource_id          uuid
    REFERENCES public.resources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS snapshot_hourly_rate numeric(18,4);

COMMENT ON COLUMN public.master_task_labor.resource_id IS
  'FK al recurso LABOR. El motor usa get_resource_cost() para tarifa horaria actualizada.';

COMMENT ON COLUMN public.master_task_labor.snapshot_hourly_rate IS
  'Tarifa horaria capturada al importar el APU. Fallback cuando resource_id no disponible.';

-- =============================================================================
-- 3. master_task_equipment: resource_id + snapshot_cost_per_hour
-- =============================================================================

ALTER TABLE public.master_task_equipment
  ADD COLUMN IF NOT EXISTS resource_id             uuid
    REFERENCES public.resources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS snapshot_cost_per_hour  numeric(18,4);

COMMENT ON COLUMN public.master_task_equipment.resource_id IS
  'FK al recurso EQUIPMENT. El motor usa get_resource_cost() para costo/hora actualizado.';

COMMENT ON COLUMN public.master_task_equipment.snapshot_cost_per_hour IS
  'Costo por hora capturado al importar. Fallback cuando resource_id no disponible.';

-- =============================================================================
-- 4. projects: cost_base
-- =============================================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS cost_base date;

COMMENT ON COLUMN public.projects.cost_base IS
  'Fecha base para recálculo del presupuesto. Convención: último día del mes. '
  'Ej: 2026-03-31 = "Base Marzo 2026". '
  'El motor busca snapshots con effective_date <= cost_base. '
  'NULL = sin base configurada, usa last_known_unit_price.';

-- =============================================================================
-- 5. Índices de performance
-- =============================================================================

CREATE INDEX IF NOT EXISTS master_task_materials_resource_id_idx
  ON public.master_task_materials (resource_id)
  WHERE resource_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS master_task_materials_sub_task_idx
  ON public.master_task_materials (sub_master_task_id)
  WHERE sub_master_task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS master_task_labor_resource_id_idx
  ON public.master_task_labor (resource_id)
  WHERE resource_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS master_task_equipment_resource_id_idx
  ON public.master_task_equipment (resource_id)
  WHERE resource_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS projects_cost_base_idx
  ON public.projects (organization_id, cost_base)
  WHERE cost_base IS NOT NULL;

COMMIT;
