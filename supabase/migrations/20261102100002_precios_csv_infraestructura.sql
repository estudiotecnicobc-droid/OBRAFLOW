-- Motor de precios — Fase 3: infraestructura de ingesta de CSV.
-- Origen: docs/design/motor-de-precios/phase3_storage_csv_infrastructure_review.sql
-- (recuperado del PR #35). Extensiones pgmq / pg_cron / pg_net, cola pgmq
-- 'price_imports', bucket privado 'price_imports' (solo text/csv) y políticas
-- RLS sobre storage.objects. Debe aplicarse antes de 20261102100003 (lotes/cola).
BEGIN;

-- La extensión de Supabase Queues es nativa de PostgreSQL.
-- Cada CREATE EXTENSION va en un bloque DO que captura la excepción: en Supabase
-- cloud las extensiones existen; en el harness local (Postgres pelado) no están
-- disponibles y se reemplazan por stubs (supabase/tests/precios/00b_stubs_precios.sql).
CREATE SCHEMA IF NOT EXISTS pgmq;
DO $ext$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pgmq WITH SCHEMA pgmq;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgmq no disponible (%): se asume stub o extensión preexistente', SQLERRM;
END
$ext$;
DO $ext$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron no disponible (%): se asume stub o extensión preexistente', SQLERRM;
END
$ext$;
DO $ext$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_net no disponible (%): se asume stub o extensión preexistente', SQLERRM;
END
$ext$;

-- Cola durable. Una llamada al worker no necesita vivir todo el import.
DO $queue$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pgmq.meta WHERE queue_name = 'price_imports'
  ) THEN
    PERFORM pgmq.create('price_imports');
  END IF;
END
$queue$;

-- Almacenamiento inmutable para CSV canonizado por el frontend.
-- El usuario debe subir con upsert:false y contentType:'text/csv'.
DO $bucket$
DECLARE b storage.buckets%ROWTYPE;
BEGIN
  SELECT * INTO b FROM storage.buckets WHERE id = 'price_imports';
  IF FOUND THEN
    IF b.public OR b.file_size_limit IS DISTINCT FROM 104857600
       OR b.allowed_mime_types IS DISTINCT FROM ARRAY['text/csv']::text[] THEN
      RAISE EXCEPTION
        'price_imports exists with different settings; inspect before deploying';
    END IF;
  ELSE
    INSERT INTO storage.buckets
      (id, name, public, file_size_limit, allowed_mime_types)
    VALUES
      ('price_imports', 'price_imports', false, 104857600,
       ARRAY['text/csv']::text[]);
  END IF;
END
$bucket$;

-- storage.objects ya tiene RLS administrada por Storage.
-- La ruta es: {organization_uuid}/{upload_uuid}/{safe_filename}.csv
-- Solo se permite el bucket concreto. Las reglas RESTRICTIVE
-- limitan también cualquier política permisiva añadida por otro módulo.
DROP POLICY IF EXISTS price_imports_insert ON storage.objects;
CREATE POLICY price_imports_insert ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'price_imports'
  AND name ~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]+[.]csv$'
  AND EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id::text = split_part(name,'/',1)
      AND om.user_id = (SELECT auth.uid())
      AND om.role IN ('owner','admin','editor')
  )
);
DROP POLICY IF EXISTS price_imports_insert_guard ON storage.objects;
CREATE POLICY price_imports_insert_guard ON storage.objects
AS RESTRICTIVE FOR INSERT TO authenticated, anon
WITH CHECK (
  bucket_id <> 'price_imports'
  OR (
    name ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]+[.]csv$'
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id::text = split_part(name,'/',1)
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('owner','admin','editor')
    )
  )
);

DROP POLICY IF EXISTS price_imports_select ON storage.objects;
CREATE POLICY price_imports_select ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'price_imports'
  AND EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id::text = split_part(name,'/',1)
      AND om.user_id = (SELECT auth.uid())
  )
);
DROP POLICY IF EXISTS price_imports_select_guard ON storage.objects;
CREATE POLICY price_imports_select_guard ON storage.objects
AS RESTRICTIVE FOR SELECT TO authenticated, anon
USING (
  bucket_id <> 'price_imports'
  OR EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id::text = split_part(name,'/',1)
      AND om.user_id = (SELECT auth.uid())
  )
);

-- RLS es permisiva por defecto: una política FOR UPDATE "denegar"
-- no alcanza. RESTRICTIVE impide superar el bloqueo con OR de otras.
DROP POLICY IF EXISTS price_imports_immutable_update ON storage.objects;
CREATE POLICY price_imports_immutable_update ON storage.objects
AS RESTRICTIVE FOR UPDATE TO authenticated, anon
USING (bucket_id <> 'price_imports')
WITH CHECK (bucket_id <> 'price_imports');

DROP POLICY IF EXISTS price_imports_immutable_delete ON storage.objects;
CREATE POLICY price_imports_immutable_delete ON storage.objects
AS RESTRICTIVE FOR DELETE TO authenticated, anon
USING (bucket_id <> 'price_imports');

-- service_role conserva acceso operativo para Worker y mantenimiento.
-- No conceder privilegios globales de storage.objects al usuario final.
-- No crear cron.schedule todavía: requiere configurar un secreto
-- en Supabase Vault y verificar JWT, ruta y ejecución del Worker.
COMMIT;
