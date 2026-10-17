-- 050_allow_null_organization_id_in_master_materials.sql
-- Allows organization_id to be NULL in master_materials so that
-- global catalog rows (master_admin only, gated by migration 049 RLS)
-- can be stored without an owning organization.

ALTER TABLE public.master_materials
  ALTER COLUMN organization_id DROP NOT NULL;
