// ---------------------------------------------------------------------------
// planVsReal — compara el cronograma actual contra una línea base (Etapa C1).
// Puro, sin React: recibe las fechas de fin actuales y las de la línea base y
// devuelve el resumen que muestra la banda "Plan vs Real" del Gantt.
// Los desfases se miden en días corridos (la tolerancia % llega en C3).
// ---------------------------------------------------------------------------

export interface PlanVsRealItem {
  id: string;
  name: string;
  end: string; // YYYY-MM-DD
}

export type PlanVsRealStatus = 'ok' | 'warning' | 'late';

export interface PlanVsRealSummary {
  /** Días corridos que se movió el fin de obra respecto de la base (negativo = adelantado). */
  projectDelayDays: number;
  late: number;
  early: number;
  onTime: number;
  /** Tarea con mayor atraso (solo si hay alguna atrasada). */
  maxDelay: { id: string; name: string; days: number } | null;
  status: PlanVsRealStatus;
}

const DAY_MS = 86400000;

const toUtcDay = (ymd: string): number => {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

const diffDays = (from: string, to: string): number => Math.round((toUtcDay(to) - toUtcDay(from)) / DAY_MS);

export function comparePlanVsReal(current: PlanVsRealItem[], baseline: PlanVsRealItem[]): PlanVsRealSummary {
  const baseById = new Map(baseline.map(b => [b.id, b]));
  let late = 0;
  let early = 0;
  let onTime = 0;
  let maxDelay: PlanVsRealSummary['maxDelay'] = null;

  current.forEach(item => {
    const base = baseById.get(item.id);
    if (!base) return;
    const delta = diffDays(base.end, item.end);
    if (delta > 0) {
      late++;
      if (!maxDelay || delta > maxDelay.days) maxDelay = { id: item.id, name: item.name, days: delta };
    } else if (delta < 0) {
      early++;
    } else {
      onTime++;
    }
  });

  const latestEnd = (items: PlanVsRealItem[]) =>
    items.reduce<string | null>((max, i) => (max == null || toUtcDay(i.end) > toUtcDay(max) ? i.end : max), null);
  const currentEnd = latestEnd(current);
  const baseEnd = latestEnd(baseline);
  const projectDelayDays = currentEnd && baseEnd ? diffDays(baseEnd, currentEnd) : 0;

  const status: PlanVsRealStatus = projectDelayDays > 0 ? 'late' : late > 0 ? 'warning' : 'ok';

  return { projectDelayDays, late, early, onTime, maxDelay, status };
}
