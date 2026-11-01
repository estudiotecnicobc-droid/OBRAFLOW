import React, { useState } from 'react';
import { Lock, CheckCircle2, Circle, ArrowRight, X } from 'lucide-react';
import { useERP } from '../context/ERPContext';
import { useAuth } from '../context/AuthContext';
import { useProjectSchedule } from '../hooks/useProjectSchedule';
import { ProjectStatus } from '../types';

export type ProjectStage = 'budget' | 'works';

export const getProjectStage = (status?: ProjectStatus | string): ProjectStage =>
  status === 'active' || status === 'completed' || status === 'suspended' ? 'works' : 'budget';

export const PassToWorksDialog: React.FC<{ onClose: () => void; onDone?: () => void }> = ({ onClose, onDone }) => {
  const { project, updateProjectSettings, createSnapshot } = useERP();
  const { evm } = useProjectSchedule();

  const confirm = () => {
    const today = new Date().toLocaleDateString('es-AR');
    createSnapshot(`Línea base al pasar a obra (${today})`, evm.BAC);
    updateProjectSettings({ status: 'active' });
    onClose();
    onDone?.();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="pass-to-works-title">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <h2 id="pass-to-works-title" className="text-xl font-bold text-slate-800">Aprobar presupuesto y pasar a obra</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-slate-700 p-1"><X size={18} /></button>
        </div>
        <p className="text-sm text-slate-600">Al confirmar, <strong>{project.name}</strong>:</p>
        <ol className="text-sm text-slate-700 space-y-2 list-decimal pl-5">
          <li>Pasa al estado <strong>En obra</strong>.</li>
          <li>Se fija la <strong>línea base</strong> del cronograma con el presupuesto actual.</li>
          <li>Se habilita el módulo <strong>Obra</strong>: planificación, avance y control.</li>
        </ol>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
          <button onClick={confirm} className="px-4 py-2.5 rounded-lg bg-green-700 hover:bg-green-800 text-white text-sm font-bold">Aprobar y pasar a obra</button>
        </div>
      </div>
    </div>
  );
};

export const StageLockedNotice: React.FC<{ moduleLabel: string; onOpenAnyway: () => void; onNavigate: (tab: string) => void }> = ({ moduleLabel, onOpenAnyway, onNavigate }) => {
  const { hasPermission } = useAuth();
  const [showDialog, setShowDialog] = useState(false);
  const canApprove = hasPermission(['admin', 'project_manager']);

  return (
    <div className="h-full flex items-center justify-center">
      <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-lg w-full text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"><Lock size={22} /></div>
        <h2 className="text-xl font-bold text-slate-800">{moduleLabel} se habilita al pasar a obra</h2>
        <p className="text-sm text-slate-600">La obra todavía está en etapa de presupuesto. Cuando lo apruebes se fija la línea base y se habilita el seguimiento.</p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <button onClick={() => onNavigate('budget')} className="px-4 py-2.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50">Volver al presupuesto</button>
          {canApprove && (
            <button onClick={() => setShowDialog(true)} className="px-4 py-2.5 rounded-lg bg-green-700 hover:bg-green-800 text-white text-sm font-bold">Aprobar y pasar a obra</button>
          )}
        </div>
        <button onClick={onOpenAnyway} className="text-xs text-slate-500 underline hover:text-slate-700">Abrir igual para consultar</button>
      </div>
      {showDialog && <PassToWorksDialog onClose={() => setShowDialog(false)} />}
    </div>
  );
};

export const NextStepsCard: React.FC<{ onNavigate?: (tab: string) => void }> = ({ onNavigate }) => {
  const { project } = useERP();
  const { hasPermission } = useAuth();
  const [showDialog, setShowDialog] = useState(false);
  const stage = getProjectStage(project.status);
  const canApprove = hasPermission(['admin', 'project_manager']);

  const Row: React.FC<{ done?: boolean; label: string; action?: React.ReactNode }> = ({ done, label, action }) => (
    <div className="flex flex-wrap items-center gap-3 min-h-[48px] border-b border-slate-100 last:border-b-0">
      {done ? <CheckCircle2 size={20} className="text-green-600 shrink-0" /> : <Circle size={20} className="text-slate-300 shrink-0" />}
      <span className={`flex-1 text-sm ${done ? 'text-slate-500' : 'font-medium text-slate-800'}`}>{label}</span>
      {action}
    </div>
  );

  const linkBtn = (label: string, tab: string) => onNavigate && (
    <button onClick={() => onNavigate(tab)} className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-1">
      {label} <ArrowRight size={12} />
    </button>
  );

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="text-base font-bold text-slate-800 mb-2">Próximos pasos</h3>
      {stage === 'budget' ? (
        <>
          <Row done label="Obra creada con sus tareas" />
          <Row label="Revisar cantidades y precios" action={linkBtn('Abrir presupuesto', 'budget')} />
          <Row label="Revisar el APU de cada ítem en el análisis de costos" action={linkBtn('Análisis de costos', 'grid')} />
          <Row
            label="Aprobar el presupuesto y pasar a obra"
            action={canApprove && (
              <button onClick={() => setShowDialog(true)} className="px-3 py-1.5 rounded-lg bg-green-700 hover:bg-green-800 text-white text-xs font-bold">Pasar a obra</button>
            )}
          />
        </>
      ) : (
        <>
          <Row done label="Presupuesto aprobado y línea base fijada" />
          <Row label="Registrar el avance de las tareas" action={linkBtn('Abrir planificación', 'planning')} />
          <Row label="¿Recibís materiales o contratás gremios? Activá Remitos o Subcontratistas desde «Más herramientas» en la barra lateral." />
        </>
      )}
      {showDialog && <PassToWorksDialog onClose={() => setShowDialog(false)} />}
    </div>
  );
};
