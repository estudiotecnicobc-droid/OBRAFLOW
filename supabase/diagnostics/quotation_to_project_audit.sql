-- =============================================================================
-- Diagnóstico: Compatibilidad Cotización → Proyecto
-- Rama: audit/quotation-to-project-compatibility
-- Fecha: 2026-07-11
-- Tipo: Solo SELECT — sin modificaciones
-- =============================================================================
-- Ejecutar en Supabase SQL Editor con rol de servicio (service_role) o como
-- usuario owner/admin de la organización. Ninguna query modifica datos.
-- =============================================================================


-- ─── 1. Estructura real de tablas del dominio económico ───────────────────────
-- Verifica columnas, tipos y nullable de las tablas core.

SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'projects',
    'budget_items',
    'tasks',
    'budget_cost_snapshots',
    'project_computations',
    'computation_items',
    'master_tasks',
    'master_task_materials',
    'master_task_labor',
    'master_task_equipment',
    'master_materials',
    'resources'
  )
ORDER BY table_name, ordinal_position;


-- ─── 2. FK: qué columnas referencian a projects ───────────────────────────────
-- Identifica todas las tablas que dependen de projects.id.
-- Si aparece aquí, no se pueden migrar a cotización sin cambiar esa FK.

SELECT
  tc.table_name         AS dependent_table,
  kcu.column_name       AS fk_column,
  ccu.table_name        AS references_table,
  ccu.column_name       AS references_column,
  rc.delete_rule        AS on_delete
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON rc.unique_constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND ccu.table_name = 'projects'
ORDER BY tc.table_name;


-- ─── 3. FK: qué columnas referencian a organizations ─────────────────────────
-- Muestra qué tablas ya tienen organización como tenant root.
-- Las tablas de cotización deberían seguir este mismo patrón.

SELECT
  tc.table_name         AS dependent_table,
  kcu.column_name       AS fk_column,
  rc.delete_rule        AS on_delete
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON rc.unique_constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND ccu.table_name = 'organizations'
ORDER BY tc.table_name;


-- ─── 4. RLS: tablas con seguridad de fila habilitada ─────────────────────────
-- Si una tabla no aparece aquí con rowsecurity=true, no tiene RLS.
-- Las nuevas tablas de cotización DEBEN aparecer aquí.

SELECT
  relname                AS table_name,
  relrowsecurity         AS rls_enabled,
  relforcerowsecurity    AS rls_forced
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relkind = 'r'
ORDER BY relname;


-- ─── 5. Políticas RLS existentes en tablas del dominio ───────────────────────
-- Lista las políticas actuales para entender el patrón a replicar
-- en las tablas de cotización.

SELECT
  tablename,
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'projects',
    'budget_items',
    'budget_cost_snapshots',
    'project_computations',
    'computation_items'
  )
ORDER BY tablename, policyname;


-- ─── 6. RPCs del dominio económico ───────────────────────────────────────────
-- Lista las funciones existentes para identificar qué RPCs habría que
-- replicar o parametrizar para cotizaciones.

SELECT
  p.proname                                  AS function_name,
  pg_get_function_arguments(p.oid)           AS arguments,
  CASE p.prosecdef WHEN true THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS security,
  obj_description(p.oid, 'pg_proc')         AS description
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'get_budget_for_calculator',
    'snapshot_budget_costs',
    'get_budget_cost_staleness',
    'calculate_consolidated_resources',
    'clone_master_task_to_org',
    'get_apu_technical_report',
    'is_org_member',
    'is_org_member_with_role',
    'bootstrap_organization',
    'accept_invitation',
    'get_invitation_by_token',
    'import_global_catalog_to_org'
  )
ORDER BY p.proname;


-- ─── 7. Verificar si `budget_items.project_id` es nullable en DB real ─────────
-- Hecho crítico: si is_nullable = 'NO', cambiar a nullable es una migración
-- destructiva que requiere backfill y no puede hacerse en caliente.

SELECT
  column_name,
  is_nullable,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'budget_items'
  AND column_name IN ('project_id', 'organization_id', 'task_id', 'quantity', 'sort_order', 'computation_item_id');


-- ─── 8. ¿Ya existe alguna tabla de cotizaciones? ─────────────────────────────
-- Si returns rows, hay trabajo previo no documentado en migraciones.

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name ILIKE '%quotation%'
ORDER BY table_name;


-- ─── 9. Conteo de datos actuales en tablas que serían afectadas ───────────────
-- Muestra el volumen de datos que cualquier migración debe respetar.

SELECT 'projects'              AS tabla, COUNT(*) AS filas FROM public.projects
UNION ALL
SELECT 'budget_items',                   COUNT(*)          FROM public.budget_items
UNION ALL
SELECT 'budget_cost_snapshots',          COUNT(*)          FROM public.budget_cost_snapshots
UNION ALL
SELECT 'project_computations',           COUNT(*)          FROM public.project_computations
UNION ALL
SELECT 'computation_items',              COUNT(*)          FROM public.computation_items
UNION ALL
SELECT 'master_tasks',                   COUNT(*)          FROM public.master_tasks
UNION ALL
SELECT 'master_materials',               COUNT(*)          FROM public.master_materials
UNION ALL
SELECT 'resources',                      COUNT(*)          FROM public.resources
ORDER BY tabla;


-- ─── 10. Proyectos sin budget_items (candidatos a ser cotizaciones) ────────────
-- Si un proyecto nunca tuvo ítems, podría haberse modelado como cotización.

SELECT
  p.id,
  p.name,
  p.client,
  p.status,
  p.created_at,
  COUNT(bi.id) AS item_count
FROM public.projects p
LEFT JOIN public.budget_items bi ON bi.project_id = p.id
GROUP BY p.id, p.name, p.client, p.status, p.created_at
HAVING COUNT(bi.id) = 0
ORDER BY p.created_at DESC
LIMIT 20;


-- ─── 11. Distribución de proyectos por status ─────────────────────────────────
-- Muestra cuántos proyectos podrían haber sido cotizaciones en un flujo nuevo.

SELECT
  status,
  COUNT(*) AS cantidad
FROM public.projects
GROUP BY status
ORDER BY cantidad DESC;


-- ─── 12. Budget items sin master_task_id (no calculables por motor) ───────────
-- Estos ítems ya son un "caso límite" en el modelo actual.
-- En cotizaciones se debería decidir si se permiten o no.

SELECT
  COUNT(*) FILTER (WHERE t.master_task_id IS NOT NULL)     AS items_con_master,
  COUNT(*) FILTER (WHERE t.master_task_id IS NULL)         AS items_sin_master,
  COUNT(*)                                                  AS total
FROM public.budget_items bi
JOIN public.tasks t ON t.id = bi.task_id;


-- ─── 13. Snapshots existentes — volumen e historial ───────────────────────────
-- Muestra el patrón de uso actual de budget_cost_snapshots.
-- Las cotizaciones necesitarían una tabla análoga (quotation_snapshots).

SELECT
  DATE_TRUNC('month', computed_at) AS mes,
  COUNT(*)                          AS snapshots_generados,
  COUNT(DISTINCT project_id)        AS proyectos_distintos
FROM public.budget_cost_snapshots
GROUP BY DATE_TRUNC('month', computed_at)
ORDER BY mes DESC
LIMIT 12;


-- ─── 14. Verificar compatibilidad de is_org_member con UUID ───────────────────
-- La función is_org_member existe en dos sobrecargas (uuid y text).
-- Las nuevas tablas de cotización usarán UUID, confirmar que la sobrecarga existe.

SELECT
  p.proname,
  pg_get_function_arguments(p.oid) AS signature
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname = 'is_org_member'
ORDER BY p.oid;


-- ─── 15. GRANTs sobre RPCs del motor de cálculo ──────────────────────────────
-- Verificar que authenticated puede ejecutar las RPCs del motor.
-- Las nuevas RPCs de cotización deberán tener los mismos GRANTs.

SELECT
  routine_name,
  grantee,
  privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN (
    'calculate_consolidated_resources',
    'get_budget_for_calculator',
    'snapshot_budget_costs',
    'get_budget_cost_staleness'
  )
ORDER BY routine_name, grantee;
