-- Monitor de importaciones: pegar en Supabase Studio LOCAL o DBeaver LOCAL.
-- Los registros procesados representan filas físicas, no precio homologado.
SELECT b.id, b.status, b.storage_path, b.size_bytes,
       b.next_byte_offset AS bytes_confirmados,
       ROUND(100.0*b.next_byte_offset/NULLIF(b.size_bytes,0),2)
         AS pct_por_bytes,
       b.raw_rows AS filas_confirmadas,
       b.next_row_number-1 AS ultima_fila_confirmada,
       b.attempts, b.lease_expires_at,
       LEFT(b.last_error,150) AS ultimo_error,
       COALESCE(r.total,0) AS filas_en_tabla,
       COALESCE(r.raw,0) AS pendientes_homologacion,
       COALESCE(r.pending_mapping,0) AS sin_equivalencia,
       COALESCE(r.mapped,0) AS homologadas,
       COALESCE(r.invalid,0) AS invalidas,
       b.updated_at
FROM public.price_import_batches b
LEFT JOIN LATERAL (
 SELECT count(*) AS total,
        count(*) FILTER(WHERE processing_status='raw') AS raw,
        count(*) FILTER(WHERE processing_status='pending_mapping') AS pending_mapping,
        count(*) FILTER(WHERE processing_status='mapped') AS mapped,
        count(*) FILTER(WHERE processing_status='invalid') AS invalid
 FROM public.price_import_rows x WHERE x.batch_id=b.id
) r ON true
WHERE b.organization_id='11111111-1111-4111-8111-111111111111'::uuid
ORDER BY b.created_at DESC LIMIT 10;

-- Integridad (reemplazar batch_uuid con UUID obtenido del upload):
-- SELECT count(*) AS filas, count(DISTINCT row_number) AS unicas,
-- min(row_number),max(row_number) FROM public.price_import_rows
-- WHERE batch_id='batch_uuid'::uuid;
