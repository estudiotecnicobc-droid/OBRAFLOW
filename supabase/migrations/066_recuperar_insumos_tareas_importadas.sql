-- Migración 066: recuperar insumos de tareas importadas (data fix)
-- Aplicada en producción el 31/10/2026 (versión 20261031183518) desde otra sesión;
-- recuperada de supabase_migrations.schema_migrations para que el repo la tenga.
-- Completa task_yields de tareas de proyecto creadas desde un APU que quedaron sin
-- materiales. Idempotente (ON CONFLICT DO NOTHING).

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
