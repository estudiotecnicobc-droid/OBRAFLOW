// ─── Motor recursivo de costos APU ───────────────────────────────────────────
// Calcula el costo unitario de un MasterTask con soporte para:
//   · APUs anidados (sub_master_task_id)
//   · Recursos versionados (resourceId → get_resource_cost RPC)
//   · Cycle detection (diamond dependencies OK, ciclos A→B→A detectados)
//   · Memoización (un MasterTask se calcula una sola vez por contexto)
//
// Criterio de unidades (alineado con calculate_consolidated_resources, 057):
// cantidad y precio están siempre en la unidad técnica del componente.
// `conversionFactor` NO interviene en el costo — es evidencia para compras.
// Si la unidad del precio difiere de la del componente, el material queda
// fuera del costo con warning UNIT_MISMATCH (no se convierte en silencio).

import { MasterTask, RecursiveAPUResult, RecursiveEngineContext } from '../types';
import { unitsMatch } from './unitNormalization';

const WORKDAY_HOURS = 9; // horas de jornada laboral estándar

/**
 * Calcula el costo unitario (por unidad de tarea) de un MasterTask.
 * Modifica ctx.visited y ctx.computed como side effects de memoización.
 */
export async function computeTaskCost(
  task: MasterTask,
  ctx: RecursiveEngineContext,
): Promise<RecursiveAPUResult> {
  // ── Memoización ────────────────────────────────────────────────────────────
  const cached = ctx.computed.get(task.id);
  if (cached) return cached;

  // ── Cycle detection ────────────────────────────────────────────────────────
  if (ctx.visited.has(task.id)) {
    console.warn(
      `[recursiveCostEngine] Ciclo detectado en APU "${task.name}" (${task.id}). ` +
      `Usando costo 0 para romper el ciclo.`,
    );
    return zeroResult(['Ciclo detectado — costo forzado a 0']);
  }
  ctx.visited.add(task.id);

  const warnings: string[] = [];
  let materialCost  = 0;
  let laborCost     = 0;
  let equipmentCost = 0;

  // ── Materiales ─────────────────────────────────────────────────────────────
  for (const m of task.materials) {
    let unitPrice: number | null = null;

    if (m.subMasterTaskId) {
      // APU anidado: calcular recursivamente
      const subTask = ctx.tasksMap.get(m.subMasterTaskId);
      if (subTask) {
        const subResult = await computeTaskCost(subTask, ctx);
        unitPrice = subResult.totalUnitCost;
      } else {
        warnings.push(`sub-APU ${m.subMasterTaskId} no encontrado para "${m.materialName}"`);
      }
    } else if (m.resourceId) {
      // Recurso versionado: resolver costo por fecha. El precio llega en la
      // unidad técnica del recurso; si difiere de la del componente, el
      // material queda fuera del costo con UNIT_MISMATCH.
      const fromCache = await ctx.resolveCost(m.resourceId);
      if (fromCache != null) {
        const resource = ctx.resourcesMap?.get(m.resourceId);
        if (resource && !unitsMatch(m.unit, resource.unit)) {
          warnings.push(
            `UNIT_MISMATCH: "${m.materialName}" mide en "${m.unit}" pero el recurso está en "${resource.unit}" — material omitido`,
          );
          continue;
        }
        unitPrice = fromCache;
      } else {
        warnings.push(`Sin costo para recurso ${m.resourceId} ("${m.materialName}") — usando lastKnownUnitPrice`);
        unitPrice = m.lastKnownUnitPrice ?? null;
      }
    } else {
      // Fallback: precio capturado al momento de crear el APU
      unitPrice = m.lastKnownUnitPrice ?? null;
    }

    if (unitPrice == null) {
      warnings.push(`Sin precio para material "${m.materialName}" — omitido`);
      continue;
    }

    const wasteMultiplier = 1 + (m.wastePercent ?? 0) / 100;
    materialCost += unitPrice * m.quantity * wasteMultiplier;
  }

  // ── Mano de obra ───────────────────────────────────────────────────────────
  // Costo MO = (trabajadores × horas_jornada / rendimiento_diario) × tarifa_hora
  const dailyYield = Math.max(0.01, task.dailyYield);

  for (const l of task.labor) {
    let hourlyRate: number | null = null;

    if (l.resourceId) {
      hourlyRate = await ctx.resolveCost(l.resourceId);
      if (hourlyRate == null) {
        warnings.push(`Sin tarifa para recurso MO ${l.resourceId} ("${l.laborCategoryName}") — usando snapshotHourlyRate`);
        hourlyRate = l.snapshotHourlyRate ?? null;
      }
    } else {
      hourlyRate = l.snapshotHourlyRate ?? null;
    }

    if (hourlyRate == null) {
      warnings.push(`Sin tarifa horaria para "${l.laborCategoryName}" — omitido`);
      continue;
    }

    // hoursPerUnit = (cantidad_trabajadores × horas_jornada) / rendimiento_diario
    const hoursPerUnit = (l.quantity * WORKDAY_HOURS) / dailyYield;
    laborCost += hourlyRate * hoursPerUnit;
  }

  // ── Equipos ────────────────────────────────────────────────────────────────
  for (const e of task.equipment) {
    let costPerHour: number | null = null;

    if (e.resourceId) {
      costPerHour = await ctx.resolveCost(e.resourceId);
      if (costPerHour == null) {
        warnings.push(`Sin costo para recurso equipo ${e.resourceId} ("${e.toolName}") — usando snapshotCostPerHour`);
        costPerHour = e.snapshotCostPerHour ?? null;
      }
    } else {
      costPerHour = e.snapshotCostPerHour ?? null;
    }

    if (costPerHour == null) {
      warnings.push(`Sin costo/hora para "${e.toolName}" — omitido`);
      continue;
    }

    equipmentCost += costPerHour * e.hoursPerUnit;
  }

  // ── Costo fijo ─────────────────────────────────────────────────────────────
  const fixedCost = task.fixedCost ?? 0;

  const result: RecursiveAPUResult = {
    materialCost:  round4(materialCost),
    laborCost:     round4(laborCost),
    equipmentCost: round4(equipmentCost),
    fixedCost:     round4(fixedCost),
    totalUnitCost: round4(materialCost + laborCost + equipmentCost + fixedCost),
    warnings:      warnings.length > 0 ? warnings : undefined,
  };

  // ── Memoizar y liberar del stack ───────────────────────────────────────────
  ctx.computed.set(task.id, result);
  ctx.visited.delete(task.id); // permite diamond dependencies

  return result;
}

function zeroResult(warnings: string[]): RecursiveAPUResult {
  return { materialCost: 0, laborCost: 0, equipmentCost: 0, fixedCost: 0, totalUnitCost: 0, warnings };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
