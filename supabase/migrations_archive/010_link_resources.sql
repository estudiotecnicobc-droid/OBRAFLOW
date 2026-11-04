-- =============================================================================
-- Migration 010: Link master_task sub-tables and projects to resources
-- Agrega columnas FK a resources en tablas de composición de APU maestro.
-- Agrega cost_base a projects.
-- =============================================================================
-- PREREQUISITO: migración 008 ejecutada (tabla resources existe con columna base_cost)
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. master_task_materials — link a recurso + sub-APU + factor de conversión
-- =============================================================================

ALTER TABLE public.master_task_materials
  ADD COLUMN IF NOT EXISTS resource_id        uuid
    REFERENCES public.resources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sub_master_task_id uuid
    REFERENCES public.master_tasks(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conversion_factor  numeric(10,6);

COMMENT ON COLUMN public.master_task_materials.resource_id IS
  'FK opcional al recurso en el catálogo. Si está presente, el motor usa get_resource_cost() '
  'en lugar de last_known_unit_price como fuente de costo.';

COMMENT ON COLUMN public.master_task_materials.sub_master_task_id IS
  'FK opcional a otro MasterTask (APU anidado). Si está presente, el motor calcula '
  'el costo total del sub-APU recursivamente en lugar de leer un precio unitario.';

COMMENT ON COLUMN public.master_task_materials.conversion_factor IS
  'Factor de conversión entre la unidad de rendimiento (ej: "50kg") y la unidad base '
  'del recurso (ej: "KG"). Si es NULL, el motor lo infiere por parsing de la unidad. '
  'Ejemplo: bolsa 50kg de cemento → conversion_factor=50, unit="KG".';

-- =============================================================================
-- 2. master_task_labor — link a recurso de mano de obra
-- =============================================================================

ALTER TABLE public.master_task_labor
  ADD COLUMN IF NOT EXISTS resource_id           uuid
    REFERENCES public.resources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS snapshot_hourly_rate  numeric(18,4);

COMMENT ON COLUMN public.master_task_labor.resource_id IS
  'FK al recurso de tipo LABOR. Si está presente, el motor usa get_resource_cost() '
  'para obtener la tarifa horaria actualizada según índices.';

COMMENT ON COLUMN public.master_task_labor.snapshot_hourly_rate IS
  'Tarifa horaria capturada al momento de importar el APU desde el catálogo. '
  'Fallback cuando resource_id no está disponible.';

-- =============================================================================
-- 3. master_task_equipment — link a recurso de equipo
-- =============================================================================

ALTER TABLE public.master_task_equipment
  ADD COLUMN IF NOT EXISTS resource_id             uuid
    REFERENCES public.resources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS snapshot_cost_per_hour  numeric(18,4);

COMMENT ON COLUMN public.master_task_equipment.resource_id IS
  'FK al recurso de tipo EQUIPMENT. Si está presente, el motor usa get_resource_cost() '
  'para obtener el costo/hora actualizado.';

COMMENT ON COLUMN public.master_task_equipment.snapshot_cost_per_hour IS
  'Costo por hora capturado al momento de importar el APU desde el catálogo. '
  'Fallback cuando resource_id no está disponible.';

-- =============================================================================
-- 4. projects — base de costos para recálculo
-- =============================================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS cost_base date;

COMMENT ON COLUMN public.projects.cost_base IS
  'Fecha base para el recálculo del presupuesto. Convención: último día del mes. '
  'Ejemplo: 2026-03-31 = "Base Marzo 2026". '
  'El motor busca snapshots con effective_date <= cost_base (i.e., primero del mes correspondiente). '
  'NULL = no hay base de costos configurada → el presupuesto usa last_known_unit_price.';

-- =============================================================================
-- 5. Índices opcionales para performance
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
