// Salud del presupuesto: detecta datos faltantes y números que no cierran.
// Función pura (sin React ni Supabase) para poder testearla.

export interface HealthRow {
  itemId: string;
  name: string;
  unit: string;
  quantity: number;
  /** Costo directo unitario (materiales + equipos + fijos + mano de obra). */
  unitCost: number;
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
  | 'desproporcion';

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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function analyzeBudgetHealth(rows: HealthRow[], opts: { surface?: number } = {}): HealthIssue[] {
  const ids = (pred: (r: HealthRow) => boolean) => rows.filter(pred).map(r => r.itemId);
  const issues: HealthIssue[] = [];
  const push = (issue: Omit<HealthIssue, 'title'> & { title: (n: number) => string }) => {
    if (issue.itemIds.length) issues.push({ ...issue, title: issue.title(issue.itemIds.length) });
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
