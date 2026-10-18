import { Material, Task, TaskYield, TaskToolYield, Tool, UnitPriceAnalysis, Holiday, TaskCrewYield, Crew, LaborCategory, TaskLaborYield } from '../types';

// Helper to calculate labor cost total (with social charges)
const calculateHourlyLaborCost = (lc: LaborCategory) => {
    return (lc.basicHourlyRate || 0) * (1 + ((lc.socialChargesPercent || 0) + (lc.insurancePercent || 0)) / 100);
};

// Optimized Calculation using Maps/Indexes for O(1) access
export const calculateUnitPrice = (
  task: Task,
  yieldsIndex: Record<string, TaskYield[]>,
  materialsMap: Record<string, Material>,
  toolYieldsIndex: Record<string, TaskToolYield[]>,
  toolsMap: Record<string, Tool>,
  taskCrewYieldsIndex?: Record<string, TaskCrewYield[]>,
  crewsMap?: Record<string, Crew>,
  laborCategoriesMap?: Record<string, LaborCategory>,
  workdayHours: number = 9,
  taskLaborYieldsIndex?: Record<string, TaskLaborYield[]>
): UnitPriceAnalysis => {

  const taskYields = yieldsIndex[task.id] || [];
  let totalMaterialCost = 0;
  for (const y of taskYields) {
    const material = materialsMap[y.materialId];
    if (material) totalMaterialCost += (material.cost || 0) * y.quantity;
  }

  const taskToolYields = toolYieldsIndex[task.id] || [];
  let totalToolCost = 0;
  for (const y of taskToolYields) {
    const tool = toolsMap[y.toolId];
    if (tool) totalToolCost += (tool.costPerHour || 0) * y.hoursPerUnit;
  }

  let derivedLaborCost = 0;
  if (taskCrewYieldsIndex && crewsMap && laborCategoriesMap) {
      const crewYields = taskCrewYieldsIndex[task.id] || [];
      for (const cy of crewYields) {
          const crew = crewsMap[cy.crewId];
          if (crew) {
              let crewHourlyCost = 0;
              crew.composition.forEach(member => {
                  const category = laborCategoriesMap[member.laborCategoryId];
                  if (category) {
                      const participation = (member.participation ?? 100) / 100;
                      crewHourlyCost += (calculateHourlyLaborCost(category) * member.count * participation);
                  }
              });
              if ((task.dailyYield || 0) > 0) {
                  derivedLaborCost += (crewHourlyCost * workdayHours * cy.quantity) / task.dailyYield;
              }
          }
      }
  }

  if (taskLaborYieldsIndex && laborCategoriesMap) {
      const laborYields = taskLaborYieldsIndex[task.id] || [];
      for (const ly of laborYields) {
          const category = laborCategoriesMap[ly.laborCategoryId];
          if (category) {
               if ((task.dailyYield || 0) > 0) {
                   derivedLaborCost += (calculateHourlyLaborCost(category) * workdayHours * ly.quantity) / task.dailyYield;
               }
          }
      }
  }

  const baseLabor = task.laborCost || 0;
  const laborCost = derivedLaborCost > 0 ? derivedLaborCost : baseLabor;
  const fixedCost = task.fixedCost || 0;

  return {
    taskId: task.id,
    materialCost: Number(totalMaterialCost.toFixed(2)),
    laborCost: Number(laborCost.toFixed(2)),
    toolCost: Number(totalToolCost.toFixed(2)),
    fixedCost: Number(fixedCost.toFixed(2)),
    totalUnitCost: Number((totalMaterialCost + laborCost + totalToolCost + fixedCost).toFixed(2)),
  };
};

export const calculateDuration = (
    quantity: number,
    dailyYield: number,
    crewsAssigned: number = 1,
    efficiencyFactor: number = 1.0,
    allowancePercent: number = 0
): number => {
  if (!dailyYield || dailyYield <= 0) return 1;
  const normalDailyOutput = dailyYield * Math.max(1, crewsAssigned) * efficiencyFactor;
  const effectiveDailyOutput = normalDailyOutput / (1 + (allowancePercent / 100));
  return Math.ceil(quantity / effectiveDailyOutput);
};

export const addDays = (date: string | Date, days: number): string => {
  // Parsear como fecha local para evitar desfase UTC en zonas como Argentina (UTC-3)
  const result = typeof date === 'string' ? new Date(date + 'T00:00:00') : new Date(date);
  result.setDate(result.getDate() + days);
  return localDateString(result);
};

/**
 * Convierte un string "YYYY-MM-DD" a Date anclada a medianoche LOCAL.
 * Usar siempre en vez de `new Date(dateString)` para mostrar o comparar
 * fechas de planificación: `new Date("2026-10-20")` ancla a medianoche UTC,
 * que en zonas negativas (Argentina, UTC-3) se muestra como el día anterior
 * al formatear con `toLocaleDateString()`.
 */
export const toLocalDate = (date: string): Date => new Date(date + 'T00:00:00');

/**
 * Convierte una Date a string YYYY-MM-DD usando la fecha LOCAL (no UTC).
 * Evita el clásico bug de `toISOString()` que convierte a UTC antes de formatear.
 */
const localDateString = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * Agrega días hábiles a una fecha de inicio, salteando fines de semana y feriados.
 * @param startDate String YYYY-MM-DD
 * @param duration Días hábiles a agregar
 * @param workingDays Días permitidos (0=Dom, 1=Lun, ..., 6=Sáb)
 * @param nonWorkingDates Array de objetos Holiday o strings
 */
export const addWorkingDays = (
    startDate: string,
    duration: number,
    workingDays: number[] = [1,2,3,4,5],
    nonWorkingDates: Holiday[] = []
): string => {
    // Parsear como fecha local para que getDay() devuelva el día correcto en UTC-3
    let current = new Date(startDate + 'T00:00:00');
    let daysToAdd = Math.max(0, duration - 1);

    const holidayStrings = new Set(nonWorkingDates.map(h => h.date));

    const isWorkingDay = (d: Date) => {
        const dayOfWeek = d.getDay();
        // Usar fecha local (no UTC) para evitar desfase de un día en zonas negativas
        const dateStr = localDateString(d);
        return workingDays.includes(dayOfWeek) && !holidayStrings.has(dateStr);
    };

    // Si la fecha de inicio cae en un día no hábil, avanzar al próximo hábil
    while (!isWorkingDay(current)) {
        current.setDate(current.getDate() + 1);
    }

    while (daysToAdd > 0) {
        current.setDate(current.getDate() + 1);
        if (isWorkingDay(current)) {
            daysToAdd--;
        }
    }
    return localDateString(current);
};

export const diffDays = (date1: string, date2: string): number => {
  const d1 = new Date(date1 + 'T00:00:00');
  const d2 = new Date(date2 + 'T00:00:00');
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
};
