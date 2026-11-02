import { describe, it, expect } from 'vitest';
import { buildFrozenBudgetCost, WARN_UNUSABLE_COMPONENT_PRICES } from '../frozenBudget';
import type { FrozenComponentPrice } from '../types';
import fixture from './fixtures/frozen_snapshot_05_circuito.json';

const rows = fixture.rows as FrozenComponentPrice[];
const I1 = 'b0000000-0000-0000-0000-000000000001';
const I2 = 'b0000000-0000-0000-0000-000000000002';

const frozen = (over: Partial<FrozenComponentPrice> = {}): FrozenComponentPrice => ({
  ...rows[0], id: 'x', budgetItemId: 'item-x', componentId: 'comp-x', ...over,
});

describe('buildFrozenBudgetCost — equivalencia SQL ↔ TS (05_circuito, freeze P1)', () => {
  it('materialsTotal = 36247.50 como freeze_budget_prices (tolerancia 0,01)', () => {
    const r = buildFrozenBudgetCost(rows);
    expect(Math.abs(r.materialsTotal - fixture.expected.materialsTotal)).toBeLessThan(0.01);
    expect(r.materialsTotal).toBe(36247.5);
    expect(r.currency).toBe('ARS');
    expect(r.incomplete).toBe(false);
    expect(r.unusableAmount).toBe(0);
    expect(r.componentCount).toBe(4);
    expect(r.warnings).toEqual([]);
  });

  it('byBudgetItem: I1 = 21×1100 + 5×750 = 26850.00; I2 = 7,35×1100 + 1,75×750 = 9397.50', () => {
    const r = buildFrozenBudgetCost(rows);
    const byId = Object.fromEntries(r.byBudgetItem.map(b => [b.budgetItemId, b.total]));
    expect(byId[I1]).toBe(26850);
    expect(byId[I2]).toBe(9397.5);
    expect(r.byBudgetItem.find(b => b.budgetItemId === I1)?.componentCount).toBe(2);
  });

  it('NO aplica apuConversionFactor (50 en Cemento): cost = quantity × unitPrice tal cual', () => {
    const r = buildFrozenBudgetCost(rows);
    const cemI1 = r.byComponent.find(c => c.budgetItemId === I1 && c.componentId === '90000000-0000-0000-0000-000000000001');
    expect(cemI1?.cost).toBe(23100);
    expect(cemI1?.unitPrice).toBe(1100);
  });

  it('el detalle Σ cost (4 dec) redondeado a 2 coincide con materialsTotal, como round(sum(q×p),2) en SQL', () => {
    const r = buildFrozenBudgetCost(rows);
    const sum = r.byComponent.reduce((a, c) => a + c.cost, 0);
    expect(+sum.toFixed(2)).toBe(r.materialsTotal);
  });
});

describe('buildFrozenBudgetCost — factores y no usables', () => {
  it('factor comercial ≠ 1 y unidades distintas: 150 kg × 20/kg = 3000, sin aplicar supplierUnitFactor 50', () => {
    const r = buildFrozenBudgetCost([
      frozen({ quantity: 150, unit: 'kg', unitPrice: 20, supplierUnitFactor: 50, apuConversionFactor: 50 }),
    ]);
    expect(r.materialsTotal).toBe(3000);
    expect(r.byComponent[0].cost).toBe(3000);
  });

  it('UNIT_MISMATCH (isUsable=false) no suma al total pero sí a unusableAmount; incomplete=true', () => {
    const r = buildFrozenBudgetCost([
      frozen({ budgetItemId: 'i1', componentId: 'ok', quantity: 2, unitPrice: 100 }),
      frozen({ budgetItemId: 'i1', componentId: 'bad', quantity: 3, unitPrice: 1100, isUsable: false, warnings: ['UNIT_MISMATCH'] }),
    ]);
    expect(r.materialsTotal).toBe(200);
    expect(r.unusableAmount).toBe(3300);
    expect(r.unusableCount).toBe(1);
    expect(r.incomplete).toBe(true);
    expect(r.byBudgetItem[0]).toMatchObject({ budgetItemId: 'i1', total: 200, unusableAmount: 3300, unusableCount: 1 });
    expect(r.warnings).toContain('i1/bad: UNIT_MISMATCH');
    expect(r.warnings).toContain(WARN_UNUSABLE_COMPONENT_PRICES);
  });

  it('NO_PRICE (unitPrice null) aporta 0 a ambos totales y marca incomplete', () => {
    const r = buildFrozenBudgetCost([
      frozen({ unitPrice: null, isUsable: false, source: 'NO_PRICE', priceStatus: 'SIN_PRECIO', warnings: ['FROZEN_PRICE_MISSING'] }),
    ]);
    expect(r.materialsTotal).toBe(0);
    expect(r.unusableAmount).toBe(0);
    expect(r.incomplete).toBe(true);
    expect(r.byComponent[0].cost).toBe(0);
  });

  it('acumula sin deriva binaria: 10 × 0,1 × 3 = 3.00 exacto', () => {
    const r = buildFrozenBudgetCost(Array.from({ length: 10 }, (_, i) => frozen({ id: `r${i}`, componentId: `c${i}`, quantity: 0.1, unitPrice: 3 })));
    expect(r.materialsTotal).toBe(3);
  });

  it('mezcla de monedas → error', () => {
    expect(() => buildFrozenBudgetCost([frozen({ currency: 'ARS' }), frozen({ id: 'y', currency: 'USD' })])).toThrow(/mezcla monedas/);
  });

  it('sin filas → 0, currency null, no incomplete', () => {
    const r = buildFrozenBudgetCost([]);
    expect(r).toMatchObject({ materialsTotal: 0, unusableAmount: 0, currency: null, incomplete: false, byBudgetItem: [], byComponent: [] });
  });
});
