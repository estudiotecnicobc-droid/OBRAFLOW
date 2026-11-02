import { describe, it, expect } from 'vitest';
import { buildApuUnitCost, summarizePriceStatus, WARN_CURRENCY_MIXED, WARN_PRICE_NOT_RESOLVED } from '../apuPricing';
import type { ApuPricingComponent, ResolvedReferencePrice } from '../types';

const relevado = (over: Partial<ResolvedReferencePrice> = {}): ResolvedReferencePrice => ({
  price: 100, unit: 'KG', currency: 'ARS', source: 'SUPPLIER_OBSERVED', warnings: [],
  effectiveDate: '2026-11-01', referenceId: 'obs-1', isUsable: true,
  observationCount: 3, priceStatus: 'RELEVADO', ...over,
});

const comp = (over: Partial<ApuPricingComponent> = {}): ApuPricingComponent => ({
  componentId: 'c1', materialName: 'Cemento', unit: 'KG', quantity: 10, ...over,
});

describe('buildApuUnitCost', () => {
  it('todos relevados: suma, 4 decimales por componente y 2 en total, trazabilidad', () => {
    const components = [
      comp({ componentId: 'c1', materialName: 'Cemento', quantity: 7.5 }),
      comp({ componentId: 'c2', materialName: 'Arena', unit: 'M3', quantity: 0.0333 }),
    ];
    const resolved = {
      c1: relevado({ price: 123.4567, referenceId: 'obs-c' }),
      c2: relevado({ price: 45000.1234, unit: 'M3', referenceId: 'obs-a', effectiveDate: '2026-10-28' }),
    };
    const r = buildApuUnitCost(components, resolved);

    expect(r.isUsable).toBe(true);
    expect(r.priceQuality).toBe('RELEVADO');
    expect(r.currency).toBe('ARS');
    expect(r.components[0].cost).toBe(+(123.4567 * 7.5).toFixed(4));
    expect(r.components[1].cost).toBe(+(45000.1234 * 0.0333).toFixed(4));
    expect(r.materialCost).toBe(+(r.components[0].cost + r.components[1].cost).toFixed(2));
    expect(r.traceability).toEqual([
      { componentId: 'c1', source: 'SUPPLIER_OBSERVED', referenceId: 'obs-c', effectiveDate: '2026-11-01', priceStatus: 'RELEVADO' },
      { componentId: 'c2', source: 'SUPPLIER_OBSERVED', referenceId: 'obs-a', effectiveDate: '2026-10-28', priceStatus: 'RELEVADO' },
    ]);
    expect(r.warnings).toEqual([]);
  });

  it('aplica desperdicio y factor de conversión sin cambiar la aritmética existente', () => {
    // bolsa de 50 kg → precio por kg 20 → precio por bolsa 1000; 3 bolsas con 5% desperdicio
    const r = buildApuUnitCost(
      [comp({ unit: 'bolsa', quantity: 3, wastePercent: 5, conversionFactor: 50 })],
      { c1: relevado({ price: 20, unit: 'KG' }) },
    );
    expect(r.components[0].unitPrice).toBe(1000);
    expect(r.components[0].cost).toBe(3150);
    expect(r.materialCost).toBe(3150);
  });

  it('sin conversionFactor explícito usa el helper de unidades comerciales ("50kg" → 50)', () => {
    const r = buildApuUnitCost(
      [comp({ unit: '50kg', quantity: 2 })],
      { c1: relevado({ price: 20, unit: 'KG' }) },
    );
    expect(r.components[0].conversionFactor).toBe(50);
    expect(r.components[0].cost).toBe(2000);
  });

  it('un CATALOG_UNVERIFIED → APU usable con calidad ESTIMADO', () => {
    const r = buildApuUnitCost(
      [comp({ componentId: 'c1' }), comp({ componentId: 'c2', materialName: 'Cal' })],
      {
        c1: relevado(),
        c2: relevado({ source: 'ORG_MASTER', priceStatus: 'CATALOG_UNVERIFIED', warnings: ['CATALOG_UNVERIFIED'], observationCount: null }),
      },
    );
    expect(r.isUsable).toBe(true);
    expect(r.priceQuality).toBe('ESTIMADO');
    expect(r.materialCost).toBe(2000);
    expect(r.warnings).toEqual(['Cal: CATALOG_UNVERIFIED']);
  });

  it('un componente sin precio → SIN_PRECIO, isUsable=false y aporte 0', () => {
    const r = buildApuUnitCost(
      [comp({ componentId: 'c1' }), comp({ componentId: 'c2', materialName: 'Hierro' })],
      {
        c1: relevado(),
        c2: relevado({ price: null, unit: null, currency: null, source: 'NO_PRICE', isUsable: false, priceStatus: 'SIN_PRECIO', warnings: ['PRICE_NOT_FOUND'], referenceId: null }),
      },
    );
    expect(r.isUsable).toBe(false);
    expect(r.priceQuality).toBe('SIN_PRECIO');
    expect(r.components[1].cost).toBe(0);
    expect(r.components[1].isUsable).toBe(false);
    expect(r.materialCost).toBe(1000);
    expect(r.warnings).toContain('Hierro: PRICE_NOT_FOUND');
  });

  it('componente no resuelto (falta en el mapa) → PRICE_NOT_RESOLVED y no usable', () => {
    const r = buildApuUnitCost([comp()], {});
    expect(r.isUsable).toBe(false);
    expect(r.components[0].source).toBe('NO_PRICE');
    expect(r.warnings).toEqual([`Cemento: ${WARN_PRICE_NOT_RESOLVED}`]);
  });

  it('UNIT_MISMATCH del motor → componente no usable aunque tenga precio', () => {
    const r = buildApuUnitCost(
      [comp({ unit: 'M3', conversionFactor: 1 })],
      { c1: relevado({ unit: 'KG', isUsable: false, warnings: ['UNIT_MISMATCH'] }) },
    );
    expect(r.isUsable).toBe(false);
    expect(r.components[0].unitPrice).toBe(100);
    expect(r.components[0].cost).toBe(0);
    expect(r.materialCost).toBe(0);
    expect(r.warnings).toEqual(['Cemento: UNIT_MISMATCH']);
  });

  it('no mezcla USD con ARS: el componente en otra moneda queda fuera y el APU no es usable', () => {
    const r = buildApuUnitCost(
      [comp({ componentId: 'c1' }), comp({ componentId: 'c2', materialName: 'Perfil' })],
      { c1: relevado({ currency: 'ARS' }), c2: relevado({ price: 5, currency: 'USD' }) },
    );
    expect(r.currency).toBe('ARS');
    expect(r.isUsable).toBe(false);
    expect(r.components[1].isUsable).toBe(false);
    expect(r.components[1].warnings).toContain(WARN_CURRENCY_MIXED);
    expect(r.materialCost).toBe(1000);
  });

  it('respeta la moneda esperada en options', () => {
    const r = buildApuUnitCost([comp()], { c1: relevado({ currency: 'ARS' }) }, { currency: 'USD' });
    expect(r.isUsable).toBe(false);
    expect(r.currency).toBe('USD');
    expect(r.components[0].warnings).toContain(WARN_CURRENCY_MIXED);
  });

  it('acepta un Map como mapa de precios resueltos', () => {
    const r = buildApuUnitCost([comp()], new Map([['c1', relevado()]]));
    expect(r.materialCost).toBe(1000);
  });

  it('lista vacía → no usable y SIN_PRECIO', () => {
    const r = buildApuUnitCost([], {});
    expect(r.isUsable).toBe(false);
    expect(r.priceQuality).toBe('SIN_PRECIO');
    expect(r.materialCost).toBe(0);
  });
});

describe('summarizePriceStatus', () => {
  it('vacío → SIN_PRECIO', () => {
    expect(summarizePriceStatus([])).toBe('SIN_PRECIO');
  });

  it('todos RELEVADO (o FROZEN) → RELEVADO', () => {
    expect(summarizePriceStatus([relevado(), relevado({ source: 'FROZEN_SNAPSHOT', priceStatus: 'FROZEN' })])).toBe('RELEVADO');
  });

  it('algún CATALOG_UNVERIFIED → ESTIMADO', () => {
    expect(summarizePriceStatus([relevado(), relevado({ priceStatus: 'CATALOG_UNVERIFIED' })])).toBe('ESTIMADO');
  });

  it('DESACTUALIZADO pesa más que ESTIMADO', () => {
    expect(summarizePriceStatus([
      relevado({ priceStatus: 'CATALOG_UNVERIFIED' }),
      relevado({ priceStatus: 'DESACTUALIZADO' }),
    ])).toBe('DESACTUALIZADO');
  });

  it('cualquier no usable o sin precio → SIN_PRECIO', () => {
    expect(summarizePriceStatus([relevado(), relevado({ isUsable: false, warnings: ['UNIT_MISMATCH'] })])).toBe('SIN_PRECIO');
    expect(summarizePriceStatus([relevado({ price: null, source: 'NO_PRICE', isUsable: false, priceStatus: 'SIN_PRECIO' })])).toBe('SIN_PRECIO');
  });
});
