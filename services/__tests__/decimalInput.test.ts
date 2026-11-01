import { describe, it, expect } from 'vitest';
import { parseDecimal } from '../../components/DecimalInput';

describe('parseDecimal', () => {
  it.each([
    ['2,5', 2.5], ['2.5', 2.5], ['0,35', 0.35], ['12', 12], ['1.250,5', 1250.5],
    ['2,', 2], ['0.', 0], [',5', 0.5], [' 3,75 ', 3.75],
  ])('«%s» → %s', (raw, n) => expect(parseDecimal(raw)).toBe(n));

  it('vacío o inválido → null', () => {
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('2,5,1')).toBeNull();
  });
});
