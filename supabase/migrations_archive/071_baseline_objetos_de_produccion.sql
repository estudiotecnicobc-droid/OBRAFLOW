-- =============================================================================
-- Migración 071: objetos de producción que no estaban en el repo (Tanda 1)
--
-- Relevados en producción el 31/10/2026 (solo lectura). En producción ya existen
-- tal cual: aplicar esta migración allí no cambia nada. Sirve para que el repo
-- reconstruya la base real (funciones auxiliares, políticas *_member, triggers).
--
-- No incluye las políticas peligrosas que elimina la 070
-- (organization_members_*_authenticated, members_insert, members_update,
-- organizations_insert_authenticated) ni members_delete (redefinida en la 070).
--
-- Idempotente.
-- =============================================================================


CREATE OR REPLACE FUNCTION public.get_my_admin_organization_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
    SELECT organization_id
    FROM public.organization_members
    WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
  $function$;

CREATE OR REPLACE FUNCTION public.get_my_org_ids_text()
 RETURNS TABLE(org_id text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT organization_id::text
    FROM public.organization_members
    WHERE user_id = auth.uid();
  $function$;

CREATE OR REPLACE FUNCTION public.get_my_organization_ids()
 RETURNS TABLE(org_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT organization_id
    FROM public.organization_members
    WHERE user_id = auth.uid();
  $function$;

CREATE OR REPLACE FUNCTION public.get_org_uuid(slug text)
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select id from organizations where organizations.slug = get_org_uuid.slug
$function$;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
  begin new.updated_at = now(); return new; end;
  $function$;

CREATE OR REPLACE FUNCTION public.is_member_of_org(p_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.user_id = auth.uid()
      AND om.organization_id = p_org_id
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_org_admin(p_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  );
$function$;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_profile_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.email := (SELECT email FROM auth.users WHERE id = NEW.id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS master_materials_updated_at ON public.master_materials;
CREATE TRIGGER master_materials_updated_at BEFORE UPDATE ON public.master_materials FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS trg_sync_profile_email ON public.profiles;
CREATE TRIGGER trg_sync_profile_email BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION sync_profile_email();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'ensure_rls') THEN
    CREATE EVENT TRIGGER ensure_rls ON ddl_command_end
      WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      EXECUTE FUNCTION public.rls_auto_enable();
  END IF;
END $$;


-- ── Políticas *_member (tablas con organization_id) ──────────────────────

DROP POLICY IF EXISTS budget_items_delete_member ON public.budget_items;
CREATE POLICY budget_items_delete_member ON public.budget_items AS PERMISSIVE FOR DELETE TO public
  USING (is_org_member(organization_id));

DROP POLICY IF EXISTS budget_items_insert_member ON public.budget_items;
CREATE POLICY budget_items_insert_member ON public.budget_items AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (is_org_member(organization_id));

DROP POLICY IF EXISTS budget_items_select_member ON public.budget_items;
CREATE POLICY budget_items_select_member ON public.budget_items AS PERMISSIVE FOR SELECT TO public
  USING (is_org_member(organization_id));

DROP POLICY IF EXISTS budget_items_update_member ON public.budget_items;
CREATE POLICY budget_items_update_member ON public.budget_items AS PERMISSIVE FOR UPDATE TO public
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

DROP POLICY IF EXISTS budget_templates_delete_member ON public.budget_templates;
CREATE POLICY budget_templates_delete_member ON public.budget_templates AS PERMISSIVE FOR DELETE TO public
  USING (is_org_member(organization_id));

DROP POLICY IF EXISTS budget_templates_insert_member ON public.budget_templates;
CREATE POLICY budget_templates_insert_member ON public.budget_templates AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (is_org_member(organization_id));

DROP POLICY IF EXISTS budget_templates_select_member ON public.budget_templates;
CREATE POLICY budget_templates_select_member ON public.budget_templates AS PERMISSIVE FOR SELECT TO public
  USING (is_org_member(organization_id));

DROP POLICY IF EXISTS budget_templates_update_member ON public.budget_templates;
CREATE POLICY budget_templates_update_member ON public.budget_templates AS PERMISSIVE FOR UPDATE TO public
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

DROP POLICY IF EXISTS master_tasks_delete_member ON public.master_tasks;
CREATE POLICY master_tasks_delete_member ON public.master_tasks AS PERMISSIVE FOR DELETE TO public
  USING (is_org_member(organization_id));

DROP POLICY IF EXISTS master_tasks_insert_member ON public.master_tasks;
CREATE POLICY master_tasks_insert_member ON public.master_tasks AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (is_org_member(organization_id));

DROP POLICY IF EXISTS master_tasks_select_member ON public.master_tasks;
CREATE POLICY master_tasks_select_member ON public.master_tasks AS PERMISSIVE FOR SELECT TO public
  USING (is_org_member(organization_id));

DROP POLICY IF EXISTS master_tasks_update_member ON public.master_tasks;
CREATE POLICY master_tasks_update_member ON public.master_tasks AS PERMISSIVE FOR UPDATE TO public
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

DROP POLICY IF EXISTS projects_delete_member ON public.projects;
CREATE POLICY projects_delete_member ON public.projects AS PERMISSIVE FOR DELETE TO public
  USING (is_org_member(organization_id));

DROP POLICY IF EXISTS projects_insert_member ON public.projects;
CREATE POLICY projects_insert_member ON public.projects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (is_org_member(organization_id));

DROP POLICY IF EXISTS projects_select_member ON public.projects;
CREATE POLICY projects_select_member ON public.projects AS PERMISSIVE FOR SELECT TO public
  USING (is_org_member(organization_id));

DROP POLICY IF EXISTS projects_update_member ON public.projects;
CREATE POLICY projects_update_member ON public.projects AS PERMISSIVE FOR UPDATE TO public
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

DROP POLICY IF EXISTS task_labor_yields_delete_member ON public.task_labor_yields;
CREATE POLICY task_labor_yields_delete_member ON public.task_labor_yields AS PERMISSIVE FOR DELETE TO public
  USING (is_org_member(organization_id));

DROP POLICY IF EXISTS task_labor_yields_insert_member ON public.task_labor_yields;
CREATE POLICY task_labor_yields_insert_member ON public.task_labor_yields AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (is_org_member(organization_id));

DROP POLICY IF EXISTS task_labor_yields_select_member ON public.task_labor_yields;
CREATE POLICY task_labor_yields_select_member ON public.task_labor_yields AS PERMISSIVE FOR SELECT TO public
  USING (is_org_member(organization_id));

DROP POLICY IF EXISTS task_labor_yields_update_member ON public.task_labor_yields;
CREATE POLICY task_labor_yields_update_member ON public.task_labor_yields AS PERMISSIVE FOR UPDATE TO public
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

DROP POLICY IF EXISTS task_tool_yields_delete_member ON public.task_tool_yields;
CREATE POLICY task_tool_yields_delete_member ON public.task_tool_yields AS PERMISSIVE FOR DELETE TO public
  USING (is_org_member(organization_id));

DROP POLICY IF EXISTS task_tool_yields_insert_member ON public.task_tool_yields;
CREATE POLICY task_tool_yields_insert_member ON public.task_tool_yields AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (is_org_member(organization_id));

DROP POLICY IF EXISTS task_tool_yields_select_member ON public.task_tool_yields;
CREATE POLICY task_tool_yields_select_member ON public.task_tool_yields AS PERMISSIVE FOR SELECT TO public
  USING (is_org_member(organization_id));

DROP POLICY IF EXISTS task_tool_yields_update_member ON public.task_tool_yields;
CREATE POLICY task_tool_yields_update_member ON public.task_tool_yields AS PERMISSIVE FOR UPDATE TO public
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

DROP POLICY IF EXISTS task_yields_delete_member ON public.task_yields;
CREATE POLICY task_yields_delete_member ON public.task_yields AS PERMISSIVE FOR DELETE TO public
  USING (is_org_member(organization_id));

DROP POLICY IF EXISTS task_yields_insert_member ON public.task_yields;
CREATE POLICY task_yields_insert_member ON public.task_yields AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (is_org_member(organization_id));

DROP POLICY IF EXISTS task_yields_select_member ON public.task_yields;
CREATE POLICY task_yields_select_member ON public.task_yields AS PERMISSIVE FOR SELECT TO public
  USING (is_org_member(organization_id));

DROP POLICY IF EXISTS task_yields_update_member ON public.task_yields;
CREATE POLICY task_yields_update_member ON public.task_yields AS PERMISSIVE FOR UPDATE TO public
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

DROP POLICY IF EXISTS tasks_delete_member ON public.tasks;
CREATE POLICY tasks_delete_member ON public.tasks AS PERMISSIVE FOR DELETE TO public
  USING (is_org_member(organization_id));

DROP POLICY IF EXISTS tasks_insert_member ON public.tasks;
CREATE POLICY tasks_insert_member ON public.tasks AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (is_org_member(organization_id));

DROP POLICY IF EXISTS tasks_select_member ON public.tasks;
CREATE POLICY tasks_select_member ON public.tasks AS PERMISSIVE FOR SELECT TO public
  USING (is_org_member(organization_id));

DROP POLICY IF EXISTS tasks_update_member ON public.tasks;
CREATE POLICY tasks_update_member ON public.tasks AS PERMISSIVE FOR UPDATE TO public
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));


-- ── Políticas *_member (tablas hijas) ─────────────────────────────────────

DROP POLICY IF EXISTS budget_template_items_delete_member ON public.budget_template_items;
CREATE POLICY budget_template_items_delete_member ON public.budget_template_items AS PERMISSIVE FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM budget_templates bt WHERE bt.id = budget_template_items.budget_template_id AND is_org_member(bt.organization_id)));

DROP POLICY IF EXISTS budget_template_items_insert_member ON public.budget_template_items;
CREATE POLICY budget_template_items_insert_member ON public.budget_template_items AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM budget_templates bt WHERE bt.id = budget_template_items.budget_template_id AND is_org_member(bt.organization_id)));

DROP POLICY IF EXISTS budget_template_items_select_member ON public.budget_template_items;
CREATE POLICY budget_template_items_select_member ON public.budget_template_items AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM budget_templates bt WHERE bt.id = budget_template_items.budget_template_id AND is_org_member(bt.organization_id)));

DROP POLICY IF EXISTS budget_template_items_update_member ON public.budget_template_items;
CREATE POLICY budget_template_items_update_member ON public.budget_template_items AS PERMISSIVE FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM budget_templates bt WHERE bt.id = budget_template_items.budget_template_id AND is_org_member(bt.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM budget_templates bt WHERE bt.id = budget_template_items.budget_template_id AND is_org_member(bt.organization_id)));

DROP POLICY IF EXISTS master_task_equipment_delete_member ON public.master_task_equipment;
CREATE POLICY master_task_equipment_delete_member ON public.master_task_equipment AS PERMISSIVE FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM master_tasks mt WHERE mt.id = master_task_equipment.master_task_id AND is_org_member(mt.organization_id)));

DROP POLICY IF EXISTS master_task_equipment_insert_member ON public.master_task_equipment;
CREATE POLICY master_task_equipment_insert_member ON public.master_task_equipment AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM master_tasks mt WHERE mt.id = master_task_equipment.master_task_id AND is_org_member(mt.organization_id)));

DROP POLICY IF EXISTS master_task_equipment_select_member ON public.master_task_equipment;
CREATE POLICY master_task_equipment_select_member ON public.master_task_equipment AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM master_tasks mt WHERE mt.id = master_task_equipment.master_task_id AND is_org_member(mt.organization_id)));

DROP POLICY IF EXISTS master_task_equipment_update_member ON public.master_task_equipment;
CREATE POLICY master_task_equipment_update_member ON public.master_task_equipment AS PERMISSIVE FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM master_tasks mt WHERE mt.id = master_task_equipment.master_task_id AND is_org_member(mt.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM master_tasks mt WHERE mt.id = master_task_equipment.master_task_id AND is_org_member(mt.organization_id)));

DROP POLICY IF EXISTS master_task_labor_delete_member ON public.master_task_labor;
CREATE POLICY master_task_labor_delete_member ON public.master_task_labor AS PERMISSIVE FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM master_tasks mt WHERE mt.id = master_task_labor.master_task_id AND is_org_member(mt.organization_id)));

DROP POLICY IF EXISTS master_task_labor_insert_member ON public.master_task_labor;
CREATE POLICY master_task_labor_insert_member ON public.master_task_labor AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM master_tasks mt WHERE mt.id = master_task_labor.master_task_id AND is_org_member(mt.organization_id)));

DROP POLICY IF EXISTS master_task_labor_select_member ON public.master_task_labor;
CREATE POLICY master_task_labor_select_member ON public.master_task_labor AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM master_tasks mt WHERE mt.id = master_task_labor.master_task_id AND is_org_member(mt.organization_id)));

DROP POLICY IF EXISTS master_task_labor_update_member ON public.master_task_labor;
CREATE POLICY master_task_labor_update_member ON public.master_task_labor AS PERMISSIVE FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM master_tasks mt WHERE mt.id = master_task_labor.master_task_id AND is_org_member(mt.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM master_tasks mt WHERE mt.id = master_task_labor.master_task_id AND is_org_member(mt.organization_id)));

DROP POLICY IF EXISTS master_task_materials_delete_member ON public.master_task_materials;
CREATE POLICY master_task_materials_delete_member ON public.master_task_materials AS PERMISSIVE FOR DELETE TO public
  USING (EXISTS (SELECT 1 FROM master_tasks mt WHERE mt.id = master_task_materials.master_task_id AND is_org_member(mt.organization_id)));

DROP POLICY IF EXISTS master_task_materials_insert_member ON public.master_task_materials;
CREATE POLICY master_task_materials_insert_member ON public.master_task_materials AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM master_tasks mt WHERE mt.id = master_task_materials.master_task_id AND is_org_member(mt.organization_id)));

DROP POLICY IF EXISTS master_task_materials_select_member ON public.master_task_materials;
CREATE POLICY master_task_materials_select_member ON public.master_task_materials AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM master_tasks mt WHERE mt.id = master_task_materials.master_task_id AND is_org_member(mt.organization_id)));

DROP POLICY IF EXISTS master_task_materials_update_member ON public.master_task_materials;
CREATE POLICY master_task_materials_update_member ON public.master_task_materials AS PERMISSIVE FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM master_tasks mt WHERE mt.id = master_task_materials.master_task_id AND is_org_member(mt.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM master_tasks mt WHERE mt.id = master_task_materials.master_task_id AND is_org_member(mt.organization_id)));


-- ── Empresas, perfiles y miembros (lectura) ───────────────────────────────

DROP POLICY IF EXISTS organizations_select_member ON public.organizations;
CREATE POLICY organizations_select_member ON public.organizations AS PERMISSIVE FOR SELECT TO public
  USING (is_org_member(id));

DROP POLICY IF EXISTS organizations_update_member ON public.organizations;
CREATE POLICY organizations_update_member ON public.organizations AS PERMISSIVE FOR UPDATE TO public
  USING (is_org_member(id))
  WITH CHECK (is_org_member(id));

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING (id = auth.uid() OR id IN (SELECT om.user_id FROM organization_members om WHERE om.organization_id IN (SELECT get_my_organization_ids.org_id FROM get_my_organization_ids() get_my_organization_ids(org_id))));

DROP POLICY IF EXISTS members_select ON public.organization_members;
CREATE POLICY members_select ON public.organization_members AS PERMISSIVE FOR SELECT TO authenticated
  USING (organization_id IN (SELECT get_my_organization_ids.org_id FROM get_my_organization_ids() get_my_organization_ids(org_id)));

DROP POLICY IF EXISTS organization_members_select_own ON public.organization_members;
CREATE POLICY organization_members_select_own ON public.organization_members AS PERMISSIVE FOR SELECT TO public
  USING (user_id = auth.uid());
