import { describe, it, expect } from 'vitest';
import { technicalUnitPrice, commercialUnitPrice, priceInputToTechnical } from '../technicalUnitPrice';

/**
 * Paridad bidireccional: el código tiene que resolver el precio técnico igual
 * antes y después de la migración 20261103100100. "Antes" = fila con
 * priceUnitBasis = undefined/'commercial_legacy' y unitPrice en comercial.
 * "Después" = fila con priceUnitBasis = 'technical' y unitPrice en técnico.
 */

describe('technicalUnitPrice', () => {
  it('sin conversion_factor → devuelve unit_price tal cual', () => {
    expect(technicalUnitPrice({ unitPrice: 310 })).toBe(310);
    expect(technicalUnitPrice({ unitPrice: 45000, conversionFactor: 1 })).toBe(45000);
    expect(technicalUnitPrice({ unitPrice: 100, conversionFactor: null })).toBe(100);
  });

  it('estado commercial_legacy con factor > 1 → divide una vez', () => {
    // Cemento Portland en bolsa 50 kg, precio DB 15500 (comercial), factor 50.
    expect(technicalUnitPrice({ unitPrice: 15500, conversionFactor: 50 })).toBe(310);
    expect(technicalUnitPrice({ unitPrice: 15500, conversionFactor: 50, priceUnitBasis: 'commercial_legacy' })).toBe(310);
    // Hierro Ø12, precio por barra 10253, factor 10.68.
    expect(technicalUnitPrice({ unitPrice: 10253, conversionFactor: 10.68 })).toBeCloseTo(960.019, 3);
  });

  it('estado technical con factor > 1 → devuelve unit_price tal cual (no divide dos veces)', () => {
    expect(technicalUnitPrice({ unitPrice: 310, conversionFactor: 50, priceUnitBasis: 'technical' })).toBe(310);
    expect(technicalUnitPrice({ unitPrice: 960.02, conversionFactor: 10.68, priceUnitBasis: 'technical' })).toBe(960.02);
  });

  it('paridad antes/después: el valor técnico es idéntico en ambos estados', () => {
    const antes   = technicalUnitPrice({ unitPrice: 15500, conversionFactor: 50 });                              // 310
    const despues = technicalUnitPrice({ unitPrice: 310,   conversionFactor: 50, priceUnitBasis: 'technical' }); // 310
    expect(Math.abs(antes - despues)).toBeLessThanOrEqual(0.01);
  });
});

describe('commercialUnitPrice', () => {
  it('sin factor > 1 → undefined (no aplica unidad comercial)', () => {
    expect(commercialUnitPrice({ unitPrice: 310 })).toBeUndefined();
    expect(commercialUnitPrice({ unitPrice: 310, conversionFactor: 1 })).toBeUndefined();
  });

  it('estado commercial_legacy → unit_price ya es comercial, lo devuelve tal cual', () => {
    expect(commercialUnitPrice({ unitPrice: 15500, conversionFactor: 50 })).toBe(15500);
    expect(commercialUnitPrice({ unitPrice: 15500, conversionFactor: 50, priceUnitBasis: 'commercial_legacy' })).toBe(15500);
  });

  it('estado technical → multiplica unit_price × factor', () => {
    expect(commercialUnitPrice({ unitPrice: 310, conversionFactor: 50, priceUnitBasis: 'technical' })).toBe(15500);
    expect(commercialUnitPrice({ unitPrice: 960.02, conversionFactor: 10.68, priceUnitBasis: 'technical' })).toBeCloseTo(10253, 1);
  });

  it('paridad: el valor comercial calculado es idéntico en ambos estados', () => {
    const antes   = commercialUnitPrice({ unitPrice: 15500, conversionFactor: 50 });                              // 15500
    const despues = commercialUnitPrice({ unitPrice: 310,   conversionFactor: 50, priceUnitBasis: 'technical' }); // 15500
    expect(Math.abs((antes ?? 0) - (despues ?? 0))).toBeLessThanOrEqual(0.01);
  });
});

describe('priceInputToTechnical (form del usuario → payload DB)', () => {
  it('alta nueva con factor 50, modo comercial, usuario escribe 15500 → unitPrice=310 marcado technical', () => {
    const r = priceInputToTechnical({ displayPrice: 15500, priceMode: 'commercial', conversionFactor: 50 });
    expect(r.unitPrice).toBe(310);
    expect(r.priceUnitBasis).toBe('technical');
  });

  it('alta nueva con factor 50, modo técnico, usuario escribe 310 → unitPrice=310 marcado technical', () => {
    const r = priceInputToTechnical({ displayPrice: 310, priceMode: 'technical', conversionFactor: 50 });
    expect(r.unitPrice).toBe(310);
    expect(r.priceUnitBasis).toBe('technical');
  });

  it('alta nueva sin factor → unitPrice tal cual, priceUnitBasis undefined', () => {
    expect(priceInputToTechnical({ displayPrice: 45000, priceMode: 'technical', conversionFactor: null }))
      .toEqual({ unitPrice: 45000, priceUnitBasis: undefined });
    expect(priceInputToTechnical({ displayPrice: 45000, priceMode: 'commercial' }))
      .toEqual({ unitPrice: 45000, priceUnitBasis: undefined });
    expect(priceInputToTechnical({ displayPrice: 45000, priceMode: 'commercial', conversionFactor: 1 }))
      .toEqual({ unitPrice: 45000, priceUnitBasis: undefined });
  });

  it('edición con factor 10.68, modo comercial, usuario sube el precio → se divide y queda marcado', () => {
    // Hierro Ø12: barra 10 253 → técnico 960.019...
    const r = priceInputToTechnical({ displayPrice: 10253, priceMode: 'commercial', conversionFactor: 10.68 });
    expect(r.unitPrice).toBeCloseTo(960.019, 3);
    expect(r.priceUnitBasis).toBe('technical');
  });
});
