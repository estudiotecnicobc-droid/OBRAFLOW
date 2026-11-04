-- Migración aplicada desde el panel web de Supabase (SQL Editor).
-- Version: 20261031183518
-- Name:    066_recuperar_insumos_tareas_importadas
-- Origen:  supabase_migrations.schema_migrations (snapshot 2026-11-03)
-- Nota:    Ya aplicada en producción. Reproducida aquí sólo como historia.
-- Nunca re-ejecutar: está absorbida por el baseline 20261101000000.

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
