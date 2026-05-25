import React, { useState, useCallback } from 'react';
import { Printer, Download, ChevronUp, ChevronDown } from 'lucide-react';
import { useERP } from '../../../context/ERPContext';
import { supabase } from '../../../services/supabaseClient';
import { budgetItemsService } from '../../../services/budgetItemsService';
import { calculateConsolidatedResources } from '../../../services/consolidatedCalculatorService';
import { printDocument } from '../../../utils/printDocument';
import type { RpcConsolidatedResult, RpcResourceLine } from '../../../types';

interface Props {
  organizationId: string;
}

type TabKey = 'Materiales' | 'Mano de Obra' | 'Equipos';
const TABS: TabKey[] = ['Materiales', 'Mano de Obra', 'Equipos'];

type SortCol = 'name' | 'totalQuantity' | 'purchaseQuantity' | 'unitCost' | 'totalCost';

function exportToCSV(lines: RpcResourceLine[], projectName: string, tab: TabKey): void {
  const isMat = tab === 'Materiales';
  const headers = isMat
    ? ['Código', 'Recurso', 'Unidad', 'Cant. técnica', 'Cant. compra', 'Unidad compra', 'Costo Unit.', 'Costo Total', 'APUs']
    : ['Código', 'Recurso', 'Unidad', 'Cantidad', 'Costo Unit.', 'Costo Total', 'APUs'];

  const rows = lines.map(l => {
    const base = [
      l.code || '',
      l.name,
      l.unit,
      l.totalQuantity.toFixed(4).replace('.', ','),
    ];
    if (isMat) {
      base.push(
        l.purchaseQuantity != null ? String(l.purchaseQuantity) : '',
        l.commercialUnit ?? '',
      );
    }
    base.push(
      l.unitCost.toFixed(2).replace('.', ','),
      l.totalCost.toFixed(2).replace('.', ','),
      l.sourceTaskNames.join(' | '),
    );
    return base.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';');
  });

  const bom = '﻿';
  const csv = bom + [headers.map(h => `"${h}"`).join(';'), ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href     = url;
  a.download = `consumos_${projectName.replace(/[^a-z0-9]/gi, '_')}_${tab.replace(/ /g, '_')}_${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function fmt(n: number): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQty(n: number): string {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 3 });
}

export function ConsolidatedProjectReport({ organizationId }: Props) {
  const { projects } = useERP();
  const today = new Date().toISOString().slice(0, 10);

  const [projectId, setProjectId]   = useState('');
  const [costDate, setCostDate]     = useState(today);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [result, setResult]         = useState<RpcConsolidatedResult | null>(null);
  const [activeTab, setActiveTab]   = useState<TabKey>('Materiales');
  const [sortCol, setSortCol]       = useState<SortCol>('totalCost');
  const [sortDir, setSortDir]       = useState<'asc' | 'desc'>('desc');

  function toggleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir(col === 'name' ? 'asc' : 'desc');
    }
  }

  function SortIcon({ col }: { col: SortCol }) {
    if (sortCol !== col) return <ChevronDown size={11} className="text-slate-300 ml-0.5 inline" />;
    return sortDir === 'asc'
      ? <ChevronUp   size={11} className="text-teal-500 ml-0.5 inline" />
      : <ChevronDown size={11} className="text-teal-500 ml-0.5 inline" />;
  }

  const calculate = useCallback(async () => {
    if (!projectId || !organizationId) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // 1. Load budget items for the project
      const budgetItems = await budgetItemsService.listForProject(projectId);

      if (budgetItems.length === 0) {
        setError('El proyecto no tiene ítems de presupuesto.');
        return;
      }

      // 2. Resolve task → masterTaskId via Supabase
      const taskIds = [...new Set(budgetItems.map(b => b.taskId))];
      const { data: taskRows, error: tErr } = await supabase
        .from('tasks')
        .select('id, master_task_id')
        .in('id', taskIds);

      if (tErr) throw new Error(`Error cargando tareas: ${tErr.message}`);

      const taskToMaster = new Map(
        (taskRows ?? []).map((r: any) => [r.id as string, r.master_task_id as string | null]),
      );

      // 3. Accumulate quantities per masterTaskId (dedup across items with same APU)
      const qtyMap = new Map<string, number>();
      for (const bi of budgetItems) {
        const mtid = taskToMaster.get(bi.taskId);
        if (!mtid) continue;
        qtyMap.set(mtid, (qtyMap.get(mtid) ?? 0) + bi.quantity);
      }

      if (qtyMap.size === 0) {
        setError('Ningún ítem del presupuesto tiene APU maestra vinculada.');
        return;
      }

      const items = Array.from(qtyMap.entries()).map(([masterTaskId, quantity]) => ({
        masterTaskId,
        quantity,
      }));

      // 4. Call consolidated RPC
      const res = await calculateConsolidatedResources({ items, organizationId, costDate });
      setResult(res);
    } catch (e: any) {
      const raw = e.message ?? 'Error al calcular consumos';
      if (raw.includes('conversion_factor') || (raw.includes('does not exist') && raw.includes('column'))) {
        setError('Error de base de datos: falta ejecutar la migración 017 en Supabase Dashboard (agrega conversion_factor a master_task_materials y catalog_task_yields). Luego ejecutar 045 para actualizar la RPC.');
      } else if (raw.includes('function') && raw.includes('does not exist')) {
        setError('La función RPC calculate_consolidated_resources no existe en la base de datos. Ejecutar migración 045 en Supabase Dashboard.');
      } else {
        setError(raw);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId, organizationId, costDate]);

  const tabLines = (tab: TabKey): RpcResourceLine[] => {
    if (!result) return [];
    if (tab === 'Materiales')  return result.materials;
    if (tab === 'Mano de Obra') return result.labor;
    return result.equipment;
  };

  const currentLines = tabLines(activeTab).slice().sort((a, b) => {
    let cmp = 0;
    if (sortCol === 'name') {
      cmp = a.name.localeCompare(b.name, 'es');
    } else if (sortCol === 'purchaseQuantity') {
      cmp = (a.purchaseQuantity ?? 0) - (b.purchaseQuantity ?? 0);
    } else {
      cmp = (a[sortCol] as number) - (b[sortCol] as number);
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  function tabCount(tab: TabKey): number {
    return tabLines(tab).length;
  }

  function buildResourceTable(lines: RpcResourceLine[], title: string, isMaterials = false): string {
    if (lines.length === 0) return '';
    const sorted = lines.slice().sort((a, b) => b.totalCost - a.totalCost);
    const total = sorted.reduce((s, l) => s + l.totalCost, 0);
    const rows = sorted.map(line => {
      const purchaseCell = isMaterials
        ? `<td style="text-align:right;font-family:monospace;color:#0d9488;">${
            line.purchaseQuantity != null
              ? `${line.purchaseQuantity.toLocaleString('es-AR')} ${line.commercialUnit ?? line.unit}`
              : '—'
          }</td>`
        : '';
      return `
        <tr>
          <td style="color:#94a3b8;font-family:monospace;">${line.code || '—'}</td>
          <td style="font-weight:600;color:#1e293b;">${line.name}</td>
          <td style="text-align:center;color:#64748b;">${line.unit}</td>
          <td style="text-align:right;font-family:monospace;color:#334155;">${fmtQty(line.totalQuantity)}</td>
          ${purchaseCell}
          <td style="text-align:right;font-family:monospace;color:#475569;">$${fmt(line.unitCost)}</td>
          <td style="text-align:right;font-family:monospace;font-weight:700;color:#0f172a;">$${fmt(line.totalCost)}</td>
        </tr>
      `;
    }).join('');
    const purchaseHeader = isMaterials
      ? `<th style="text-align:right;padding:0.4rem;color:#0d9488;font-size:0.65rem;text-transform:uppercase;width:100px;">Cant. compra</th>`
      : '';
    const totalColspan = isMaterials ? 6 : 5;
    return `
      <h3 style="font-size:0.875rem;font-weight:700;color:#334155;margin:1.5rem 0 0.5rem;text-transform:uppercase;letter-spacing:0.05em;">${title}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:0.8rem;margin-bottom:0.5rem;">
        <thead>
          <tr style="background:#f1f5f9;border-bottom:2px solid #e2e8f0;">
            <th style="text-align:left;padding:0.4rem;color:#64748b;font-size:0.65rem;text-transform:uppercase;width:80px;">Código</th>
            <th style="text-align:left;padding:0.4rem;color:#334155;font-size:0.65rem;text-transform:uppercase;">Recurso</th>
            <th style="text-align:center;padding:0.4rem;color:#64748b;font-size:0.65rem;text-transform:uppercase;width:50px;">Unid.</th>
            <th style="text-align:right;padding:0.4rem;color:#64748b;font-size:0.65rem;text-transform:uppercase;width:90px;">Cant. técnica</th>
            ${purchaseHeader}
            <th style="text-align:right;padding:0.4rem;color:#64748b;font-size:0.65rem;text-transform:uppercase;width:80px;">Costo Unit.</th>
            <th style="text-align:right;padding:0.4rem;color:#0f172a;font-size:0.65rem;text-transform:uppercase;width:90px;">Costo Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr style="background:#f1f5f9;border-top:2px solid #e2e8f0;font-weight:700;">
            <td colspan="${totalColspan}" style="padding:0.4rem;color:#334155;">SUBTOTAL ${title.toUpperCase()}</td>
            <td style="text-align:right;padding:0.4rem;font-family:monospace;color:#0f172a;">$${fmt(total)}</td>
          </tr>
        </tfoot>
      </table>
    `;
  }

  function handlePrint() {
    if (!result) return;
    const projectName = projects.find(p => p.id === projectId)?.name ?? projectId;
    const dateStr = new Date(costDate + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const header = `
      <div style="margin-bottom:1.5rem;border-bottom:2px solid #0f172a;padding-bottom:1rem;">
        <h1 style="font-size:1.25rem;font-weight:900;color:#0f172a;margin-bottom:0.25rem;">Consumos del Proyecto</h1>
        <p style="color:#475569;font-size:0.875rem;">Proyecto: <strong>${projectName}</strong></p>
        <p style="color:#64748b;font-size:0.8rem;">Fecha base de costos: ${dateStr}</p>
      </div>
    `;
    const summaryHtml = `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.75rem;margin-bottom:1.5rem;">
        ${[
          { label: 'Costo Total',  value: result.totals.grandTotal, color: '#0f172a' },
          { label: 'Materiales',   value: result.totals.material,   color: '#1d4ed8' },
          { label: 'Mano de Obra', value: result.totals.labor,      color: '#065f46' },
          { label: 'Equipos',      value: result.totals.equipment,  color: '#92400e' },
        ].map(c => `
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:0.5rem;padding:0.75rem;">
            <p style="font-size:0.7rem;color:#94a3b8;margin-bottom:0.2rem;">${c.label}</p>
            <p style="font-size:0.875rem;font-weight:700;color:${c.color};">$${fmt(c.value)}</p>
            ${c.label !== 'Costo Total' && result.totals.grandTotal > 0 ? `<p style="font-size:0.7rem;color:#94a3b8;">${((c.value / result.totals.grandTotal) * 100).toFixed(1)}% del total</p>` : ''}
          </div>
        `).join('')}
      </div>
    `;
    const content = header + summaryHtml
      + buildResourceTable(result.materials, 'Materiales', true)
      + buildResourceTable(result.labor, 'Mano de Obra', false)
      + buildResourceTable(result.equipment, 'Equipos', false);
    printDocument({
      title: `Consumos — ${projectName}`,
      html: content,
      pageSize: 'a4',
      pageOrientation: 'portrait',
      pageMargin: '12mm',
    });
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Proyecto</label>
          <select
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 bg-white min-w-[220px]"
          >
            <option value="">Seleccionar proyecto...</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Fecha base de costos</label>
          <input
            type="date"
            value={costDate}
            onChange={e => setCostDate(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 bg-white"
          />
        </div>
        <button
          onClick={calculate}
          disabled={!projectId || loading}
          className="bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold px-5 py-2 rounded-lg text-sm transition-colors"
        >
          {loading ? 'Calculando...' : 'Calcular'}
        </button>
        <button
          onClick={handlePrint}
          disabled={!result}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-sm transition-colors"
        >
          <Printer size={14} />
          Imprimir
        </button>
        <button
          onClick={() => {
            if (!result) return;
            const projectName = projects.find(p => p.id === projectId)?.name ?? projectId;
            exportToCSV(currentLines, projectName, activeTab);
          }}
          disabled={!result}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-teal-200 text-teal-700 hover:bg-teal-50 disabled:opacity-40 disabled:cursor-not-allowed text-sm transition-colors"
        >
          <Download size={14} />
          Exportar CSV
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm space-y-2">
          {(error.startsWith('Error de base de datos:') || error.startsWith('La función RPC')) ? (
            <>
              <p className="font-bold text-red-700">⚠ Falta actualizar la base de datos para este reporte.</p>
              <p className="text-red-600">Ejecute la migración <strong>055_reports_consumption_schema_bridge.sql</strong> en el Dashboard de Supabase (SQL Editor) y vuelva a intentarlo.</p>
              <details className="mt-1">
                <summary className="cursor-pointer text-red-400 text-xs">Ver detalle técnico</summary>
                <pre className="mt-1 text-red-400 text-xs whitespace-pre-wrap break-all">{error}</pre>
              </details>
            </>
          ) : (
            <p className="text-red-700">{error}</p>
          )}
        </div>
      )}

      {result && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Costo Total',   value: result.totals.grandTotal,  cls: 'text-slate-800' },
              { label: 'Materiales',    value: result.totals.material,    cls: 'text-blue-700'  },
              { label: 'Mano de Obra',  value: result.totals.labor,       cls: 'text-emerald-700' },
              { label: 'Equipos',       value: result.totals.equipment,   cls: 'text-amber-700' },
            ].map(c => (
              <div key={c.label} className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-1">{c.label}</p>
                <p className={`font-bold ${c.cls}`}>${fmt(c.value)}</p>
                {c.label !== 'Costo Total' && result.totals.grandTotal > 0 && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    {((c.value / result.totals.grandTotal) * 100).toFixed(1)}% del total
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-slate-200">
            {TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === tab
                    ? 'border-teal-500 text-teal-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab}
                <span className="ml-1.5 text-xs bg-slate-100 rounded-full px-1.5 py-0.5 text-slate-500">
                  {tabCount(tab)}
                </span>
              </button>
            ))}
          </div>

          {currentLines.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              Sin datos para esta categoría.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold uppercase tracking-wider select-none">
                      <th className="text-left px-4 py-3 text-slate-400 w-28">Código</th>
                      <th
                        className="text-left px-4 py-3 text-slate-500 cursor-pointer hover:text-teal-600"
                        onClick={() => toggleSort('name')}
                      >
                        Recurso <SortIcon col="name" />
                      </th>
                      <th className="text-center px-3 py-3 text-slate-400 w-16">Unid.</th>
                      <th
                        className="text-right px-4 py-3 text-slate-500 w-32 cursor-pointer hover:text-teal-600"
                        onClick={() => toggleSort('totalQuantity')}
                      >
                        Cant. técnica <SortIcon col="totalQuantity" />
                      </th>
                      {activeTab === 'Materiales' && (
                        <th
                          className="text-right px-4 py-3 text-teal-600 w-36 cursor-pointer hover:text-teal-800"
                          onClick={() => toggleSort('purchaseQuantity')}
                        >
                          Cant. compra <SortIcon col="purchaseQuantity" />
                        </th>
                      )}
                      <th
                        className="text-right px-4 py-3 text-slate-500 w-28 cursor-pointer hover:text-teal-600"
                        onClick={() => toggleSort('unitCost')}
                      >
                        Costo Unit. <SortIcon col="unitCost" />
                      </th>
                      <th
                        className="text-right px-4 py-3 text-slate-700 w-28 cursor-pointer hover:text-teal-600"
                        onClick={() => toggleSort('totalCost')}
                      >
                        Costo Total <SortIcon col="totalCost" />
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {currentLines.map((line, idx) => (
                      <tr key={line.resourceId || idx} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-2.5 text-xs text-slate-400 font-mono">
                          {line.code || '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-slate-800">{line.name}</div>
                          {line.sourceTaskNames.length > 0 && (
                            <div className="text-xs text-slate-400 mt-0.5">
                              APUs: {line.sourceTaskNames.slice(0, 3).join(', ')}
                              {line.sourceTaskNames.length > 3
                                ? ` +${line.sourceTaskNames.length - 3}`
                                : ''}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center text-xs text-slate-500">
                          {line.unit}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-slate-700">
                          {fmtQty(line.totalQuantity)}
                        </td>
                        {activeTab === 'Materiales' && (
                          <td className="px-4 py-2.5 text-right font-mono text-teal-700">
                            {line.purchaseQuantity != null
                              ? `${line.purchaseQuantity.toLocaleString('es-AR')} ${line.commercialUnit ?? line.unit}`
                              : <span className="text-slate-300">—</span>
                            }
                          </td>
                        )}
                        <td className="px-4 py-2.5 text-right font-mono text-slate-600">
                          ${fmt(line.unitCost)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-slate-800">
                          ${fmt(line.totalCost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold text-sm">
                      <td colSpan={activeTab === 'Materiales' ? 6 : 5} className="px-4 py-3 text-slate-700">TOTAL</td>
                      <td className="px-4 py-3 text-right text-slate-800">
                        ${fmt(currentLines.reduce((s, l) => s + l.totalCost, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
