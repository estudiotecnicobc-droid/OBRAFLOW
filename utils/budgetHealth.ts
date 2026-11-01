// Salud del presupuesto: detecta datos faltantes y números que no cierran.
// Función pura (sin React ni Supabase) para poder testearla.

export interface HealthRow {
  itemId: string;
  /** Tarea del catálogo (para detectar repetidas). */
  taskId?: string;
  /** Rubro donde se muestra el ítem (para comparar precios entre ítems equivalentes). */
  rubro?: string;
  name: string;
  unit: string;
  quantity: number;
  /** Costo directo unitario (materiales + equipos + fijos + mano de obra). */
  unitCost: number;
  /** Parte de mano de obra del costo unitario. */
  unitLabor?: number;
  /** Costo directo total del ítem. */
  total: number;
  /** El APU tiene recursos faltantes o sin precio. */
  apuHasMissing: boolean;
  /** Total de la planilla de medición, si el ítem tiene planilla. */
  measuredQuantity?: number;
}

export type HealthIssueId =
  | 'sin_precio'
  | 'posible_coma'
  | 'cantidad_cero'
  | 'apu_incompleto'
  | 'medido_distinto'
  | 'concentracion'
  | 'desproporcion'
  | 'pu_atipico'
  | 'repetida'
  | 'sin_mano_obra';

export interface HealthIssue {
  id: HealthIssueId;
  level: 'error' | 'warning';
  /** Texto de la franja, ya con la cantidad de ítems. */
  title: string;
  /** Qué hacer, en una línea. */
  hint: string;
  itemIds: string[];
}

const EPS = 0.005;
/** Un ítem que se lleva más de esta fracción del costo directo merece una revisión. */
export const CONCENTRATION_SHARE = 0.5;
/** Mínimo de ítems para evaluar la concentración (en presupuestos chicos es normal). */
export const CONCENTRATION_MIN_ITEMS = 5;
/** Cantidad máxima razonable por m² de superficie de la obra, según la unidad del ítem. */
/** Un P.U. que se aparta más de este factor de la mediana de su grupo (mismo rubro y unidad) es atípico. */
export const PU_OUTLIER_FACTOR = 5;
/** Mínimo de precios distintos en el grupo para comparar. */
export const PU_OUTLIER_MIN_GROUP = 4;
export const MAX_QTY_PER_SURFACE: Record<'m2' | 'm3' | 'ml', number> = { m2: 12, m3: 3, ml: 25 };

/** «m²», «M2», «m2.» → «m2»; «m», «ml», «m.l.» → «ml». */
export function normalizeUnit(unit: string): 'm2' | 'm3' | 'ml' | null {
  const u = (unit || '').toLowerCase().replace(/[.\s]/g, '').replace('²', '2').replace('³', '3');
  if (u === 'm2') return 'm2';
  if (u === 'm3') return 'm3';
  if (u === 'm' || u === 'ml') return 'ml';
  return null;
}

/** La cantidad es la de la planilla multiplicada por 10, 100 o 1000 (típico de «2,5» leído como 25). */
export function looksLikeCommaError(quantity: number, measured: number): boolean {
  if (!(measured > 0) || !(quantity > 0)) return false;
  const ratio = quantity / measured;
  return [10, 100, 1000].some(f => Math.abs(ratio - f) / f < 0.01);
}

/** Valor central (cantidad impar) o los dos valores centrales (cantidad par). */
const middleValues = (xs: number[]): number[] => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? [s[m]] : [s[m - 1], s[m]];
};

/**
 * Ítems cuyo P.U. se aparta más de `PU_OUTLIER_FACTOR` veces de los demás ítems de su rubro y unidad.
 * Se compara cada precio con el centro de los OTROS precios distintos del grupo: así una tarea
 * repetida (tres ítems con el mismo P.U.) cuenta una sola vez y no arrastra la referencia.
 */
export function findUnitPriceOutliers(rows: HealthRow[]): string[] {
  const groups = new Map<string, HealthRow[]>();
  for (const r of rows) {
    if (!(r.unitCost > 0) || !r.rubro) continue;
    const key = `${r.rubro}|${normalizeUnit(r.unit) ?? (r.unit || '').toLowerCase().trim()}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const cents = (x: number) => Math.round(x * 100);
  const out: string[] = [];
  for (const g of groups.values()) {
    const distinct = [...new Set(g.map(r => cents(r.unitCost)))];
    if (distinct.length < PU_OUTLIER_MIN_GROUP) continue;
    for (const r of g) {
      const own = cents(r.unitCost);
      const refs = middleValues(distinct.filter(c => c !== own));
      // Con dos valores centrales (grupos con dos niveles de precio) se compara con el más cercano:
      // solo es atípico lo que está lejos de ambos.
      const deviation = Math.min(...refs.map(ref => Math.max(own / ref, ref / own)));
      if (deviation > PU_OUTLIER_FACTOR) out.push(r.itemId);
    }
  }
  return out;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Clave de un aviso descartado por el usuario para un ítem. */
export const ignoreKey = (issueId: HealthIssueId, itemId: string) => `${issueId}:${itemId}`;

export function analyzeBudgetHealth(
  rows: HealthRow[],
  opts: { surface?: number; ignored?: ReadonlySet<string> } = {},
): HealthIssue[] {
  const ids = (pred: (r: HealthRow) => boolean) => rows.filter(pred).map(r => r.itemId);
  const issues: HealthIssue[] = [];
  const push = (issue: Omit<HealthIssue, 'title'> & { title: (n: number) => string }) => {
    const itemIds = opts.ignored ? issue.itemIds.filter(id => !opts.ignored!.has(ignoreKey(issue.id, id))) : issue.itemIds;
    if (itemIds.length) issues.push({ ...issue, itemIds, title: issue.title(itemIds.length) });
  };

  const isOutOfSync = (r: HealthRow) =>
    r.measuredQuantity !== undefined && Math.abs(r.measuredQuantity - r.quantity) > EPS;
  const isComma = (r: HealthRow) =>
    r.measuredQuantity !== undefined && looksLikeCommaError(r.quantity, r.measuredQuantity);

  push({
    id: 'sin_precio', level: 'error',
    itemIds: ids(r => r.quantity > 0 && !(r.unitCost > 0)),
    title: n => `${plural(n, 'ítem', 'ítems')} sin precio`,
    hint: 'Suman $0 al total. Revisá el análisis de precio de la tarea.',
  });
  push({
    id: 'posible_coma', level: 'error',
    itemIds: ids(isComma),
    title: n => `${plural(n, 'cantidad parece', 'cantidades parecen')} multiplicada${n === 1 ? '' : 's'} por 10, 100 o 1000`,
    hint: 'Puede ser un decimal mal cargado (por ejemplo, 25 en lugar de 2,5). Compará con la planilla de medición.',
  });
  push({
    id: 'cantidad_cero', level: 'warning',
    itemIds: ids(r => !(r.quantity > 0)),
    title: n => `${plural(n, 'ítem', 'ítems')} con cantidad 0`,
    hint: 'No suman al presupuesto. Cargá la cantidad o eliminalos.',
  });
  push({
    id: 'apu_incompleto', level: 'warning',
    itemIds: ids(r => r.apuHasMissing && r.unitCost > 0),
    title: n => `${plural(n, 'ítem', 'ítems')} con recursos sin precio en su análisis`,
    hint: 'El costo queda por debajo del real. Cargá los precios en el catálogo o en Personal y cuadrillas.',
  });
  push({
    id: 'medido_distinto', level: 'warning',
    itemIds: ids(r => isOutOfSync(r) && !isComma(r)),
    title: n => `${plural(n, 'cantidad no coincide', 'cantidades no coinciden')} con su planilla de medición`,
    hint: 'Abrí la planilla y tocá «Usar la planilla», o ajustá las líneas.',
  });

  const outliers = new Set(findUnitPriceOutliers(rows));
  push({
    id: 'pu_atipico', level: 'warning',
    itemIds: ids(r => outliers.has(r.itemId)),
    title: n => `${plural(n, 'precio unitario muy distinto', 'precios unitarios muy distintos')} de ítems similares del mismo rubro`,
    hint: `Su P.U. es más de ${PU_OUTLIER_FACTOR} veces mayor o menor que el de los demás ítems del rubro en la misma unidad. Revisá el análisis de precio.`,
  });

  const taskCount = new Map<string, number>();
  for (const r of rows) if (r.taskId) taskCount.set(r.taskId, (taskCount.get(r.taskId) ?? 0) + 1);
  push({
    id: 'repetida', level: 'warning',
    itemIds: ids(r => !!r.taskId && (taskCount.get(r.taskId) ?? 0) > 1),
    title: n => `${plural(n, 'ítem repite', 'ítems repiten')} una tarea que ya está en el presupuesto`,
    hint: 'Si es intencional (por ejemplo, por sector), conviene diferenciar el nombre. El calculador no actualiza tareas repetidas.',
  });

  push({
    id: 'sin_mano_obra', level: 'warning',
    itemIds: ids(r => r.quantity > 0 && r.unitCost > 0 && r.unitLabor !== undefined && !(r.unitLabor > 0)),
    title: n => `${plural(n, 'ítem', 'ítems')} sin mano de obra`,
    hint: 'Si la tarea es solo provisión de materiales o un subcontrato, ignoralo; si no, cargá la cuadrilla en su análisis.',
  });

  const grand = rows.reduce((s, r) => s + (r.total > 0 ? r.total : 0), 0);
  if (rows.length >= CONCENTRATION_MIN_ITEMS && grand > 0) {
    push({
      id: 'concentracion', level: 'warning',
      itemIds: ids(r => r.total / grand > CONCENTRATION_SHARE),
      title: () => 'Un ítem concentra más de la mitad del costo directo',
      hint: 'Puede ser correcto, pero conviene revisar su cantidad y su precio.',
    });
  }

  const surface = opts.surface ?? 0;
  if (surface > 0) {
    push({
      id: 'desproporcion', level: 'warning',
      itemIds: ids(r => {
        const u = normalizeUnit(r.unit);
        return !!u && r.quantity > surface * MAX_QTY_PER_SURFACE[u];
      }),
      title: n => `${plural(n, 'cantidad parece', 'cantidades parecen')} excesiva${n === 1 ? '' : 's'} para una obra de ${surface.toLocaleString('es-AR')} m²`,
      hint: 'Revisá la cantidad y la unidad del ítem.',
    });
  }

  return issues;
}
