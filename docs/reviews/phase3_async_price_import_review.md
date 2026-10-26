# ObraFlow — revisión conjunta Fase 3 final / Fase 4
**SOLO REVISIÓN. No ejecutar en producción. No desplegar Edge Functions.**

## Orden de SQL propuesto
1. `phase3_storage_csv_infrastructure_review.sql`: extensiones pgmq, pg_cron y pg_net; cola `price_imports`; bucket privado `price_imports` y Storage RLS.
2. `phase3_async_price_import_review.sql`: `price_import_batches`, `price_import_rows`, RPC `enqueue_price_import`, leases/checkpoints y commits por fragmento.
3. `phase4_supplier_homologation_review.sql`: `price_suppliers`, `supplier_products`, `price_observations`, configuración de columnas, staging y motor de homologación.

## Contrato de ingesta CSV exclusivamente
- Frontend React/Vite convierte XLSX → CSV ANTES del upload usando `xlsx` ya declarado en `package.json`.
- UI debe mostrar previsualización; el usuario confirma encabezados, separador, unidades, moneda y política de decimales. Normalizar a UTF-8, LF, valores decimales con punto, máximo de columnas/celdas/filas.
- Upload a bucket privado `price_imports`, ruta `organizationId/uploadId/archivo.csv`, `upsert:false`, `contentType:'text/csv'`.
- Edge `price-import-start` comprueba JWT, ruta y `storage.info(...).contentType === 'text/csv'`.
- RPC `enqueue_price_import` comprueba la organización, objeto, metadatos (mimetype), tamaño e inserta batch + mensaje de cola en transacción.
- Worker solo reconoce `csv`. Los bytes CSV todavía tienen que ser validados contra archivos maliciosos: extensión/MIME *no prueban* que el contenido sea CSV.
- No se escribe en `master_materials`, `resources`, APU, snapshots o presupuestos al ingerir el archivo.

## Homologación
- `price_suppliers`: proveedor por organización + `external_code` único.
- `supplier_products`: vínculo aprobado `(org,supplier,sku) → master_material_id`, unidad comercial, factor de conversión, moneda.
- `price_observations`: histórico normalizado; UNIQUE `(batch_id,row_number)`. No sobrescribir precios maestros automáticamente.
- Cada batch tiene `supplier_id`, `column_mapping` explícito (índices de cabecera 0-based) y `observation_date` aprobados por operador con la RPC `configure_price_import_mapping`.
- `homologate_raw_price_rows(batch_id, limit)` se ejecuta **solo con service_role**. Procesa filas `raw` con `FOR UPDATE SKIP LOCKED`, en chunks de 250: SKU conocido + unidad/moneda compatible → `mapped` e inserta observación; SKU desconocido/incompatibilidad → `pending_mapping`; datos inválidos → `invalid`.
- El procedimiento **no decide equivalencias por similitud de texto**. Futuro agente IA solo propondrá mapeos, que debe aprobar un operador.
- Tras aprobar mappings, `requeue_pending_price_mappings` vuelve `pending_mapping → raw` para intentar esas filas. No reintentar pending en un bucle infinito.
- El precio técnico se calcula como `original_price/unit_factor`. Verificar unidades comerciales, IVA, bonificaciones y moneda antes de publicar observaciones como referencia.

## Limitaciones y BLOQUEANTES de staging
1. Las tres migraciones todavía no se han compilado ni probado en PostgreSQL. Revisar columnas/tipos, orden, grants y permisos de `pgmq` / storage. El SQL anterior de Fase 3 fue alineado con el nuevo bucket, pero la rama sigue en borrador.
2. El lector CSV del Worker todavía usa una ventana fija de 256 KB y un máximo de 250 filas. Debe rediseñarse para chunks adaptativos: la versión actual falla en CSV densos y NO es production-ready.
3. CSV con comillas multilínea, celdas enormes, desbordes y reintentos necesitan validación real; la conversión frontend debe garantizar un CSV canonizado y el backend **debe volver a validar** sus bytes.
4. Seguridad: Storage RLS restrictiva bloquea UPDATE y DELETE al usuario final en `price_imports`, pero `service_role` puede reemplazar archivos. Auditar políticas preexistentes, ausencia de rutas públicas y conservar identidad/hash del objeto.
5. `price_import_commit_chunk` todavía debe verificar pertenencia de `msg_id` al `batch_id` y que la deduplicación no oculte registros de distinto contenido. Añadir tests crash/retries/leases.
6. Seguridad del SQL `SECURITY DEFINER`: verificar ownership, grants, `search_path`, funciones de lectura y que solo `service_role` pueda consumir mensajes.
7. Planificar Cron+pg_net+Vault para llamar Worker; **no se programó un cron job**, no insertar secretos en migraciones.
8. Homologación: validación de factor de conversión, IVA, descuentos, unidades, días y mapeos ambiguos; faltan pruebas de tensiones con RLS y reglas de edición de mapping.
9. Resolver técnico de Fase 2 y Observaciones Fase 4 **no están integrados**. La publicación de precio canónico o regional pertenece a fase posterior, no se crea un trigger oculto.
10. Corregir condiciones de carrera y ACK de las RPCs antes de deploy; NO aprobar merge hasta que CI y prueba de 100.000 filas sean exitosos.

## Lecturas oficiales
- https://supabase.com/docs/guides/queues
- https://supabase.com/docs/guides/cron/install
- https://supabase.com/docs/guides/database/extensions/pg_net
- https://supabase.com/docs/guides/storage/security/access-control

**Estado:** Diseño de Fase 3 final + Fase 4 entregado para revisión. Base de producción intacta.
