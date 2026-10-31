import { TaskYield, TaskLaborYield, TaskToolYield, TaskCrewYield } from '../types';
import { tasksService } from './tasksService';
import { crewsService } from './crewsService';

export interface AllYields {
  yields: TaskYield[];
  laborYields: TaskLaborYield[];
  toolYields: TaskToolYield[];
  crewYields: TaskCrewYield[];
}

export const EMPTY_YIELDS: AllYields = { yields: [], laborYields: [], toolYields: [], crewYields: [] };

/** Carga todos los rendimientos de las tareas. Ante cualquier falla devuelve error y ningún dato parcial. */
export async function loadAllYields(
  taskIds: string[],
  deps = { tasks: tasksService, crews: crewsService },
): Promise<{ data: AllYields; error: string | null }> {
  if (taskIds.length === 0) return { data: EMPTY_YIELDS, error: null };
  try {
    const [{ yields, laborYields, toolYields }, crewYields] = await Promise.all([
      deps.tasks.listYieldsForTasks(taskIds),
      deps.crews.listCrewYieldsForTasks(taskIds),
    ]);
    return { data: { yields, laborYields, toolYields, crewYields }, error: null };
  } catch (err: any) {
    return { data: EMPTY_YIELDS, error: err?.message ?? String(err) };
  }
}
