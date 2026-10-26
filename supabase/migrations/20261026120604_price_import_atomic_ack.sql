-- STAGING-INTEGRATION REVIEW COPY; test locally before any cloud deployment.
-- Source design/phase5-homologation-staging-idempotency-20261026/docs/reviews/phase5_worker_atomic_ack_idempotency.sql
-- Phase 5 review-only patch. Applies AFTER phase3_async_price_import_review.sql
-- Never execute against production before staged integration tests.
BEGIN;

ALTER TABLE public.price_import_batches
  ADD COLUMN IF NOT EXISTS active_msg_id bigint;

DROP FUNCTION IF EXISTS public.price_import_claim(uuid);

-- Claim binds the lease to the real pgmq message already pulled via read().
CREATE OR REPLACE FUNCTION public.price_import_claim(
  p_batch_id uuid, p_msg_id bigint
)
RETURNS SETOF public.price_import_batches
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pgmq
AS $body$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pgmq.q_price_imports q
    WHERE q.msg_id=p_msg_id
      AND (q.message->>'batch_id')=p_batch_id::text
      AND q.read_ct>=1 AND q.vt>now()
  ) THEN
    RAISE EXCEPTION 'Claimed message not visible or mismatched'
      USING ERRCODE='42501';
  END IF;

  RETURN QUERY
    UPDATE public.price_import_batches b
    SET lease_token=gen_random_uuid(),
        active_msg_id=p_msg_id,
        lease_expires_at=now()+interval '100 seconds',
        attempts=attempts+1,
        started_at=COALESCE(b.started_at,now()),
        status='processing',updated_at=now()
    WHERE b.id=p_batch_id
      AND b.status IN ('queued','processing')
      AND (b.lease_expires_at IS NULL OR b.lease_expires_at<now())
    RETURNING b.*;
END
$body$;

CREATE OR REPLACE FUNCTION public.price_import_commit_chunk(
 p_batch_id uuid,p_lease_token uuid,p_msg_id bigint,p_rows jsonb,
 p_next_byte_offset bigint,p_done boolean,
 p_header_cells jsonb DEFAULT NULL,p_csv_delimiter text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pgmq
AS $body$
DECLARE
  b public.price_import_batches%ROWTYPE;
  n bigint; mn bigint; mx bigint; distinct_count bigint;
  conflict_count integer; missing_count integer;
  acked boolean;
BEGIN
  SELECT * INTO b FROM public.price_import_batches
  WHERE id=p_batch_id FOR UPDATE;

  IF NOT FOUND OR b.status<>'processing'
      OR b.lease_token IS DISTINCT FROM p_lease_token
      OR b.active_msg_id IS DISTINCT FROM p_msg_id
      OR b.lease_expires_at<=now() THEN
    RAISE EXCEPTION 'Invalid / expired lease or message mismatch'
      USING ERRCODE='42501';
  END IF;

  -- The queue row is locked until the chunk and its ACK commit.
  PERFORM 1 FROM pgmq.q_price_imports q
  WHERE q.msg_id=p_msg_id
    AND (q.message->>'batch_id')=p_batch_id::text
    AND q.vt>now() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message is absent, expired or belongs to another batch'
      USING ERRCODE='42501';
  END IF;

  IF jsonb_typeof(p_rows)<>'array'
      OR jsonb_array_length(p_rows)>250
      OR p_done IS NULL THEN
    RAISE EXCEPTION 'Invalid input chunk'
      USING ERRCODE='22023';
  END IF;

  SELECT count(*),min(x.row_number),max(x.row_number),
         count(DISTINCT x.row_number)
  INTO n,mn,mx,distinct_count
  FROM jsonb_to_recordset(p_rows)
       AS x(row_number bigint,raw_cells jsonb);

  IF n<>distinct_count
     OR (n>0 AND (mn<>b.next_row_number
        OR mx<>b.next_row_number+n-1))
     OR EXISTS(
       SELECT 1 FROM jsonb_to_recordset(p_rows)
             AS x(row_number bigint,raw_cells jsonb)
       WHERE x.row_number IS NULL
          OR jsonb_typeof(x.raw_cells)<>'array'
          OR jsonb_array_length(x.raw_cells)>200
     ) THEN
    RAISE EXCEPTION 'Non-contiguous, duplicate or malformed chunk'
      USING ERRCODE='22023';
  END IF;

  IF b.source_format<>'csv'
      OR p_next_byte_offset<=b.next_byte_offset
      OR p_next_byte_offset>b.size_bytes
      OR (p_done AND p_next_byte_offset<>b.size_bytes)
      OR (NOT p_done AND p_next_byte_offset=b.size_bytes) THEN
    RAISE EXCEPTION 'Invalid CSV checkpoint'
      USING ERRCODE='22023';
  END IF;

  IF b.header_cells IS NULL
     AND (jsonb_typeof(p_header_cells)<>'array'
       OR jsonb_array_length(p_header_cells)<2) THEN
    RAISE EXCEPTION 'Missing CSV header' USING ERRCODE='22023';
  END IF;
  IF b.csv_delimiter IS NULL
      AND p_csv_delimiter IS DISTINCT FROM ALL(ARRAY[',',';',E'\t']) THEN
    RAISE EXCEPTION 'Missing/invalid delimiter' USING ERRCODE='22023';
  END IF;

  -- Unique (batch_id,row_number) makes replays idempotent.
  -- DO NOTHING must never silently accept DIFFERENT data for the same key.
  INSERT INTO public.price_import_rows(
     batch_id,organization_id,row_number,raw_cells
  )
  SELECT b.id,b.organization_id,x.row_number,x.raw_cells
  FROM jsonb_to_recordset(p_rows)
       AS x(row_number bigint,raw_cells jsonb)
  ON CONFLICT (batch_id,row_number) DO NOTHING;

  SELECT count(*) INTO conflict_count
  FROM jsonb_to_recordset(p_rows) AS x(row_number bigint,raw_cells jsonb)
  JOIN public.price_import_rows ir
    ON ir.batch_id=b.id AND ir.row_number=x.row_number
  WHERE ir.organization_id IS DISTINCT FROM b.organization_id
     OR ir.raw_cells IS DISTINCT FROM x.raw_cells;

  SELECT count(*) INTO missing_count
  FROM jsonb_to_recordset(p_rows) AS x(row_number bigint,raw_cells jsonb)
  LEFT JOIN public.price_import_rows ir
    ON ir.batch_id=b.id AND ir.row_number=x.row_number
  WHERE ir.batch_id IS NULL;

  IF conflict_count>0 OR missing_count>0 THEN
    RAISE EXCEPTION 'Conflicting or missing raw row after INSERT'
      USING ERRCODE='23505';
  END IF;

  UPDATE public.price_import_batches
  SET next_byte_offset=p_next_byte_offset,
      next_row_number=b.next_row_number+n,
      raw_rows=raw_rows+n,
      header_cells=COALESCE(header_cells,p_header_cells),
      csv_delimiter=COALESCE(csv_delimiter,p_csv_delimiter),
      status=CASE WHEN p_done THEN 'raw_ready' ELSE 'processing' END,
      lease_token=NULL,active_msg_id=NULL,lease_expires_at=NULL,
      finished_at=CASE WHEN p_done THEN now() ELSE NULL END,
      updated_at=now()
  WHERE id=b.id;

  -- Enqueue continuation and archive ACK in SAME database transaction.
  IF NOT p_done THEN
    PERFORM pgmq.send('price_imports',
        jsonb_build_object('batch_id',b.id));
  END IF;
  SELECT pgmq.archive('price_imports',p_msg_id) INTO acked;
  IF acked IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Queue archive ACK failed' USING ERRCODE='40001';
  END IF;
END
$body$;

-- A failure may only modify/archive the message owned by its lease.
CREATE OR REPLACE FUNCTION public.price_import_handle_failure(
 p_batch_id uuid,p_lease_token uuid,p_msg_id bigint,p_error text,
 p_terminal boolean,p_retry_seconds integer DEFAULT 30
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pgmq
AS $body$
DECLARE b public.price_import_batches%ROWTYPE; acked boolean;
BEGIN
 SELECT * INTO b FROM public.price_import_batches
 WHERE id=p_batch_id FOR UPDATE;

 IF NOT FOUND OR b.lease_token IS DISTINCT FROM p_lease_token
    OR b.active_msg_id IS DISTINCT FROM p_msg_id
    OR b.lease_expires_at<=now() THEN
   RAISE EXCEPTION 'Stale failure handler' USING ERRCODE='42501';
 END IF;

 PERFORM 1 FROM pgmq.q_price_imports q
 WHERE q.msg_id=p_msg_id
   AND (q.message->>'batch_id')=p_batch_id::text FOR UPDATE;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'Incorrect queue message' USING ERRCODE='42501';
 END IF;

 UPDATE public.price_import_batches
 SET status=CASE WHEN p_terminal THEN 'failed' ELSE 'queued' END,
     last_error=left(p_error,500),
     finished_at=CASE WHEN p_terminal THEN now() ELSE NULL END,
     lease_token=NULL,active_msg_id=NULL,lease_expires_at=NULL,
     updated_at=now()
 WHERE id=p_batch_id;

 IF p_terminal THEN
   SELECT pgmq.archive('price_imports',p_msg_id) INTO acked;
   IF acked IS DISTINCT FROM true THEN
     RAISE EXCEPTION 'Failure ACK failed' USING ERRCODE='40001';
   END IF;
 ELSE
   PERFORM pgmq.set_vt('price_imports',p_msg_id,
           LEAST(3600,GREATEST(5,p_retry_seconds)));
 END IF;
END
$body$;

REVOKE ALL ON FUNCTION public.price_import_claim(uuid,bigint)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.price_import_commit_chunk(
  uuid,uuid,bigint,jsonb,bigint,boolean,jsonb,text)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.price_import_handle_failure(
  uuid,uuid,bigint,text,boolean,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.price_import_claim(uuid,bigint)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.price_import_commit_chunk(
  uuid,uuid,bigint,jsonb,bigint,boolean,jsonb,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.price_import_handle_failure(
  uuid,uuid,bigint,text,boolean,integer)
  TO service_role;

COMMIT;
