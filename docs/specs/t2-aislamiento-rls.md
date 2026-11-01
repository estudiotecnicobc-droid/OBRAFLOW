# T2 · Tests de aislamiento entre empresas (RLS)

## Objetivo
Detectar automáticamente, en cada PR, cualquier política que permita a un usuario de una empresa leer, modificar, borrar o insertar datos de otra.

## Cómo funciona
- `supabase/tests/rls/00_stubs.sql`: roles `anon` / `authenticated` / `service_role` y `auth.uid()` / `auth.role()` como en Supabase.
- `01_schema_snapshot.sql`: copia de producción (31/10/2026) de las 40 tablas, las funciones de membresía y las 165 políticas. Se regenera con `scripts/db/snapshot_rls.sql` (solo lectura).
- `02_aislamiento.sql`: siembra datos solo de la empresa B y, para 36 tablas, prueba como dueño de la empresa A: SELECT, UPDATE, DELETE e INSERT sobre datos de B; como anónimo: SELECT; y como dueño de B: control positivo (ve lo suyo). Todo se deshace después de cada intento.
- `run.sh` crea una base descartable y corre los tres archivos. CI: job `rls` con Postgres 16.

## Reglas del test
- Falla ante cualquier fuga no listada en `_t.conocidos`.
- Falla también si una fuga listada deja de existir (para mantener la lista al día).
- Un error distinto de "permiso denegado" en un INSERT se informa como no concluyente (falla).

## Hallazgos (producción 31/10/2026)
| Tabla | Problema | Corrección |
|---|---|---|
| task_crew_yields | SELECT/INSERT/UPDATE/DELETE `using (true)`: cualquier usuario opera sobre datos de otras empresas | 072 |
| resources | 177 recursos privados de empresas visibles a cualquier usuario autenticado | 072 |
| catalogs | 4 catálogos privados visibles a todos | 072 |
| catalog_task_yields | rendimientos de APU privados visibles a todos | 072 |

La migración 072 se aplicó en producción el 31/10/2026 (versión 20261031231000) con OK de Arq. Gonzalo Blanco. Snapshot actualizado y `_t.conocidos` vacía: 210/210. Rollback: `docs/db/rollback-072.sql`.

## Limitaciones
Prueba políticas, no RPCs `SECURITY DEFINER` ni Storage. No usa FKs ni triggers de producción.
