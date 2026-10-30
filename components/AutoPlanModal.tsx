import React, { useMemo, useState } from 'react';
import { X, Sparkles, Check, AlertCircle, Loader2 } from 'lucide-react';
import { useERP } from '../context/ERPContext';
import { buildAutoPlan, planNode, PLAN_ORDER, OVERHEAD_NODE, AutoPlanItem } from '../services/autoPlan';
import { computeSchedule } from '../services/scheduleEngine';
import { toLocalDate } from '../services/calculationService';
import { officialRubro } from '../src/features/budgets/rubroMap';
import { INITIAL_RUBROS } from '../constants';
import { generateId } from '../utils/generateId';

interface Props {
  onClose: () => void;
}

const fmtDate = (s: string) => toLocalDate(s).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });

const nodeLabel = (node: string) => {
  const rubro = INITIAL_RUBROS.find(r => r.startsWith(node.slice(0, 2) + ' ')) ?? node;
  if (node.endsWith('a') && node.length === 3) return `${rubro} · instalación gruesa`;
  if (node.endsWith('b') && node.length === 3) return `${rubro} · terminación`;
  if (node === OVERHEAD_NODE) return 'Gastos generales de obra (todo el plazo)';
  return node === 'otros' ? 'Sin rubro' : rubro;
};

export const AutoPlanModal: React.FC<Props> = ({ onClose }) => {
  const { project, tasks, updateProjectSettings, updateBudgetItem } = useERP();
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(project.startDate || today);
  const [saving, setSaving] = useState(false);
  const workingDays = project.workingDays || [1, 2, 3, 4, 5];
  const nonWorkingDates = project.nonWorkingDates || [];

  const planItems = useMemo(() => {
    const withTask = project.items
      .map((item, idx) => ({ item, idx, task: tasks.find(t => t.id === item.taskId) }))
      .filter(x => !!x.task);
    withTask.sort((a, b) => (a.item.sortOrder ?? Infinity) - (b.item.sortOrder ?? Infinity) || a.idx - b.idx);
    return withTask.map(({ item, task }) => ({
      plan: { id: item.id, rubro: officialRubro(task!.category, task!.name), name: task!.name } as AutoPlanItem,
      item,
      task: task!,
    }));
  }, [project.items, tasks]);

  const deps = useMemo(() => buildAutoPlan(planItems.map(p => p.plan), generateId), [planItems]);

  const overheadIds = useMemo(
    () => new Set(planItems.filter(p => planNode(p.plan) === OVERHEAD_NODE).map(p => p.item.id)),
    [planItems],
  );

  const { schedule, overheadDays } = useMemo(() => {
    const input = (extra?: number) => planItems.map(({ item, task }) => ({
      id: item.id,
      quantity: item.quantity || 0,
      manualDuration: overheadIds.has(item.id) ? extra : item.manualDuration,
      dailyYield: task.dailyYield,
      crewSize: item.crewsAssigned || 1,
    }));
    // Primero sin los gastos generales, para conocer el plazo; después se estiran a ese plazo.
    const first = computeSchedule(input(1).filter(i => !overheadIds.has(i.id)), deps, startDate, workingDays, nonWorkingDates);
    let end = startDate;
    first.forEach(r => { if (r.end > end) end = r.end; });
    let days = 0;
    const holidays = new Set(nonWorkingDates.map(h => h.date));
    for (let d = toLocalDate(startDate); d <= toLocalDate(end); d.setDate(d.getDate() + 1)) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (workingDays.includes(d.getDay()) && !holidays.has(iso)) days++;
    }
    days = Math.max(1, days);
    return { schedule: computeSchedule(input(days), deps, startDate, workingDays, nonWorkingDates), overheadDays: days };
  }, [planItems, overheadIds, deps, startDate, workingDays, nonWorkingDates]);

  const summary = useMemo(() => {
    const byNode = new Map<string, { node: string; count: number; start: string; end: string; noYield: number }>();
    for (const { plan, task } of planItems) {
      const s = schedule.get(plan.id);
      if (!s) continue;
      const node = planNode(plan);
      const g = byNode.get(node) ?? { node, count: 0, start: s.start, end: s.end, noYield: 0 };
      g.count++;
      if (s.start < g.start) g.start = s.start;
      if (s.end > g.end) g.end = s.end;
      if ((!task.dailyYield || task.dailyYield <= 0.01) && node !== OVERHEAD_NODE) g.noYield++;
      byNode.set(node, g);
    }
    const rank = (n: string) => { const i = PLAN_ORDER.indexOf(n); return i < 0 ? 999 : i; };
    return [...byNode.values()].sort((a, b) => a.start.localeCompare(b.start) || rank(a.node) - rank(b.node));
  }, [planItems, schedule]);

  const finish = summary.reduce((m, g) => (g.end > m ? g.end : m), startDate);
  const calendarDays = Math.round((toLocalDate(finish).getTime() - toLocalDate(startDate).getTime()) / 86400000);
  const noYield = summary.reduce((a, g) => a + g.noYield, 0);
  const existing = project.dependencies?.length ?? 0;
  const span = Math.max(1, toLocalDate(finish).getTime() - toLocalDate(startDate).getTime());
  const pos = (d: string) => ((toLocalDate(d).getTime() - toLocalDate(startDate).getTime()) / span) * 100;

  const apply = () => {
    setSaving(true);
    updateProjectSettings({ dependencies: deps, startDate });
    planItems.forEach(({ item }) => {
      const updates: { startDate?: string; manualDuration?: number } = {};
      if (item.startDate !== startDate) updates.startDate = startDate;
      if (overheadIds.has(item.id) && item.manualDuration !== overheadDays) updates.manualDuration = overheadDays;
      if (Object.keys(updates).length > 0) updateBudgetItem(item.id, updates);
    });
    setTimeout(onClose, 300);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="ap-title">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center"><Sparkles size={18} className="text-blue-600" /></div>
          <div className="flex-1 min-w-0">
            <h2 id="ap-title" className="font-bold text-slate-800">Generar plan de trabajos</h2>
            <p className="text-xs text-slate-500">Arma el orden de las tareas a partir del presupuesto. Después lo podés ajustar a mano en la tabla o en el Gantt.</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="p-2 rounded-full hover:bg-slate-100 text-slate-500"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-4">
          {planItems.length === 0 ? (
            <p className="text-sm text-slate-500">El presupuesto no tiene tareas. Cargá el presupuesto primero.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-6">
                <div>
                  <label htmlFor="ap-start" className="text-xs font-bold text-slate-500 uppercase block mb-1">Inicio de obra</label>
                  <input id="ap-start" type="date" value={startDate} onChange={e => e.target.value && setStartDate(e.target.value)}
                    className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg" />
                </div>
                <div className="text-sm">
                  <div className="text-xs font-bold text-slate-500 uppercase">Fin estimado</div>
                  <div className="font-bold text-slate-800">{fmtDate(finish)}</div>
                </div>
                <div className="text-sm">
                  <div className="text-xs font-bold text-slate-500 uppercase">Plazo</div>
                  <div className="font-bold text-slate-800">{calendarDays} días corridos · {(calendarDays / 30.4).toLocaleString('es-AR', { maximumFractionDigits: 1 })} meses</div>
                </div>
              </div>

              <ul className="text-xs text-slate-600 space-y-1 list-disc pl-5">
                <li>Dentro de cada rubro las tareas van una después de otra, en el orden del presupuesto, con una cuadrilla. Si cargaste frentes de ataque o duración manual en una tarea, se respetan.</li>
                <li>Entre rubros sigue la secuencia de obra: estructura, mampostería, instalación gruesa, revoques, contrapisos y carpetas, pisos y revestimientos, terminación de instalaciones, pintura y cierre.</li>
                <li>Las duraciones salen del rendimiento de cada tarea y de la cantidad presupuestada.</li>
                <li>Los gastos generales (seguro, baño químico, seguridad e higiene, obrador, auxiliares) no se encadenan: ocupan todo el plazo de obra.</li>
              </ul>

              {(existing > 0 || noYield > 0) && (
                <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-1">
                  {existing > 0 && <p className="flex items-center gap-1"><AlertCircle size={13} /> El proyecto tiene {existing} vínculos cargados: se reemplazan por los del plan nuevo.</p>}
                  {noYield > 0 && <p className="flex items-center gap-1"><AlertCircle size={13} /> {noYield} tareas no tienen rendimiento cargado: se programan con 1 día. Revisalas en la tabla.</p>}
                </div>
              )}

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase">
                    <tr>
                      <th className="text-left px-3 py-2">Rubro</th>
                      <th className="text-right px-2 py-2">Tareas</th>
                      <th className="text-right px-2 py-2">Inicio</th>
                      <th className="text-right px-2 py-2">Fin</th>
                      <th className="px-3 py-2 w-1/3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.filter(g => g.node !== OVERHEAD_NODE).concat(summary.filter(g => g.node === OVERHEAD_NODE)).map(g => (
                      <tr key={g.node} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 text-slate-700">{nodeLabel(g.node)}</td>
                        <td className="px-2 py-1.5 text-right text-slate-500">{g.count}</td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">{fmtDate(g.start)}</td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">{fmtDate(g.end)}</td>
                        <td className="px-3 py-1.5">
                          <div className="relative h-2.5 bg-slate-100 rounded">
                            <div className="absolute h-2.5 bg-blue-500 rounded"
                              style={{ left: `${pos(g.start)}%`, width: `${Math.max(1, pos(g.end) - pos(g.start))}%` }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex items-center gap-3">
          <p className="text-xs text-slate-500 flex-1">Se guardan {deps.length} vínculos y la fecha de inicio. Las cantidades y los precios no cambian.</p>
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg">Cancelar</button>
          <button onClick={apply} disabled={saving || planItems.length === 0}
            className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-1 disabled:opacity-40">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Aplicar plan
          </button>
        </div>
      </div>
    </div>
  );
};
