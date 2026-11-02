/**
 * services/pricing/frozenBudget.ts
 * ────────────────────────────────
 * Costo de materiales de un presupuesto CONGELADO, calculado directamente desde
 * las filas persistidas en `budget_cost_snapshot_prices` (get_frozen_budget_prices).
 *
 * Reglas:
 *   · Se consume quantity + unitPrice + currency + unit tal como quedaron
 *     congelados. NO se reconstruyen cantidades desde el APU actual.
 *   · NO se aplica `apuConversionFactor` ni `supplierUnitFactor`: ambos son
 *     evidencia; el SQL ya los resolvió al congelar y `unitPrice` está en la
 *     unidad técnica del material. Aplicarlos acá sería contarlos dos veces.
 *   · Para APU vivos (no congelados) se usa `buildApuUnitCost` (apuPricing.ts).
 *
 * Política de redondeo (espejo de `freeze_budget_prices`, round(..., 2)):
 *   · costo por fila   = quantity × unitPrice → 4 decimales
 *   · totales          → 2 decimales
 *   · La suma se acumula como entero en diezmilésimos (Math.round(cost × 10⁴))
 *     y se divide al final, para evitar la deriva binaria de sumar floats;
 *     el redondeo a centavos se hace una sola vez sobre la suma exacta de los
 *     costos a 4 decimales, igual que SQL `round(sum(quantity * unit_price), 2)`.
 */

import type { FrozenComponentPrice, PriceSource, PriceStatus } from './types';

export const WARN_UNUSABLE_COMPONENT_PRICES = 'UNUSABLE_COMPONENT_PRICES';

const SCALE = 10_000; // diezmilésimos

const round4 = (n: number): number => +n.toFixed(4);
const toScaled = (n: number): number => Math.round(n * SCALE);
const scaledToCents = (scaled: number): number => Math.round(scaled / 100) / 100;

export interface FrozenComponentCost {
  budgetItemId: string;
  componentId: string;
  masterTaskId: string;
  masterMaterialId: string | null;
  quantity: number;
  unit: string;
  unitPrice: number | null;
  cost: number;                     // quantity × unitPrice, 4 decimales (0 si unitPrice null)
  isUsable: boolean;
  source: PriceSource;
  priceStatus: PriceStatus;
  warnings: string[];
}

export interface FrozenBudgetItemCost {
  budgetItemId: string;
  total: number;                    // Σ cost de filas usables, 2 decimales
  unusableAmount: number;           // Σ cost de filas no usables con precio, 2 decimales
  componentCount: number;
  unusableCount: number;
}

export interface FrozenBudgetCost {
  materialsTotal: number;           // Σ cost usables, 2 decimales
  unusableAmount: number;           // Σ cost no usables con precio, 2 decimales
  currency: string | null;          // null solo si no hay filas
  byBudgetItem: FrozenBudgetItemCost[];
  byComponent: FrozenComponentCost[];
  componentCount: number;
  unusableCount: number;
  incomplete: boolean;              // alguna fila no usable
  warnings: string[];
}

/**
 * Costo de materiales de un snapshot congelado. Lanza si las filas mezclan
 * monedas: un snapshot se congela en una sola moneda y mezclarlas sería un
 * dato corrupto, no un caso a sumar.
 */
export function buildFrozenBudgetCost(rows: FrozenComponentPrice[]): FrozenBudgetCost {
  let currency: string | null = null;
  let totalScaled = 0;
  let unusableScaled = 0;
  const items = new Map<string, { total: number; unusable: number; count: number; unusableCount: number }>();
  const byComponent: FrozenComponentCost[] = [];
  const warnings = new Set<string>();
  let unusableCount = 0;

  for (const r of rows) {
    const rowCurrency = r.currency.trim().toUpperCase();
    if (currency === null) currency = rowCurrency;
    else if (rowCurrency !== currency) {
      throw new Error(
        `buildFrozenBudgetCost: snapshot ${r.snapshotId} mezcla monedas (${currency} y ${rowCurrency}) en el componente ${r.componentId}`,
      );
    }

    const usable = r.isUsable && r.unitPrice !== null && r.unitPrice > 0;
    const cost = r.unitPrice === null ? 0 : round4(r.quantity * r.unitPrice);
    const scaled = toScaled(cost);

    const item = items.get(r.budgetItemId) ?? { total: 0, unusable: 0, count: 0, unusableCount: 0 };
    item.count += 1;
    if (usable) {
      totalScaled += scaled;
      item.total += scaled;
    } else {
      unusableCount += 1;
      item.unusableCount += 1;
      unusableScaled += scaled;
      item.unusable += scaled;
    }
    items.set(r.budgetItemId, item);

    byComponent.push({
      budgetItemId: r.budgetItemId,
      componentId: r.componentId,
      masterTaskId: r.masterTaskId,
      masterMaterialId: r.masterMaterialId,
      quantity: r.quantity,
      unit: r.unit,
      unitPrice: r.unitPrice,
      cost,
      isUsable: usable,
      source: r.source,
      priceStatus: r.priceStatus,
      warnings: [...r.warnings],
    });

    for (const w of r.warnings) warnings.add(`${r.budgetItemId}/${r.componentId}: ${w}`);
  }

  if (unusableCount > 0) warnings.add(WARN_UNUSABLE_COMPONENT_PRICES);

  const byBudgetItem: FrozenBudgetItemCost[] = [...items.entries()].map(([budgetItemId, v]) => ({
    budgetItemId,
    total: scaledToCents(v.total),
    unusableAmount: scaledToCents(v.unusable),
    componentCount: v.count,
    unusableCount: v.unusableCount,
  }));

  return {
    materialsTotal: scaledToCents(totalScaled),
    unusableAmount: scaledToCents(unusableScaled),
    currency,
    byBudgetItem,
    byComponent,
    componentCount: rows.length,
    unusableCount,
    incomplete: unusableCount > 0,
    warnings: [...warnings],
  };
}
