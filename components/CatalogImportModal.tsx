import React, { useState, useMemo } from 'react';
import { X, Download, Loader2, CheckCircle, Globe, AlertTriangle } from 'lucide-react';
import { MasterTask } from '../types';
import {
  ImportMode, PriceStrategy, ImportCatalogParams, ImportCatalogResult,
  importGlobalCatalogToOrg,
} from '../services/catalogImportService';

interface Props {
  organizationId: string;
  globalTasks:    MasterTask[];
  onClose:        () => void;
  onSuccess:      () => void;
}

const PRICE_OPTIONS: { value: PriceStrategy; label: string; desc: string }[] = [
  { value: 'missing_only',  label: 'Solo recursos nuevos',           desc: 'No toca precios de recursos que ya existen en tu empresa.' },
  { value: 'zero_only',     label: 'Nuevos + actualizar precio $0',  desc: 'Actualiza recursos existentes solo si tienen precio $0.' },
  { value: 'overwrite_all', label: 'Sobrescribir todos',             desc: 'Reemplaza los precios propios con los precios de referencia global.' },
  { value: 'skip_prices',   label: 'No importar precios',            desc: 'Crea los recursos sin precio (quedará en $0 para completar luego).' },
];

export function CatalogImportModal({ organizationId, globalTasks, onClose, onSuccess }: Props) {
  const [mode, setMode]             = useState<ImportMode>('full');
  const [priceStrategy, setPrice]   = useState<PriceStrategy>('missing_only');
  const [selCategories, setSelCats] = useState<string[]>([]);
  const [selCodes, setSelCodes]     = useState<string[]>([]);
  const [loading, setLoading]       = useState(false);
  const [result, setResult]         = useState<ImportCatalogResult | null>(null);
  const [error, setError]           = useState<string | null>(null);

  const categories = useMemo(() =>
    [...new Set(globalTasks.map(t => t.category).filter(Boolean) as string[])].sort(),
    [globalTasks],
  );

  const toggleCategory = (cat: string) =>
    setSelCats(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);

  const toggleCode = (code: string) =>
    setSelCodes(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);

  const handleImport = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: ImportCatalogParams = {
        organizationId,
        mode,
        priceStrategy,
        categories:      mode === 'category'  ? selCategories : undefined,
        masterTaskCodes: mode === 'selection' ? selCodes      : undefined,
      };
      const res = await importGlobalCatalogToOrg(params);
      setResult(res);
      // No llamar onSuccess() aquí — el resultado debe mostrarse primero.
      // onSuccess se invoca cuando el usuario hace click "Cerrar" en la pantalla de resultado.
    } catch (e: any) {
      setError(e.message ?? 'Error al importar.');
    } finally {
      setLoading(false);
    }
  };

  const canConfirm =
    !loading &&
    (mode === 'full' || mode === 'prices_only' ||
     (mode === 'category'  && selCategories.length > 0) ||
     (mode === 'selection' && selCodes.length > 0));

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90dvh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Globe size={18} className="text-slate-500" />
            <h2 className="font-bold text-slate-800">Importar catálogo global</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Resultado */}
        {result ? (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle size={20} />
              <span className="font-bold text-sm">Importación completada</span>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
              {result.mode !== 'prices_only' && (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-500">APUs importados</span>
                    <span className="font-bold text-slate-800">{result.tasksCreated}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">APUs ya existían</span>
                    <span className="text-slate-400">{result.tasksSkipped}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Recursos creados</span>
                <span className="font-bold text-slate-800">{result.resourcesCreated}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Precios actualizados</span>
                <span className="font-bold text-slate-800">{result.resourcesUpdated}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Sin cambios</span>
                <span className="text-slate-400">{result.resourcesSkipped}</span>
              </div>
            </div>
            <button
              onClick={onSuccess}
              className="w-full py-2 bg-slate-800 text-white text-sm font-bold rounded-lg hover:bg-slate-700 transition-colors"
            >
              Cerrar y ver mi catálogo
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-5">

            {/* Alcance */}
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Alcance</p>
              <div className="space-y-1.5">
                {([
                  ['full',        'Todo el catálogo',           'Importa todos los APUs globales disponibles.'],
                  ['category',    'Por rubro',                  'Elige uno o más rubros específicos.'],
                  ['selection',   'Selección manual',           'Elige APUs individuales de la lista.'],
                  ['prices_only', 'Solo precios de referencia', 'No importa APUs. Solo actualiza precios de recursos ya existentes.'],
                ] as [ImportMode, string, string][]).map(([val, label, desc]) => (
                  <label key={val} className={`flex items-start gap-2.5 p-2.5 rounded-lg cursor-pointer border transition-colors ${
                    mode === val ? 'border-slate-800 bg-slate-50' : 'border-transparent hover:bg-slate-50'
                  }`}>
                    <input
                      type="radio"
                      className="mt-0.5 accent-slate-800"
                      checked={mode === val}
                      onChange={() => setMode(val)}
                    />
                    <span>
                      <span className="block text-sm font-semibold text-slate-800">{label}</span>
                      <span className="block text-xs text-slate-500">{desc}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Filtro por rubro */}
            {mode === 'category' && (
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Rubros</p>
                <div className="flex flex-wrap gap-1.5">
                  {categories.length === 0 && (
                    <span className="text-xs text-slate-400">Sin rubros en el catálogo global.</span>
                  )}
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => toggleCategory(cat)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                        selCategories.includes(cat)
                          ? 'bg-slate-800 text-white border-slate-800'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Selección manual */}
            {mode === 'selection' && (
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                  APUs ({selCodes.length} seleccionados)
                </p>
                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {globalTasks.map(t => (
                    <label key={t.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        className="accent-slate-800"
                        checked={selCodes.includes(t.code ?? '')}
                        onChange={() => toggleCode(t.code ?? '')}
                      />
                      <span className="text-xs font-mono text-slate-400 w-28 shrink-0 truncate">{t.code ?? '—'}</span>
                      <span className="text-sm text-slate-700 truncate">{t.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Estrategia de precios */}
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Estrategia de precios</p>
              <div className="space-y-1">
                {PRICE_OPTIONS
                  .filter(o => mode === 'prices_only' ? o.value !== 'skip_prices' : true)
                  .map(opt => (
                    <label key={opt.value} className={`flex items-start gap-2.5 p-2.5 rounded-lg cursor-pointer border transition-colors ${
                      priceStrategy === opt.value ? 'border-slate-800 bg-slate-50' : 'border-transparent hover:bg-slate-50'
                    }`}>
                      <input
                        type="radio"
                        className="mt-0.5 accent-slate-800"
                        checked={priceStrategy === opt.value}
                        onChange={() => setPrice(opt.value)}
                      />
                      <span>
                        <span className="block text-sm font-semibold text-slate-800">
                          {opt.label}
                          {opt.value === 'missing_only' && (
                            <span className="ml-1.5 text-[10px] text-slate-400 font-normal">(recomendado)</span>
                          )}
                        </span>
                        <span className="block text-xs text-slate-500">{opt.desc}</span>
                      </span>
                    </label>
                  ))}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg text-xs text-red-700">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Acciones */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleImport}
                disabled={!canConfirm}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white text-sm font-bold rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading
                  ? <><Loader2 size={14} className="animate-spin" /> Importando…</>
                  : <><Download size={14} /> Importar catálogo</>
                }
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
