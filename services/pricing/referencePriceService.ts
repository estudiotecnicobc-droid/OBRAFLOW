/**
 * services/pricing/referencePriceService.ts
 * ─────────────────────────────────────────
 * Adaptador TypeScript del motor de precios (RPCs de las migraciones
 * 20261102100001–100009). Mapea snake_case → camelCase acá, nunca en la UI.
 *
 *   · resolveReferencePrice  — resolve_reference_price (CURRENT | AS_OF | FROZEN)
 *   · resolveObservedPrice   — resolve_observed_price (mediana de observaciones)
 *   · freezeBudgetPrices     — freeze_budget_prices (snapshot congelado)
 *   · getFrozenBudgetPrices  — get_frozen_budget_prices (lectura del snapshot)
 */

import { supabase } from '../supabaseClient';
import type {
  FreezeBudgetPricesResult,
  FrozenComponentPrice,
  ObservedPrice,
  PriceSource,
  PriceStatus,
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
  };
}

export function frozenPriceFromRow(row: Row): FrozenComponentPrice {
  return {
    id:               String(row.id),
    snapshotId:       String(row.snapshot_id),
    organizationId:   String(row.organization_id),
    projectId:        String(row.project_id),
    masterTaskId:     String(row.master_task_id),
    componentId:      String(row.component_id),
    masterMaterialId: strOrNull(row.master_material_id),
    resourceId:       strOrNull(row.resource_id),
    quantity:         Number(row.quantity),
    unit:             String(row.unit),
    unitPrice:        Number(row.unit_price),
    currency:         String(row.currency),
    source:           String(row.source) as PriceSource,
    referenceId:      strOrNull(row.reference_id),
    priceStatus:      String(row.price_status) as PriceStatus,
    effectiveDate:    strOrNull(row.effective_date),
    unitFactor:       Number(row.unit_factor ?? 1),
    warnings:         strArray(row.warnings),
    resolvedAt:       String(row.resolved_at),
  };
}

// ── Servicios ─────────────────────────────────────────────────────────────────

/**
 * Resuelve el precio de referencia de un componente / material / recurso.
 * `p_snapshot_id` solo se envía cuando viene informado (parámetro opcional
 * agregado al final de la firma por la migración 100008).
 */
export async function resolveReferencePrice(
  params: ResolveReferencePriceParams,
): Promise<ResolvedReferencePrice> {
  const mode = params.mode ?? 'CURRENT';
  if (mode === 'FROZEN' && !params.snapshotId) {
    throw new Error('resolveReferencePrice: el modo FROZEN requiere snapshotId');
  }

  const args: Record<string, unknown> = {
    p_organization_id:   params.organizationId,
    p_master_material_id: params.masterMaterialId ?? null,
    p_resource_id:        params.resourceId ?? null,
    p_component_id:       params.componentId ?? null,
    p_project_id:         params.projectId ?? null,
    p_effective_date:     params.effectiveDate ?? today(),
    p_mode:               mode,
    p_required_unit:      params.requiredUnit ?? null,
    p_expected_currency:  params.expectedCurrency ?? 'ARS',
  };
  if (params.snapshotId) args.p_snapshot_id = params.snapshotId;

  const { data, error } = await supabase.rpc('resolve_reference_price', args);
  if (error) throw new Error(error.message);

  // Una función que devuelve un tipo compuesto llega como objeto; si el
  // cliente lo envuelve en array tomamos la primera fila.
  const row = Array.isArray(data) ? (data[0] as Row | undefined) : (data as Row | null);
  return resolvedPriceFromRow(row);
}

/**
 * Mediana de observaciones de proveedores para un material de la org.
 * Devuelve null cuando no hay observaciones en la ventana (la RPC no emite fila).
 */
export async function resolveObservedPrice(
  params: ResolveObservedPriceParams,
): Promise<ObservedPrice | null> {
  const { data, error } = await supabase.rpc('resolve_observed_price', {
    p_organization_id:      params.organizationId,
    p_master_material_id:   params.masterMaterialId,
    p_as_of:                params.asOf ?? today(),
    p_region:               params.region ?? 'AMBA',
    p_currency:             params.currency ?? 'ARS',
    p_includes_vat:         params.includesVat ?? false,
    p_commercial_condition: params.commercialCondition ?? 'LISTA',
    p_window_days:          params.windowDays ?? 90,
  });
  if (error) throw new Error(error.message);

  const rows = (Array.isArray(data) ? data : data ? [data] : []) as Row[];
  const first = rows.find(r => r && r.price !== null && r.price !== undefined);
  return first ? observedPriceFromRow(first) : null;
}

/**
 * Crea el snapshot de costos y congela el precio de cada componente.
 * Llama a la RPC freeze_budget_prices (migración 100009).
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
    snapshotId:     String(r.snapshotId ?? r.snapshot_id),
    itemCount:      Number(r.itemCount ?? r.item_count ?? 0),
    componentCount: Number(r.componentCount ?? r.component_count ?? 0),
    unusableCount:  Number(r.unusableCount ?? r.unusable_count ?? 0),
    warnings:       strArray(r.warnings),
  };
}

/**
 * Lee los precios congelados de un snapshot.
 * Llama a la RPC get_frozen_budget_prices (migración 100009).
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
