# Baseline de producción — reconstruir `supabase db reset` desde cero

Fecha: 2026-11-03 · Rama: `chore/baseline-produccion`

## Por qué

Hoy `supabase db reset` **no funciona** desde cero: `001_global_catalog.sql` referencia `public.organizations`, `profiles` y `organization_members` que nunca se crearon por migración (se armaron a mano en la base original). Además, de las 72 migraciones numeradas en el repo, ninguna está registrada en `supabase_migrations.schema_migrations` de producción, y hay 13 migraciones con nombre `YYYYMMDDHHMMSS` que están registradas en producción pero no existen como archivo en el repo (se aplicaron por el panel web).

Este cambio arma un **baseline** (dump de solo esquema de producción al 2026-11-03) que reconstruye todo lo que hoy vive en el proyecto `gbewodztwewgrhsoavmg` ("Obra Flow") y archiva las migraciones viejas sin ejecución. Después del baseline quedan en `supabase/migrations/` únicamente las migraciones **todavía no aplicadas** en producción: las de precios (`20261102100001..10`), `20261103100000` (comentarios) y `20261103100100` (precio técnico único).

Reglas que respeta este baseline:
- Contra producción solo lectura (inventario + `supabase db dump` de esquema).
- No se ejecuta `migration repair`, `db push` ni nada que escriba en producción desde este branch.
- No se guardan contraseñas ni claves en el repo.
- El dump se revisa a mano antes de commitearlo: si trae filas (`COPY ...`) o secretos, se corta.

## Inventario (parte 1: migraciones)

Fuente de producción: `select version from supabase_migrations.schema_migrations order by version;` ejecutado contra `gbewodztwewgrhsoavmg` el 2026-11-03.

### Migraciones registradas en producción pero **ausentes** del repo

Estas se aplicaron a mano desde el panel web / SQL Editor. El baseline las absorbe por completo (quedan reflejadas en el esquema dumpeado); al mismo tiempo hay que decirle al tooling local que ya están aplicadas para que `supabase migration list` no las vuelva a proponer.

| Versión         | En repo | En prod |
|-----------------|---------|---------|
| 20261031155333  | no      | sí      |
| 20261031155654  | no      | sí      |
| 20261031160358  | no      | sí      |
| 20261031160514  | no      | sí      |
| 20261031164822  | no      | sí      |
| 20261031183518  | no      | sí      |
| 20261031230000  | no      | sí      |
| 20261031230100  | no      | sí      |
| 20261031230200  | no      | sí      |
| 20261031230300  | no      | sí      |
| 20261031230400  | no      | sí      |
| 20261031231000  | no      | sí      |
| 20261031232000  | no      | sí      |

### Migraciones registradas en producción **y** presentes en el repo

Las tres migraciones de `2026-10-26` existen como archivos en `supabase/migrations/` y además están registradas en `schema_migrations` de producción. Después del baseline se archivan igual (su contenido ya forma parte del dump).

| Versión         | Archivo en repo                                                       | En prod |
|-----------------|-----------------------------------------------------------------------|---------|
| 20261026031101  | 20261026031101_secure_master_materials_revoke_anon_access.sql         | sí      |
| 20261026031937  | 20261026031937_secure_privileged_catalog_mutations.sql                | sí      |
| 20261026032149  | 20261026032149_restrict_remaining_privileged_rpcs_to_authenticated.sql| sí      |

### Migraciones presentes en el repo pero **no** registradas en producción (001–072)

Las 72 migraciones numeradas (más la subcarpeta `split/`) existen como archivos pero no figuran en `schema_migrations`. Se aplicaron a mano a la base original y hoy son parte del esquema vivo. El baseline las absorbe; se archivan sin registrar en producción (quedan en `supabase/migrations_archive/` como historia, nunca más se ejecutan).

Nota: hay dos migraciones con prefijo `003_` y dos con `020_`, hay huecos (`024–028` y `043`), y `043a` reemplaza a lo que iba a ser `043`. Nada de esto importa para producción (ya está aplicado) ni para el nuevo flujo (quedan en archive).

### Migraciones **todavía pendientes** de aplicar en producción (quedan en el repo activo)

Estas son las que mantienen a `supabase/migrations/` como fuente de verdad para los próximos cambios. **Hoy ninguna está en producción.**

| Versión            | Archivo                                                           | Notas                                                                     |
|--------------------|-------------------------------------------------------------------|---------------------------------------------------------------------------|
| 20261102100001..10 | `20261102100001_precios_resolvedor_referencia.sql` … `..._aprobacion_trazable.sql` | Motor de precios. Depende de las extensiones `pgmq`, `pg_cron` y `pg_net`. **Ninguna está habilitada en producción al 2026-11-03** — hay que activarlas desde Dashboard → Database → Extensions antes del `db push`. |
| 20261103100000     | `20261103100000_criterio_unidad_tecnica_apu.sql`                  | Comentarios de columnas (sin DDL destructivo).                             |
| 20261103100100     | `20261103100100_master_materials_precio_tecnico_unico.sql`        | **Se aplica a mano desde SQL Editor** siguiendo `docs/qa/precio-tecnico-produccion.md`. Después hay que marcarla `applied` con `migration repair` para que un `db push` no la repita. |

## Inventario (parte 2: objetos fuera de `public` que el baseline incorpora a mano)

El `supabase db dump --schema public` captura todo lo necesario de `public`, pero hay un puñado de objetos vivos en otros schemas que `supabase db reset` no reconstruye solo. Se agregan **a mano** al final del baseline, en una sección comentada `-- objetos fuera de public`.

- Bucket privado `project-covers` (`public = false`, 5 MB, `image/{jpeg,png,webp}`).
- 4 políticas RLS en `storage.objects` para el bucket `project-covers` (`project_covers_select/insert/update/delete`), que llaman a `public.is_org_member` y `public.is_org_member_with_role` (ambas sí viven en `public` y las trae el dump).
- (Lo que agregue el dump como funciones/types/extensions se queda tal cual.)

Objetos que **no** se incluyen en el baseline (son administrados por Supabase y romperían el reset local):
- Esquema `auth.*` completo (lo gestiona el proyecto gestionado; `db reset` lo recrea solo).
- Esquema `vault.*` y la extensión `supabase_vault`.
- Triggers del propio esquema `storage` (`enforce_bucket_name_length_trigger`, `protect_bucket_control_*`, `protect_delete`, `update_objects_updated_at`): los recrea Supabase.
- Extensiones manejadas por el proyecto gestionado (`pgcrypto`, `pg_stat_statements`, `uuid-ossp`): si el dump las agrega vía `create extension if not exists ...` se dejan, si no, no se agregan.

Confirmado por SQL (solo lectura, 2026-11-03):
- No hay triggers en `auth.*` que llamen a funciones de `public` (no existe `handle_new_user` ni similar).
- No hay triggers custom en `storage.*` (los 7 que viven ahí son los del propio Supabase).
- No existen `cron.job` ni `pgmq.meta` (las extensiones `pg_cron`/`pgmq` no están habilitadas en prod todavía).

## Resultado de la verificación local (2026-11-03)

Entorno: postgres 17 corriendo en el contenedor `supabase_db_obraflow-local-staging` (base temporal `baseline_reset_test`, creada y descartada a mano para no tocar la DB `postgres` del stack local existente).

### Pasos reproducidos del flujo de `supabase db reset`

1. Precarga de entorno que `supabase start` entrega antes de aplicar migraciones (roles `anon`/`authenticated`/`service_role`, schema `auth` con `auth.users` y `auth.uid()`, schema `storage` con `buckets`/`objects`/`foldername()`, extensiones `pgcrypto` + `uuid-ossp`).
2. `psql -f supabase/migrations/20261101000000_baseline_produccion.sql` — **OK**, sin errores.
3. `psql -f supabase/migrations/20261102100001..10_*.sql` — las 10 aplicaron limpio. Solo `NOTICE`s esperados de `DROP POLICY IF EXISTS` sobre objetos inexistentes en base fresca.
4. `psql -f supabase/migrations/20261103100000_criterio_unidad_tecnica_apu.sql` — OK.
5. `psql -f supabase/migrations/20261103100100_master_materials_precio_tecnico_unico.sql` — OK (`Migración OK: marcadas=0 backup=0` porque la base todavía no tenía fixture).

### Sanity checks post-reset

| Métrica                                           | Valor |
|---------------------------------------------------|-------|
| Tablas en `public`                                | 50    |
| Políticas RLS en `public`                         | 167   |
| Políticas RLS en `storage`                        | 10    |
| Funciones en `public`                             | 112   |
| Buckets en `storage` (`project-covers` + `price_imports`) | 2     |
| Función `public.resolve_reference_price(...)` existe | sí    |
| Columna `master_materials.price_unit_basis` existe | sí    |

### Harness de precios con `PRECIOS_REAL_SUPABASE=1`

Última línea:

```
OK: migraciones de precios aplicadas y QA en verde en baseline_reset_test
```

Todos los tests (03_humo, 04_motor, 04b_aprobacion_trazable, 05_circuito, 06_aprobacion_reintentos, 06b/c/d_concurrencia, 07_politicas_calificacion, 09_master_materials_tecnico, 02_verificacion) pasaron sobre la base reconstruida con baseline + migraciones pendientes.

### Harness de aislamiento RLS (job del CI `rls: "Aislamiento RLS"`)

Última línea:

```
Comprobaciones ok: 210 de 210
```

El job sigue en verde porque su flujo (`00_stubs.sql + 01_schema_snapshot.sql + 02_aislamiento.sql`) es independiente del baseline — no referencia ningún archivo que haya sido archivado.

## Archivos movidos a `supabase/migrations_archive/` (86 archivos)

- 72 migraciones `001_*.sql`…`072_*.sql` + subcarpeta `split/` (6 archivos).
- 3 migraciones `20261026*_*.sql` (secure/revoke/restrict RPCs).
- 13 migraciones `20261031*_*.sql` reconstruidas desde `supabase_migrations.schema_migrations` de producción (2 de ellas sólo contenían un comentario `ver repo: ...` en la columna `statements`; la 073 nunca tuvo archivo fuente).
- Ver `supabase/migrations_archive/README.md` para el detalle.

## Baseline

- Archivo: `supabase/migrations/20261101000000_baseline_produccion.sql` — **7741 líneas** (7689 del dump de prod + 52 de la sección manual "objetos fuera de public": bucket `project-covers` y sus 4 policies de `storage.objects`).
- Fuente: `supabase db dump --linked --schema public` sobre el proyecto `gbewodztwewgrhsoavmg` (CLI 3.0.0 usó autenticación temporal; no se pasó contraseña por la línea de comandos).
- Revisión del dump: 0 `COPY` / `INSERT INTO` (solo esquema), 0 JWT/clave/secreto detectables, 0 objetos de `auth.*` / `storage.*` / `vault.*` / `extensions.*` / `realtime.*` / `supabase_*` (el flag `--schema public` los excluyó).

## Cómo correr el reset localmente de ahora en más

Hoy el repo trae `supabase/config.toml` (`project_id = "obraflow"`, `major_version = 17`). Para reconstruir la base localmente:

```bash
# 1) (sólo la primera vez por máquina) detener cualquier otro stack supabase que colisione
#    en puertos. En esta máquina hay un stack "obraflow-local-staging" pre-existente
#    que no viene de este repo y usa los mismos puertos; para usar `db reset` hay que
#    pararlo o renombrar project_id. Confirmar con:
#       docker ps --format "{{.Names}}" | grep ^supabase_
# 2) Levantar el stack definido por supabase/config.toml:
npx supabase start
# 3) Aplicar baseline + pendientes desde cero:
npx supabase db reset
```

`supabase db reset` descarta y recrea la base `postgres` del stack local, aplica el baseline y después las migraciones `20261102*/20261103*` en orden. Idempotente (no hace falta `supabase link` para ejecutarlo localmente).

## Comandos para correr en producción (TODAVÍA NO EJECUTAR)

> ⚠️ Esta sección es **sólo** un guión. **Nada acá se ejecutó.** Las correcciones a `schema_migrations` las hacés vos a mano cuando se mergee el PR, no antes.

### 1. Marcar el baseline como aplicado

El baseline refleja el estado **actual** de producción; en producción no se vuelve a correr. Hay que decirle a Supabase que esa versión ya está aplicada:

```bash
supabase migration repair --status applied 20261101000000
```

Qué hace: inserta la fila `20261101000000` en `supabase_migrations.schema_migrations` sin ejecutar nada. A partir de este punto `supabase migration list` deja de proponer el baseline como pendiente.

### 2. Marcar las 13 migraciones de octubre que ya estaban aplicadas pero sin archivo

Esto no es estrictamente necesario (si ya figuran en `schema_migrations`, Supabase no las vuelve a correr), pero sirve para que el inventario del CLI quede ordenado y la columna "local" marque los archivos como presentes. Como esos archivos **ya no existen** en el repo tras el archive, no hay nada que ejecutar — las versiones ya están registradas en prod desde antes. **Dejar como está, no correr `repair` acá.**

### 3. Marcar `20261103100100` como aplicada después de ejecutarla a mano

Flujo esperado:

1. Vos corrés `20261103100100_master_materials_precio_tecnico_unico.sql` desde SQL Editor siguiendo `docs/qa/precio-tecnico-produccion.md`.
2. Ejecutás:

   ```bash
   supabase migration repair --status applied 20261103100100
   ```

   Qué hace: inserta `20261103100100` en `schema_migrations` sin volver a ejecutar el SQL. Si no se hace, el próximo `supabase db push` intenta aplicarla por segunda vez y falla porque la columna `precio_tecnico` ya existe.

### 4. Resto de migraciones de precios (`20261102100001..10` y `20261103100000`)

Esas se aplican por el flujo normal:

```bash
# Antes: habilitar extensiones desde Dashboard → Database → Extensions
#   - pg_cron
#   - pgmq
#   - pg_net
supabase db push
```

`supabase db push` detecta cuáles de las migraciones pendientes faltan en `schema_migrations` y las aplica en orden; `20261101000000` y `20261103100100` quedan afuera porque ya las marcamos como `applied`.

## Checklist de verificación post-merge

- [ ] `supabase migration list` muestra todas las versiones como `applied` tanto en local como en remote.
- [ ] En Supabase SQL Editor: `select count(*) from supabase_migrations.schema_migrations` devuelve 16 + 1 (baseline) + 11 (10 precios + 20261103100000) + 1 (20261103100100) = 29.
- [ ] `select 1 from pg_proc where proname = 'resolver_precio_vigente'` existe (sanity de las migraciones de precios).
- [ ] `obraflow.net` sigue sirviendo tráfico (el baseline no toca producción, pero conviene chequear el deploy post-merge).
