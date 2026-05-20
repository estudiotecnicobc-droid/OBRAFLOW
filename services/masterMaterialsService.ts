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
};
