import { calculateHourlyLaborCost } from '../services/calculationService';
import type { Material, Task, TaskYield, TaskLaborYield, TaskToolYield, Tool, LaborCategory } from '../types';

export interface ApuLine {
  key: string;
  name: string;
  /** Cantidad por unidad de la tarea, ya formateada con su unidad (ej. «0,05 m³», «3 h-h/m³»). */
  detail: string;
  /** Costo por unidad de la tarea. null si falta el recurso o su precio. */
  cost: number | null;
  missing?: string;
}

export interface ApuComposition {
  unit: string;
  materials: ApuLine[];
  labor: ApuLine[];
  tools: ApuLine[];
  /** «1 Oficial + 1,5 Ayudante» */
  crew: string;
  /** Rendimiento diario de la cuadrilla, si existe. */
  dailyYield: number;
  /** Mano de obra cargada como monto global (sin oficios). */
  laborGlobal: number;
  fixed: { label: string; cost: number } | null;
  hasMissing: boolean;
}

const fmtNum = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 3 });

/** «OFICIAL ESPECIALIZADO H° A  » → «Oficial especializado H° A». Respeta nombres ya escritos en minúscula. */
export function prettyName(raw: string): string {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s || s !== s.toUpperCase()) return s;
  const words = s.split(' ').map(w => (/^[A-ZÁÉÍÓÚÑÜ]{3,}$/.test(w) ? w.toLowerCase() : w));
  const joined = words.join(' ');
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

export function buildApuComposition(
  task: Task,
  yields: TaskYield[],
  materialsMap: Record<string, Material>,
  laborYields: TaskLaborYield[],
  laborMap: Record<string, LaborCategory>,
  toolYields: TaskToolYield[],
  toolsMap: Record<string, Tool>,
  workdayHours = 9,
): ApuComposition {
  const unit = task.unit || 'u';
  const dailyYield = task.dailyYield || 0;

  const materials: ApuLine[] = yields.map((y, i) => {
    const m = materialsMap[y.materialId];
    if (!m) return { key: `m${i}`, name: 'Material no encontrado', detail: fmtNum(y.quantity), cost: null, missing: 'No está en los materiales del proyecto' };
    const priced = (m.cost || 0) > 0;
    return {
      key: `m${i}`, name: prettyName(m.name), detail: `${fmtNum(y.quantity)} ${m.unit ?? ''}`.trim(),
      cost: priced ? m.cost * y.quantity : null, missing: priced ? undefined : 'Sin precio',
    };
  });

  const labor: ApuLine[] = laborYields.map((ly, i) => {
    const c = laborMap[ly.laborCategoryId];
    const hh = dailyYield > 0 ? (ly.quantity * workdayHours) / dailyYield : 0;
    const detail = `${fmtNum(ly.quantity)} pers. · ${fmtNum(Number(hh.toFixed(2)))} h-h/${unit}`;
    if (!c) return { key: `l${i}`, name: 'Oficio no encontrado', detail, cost: null, missing: 'Cargalo en Personal y cuadrillas' };
    const rate = calculateHourlyLaborCost(c);
    return { key: `l${i}`, name: prettyName(c.role), detail, cost: rate > 0 && dailyYield > 0 ? rate * hh : null, missing: rate > 0 ? undefined : 'Sin valor hora' };
  });

  const crew = laborYields
    .map(ly => { const c = laborMap[ly.laborCategoryId]; return c ? `${fmtNum(ly.quantity)} ${prettyName(c.role)}` : null; })
    .filter(Boolean)
    .join(' + ');

  const tools: ApuLine[] = toolYields.map((ty, i) => {
    const t = toolsMap[ty.toolId];
    if (!t) return { key: `t${i}`, name: 'Equipo no encontrado', detail: `${fmtNum(ty.hoursPerUnit)} h/${unit}`, cost: null, missing: 'No está en los equipos del proyecto' };
    return { key: `t${i}`, name: prettyName(t.name), detail: `${fmtNum(ty.hoursPerUnit)} h/${unit}`, cost: (t.costPerHour || 0) > 0 ? t.costPerHour * ty.hoursPerUnit : null, missing: (t.costPerHour || 0) > 0 ? undefined : 'Sin precio' };
  });

  const derivedLabor = labor.some(l => l.cost != null);
  const laborGlobal = !derivedLabor && (task.laborCost || 0) > 0 ? task.laborCost : 0;
  const fixed = (task.fixedCost || 0) > 0 ? { label: task.fixedCostDescription?.trim() || 'Costo fijo', cost: task.fixedCost } : null;

  return {
    unit, materials, labor, tools, crew, dailyYield, laborGlobal, fixed,
    hasMissing: [...materials, ...labor, ...tools].some(l => l.missing),
  };
}
