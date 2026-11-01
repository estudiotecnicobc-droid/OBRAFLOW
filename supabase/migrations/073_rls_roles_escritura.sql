-- 073 · Escritura solo para owner/admin/editor (el rol viewer = 'cliente' en la app queda de solo lectura)
--       + invitaciones no pueden otorgar rol owner.
-- Antes: las políticas *_member de INSERT/UPDATE/DELETE pedían solo membresía (is_org_member), y además
-- había políticas legacy duplicadas (basadas en organization_members/projects) que también dejaban escribir
-- a cualquier miembro. Como las políticas permisivas se combinan con OR, se eliminan las legacy.
-- Al 31/10/2026 no hay miembros viewer en producción: no cambia nada para los usuarios actuales.

begin;

-- projects
drop policy if exists projects_insert_member on public.projects;
drop policy if exists projects_update_member on public.projects;
drop policy if exists projects_delete_member on public.projects;
create policy projects_insert_member on public.projects for insert to authenticated with check (public.is_org_member_with_role(organization_id, array['owner','admin','editor']::text[]));
create policy projects_update_member on public.projects for update to authenticated using (public.is_org_member_with_role(organization_id, array['owner','admin','editor']::text[])) with check (public.is_org_member_with_role(organization_id, array['owner','admin','editor']::text[]));
create policy projects_delete_member on public.projects for delete to authenticated using (public.is_org_member_with_role(organization_id, array['owner','admin','editor']::text[]));

-- tasks
drop policy if exists tasks_delete on public.tasks;
drop policy if exists tasks_insert on public.tasks;
drop policy if exists tasks_update on public.tasks;
drop policy if exists tasks_insert_member on public.tasks;
drop policy if exists tasks_update_member on public.tasks;
drop policy if exists tasks_delete_member on public.tasks;
create policy tasks_insert_member on public.tasks for insert to authenticated with check (public.is_org_member_with_role(organization_id, array['owner','admin','editor']::text[]));
create policy tasks_update_member on public.tasks for update to authenticated using (public.is_org_member_with_role(organization_id, array['owner','admin','editor']::text[])) with check (public.is_org_member_with_role(organization_id, array['owner','admin','editor']::text[]));
create policy tasks_delete_member on public.tasks for delete to authenticated using (public.is_org_member_with_role(organization_id, array['owner','admin','editor']::text[]));

-- budget_items
drop policy if exists budget_items_delete on public.budget_items;
drop policy if exists budget_items_insert on public.budget_items;
drop policy if exists budget_items_update on public.budget_items;
drop policy if exists budget_items_insert_member on public.budget_items;
drop policy if exists budget_items_update_member on public.budget_items;
drop policy if exists budget_items_delete_member on public.budget_items;
create policy budget_items_insert_member on public.budget_items for insert to authenticated with check (public.is_org_member_with_role(organization_id, array['owner','admin','editor']::text[]));
create policy budget_items_update_member on public.budget_items for update to authenticated using (public.is_org_member_with_role(organization_id, array['owner','admin','editor']::text[])) with check (public.is_org_member_with_role(organization_id, array['owner','admin','editor']::text[]));
create policy budget_items_delete_member on public.budget_items for delete to authenticated using (public.is_org_member_with_role(organization_id, array['owner','admin','editor']::text[]));

-- budget_templates
drop policy if exists budget_templates_insert_member on public.budget_templates;
drop policy if exists budget_templates_update_member on public.budget_templates;
drop policy if exists budget_templates_delete_member on public.budget_templates;
create policy budget_templates_insert_member on public.budget_templates for insert to authenticated with check (public.is_org_member_with_role(organization_id, array['owner','admin','editor']::text[]));
create policy budget_templates_update_member on public.budget_templates for update to authenticated using (public.is_org_member_with_role(organization_id, array['owner','admin','editor']::text[])) with check (public.is_org_member_with_role(organization_id, array['owner','admin','editor']::text[]));
create policy budget_templates_delete_member on public.budget_templates for delete to authenticated using (public.is_org_member_with_role(organization_id, array['owner','admin','editor']::text[]));

-- master_tasks
drop policy if exists master_tasks_insert_member on public.master_tasks;
drop policy if exists master_tasks_update_member on public.master_tasks;
drop policy if exists master_tasks_delete_member on public.master_tasks;
create policy master_tasks_insert_member on public.master_tasks for insert to authenticated with check (public.is_org_member_with_role(organization_id, array['owner','admin','editor']::text[]));
create policy master_tasks_update_member on public.master_tasks for update to authenticated using (public.is_org_member_with_role(organization_id, array['owner','admin','editor']::text[])) with check (public.is_org_member_with_role(organization_id, array['owner','admin','editor']::text[]));
create policy master_tasks_delete_member on public.master_tasks for delete to authenticated using (public.is_org_member_with_role(organization_id, array['owner','admin','editor']::text[]));

-- task_yields
drop policy if exists task_yields_delete on public.task_yields;
drop policy if exists task_yields_insert on public.task_yields;
drop policy if exists task_yields_update on public.task_yields;
drop policy if exists task_yields_insert_member on public.task_yields;
drop policy if exists task_yields_update_member on public.task_yields;
drop policy if exists task_yields_delete_member on public.task_yields;
create policy task_yields_insert_member on public.task_yields for insert to authenticated with check (public.is_org_member_with_role(organization_id, array['owner','admin','editor']::text[]));
create policy task_yields_update_member on public.task_yields for update to authenticated using (public.is_org_member_with_role(organization_id, array['owner','admin','editor']::text[])) with check (public.is_org_member_with_role(organization_id, array['owner','admin','editor']::text[]));
create policy task_yields_delete_member on public.task_yields for delete to authenticated using (public.is_org_member_with_role(organization_id, array['owner','admin','editor']::text[]));

-- task_labor_yields
drop policy if exists task_labor_yields_delete on public.task_labor_yields;
drop policy if exists task_labor_yields_insert on public.task_labor_yields;
drop policy if exists task_labor_yields_update on public.task_labor_yields;
drop policy if exists task_labor_yields_insert_member on public.task_labor_yields;
drop policy if exists task_labor_yields_update_member on public.task_labor_yields;
drop policy if exists task_labor_yields_delete_member on public.task_labor_yields;
create policy task_labor_yields_insert_member on public.task_labor_yields for insert to authenticated with check (public.is_org_member_with_role(organization_id, array['owner','admin','editor']::text[]));
create policy task_labor_yields_update_member on public.task_labor_yields for update to authenticated using (public.is_org_member_with_role(organization_id, array['owner','admin','editor']::text[])) with check (public.is_org_member_with_role(organization_id, array['owner','admin','editor']::text[]));
create policy task_labor_yields_delete_member on public.task_labor_yields for delete to authenticated using (public.is_org_member_with_role(organization_id, array['owner','admin','editor']::text[]));

-- task_tool_yields
drop policy if exists task_tool_yields_delete on public.task_tool_yields;
drop policy if exists task_tool_yields_insert on public.task_tool_yields;
drop policy if exists task_tool_yields_update on public.task_tool_yields;
drop policy if exists task_tool_yields_insert_member on public.task_tool_yields;
drop policy if exists task_tool_yields_update_member on public.task_tool_yields;
drop policy if exists task_tool_yields_delete_member on public.task_tool_yields;
create policy task_tool_yields_insert_member on public.task_tool_yields for insert to authenticated with check (public.is_org_member_with_role(organization_id, array['owner','admin','editor']::text[]));
create policy task_tool_yields_update_member on public.task_tool_yields for update to authenticated using (public.is_org_member_with_role(organization_id, array['owner','admin','editor']::text[])) with check (public.is_org_member_with_role(organization_id, array['owner','admin','editor']::text[]));
create policy task_tool_yields_delete_member on public.task_tool_yields for delete to authenticated using (public.is_org_member_with_role(organization_id, array['owner','admin','editor']::text[]));

-- budget_template_items
drop policy if exists budget_template_items_insert_member on public.budget_template_items;
drop policy if exists budget_template_items_update_member on public.budget_template_items;
drop policy if exists budget_template_items_delete_member on public.budget_template_items;
create policy budget_template_items_insert_member on public.budget_template_items for insert to authenticated with check (exists (select 1 from public.budget_templates bt where bt.id = budget_template_items.budget_template_id and public.is_org_member_with_role(bt.organization_id, array['owner','admin','editor']::text[])));
create policy budget_template_items_update_member on public.budget_template_items for update to authenticated using (exists (select 1 from public.budget_templates bt where bt.id = budget_template_items.budget_template_id and public.is_org_member_with_role(bt.organization_id, array['owner','admin','editor']::text[]))) with check (exists (select 1 from public.budget_templates bt where bt.id = budget_template_items.budget_template_id and public.is_org_member_with_role(bt.organization_id, array['owner','admin','editor']::text[])));
create policy budget_template_items_delete_member on public.budget_template_items for delete to authenticated using (exists (select 1 from public.budget_templates bt where bt.id = budget_template_items.budget_template_id and public.is_org_member_with_role(bt.organization_id, array['owner','admin','editor']::text[])));

-- master_task_materials
drop policy if exists master_task_materials_insert_member on public.master_task_materials;
drop policy if exists master_task_materials_update_member on public.master_task_materials;
drop policy if exists master_task_materials_delete_member on public.master_task_materials;
create policy master_task_materials_insert_member on public.master_task_materials for insert to authenticated with check (exists (select 1 from public.master_tasks mt where mt.id = master_task_materials.master_task_id and public.is_org_member_with_role(mt.organization_id, array['owner','admin','editor']::text[])));
create policy master_task_materials_update_member on public.master_task_materials for update to authenticated using (exists (select 1 from public.master_tasks mt where mt.id = master_task_materials.master_task_id and public.is_org_member_with_role(mt.organization_id, array['owner','admin','editor']::text[]))) with check (exists (select 1 from public.master_tasks mt where mt.id = master_task_materials.master_task_id and public.is_org_member_with_role(mt.organization_id, array['owner','admin','editor']::text[])));
create policy master_task_materials_delete_member on public.master_task_materials for delete to authenticated using (exists (select 1 from public.master_tasks mt where mt.id = master_task_materials.master_task_id and public.is_org_member_with_role(mt.organization_id, array['owner','admin','editor']::text[])));

-- master_task_labor
drop policy if exists master_task_labor_insert_member on public.master_task_labor;
drop policy if exists master_task_labor_update_member on public.master_task_labor;
drop policy if exists master_task_labor_delete_member on public.master_task_labor;
create policy master_task_labor_insert_member on public.master_task_labor for insert to authenticated with check (exists (select 1 from public.master_tasks mt where mt.id = master_task_labor.master_task_id and public.is_org_member_with_role(mt.organization_id, array['owner','admin','editor']::text[])));
create policy master_task_labor_update_member on public.master_task_labor for update to authenticated using (exists (select 1 from public.master_tasks mt where mt.id = master_task_labor.master_task_id and public.is_org_member_with_role(mt.organization_id, array['owner','admin','editor']::text[]))) with check (exists (select 1 from public.master_tasks mt where mt.id = master_task_labor.master_task_id and public.is_org_member_with_role(mt.organization_id, array['owner','admin','editor']::text[])));
create policy master_task_labor_delete_member on public.master_task_labor for delete to authenticated using (exists (select 1 from public.master_tasks mt where mt.id = master_task_labor.master_task_id and public.is_org_member_with_role(mt.organization_id, array['owner','admin','editor']::text[])));

-- master_task_equipment
drop policy if exists master_task_equipment_insert_member on public.master_task_equipment;
drop policy if exists master_task_equipment_update_member on public.master_task_equipment;
drop policy if exists master_task_equipment_delete_member on public.master_task_equipment;
create policy master_task_equipment_insert_member on public.master_task_equipment for insert to authenticated with check (exists (select 1 from public.master_tasks mt where mt.id = master_task_equipment.master_task_id and public.is_org_member_with_role(mt.organization_id, array['owner','admin','editor']::text[])));
create policy master_task_equipment_update_member on public.master_task_equipment for update to authenticated using (exists (select 1 from public.master_tasks mt where mt.id = master_task_equipment.master_task_id and public.is_org_member_with_role(mt.organization_id, array['owner','admin','editor']::text[]))) with check (exists (select 1 from public.master_tasks mt where mt.id = master_task_equipment.master_task_id and public.is_org_member_with_role(mt.organization_id, array['owner','admin','editor']::text[])));
create policy master_task_equipment_delete_member on public.master_task_equipment for delete to authenticated using (exists (select 1 from public.master_tasks mt where mt.id = master_task_equipment.master_task_id and public.is_org_member_with_role(mt.organization_id, array['owner','admin','editor']::text[])));

-- task_crew_yields
drop policy if exists task_crew_yields_insert_member on public.task_crew_yields;
drop policy if exists task_crew_yields_update_member on public.task_crew_yields;
drop policy if exists task_crew_yields_delete_member on public.task_crew_yields;
create policy task_crew_yields_insert_member on public.task_crew_yields for insert to authenticated with check (exists (select 1 from public.tasks t join public.crews c on c.organization_id = t.organization_id::text where t.id::text = task_crew_yields.task_id and c.id = task_crew_yields.crew_id and public.is_org_member_with_role(t.organization_id, array['owner','admin','editor']::text[])));
create policy task_crew_yields_update_member on public.task_crew_yields for update to authenticated using (exists (select 1 from public.tasks t where t.id::text = task_crew_yields.task_id and public.is_org_member_with_role(t.organization_id, array['owner','admin','editor']::text[]))) with check (exists (select 1 from public.tasks t join public.crews c on c.organization_id = t.organization_id::text where t.id::text = task_crew_yields.task_id and c.id = task_crew_yields.crew_id and public.is_org_member_with_role(t.organization_id, array['owner','admin','editor']::text[])));
create policy task_crew_yields_delete_member on public.task_crew_yields for delete to authenticated using (exists (select 1 from public.tasks t where t.id::text = task_crew_yields.task_id and public.is_org_member_with_role(t.organization_id, array['owner','admin','editor']::text[])));

-- organizations: renombrar la empresa solo owner/admin
drop policy if exists organizations_update_member on public.organizations;
create policy organizations_update_member on public.organizations for update to authenticated using (public.is_org_admin(id)) with check (public.is_org_admin(id));

-- invitaciones: nunca otorgan owner
alter table public.invitations add constraint invitations_role_check check (role in ('admin','editor','viewer'));

create or replace function public.accept_invitation(p_token text) returns json language plpgsql security definer set search_path to 'public' as $$
declare v_inv invitations%rowtype; v_user_id uuid := auth.uid();
begin
  if v_user_id is null then return json_build_object('error', 'No autenticado.'); end if;
  select * into v_inv from invitations where token = p_token for update;
  if not found then return json_build_object('error', 'Invitación no encontrada.'); end if;
  if v_inv.accepted_at is not null then return json_build_object('error', 'Esta invitación ya fue utilizada.'); end if;
  if v_inv.expires_at < now() then return json_build_object('error', 'La invitación ha expirado.'); end if;
  if v_inv.role not in ('admin','editor','viewer') then return json_build_object('error', 'Rol de invitación inválido.'); end if;
  if exists (select 1 from organization_members where organization_id = v_inv.organization_id and user_id = v_user_id) then
    return json_build_object('error', 'Ya sos miembro de esta organización.');
  end if;
  insert into organization_members (user_id, organization_id, role) values (v_user_id, v_inv.organization_id, v_inv.role);
  update invitations set accepted_at = now(), accepted_by = v_user_id where id = v_inv.id;
  return json_build_object('ok', true, 'organization_id', v_inv.organization_id::text);
end; $$;

commit;
