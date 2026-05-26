# Obraflow — Handoff Actual
**Fecha:** 2026-05-26
**Estado general:** 🟢 Beta estable — listo para pruebas con colegas

---

## 1. ÚLTIMO DEPLOY EN PRODUCCIÓN

```
Commit: 29074cc  fix: clarify materials reports naming and price context
Deploy: obraflowapp-6azh9ostk-obraflow.vercel.app
Aliases: obraflow.net ✅  www.obraflow.net ✅
```

Commits recientes (en orden):
```
29074cc  fix: clarify materials reports naming and price context
0072c9f  fix: sync technical material fields from global catalog
2729785  fix: align dashboard materials list totals with consumption report
2dd6382  docs: add beta closing audit
0c44a8c  fix: keep company material edit drawer fixed while scrolling
49fbe11  feat: add side drawer editing and technical metadata for company materials
```

---

## 2. ARQUITECTURA ACTUAL

```
master_admin (Gonzalo)
  └─ AdminPanel.tsx
       ├─ GlobalMaterialsAdmin.tsx   ← CRUD master_materials IS NULL
       ├─ GlobalTasksAdmin.tsx       ← CRUD master_tasks IS NULL
       └─ AuditLog viewer

Organización (empresa)
  ├─ Catálogo de Empresa (DataAdmin → Materiales de Empresa)
  │    └─ MasterMaterialsPanel.tsx   ← drawer createPortal, campos técnicos
  │         └─ importFromGlobal()    ← copia TODOS los campos incl. técnicos
  ├─ Recursos Globales (DataAdmin → Recursos Globales)
  │    └─ GlobalResourcesPanel.tsx   ← tabla resources (fuente de precios)
  ├─ APUs (DataAdmin → APUs)
  │    └─ MasterTasksPanel.tsx
  └─ Proyecto
       ├─ BudgetEditor / BudgetGrid
       ├─ ChandiasCalculator
       ├─ Dashboard
       │    └─ Lista de Materiales  ← precios actuales del catálogo
       └─ Reportes
            ├─ APUSummaryReport
            ├─ BudgetBreakdownReport
            └─ ConsolidatedProjectReport  ← "Explosión de Insumos" (base presupuesto)
```

### Flujo de datos del catálogo
```
resources (org IS NULL)          ← fuente global, gestionada por master_admin
    ↓  importar
master_materials (org IS NULL)   ← catálogo global de materiales, gestionado por master_admin
    ↓  importFromGlobal()
master_materials (orgId)         ← catálogo de empresa, editable por org
    ↓  useUnifiedMaterials()
APUs / Presupuesto / Cómputos    ← consumen catálogo de empresa
```

---

## 3. MIGRACIONES — ESTADO AL 2026-05-26

| Migración | Descripción | Estado |
|-----------|-------------|--------|
| 017 | Commercial fields en master_materials | ✅ ejecutada |
| 046 | Fix acero histórico en master_task_materials | ✅ ejecutada |
| 047 | Fix acero en task_yields + materials de proyecto | ✅ ejecutada |
| 048 | profiles.system_role (master_admin) | ✅ ejecutada |
| 049 | RLS write global para master_materials | ✅ ejecutada |
| 050 | NULL organization_id en master_materials | ✅ ejecutada |
| 051 | UNIQUE constraints global tasks | ✅ ejecutada |
| 052 | SELECT policy global materials para todos | ✅ ejecutada |
| 053 | Import tracking: global_source_id, imported_at, local_override | ✅ ejecutada |
| 054 | global_resource_id en master_materials | ✅ ejecutada |
| 055 | Schema bridge: commercial columns en master_task_materials | ✅ ejecutada |
| 056 | Commercial columns en catalog_task_yields | ✅ ejecutada |
| 057 | Commercial columns en resources + RPC v3 | ✅ ejecutada |
| 058 | technical_yield, technical_yield_unit, technical_notes en master_materials | ✅ ejecutada |

**No hay migraciones pendientes** para el scope beta actual.

Pendientes para backlog:
- `038_stripe_billing.sql` + `039_billing_events.sql` — cuando se retome Billing
- `040_computation_schema.sql` — cuando se retome Sincronización Viva
- `044_seed_name_alignment.sql` — fix nombre materiales catálogo vs seeds

---

## 4. QUÉ ESTÁ CERRADO

| Feature | Detalle |
|---------|---------|
| Auth + Orgs + Multitenancy | Login, recovery, membresías, roles |
| Admin del Sistema | AdminPanel: auditoría, materiales globales, APUs globales |
| Master Admin runtime | system_role en profiles, is_master_admin() SQL function |
| Catálogo Global CRUD | GlobalMaterialsAdmin: create/edit/toggle + campos técnicos |
| APUs Globales CRUD | GlobalTasksAdmin: create/edit/toggle |
| Importación Global → Empresa | importFromGlobal() copia TODOS los campos incl. técnicos |
| Badges de trazabilidad | Global / Importado / Editado localmente en MasterMaterialsPanel |
| Protección local_override | Precios editados localmente no se sobreescriben en re-import |
| Drawer fijo Materiales Empresa | createPortal + position:fixed, no hace scroll con la lista |
| Campos técnicos opcionales | technical_yield + unit + notes en empresa y en global |
| Visibilidad catálogo global | Org puede ver materiales globales (IS NULL) sin importar |
| Proyectos CRUD | Creación, edición, selector de proyecto activo |
| Presupuesto | BudgetEditor + BudgetGrid, items, APU maestra vinculada |
| APU Maestra | MasterTasksPanel, crear/editar/importar, duplicate guards |
| Calculadora Chandías | ChandiasCalculator, borradores persistentes, send to presupuesto |
| Consumos del Proyecto | RPC calculate_consolidated_resources v3 (PATH A + B) |
| Exportación Excel Consumos | xlsx-js-style, dark header, zebra, freeze, fuente base presupuesto |
| Exportación CSV Consumos | BOM UTF-8, separador ; |
| Dashboard Lista de Materiales | costo total = totalQty × unitCost (ya no suma unitPrice) |
| Exportación Excel Lista Mat. | 5 columnas: Insumo/Unidad/Cant. Total/Precio unit./Costo total |
| Naming reportes | "Explosión de Insumos" (base presupuesto) vs "Lista de Materiales" (precios actuales) |
| Badges contexto | "Base presupuesto" + "Precios congelados" / "Precios actuales" |
| Reporte Completo | Dashboard: multipágina, selección de secciones, logo |
| Duplicate guards APU | Dedup por nombre/código, reutilización de task importada |
| Budget Selector | Grouped list catálogo maestro + proyecto, dedup guard |

---

## 5. PENDIENTES IMPORTANTES

### 🔴 Alta prioridad
1. **Beta con colegas**
   - Invitar usuarios reales
   - Tracking de uso y errores por usuario
   - Analítica básica (events o logs)

2. **Renombrado conceptual** *(parcialmente implementado)*
   - "Consumos del Proyecto" → "Explosión de Insumos" ✅ hecho en Reportes
   - Verificar si el término aparece en otras partes de la UI (Dashboard widget title, botones)

### 🟡 Media prioridad
3. **Excel premium**
   - Mejorar estética: colores de marca, branding, totales más visibles
   - Exportar desde Explosión con fuente y contexto más claro en portada

4. **Verificar local_override para campos técnicos**
   - `local_override = true` protege precios editados localmente
   - No verificado si también protege technical_yield/unit/notes en futuras sincronizaciones
   - Spec pendiente antes de implementar re-sync

5. **Cómputo por dimensiones (ChandiasCalculator)**
   - Elementos repetidos / sueltos
   - Tareas configuradas
   - Orden constructivo
   - Corrección fórmulas (encofrado de columnas)
   - Sincronización clara con presupuesto

### 🟢 Baja prioridad / Backlog
6. **Billing Stripe** — migraciones 038+039 pendientes
7. **Sincronización viva** — migración 040 pendiente
8. **nonWorkingDates/workingDays** no persisten a Supabase
9. **Migración 044** — align seed names vs catálogo Chandías

---

## 6. ADVERTENCIAS IMPORTANTES

### ⚠️ NO ejecutar estas migraciones sin verificar
```
015, 016, 018, 019, 022, 037, 038, 039, 040, 044
```
Verificar primero con `supabase migration list`. Algunas pueden estar ejecutadas
en producción sin estar en el registro local.

### ⚠️ Vercel NO tiene git auto-conectado
Pushes a GitHub NO disparan deploy automático.
Deploy siempre manual:
```bash
vercel deploy --prod --scope obraflow --yes
vercel alias set <url> obraflow.net --scope obraflow
vercel alias set <url> www.obraflow.net --scope obraflow
```

### ⚠️ ERPContext.tsx — NO tocar sin discutir
Estado global del proyecto activo. Cambios sin análisis pueden romper
presupuesto, tasks, yields y materiales de proyecto.

### ⚠️ RPC calculate_consolidated_resources
Requiere 055 + 056 + 057 ejecutadas. Si solo están 055+056 sin 057,
la RPC falla con `column "r.conversion_factor" does not exist`.

---

## 7. ARCHIVOS CLAVE POR MÓDULO

```
Catálogo Global
  components/GlobalMaterialsAdmin.tsx        ← CRUD + campos técnicos
  components/GlobalTasksAdmin.tsx            ← CRUD APUs globales
  components/AdminPanel.tsx                  ← tabs admin sistema

Catálogo de Empresa
  components/MasterMaterialsPanel.tsx        ← drawer createPortal, campos técnicos
  services/masterMaterialsService.ts         ← CRUD + importFromGlobal()
  hooks/useUnifiedMaterials.ts               ← fusiona resources→materials→master_materials

Reportes
  src/features/reports/ReportsPanel.tsx      ← selector de reportes
  src/features/reports/ConsolidatedProjectReport.tsx  ← Explosión de Insumos
  src/features/reports/APUSummaryReport.tsx
  src/features/reports/BudgetBreakdownReport.tsx
  services/consolidatedCalculatorService.ts  ← llama RPC v3

Dashboard
  components/Dashboard.tsx                   ← Lista de Materiales + Reporte Completo

Calculadora
  src/features/material-calculator/ChandiasCalculator.tsx
  src/features/material-calculator/engine/chandias.ts

Tipos
  types.ts                                   ← 24/24 campos MasterMaterial cubiertos
```

---

## 8. PROMPTS DE ARRANQUE PARA NUEVO CHAT

### Claude Code
```
Trabajá sobre el repo actual de Obraflow.
Stack: React 19 + TypeScript 5.8 + Vite 6 + Tailwind CSS + Supabase + Vercel.

Estado actual (2026-05-26):
- Beta estable. Último deploy: obraflowapp-6azh9ostk (commit 29074cc).
- Migraciones 017, 046–058 ejecutadas en producción.
- Catálogo Global → Catálogo de Empresa funcional con campos técnicos.
- Consumos del Proyecto / Explosión de Insumos funciona (RPC v3).
- Dashboard Lista de Materiales calcula costo total = totalQty × unitCost.
- Vercel NO tiene git auto-conectado — deploy siempre manual.

Ver docs/HANDOFF_CURRENT.md para contexto completo.
Ver docs/AI_WORKFLOW.md para flujo de trabajo.

Tanda:
[DESCRIBIR OBJETIVO]
```

### Gemini Pro
```
Soy el dueño de Obraflow, una SaaS de gestión de obras para arquitectos e
ingenieros en Argentina. Estamos en fase beta cerrada.

Estado actual:
- Auth, presupuesto, APUs, catálogo de materiales, cómputo Chandías funcionan.
- Módulo de reportes: Explosión de Insumos (base presupuesto) y Lista de
  Materiales (precios actuales) están diferenciados.
- Badges contextuales ya implementados.

Necesito ayuda con UX / naming / microcopy:
[DESCRIBIR OBJETIVO]
```

### DeepSeek
```
Soy el arquitecto de Obraflow, SaaS de gestión de obras.

Stack DB: Supabase (PostgreSQL), RLS activa en todas las tablas.
Multitenancy: organization_id UUID como tenant key.
Catálogo global: organization_id IS NULL, acceso via is_master_admin().

Migraciones ejecutadas: 017, 046, 047, 048, 049, 050, 051, 052, 053, 054,
055, 056, 057, 058.
Pendientes: 038, 039, 040, 044.

Tabla central: master_materials — 24 columnas incluye campos técnicos
(technical_yield, technical_yield_unit, technical_notes desde migración 058).

RPC crítica: calculate_consolidated_resources — versión v3, requiere 055+056+057.

Necesito revisión de:
[DESCRIBIR OBJETIVO — schema, RLS, migración, costo computacional]
```

---

*Generado: 2026-05-26*
