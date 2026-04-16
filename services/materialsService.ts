import { supabase } from './supabaseClient';
import { Material } from '../types';

// ─── Mappers ──────────────────────────────────────────────────────────────────

function materialFromRow(row: Record<string, any>): Material {
  return {
    id:               row.id,
    organizationId:   row.organization_id,
    code:             row.code ?? undefined,
    name:             row.name,
    unit:             row.unit ?? '',
    cost:             row.cost ?? 0,
    category:         row.category ?? undefined,
    minStock:         row.min_stock ?? undefined,
    provider:         row.provider ?? undefined,
    family:           row.family ?? undefined,
    description:      row.description ?? undefined,
    commercialFormat: row.commercial_format ?? undefined,
    wastePercent:     row.waste_percent ?? undefined,
    // Unidad comercial y factor de conversión (migration 021)
    // Se leen de forma segura: si las columnas no existen, row.x = undefined → undefined
    commercialUnit:   row.commercial_unit   ?? undefined,
    conversionFactor: row.conversion_factor != null ? Number(row.conversion_factor) : undefined,
  };
}

function materialToRow(m: Material): Record<string, any> {
  return {
    id:               m.id,
    organization_id:  m.organizationId,
    code:             m.code ?? null,
    name:             m.name,
    unit:             m.unit,
    cost:             m.cost,
    category:         m.category ?? null,
    min_stock:        m.minStock ?? null,
    provider:         m.provider ?? null,
    family:           m.family ?? null,
    description:      m.description ?? null,
    commercial_format: m.commercialFormat ?? null,
    waste_percent:    m.wastePercent ?? null,
  };
}

function buildUpdateRow(updates: Partial<Material>): Record<string, any> {
  const row: Record<string, any> = {};
  if (updates.code             !== undefined) row.code              = updates.code ?? null;
  if (updates.name             !== undefined) row.name              = updates.name;
  if (updates.unit             !== undefined) row.unit              = updates.unit;
  if (updates.cost             !== undefined) row.cost              = updates.cost;
  if (updates.category         !== undefined) row.category          = updates.category;
  if (updates.minStock         !== undefined) row.min_stock         = updates.minStock;
  if (updates.provider         !== undefined) row.provider          = updates.provider;
  if (updates.family           !== undefined) row.family            = updates.family;
  if (updates.description      !== undefined) row.description       = updates.description;
  if (updates.commercialFormat !== undefined) row.commercial_format = updates.commercialFormat;
  if (updates.wastePercent     !== undefined) row.waste_percent     = updates.wastePercent;
  return row;
}

// ─── Servicio ─────────────────────────────────────────────────────────────────

export const materialsService = {

  async listForOrg(organizationId: string): Promise<Material[]> {
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .eq('organization_id', organizationId)
      .order('name', { ascending: true });
    if (error) { console.error('[materialsService.list]', error.message); return []; }
    return (data ?? []).map(materialFromRow);
  },

  async create(m: Material): Promise<void> {
    const { error } = await supabase.from('materials').insert(materialToRow(m));
    if (error) throw new Error(`[materialsService.create] ${error.message}`);
  },

  async update(id: string, updates: Partial<Material>): Promise<void> {
    const row = buildUpdateRow(updates);
    if (Object.keys(row).length === 0) return;
    const { error } = await supabase.from('materials').update(row).eq('id', id);
    if (error) throw new Error(`[materialsService.update] ${error.message}`);
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('materials').delete().eq('id', id);
    if (error) throw new Error(`[materialsService.remove] ${error.message}`);
  },
};
