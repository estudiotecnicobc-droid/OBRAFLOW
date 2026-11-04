-- Migración aplicada desde el panel web de Supabase (SQL Editor).
-- Version: 20261031155333
-- Name:    064_project_cover_images
-- Origen:  supabase_migrations.schema_migrations (snapshot 2026-11-03)
-- Nota:    Ya aplicada en producción. Reproducida aquí sólo como historia.
-- Nunca re-ejecutar: está absorbida por el baseline 20261101000000.

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
