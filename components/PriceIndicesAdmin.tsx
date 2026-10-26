import React, { useEffect, useState } from 'react';
import { Trash2, Upload, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { IndexSyncStatus } from './IndexSyncStatus';
import {
  INDEX_SERIES, MANUAL_INDEX_CODES, ManualIndexCode, PriceIndexRow,
  priceIndicesService, parseIndexPaste, formatPeriod,
} from '../services/priceIndicesService';

export const PriceIndicesAdmin: React.FC = () => {
  const { isMasterAdmin } = useAuth();
  const [code, setCode] = useState<ManualIndexCode>('cac_general');
  const [rows, setRows] = useState<PriceIndexRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [paste, setPaste] = useState('');
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const load = () => {
    setError(null);
    priceIndicesService.listManual(code).then(setRows).catch(e => setError(e.message));
  };
  useEffect(load, [code]);

  const parsed = parseIndexPaste(paste);

  const importRows = async () => {
    setBusy(true);
    setInfo(null);
    try {
      await priceIndicesService.upsertManual(parsed.map(p => ({ ...p, code, source: source || undefined })));
      setInfo(`Se cargaron ${parsed.length} ${parsed.length === 1 ? 'valor' : 'valores'} de ${INDEX_SERIES[code].label}.`);
      setPaste('');
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('¿Borrar este valor del índice?')) return;
    try { await priceIndicesService.removeManual(id); load(); } catch (e: any) { setError(e.message); }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
        <h2 className="text-lg font-bold text-slate-800">Índices de precios</h2>
        <p className="text-sm text-slate-600">
          Valores mensuales de CAC e ICC INDEC para actualizar presupuestos. Son comunes a todas las empresas y se
          actualizan solos todos los días desde las planillas públicas de IERIC. Inflación y dólar se leen en el momento
          de ArgentinaDatos. La carga manual queda para corregir o completar.
        </p>
        <IndexSyncStatus onSynced={load} />
        {!isMasterAdmin && <p className="text-xs text-slate-500">Solo el administrador del sistema puede cargar o corregir valores.</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        {MANUAL_INDEX_CODES.map(c => (
          <button key={c} onClick={() => setCode(c)} aria-pressed={code === c}
            className={`px-3 py-1.5 rounded-full border text-sm font-medium ${code === c ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
            {INDEX_SERIES[c].label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-700 flex items-center gap-2"><AlertTriangle size={14} /> {error}</p>}
      {info && <p className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg p-3">{info}</p>}

      {isMasterAdmin && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h3 className="font-bold text-slate-800">Cargar valores de {INDEX_SERIES[code].label}</h3>
          <p className="text-xs text-slate-500">Una fila por mes: año-mes y valor publicado. Ejemplos: <code>2026-09;1234,56</code> o <code>09/2026 1234.56</code>. Si el mes ya existe, se reemplaza.</p>
          <textarea value={paste} onChange={e => setPaste(e.target.value)} rows={5}
            className="w-full border border-slate-300 rounded-lg p-3 font-mono text-sm" aria-label="Valores a cargar" />
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 max-w-md">
            Fuente (opcional)
            <input value={source} onChange={e => setSource(e.target.value)} placeholder="Ej.: Informe CAC septiembre 2026"
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-normal" />
          </label>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm text-slate-600">{parsed.length} {parsed.length === 1 ? 'fila válida' : 'filas válidas'}</span>
            <button onClick={importRows} disabled={busy || parsed.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50">
              <Upload size={16} /> Cargar
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="bg-slate-50 text-xs text-slate-500 text-left">
              <th className="p-3 font-semibold">MES</th>
              <th className="p-3 font-semibold text-right">VALOR</th>
              <th className="p-3 font-semibold">FUENTE</th>
              {isMasterAdmin && <th className="p-3"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={4} className="p-4 text-slate-500">Todavía no hay valores cargados.</td></tr>
            )}
            {rows.map(r => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="p-3 capitalize">{formatPeriod(r.period)}</td>
                <td className="p-3 text-right tabular-nums">{r.value.toLocaleString('es-AR', { maximumFractionDigits: 4 })}</td>
                <td className="p-3 text-slate-500">{r.source ?? ''}</td>
                {isMasterAdmin && (
                  <td className="p-3 text-right">
                    <button onClick={() => remove(r.id)} aria-label={`Borrar ${formatPeriod(r.period)}`} className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={16} /></button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
