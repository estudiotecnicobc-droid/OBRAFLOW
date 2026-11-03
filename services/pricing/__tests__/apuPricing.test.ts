import { describe, it, expect } from 'vitest';
import { buildApuUnitCost, describePriceQuality, observationIdsOf, summarizePriceStatus, WARN_CURRENCY_MIXED, WARN_PRICE_NOT_RESOLVED, WARN_UNIT_MISMATCH } from '../apuPricing';
import type { ApuPricingComponent, PriceResolution, ResolvedReferencePrice } from '../types';

const relevado = (over: Partial<ResolvedReferencePrice> = {}): ResolvedReferencePrice => ({
  price: 100, unit: 'KG', currency: 'ARS', source: 'SUPPLIER_OBSERVED', warnings: [],
  effectiveDate: '2026-11-01', referenceId: 'obs-1', isUsable: true,
  observationCount: 3, priceStatus: 'RELEVADO', resolution: null, ...over,
});

const observedResolution: PriceResolution = {
  method: 'median_by_supplier', window_days: 90, as_of: '2026-11-02', mode: 'CURRENT',
  filters: { region: 'AMBA', currency: 'ARS', includes_vat: false, commercial_condition: 'LISTA' },
  observation_ids: ['o1', 'o2', 'o3'], observation_count: 3, supplier_count: 2,
  newest_observed_on: '2026-11-01', oldest_observed_on: '2026-10-01',
};

const frozenResolution: PriceResolution = {
  method: 'frozen_snapshot', snapshot_id: 'snp-1', project_id: 'prj-1', found: true, budget_item_id: 'bi-1',
  frozen_price_id: 'fp-1', frozen_price_ids: ['fp-1'], original_source: 'ORG_MASTER', original_price_status: 'CATALOG_UNVERIFIED',
  original_resolution: null, resolved_at: '2026-10-01T10:00:00+00:00',
};

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
      c1: relevado({ price: 123.4567, referenceId: 'obs-c', resolution: observedResolution }),
      c2: relevado({ price: 45000.1234, unit: 'M3', referenceId: 'obs-a', effectiveDate: '2026-10-28', observationCount: 5 }),
    };
    const r = buildApuUnitCost(components, resolved);

    expect(r.isUsable).toBe(true);
    expect(r.priceQuality).toBe('RELEVADO');
    expect(r.currency).toBe('ARS');
    expect(r.components[0].cost).toBe(+(123.4567 * 7.5).toFixed(4));
    expect(r.components[1].cost).toBe(+(45000.1234 * 0.0333).toFixed(4));
    expect(r.materialCost).toBe(+(r.components[0].cost + r.components[1].cost).toFixed(2));
    expect(r.traceability).toEqual([
      { componentId: 'c1', source: 'SUPPLIER_OBSERVED', referenceId: 'obs-c', effectiveDate: '2026-11-01', priceStatus: 'RELEVADO', observationCount: 3, resolution: observedResolution },
      { componentId: 'c2', source: 'SUPPLIER_OBSERVED', referenceId: 'obs-a', effectiveDate: '2026-10-28', priceStatus: 'RELEVADO', observationCount: 5, resolution: null },
    ]);
    expect(r.warnings).toEqual([]);
  });

  it('aplica desperdicio sobre precio técnico; conversionFactor es evidencia y NO cambia el costo', () => {
    // Mismo kg (técnica) con 5% desperdicio. Factor 10.68 queda como evidencia para compras.
    const r = buildApuUnitCost(
      [comp({ unit: 'kg', quantity: 95, wastePercent: 5, conversionFactor: 10.68 })],
      { c1: relevado({ price: 2260, unit: 'KG' }) },
    );
    expect(r.components[0].conversionFactor).toBe(10.68);
    expect(r.components[0].unitPrice).toBe(2260);                       // sin multiplicar por factor
    expect(r.components[0].cost).toBe(+(2260 * 95 * 1.05).toFixed(4));  // = 225435
    expect(r.materialCost).toBe(+(2260 * 95 * 1.05).toFixed(2));
    expect(r.warnings).toEqual([]);
  });

  it('mismo costo con factor 10.68 que con factor 1 (paridad por "factor es solo evidencia")', () => {
    const base = { unit: 'kg', quantity: 95, wastePercent: 0 } as const;
    const price = { c1: relevado({ price: 2260, unit: 'KG' }) };
    const conFactor = buildApuUnitCost([comp({ ...base, conversionFactor: 10.68 })], price);
    const sinFactor = buildApuUnitCost([comp({ ...base, conversionFactor: 1 })],     price);
    expect(Math.abs(conFactor.materialCost - sinFactor.materialCost)).toBeLessThanOrEqual(0.01);
  });

  it('precio congelado: se consume tal cual, sin reaplicar factores de evidencia', () => {
    const r = buildApuUnitCost(
      [comp({ unit: 'KG', quantity: 4 })],
      { c1: relevado({ price: 250, unit: 'KG', source: 'FROZEN_SNAPSHOT', priceStatus: 'FROZEN', resolution: frozenResolution }) },
    );
    expect(r.components[0].conversionFactor).toBe(1);
    expect(r.components[0].unitPrice).toBe(250);
    expect(r.materialCost).toBe(1000);
  });

  it('componente en unidad distinta a la del precio sin UNIT_MISMATCH del motor → UNIT_MISMATCH local, no se convierte', () => {
    // Antes el motor TS inferia factor 50 por "50kg"; ahora rechaza por mismatch.
    const r = buildApuUnitCost(
      [comp({ unit: '50kg', quantity: 2 })],
      { c1: relevado({ price: 20, unit: 'KG' }) },
    );
    expect(r.isUsable).toBe(false);
    expect(r.components[0].isUsable).toBe(false);
    expect(r.components[0].warnings).toContain(WARN_UNIT_MISMATCH);
    expect(r.components[0].cost).toBe(0);
    expect(r.materialCost).toBe(0);
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
    expect(r.traceability[0]).toEqual({
      componentId: 'c1', source: 'NO_PRICE', referenceId: null, effectiveDate: null,
      priceStatus: 'SIN_PRECIO', observationCount: null, resolution: null,
    });
  });

  it('APU congelado: la calidad es la del precio original (CATALOG_UNVERIFIED → ESTIMADO) y la trazabilidad conserva la resolution', () => {
    const r = buildApuUnitCost(
      [comp()],
      { c1: relevado({ source: 'FROZEN_SNAPSHOT', priceStatus: 'FROZEN', referenceId: 'fp-1', observationCount: null, resolution: frozenResolution }) },
    );
    expect(r.isUsable).toBe(true);
    expect(r.priceQuality).toBe('ESTIMADO');
    expect(r.traceability[0].resolution).toEqual(frozenResolution);
    expect(r.traceability[0].observationCount).toBeNull();
  });

  it('UNIT_MISMATCH del motor → componente no usable aunque tenga precio', () => {
    const r = buildApuUnitCost(
      [comp({ unit: 'M3', conversionFactor: 1 })],
      { c1: relevado({ unit: 'KG', isUsable: false, warnings: ['UNIT_MISMATCH'] }) },
    );
    expect(r.isUsable).toBe(false);
    expect(r.components[0].unitPrice).toBe(100);     // el precio sigue reportado, pero el componente no entra
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

const frozenOf = (original: ResolvedReferencePrice['priceStatus'], over: Partial<ResolvedReferencePrice> = {}): ResolvedReferencePrice =>
  relevado({
    source: 'FROZEN_SNAPSHOT', priceStatus: 'FROZEN', observationCount: null,
    resolution: { ...frozenResolution, original_price_status: original, original_resolution: original === 'RELEVADO' ? observedResolution : null },
    ...over,
  });

describe('describePriceQuality', () => {
  it('precio vivo: LIVE + calidad derivada de priceStatus', () => {
    expect(describePriceQuality(relevado())).toEqual({ freezeState: 'LIVE', priceQuality: 'RELEVADO' });
    expect(describePriceQuality(relevado({ priceStatus: 'CATALOG_UNVERIFIED' }))).toEqual({ freezeState: 'LIVE', priceQuality: 'ESTIMADO' });
    expect(describePriceQuality(relevado({ priceStatus: 'DESACTUALIZADO' }))).toEqual({ freezeState: 'LIVE', priceQuality: 'DESACTUALIZADO' });
  });

  it('precio congelado: FROZEN + calidad del estado ORIGINAL', () => {
    expect(describePriceQuality(frozenOf('RELEVADO'))).toEqual({ freezeState: 'FROZEN', priceQuality: 'RELEVADO' });
    expect(describePriceQuality(frozenOf('CATALOG_UNVERIFIED'))).toEqual({ freezeState: 'FROZEN', priceQuality: 'ESTIMADO' });
    expect(describePriceQuality(frozenOf('DESACTUALIZADO'))).toEqual({ freezeState: 'FROZEN', priceQuality: 'DESACTUALIZADO' });
  });

  it('congelado sin resolution original → FROZEN + ESTIMADO (no se asume relevado)', () => {
    expect(describePriceQuality(frozenOf('RELEVADO', { resolution: null }))).toEqual({ freezeState: 'FROZEN', priceQuality: 'ESTIMADO' });
  });

  it('no usable o sin precio → SIN_PRECIO en cualquier estado', () => {
    expect(describePriceQuality(relevado({ isUsable: false }))).toEqual({ freezeState: 'LIVE', priceQuality: 'SIN_PRECIO' });
    expect(describePriceQuality(frozenOf('RELEVADO', { price: null, isUsable: false }))).toEqual({ freezeState: 'FROZEN', priceQuality: 'SIN_PRECIO' });
  });
});

describe('observationIdsOf', () => {
  it('median_by_supplier → observation_ids; frozen → los de la resolution original; otros → []', () => {
    expect(observationIdsOf(observedResolution)).toEqual(['o1', 'o2', 'o3']);
    expect(observationIdsOf(frozenOf('RELEVADO').resolution)).toEqual(['o1', 'o2', 'o3']);
    expect(observationIdsOf(frozenResolution)).toEqual([]);
    expect(observationIdsOf({ method: 'single_source', source: 'ORG_MASTER', as_of: '2026-11-02', mode: 'CURRENT', observed_candidates: 0 })).toEqual([]);
    expect(observationIdsOf(null)).toEqual([]);
  });
});

describe('summarizePriceStatus', () => {
  it('vacío → SIN_PRECIO', () => {
    expect(summarizePriceStatus([])).toBe('SIN_PRECIO');
  });

  it('todos RELEVADO (vivos o congelados de origen RELEVADO) → RELEVADO', () => {
    expect(summarizePriceStatus([relevado(), frozenOf('RELEVADO')])).toBe('RELEVADO');
  });

  it('FROZEN no es calidad: un congelado de origen CATALOG_UNVERIFIED → ESTIMADO, de origen DESACTUALIZADO → DESACTUALIZADO', () => {
    expect(summarizePriceStatus([relevado(), frozenOf('CATALOG_UNVERIFIED')])).toBe('ESTIMADO');
    expect(summarizePriceStatus([relevado(), frozenOf('DESACTUALIZADO')])).toBe('DESACTUALIZADO');
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
