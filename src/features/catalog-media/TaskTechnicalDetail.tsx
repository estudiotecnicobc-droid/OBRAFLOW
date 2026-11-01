import React, { useState } from 'react';
import { detailImage, rubroImage, type TaskLike } from './catalogMedia';

interface Props {
  task: TaskLike & { description?: string | null };
}

/** Detalle técnico (esquema con cotas) y qué incluye la tarea. */
export const TaskTechnicalDetail: React.FC<Props> = ({ task }) => {
  const [zoom, setZoom] = useState(false);
  const img = detailImage(task);
  if (!img && !task.description) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2">
      {img && (
        <button type="button" onClick={() => setZoom(true)} className="block w-full cursor-zoom-in" title="Ampliar detalle">
          <img src={img} alt={`Detalle técnico: ${task.name ?? ''}`} className="w-full rounded border border-slate-100" loading="lazy" />
          <span className="block text-[11px] text-slate-500 mt-1">Clic para ampliar</span>
        </button>
      )}
      {task.description && (
        <div className="text-xs text-slate-700">
          <span className="font-bold text-slate-800">Qué incluye: </span>{task.description}
        </div>
      )}
      {zoom && img && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4 cursor-zoom-out" onClick={() => setZoom(false)}>
          <img src={img} alt="" className="w-[min(95vw,900px)] max-h-[92vh] object-contain bg-white rounded-lg" />
        </div>
      )}
    </div>
  );
};

export const RubroBanner: React.FC<{ category?: string | null }> = ({ category }) => {
  const img = rubroImage(category);
  return img ? <img src={img} alt={category ?? ''} className="w-full max-h-28 object-contain rounded-lg" loading="lazy" /> : null;
};
