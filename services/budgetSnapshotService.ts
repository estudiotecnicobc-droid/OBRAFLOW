/**
 * budgetSnapshotService.ts
 * ─────────────────────────
 * Capa de acceso a datos para budget_cost_snapshots y RPCs asociadas.
 * Envuelve las funciones de la migration 018.
 *
 * Funciones expuestas:
 *   · takeSnapshot        — calcula y persiste un snapshot de costos
 *   · getStaleness        — detecta si los precios cambiaron desde el último snapshot
 *   · listSnapshots       — historial de snapshots de un proyecto
 *   · getBudgetForCalc    — extrae items del presupuesto como input para la calculadora
 *   · detectDuplicateCodes — detecta APUs con código o nombre duplicado en la org
 */

import { supabase }                        from './supabaseClient';
import type {
  BudgetCostSnapshotResult,
  BudgetCostStaleness,
  BudgetCostSnapshot,
  BudgetForCalculatorResult,
  DuplicateAPUCodesResult,
} from '../types';

// ── snake_case DB → camelCase TS ──────────────────────────────────────────────

function snapshotFromRow(row: Record<string, unknown>): BudgetCostSnapshot {
  return {
    id:             row.id as string,
    projectId:      row.project_id as string,
    organizationId: row.organization_id as string,
    costDate:       row.cost_date as string,
    computedAt:     row.computed_at as string,
    createdBy:      row.created_by as string | undefined,
    itemCount:      Number(row.item_count ?? 0),
    grandTotal:     Number(row.grand_total ?? 0),
    totalMaterial:  Number(row.total_material ?? 0),
    totalLabor:     Number(row.total_labor ?? 0),
    totalEquipment: Number(row.total_equipment ?? 0),
  };
}

// ── Servicios ─────────────────────────────────────────────────────────────────

/**
 * Calcula los costos del presupuesto y guarda un snapshot inmutable.
 * Llama a la RPC snapshot_budget_costs (migration 018).
 */
export async function takeSnapshot(
  projectId: string,
  organizationId: string,
  costDate?: string,
): Promise<BudgetCostSnapshotResult> {
  const { data, error } = await supabase.rpc('snapshot_budget_costs', {
    p_project_id:       projectId,
    p_organization_id:  organizationId,
    p_cost_date:        costDate ?? new Date().toISOString().slice(0, 10),
  });

  if (error) throw new Error(error.message);
  const result = data as BudgetCostSnapshotResult & { error?: string };
  if (result?.error) throw new Error(result.error);
  return result;
}

/**
 * Detecta si los precios de materiales cambiaron después del último snapshot.
 * Llama a la RPC get_budget_cost_staleness (migration 018).
 */
export async function getStaleness(
  projectId: string,
  organizationId: string,
): Promise<BudgetCostStaleness> {
  const { data, error } = await supabase.rpc('get_budget_cost_staleness', {
    p_project_id:      projectId,
    p_organization_id: organizationId,
  });

  if (error) throw new Error(error.message);
  const r = data as Record<string, unknown>;
  return {
    isStale:               r.isStale as boolean | null,
    neverCalculated:       Boolean(r.neverCalculated),
    lastSnapshotAt:        r.lastSnapshotAt as string | null,
    lastSnapshotCostDate:  r.lastSnapshotCostDate as string | null,
    lastSnapshotTotals:    r.lastSnapshotTotals as BudgetCostStaleness['lastSnapshotTotals'],
    staleCount:            Number(r.staleCount ?? 0),
    staleResources:        (r.staleResources ?? []) as BudgetCostStaleness['staleResources'],
  };
}

/**
 * Historial de snapshots de un proyecto.
 * Usa la vista v_budget_snapshot_summary (migration 018).
 */
export async function listSnapshots(
  projectId: string,
): Promise<BudgetCostSnapshot[]> {
  const { data, error } = await supabase
    .from('v_budget_snapshot_summary')
    .select('*')
    .eq('project_id', projectId)
    .order('computed_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map(snapshotFromRow);
}

/**
 * Extrae los APUs y cantidades acumuladas del presupuesto activo.
 * Llama a la RPC get_budget_for_calculator (migration 018).
 * Retorna el array listo para pasarlo a calculate_consolidated_resources.
 */
export async function getBudgetForCalc(
  projectId: string,
  organizationId: string,
): Promise<BudgetForCalculatorResult> {
  const { data, error } = await supabase.rpc('get_budget_for_calculator', {
    p_project_id:      projectId,
    p_organization_id: organizationId,
  });

  if (error) throw new Error(error.message);
  const r = data as Record<string, unknown>;
  return {
    items:              (r.items ?? []) as BudgetForCalculatorResult['items'],
    itemsWithoutMaster: Number(r.itemsWithoutMaster ?? 0),
    projectId:          r.projectId as string,
  };
}

/**
 * Detecta APUs con código o nombre duplicado en la organización.
 * Llama a la RPC detect_duplicate_apu_codes (migration 017).
 */
export async function detectDuplicateCodes(
  organizationId: string,
): Promise<DuplicateAPUCodesResult> {
  const { data, error } = await supabase.rpc('detect_duplicate_apu_codes', {
    p_organization_id: organizationId,
  });

  if (error) throw new Error(error.message);
  const r = data as Record<string, unknown>;
  return {
    duplicatesByCode: (r.duplicatesByCode ?? []) as DuplicateAPUCodesResult['duplicatesByCode'],
    duplicatesByName: (r.duplicatesByName ?? []) as DuplicateAPUCodesResult['duplicatesByName'],
    checkedAt:        r.checkedAt as string,
  };
}
