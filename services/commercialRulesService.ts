/**
 * commercialRulesService
 *
 * Thin wrapper sobre las RPCs de Supabase que gestionan unidades comerciales
 * y factores de conversión para materiales.
 *
 * Funciones SQL subyacentes (migration 022):
 *   · apply_commercial_rules(p_org_id)    — asigna commercial_unit/conversion_factor
 *   · seed_extended_materials(p_org_id)   — siembra materiales base con esos campos
 *
 * Cuándo llamar applyCommercialRules:
 *   · Después de importar catálogo global   (catalogImportService)
 *   · Desde DataAdmin > botón "Normalizar materiales"
 *   · Programáticamente tras crear una org  (ya cubierto por trigger DB)
 */

import { supabase } from './supabaseClient';

export interface CommercialRulesResult {
  masterMaterialsUpdated: number;
  materialsUpdated: number;
  totalUpdated: number;
}

export interface SeedMaterialsResult {
  inserted: number;
  updated: number;
  total: number;
}

/**
 * Aplica reglas de conversión comercial (commercial_unit + conversion_factor)
 * a todos los materiales de la organización cuyas columnas estén en NULL.
 * Idempotente — seguro de llamar múltiples veces.
 */
export async function applyCommercialRules(
  organizationId: string,
): Promise<CommercialRulesResult> {
  const { data, error } = await supabase.rpc('apply_commercial_rules', {
    p_org_id: organizationId,
  });
  if (error) throw new Error(`[applyCommercialRules] ${error.message}`);
  return {
    masterMaterialsUpdated: data.master_materials_updated ?? 0,
    materialsUpdated:       data.materials_updated        ?? 0,
    totalUpdated:           data.total_updated            ?? 0,
  };
}

/**
 * Siembra los materiales extendidos del catálogo base (≈38 entradas)
 * y aplica reglas comerciales sobre el resultado.
 * Idempotente — actualiza precio si el material ya existe, no duplica.
 */
export async function seedAndNormalizeMaterials(
  organizationId: string,
): Promise<{ seed: SeedMaterialsResult; rules: CommercialRulesResult }> {
  const { data: seedData, error: seedError } = await supabase.rpc(
    'seed_extended_materials',
    { p_org_id: organizationId },
  );
  if (seedError) throw new Error(`[seedExtendedMaterials] ${seedError.message}`);

  const rules = await applyCommercialRules(organizationId);

  return {
    seed: {
      inserted: seedData.inserted ?? 0,
      updated:  seedData.updated  ?? 0,
      total:    seedData.total    ?? 0,
    },
    rules,
  };
}
