import { supabase } from './supabaseClient';
import type { APUTechnicalReport, APUReportLine } from '../types';

function parseLine(raw: Record<string, unknown>): APUReportLine {
  return {
    id:                String(raw.id ?? ''),
    resourceType:      raw.resourceType as APUReportLine['resourceType'],
    resourceCode:      raw.resourceCode ? String(raw.resourceCode) : undefined,
    resourceName:      String(raw.resourceName ?? ''),
    unit:              String(raw.unit ?? ''),
    quantity:          Number(raw.quantity          ?? 0),
    conversionFactor:  Number(raw.conversionFactor  ?? 1),
    wastePercent:      Number(raw.wastePercent       ?? 0),
    workers:           raw.workers     != null ? Number(raw.workers)     : undefined,
    hoursPerUnit:      raw.hoursPerUnit != null ? Number(raw.hoursPerUnit) : undefined,
    baseCost:          Number(raw.baseCost          ?? 0),
    socialChargesPct:  raw.socialChargesPct != null ? Number(raw.socialChargesPct) : undefined,
    effectiveUnitCost: Number(raw.effectiveUnitCost ?? 0),
    contribution:      Number(raw.contribution      ?? 0),
    costSource:        (raw.costSource ?? 'LEGACY_PRICE') as APUReportLine['costSource'],
    note:              raw.note ? String(raw.note) : undefined,
  };
}

export async function getAPUTechnicalReport(
  masterTaskId:   string,
  organizationId: string,
  costDate?:      string,
): Promise<APUTechnicalReport> {
  const date = costDate ?? new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase.rpc('get_apu_technical_report', {
    p_master_task_id:  masterTaskId,
    p_organization_id: organizationId,
    p_cost_date:       date,
  });

  if (error) throw new Error(`[apuReportService] ${error.message}`);

  const raw = (data ?? {}) as Record<string, unknown>;
  if (raw.error) throw new Error(String(raw.error));

  const sub = (raw.subtotals ?? {}) as Record<string, unknown>;

  return {
    masterTaskId:          String(raw.masterTaskId ?? ''),
    code:                  raw.code                  ? String(raw.code)                  : undefined,
    name:                  String(raw.name ?? ''),
    unit:                  String(raw.unit ?? ''),
    category:              raw.category              ? String(raw.category)              : undefined,
    description:           raw.description           ? String(raw.description)           : undefined,
    specifications:        raw.specifications        ? String(raw.specifications)        : undefined,
    dailyYield:            Number(raw.dailyYield  ?? 0),
    workdayHours:          Number(raw.workdayHours ?? 9),
    fixedCost:             Number(raw.fixedCost   ?? 0),
    fixedCostDescription:  raw.fixedCostDescription  ? String(raw.fixedCostDescription)  : undefined,
    isPathA:               Boolean(raw.isPathA ?? false),
    costDate:              String(raw.costDate ?? date),
    lines:                 ((raw.lines ?? []) as Record<string, unknown>[]).map(parseLine),
    subtotals: {
      material:    Number(sub.material    ?? 0),
      labor:       Number(sub.labor       ?? 0),
      equipment:   Number(sub.equipment   ?? 0),
      subcontract: Number(sub.subcontract ?? 0),
      fixed:       Number(sub.fixed       ?? 0),
    },
    totalDirectCost: Number(raw.totalDirectCost ?? 0),
    computedAt:      String(raw.computedAt ?? new Date().toISOString()),
  };
}
