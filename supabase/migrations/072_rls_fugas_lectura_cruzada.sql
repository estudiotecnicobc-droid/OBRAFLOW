-- 072 · Cierra fugas de datos entre empresas detectadas por los tests T2 (supabase/tests/rls).
--  · task_crew_yields: políticas using(true) → cualquier usuario autenticado leía/modificaba/borraba
--    rendimientos de cuadrilla de otras empresas. Ahora: la tarea y la cuadrilla deben ser de una empresa
--    de la que el usuario es miembro.
--  · resources / catalogs / catalog_task_yields: lectura using(true) → recursos, catálogos y rendimientos
--    privados de una empresa visibles a todas. Ahora: globales (organization_id null) o de mis empresas.
-- La app ya filtraba por empresa en el cliente (resourcesService.listForOrg), así que no cambia su comportamiento.
-- Verificado en datos de producción (31/10/2026): las 11 filas de task_crew_yields tienen tarea y cuadrilla
-- de la misma empresa.

begin;

-- task_crew_yields
drop policy if exists task_crew_yields_select on public.task_crew_yields;
drop policy if exists task_crew_yields_insert on public.task_crew_yields;
drop policy if exists task_crew_yields_update on public.task_crew_yields;
drop policy if exists task_crew_yields_delete on public.task_crew_yields;

create policy task_crew_yields_select_member on public.task_crew_yields for select to authenticated
  using (exists (select 1 from public.tasks t
                 where t.id::text = task_crew_yields.task_id and public.is_org_member(t.organization_id)));

create policy task_crew_yields_insert_member on public.task_crew_yields for insert to authenticated
  with check (exists (select 1 from public.tasks t
                      join public.crews c on c.organization_id = t.organization_id::text
                      where t.id::text = task_crew_yields.task_id and c.id = task_crew_yields.crew_id
                        and public.is_org_member(t.organization_id)));

create policy task_crew_yields_update_member on public.task_crew_yields for update to authenticated
  using (exists (select 1 from public.tasks t
                 where t.id::text = task_crew_yields.task_id and public.is_org_member(t.organization_id)))
  with check (exists (select 1 from public.tasks t
                      join public.crews c on c.organization_id = t.organization_id::text
                      where t.id::text = task_crew_yields.task_id and c.id = task_crew_yields.crew_id
                        and public.is_org_member(t.organization_id)));

create policy task_crew_yields_delete_member on public.task_crew_yields for delete to authenticated
  using (exists (select 1 from public.tasks t
                 where t.id::text = task_crew_yields.task_id and public.is_org_member(t.organization_id)));

-- resources
drop policy if exists resources_select on public.resources;
create policy resources_select on public.resources for select to authenticated
  using (organization_id is null or public.is_org_member(organization_id));

-- catalogs
drop policy if exists catalogs_select on public.catalogs;
create policy catalogs_select on public.catalogs for select to authenticated
  using (organization_id is null or public.is_org_member(organization_id));

-- catalog_task_yields: visible si su APU es global o de una empresa mía
drop policy if exists catalog_task_yields_select on public.catalog_task_yields;
create policy catalog_task_yields_select on public.catalog_task_yields for select to authenticated
  using (exists (select 1 from public.master_tasks mt
                 where mt.id = catalog_task_yields.master_task_id
                   and (mt.organization_id is null or public.is_org_member(mt.organization_id))));

commit;
