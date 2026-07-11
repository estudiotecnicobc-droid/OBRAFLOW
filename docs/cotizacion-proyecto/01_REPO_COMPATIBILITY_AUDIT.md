# Auditoría de Compatibilidad: Cotización → Proyecto
**Rama:** `audit/quotation-to-project-compatibility`  
**Fecha:** 2026-07-11  
**Tipo:** Diagnóstico exclusivo — sin cambios de código productivo

---

## Resumen ejecutivo

El modelo actual de Obraflow puede evolucionar para soportar cotizaciones independientes, pero **`project_id` está embebido como FK obligatoria en todas las tablas del dominio económico**. El motor de cálculo, los snapshots y los reportes están acoplados a `projects` como raíz del árbol.

La evolución es viable en tres opciones con distintos niveles de riesgo. La opción recomendada es la **Opción 2 (tablas separadas con copia al convertir)**, por ser la más segura para datos existentes y la más limpia semánticamente.

---

## Parte A — Mapa del modelo actual

### A.1 Tabla del proyecto

**`public.projects`**

Columnas verificadas en `services/projectsService.ts` (mapper `projectFromRow`):

| Columna DB | Campo TS | Nullable |
|---|---|---|
| `id` | `id` | NO |
| `organization_id` | `organizationId` | NO (FK uuid → organizations) |
| `name` | `name` | NO |
| `client` | `client` | SÍ (devuelve '') |
| `currency` | `currency` | SÍ (default 'ARS') |
| `start_date` | `startDate` | SÍ |
| `end_date` | `endDate` | SÍ |
| `status` | `status` | SÍ (default 'planning') |
| `ggd_pct / ggi_pct / profit_pct / tax_pct` | `businessConfig` | SÍ |
| `cost_base` | `costBase` | SÍ — fecha base para motor de costos |
| `address / company_name / surface / …` | campos técnicos | SÍ |
| `dependencies` | `dependencies[]` | SÍ — Gantt |
| `working_days / non_working_dates / …` | calendario | SÍ |

**No existe campo `quotation_id`, `client_id` como FK, `validity_date`, ni `commercial_status`.**

---

### A.2 Tabla del presupuesto

No existe una tabla `budgets` separada. **El presupuesto vive dentro del proyecto:**

- `Project.items: BudgetItem[]` — array en memoria, sincronizado con `budget_items`
- Configuración K (coeficiente de pase): columnas `ggd_pct / ggi_pct / profit_pct / tax_pct` en `projects`
- Snapshot de costos: tabla `budget_cost_snapshots` con FK a `projects`

---

### A.3 Tabla de ítems presupuestarios

**`public.budget_items`**

Columnas verificadas en `services/budgetItemsService.ts` (mapper `budgetItemFromRow`):

| Columna DB | Campo TS | Nullable |
|---|---|---|
| `id` | `id` | NO |
| `project_id` | `projectId` | NO en DB (`NOT NULL` implícito por FK) — en tipo TS: `projectId?: string` (opcional por legacy) |
| `organization_id` | `organizationId` | SÍ en TS (`?`) |
| `task_id` | `taskId` | NO |
| `quantity` | `quantity` | SÍ (default 1) |
| `sort_order` | `sortOrder` | SÍ (migración 014) |
| `computation_item_id` | `computationItemId` | SÍ (migración 040 — solo trazabilidad) |
| `start_date / end_date / status / …` | planificación | SÍ |

**HECHO CRÍTICO:** `project_id` es FK hacia `projects` con `ON DELETE CASCADE`. Cada ítem presupuestario necesita obligatoriamente un proyecto en DB.

El listado siempre filtra por `project_id`:
```typescript
// services/budgetItemsService.ts:73-80
async listForProject(projectId: string): Promise<BudgetItem[]> {
  .from('budget_items')
  .eq('project_id', projectId)
```

---

### A.4 Rubros, tareas y nodos jerárquicos

**No existe estructura jerárquica en DB.** El presupuesto es una **lista plana** ordenada por `sort_order`.

Lo que existe:
- `Task.category?: string` — agrupador en UI (rubro como etiqueta, no FK)
- `sort_order` en `budget_items` — orden visual
- `BudgetItem.dependencies?: Dependency[]` — vínculos de planificación Gantt

Lo que **no existe**:
- `parent_id` en budget_items
- tabla `rubros` con FK
- tabla `partidas`
- campo `node_id`

Los "rubros" en `BudgetEditor.tsx` son grupos UI calculados dinámicamente desde `task.category`.

---

### A.5 Vínculo tarea ↔ APU

```
budget_items.task_id  →  tasks.id          (nivel proyecto)
tasks.master_task_id  →  master_tasks.id   (APU maestro, opcional)
```

Cadena verificada en migración 018, RPC `get_budget_for_calculator` (líneas 127–148):
```sql
FROM public.budget_items bi
INNER JOIN public.tasks t ON t.id = bi.task_id
  AND t.master_task_id IS NOT NULL
INNER JOIN public.master_tasks mt ON mt.id = t.master_task_id::uuid
WHERE bi.project_id = p_project_id
```

**Items sin `master_task_id`** son contados como `itemsWithoutMaster` — no participan del motor de costos.

---

### A.6 Dónde se guardan cantidades

| Entidad | Campo | Tabla |
|---|---|---|
| Ítem presupuestario | `quantity` | `budget_items.quantity` |
| Rendimiento de material | `quantity` | `master_task_materials.quantity` (por unidad de tarea) |
| Rendimiento de labor | `quantity` | `master_task_labor.quantity` (cant. trabajadores por u.) |
| Rendimiento de equipo | `hours_per_unit` | `master_task_equipment.hours_per_unit` |
| Cómputo paramétrico | `quantity` | `computation_items.quantity` |

---

### A.7 Dónde se guardan precios

| Fuente | Tabla | Columna |
|---|---|---|
| Precio live de material | `master_materials` | `unit_price` |
| Snapshot de precio | `resource_cost_snapshots` | `cost` (con `effective_date`) |
| Costo base de recurso | `resources` | `base_cost` |
| Precio capturado al importar APU | `master_task_materials` | `last_known_unit_price` (fallback) |
| Tarifa snapshot de labor | `master_task_labor` | `snapshot_hourly_rate` (fallback) |
| Resultado calculado | `budget_cost_snapshots` | `result` (JSONB — inmutable) |

---

### A.8 Dónde se guardan rendimientos

| Tipo | Tabla |
|---|---|
| Material por unidad de APU | `master_task_materials.quantity` + `waste_percent` |
| Labor (trabajadores por u.) | `master_task_labor.quantity` |
| Equipo (horas por u.) | `master_task_equipment.hours_per_unit` |
| Rendimiento diario del APU | `master_tasks.daily_yield` |
| Rendimiento estándar Chandías | `computation_items.materiales_snapshot` (JSONB, sin precios) |
| Yields nivel proyecto (legacy) | `task_yields`, `task_labor_yields`, `task_tool_yields` |

---

### A.9 Snapshots existentes

**Tabla `budget_cost_snapshots`** (migración 018):
- `project_id` FK → `projects` (NOT NULL, CASCADE)
- `organization_id` FK → `organizations` (NOT NULL, CASCADE)
- `cost_date` — fecha base usada para el cálculo
- `input_items` JSONB — `[{master_task_id, quantity}]`
- `result` JSONB — `{materials[], labor[], equipment[], totals{}}`
- `computed_at` — timestamp inmutable
- **Regla: nunca se actualiza. Nuevo cálculo = nueva fila.**

**Snapshots legacy en TypeScript** (no en DB real):
```typescript
// types.ts:632-643
interface Snapshot {
  projectId: string;
  items: BudgetItem[];
  materialsSnapshot: Material[];
}
```
Estos son localStorage y no están versionados en Supabase.

**Snapshot técnico en `computation_items.materiales_snapshot`** (migración 040):
- JSONB con `{nombre, unit, coef, cantidad}` — sin precios, solo cantidades técnicas.

---

### A.10 Datos que se recalculan con precios vivos

- El motor `calculate_consolidated_resources` (migración 015/045) resuelve precios live desde:
  1. `resource_cost_snapshots` con `effective_date <= cost_date`
  2. Fallback: `resources.base_cost`
  3. Fallback: `master_materials.unit_price`

- `BudgetBreakdownReport` llama a `recalculateBudgetFromSupabase` con una fecha configurable.
- `ConsolidatedProjectReport` (Explosión de Insumos) usa el mismo motor.
- `get_budget_cost_staleness` detecta materiales cambiados post-snapshot.

---

### A.11 Datos congelados

- `budget_cost_snapshots.result` — inmutable por diseño (migración 018)
- `computation_items.materiales_snapshot` — snapshot técnico sin precios
- `MasterTaskMaterial.lastKnownUnitPrice` — precio capturado al importar (fallback)
- `ProjectCertificate.items[].unitPrice` — snapshot al momento de emisión (tipo TS, no tabla DB)

---

### A.12 Reportes que dependen de `project_id`

| Reporte | Archivo | Dependencia |
|---|---|---|
| Desglose de Presupuesto | `BudgetBreakdownReport.tsx` | Selector de proyecto UI obligatorio + `projectId` para calcular |
| Explosión de Insumos | `ConsolidatedProjectReport.tsx` | `project` desde ERPContext (proyecto activo) |
| Análisis de APUs | `APUSummaryReport.tsx` | Solo `organizationId` — **no depende de project_id** |
| APU Técnico | `APUTechnicalReportDrawer.tsx` | Solo `master_task_id` — **no depende de project_id** |

---

### A.13 Servicios que no funcionarían sin `project_id`

- `budgetItemsService.listForProject(projectId)` — parámetro obligatorio
- `budgetItemsService.removeAllForProject(projectId)` — parámetro obligatorio
- `get_budget_for_calculator(p_project_id, …)` — FK obligatorio en RPC
- `snapshot_budget_costs(p_project_id, …)` — FK obligatorio en RPC
- `get_budget_cost_staleness(p_project_id, …)` — FK obligatorio en RPC
- `computationService` — `project_computations.project_id` NOT NULL

---

### A.14 Componentes que crean proyectos automáticamente

**`components/ProjectWizard.tsx`**: único punto de creación. Llama `createNewProject(newProjectData)` en ERPContext. No crea cotizaciones, no genera ID externo, no asigna estado comercial.

No hay flujo que cree un proyecto desde una cotización aprobada.

---

### A.15 Tablas y RPCs no versionadas en migraciones

Las siguientes tablas se mencionan en código pero **no tienen migración verificada en el directorio**:

| Entidad | Evidencia | Estado |
|---|---|---|
| `tasks` | usada por todos los servicios | No hay migración `000_` o `001a_tasks.sql` visible |
| `task_yields` | `tasksService.ts` | No verificada en migraciones |
| `task_labor_yields` | `tasksService.ts` | No verificada en migraciones |
| `task_tool_yields` | `tasksService.ts` | No verificada en migraciones |
| `master_tasks` | usada extensamente | No hay migración inicial visible |
| `master_task_materials/labor/equipment` | idem | No hay migración inicial visible |
| `materials / tools / labor_categories` | ERPContext | No hay migración visible |

**Inferencia:** estas tablas probablemente existen en la DB de producción vía migración manual o pre-migración no versionada. Esto es una deuda técnica ya documentada en el HANDOFF.

---

## Parte B — Cadena real de datos

```
Catálogo Global (master_materials: organization_id NULL)
    ↓ [importar a empresa]
    services/masterMaterialsService.ts → INSERT master_materials (con org_id)
    services/importGlobalResourcesService.ts → INSERT resources (con org_id)
    
Catálogo de Empresa (master_materials: org_id, master_tasks: org_id)
    ↓ [crear/editar APU]
    components/APUBuilder.tsx → masterTasksSupabaseService.ts
    → master_tasks + master_task_materials + master_task_labor + master_task_equipment
    → Precio: master_materials.unit_price (live) o resource_cost_snapshots (versionado)
    
APU (master_tasks)
    ↓ [agregar al presupuesto]
    components/BudgetEditor.tsx → useERP() → addBudgetItem()
    → ERPContext: tasksService.create(task con master_task_id) + budgetItemsService.create(budget_item)
    → budget_items.project_id = project.id (obligatorio)
    → budget_items.task_id → tasks.master_task_id → master_tasks.id
    
Presupuesto (budget_items + tasks por proyecto)
    ↓ [calcular costos]
    RPC get_budget_for_calculator(project_id) → [{master_task_id, quantity}]
    RPC calculate_consolidated_resources(items, org_id, cost_date)
    → Precio: resource_cost_snapshots o master_materials.unit_price (LIVE)
    → Resultado en memoria (BudgetItemCost[])
    
    ↓ [snapshot inmutable]
    RPC snapshot_budget_costs(project_id) → INSERT budget_cost_snapshots
    → Precio: CONGELADO en result JSONB al momento del snapshot
    
Explosión de Insumos (reporte)
    src/features/reports/ConsolidatedProjectReport.tsx
    → useERP() proyecto activo → recalculateBudgetFromSupabase(project, org_id, cost_date)
    → Precio: resource_cost_snapshots o master_materials.unit_price (según costDate)
    → Render en UI + export XLSX
    
Lista de Materiales
    → mismo motor, agrupado por material en lugar de por ítem
    → Precio: LIVE (currentDate como costDate)
    
Reportes
    → BudgetBreakdownReport: project_id + costDate → recalcula desde DB
    → APUSummaryReport: solo organization_id → no depende de proyecto
```

**Identifiers usados en cada paso:**

| Paso | Identificador principal | Copia o referencia |
|---|---|---|
| Global → Empresa | `organization_id` | Copia (INSERT nuevo registro) |
| Empresa → APU | `organization_id` | Referencia (FK master_material_id) |
| APU → Presupuesto | `project_id` + `master_task_id` | Referencia (FK) |
| Presupuesto → Snapshot | `project_id` | Copia (JSONB inmutable) |
| Snapshot → Reporte | `project_id` | Referencia a snapshot |

---

## Parte C — Compatibilidad con cotizaciones

### C.1 ¿Puede hoy existir un presupuesto sin `project_id`?

**No.** Verificado en:
- `budget_items` tiene `project_id` como FK `NOT NULL` en DB (CASCADE DELETE)
- `budgetItemsService.listForProject(projectId)` exige `projectId` como parámetro
- `budget_cost_snapshots.project_id` es `NOT NULL REFERENCES projects`
- El tipo TS `BudgetItem.projectId?: string` tiene `?` pero es un artefacto de legacy migration, no un diseño intencional

---

### C.2 ¿`project_id` es obligatorio en DB, tipos, servicios o interfaz?

| Capa | Estado |
|---|---|
| DB (budget_items) | FK NOT NULL — obligatorio |
| DB (budget_cost_snapshots) | FK NOT NULL — obligatorio |
| DB (project_computations) | FK NOT NULL — obligatorio |
| Tipo TS BudgetItem.projectId | `?: string` — opcional en tipo, obligatorio en práctica |
| Servicio budgetItemsService | `listForProject(projectId: string)` — obligatorio |
| RPCs principales | parámetro `p_project_id uuid` — obligatorio |
| UI BudgetEditor | lee de `useERP().project` — siempre hay proyecto activo |

---

### C.3 ¿Se puede reutilizar `budget_items` para cotizaciones?

**Técnicamente sí, pero implica romper la FK.**

La opción sería:
1. Hacer `budget_items.project_id` nullable
2. Agregar `quotation_id uuid REFERENCES quotations`
3. Constraint: exactamente uno de los dos debe ser NOT NULL

Esto es viable pero afecta todas las RPCs, políticas RLS y servicios que filtran por `project_id`.

---

### C.4 ¿Conviene crear `quotation_items` separados?

**Sí, por las siguientes razones verificadas:**
- `budget_items` tiene campos de planificación (`start_date`, `end_date`, `crews_assigned`, `progress`) que no aplican a una cotización pre-proyecto
- `budget_items.computation_item_id` es un vínculo a sesiones Chandías por proyecto — no aplica en cotización
- Separar evita llenar `budget_items` con NULLs estructurales

El esquema de `quotation_items` podría ser más delgado: solo `quantity`, `sort_order`, `master_task_id` directo (sin tarea nivel proyecto intermedia).

---

### C.5 ¿El modelo soporta varias versiones?

**No actualmente.** No existe ningún campo de versión ni tabla de versiones en el dominio económico. Los snapshots de `budget_cost_snapshots` son historial de cálculos, no versiones de la cotización.

Para versiones se necesitaría un nuevo modelo.

---

### C.6 ¿Existe estructura jerárquica flexible?

**No.** El presupuesto es una lista plana con `sort_order`. La jerarquía de rubros es solo agrupación UI por `task.category`.

Para cotizaciones con secciones, sub-secciones y ítems se necesita un campo `parent_id` o una tabla separada de nodos.

---

### C.7 ¿Los snapshots actuales alcanzan para congelar una versión enviada?

**Parcialmente.** `budget_cost_snapshots` congela precios y cantidades APU en un momento. Pero:
- Solo congela el resultado del cálculo, no la estructura de ítems (el JSONB `input_items` tiene `[{master_task_id, quantity}]`, no los nombres, descripciones ni precios unitarios visibles al cliente)
- No congela el coeficiente K (businessConfig) ni factores comerciales
- No tiene estado comercial (enviado, aprobado, rechazado)
- No tiene datos de cliente como entidad (solo `client: string` en el proyecto)
- No soporta versiones múltiples por cotización

Para congelar una versión enviada se necesitaría capturar también: líneas de cotización con precios de venta, coeficiente K, datos del cliente, fecha de vigencia.

---

### C.8 ¿Cómo evitar duplicar el motor de cálculo?

El motor de cálculo (`calculate_consolidated_resources`) ya acepta un array genérico `[{master_task_id, quantity}]`. **No está acoplado a `project_id`.** Es reutilizable sin cambios para cotizaciones.

El problema está en `get_budget_for_calculator` que extrae los ítems desde `budget_items WHERE project_id = $1`. Se necesitaría una función paralela `get_quotation_for_calculator(quotation_id)` que extrajera los ítems de la tabla de cotizaciones, pero llamando al mismo `calculate_consolidated_resources`.

Alternativa más limpia: hacer `get_budget_for_calculator` agnóstica al origen y recibir directamente los items `[{master_task_id, quantity}]` desde el llamador.

---

### C.9 ¿Cómo conservar compatibilidad con proyectos existentes?

Cualquiera de las tres opciones debe garantizar:
1. Todos los `budget_items` existentes con `project_id` siguen funcionando sin cambios
2. Las RPCs `snapshot_budget_costs`, `get_budget_for_calculator` siguen aceptando `p_project_id`
3. `BudgetEditor` y `ReportsPanel` siguen funcionando con el proyecto activo en ERPContext

La estrategia más segura es crear tablas paralelas para cotizaciones y no tocar las existentes.

---

### C.10 ¿Qué reportes deberían aceptar `quotation_id` además de `project_id`?

| Reporte | Hoy | Con cotizaciones |
|---|---|---|
| Desglose de Presupuesto | `project_id` obligatorio | Aceptar `quotation_id` como alternativa |
| Explosión de Insumos | proyecto activo en ERPContext | Aceptar `quotation_id` como alternativa |
| APU Summary | solo `org_id` — ya es agnóstico | Sin cambios |
| APU Técnico | solo `master_task_id` — agnóstico | Sin cambios |
| Nuevo: Cotización PDF | no existe | Crear: datos cliente + ítems con precio de venta + K |

---

## Parte D — Opciones de arquitectura

### Opción 1: `quotation_id` opcional en estructuras actuales

**Qué implica:**
- Agregar `quotation_id uuid NULL REFERENCES quotations` a `budget_items`
- Agregar `quotation_id uuid NULL REFERENCES quotations` a `budget_cost_snapshots`
- Constraint: `project_id` o `quotation_id`, nunca ambos null
- Nueva tabla `quotations` (id, org_id, name, status, client, validity_date, …)
- Hacer `budget_items.project_id` nullable en DB

| Criterio | Evaluación |
|---|---|
| Complejidad | Media — cambios en todas las consultas existentes |
| Riesgo de migración | **Alto** — `project_id` de NOT NULL a nullable es destructivo; data migration |
| Duplicación | Baja — reutiliza todo el schema |
| Compatibilidad | Difícil — todas las queries y RLS cambian |
| RLS | Compleja — la política debe cubrir `project_id OR quotation_id` |
| Versionado | No contemplado por defecto |
| Snapshots | Funciona cambiando FK |
| Reportes | Cambio en todos los reportes de scope 'Proyecto' |
| Tests | Todos los tests de budget_items cambian |
| Mantenimiento | Alto — condiciones OR en todas partes |

**Conclusión:** Opción más simple de imaginar, pero más riesgosa de ejecutar. Acopla cotizaciones y proyectos semánticamente de forma que complica el modelo a largo plazo.

---

### Opción 2: Tablas separadas de cotizaciones; copia al convertir

**Qué implica:**
- Nuevas tablas: `quotations`, `quotation_versions`, `quotation_items`, `quotation_snapshots`
- Las tablas existentes (`budget_items`, `tasks`, etc.) no se modifican
- Al aprobar una versión y convertir: se crean un proyecto + budget_items copiando la estructura de la cotización
- El proyecto guarda `source_quotation_id` y `source_quotation_version_id` como referencia (nullable)

| Criterio | Evaluación |
|---|---|
| Complejidad | Alta — nuevo dominio completo |
| Riesgo de migración | **Bajo** — solo agrega tablas; no toca datos existentes |
| Duplicación | Media — duplica motor de presentación, no el de cálculo |
| Compatibilidad | **Total** — proyectos existentes intactos |
| RLS | Limpia — policies nuevas solo en tablas nuevas |
| Versionado | Diseñado desde el inicio |
| Snapshots | Nueva tabla `quotation_snapshots` con misma estructura |
| Reportes | Nuevos reportes de cotización; reportes de proyecto sin cambios |
| Tests | Tests nuevos para cotizaciones; tests existentes sin cambios |
| Mantenimiento | Medio — dos dominios independientes con interfaz de conversión |

**Conclusión: Opción recomendada.** El costo es implementar un dominio nuevo, pero no toca datos existentes ni rompe compatibilidad.

---

### Opción 3: Entidad genérica `economic_document`

**Qué implica:**
- Nueva tabla `economic_documents` con `type: 'quotation' | 'project_budget'`
- `economic_document_items` reemplaza a `budget_items`
- Proyectos y cotizaciones apuntan a un `economic_document_id`
- Un documento puede tener múltiples versiones

| Criterio | Evaluación |
|---|---|
| Complejidad | **Muy alta** — refactor arquitectural completo |
| Riesgo de migración | **Crítico** — migración de todos los datos existentes |
| Duplicación | Mínima — un solo modelo |
| Compatibilidad | Rota — todos los servicios, RPCs y componentes cambian |
| RLS | Muy compleja — policy unificada con discriminador de tipo |
| Versionado | Nativo |
| Snapshots | Rediseñados |
| Reportes | Refactorizados completos |
| Tests | Todos reescritos |
| Mantenimiento | Bajo a largo plazo si el diseño es bueno |

**Conclusión:** Correcta en teoría, prematura en práctica. Con 29 errores de typecheck activos y módulos en localStorage, un refactor de esta magnitud tiene riesgo de regresión inaceptable antes de la beta.

---

### Recomendación

**Opción 2** — tablas separadas con copia en la conversión.

**Hechos verificados que justifican esta recomendación:**
1. `budget_items.project_id` es `NOT NULL FK` — cambiar a nullable es la operación más riesgosa posible en una tabla con datos de producción
2. El motor de cálculo `calculate_consolidated_resources` ya es agnóstico — no necesita cambios
3. `budget_cost_snapshots` tiene el mismo patrón inmutable que puede replicarse en `quotation_snapshots`
4. RLS basada en `is_org_member(organization_id)` es directamente porteable a tablas nuevas
5. Los 29 errores de typecheck y los módulos en localStorage desaconsejan un refactor profundo antes de estabilizar el core

---

**Separación de hechos / inferencias / propuesta:**

| Item | Tipo |
|---|---|
| `project_id` es FK NOT NULL en `budget_items` | HECHO (verificado en migración 018 y servicio) |
| Motor de cálculo es agnóstico al origen | HECHO (verificado en RPCs 015/045) |
| 29 errores de typecheck activos | HECHO (verificado con `npm run lint`) |
| Módulos en localStorage como riesgo | HECHO (verificado en tipos y handoff) |
| Opción 2 es la más segura | INFERENCIA/PROPUESTA basada en hechos anteriores |

---

## Parte E — RLS y multitenancy para entidades nuevas

### Entidades nuevas necesarias

| Tabla | Columna tenant | Política SELECT | Política INSERT/UPDATE | Política DELETE |
|---|---|---|---|---|
| `quotations` | `organization_id uuid NOT NULL` | `is_org_member(organization_id)` | `is_org_member_with_role(…, ['owner','admin','editor'])` | `is_org_member_with_role(…, ['owner','admin'])` |
| `quotation_versions` | `organization_id` (denorm desde quotation) | via join a quotation | idem | idem |
| `quotation_items` | `organization_id uuid NOT NULL` | `is_org_member(organization_id)` | idem editor+ | idem admin+ |
| `quotation_snapshots` | `organization_id uuid NOT NULL` | `is_org_member(organization_id)` | `is_org_member(…)` (invoker) | solo admin/owner |
| `quotation_factors` | `organization_id uuid NOT NULL` | `is_org_member(organization_id)` | idem | idem |
| `quotation_project_conversions` | `organization_id uuid NOT NULL` | `is_org_member(organization_id)` | solo quien convierte | inmutable |

**La función `is_org_member()` es directamente reutilizable** sin cambios — acepta UUID y TEXT.

**No hay mecanismo de sharing entre organizaciones.** Si se necesitara compartir una cotización entre orgs (ej: cotización enviada a cliente externo), se requeriría un token de acceso separado o una política de `public_share_token`.

---

## Parte F — Secuencia de migración mínima (sin implementar)

### Fase 0 — Prerequisitos (no de cotizaciones)
1. Resolver los 29 errores de typecheck actuales
2. Ejecutar migración 040 (computation schema) si no está aplicada en prod
3. Ejecutar migraciones 044 (name mismatch catálogo) si se decide avanzar

### Fase 1 — Nuevas tablas (solo ADD, sin tocar existentes)
1. Migración: `059_quotations_schema.sql`
   - `quotations` (id, org_id, name, client_name, client_email, address, currency, validity_date, status ENUM, created_by, …)
   - `quotation_versions` (id, quotation_id, version_number, status ENUM, frozen_at, sent_at, approved_at, …)
   - `quotation_items` (id, quotation_version_id, org_id, master_task_id FK, name_snapshot, unit_snapshot, quantity, sort_order, …)
   - `quotation_snapshots` (id, quotation_version_id, org_id, cost_date, input_items JSONB, result JSONB, computed_at, created_by)
   - `quotation_factors` (id, quotation_version_id, ggd_pct, ggi_pct, profit_pct, tax_pct, discount_pct, …)
   - `quotation_project_conversions` (id, quotation_id, quotation_version_id, project_id FK, converted_by, converted_at)
2. RLS sobre todas las tablas nuevas (política `is_org_member`)
3. Índices: `quotation_id, organization_id, status`

### Fase 2 — Servicios
1. `quotationsService.ts` — CRUD de quotations y versions
2. `quotationItemsService.ts` — CRUD de items de cotización (sin `task_id` de proyecto)
3. `quotationSnapshotService.ts` — análogo a `budgetSnapshotService` pero con `quotation_version_id`
4. `quotationConversionService.ts` — convierte versión aprobada en proyecto + budget_items

### Fase 3 — RPCs nuevas
1. `get_quotation_for_calculator(quotation_version_id)` — extrae `[{master_task_id, quantity}]` desde `quotation_items`
2. `snapshot_quotation_costs(quotation_version_id, cost_date)` — reutiliza `calculate_consolidated_resources`
3. `convert_quotation_to_project(quotation_version_id, project_name)` — transacción: crea proyecto + copia items

### Fase 4 — Feature flag
1. `VITE_FEATURE_QUOTATIONS=false` — oculta el módulo hasta que esté listo
2. Solo activar en staging primero

### Fase 5 — UI
1. Nueva sección "Cotizaciones" en navegación (oculta bajo feature flag)
2. `QuotationList`, `QuotationEditor`, `QuotationVersionControl`
3. Botón "Enviar" → congela versión, genera snapshot
4. Botón "Convertir a Proyecto" → llama RPC de conversión
5. Reportes de cotización (PDF con membrete, precio de venta, vigencia)

### Fase 6 — Conversión
1. `quotationConversionService.convert(quotation_version_id)`:
   - INSERT en `projects`
   - INSERT en `tasks` (una por `quotation_item`, con `master_task_id`)
   - INSERT en `budget_items` (con `project_id`, `task_id`)
   - INSERT en `quotation_project_conversions`

### Fase 7 — Reportes
1. Adaptar `BudgetBreakdownReport` para aceptar `quotation_version_id` opcional
2. Adaptar `ConsolidatedProjectReport` idem
3. Nuevo: `QuotationPDFReport` con datos de cliente, vigencia, coeficiente K

### Fase 8 — Tests
1. Test unitario del servicio de conversión
2. E2E: flujo cotización → versión → snapshot → conversión → presupuesto
3. Test cross-tenant: cotización de org A no visible desde org B

### Fase 9 — Retiro de compatibilidad temporal
1. Evaluar si algún proyecto creado manualmente debería asociarse retroactivamente a cotización
2. Decisión: proyectos directos siguen siendo válidos (no forzar retroactividad)

---

## Parte G.2 — Deuda técnica detectada

| # | Deuda | Impacto en cotizaciones |
|---|---|---|
| 1 | 29 errores de typecheck (`npm run lint`) | Bloquea confiar en tipos al diseñar nuevas entidades |
| 2 | `billing` types ausentes en `types.ts` (`OrgSubscription`, `PlanId`, etc.) | Menor |
| 3 | Módulos en localStorage (Recepción, Calidad, Subcontratistas, etc.) | Aparecen como SaaS real; confunden alcance del MVP |
| 4 | Tablas core (`tasks`, `master_tasks`) sin migración versionada visible | Riesgo de diff entre repo y DB de producción |
| 5 | `supabase/seeds/seed-demo-dataset.ts` con tokens hardcodeados | Error TS + riesgo de seguridad |
| 6 | `snapshot_budget_costs` solo congela el resultado JSONB, no la estructura UI | Un snapshot de cotización necesita más campos (precio de venta, K) |
| 7 | `get_budget_for_calculator` asume `budget_items → tasks → master_tasks` con 3 joins | Replicar esta lógica para cotizaciones sin refactor del RPC |
| 8 | `BudgetItem.projectId?: string` es opcional en tipos pero obligatorio en DB | Confunde a quien diseñe las interfaces de cotización |

---

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Migrar `project_id` a nullable en datos de producción | — | Crítico | Usar Opción 2 (no tocar tabla existente) |
| Motor de cálculo diferente para cotizaciones | Bajo | Alto | Reutilizar `calculate_consolidated_resources` directamente |
| RLS de cotizaciones mal configurada → cross-tenant | Media | Crítico | Test con org A y B en staging antes de beta |
| Conversión cotización → proyecto pierde datos | Media | Alto | Transacción atómica en RPC + test de integración |
| Typecheck con 29 errores enmascara errores nuevos | Alto | Medio | Resolver errores antes de agregar tipos de cotización |
| `quotation_items` sin `task_id` rompe APUs anidados | Bajo | Medio | Usar `master_task_id` directo en quotation_items |

---

## Preguntas abiertas

1. ¿Una cotización puede tener múltiples versiones activas simultáneamente o solo una a la vez?
2. ¿El cliente externo ve la cotización en un portal o solo la recibe por PDF/email?
3. ¿Los factores K (GGD, GGI, utilidad) son por versión o por cotización completa?
4. ¿Puede una cotización convertirse en múltiples proyectos (ej: etapas)?
5. ¿Los ítems de cotización referencian directamente `master_tasks` o permiten ítems libres (sin APU)?
6. ¿La cotización tiene una moneda propia que puede diferir del proyecto?
7. ¿Qué pasa si los precios del APU cambian después de enviar la cotización al cliente?
8. ¿Se necesita un historial de revisiones del cliente (contraoferta)?
9. ¿La cotización usa la misma jerarquía plana de rubros o necesita secciones con sub-secciones?
10. ¿El flujo de cotización debe estar disponible para todos los roles o solo admin/editor?

---

## Propuesta de PRs futuros

| PR | Contenido | Rama sugerida | Prerequisito |
|---|---|---|---|
| PR A | Corregir 29 errores de typecheck | `fix/typecheck-errors` | — |
| PR B | Definir tipos TS de cotización en `types.ts` | `feat/quotation-types` | PR A |
| PR C | Migración 059: schema de cotizaciones en DB | `feat/quotation-schema` | — |
| PR D | Servicios de cotización (CRUD) | `feat/quotation-services` | PR B + PR C |
| PR E | RPC `get_quotation_for_calculator` + `snapshot_quotation_costs` | `feat/quotation-rpcs` | PR C |
| PR F | RPC `convert_quotation_to_project` (transacción) | `feat/quotation-conversion` | PR C + PR D |
| PR G | UI: lista y editor de cotizaciones (bajo feature flag) | `feat/quotation-ui` | PR D + PR E |
| PR H | UI: control de versiones y envío | `feat/quotation-version-control` | PR G |
| PR I | UI: botón de conversión a proyecto | `feat/quotation-to-project-ui` | PR F + PR H |
| PR J | Reportes adaptados para cotizaciones | `feat/quotation-reports` | PR E + PR I |
| PR K | Tests E2E: flujo completo de cotización | `test/quotation-e2e` | PR I |

---

## Verificaciones ejecutadas en esta rama

| Verificación | Resultado |
|---|---|
| `npm run lint` (tsc --noEmit) | **29 errores** — preexistentes, no introducidos por esta rama |
| Lectura de migraciones (001–058) | Completada — sin ejecutar ninguna |
| Lectura de tipos (types.ts) | Completada |
| Lectura de servicios (budgetItemsService, projectsService) | Completada |
| Lectura de migración 018 (snapshots) | Completada |
| Lectura de migración 040 (computation schema) | Completada |
| Lectura de componentes (BudgetEditor, ReportsPanel, ProjectWizard) | Completada |
| Búsquedas estáticas (quotation, version, snapshot) | Completadas |
| Sin cambios en código productivo | Verificado (`git diff` — solo archivos nuevos) |
| Sin migraciones ejecutadas | Verificado |
| Sin push a main | Verificado |
