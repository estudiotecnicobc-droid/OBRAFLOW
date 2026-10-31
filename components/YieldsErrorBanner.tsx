import React, { useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useERP } from '../context/ERPContext';

/** true si los costos no son confiables porque faltan los rendimientos. */
export const useYieldsBlocked = (): boolean => {
  const { yieldsError, yieldsLoading } = useERP();
  return !!yieldsError || yieldsLoading;
};

export const YieldsErrorBanner: React.FC = () => {
  const { yieldsError, reloadYields } = useERP();
  const [retrying, setRetrying] = useState(false);
  if (!yieldsError) return null;

  const retry = async () => {
    setRetrying(true);
    try { await reloadYields(); } finally { setRetrying(false); }
  };

  return (
    <div role="alert" className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 mb-3">
      <AlertTriangle size={18} className="shrink-0" />
      <div className="flex-1 text-sm">
        <strong>Error al cargar rendimientos.</strong> Los costos de materiales y mano de obra no son confiables; la impresión y las exportaciones quedan bloqueadas hasta recargarlos.
      </div>
      <button
        onClick={retry}
        disabled={retrying}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
      >
        <RefreshCw size={14} className={retrying ? 'animate-spin' : ''} />
        {retrying ? 'Reintentando…' : 'Reintentar'}
      </button>
    </div>
  );
};
