/**
 * services/pricing/referencePriceService.ts
 * ─────────────────────────────────────────
 * Adaptador TypeScript del motor de precios (firmas finales de las RPCs).
 * Mapea snake_case → camelCase acá, nunca en la UI.
 *
 *   · resolveReferencePrice      — resolve_reference_price (CURRENT | AS_OF | FROZEN)
 *   · resolveObservedPrice       — resolve_observed_price (mediana de observaciones)
 *   · publishPriceObservations   — publish_price_observations (curado de observaciones)
 *   · invalidatePriceObservation — invalidate_price_observation
 *   · freezeBudgetPrices         — freeze_budget_prices (snapshot congelado)
 *   · getFrozenBudgetPrices      — get_frozen_budget_prices (lectura del snapshot)
 */

import { supabase } from '../supabaseClient';
import type {
  FreezeBudgetPricesResult,
  FrozenComponentPrice,
  InvalidatePriceObservationParams,
  ObservedPrice,
  PriceMode,
  PriceReconciliationStatus,
  PriceResolution,
  PriceSource,
  PriceStatus,
  PublishPriceObservationsParams,
  ResolvedReferencePrice,
  ResolveObservedPriceParams,
  ResolveReferencePriceParams,
} from './types';

type Row = Record<string, unknown>;

const today = (): string => new Date().toISOString().slice(0, 10);

const numOrNull = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);

const strOrNull = (v: unknown): string | null =>
  v === null || v === undefined ? null : String(v);

const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : [];

/** El jsonb puede llegar como objeto o, en algunos drivers, como string. */
const resolutionOrNull = (v: unknown): PriceResolution | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    try { return JSON.parse(v) as PriceResolution; } catch { return null; }
  }
  return typeof v === 'object' ? (v as PriceResolution) : null;
};

// ── snake_case DB → camelCase TS ──────────────────────────────────────────────

export function resolvedPriceFromRow(row: Row | null | undefined): ResolvedReferencePrice {
  const r = row ?? {};
  const price = numOrNull(r.price);
  const source = (strOrNull(r.source) ?? 'NO_PRICE') as PriceSource;
  const fallbackStatus: PriceStatus = price === null ? 'SIN_PRECIO' : 'RELEVADO';
  return {
    price,
    unit:             strOrNull(r.unit),
    currency:         strOrNull(r.currency),
    source,
    warnings:         strArray(r.warnings),
    effectiveDate:    strOrNull(r.effective_date),
    referenceId:      strOrNull(r.reference_id),
    isUsable:         Boolean(r.is_usable),
    observationCount: numOrNull(r.observation_count),
    priceStatus:      (strOrNull(r.price_status) ?? fallbackStatus) as PriceStatus,
    resolution:       resolutionOrNull(r.resolution),
  };
}

export function observedPriceFromRow(row: Row): ObservedPrice {
  return {
    price:            Number(row.price),
    unit:             String(row.unit),
    currency:         String(row.currency),
    observationCount: Number(row.observation_count ?? 0),
    newestObservedOn: String(row.newest_observed_on),
    oldestObservedOn: String(row.oldest_observed_on),
    observationIds:   strArray(row.observation_ids),
    priceStatus:      row.price_status as ObservedPrice['priceStatus'],
    supplierCount:    Number(row.supplier_count ?? 0),
  };
}

/** `unit_price` NULL (solo source NO_PRICE) fuerza `isUsable = false`. */
export function frozenPriceFromRow(row: Row): FrozenComponentPrice {
  const unitPrice = numOrNull(row.unit_price);
  return {
    id:               String(row.id),
    snapshotId:       String(row.snapshot_id),
    organizationId:   String(row.organization_id),
    projectId:        String(row.project_id),
    budgetItemId:     String(row.budget_item_id),
    masterTaskId:     String(row.master_task_id),
    componentId:      String(row.component_id),
    masterMaterialId: strOrNull(row.master_material_id),
    resourceId:       strOrNull(row.resource_id),
    quantity:         Number(row.quantity),
    unit:             String(row.unit),
    unitPrice,
    currency:         String(row.currency),
    source:           String(row.source) as PriceSource,
    referenceId:      strOrNull(row.reference_id),
    priceStatus:      String(row.price_status) as PriceStatus,
    effectiveDate:    strOrNull(row.effective_date),
    unitFactor:       Number(row.unit_factor ?? 1),
    warnings:         strArray(row.warnings),
    isUsable:         Boolean(row.is_usable) && unitPrice !== null,
    observationCount: numOrNull(row.observation_count),
    resolution:       resolutionOrNull(row.resolution),
    resolvedAt:       String(row.resolved_at),
    createdBy:        strOrNull(row.created_by),
  };
}

// ── Servicios ─────────────────────────────────────────────────────────────────

/**
 * Resuelve el precio de referencia de un componente / material / recurso.
 * Envía siempre los 10 parámetros de la firma final (`p_snapshot_id` en null
 * salvo FROZEN).
 */
export async function resolveReferencePrice(
  params: ResolveReferencePriceParams,
): Promise<ResolvedReferencePrice> {
  const mode = params.mode ?? 'CURRENT';
  if (mode === 'FROZEN' && !params.snapshotId) {
    throw new Error('resolveReferencePrice: el modo FROZEN requiere snapshotId');
  }

  const { data, error } = await supabase.rpc('resolve_reference_price', {
    p_organization_id:    params.organizationId,
    p_master_material_id: params.masterMaterialId ?? null,
    p_resource_id:        params.resourceId ?? null,
    p_component_id:       params.componentId ?? null,
    p_project_id:         params.projectId ?? null,
    p_effective_date:     params.effectiveDate ?? today(),
    p_mode:               mode,
    p_required_unit:      params.requiredUnit ?? null,
    p_expected_currency:  params.expectedCurrency ?? 'ARS',
    p_snapshot_id:        params.snapshotId ?? null,
  });
  if (error) throw new Error(error.message);

  // Una función que devuelve un tipo compuesto llega como objeto; si el
  // cliente lo envuelve en array tomamos la primera fila.
  const row = Array.isArray(data) ? (data[0] as Row | undefined) : (data as Row | null);
  return resolvedPriceFromRow(row);
}

/**
 * Mediana de observaciones de proveedores para un material de la org.
 * `region` y `commercialCondition` son obligatorios (sin default en TS).
 * Devuelve null cuando no hay observaciones en la ventana (la RPC no emite fila).
 */
export async function resolveObservedPrice(
  params: ResolveObservedPriceParams,
): Promise<ObservedPrice | null> {
  if (!params.region) {
    throw new Error('resolveObservedPrice: region es obligatoria');
  }
  if (!params.commercialCondition) {
    throw new Error('resolveObservedPrice: commercialCondition es obligatoria');
  }

  const { data, error } = await supabase.rpc('resolve_observed_price', {
    p_organization_id:      params.organizationId,
    p_master_material_id:   params.masterMaterialId,
    p_as_of:                params.asOf ?? today(),
    p_region:               params.region,
    p_currency:             params.currency ?? 'ARS',
    p_includes_vat:         params.includesVat ?? false,
    p_commercial_condition: params.commercialCondition,
    p_window_days:          params.windowDays ?? 90,
  });
  if (error) throw new Error(error.message);

  const rows = (Array.isArray(data) ? data : data ? [data] : []) as Row[];
  const first = rows.find(r => r && r.price !== null && r.price !== undefined);
  return first ? observedPriceFromRow(first) : null;
}

/**
 * Publica (cura) un lote de observaciones asignándoles región, IVA y condición
 * comercial. Devuelve la cantidad publicada.
 */
export async function publishPriceObservations(
  params: PublishPriceObservationsParams,
): Promise<number> {
  if (params.observationIds.length === 0) return 0;

  const { data, error } = await supabase.rpc('publish_price_observations', {
    p_organization_id:      params.organizationId,
    p_observation_ids:      params.observationIds,
    p_region:               params.region,
    p_includes_vat:         params.includesVat,
    p_commercial_condition: params.commercialCondition,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/** Invalida una observación con motivo. */
export async function invalidatePriceObservation(
  params: InvalidatePriceObservationParams,
): Promise<void> {
  const { error } = await supabase.rpc('invalidate_price_observation', {
    p_organization_id: params.organizationId,
    p_observation_id:  params.observationId,
    p_reason:          params.reason,
  });
  if (error) throw new Error(error.message);
}

/**
 * Crea el snapshot de costos y congela el precio de cada componente.
 * Llama a la RPC freeze_budget_prices.
 */
export async function freezeBudgetPrices(
  projectId: string,
  organizationId: string,
  costDate?: string,
): Promise<FreezeBudgetPricesResult> {
  const { data, error } = await supabase.rpc('freeze_budget_prices', {
    p_project_id:      projectId,
    p_organization_id: organizationId,
    p_cost_date:       costDate ?? today(),
  });
  if (error) throw new Error(error.message);

  const r = (data ?? {}) as Row & { error?: string };
  if (r.error) throw new Error(String(r.error));
  return {
    snapshotId:           String(r.snapshotId),
    projectId:            String(r.projectId ?? projectId),
    costDate:             String(r.costDate ?? costDate ?? today()),
    mode:                 (strOrNull(r.mode) ?? 'CURRENT') as PriceMode,
    status:               (strOrNull(r.status) ?? 'pending_reconciliation') as PriceReconciliationStatus,
    itemCount:            Number(r.itemCount ?? 0),
    componentCount:       Number(r.componentCount ?? 0),
    unusableCount:        Number(r.unusableCount ?? 0),
    nestedSkippedCount:   Number(r.nestedSkippedCount ?? 0),
    materialsTotal:       Number(r.materialsTotal ?? 0),
    legacyMaterialsTotal: numOrNull(r.legacyMaterialsTotal),
    divergence:           numOrNull(r.divergence),
    legacyTotals:         r.legacyTotals && typeof r.legacyTotals === 'object'
                            ? (r.legacyTotals as Record<string, unknown>)
                            : null,
    warnings:             strArray(r.warnings),
  };
}

/**
 * Lee los precios congelados de un snapshot.
 * Llama a la RPC get_frozen_budget_prices.
 */
export async function getFrozenBudgetPrices(
  snapshotId: string,
): Promise<FrozenComponentPrice[]> {
  const { data, error } = await supabase.rpc('get_frozen_budget_prices', {
    p_snapshot_id: snapshotId,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(frozenPriceFromRow);
}
