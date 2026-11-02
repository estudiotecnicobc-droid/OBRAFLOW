import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('../../supabaseClient', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import {
  resolveReferencePrice,
  resolveObservedPrice,
  publishPriceObservations,
  invalidatePriceObservation,
  freezeBudgetPrices,
  getFrozenBudgetPrices,
  frozenPriceFromRow,
} from '../referencePriceService';

const ORG = '11111111-1111-1111-1111-111111111111';
const MAT = '22222222-2222-2222-2222-222222222222';
const CMP = '33333333-3333-3333-3333-333333333333';
const PRJ = '44444444-4444-4444-4444-444444444444';
const SNP = '55555555-5555-5555-5555-555555555555';
const BIT = '66666666-6666-6666-6666-666666666666';
const USR = '77777777-7777-7777-7777-777777777777';

const observedResolution = {
  method: 'median_by_supplier', window_days: 90, as_of: '2026-11-02', mode: 'CURRENT',
  filters: { region: 'AMBA', currency: 'ARS', includes_vat: false, commercial_condition: 'LISTA' },
  observation_ids: ['o1', 'o2', 'o3', 'o4'], observation_count: 4, supplier_count: 2,
  newest_observed_on: '2026-11-01', oldest_observed_on: '2026-09-20',
};

const resolvedRow = {
  price: '1234.500000', unit: 'KG', currency: 'ARS', source: 'SUPPLIER_OBSERVED',
  warnings: [], effective_date: '2026-11-01', reference_id: 'obs-9', is_usable: true,
  observation_count: 4, price_status: 'RELEVADO', resolution: observedResolution,
};

describe('resolveReferencePrice', () => {
  beforeEach(() => rpc.mockReset());

  it('llama a resolve_reference_price con los 11 p_* de la firma final y mapea a camelCase', async () => {
    rpc.mockResolvedValue({ data: resolvedRow, error: null });

    const r = await resolveReferencePrice({
      organizationId: ORG, masterMaterialId: MAT, componentId: CMP, projectId: PRJ,
      effectiveDate: '2026-11-02', mode: 'AS_OF', requiredUnit: 'KG', expectedCurrency: 'ARS',
    });

    expect(rpc).toHaveBeenCalledWith('resolve_reference_price', {
      p_organization_id:    ORG,
      p_master_material_id: MAT,
      p_resource_id:        null,
      p_component_id:       CMP,
      p_project_id:         PRJ,
      p_effective_date:     '2026-11-02',
      p_mode:               'AS_OF',
      p_required_unit:      'KG',
      p_expected_currency:  'ARS',
      p_snapshot_id:        null,
      p_budget_item_id:     null,
    });
    expect(r).toEqual({
      price: 1234.5, unit: 'KG', currency: 'ARS', source: 'SUPPLIER_OBSERVED', warnings: [],
      effectiveDate: '2026-11-01', referenceId: 'obs-9', isUsable: true,
      observationCount: 4, priceStatus: 'RELEVADO', resolution: observedResolution,
    });
  });

  it('defaults: CURRENT, hoy, ARS, nulls, p_snapshot_id y p_budget_item_id null', async () => {
    rpc.mockResolvedValue({ data: resolvedRow, error: null });
    await resolveReferencePrice({ organizationId: ORG, resourceId: MAT });

    const args = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(args.p_mode).toBe('CURRENT');
    expect(args.p_expected_currency).toBe('ARS');
    expect(args.p_effective_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(args.p_master_material_id).toBeNull();
    expect(args.p_resource_id).toBe(MAT);
    expect(args.p_component_id).toBeNull();
    expect(args.p_project_id).toBeNull();
    expect(args.p_required_unit).toBeNull();
    expect(args.p_snapshot_id).toBeNull();
    expect(args.p_budget_item_id).toBeNull();
  });

  it('FROZEN envía p_snapshot_id y mapea FROZEN_SNAPSHOT con resolution frozen_snapshot', async () => {
    const frozenResolution = {
      method: 'frozen_snapshot', snapshot_id: SNP, project_id: PRJ, found: true, budget_item_id: BIT,
      frozen_price_id: 'fp-1', frozen_price_ids: ['fp-1', 'fp-2'],
      original_source: 'SUPPLIER_OBSERVED', original_price_status: 'RELEVADO',
      original_resolution: observedResolution, resolved_at: '2026-11-02T12:00:00+00:00',
    };
    rpc.mockResolvedValue({
      data: { ...resolvedRow, source: 'FROZEN_SNAPSHOT', price_status: 'FROZEN', observation_count: null, resolution: frozenResolution },
      error: null,
    });
    const r = await resolveReferencePrice({ organizationId: ORG, componentId: CMP, projectId: PRJ, mode: 'FROZEN', snapshotId: SNP, budgetItemId: BIT });

    expect(rpc.mock.calls[0][1]).toMatchObject({ p_mode: 'FROZEN', p_snapshot_id: SNP, p_component_id: CMP, p_budget_item_id: BIT });
    expect(r.source).toBe('FROZEN_SNAPSHOT');
    expect(r.priceStatus).toBe('FROZEN');
    expect(r.observationCount).toBeNull();
    expect(r.resolution).toEqual(frozenResolution);
  });

  it('FROZEN sin budgetItemId: propaga 22023 FROZEN_AMBIGUOUS_COMPONENT del SQL', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'FROZEN_AMBIGUOUS_COMPONENT: pass p_budget_item_id', code: '22023' } });
    await expect(resolveReferencePrice({ organizationId: ORG, componentId: CMP, mode: 'FROZEN', snapshotId: SNP }))
      .rejects.toThrow('FROZEN_AMBIGUOUS_COMPONENT');
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_snapshot_id: SNP, p_budget_item_id: null });
  });

  it('FROZEN no encontrado: resolution frozen_snapshot con found=false y FROZEN_PRICE_MISSING', async () => {
    const res = { method: 'frozen_snapshot', snapshot_id: SNP, project_id: PRJ, budget_item_id: null, found: false };
    rpc.mockResolvedValue({
      data: { price: null, unit: 'KG', currency: 'ARS', source: 'NO_PRICE', warnings: ['FROZEN_PRICE_MISSING'], effective_date: null, reference_id: null, is_usable: false, observation_count: 0, price_status: 'SIN_PRECIO', resolution: res },
      error: null,
    });
    const r = await resolveReferencePrice({ organizationId: ORG, componentId: CMP, mode: 'FROZEN', snapshotId: SNP });
    expect(r.isUsable).toBe(false);
    expect(r.warnings).toEqual(['FROZEN_PRICE_MISSING']);
    expect(r.resolution).toEqual(res);
  });

  it('FROZEN sin snapshotId falla antes de llamar a Supabase', async () => {
    await expect(resolveReferencePrice({ organizationId: ORG, componentId: CMP, mode: 'FROZEN' })).rejects.toThrow(/snapshotId/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('fila sin precio → SIN_PRECIO, NO_PRICE, warnings y resolution single_source', async () => {
    const res = { method: 'single_source', source: 'NO_PRICE', as_of: '2026-11-02', mode: 'CURRENT', observed_candidates: 0 };
    rpc.mockResolvedValue({
      data: { price: null, unit: null, currency: null, source: 'NO_PRICE', warnings: ['PRICE_NOT_FOUND'], effective_date: null, reference_id: null, is_usable: false, observation_count: null, price_status: 'SIN_PRECIO', resolution: res },
      error: null,
    });
    const r = await resolveReferencePrice({ organizationId: ORG, masterMaterialId: MAT });
    expect(r.price).toBeNull();
    expect(r.isUsable).toBe(false);
    expect(r.priceStatus).toBe('SIN_PRECIO');
    expect(r.warnings).toEqual(['PRICE_NOT_FOUND']);
    expect(r.resolution).toEqual(res);
  });

  it('resolution ausente → null; resolution como string jsonb → parseada', async () => {
    rpc.mockResolvedValueOnce({ data: { ...resolvedRow, resolution: undefined }, error: null });
    expect((await resolveReferencePrice({ organizationId: ORG, masterMaterialId: MAT })).resolution).toBeNull();

    rpc.mockResolvedValueOnce({ data: { ...resolvedRow, resolution: JSON.stringify(observedResolution) }, error: null });
    expect((await resolveReferencePrice({ organizationId: ORG, masterMaterialId: MAT })).resolution).toEqual(observedResolution);
  });

  it('acepta la fila envuelta en array', async () => {
    rpc.mockResolvedValue({ data: [resolvedRow], error: null });
    const r = await resolveReferencePrice({ organizationId: ORG, masterMaterialId: MAT });
    expect(r.price).toBe(1234.5);
  });

  it('propaga el mensaje de error de Supabase', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'RESOLVER_ERROR', code: 'P0001' } });
    await expect(resolveReferencePrice({ organizationId: ORG, masterMaterialId: MAT })).rejects.toThrow('RESOLVER_ERROR');
  });
});

describe('resolveObservedPrice', () => {
  beforeEach(() => rpc.mockReset());

  it('llama a resolve_observed_price con región/condición explícitas y defaults del resto; mapea supplier_count', async () => {
    rpc.mockResolvedValue({
      data: [{ price: '980.25', unit: 'KG', currency: 'ARS', observation_count: 5, newest_observed_on: '2026-10-30', oldest_observed_on: '2026-09-15', observation_ids: ['o1', 'o2'], price_status: 'RELEVADO', supplier_count: 3 }],
      error: null,
    });
    const r = await resolveObservedPrice({ organizationId: ORG, masterMaterialId: MAT, asOf: '2026-11-02', region: 'AMBA', commercialCondition: 'LISTA' });

    expect(rpc).toHaveBeenCalledWith('resolve_observed_price', {
      p_organization_id:      ORG,
      p_master_material_id:   MAT,
      p_as_of:                '2026-11-02',
      p_region:               'AMBA',
      p_currency:             'ARS',
      p_includes_vat:         false,
      p_commercial_condition: 'LISTA',
      p_window_days:          90,
    });
    expect(r).toEqual({
      price: 980.25, unit: 'KG', currency: 'ARS', observationCount: 5,
      newestObservedOn: '2026-10-30', oldestObservedOn: '2026-09-15',
      observationIds: ['o1', 'o2'], priceStatus: 'RELEVADO', supplierCount: 3,
    });
  });

  it('pasa parámetros explícitos (región libre, moneda, IVA, condición libre, ventana)', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await resolveObservedPrice({
      organizationId: ORG, masterMaterialId: MAT, region: 'CORDOBA', currency: 'USD',
      includesVat: true, commercialCondition: 'PROMO', windowDays: 30,
    });
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_region: 'CORDOBA', p_currency: 'USD', p_includes_vat: true, p_commercial_condition: 'PROMO', p_window_days: 30,
    });
  });

  it('sin region o sin commercialCondition falla antes de llamar a Supabase (no hay default DESCONOCIDA)', async () => {
    await expect(resolveObservedPrice({ organizationId: ORG, masterMaterialId: MAT, region: '', commercialCondition: 'LISTA' })).rejects.toThrow(/region/);
    await expect(resolveObservedPrice({ organizationId: ORG, masterMaterialId: MAT, region: 'AMBA', commercialCondition: '' })).rejects.toThrow(/commercialCondition/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('sin observaciones → null', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await resolveObservedPrice({ organizationId: ORG, masterMaterialId: MAT, region: 'AMBA', commercialCondition: 'LISTA' })).toBeNull();
  });

  it('propaga el error de Supabase', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    await expect(resolveObservedPrice({ organizationId: ORG, masterMaterialId: MAT, region: 'AMBA', commercialCondition: 'LISTA' })).rejects.toThrow('permission denied');
  });
});

describe('publishPriceObservations', () => {
  beforeEach(() => rpc.mockReset());

  it('llama a publish_price_observations con los p_* exactos y devuelve la cantidad publicada', async () => {
    rpc.mockResolvedValue({ data: 3, error: null });
    const n = await publishPriceObservations({
      organizationId: ORG, observationIds: ['o1', 'o2', 'o3'], region: 'AMBA', includesVat: true, commercialCondition: 'CONTADO',
    });
    expect(rpc).toHaveBeenCalledWith('publish_price_observations', {
      p_organization_id:      ORG,
      p_observation_ids:      ['o1', 'o2', 'o3'],
      p_region:               'AMBA',
      p_includes_vat:         true,
      p_commercial_condition: 'CONTADO',
    });
    expect(n).toBe(3);
  });

  it('lista vacía → 0 sin llamar a Supabase', async () => {
    expect(await publishPriceObservations({ organizationId: ORG, observationIds: [], region: 'AMBA', includesVat: false, commercialCondition: 'LISTA' })).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('propaga el error de Supabase', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'not a member' } });
    await expect(publishPriceObservations({ organizationId: ORG, observationIds: ['o1'], region: 'AMBA', includesVat: false, commercialCondition: 'LISTA' })).rejects.toThrow('not a member');
  });
});

describe('invalidatePriceObservation', () => {
  beforeEach(() => rpc.mockReset());

  it('llama a invalidate_price_observation con los p_* exactos', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await invalidatePriceObservation({ organizationId: ORG, observationId: 'o1', reason: 'precio mal cargado' });
    expect(rpc).toHaveBeenCalledWith('invalidate_price_observation', {
      p_organization_id: ORG,
      p_observation_id:  'o1',
      p_reason:          'precio mal cargado',
    });
  });

  it('propaga el error de Supabase', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'observation not found' } });
    await expect(invalidatePriceObservation({ organizationId: ORG, observationId: 'o1', reason: 'x' })).rejects.toThrow('observation not found');
  });
});

describe('freezeBudgetPrices', () => {
  beforeEach(() => rpc.mockReset());

  const fullResult = {
    snapshotId: SNP, projectId: PRJ, costDate: '2026-11-02', scope: 'materials_only', mode: 'CURRENT',
    status: 'partial', legacyDivergence: true, incomplete: true,
    itemCount: 12, componentCount: 40, unusableCount: 2, nestedSkippedCount: 1,
    materialsTotal: 1500000.5, unusableAmount: 12500.25, legacyMaterialsTotal: 1498000, divergence: 2000.5,
    legacyTotals: { materials: 1498000, labor: 300000 },
    warnings: ['Hierro: UNIT_MISMATCH', 'TOTALS_DIVERGE_FROM_LEGACY_ENGINE'],
  };

  it('llama a freeze_budget_prices y mapea el jsonb completo', async () => {
    rpc.mockResolvedValue({ data: fullResult, error: null });
    const r = await freezeBudgetPrices(PRJ, ORG, '2026-11-02');

    expect(rpc).toHaveBeenCalledWith('freeze_budget_prices', {
      p_project_id:      PRJ,
      p_organization_id: ORG,
      p_cost_date:       '2026-11-02',
    });
    expect(r).toEqual(fullResult);
  });

  it('status reconciled / pending_reconciliation y banderas se conservan; legacy nulos → null', async () => {
    rpc.mockResolvedValueOnce({ data: { ...fullResult, status: 'reconciled', legacyDivergence: false, incomplete: false }, error: null });
    const ok = await freezeBudgetPrices(PRJ, ORG);
    expect(ok.status).toBe('reconciled');
    expect(ok.legacyDivergence).toBe(false);
    expect(ok.incomplete).toBe(false);
    expect(ok.scope).toBe('materials_only');

    rpc.mockResolvedValueOnce({ data: { ...fullResult, status: 'pending_reconciliation', incomplete: false, unusableAmount: 0, legacyMaterialsTotal: null, divergence: null, legacyTotals: null }, error: null });
    const r = await freezeBudgetPrices(PRJ, ORG);
    expect(r.status).toBe('pending_reconciliation');
    expect(r.legacyDivergence).toBe(true);
    expect(r.unusableAmount).toBe(0);
    expect(r.legacyMaterialsTotal).toBeNull();
    expect(r.divergence).toBeNull();
    expect(r.legacyTotals).toBeNull();
  });

  it('sin costDate manda la fecha de hoy', async () => {
    rpc.mockResolvedValue({ data: { ...fullResult, itemCount: 0, componentCount: 0, unusableCount: 0, warnings: [] }, error: null });
    await freezeBudgetPrices(PRJ, ORG);
    expect((rpc.mock.calls[0][1] as Record<string, string>).p_cost_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('propaga el error de Supabase', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'budget empty' } });
    await expect(freezeBudgetPrices(PRJ, ORG)).rejects.toThrow('budget empty');
  });
});

describe('getFrozenBudgetPrices', () => {
  beforeEach(() => rpc.mockReset());

  const frozenRow = {
    id: 'row-1', snapshot_id: SNP, organization_id: ORG, project_id: PRJ, budget_item_id: BIT,
    master_task_id: 'mt-1', component_id: CMP, master_material_id: MAT, resource_id: null,
    quantity: '15.00000000', unit: 'KG', unit_price: '1234.500000', currency: 'ARS',
    source: 'SUPPLIER_OBSERVED', reference_id: 'obs-9', price_status: 'RELEVADO',
    effective_date: '2026-11-01', supplier_unit_factor: '50.00000000', apu_conversion_factor: '1.00000000', warnings: [], is_usable: true,
    observation_count: 4, resolution: observedResolution,
    resolved_at: '2026-11-02T12:00:00+00:00', created_by: USR,
  };

  it('llama a get_frozen_budget_prices y mapea budget_cost_snapshot_prices completo', async () => {
    rpc.mockResolvedValue({ data: [frozenRow], error: null });
    const rows = await getFrozenBudgetPrices(SNP);

    expect(rpc).toHaveBeenCalledWith('get_frozen_budget_prices', { p_snapshot_id: SNP });
    expect(rows).toEqual([{
      id: 'row-1', snapshotId: SNP, organizationId: ORG, projectId: PRJ, budgetItemId: BIT,
      masterTaskId: 'mt-1', componentId: CMP, masterMaterialId: MAT, resourceId: null,
      quantity: 15, unit: 'KG', unitPrice: 1234.5, currency: 'ARS',
      source: 'SUPPLIER_OBSERVED', referenceId: 'obs-9', priceStatus: 'RELEVADO',
      effectiveDate: '2026-11-01', supplierUnitFactor: 50, apuConversionFactor: 1, warnings: [], isUsable: true,
      observationCount: 4, resolution: observedResolution,
      resolvedAt: '2026-11-02T12:00:00+00:00', createdBy: USR,
    }]);
  });

  it('unit_price NULL (NO_PRICE) → unitPrice null y isUsable false aunque la DB diga true', () => {
    const r = frozenPriceFromRow({
      ...frozenRow, unit_price: null, source: 'NO_PRICE', price_status: 'SIN_PRECIO',
      is_usable: true, warnings: ['FROZEN_PRICE_MISSING'], observation_count: null, resolution: null, created_by: null,
    });
    expect(r.unitPrice).toBeNull();
    expect(r.isUsable).toBe(false);
    expect(r.source).toBe('NO_PRICE');
    expect(r.observationCount).toBeNull();
    expect(r.resolution).toBeNull();
    expect(r.createdBy).toBeNull();
  });

  it('supplier_unit_factor NULL (fuente no observada) → null; apu_conversion_factor se mapea tal cual', () => {
    const r = frozenPriceFromRow({ ...frozenRow, source: 'ORG_MASTER', supplier_unit_factor: null, apu_conversion_factor: '25.00000000' });
    expect(r.supplierUnitFactor).toBeNull();
    expect(r.apuConversionFactor).toBe(25);
  });

  it('is_usable false con precio → isUsable false', () => {
    expect(frozenPriceFromRow({ ...frozenRow, is_usable: false, warnings: ['UNIT_MISMATCH'] }).isUsable).toBe(false);
  });

  it('sin filas → []', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await getFrozenBudgetPrices(SNP)).toEqual([]);
  });

  it('propaga el error de Supabase', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'not a member' } });
    await expect(getFrozenBudgetPrices(SNP)).rejects.toThrow('not a member');
  });
});
