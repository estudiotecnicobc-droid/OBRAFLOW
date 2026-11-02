/**
 * services/pricing/types.ts
 * ─────────────────────────
 * Tipos TypeScript del motor de precios (contrato tanda 2-nov-2026).
 * Espejo camelCase del tipo SQL `resolved_reference_price`, de la tabla
 * `budget_cost_snapshot_prices` y de los resultados de las RPCs
 * `resolve_observed_price`, `freeze_budget_prices` y `get_frozen_budget_prices`.
 */

export type PriceCurrency = 'ARS' | 'USD';

export type PriceMode = 'CURRENT' | 'AS_OF' | 'FROZEN';

/** Fuentes que puede devolver `resolve_reference_price`, en orden de prioridad. */
export type PriceSource =
  | 'PROJECT_OVERRIDE'
  | 'SUPPLIER_OBSERVED'
  | 'ORG_MASTER'
  | 'GLOBAL_MASTER'
  | 'RESOURCE_SNAPSHOT'
  | 'RESOURCE_BASE'
  | 'LEGACY_FALLBACK'
  | 'FROZEN_SNAPSHOT'
  | 'NO_PRICE';

/** `price_status` del tipo SQL (atributo agregado por la migración 100008). */
export type PriceStatus =
  | 'RELEVADO'
  | 'DESACTUALIZADO'
  | 'CATALOG_UNVERIFIED'
  | 'FROZEN'
  | 'SIN_PRECIO';

/** Indicador de calidad agregado para un APU / presupuesto (capa UI). */
export type ApuPriceQuality = 'RELEVADO' | 'ESTIMADO' | 'DESACTUALIZADO' | 'SIN_PRECIO';

/** Equivalente camelCase de `public.resolved_reference_price`. */
export interface ResolvedReferencePrice {
  price: number | null;
  unit: string | null;
  currency: string | null;
  source: PriceSource;
  warnings: string[];
  effectiveDate: string | null;   // ISO date (YYYY-MM-DD)
  referenceId: string | null;
  isUsable: boolean;
  observationCount: number | null;
  priceStatus: PriceStatus;
}

export interface ResolveReferencePriceParams {
  organizationId: string;
  masterMaterialId?: string | null;
  resourceId?: string | null;
  componentId?: string | null;      // master_task_materials.id
  projectId?: string | null;
  effectiveDate?: string;           // default: hoy
  mode?: PriceMode;                 // default: CURRENT
  requiredUnit?: string | null;
  expectedCurrency?: PriceCurrency; // default: ARS
  snapshotId?: string | null;       // solo FROZEN
}

/** Fila de `resolve_observed_price` (mediana de observaciones de proveedores). */
export interface ObservedPrice {
  price: number;
  unit: string;
  currency: string;
  observationCount: number;
  newestObservedOn: string;
  oldestObservedOn: string;
  observationIds: string[];
  priceStatus: Extract<PriceStatus, 'RELEVADO' | 'DESACTUALIZADO'>;
}

export type CommercialCondition = 'LISTA' | 'CONTADO' | 'MAYORISTA' | 'OTRA';

export interface ResolveObservedPriceParams {
  organizationId: string;
  masterMaterialId: string;
  asOf?: string;                    // default: hoy
  region?: string;                  // default: AMBA
  currency?: PriceCurrency;         // default: ARS
  includesVat?: boolean;            // default: false
  commercialCondition?: CommercialCondition; // default: LISTA
  windowDays?: number;              // default: 90
}

/** Fila de `budget_cost_snapshot_prices` en camelCase. */
export interface FrozenComponentPrice {
  id: string;
  snapshotId: string;
  organizationId: string;
  projectId: string;
  masterTaskId: string;
  componentId: string;
  masterMaterialId: string | null;
  resourceId: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  currency: string;
  source: PriceSource;
  referenceId: string | null;
  priceStatus: PriceStatus;
  effectiveDate: string | null;
  unitFactor: number;
  warnings: string[];
  resolvedAt: string;
}

/** Resultado jsonb de `freeze_budget_prices`. */
export interface FreezeBudgetPricesResult {
  snapshotId: string;
  itemCount: number;
  componentCount: number;
  unusableCount: number;
  warnings: string[];
}

// ── Entrada / salida del cálculo puro de APU ──────────────────────────────────

/** Componente de material de un APU (master_task_materials simplificado). */
export interface ApuPricingComponent {
  componentId: string;              // master_task_materials.id
  masterMaterialId?: string | null;
  resourceId?: string | null;
  materialName: string;
  unit: string;                     // unidad del rendimiento en el APU
  quantity: number;                 // cantidad por unidad de APU
  wastePercent?: number | null;
  conversionFactor?: number | null; // unidad rendimiento → unidad base del recurso
}

export interface ApuComponentCost {
  componentId: string;
  materialName: string;
  quantity: number;
  wastePercent: number;
  conversionFactor: number;
  unitPrice: number | null;         // precio resuelto en la unidad del APU (ya convertido)
  currency: string | null;
  cost: number;                     // aporte al costo unitario, 4 decimales (0 si no usable)
  isUsable: boolean;
  source: PriceSource;
  priceStatus: PriceStatus;
  warnings: string[];
}

export interface ApuPriceTrace {
  componentId: string;
  source: PriceSource;
  referenceId: string | null;
  effectiveDate: string | null;
  priceStatus: PriceStatus;
}

export interface ApuUnitCostResult {
  materialCost: number;             // Σ cost de componentes usables, 2 decimales
  currency: PriceCurrency | null;
  isUsable: boolean;                // true solo si todos los componentes son usables
  priceQuality: ApuPriceQuality;
  components: ApuComponentCost[];
  traceability: ApuPriceTrace[];
  warnings: string[];               // agregados y deduplicados, con prefijo del componente
}
