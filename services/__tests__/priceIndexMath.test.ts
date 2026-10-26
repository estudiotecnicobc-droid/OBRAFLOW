import { describe, it, expect } from 'vitest';
import { monthOf, latestAtOrBefore, coefficient, parseIndexPaste, formatPeriod } from '../priceIndexMath';

const pts = [
  { period: '2026-01-01', value: 100 },
  { period: '2026-02-01', value: 104 },
  { period: '2026-03-01', value: 110 },
];

describe('priceIndexMath', () => {
  it('monthOf no corre el mes por zona horaria', () => {
    expect(monthOf('2026-03-01')).toBe('2026-03-01');
    expect(monthOf('2026-03-31')).toBe('2026-03-01');
  });

  it('latestAtOrBefore toma el último publicado', () => {
    expect(latestAtOrBefore(pts, '2026-02-01')?.value).toBe(104);
    expect(latestAtOrBefore(pts, '2026-06-01')?.value).toBe(110);
    expect(latestAtOrBefore(pts, '2025-12-01')).toBeUndefined();
  });

  it('coefficient = destino / base', () => {
    expect(coefficient(pts, '2026-01-01', '2026-03-01')).toBeCloseTo(1.1, 6);
    expect(coefficient(pts, '2026-01-01', '2026-09-01')).toBeUndefined();
  });

  it('parseIndexPaste acepta formatos argentinos', () => {
    expect(parseIndexPaste('2026-09;1.234,56\n09/2026 1234.56\nbasura\n2026-13;5')).toEqual([
      { period: '2026-09-01', value: 1234.56 },
      { period: '2026-09-01', value: 1234.56 },
    ]);
  });

  it('formatPeriod', () => {
    expect(formatPeriod('2026-09-01')).toBe('septiembre 2026');
  });
});
