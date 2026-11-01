// Obra de ejemplo: vivienda en planta baja de 70 m² (10,00 × 7,00 m), sistema tradicional con losa de
// viguetas pretensadas. Las cantidades salen de las plantillas por rubro del presupuesto rápido
// (cómputo paramétrico) con las medidas de abajo; la definición se revisó el 01/11/2026.

import { buildRows, defaultValues } from '../quickBudget/engine';
import type { QuickRow, QuickTemplate } from '../quickBudget/types';
import type { MeasurementLine, Project } from '../../../types';

export const DEMO_NAME = 'Casa de ejemplo — vivienda PB 70 m²';

/** Datos de la obra. Las fechas se calculan al crearla. */
export function demoProjectData(today = new Date()): Partial<Project> {
  const start = today.toISOString().split('T')[0];
  const end = new Date(today);
  end.setMonth(end.getMonth() + 8);
  return {
    name: DEMO_NAME,
    client: 'Cliente de ejemplo',
    address: 'Lote de 10 × 30 m (ejemplo)',
    companyName: '',
    startDate: start,
    endDate: end.toISOString().split('T')[0],
    status: 'planning',
    surface: 70,
    constructionSystem: 'Tradicional',
    structureType: 'Hormigón armado',
  };
}

/**
 * Medidas que cambian respecto de los valores por defecto de cada plantilla por rubro
 * (los valores por defecto ya describen una casa de 10 × 7 m). Clave: número de rubro.
 */
export const DEMO_INPUTS: Record<string, Record<string, number>> = {
  '02': { tl: 30 },            // lote de 10 × 30 m
  '03': { rel: 70, hrel: 0.2 }, // relleno bajo contrapiso
  '04': {},
  '05': {},
  '06': { mint: 2 },           // tabiques de ladrillo hueco 12 (tradicional)
  '07': { lint: 16 },          // capa aisladora también bajo muros interiores
  '08': { sintx: 80 },         // revoque de ambas caras de los tabiques
  '09': {},
  '10': {},
  '11': { tp: 2 },             // porcelanato
  '12': {},
  '13': {},
  '14': {},
  '16': {},
  '17': {},
  '18': {},
  '19': {},
  '20': {},
  '21': {},
  '22': {},
  '23': {},
  '25': {},
  '26': {},
  '30': { tac: 2 },            // termotanque a gas
  '31': {},
  '33': {},
  '34': {},
  '35': { ces: 150 },          // césped del resto del lote
  '38': {},
};

/** Tareas que las plantillas suman pero no corresponden a esta obra. */
export const DEMO_EXCLUDED: Record<string, string> = {
  'OF-CUB-008': 'Estructura de techo liviano: la cubierta es azotea sobre losa',
  'OF-PIN-014': 'Hidrolavado de fachada: no corresponde en obra nueva',
  'OF-PIN-150': 'No está en el Catálogo ObraFlow',
};

/** Rubros donde una tarea repetida se descarta (ya está en otro rubro de la obra). */
const SKIP_REPEATED_IN = new Set(['35']);

const rubroNumber = (t: QuickTemplate) => t.name.slice(0, 2);

/** Filas de la obra de ejemplo, en el orden de los rubros, sin excluidas ni repetidas. */
export function buildDemoRows(templates: QuickTemplate[]): QuickRow[] {
  const out: QuickRow[] = [];
  const seen = new Set<string>();
  const ordered = templates
    .filter(t => rubroNumber(t) in DEMO_INPUTS)
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const t of ordered) {
    const num = rubroNumber(t);
    const rows = buildRows(t, { ...defaultValues(t), ...DEMO_INPUTS[num] });
    for (const r of rows) {
      if (!r.included || !(r.quantity > 0)) continue;
      const code = r.task.code ?? '';
      if (code && DEMO_EXCLUDED[code]) continue;
      const key = code || r.task.name;
      if (seen.has(key) && SKIP_REPEATED_IN.has(num)) continue;
      seen.add(key);
      out.push(r);
    }
  }
  return out;
}

type LineDef = Omit<MeasurementLine, 'id' | 'subtotal'> & { subtotal?: number };

/**
 * Planillas de medición de algunos ítems, para que la obra muestre cantidades con origen «Medido».
 * El total de cada planilla pasa a ser la cantidad del ítem.
 */
export const DEMO_SHEETS: Record<string, LineDef[]> = {
  // Excavación para zapatas: 12 bases de 0,80 × 0,80 a 1,20 m
  'OF-EXC-002': [
    { description: 'Bases B1 a B12', length: 0.8, width: 0.8, height: 1.2, count: 12 },
  ],
  // Losa de viguetas pretensadas: planta completa
  'OF-CUB-017': [
    { description: 'Losa sobre planta baja', length: 10, width: 7, height: 1, count: 1 },
  ],
  // Muro de ladrillo hueco 18: perímetro exterior × altura, menos aberturas
  'OF-MAM-002': [
    { description: 'Frente y contrafrente', length: 10, width: 1, height: 2.8, count: 2 },
    { description: 'Laterales', length: 7, width: 1, height: 2.8, count: 2 },
    { description: 'Descuento de aberturas', length: 0, width: 0, height: 0, count: 1, subtotal: -10.55 },
  ],
  // Porcelanato: superficie neta de cada local
  'OF-PIS-102': [
    { description: 'Living, comedor y cocina', length: 6, width: 4.65, height: 1, count: 1 },
    { description: 'Dormitorio 1', length: 3.6, width: 3.2, height: 1, count: 1 },
    { description: 'Dormitorio 2', length: 3.2, width: 3, height: 1, count: 1 },
    { description: 'Baño', length: 2, width: 2.25, height: 1, count: 1 },
    { description: 'Lavadero', length: 1.6, width: 1.5, height: 1, count: 1 },
    { description: 'Circulación', length: 3.19, width: 2, height: 1, count: 1 },
  ],
};

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** Líneas con subtotal calculado (L × A × H × veces, o el subtotal fijado) y su total. */
export function buildSheetLines(defs: LineDef[], newId: () => string): { lines: MeasurementLine[]; total: number } {
  const lines = defs.map(d => ({
    id: newId(),
    description: d.description,
    length: d.length, width: d.width, height: d.height, count: d.count,
    subtotal: round3(d.subtotal ?? d.length * d.width * d.height * d.count),
  }));
  return { lines, total: round3(lines.reduce((s, l) => s + l.subtotal, 0)) };
}
