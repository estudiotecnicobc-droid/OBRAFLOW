-- =============================================================================
-- Migración 066: recuperar los insumos de las tareas importadas desde el catálogo
--
-- Causa: al importar un APU (presupuesto rápido, plantillas, catálogo) la app guardaba
-- task_yields con waste_percent = NULL cuando el material no traía desperdicio. La
-- columna es NOT NULL (default 0), así que el insert fallaba en silencio: la tarea
-- quedaba con su mano de obra pero sin materiales. En pantalla se veían hasta recargar.
-- El código ya envía 0 (services/tasksService.ts); esta migración repara los datos.
--
-- Qué hace: para cada tarea de un presupuesto que tiene APU de origen (master_task_id)
-- y no tiene ningún material, copia los materiales de ese APU:
--   · APU nuevos: catalog_task_yields + resources (MATERIAL y SUBCONTRACT);
--   · APU legacy: master_task_materials.
-- Cada material se vincula con el material de la empresa del mismo nombre (el que la
-- importación creó). Si no existe, se omite.
--
-- Idempotente: solo toca tareas sin materiales y usa ON CONFLICT DO NOTHING.
-- =============================================================================

BEGIN;

WITH affected AS (
  SELECT t.id AS task_id, t.master_task_id, t.organization_id
  FROM public.tasks t
  WHERE t.master_task_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.budget_items b WHERE b.task_id = t.id)
    AND NOT EXISTS (SELECT 1 FROM public.task_yields y WHERE y.task_id = t.id)
),
lines AS (
  SELECT a.task_id, a.organization_id, r.name AS material_name, c.quantity, 0::numeric AS waste
  FROM affected a
  JOIN public.catalog_task_yields c ON c.master_task_id = a.master_task_id
  JOIN public.resources r ON r.id = c.resource_id AND r.type IN ('MATERIAL', 'SUBCONTRACT')
  UNION ALL
  SELECT a.task_id, a.organization_id, m.material_name, m.quantity, coalesce(m.waste_percent, 0)
  FROM affected a
  JOIN public.master_task_materials m ON m.master_task_id = a.master_task_id
),
matched AS (
  -- Un material por nombre: si la empresa tiene dos con el mismo nombre, el más reciente.
  SELECT DISTINCT ON (l.task_id, l.material_name)
         l.task_id, l.organization_id, mat.id AS material_id, l.quantity, l.waste
  FROM lines l
  JOIN public.materials mat
    ON mat.organization_id = l.organization_id::text
   AND mat.name = l.material_name
  ORDER BY l.task_id, l.material_name, mat.created_at DESC
)
INSERT INTO public.task_yields (task_id, material_id, quantity, waste_percent, organization_id)
SELECT task_id, material_id, quantity, waste, organization_id
FROM matched
ON CONFLICT (task_id, material_id) DO NOTHING;

COMMIT;
