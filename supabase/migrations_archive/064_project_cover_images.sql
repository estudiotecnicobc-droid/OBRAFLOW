-- =============================================================================
-- Migración 064: imagen de portada de los proyectos
--
-- · projects.cover_image: NULL = ilustración por defecto según el proyecto;
--   'preset:<clave>' = ilustración elegida; 'upload:<ruta>' = foto subida.
-- · Bucket privado "project-covers" (5 MB por archivo, solo imágenes). La ruta
--   empieza con el organization_id: solo los miembros de la empresa ven las
--   fotos, y solo owner/admin/editor las suben, cambian o borran (igual que
--   la edición de proyectos).
-- Idempotente.
-- =============================================================================

BEGIN;

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS cover_image text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('project-covers', 'project-covers', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "project_covers_select" ON storage.objects;
DROP POLICY IF EXISTS "project_covers_insert" ON storage.objects;
DROP POLICY IF EXISTS "project_covers_update" ON storage.objects;
DROP POLICY IF EXISTS "project_covers_delete" ON storage.objects;

CREATE POLICY "project_covers_select" ON storage.objects
  FOR SELECT TO authenticated
  USING ( bucket_id = 'project-covers'
          AND public.is_org_member(((storage.foldername(name))[1])::uuid) );

CREATE POLICY "project_covers_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK ( bucket_id = 'project-covers'
               AND public.is_org_member_with_role(((storage.foldername(name))[1])::uuid, ARRAY['owner','admin','editor']) );

CREATE POLICY "project_covers_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING ( bucket_id = 'project-covers'
          AND public.is_org_member_with_role(((storage.foldername(name))[1])::uuid, ARRAY['owner','admin','editor']) );

CREATE POLICY "project_covers_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING ( bucket_id = 'project-covers'
          AND public.is_org_member_with_role(((storage.foldername(name))[1])::uuid, ARRAY['owner','admin','editor']) );

COMMIT;
