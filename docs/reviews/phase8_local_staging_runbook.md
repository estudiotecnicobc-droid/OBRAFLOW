# ObraFlow — Fase 8: integración LOCAL (revisión; no tocar producción)

## Corrección del primer error local (2026-10-27)
El primer `supabase start` falló en `001_global_catalog.sql` porque no existía `public.organizations`. Se añadió `supabase/migrations/000_legacy_base_schema.sql` con 22 tablas legacy estructurales, sin datos de producción, a partir de metadatos de columnas leídos en modo solo lectura. **El nuevo SQL no fue ejecutado ni comprobado mediante CLI**. El próximo error puede ser una incompatibilidad posterior, ya que la historia de migraciones presupone otras estructuras ya creadas. Ejecutar `npx supabase start` de nuevo y compartir el primer error, sin editar producción.

## Estado verificable
Rama: `feature/staging-integration` creada a partir de PR #34 (incluye PR #33). Los 6 SQL de fase 2–5 fueron copiados a `supabase/migrations` con 14 dígitos, usando el borrador de fase 2 del PR #30.

**IMPORTANTE**: archivos versionados pero NO validados con `supabase db reset`. El historial histórico contiene nombres `001_`, `043a_`, etc. y parte del esquema de producción se construyó fuera de migraciones. **No está garantizado que la base se pueda recrear desde cero.** Si `db reset` falla, NO avanzar a cargas; corregir la baseline local antes. Los SQL pueden necesitar corrección de referencias, versiones de pgmq, roles o políticas RLS. Evitar `db push`, `--linked`, `--db-url` remotos.

## Orden de migraciones nuevas
- `20261026120601_price_reference_resolver.sql`
- `20261026120602_price_csv_infrastructure.sql`
- `20261026120603_price_csv_batches_queue.sql`
- `20261026120604_price_import_atomic_ack.sql`
- `20261026120605_price_supplier_homologation.sql`
- `20261026120606_price_human_approval.sql`

La numeración no reemplaza la baseline histórica: se necesita aplicar primero el schema base de organizations, master_materials, etc.

## Comandos (PowerShell desde el repo)
Requiere Docker Desktop iniciado, Node.js 20+ y Supabase CLI disponible (`npx supabase` si está instalado por npm).
```powershell
git fetch origin
git switch feature/staging-integration
node --version
npx supabase --version
docker info
npx supabase start
npx supabase db reset
npx supabase status -o env
node scripts/pricing/generate_mock_prices.mjs --rows 100000 --out ./mock_prices_100k.csv
```

**ATENCIÓN:** si `db reset` falla, detenerse. No seguir con los comandos siguientes.

Copiar exclusivamente claves LOCAL publicadas por `npx supabase status -o env` a variables de la terminal (no guardarlas en Git). Los nombres exactos pueden variar con la versión CLI. Ejemplo cuando el CLI devuelve ANON_KEY / SERVICE_ROLE_KEY:
```powershell
$env:SUPABASE_URL="http://127.0.0.1:54321"
$env:SUPABASE_ANON_KEY="<ANON_KEY_LOCAL>"
$env:SUPABASE_SERVICE_ROLE_KEY="<SERVICE_ROLE_KEY_LOCAL>"
$env:PRICE_IMPORT_WORKER_TOKEN="local-price-worker-only"
node scripts/pricing/setup_local_test_user.mjs
```

Crear `supabase/.env.local` (NO versionarlo):
```dotenv
PRICE_IMPORT_WORKER_TOKEN=local-price-worker-only
```
En otra terminal, desde el repo:
```powershell
npx supabase functions serve --env-file supabase/.env.local
```

Desde la primera terminal:
```powershell
node scripts/pricing/upload_local_csv.mjs ./mock_prices_100k.csv
node scripts/pricing/run_local_worker.mjs 1000
```
Las Edge Functions `price-import-start` (JWT autenticado) y `price-import-worker` (token dedicado) tienen políticas distintas en `supabase/config.toml`. Si la CLI no carga bien el `config.toml`, no deshabilitar JWT globalmente sin comprobar guardas internas.

`upload_local_csv.mjs` es el equivalente funcional del `curl`: autentica vía Supabase Auth con una cuenta local, sube CSV con `contentType: text/csv` a `price_imports` sin upsert y llama a Edge iniciadora con JWT. Así evita pegar tokens sensibles en la línea de comandos.

## Datos de prueba y consulta
- Org: `11111111-1111-4111-8111-111111111111`.
- Proveedor **simulado**: `33333333-3333-4333-8333-333333333333`.
- Usuario: `obraflow-local@example.test` con clave **solo local** `OnlyLocalTest!2026`.
- Seed crea org, 2 materiales y proveedor; `setup_local_test_user.mjs` crea usuario real por Auth Admin y membresía owner.
- Monitor: `scripts/pricing/monitor_local_import.sql` en Studio SQL Editor LOCAL o DBeaver LOCAL.

## Verificaciones
- `count(*)=100000`, min(row_number)=1, max(row_number)=100000, `count(distinct row_number)=100000`.
- `raw_rows=100000`, `next_byte_offset=size_bytes`, estado `raw_ready`.
- 0 duplicaciones ni cambios en precios maestros.
- Leases y reintentos: repetir pruebas con fallas y varios Workers; medir deadlocks con `pg_stat_database`.
- El generador incluye comas entre comillas, tildes, eñes y SKU variados, pero no campos multilinea.

## Bloqueantes pendientes antes de declarar staging ejecutable
1. Baseline histórica de migrations: el repositorio no contiene una garantía de creación autónoma de todas las tablas existentes en producción. Revisar antes de confiar en `db reset`.
2. El backend usa filas `raw_ready` y un Worker para homologación; la prueba de estrés de esta etapa valida **ingesta cruda**, no publicación de precios.
3. La versión exacta de `pgmq.archive` y permisos del proceso Worker requiere pruebas reales locales.
4. Parser `jsr:@std/csv@1.0.6/parse` requiere disponibilidad del módulo en la Edge runtime local y suites con CSV adversariales.
5. El script de usuario presupone permisos de API Admin local y un índice único de `organization_members(organization_id,user_id)`; si el índice no existe, cambiar por inserción idempotente controlada.
6. El Worker usa máximo 250 filas/chunk y límites de lectura; probar casos EOF sin salto de línea, batch retries y archivos CSV densos.
7. `supabase/.env.local` debe estar en .gitignore y no contener secretos remotos.

**No usar ninguno de estos artefactos para producción; la ejecución y los errores de la prueba local todavía no están verificados.**
