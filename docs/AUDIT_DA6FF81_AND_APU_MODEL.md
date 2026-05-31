# Auditoría: commit da6ff81 y modelo APU actual
**Fecha:** 2026-05-31  
**Rama:** `chore/audit-da6ff81-and-apu-model`  
**Commit auditado:** `da6ff81 docs: add FAENA competitive roadmap for Obraflow`  
**Autor del commit:** Arq. Gonzalo / Claude Sonnet 4.6

---

## 1. ALCANCE REAL DE da6ff81

El commit tenía título documental pero modificó tres archivos con naturalezas distintas:

| Archivo | Tipo de cambio | ¿Documental? |
|---|---|---|
| `docs/COMPETITIVE_FAENA_ROADMAP.md` | Nuevo (264 líneas) | ✅ Sí |
| `docs/HANDOFF_CURRENT.md` | +39 líneas, nueva sección §8 | ✅ Sí |
| `tests/e2e/beta-golden-path.spec.ts` | Reescritura de 692 líneas (309 add / 383 del) | ❌ No — código de test |

**El test file NO es documentación.** Su inclusión en un commit `docs:` es un error de clasificación. Debería haber sido un commit separado con prefijo `test:`.

---

## 2. CAMBIOS DEL E2E EN DA6FF81 — DIFF DETALLADO

### 2.1 Tamaño del cambio

| Métrica | Valor |
|---|---|
| Líneas en `b890bc9` (commit anterior) | 882 |
| Líneas en `da6ff81` (commit auditado) | 808 |
| Líneas eliminadas | 383 |
| Líneas añadidas | 309 |
| Reducción neta | 74 líneas |

Este no es un "pequeño fix". Es una **reescritura sustancial** del archivo: el 43% de las líneas tocadas.

### 2.2 Cambios estructurales (correctos y necesarios)

| Cambio | Descripción | Evaluación |
|---|---|---|
| `test.describe.configure({ mode: 'serial' })` | Fuerza ejecución serial del describe. Sin esto, el `RUN_ID` se re-evalúa por test en modo paralelo → project_name diferente en cada test → cascada de fallos | ✅ **Mantener** — corrección crítica |
| `RUN_ID = new Date().toISOString()...` | Genera nombre único por corrida para proyecto y APU. Reemplaza nombre fijo `QA_E2E_Mamposteria_45m2_DELETE_ME` | ✅ **Mantener** — permite repetibilidad sin limpieza manual |
| `PROJECT_NAME = QA_E2E_${RUN_ID}_DELETE_ME` | Nombre único por corrida | ✅ **Mantener** |
| `APU_NAME_RUN = QA_Muro18_${RUN_ID}` | APU único por corrida, nunca conflicto con datos previos | ✅ **Mantener** |
| `MATERIAL_YIELDS: Array<{keyword, qty}>` | Especifica 3 materiales con cantidades exactas (0.5 kg cemento, 0.01 m³ arena, 6 u ladrillo) | ✅ **Mantener** |
| `ensureProjectActive()` helper | Centraliza: esperar loading → login si necesario → seleccionar proyecto QA | ✅ **Mantener** |
| Unit fill incondicional (paso 06) | `await expect(unitInput).toBeVisible(); await unitInput.fill('m²')` sin `if`. Antes era condicional → si no visible, `unit=''` → `handleSave` rechaza silenciosamente | ✅ **Mantener** — corrige bug de validación silenciosa |
| Wait explícito para lista tras save (paso 06) | `await expect(page.getByRole('button', { name: 'Nueva Tarea' })).toBeVisible({ timeout: 15000 })` → confirma que `backToList()` fue llamado | ✅ **Mantener** — corrige race condition |
| Selector `table tbody tr` en lugar de `tr` (paso 06) | Evita matchear filas de header | ✅ **Mantener** |
| Eliminación de `clickCount++` duplicado en `navTo` | `navTo` llamaba `click()` (que ya incrementa) + incrementaba de nuevo | ✅ **Mantener** — corrige métrica inflada |

### 2.3 Cambios que quedan incompletos o problemáticos

| Cambio | Problema | Evaluación |
|---|---|---|
| Step 07: `hasPositiveCost = /\$[1-9][0-9,\.]+/.test(content)` | Regex sobre el cuerpo completo de la página. No verifica el subtotal del APU específico creado. Si hay CUALQUIER monto > $0 en pantalla (incluso de otros ítems), el test pasa aunque el APU tenga costo $0.00. **Esta es la causa del falso positivo matemático del muro 45 m².** | ⚠️ **Corregir en P0** |
| Test NUNCA ejecutado con éxito en versión hardened | Todas las corridas en da6ff81 fallaron en step 01 por credenciales incorrectas (`test1234` en lugar de la contraseña real). Los fixes de step 05/06 son **código no verificado en producción**. | ⚠️ **Pendiente verificación** |
| Step 05: re-open y verificar persistencia de precio | Lógica correcta pero tampoco se ejecutó. Hay un ref `cementoRow2` que se construye después de que el drawer ya cerró — potencial problema de stale reference | ⚠️ **Revisar antes de ejecutar** |

---

## 3. EVALUACIÓN POR CAMBIO: MANTENER / CORREGIR / REVERTIR

| Cambio | Decisión | Razón |
|---|---|---|
| Serial mode | **Mantener** | Corrige bug real de RUN_ID re-evaluación |
| RUN_ID + nombres únicos | **Mantener** | Aislamiento por corrida — diseño correcto |
| Unit fill incondicional | **Mantener** | Corrige validación silenciosa |
| `ensureProjectActive()` | **Mantener** | Centraliza lógica de sesión |
| Wait post-save "Nueva Tarea" | **Mantener** | Corrige race condition |
| `table tbody tr` selector | **Mantener** | Más específico, correcto |
| Doble `clickCount++` fix | **Mantener** | Corrige métrica inflada |
| Step 07 regex `> $0` | **Corregir en P0** | Ver §5 — falso positivo matemático |
| Inclusión del E2E en commit `docs:` | **Aceptar como está** (hecho) | No se puede revertir sin impactar los fixes correctos. El E2E está en main. Separar en el siguiente commit. |

**Veredicto general:** Los cambios al E2E son técnicamente válidos y necesarios. El problema no es QUÉ se cambió sino DOS cosas: (a) el commit fue mal clasificado como `docs:`, y (b) el assert matemático del step 07 sigue siendo un cheque superficial.

---

## 4. ARQUITECTURA ACTUAL DEL APU

### 4.1 Mapa de archivos

```
Servicio de cálculo
  services/masterTaskCostService.ts      ← función pura calculateMasterTaskCost()
                                          MASTER_WORKDAY_HOURS = 9

Servicio de persistencia
  services/masterTasksSupabaseService.ts ← CRUD master_tasks + sub-tablas
                                          fromRow() / toRow() snake_case → camelCase

Hook de datos
  hooks/useMasterTasks.ts                ← { tasks, loading, add, update, remove, refetch }
                                          add() hace setTasks optimista tras insert

Componente principal
  components/MasterTasksPanel.tsx        ← Vista 'list' / 'edit'. EMPTY_TASK.dailyYield = 8
                                          addMaterialLine() captura lastKnownUnitPrice = umat.cost
                                          handleSave() valida: name, unit, dailyYield > 0
                                          backToList() tras save exitoso

Precios en tiempo real
  hooks/useUnifiedMaterials.ts           ← fusiona resources → materials → master_materials
                                          list.cost = precio TÉCNICO (CF aplicado)
                                          prioridad: master_materials > materials > resources

Importación al presupuesto
  components/MasterTasksPanel.tsx        ← setImportTarget(task) → modal
                                          cantidad × totalUnitCost
```

### 4.2 Tablas relacionadas con APU

| Tabla | Rol | Estado en prod |
|---|---|---|
| `master_tasks` | Registro padre del APU (name, unit, category, dailyYield, fixedCost) | ✅ OK + constraint UNIQUE (name, code) para org IS NULL |
| `master_task_materials` | Líneas de materiales del APU (quantity, lastKnownUnitPrice, masterMaterialId, resourceId, conversionFactor, commercialUnit) | ✅ OK + migración 055 agregó commercial_unit, conversion_factor |
| `catalog_task_yields` | Líneas de materiales/labor de APUs generados por Chandías | ✅ OK + migración 056 |
| `resources` | Recursos globales con precio de referencia (usado por PATH B de la RPC) | ✅ OK + migración 057 |
| `budget_items` | Ítems del presupuesto del proyecto (cada APU importado genera 1 budget_item) | ✅ OK |
| `master_materials` | Catálogo de materiales de empresa (org IS NULL = global, orgId = empresa) | ✅ OK + migration 058 (technical_yield, unit, notes) |

### 4.3 Qué existe hoy (implementado y funcionando)

- [x] CRUD APU privado (MasterTasksPanel: crear/editar/soft-delete)
- [x] CRUD APU global (GlobalTasksAdmin: admin only)
- [x] Cálculo de costo unitario (calculateMasterTaskCost — función pura)
- [x] Fórmula MO: `(rate × 9h × labor.quantity) / dailyYield`
- [x] Fórmula Mat: `Σ price × quantity × (1 + wastePercent/100)`
- [x] Fórmula Equ: `Σ tool.costPerHour × hoursPerUnit`
- [x] Importación al presupuesto (con modal cantidad + buildImportPayload)
- [x] Explosión de Insumos (RPC calculate_consolidated_resources v3)
- [x] Badges de trazabilidad en materiales (Global/Importado/Editado localmente)
- [x] Duplicate guards (nombre/código únicos por org)

### 4.4 Qué está parcialmente implementado

- [~] **Precio vivo vs snapshot**: La función `calculateMasterTaskCost` usa `livePrice ?? lastKnownUnitPrice ?? 0`. El `livePrice` requiere que el material tenga `masterMaterialId` y que `masterMaterialsMap` esté poblado. Si el mapa no cargó o el FK no está seteado, cae al snapshot. **Sin assert en el test que verifique cuál ruta se tomó.**
- [~] **Sincronización explícita**: El `handleRefreshPrices` en MasterTasksPanel actualiza `lastKnownUnitPrice` de materiales sin FK. Pero no existe un botón de "sincronizar precios del presupuesto" para actualizar `budget_items` ya importados.
- [~] **Motor recursivo (migration 010)**: Los campos `resourceId`, `subMasterTaskId` existen en `MasterTaskMaterial` y `MasterTaskLabor` pero el PATH B de la RPC los usa solo en `catalog_task_yields` (APUs de Chandías). El MasterTasksPanel no enlaza explícitamente a `resourceId` al agregar materiales.
- [~] **APU anidado** (`subMasterTaskId`): Existe en el tipo pero no hay UI para crear APUs que referencien a otros APUs.

### 4.5 Qué es propuesta futura (no implementado)

- [ ] Estados de APU: `draft | approved | published` — solo descriptos en `COMPETITIVE_FAENA_ROADMAP.md`
- [ ] APU reutilizable entre orgs — propuesto en P1
- [ ] Sincronización viva presupuesto — migración 040 (pendiente ejecutar)
- [ ] `status` en `master_tasks` — no existe la columna
- [ ] Diff de precios antes/después de sincronizar — propuesto en ADR P1-02

---

## 5. CAUSA PROBABLE DEL FALSO POSITIVO MATEMÁTICO DEL MURO 45 m²

### 5.1 El assert actual (step 07)

```typescript
// Step 07 — beta-golden-path.spec.ts línea ~507
const hasPositiveCost = /\$[1-9][0-9,\.]+/.test(content);
expect(hasPositiveCost, 'Presupuesto sin subtotal > $0').toBe(true);
```

**Problema:** `content` es `await page.textContent('body')` — el texto completo de la página. El regex busca cualquier `$X.XX` con X > 0 en cualquier parte de la página, incluyendo:
- Totales de presupuesto de ítems previos (si los hay)
- Precios de la barra lateral
- Datos de debug/log visible
- El costo unitario del APU (aun si el subtotal es $0)

**Consecuencia:** El test puede pasar aunque el APU específico tenga subtotal $0.00.

### 5.2 Camino del precio en el E2E

```
Paso 04: importFromGlobal() → master_materials(orgId)
            ↓ (copia unitPrice del global)
Paso 05: editar Cemento → unitPrice = 180 (local_override = true)
            ↓
Paso 06: addMaterialLine()
            - selecciona material del <select> (unifiedMaterials[idx])
            - lastKnownUnitPrice = umat.cost (precio técnico de useUnifiedMaterials)
            - umat.cost = masterMaterial.unitPrice si hay FK
            - SI umat.cost = 0 → todo el APU tiene costo $0
            ↓
      APU guardado con master_task_materials.last_known_unit_price
            ↓
Paso 07: página presupuesto
            - budget_item.unit_cost = APU.totalUnitCost (calculado al importar en step 06)
            - subtotal = quantity(45) × unit_cost
            - SI unit_cost = 0 → subtotal = $0.00
            - PERO el regex /\$[1-9].../ puede matchear OTRO valor en la página
```

### 5.3 Cuándo el falso positivo ocurre

El falso positivo ocurre cuando:
1. El APU fue importado con `unit_cost = $0` (precios sin configurar en catálogo)  
   Y
2. Hay cualquier otro texto con formato `$1.xx` o superior en la página (UI labels, decimales redondeados, etc.)

### 5.4 Fix matemático requerido para P0

```typescript
// Paso 07 — assert correcto para P0
// 1. Encontrar la fila específica del APU creado
const apuBudgetRow = page.locator('table tbody tr')
  .filter({ hasText: new RegExp(APU_NAME_RUN.slice(0, 15), 'i') })
  .first();
await expect(apuBudgetRow).toBeVisible({ timeout: 10000 });

// 2. Extraer el subtotal como número
const subtotalCell = apuBudgetRow.locator('td').last(); // o por index conocido
const subtotalText = await subtotalCell.textContent() ?? '';
const subtotalNum = parseFloat(subtotalText.replace(/[^\d.]/g, ''));

// 3. Assert matemático: subtotal > 0 Y coincide con 45 × costo_unit_esperado
expect(subtotalNum, `Subtotal del APU es $0 — materiales sin precio en catálogo`).toBeGreaterThan(0);

// 4. Assert de aproximación (±10%): 45 × (0.5×180 + ...) ≈ subtotal
// Esto requiere conocer los precios reales → se hace vía data-attribute o scrapeo
// del desglose que muestra el BudgetGrid
```

**Prerequisito para el fix:**  
El BudgetGrid debe exponer el subtotal de cada ítem de forma aislada (no mezclado con totales). Verificar que `budget_items.unit_cost > 0` antes de multiplicar por cantidad.

---

## 6. PRÓXIMOS PASOS P0

### Tanda P0.A — Verificar que el APU guarda precios correctamente

**Objetivo:** Confirmar que cuando se crea el APU QA en el E2E, los materiales tienen `lastKnownUnitPrice > 0`.

Acciones:
1. Correr el E2E con credenciales reales (obtener `OBRAFLOW_E2E_PASSWORD` del usuario)
2. Verificar en Supabase → `master_task_materials` → filtrar por el APU creado → confirmar `last_known_unit_price > 0`
3. Si es 0: agregar console.log en `addMaterialLine()` para ver `umat.cost` durante el test

**Archivos a verificar:** `components/MasterTasksPanel.tsx:addMaterialLine()` (línea ~662), `hooks/useUnifiedMaterials.ts`

### Tanda P0.B — Corregir assert matemático step 07

**Objetivo:** El step 07 debe verificar el subtotal de la fila específica del APU, no cualquier valor en la página.

Acciones:
1. Mapear las columnas del BudgetGrid (índice de la columna "Subtotal")
2. Reemplazar el regex de todo el body por un selector de fila + columna
3. Agregar `expect(subtotalNum).toBeGreaterThan(0)` Y opcionalmente `toBeCloseTo(expected, 0)`

**Archivo:** `tests/e2e/beta-golden-path.spec.ts:step 07` (~línea 485)

### Tanda P0.C — Formalizar el contrato matemático del APU

**Objetivo:** Escribir una spec que documente explícitamente la fórmula de cálculo esperada para el APU de Muro Exterior Cerámico 18 cm.

Acciones:
1. Crear `docs/specs/APU_CANONICAL_MAMPOSTERIA.md` con datos reales:
   - Materiales: cemento 0.5 kg, arena 0.01 m³, ladrillo 6 u
   - Precios de referencia (catálogo global)
   - `dailyYield` esperado (m²/día)
   - MO esperada (categorías + horas)
   - Fórmula explícita con números
   - Costo unitario esperado por m²
2. El E2E en step 07 debe verificar contra esos valores

---

## 7. ARCHIVOS QUE TOCAR EN LA SIGUIENTE TANDA (P0.A y P0.B)

| Archivo | Qué cambiar | Motivo |
|---|---|---|
| `tests/e2e/beta-golden-path.spec.ts` | Step 07: assert por fila específica del APU (no regex global) | Corregir falso positivo matemático |
| `tests/e2e/beta-golden-path.spec.ts` | Step 06: agregar `console.log` de precios de materiales al crear APU | Diagnóstico de lastKnownUnitPrice |
| `docs/E2E_BETA_QA.md` | Actualizar con resultado real tras run con credenciales correctas | Documentación posterior al run |
| `docs/specs/APU_CANONICAL_MAMPOSTERIA.md` | Crear spec con fórmula explícita | Base del contrato matemático P0 |

---

## 8. ARCHIVOS QUE NO TOCAR

| Archivo | Razón |
|---|---|
| `context/ERPContext.tsx` | Estado global — riesgo de cascada. No está involucrado en P0 |
| `services/masterTaskCostService.ts` | La función `calculateMasterTaskCost` es correcta. Tocarla sin spec puede romper el cálculo |
| `hooks/useMasterTasks.ts` | Hook estable. No hay bugs en el flujo add/update/remove |
| `supabase/migrations/*` | No hay cambios de schema en P0 |
| `components/MasterMaterialsPanel.tsx` | Drawer de materiales estable. No en scope de P0 |
| `services/masterTasksSupabaseService.ts` | CRUD estable. No en scope de P0 |
| `docs/COMPETITIVE_FAENA_ROADMAP.md` | Recién creado. No modificar hasta P1 |
| `main` branch directamente | Toda la próxima tanda en rama feature separada |

---

## 9. RECOMENDACIÓN SOBRE LOS CAMBIOS E2E DE DA6FF81

**Los cambios al E2E incluidos en `da6ff81` son técnicamente correctos y deben mantenerse.** Los fixes de `serial mode`, `RUN_ID`, `unit fill`, `ensureProjectActive` y los selectores mejorados resuelven bugs reales que impedían que el test funcionara de forma repetible.

**El problema no es qué se cambió, sino dos cosas pendientes:**

1. **El test nunca se ejecutó con éxito en la versión hardened.** Todos los runs fallaron en step 01 por credenciales incorrectas. Los fixes de step 05 y 06 no están verificados.

2. **El assert de step 07 sigue siendo superficial.** La regex `/\$[1-9][0-9,\.]+/.test(content)` no es un assert matemático — es una verificación de navegación. Para que el test sea la especificación ejecutable del contrato matemático del APU (ADR-005), el step 07 debe extraer y verificar el subtotal específico del ítem creado.

**Acción recomendada:**
1. Obtener la contraseña real → correr el test → verificar que steps 01-06 pasan
2. Si pasan: crear nueva tanda en rama separada para corregir step 07
3. Si fallan: diagnosticar y corregir step a step antes de avanzar a P0.B

---

*Auditoría generada: 2026-05-31 · Rama: `chore/audit-da6ff81-and-apu-model`*
