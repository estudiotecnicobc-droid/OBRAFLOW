import { supabase } from './supabaseClient';
import { LaborCategory } from '../types';

// ─── Mappers ──────────────────────────────────────────────────────────────────

function laborCategoryFromRow(row: Record<string, any>): LaborCategory {
  return {
    id:                   row.id,
    organizationId:       row.organization_id,
    code:                 row.code ?? undefined,
    role:                 row.role,
    basicHourlyRate:      row.basic_hourly_rate ?? 0,
    socialChargesPercent: row.social_charges_percent ?? 0,
    insurancePercent:     row.insurance_percent ?? 0,
    description:          row.description ?? undefined,
    family:               row.family ?? undefined,
  };
}

function laborCategoryToRow(lc: LaborCategory): Record<string, any> {
  return {
    id:                    lc.id,
    organization_id:       lc.organizationId,
    code:                  lc.code ?? null,
    role:                  lc.role,
    basic_hourly_rate:     lc.basicHourlyRate,
    social_charges_percent: lc.socialChargesPercent,
    insurance_percent:     lc.insurancePercent,
    description:           lc.description ?? null,
    family:                lc.family ?? null,
  };
}

function buildUpdateRow(updates: Partial<LaborCategory>): Record<string, any> {
  const row: Record<string, any> = {};
  if (updates.code                 !== undefined) row.code                  = updates.code ?? null;
  if (updates.role                 !== undefined) row.role                  = updates.role;
  if (updates.basicHourlyRate      !== undefined) row.basic_hourly_rate     = updates.basicHourlyRate;
  if (updates.socialChargesPercent !== undefined) row.social_charges_percent = updates.socialChargesPercent;
  if (updates.insurancePercent     !== undefined) row.insurance_percent     = updates.insurancePercent;
  if (updates.description          !== undefined) row.description           = updates.description;
  if (updates.family               !== undefined) row.family                = updates.family;
  return row;
}

// ─── Servicio ─────────────────────────────────────────────────────────────────

export const laborCategoriesService = {

  async listForOrg(organizationId: string): Promise<LaborCategory[]> {
    const { data, error } = await supabase
      .from('labor_categories')
      .select('*')
      .eq('organization_id', organizationId)
      .order('role', { ascending: true });
    if (error) { console.error('[laborCategoriesService.list]', error.message); return []; }
    return (data ?? []).map(laborCategoryFromRow);
  },

  async create(lc: LaborCategory): Promise<void> {
    const { error } = await supabase
      .from('labor_categories')
      .upsert(laborCategoryToRow(lc), { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw new Error(`[laborCategoriesService.create] ${error.message}`);
  },

  async update(id: string, updates: Partial<LaborCategory>): Promise<void> {
    const row = buildUpdateRow(updates);
    if (Object.keys(row).length === 0) return;
    const { error } = await supabase.from('labor_categories').update(row).eq('id', id);
    if (error) throw new Error(`[laborCategoriesService.update] ${error.message}`);
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('labor_categories').delete().eq('id', id);
    if (error) throw new Error(`[laborCategoriesService.remove] ${error.message}`);
  },
};
