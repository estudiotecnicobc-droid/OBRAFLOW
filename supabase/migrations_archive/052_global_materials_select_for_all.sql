-- Migración 052: permite que usuarios autenticados lean materiales del catálogo global
-- (organization_id IS NULL, is_active = true).
--
-- La política existente "master_materials_select" (007) falla para IS NULL porque
--   organization_id::text = NULL  →  NULL  (no TRUE).
-- La política "master_materials_select_master_admin" (048) solo cubre admins.
-- Esta política agrega SELECT para todos los miembros autenticados sobre filas globales.

CREATE POLICY "master_materials_select_global"
  ON public.master_materials
  FOR SELECT
  TO authenticated
  USING (organization_id IS NULL AND is_active = true);

COMMENT ON POLICY "master_materials_select_global" ON public.master_materials IS
  'Permite que cualquier usuario autenticado lea materiales del catálogo global '
  '(organization_id IS NULL). Escritura sigue restringida a master_admin (migration 049).';
