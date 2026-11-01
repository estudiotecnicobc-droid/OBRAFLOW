-- Rollback de 072: restaura las políticas previas (estado de producción al 31/10/2026).
begin;
drop policy if exists task_crew_yields_select_member on public.task_crew_yields;
drop policy if exists task_crew_yields_insert_member on public.task_crew_yields;
drop policy if exists task_crew_yields_update_member on public.task_crew_yields;
drop policy if exists task_crew_yields_delete_member on public.task_crew_yields;
create policy task_crew_yields_delete on public.task_crew_yields for delete to authenticated using (true);
create policy task_crew_yields_insert on public.task_crew_yields for insert to authenticated with check (true);
create policy task_crew_yields_select on public.task_crew_yields for select to authenticated using (true);
create policy task_crew_yields_update on public.task_crew_yields for update to authenticated using (true);
drop policy if exists resources_select on public.resources;
create policy resources_select on public.resources for select to authenticated using (true);
drop policy if exists catalogs_select on public.catalogs;
create policy catalogs_select on public.catalogs for select to authenticated using (true);
drop policy if exists catalog_task_yields_select on public.catalog_task_yields;
create policy catalog_task_yields_select on public.catalog_task_yields for select to authenticated using (true);
commit;
