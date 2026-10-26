-- FASE 3, SOLO REVISION. NO ejecutar sobre Supabase de produccion.
-- Se requiere extender este diseño con pruebas staging antes de desplegar.
BEGIN;

CREATE SCHEMA IF NOT EXISTS pgmq;
CREATE EXTENSION IF NOT EXISTS pgmq WITH SCHEMA pgmq;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pgmq.meta WHERE queue_name='price_imports') THEN
    PERFORM pgmq.create('price_imports');
  END IF;
END $$;

-- Bucket privado y límites defensivos; archivo no editable por clientes.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('price-imports', 'price-imports', false, 104857600)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.price_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  storage_bucket text NOT NULL DEFAULT 'price-imports'
    CHECK (storage_bucket='price-imports'),
  storage_path text NOT NULL,
  storage_object_id uuid NOT NULL,
  source_format text NOT NULL CHECK (source_format IN ('csv','xlsx')),
  size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 104857600),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','processing','raw_ready','failed','cancelled')),
  header_cells jsonb,
  csv_delimiter text CHECK (csv_delimiter IN (',',';',E'\t')),
  next_byte_offset bigint NOT NULL DEFAULT 0 CHECK (next_byte_offset >= 0),
  next_row_number bigint NOT NULL DEFAULT 1 CHECK (next_row_number >= 1),
  raw_rows bigint NOT NULL DEFAULT 0 CHECK (raw_rows >= 0),
  attempts bigint NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_price_import_storage_path UNIQUE (storage_bucket,storage_path),
  CONSTRAINT uq_price_import_storage_id UNIQUE (storage_object_id),
  CONSTRAINT uq_price_import_batch_org UNIQUE (organization_id,id)
);

CREATE TABLE IF NOT EXISTS public.price_import_rows (
  batch_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  row_number bigint NOT NULL CHECK (row_number >= 1),
  raw_cells jsonb NOT NULL CHECK (jsonb_typeof(raw_cells)='array'),
  processing_status text NOT NULL DEFAULT 'raw'
    CHECK (processing_status IN ('raw','invalid','mapped')),
  validation_errors text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (batch_id,row_number),
  FOREIGN KEY (organization_id,batch_id)
    REFERENCES public.price_import_batches(organization_id,id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS price_import_batches_org_recent_idx
 ON public.price_import_batches(organization_id,created_at DESC);
CREATE INDEX IF NOT EXISTS price_import_batches_pending_idx
 ON public.price_import_batches(status,updated_at)
 WHERE status IN ('queued','processing');
CREATE INDEX IF NOT EXISTS price_import_rows_org_batch_idx
 ON public.price_import_rows(organization_id,batch_id,row_number);

ALTER TABLE public.price_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_import_rows ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.price_import_batches FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.price_import_rows FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.price_import_batches,public.price_import_rows TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE
 ON public.price_import_batches,public.price_import_rows TO service_role;

DROP POLICY IF EXISTS price_import_batches_select ON public.price_import_batches;
CREATE POLICY price_import_batches_select ON public.price_import_batches
 FOR SELECT TO authenticated
 USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS price_import_rows_select ON public.price_import_rows;
CREATE POLICY price_import_rows_select ON public.price_import_rows
 FOR SELECT TO authenticated
 USING (public.is_org_member(organization_id));

-- No dar acceso directo INSERT/UPDATE/DELETE a usuarios; solo RPC de inicio
-- y operaciones de servicio, con autorizacion comprobada.

-- Solo permitir uploads por miembros que puedan editar el catalogo.
DROP POLICY IF EXISTS price_import_storage_insert ON storage.objects;
CREATE POLICY price_import_storage_insert ON storage.objects
 FOR INSERT TO authenticated WITH CHECK (
   bucket_id='price-imports'
   AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[a-zA-Z0-9._-]+[.](csv|xlsx)$'
   AND EXISTS (
     SELECT 1 FROM public.organization_members om
     WHERE om.organization_id::text = split_part(name,'/',1)
       AND om.user_id=(SELECT auth.uid())
       AND om.role IN ('owner','admin','editor')
   )
);

DROP POLICY IF EXISTS price_import_storage_select ON storage.objects;
CREATE POLICY price_import_storage_select ON storage.objects
 FOR SELECT TO authenticated USING (
   bucket_id='price-imports'
   AND EXISTS (
     SELECT 1 FROM public.organization_members om
     WHERE om.organization_id::text = split_part(name,'/',1)
       AND om.user_id=(SELECT auth.uid())
   )
);

-- Inicia de forma ATOMICA el batch + mensaje en pgmq.
-- El archivo ya fue subido: no confiar en MIME del cliente.
CREATE OR REPLACE FUNCTION public.enqueue_price_import(
  p_organization_id uuid, p_storage_path text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,storage,pgmq
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_obj record;
  v_size bigint;
  v_format text;
  v_batch_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organization_members om
     WHERE om.organization_id=p_organization_id
       AND om.user_id=v_uid
       AND om.role IN ('owner','admin','editor')
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
  END IF;

  IF p_storage_path IS NULL OR
     p_storage_path !~ ('^' || p_organization_id::text ||
       '/[0-9a-f-]{36}/[a-zA-Z0-9._-]+[.](csv|xlsx)$') THEN
    RAISE EXCEPTION 'Invalid file path' USING ERRCODE='22023';
  END IF;

  SELECT o.id,o.metadata,o.name INTO v_obj
  FROM storage.objects o
  WHERE o.bucket_id='price-imports' AND o.name=p_storage_path;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'File not found' USING ERRCODE='22023';
  END IF;
  IF COALESCE(v_obj.metadata->>'size','') !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'Storage file size missing' USING ERRCODE='22023';
  END IF;
  v_size := (v_obj.metadata->>'size')::bigint;
  v_format := CASE
    WHEN lower(p_storage_path) LIKE '%.csv' THEN 'csv'
    ELSE 'xlsx' END;

  -- XLSX esta acotado a 2 MB para no descomprimir en RAM un archivo
  -- potencialmente explosivo. Excel masivo: normalizar a CSV antes.
  IF v_size < 1 OR v_size > CASE
       WHEN v_format='xlsx' THEN 2097152 ELSE 104857600 END THEN
    RAISE EXCEPTION 'File size exceeds format limit'
      USING ERRCODE='22023';
  END IF;

  INSERT INTO public.price_import_batches (
    organization_id,created_by,storage_bucket,storage_path,
    storage_object_id,source_format,size_bytes
  ) VALUES (
    p_organization_id,v_uid,'price-imports',p_storage_path,
    v_obj.id,v_format,v_size
  ) ON CONFLICT (storage_bucket,storage_path) DO NOTHING
  RETURNING id INTO v_batch_id;

  IF v_batch_id IS NULL THEN
    SELECT b.id INTO v_batch_id
    FROM public.price_import_batches b
    WHERE b.storage_bucket='price-imports'
      AND b.storage_path=p_storage_path
      AND b.organization_id=p_organization_id
      AND b.storage_object_id=v_obj.id;
    IF v_batch_id IS NULL THEN
      RAISE EXCEPTION 'Import path conflict' USING ERRCODE='23505';
    END IF;
    RETURN v_batch_id;
  END IF;

  PERFORM pgmq.send('price_imports',
    jsonb_build_object('batch_id',v_batch_id));
  RETURN v_batch_id;
END;
$fn$;
REVOKE ALL ON FUNCTION public.enqueue_price_import(uuid,text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.enqueue_price_import(uuid,text)
 TO authenticated;

-- Worker-only RPC: pgmq no se expone a usuarios.
CREATE OR REPLACE FUNCTION public.price_import_poll()
RETURNS TABLE (msg_id bigint,read_ct integer,batch_id uuid)
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pgmq
AS $fn$
  SELECT m.msg_id,m.read_ct,(m.message->>'batch_id')::uuid
  FROM pgmq.read('price_imports',120,1) AS m
$fn$;

CREATE OR REPLACE FUNCTION public.price_import_claim(p_batch_id uuid)
RETURNS SETOF public.price_import_batches
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
 UPDATE public.price_import_batches b
 SET lease_token=gen_random_uuid(),
     lease_expires_at=now()+interval '100 seconds',
     attempts=attempts+1,
     started_at=COALESCE(started_at,now()),
     status='processing',
     updated_at=now()
 WHERE b.id=p_batch_id AND b.status IN ('queued','processing')
   AND (b.lease_expires_at IS NULL OR b.lease_expires_at < now())
 RETURNING b.*
$fn$;

-- Atomicidad: guardado de raw_rows + cursor + reencolado + archivado.
CREATE OR REPLACE FUNCTION public.price_import_commit_chunk(
  p_batch_id uuid,
  p_lease_token uuid,
  p_msg_id bigint,
  p_rows jsonb,
  p_next_byte_offset bigint,
  p_done boolean,
  p_header_cells jsonb DEFAULT NULL,
  p_csv_delimiter text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pgmq
AS $fn$
DECLARE
  v_batch public.price_import_batches%ROWTYPE;
  v_count bigint;
  v_min bigint;
  v_max bigint;
  v_distinct bigint;
BEGIN
  SELECT * INTO v_batch FROM public.price_import_batches
  WHERE id=p_batch_id FOR UPDATE;

  IF NOT FOUND OR v_batch.status<>'processing'
     OR v_batch.lease_token IS DISTINCT FROM p_lease_token
     OR v_batch.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'Stale or unauthorized lease' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array'
     OR jsonb_array_length(p_rows) > 250 THEN
    RAISE EXCEPTION 'Invalid chunk' USING ERRCODE='22023';
  END IF;
  SELECT count(*),min(x.row_number),max(x.row_number),
         count(DISTINCT x.row_number)
  INTO v_count,v_min,v_max,v_distinct
  FROM jsonb_to_recordset(p_rows)
    AS x(row_number bigint,raw_cells jsonb);

  IF v_count<>v_distinct OR
     (v_count>0 AND (
       v_min<>v_batch.next_row_number OR
       v_max<>v_batch.next_row_number+v_count-1
     )) OR EXISTS (
       SELECT 1 FROM jsonb_to_recordset(p_rows)
         AS x(row_number bigint,raw_cells jsonb)
       WHERE jsonb_typeof(x.raw_cells)<>'array'
     ) THEN
    RAISE EXCEPTION 'Non-contiguous or invalid import rows'
      USING ERRCODE='22023';
  END IF;

  IF v_batch.source_format='csv'
     AND (p_next_byte_offset <= v_batch.next_byte_offset
          OR p_next_byte_offset > v_batch.size_bytes
          OR (p_done AND p_next_byte_offset<>v_batch.size_bytes)) THEN
    RAISE EXCEPTION 'Invalid CSV checkpoint' USING ERRCODE='22023';
  END IF;
  IF v_batch.source_format='xlsx' AND p_next_byte_offset<>0 THEN
    RAISE EXCEPTION 'Invalid XLSX checkpoint' USING ERRCODE='22023';
  END IF;
  IF v_batch.header_cells IS NULL AND
      (p_header_cells IS NULL OR jsonb_typeof(p_header_cells)<>'array') THEN
    RAISE EXCEPTION 'Missing header' USING ERRCODE='22023';
  END IF;
  IF v_batch.source_format='csv' AND v_batch.csv_delimiter IS NULL
      AND p_csv_delimiter NOT IN (',',';',E'\t') THEN
    RAISE EXCEPTION 'Missing CSV delimiter' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.price_import_rows (
    batch_id,organization_id,row_number,raw_cells
  )
  SELECT v_batch.id,v_batch.organization_id,x.row_number,x.raw_cells
  FROM jsonb_to_recordset(p_rows)
    AS x(row_number bigint,raw_cells jsonb)
  ON CONFLICT (batch_id,row_number) DO NOTHING;

  UPDATE public.price_import_batches
  SET next_byte_offset=p_next_byte_offset,
      next_row_number=v_batch.next_row_number+v_count,
      raw_rows=raw_rows+v_count,
      header_cells=COALESCE(header_cells,p_header_cells),
      csv_delimiter=COALESCE(csv_delimiter,p_csv_delimiter),
      status=CASE WHEN p_done THEN 'raw_ready' ELSE 'processing' END,
      lease_token=NULL,lease_expires_at=NULL,
      updated_at=now(),
      finished_at=CASE WHEN p_done THEN now() ELSE NULL END
  WHERE id=v_batch.id;

  IF NOT p_done THEN
    PERFORM pgmq.send('price_imports',
      jsonb_build_object('batch_id',v_batch.id));
  END IF;
  PERFORM pgmq.archive('price_imports',p_msg_id);
END;
$fn$;

-- Worker-only retry/terminal failure; se libera el lease y se retrasa
-- o archiva el mensaje. No se pierde un archivo al fallar una funcion.
CREATE OR REPLACE FUNCTION public.price_import_handle_failure(
  p_batch_id uuid,p_lease_token uuid,p_msg_id bigint,
  p_error text,p_terminal boolean,p_retry_seconds integer DEFAULT 30
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pgmq
AS $fn$
BEGIN
  UPDATE public.price_import_batches
     SET last_error=left(p_error,500),
         status=CASE WHEN p_terminal THEN 'failed' ELSE 'queued' END,
         finished_at=CASE WHEN p_terminal THEN now() ELSE NULL END,
         lease_token=NULL,lease_expires_at=NULL,updated_at=now()
  WHERE id=p_batch_id AND lease_token=p_lease_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lease invalid for failure' USING ERRCODE='42501';
  END IF;
  IF p_terminal THEN
    PERFORM pgmq.archive('price_imports',p_msg_id);
  ELSE
    PERFORM pgmq.set_vt('price_imports',p_msg_id,
      LEAST(3600,GREATEST(5,p_retry_seconds)));
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.price_import_defer(
  p_msg_id bigint,p_seconds integer DEFAULT 30
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pgmq
AS $fn$
BEGIN
  PERFORM pgmq.set_vt('price_imports',p_msg_id,
    LEAST(3600,GREATEST(5,p_seconds)));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.price_import_archive(p_msg_id bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pgmq
AS $fn$
BEGIN
  PERFORM pgmq.archive('price_imports',p_msg_id);
END;
$fn$;

-- Todas las RPC del Worker son exclusivamente service_role.
REVOKE ALL ON FUNCTION public.price_import_poll() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.price_import_claim(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.price_import_commit_chunk(
  uuid,uuid,bigint,jsonb,bigint,boolean,jsonb,text)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.price_import_handle_failure(
  uuid,uuid,bigint,text,boolean,integer)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.price_import_defer(bigint,integer)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.price_import_archive(bigint)
  FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.price_import_poll() TO service_role;
GRANT EXECUTE ON FUNCTION public.price_import_claim(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.price_import_commit_chunk(
  uuid,uuid,bigint,jsonb,bigint,boolean,jsonb,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.price_import_handle_failure(
  uuid,uuid,bigint,text,boolean,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.price_import_defer(bigint,integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.price_import_archive(bigint)
  TO service_role;

COMMIT;
