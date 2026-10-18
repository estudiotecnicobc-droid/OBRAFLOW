// ---------------------------------------------------------------------------
// scheduleEngine — motor puro de resolución de fechas para el Gantt.
//
// Separado de useProjectSchedule para poder testearlo sin React/ERPContext.
// Fuente de verdad de dependencias: project.dependencies (ProjectDependency[],
// modelo centralizado). Si está vacío, se arma desde el campo legacy
// item.dependencies (Dependency[] con predecessorId) para no perder datos
// de proyectos viejos que nunca migraron al modelo centralizado.
// ---------------------------------------------------------------------------
import { Dependency, Holiday, ProjectDependency } from '../types';
import { addDays, addWorkingDays, calculateDuration } from './calculationService';

export interface ScheduleInputItem {
  id: string;
  quantity: number;
  manualDuration?: number;
  startDate?: string;
  dailyYield: number; // 0 o undefined = sin rendimiento cargado
  crewSize: number;
  /** Campo legacy, solo para el fallback de resolveDependencies */
  legacyDependencies?: Dependency[];
}

export interface ScheduleResult {
  id: string;
  start: string;
  end: string;
  duration: number;
  /** false si la tarea no tiene rendimiento diario cargado (no se pudo estimar la duración real) */
  hasYield: boolean;
  /** true si la tarea forma parte de un ciclo de dependencias (se programó ignorando sus vínculos) */
  hasCycleError: boolean;
}

/**
 * Normaliza las dependencias del proyecto a un solo modelo.
 * project.dependencies (centralizado) manda; si está vacío, se extrae desde
 * item.dependencies (legacy) para no perder vínculos de datos no migrados.
 */
export function resolveDependencies(
  projectDependencies: ProjectDependency[] | undefined,
  items: { id: string; legacyDependencies?: Dependency[] }[],
): ProjectDependency[] {
  if (projectDependencies && projectDependencies.length > 0) {
    return projectDependencies;
  }
  const extracted: ProjectDependency[] = [];
  items.forEach(item => {
    item.legacyDependencies?.forEach(d => {
      extracted.push({
        id: `${item.id}-${d.predecessorId}`,
        fromTaskId: d.predecessorId,
        toTaskId: item.id,
        type: d.type,
        lag: d.lag,
      });
    });
  });
  return extracted;
}

/**
 * Orden topológico (Kahn) sobre los ítems del proyecto.
 * Los ítems que no se pueden ordenar (forman parte de un ciclo) se devuelven
 * aparte en `cyclic`, en vez de desaparecer silenciosamente del resultado.
 */
export function topologicalOrder(
  itemIds: string[],
  dependencies: ProjectDependency[],
): { order: string[]; cyclic: string[] } {
  const idSet = new Set(itemIds);
  const inDegree = new Map<string, number>(itemIds.map(id => [id, 0]));
  const adjacency = new Map<string, string[]>(itemIds.map(id => [id, []]));

  dependencies.forEach(dep => {
    if (!idSet.has(dep.fromTaskId) || !idSet.has(dep.toTaskId) || dep.fromTaskId === dep.toTaskId) return;
    adjacency.get(dep.fromTaskId)!.push(dep.toTaskId);
    inDegree.set(dep.toTaskId, (inDegree.get(dep.toTaskId) || 0) + 1);
  });

  const queue = itemIds.filter(id => inDegree.get(id) === 0);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    adjacency.get(id)!.forEach(nextId => {
      const deg = (inDegree.get(nextId) ?? 0) - 1;
      inDegree.set(nextId, deg);
      if (deg === 0) queue.push(nextId);
    });
  }

  const ordered = new Set(order);
  const cyclic = itemIds.filter(id => !ordered.has(id));
  return { order, cyclic };
}

/**
 * Forward pass: calcula start/end/duration por ítem, respetando dependencias
 * Fin-Comienzo (únicos tipos soportados hoy; SS/FF/SF y lag quedan diferidos:
 * se tratan como FS sin desfase).
 *
 * Los ítems sin tarea asociada no deberían llegar aquí: el filtrado por
 * `task` existente se hace antes de construir `ScheduleInputItem[]`.
 */
export function computeSchedule(
  items: ScheduleInputItem[],
  dependencies: ProjectDependency[],
  projectStartDate: string,
  workingDays: number[],
  nonWorkingDates: Holiday[],
): Map<string, ScheduleResult> {
  const itemsById = new Map(items.map(i => [i.id, i]));
  const itemIds = items.map(i => i.id);
  const { order, cyclic } = topologicalOrder(itemIds, dependencies);
  const cyclicSet = new Set(cyclic);

  const depsByTarget = new Map<string, ProjectDependency[]>();
  dependencies.forEach(dep => {
    if (!depsByTarget.has(dep.toTaskId)) depsByTarget.set(dep.toTaskId, []);
    depsByTarget.get(dep.toTaskId)!.push(dep);
  });

  const results = new Map<string, ScheduleResult>();

  const processOne = (id: string) => {
    const item = itemsById.get(id);
    if (!item) return;

    const hasYield = !!item.dailyYield && item.dailyYield > 0;
    const duration = item.manualDuration || calculateDuration(item.quantity, item.dailyYield, item.crewSize);

    let startDate = item.startDate || projectStartDate;
    // Un ítem cíclico se programa ignorando sus vínculos (fallback seguro):
    // sigue apareciendo en el resultado, marcado con hasCycleError.
    const deps = cyclicSet.has(id) ? [] : (depsByTarget.get(id) || []);

    deps.forEach(dep => {
      const pred = results.get(dep.fromTaskId);
      if (!pred) return; // predecesor fuera del set de ítems o aún sin programar
      const candidateStart = addDays(pred.end, 1); // FS, lag=0 (SS/FF/SF/lag: diferido)
      // Comparación lexicográfica segura: ambas son fechas "YYYY-MM-DD" con padding.
      if (candidateStart > startDate) startDate = candidateStart;
    });

    // Encaja en día hábil: si startDate ya es hábil queda igual, si no avanza al próximo.
    const snappedStart = addWorkingDays(startDate, 1, workingDays, nonWorkingDates);
    const end = addWorkingDays(snappedStart, duration, workingDays, nonWorkingDates);

    results.set(id, { id, start: snappedStart, end, duration, hasYield, hasCycleError: cyclicSet.has(id) });
  };

  order.forEach(processOne);
  cyclic.forEach(processOne);

  return results;
}
