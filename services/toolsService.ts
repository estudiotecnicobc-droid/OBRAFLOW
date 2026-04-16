import { supabase } from './supabaseClient';
import { Tool } from '../types';

// ─── Mappers ──────────────────────────────────────────────────────────────────

function toolFromRow(row: Record<string, any>): Tool {
  return {
    id:             row.id,
    organizationId: row.organization_id,
    code:           row.code ?? undefined,
    name:           row.name,
    category:       row.category ?? '',
    costPerHour:    row.cost_per_hour ?? 0,
    family:         row.family ?? undefined,
  };
}

function toolToRow(t: Tool): Record<string, any> {
  return {
    id:              t.id,
    organization_id: t.organizationId,
    code:            t.code ?? null,
    name:            t.name,
    category:        t.category,
    cost_per_hour:   t.costPerHour,
    family:          t.family ?? null,
  };
}

function buildUpdateRow(updates: Partial<Tool>): Record<string, any> {
  const row: Record<string, any> = {};
  if (updates.code         !== undefined) row.code          = updates.code ?? null;
  if (updates.name         !== undefined) row.name          = updates.name;
  if (updates.category     !== undefined) row.category      = updates.category;
  if (updates.costPerHour  !== undefined) row.cost_per_hour = updates.costPerHour;
  if (updates.family       !== undefined) row.family        = updates.family;
  return row;
}

// ─── Servicio ─────────────────────────────────────────────────────────────────

export const toolsService = {

  async listForOrg(organizationId: string): Promise<Tool[]> {
    const { data, error } = await supabase
      .from('tools')
      .select('*')
      .eq('organization_id', organizationId)
      .order('name', { ascending: true });
    if (error) { console.error('[toolsService.list]', error.message); return []; }
    return (data ?? []).map(toolFromRow);
  },

  async create(t: Tool): Promise<void> {
    const { error } = await supabase.from('tools').insert(toolToRow(t));
    if (error) throw new Error(`[toolsService.create] ${error.message}`);
  },

  async update(id: string, updates: Partial<Tool>): Promise<void> {
    const row = buildUpdateRow(updates);
    if (Object.keys(row).length === 0) return;
    const { error } = await supabase.from('tools').update(row).eq('id', id);
    if (error) throw new Error(`[toolsService.update] ${error.message}`);
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('tools').delete().eq('id', id);
    if (error) throw new Error(`[toolsService.remove] ${error.message}`);
  },
};
