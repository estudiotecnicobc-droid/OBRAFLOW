-- 048_master_admin_audit.sql
-- Adds system-level roles, is_master_admin() helper, audit_log table,
-- write RLS for global catalog (organization_id IS NULL), and audit triggers.
--
-- Scope:
--   · profiles.system_role: 'master_admin' | 'tester' | 'user' (default 'user')
--   · is_master_admin(): checks profiles.system_role for auth.uid()
--   · audit_log: automatic capture of INSERT/UPDATE/DELETE on master_tasks + master_materials
--   · master_tasks global: INSERT/UPDATE/DELETE allowed only for master_admin
--   · master_task subtables global: same guard
--   · master_materials: master_admin can SELECT across all orgs

BEGIN;

-- ─── 1. system_role column on profiles ───────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS system_role text NOT NULL DEFAULT 'user'
  CONSTRAINT profiles_system_role_check
    CHECK (system_role IN ('master_admin', 'tester', 'user'));

-- ─── 2. is_master_admin() helper ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_master_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND system_role = 'master_admin'
  );
$$;

-- ─── 3. audit_log table ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.audit_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  operation   text        NOT NULL
    CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE', 'MANUAL')),
  entity      text        NOT NULL,
  entity_id   text        NOT NULL,
  before_data jsonb,
  after_data  jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_insert_own"           ON public.audit_log;
DROP POLICY IF EXISTS "audit_log_select_master_admin"  ON public.audit_log;

-- Any authenticated user can insert their own log entries (actor must match self)
CREATE POLICY "audit_log_insert_own" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

-- Only master_admin can read all audit entries
CREATE POLICY "audit_log_select_master_admin" ON public.audit_log
  FOR SELECT TO authenticated
  USING (is_master_admin());

-- ─── 4. Trigger function for automatic catalog audit ─────────────────────────

CREATE OR REPLACE FUNCTION public.audit_master_catalog()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_log
    (actor_id, operation, entity, entity_id, before_data, after_data)
  VALUES (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    COALESCE((NEW.id)::text, (OLD.id)::text),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW)  ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS audit_master_tasks_catalog     ON public.master_tasks;
DROP TRIGGER IF EXISTS audit_master_materials_catalog ON public.master_materials;

CREATE TRIGGER audit_master_tasks_catalog
  AFTER INSERT OR UPDATE OR DELETE ON public.master_tasks
  FOR EACH ROW EXECUTE FUNCTION public.audit_master_catalog();

CREATE TRIGGER audit_master_materials_catalog
  AFTER INSERT OR UPDATE OR DELETE ON public.master_materials
  FOR EACH ROW EXECUTE FUNCTION public.audit_master_catalog();

-- ─── 5. Write policies for global master_tasks (organization_id IS NULL) ─────
-- Migration 007 defines SELECT and per-org write policies.
-- These new policies cover the global catalog rows for master_admin only.

DROP POLICY IF EXISTS "master_tasks_insert_global_admin" ON public.master_tasks;
DROP POLICY IF EXISTS "master_tasks_update_global_admin" ON public.master_tasks;
DROP POLICY IF EXISTS "master_tasks_delete_global_admin" ON public.master_tasks;

CREATE POLICY "master_tasks_insert_global_admin" ON public.master_tasks
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IS NULL AND is_master_admin());

CREATE POLICY "master_tasks_update_global_admin" ON public.master_tasks
  FOR UPDATE TO authenticated
  USING     (organization_id IS NULL AND is_master_admin())
  WITH CHECK (organization_id IS NULL AND is_master_admin());

CREATE POLICY "master_tasks_delete_global_admin" ON public.master_tasks
  FOR DELETE TO authenticated
  USING (organization_id IS NULL AND is_master_admin());

-- ─── 6. Write policies for global catalog sub-tables ─────────────────────────
-- master_task_materials, master_task_labor, master_task_equipment
-- 007 restricts writes to IS NOT NULL orgs. Parallel policies for IS NULL rows.

-- master_task_materials
DROP POLICY IF EXISTS "master_task_materials_insert_global_admin" ON public.master_task_materials;
DROP POLICY IF EXISTS "master_task_materials_update_global_admin" ON public.master_task_materials;
DROP POLICY IF EXISTS "master_task_materials_delete_global_admin" ON public.master_task_materials;

CREATE POLICY "master_task_materials_insert_global_admin" ON public.master_task_materials
  FOR INSERT TO authenticated
  WITH CHECK (
    is_master_admin() AND
    EXISTS (
      SELECT 1 FROM public.master_tasks mt
      WHERE mt.id = master_task_id AND mt.organization_id IS NULL
    )
  );

CREATE POLICY "master_task_materials_update_global_admin" ON public.master_task_materials
  FOR UPDATE TO authenticated
  USING (
    is_master_admin() AND
    EXISTS (
      SELECT 1 FROM public.master_tasks mt
      WHERE mt.id = master_task_id AND mt.organization_id IS NULL
    )
  )
  WITH CHECK (
    is_master_admin() AND
    EXISTS (
      SELECT 1 FROM public.master_tasks mt
      WHERE mt.id = master_task_id AND mt.organization_id IS NULL
    )
  );

CREATE POLICY "master_task_materials_delete_global_admin" ON public.master_task_materials
  FOR DELETE TO authenticated
  USING (
    is_master_admin() AND
    EXISTS (
      SELECT 1 FROM public.master_tasks mt
      WHERE mt.id = master_task_id AND mt.organization_id IS NULL
    )
  );

-- master_task_labor
DROP POLICY IF EXISTS "master_task_labor_insert_global_admin" ON public.master_task_labor;
DROP POLICY IF EXISTS "master_task_labor_update_global_admin" ON public.master_task_labor;
DROP POLICY IF EXISTS "master_task_labor_delete_global_admin" ON public.master_task_labor;

CREATE POLICY "master_task_labor_insert_global_admin" ON public.master_task_labor
  FOR INSERT TO authenticated
  WITH CHECK (
    is_master_admin() AND
    EXISTS (
      SELECT 1 FROM public.master_tasks mt
      WHERE mt.id = master_task_id AND mt.organization_id IS NULL
    )
  );

CREATE POLICY "master_task_labor_update_global_admin" ON public.master_task_labor
  FOR UPDATE TO authenticated
  USING (
    is_master_admin() AND
    EXISTS (
      SELECT 1 FROM public.master_tasks mt
      WHERE mt.id = master_task_id AND mt.organization_id IS NULL
    )
  )
  WITH CHECK (
    is_master_admin() AND
    EXISTS (
      SELECT 1 FROM public.master_tasks mt
      WHERE mt.id = master_task_id AND mt.organization_id IS NULL
    )
  );

CREATE POLICY "master_task_labor_delete_global_admin" ON public.master_task_labor
  FOR DELETE TO authenticated
  USING (
    is_master_admin() AND
    EXISTS (
      SELECT 1 FROM public.master_tasks mt
      WHERE mt.id = master_task_id AND mt.organization_id IS NULL
    )
  );

-- master_task_equipment
DROP POLICY IF EXISTS "master_task_equipment_insert_global_admin" ON public.master_task_equipment;
DROP POLICY IF EXISTS "master_task_equipment_update_global_admin" ON public.master_task_equipment;
DROP POLICY IF EXISTS "master_task_equipment_delete_global_admin" ON public.master_task_equipment;

CREATE POLICY "master_task_equipment_insert_global_admin" ON public.master_task_equipment
  FOR INSERT TO authenticated
  WITH CHECK (
    is_master_admin() AND
    EXISTS (
      SELECT 1 FROM public.master_tasks mt
      WHERE mt.id = master_task_id AND mt.organization_id IS NULL
    )
  );

CREATE POLICY "master_task_equipment_update_global_admin" ON public.master_task_equipment
  FOR UPDATE TO authenticated
  USING (
    is_master_admin() AND
    EXISTS (
      SELECT 1 FROM public.master_tasks mt
      WHERE mt.id = master_task_id AND mt.organization_id IS NULL
    )
  )
  WITH CHECK (
    is_master_admin() AND
    EXISTS (
      SELECT 1 FROM public.master_tasks mt
      WHERE mt.id = master_task_id AND mt.organization_id IS NULL
    )
  );

CREATE POLICY "master_task_equipment_delete_global_admin" ON public.master_task_equipment
  FOR DELETE TO authenticated
  USING (
    is_master_admin() AND
    EXISTS (
      SELECT 1 FROM public.master_tasks mt
      WHERE mt.id = master_task_id AND mt.organization_id IS NULL
    )
  );

-- ─── 7. master_admin can read master_materials across all orgs ────────────────
-- Existing policies in 007 require org membership for SELECT.
-- master_admin needs cross-org visibility for auditing.

DROP POLICY IF EXISTS "master_materials_select_master_admin" ON public.master_materials;

CREATE POLICY "master_materials_select_master_admin" ON public.master_materials
  FOR SELECT TO authenticated
  USING (is_master_admin());

COMMIT;
