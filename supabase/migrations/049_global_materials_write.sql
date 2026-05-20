-- 049_global_materials_write.sql
-- Adds INSERT/UPDATE/DELETE RLS policies on master_materials
-- for rows where organization_id IS NULL (global catalog).
-- Requires migration 048 (is_master_admin() function).

BEGIN;

DROP POLICY IF EXISTS "master_materials_insert_global_admin" ON public.master_materials;
DROP POLICY IF EXISTS "master_materials_update_global_admin" ON public.master_materials;
DROP POLICY IF EXISTS "master_materials_delete_global_admin" ON public.master_materials;

CREATE POLICY "master_materials_insert_global_admin" ON public.master_materials
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IS NULL AND is_master_admin());

CREATE POLICY "master_materials_update_global_admin" ON public.master_materials
  FOR UPDATE TO authenticated
  USING     (organization_id IS NULL AND is_master_admin())
  WITH CHECK (organization_id IS NULL AND is_master_admin());

CREATE POLICY "master_materials_delete_global_admin" ON public.master_materials
  FOR DELETE TO authenticated
  USING (organization_id IS NULL AND is_master_admin());

COMMIT;
