import React, { useState, useCallback } from 'react';
import { Printer } from 'lucide-react';
import { useERP } from '../../../context/ERPContext';
import { supabase } from '../../../services/supabaseClient';
import { recalculateBudgetFromSupabase } from '../../lib/costs/recalculateBudgetFromSupabase';
import { loadNameMaps } from '../../lib/costs/loadBudgetFromSupabase';
import { printDocument } from '../../../utils/printDocument';
import type { BudgetItemCost } from '../../../types';

interface Props {
  organizationId: string;
}

interface EnrichedItem extends BudgetItemCost {
  taskName: string;
  masterTaskName: string;
  masterTaskCode: string;
  budgetPct: number;
}

interface Totals {
  mat: number;
  lab: number;
  eq: number;
  fix: number;
  grand: number;
}

function fmt(n: number): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function BudgetBreakdownReport({ organizationId }: Props) {
  const { projects } = useERP();
  const today = new Date().toISOString().slice(0, 10);

  const [projectId, setProjectId]   = useState('');
  const [costDate, setCostDate]     = useState(today);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [items, setItems]           = useState<EnrichedItem[] | null>(null);
  const [totals, setTotals]         = useState<Totals | null>(null);
  const [skipped, setSkipped]       = useState(0);

  const calculate = useCallback(async () => {
    if (!projectId || !organizationId) return;
    setLoading(true);
    setError(null);
    setItems(null);
    setTotals(null);

    try {
      const result = await recalculateBudgetFromSupabase(supabase, {
        projectId,
        organizationId,
        costDate,
      });

      setSkipped(result.skippedItems);

      if (result.items.length === 0) {
        setItems([]);
        setTotals({ mat: 0, lab: 0, eq: 0, fix: 0, grand: 0 });
        return;
      }

      const taskIds   = [...new Set(result.items.map(i => i.taskId))];
      const masterIds = [...new Set(result.items.map(i => i.masterTaskId).filter(Boolean) as string[])];
      const { taskNames, masterNames } = await loadNameMaps(supabase, taskIds, masterIds);

      const grand = result.totalDirectCost;
      const enriched: EnrichedItem[] = result.items
        .map(item => {
          const master = masterNames.get(item.masterTaskId ?? '');
          return {
            ...item,
            taskName:       taskNames.get(item.taskId) ?? item.taskId.slice(0, 8),
            masterTaskName: master?.name ?? '',
            masterTaskCode: master?.code ?? '',
            budgetPct:      grand > 0 ? (item.totalCost / grand) * 100 : 0,
          };
        })
        .sort((a, b) => b.totalCost - a.totalCost);

      setItems(enriched);
      setTotals({
        mat:   enriched.reduce((s, i) => s + i.unitCost.materialCost  * i.quantity, 0),
        lab:   enriched.reduce((s, i) => s + i.unitCost.laborCost     * i.quantity, 0),
        eq:    enriched.reduce((s, i) => s + i.unitCost.equipmentCost * i.quantity, 0),
        fix:   enriched.reduce((s, i) => s + i.unitCost.fixedCost     * i.quantity, 0),
        grand,
      });
    } catch (e: any) {
      setError(e.message ?? 'Error al calcular el presupuesto');
    } finally {
      setLoading(false);
    }
  }, [projectId, organizationId, costDate]);

  function handlePrint() {
    if (!items || !totals) return;
    const projectName = projects.find(p => p.id === projectId)?.name ?? projectId;
    const dateStr = new Date(costDate + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const header = `
      <div style="margin-bottom:1.5rem;border-bottom:2px solid #0f172a;padding-bottom:1rem;">
        <h1 style="font-size:1.25rem;font-weight:900;color:#0f172a;margin-bottom:0.25rem;">Desglose de Presupuesto</h1>
        <p style="color:#475569;font-size:0.875rem;">Proyecto: <strong>${projectName}</strong></p>
        <p style="color:#64748b;font-size:0.8rem;">Fecha base de costos: ${dateStr}</p>
        ${skipped > 0 ? `<p style="color:#d97706;font-size:0.75rem;">⚠ ${skipped} ítems omitidos (sin APU maestra vinculada)</p>` : ''}
      </div>
    `;
    const summaryHtml = `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.75rem;margin-bottom:1.5rem;">
        ${[
          { label: 'Costo Directo Total', value: totals.grand, color: '#0f172a' },
          { label: 'Materiales',          value: totals.mat,   color: '#1d4ed8' },
          { label: 'Mano de Obra',        value: totals.lab,   color: '#065f46' },
          { label: 'Equipos',             value: totals.eq,    color: '#92400e' },
        ].map(c => `
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:0.5rem;padding:0.75rem;">
            <p style="font-size:0.7rem;color:#94a3b8;margin-bottom:0.2rem;">${c.label}</p>
            <p style="font-size:0.875rem;font-weight:700;color:${c.color};">$${fmt(c.value)}</p>
            ${c.label !== 'Costo Directo Total' && totals.grand > 0 ? `<p style="font-size:0.7rem;color:#94a3b8;">${((c.value / totals.grand) * 100).toFixed(1)}% del total</p>` : ''}
          </div>
        `).join('')}
      </div>
    `;
    const tableRows = items.map(item => `
      <tr>
        <td>
          <div style="font-weight:600;color:#1e293b;">${item.masterTaskName || item.taskName}</div>
          ${item.masterTaskCode ? `<div style="font-size:0.7rem;color:#94a3b8;font-family:monospace;">${item.masterTaskCode}</div>` : ''}
        </td>
        <td style="text-align:right;font-family:monospace;color:#475569;">${item.quantity.toLocaleString('es-AR')}</td>
        <td style="text-align:right;font-family:monospace;color:#1d4ed8;">$${fmt(item.unitCost.materialCost)}</td>
        <td style="text-align:right;font-family:monospace;color:#065f46;">$${fmt(item.unitCost.laborCost)}</td>
        <td style="text-align:right;font-family:monospace;color:#92400e;">$${fmt(item.unitCost.equipmentCost)}</td>
        <td style="text-align:right;font-family:monospace;color:#475569;">$${fmt(item.unitCost.totalUnitCost)}</td>
        <td style="text-align:right;font-family:monospace;font-weight:700;color:#0f172a;">$${fmt(item.totalCost)}</td>
        <td style="text-align:right;color:#94a3b8;font-size:0.75rem;">${item.budgetPct.toFixed(1)}%</td>
      </tr>
    `).join('');
    const tableHtml = `
      <table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
        <thead>
          <tr style="background:#f1f5f9;border-bottom:2px solid #e2e8f0;">
            <th style="text-align:left;padding:0.5rem;color:#334155;font-size:0.7rem;text-transform:uppercase;">Tarea / APU</th>
            <th style="text-align:right;padding:0.5rem;color:#64748b;font-size:0.7rem;text-transform:uppercase;width:60px;">Cant.</th>
            <th style="text-align:right;padding:0.5rem;color:#1d4ed8;font-size:0.7rem;text-transform:uppercase;width:90px;">Mat/u</th>
            <th style="text-align:right;padding:0.5rem;color:#065f46;font-size:0.7rem;text-transform:uppercase;width:90px;">MO/u</th>
            <th style="text-align:right;padding:0.5rem;color:#92400e;font-size:0.7rem;text-transform:uppercase;width:80px;">Eq/u</th>
            <th style="text-align:right;padding:0.5rem;color:#475569;font-size:0.7rem;text-transform:uppercase;width:90px;">Costo/u</th>
            <th style="text-align:right;padding:0.5rem;color:#0f172a;font-size:0.7rem;text-transform:uppercase;width:100px;">Total</th>
            <th style="text-align:right;padding:0.5rem;color:#94a3b8;font-size:0.7rem;text-transform:uppercase;width:55px;">% Ppto</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
        <tfoot>
          <tr style="background:#f1f5f9;border-top:2px solid #e2e8f0;font-weight:700;">
            <td style="padding:0.5rem;color:#334155;" colspan="2">TOTAL COSTO DIRECTO</td>
            <td style="text-align:right;padding:0.5rem;font-family:monospace;color:#1d4ed8;">$${fmt(totals.mat)}</td>
            <td style="text-align:right;padding:0.5rem;font-family:monospace;color:#065f46;">$${fmt(totals.lab)}</td>
            <td style="text-align:right;padding:0.5rem;font-family:monospace;color:#92400e;">$${fmt(totals.eq)}</td>
            <td style="padding:0.5rem;color:#94a3b8;">—</td>
            <td style="text-align:right;padding:0.5rem;font-family:monospace;color:#0f172a;">$${fmt(totals.grand)}</td>
            <td style="text-align:right;padding:0.5rem;color:#64748b;">100%</td>
          </tr>
        </tfoot>
      </table>
    `;
    printDocument({
      title: `Presupuesto — ${projectName}`,
      html: header + summaryHtml + tableHtml,
      pageSize: 'a4',
      pageOrientation: 'landscape',
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
          className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold px-5 py-2 rounded-lg text-sm transition-colors"
        >
          {loading ? 'Calculando...' : 'Calcular'}
        </button>
        <button
          onClick={handlePrint}
          disabled={!items || items.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-sm transition-colors"
        >
          <Printer size={14} />
          Imprimir
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      {skipped > 0 && items !== null && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-700 text-sm">
          {skipped} ítem{skipped !== 1 ? 's' : ''} omitido{skipped !== 1 ? 's' : ''} (sin APU maestra vinculada).
        </div>
      )}

      {totals && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Costo Directo Total', value: totals.grand, cls: 'text-slate-800' },
            { label: 'Materiales',          value: totals.mat,   cls: 'text-blue-700'  },
            { label: 'Mano de Obra',        value: totals.lab,   cls: 'text-emerald-700' },
            { label: 'Equipos',             value: totals.eq,    cls: 'text-amber-700' },
          ].map(c => (
            <div key={c.label} className="bg-slate-50 border border-slate-100 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-1">{c.label}</p>
              <p className={`font-bold ${c.cls}`}>${fmt(c.value)}</p>
              {c.label !== 'Costo Directo Total' && totals.grand > 0 && (
                <p className="text-xs text-slate-400 mt-0.5">
                  {((c.value / totals.grand) * 100).toFixed(1)}% del total
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {items !== null && items.length === 0 && (
        <div className="text-center py-12 text-slate-400 text-sm">
          Este proyecto no tiene ítems de presupuesto vinculados a APUs maestras.
        </div>
      )}

      {items !== null && items.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold uppercase tracking-wider">
                  <th className="text-left px-4 py-3 text-slate-500">Tarea / APU</th>
                  <th className="text-right px-3 py-3 text-slate-400 w-20">Cant.</th>
                  <th className="text-right px-4 py-3 text-blue-600 w-28">Mat/u</th>
                  <th className="text-right px-4 py-3 text-emerald-600 w-28">MO/u</th>
                  <th className="text-right px-4 py-3 text-amber-600 w-24">Eq/u</th>
                  <th className="text-right px-4 py-3 text-slate-600 w-28">Costo/u</th>
                  <th className="text-right px-4 py-3 text-slate-700 w-32">Total</th>
                  <th className="text-right px-4 py-3 text-slate-400 w-16">% Ppto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map(item => (
                  <tr key={item.budgetItemId} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-800">
                        {item.masterTaskName || item.taskName}
                      </div>
                      {item.masterTaskCode && (
                        <div className="text-xs text-slate-400 font-mono">{item.masterTaskCode}</div>
                      )}
                      {item.unitCost.warnings && item.unitCost.warnings.length > 0 && (
                        <div className="text-xs text-amber-600 mt-0.5">
                          ⚠ {item.unitCost.warnings[0]}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-600">
                      {item.quantity.toLocaleString('es-AR')}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-blue-700">
                      ${fmt(item.unitCost.materialCost)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-emerald-700">
                      ${fmt(item.unitCost.laborCost)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-amber-700">
                      ${fmt(item.unitCost.equipmentCost)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-600">
                      ${fmt(item.unitCost.totalUnitCost)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-slate-800">
                      ${fmt(item.totalCost)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-slate-400">
                      {item.budgetPct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
              {totals && (
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold text-sm">
                    <td className="px-4 py-3 text-slate-700" colSpan={2}>TOTAL COSTO DIRECTO</td>
                    <td className="px-4 py-3 text-right font-mono text-blue-700">${fmt(totals.mat)}</td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-700">${fmt(totals.lab)}</td>
                    <td className="px-4 py-3 text-right font-mono text-amber-700">${fmt(totals.eq)}</td>
                    <td className="px-4 py-3 text-right text-slate-500">—</td>
                    <td className="px-4 py-3 text-right text-slate-800">${fmt(totals.grand)}</td>
                    <td className="px-4 py-3 text-right text-slate-500">100%</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
