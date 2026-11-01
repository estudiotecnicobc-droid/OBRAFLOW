import React, { useEffect, useRef, useState } from 'react';
import { findFicha, fichaImage, rubroFicha, type TaskLike, type Ficha } from './catalogMedia';

interface Props {
  task: TaskLike & { description?: string | null };
}

const FichaTables: React.FC<{ ficha: Ficha }> = ({ ficha }) => (
  <div className="space-y-2">
    {ficha.sections.map(sec => (
      <div key={sec.title}>
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{sec.title}</div>
        {sec.rows ? (
          <table className="w-full text-xs">
            <tbody>
              {sec.rows.map((r, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-0.5 pr-2 text-slate-700">{r[0]}</td>
                  <td className="py-0.5 text-right tabular-nums whitespace-nowrap text-slate-800">{r[1]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <ul className="list-disc pl-4 text-xs text-slate-700">{sec.items?.map((it, i) => <li key={i}>{it}</li>)}</ul>
        )}
      </div>
    ))}
    <p className="text-[10px] text-slate-400">Valores de referencia de la ficha (AMBA); los consumos del presupuesto salen del APU.</p>
  </div>
);

/** Ficha técnica (esquema con cotas, qué incluye y datos de referencia). */
export const TaskTechnicalDetail: React.FC<Props> = ({ task }) => {
  const [zoom, setZoom] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const ficha = findFicha(task);
  // Al elegir una tarea, la ficha queda a la vista sin desplazarse a mano.
  useEffect(() => { ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }); }, []);
  if (!ficha && !task.description) return null;
  const img = ficha ? fichaImage(ficha) : null;

  return (
    <div ref={ref} className="bg-white border border-slate-200 rounded-lg p-3 space-y-2 scroll-mt-4">
      {task.description && (
        <div className="text-xs text-slate-700">
          <span className="font-bold text-slate-800">Qué incluye: </span>{task.description}
        </div>
      )}
      {img && ficha && (
        <>
          <button type="button" onClick={() => setZoom(true)} className="block w-full cursor-zoom-in" title="Ampliar">
            <img src={img} alt={ficha.title} className="w-full max-h-[45vh] object-contain rounded border border-slate-100" loading="lazy" />
            <span className="block text-[11px] text-slate-500 mt-1">{ficha.caption} Clic para ampliar.</span>
          </button>
          <button type="button" onClick={() => setOpen(o => !o)} className="text-xs font-bold text-blue-700 hover:underline">
            {open ? 'Ocultar ficha técnica' : 'Ver ficha técnica (datos, consumos y mano de obra)'}
          </button>
          {open && <FichaTables ficha={ficha} />}
        </>
      )}
      {zoom && img && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4 cursor-zoom-out" onClick={() => setZoom(false)}>
          <img src={img} alt="" className="w-[min(95vw,1000px)] max-h-[92vh] object-contain bg-white rounded-lg" />
        </div>
      )}
    </div>
  );
};

export const RubroBanner: React.FC<{ category?: string | null }> = ({ category }) => {
  const ficha = rubroFicha(category);
  return ficha ? (
    <img src={fichaImage(ficha)} alt={category ?? ''} className="w-full max-h-32 object-contain rounded-lg bg-white border border-slate-100" loading="lazy" />
  ) : null;
};
