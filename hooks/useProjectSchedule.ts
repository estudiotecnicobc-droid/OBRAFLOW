import { useMemo } from 'react';
import { useERP } from '../context/ERPContext';
import {
  calculateUnitPrice,
  addDays,
  diffDays,
  calculateDuration,
} from '../services/calculationService';
import { computeSchedule, resolveDependencies } from '../services/scheduleEngine';

// ---------------------------------------------------------------------------
// ItemCost — costo por ítem de presupuesto, calculado una sola vez.
// Sirve como base para EVM, ABC (Pareto), certificados y scheduledItems.
// ---------------------------------------------------------------------------
export interface ItemCost {
  /** id del BudgetItem */
  id: string;
  taskId: string;
  /** Nombre de la tarea asociada */
  taskName: string;
  /** Categoría de la tarea */
  category: string;
  unit: string;
  quantity: number;
  /** Precio unitario completo (materiales + mano de obra + equipos) */
  unitCost: number;
  /** = unitCost * quantity */
  totalCost: number;
  /** = totalCost * progress / 100 */
  earnedValue: number;
  progress: number;
}

// ---------------------------------------------------------------------------
// EvmStats — métricas EVM del proyecto.
// ---------------------------------------------------------------------------
export interface EvmStats {
  BAC: number;   // Budget at Completion
  PV:  number;   // Planned Value (a hoy)
  EV:  number;   // Earned Value (a hoy)
  AC:  number;   // Actual Cost (a hoy)
  CV:  number;   // Cost Variance      = EV - AC
  SV:  number;   // Schedule Variance  = EV - PV
  CPI: number;   // Cost Performance Index
  SPI: number;   // Schedule Performance Index
  EAC: number;   // Estimate at Completion
  ETC: number;   // Estimate to Complete
  VAC: number;   // Variance at Completion
}

// ---------------------------------------------------------------------------
// ScheduledItem — ítem enriquecido con fechas de inicio/fin (forward pass).
// Incluye los campos temporales earlyStart/earlyFinish para CPM.
// ---------------------------------------------------------------------------
export interface ScheduledItem {
  // Todos los campos del BudgetItem original
  id: string;
  taskId: string;
  index: number;
  // Campos computados
  taskName: string;
  category: string;
  start: string;
  end: string;
  duration: number;
  yieldHH: number;
  dailyCapacity: number;
  crewSize: number;
  totalCost: number;
  dependencies?: any[];
  // Timestamps para CPM
  earlyStart: number;
  earlyFinish: number;
  /** false si la tarea no tiene rendimiento diario cargado — la duración mostrada no es real */
  hasYield: boolean;
  /** true si la tarea forma parte de un ciclo de dependencias — se programó ignorando sus vínculos */
  hasCycleError: boolean;
  // Resto de campos del BudgetItem (quantity, progress, etc.)
  [key: string]: any;
}

// ---------------------------------------------------------------------------
// CpmItem — ScheduledItem enriquecido con backward pass (CPM completo).
// ---------------------------------------------------------------------------
export interface CpmItem extends ScheduledItem {
  lateStart: number;
  lateFinish: number;
  totalFloat: number;
  isCritical: boolean;
}

// ---------------------------------------------------------------------------
// CriticalPathStats — resumen del camino crítico.
// ---------------------------------------------------------------------------
export interface CriticalPathStats {
  finishDate: Date;
  totalDays: number;
}

// ---------------------------------------------------------------------------
// useProjectSchedule
//
// Fuente de verdad compartida para costos, EVM y cronograma.
// Centraliza todos los cálculos derivados de project.items para que
// Planning y ManagementPanel consuman los mismos datos sin recalcular.
// ---------------------------------------------------------------------------
export function useProjectSchedule() {
  const {
    project,
    tasks,
    receptions,
    yieldsIndex,
    materialsMap,
    toolYieldsIndex,
    toolsMap,
    taskCrewYieldsIndex,
    crewsMap,
    laborCategoriesMap,
    taskLaborYieldsIndex,
  } = useERP();

  const workdayHours    = project.workdayHours    || 9;
  const workingDays     = project.workingDays      || [1, 2, 3, 4, 5];
  const nonWorkingDates = project.nonWorkingDates  || [];

  // -------------------------------------------------------------------------
  // itemCosts: un registro por BudgetItem con unitCost, totalCost, earnedValue.
  // Se calcula UNA SOLA VEZ y es consumido por evm, abcAnalysis, certificados
  // y scheduledItems (evita rellamar calculateUnitPrice en el forward pass).
  // -------------------------------------------------------------------------
  const itemCosts = useMemo((): ItemCost[] => {
    return project.items.flatMap(item => {
      const task = tasks.find(t => t.id === item.taskId);
      if (!task) return [];

      const analysis = calculateUnitPrice(
        task,
        yieldsIndex,
        materialsMap,
        toolYieldsIndex,
        toolsMap,
        taskCrewYieldsIndex,
        crewsMap,
        laborCategoriesMap,
        workdayHours,
        taskLaborYieldsIndex,
      );

      const unitCost    = analysis.totalUnitCost;
      const totalCost   = unitCost * item.quantity;
      const progress    = item.progress || 0;
      const earnedValue = totalCost * (progress / 100);

      return [{
        id:        item.id,
        taskId:    item.taskId,
        taskName:  task.name,
        category:  task.category || 'Sin Categoría',
        unit:      task.unit,
        quantity:  item.quantity,
        unitCost,
        totalCost,
        earnedValue,
        progress,
      }];
    });
  }, [
    project.items,
    tasks,
    yieldsIndex,
    materialsMap,
    toolYieldsIndex,
    toolsMap,
    taskCrewYieldsIndex,
    crewsMap,
    laborCategoriesMap,
    workdayHours,
    taskLaborYieldsIndex,
  ]);

  // -------------------------------------------------------------------------
  // evm: métricas EVM globales derivadas de itemCosts + receptions.
  //
  // PV usa item.startDate + calculateDuration para respetar el plan guardado.
  // AC = materiales reales (receptions) + mano de obra/equipos inferida de EV.
  // -------------------------------------------------------------------------
  const evm = useMemo((): EvmStats => {
    const today = new Date();

    let BAC      = 0;
    let PV_Total = 0;
    let EV_Total = 0;

    project.items.forEach(item => {
      const ic = itemCosts.find(c => c.id === item.id);
      if (!ic) return;

      BAC      += ic.totalCost;
      EV_Total += ic.earnedValue;

      // PV: fracción planeada a completar hasta hoy (interpolación lineal)
      const task      = tasks.find(t => t.id === item.taskId);
      const startDate = new Date(item.startDate || project.startDate);
      const duration  = item.manualDuration ||
        calculateDuration(item.quantity, task?.dailyYield ?? 1, item.crewsAssigned || 1);
      const endDate   = new Date(addDays(startDate, duration));

      if (today >= endDate) {
        PV_Total += ic.totalCost;
      } else if (today > startDate) {
        const totalTime   = endDate.getTime()  - startDate.getTime();
        const elapsedTime = today.getTime()     - startDate.getTime();
        const pct         = Math.min(1, Math.max(0, elapsedTime / totalTime));
        PV_Total += ic.totalCost * pct;
      }
    });

    // AC — materiales reales de recepciones
    let acMaterials = 0;
    receptions.forEach(r => {
      r.items.forEach(ri => {
        const mat = materialsMap[ri.materialId];
        if (mat) acMaterials += mat.cost * ri.quantityReceived;
      });
    });

    // AC — mano de obra y equipos inferida de EV (sin planillas de horas en este MVP)
    let evLaborAndTools = 0;
    project.items.forEach(item => {
      const ic = itemCosts.find(c => c.id === item.id);
      if (!ic) return;
      const task = tasks.find(t => t.id === item.taskId);
      if (!task) return;

      const analysis = calculateUnitPrice(
        task,
        yieldsIndex,
        materialsMap,
        toolYieldsIndex,
        toolsMap,
        taskCrewYieldsIndex,
        crewsMap,
        laborCategoriesMap,
        workdayHours,
        taskLaborYieldsIndex,
      );
      const nonMatCost = (analysis.laborCost + analysis.toolCost) * item.quantity;
      evLaborAndTools += nonMatCost * (ic.progress / 100);
    });

    const AC_Total = acMaterials + evLaborAndTools;

    const CV  = EV_Total - AC_Total;
    const SV  = EV_Total - PV_Total;
    const CPI = AC_Total > 0 ? EV_Total / AC_Total : 1;
    const SPI = PV_Total > 0 ? EV_Total / PV_Total : 1;
    const EAC = CPI > 0 ? BAC / CPI : BAC;
    const ETC = EAC - AC_Total;
    const VAC = BAC - EAC;

    return { BAC, PV: PV_Total, EV: EV_Total, AC: AC_Total, CV, SV, CPI, SPI, EAC, ETC, VAC };
  }, [
    itemCosts,
    project.items,
    project.startDate,
    tasks,
    receptions,
    materialsMap,
    yieldsIndex,
    toolYieldsIndex,
    toolsMap,
    taskCrewYieldsIndex,
    crewsMap,
    laborCategoriesMap,
    workdayHours,
    taskLaborYieldsIndex,
  ]);

  // -------------------------------------------------------------------------
  // dependencies: modelo centralizado (project.dependencies), con fallback a
  // datos legacy no migrados (item.dependencies). Única fuente de verdad
  // para scheduledItems y cpmItems — ver services/scheduleEngine.ts.
  // -------------------------------------------------------------------------
  const dependencies = useMemo(
    () => resolveDependencies(project.dependencies, project.items.map(item => ({ id: item.id, legacyDependencies: item.dependencies }))),
    [project.dependencies, project.items],
  );

  // -------------------------------------------------------------------------
  // scheduledItems: forward pass del motor de scheduling (services/scheduleEngine).
  //
  // Resuelve dependencias FS en orden topológico (con detección de ciclos),
  // encaja fechas en días hábiles y calcula start/end/duration por ítem.
  // El costo se toma de itemCosts (ya calculado) en lugar de volver a llamar
  // calculateUnitPrice.
  // -------------------------------------------------------------------------
  const scheduledItems = useMemo((): ScheduledItem[] => {
    const items = project.items.map((item, index) => ({ ...item, index: index + 1 }));

    const schedule = computeSchedule(
      items.flatMap(item => {
        const task = tasks.find(t => t.id === item.taskId);
        if (!task) return [];
        return [{
          id: item.id,
          quantity: item.quantity || 0,
          manualDuration: item.manualDuration,
          startDate: item.startDate,
          dailyYield: task.dailyYield,
          crewSize: item.crewsAssigned || 1,
        }];
      }),
      dependencies,
      project.startDate,
      workingDays,
      nonWorkingDates,
    );

    const results: ScheduledItem[] = [];
    items.forEach(item => {
      const task = tasks.find(t => t.id === item.taskId);
      if (!task) return;
      const sched = schedule.get(item.id);
      if (!sched) return;

      const crewSize      = item.crewsAssigned || 1;
      const dailyCapacity = task.dailyYield * crewSize;
      const ic            = itemCosts.find(c => c.id === item.id);

      results.push({
        ...item,
        taskName:     task.name,
        category:     task.category || 'Sin Categoría',
        start:        sched.start,
        end:          sched.end,
        duration:     sched.duration,
        hasYield:     sched.hasYield,
        hasCycleError: sched.hasCycleError,
        yieldHH:      task.yieldHH || 0,
        dailyCapacity,
        crewSize,
        totalCost:    ic?.totalCost ?? 0,
        earlyStart:   new Date(sched.start + 'T00:00:00').getTime(),
        earlyFinish:  new Date(sched.end + 'T00:00:00').getTime(),
      });
    });

    return results.sort((a, b) => a.earlyStart - b.earlyStart);
  }, [
    project.items,
    project.startDate,
    dependencies,
    tasks,
    itemCosts,
    workingDays,
    nonWorkingDates,
  ]);

  // -------------------------------------------------------------------------
  // cpmItems: backward pass — calcula lateStart/lateFinish/float/isCritical.
  // Depende solo de scheduledItems (ya incluye earlyStart/earlyFinish).
  // -------------------------------------------------------------------------
  const cpmItems = useMemo((): CpmItem[] => {
    if (scheduledItems.length === 0) return [];

    const projectFinish = Math.max(...scheduledItems.map(i => i.earlyFinish));

    const itemMap = new Map<string, CpmItem>(
      scheduledItems.map(i => [i.id, { ...i, lateStart: 0, lateFinish: 0, totalFloat: 0, isCritical: false }])
    );

    // Construir mapa de sucesores a partir del modelo centralizado de dependencias
    const successors: Record<string, string[]> = {};
    scheduledItems.forEach(item => {
      if (!successors[item.id]) successors[item.id] = [];
    });
    dependencies.forEach(dep => {
      if (!successors[dep.fromTaskId]) successors[dep.fromTaskId] = [];
      successors[dep.fromTaskId].push(dep.toTaskId);
    });

    // Backward pass (orden inverso por earlyFinish)
    const sortedReverse = [...scheduledItems].sort((a, b) => b.earlyFinish - a.earlyFinish);
    sortedReverse.forEach(item => {
      const node           = itemMap.get(item.id)!;
      const itemSuccessors = successors[item.id] || [];

      if (itemSuccessors.length === 0) {
        node.lateFinish = projectFinish;
      } else {
        let minLS = Number.MAX_VALUE;
        itemSuccessors.forEach(succId => {
          const succ = itemMap.get(succId);
          if (succ && succ.lateStart < minLS) minLS = succ.lateStart;
        });
        node.lateFinish = minLS;
      }

      const durationMs  = item.earlyFinish - item.earlyStart;
      node.lateStart    = node.lateFinish - durationMs;

      const float       = (node.lateFinish - node.earlyFinish) / (1000 * 60 * 60 * 24);
      node.totalFloat   = Math.max(0, float);
      node.isCritical   = node.totalFloat < 0.9;
    });

    return Array.from(itemMap.values()).sort((a, b) => a.index - b.index);
  }, [scheduledItems, dependencies]);

  // -------------------------------------------------------------------------
  // criticalPathStats: fecha fin del proyecto y duración total en días.
  // -------------------------------------------------------------------------
  const criticalPathStats = useMemo((): CriticalPathStats => {
    if (cpmItems.length === 0) return { finishDate: new Date(), totalDays: 0 };
    const maxEndDate  = Math.max(...cpmItems.map(i => i.earlyFinish));
    const finishDate  = new Date(maxEndDate);
    const totalDays   = diffDays(project.startDate, finishDate.toISOString().split('T')[0]);
    return { finishDate, totalDays };
  }, [cpmItems, project.startDate]);

  return { itemCosts, evm, scheduledItems, cpmItems, criticalPathStats };
}
