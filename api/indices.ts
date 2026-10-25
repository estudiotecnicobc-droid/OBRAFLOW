// Proxy de series públicas para la actualización de presupuestos por índice.
// Fuente: ArgentinaDatos <https://argentinadatos.com> (API pública, no oficial).
// Devuelve una serie mensual { period: 'YYYY-MM-01', value } lista para calcular coeficientes.

const BASE = 'https://api.argentinadatos.com/v1';

const USD_CASAS: Record<string, string> = {
  usd_oficial: 'oficial',
  usd_blue: 'blue',
  usd_mep: 'bolsa',
};

type Point = { period: string; value: number };

const monthStart = (fecha: string) => `${fecha.slice(0, 7)}-01`;

async function ipcSeries(): Promise<Point[]> {
  const r = await fetch(`${BASE}/finanzas/indices/inflacion`);
  if (!r.ok) throw new Error(`inflacion ${r.status}`);
  const rows = (await r.json()) as { fecha: string; valor: number }[];
  rows.sort((a, b) => a.fecha.localeCompare(b.fecha));
  let level = 100;
  return rows.map(row => {
    level = level * (1 + Number(row.valor) / 100);
    return { period: monthStart(row.fecha), value: Number(level.toFixed(6)) };
  });
}

async function usdSeries(casa: string): Promise<Point[]> {
  const r = await fetch(`${BASE}/cotizaciones/dolares/${casa}`);
  if (!r.ok) throw new Error(`dolar ${casa} ${r.status}`);
  const rows = (await r.json()) as { fecha: string; venta: number }[];
  const lastOfMonth = new Map<string, { fecha: string; venta: number }>();
  for (const row of rows) {
    if (!row.fecha || !(Number(row.venta) > 0)) continue;
    const key = monthStart(row.fecha);
    const prev = lastOfMonth.get(key);
    if (!prev || row.fecha > prev.fecha) lastOfMonth.set(key, row);
  }
  return [...lastOfMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, row]) => ({ period, value: Number(row.venta) }));
}

export default async function handler(req: any, res: any) {
  const serie = String(req.query?.serie ?? '');
  try {
    let points: Point[];
    if (serie === 'ipc') points = await ipcSeries();
    else if (USD_CASAS[serie]) points = await usdSeries(USD_CASAS[serie]);
    else {
      res.status(400).json({ error: 'Serie no soportada' });
      return;
    }
    res.setHeader('Cache-Control', 's-maxage=10800, stale-while-revalidate=86400');
    res.status(200).json({ serie, source: 'ArgentinaDatos', points });
  } catch (err: any) {
    res.status(502).json({ error: `No se pudo leer la serie: ${err?.message ?? 'error'}` });
  }
}
