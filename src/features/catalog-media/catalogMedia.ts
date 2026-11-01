// Imágenes propias del catálogo (public/catalogo). Se asocian por número de
// rubro y por familia de tarea; no dependen de la base de datos.

const RUBRO_IMAGES = new Set(['06', '13', '14']);

export type DetailFamily = 'tabique' | 'cielorraso' | 'revestimiento';

export interface TaskLike {
  code?: string | null;
  name?: string | null;
  category?: string | null;
}

export function rubroNumber(category?: string | null): string | null {
  const m = category?.trim().match(/^(\d{2})\b/);
  return m ? m[1] : null;
}

export function rubroImage(category?: string | null): string | null {
  const n = rubroNumber(category);
  return n && RUBRO_IMAGES.has(n) ? `/catalogo/rubros/${n}.svg` : null;
}

const norm = (s?: string | null) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Familia de detalle técnico; null si la tarea todavía no tiene uno. */
export function detailFamily(task: TaskLike): DetailFamily | null {
  const name = norm(task.name);
  const rubro = rubroNumber(task.category);
  const seco = /durlock|placa de yeso|\bplaca\b|superboard|aquaboard|cedral/.test(name);
  if (!seco) return null;
  if (rubro === '13' || name.includes('cielorraso')) return 'cielorraso';
  if (rubro === '14' || name.includes('revestimiento') || name.includes('revoque seco')) return 'revestimiento';
  if (rubro === '06' || /pared|tabique/.test(name)) return 'tabique';
  return null;
}

export function detailImage(task: TaskLike): string | null {
  const f = detailFamily(task);
  return f ? `/catalogo/detalles/${f}.svg` : null;
}
