import { supabase } from './supabaseClient';
import { applyCommercialRules } from './commercialRulesService';

export type ImportMode    = 'full' | 'category' | 'selection' | 'prices_only';
export type PriceStrategy = 'missing_only' | 'zero_only' | 'overwrite_all' | 'skip_prices';

export interface ImportCatalogParams {
  organizationId:   string;
  mode:             ImportMode;
  categories?:      string[];
  masterTaskCodes?: string[];
  resourceCodes?:   string[];
  priceStrategy:    PriceStrategy;
}

export interface ImportCatalogResult {
  mode:             ImportMode;
  priceStrategy:    PriceStrategy;
  tasksCreated:     number;
  tasksSkipped:     number;
  resourcesCreated: number;
  resourcesUpdated: number;
  resourcesSkipped: number;
}

export async function importGlobalCatalogToOrg(
  p: ImportCatalogParams,
): Promise<ImportCatalogResult> {
  const { data, error } = await supabase.rpc('import_global_catalog_to_org', {
    p_organization_id:   p.organizationId,
    p_mode:              p.mode,
    p_categories:        p.categories      ?? null,
    p_master_task_codes: p.masterTaskCodes ?? null,
    p_resource_codes:    p.resourceCodes   ?? null,
    p_price_strategy:    p.priceStrategy,
  });
  if (error) throw new Error(error.message);

  // Tras importar recursos globales, normalizar unidades comerciales.
  // apply_commercial_rules es idempotente; si ya están seteadas, no hace nada.
  await applyCommercialRules(p.organizationId).catch(e =>
    console.warn('[importGlobalCatalog] apply_commercial_rules falló (no crítico):', e.message),
  );

  return {
    mode:             data.mode,
    priceStrategy:    data.price_strategy,
    tasksCreated:     data.tasks_created,
    tasksSkipped:     data.tasks_skipped,
    resourcesCreated: data.resources_created,
    resourcesUpdated: data.resources_updated,
    resourcesSkipped: data.resources_skipped,
  };
}
