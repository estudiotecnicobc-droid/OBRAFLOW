# Harness local del motor de precios

Aplica las migraciones `20261102100001..10_precios_*.sql` sobre una base descartable con el
esquema de producción (snapshot del harness RLS, al 31/10/2026 incl. 072) y verifica que los
objetos existan y que las RPC principales funcionen con datos sintéticos. No toca Supabase cloud.

## Correrlo

Con un servidor Postgres accesible (como en CI, `services: postgres:16`):

```bash
PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres supabase/tests/precios/run.sh
```

Sin servidor (solo binarios en `/usr/lib/postgresql/16/bin`): levanta un cluster en `/tmp/pg_precios`, puerto 5433.

```bash
PRECIOS_LOCAL_PG=1 supabase/tests/precios/run.sh
```

Variables opcionales: `PRECIOS_TEST_DB` (default `obraflow_precios_test`), `PGBIN`, `PGDATA_DIR`, `PGPORT`.

## Pasos

1. `../rls/00_stubs.sql` — roles `anon/authenticated/service_role`, `auth.uid()`, `auth.role()`.
2. `../rls/01_schema_snapshot.sql` — esquema public de producción.
3. `00b_stubs_precios.sql` — stubs de lo que Supabase provee y un Postgres pelado no:
   - default privileges de `public` para los roles de API (como hace Supabase);
   - `auth.users` (FKs de `created_by` / `approved_by`);
   - `pgmq`: `meta`, `create`, `send`, `read`, `archive`, `set_vt`, `delete`; las colas se materializan como `pgmq.q_<nombre>` / `pgmq.a_<nombre>`;
   - `cron.schedule` / `cron.unschedule` no-op (pg_cron);
   - `net.http_post` no-op (pg_net);
   - `storage.buckets` y `storage.objects` con las columnas que usan las políticas y `enqueue_price_import`.
4. `057_fix_resources_commercial_columns.sql` — prerrequisito de la 100009 que el snapshot no incluye
   (`calculate_consolidated_resources`, sí presente en producción). La 018 (`budget_cost_snapshots`) no se
   aplica: no está en producción y falla contra el esquema actual; la 100009 crea la tabla con `IF NOT EXISTS`.
5. Migraciones `20261102100001..10` en orden, con `ON_ERROR_STOP`. Los `CREATE EXTENSION` de la 02
   están envueltos en `DO ... EXCEPTION` y solo emiten NOTICE si la extensión no está disponible.
6. `02_verificacion.sql` — tablas, RLS, funciones, tipo, cola, bucket, políticas y triggers esperados.
7. `03_humo.sql` — resolvedor (ORG_MASTER, override, cross-org denegado), ingesta (enqueue idempotente,
   poll, claim, commit_chunk, ACK), homologación y aprobación con reintento idéntico. Todo en una
   transacción que se revierte.
8. `04_motor.sql` — publicación solo por RPC (UPDATE directo → 42501, republicar → 22023); observaciones publicadas de 3 proveedores → `SUPPLIER_OBSERVED` con mediana por proveedor
   y `resolution`; 45 días → `DESACTUALIZADO` + `OBSERVATION_STALE`; sin publicadas → `ORG_MASTER` +
   `CATALOG_UNVERIFIED`; `AS_OF` histórico (incluida una observación invalidada después de la fecha);
   `freeze_budget_prices` (cabecera + detalle, componente repetido en dos ítems, `TOTALS_DIVERGE_FROM_LEGACY_ENGINE`,
   `pending_reconciliation`); observación nueva no altera `FROZEN` pero sí `CURRENT`; `FROZEN_PRICE_MISSING`;
   `get_frozen_budget_prices` cross-org → 42501; componente con material ajeno aborta `freeze_budget_prices` (42501, sin snapshot); `DELETE` del snapshot congelado bloqueado; FROZEN por `budget_item_id` y 22023 si el componente repetido tiene
   precios distintos; editor sin INSERT directo en cabecera/detalle (42501); `unusableAmount`, `legacyDivergence`,
   `incomplete`, `supplier_unit_factor`/`apu_conversion_factor`. Transacción revertida.
9. `04b_aprobacion_trazable.sql` — `approve_supplier_mapping` (100010): H1 `HISTORICAL_MAPPING_IMMUTABLE` antes de la
   ambigüedad, H2 `MAPPING_CHANGE_BLOCKED_PENDING_ROWS` con filas raw, re-decisión sin historial ni raw deja el aprobador
   original en `supplier_product_mapping_history` (INSERT directo 42501). Transacción revertida.
10. `05_circuito.sql` (QA) — aceptación de punta a punta: Org A (owner/editor/viewer), Org B y usuario sin membresía;
   4 lotes CSV → `pending_mapping` → `approve_supplier_mapping` (editor) → `homologate_raw_price_rows` → 8 observaciones →
   `publish_price_observations` → mediana por proveedor (3 proveedores → 1100; 4 → 650; 1 → 750) con `resolution.observation_ids`;
   APU con desperdicio 5 % y `conversion_factor` 50 → `freeze_budget_prices` (AS_OF ayer) verificado fila por fila contra
   la fórmula de la 057, `materialsTotal` vs `legacyMaterialsTotal`, `apu_conversion_factor`/`supplier_unit_factor`, INSERT directo del editor → 42501; observación nueva → CURRENT cambia, FROZEN y AS_OF no;
   RLS vacía y 42501 para Org B / sin membresía; viewer lee pero no publica/congela; UNIT_MISMATCH y USD → `is_usable=false`;
   APU anidado → `skipped` + `partial`. Transacción revertida.
11. `06_aprobacion_reintentos.sql` (QA) — `approve_supplier_mapping` (100007 + 100010): idempotencia, reintento idéntico
    por otro usuario (conserva `approved_by`), conflicto con historial → 23505 `HISTORICAL_MAPPING_IMMUTABLE` (con y sin
    filas pendientes), ambigüedad (22023), re-decisión con filas raw → 23505 `MAPPING_CHANGE_BLOCKED_PENDING_ROWS`,
    re-decisión permitida con rastro en `supplier_product_mapping_history`. Transacción revertida.
    `06b/06c/06d` — concurrencia real: datos committed, dos `psql` en paralelo aprobando el mismo SKU, verificación
    de una sola equivalencia y 3 filas reencoladas (los datos `0c…` quedan en la base descartable).
12. `07_politicas_calificacion.sql` (QA) — audita `pg_policies` de las tablas de precios: `organization_id` sin calificar
    dentro de `EXISTS` y autocomparaciones `alias.col = alias.col` (forma en que el deparser muestra ese bug). Se
    autoverifica con una política defectuosa creada y revertida.

## Límites

Los stubs imitan firmas y columnas, no el comportamiento real de pgmq/Storage. La concurrencia se emula con dos
sesiones `psql` locales (sin dblink); el comportamiento bajo PgBouncer/pooler de Supabase, los reintentos reales
del worker (Edge Function) y la RLS de Storage quedan para QA en un proyecto Supabase de staging.
