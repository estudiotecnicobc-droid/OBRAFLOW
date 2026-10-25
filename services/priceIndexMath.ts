export interface IndexPoint {
  period: string; // YYYY-MM-01
  value: number;
}

// ─── Cálculo ──────────────────────────────────────────────────────────────────

export const monthOf = (date: string | Date): string => {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return `${date.slice(0, 7)}-01`;
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

/** Último período publicado igual o anterior al mes dado. */
export function latestAtOrBefore(points: IndexPoint[], period: string): IndexPoint | undefined {
  let found: IndexPoint | undefined;
  for (const p of points) {
    if (p.period <= period) found = p;
    else break;
  }
  return found;
}

export function valueAt(points: IndexPoint[], period: string): number | undefined {
  return points.find(p => p.period === period)?.value;
}

/** Coeficiente = índice destino / índice base. */
export function coefficient(points: IndexPoint[], basePeriod: string, targetPeriod: string): number | undefined {
  const base = valueAt(points, basePeriod);
  const target = valueAt(points, targetPeriod);
  if (!base || !target) return undefined;
  return target / base;
}

/** Parsea "2026-09;1234,56" o "09/2026 1234.56" (una fila por línea). */
export function parseIndexPaste(text: string): { period: string; value: number }[] {
  const out: { period: string; value: number }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(\d{4})[-/](\d{1,2})|^(\d{1,2})[-/](\d{4})/);
    if (!m) continue;
    const year = m[1] ?? m[4];
    const month = (m[2] ?? m[3]).padStart(2, '0');
    const rest = line.slice(m[0].length).replace(/^[\s;,\t]+/, '').trim();
    const num = Number(rest.includes(',') ? rest.replace(/\./g, '').replace(',', '.') : rest);
    if (!(num > 0) || Number(month) < 1 || Number(month) > 12) continue;
    out.push({ period: `${year}-${month}-01`, value: num });
  }
  return out;
}

export const formatPeriod = (period: string): string => {
  const [y, m] = period.split('-');
  const names = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${names[Number(m) - 1]} ${y}`;
};
