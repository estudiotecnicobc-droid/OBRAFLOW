import { supabase } from './supabaseClient';
import { Crew, TaskCrewYield } from '../types';
import { selectInChunks } from './supabaseBatch';

// ─── Mappers — Crews ──────────────────────────────────────────────────────────

function crewFromRow(row: Record<string, any>): Crew {
  return {
    id:             row.id,
    organizationId: row.organization_id,
    name:           row.name,
    description:    row.description ?? undefined,
    composition:    row.composition ?? [],
  };
}

function crewToRow(c: Crew): Record<string, any> {
  return {
    id:              c.id,
    organization_id: c.organizationId,
    name:            c.name,
    description:     c.description ?? null,
    composition:     c.composition ?? [],
  };
}

function buildCrewUpdateRow(updates: Partial<Crew>): Record<string, any> {
  const row: Record<string, any> = {};
  if (updates.name        !== undefined) row.name        = updates.name;
  if (updates.description !== undefined) row.description = updates.description;
  if (updates.composition !== undefined) row.composition = updates.composition;
  return row;
}

// ─── Mappers — TaskCrewYields ─────────────────────────────────────────────────

function crewYieldFromRow(row: Record<string, any>): TaskCrewYield {
  return { taskId: row.task_id, crewId: row.crew_id, quantity: row.quantity };
}

// ─── Servicio ─────────────────────────────────────────────────────────────────

export const crewsService = {

  // ── Crews ──────────────────────────────────────────────────────────────────

  async listForOrg(organizationId: string): Promise<Crew[]> {
    const { data, error } = await supabase
      .from('crews')
      .select('*')
      .eq('organization_id', organizationId)
      .order('name', { ascending: true });
    if (error) { console.error('[crewsService.list]', error.message); return []; }
    return (data ?? []).map(crewFromRow);
  },

  async create(c: Crew): Promise<void> {
    const { error } = await supabase.from('crews').insert(crewToRow(c));
    if (error) throw new Error(`[crewsService.create] ${error.message}`);
  },

  async update(id: string, updates: Partial<Crew>): Promise<void> {
    const row = buildCrewUpdateRow(updates);
    if (Object.keys(row).length === 0) return;
    const { error } = await supabase.from('crews').update(row).eq('id', id);
    if (error) throw new Error(`[crewsService.update] ${error.message}`);
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('crews').delete().eq('id', id);
    if (error) throw new Error(`[crewsService.remove] ${error.message}`);
  },

  // ── TaskCrewYields ─────────────────────────────────────────────────────────

  async listCrewYieldsForTasks(taskIds: string[]): Promise<TaskCrewYield[]> {
    if (taskIds.length === 0) return [];
    // En lotes (ver selectInChunks): un .in() con cientos de IDs da 400.
    const { data, error } = await selectInChunks('task_crew_yields', 'task_id', taskIds, {
      orderBy: ['task_id', 'crew_id'],
    });
    if (error) { console.error('[crewsService.listCrewYieldsForTasks]', error.message); return []; }
    return (data ?? []).map(crewYieldFromRow);
  },

  async upsertCrewYield(y: TaskCrewYield): Promise<void> {
    const { error } = await supabase.from('task_crew_yields').upsert(
      { task_id: y.taskId, crew_id: y.crewId, quantity: y.quantity },
      { onConflict: 'task_id,crew_id' }
    );
    if (error) throw new Error(`[crewsService.upsertCrewYield] ${error.message}`);
  },

  async removeCrewYield(taskId: string, crewId: string): Promise<void> {
    const { error } = await supabase.from('task_crew_yields').delete()
      .eq('task_id', taskId).eq('crew_id', crewId);
    if (error) throw new Error(`[crewsService.removeCrewYield] ${error.message}`);
  },

  /** Reemplaza TODOS los crew yields de una tarea (DELETE + INSERT). */
  async replaceCrewYields(taskId: string, newYields: TaskCrewYield[]): Promise<void> {
    const { error: delError } = await supabase
      .from('task_crew_yields').delete().eq('task_id', taskId);
    if (delError) throw new Error(`[crewsService.replaceCrewYields.delete] ${delError.message}`);
    if (newYields.length === 0) return;
    const { error: insError } = await supabase.from('task_crew_yields').insert(
      newYields.map(y => ({ task_id: y.taskId, crew_id: y.crewId, quantity: y.quantity }))
    );
    if (insError) throw new Error(`[crewsService.replaceCrewYields.insert] ${insError.message}`);
  },
};
