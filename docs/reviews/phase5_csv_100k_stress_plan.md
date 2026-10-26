# Fase 5 — Plan reproducible de pruebas de estrés: 100.000 filas CSV

## Entorno y protección
- Entorno staging separado, con extensiones pgmq/cron/net, bucket privado, RLS y migraciones de fases 3–5 instaladas **solo allí**.
- Datos sintéticos con 2 organizaciones y 3 proveedores; ninguna credencial/producto real. service_role solo Worker.
- CSV canónico UTF-8 LF, con encabezados establecidos y 100.000 filas; tamaños distintos (10–100 MB), campos con caracteres argentinos, SKU repetidos, decimales canónicos, filas adversariales y SKU nuevos.
- Observabilidad: `price_import_batches` (cursor y estado), conteo de `price_import_rows`, `pgmq.q_price_imports`, `pg_stat_activity`, `pg_locks`, `pg_stat_statements`, logs de Edge y uso de memoria.
- Ejecutar equivalencia de pruebas con 1, 2, 4 y 8 Workers concurrentes; números de workers acotados a capacidad de PostgreSQL.

## Ciclos de ensayo
1. Baseline 1.000 filas: validar bytes CSV, número de filas, cursor final, estado raw_ready y ausencia de datos duplicados.
2. 100.000 filas: usar paginado adaptativo <=250 filas por commit. Simular llamada Worker por chunk sin mantener toda la planilla en RAM.
3. Reinicios inyectados: antes de guardar, después de INSERT antes de checkpoint, después del checkpoint antes del ACK, y después del ACK antes de respuesta HTTP. Confirmar reentrega y conservación exacta.
4. Cargas concurrentes: dos Workers sobre mismo lote y múltiples lotes; controlar leases y `msg_id`. Asegurar que un Worker viejo no pueda realizar ACK.
5. Fila con mismo (batch_id,row_number) pero diferentes raw_cells: error atómico, nunca aceptarla silenciosamente. Verificar que reintento idéntico no duplique.
6. Importaciones cruzadas: usuario organización A no accede al lote de B. Los materiales ajenos no pueden aprobarse.
7. Fase 4: 10.000 filas con mismo SKU, 20% nuevos, 10% con unidades incompatibles. Aprobar un SKU y comprobar reencolado solo de filas compatibles; ni observaciones cruzadas ni price master alterados.

## Métricas a guardar por corrida
- Tiempo total, filas/segundo, latencia p50/p95/p99 por chunk, bytes leídos, pico de memoria del Worker.
- Intentos/reentregas, número de ACK, leasing vencido, tiempo en cola, filas en failed/invalid/pending.
- Deadlocks `pg_stat_database.deadlocks` antes/después, espera en `pg_locks`, conflictos por índice PK, tiempos de transacción y errores SQL 40P01/40001.

## Criterios de aceptación
- EXACTAMENTE 100.000 filas de datos persistidas con row_number 1..100000, ninguna omitida ni duplicada; `raw_rows=100000` y cursor de bytes=size_bytes.
- 0 modificaciones a `master_materials.unit_price`, `resources.base_cost`, snapshots o presupuestos.
- En reintentos, ninguna diferencia de `raw_cells`; no hay ACK de mensaje que no corresponda al lote.
- 0 deadlocks bajo la concurrencia acordada; si aparecieran, ajustar orden de bloqueos y backoff con jitter.
- El SLA de duración y latencia deberá fijarse con mediciones de staging; no prometer milisegundos antes del benchmark.
- Validación del plan de recuperación ante caídas de Edge y Postgres.

## Pseudocódigo del generador
```ts
const lines = ['sku,descripcion,precio,unidad,moneda'];
for (let i = 1; i <= 100000; i++) {
  lines.push(`SKU-${i % 4000},Material sintético ${i},${100 + i},kg,ARS`);
}
const csvBytes = new TextEncoder().encode(lines.join('\n') + '\n');
// Upload a Storage de staging, iniciar batch, disparar scheduler,
// inyectar fallos y comparar conteos de PostgreSQL.
```
**Bloqueante actual:** el Worker en PR #34 aún usa una ventana fija de 256KB y falla cuando contiene más de 250 filas. Implementar tamaño adaptable previo al benchmark masivo; el parche de ACK no lo resuelve por sí solo.