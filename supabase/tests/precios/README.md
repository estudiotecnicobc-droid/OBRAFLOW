# Harness local del motor de precios

Aplica las migraciones `20261102100001..09_precios_*.sql` sobre una base descartable con el
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
5. Migraciones `20261102100001..09` en orden, con `ON_ERROR_STOP`. Los `CREATE EXTENSION` de la 02
   están envueltos en `DO ... EXCEPTION` y solo emiten NOTICE si la extensión no está disponible.
6. `02_verificacion.sql` — tablas, RLS, funciones, tipo, cola, bucket, políticas y triggers esperados.
7. `03_humo.sql` — resolvedor (ORG_MASTER, override, cross-org denegado), ingesta (enqueue idempotente,
   poll, claim, commit_chunk, ACK), homologación y aprobación con reintento idéntico. Todo en una
   transacción que se revierte.
8. `04_motor.sql` — observaciones publicadas de 3 proveedores → `SUPPLIER_OBSERVED` con mediana por proveedor
   y `resolution`; 45 días → `DESACTUALIZADO` + `OBSERVATION_STALE`; sin publicadas → `ORG_MASTER` +
   `CATALOG_UNVERIFIED`; `AS_OF` histórico (incluida una observación invalidada después de la fecha);
   `freeze_budget_prices` (cabecera + detalle, componente repetido en dos ítems, `TOTALS_DIVERGE_FROM_LEGACY_ENGINE`,
   `pending_reconciliation`); observación nueva no altera `FROZEN` pero sí `CURRENT`; `FROZEN_PRICE_MISSING`;
   `get_frozen_budget_prices` cross-org → 42501; `DELETE` del snapshot congelado bloqueado. Transacción revertida.

## Límites

Los stubs imitan firmas y columnas, no el comportamiento real de pgmq/Storage. Las pruebas de
concurrencia, idempotencia bajo reintentos reales y preservación del aprobador original
(ver cabecera de `20261102100007`) quedan para QA en un proyecto Supabase de staging.
