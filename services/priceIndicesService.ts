import { supabase } from './supabaseClient';

// ─── Catálogo de series ───────────────────────────────────────────────────────

export type ManualIndexCode =
  | 'cac_general' | 'cac_materiales' | 'cac_mano_obra'
  | 'icc_general' | 'icc_materiales' | 'icc_mano_obra';
export type ApiIndexCode = 'ipc' | 'usd_oficial' | 'usd_mep' | 'usd_blue';
export type IndexCode = ManualIndexCode | ApiIndexCode;

export interface IndexSeriesInfo {
  code: IndexCode;
  label: string;
  source: 'manual' | 'api';
}

export const INDEX_SERIES: Record<IndexCode, IndexSeriesInfo> = {
  cac_general:    { code: 'cac_general',    label: 'CAC general',                source: 'manual' },
  cac_materiales: { code: 'cac_materiales', label: 'CAC materiales',             source: 'manual' },
  cac_mano_obra:  { code: 'cac_mano_obra',  label: 'CAC mano de obra',           source: 'manual' },
  icc_general:    { code: 'icc_general',    label: 'ICC INDEC general',          source: 'manual' },
  icc_materiales: { code: 'icc_materiales', label: 'ICC INDEC materiales',       source: 'manual' },
  icc_mano_obra:  { code: 'icc_mano_obra',  label: 'ICC INDEC mano de obra',     source: 'manual' },
  ipc:            { code: 'ipc',            label: 'Inflación (IPC)',            source: 'api' },
  usd_oficial:    { code: 'usd_oficial',    label: 'Dólar oficial',              source: 'api' },
  usd_mep:        { code: 'usd_mep',        label: 'Dólar MEP',                  source: 'api' },
  usd_blue:       { code: 'usd_blue',       label: 'Dólar blue',                 source: 'api' },
};

export const MANUAL_INDEX_CODES: ManualIndexCode[] = [
  'cac_general', 'cac_materiales', 'cac_mano_obra',
  'icc_general', 'icc_materiales', 'icc_mano_obra',
];

import type { IndexPoint } from './priceIndexMath';
export type { IndexPoint } from './priceIndexMath';

export interface PriceIndexRow extends IndexPoint {
  id: string;
  code: ManualIndexCode;
  source?: string;
}

// ─── Lectura ──────────────────────────────────────────────────────────────────

const apiCache = new Map<ApiIndexCode, Promise<IndexPoint[]>>();

async function fetchApiSeries(code: ApiIndexCode): Promise<IndexPoint[]> {
  if (!apiCache.has(code)) {
    const p = fetch(`/api/indices?serie=${code}`)
      .then(async r => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body?.error ?? `Error ${r.status}`);
        return (body.points ?? []) as IndexPoint[];
      })
      .catch(err => { apiCache.delete(code); throw err; });
    apiCache.set(code, p);
  }
  return apiCache.get(code)!;
}

async function fetchManualSeries(code: ManualIndexCode): Promise<IndexPoint[]> {
  const { data, error } = await supabase
    .from('price_indices')
    .select('period, value')
    .eq('code', code)
    .order('period', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(r => ({ period: r.period, value: Number(r.value) }));
}

export const priceIndicesService = {
  async getSeries(code: IndexCode): Promise<IndexPoint[]> {
    return INDEX_SERIES[code].source === 'api'
      ? fetchApiSeries(code as ApiIndexCode)
      : fetchManualSeries(code as ManualIndexCode);
  },

  async listManual(code: ManualIndexCode): Promise<PriceIndexRow[]> {
    const { data, error } = await supabase
      .from('price_indices')
      .select('id, code, period, value, source')
      .eq('code', code)
      .order('period', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(r => ({ id: r.id, code: r.code, period: r.period, value: Number(r.value), source: r.source ?? undefined }));
  },

  async upsertManual(rows: { code: ManualIndexCode; period: string; value: number; source?: string }[]): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await supabase
      .from('price_indices')
      .upsert(rows.map(r => ({ code: r.code, period: r.period, value: r.value, source: r.source ?? null })), { onConflict: 'code,period' });
    if (error) throw new Error(error.message);
  },

  async removeManual(id: string): Promise<void> {
    const { error } = await supabase.from('price_indices').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};

export { monthOf, latestAtOrBefore, valueAt, coefficient, parseIndexPaste, formatPeriod } from './priceIndexMath';
