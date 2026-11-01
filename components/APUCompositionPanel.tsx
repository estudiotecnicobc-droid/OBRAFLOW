import React from 'react';
import { Calculator, Package, Hammer, Settings, DollarSign, AlertCircle, Users } from 'lucide-react';
import type { ApuComposition, ApuLine } from '../utils/apuComposition';
import type { UnitPriceAnalysis } from '../types';

const money = (n: number) => '$ ' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const Section: React.FC<{ icon: React.ReactNode; title: string; subtotal: number; lines: ApuLine[]; children?: React.ReactNode }> = ({ icon, title, subtotal, lines, children }) => (
  <div>
    <div className="flex items-baseline justify-between mb-1">
      <p className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">{icon} {title}</p>
      <span className="text-[11px] font-mono font-semibold text-slate-600">{money(subtotal)}</span>
    </div>
    {children}
    <div className="divide-y divide-slate-100 rounded-md border border-slate-100 bg-slate-50/60">
      {lines.map(l => (
        <div key={l.key} className="px-2 py-1.5 text-xs flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className={`truncate ${l.missing && l.cost == null && l.name.endsWith('no encontrado') ? 'text-amber-700' : 'text-slate-700'}`} title={l.name}>{l.name}</div>
            <div className="text-[10px] text-slate-400">
              {l.detail}
              {l.missing && <span className="ml-1 text-amber-600">· {l.missing}</span>}
            </div>
          </div>
          <span className={`font-mono shrink-0 ${l.cost == null ? 'text-slate-300' : 'text-slate-600'}`}>{l.cost == null ? '—' : money(l.cost)}</span>
        </div>
      ))}
    </div>
  </div>
);

/** Composición del APU de una tarea: qué recursos lleva por unidad y cuánto cuesta cada uno. */
export const APUCompositionPanel: React.FC<{ comp: ApuComposition; analysis: UnitPriceAnalysis }> = ({ comp, analysis }) => {
  const { unit } = comp;
  return (
    <div className="space-y-3 pt-4 border-t border-slate-100">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
            <Calculator size={12} className="text-blue-400" /> Composición del APU
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">Recursos y costo por cada {unit}</p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase text-slate-400 font-bold">Costo por {unit}</div>
          <div className="font-mono font-bold text-slate-800">{money(analysis.totalUnitCost)}</div>
        </div>
      </div>

      {comp.materials.length > 0 && (
        <Section icon={<Package size={10} />} title={`Materiales (${comp.materials.length})`} subtotal={analysis.materialCost} lines={comp.materials} />
      )}

      {(comp.labor.length > 0 || comp.laborGlobal > 0) && (
        <Section icon={<Hammer size={10} />} title="Mano de obra" subtotal={analysis.laborCost} lines={comp.labor}>
          {comp.labor.length > 0 && (
            <p className="text-[10px] text-slate-500 mb-1 flex items-center gap-1 flex-wrap">
              <Users size={10} className="text-slate-400" />
              {comp.crew ? <>Cuadrilla: <span className="font-semibold">{comp.crew}</span></> : 'Cuadrilla sin oficios cargados'}
              {comp.dailyYield > 0 && <> · rinde <span className="font-semibold">{comp.dailyYield.toLocaleString('es-AR')} {unit}/día</span></>}
            </p>
          )}
          {comp.laborGlobal > 0 && (
            <p className="text-[10px] text-slate-500 mb-1">Monto global de mano de obra: {money(comp.laborGlobal)} por {unit}</p>
          )}
        </Section>
      )}

      {comp.tools.length > 0 && (
        <Section icon={<Settings size={10} />} title={`Equipos (${comp.tools.length})`} subtotal={analysis.toolCost} lines={comp.tools} />
      )}

      {comp.fixed && (
        <Section icon={<DollarSign size={10} />} title="Otros costos" subtotal={comp.fixed.cost}
          lines={[{ key: 'fixed', name: comp.fixed.label, detail: `por ${unit}`, cost: comp.fixed.cost }]} />
      )}

      {comp.hasMissing && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-2">
          <AlertCircle size={13} className="shrink-0" /> Hay recursos sin precio o que no están en tu lista: el costo puede quedar por debajo del real.
        </p>
      )}
    </div>
  );
};
