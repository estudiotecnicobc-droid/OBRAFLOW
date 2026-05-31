# P0 — Diagnóstico: Bug Matemático APU Mampostería 18 cm

**Fecha:** 2026-05-30  
**Rama:** `audit/p0-masonry-apu-math`  
**Severidad:** P0 — el test E2E que valida el contrato matemático central del producto pasa en falso positivo

---

## 1. Síntoma observado

El test E2E `step 07 - APU cost appears in budget row` reporta:

| Variable | Valor reportado | Valor esperado | Error |
|----------|-----------------|----------------|-------|
| Ladrillos hueco 18 | 45 u | 270 u (6 × 45 m²) | ÷6 |
| Arena gruesa | 45 m³ | 0,45 m³ (0,01 × 45 m²) | ×100 |
| Cemento portland | 45 kg | 22,5 kg (0,5 × 45 m²) | ×2 |
| Mano de obra | $0 | ~$15.000/m² × 45 m² | 100% ausente |
| Rubro | "Otros" / "Sin Categoría" | "Mampostería" | incorrecto |

El test pasa porque su assertion es `regex /\$[1-9][0-9,\.]+/ sobre el body completo` — cualquier signo $ positivo en cualquier parte de la página lo satisface.

---

## 2. Causa raíz confirmada

### 2a. Selector E2E incorrecto — CAUSA PRIMARIA

**Archivo:** `tests/e2e/beta-golden-path.spec.ts`  
**Función:** `fillMaterialYields()` (aprox. líneas 430-445)

```typescript
// BUG: selector demasiado amplio
const qtyInputs = page.locator('tbody input[type="number"]');
if (await qtyInputs.count() > 0) {
  await qtyInputs.last().fill(qty);   // ← llena wastePercent, NO quantity
  await qtyInputs.last().press('Tab');
  clickCount++;
}
```

**Por qué falla:** Cada fila de material en `MasterTasksPanel.tsx` tiene **dos** `input[type="number"]` dentro de `<tbody>`:

```tsx
// components/MasterTasksPanel.tsx ~ línea 1351
<input type="number" value={m.quantity} ... />       // col "Cantidad" ← se quiere llenar esto

// components/MasterTasksPanel.tsx ~ línea 1357
<input type="number" value={m.wastePercent} ... />   // col "Desper.%" ← se llena esto por error
```

Con N materiales hay 2N inputs. `.last()` siempre apunta al `wastePercent` de la última fila.

**Resultado:** Los 3 materiales del APU quedan con `quantity = 1` (valor default de `addMaterialLine()`). El `wastePercent` del último material recibe el valor incorrecto.

### 2b. Assertions E2E incorrectas — CAUSA SECUNDARIA

**Step 07 — falso positivo:**
```typescript
const hasPositiveCost = /\$[1-9][0-9,\.]+/.test(content);
expect(hasPositiveCost).toBe(true);
```
Pasa si CUALQUIER precio positivo aparece en la página. No verifica el subtotal del APU específico ni el total correcto para 45 m².

### 2c. MO = 0 — GAP de cobertura

El test nunca agrega categorías de mano de obra al APU. Resultado: `laborYields = []` tras importar. `calculationService.ts` usa `task.laborCost` como fallback, que llega a 0 (`importMasterTask.ts` línea 93: `task.laborCost = 0`).

### 2d. Rubro vacío — GAP de cobertura

`EMPTY_TASK.category = ''`. El test nunca setea la categoría. `BudgetGrid` mapea `''` → `'Sin Categoría'`.

---

## 3. Fórmulas canónicas vs fórmulas en uso

### Costo unitario APU (por m² de muro 18 cm)

```
CostoUnitario = Σ Materiales + Mano de Obra

Materiales:
  Ladrillo:  6 u/m²    × $250/u   = $1.500
  Arena:     0,01 m³/m² × $12.000/m³ = $120
  Cemento:   0,5 kg/m²  × $250/kg  = $125
  ─────────────────────────────────────────
  SubtotalMat = $1.745 / m²

MO (fórmula calculationService.ts):
  MO = (dailyRate × 8h × laborQty) / dailyYield
     = ($15.000 × 8 × 1) / 8
     = $15.000 / m²

CostoUnitario = $1.745 + $15.000 = $16.745 / m²
```

### Explosión para 45 m²

```
SubtotalPresupuesto = CostoUnitario × 45 m²
                    = $16.745 × 45
                    = $753.525
```

### Lo que el bug produce actualmente

```
Materiales con qty=1 (en lugar de 6 / 0,01 / 0,5):
  Ladrillo:  1 u/m²    × $250    = $250   (debería ser $1.500)
  Arena:     1 m³/m²   × $12.000 = $12.000 (debería ser $120)
  Cemento:   1 kg/m²   × $250    = $250   (debería ser $125)
  SubtotalMat(bug) = $12.500 / m²  ← inflado 7,2×

MO = $0 (sin labor yields)

CostoUnitario(bug) = $12.500 / m²   (debería ser $16.745)
SubtotalPresupuesto(bug) = $562.500  (debería ser $753.525)
```

El motor de cálculo (`calculationService.ts`) es **correcto**. El error está en los datos de entrada.

---

## 4. Flujo de datos afectado

```
E2E fillMaterialYields()
  │
  ├─ BUG: .last() llena wastePercent en lugar de quantity
  │       → todos los materiales quedan con quantity = 1 (default)
  │
  └─ handleSave() en MasterTasksPanel
       │
       └─ masterTasksSupabaseService.createMasterTask()
            │  stores: master_task_materials.quantity = 1 ← dato corrupto en DB
            │
            └─ importMasterTask.buildImportPayload()
                 │  reads: mtm.quantity → task_yield.quantity = 1
                 │
                 └─ calculationService.calculateUnitPrice()
                      │  cómputo: cost × qty = cost × 1  ← error amplificado × presupuesto_qty
                      │
                      └─ BudgetGrid muestra costo incorrecto
```

---

## 5. Motor de cálculo — estado (NO TOCAR)

Los siguientes archivos están correctos y **no deben modificarse** para el fix P0:

| Archivo | Estado | Razón |
|---------|--------|-------|
| `services/calculationService.ts` | ✅ correcto | `cost × quantity` es la fórmula correcta |
| `services/importMasterTask.ts` | ✅ correcto | `quantity: mtm.quantity` — copia fiel del APU |
| `services/masterTasksSupabaseService.ts` | ✅ correcto | persiste lo que recibe, sin transformación |
| `services/budgetItemsService.ts` | ✅ correcto | no almacena precio; siempre recalcula |
| `components/MasterTasksPanel.tsx` | ✅ correcto | dos inputs por fila es diseño correcto |
| `services/masterTaskCostService.ts` | ✅ correcto | preview-only, no afecta el presupuesto |
| `context/ERPContext.tsx` | ✅ NO TOCAR | sin relación con este bug |

---

## 6. Fix requerido — solo en el test E2E

### Fix 1 — Selector de quantity (CRÍTICO)

**Archivo:** `tests/e2e/beta-golden-path.spec.ts`

Cambiar el selector en `fillMaterialYields()` para apuntar a la primera columna numérica (quantity) por fila, no al último input global:

```typescript
// ANTES (buggy):
const qtyInputs = page.locator('tbody input[type="number"]');
await qtyInputs.last().fill(qty);

// DESPUÉS (correcto):
// Buscar la fila que contiene el keyword del material
// y llenar el PRIMER input[type="number"] de esa fila (= quantity)
const materialRow = page.locator('tbody tr').filter({ hasText: keyword });
const quantityInput = materialRow.locator('input[type="number"]').first();
await quantityInput.fill(qty);
await quantityInput.press('Tab');
```

### Fix 2 — Assertion matemática específica (IMPORTANTE)

**Archivo:** `tests/e2e/beta-golden-path.spec.ts`, step 07

```typescript
// ANTES (falso positivo):
const hasPositiveCost = /\$[1-9][0-9,\.]+/.test(content);
expect(hasPositiveCost).toBe(true);

// DESPUÉS (contrato matemático real):
// 1. Buscar la fila del APU en el presupuesto
// 2. Leer el unitPrice de esa fila
// 3. Verificar que sea > 0 (idealmente ~$16.745 con tolerancia)
// 4. O bien: verificar que la "Explosión de Insumos" para 45 m² sea > $500.000
const apuRow = page.locator('table tbody tr').filter({ hasText: /muro|mampo/i });
const unitPriceCell = apuRow.locator('td').nth(3); // depende del layout de BudgetGrid
const unitPriceText = await unitPriceCell.textContent();
// extraer número y verificar > $5.000 / m² como sanity check mínimo
```

### Fix 3 — Agregar MO al APU (RECOMENDADO para cobertura completa)

Agregar en step 06, después de agregar materiales:
```typescript
// Agregar MO: Albañil, 1 jornada
await page.getByRole('button', { name: /agregar mano de obra/i }).click();
const laborRow = page.locator('tbody tr').filter({ hasText: /alba[ñn]il/i });
const laborQtyInput = laborRow.locator('input[type="number"]').first();
await laborQtyInput.fill('1');
```

### Fix 4 — Setear categoría (RECOMENDADO)

```typescript
await page.getByLabel(/categor[ií]a|rubro/i).selectOption({ label: 'Mampostería' });
// o el equivalent según el componente
```

---

## 7. Rangos de sanidad para APU Muro 18 cm

Usados para validar que los fixes producen valores razonables:

| Métrica | Mínimo esperado | Máximo esperado | Unidad |
|---------|-----------------|-----------------|--------|
| Rendimiento ladrillo | 5 | 8 | u/m² |
| Rendimiento arena | 0.005 | 0.02 | m³/m² |
| Rendimiento cemento | 0.3 | 0.8 | kg/m² |
| Costo material/m² | 1.000 | 5.000 | $/m² |
| Costo MO/m² | 5.000 | 30.000 | $/m² |
| Costo total/m² | 6.000 | 35.000 | $/m² |
| Costo total 45 m² | 270.000 | 1.575.000 | $ |

Si el test reporta valores fuera de estos rangos, el bug no está corregido.

---

## 8. Checklist de verificación post-fix

- [ ] `fillMaterialYields('LADRILLO', '6')` → APU guarda `quantity = 6` en `master_task_materials`
- [ ] `fillMaterialYields('ARENA', '0.01')` → APU guarda `quantity = 0.01`
- [ ] `fillMaterialYields('CEMENTO', '0.5')` → APU guarda `quantity = 0.5`
- [ ] Al importar APU al presupuesto: `task_yields` tiene los tres valores correctos
- [ ] BudgetGrid muestra unitPrice > $6.000/m² para 45 m² de muro
- [ ] BudgetGrid muestra totalPrice > $270.000 para 45 m² de muro
- [ ] Step 07 assertion verifica el valor del APU específico, no el body genérico
- [ ] MO aparece en el APU (si Fix 3 implementado)
- [ ] Rubro = "Mampostería" (si Fix 4 implementado)

---

## 9. Archivos a modificar para el fix

| Archivo | Cambio | Prioridad |
|---------|--------|-----------|
| `tests/e2e/beta-golden-path.spec.ts` | Fix selector qty + assertion step 07 | 🔴 P0 |
| `tests/e2e/beta-golden-path.spec.ts` | Agregar MO al APU | 🟡 P1 |
| `tests/e2e/beta-golden-path.spec.ts` | Setear categoría | 🟡 P1 |

---

## 10. Archivos a NO modificar

- `components/MasterTasksPanel.tsx` — diseño correcto (2 inputs por fila)
- `services/calculationService.ts` — motor correcto
- `services/importMasterTask.ts` — importación correcta
- `services/masterTasksSupabaseService.ts` — persistencia correcta
- `context/ERPContext.tsx` — sin relación
- Cualquier migración SQL — no se necesita migración nueva

---

*Generado: 2026-05-30 — rama audit/p0-masonry-apu-math*
