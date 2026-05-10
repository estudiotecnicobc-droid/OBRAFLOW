/**
 * Servicio para la RPC calculate_consolidated_resources.
 * Thin wrapper: mapea request → parámetros SQL, response JSONB → tipos TS.
 */
import { supabase } from './supabaseClient';
import type {
  RpcConsolidatedRequest,
  RpcConsolidatedResult,
  RpcResourceLine,
  RpcAPUSummary,
} from '../types';

function parseResourceLine(row: Record<string, unknown>): RpcResourceLine {
  return {
    resourceId:      String(row.resourceId ?? ''),
    code:            String(row.code ?? ''),
    name:            String(row.name ?? ''),
    unit:            String(row.unit ?? ''),
    totalQuantity:   Number(row.totalQuantity ?? 0),
    unitCost:        Number(row.unitCost ?? 0),
    totalCost:        Number(row.totalCost ?? 0),
    sourceTaskNames:  Array.isArray(row.sourceTaskNames) ? row.sourceTaskNames as string[] : [],
    conversionFactor: row.conversionFactor != null ? Number(row.conversionFactor) : undefined,
    commercialUnit:   row.commercialUnit   != null ? String(row.commercialUnit)   : undefined,
    purchaseQuantity: row.purchaseQuantity != null ? Number(row.purchaseQuantity) : undefined,
  };
}

function parseAPUSummary(row: Record<string, unknown>): RpcAPUSummary {
  const uc = (row.unitCosts ?? {}) as Record<string, unknown>;
  return {
    masterTaskId: String(row.masterTaskId ?? ''),
    name:         String(row.name ?? ''),
    requestedQty: Number(row.requestedQty ?? 0),
    unitCosts: {
      material:  Number(uc.material  ?? 0),
      labor:     Number(uc.labor     ?? 0),
      equipment: Number(uc.equipment ?? 0),
      total:     Number(uc.total     ?? 0),
    },
  };
}

export async function calculateConsolidatedResources(
  req: RpcConsolidatedRequest,
): Promise<RpcConsolidatedResult> {
  const { data, error } = await supabase.rpc('calculate_consolidated_resources', {
    p_items: req.items.map(i => ({
      master_task_id: i.masterTaskId,
      quantity:       i.quantity,
    })),
    p_organization_id: req.organizationId,
    p_cost_date:       req.costDate ?? new Date().toISOString().slice(0, 10),
  });

  if (error) throw new Error(error.message);

  const raw = (data ?? {}) as Record<string, unknown>;
  const totals = (raw.totals ?? {}) as Record<string, unknown>;

  return {
    materials:  ((raw.materials  ?? []) as Record<string, unknown>[]).map(parseResourceLine),
    labor:      ((raw.labor      ?? []) as Record<string, unknown>[]).map(parseResourceLine),
    equipment:  ((raw.equipment  ?? []) as Record<string, unknown>[]).map(parseResourceLine),
    apuSummary: ((raw.apuSummary ?? []) as Record<string, unknown>[]).map(parseAPUSummary),
    totals: {
      material:   Number(totals.material   ?? 0),
      labor:      Number(totals.labor      ?? 0),
      equipment:  Number(totals.equipment  ?? 0),
      grandTotal: Number(totals.grandTotal ?? 0),
    },
    computedAt: String(raw.computedAt ?? new Date().toISOString()),
  };
}
