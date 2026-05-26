# Obraflow — Auditoría de Cierre Beta
**Fecha:** 2026-05-25  
**Alcance:** Migraciones 053–058 · Reportes · Catálogo de Materiales  
**Estado general:** 🟡 Beta estable con 2 gaps de datos identificados

---

## 1. ESTADO DE MIGRACIONES (053–058)

### Tabla resumen

| # | Archivo | Tabla(s) afectada(s) | Columnas agregadas | NOTIFY pgrst | Idempotente |
|---|---------|---------------------|--------------------|:------------:|:-----------:|
| 053 | `053_master_materials_global_import_tracking.sql` | `master_materials` | `global_source_id`, `imported_at`, `last_synced_at`, `local_override`, `global_source_updated_at_at_import` | — | ✅ |
| 054 | `054_master_materials_global_resource_id.sql` | `master_materials` | `global_resource_id` | — | ✅ |
| 055 | `055_reports_consumption_schema_bridge.sql` | `master_task_materials` | `commercial_unit`, `conversion_factor` · publica RPC v2 + `detect_duplicate_apu_codes` | — | ✅ |
| 056 | `056_fix_catalog_task_yields_commercial_columns.sql` | `catalog_task_yields` | `commercial_unit`, `conversion_factor` | ✅ | ✅ |
| 057 | `057_fix_resources_commercial_columns.sql` | `resources` | `commercial_unit`, `conversion_factor` · republica RPC v3 | ✅ | ✅ |
| 058 | `058_master_materials_technical_metadata.sql` | `master_materials` | `technical_yield`, `technical_yield_unit`, `technical_notes` | ✅ | ✅ |

### Cobertura TypeScript

Interface `MasterMaterial` en `types.ts` — **24/24 campos cubiertos** (100%).  
`masterMaterialsService.ts` — `fromRow()` y `toRow()` mapean correctamente todos los campos.

### Dependencias críticas de orden

Las migraciones 055 → 056 → 057 forman una cadena para la RPC `calculate_consolidated_resources`:

```
055 → publica RPC v2 (espera columnas en catalog_task_yields que todavía no existen)
056 → agrega esas columnas a catalog_task_yields + NOTIFY
057 → agrega columnas a resources + republica RPC v3 con COALESCEs defensivos + NOTIFY
```

Si solo 055+056 están ejecutadas y 057 no, la RPC falla con  
`ERROR: column "r.conversion_factor" does not exist`.

Migración 058 es independiente; puede ejecutarse en cualquier orden.

### Migraciones ejecutadas en producción (confirmado)

| Migración | Estado |
|-----------|--------|
| 017 | ✅ ejecutada |
| 046–055 | ✅ ejecutadas |
| 056 | ✅ ejecutada |
| 057 | ✅ ejecutada (user confirmó + ejecutó UPDATEs de defaults) |
| 058 | ✅ ejecutada (user confirmó) |

---

## 2. MÓDULO DE REPORTES

### 2.1 Consumos del Proyecto (ConsolidatedProjectReport)

| Aspecto | Estado | Notas |
|---------|--------|-------|
| RPC `calculate_consolidated_resources` | ✅ Funciona | v3, COALESCEs defensivos en todas las columnas opcionales |
| PATH A (master_task_materials) | ✅ | `COALESCE(mtm.conversion_factor, 1.0)` |
| PATH B (catalog_task_yields + resources) | ✅ | `COALESCE(cty.conversion_factor, r.conversion_factor, 1.0)` |
| Manejo de errores frontend | ✅ | Catch genérico, mensaje del servidor |
| Exportación Excel (xlsx-js-style) | ✅ | Dark header, zebra rows, freeze, moneda, bordes |
| Exportación CSV | ✅ | BOM UTF-8, separador `;`, Blob |

**Columnas requeridas por la RPC y su origen:**

| Columna | Tabla | Migración | Guard |
|---------|-------|-----------|-------|
| `conversion_factor` | `resources` | 057 | `COALESCE(..., 1.0)` |
| `commercial_unit` | `resources` | 057 | `COALESCE(...)` → NULL aceptable |
| `conversion_factor` | `master_task_materials` | 055 | `COALESCE(..., 1.0)` |
| `commercial_unit` | `master_task_materials` | 055 | directo, nullable |
| `conversion_factor` | `catalog_task_yields` | 056 | `COALESCE(...)` |
| `commercial_unit` | `catalog_task_yields` | 056 | `COALESCE(...)` |

### 2.2 Exportación Excel — librería actual

**Librería usada:** `xlsx-js-style` v1.2.0  
**Alternativa evaluada:** ExcelJS

| Criterio | xlsx-js-style | ExcelJS |
|----------|:-------------:|:-------:|
| Bundle size | ~50 KB | ~400 KB |
| Estilos de celda | ✅ | ✅ |
| Imágenes / Charts | ❌ | ✅ |
| Streaming (datasets grandes) | ❌ | ✅ |
| API | low-level | high-level |
| Uso actual | adecuado | overkill |

**Veredicto:** Mantener `xlsx-js-style`. No hay necesidad de migrar a ExcelJS para el volumen actual (< 500 filas por reporte típico). El riesgo de memoria solo aparece con 10.000+ filas, que no es un caso de uso en gestión de obras individual.

### 2.3 Otros reportes

| Reporte | Estado |
|---------|--------|
| APUSummaryReport | ✅ funciona (client-side, useMasterTasks) |
| BudgetBreakdownReport | ✅ funciona (recalculateBudgetFromSupabase) |
| APUTechnicalReportDrawer | ✅ funciona (drawer 920px) |

---

## 3. MÓDULO DE CATÁLOGO

### 3.1 Materiales de Empresa — Drawer

| Aspecto | Estado | Líneas |
|---------|--------|--------|
| `createPortal(drawerNode, document.body)` | ✅ | MasterMaterialsPanel.tsx:174 |
| CSS posición | ✅ `position: fixed; top:0; right:0; bottom:0` | :176 |
| `paddingRight` dinámico en outer div | ✅ `DRAWER_WIDTH + 16px` cuando abierto | :431 |
| Header sticky (shrink-0) | ✅ | :180 |
| Body scrolleable (flex-1 overflow-y-auto) | ✅ | :221 |
| Footer sticky (shrink-0) | ✅ | :406 |
| Campo `technicalYield` | ✅ | :355–366 |
| Campo `technicalYieldUnit` | ✅ | :370–377 |
| Campo `technicalNotes` | ✅ | :382–388 |
| `startEdit()` popula técnicos desde material | ✅ spread operator | :84 |
| `handleSave()` incluye técnicos | ✅ | :117–119 |
| Badge FlaskConical en lista | ✅ | :578–586 |

### 3.2 Recursos Globales

| Aspecto | Estado |
|---------|--------|
| CRUD global (list/create/edit/toggle) | ✅ funciona |
| Importación a catálogo de empresa | ✅ funciona |
| Campos técnicos en GlobalMaterialsAdmin.tsx | ❌ **AUSENTES** |

### 3.3 Gaps identificados

#### 🔴 GAP 1 — `importFromGlobal()` no copia campos técnicos

**Archivo:** `services/masterMaterialsService.ts` — función `importFromGlobal()` (lines ~183–212)  
**Problema:** El objeto `row` construido para INSERT no incluye `technical_yield`, `technical_yield_unit`, ni `technical_notes`. Si un material global tiene datos técnicos, se pierden silenciosamente al importar.  
**Impacto:** Cualquier material importado desde el catálogo global pierde su metadata técnica.  
**Severidad:** 🔴 Alta — pérdida de datos silenciosa  
**Fix requerido:**
```typescript
// Agregar en importFromGlobal() dentro del objeto row:
technical_yield:      globalData.technical_yield ?? null,
technical_yield_unit: globalData.technical_yield_unit ?? null,
technical_notes:      globalData.technical_notes ?? null,
```

#### 🔴 GAP 2 — `GlobalMaterialsAdmin.tsx` no tiene UI para campos técnicos

**Archivo:** `components/GlobalMaterialsAdmin.tsx`  
**Problema:** El tipo `FormData` y el formulario de alta/edición no incluyen los tres campos técnicos. Los master admins no pueden cargar metadata técnica en el catálogo global.  
**Impacto:** Los campos técnicos de migration 058 no son utilizables en el catálogo global.  
**Severidad:** 🔴 Alta — feature implementada a medias; migration 058 sin uso en globales  
**Fix requerido:**
```typescript
// FormData debe incluir:
technicalYield: string;
technicalYieldUnit: string;
technicalNotes: string;
// + UI inputs en el formulario
// + toForm() / handleSave() mapping
```

---

## 4. QUÉ ESTÁ CERRADO

| Feature | Estado |
|---------|--------|
| Auth + Orgs + Multitenancy | ✅ |
| Proyectos (CRUD) | ✅ |
| Presupuesto (budget_items) | ✅ |
| APU / Master Tasks | ✅ |
| Calculadora Chandías | ✅ |
| Consumos del Proyecto (RPC v3) | ✅ |
| Exportación Excel estilizada | ✅ |
| Materiales de Empresa — Drawer fijo | ✅ |
| Campos técnicos en drawer de empresa | ✅ |
| Migration 058 en producción | ✅ |
| Recursos Globales (master_admin CRUD) | ✅ |
| Importación Recursos Globales → Empresa | ✅ |
| Duplicate guards APU | ✅ |

---

## 5. QUÉ ESTÁ PENDIENTE

| Item | Tipo | Prioridad | Tanda sugerida |
|------|------|-----------|----------------|
| `importFromGlobal()` copiar técnicos | Bug / Datos | 🔴 Alta | Siguiente |
| `GlobalMaterialsAdmin` campos técnicos UI | Feature Gap | 🔴 Alta | Siguiente |
| Billing Stripe (migrations 038+039) | Feature | 🟡 Media | Cuando se retome Stripe |
| Sync viva presupuesto (migration 040) | Feature | 🟡 Media | Separada |
| nonWorkingDates / workingDays en projectsService | Bug menor | 🟢 Baja | Backlog |

---

## 6. MIGRACIONES MANUALES PENDIENTES

Todas las migraciones 053–058 ya fueron ejecutadas en producción.

**No hay migraciones pendientes** para el scope beta actual.

Para el backlog:
- `040_computation_schema.sql` — cuando se retome Sincronización Viva
- `038_stripe_billing.sql` + `039_billing_events.sql` — cuando se retome Billing

---

## 7. QA RECOMENDADO ANTES DE RELEASE

### Crítico (bloqueante)
- [ ] Importar un material global que tenga `technicalYield` definido → verificar que el campo se copie al catálogo de empresa (actualmente FALLA)
- [ ] Acceder a GlobalMaterialsAdmin como master_admin y verificar ausencia de inputs técnicos

### Normal
- [ ] Crear material nuevo en Materiales de Empresa → cargar rendimiento + nota → guardar → reabrir → confirmar persistencia
- [ ] Bajar hasta un material al final de la lista → clic en lápiz → confirmar que el drawer aparece visible sin scroll a la cima
- [ ] Con drawer abierto, hacer scroll en la lista → confirmar que el drawer no se mueve
- [ ] Cerrar drawer → confirmar que `paddingRight` desaparece sin layout shift visible
- [ ] Ejecutar Consumos del Proyecto → confirmar que aparecen materiales, mano de obra, equipos
- [ ] Exportar Excel desde Consumos → confirmar estilos (dark header, zebra rows)
- [ ] Exportar CSV → abrir en Excel → confirmar que tildes/ñ no están corruptas
- [ ] Ejecutar APUSummaryReport → Exportar → confirmar funciona

### Smoke test post-deploy
```sql
-- Verificar migraciones en prod:
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'resources' AND column_name IN ('conversion_factor', 'commercial_unit');

SELECT column_name FROM information_schema.columns 
WHERE table_name = 'master_materials' AND column_name IN ('technical_yield', 'technical_yield_unit', 'technical_notes');

SELECT column_name FROM information_schema.columns 
WHERE table_name = 'catalog_task_yields' AND column_name IN ('conversion_factor', 'commercial_unit');
```

---

## 8. SIGUIENTE TANDA SUGERIDA

**Tanda: Fix catálogo global — campos técnicos**

1. **Corregir `importFromGlobal()`** en `masterMaterialsService.ts`  
   — Agregar 3 campos al objeto row del INSERT  
   — No requiere migración

2. **Agregar campos técnicos al formulario de `GlobalMaterialsAdmin.tsx`**  
   — FormData + inputs + toForm() + handleSave()  
   — No requiere migración

3. **QA:** importar material global con rendimiento → verificar copia correcta

4. **Build + commit + deploy**

**Costo estimado:** 1 tanda, baja complejidad, sin migraciones adicionales.

---

*Generado por auditoría automatizada multi-agente — 2026-05-25*
