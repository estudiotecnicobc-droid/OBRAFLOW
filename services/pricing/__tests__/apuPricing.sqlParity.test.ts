import { describe, it, expect } from 'vitest';
import { buildApuUnitCost, WARN_UNIT_MISMATCH } from '../apuPricing';
import type { ApuPricingComponent, ResolvedReferencePrice } from '../types';

/**
 * Paridad TS / SQL (criterio "unidad técnica única").
 *
 * `calculate_consolidated_resources` (057) y `freeze_budget_prices` (100009)
 * calculan el aporte de un componente como:
 *   contribución = quantity × (1 + waste/100) × uprice
 * donde `uprice` es el precio tal cual (sin aplicar `conversion_factor`).
 *
 * `buildApuUnitCost` (TS) debe producir el mismo `materialCost` dentro de una
 * tolerancia de $0.01 para los mismos datos. UNIT_MISMATCH se detecta antes de
 * la suma: el componente queda no usable y aporta 0 (igual que lo hace la ruta
 * de resolución de precio del motor cuando llega con `isUsable=false` por
 * mismatch).
 */

const SQL_TOLERANCE = 0.01;

function sqlLikeMaterialCost(
  components: ApuPricingComponent[],
  resolved: Record<string, ResolvedReferencePrice>,
): number {
  let total = 0;
  for (const c of components) {
    const r = resolved[c.componentId];
    if (!r?.isUsable || r.price == null) continue;
    const waste = c.wastePercent ?? 0;
    total += c.quantity * (1 + waste / 100) * r.price;
  }
  return +total.toFixed(2);
}

const relevado = (over: Partial<ResolvedReferencePrice> = {}): ResolvedReferencePrice => ({
  price: 100, unit: 'KG', currency: 'ARS', source: 'SUPPLIER_OBSERVED', warnings: [],
  effectiveDate: '2026-11-01', referenceId: 'obs-1', isUsable: true,
  observationCount: 3, priceStatus: 'RELEVADO', resolution: null, ...over,
});

const comp = (over: Partial<ApuPricingComponent> = {}): ApuPricingComponent => ({
  componentId: 'c1', materialName: 'X', unit: 'KG', quantity: 1, ...over,
});

describe('paridad SQL/TS: criterio unidad técnica única', () => {
  it('componente en kg con conversion_factor = 10.68 → mismo costo en TS y SQL', () => {
    // Acero ADN 420 Ø12mm · 95 kg · 1 barra de 12m pesa 10.68 kg · precio técnico $2.260/kg
    const components = [comp({ unit: 'kg', quantity: 95, conversionFactor: 10.68 })];
    const resolved = { c1: relevado({ price: 2260, unit: 'KG' }) };

    const ts  = buildApuUnitCost(components, resolved).materialCost;
    const sql = sqlLikeMaterialCost(components, resolved);

    expect(Math.abs(ts - sql)).toBeLessThanOrEqual(SQL_TOLERANCE);
    expect(ts).toBe(+(2260 * 95).toFixed(2));             // 214.700,00
  });

  it('mismo valor con factor NULL (= 1 por COALESCE) y con factor 10.68', () => {
    const base = { unit: 'kg', quantity: 95 } as const;
    const resolved = { c1: relevado({ price: 2260, unit: 'KG' }) };

    const conFactor = buildApuUnitCost([comp({ ...base, conversionFactor: 10.68 })], resolved).materialCost;
    const sinFactor = buildApuUnitCost([comp({ ...base, conversionFactor: null })],  resolved).materialCost;

    expect(Math.abs(conFactor - sinFactor)).toBeLessThanOrEqual(SQL_TOLERANCE);
  });

  it('APU completo (3 componentes, con waste y factor evidencia) → paridad TS/SQL', () => {
    // Caso tomado del catálogo real: Columna de H.A. 20×20
    //   · Acero ADN 420 — 95 kg (factor 10.68, waste 0, $2.260/kg)
    //   · Cemento Portland — 72 kg (factor 50 evidencia bolsa 50kg, waste 5%, $310/kg)
    //   · Arena gruesa — 0.14 m3 (sin factor, waste 2%, $45.000/m3)
    const components: ApuPricingComponent[] = [
      comp({ componentId: 'c1', unit: 'kg', quantity: 95,  wastePercent: 0, conversionFactor: 10.68 }),
      comp({ componentId: 'c2', unit: 'kg', quantity: 72,  wastePercent: 5, conversionFactor: 50 }),
      comp({ componentId: 'c3', unit: 'M3', quantity: 0.14, wastePercent: 2 }),
    ];
    const resolved = {
      c1: relevado({ price: 2260,  unit: 'KG' }),
      c2: relevado({ price: 310,   unit: 'KG' }),
      c3: relevado({ price: 45000, unit: 'M3' }),
    };

    const ts  = buildApuUnitCost(components, resolved).materialCost;
    const sql = sqlLikeMaterialCost(components, resolved);

    expect(Math.abs(ts - sql)).toBeLessThanOrEqual(SQL_TOLERANCE);
  });

  it('componente con unidad distinta a la del precio sin conversión → UNIT_MISMATCH, aporte 0', () => {
    // componente en kg contra precio en M3 → no se convierte, no se suma.
    const components = [comp({ unit: 'kg', quantity: 95 })];
    const resolved   = { c1: relevado({ price: 2260, unit: 'M3' }) };

    const result = buildApuUnitCost(components, resolved);
    expect(result.isUsable).toBe(false);
    expect(result.materialCost).toBe(0);
    expect(result.components[0].warnings).toContain(WARN_UNIT_MISMATCH);
  });

  it('precio en unidad comercial del catálogo viejo (bolsa) sin normalizar → NO entra al costo', () => {
    // Si por error el motor devolviera un precio por "bolsa 50 kg" ($15.500 bolsa),
    // el componente en kg lo rechaza con UNIT_MISMATCH. Antes del criterio A, TS
    // habría multiplicado por 50 y devuelto un número 10× inflado (ver A3).
    const components = [comp({ unit: 'kg', quantity: 72 })];
    const resolved   = { c1: relevado({ price: 15500, unit: 'bolsa 50 kg' }) };

    const result = buildApuUnitCost(components, resolved);
    expect(result.isUsable).toBe(false);
    expect(result.materialCost).toBe(0);
    expect(result.components[0].warnings).toContain(WARN_UNIT_MISMATCH);
  });
});
