import type {
  BudgetItem, Crew, LaborCategory, Material, Task, TaskCrewYield, TaskLaborYield, TaskToolYield, TaskYield, Tool,
} from '../../../types';
import { calculateHourlyLaborCost, calculateUnitPrice } from '../../../services/calculationService';
import { piecePurchase } from '../../../utils/purchase';

/** Jornada que usa el motor de precios unitarios (calculateUnitPrice). */
export const WORKDAY_HOURS = 9;

export interface ReportSource {
  items: BudgetItem[];
  tasks: Task[];
  yieldsIndex: Record<string, TaskYield[]>;
  materialsMap: Record<string, Material>;
  toolYieldsIndex: Record<string, TaskToolYield[]>;
  toolsMap: Record<string, Tool>;
  taskLaborYieldsIndex: Record<string, TaskLaborYield[]>;
  laborCategoriesMap: Record<string, LaborCategory>;
  taskCrewYieldsIndex: Record<string, TaskCrewYield[]>;
  crewsMap: Record<string, Crew>;
}

const rubroOf = (task?: Task) => task?.category?.trim() || 'Sin rubro';

const taskIndex = (tasks: Task[]) => new Map(tasks.map(t => [t.id, t]));

// ── Lista de compras ────────────────────────────────────────────────────────

export interface PurchaseLine {
  id: string;
  name: string;
  /** Unidad técnica (la del APU). */
  unit: string;
  /** Cantidad que piden los APU del presupuesto. */
  technicalQty: number;
  /** Cantidad a comprar, redondeada hacia arriba en la unidad de compra. */
  purchaseQty: number;
  purchaseUnit: string;
  /** Precio por unidad técnica. */
  unitCost: number;
  /** Precio por unidad de compra. */
  purchaseUnitCost: number;
  /** Costo de lo que se compra. */
  purchaseCost: number;
  category: string;
  rubros: string[];
}

type Acc = Map<string, { mat: Material; qty: number; rubros: Set<string> }>;

function toPurchaseLine(mat: Material, qty: number, rubros: Set<string>): PurchaseLine {
  const cf = mat.conversionFactor && mat.conversionFactor > 1 ? mat.conversionFactor : 1;
  const purchaseQty = cf > 1 ? Math.ceil(qty / cf - 1e-9) : piecePurchase(mat.unit, qty) ?? Math.ceil(qty - 1e-9);
  const purchaseUnit = cf > 1 ? (mat.commercialUnit || mat.commercialFormat || `${cf} ${mat.unit}`) : mat.unit;
  const purchaseUnitCost = (mat.cost || 0) * cf;
  return {
    id: mat.id,
    name: mat.name,
    unit: mat.unit,
    technicalQty: qty,
    purchaseQty,
    purchaseUnit,
    unitCost: mat.cost || 0,
    purchaseUnitCost,
    purchaseCost: purchaseQty * purchaseUnitCost,
    category: mat.category?.trim() || 'Otros materiales',
    rubros: [...rubros].sort(),
  };
}

const sortLines = (lines: PurchaseLine[]) =>
  lines.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

/**
 * Recorre los materiales de las tareas del presupuesto y los acumula por la
 * clave que devuelve `keyOf` (null = se excluye esa porción).
 */
function accumulate(src: ReportSource, keyOf: (mat: Material, task: Task | undefined) => string | null): Map<string, Acc> {
  const tasks = taskIndex(src.tasks);
  const groups = new Map<string, Acc>();
  for (const item of src.items) {
    const task = tasks.get(item.taskId);
    for (const y of src.yieldsIndex[item.taskId] || []) {
      const mat = src.materialsMap[y.materialId];
      if (!mat) continue;
      const key = keyOf(mat, task);
      if (key === null) continue;
      const qty = y.quantity * (1 + (y.wastePercent || 0) / 100) * item.quantity;
      const acc = groups.get(key) ?? new Map();
      const e = acc.get(mat.id) ?? { mat, qty: 0, rubros: new Set<string>() };
      e.qty += qty;
      e.rubros.add(rubroOf(task));
      acc.set(mat.id, e);
      groups.set(key, acc);
    }
  }
  return groups;
}

const accToLines = (acc: Acc): PurchaseLine[] =>
  sortLines([...acc.values()].filter(e => e.qty > 0).map(({ mat, qty, rubros }) => toPurchaseLine(mat, qty, rubros)));

export function buildPurchaseList(src: ReportSource): PurchaseLine[] {
  return accToLines(accumulate(src, () => '').get('') ?? new Map());
}

// ── Pedido de cotización armado por grupos ──────────────────────────────────

/** Cómo se arma el pedido: por tipo de material, por rubro del presupuesto o por tarea. */
export type QuoteGrouping = 'material' | 'rubro' | 'tarea';

const taskLabel = (task?: Task) =>
  task ? (task.code ? `${task.code} · ${task.name}` : task.name) : 'Tarea sin nombre';

const groupKeyFn = (by: QuoteGrouping) => (mat: Material, task: Task | undefined): string =>
  by === 'material' ? (mat.category?.trim() || 'Otros materiales')
    : by === 'rubro' ? rubroOf(task)
      : taskLabel(task);

export interface QuoteGroupOption { key: string; materials: number }

/** Grupos disponibles para elegir, con cuántos materiales tiene cada uno. */
export function quoteGroupOptions(src: ReportSource, by: QuoteGrouping): QuoteGroupOption[] {
  const fn = groupKeyFn(by);
  return [...accumulate(src, fn).entries()]
    .map(([key, acc]) => ({ key, materials: [...acc.values()].filter(e => e.qty > 0).length }))
    .filter(g => g.materials > 0)
    .sort((a, b) => a.key.localeCompare(b.key, 'es', { numeric: true }));
}

export interface QuoteSection { title?: string; lines: PurchaseLine[] }

/**
 * Líneas del pedido de cotización. Solo entran los grupos de `include`
 * (todos si no se indica). Con `separate`, una sección por grupo y cada
 * material con la cantidad que usa ese grupo; sin `separate`, una sola lista
 * que suma los grupos elegidos y redondea una vez.
 */
export function buildQuoteSections(
  src: ReportSource,
  opts: { by: QuoteGrouping; include?: string[]; separate: boolean },
): QuoteSection[] {
  const fn = groupKeyFn(opts.by);
  const allowed = opts.include ? new Set(opts.include) : null;
  if (!opts.separate) {
    const acc = accumulate(src, (m, t) => (!allowed || allowed.has(fn(m, t)) ? '' : null)).get('');
    return acc ? [{ lines: accToLines(acc) }].filter(s => s.lines.length > 0) : [];
  }
  return [...accumulate(src, (m, t) => { const k = fn(m, t); return !allowed || allowed.has(k) ? k : null; }).entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'es', { numeric: true }))
    .map(([title, acc]) => ({ title, lines: accToLines(acc) }))
    .filter(s => s.lines.length > 0);
}

export function groupBy<T>(rows: T[], key: (r: T) => string): [string, T[]][] {
  const keys: string[] = [];
  const m: Record<string, T[]> = {};
  for (const r of rows) {
    const k = key(r);
    if (!m[k]) { m[k] = []; keys.push(k); }
    m[k].push(r);
  }
  return keys.map(k => [k, m[k]] as [string, T[]]);
}

// ── Mano de obra ────────────────────────────────────────────────────────────

export interface LaborTradeLine {
  role: string;
  hours: number;
  /** Jornales de WORKDAY_HOURS horas. */
  days: number;
  hourlyCost: number;
  cost: number;
}

export interface LaborRubroLine {
  rubro: string;
  hours: number;
  cost: number;
  trades: LaborTradeLine[];
}

export interface LaborBreakdown {
  trades: LaborTradeLine[];
  rubros: LaborRubroLine[];
  totalHours: number;
  totalCost: number;
  /** Costo de mano de obra de tareas sin composición de oficios (precio global). */
  unassignedCost: number;
}

export function buildLaborBreakdown(src: ReportSource): LaborBreakdown {
  const tasks = taskIndex(src.tasks);
  const byRubro = new Map<string, Map<string, { hours: number; hourlyCost: number }>>();
  let unassignedCost = 0;

  const add = (rubro: string, cat: LaborCategory, hours: number) => {
    if (hours <= 0) return;
    const trades = byRubro.get(rubro) ?? new Map();
    const e = trades.get(cat.role) ?? { hours: 0, hourlyCost: calculateHourlyLaborCost(cat) };
    e.hours += hours;
    trades.set(cat.role, e);
    byRubro.set(rubro, trades);
  };

  for (const item of src.items) {
    const task = tasks.get(item.taskId);
    if (!task) continue;
    const rubro = rubroOf(task);
    const perUnit = task.dailyYield > 0 ? WORKDAY_HOURS / task.dailyYield : 0;
    let found = false;
    for (const ly of src.taskLaborYieldsIndex[task.id] || []) {
      const cat = src.laborCategoriesMap[ly.laborCategoryId];
      if (!cat || perUnit === 0) continue;
      add(rubro, cat, perUnit * ly.quantity * item.quantity);
      found = true;
    }
    for (const cy of src.taskCrewYieldsIndex[task.id] || []) {
      const crew = src.crewsMap[cy.crewId];
      if (!crew || perUnit === 0) continue;
      for (const m of crew.composition) {
        const cat = src.laborCategoriesMap[m.laborCategoryId];
        if (!cat) continue;
        add(rubro, cat, perUnit * cy.quantity * m.count * ((m.participation ?? 100) / 100) * item.quantity);
        found = true;
      }
    }
    if (!found && (task.laborCost || 0) > 0) unassignedCost += task.laborCost * item.quantity;
  }

  const toLines = (m: Map<string, { hours: number; hourlyCost: number }>): LaborTradeLine[] =>
    [...m.entries()]
      .map(([role, e]) => ({ role, hours: e.hours, days: e.hours / WORKDAY_HOURS, hourlyCost: e.hourlyCost, cost: e.hours * e.hourlyCost }))
      .sort((a, b) => b.cost - a.cost);

  const total = new Map<string, { hours: number; hourlyCost: number }>();
  const rubros: LaborRubroLine[] = [...byRubro.entries()]
    .map(([rubro, m]) => {
      for (const [role, e] of m) {
        const t = total.get(role) ?? { hours: 0, hourlyCost: e.hourlyCost };
        t.hours += e.hours;
        total.set(role, t);
      }
      const trades = toLines(m);
      return { rubro, trades, hours: trades.reduce((s, t) => s + t.hours, 0), cost: trades.reduce((s, t) => s + t.cost, 0) };
    })
    .sort((a, b) => a.rubro.localeCompare(b.rubro, 'es', { numeric: true }));

  const trades = toLines(total);
  return {
    trades,
    rubros,
    totalHours: trades.reduce((s, t) => s + t.hours, 0),
    totalCost: trades.reduce((s, t) => s + t.cost, 0) + unassignedCost,
    unassignedCost,
  };
}

// ── Fichas de APU ───────────────────────────────────────────────────────────

export interface ApuSheetRow { name: string; unit: string; qty: number; unitCost: number; subtotal: number }

export interface ApuSheet {
  taskId: string;
  code?: string;
  name: string;
  unit: string;
  rubro: string;
  dailyYield: number;
  budgetQty: number;
  materials: ApuSheetRow[];
  labor: ApuSheetRow[];
  equipment: ApuSheetRow[];
  materialCost: number;
  laborCost: number;
  equipmentCost: number;
  fixedCost: number;
  unitCost: number;
}

export function buildApuSheets(src: ReportSource): ApuSheet[] {
  const tasks = taskIndex(src.tasks);
  const qtyByTask = new Map<string, number>();
  for (const item of src.items) qtyByTask.set(item.taskId, (qtyByTask.get(item.taskId) ?? 0) + item.quantity);

  return [...qtyByTask.entries()]
    .map(([taskId, budgetQty]) => tasks.get(taskId) ? { task: tasks.get(taskId)!, budgetQty } : null)
    .filter((x): x is { task: Task; budgetQty: number } => x !== null)
    .map(({ task, budgetQty }) => {
      const a = calculateUnitPrice(task, src.yieldsIndex, src.materialsMap, src.toolYieldsIndex, src.toolsMap,
        src.taskCrewYieldsIndex, src.crewsMap, src.laborCategoriesMap, WORKDAY_HOURS, src.taskLaborYieldsIndex);
      const perUnit = task.dailyYield > 0 ? WORKDAY_HOURS / task.dailyYield : 0;
      const materials = (src.yieldsIndex[task.id] || []).map(y => {
        const m = src.materialsMap[y.materialId];
        return { name: m?.name ?? 'Material sin cargar', unit: m?.unit ?? '-', qty: y.quantity, unitCost: m?.cost ?? 0, subtotal: (m?.cost ?? 0) * y.quantity };
      });
      const labor: ApuSheetRow[] = [];
      for (const ly of src.taskLaborYieldsIndex[task.id] || []) {
        const c = src.laborCategoriesMap[ly.laborCategoryId];
        if (!c) continue;
        const h = perUnit * ly.quantity;
        labor.push({ name: c.role, unit: 'h', qty: h, unitCost: calculateHourlyLaborCost(c), subtotal: h * calculateHourlyLaborCost(c) });
      }
      for (const cy of src.taskCrewYieldsIndex[task.id] || []) {
        const crew = src.crewsMap[cy.crewId];
        for (const m of crew?.composition ?? []) {
          const c = src.laborCategoriesMap[m.laborCategoryId];
          if (!c) continue;
          const h = perUnit * cy.quantity * m.count * ((m.participation ?? 100) / 100);
          labor.push({ name: c.role, unit: 'h', qty: h, unitCost: calculateHourlyLaborCost(c), subtotal: h * calculateHourlyLaborCost(c) });
        }
      }
      const equipment = (src.toolYieldsIndex[task.id] || []).map(ty => {
        const t = src.toolsMap[ty.toolId];
        return { name: t?.name ?? 'Equipo', unit: 'h', qty: ty.hoursPerUnit, unitCost: t?.costPerHour ?? 0, subtotal: (t?.costPerHour ?? 0) * ty.hoursPerUnit };
      });
      return {
        taskId: task.id,
        code: task.code,
        name: task.name,
        unit: task.unit,
        rubro: rubroOf(task),
        dailyYield: task.dailyYield,
        budgetQty,
        materials,
        labor,
        equipment,
        materialCost: a.materialCost,
        laborCost: a.laborCost,
        equipmentCost: a.toolCost,
        fixedCost: a.fixedCost,
        unitCost: a.totalUnitCost,
      };
    })
    .sort((a, b) => a.rubro.localeCompare(b.rubro, 'es', { numeric: true }) || a.name.localeCompare(b.name));
}
