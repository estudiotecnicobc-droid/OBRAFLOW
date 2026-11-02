# ObraFlow — Fase 7 | Staging SQL runbook (NO EJECUTAR EN PRODUCCIÓN)

## Restricción de ramas
La **Fase 2** está solamente en la rama del [PR #30](https://github.com/estudiotecnicobc-droid/OBRAFLOW/pull/30), mientras que las fases 3–7 están en el PR #33 (base) y PR #34 (rama superpuesta). **No ejecutar una rama de manera aislada esperando que contenga todo**. Consolidar los archivos en una rama exclusiva de staging DESPUÉS de resolver conflictos y revisar schema real.

## Orden de dependencias (documentos de revisión, no migrations productivas)
0. Desplegar un proyecto Supabase staging independiente: Auth, `organizations`, `organization_members`, `projects`, `master_materials`, `resources`, RLS y helpers. Datos sintéticos y cuenta de prueba.
1. `PR #30/docs/reviews/phase2_resolve_reference_price_draft.sql`: override de proyecto, tipo `resolved_reference_price`, RPC `resolve_reference_price` (todavía requiere validación y compatibilización).
2. `PR #34/docs/reviews/phase3_storage_csv_infrastructure_review.sql`: extensiones `pgmq`, `pg_cron`, `pg_net`, cola `price_imports`, bucket `price_imports` CSV-only y RLS inmutable.
3. `PR #34/docs/reviews/phase3_async_price_import_review.sql`: `price_import_batches`, `price_import_rows`, índices, RLS y RPCs de cola con checkpoints (definiciones iniciales).
4. `PR #34/docs/reviews/phase5_worker_atomic_ack_idempotency.sql`: **antes de invocar Workers**, sustituir la reclamación por `claim(batch_id,msg_id)`, blindar ACK+commit transaccional y leases.
5. `PR #34/docs/reviews/phase4_supplier_homologation_review.sql`: `price_suppliers`, `supplier_products`, `price_observations`, normalización de SKU/moneda/unidad y procedimiento de homologación. **Después** de los batches.
6. `PR #34/docs/reviews/phase5_approve_supplier_mapping_review.sql`: aprobación humana, validación de organización y reenvío selectivo de filas.
7. Configurar variables/secrets del entorno staging, desplegar `price-import-start`, `price-import-worker`, `price-mapping-suggest`; registrar scheduler usando Vault + Cron solo tras pruebas. Nunca colocar secrets en migraciones.
8. Conectar pantalla React/Vite staging al proyecto aislado y ejecutar pruebas de autorización, ingestion y aprobación.
9. Hacer stress test con CSV sintético, contabilizar filas y probar interrupciones.

## **Bloqueantes antes de ejecutar los SQL incluso en staging**
- Los archivos son borradores sin ejecución/validación de esquema. Revisar firmas de `pgmq`, permisos, políticas RLS, compatibilidad de tipo compuesto, el origen de `pgmq.q_price_imports` y continuidad de versiones.
- Revisar SQL de Fase 2 en la rama PR #30 y su referencia a `project_price_overrides`. Fase 2 y fases 3–6 no son un solo historial de migraciones.
- `phase3_async_price_import_review.sql` tiene definición inicial de `price_import_claim(uuid)` que debe reemplazarse en paso 4; el Worker de Fase 6 exige dos parámetros.
- El lector CSV exige **una fila lógica por línea física**, UTF-8 LF, comillas RFC4180 y delimitador detectado; no soporta campos con saltos de línea: canonizar en React (por ejemplo reemplazar saltos por espacios antes de subir). Las comas en comillas sí se admiten.
- El parser oficial se importa en Edge mediante `jsr:@std/csv`; verificar resolución de la versión fijada en Deno staging.
- Probar errores de CSV malformado, EOF sin salto de línea, filas vacías, caracteres UTF-8, 100.000 filas y reinicios.
- Documentar e implementar notificación durable del Worker de homologación para `raw_ready`/filas `raw`; hoy la RPC de aprobación deja filas listas para ser consultadas, pero no dispara su ejecución automáticamente.
- Comprobar integración Fase 2 con `calculate_consolidated_resources`: la RPC de la Fase 2 no la reemplaza automáticamente.
- No asumir que el orden indicado convierte borradores en migraciones listas para usar: ejecutar primero validación de sintaxis, conciliación de ramas, verificación RLS e integración en un entorno **local**.
- El entorno de staging debe usar proyecto Supabase independiente, nunca la URL de producción.

## Generador (en esta rama)
```bash
node scripts/pricing/generate_mock_prices.mjs --rows 100000 --out ./mock_prices_100k.csv
```
El resultado tendrá 100.000 datos + 1 cabecera, semántica reproducible y memoria O(1). El script rechaza sobrescritura de archivos (`flags: 'wx'`). Las pruebas deberán comprobar física y semánticamente número de filas, cantidad de campos, comillas escapadas y caracteres UTF-8.

## Validaciones mínimas staging
- `SELECT COUNT(*)` sobre `price_import_rows` del batch debe ser 100000.
- `COUNT(DISTINCT row_number)` = 100000 y `MIN=1, MAX=100000`.
- `price_import_batches.raw_rows=100000`, `next_byte_offset=size_bytes`, `status=raw_ready`.
- Reintentos mismo `msg_id` jamás crean más filas ni cambian el contenido confirmado.
- No debe haber acceso cross-org ni cambios en `master_materials.unit_price` ni presupuestos.
- Latencia, throughput, deadlocks y fallos medidos en staging, no estimados.
