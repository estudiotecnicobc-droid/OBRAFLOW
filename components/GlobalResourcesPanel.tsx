import React, { useState, useEffect, useMemo } from 'react';
import { Globe, Search, Loader2, AlertTriangle, HelpCircle, Download, CheckCircle } from 'lucide-react';
import { resourcesService } from '../services/resourcesService';
import { Resource } from '../types';
import {
  importGlobalResourcesToOrg,
  ImportGlobalResourcesResult,
  ResourcePriceStrategy,
} from '../services/importGlobalResourcesService';
import { useAuth } from '../context/AuthContext';
import { useERP } from '../context/ERPContext';

type TypeFilter = 'ALL' | 'MATERIAL' | 'LABOR' | 'EQUIPMENT' | 'SUBCONTRACT';

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  MATERIAL:    { label: 'Material',    color: 'bg-blue-100 text-blue-700' },
  LABOR:       { label: 'Mano de Obra', color: 'bg-green-100 text-green-700' },
  EQUIPMENT:   { label: 'Equipo',      color: 'bg-amber-100 text-amber-700' },
  SUBCONTRACT: { label: 'Subcontrato', color: 'bg-violet-100 text-violet-700' },
};

const PRICE_OPTIONS: { value: ResourcePriceStrategy; label: string }[] = [
  { value: 'missing_only',  label: 'Solo recursos nuevos (recomendado)' },
  { value: 'zero_only',     label: 'Nuevos + actualizar precio $0' },
  { value: 'overwrite_all', label: 'Sobrescribir todos los precios' },
  { value: 'skip_prices',   label: 'Sin precio (completar luego)' },
];

const fmt = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function GlobalResourcesPanel() {
  const { user, activeOrganizationId } = useAuth();
  const { reloadOrgResources } = useERP();
  const orgId = activeOrganizationId ?? user?.organizationId ?? '';

  const [resources, setResources]     = useState<Resource[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [typeFilter, setTypeFilter]   = useState<TypeFilter>('ALL');
  const [search, setSearch]           = useState('');

  const [priceStrategy, setPriceStrategy] = useState<ResourcePriceStrategy>('missing_only');
  const [importing, setImporting]     = useState(false);
  const [importResult, setImportResult] = useState<ImportGlobalResourcesResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    resourcesService.listGlobal()
      .then(setResources)
      .catch((e: any) => setError(e.message ?? 'Error al cargar recursos globales.'))
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: resources.length };
    for (const r of resources) {
      c[r.type] = (c[r.type] ?? 0) + 1;
    }
    return c;
  }, [resources]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return resources.filter(r => {
      if (typeFilter !== 'ALL' && r.type !== typeFilter) return false;
      if (q && !r.name.toLowerCase().includes(q) && !(r.code ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [resources, typeFilter, search]);

  const handleImport = async () => {
    if (!orgId) return;
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const result = await importGlobalResourcesToOrg(orgId, priceStrategy);
      setImportResult(result);
      // Sincronizar ERPContext para que la solapa Recursos refleje los nuevos registros
      await reloadOrgResources();
    } catch (e: any) {
      setImportError(e.message ?? 'Error al importar.');
    } finally {
      setImporting(false);
    }
  };

  const totalImported = importResult
    ? importResult.materialsCreated + importResult.laborCreated + importResult.equipmentCreated
    : 0;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">

      {/* Header */}
      <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe size={16} className="text-emerald-600" />
          <h3 className="font-bold text-slate-800 text-sm">Catálogo Global de Recursos</h3>
          <span className="text-xs text-slate-400">— precios de referencia importables</span>
        </div>
        {!loading && !error && (
          <span className="text-xs text-slate-500">{resources.length} recurso{resources.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Banner de importación */}
      {!loading && !error && resources.length > 0 && !importResult && (
        <div className="px-4 py-3 border-b border-emerald-100 bg-emerald-50 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Download size={14} className="text-emerald-600 shrink-0" />
            <span className="text-xs text-emerald-800 font-medium">
              Importar recursos a tu empresa (Recursos, MO, Herramientas)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={priceStrategy}
              onChange={e => setPriceStrategy(e.target.value as ResourcePriceStrategy)}
              disabled={importing}
              className="text-xs border border-emerald-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400 disabled:opacity-50"
            >
              {PRICE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={handleImport}
              disabled={importing || !orgId}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 text-white text-xs font-bold rounded-lg hover:bg-emerald-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {importing
                ? <><Loader2 size={12} className="animate-spin" /> Importando…</>
                : <><Download size={12} /> Importar a mi empresa</>
              }
            </button>
          </div>
          {importError && (
            <div className="w-full flex items-center gap-1.5 text-xs text-red-700">
              <AlertTriangle size={12} className="shrink-0" />
              {importError}
            </div>
          )}
        </div>
      )}

      {/* Resultado de importación */}
      {importResult && (
        <div className="px-4 py-3 border-b border-emerald-200 bg-emerald-50">
          <div className="flex items-center gap-2 mb-2 text-emerald-700">
            <CheckCircle size={14} />
            <span className="text-xs font-bold">Importación completada</span>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs mb-2">
            <span className="text-slate-500">Materiales creados</span>
            <span className="font-bold text-slate-800">{importResult.materialsCreated}</span>
            <span className="text-slate-500">Categorías MO creadas</span>
            <span className="font-bold text-slate-800">{importResult.laborCreated}</span>
            <span className="text-slate-500">Herramientas creadas</span>
            <span className="font-bold text-slate-800">{importResult.equipmentCreated}</span>
            <span className="text-slate-500">Precios actualizados</span>
            <span className="font-bold text-slate-800">{importResult.pricesUpdated}</span>
            <span className="text-slate-500">Sin cambios</span>
            <span className="text-slate-400">{importResult.skipped}</span>
          </div>
          {totalImported > 0 && (
            <p className="text-xs text-emerald-700">
              Los recursos ya están disponibles en las pestañas Recursos, MO y Herramientas.
            </p>
          )}
          <button
            onClick={() => setImportResult(null)}
            className="mt-2 text-xs text-emerald-700 underline hover:text-emerald-900"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Filtros */}
      {!loading && !error && resources.length > 0 && (
        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-3">
          {/* Tipo */}
          <div className="flex items-center gap-1">
            {(['ALL', 'MATERIAL', 'LABOR', 'EQUIPMENT', 'SUBCONTRACT'] as TypeFilter[]).map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                  typeFilter === t
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                }`}
              >
                {t === 'ALL' ? `Todos (${counts.ALL ?? 0})` : `${TYPE_LABELS[t].label} (${counts[t] ?? 0})`}
              </button>
            ))}
          </div>

          {/* Búsqueda */}
          <div className="relative ml-auto">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por código o nombre…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg w-52 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
          </div>
        </div>
      )}

      {/* Contenido */}
      {loading && (
        <div className="p-12 text-center text-slate-400">
          <Loader2 size={24} className="mx-auto mb-3 animate-spin opacity-40" />
          <p className="text-sm">Cargando recursos globales…</p>
        </div>
      )}

      {!loading && error && (
        <div className="p-8 flex items-start gap-3 text-red-600">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {!loading && !error && resources.length === 0 && (
        <div className="p-12 text-center text-slate-400">
          <Globe size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium text-sm">No hay recursos globales cargados todavía.</p>
          <p className="text-xs mt-1 text-slate-400">
            Ejecutá el seed global en Supabase para poblar el catálogo de referencia.
          </p>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && resources.length > 0 && (
        <div className="p-8 text-center text-slate-400">
          <HelpCircle size={24} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Ningún recurso coincide con la búsqueda.</p>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Código</th>
                <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Nombre</th>
                <th className="px-4 py-2.5 text-center text-xs font-bold text-slate-500 uppercase tracking-wide">Tipo</th>
                <th className="px-4 py-2.5 text-center text-xs font-bold text-slate-500 uppercase tracking-wide">Unidad</th>
                <th className="px-4 py-2.5 text-right text-xs font-bold text-slate-500 uppercase tracking-wide">Precio ref.</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const meta = TYPE_LABELS[r.type] ?? { label: r.type, color: 'bg-slate-100 text-slate-600' };
                return (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{r.code ?? '—'}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{r.name}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${meta.color}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center text-xs text-slate-600 font-mono">{r.unit}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-700">
                      {r.baseCost > 0 ? `$\u00a0${fmt(r.baseCost)}` : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-slate-50 text-xs text-slate-400">
            {filtered.length} de {resources.length} recursos
          </div>
        </div>
      )}
    </div>
  );
}
