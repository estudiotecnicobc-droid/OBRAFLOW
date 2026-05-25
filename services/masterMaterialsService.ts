import { supabase } from './supabaseClient';
import { MasterMaterial } from '../types';

const TABLE = 'master_materials';

// Convierte fila snake_case de Supabase → MasterMaterial camelCase
function fromRow(row: Record<string, any>): MasterMaterial {
  return {
    id: row.id,
    organizationId: row.organization_id,
    code: row.code ?? undefined,
    name: row.name,
    description: row.description ?? undefined,
    unit: row.unit,
    unitPrice: Number(row.unit_price),
    currency: row.currency,
    category: row.category ?? undefined,
    supplier: row.supplier ?? undefined,
    commercialFormat: row.commercial_format ?? undefined,
    wastePercent: row.waste_percent != null ? Number(row.waste_percent) : undefined,
    isActive: row.is_active,
    lastPriceUpdate: row.last_price_update ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Unidad comercial y factor de conversión (migration 021)
    // Se leen de forma segura: si las columnas no existen, row.x = undefined → undefined
    commercialUnit:   row.commercial_unit   ?? undefined,
    conversionFactor: row.conversion_factor != null ? Number(row.conversion_factor) : undefined,
    // Trazabilidad de importación (migration 053)
    globalSourceId: row.global_source_id ?? undefined,
    importedAt:     row.imported_at ?? undefined,
    lastSyncedAt:   row.last_synced_at ?? undefined,
    localOverride:  row.local_override ?? false,
    globalSourceUpdatedAtAtImport: row.global_source_updated_at_at_import ?? undefined,
    // Trazabilidad de importación desde resources (migration 054)
    globalResourceId: row.global_resource_id ?? undefined,
    // Datos técnicos opcionales (migration 058)
    technicalYield: row.technical_yield != null ? Number(row.technical_yield) : undefined,
    technicalYieldUnit: row.technical_yield_unit ?? undefined,
    technicalNotes: row.technical_notes ?? undefined,
  };
}

// Convierte MasterMaterial parcial → objeto snake_case para Supabase
// Solo incluye keys presentes para no sobrescribir con undefined
function toRow(m: Partial<MasterMaterial>): Record<string, any> {
  const row: Record<string, any> = {};
  if (m.organizationId !== undefined) row.organization_id = m.organizationId;
  if (m.code !== undefined) row.code = m.code || null;
  if (m.name !== undefined) row.name = m.name;
  if (m.description !== undefined) row.description = m.description || null;
  if (m.unit !== undefined) row.unit = m.unit;
  if (m.unitPrice !== undefined) row.unit_price = m.unitPrice;
  if (m.currency !== undefined) row.currency = m.currency;
  if (m.category !== undefined) row.category = m.category || null;
  if (m.supplier !== undefined) row.supplier = m.supplier || null;
  if (m.commercialFormat !== undefined) row.commercial_format = m.commercialFormat || null;
  if (m.wastePercent !== undefined) row.waste_percent = m.wastePercent;
  if (m.isActive !== undefined) row.is_active = m.isActive;
  // Trazabilidad de importación (migration 053)
  if (m.globalSourceId !== undefined) row.global_source_id = m.globalSourceId || null;
  if (m.importedAt !== undefined) row.imported_at = m.importedAt;
  if (m.lastSyncedAt !== undefined) row.last_synced_at = m.lastSyncedAt;
  if (m.localOverride !== undefined) row.local_override = m.localOverride;
  if (m.globalSourceUpdatedAtAtImport !== undefined) row.global_source_updated_at_at_import = m.globalSourceUpdatedAtAtImport;
  if (m.globalResourceId !== undefined) row.global_resource_id = m.globalResourceId || null;
  if (m.technicalYield !== undefined) row.technical_yield = m.technicalYield ?? null;
  if (m.technicalYieldUnit !== undefined) row.technical_yield_unit = m.technicalYieldUnit || null;
  if (m.technicalNotes !== undefined) row.technical_notes = m.technicalNotes || null;
  return row;
}

export const masterMaterialsService = {
  /** Devuelve todos los materiales activos de la organización + catálogo global, ordenados por nombre */
  async list(organizationId: string): Promise<MasterMaterial[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .or(`organization_id.eq.${organizationId},organization_id.is.null`)
      .eq('is_active', true)
      .order('name');
    if (error) throw new Error(error.message);
    return (data ?? []).map(fromRow);
  },

  /** Crea un nuevo material maestro y devuelve la fila insertada */
  async create(
    m: Omit<MasterMaterial, 'id' | 'createdAt' | 'updatedAt' | 'isActive'>
  ): Promise<MasterMaterial> {
    const { data, error } = await supabase
      .from(TABLE)
      .insert(toRow({ ...m, isActive: true }))
      .select()
      .single();
    if (error) throw new Error(error.message);
    return fromRow(data);
  },

  /** Actualiza campos específicos y devuelve la fila actualizada */
  async update(id: string, updates: Partial<MasterMaterial>): Promise<MasterMaterial> {
    const { data, error } = await supabase
      .from(TABLE)
      .update(toRow(updates))
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return fromRow(data);
  },

  /** Soft delete: marca is_active = false en lugar de borrar físicamente */
  async deactivate(id: string): Promise<void> {
    const { error } = await supabase
      .from(TABLE)
      .update({ is_active: false })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ── Catálogo Global (organization_id IS NULL) — solo master_admin ──────────

  /** Lista todos los materiales del catálogo global (activos e inactivos) */
  async listGlobalAll(): Promise<MasterMaterial[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .is('organization_id', null)
      .order('name');
    if (error) throw new Error(error.message);
    return (data ?? []).map(fromRow);
  },

  /** Crea un material en el catálogo global (organization_id = null) */
  async createGlobal(
    m: Omit<MasterMaterial, 'id' | 'organizationId' | 'createdAt' | 'updatedAt' | 'isActive'>,
  ): Promise<MasterMaterial> {
    const row = toRow({ ...m, isActive: true } as Partial<MasterMaterial>);
    row.organization_id = null;
    const { data, error } = await supabase.from(TABLE).insert(row).select().single();
    if (error) throw new Error(error.message);
    return fromRow(data);
  },

  /** Actualiza un material del catálogo global */
  async updateGlobal(id: string, updates: Partial<Omit<MasterMaterial, 'id' | 'organizationId'>>): Promise<MasterMaterial> {
    const { data, error } = await supabase
      .from(TABLE)
      .update(toRow(updates as Partial<MasterMaterial>))
      .eq('id', id)
      .is('organization_id', null)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return fromRow(data);
  },

  /** Activa o desactiva un material del catálogo global */
  async toggleActiveGlobal(id: string, isActive: boolean): Promise<void> {
    const { error } = await supabase
      .from(TABLE)
      .update({ is_active: isActive })
      .eq('id', id)
      .is('organization_id', null);
    if (error) throw new Error(error.message);
  },

  // ── Importación de catálogo global → organización (migration 053) ──────────

  /** Importa un material del catálogo global a la organización. Lanza error si ya fue importado. */
  async importFromGlobal(globalMaterialId: string, organizationId: string): Promise<MasterMaterial> {
    // Fetch the global material
    const { data: globalData, error: globalError } = await supabase
      .from(TABLE)
      .select('*')
      .eq('id', globalMaterialId)
      .is('organization_id', null)
      .single();
    if (globalError) throw new Error(globalError.message);

    // Dedup check
    const { data: existing } = await supabase
      .from(TABLE)
      .select('id')
      .eq('organization_id', organizationId)
      .eq('global_source_id', globalMaterialId)
      .maybeSingle();
    if (existing) throw new Error('Este material ya fue importado a tu organización.');

    const now = new Date().toISOString();
    const row = {
      organization_id: organizationId,
      code:              globalData.code ?? null,
      name:              globalData.name,
      description:       globalData.description ?? null,
      unit:              globalData.unit,
      unit_price:        globalData.unit_price,
      currency:          globalData.currency,
      category:          globalData.category ?? null,
      supplier:          globalData.supplier ?? null,
      commercial_format: globalData.commercial_format ?? null,
      waste_percent:     globalData.waste_percent ?? null,
      commercial_unit:   globalData.commercial_unit ?? null,
      conversion_factor: globalData.conversion_factor ?? null,
      is_active:         true,
      global_source_id:  globalMaterialId,
      imported_at:       now,
      global_source_updated_at_at_import: globalData.updated_at ?? null,
      local_override:    false,
    };

    const { data, error } = await supabase.from(TABLE).insert(row).select().single();
    if (error) {
      if (error.code === '42703') {
        throw new Error('Ejecutá la migración 053 en Supabase Dashboard antes de usar esta función.');
      }
      throw new Error(error.message);
    }
    return fromRow(data);
  },
};
