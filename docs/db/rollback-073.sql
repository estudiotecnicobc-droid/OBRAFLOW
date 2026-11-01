-- Rollback de 073: restaura políticas, restricción y accept_invitation previos.
begin;
drop policy if exists budget_items_delete on public.budget_items;
drop policy if exists budget_items_delete_member on public.budget_items;
drop policy if exists budget_items_insert on public.budget_items;
drop policy if exists budget_items_insert_member on public.budget_items;
drop policy if exists budget_items_update on public.budget_items;
drop policy if exists budget_items_update_member on public.budget_items;
drop policy if exists budget_template_items_delete_member on public.budget_template_items;
drop policy if exists budget_template_items_insert_member on public.budget_template_items;
drop policy if exists budget_template_items_update_member on public.budget_template_items;
drop policy if exists budget_templates_delete_member on public.budget_templates;
drop policy if exists budget_templates_insert_member on public.budget_templates;
drop policy if exists budget_templates_update_member on public.budget_templates;
drop policy if exists master_task_equipment_delete_member on public.master_task_equipment;
drop policy if exists master_task_equipment_insert_member on public.master_task_equipment;
drop policy if exists master_task_equipment_update_member on public.master_task_equipment;
drop policy if exists master_task_labor_delete_member on public.master_task_labor;
drop policy if exists master_task_labor_insert_member on public.master_task_labor;
drop policy if exists master_task_labor_update_member on public.master_task_labor;
drop policy if exists master_task_materials_delete_member on public.master_task_materials;
drop policy if exists master_task_materials_insert_member on public.master_task_materials;
drop policy if exists master_task_materials_update_member on public.master_task_materials;
drop policy if exists master_tasks_delete_member on public.master_tasks;
drop policy if exists master_tasks_insert_member on public.master_tasks;
drop policy if exists master_tasks_update_member on public.master_tasks;
drop policy if exists organizations_update_member on public.organizations;
drop policy if exists projects_delete_member on public.projects;
drop policy if exists projects_insert_member on public.projects;
drop policy if exists projects_update_member on public.projects;
drop policy if exists task_crew_yields_delete_member on public.task_crew_yields;
drop policy if exists task_crew_yields_insert_member on public.task_crew_yields;
drop policy if exists task_crew_yields_update_member on public.task_crew_yields;
drop policy if exists task_labor_yields_delete on public.task_labor_yields;
drop policy if exists task_labor_yields_delete_member on public.task_labor_yields;
drop policy if exists task_labor_yields_insert on public.task_labor_yields;
drop policy if exists task_labor_yields_insert_member on public.task_labor_yields;
drop policy if exists task_labor_yields_update on public.task_labor_yields;
drop policy if exists task_labor_yields_update_member on public.task_labor_yields;
drop policy if exists task_tool_yields_delete on public.task_tool_yields;
drop policy if exists task_tool_yields_delete_member on public.task_tool_yields;
drop policy if exists task_tool_yields_insert on public.task_tool_yields;
drop policy if exists task_tool_yields_insert_member on public.task_tool_yields;
drop policy if exists task_tool_yields_update on public.task_tool_yields;
drop policy if exists task_tool_yields_update_member on public.task_tool_yields;
drop policy if exists task_yields_delete on public.task_yields;
drop policy if exists task_yields_delete_member on public.task_yields;
drop policy if exists task_yields_insert on public.task_yields;
drop policy if exists task_yields_insert_member on public.task_yields;
drop policy if exists task_yields_update on public.task_yields;
drop policy if exists task_yields_update_member on public.task_yields;
drop policy if exists tasks_delete on public.tasks;
drop policy if exists tasks_delete_member on public.tasks;
drop policy if exists tasks_insert on public.tasks;
drop policy if exists tasks_insert_member on public.tasks;
drop policy if exists tasks_update on public.tasks;
drop policy if exists tasks_update_member on public.tasks;
create policy budget_items_delete on public.budget_items as PERMISSIVE for DELETE to public using ((project_id IN ( SELECT p.id FROM (projects p JOIN organization_members om ON ((om.organization_id = p.organization_id))) WHERE (om.user_id = auth.uid()))));
create policy budget_items_delete_member on public.budget_items as PERMISSIVE for DELETE to public using (is_org_member(organization_id));
create policy budget_items_insert on public.budget_items as PERMISSIVE for INSERT to public with check ((project_id IN ( SELECT p.id FROM (projects p JOIN organization_members om ON ((om.organization_id = p.organization_id))) WHERE (om.user_id = auth.uid()))));
create policy budget_items_insert_member on public.budget_items as PERMISSIVE for INSERT to authenticated with check (is_org_member(organization_id));
create policy budget_items_update on public.budget_items as PERMISSIVE for UPDATE to public using ((project_id IN ( SELECT p.id FROM (projects p JOIN organization_members om ON ((om.organization_id = p.organization_id))) WHERE (om.user_id = auth.uid())))) with check ((project_id IN ( SELECT p.id FROM (projects p JOIN organization_members om ON ((om.organization_id = p.organization_id))) WHERE (om.user_id = auth.uid()))));
create policy budget_items_update_member on public.budget_items as PERMISSIVE for UPDATE to public using (is_org_member(organization_id)) with check (is_org_member(organization_id));
create policy budget_template_items_delete_member on public.budget_template_items as PERMISSIVE for DELETE to public using ((EXISTS ( SELECT 1 FROM budget_templates bt WHERE ((bt.id = budget_template_items.budget_template_id) AND is_org_member(bt.organization_id)))));
create policy budget_template_items_insert_member on public.budget_template_items as PERMISSIVE for INSERT to authenticated with check ((EXISTS ( SELECT 1 FROM budget_templates bt WHERE ((bt.id = budget_template_items.budget_template_id) AND is_org_member(bt.organization_id)))));
create policy budget_template_items_update_member on public.budget_template_items as PERMISSIVE for UPDATE to public using ((EXISTS ( SELECT 1 FROM budget_templates bt WHERE ((bt.id = budget_template_items.budget_template_id) AND is_org_member(bt.organization_id))))) with check ((EXISTS ( SELECT 1 FROM budget_templates bt WHERE ((bt.id = budget_template_items.budget_template_id) AND is_org_member(bt.organization_id)))));
create policy budget_templates_delete_member on public.budget_templates as PERMISSIVE for DELETE to public using (is_org_member(organization_id));
create policy budget_templates_insert_member on public.budget_templates as PERMISSIVE for INSERT to authenticated with check (is_org_member(organization_id));
create policy budget_templates_update_member on public.budget_templates as PERMISSIVE for UPDATE to public using (is_org_member(organization_id)) with check (is_org_member(organization_id));
create policy master_task_equipment_delete_member on public.master_task_equipment as PERMISSIVE for DELETE to public using ((EXISTS ( SELECT 1 FROM master_tasks mt WHERE ((mt.id = master_task_equipment.master_task_id) AND is_org_member(mt.organization_id)))));
create policy master_task_equipment_insert_member on public.master_task_equipment as PERMISSIVE for INSERT to authenticated with check ((EXISTS ( SELECT 1 FROM master_tasks mt WHERE ((mt.id = master_task_equipment.master_task_id) AND is_org_member(mt.organization_id)))));
create policy master_task_equipment_update_member on public.master_task_equipment as PERMISSIVE for UPDATE to public using ((EXISTS ( SELECT 1 FROM master_tasks mt WHERE ((mt.id = master_task_equipment.master_task_id) AND is_org_member(mt.organization_id))))) with check ((EXISTS ( SELECT 1 FROM master_tasks mt WHERE ((mt.id = master_task_equipment.master_task_id) AND is_org_member(mt.organization_id)))));
create policy master_task_labor_delete_member on public.master_task_labor as PERMISSIVE for DELETE to public using ((EXISTS ( SELECT 1 FROM master_tasks mt WHERE ((mt.id = master_task_labor.master_task_id) AND is_org_member(mt.organization_id)))));
create policy master_task_labor_insert_member on public.master_task_labor as PERMISSIVE for INSERT to authenticated with check ((EXISTS ( SELECT 1 FROM master_tasks mt WHERE ((mt.id = master_task_labor.master_task_id) AND is_org_member(mt.organization_id)))));
create policy master_task_labor_update_member on public.master_task_labor as PERMISSIVE for UPDATE to public using ((EXISTS ( SELECT 1 FROM master_tasks mt WHERE ((mt.id = master_task_labor.master_task_id) AND is_org_member(mt.organization_id))))) with check ((EXISTS ( SELECT 1 FROM master_tasks mt WHERE ((mt.id = master_task_labor.master_task_id) AND is_org_member(mt.organization_id)))));
create policy master_task_materials_delete_member on public.master_task_materials as PERMISSIVE for DELETE to public using ((EXISTS ( SELECT 1 FROM master_tasks mt WHERE ((mt.id = master_task_materials.master_task_id) AND is_org_member(mt.organization_id)))));
create policy master_task_materials_insert_member on public.master_task_materials as PERMISSIVE for INSERT to authenticated with check ((EXISTS ( SELECT 1 FROM master_tasks mt WHERE ((mt.id = master_task_materials.master_task_id) AND is_org_member(mt.organization_id)))));
create policy master_task_materials_update_member on public.master_task_materials as PERMISSIVE for UPDATE to public using ((EXISTS ( SELECT 1 FROM master_tasks mt WHERE ((mt.id = master_task_materials.master_task_id) AND is_org_member(mt.organization_id))))) with check ((EXISTS ( SELECT 1 FROM master_tasks mt WHERE ((mt.id = master_task_materials.master_task_id) AND is_org_member(mt.organization_id)))));
create policy master_tasks_delete_member on public.master_tasks as PERMISSIVE for DELETE to public using (is_org_member(organization_id));
create policy master_tasks_insert_member on public.master_tasks as PERMISSIVE for INSERT to authenticated with check (is_org_member(organization_id));
create policy master_tasks_update_member on public.master_tasks as PERMISSIVE for UPDATE to public using (is_org_member(organization_id)) with check (is_org_member(organization_id));
create policy organizations_update_member on public.organizations as PERMISSIVE for UPDATE to public using (is_org_member(id)) with check (is_org_member(id));
create policy projects_delete_member on public.projects as PERMISSIVE for DELETE to public using (is_org_member(organization_id));
create policy projects_insert_member on public.projects as PERMISSIVE for INSERT to authenticated with check (is_org_member(organization_id));
create policy projects_update_member on public.projects as PERMISSIVE for UPDATE to public using (is_org_member(organization_id)) with check (is_org_member(organization_id));
create policy task_labor_yields_delete on public.task_labor_yields as PERMISSIVE for DELETE to public using ((task_id IN ( SELECT t.id FROM (tasks t JOIN organization_members om ON ((om.organization_id = t.organization_id))) WHERE (om.user_id = auth.uid()))));
create policy task_labor_yields_delete_member on public.task_labor_yields as PERMISSIVE for DELETE to public using (is_org_member(organization_id));
create policy task_labor_yields_insert on public.task_labor_yields as PERMISSIVE for INSERT to public with check ((task_id IN ( SELECT t.id FROM (tasks t JOIN organization_members om ON ((om.organization_id = t.organization_id))) WHERE (om.user_id = auth.uid()))));
create policy task_labor_yields_insert_member on public.task_labor_yields as PERMISSIVE for INSERT to authenticated with check (is_org_member(organization_id));
create policy task_labor_yields_update on public.task_labor_yields as PERMISSIVE for UPDATE to public using ((task_id IN ( SELECT t.id FROM (tasks t JOIN organization_members om ON ((om.organization_id = t.organization_id))) WHERE (om.user_id = auth.uid())))) with check ((task_id IN ( SELECT t.id FROM (tasks t JOIN organization_members om ON ((om.organization_id = t.organization_id))) WHERE (om.user_id = auth.uid()))));
create policy task_labor_yields_update_member on public.task_labor_yields as PERMISSIVE for UPDATE to public using (is_org_member(organization_id)) with check (is_org_member(organization_id));
create policy task_tool_yields_delete on public.task_tool_yields as PERMISSIVE for DELETE to public using ((task_id IN ( SELECT t.id FROM (tasks t JOIN organization_members om ON ((om.organization_id = t.organization_id))) WHERE (om.user_id = auth.uid()))));
create policy task_tool_yields_delete_member on public.task_tool_yields as PERMISSIVE for DELETE to public using (is_org_member(organization_id));
create policy task_tool_yields_insert on public.task_tool_yields as PERMISSIVE for INSERT to public with check ((task_id IN ( SELECT t.id FROM (tasks t JOIN organization_members om ON ((om.organization_id = t.organization_id))) WHERE (om.user_id = auth.uid()))));
create policy task_tool_yields_insert_member on public.task_tool_yields as PERMISSIVE for INSERT to authenticated with check (is_org_member(organization_id));
create policy task_tool_yields_update on public.task_tool_yields as PERMISSIVE for UPDATE to public using ((task_id IN ( SELECT t.id FROM (tasks t JOIN organization_members om ON ((om.organization_id = t.organization_id))) WHERE (om.user_id = auth.uid())))) with check ((task_id IN ( SELECT t.id FROM (tasks t JOIN organization_members om ON ((om.organization_id = t.organization_id))) WHERE (om.user_id = auth.uid()))));
create policy task_tool_yields_update_member on public.task_tool_yields as PERMISSIVE for UPDATE to public using (is_org_member(organization_id)) with check (is_org_member(organization_id));
create policy task_yields_delete on public.task_yields as PERMISSIVE for DELETE to public using ((task_id IN ( SELECT t.id FROM (tasks t JOIN organization_members om ON ((om.organization_id = t.organization_id))) WHERE (om.user_id = auth.uid()))));
create policy task_yields_delete_member on public.task_yields as PERMISSIVE for DELETE to public using (is_org_member(organization_id));
create policy task_yields_insert on public.task_yields as PERMISSIVE for INSERT to public with check ((task_id IN ( SELECT t.id FROM (tasks t JOIN organization_members om ON ((om.organization_id = t.organization_id))) WHERE (om.user_id = auth.uid()))));
create policy task_yields_insert_member on public.task_yields as PERMISSIVE for INSERT to authenticated with check (is_org_member(organization_id));
create policy task_yields_update on public.task_yields as PERMISSIVE for UPDATE to public using ((task_id IN ( SELECT t.id FROM (tasks t JOIN organization_members om ON ((om.organization_id = t.organization_id))) WHERE (om.user_id = auth.uid())))) with check ((task_id IN ( SELECT t.id FROM (tasks t JOIN organization_members om ON ((om.organization_id = t.organization_id))) WHERE (om.user_id = auth.uid()))));
create policy task_yields_update_member on public.task_yields as PERMISSIVE for UPDATE to public using (is_org_member(organization_id)) with check (is_org_member(organization_id));
create policy tasks_delete on public.tasks as PERMISSIVE for DELETE to public using ((organization_id IN ( SELECT organization_members.organization_id FROM organization_members WHERE (organization_members.user_id = auth.uid()))));
create policy tasks_delete_member on public.tasks as PERMISSIVE for DELETE to public using (is_org_member(organization_id));
create policy tasks_insert on public.tasks as PERMISSIVE for INSERT to public with check ((organization_id IN ( SELECT organization_members.organization_id FROM organization_members WHERE (organization_members.user_id = auth.uid()))));
create policy tasks_insert_member on public.tasks as PERMISSIVE for INSERT to authenticated with check (is_org_member(organization_id));
create policy tasks_update on public.tasks as PERMISSIVE for UPDATE to public using ((organization_id IN ( SELECT organization_members.organization_id FROM organization_members WHERE (organization_members.user_id = auth.uid())))) with check ((organization_id IN ( SELECT organization_members.organization_id FROM organization_members WHERE (organization_members.user_id = auth.uid()))));
create policy tasks_update_member on public.tasks as PERMISSIVE for UPDATE to public using (is_org_member(organization_id)) with check (is_org_member(organization_id));
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
alter table public.invitations drop constraint if exists invitations_role_check;
create or replace function public.accept_invitation(p_token text) returns json language plpgsql security definer set search_path to 'public' as $$
declare v_inv invitations%rowtype; v_user_id uuid := auth.uid();
begin
  select * into v_inv from invitations where token = p_token;
  if not found then return json_build_object('error', 'Invitación no encontrada.'); end if;
  if v_inv.accepted_at is not null then return json_build_object('error', 'Esta invitación ya fue utilizada.'); end if;
  if v_inv.expires_at < now() then return json_build_object('error', 'La invitación ha expirado.'); end if;
  if exists (select 1 from organization_members where organization_id = v_inv.organization_id and user_id = v_user_id) then
    return json_build_object('error', 'Ya sos miembro de esta organización.');
  end if;
  insert into organization_members (user_id, organization_id, role) values (v_user_id, v_inv.organization_id, v_inv.role);
  update invitations set accepted_at = now(), accepted_by = v_user_id where id = v_inv.id;
  return json_build_object('ok', true, 'organization_id', v_inv.organization_id::text);
end; $$;
commit;
