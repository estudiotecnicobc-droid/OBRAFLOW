import { describe, expect, it } from 'vitest';
import { analyzeBudgetHealth, findUnitPriceOutliers, looksLikeCommaError, normalizeUnit, type HealthRow } from '../../utils/budgetHealth';

const row = (over: Partial<HealthRow> & { itemId: string }): HealthRow => ({
  name: 'Tarea', unit: 'm2', quantity: 10, unitCost: 1000, total: 10000, apuHasMissing: false, ...over,
});
const byId = (rows: HealthRow[], surface?: number) =>
  Object.fromEntries(analyzeBudgetHealth(rows, { surface }).map(i => [i.id, i]));

describe('normalizeUnit', () => {
  it('reconoce variantes', () => {
    expect(normalizeUnit('m²')).toBe('m2');
    expect(normalizeUnit('M3')).toBe('m3');
    expect(normalizeUnit('m.l.')).toBe('ml');
    expect(normalizeUnit('m')).toBe('ml');
    expect(normalizeUnit('u')).toBeNull();
    expect(normalizeUnit('gl')).toBeNull();
  });
});

describe('looksLikeCommaError', () => {
  it('detecta ×10, ×100 y ×1000', () => {
    expect(looksLikeCommaError(25, 2.5)).toBe(true);
    expect(looksLikeCommaError(235, 2.35)).toBe(true);
    expect(looksLikeCommaError(4800, 4.8)).toBe(true);
  });
  it('no confunde diferencias comunes', () => {
    expect(looksLikeCommaError(5, 2.5)).toBe(false);
    expect(looksLikeCommaError(2.5, 2.5)).toBe(false);
    expect(looksLikeCommaError(25, 0)).toBe(false);
  });
});

describe('analyzeBudgetHealth', () => {
  it('presupuesto sano: sin avisos', () => {
    const rows = [1, 2, 3, 4, 5].map(i => row({ itemId: `i${i}` }));
    expect(analyzeBudgetHealth(rows, { surface: 70 })).toEqual([]);
  });

  it('sin precio es error y no se repite como APU incompleto', () => {
    const r = byId([row({ itemId: 'a', unitCost: 0, total: 0, apuHasMissing: true })]);
    expect(r.sin_precio.level).toBe('error');
    expect(r.sin_precio.itemIds).toEqual(['a']);
    expect(r.sin_precio.title).toBe('1 ítem sin precio');
    expect(r.apu_incompleto).toBeUndefined();
  });

  it('cantidad 0 no cuenta como sin precio', () => {
    const r = byId([row({ itemId: 'a', quantity: 0, unitCost: 0, total: 0 })]);
    expect(r.cantidad_cero.itemIds).toEqual(['a']);
    expect(r.sin_precio).toBeUndefined();
  });

  it('APU incompleto con precio parcial', () => {
    const r = byId([row({ itemId: 'a', apuHasMissing: true }), row({ itemId: 'b', apuHasMissing: true })]);
    expect(r.apu_incompleto.title).toBe('2 ítems con recursos sin precio en su análisis');
  });

  it('error de coma frente a la planilla, separado de «no coincide»', () => {
    const r = byId([
      row({ itemId: 'coma', quantity: 25, measuredQuantity: 2.5 }),
      row({ itemId: 'dif', quantity: 12, measuredQuantity: 10 }),
      row({ itemId: 'ok', quantity: 10, measuredQuantity: 10 }),
    ]);
    expect(r.posible_coma.itemIds).toEqual(['coma']);
    expect(r.medido_distinto.itemIds).toEqual(['dif']);
  });

  it('concentración: solo con 5 ítems o más', () => {
    const big = row({ itemId: 'big', total: 1_000_000 });
    const small = [1, 2, 3, 4].map(i => row({ itemId: `s${i}`, total: 1000 }));
    expect(byId([big, ...small]).concentracion.itemIds).toEqual(['big']);
    expect(byId([big, ...small.slice(0, 2)]).concentracion).toBeUndefined();
  });

  it('desproporción respecto de la superficie', () => {
    const rows = [
      row({ itemId: 'm2ok', unit: 'm²', quantity: 300 }),
      row({ itemId: 'm2mal', unit: 'm²', quantity: 2500 }),
      row({ itemId: 'm3mal', unit: 'm3', quantity: 480 }),
      row({ itemId: 'u', unit: 'u', quantity: 99999 }),
    ];
    const r = byId(rows, 70);
    expect(r.desproporcion.itemIds).toEqual(['m2mal', 'm3mal']);
    expect(r.desproporcion.title).toBe('2 cantidades parecen excesivas para una obra de 70 m²');
    expect(byId(rows).desproporcion).toBeUndefined();
  });

  it('ordena errores antes que avisos', () => {
    const issues = analyzeBudgetHealth([
      row({ itemId: 'z', quantity: 0 }),
      row({ itemId: 'a', unitCost: 0, total: 0 }),
    ]);
    expect(issues.map(i => i.level)).toEqual(['error', 'warning']);
  });

  it('P.U. atípico: casos reales de Casa Ciro (estructuras, m³)', () => {
    const est = (itemId: string, unitCost: number) => row({ itemId, rubro: '05 Estructuras', unit: 'm3', unitCost, quantity: 1, total: unitCost });
    const rows = [
      est('col', 172_300), est('col20', 1_430_800), est('colH21', 2_053_300),
      est('viga', 156_210), est('viga2', 1_293_300),
      est('vf', 128_593), est('vf2', 1_681_632.6),
    ];
    expect(findUnitPriceOutliers(rows).sort()).toEqual(['col', 'vf', 'viga']);
  });

  it('P.U. atípico: excavación con mano de obra fuera de escala', () => {
    const exc = (itemId: string, unitCost: number) => row({ itemId, rubro: '03 Movimiento de suelos', unit: 'm³', unitCost });
    const rows = [exc('a', 201_636), exc('b', 12_600), exc('c', 15_000), exc('d', 20_200), exc('e', 18_000)];
    expect(findUnitPriceOutliers(rows)).toEqual(['a']);
  });

  it('P.U. atípico: no compara grupos chicos ni unidades distintas', () => {
    const rows = [
      row({ itemId: 'a', rubro: 'R', unit: 'm3', unitCost: 100 }),
      row({ itemId: 'b', rubro: 'R', unit: 'm3', unitCost: 10_000 }),
      row({ itemId: 'c', rubro: 'R', unit: 'm2', unitCost: 100 }),
      row({ itemId: 'd', rubro: 'R', unit: 'm2', unitCost: 100 }),
    ];
    expect(findUnitPriceOutliers(rows)).toEqual([]);
  });

  it('tareas repetidas', () => {
    const r = byId([
      row({ itemId: 'e1', taskId: 'EXC-001' }), row({ itemId: 'e2', taskId: 'EXC-001' }),
      row({ itemId: 'e3', taskId: 'EXC-001' }), row({ itemId: 'x', taskId: 'OTRA' }),
    ]);
    expect(r.repetida.itemIds).toEqual(['e1', 'e2', 'e3']);
    expect(r.repetida.title).toBe('3 ítems repiten una tarea que ya está en el presupuesto');
  });

  it('sin mano de obra: solo si se informa la mano de obra y el ítem tiene costo', () => {
    const r = byId([
      row({ itemId: 'a', unitLabor: 0 }),
      row({ itemId: 'b', unitLabor: 500 }),
      row({ itemId: 'c' }),
      row({ itemId: 'd', unitLabor: 0, unitCost: 0, total: 0 }),
    ]);
    expect(r.sin_mano_obra.itemIds).toEqual(['a']);
  });
});
