import { describe, it, expect } from 'vitest';
import type { MeasurementLine } from '../../types';
import { lineSubtotal, measureColumns, measureFormula, measureKindForUnit, sheetTotal } from '../../utils/measurementLayout';

const line = (p: Partial<MeasurementLine>): MeasurementLine => {
  const l = { id: 'x', description: '', length: 1, width: 1, height: 1, count: 1, subtotal: 0, ...p };
  return { ...l, subtotal: p.subtotal ?? lineSubtotal(l) };
};

describe('measureKindForUnit', () => {
  it('clasifica las unidades habituales', () => {
    expect(measureKindForUnit('ml')).toBe('linear');
    expect(measureKindForUnit('m')).toBe('linear');
    expect(measureKindForUnit('m²')).toBe('area');
    expect(measureKindForUnit('M2')).toBe('area');
    expect(measureKindForUnit('m3')).toBe('volume');
    expect(measureKindForUnit('m³')).toBe('volume');
    expect(measureKindForUnit('un')).toBe('count');
    expect(measureKindForUnit('gl')).toBe('count');
    expect(measureKindForUnit(undefined)).toBe('count');
  });
});

describe('measureColumns', () => {
  it('zócalo en ml pide solo largo y veces', () => {
    const cols = measureColumns('ml', []);
    expect(cols.map(c => c.field)).toEqual(['length']);
    expect(measureFormula(cols)).toBe('Largo × Veces');
  });
  it('m² pide largo y ancho/alto; m³ las tres; un pide cantidad', () => {
    expect(measureColumns('m2').map(c => c.field)).toEqual(['length', 'width']);
    expect(measureColumns('m3').map(c => c.field)).toEqual(['length', 'width', 'height']);
    expect(measureFormula(measureColumns('un'))).toBe('Cantidad × Veces');
  });
  it('muestra una medida que la unidad no usa si una línea vieja la tiene distinta de 1', () => {
    const cols = measureColumns('ml', [line({ length: 4, width: 0.1 })]);
    expect(cols.map(c => c.field)).toEqual(['length', 'width']);
  });
  it('ignora las medidas de líneas con subtotal escrito a mano', () => {
    const cols = measureColumns('m2', [line({ length: 0, width: 0, height: 0, subtotal: -10.55 })]);
    expect(cols.map(c => c.field)).toEqual(['length', 'width']);
  });
});

describe('sheetTotal', () => {
  it('resta las líneas marcadas para descontar', () => {
    const lines = [
      line({ length: 4.2, count: 2 }),               // 8,4 ml
      line({ length: 0.8, count: 2, deduct: true }), // −1,6 ml de puertas
    ];
    expect(sheetTotal(lines)).toEqual({ total: 6.8, negative: false });
  });
  it('respeta los subtotales negativos de planillas anteriores', () => {
    const lines = [line({ length: 20 }), line({ length: 0, width: 0, height: 0, subtotal: -5.5 })];
    expect(sheetTotal(lines).total).toBe(14.5);
  });
  it('no baja de 0 y avisa', () => {
    const lines = [line({ length: 1 }), line({ length: 3, deduct: true })];
    expect(sheetTotal(lines)).toEqual({ total: 0, negative: true });
  });
});
