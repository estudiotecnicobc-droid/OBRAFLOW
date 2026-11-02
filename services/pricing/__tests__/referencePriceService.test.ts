import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('../../supabaseClient', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import {
  resolveReferencePrice,
  resolveObservedPrice,
  freezeBudgetPrices,
  getFrozenBudgetPrices,
} from '../referencePriceService';

const ORG = '11111111-1111-1111-1111-111111111111';
const MAT = '22222222-2222-2222-2222-222222222222';
const CMP = '33333333-3333-3333-3333-333333333333';
const PRJ = '44444444-4444-4444-4444-444444444444';
const SNP = '55555555-5555-5555-5555-555555555555';

const resolvedRow = {
  price: '1234.500000', unit: 'KG', currency: 'ARS', source: 'SUPPLIER_OBSERVED',
  warnings: [], effective_date: '2026-11-01', reference_id: 'obs-9', is_usable: true,
  observation_count: 4, price_status: 'RELEVADO',
};

describe('resolveReferencePrice', () => {
  beforeEach(() => rpc.mockReset());

  it('llama a resolve_reference_price con los p_* del contrato y mapea a camelCase', async () => {
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
    });
    expect(r).toEqual({
      price: 1234.5, unit: 'KG', currency: 'ARS', source: 'SUPPLIER_OBSERVED', warnings: [],
      effectiveDate: '2026-11-01', referenceId: 'obs-9', isUsable: true,
      observationCount: 4, priceStatus: 'RELEVADO',
    });
  });

  it('defaults: CURRENT, hoy, ARS, nulls; no envía p_snapshot_id si no hay snapshot', async () => {
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
    expect(args).not.toHaveProperty('p_snapshot_id');
  });

  it('FROZEN envía p_snapshot_id y mapea FROZEN_SNAPSHOT', async () => {
    rpc.mockResolvedValue({ data: { ...resolvedRow, source: 'FROZEN_SNAPSHOT', price_status: 'FROZEN', observation_count: null }, error: null });
    const r = await resolveReferencePrice({ organizationId: ORG, componentId: CMP, mode: 'FROZEN', snapshotId: SNP });

    expect(rpc.mock.calls[0][1]).toMatchObject({ p_mode: 'FROZEN', p_snapshot_id: SNP, p_component_id: CMP });
    expect(r.source).toBe('FROZEN_SNAPSHOT');
    expect(r.priceStatus).toBe('FROZEN');
    expect(r.observationCount).toBeNull();
  });

  it('FROZEN sin snapshotId falla antes de llamar a Supabase', async () => {
    await expect(resolveReferencePrice({ organizationId: ORG, componentId: CMP, mode: 'FROZEN' })).rejects.toThrow(/snapshotId/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('fila sin precio → SIN_PRECIO, NO_PRICE y warnings conservados', async () => {
    rpc.mockResolvedValue({
      data: { price: null, unit: null, currency: null, source: 'NO_PRICE', warnings: ['PRICE_NOT_FOUND'], effective_date: null, reference_id: null, is_usable: false, observation_count: null, price_status: 'SIN_PRECIO' },
      error: null,
    });
    const r = await resolveReferencePrice({ organizationId: ORG, masterMaterialId: MAT });
    expect(r.price).toBeNull();
    expect(r.isUsable).toBe(false);
    expect(r.priceStatus).toBe('SIN_PRECIO');
    expect(r.warnings).toEqual(['PRICE_NOT_FOUND']);
  });

  it('acepta la fila envuelta en array', async () => {
    rpc.mockResolvedValue({ data: [resolvedRow], error: null });
    const r = await resolveReferencePrice({ organizationId: ORG, masterMaterialId: MAT });
    expect(r.price).toBe(1234.5);
  });

  it('propaga el mensaje de error de Supabase', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'FROZEN mode not implemented', code: '0A000' } });
    await expect(resolveReferencePrice({ organizationId: ORG, masterMaterialId: MAT })).rejects.toThrow('FROZEN mode not implemented');
  });
});

describe('resolveObservedPrice', () => {
  beforeEach(() => rpc.mockReset());

  it('llama a resolve_observed_price con defaults del contrato y mapea la fila', async () => {
    rpc.mockResolvedValue({
      data: [{ price: '980.25', unit: 'KG', currency: 'ARS', observation_count: 5, newest_observed_on: '2026-10-30', oldest_observed_on: '2026-09-15', observation_ids: ['o1', 'o2'], price_status: 'RELEVADO' }],
      error: null,
    });
    const r = await resolveObservedPrice({ organizationId: ORG, masterMaterialId: MAT, asOf: '2026-11-02' });

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
      observationIds: ['o1', 'o2'], priceStatus: 'RELEVADO',
    });
  });

  it('pasa parámetros explícitos (región, moneda, IVA, condición, ventana)', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await resolveObservedPrice({
      organizationId: ORG, masterMaterialId: MAT, region: 'CORDOBA', currency: 'USD',
      includesVat: true, commercialCondition: 'CONTADO', windowDays: 30,
    });
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_region: 'CORDOBA', p_currency: 'USD', p_includes_vat: true, p_commercial_condition: 'CONTADO', p_window_days: 30,
    });
  });

  it('sin observaciones → null', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await resolveObservedPrice({ organizationId: ORG, masterMaterialId: MAT })).toBeNull();
  });

  it('propaga el error de Supabase', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    await expect(resolveObservedPrice({ organizationId: ORG, masterMaterialId: MAT })).rejects.toThrow('permission denied');
  });
});

describe('freezeBudgetPrices', () => {
  beforeEach(() => rpc.mockReset());

  it('llama a freeze_budget_prices y mapea el jsonb', async () => {
    rpc.mockResolvedValue({
      data: { snapshotId: SNP, itemCount: 12, componentCount: 40, unusableCount: 2, warnings: ['Hierro: UNIT_MISMATCH'] },
      error: null,
    });
    const r = await freezeBudgetPrices(PRJ, ORG, '2026-11-02');

    expect(rpc).toHaveBeenCalledWith('freeze_budget_prices', {
      p_project_id:      PRJ,
      p_organization_id: ORG,
      p_cost_date:       '2026-11-02',
    });
    expect(r).toEqual({ snapshotId: SNP, itemCount: 12, componentCount: 40, unusableCount: 2, warnings: ['Hierro: UNIT_MISMATCH'] });
  });

  it('sin costDate manda la fecha de hoy', async () => {
    rpc.mockResolvedValue({ data: { snapshotId: SNP, itemCount: 0, componentCount: 0, unusableCount: 0, warnings: [] }, error: null });
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

  it('llama a get_frozen_budget_prices y mapea budget_cost_snapshot_prices', async () => {
    rpc.mockResolvedValue({
      data: [{
        id: 'row-1', snapshot_id: SNP, organization_id: ORG, project_id: PRJ,
        master_task_id: 'mt-1', component_id: CMP, master_material_id: MAT, resource_id: null,
        quantity: '15.00000000', unit: 'KG', unit_price: '1234.500000', currency: 'ARS',
        source: 'SUPPLIER_OBSERVED', reference_id: 'obs-9', price_status: 'RELEVADO',
        effective_date: '2026-11-01', unit_factor: '1.00000000', warnings: [],
        resolved_at: '2026-11-02T12:00:00+00:00',
      }],
      error: null,
    });
    const rows = await getFrozenBudgetPrices(SNP);

    expect(rpc).toHaveBeenCalledWith('get_frozen_budget_prices', { p_snapshot_id: SNP });
    expect(rows).toEqual([{
      id: 'row-1', snapshotId: SNP, organizationId: ORG, projectId: PRJ,
      masterTaskId: 'mt-1', componentId: CMP, masterMaterialId: MAT, resourceId: null,
      quantity: 15, unit: 'KG', unitPrice: 1234.5, currency: 'ARS',
      source: 'SUPPLIER_OBSERVED', referenceId: 'obs-9', priceStatus: 'RELEVADO',
      effectiveDate: '2026-11-01', unitFactor: 1, warnings: [],
      resolvedAt: '2026-11-02T12:00:00+00:00',
    }]);
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
