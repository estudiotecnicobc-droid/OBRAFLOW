import React, { useCallback, useEffect, useState } from 'react';
import { X, RefreshCw, AlertCircle, Info } from 'lucide-react';
import { getAPUTechnicalReport } from '../../../services/apuReportService';
import type { APUReportLine, APUTechnicalReport } from '../../../types';

interface Props {
  masterTaskId:   string;
  taskName:       string;
  taskCode?:      string;
  taskUnit?:      string;
  organizationId: string;
  onClose:        () => void;
}

const TYPE_ORDER: APUReportLine['resourceType'][] = [
  'MATERIAL', 'LABOR', 'EQUIPMENT', 'SUBCONTRACT', 'FIXED',
];

const TYPE_LABEL: Record<APUReportLine['resourceType'], string> = {
  MATERIAL:    'Materiales',
  LABOR:       'Mano de Obra',
  EQUIPMENT:   'Equipos',
  SUBCONTRACT: 'Subcontratos',
  FIXED:       'Costo Fijo',
};

const TYPE_COLOR: Record<APUReportLine['resourceType'], string> = {
  MATERIAL:    'bg-blue-50  border-blue-100  text-blue-800',
  LABOR:       'bg-emerald-50 border-emerald-100 text-emerald-800',
  EQUIPMENT:   'bg-amber-50 border-amber-100  text-amber-800',
  SUBCONTRACT: 'bg-violet-50 border-violet-100 text-violet-800',
  FIXED:       'bg-slate-50 border-slate-200  text-slate-700',
};

const TYPE_SUBTOTAL_BG: Record<APUReportLine['resourceType'], string> = {
  MATERIAL:    'bg-blue-50/60',
  LABOR:       'bg-emerald-50/60',
  EQUIPMENT:   'bg-amber-50/60',
  SUBCONTRACT: 'bg-violet-50/60',
  FIXED:       'bg-slate-50',
};

const SOURCE_BADGE: Record<APUReportLine['costSource'], string> = {
  RESOURCE_BASE: 'bg-blue-100  text-blue-700',
  LEGACY_PRICE:  'bg-amber-100 text-amber-700',
  SNAPSHOT:      'bg-green-100 text-green-700',
  FIXED:         'bg-slate-100 text-slate-600',
};
const SOURCE_LABEL: Record<APUReportLine['costSource'], string> = {
  RESOURCE_BASE: 'Base',
  LEGACY_PRICE:  'Histórico',
  SNAPSHOT:      'Snapshot',
  FIXED:         'Fijo',
};

function fmt(n: number, dec = 2): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function APUTechnicalReportDrawer({
  masterTaskId, taskName, taskCode, taskUnit, organizationId, onClose,
}: Props) {
  const [costDate, setCostDate]   = useState(today);
  const [report,   setReport]     = useState<APUTechnicalReport | null>(null);
  const [loading,  setLoading]    = useState(false);
  const [error,    setError]      = useState<string | null>(null);

  const fetch = useCallback(async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await getAPUTechnicalReport(masterTaskId, organizationId, date);
      setReport(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar el reporte');
    } finally {
      setLoading(false);
    }
  }, [masterTaskId, organizationId]);

  useEffect(() => { fetch(costDate); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // Group lines by type
  const groups = TYPE_ORDER.map(type => ({
    type,
    lines: (report?.lines ?? []).filter(l => l.resourceType === type),
    subtotal: (report?.subtotals ?? {})[type.toLowerCase() as keyof typeof report.subtotals] ?? 0,
  })).filter(g => g.lines.length > 0 || (report && g.type === 'FIXED' && (report.fixedCost > 0)));

  const totalDirect = report?.totalDirectCost ?? 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 w-full md:w-[920px] bg-white z-50 flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-start gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50/60 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {taskCode && (
                <span className="font-mono text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded">
                  {taskCode}
                </span>
              )}
              <h2 className="font-bold text-slate-800 text-base leading-tight truncate">{taskName}</h2>
              {taskUnit && (
                <span className="text-xs text-slate-500 shrink-0">/ {taskUnit}</span>
              )}
            </div>

            {report && (
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  report.isPathA
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-blue-100  text-blue-700'
                }`}>
                  {report.isPathA ? 'PATH A — Legacy' : 'PATH B — Catálogo'}
                </span>
                {report.category && (
                  <span className="text-xs text-slate-400">{report.category}</span>
                )}
                {report.dailyYield > 0 && (
                  <span className="text-xs text-slate-400">Rend. {report.dailyYield} {taskUnit}/día</span>
                )}
              </div>
            )}
          </div>

          {/* Date + refresh */}
          <div className="flex items-center gap-2 shrink-0">
            <input
              type="date"
              value={costDate}
              onChange={e => setCostDate(e.target.value)}
              className="border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 bg-white"
            />
            <button
              onClick={() => fetch(costDate)}
              disabled={loading}
              title="Recalcular"
              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* Loading */}
          {loading && !report && (
            <div className="flex items-center justify-center gap-3 py-24">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-blue-600" />
              <span className="text-slate-500 text-sm">Cargando desglose...</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="m-6 flex gap-3 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-0.5">No se pudo cargar el reporte</p>
                <p className="text-xs text-red-500">{error}</p>
              </div>
            </div>
          )}

          {/* Content */}
          {report && !loading && (
            <div className="px-6 py-4 space-y-1">

              {/* Description / specs */}
              {(report.description || report.specifications) && (
                <div className="flex gap-2 bg-slate-50 border border-slate-100 rounded-lg p-3 text-xs text-slate-500 mb-3">
                  <Info size={14} className="shrink-0 mt-0.5 text-slate-400" />
                  <div className="space-y-0.5">
                    {report.description && <p>{report.description}</p>}
                    {report.specifications && <p className="italic">{report.specifications}</p>}
                  </div>
                </div>
              )}

              {/* Table */}
              <div className="rounded-xl border border-slate-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 uppercase tracking-wider font-bold">
                        <th className="text-left  px-3 py-2.5 w-28">Tipo</th>
                        <th className="text-left  px-3 py-2.5">Recurso</th>
                        <th className="text-center px-2 py-2.5 w-14">Unid.</th>
                        <th className="text-right  px-2 py-2.5 w-16">Cant.</th>
                        <th className="text-right  px-2 py-2.5 w-14">HH/u</th>
                        <th className="text-right  px-3 py-2.5 w-24">Costo Base</th>
                        <th className="text-right  px-2 py-2.5 w-16">+Cargas%</th>
                        <th className="text-right  px-3 py-2.5 w-24">Costo Ef.</th>
                        <th className="text-right  px-3 py-2.5 w-24">Aporte</th>
                        <th className="text-right  px-2 py-2.5 w-14">%</th>
                        <th className="text-center px-2 py-2.5 w-20">Fuente</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groups.map(({ type, lines, subtotal }) => (
                        <React.Fragment key={type}>
                          {/* Lines */}
                          {lines.map(line => (
                            <tr
                              key={line.id}
                              className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                            >
                              <td className="px-3 py-2">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border ${TYPE_COLOR[type]}`}>
                                  {TYPE_LABEL[type]}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                <div className="font-medium text-slate-700 leading-snug">{line.resourceName}</div>
                                {line.resourceCode && (
                                  <div className="text-[10px] text-slate-400 font-mono">{line.resourceCode}</div>
                                )}
                                {line.note && (
                                  <div className="text-[10px] text-amber-600 italic">{line.note}</div>
                                )}
                              </td>
                              <td className="px-2 py-2 text-center text-slate-500">{line.unit}</td>
                              <td className="px-2 py-2 text-right font-mono text-slate-600">
                                {fmt(line.quantity, 3)}
                                {line.workers != null && line.workers !== line.quantity && (
                                  <div className="text-[10px] text-slate-400">{fmt(line.workers)} op.</div>
                                )}
                              </td>
                              <td className="px-2 py-2 text-right font-mono text-slate-500">
                                {line.hoursPerUnit != null ? fmt(line.hoursPerUnit, 3) : '—'}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-slate-700">
                                ${fmt(line.baseCost, 4)}
                                {line.conversionFactor !== 1 && (
                                  <div className="text-[10px] text-slate-400">×{line.conversionFactor}</div>
                                )}
                              </td>
                              <td className="px-2 py-2 text-right font-mono">
                                {line.socialChargesPct != null
                                  ? <span className="text-emerald-700">{fmt(line.socialChargesPct, 1)}%</span>
                                  : <span className="text-slate-300">—</span>
                                }
                              </td>
                              <td className="px-3 py-2 text-right font-mono font-medium text-slate-800">
                                ${fmt(line.effectiveUnitCost, 4)}
                              </td>
                              <td className="px-3 py-2 text-right font-mono font-semibold text-slate-900">
                                ${fmt(line.contribution)}
                              </td>
                              <td className="px-2 py-2 text-right text-slate-400">
                                {totalDirect > 0 ? fmt((line.contribution / totalDirect) * 100, 1) + '%' : '—'}
                              </td>
                              <td className="px-2 py-2 text-center">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${SOURCE_BADGE[line.costSource]}`}>
                                  {SOURCE_LABEL[line.costSource]}
                                </span>
                              </td>
                            </tr>
                          ))}

                          {/* Subtotal row */}
                          <tr className={`border-b border-slate-200 ${TYPE_SUBTOTAL_BG[type]}`}>
                            <td colSpan={8} className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">
                              Subtotal {TYPE_LABEL[type]}
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-slate-800">
                              ${fmt(subtotal)}
                            </td>
                            <td className="px-2 py-2 text-right text-xs font-semibold text-slate-500">
                              {totalDirect > 0 ? fmt((subtotal / totalDirect) * 100, 1) + '%' : '—'}
                            </td>
                            <td />
                          </tr>
                        </React.Fragment>
                      ))}

                      {/* Grand total */}
                      <tr className="bg-slate-100 border-t-2 border-slate-300">
                        <td colSpan={8} className="px-3 py-3 text-right text-xs font-bold text-slate-600 uppercase tracking-wide">
                          Costo Directo Total
                        </td>
                        <td className="px-3 py-3 text-right text-base font-black text-slate-900">
                          ${fmt(totalDirect)}
                        </td>
                        <td className="px-2 py-3 text-right text-xs font-bold text-slate-500">100%</td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Fixed cost detail */}
              {report.fixedCost > 0 && report.fixedCostDescription && (
                <p className="text-xs text-slate-400 px-1 pt-1">
                  * Costo fijo: {report.fixedCostDescription}
                </p>
              )}

              {/* Footer meta */}
              <div className="flex items-center justify-between pt-2 text-[10px] text-slate-300">
                <span>Calculado al {report.costDate}</span>
                <span>{new Date(report.computedAt).toLocaleString('es-AR')}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
