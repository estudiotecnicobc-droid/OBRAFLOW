# Harness local del motor de precios

Aplica las migraciones `20261102100001..07_precios_*.sql` sobre una base descartable con el
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
4. Migraciones `20261102100001..07` en orden, con `ON_ERROR_STOP`. Los `CREATE EXTENSION` de la 02
   están envueltos en `DO ... EXCEPTION` y solo emiten NOTICE si la extensión no está disponible.
5. `02_verificacion.sql` — tablas, RLS, funciones, tipo, cola, bucket y políticas esperadas.
6. `03_humo.sql` — resolvedor (ORG_MASTER, override, cross-org denegado), ingesta (enqueue idempotente,
   poll, claim, commit_chunk, ACK), homologación y aprobación con reintento idéntico. Todo en una
   transacción que se revierte.

## Límites

Los stubs imitan firmas y columnas, no el comportamiento real de pgmq/Storage. Las pruebas de
concurrencia, idempotencia bajo reintentos reales y preservación del aprobador original
(ver cabecera de `20261102100007`) quedan para QA en un proyecto Supabase de staging.
