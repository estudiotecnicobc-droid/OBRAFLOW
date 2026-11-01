/** Agrupación de rubros oficiales para el índice del presupuesto. */

export interface RubroGroup {
  label: string;
  rubros: string[];
}

const GROUPS: { label: string; codes: number[] }[] = [
  { label: 'Estructura', codes: [1, 2, 3, 4, 5] },
  { label: 'Albañilería', codes: [6, 7, 8, 9, 10, 15, 16] },
  { label: 'Terminaciones', codes: [11, 12, 13, 14, 32, 34] },
  { label: 'Carpinterías', codes: [17, 18, 19, 20, 21, 33] },
  { label: 'Instalaciones', codes: [22, 23, 24, 25, 26, 27, 28, 29, 36, 37] },
  { label: 'Equipamiento y exteriores', codes: [30, 31, 35, 38] },
];
const OTHER_LABEL = 'Otros rubros';

export function rubroCode(rubro: string): number | null {
  const m = rubro.match(/^(\d{2})\s/);
  return m ? Number(m[1]) : null;
}

/** Rubros 90–95: componentes de APU (mezclas, hormigones…), no capítulos del presupuesto. */
export function isAuxiliaryRubro(rubro: string): boolean {
  const code = rubroCode(rubro);
  return code !== null && code >= 90;
}

/** Ordena por código oficial; los rubros sin código van al final, alfabéticos. 'Otros' siempre último. */
export function sortRubros(rubros: Iterable<string>): string[] {
  return [...new Set(rubros)].sort((a, b) => {
    if (a === 'Otros') return 1;
    if (b === 'Otros') return -1;
    const ca = rubroCode(a) ?? 1000;
    const cb = rubroCode(b) ?? 1000;
    return ca !== cb ? ca - cb : a.localeCompare(b, 'es');
  });
}

/** Grupo (etapa) al que pertenece un rubro; sin código → «Otros rubros». */
export function rubroGroupLabel(rubro: string): string {
  const code = rubroCode(rubro);
  return GROUPS.find(g => code !== null && g.codes.includes(code))?.label ?? OTHER_LABEL;
}

/** Agrupa rubros en las etapas, en orden de etapa y de código. Con `includeAll`, conserva auxiliares y 'Otros'. */
export function groupRubros(rubros: Iterable<string>, includeAll = false): RubroGroup[] {
  const buckets = new Map<string, string[]>();
  for (const r of sortRubros(rubros)) {
    if (!includeAll && (isAuxiliaryRubro(r) || r === 'Otros')) continue;
    const label = rubroGroupLabel(r);
    if (!buckets.has(label)) buckets.set(label, []);
    buckets.get(label)!.push(r);
  }
  return [...GROUPS.map(g => g.label), OTHER_LABEL]
    .filter(l => buckets.has(l))
    .map(label => ({ label, rubros: buckets.get(label)! }));
}

export type RubroIndexView = 'codigo' | 'etapas' | 'incidencia';

export interface RubroSection<T> {
  label: string;
  amount: number;
  entries: T[];
}

/**
 * Ordena rubros según la vista: por código, agrupados por etapa (con subtotal)
 * o por monto descendente. Comparte el orden entre índice y tabla.
 */
export function arrangeRubros<T extends { rubro: string; amount: number }>(
  entries: T[], view: RubroIndexView,
): RubroSection<T>[] {
  const total = entries.reduce((s, e) => s + e.amount, 0);
  const byRubro = new Map<string, T>(entries.map(e => [e.rubro, e]));
  const byCode = sortRubros(entries.map(e => e.rubro));
  if (view === 'incidencia') {
    const pos = new Map(byCode.map((r, i) => [r, i]));
    const sorted = [...entries].sort((a, b) => b.amount - a.amount || pos.get(a.rubro)! - pos.get(b.rubro)!);
    return [{ label: '', amount: total, entries: sorted }];
  }
  if (view === 'etapas') {
    return groupRubros(byCode, true).map(g => {
      const groupEntries = g.rubros.map(r => byRubro.get(r)!);
      return { label: g.label, amount: groupEntries.reduce((s, e) => s + e.amount, 0), entries: groupEntries };
    });
  }
  return [{ label: '', amount: total, entries: byCode.map(r => byRubro.get(r)!) }];
}
const VIEW_KEY = 'obraflow:budget-index-view';

export function loadIndexView(): { view: RubroIndexView; compact: boolean } {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}');
    const view: RubroIndexView = ['codigo', 'etapas', 'incidencia'].includes(v.view) ? v.view : 'codigo';
    return { view, compact: v.compact === true };
  } catch {
    return { view: 'codigo', compact: false };
  }
}

export function saveIndexView(pref: { view: RubroIndexView; compact: boolean }): void {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(pref));
  } catch {
    /* preferencia visual: si no se guarda, no pasa nada */
  }
}

/** Nombre sin el prefijo numérico, en tipo oración ("06 MAMPOSTERÍA, Y…" → "Mampostería, y…"). */
export function rubroLabel(rubro: string): string {
  const name = rubro.replace(/^\d{2}\s+/, '').trim();
  if (!name) return rubro;
  if (name !== name.toUpperCase()) return name;
  const lower = name.toLocaleLowerCase('es');
  return lower.charAt(0).toLocaleUpperCase('es') + lower.slice(1);
}

const PIN_KEY = (projectId: string) => `obraflow:budget-rubros:${projectId}`;

export function loadPinnedRubros(projectId: string): string[] {
  try {
    const raw = localStorage.getItem(PIN_KEY(projectId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((r): r is string => typeof r === 'string') : [];
  } catch {
    return [];
  }
}

export function savePinnedRubros(projectId: string, rubros: string[]): void {
  try {
    localStorage.setItem(PIN_KEY(projectId), JSON.stringify(rubros));
  } catch (e) {
    console.warn('[rubroGroups] No se pudo guardar la lista de rubros del proyecto', e);
  }
}
