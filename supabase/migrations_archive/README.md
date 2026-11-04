# `supabase/migrations_archive/`

Migraciones **históricas** que ya están absorbidas por `supabase/migrations/20261101000000_baseline_produccion.sql`.

**Nada de este directorio se ejecuta en producción ni en `supabase db reset`.** Queda como registro de cómo se llegó al estado actual.

## Qué hay acá

- **`001_*.sql` … `072_*.sql`** y la subcarpeta `split/`: las 72 migraciones que se aplicaron a mano en la base original (nunca llegaron a figurar en `supabase_migrations.schema_migrations`). Varias de ellas son no reproducibles desde cero porque asumen tablas (`organizations`, `profiles`, `organization_members`) que nunca se crearon por migración.
- **`20261026031101…20261026032149_*.sql`** (3 archivos): migraciones que sí se corrieron por el panel y sí quedaron registradas en `schema_migrations`, pero cuyo efecto ya forma parte del baseline.
- **`2026103115…_*.sql` … `20261031232000_*.sql`** (13 archivos): migraciones que se aplicaron por el panel web / SQL Editor de Supabase. **El SQL guardado acá sale de `select statements from supabase_migrations.schema_migrations` de producción** (snapshot 2026-11-03). Dos de ellas (`072` y `073`) solo guardaron un comentario `ver repo: ...` en la columna `statements`; para esas el SQL real vive donde el comentario apunta (o para `073_rls_roles_escritura`, en el estado ya reflejado por el baseline — nunca hubo archivo en el repo).

## Por qué no volver a ejecutarlas

- El baseline recrea todo su efecto en un solo paso.
- Varias migraciones del inicio referencian tablas que nunca existieron como migración, y fallarían.
- La subcarpeta `split/` contenía versiones alternativas de la 008/009/010 (nunca producción).
