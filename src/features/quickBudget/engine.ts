import type { QuickRow, QuickTemplate, V } from './types';

export function defaultValues(t: QuickTemplate): V {
  return Object.fromEntries(t.inputs.map(i => [i.key, i.default]));
}

/** Medidas + valores calculados, en el orden en que se definen. */
export function evaluate(t: QuickTemplate, inputs: V): { values: V; labels: Record<string, string> } {
  const values: V = { ...inputs };
  const labels: Record<string, string> = {};
  for (const c of t.calcs) {
    const r = c.fn(values);
    if (typeof r === 'string') labels[c.key] = r;
    else values[c.key] = Number.isFinite(r) ? r : 0;
  }
  return { values, labels };
}

const RUBRO_FIX: Record<string, string> = {
  '05 ESTRUCTURA HA': '05 ESTRUCTURAS RESISTENTES',
  '12 ZÓCALOS': '12 ZOCALOS',
};

/** Rubro de ObraFlow donde se carga la tarea (sin la aclaración de opción). */
export function rubroCategory(rubro: string): string {
  const base = rubro.split(' · ')[0].trim();
  return RUBRO_FIX[base] ?? base;
}

const round2 =(x: number) => Math.round(x * 100) / 100;

export function buildRows(t: QuickTemplate, inputs: V): QuickRow[] {
  const { values } = evaluate(t, inputs);
  return t.rubros.flatMap(({ rubro, tasks }) =>
    tasks.map(task => {
      const q = typeof task.qty === 'function' ? task.qty(values) : task.qty;
      const included = typeof task.include === 'function' ? task.include(values) : task.include;
      return { rubro, task, quantity: round2(Math.max(0, Number.isFinite(q) ? q : 0)), included };
    }),
  );
}
