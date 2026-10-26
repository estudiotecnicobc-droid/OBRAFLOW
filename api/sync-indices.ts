// Actualiza solo los índices CAC e ICC INDEC en la tabla price_indices.
// Fuente: planillas públicas de IERIC (Series estadísticas nacionales), que republican
//   · ICC-CAC.xls   → Cámara Argentina de la Construcción: nivel general, materiales y mano de obra
//   · ICC-INDEC.xls → INDEC, variaciones mensuales desde nov-2015 (se encadenan con base oct-2015 = 100)
// La disparan el cron diario de Vercel (Authorization: Bearer CRON_SECRET) o un usuario
// con sesión iniciada en ObraFlow (botón "Buscar actualización ahora").
//
// Variables de entorno (solo en Vercel, nunca en el código):
//   SUPABASE_SERVICE_ROLE_KEY  · clave de servicio de Supabase (escribe en price_indices)
//   CRON_SECRET                · Vercel la envía en las ejecuciones programadas
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY · ya existen para el sitio

import * as XLSX from 'xlsx';

export const config = { maxDuration: 60 };

const IERIC_PAGE = 'https://www.ieric.org.ar/series_estadisticas/series-estadisticas-nacionales/';

export type SyncCode =
  | 'cac_general' | 'cac_materiales' | 'cac_mano_obra'
  | 'icc_general' | 'icc_materiales' | 'icc_mano_obra';

export interface SyncRow { code: SyncCode; period: string; value: number }

const MONTHS: Record<string, string> = {
  ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
  jul: '07', ago: '08', sep: '09', set: '09', oct: '10', nov: '11', dic: '12',
};

const toPeriod = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;

function cellDate(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    // SheetJS arma la fecha en hora local; sumamos 12 h para no caer en el mes anterior.
    return toPeriod(new Date(v.getTime() + 12 * 3600 * 1000));
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const p = XLSX.SSF.parse_date_code(v);
    return `${p.y}-${String(p.m).padStart(2, '0')}-01`;
  }
  return null;
}

/** Hoja "ICC - CAC": fecha | — | nivel general | materiales | mano de obra. */
export function parseCacWorkbook(buf: ArrayBuffer | Uint8Array): SyncRow[] {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const name = wb.SheetNames.find(n => n.trim().toUpperCase() === 'ICC - CAC') ?? wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true });
  const out: SyncRow[] = [];
  for (const r of rows) {
    const period = cellDate(r[0]);
    if (!period) continue;
    const cols: [SyncCode, unknown][] = [['cac_general', r[2]], ['cac_materiales', r[3]], ['cac_mano_obra', r[4]]];
    for (const [code, v] of cols) {
      if (typeof v === 'number' && v > 0) out.push({ code, period, value: Number(v.toFixed(4)) });
    }
  }
  return out;
}

/** Hoja "ICC - Desde Nov 2015": filas por capítulo, columnas por mes con la variación % mensual. */
export function parseIccIndecWorkbook(buf: ArrayBuffer | Uint8Array): SyncRow[] {
  const wb = XLSX.read(buf, { type: 'array' });
  const name = wb.SheetNames.find(n => /desde nov 2015/i.test(n)) ?? wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true });

  const headerIdx = rows.findIndex(r => r.some(c => typeof c === 'string' && /^(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)-\d{2}\*?$/i.test(c.trim())));
  if (headerIdx < 0) throw new Error('ICC INDEC: no se encontró la fila de meses');
  const header = rows[headerIdx];
  const monthCols: { col: number; period: string }[] = [];
  header.forEach((c, col) => {
    const m = typeof c === 'string' && c.trim().match(/^([a-z]{3})-(\d{2})\*?$/i);
    if (m && MONTHS[m[1].toLowerCase()]) monthCols.push({ col, period: `20${m[2]}-${MONTHS[m[1].toLowerCase()]}-01` });
  });

  const chapter = (label: RegExp) => rows.slice(headerIdx + 1).find(r => typeof r[0] === 'string' && label.test(r[0] as string));
  const series: [SyncCode, RegExp][] = [
    ['icc_general', /^nivel general/i],
    ['icc_materiales', /^materiales/i],
    ['icc_mano_obra', /^mano de obra/i],
  ];

  const out: SyncRow[] = [];
  for (const [code, label] of series) {
    const row = chapter(label);
    if (!row) throw new Error(`ICC INDEC: falta la fila ${label}`);
    let level = 100;
    out.push({ code, period: '2015-10-01', value: 100 });
    for (const { col, period } of monthCols) {
      const v = row[col];
      if (typeof v !== 'number') break;
      level = level * (1 + v / 100);
      out.push({ code, period, value: Number(level.toFixed(4)) });
    }
  }
  return out;
}

export function findFileUrl(html: string, fileName: string): string | null {
  const re = new RegExp(`https?://[^"'\\s>]*/${fileName.replace('.', '\\.')}`, 'gi');
  const all = html.match(re);
  return all && all.length ? all[all.length - 1] : null;
}

async function supabaseRest(path: string, init: RequestInit) {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Vercel');
  const r = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r;
}

async function isLoggedUser(token: string): Promise<boolean> {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !anon || !token) return false;
  const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
  return r.ok;
}

async function replaceSeries(rows: SyncRow[], source: string) {
  const codes = [...new Set(rows.map(r => r.code))];
  for (const code of codes) {
    await supabaseRest(`price_indices?code=eq.${code}`, { method: 'DELETE' });
    const payload = rows.filter(r => r.code === code).map(r => ({ ...r, source }));
    await supabaseRest('price_indices', { method: 'POST', body: JSON.stringify(payload), headers: { Prefer: 'return=minimal' } });
  }
}

async function download(url: string): Promise<ArrayBuffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`No se pudo descargar ${url} (${r.status})`);
  return r.arrayBuffer();
}

export default async function handler(req: any, res: any) {
  const auth = String(req.headers?.authorization ?? '');
  const token = auth.replace(/^Bearer\s+/i, '');
  const isCron = !!process.env.CRON_SECRET && token === process.env.CRON_SECRET;
  if (!isCron && !(await isLoggedUser(token))) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }

  const trigger = isCron ? 'cron' : 'manual';
  const details: Record<string, unknown> = {};
  try {
    const page = await (await fetch(IERIC_PAGE)).text();
    const cacUrl = findFileUrl(page, 'ICC-CAC.xls');
    const indecUrl = findFileUrl(page, 'ICC-INDEC.xls');
    if (!cacUrl || !indecUrl) throw new Error('No se encontraron las planillas en la página de IERIC');

    const stamp = new Date().toISOString().slice(0, 10);
    const cac = parseCacWorkbook(await download(cacUrl));
    const icc = parseIccIndecWorkbook(await download(indecUrl));
    if (cac.length < 30 || icc.length < 30) throw new Error('Las planillas vinieron vacías o con otro formato');

    await replaceSeries(cac, `IERIC · ICC-CAC (automático ${stamp})`);
    await replaceSeries(icc, `IERIC · ICC-INDEC (automático ${stamp})`);

    const last = (rows: SyncRow[], code: SyncCode) => rows.filter(r => r.code === code).map(r => r.period).sort().pop();
    details.cac_ultimo = last(cac, 'cac_general');
    details.icc_ultimo = last(icc, 'icc_general');
    details.archivos = { cacUrl, indecUrl };
    await supabaseRest('price_index_sync_runs', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ ok: true, trigger, message: 'Actualización correcta', details }),
    });
    res.status(200).json({ ok: true, ...details });
  } catch (err: any) {
    const message = String(err?.message ?? err);
    await supabaseRest('price_index_sync_runs', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ ok: false, trigger, message, details }),
    }).catch(() => undefined);
    res.status(500).json({ ok: false, error: message });
  }
}
