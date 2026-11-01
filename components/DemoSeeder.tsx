import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, AlertTriangle, Home } from 'lucide-react';
import { useERP } from '../context/ERPContext';
import { useMasterTasks } from '../hooks/useMasterTasks';
import { useMasterMaterials } from '../hooks/useMasterMaterials';
import { useQuickBudgetApply } from '../hooks/useQuickBudgetApply';
import { masterTasksService } from '../services/masterTasksSupabaseService';
import { makeSourceResolver } from '../src/features/quickBudget/resolveSource';
import { buildDemoRows, buildSheetLines, DEMO_NAME, DEMO_SHEETS } from '../src/features/demo/demoHouse';
import { clearDemoPending, isDemoPending, markDemo, waitForProject } from '../src/features/demo/demoState';
import type { QuickSelection } from './QuickBudgetWizard';

const newId = () => crypto.randomUUID();

/**
 * Llena la obra de ejemplo recién creada: copia las tareas del Catálogo ObraFlow, carga los ítems
 * con el mismo camino del presupuesto rápido y agrega planillas de medición. Se monta con la obra
 * activa y no hace nada si no hay una carga pendiente.
 */
export const DemoSeeder: React.FC<{ onDone: (tab: string) => void }> = ({ onDone }) => {
  const { project, tasksLoaded, budgetItemsLoading, saveMeasurementSheet, updateBudgetItem } = useERP();
  const orgId = project.organizationId;
  const { tasks: masterTasks, refetch } = useMasterTasks(orgId);
  const { items: masterMaterials } = useMasterMaterials(orgId);
  const masterMaterialsMap = useMemo(() => Object.fromEntries(masterMaterials.map(m => [m.id, m])), [masterMaterials]);
  const { apply } = useQuickBudgetApply({ masterTasks, refetchMasterTasks: refetch, masterMaterialsMap });

  const [phase, setPhase] = useState<'idle' | 'start' | 'catalog' | 'items' | 'sheets' | 'error'>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState('');
  const started = useRef(false);

  const pending = !!orgId && project.name === DEMO_NAME && project.items.length === 0 && isDemoPending(orgId);

  const run = async () => {
    setPhase('start'); setError('');
    try {
      if (!(await waitForProject(project.id))) throw new Error('La obra no terminó de guardarse.');
      const [{ RUBRO_TEMPLATES }, globalTasks] = await Promise.all([
        import('../src/features/quickBudget/rubroTemplates'),
        masterTasksService.listGlobal(),
      ]);
      const resolve = makeSourceResolver(masterTasks, globalTasks);
      const rows: QuickSelection[] = buildDemoRows(RUBRO_TEMPLATES)
        .map(r => ({ ...r, source: resolve(r.task.name, r.task.code) }));

      const { created } = await apply(rows, DEMO_NAME, (done, total, p) => {
        setPhase(p); setProgress({ done, total });
      });

      setPhase('sheets');
      for (const { row, budgetItemId } of created) {
        const defs = row.task.code ? DEMO_SHEETS[row.task.code] : undefined;
        if (!defs) continue;
        const { lines, total } = buildSheetLines(defs, newId);
        saveMeasurementSheet({
          id: newId(), organizationId: orgId, budgetItemId, lines, totalQuantity: total,
          lastUpdated: new Date().toISOString(), updatedBy: 'ObraFlow',
        });
        if (Math.abs(total - row.quantity) > 0.0005) updateBudgetItem(budgetItemId, { quantity: total });
      }

      clearDemoPending();
      await markDemo(orgId, 'creada');
      setPhase('idle');
      onDone('budget');
    } catch (e: any) {
      console.error('[DemoSeeder]', e);
      setError(e?.message ?? 'No se pudo armar la obra de ejemplo.');
      setPhase('error');
    }
  };

  // Una obra nueva (por ejemplo, al reiniciar la de ejemplo) habilita una nueva carga.
  useEffect(() => { started.current = false; }, [project.id]);

  useEffect(() => {
    if (!pending || started.current || !tasksLoaded || budgetItemsLoading) return;
    started.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, tasksLoaded, budgetItemsLoading]);

  if (phase === 'idle') return null;

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const label = phase === 'catalog' ? `Copiando tareas del Catálogo ObraFlow (${progress.done} de ${progress.total})`
    : phase === 'items' ? `Cargando ítems del presupuesto (${progress.done} de ${progress.total})`
    : phase === 'sheets' ? 'Agregando planillas de medición'
    : 'Preparando la obra';

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="demo-title">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center"><Home size={20} className="text-blue-600" /></div>
          <div>
            <h2 id="demo-title" className="font-bold text-slate-800">Armando la obra de ejemplo</h2>
            <p className="text-xs text-slate-500">Vivienda en planta baja de 70 m², sistema tradicional con losa</p>
          </div>
        </div>
        {phase === 'error' ? (
          <div className="space-y-3">
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {error}
            </p>
            {project.items.length > 0 && (
              <p className="text-xs text-slate-600">La obra quedó cargada a medias. Podés volver a armarla desde <strong>Ajustes de la obra → Reiniciar</strong>.</p>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => { clearDemoPending(); setPhase('idle'); }} className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">Cerrar</button>
              {project.items.length === 0 && (
                <button onClick={run} className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700">Reintentar</button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2" role="status">
            <p className="text-sm text-slate-700 flex items-center gap-2"><Loader2 size={15} className="animate-spin text-blue-600" /> {label}</p>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${phase === 'sheets' ? 100 : pct}%` }} />
            </div>
            <p className="text-xs text-slate-500">Las cantidades salen del cómputo paramétrico de ObraFlow. Tarda uno o dos minutos; no cierres la pestaña.</p>
          </div>
        )}
      </div>
    </div>
  );
};
