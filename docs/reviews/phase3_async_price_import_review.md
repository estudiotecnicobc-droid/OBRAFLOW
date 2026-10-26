# Fase 3 — Importador asíncrono de precios (revisión, NO desplegar)

## Arquitectura
1. UI React/Vite hace upload a Storage privado `price-imports`, usando el prefijo `{organizationId}/{uploadId}/archivo.csv`; utilizar `upsert:false`.
2. Edge Function autenticada `price-import-start` valida token, forma de ruta e invoca `enqueue_price_import`.
3. RPC PostgreSQL valida membresía de la organización, existencia e identidad del objeto y límites, inserta `price_import_batches` y publica el mensaje en `pgmq` **en la misma transacción**.
4. Un programador seguro invoca `price-import-worker` repetidamente. El Worker lee 1 mensaje con VT, reclama lote mediante lease, procesa 1 chunk, escribe filas crudas y checkpoint en una transacción y archiva el mensaje. Se publica siguiente mensaje si quedan filas.
5. `price_import_rows` conserva datos de entrada, sin homologar ni escribir en `master_materials`/APU.

## Archivos
- `docs/reviews/phase3_async_price_import_review.sql` – tablas, RLS, bucket, RPCs para iniciar, reclamar, confirmar, reintentar, archivar.
- `supabase/functions/price-import-start/index.ts` – Edge iniciadora.
- `supabase/functions/price-import-worker/index.ts` – Worker inicial; CSV Range con delimitadores comunes, XLSX experimental acotado.

## Estado y controles
- La extensión `pgmq` está disponible, pero **no instalada** en Supabase actual. `pg_cron` no está instalada; **no existe todavía scheduler**, bucket ni Edge Functions de precios.
- `price_import_batches.status`: queued → processing → raw_ready; fallos → queued (reintento) o failed; cancelled reservado para integración posterior.
- `raw_rows`, `next_row_number` y `next_byte_offset` son checkpoints. PK `(batch_id,row_number)` impide duplicados.
- La cola ofrece entrega durable **at least once**; la aplicación implementa idempotencia. No anunciar «exactly once» extremo a extremo.
- El enlace `storage_object_id` evita reusar silenciosamente la ruta de otro archivo. Se requiere política de Storage que **no conceda UPDATE/DELETE** sobre objetos del bucket a usuarios.
- `service_role` solo en las Edge Functions; nunca en UI.
- No importamos precios validados, no recalculamos presupuestos ni modificamos APU.

## BLOQUEANTES detectados antes de staging / despliegue
1. **CSV demasiado denso**: el borrador usa 256 KB por lectura con límite RPC de 250 filas. Si un bloque tiene más de 250 filas, falla; diseñar una ventana adaptativa <=250 filas o checkpoint parcial por bytes. No usar la versión actual para importaciones grandes.
2. **CSV multilínea y UTF-8 en rangos**: v1 rechaza comillas con saltos de línea, pero un corte al final de una ventana en mitad de un carácter multibyte exige mantener el framing por separadores LF (ya se realiza) y comprobar CRLF/BOM. Agregar pruebas de archivos adversariales y límite de tamaño por campo.
3. **XLSX experimental**: requiere evaluar licencia, suministro y seguridad de parser; descompresión ZIP, fórmulas, celdas enormes y memoria. Migrar Excel masivo a CSV mediante conversor externo de confianza o Worker especializado. La rama XLSX incluida es **prototipo de revisión**, no apta para producción.
4. **Visibilidad/leases**: la VT es 120 s, lease 100 s. Los chunks deben terminar por debajo de ambos o incorporar heartbeats y `pgmq.set_vt`/renovación atómica; hay que probar crash, concurrencia y reentrega.
5. **Seguridad RPC**: `price_import_poll/claim/commit_chunk/handle_failure/archive/defer` deben quedar revocadas para PUBLIC, anon y authenticated. Verificar herencia de GRANTs y que únicamente service_role tenga ejecución.
6. **Claim/ACK vinculación**: el borrador confirma posesión de lease pero **no verifica dentro del SQL que `p_msg_id` corresponda a `p_batch_id`**. Endurecer vinculación de mensaje a lote antes del despliegue; no confiar en un Worker con permisos administrativos como única barrera.
7. **Idempotencia y objeto inmutable**: proteger sobreescritura/renombrado de archivos mediante Storage RLS; validar `storage_object_id` en reintentos. Un archivo cambiado en Storage invalida checkpoints.
8. **Scheduler**: definir Cron + llamada autenticada por token secreto (no visible), cadencia, alertas de cola y mecanismo para reactivar lotes detenidos. Dejar `verify_jwt=false` solamente con autorización segura de nivel de red/secret y revisión.
9. **Errores y progreso**: limitar tamaño de `raw_cells` para evitar payloads JSON grandes. La RPC `price_import_commit_chunk` debería verificar que la cantidad insertada coincide con la cantidad esperada y bloquear duplicados conflictivos, no solo omitirlos.
10. **Validación de ruta**: endurecer patrón UUID y ownership de upload. Revisar políticas Storage preexistentes antes de crear las nuevas; `DROP POLICY IF EXISTS` no revoca otras políticas permisivas de storage.objects.

## Pruebas obligatorias
- Usuario anónimo no puede iniciar ni leer lotes; organización ajena retorna 42501.
- Lote repetido produce el mismo ID y un solo flujo de procesamiento.
- Archivo faltante, extensión falsa, MIME falso, ZIP malicioso, tamaño desmesurado.
- 1000, 50k y 100k filas CSV; 2 workers simultáneos; caída tras insertar y antes de ACK; reenvío de mensajes; reintentos; visibilidad vencida.
- Error de conversión y de encodings: sin precios falsos ni pérdida de filas.
- `SELECT` exclusivo para organización; `service_role` no sale del servidor.
- Ninguna escritura en `master_materials`, `resources`, snapshots ni presupuestos.
- Índices y `EXPLAIN ANALYZE` para lotes de 100k filas.

## Fuentes oficiales
- https://supabase.com/docs/guides/queues
- https://supabase.com/docs/guides/queues/api
- https://supabase.com/docs/guides/functions/background-tasks
- https://supabase.com/docs/guides/api/securing-your-api

**Decisión de release:** revisión arquitectónica aprobable; código SQL/Worker NO aptos aún para desplegar hasta cerrar bloqueantes y ejecutar suites de integración en staging.
