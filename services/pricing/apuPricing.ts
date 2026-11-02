/**
 * services/pricing/apuPricing.ts
 * ──────────────────────────────
 * Cálculo puro del costo unitario de materiales de un APU a partir de precios
 * ya resueltos por el motor (`resolve_reference_price`). Sin Supabase.
 *
 * Aritmética (idéntica a recursiveCostEngine / masterTaskCostService):
 *   unitPrice = precioResuelto × conversionFactor
 *   cost      = unitPrice × quantity × (1 + wastePercent/100)   → 4 decimales
 *   total     = Σ cost (solo componentes usables)                → 2 decimales
 *
 * Un componente no usable (sin precio, UNIT_MISMATCH, moneda distinta, etc.)
 * aporta 0 y deja el APU marcado como no usable; nunca se mezclan monedas.
 *
 * Convención de factores — DIFERENCIA CON EL SQL DE CONGELADO:
 *   · Acá sí se aplica `conversionFactor` (unidad del rendimiento → unidad base
 *     del recurso) al precio resuelto, igual que recursiveCostEngine y
 *     masterTaskCostService. Es la convención del cálculo de APU en TS.
 *   · `freeze_budget_prices` (migración 100009) NO aplica ese factor: guarda
 *     `apu_conversion_factor` y `supplier_unit_factor` solo como evidencia y
 *     congela `unit_price` ya en la unidad técnica del material (como la 057).
 *   · Por eso este módulo nunca usa `supplierUnitFactor` ni `apuConversionFactor`
 *     de FrozenComponentPrice en la aritmética: un precio congelado se consume
 *     tal cual y el factor no debe aplicarse dos veces.
 *   · Para presupuestos CONGELADOS no se usa buildApuUnitCost: se usa
 *     `buildFrozenBudgetCost` (frozenBudget.ts), que suma directamente las
 *     filas persistidas de budget_cost_snapshot_prices.
 */

import { getConversionFactor } from '../yieldUnitConversion';
import { unitsMatch } from '../unitNormalization';
import type {
  ApuComponentCost,
  ApuPriceQuality,
  ApuPriceTrace,
  ApuPricingComponent,
  ApuUnitCostResult,
  FreezeState,
  PriceCurrency,
  PriceQualityDescription,
  PriceResolution,
  PriceStatus,
  ResolvedReferencePrice,
} from './types';

export const WARN_CURRENCY_MIXED    = 'CURRENCY_MIXED';
export const WARN_PRICE_NOT_RESOLVED = 'PRICE_NOT_RESOLVED';

const round4 = (n: number): number => +n.toFixed(4);
const round2 = (n: number): number => +n.toFixed(2);

export type ResolvedPriceMap =
  | Record<string, ResolvedReferencePrice | undefined>
  | Map<string, ResolvedReferencePrice>;

export interface BuildApuUnitCostOptions {
  /** Moneda esperada del APU. Si se omite, se toma la del primer componente usable. */
  currency?: PriceCurrency;
}

function lookup(resolved: ResolvedPriceMap, id: string): ResolvedReferencePrice | undefined {
  return resolved instanceof Map ? resolved.get(id) : resolved[id];
}

const NOT_RESOLVED: ResolvedReferencePrice = {
  price: null, unit: null, currency: null, source: 'NO_PRICE',
  warnings: [WARN_PRICE_NOT_RESOLVED], effectiveDate: null, referenceId: null,
  isUsable: false, observationCount: null, priceStatus: 'SIN_PRECIO', resolution: null,
};

function resolveFactor(component: ApuPricingComponent, resolvedUnit: string | null): number {
  if (component.conversionFactor && component.conversionFactor > 0) return component.conversionFactor;
  if (!resolvedUnit || unitsMatch(component.unit, resolvedUnit)) return 1;
  return getConversionFactor(component.unit, resolvedUnit);
}

/**
 * Costo unitario de materiales de un APU VIVO con desglose por componente,
 * trazabilidad de la fuente de cada precio y warnings agregados. Aplica
 * `conversionFactor` (convención TS). Para snapshots congelados usar
 * `buildFrozenBudgetCost` (frozenBudget.ts), que no reconstruye nada.
 */
export function buildApuUnitCost(
  components: ApuPricingComponent[],
  resolved: ResolvedPriceMap,
  options: BuildApuUnitCostOptions = {},
): ApuUnitCostResult {
  let currency: PriceCurrency | null = options.currency ?? null;
  const resolvedList: ResolvedReferencePrice[] = [];
  const costs: ApuComponentCost[] = [];
  const traceability: ApuPriceTrace[] = [];
  const warnings = new Set<string>();

  for (const c of components) {
    const r = lookup(resolved, c.componentId) ?? NOT_RESOLVED;
    resolvedList.push(r);
    const compWarnings = [...r.warnings];

    const hasPrice = r.price !== null && r.price > 0;
    let usable = r.isUsable && hasPrice;

    const compCurrency = r.currency ? r.currency.trim().toUpperCase() : null;
    if (usable && compCurrency) {
      if (currency === null) currency = compCurrency as PriceCurrency;
      else if (compCurrency !== currency) {
        usable = false;
        compWarnings.push(WARN_CURRENCY_MIXED);
      }
    }

    const factor = resolveFactor(c, r.unit);
    const wastePercent = c.wastePercent ?? 0;
    const unitPrice = hasPrice ? round4((r.price as number) * factor) : null;
    const cost = usable && unitPrice !== null
      ? round4(unitPrice * c.quantity * (1 + wastePercent / 100))
      : 0;

    costs.push({
      componentId: c.componentId,
      materialName: c.materialName,
      quantity: c.quantity,
      wastePercent,
      conversionFactor: factor,
      unitPrice,
      currency: compCurrency,
      cost,
      isUsable: usable,
      source: r.source,
      priceStatus: usable ? r.priceStatus : (hasPrice ? r.priceStatus : 'SIN_PRECIO'),
      warnings: compWarnings,
    });

    traceability.push({
      componentId: c.componentId,
      source: r.source,
      referenceId: r.referenceId,
      effectiveDate: r.effectiveDate,
      priceStatus: r.priceStatus,
      observationCount: r.observationCount,
      resolution: r.resolution,
    });

    for (const w of compWarnings) warnings.add(`${c.materialName}: ${w}`);
  }

  const isUsable = costs.length > 0 && costs.every(k => k.isUsable);
  const materialCost = round2(costs.reduce((acc, k) => acc + (k.isUsable ? k.cost : 0), 0));

  return {
    materialCost,
    currency,
    isUsable,
    priceQuality: isUsable ? summarizePriceStatus(resolvedList) : 'SIN_PRECIO',
    components: costs,
    traceability,
    warnings: [...warnings],
  };
}

/**
 * IDs de las observaciones que participaron en la mediana (fuente
 * SUPPLIER_OBSERVED, o la resolution original de un precio congelado). Permite
 * trazar al resto de los proveedores: `referenceId` / `supplierUnitFactor`
 * apuntan solo a la observación de referencia.
 */
export function observationIdsOf(resolution: PriceResolution | null | undefined): string[] {
  if (!resolution) return [];
  if (resolution.method === 'median_by_supplier') return [...resolution.observation_ids];
  if (resolution.method === 'frozen_snapshot') return observationIdsOf(resolution.original_resolution ?? null);
  return [];
}

function qualityFromStatus(status: PriceStatus | null | undefined): ApuPriceQuality {
  switch (status) {
    case 'RELEVADO':           return 'RELEVADO';
    case 'DESACTUALIZADO':     return 'DESACTUALIZADO';
    case 'SIN_PRECIO':         return 'SIN_PRECIO';
    case 'CATALOG_UNVERIFIED': return 'ESTIMADO';
    default:                   return 'ESTIMADO'; // estado desconocido o FROZEN sin original
  }
}

/**
 * Separa dos conceptos que el motor devuelve mezclados en `priceStatus`:
 *   · freezeState  — FROZEN si el precio salió de un snapshot (source
 *                    FROZEN_SNAPSHOT / priceStatus FROZEN), LIVE en otro caso.
 *   · priceQuality — calidad del precio ORIGINAL. Para un precio congelado se
 *                    toma `resolution.original_price_status`; congelar no mejora
 *                    la calidad: un catálogo no verificado congelado sigue
 *                    siendo ESTIMADO. Si falta la resolution original → ESTIMADO.
 * Un precio no usable o sin precio es SIN_PRECIO en cualquier estado.
 */
export function describePriceQuality(r: ResolvedReferencePrice): PriceQualityDescription {
  const frozen = r.source === 'FROZEN_SNAPSHOT' || r.priceStatus === 'FROZEN';
  const freezeState: FreezeState = frozen ? 'FROZEN' : 'LIVE';

  if (!r.isUsable || r.price === null || r.priceStatus === 'SIN_PRECIO') {
    return { freezeState, priceQuality: 'SIN_PRECIO' };
  }
  if (!frozen) return { freezeState, priceQuality: qualityFromStatus(r.priceStatus) };

  const original = r.resolution?.method === 'frozen_snapshot'
    ? r.resolution.original_price_status
    : undefined;
  return { freezeState, priceQuality: qualityFromStatus(original) };
}

const QUALITY_RANK: Record<ApuPriceQuality, number> = {
  RELEVADO: 0, ESTIMADO: 1, DESACTUALIZADO: 2, SIN_PRECIO: 3,
};

/**
 * Indicador de calidad agregado para un conjunto de precios resueltos.
 * Prioridad (peor gana): SIN_PRECIO > DESACTUALIZADO > ESTIMADO > RELEVADO.
 * Usa `describePriceQuality`: FROZEN no es una calidad, es un estado; la
 * calidad de un precio congelado es la de su precio original.
 */
export function summarizePriceStatus(resolved: ResolvedReferencePrice[]): ApuPriceQuality {
  if (resolved.length === 0) return 'SIN_PRECIO';
  let worst: ApuPriceQuality = 'RELEVADO';
  for (const r of resolved) {
    const { priceQuality } = describePriceQuality(r);
    if (QUALITY_RANK[priceQuality] > QUALITY_RANK[worst]) worst = priceQuality;
    if (worst === 'SIN_PRECIO') break;
  }
  return worst;
}
