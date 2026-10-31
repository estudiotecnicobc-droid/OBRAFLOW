import { supabase } from './supabaseClient';
import { Task, TaskYield, TaskLaborYield, TaskToolYield } from '../types';
import { normalizeUnit } from '../utils/normalizeUnit';
import { selectInChunks } from './supabaseBatch';

// ─── Mappers — Tasks ──────────────────────────────────────────────────────────

function taskFromRow(row: Record<string, any>): Task {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description ?? undefined,
    unit: normalizeUnit(row.unit),
    laborCost: row.labor_cost ?? 0,
    dailyYield: row.daily_yield ?? 1,
    category: row.category ?? undefined,
    fixedCost: row.fixed_cost ?? undefined,
    fixedCostDescription: row.fixed_cost_description ?? undefined,
    code: row.code ?? undefined,
    specifications: row.specifications ?? undefined,
    yieldHH: row.yield_hh ?? undefined,
    defaultPredecessorId: row.default_predecessor_id ?? undefined,
    standardYields: row.standard_yields ?? undefined,
    masterTaskId: row.master_task_id ?? undefined,
  };
}

function taskToRow(t: Task): Record<string, any> {
  return {
    id: t.id,
    organization_id: t.organizationId,
    name: t.name,
    unit: t.unit,
    labor_cost: t.laborCost,
    daily_yield: t.dailyYield,
    category: t.category ?? null,
    fixed_cost: t.fixedCost ?? null,
    fixed_cost_description: t.fixedCostDescription ?? null,
    code: t.code ?? null,
    specifications: t.specifications ?? null,
    master_task_id: t.masterTaskId ?? null,
    // Columnas ausentes en DB (no enviar): description, default_predecessor_id, standard_yields, yield_hh
  };
}

function buildTaskUpdateRow(updates: Partial<Task>): Record<string, any> {
  const row: Record<string, any> = {};
  if (updates.name !== undefined)                 row.name = updates.name;
  if (updates.unit !== undefined)                 row.unit = updates.unit;
  if (updates.laborCost !== undefined)            row.labor_cost = updates.laborCost;
  if (updates.dailyYield !== undefined)           row.daily_yield = updates.dailyYield;
  if (updates.category !== undefined)             row.category = updates.category;
  if (updates.fixedCost !== undefined)            row.fixed_cost = updates.fixedCost;
  if (updates.fixedCostDescription !== undefined) row.fixed_cost_description = updates.fixedCostDescription;
  if (updates.code !== undefined)                 row.code = updates.code;
  if (updates.specifications !== undefined)       row.specifications = updates.specifications;
  if (updates.masterTaskId !== undefined)         row.master_task_id = updates.masterTaskId;
  // Ignorar materialsYield, equipmentYield, laborYield, laborIndividualYield
  // — esos van a tablas separadas.
  return row;
}

// ─── Mappers — Yields ─────────────────────────────────────────────────────────

function yieldFromRow(row: Record<string, any>): TaskYield {
  return { taskId: row.task_id, materialId: row.material_id, quantity: row.quantity, wastePercent: row.waste_percent ?? undefined, organizationId: row.organization_id ?? undefined };
}

function laborYieldFromRow(row: Record<string, any>): TaskLaborYield {
  return { taskId: row.task_id, laborCategoryId: row.labor_category_id, quantity: row.quantity, organizationId: row.organization_id ?? undefined };
}

function toolYieldFromRow(row: Record<string, any>): TaskToolYield {
  return { taskId: row.task_id, toolId: row.tool_id, hoursPerUnit: row.hours_per_unit, organizationId: row.organization_id ?? undefined };
}

// ─── Servicio ─────────────────────────────────────────────────────────────────

export const tasksService = {

  // ── Tareas ──────────────────────────────────────────────────────────────────

  async listForOrg(organizationId: string): Promise<Task[]> {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('organization_id', organizationId);
    if (error) { console.error('[tasksService.listForOrg]', error.message); return []; }
    return (data ?? []).map(taskFromRow);
  },

  async create(task: Task): Promise<void> {
    const { error } = await supabase.from('tasks').insert(taskToRow(task));
    if (error) throw new Error(`[tasksService.create] ${error.message}`);
  },

  async update(id: string, updates: Partial<Task>): Promise<void> {
    const row = buildTaskUpdateRow(updates);
    if (Object.keys(row).length === 0) return;
    const { error } = await supabase.from('tasks').update(row).eq('id', id);
    if (error) throw new Error(`[tasksService.update] ${error.message}`);
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) throw new Error(`[tasksService.remove] ${error.message}`);
  },

  // ── Yields — carga bulk ────────────────────────────────────────────────────

  /** Carga los tres tipos de yields para un conjunto de taskIds. */
  async listYieldsForTasks(taskIds: string[]): Promise<{
    yields: TaskYield[];
    laborYields: TaskLaborYield[];
    toolYields: TaskToolYield[];
  }> {
    if (taskIds.length === 0) return { yields: [], laborYields: [], toolYields: [] };
    // En lotes: con todas las tareas de la org en un solo .in() la URL excede
    // el límite y PostgREST responde 400 (los yields quedaban vacíos y la
    // grilla del presupuesto mostraba $0 en material y mano de obra).
    const [{ data: yd, error: ye }, { data: lyd, error: lye }, { data: tyd, error: tye }] =
      await Promise.all([
        selectInChunks('task_yields', 'task_id', taskIds),
        selectInChunks('task_labor_yields', 'task_id', taskIds),
        selectInChunks('task_tool_yields', 'task_id', taskIds),
      ]);
    const err = ye ?? lye ?? tye;
    if (err) throw new Error(`[tasksService.listYieldsForTasks] ${err.message}`);
    return {
      yields: (yd ?? []).map(yieldFromRow),
      laborYields: (lyd ?? []).map(laborYieldFromRow),
      toolYields: (tyd ?? []).map(toolYieldFromRow),
    };
  },

  // ── task_yields ──────────────────────────────────────────────────────────

  async upsertYield(y: TaskYield): Promise<void> {
    const { error } = await supabase.from('task_yields').upsert(
      { task_id: y.taskId, material_id: y.materialId, quantity: y.quantity, waste_percent: y.wastePercent ?? null, organization_id: y.organizationId },
      { onConflict: 'task_id,material_id' }
    );
    if (error) throw new Error(`[tasksService.upsertYield] ${error.message}`);
  },

  async removeYield(taskId: string, materialId: string): Promise<void> {
    const { error } = await supabase.from('task_yields').delete()
      .eq('task_id', taskId).eq('material_id', materialId);
    if (error) throw new Error(`[tasksService.removeYield] ${error.message}`);
  },

  // ── task_labor_yields ────────────────────────────────────────────────────

  async upsertLaborYield(y: TaskLaborYield): Promise<void> {
    const { error } = await supabase.from('task_labor_yields').upsert(
      { task_id: y.taskId, labor_category_id: y.laborCategoryId, quantity: y.quantity, organization_id: y.organizationId },
      { onConflict: 'task_id,labor_category_id' }
    );
    if (error) throw new Error(`[tasksService.upsertLaborYield] ${error.message}`);
  },

  async removeLaborYield(taskId: string, laborCategoryId: string): Promise<void> {
    const { error } = await supabase.from('task_labor_yields').delete()
      .eq('task_id', taskId).eq('labor_category_id', laborCategoryId);
    if (error) throw new Error(`[tasksService.removeLaborYield] ${error.message}`);
  },

  // ── task_tool_yields ─────────────────────────────────────────────────────

  async upsertToolYield(y: TaskToolYield): Promise<void> {
    const { error } = await supabase.from('task_tool_yields').upsert(
      { task_id: y.taskId, tool_id: y.toolId, hours_per_unit: y.hoursPerUnit, organization_id: y.organizationId },
      { onConflict: 'task_id,tool_id' }
    );
    if (error) throw new Error(`[tasksService.upsertToolYield] ${error.message}`);
  },

  async removeToolYield(taskId: string, toolId: string): Promise<void> {
    const { error } = await supabase.from('task_tool_yields').delete()
      .eq('task_id', taskId).eq('tool_id', toolId);
    if (error) throw new Error(`[tasksService.removeToolYield] ${error.message}`);
  },

  /**
   * Reemplaza TODOS los yields de una tarea (usado por updateTaskMaster).
   * DELETE + INSERT en paralelo por tabla.
   */
  async replaceAllYields(
    taskId: string,
    newYields: TaskYield[],
    newLaborYields: TaskLaborYield[],
    newToolYields: TaskToolYield[],
  ): Promise<void> {
    // Borrar existentes — verificar errores
    const [del1, del2, del3] = await Promise.all([
      supabase.from('task_yields').delete().eq('task_id', taskId),
      supabase.from('task_labor_yields').delete().eq('task_id', taskId),
      supabase.from('task_tool_yields').delete().eq('task_id', taskId),
    ]);
    if (del1.error) throw new Error(`[replaceAllYields] delete task_yields: ${del1.error.message}`);
    if (del2.error) throw new Error(`[replaceAllYields] delete task_labor_yields: ${del2.error.message}`);
    if (del3.error) throw new Error(`[replaceAllYields] delete task_tool_yields: ${del3.error.message}`);

    // Insertar nuevos — verificar errores
    const [ins1, ins2, ins3] = await Promise.all([
      newYields.length > 0
        ? supabase.from('task_yields').insert(newYields.map(y => ({
            task_id: y.taskId, material_id: y.materialId,
            quantity: y.quantity, waste_percent: y.wastePercent ?? null,
            organization_id: y.organizationId,
          })))
        : Promise.resolve({ error: null }),
      newLaborYields.length > 0
        ? supabase.from('task_labor_yields').insert(newLaborYields.map(y => ({
            task_id: y.taskId, labor_category_id: y.laborCategoryId, quantity: y.quantity,
            organization_id: y.organizationId,
          })))
        : Promise.resolve({ error: null }),
      newToolYields.length > 0
        ? supabase.from('task_tool_yields').insert(newToolYields.map(y => ({
            task_id: y.taskId, tool_id: y.toolId, hours_per_unit: y.hoursPerUnit,
            organization_id: y.organizationId,
          })))
        : Promise.resolve({ error: null }),
    ]);
    if (ins1.error) throw new Error(`[replaceAllYields] insert task_yields: ${ins1.error.message}`);
    if (ins2.error) throw new Error(`[replaceAllYields] insert task_labor_yields: ${ins2.error.message}`);
    if (ins3.error) throw new Error(`[replaceAllYields] insert task_tool_yields: ${ins3.error.message}`);
  },
};
