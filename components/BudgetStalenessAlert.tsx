import React, { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, CheckCircle } from 'lucide-react';
import { getStaleness, takeSnapshot } from '../services/budgetSnapshotService';
import type { BudgetCostStaleness } from '../types';

interface Props {
  projectId: string;
  organizationId: string;
}

export function BudgetStalenessAlert({ projectId, organizationId }: Props) {
  const [staleness, setStaleness] = useState<BudgetCostStaleness | null>(null);
  const [loading, setLoading]     = useState(true);
  const [snapping, setSnapping]   = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!projectId || !organizationId) return;
    setLoading(true);
    setDismissed(false);
    getStaleness(projectId, organizationId)
      .then(setStaleness)
      .catch(() => setStaleness(null))
      .finally(() => setLoading(false));
  }, [projectId, organizationId]);

  async function handleSnapshot() {
    if (!projectId || !organizationId) return;
    setSnapping(true);
    try {
      await takeSnapshot(projectId, organizationId);
      const updated = await getStaleness(projectId, organizationId);
      setStaleness(updated);
      setDismissed(false);
    } catch {
      // silent — don't block UI
    } finally {
      setSnapping(false);
    }
  }

  if (loading || dismissed || !staleness) return null;

  // No snapshot yet
  if (staleness.neverCalculated) {
    return (
      <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-sm text-blue-800">
        <AlertTriangle size={15} className="shrink-0 text-blue-500" />
        <span className="flex-1">
          El presupuesto no tiene costos calculados aún.
        </span>
        <button
          onClick={handleSnapshot}
          disabled={snapping}
          className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-bold transition-colors disabled:opacity-60"
        >
          <RefreshCw size={12} className={snapping ? 'animate-spin' : ''} />
          {snapping ? 'Calculando...' : 'Calcular costos'}
        </button>
        <button onClick={() => setDismissed(true)} className="text-blue-400 hover:text-blue-600 ml-1 text-xs">✕</button>
      </div>
    );
  }

  // Prices are stale
  if (staleness.isStale) {
    const lastDate = staleness.lastSnapshotCostDate
      ? new Date(staleness.lastSnapshotCostDate + 'T12:00:00').toLocaleDateString('es-AR')
      : '—';
    const staleNames = staleness.staleResources?.slice(0, 3).map(r => r.materialName).join(', ') ?? '';
    return (
      <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm text-amber-800">
        <AlertTriangle size={15} className="shrink-0 text-amber-500" />
        <span className="flex-1">
          {staleness.staleCount} precio{staleness.staleCount !== 1 ? 's' : ''} actualizado{staleness.staleCount !== 1 ? 's' : ''} desde el último cálculo ({lastDate})
          {staleNames ? `: ${staleNames}${staleness.staleCount > 3 ? '...' : ''}` : ''}.
        </span>
        <button
          onClick={handleSnapshot}
          disabled={snapping}
          className="flex items-center gap-1.5 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-md text-xs font-bold transition-colors disabled:opacity-60"
        >
          <RefreshCw size={12} className={snapping ? 'animate-spin' : ''} />
          {snapping ? 'Calculando...' : 'Recalcular'}
        </button>
        <button onClick={() => setDismissed(true)} className="text-amber-400 hover:text-amber-600 ml-1 text-xs">✕</button>
      </div>
    );
  }

  // Up to date — show with manual recheck option
  if (staleness.isStale === false) {
    const lastDate = staleness.lastSnapshotCostDate
      ? new Date(staleness.lastSnapshotCostDate + 'T12:00:00').toLocaleDateString('es-AR')
      : '—';
    return (
      <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2 text-xs text-emerald-700">
        <CheckCircle size={13} className="shrink-0" />
        <span>Costos actualizados al {lastDate} · ${staleness.lastSnapshotTotals?.grandTotal != null ? staleness.lastSnapshotTotals.grandTotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</span>
        <button
          onClick={async () => {
            setLoading(true);
            try { setStaleness(await getStaleness(projectId, organizationId)); } catch { /* silent */ }
            finally { setLoading(false); }
          }}
          className="ml-auto text-emerald-500 hover:text-emerald-700 underline"
        >
          Re-verificar
        </button>
        <button onClick={() => setDismissed(true)} className="text-emerald-400 hover:text-emerald-600 ml-1">✕</button>
      </div>
    );
  }

  return null;
}
