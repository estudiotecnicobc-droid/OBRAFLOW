# Migraciones: Cost Versioning

Archivos aislados para aplicar el sistema de cost versioning paso a paso.
Cada archivo tiene su propio `BEGIN/COMMIT` y es idempotente (seguro de correr más de una vez).

---

## Cómo ejecutar

Abrir **Supabase Dashboard → SQL Editor → New query**.
Copiar el contenido del archivo → ejecutar → verificar → pasar al siguiente.

No hay CLI requerida. Cada archivo es autocontenido.

---

## Orden exacto de ejecución

### Base de datos nueva (primera vez)

```
008a → 008b → 008c → 010
```

### Ya tenías 008 monolítico aplicado

```
009 → 010
```

---

## Detalle por archivo

---

### 008a_cost_tables.sql
**Qué hace:** enums, 4 tablas, índices, triggers de timestamps, `ALTER resources`.

**Ejecutar:** copiar y pegar en SQL Editor → Run.

**Verificar después:**
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'cost_indices', 'cost_index_values',
    'resource_pricing_rules', 'resource_cost_snapshots'
  );
-- Resultado esperado: 4 filas
```

**Error común:** `relation "organizations" does not exist` → migraciones anteriores no aplicadas.

---

### 008b_cost_rls.sql
**Qué hace:** activa RLS y crea las 14 políticas para las 4 tablas.

**Prerequisito:** 008a ejecutado.

**Ejecutar:** copiar y pegar en SQL Editor → Run.

**Verificar después:**
```sql
SELECT tablename, COUNT(*) AS policies
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'cost_indices', 'cost_index_values',
    'resource_pricing_rules', 'resource_cost_snapshots'
  )
GROUP BY tablename
ORDER BY tablename;
-- Resultado esperado:
--   cost_index_values        | 4
--   cost_indices             | 5
--   resource_cost_snapshots  | 3
--   resource_pricing_rules   | 4
```

**Error común:** `function is_org_member does not exist` → migración 007 no aplicada.

---

### 008c_cost_functions.sql
**Qué hace:** funciones finales (con todos los fixes de hardening y service_role bypass),
trigger `sync_current_snapshot_cache`, constraint endurecido, seeds de 8 índices globales.

**Prerequisito:** 008a + 008b + migración 007 (`is_org_member`, `is_org_member_with_role`) ejecutados.

**Ejecutar:** copiar y pegar en SQL Editor → Run.

**Verificar después:**
```sql
-- Funciones presentes
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'get_resource_cost', 'get_resource_snapshot',
    'generate_monthly_snapshots', 'upsert_index_value',
    'sync_current_snapshot_cache'
  )
ORDER BY routine_name;
-- Resultado esperado: 5 filas

-- Seeds aplicados
SELECT code, category FROM public.cost_indices
WHERE tenant_id IS NULL
ORDER BY code;
-- Resultado esperado: 8 filas (CAC, CAC-EQ, CAC-MAT, CAC-MO, ICC, IPC, UOCRA, UOCRA-AYU)
```

**Error común:** `function validate_composite_components does not exist` dentro del constraint
→ las funciones helper se crean antes que el constraint; si ocurre, volver a ejecutar el archivo.

---

### 009_cost_hardening.sql ⚠ Solo si usaste 008 monolítico
**Qué hace:** parcha las funciones de 008 con los 5 fixes de hardening.

**Prerequisito:** `008_cost_versioning.sql` (monolítico) ejecutado.

**OMITIR** si ejecutaste la serie 008a → 008b → 008c (las versiones finales ya están ahí).

**Ejecutar:** copiar y pegar en SQL Editor → Run.

**Verificar después:**
```sql
-- El trigger debe existir
SELECT trigger_name
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name = 'resource_cost_snapshots_sync_cache';
-- Resultado esperado: 1 fila
```

---

### 010_link_resources.sql
**Qué hace:** agrega `resource_id`, `sub_master_task_id`, `conversion_factor` a
`master_task_materials`; `resource_id`, `snapshot_hourly_rate` a `master_task_labor`;
`resource_id`, `snapshot_cost_per_hour` a `master_task_equipment`; `cost_base` a `projects`.

**Prerequisito:** cualquiera de las rutas anteriores completada (tablas `master_task_*` y `projects` deben existir).

**Ejecutar:** copiar y pegar en SQL Editor → Run.

**Verificar después:**
```sql
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'master_task_materials', 'master_task_labor',
    'master_task_equipment', 'projects'
  )
  AND column_name IN (
    'resource_id', 'sub_master_task_id', 'conversion_factor',
    'snapshot_hourly_rate', 'snapshot_cost_per_hour', 'cost_base'
  )
ORDER BY table_name, column_name;
-- Resultado esperado: 8 filas
```

---

## Verificación completa con script

Después de aplicar todos los archivos, ejecutar el script de verificación automática:

```bash
npm run db:verify
```

Este script usa la `SUPABASE_SERVICE_ROLE_KEY` de `.env.local` para verificar
tablas, columnas, funciones, triggers, seeds y RLS en un solo comando.

Requiere las variables en `.env.local`:
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

---

## Diagrama de dependencias

```
007_rls_policies (is_org_member)
        │
        ▼
   008a_cost_tables
        │
        ▼
   008b_cost_rls
        │
        ▼
   008c_cost_functions  ←── seeds de índices globales aquí
        │
        ▼
   010_link_resources
```

---

## Qué NO está en estos archivos

- Migración del catálogo global de recursos (`seedGlobalCatalog.ts`) → `npm run db:seed:catalog`
- Valores históricos de índices (CAC, UOCRA, etc.) → `npm run db:seed:indices`
- Generación de snapshots mensuales → `npm run db:snapshots`
- Smoke test post-migración → `npm run db:smoke`
