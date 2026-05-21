import { supabase } from './supabaseClient';
import { Resource, Material, LaborCategory, Tool } from '../types';
import { resourcesService } from './resourcesService';
import { materialsService } from './materialsService';
import { laborCategoriesService } from './laborCategoriesService';
import { toolsService } from './toolsService';
import { generateId } from '../utils/generateId';

export type ResourcePriceStrategy = 'missing_only' | 'zero_only' | 'overwrite_all' | 'skip_prices';

export interface ImportGlobalResourcesResult {
  materialsCreated:  number;
  laborCreated:      number;
  equipmentCreated:  number;
  pricesUpdated:     number;
  skipped:           number;
}

// ─── Helpers de normalización ─────────────────────────────────────────────────

const key = (s: string) => s.trim().toLowerCase();

// ─── Implementación ───────────────────────────────────────────────────────────

export async function importGlobalResourcesToOrg(
  organizationId: string,
  priceStrategy: ResourcePriceStrategy = 'missing_only',
): Promise<ImportGlobalResourcesResult> {

  // Cargar en paralelo: recursos globales + catálogos existentes de la org
  const [globals, existingMaterials, existingLabor, existingTools] = await Promise.all([
    resourcesService.listGlobal(),
    materialsService.listForOrg(organizationId),
    laborCategoriesService.listForOrg(organizationId),
    toolsService.listForOrg(organizationId),
  ]);

  // Índices de búsqueda rápida por nombre normalizado
  const matIndex = new Map(existingMaterials.map(m => [key(m.name), m]));
  const labIndex = new Map(existingLabor.map(l => [key(l.role), l]));
  const toolIndex = new Map(existingTools.map(t => [key(t.name), t]));

  let materialsCreated = 0;
  let laborCreated     = 0;
  let equipmentCreated = 0;
  let pricesUpdated    = 0;
  let skipped          = 0;

  const matInserts:  Omit<Material, never>[]       = [];
  const labInserts:  Omit<LaborCategory, never>[]  = [];
  const toolInserts: Omit<Tool, never>[]            = [];
  const matUpdates:  { id: string; cost: number }[] = [];
  const labUpdates:  { id: string; basicHourlyRate: number; socialChargesPercent: number }[] = [];
  const toolUpdates: { id: string; costPerHour: number }[] = [];

  for (const r of globals) {
    if (r.type === 'MATERIAL') {
      const existing = matIndex.get(key(r.name));
      if (!existing) {
        matInserts.push({
          id:             generateId(),
          organizationId,
          code:           r.code,
          name:           r.name,
          unit:           r.unit,
          cost:           priceStrategy === 'skip_prices' ? 0 : r.baseCost,
          category:       r.categoryName,
        } as Material);
        materialsCreated++;
      } else {
        const shouldUpdate =
          priceStrategy === 'overwrite_all' ||
          (priceStrategy === 'zero_only' && existing.cost === 0);
        if (shouldUpdate) {
          matUpdates.push({ id: existing.id, cost: r.baseCost });
          pricesUpdated++;
        } else {
          skipped++;
        }
      }

    } else if (r.type === 'LABOR') {
      const existing = labIndex.get(key(r.name));
      if (!existing) {
        labInserts.push({
          id:                   generateId(),
          organizationId,
          code:                 r.code,
          role:                 r.name,
          basicHourlyRate:      priceStrategy === 'skip_prices' ? 0 : r.baseCost,
          socialChargesPercent: r.socialChargesPct ?? 0,
          insurancePercent:     0,
        } as LaborCategory);
        laborCreated++;
      } else {
        const shouldUpdate =
          priceStrategy === 'overwrite_all' ||
          (priceStrategy === 'zero_only' && existing.basicHourlyRate === 0);
        if (shouldUpdate) {
          labUpdates.push({
            id: existing.id,
            basicHourlyRate: r.baseCost,
            socialChargesPercent: r.socialChargesPct ?? existing.socialChargesPercent,
          });
          pricesUpdated++;
        } else {
          skipped++;
        }
      }

    } else if (r.type === 'EQUIPMENT') {
      const existing = toolIndex.get(key(r.name));
      if (!existing) {
        toolInserts.push({
          id:             generateId(),
          organizationId,
          code:           r.code,
          name:           r.name,
          category:       r.categoryName ?? '',
          costPerHour:    priceStrategy === 'skip_prices' ? 0 : r.baseCost,
        } as Tool);
        equipmentCreated++;
      } else {
        const shouldUpdate =
          priceStrategy === 'overwrite_all' ||
          (priceStrategy === 'zero_only' && existing.costPerHour === 0);
        if (shouldUpdate) {
          toolUpdates.push({ id: existing.id, costPerHour: r.baseCost });
          pricesUpdated++;
        } else {
          skipped++;
        }
      }
    }
    // SUBCONTRACT se ignora
  }

  // ─── Writes ────────────────────────────────────────────────────────────────

  if (matInserts.length > 0) {
    const rows = matInserts.map(m => ({
      id: m.id, organization_id: organizationId, code: m.code ?? null,
      name: m.name, unit: m.unit, cost: m.cost, category: m.category ?? null,
    }));
    const { error } = await supabase.from('materials').insert(rows);
    if (error) throw new Error(`[importGlobalResources] materials insert: ${error.message}`);
  }

  if (labInserts.length > 0) {
    const rows = labInserts.map(l => ({
      id: l.id, organization_id: organizationId, code: l.code ?? null,
      role: l.role, basic_hourly_rate: l.basicHourlyRate,
      social_charges_percent: l.socialChargesPercent, insurance_percent: 0,
    }));
    const { error } = await supabase.from('labor_categories').insert(rows);
    if (error) throw new Error(`[importGlobalResources] labor_categories insert: ${error.message}`);
  }

  if (toolInserts.length > 0) {
    const rows = toolInserts.map(t => ({
      id: t.id, organization_id: organizationId, code: t.code ?? null,
      name: t.name, category: t.category, cost_per_hour: t.costPerHour,
    }));
    const { error } = await supabase.from('tools').insert(rows);
    if (error) throw new Error(`[importGlobalResources] tools insert: ${error.message}`);
  }

  // Actualizaciones de precio (fire secuencial — pocas filas)
  for (const u of matUpdates) {
    await materialsService.update(u.id, { cost: u.cost });
  }
  for (const u of labUpdates) {
    await laborCategoriesService.update(u.id, {
      basicHourlyRate: u.basicHourlyRate,
      socialChargesPercent: u.socialChargesPercent,
    });
  }
  for (const u of toolUpdates) {
    await toolsService.update(u.id, { costPerHour: u.costPerHour });
  }

  return { materialsCreated, laborCreated, equipmentCreated, pricesUpdated, skipped };
}

// ─── Importación de Recursos Globales → master_materials(orgId) ───────────────
// Complementa importGlobalResourcesToOrg: también deja los materiales disponibles
// para APUs legacy que leen de master_materials.

export interface ImportToCompanyCatalogResult extends ImportGlobalResourcesResult {
  masterMaterialsCreated: number;
  masterMaterialsUpdated: number;
}

async function importMaterialResourcesToMasterCatalog(
  organizationId: string,
  priceStrategy: ResourcePriceStrategy,
): Promise<{ created: number; updated: number }> {
  const globals = await resourcesService.listGlobal();
  const materialResources = globals.filter(r => r.type === 'MATERIAL');

  // Cargar master_materials existentes para la org
  const { data: existingMM, error: mmError } = await supabase
    .from('master_materials')
    .select('id, name, global_resource_id, unit_price')
    .eq('organization_id', organizationId)
    .eq('is_active', true);

  if (mmError) {
    if (mmError.code === '42703') {
      throw new Error('Ejecutá la migración 054 en Supabase Dashboard antes de importar al Catálogo de Empresa.');
    }
    throw new Error(`[importMaterialResources] read master_materials: ${mmError.message}`);
  }

  // Índice por global_resource_id (para dedup por UUID)
  const existingByResourceId = new Map(
    (existingMM ?? [])
      .filter(m => m.global_resource_id)
      .map(m => [m.global_resource_id as string, m]),
  );
  // Índice por nombre normalizado (evita duplicado con materiales manuales)
  const existingNameSet = new Set((existingMM ?? []).map(m => key(m.name)));

  const now = new Date().toISOString();
  const inserts: Record<string, any>[] = [];
  let created = 0;
  let updated = 0;

  for (const r of materialResources) {
    const existingById = existingByResourceId.get(r.id);
    if (existingById) {
      // Ya importado antes: actualizar precio según estrategia
      const shouldUpdate =
        priceStrategy === 'overwrite_all' ||
        (priceStrategy === 'zero_only' && Number(existingById.unit_price) === 0);
      if (shouldUpdate && priceStrategy !== 'skip_prices') {
        await supabase
          .from('master_materials')
          .update({ unit_price: r.baseCost, last_synced_at: now })
          .eq('id', existingById.id);
        updated++;
      }
    } else if (!existingNameSet.has(key(r.name))) {
      // No existe por UUID ni por nombre: insertar nuevo
      inserts.push({
        organization_id:    organizationId,
        code:               r.code ?? null,
        name:               r.name,
        unit:               r.unit,
        unit_price:         priceStrategy === 'skip_prices' ? 0 : r.baseCost,
        currency:           'ARS',
        category:           r.categoryName ?? null,
        is_active:          true,
        global_resource_id: r.id,
        imported_at:        now,
        last_synced_at:     now,
        local_override:     false,
      });
      created++;
    }
    // Si ya existe por nombre (manual) pero no por UUID → se omite para no duplicar
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from('master_materials').insert(inserts);
    if (error) {
      if (error.code === '42703') {
        throw new Error('Ejecutá la migración 054 en Supabase Dashboard antes de importar al Catálogo de Empresa.');
      }
      throw new Error(`[importMaterialResources] master_materials insert: ${error.message}`);
    }
  }

  return { created, updated };
}

/**
 * Importa Recursos Globales al Catálogo de Empresa cubriendo ambos destinos:
 * 1. materials / labor_categories / tools  (para presupuesto y cómputo)
 * 2. master_materials(orgId)              (para APUs legacy)
 */
export async function importResourcesToCompanyCatalog(
  organizationId: string,
  priceStrategy: ResourcePriceStrategy = 'missing_only',
): Promise<ImportToCompanyCatalogResult> {
  const [baseResult, mmResult] = await Promise.all([
    importGlobalResourcesToOrg(organizationId, priceStrategy),
    importMaterialResourcesToMasterCatalog(organizationId, priceStrategy),
  ]);
  return {
    ...baseResult,
    masterMaterialsCreated: mmResult.created,
    masterMaterialsUpdated: mmResult.updated,
  };
}
