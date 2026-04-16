import React, { useMemo, useState } from 'react';
import { FileSearch, Printer } from 'lucide-react';
import { useERP } from '../../../context/ERPContext';
import { useMasterTasks } from '../../../hooks/useMasterTasks';
import { useUnifiedMaterials } from '../../../hooks/useUnifiedMaterials';
import { normalizeStr } from '../../../utils/normalizeStr';
import { calculateMasterTaskCost } from '../../../services/masterTaskCostService';
import { APUTechnicalReportDrawer } from './APUTechnicalReportDrawer';
import { printDocument } from '../../../utils/printDocument';
import type { MasterTask } from '../../../types';

interface Props {
  organizationId: string;
}

function fmt(n: number): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pct(part: number, total: number): string {
  if (total === 0) return '—';
  return ((part / total) * 100).toFixed(1) + '%';
}

export function APUSummaryReport({ organizationId }: Props) {
  const { laborCategoriesMap, toolsMap } = useERP();
  const { tasks, loading: tasksLoading, error: tasksError } = useMasterTasks(organizationId);
  const { masterMaterialsMap, list: unifiedList, loading: matsLoading } = useUnifiedMaterials(organizationId);

  const [filterCategory, setFilterCategory] = useState('ALL');
  const [sortBy, setSortBy] = useState<'name' | 'total' | 'mat' | 'labor' | 'equip'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [drawerTask, setDrawerTask] = useState<MasterTask | null>(null);

  // Índice precio por nombre/código — para materiales sin FK en APUs
  const priceIndex = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of unifiedList) {
      if (u.cost > 0) {
        if (u.code) m.set(normalizeStr(u.code), u.cost);
        m.set(normalizeStr(u.name), u.cost);
      }
    }
    return m;
  }, [unifiedList]);

  const categories = useMemo(() => {
    const cats = new Set(tasks.map(t => t.category ?? '').filter(Boolean));
    return ['ALL', ...Array.from(cats).sort()];
  }, [tasks]);

  const rows = useMemo(() => {
    const filtered =
      filterCategory === 'ALL' ? tasks : tasks.filter(t => t.category === filterCategory);

    return filtered
      .map(task => {
        // Enriquecer materiales sin FK con precio de la lista unificada (code → name)
        const enriched = priceIndex.size === 0 ? task : {
          ...task,
          materials: task.materials.map(m => {
            if (m.masterMaterialId) return m; // FK → precio de masterMaterialsMap
            const price = priceIndex.get(normalizeStr(m.materialName));
            if (!price) return m;
            return { ...m, lastKnownUnitPrice: price };
          }),
        };
        return { task, cost: calculateMasterTaskCost(enriched, masterMaterialsMap, laborCategoriesMap, toolsMap) };
      })
      .sort((a, b) => {
        let cmp: number;
        switch (sortBy) {
          case 'total': cmp = a.cost.totalUnitCost - b.cost.totalUnitCost; break;
          case 'mat':   cmp = a.cost.materialCost  - b.cost.materialCost;  break;
          case 'labor': cmp = a.cost.laborCost      - b.cost.laborCost;     break;
          case 'equip': cmp = a.cost.equipmentCost  - b.cost.equipmentCost; break;
          default:      cmp = a.task.name.localeCompare(b.task.name);
        }
        return sortDir === 'asc' ? cmp : -cmp;
      });
  }, [tasks, filterCategory, masterMaterialsMap, priceIndex, laborCategoriesMap, toolsMap, sortBy, sortDir]);

  const summary = useMemo(() => ({
    mat:   rows.reduce((s, r) => s + r.cost.materialCost,  0),
    lab:   rows.reduce((s, r) => s + r.cost.laborCost,     0),
    eq:    rows.reduce((s, r) => s + r.cost.equipmentCost, 0),
    fix:   rows.reduce((s, r) => s + r.cost.fixedCost,     0),
    count: rows.length,
  }), [rows]);

  function toggleSort(col: typeof sortBy) {
    if (sortBy === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir('asc'); }
  }

  const Arrow = ({ col }: { col: typeof sortBy }) => (
    <span className="ml-0.5 text-xs opacity-60">{sortBy === col ? (sortDir === 'asc' ? '↑' : '↓') : '·'}</span>
  );

  function handlePrint() {
    const dateStr = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const header = `
      <div style="margin-bottom:1.5rem;border-bottom:2px solid #0f172a;padding-bottom:1rem;">
        <h1 style="font-size:1.25rem;font-weight:900;color:#0f172a;margin-bottom:0.25rem;">Análisis de APUs</h1>
        ${filterCategory !== 'ALL' ? `<p style="color:#475569;font-size:0.8rem;">Categoría: <strong>${filterCategory}</strong></p>` : ''}
        <p style="color:#94a3b8;font-size:0.75rem;">Generado: ${dateStr} — ${rows.length} APUs · Costos unitarios (no aplicados a cantidad)</p>
      </div>
    `;
    const summaryHtml = `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.75rem;margin-bottom:1.5rem;">
        ${[
          { label: 'Mat. unit. (catálogo)',  value: summary.mat, color: '#1d4ed8' },
          { label: 'MO unit. (catálogo)',    value: summary.lab, color: '#065f46' },
          { label: 'Eq. unit. (catálogo)',   value: summary.eq,  color: '#92400e' },
          { label: 'Costo Fijo (catálogo)',  value: summary.fix, color: '#5b21b6' },
        ].map(c => `
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:0.5rem;padding:0.75rem;">
            <p style="font-size:0.7rem;color:#94a3b8;margin-bottom:0.2rem;">${c.label}</p>
            <p style="font-size:0.875rem;font-weight:700;color:${c.color};">$${fmt(c.value)}</p>
          </div>
        `).join('')}
      </div>
    `;
    const tableRows = rows.map(({ task, cost }) => `
      <tr>
        <td style="font-family:monospace;color:#94a3b8;">${task.code ?? '—'}</td>
        <td>
          <div style="font-weight:600;color:#1e293b;">${task.name}</div>
          ${task.category ? `<div style="font-size:0.7rem;color:#94a3b8;">${task.category}</div>` : ''}
        </td>
        <td style="text-align:center;color:#64748b;">${task.unit}</td>
        <td style="text-align:center;color:#64748b;">${task.dailyYield}</td>
        <td style="text-align:right;font-family:monospace;color:#1d4ed8;">$${fmt(cost.materialCost)}</td>
        <td style="text-align:right;font-family:monospace;color:#065f46;">$${fmt(cost.laborCost)}</td>
        <td style="text-align:right;font-family:monospace;color:#92400e;">$${fmt(cost.equipmentCost)}</td>
        <td style="text-align:right;font-family:monospace;font-weight:700;color:#0f172a;">$${fmt(cost.totalUnitCost)}</td>
        <td style="text-align:right;color:#94a3b8;font-size:0.75rem;">${pct(cost.materialCost, cost.totalUnitCost)}</td>
        <td style="text-align:right;color:#94a3b8;font-size:0.75rem;">${pct(cost.laborCost, cost.totalUnitCost)}</td>
      </tr>
    `).join('');
    const tableHtml = `
      <table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
        <thead>
          <tr style="background:#f1f5f9;border-bottom:2px solid #e2e8f0;">
            <th style="text-align:left;padding:0.5rem;color:#64748b;font-size:0.7rem;text-transform:uppercase;width:80px;">Código</th>
            <th style="text-align:left;padding:0.5rem;color:#334155;font-size:0.7rem;text-transform:uppercase;">Nombre</th>
            <th style="text-align:center;padding:0.5rem;color:#64748b;font-size:0.7rem;text-transform:uppercase;width:50px;">Ud.</th>
            <th style="text-align:center;padding:0.5rem;color:#64748b;font-size:0.7rem;text-transform:uppercase;width:50px;">Rend.</th>
            <th style="text-align:right;padding:0.5rem;color:#1d4ed8;font-size:0.7rem;text-transform:uppercase;width:90px;">Materiales</th>
            <th style="text-align:right;padding:0.5rem;color:#065f46;font-size:0.7rem;text-transform:uppercase;width:90px;">M. de Obra</th>
            <th style="text-align:right;padding:0.5rem;color:#92400e;font-size:0.7rem;text-transform:uppercase;width:80px;">Equipos</th>
            <th style="text-align:right;padding:0.5rem;color:#0f172a;font-size:0.7rem;text-transform:uppercase;width:90px;">Costo Unit.</th>
            <th style="text-align:right;padding:0.5rem;color:#94a3b8;font-size:0.7rem;text-transform:uppercase;width:55px;">Mat%</th>
            <th style="text-align:right;padding:0.5rem;color:#94a3b8;font-size:0.7rem;text-transform:uppercase;width:55px;">MO%</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    `;
    printDocument({
      title: 'Análisis de APUs',
      html: header + summaryHtml + tableHtml,
      pageSize: 'a4',
      pageOrientation: 'landscape',
      pageMargin: '12mm',
    });
  }

  if (tasksLoading || matsLoading) {
    return (
      <div className="flex items-center justify-center py-16 gap-3">
        <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-blue-600" />
        <span className="text-slate-500 text-sm">Cargando APUs...</span>
      </div>
    );
  }

  if (tasksError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
        {tasksError}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm font-medium text-slate-600">Categoría:</label>
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 bg-white"
        >
          {categories.map(c => (
            <option key={c} value={c}>{c === 'ALL' ? 'Todas las categorías' : c}</option>
          ))}
        </select>
        <span className="text-xs text-slate-400">{rows.length} APUs</span>
        <button
          onClick={handlePrint}
          disabled={rows.length === 0}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-sm transition-colors"
        >
          <Printer size={14} />
          Imprimir
        </button>
      </div>

      {rows.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-slate-400">
            Suma de costos <strong>unitarios</strong> por categoría — valores de referencia, no aplicados a cantidad de presupuesto.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Mat. unit. (catálogo)',  value: summary.mat, cls: 'text-blue-700' },
              { label: 'MO unit. (catálogo)',    value: summary.lab, cls: 'text-emerald-700' },
              { label: 'Eq. unit. (catálogo)',   value: summary.eq,  cls: 'text-amber-700' },
              { label: 'Costo Fijo (catálogo)',  value: summary.fix, cls: 'text-violet-700' },
            ].map(c => (
              <div key={c.label} className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-1">{c.label}</p>
                <p className={`font-bold text-sm ${c.cls}`}>${fmt(c.value)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">
          No hay APUs en esta categoría.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold uppercase tracking-wider">
                  <th className="text-left px-4 py-3 text-slate-400 w-24">Código</th>
                  <th
                    className="text-left px-4 py-3 text-slate-500 cursor-pointer hover:text-slate-700 select-none"
                    onClick={() => toggleSort('name')}
                  >
                    Nombre <Arrow col="name" />
                  </th>
                  <th className="text-center px-3 py-3 text-slate-400 w-16">Unid.</th>
                  <th className="text-center px-3 py-3 text-slate-400 w-16">Rend.</th>
                  <th
                    className="text-right px-4 py-3 text-blue-600 cursor-pointer hover:text-blue-700 select-none w-28"
                    onClick={() => toggleSort('mat')}
                  >
                    Materiales <Arrow col="mat" />
                  </th>
                  <th
                    className="text-right px-4 py-3 text-emerald-600 cursor-pointer hover:text-emerald-700 select-none w-28"
                    onClick={() => toggleSort('labor')}
                  >
                    M. de Obra <Arrow col="labor" />
                  </th>
                  <th
                    className="text-right px-4 py-3 text-amber-600 cursor-pointer hover:text-amber-700 select-none w-24"
                    onClick={() => toggleSort('equip')}
                  >
                    Equipos <Arrow col="equip" />
                  </th>
                  <th className="text-right px-4 py-3 text-violet-600 w-22">Fijo</th>
                  <th
                    className="text-right px-4 py-3 text-slate-700 cursor-pointer hover:text-slate-900 select-none w-28"
                    onClick={() => toggleSort('total')}
                  >
                    Costo Unit. <Arrow col="total" />
                  </th>
                  <th className="text-right px-3 py-3 text-slate-400 w-16">Mat%</th>
                  <th className="text-right px-3 py-3 text-slate-400 w-16">MO%</th>
                  <th className="text-right px-3 py-3 text-slate-400 w-16">Eq%</th>
                  <th className="w-14" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map(({ task, cost }) => (
                  <tr key={task.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-2.5 text-xs text-slate-400 font-mono">{task.code ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-800">{task.name}</div>
                      {task.category && (
                        <div className="text-xs text-slate-400">{task.category}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs text-slate-500">{task.unit}</td>
                    <td className="px-3 py-2.5 text-center text-xs text-slate-500">{task.dailyYield}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-blue-700">${fmt(cost.materialCost)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-emerald-700">${fmt(cost.laborCost)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-amber-700">${fmt(cost.equipmentCost)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-violet-700">${fmt(cost.fixedCost)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-slate-800">${fmt(cost.totalUnitCost)}</td>
                    <td className="px-3 py-2.5 text-right text-xs text-slate-400">{pct(cost.materialCost, cost.totalUnitCost)}</td>
                    <td className="px-3 py-2.5 text-right text-xs text-slate-400">{pct(cost.laborCost, cost.totalUnitCost)}</td>
                    <td className="px-3 py-2.5 text-right text-xs text-slate-400">{pct(cost.equipmentCost, cost.totalUnitCost)}</td>
                    <td className="px-2 py-2.5 text-center">
                      <button
                        onClick={() => setDrawerTask(task)}
                        title="Ver ficha técnica"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        <FileSearch size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {drawerTask && (
        <APUTechnicalReportDrawer
          masterTaskId={drawerTask.id}
          taskName={drawerTask.name}
          taskCode={drawerTask.code}
          taskUnit={drawerTask.unit}
          organizationId={organizationId}
          onClose={() => setDrawerTask(null)}
        />
      )}
    </div>
  );
}
