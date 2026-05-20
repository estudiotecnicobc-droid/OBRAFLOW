# Arquitectura: Catálogo Global y Catálogo de Empresa

**Fecha:** 2026-05-20  
**Estado:** Aprobado para implementación por fases  
**Alcance:** Beta — sin romper flujos de APU, presupuesto ni cómputo existentes

---

## 1. Diagnóstico actual

### 1.1 Tablas relevantes en Supabase

| Tabla | `organization_id` | Propósito real | Esquema clave |
|---|---|---|---|
| `resources` | IS NULL = global / = orgId = org | Catálogo de referencia con precios versionados. Backbone del motor de costos recursivo. | id, code, name, unit, type (MATERIAL/LABOR/EQUIPMENT/SUBCONTRACT), base_cost, snapshot support |
| `master_materials` | IS NULL = global / = orgId = org | Catálogo comercial de materiales. Incluye metadata de compra y factor de conversión. | id, name, unit, unit_price, currency, category, supplier, commercial_format, conversion_factor, commercial_unit |
| `materials` | = orgId | Lista plana de materiales por proyecto (sistema legacy/ERPContext). | id, name, unit, cost — sin metadata comercial |
| `tools` | = orgId | Herramientas y equipos del proyecto. | id, name, cost_per_hour |
| `labor_categories` | = orgId | Categorías de mano de obra del proyecto. | id, role, basic_hourly_rate |
| `master_tasks` | IS NULL = global / = orgId = org | APUs de la empresa (y catálogo global para importar). | id, name, code, unit, daily_yield, fixed_cost, materials, labor, equipment |
| `master_task_materials` | vía master_task_id | Composición APU — path legacy. Referencia `master_materials` por nombre. | master_task_id, material_name, unit, quantity, last_known_unit_price |
| `catalog_task_yields` | vía master_task_id | Composición APU — path nuevo. FK directa a `resources`. | master_task_id, resource_id, quantity |
| `resource_cost_snapshots` | vía resource_id | Precio versionado por fecha para `resources`. | resource_id, organization_id, cost_date, unit_cost |

### 1.2 Pantallas actuales → componentes → servicios → tablas

| Label en UI | `activeSubTab` | Componente | Servicio | Tabla(s) | Rol funcional |
|---|---|---|---|---|---|
| **Recursos** | `'materials'` | DataAdmin (inline) | `materialsService.listForOrg()` | `materials` | Lista plana org-específica. Alimenta `task_yields` legacy. |
| _(Herramientas)_ | `'tools'` | DataAdmin (inline) | `toolsService.listForOrg()` | `tools` | Herramientas del proyecto. |
| **Mano de Obra** | `'labor'` | DataAdmin (inline) | `laborCategoriesService.listForOrg()` | `labor_categories` | Categorías MO del proyecto. |
| **APU** | `'master-tasks'` | `MasterTasksPanel` | `masterTasksSupabaseService` | `master_tasks` + `master_task_materials` / `catalog_task_yields` | APUs de la empresa. Tiene modal `CatalogImportModal`. |
| **Materiales Maestros** | `'master'` | `MasterMaterialsPanel` | `masterMaterialsService.list(orgId)` | `master_materials` (org + IS NULL) | Catálogo comercial. Incluye globales con badge "Global". |
| **Recursos Globales** | `'resources'` | `GlobalResourcesPanel` | `resourcesService.listGlobal()` | `resources` (IS NULL) | Catálogo de referencia global. Botón "Importar a la empresa". |
| Plantillas | `'templates'` | `BudgetTemplatesPanel` | `budgetTemplatesSupabaseService` | `budget_templates` | Plantillas de presupuesto. |
| Cómputo | `'computo'` | `ParametricCalculator` | — | `project_computations` | Calculadora paramétrica. |
| Reportes | `'reports'` | `ReportsPanel` | — | múltiples | Reportes APU, presupuesto, consolidado. |
| Sistema | `'system'` | `UsersPanel` + seed | — | `organization_members` | Usuarios, permisos, datos de prueba. |

### 1.3 Flujos de importación actuales

```
resources (IS NULL)
  └─► [GlobalResourcesPanel → importGlobalResourcesToOrg]
        → materials (orgId)         [MATERIAL type]
        → labor_categories (orgId)  [LABOR type]
        → tools (orgId)             [EQUIPMENT type]

master_tasks (IS NULL) + resources (IS NULL)
  └─► [MasterTasksPanel → CatalogImportModal → importGlobalCatalogToOrg RPC]
        → master_tasks (orgId)
        → resources (orgId)          [copia los recursos necesarios]
        → applyCommercialRules()     [normaliza unidades comerciales]

master_materials (IS NULL)
  └─► (ningún flujo de importación org existe actualmente) ✗
```

### 1.4 Motor de costos APU (dos paths paralelos)

```
Path A — Legacy (master_task_materials):
  master_tasks → master_task_materials → lastKnownUnitPrice (de master_materials, sin snapshot)
  Usado por: calculationService, APUBuilder inline

Path B — Nuevo (catalog_task_yields + resources):
  master_tasks → catalog_task_yields → resources → get_resource_cost RPC
                                                   → resource_cost_snapshots
  Usado por: recursiveCostEngine, buildRecursiveCostEngine, recalculateBudget
```

**`useUnifiedMaterials` (hook fusionador — solo para UI):**
```
Priority 1 (alta): master_materials (org + IS NULL)
Priority 2 (media): materials (ERPContext)
Priority 3 (baja):  resources tipo MATERIAL (org + IS NULL)
→ Devuelve costo TÉCNICO (aplica conversionFactor si existe)
→ Solo para display/selección en APUBuilder, MasterTasksPanel, Chandías
→ NO alimenta el motor de costos recursivo directamente
```

### 1.5 Qué era correcto en el diagnóstico externo — y qué no

| Observación externa | Evaluación |
|---|---|
| "Recursos, Base Maestra y Catálogo Global compiten conceptualmente" | ✅ Correcto. Son tres pantallas para materiales con roles distintos mal expresados en la UI. |
| "El Catálogo Global debe ser solo importación, no tab competidor" | ✅ Correcto. `GlobalResourcesPanel` (resources IS NULL) y `MasterMaterialsPanel` (master_materials IS NULL) sirven conceptos distintos pero ambos aparecen como tabs del mismo nivel. |
| "Catálogo de Empresa debe ser la entidad operativa" | ✅ Correcto. Actualmente no existe un punto único para el catálogo de la empresa. |
| "Cascote (master_material global) debería aparecer en proyectos" | ✅ Correcto en intención, pero el target real es `MasterMaterialsPanel`, no `GlobalResourcesPanel`. Estos son dos tablas distintas. |
| "resources y master_materials son lo mismo" | ✗ Incorrecto. `resources` tiene pricing versionado con snapshots y alimenta el motor recursivo. `master_materials` tiene metadata comercial y alimenta el path legacy. Son sistemas paralelos con diferente madurez. |

---

## 2. Arquitectura objetivo

### 2.1 Decisión de producto (ya aprobada)

1. **Catálogo Global** (administrado por master_admin) → fuente de importación, no de consumo directo.
2. **Catálogo de Empresa** (por organización) → fuente operativa para APUs, presupuesto, cómputo.
3. Proyectos/APUs/presupuestos consumen el Catálogo de Empresa.
4. Importación explícita: Global → Empresa (nunca automática, siempre bajo control del usuario).
5. Actualizaciones de precios globales → badge "Actualización disponible", no cambio automático.

### 2.2 Catálogo de Empresa en beta — entidad operativa

**Decisión: `resources` (org-specific) como backbone operativo, `master_materials` (org-specific) como capa comercial.**

Razones:
- `resources` ya está conectado al motor de costos recursivo (versioned pricing, RPC, snapshots).
- `master_materials` ya tiene metadata comercial (conversionFactor, supplier, commercialFormat).
- El RPC `import_global_catalog_to_org` ya crea `resources` org-específicos a partir del global.
- `materials` (tabla legacy) sigue funcionando para flujos de task_yields no migrados.

No se crea una tabla nueva (`company_catalog_items`) en beta. El par `resources(orgId)` + `master_materials(orgId)` IS the Catálogo de Empresa.

### 2.3 Contrato de flujo

```
CATÁLOGO GLOBAL (administrado por master_admin)
├── master_tasks (IS NULL)      ← APUs globales de referencia
├── resources (IS NULL)         ← Precios de referencia con snapshots
└── master_materials (IS NULL)  ← Templates comerciales globales [NUEVO flujo de importación necesario]

          ▼ IMPORTACIÓN EXPLÍCITA (usuario autorizado)

CATÁLOGO DE EMPRESA (por organización)
├── master_tasks (orgId)        ← APUs propios de la empresa [Path B: catalog_task_yields]
├── resources (orgId)           ← Recursos con precios propios [motor recursivo]
├── master_materials (orgId)    ← Materiales con metadata comercial [useUnifiedMaterials]
├── materials (orgId)           ← Legacy/plano para task_yields no migrados
├── labor_categories (orgId)    ← MO del proyecto
└── tools (orgId)               ← Equipos del proyecto

          ▼ CONSUME

APUs → Presupuesto → Grilla de Costos
Cómputo → Enviar al Presupuesto
```

### 2.4 Campos de trazabilidad Global → Empresa (diseño)

Para `master_materials` (org-specific, al importar desde global):
```sql
global_source_id     uuid  REFERENCES public.master_materials(id) ON DELETE SET NULL
imported_at          timestamptz
local_override       boolean  NOT NULL DEFAULT false
-- update_available se calcula comparando updated_at del global vs imported_at del org
```

Para `resources` (org-specific, ya creados por import_global_catalog_to_org):
```sql
-- La tabla resources ya tiene organization_id
-- El global_source se puede inferir por code (mismo code, org IS NULL = fuente)
-- Opcionalmente:
global_source_id     uuid  REFERENCES public.resources(id) ON DELETE SET NULL
imported_at          timestamptz
```

Para `master_tasks` (org-specific, al importar desde global):
```sql
-- Ya existe source_metadata jsonb (migration 037) — puede extenderse
-- O agregar:
global_source_id     uuid  REFERENCES public.master_tasks(id) ON DELETE SET NULL
imported_at          timestamptz
local_override       boolean  NOT NULL DEFAULT false
```

Badges resultantes en la UI:
- **Local**: `global_source_id IS NULL` — creado por la empresa directamente.
- **Importado**: `global_source_id IS NOT NULL AND local_override = false` — copia del global sin modificaciones locales.
- **Editado localmente**: `global_source_id IS NOT NULL AND local_override = true` — importado + modificado.
- **Actualización disponible**: `global_source.updated_at > imported_at` — el global cambió después de la importación.

---

## 3. Estrategia de transición por fases

### Fase 1 — Beta: unificación visual + trazabilidad básica

**Objetivo:** un único punto de entrada "Catálogo de Empresa", importación coherente, sin romper nada.

**Cambios de UI:**
- Nueva organización de tabs en `DataAdmin`:
  - **Catálogo de Empresa** (nuevo tab compuesto)
    - Insumos: muestra `master_materials` (orgId) + `resources` tipo MATERIAL (orgId)
    - Mano de Obra: `labor_categories` + `resources` tipo LABOR (orgId)
    - Equipos: `tools` + `resources` tipo EQUIPMENT (orgId)
    - APUs: `MasterTasksPanel` (sin cambios)
  - **Importar del Catálogo Global** (reemplaza "Recursos Globales" y "Materiales Maestros" como tabs primarios)
    - Sección APUs globales → `CatalogImportModal` existente
    - Sección Insumos globales → `GlobalResourcesPanel` (resources IS NULL) con importación existente
    - Sección Materiales Maestros globales → nuevo panel `GlobalMasterMaterialsImport` (master_materials IS NULL → org)
  - El tab "Materiales Maestros" actual se integra en "Catálogo de Empresa → Insumos" con badge.
  - El tab "Recursos Globales" actual se integra en "Importar del Catálogo Global".

**Cambios de datos:**
- Migration 053: `global_source_id` + `imported_at` + `local_override` en `master_materials`.
- Nuevo servicio: `masterMaterialsService.importFromGlobal(orgId, globalMaterialId)` — crea copia org-específica con `global_source_id` referenciado.
- `MasterMaterialsPanel` muestra badge según estado (Local / Importado / Editado / Actualización disponible — este último calculado en JS por ahora).

**Mantiene sin cambios:**
- Motor recursivo de costos (Path A y B siguen iguales).
- `useUnifiedMaterials`.
- `ERPContext` (`materials`, `tools`, `labor_categories`).
- APUBuilder, BudgetEditor, BudgetGrid.
- Todas las RPCs.

**Deuda aceptable en Fase 1:**
- `materials` (tabla plana) sigue existiendo en paralelo — no se borra.
- Doble representación de materiales (resources + master_materials para la misma cosa) — aceptable en beta.
- No hay sincronización bidireccional de precios.

### Fase 2 — Sincronización: update_available + comparación de precios

**Objetivo:** el usuario puede ver qué cambió en el global y decidir si acepta la actualización.

- `update_available` calculado via trigger o campo DB: `global_source.updated_at > master_materials.imported_at`.
- Panel de comparación: muestra precio actual vs precio global con diferencia %.
- Botón "Aceptar actualización" → copia campos de precio del global al org (`local_override = false`).
- Botón "Mantener local" → `local_override = true`.
- Notificación badge en el tab "Catálogo de Empresa" cuando hay actualizaciones disponibles.

**No implementar en Fase 2:**
- Sincronización automática.
- Propagación de actualizaciones a APUs ya calculados.

### Fase 3 — Consolidación del modelo

**Objetivo:** decidir si `resources` y `master_materials` se fusionan en una tabla canónica.

Opciones a evaluar:
- **A**: Mantener separación `resources` (motor) + `master_materials` (commercial). Añadir columna `master_material_id` en `resources` para ligar ambos.
- **B**: Nueva tabla `company_catalog_items` que reemplaza ambas. Migración paulatina.
- **C**: Hacer que `master_materials` pueda tener `resource_id FK` y precio se resuelve desde snapshots si está vinculado.

Decisión a tomar con datos reales de uso en beta. No improvizar ahora.

---

## 4. Diseño funcional de la UI objetivo

### 4.1 Estructura de tabs propuesta

```
DataAdmin tabs:
┌─────────────────────────────────────────────────────────────────────────────┐
│  [Catálogo de Empresa]  [APUs]  [Importar del Global]  [Plantillas]  [...]  │
└─────────────────────────────────────────────────────────────────────────────┘

Tab "Catálogo de Empresa":
  ├── Sub-tab "Insumos"
  │   Muestra: master_materials(orgId) + resources MATERIAL(orgId) unificados
  │   Badges: Local | Importado | Editado | Actualización disponible
  │   Acciones: Crear, Editar, Desactivar (solo en items locales o editados)
  │   Link: "Importar más desde el Catálogo Global ↗"
  │
  ├── Sub-tab "Mano de Obra"
  │   Muestra: labor_categories(orgId) + resources LABOR(orgId)
  │   (igual que hoy, misma tabla)
  │
  └── Sub-tab "Equipos"
      Muestra: tools(orgId) + resources EQUIPMENT(orgId)
      (igual que hoy, misma tabla)

Tab "APUs" (sin cambios):
  MasterTasksPanel — modal de importación ya existente

Tab "Importar del Catálogo Global":
  ├── Sección: APUs globales → CatalogImportModal (existente)
  ├── Sección: Insumos globales (resources IS NULL) → GlobalResourcesPanel (existente)
  └── Sección: Materiales Maestros globales → nuevo panel de importación de master_materials IS NULL

Tab "Plantillas" (sin cambios)
Tab "Cómputo" (sin cambios)
Tab "Reportes" (sin cambios)
Tab "Sistema" (sin cambios)
```

### 4.2 Qué pasa con las pantallas actuales

| Tab actual | Destino en UI objetivo |
|---|---|
| "Recursos" (`materials`) | Se integra en "Catálogo de Empresa → Insumos" como sección colapsable o lista secundaria. En Fase 3 se depreca. |
| "Materiales Maestros" (`master_materials` org+global) | Pasa a ser "Catálogo de Empresa → Insumos" con badges. La vista global se mueve a "Importar del Catálogo Global". |
| "Recursos Globales" (`resources` IS NULL) | Pasa a "Importar del Catálogo Global → Insumos globales". Deja de ser tab primario. |
| "APU" | Sin cambios — sigue siendo tab primario. |
| "Mano de Obra" | Se conserva, eventualmente se integra en "Catálogo de Empresa → Mano de Obra". |

### 4.3 Lo que NO cambia en esta tanda

- Dashboard, Presupuesto, Grilla, Planificación, Cómputo, Mediciones, Documentación, Calidad.
- Motor de costos, RPCs de Supabase, ERPContext.
- Flujo de invitaciones, auth, proyectos.

---

## 5. Migraciones y datos

### 5.1 Migration 053 (recomendada para Fase 1)

**Segura: solo agrega columnas nullable/defaulted. No migra datos existentes.**

```sql
-- 053_catalog_trazabilidad.sql
-- Trazabilidad Global → Empresa en master_materials

ALTER TABLE public.master_materials
  ADD COLUMN IF NOT EXISTS global_source_id  uuid REFERENCES public.master_materials(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS imported_at       timestamptz,
  ADD COLUMN IF NOT EXISTS local_override    boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.master_materials.global_source_id IS
  'FK al material global (organization_id IS NULL) del que fue importado. NULL = creado localmente.';
COMMENT ON COLUMN public.master_materials.imported_at IS
  'Timestamp de la última importación desde el global. Permite calcular update_available.';
COMMENT ON COLUMN public.master_materials.local_override IS
  'true si el usuario modificó campos localmente después de importar. Impide sobreescritura automática.';

-- Índice para query de "update_available": globales actualizados después de la importación
CREATE INDEX IF NOT EXISTS master_materials_global_source_idx
  ON public.master_materials (global_source_id)
  WHERE global_source_id IS NOT NULL;
```

**No implementar todavía (Fase 2+):**
- Función SQL `check_update_available()`.
- Trigger de propagación de actualizaciones.
- Campo análogo en `resources(orgId)` — esperar a que el patrón en master_materials esté validado.
- Campo análogo en `master_tasks` — ya existe `source_metadata` jsonb que puede extenderse.

### 5.2 Deuda técnica

| Deuda | Urgencia | Riesgo si se posterga |
|---|---|---|
| `materials` tabla legacy paralela a `resources` | Media | Precios desincronizados entre path legacy y motor recursivo. Aceptable en beta. |
| `master_task_materials` path A sin snapshots | Media | APU con precios estáticos. Motor recursivo (path B) ya los reemplaza para APUs importados. |
| `useUnifiedMaterials` con 3 fuentes | Baja | Complejidad de merge. No causa bugs, solo performance. |
| No hay importación `master_materials(IS NULL) → org` | **Alta** | "Cascote" existe en el global pero no puede importarse a empresa. Este es el GAP principal de Fase 1. |
| `update_available` no existe como dato persistido | Media | No hay notificación al usuario de cambios en global. Aceptable hasta Fase 2. |

---

## 6. Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Unificación de tabs rompe APU o presupuesto | Baja | Alto | Los tabs "APU", presupuesto y grilla no se tocan en Fase 1. Solo se reorganiza el acceso visual. |
| Migration 053 rompe `master_materials` existentes | Muy baja | Alto | Solo agrega columnas nullable. Sin UPDATE masivo. Safe. |
| `importFromGlobal` crea duplicados en `master_materials` | Media | Medio | Guard de dedup: chequear `global_source_id` existente antes de insertar. Similar al guard de `handleImport` en MasterTasksPanel. |
| Confusión usuario entre "Insumos" (resources) y "Materiales Maestros" (master_materials) | Alta | Bajo | El naming explícito y los badges resuelven la confusión en la UI. |
| `resources(orgId)` vacío para orgs nuevas → motor sin datos | Media | Alto | El flujo de importación desde "Recursos Globales" ya soluciona esto. Hacer el onboarding más evidente. |

---

## 7. Acciones para la próxima tanda de código

En orden de prioridad:

### Sprint inmediato (Fase 1 mínima viable)

1. **[MIGRACIÓN]** Ejecutar `053_catalog_trazabilidad.sql` en Supabase Dashboard.
   - Agregar `global_source_id`, `imported_at`, `local_override` en `master_materials`.

2. **[SERVICIO]** `masterMaterialsService.importFromGlobal(orgId, globalMaterial)`:
   - Verifica que no exista ya un registro con el mismo `global_source_id` para la org.
   - Crea registro en `master_materials` con `global_source_id = globalMaterial.id`, `imported_at = now()`.
   - Retorna el nuevo `MasterMaterial` org-específico.

3. **[UI]** Panel de importación en `GlobalMasterMaterialsSection` (nuevo, dentro del tab "Importar del Global"):
   - Lista `master_materials` (IS NULL) con checkbox de selección.
   - Botón "Importar seleccionados" → llama a `importFromGlobal` por cada ítem.
   - Toast de resultado con count de importados/ya existentes.

4. **[UI]** Badges en `MasterMaterialsPanel`:
   - "Local" → `global_source_id IS NULL`.
   - "Importado" → `global_source_id IS NOT NULL AND !local_override`.
   - "Editado" → `global_source_id IS NOT NULL AND local_override`.
   - "Actualización disponible" → calculado en JS: `globalSource.updatedAt > item.importedAt`.
   - Habilitar `local_override = true` automáticamente cuando el usuario edita un item importado.

5. **[UI]** Reorganización de tabs en `DataAdmin` según diseño de sección 4:
   - Nuevo tab "Catálogo de Empresa" con sub-tabs Insumos / MO / Equipos.
   - Tab "Importar del Catálogo Global" consolidando los tres flujos de importación.
   - Ocultar/deprecar tabs "Materiales Maestros" y "Recursos Globales" como tabs de primer nivel.

### Sprint siguiente (Fase 1 completa)

6. Integrar `materials` legacy en "Insumos" con badge "Legacy" y nota de migración sugerida.
7. Onboarding: si `resources(orgId)` está vacío al entrar a "Catálogo de Empresa", mostrar banner "Importá desde el Catálogo Global para empezar".
8. Pasar `local_override = true` cuando el usuario edita un `MasterMaterial` con `global_source_id` no nulo.

### No hacer todavía (Fase 2+)

- Trigger/función SQL para `update_available` automático.
- Panel de comparación de precios Global vs Empresa.
- Consolidación de tablas `resources` y `master_materials`.
- Propagación de updates a APUs ya calculados.

---

## 8. Decisión técnica resumida

**Para beta, el "Catálogo de Empresa" es el par `resources(orgId)` + `master_materials(orgId)`.**

- `resources(orgId)` = backbone operativo (motor de costos recursivo, pricing versionado).
- `master_materials(orgId)` = capa comercial (proveedor, formato, factor de conversión, currency).
- Ambos se alimentan desde el Catálogo Global via importación explícita.
- El GAP principal que cierra la Fase 1 es: **habilitar la importación de `master_materials(IS NULL)` → `master_materials(orgId)`**, que hoy no existe.
- La reorganización de tabs es cosmética pero necesaria para que el usuario entienda el modelo.
- No se crea tabla nueva, no se migran datos, no se toca el motor de costos.

---

*Documento generado en base a auditoría completa del repo: componentes, servicios, tipos, migraciones y flujos de datos.*
