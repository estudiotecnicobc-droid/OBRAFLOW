import { supabase } from './supabaseClient';

export interface BudgetVersionItem {
  budgetItemId: string;
  taskId: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  materialUnit: number;
  laborUnit: number;
  equipmentUnit: number;
  fixedUnit: number;
  total: number;
}

export interface BudgetVersionFactors {
  materials: number;
  labor: number;
  equipment: number;
  fixed: number;
}

export interface BudgetVersionTotals {
  direct: number;
  materials: number;
  labor: number;
  equipment: number;
  fixed: number;
  sale: number;
}

export interface BudgetVersionMethod {
  mode: string;
  label: string;
  series: Partial<Record<keyof BudgetVersionFactors, string>>;
}

export interface BudgetVersion {
  id: string;
  organizationId: string;
  projectId: string;
  versionNumber: number;
  label: string;
  method: BudgetVersionMethod | Record<string, never>;
  basePeriod?: string;
  targetPeriod?: string;
  factors: BudgetVersionFactors | Record<string, never>;
  totals: BudgetVersionTotals;
  items: BudgetVersionItem[];
  createdAt: string;
}

export type NewBudgetVersion = Omit<BudgetVersion, 'id' | 'createdAt'>;

function fromRow(row: Record<string, any>): BudgetVersion {
  return {
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    versionNumber: row.version_number,
    label: row.label,
    method: row.method ?? {},
    basePeriod: row.base_period ?? undefined,
    targetPeriod: row.target_period ?? undefined,
    factors: row.factors ?? {},
    totals: row.totals ?? {},
    items: Array.isArray(row.items) ? row.items : [],
    createdAt: row.created_at,
  };
}

export const budgetVersionsService = {
  async list(projectId: string): Promise<BudgetVersion[]> {
    const { data, error } = await supabase
      .from('budget_versions')
      .select('*')
      .eq('project_id', projectId)
      .order('version_number', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map(fromRow);
  },

  async create(v: NewBudgetVersion): Promise<BudgetVersion> {
    const { data, error } = await supabase
      .from('budget_versions')
      .insert({
        organization_id: v.organizationId,
        project_id: v.projectId,
        version_number: v.versionNumber,
        label: v.label,
        method: v.method,
        base_period: v.basePeriod ?? null,
        target_period: v.targetPeriod ?? null,
        factors: v.factors,
        totals: v.totals,
        items: v.items,
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return fromRow(data);
  },
};
