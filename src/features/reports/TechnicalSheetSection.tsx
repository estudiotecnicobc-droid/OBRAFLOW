import React, { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { getTechnicalSheet } from '../../../services/technicalSheetService';
import type { TechnicalSheet } from '../../../types';

interface Props {
  masterTaskId: string;
  taskCode?:    string;
}

/** Ficha técnica del APU: esquema, descripción, datos técnicos y notas. No muestra nada si el APU no tiene ficha. */
export function TechnicalSheetSection({ masterTaskId, taskCode }: Props) {
  const [sheet, setSheet] = useState<TechnicalSheet | null>(null);

  useEffect(() => {
    let alive = true;
    getTechnicalSheet(masterTaskId, taskCode)
      .then(s => { if (alive) setSheet(s); })
      .catch(() => { if (alive) setSheet(null); });
    return () => { alive = false; };
  }, [masterTaskId, taskCode]);

  if (!sheet) return null;

  const imgSrc = sheet.esquemaSvg
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sheet.esquemaSvg)}`
    : null;

  return (
    <section className="mb-4 rounded-xl border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <BookOpen size={14} className="text-slate-500 shrink-0" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">Ficha técnica</h3>
        {sheet.gremio && <span className="text-xs text-slate-400 truncate">· {sheet.gremio}</span>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2">
        {imgSrc && (
          <figure className="m-0 p-3 bg-slate-50/50 border-b md:border-b-0 md:border-r border-slate-200">
            <img src={imgSrc} alt={sheet.titulo} className="w-full h-auto" loading="lazy" />
            {sheet.pie && <figcaption className="text-[11px] text-slate-400 mt-1">{sheet.pie}</figcaption>}
          </figure>
        )}

        <div className="p-4 space-y-3 text-sm text-slate-700 min-w-0">
          {sheet.descripcion && <p className="leading-relaxed">{sheet.descripcion}</p>}

          {sheet.datosTecnicos.length > 0 && (
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Datos técnicos</h4>
              <dl className="text-xs divide-y divide-slate-100">
                {sheet.datosTecnicos.map(d => (
                  <div key={d.label} className="flex justify-between gap-3 py-1">
                    <dt className="text-slate-500">{d.label}</dt>
                    <dd className="text-slate-800 text-right">{d.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {sheet.notas.length > 0 && (
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Notas de ejecución</h4>
              <ul className="list-disc pl-4 text-xs space-y-0.5">
                {sheet.notas.map(n => <li key={n}>{n}</li>)}
              </ul>
            </div>
          )}

          {sheet.relacionadas.length > 0 && (
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Ficha compartida con</h4>
              <ul className="text-xs space-y-0.5">
                {sheet.relacionadas.map(r => (
                  <li key={r.codigo}>
                    <span className="font-mono text-slate-500">{r.codigo}</span> {r.nombre}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {sheet.fuente && (
        <p className="px-4 py-2 text-[11px] text-slate-400 border-t border-slate-200 bg-slate-50/50">{sheet.fuente}</p>
      )}
    </section>
  );
}
