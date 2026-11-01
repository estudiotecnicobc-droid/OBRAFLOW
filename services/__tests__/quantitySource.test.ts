import { describe, it, expect } from 'vitest';
import { getQuantitySource } from '../../utils/quantitySource';
import { buildComputationImportPayloads } from '../importComputationItems';
import type { BudgetItem, MeasurementSheet } from '../../types';
import type { ChandiasAddedItem } from '../../src/features/material-calculator/engine/chandias';

const item = (over: Partial<BudgetItem> = {}): BudgetItem => ({ id: 'bi1', taskId: 't1', quantity: 10, ...over });
const sheet = (total: number, lines = 1): MeasurementSheet => ({
  id: 's1', organizationId: 'o', budgetItemId: 'bi1', totalQuantity: total,
  lines: Array.from({ length: lines }, (_, i) => ({ id: `l${i}`, description: '', length: total, width: 1, height: 1, count: 1, subtotal: total })),
  lastUpdated: '', updatedBy: '',
});

describe('getQuantitySource', () => {
  it('manual por defecto', () => {
    expect(getQuantitySource(item(), []).kind).toBe('manual');
  });
  it('calculador si tiene computationItemId', () => {
    expect(getQuantitySource(item({ computationItemId: 'c1' }), []).kind).toBe('calculador');
  });
  it('medido tiene prioridad sobre calculador y detecta desfasaje', () => {
    const ok = getQuantitySource(item({ computationItemId: 'c1' }), [sheet(10)]);
    expect(ok).toMatchObject({ kind: 'medido', outOfSync: false });
    expect(getQuantitySource(item(), [sheet(12)]).outOfSync).toBe(true);
  });
  it('una planilla sin líneas no cuenta como medición', () => {
    expect(getQuantitySource(item(), [sheet(0, 0)]).kind).toBe('manual');
  });
});

describe('buildComputationImportPayloads · existentes', () => {
  const added = (itemId: string, nombre: string, quantity: number) =>
    ({ itemId, taskId: 'X-1', taskNombre: nombre, unidad: 'm2', quantity } as unknown as ChandiasAddedItem);

  it('suma por tarea las líneas que ya están en el presupuesto en vez de omitirlas', () => {
    const r = buildComputationImportPayloads(
      [added('a', 'Revoque grueso', 12), added('b', 'Revoque Grueso ', 8)],
      [], 'o', 'p', {}, {}, [], new Set(['revoque grueso']), { a: 'comp-a' },
    );
    expect(r.payloads).toHaveLength(0);
    expect(r.noAPUPayloads).toHaveLength(0);
    expect(r.existingUpdates).toEqual([{ nameKey: 'revoque grueso', quantity: 20, computationItemId: 'comp-a' }]);
  });
});
