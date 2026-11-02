import type { MeasurementLine } from '../types';

/**
 * Planilla de medición: qué columnas pide cada línea según la unidad del ítem,
 * y cómo se calculan subtotales y total (con líneas que descuentan).
 *
 * Las medidas que la unidad no usa quedan en 1, así la fórmula
 * Largo × Ancho × Alto × Veces sigue valiendo para cualquier unidad.
 */

export type MeasureKind = 'linear' | 'area' | 'volume' | 'count';
export type MeasureField = 'length' | 'width' | 'height';

export interface MeasureColumn {
  field: MeasureField;
  label: string;
}

/** Clasifica la unidad del ítem (acepta m², m2, M2, ml, m.l., m³, un, gl, kg…). */
export function measureKindForUnit(unit: string | undefined | null): MeasureKind {
  const u = (unit ?? '')
    .toLowerCase()
    .replace(/\s|\./g, '')
    .replace('²', '2')
    .replace('³', '3');
  if (u === 'm3' || u === 'mt3' || u === 'mts3') return 'volume';
  if (u === 'm2' || u === 'mt2' || u === 'mts2') return 'area';
  if (u === 'ml' || u === 'm' || u === 'mt' || u === 'mts' || u === 'mlineal') return 'linear';
  return 'count';
}

const COLUMNS: Record<MeasureKind, MeasureColumn[]> = {
  linear: [{ field: 'length', label: 'Largo' }],
  area: [
    { field: 'length', label: 'Largo' },
    { field: 'width', label: 'Ancho / alto' },
  ],
  volume: [
    { field: 'length', label: 'Largo' },
    { field: 'width', label: 'Ancho' },
    { field: 'height', label: 'Alto' },
  ],
  count: [{ field: 'length', label: 'Cantidad' }],
};

const EXTRA_LABEL: Record<MeasureField, string> = { length: 'Largo', width: 'Ancho', height: 'Alto' };

/**
 * Columnas de medida a mostrar. Si una planilla vieja tiene en alguna línea un
 * valor distinto de 1 en una medida que la unidad no usa, esa columna se sigue
 * mostrando para que el subtotal no cambie sin que se vea por qué.
 */
export function measureColumns(unit: string | undefined | null, lines: MeasurementLine[] = []): MeasureColumn[] {
  const base = COLUMNS[measureKindForUnit(unit)];
  const shown = new Set(base.map(c => c.field));
  const out = [...base];
  // Las líneas con subtotal escrito a mano no cuentan: sus medidas no participan.
  const computed = lines.filter(l => Math.abs(lineSubtotal(l) - Math.abs(l.subtotal || 0)) <= 0.01);
  (['width', 'height'] as const).forEach(f => {
    if (!shown.has(f) && computed.some(l => Math.abs((l[f] ?? 1) - 1) > 1e-9)) {
      out.push({ field: f, label: EXTRA_LABEL[f] });
    }
  });
  const order: MeasureField[] = ['length', 'width', 'height'];
  return out.sort((a, b) => order.indexOf(a.field) - order.indexOf(b.field));
}

/** Fórmula visible en el encabezado, por ejemplo «Largo × Veces». */
export function measureFormula(columns: MeasureColumn[]): string {
  return [...columns.map(c => c.label), 'Veces'].join(' × ');
}

const round2 = (n: number) => Number(n.toFixed(2));

/** Subtotal de la línea, siempre positivo; el signo lo pone `deduct`. */
export function lineSubtotal(l: Pick<MeasurementLine, 'length' | 'width' | 'height' | 'count'>): number {
  return round2(Math.abs(l.length * l.width * l.height * l.count));
}

/**
 * Aporte de la línea al total: negativo si descuenta. Las planillas anteriores
 * descontaban escribiendo un subtotal negativo; eso se sigue respetando.
 */
export function signedSubtotal(l: Pick<MeasurementLine, 'subtotal' | 'deduct'>): number {
  const s = l.subtotal || 0;
  return l.deduct ? -Math.abs(s) : s;
}

/** Total de la planilla. Nunca baja de 0; `negative` avisa si los descuentos superan a lo medido. */
export function sheetTotal(lines: MeasurementLine[]): { total: number; negative: boolean } {
  const raw = round2(lines.reduce((a, l) => a + signedSubtotal(l), 0));
  return { total: Math.max(0, raw), negative: raw < 0 };
}
