/**
 * services/pricing/types.ts
 * ─────────────────────────
 * Tipos TypeScript del motor de precios (firmas finales, tanda 2-nov-2026).
 * Espejo camelCase del tipo SQL `resolved_reference_price`, de la tabla
 * `budget_cost_snapshot_prices` y de los resultados de las RPCs
 * `resolve_observed_price`, `publish_price_observations`,
 * `invalidate_price_observation`, `freeze_budget_prices` y
 * `get_frozen_budget_prices`.
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

/** `price_status` del tipo SQL. */
export type PriceStatus =
  | 'RELEVADO'
  | 'DESACTUALIZADO'
  | 'CATALOG_UNVERIFIED'
  | 'FROZEN'
  | 'SIN_PRECIO';

/** Warnings conocidos del motor (la lista en runtime es abierta: `string[]`). */
export type PriceWarning =
  | 'CATALOG_UNVERIFIED'
  | 'OBSERVATION_STALE'
  | 'FROZEN_PRICE_MISSING'
  | 'RESOLVER_ERROR'
  | 'TOTALS_DIVERGE_FROM_LEGACY_ENGINE'
  | (string & {});

/** Indicador de calidad agregado para un APU / presupuesto (capa UI). */
export type ApuPriceQuality = 'RELEVADO' | 'ESTIMADO' | 'DESACTUALIZADO' | 'SIN_PRECIO';

/** Estado de congelamiento de un precio: ortogonal a su calidad. */
export type FreezeState = 'FROZEN' | 'LIVE';

/** Salida de `describePriceQuality`: estado + calidad del precio original. */
export interface PriceQualityDescription {
  freezeState: FreezeState;
  priceQuality: ApuPriceQuality;
}

/** `reference_pricing_status` de `budget_cost_snapshots` y `status` de `freeze_budget_prices`. */
export type PriceReconciliationStatus = 'reconciled' | 'pending_reconciliation' | 'partial';

// ── resolution (jsonb) ────────────────────────────────────────────────────────

/** Fuente SUPPLIER_OBSERVED: mediana por proveedor. */
export interface ObservedPriceResolution {
  method: 'median_by_supplier';
  window_days: number;
  as_of: string;
  mode: PriceMode;
  filters: {
    region: string;
    currency: string;
    includes_vat: boolean;
    commercial_condition: string;
  };
  observation_ids: string[];
  observation_count: number;
  supplier_count: number;
  newest_observed_on: string | null;
  oldest_observed_on: string | null;
}

/** Resto de fuentes (override, maestros, recurso, legacy, NO_PRICE). */
export interface SingleSourceResolution {
  method: 'single_source';
  source: PriceSource;
  as_of: string;
  mode: PriceMode;
  observed_candidates: number;
}

/**
 * Fuente FROZEN_SNAPSHOT: lectura del precio congelado. Cuando `found` es
 * false solo vienen `snapshot_id`, `project_id`, `budget_item_id` y `found`.
 */
export interface FrozenSnapshotResolution {
  method: 'frozen_snapshot';
  snapshot_id: string;
  project_id: string | null;
  found: boolean;
  budget_item_id: string | null;
  frozen_price_id?: string;
  /** Todas las filas congeladas del componente (varias si está en varios ítems). */
  frozen_price_ids?: string[];
  original_source?: PriceSource;
  original_price_status?: PriceStatus;
  original_resolution?: PriceResolution | null;
  resolved_at?: string;
}

/**
 * Trazabilidad jsonb del motor. Se conserva en snake_case tal como lo emite
 * SQL: es un documento de auditoría, no un objeto de dominio.
 */
export type PriceResolution =
  | ObservedPriceResolution
  | SingleSourceResolution
  | FrozenSnapshotResolution;

// ── resolve_reference_price ───────────────────────────────────────────────────

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
  resolution: PriceResolution | null;
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
  snapshotId?: string | null;       // obligatorio en FROZEN
  /**
   * Desambigua un componente repetido en varios ítems del presupuesto (FROZEN).
   * Sin él, si las filas congeladas difieren en precio/moneda/unidad/fuente la
   * RPC lanza 22023 'FROZEN_AMBIGUOUS_COMPONENT'.
   */
  budgetItemId?: string | null;
}

// ── resolve_observed_price ────────────────────────────────────────────────────

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
  supplierCount: number;
}

/**
 * Condición comercial de una observación. Valor libre en DB; se listan las
 * conocidas para autocompletar sin cerrar el tipo.
 */
export type CommercialCondition = 'LISTA' | 'CONTADO' | 'MAYORISTA' | 'OTRA' | (string & {});

/**
 * `region` y `commercialCondition` son obligatorios: la DB usa 'DESCONOCIDA'
 * como región de las observaciones no curadas y no debe viajar como filtro
 * implícito desde TS.
 */
export interface ResolveObservedPriceParams {
  organizationId: string;
  masterMaterialId: string;
  region: string;
  commercialCondition: CommercialCondition;
  asOf?: string;                    // default: hoy
  currency?: PriceCurrency;         // default: ARS
  includesVat?: boolean;            // default: false
  windowDays?: number;              // default: 90
}

// ── publish / invalidate observaciones ────────────────────────────────────────

export interface PublishPriceObservationsParams {
  organizationId: string;
  observationIds: string[];
  region: string;
  includesVat: boolean;
  commercialCondition: CommercialCondition;
}

export interface InvalidatePriceObservationParams {
  organizationId: string;
  observationId: string;
  reason: string;
}

// ── snapshots congelados ──────────────────────────────────────────────────────

/** Fila de `budget_cost_snapshot_prices` en camelCase. */
export interface FrozenComponentPrice {
  id: string;
  snapshotId: string;
  organizationId: string;
  projectId: string;
  budgetItemId: string;
  masterTaskId: string;
  componentId: string;
  masterMaterialId: string | null;
  resourceId: string | null;
  quantity: number;
  unit: string;
  unitPrice: number | null;         // null solo si source = NO_PRICE
  currency: string;
  source: PriceSource;
  referenceId: string | null;
  priceStatus: PriceStatus;
  effectiveDate: string | null;
  /**
   * `price_observations.unit_factor` de la observación de REFERENCIA
   * (`referenceId`), no de la mediana: cada proveedor puede tener su propio
   * factor comercial→técnico y la homologación ya lo aplicó a su precio
   * normalizado. NULL si la fuente no es SUPPLIER_OBSERVED. Solo evidencia:
   * `unitPrice` ya está en la unidad técnica; nunca reaplicarlo. Para el resto
   * de las observaciones ver `observationIdsOf(resolution)`.
   */
  supplierUnitFactor: number | null;
  /**
   * master_task_materials.conversion_factor del componente. Solo evidencia: el
   * SQL de congelado NO lo aplica al costo (igual que la 057).
   */
  apuConversionFactor: number;
  warnings: string[];
  isUsable: boolean;                // false si la DB lo marca o si unitPrice es null
  observationCount: number | null;
  resolution: PriceResolution | null;
  resolvedAt: string;
  createdBy: string | null;
}

/**
 * Resultado jsonb de `freeze_budget_prices`.
 * `status` prioriza partial (incomplete) > pending_reconciliation
 * (legacyDivergence) > reconciled; las dos banderas viajan además por separado.
 */
export interface FreezeBudgetPricesResult {
  snapshotId: string;
  projectId: string;
  costDate: string;
  scope: 'materials_only';
  mode: PriceMode;
  status: PriceReconciliationStatus;
  legacyDivergence: boolean;
  incomplete: boolean;
  itemCount: number;
  componentCount: number;
  unusableCount: number;
  nestedSkippedCount: number;
  materialsTotal: number;
  unusableAmount: number;
  legacyMaterialsTotal: number | null;
  divergence: number | null;
  legacyTotals: Record<string, unknown> | null;
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
  conversionFactor?: number | null; // evidencia: unidades técnicas por 1 comercial. No afecta costo.
}

export interface ApuComponentCost {
  componentId: string;
  materialName: string;
  quantity: number;
  wastePercent: number;
  conversionFactor: number;         // evidencia, siempre refleja el valor del componente (1 si no venía)
  unitPrice: number | null;         // precio del motor tal cual, en la unidad técnica del componente
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
  observationCount: number | null;
  resolution: PriceResolution | null;
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
