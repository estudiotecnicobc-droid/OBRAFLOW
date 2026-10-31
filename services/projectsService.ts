import { supabase } from './supabaseClient';
import { BusinessConfig, Project } from '../types';

// ─── Mappers ──────────────────────────────────────────────────────────────────

function projectFromRow(row: Record<string, any>): Project {
  // BusinessConfig: se lee solo si ggd_pct tiene valor (sentinel de que los 4 fueron guardados).
  const businessConfig: BusinessConfig | undefined =
    row.ggd_pct != null
      ? {
          ggdPct:    Number(row.ggd_pct),
          ggiPct:    Number(row.ggi_pct),
          profitPct: Number(row.profit_pct),
          taxPct:    Number(row.tax_pct),
        }
      : undefined;

  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    client: row.client ?? '',
    currency: row.currency ?? 'ARS',
    startDate: row.start_date ?? new Date().toISOString().split('T')[0],
    endDate: row.end_date ?? undefined,
    status: row.status ?? 'planning',
    createdAt: row.created_at ?? undefined,
    coverImage: row.cover_image ?? undefined,
    items: [],
    businessConfig,
    // Campos técnicos
    address:             row.address             ?? undefined,
    companyName:         row.company_name        ?? undefined,
    surface:             row.surface != null ? Number(row.surface) : undefined,
    constructionSystem:  row.construction_system ?? undefined,
    structureType:       row.structure_type      ?? undefined,
    foundationType:      row.foundation_type     ?? undefined,
    // Motor de costos versionado (migration 010)
    costBase:     row.cost_base   ?? undefined,
    dependencies: Array.isArray(row.dependencies) ? row.dependencies : [],
    // Calendario y jornada laboral (migration 013)
    workdayHours:       row.workday_hours        != null ? Number(row.workday_hours) : undefined,
    workdayStartTime:   row.workday_start_time   ?? undefined,
    workdayEndTime:     row.workday_end_time     ?? undefined,
    lunchBreakDuration: row.lunch_break_duration != null ? Number(row.lunch_break_duration) : undefined,
    workingDays:        Array.isArray(row.working_days)      ? row.working_days      : undefined,
    nonWorkingDates:    Array.isArray(row.non_working_dates) ? row.non_working_dates : undefined,
    // Fuerza laboral y cuadrillas (migration 013)
    laborForce:    Array.isArray(row.labor_force)    ? row.labor_force    : undefined,
    assignedCrews: Array.isArray(row.assigned_crews) ? row.assigned_crews : undefined,
    // Pricing legacy (migration 013) — NULL = frontend usa DEFAULT_PRICING_CONFIG
    pricing: row.pricing != null ? row.pricing : undefined,
  };
}

function normalizeDate(value?: string | null): string | null {
  if (!value || value.trim() === '') return null;
  return value;
}

function projectToRow(p: Project): Record<string, any> {
  return {
    id: p.id,
    organization_id: p.organizationId,
    name: p.name,
    client: p.client ?? null,
    currency: p.currency ?? 'ARS',
    start_date: normalizeDate(p.startDate),
    end_date: normalizeDate(p.endDate),
    status: p.status ?? 'draft',
    // BusinessConfig K
    ggd_pct:    p.businessConfig?.ggdPct    ?? null,
    ggi_pct:    p.businessConfig?.ggiPct    ?? null,
    profit_pct: p.businessConfig?.profitPct ?? null,
    tax_pct:    p.businessConfig?.taxPct    ?? null,
    // Campos técnicos
    address:             p.address             ?? null,
    company_name:        p.companyName         ?? null,
    surface:             p.surface             ?? null,
    construction_system: p.constructionSystem  ?? null,
    structure_type:      p.structureType       ?? null,
    foundation_type:     p.foundationType      ?? null,
    cost_base:           p.costBase            ?? null,
    // Calendario y jornada (migration 013)
    workday_hours:        p.workdayHours        ?? null,
    workday_start_time:   p.workdayStartTime    ?? null,
    workday_end_time:     p.workdayEndTime      ?? null,
    lunch_break_duration: p.lunchBreakDuration  ?? null,
    working_days:         p.workingDays         ?? null,
    non_working_dates:    p.nonWorkingDates      ?? null,
    labor_force:          p.laborForce          ?? null,
    assigned_crews:       p.assignedCrews       ?? null,
    pricing:              p.pricing             ?? null,
  };
}

function buildUpdateRow(updates: Partial<Project>): Record<string, any> {
  const row: Record<string, any> = {};
  if (updates.name !== undefined)      row.name = updates.name;
  if (updates.client !== undefined)    row.client = updates.client;
  if (updates.currency !== undefined)  row.currency = updates.currency;
  if (updates.startDate !== undefined) row.start_date = normalizeDate(updates.startDate);
  if (updates.endDate !== undefined)   row.end_date   = normalizeDate(updates.endDate);
  if (updates.status !== undefined)    row.status = updates.status;
  if (updates.coverImage !== undefined) row.cover_image = updates.coverImage || null;
  // BusinessConfig K: los 4 campos se escriben juntos o ninguno.
  if (updates.businessConfig !== undefined) {
    row.ggd_pct    = updates.businessConfig?.ggdPct    ?? null;
    row.ggi_pct    = updates.businessConfig?.ggiPct    ?? null;
    row.profit_pct = updates.businessConfig?.profitPct ?? null;
    row.tax_pct    = updates.businessConfig?.taxPct    ?? null;
  }
  if (updates.address !== undefined)             row.address             = updates.address ?? null;
  if (updates.companyName !== undefined)         row.company_name        = updates.companyName ?? null;
  if (updates.surface !== undefined)             row.surface             = updates.surface ?? null;
  if (updates.constructionSystem !== undefined)  row.construction_system = updates.constructionSystem ?? null;
  if (updates.structureType !== undefined)       row.structure_type      = updates.structureType ?? null;
  if (updates.foundationType !== undefined)      row.foundation_type     = updates.foundationType ?? null;
  if (updates.costBase !== undefined)            row.cost_base           = updates.costBase ?? null;
  if (updates.dependencies !== undefined)        row.dependencies        = updates.dependencies;
  // Calendario y jornada (migration 013)
  if (updates.workdayHours !== undefined)        row.workday_hours        = updates.workdayHours ?? null;
  if (updates.workdayStartTime !== undefined)    row.workday_start_time   = updates.workdayStartTime ?? null;
  if (updates.workdayEndTime !== undefined)      row.workday_end_time     = updates.workdayEndTime ?? null;
  if (updates.lunchBreakDuration !== undefined)  row.lunch_break_duration = updates.lunchBreakDuration ?? null;
  if (updates.workingDays !== undefined)         row.working_days         = updates.workingDays ?? null;
  if (updates.nonWorkingDates !== undefined)     row.non_working_dates    = updates.nonWorkingDates ?? null;
  // Fuerza laboral y cuadrillas (migration 013)
  if (updates.laborForce !== undefined)          row.labor_force    = updates.laborForce ?? null;
  if (updates.assignedCrews !== undefined)       row.assigned_crews = updates.assignedCrews ?? null;
  // Pricing legacy (migration 013)
  if (updates.pricing !== undefined)             row.pricing = updates.pricing ?? null;
  return row;
}

// ─── Servicio ─────────────────────────────────────────────────────────────────

export const projectsService = {

  async list(organizationId: string): Promise<Project[]> {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });
    if (error) { console.error('[projectsService.list]', error.message); return []; }
    return (data ?? []).map(projectFromRow);
  },

  async create(project: Project): Promise<void> {
    const row = projectToRow(project);
    const { error } = await supabase.from('projects').insert(row);
    if (error) throw new Error(`[projectsService.create] ${error.message}`);
  },

  async update(id: string, updates: Partial<Project>): Promise<void> {
    const row = buildUpdateRow(updates);
    if (Object.keys(row).length === 0) return;
    const { error } = await supabase.from('projects').update(row).eq('id', id);
    if (error) throw new Error(`[projectsService.update] ${error.message}`);
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) throw new Error(`[projectsService.remove] ${error.message}`);
  },
};
