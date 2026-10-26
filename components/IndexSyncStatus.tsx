import React, { useEffect, useState } from 'react';
import { RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { priceIndicesService, PriceIndexSyncRun, formatPeriod } from '../services/priceIndicesService';

export const IndexSyncStatus: React.FC<{ onSynced?: () => void }> = ({ onSynced }) => {
  const [run, setRun] = useState<PriceIndexSyncRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => { priceIndicesService.lastSync().then(setRun).catch(() => setRun(null)); };
  useEffect(load, []);

  const sync = async () => {
    setBusy(true);
    setError(null);
    const r = await priceIndicesService.runSync();
    setBusy(false);
    if (!r.ok) setError(r.error ?? 'No se pudo actualizar');
    load();
    onSynced?.();
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm">
      <div className="flex items-start gap-2 text-slate-700">
        {run?.ok ? <CheckCircle2 size={16} className="text-green-600 mt-0.5 shrink-0" /> : run ? <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" /> : null}
        <span>
          {run
            ? <>CAC e ICC INDEC: actualización {run.trigger === 'cron' ? 'automática' : 'manual'} del {new Date(run.ranAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                {run.ok
                  ? <> · último CAC publicado: <strong>{run.details.cac_ultimo ? formatPeriod(run.details.cac_ultimo) : '—'}</strong> · último ICC: <strong>{run.details.icc_ultimo ? formatPeriod(run.details.icc_ultimo) : '—'}</strong></>
                  : <> · falló: {run.message}</>}
              </>
            : 'CAC e ICC INDEC todavía no se actualizaron automáticamente.'}
          {error && <span className="block text-red-700 mt-1">{error}</span>}
        </span>
      </div>
      <button onClick={sync} disabled={busy} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
        <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> {busy ? 'Buscando…' : 'Buscar actualización ahora'}
      </button>
    </div>
  );
};
