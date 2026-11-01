import React, { useState } from 'react';
import { Home, RotateCcw, Trash2 } from 'lucide-react';
import { useERP } from '../context/ERPContext';
import { DEMO_NAME, demoProjectData } from '../src/features/demo/demoHouse';
import { markDemo, setDemoPending } from '../src/features/demo/demoState';

/** Reiniciar o borrar la obra de ejemplo, desde «Ajustes de la obra». */
export const DemoProjectActions: React.FC = () => {
  const { project, deleteProject, createNewProject } = useERP();
  const [confirm, setConfirm] = useState<'reset' | 'delete' | null>(null);
  if (project.name !== DEMO_NAME) return null;

  const reset = () => {
    const orgId = project.organizationId;
    deleteProject(project.id);
    setDemoPending(orgId);
    createNewProject(demoProjectData());
  };
  const remove = () => {
    const orgId = project.organizationId;
    deleteProject(project.id);
    markDemo(orgId, 'borrada');
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-3" data-testid="demo-actions">
      <Home size={20} className="text-blue-600 shrink-0" />
      <div className="flex-1 text-sm text-blue-900">
        <strong>Esta es la obra de ejemplo.</strong> Podés modificarla para probar ObraFlow. Si querés volver al estado original, reiniciala; cuando ya no la necesites, borrala.
      </div>
      {confirm ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-blue-900">{confirm === 'reset' ? '¿Reiniciar? Se pierden los cambios.' : '¿Borrar la obra de ejemplo?'}</span>
          <button onClick={() => setConfirm(null)} className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50">Cancelar</button>
          <button onClick={confirm === 'reset' ? reset : remove}
            className={`px-3 py-1.5 rounded-lg text-white font-bold ${confirm === 'reset' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'}`}>
            {confirm === 'reset' ? 'Sí, reiniciar' : 'Sí, borrar'}
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button onClick={() => setConfirm('reset')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-300 bg-white text-blue-700 text-sm font-bold hover:bg-blue-100">
            <RotateCcw size={14} /> Reiniciar
          </button>
          <button onClick={() => setConfirm('delete')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 bg-white text-red-600 text-sm font-bold hover:bg-red-50">
            <Trash2 size={14} /> Borrar
          </button>
        </div>
      )}
    </div>
  );
};
