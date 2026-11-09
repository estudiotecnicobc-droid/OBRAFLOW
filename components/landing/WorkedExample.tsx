import React, { useState } from 'react';
import {
  BUDGET_GROUPS, COST_SPLIT, DIRECT_COST, ITEM_COUNT, PLAN_PHASES, PRICES_LABEL, RUBRO_COUNT, SURFACE_M2,
  WALL_APU, WALL_SHEET, lineTotal, wallQuantity, wallUnitCost,
} from '../../src/features/landing/demoExample';
import type { ApuLine } from '../../src/features/landing/demoExample';
import { MONO, Window } from './shared';

const money = (n: number) => `$ ${Math.round(n).toLocaleString('es-AR')}`;
const num = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 4 });
const qty = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MeasureStep = () => (
  <Window title="Planilla de medición · Muro de ladrillo hueco 18">
    <div className="p-5">
      <table className="w-full text-[13px]">
        <tbody>
          {WALL_SHEET.map(l => (
            <tr key={l.label} className="border-b border-slate-100">
              <td className="py-3 pr-3 text-slate-700">{l.label}<span className={`block text-[11px] text-slate-400 ${MONO}`}>{l.formula}</span></td>
              <td className={`py-3 text-right text-slate-800 whitespace-nowrap ${MONO}`}>{qty(l.subtotal)} m²</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="pt-3 font-semibold text-slate-900">Cantidad del ítem</td>
            <td className={`pt-3 text-right font-semibold text-blue-700 whitespace-nowrap ${MONO}`}>{qty(wallQuantity())} m²</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </Window>
);

const ApuRows: React.FC<{ title: string; lines: ApuLine[] }> = ({ title, lines }) => (
  <>
    <tr><th colSpan={3} className={`pt-3 pb-1 text-left font-normal text-[10px] uppercase tracking-wider text-slate-400 ${MONO}`}>{title}</th></tr>
    {lines.map(l => (
      <tr key={l.name} className="border-t border-slate-100">
        <td className="py-2 pr-2 text-slate-700">{l.name}</td>
        <td className={`py-2 pr-2 text-right text-[11px] text-slate-400 whitespace-nowrap ${MONO}`}>{num(l.quantity)} {l.unit}</td>
        <td className={`py-2 text-right text-slate-800 whitespace-nowrap ${MONO}`}>{money(lineTotal(l))}</td>
      </tr>
    ))}
  </>
);

const ApuStep = () => (
  <Window title="APU · OF-MAM-002 · por m²">
    <div className="px-5 pb-5 pt-2">
      <table className="w-full text-[13px]">
        <tbody>
          <ApuRows title="Materiales" lines={WALL_APU.materials} />
          <ApuRows title="Mano de obra" lines={WALL_APU.labor} />
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200">
            <td colSpan={2} className="pt-3 font-semibold text-slate-900">Costo por m²</td>
            <td className={`pt-3 text-right font-semibold text-blue-700 whitespace-nowrap ${MONO}`}>{money(wallUnitCost())}</td>
          </tr>
          <tr>
            <td colSpan={2} className="pt-1 text-xs text-slate-500">× {qty(wallQuantity())} m² medidos</td>
            <td className={`pt-1 text-right text-xs text-slate-500 whitespace-nowrap ${MONO}`}>{money(wallUnitCost() * wallQuantity())}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </Window>
);

const BudgetStep = () => {
  const max = BUDGET_GROUPS[0].amount;
  const split: [string, number][] = [['Materiales', COST_SPLIT.materials], ['Mano de obra', COST_SPLIT.labor], ['Subcontratos y otros', COST_SPLIT.other]];
  return (
    <Window title="Presupuesto · Casa de ejemplo">
      <div className="p-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
          <div>
            <p className={`text-[10px] uppercase tracking-wider text-slate-400 ${MONO}`}>Costo directo</p>
            <p className="text-2xl font-extrabold tracking-tight text-slate-900">{money(DIRECT_COST)}</p>
          </div>
          <p className={`text-[12px] text-slate-500 ${MONO}`}>{money(DIRECT_COST / SURFACE_M2)} / m²</p>
        </div>
        <div className="mt-4 space-y-2">
          {BUDGET_GROUPS.map(g => (
            <div key={g.name}>
              <div className="flex justify-between gap-3 text-[12px]">
                <span className="text-slate-700 min-w-0 truncate">{g.name}</span>
                <span className={`text-slate-500 shrink-0 ${MONO}`}>{money(g.amount)}</span>
              </div>
              <div className="h-1 bg-slate-100 rounded-full mt-1"><div className="h-full bg-blue-600 rounded-full" style={{ width: `${(g.amount / max) * 100}%` }} /></div>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-3 border-t border-dashed border-slate-200 grid grid-cols-3 gap-2 text-[11px]">
          {split.map(([label, value]) => (
            <div key={label}><p className="text-slate-400">{label}</p><p className={`text-slate-800 font-semibold ${MONO}`}>{Math.round((value / DIRECT_COST) * 100)} %</p></div>
          ))}
        </div>
      </div>
    </Window>
  );
};

const PlanStep = () => (
  <Window title="Plan de trabajos · generado del presupuesto">
    <div className="p-5">
      <div className="flex justify-between text-[11px] text-slate-500 mb-3">
        <span>Plazo previsto <b className={`text-slate-800 ${MONO}`}>8 meses</b></span>
        <span>{ITEM_COUNT} ítems encadenados</span>
      </div>
      <div className="space-y-2">
        {PLAN_PHASES.map(([name, start, len]) => (
          <div key={name} className="grid grid-cols-[42%_1fr] items-center gap-2">
            <span className="text-[11px] text-slate-600 truncate">{name}</span>
            <div className="h-3.5 relative"><span className={`absolute h-full rounded-sm ${name.startsWith('Instalaciones') ? 'bg-sky-500' : 'bg-blue-600'}`} style={{ left: `${start}%`, width: `${len}%` }} /></div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-slate-400">El orden es el que aplica el generador. El largo de las barras es esquemático.</p>
    </div>
  </Window>
);

const STEPS: { tab: string; title: string; body: string; note?: string; View: React.FC }[] = [
  { tab: 'Medir', title: 'Medís una vez y la cantidad queda con su origen.', body: 'El muro exterior se mide en planilla: frente, laterales y el descuento de las aberturas. Cualquiera que abra el presupuesto ve de dónde salieron los 84,65 m².', View: MeasureStep },
  { tab: 'Analizar', title: 'Cada precio se puede abrir y explicar.', body: 'El ítem usa un análisis de precios unitarios con materiales y mano de obra por oficio. Si tu rendimiento o tu proveedor son otros, lo cambiás en tu empresa.', note: 'Mano de obra: jornada de 9 h, 10 m² por día y tarifa UOCRA con cargas sociales.', View: ApuStep },
  { tab: 'Presupuestar', title: 'El presupuesto completo, por rubro y por tipo de costo.', body: `La casa entera son ${ITEM_COUNT} ítems en ${RUBRO_COUNT} rubros. Sobre este costo directo aplicás los gastos generales, el beneficio y los impuestos de tu empresa.`, View: BudgetStep },
  { tab: 'Planificar', title: 'El plan de trabajos sale de los mismos ítems.', body: 'Los rubros se encadenan en orden de obra y las instalaciones se parten en obra gruesa y terminación. Después ajustás fechas y dependencias a mano.', View: PlanStep },
];

export const WorkedExample: React.FC = () => {
  const [step, setStep] = useState(0);
  const { title, body, note, View } = STEPS[step];
  return (
    <div>
      <div className="flex gap-1 overflow-x-auto border-b border-slate-900/10" role="tablist" aria-label="Pasos del ejemplo">
        {STEPS.map((s, i) => (
          <button
            key={s.tab} type="button" role="tab" aria-selected={i === step} onClick={() => setStep(i)}
            className={`shrink-0 flex items-center gap-2 px-3 sm:px-4 py-3 -mb-px border-b-2 text-sm font-semibold transition-colors ${i === step ? 'border-blue-600 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            <span className={`text-[11px] ${MONO}`}>{String(i + 1).padStart(2, '0')}</span> {s.tab}
          </button>
        ))}
      </div>
      <div className="mt-10 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-2 gap-10 lg:gap-16 items-center">
        <div>
          <h3 className="text-2xl md:text-[2rem] font-bold tracking-[-0.02em] text-slate-900 leading-tight">{title}</h3>
          <p className="mt-4 text-slate-600 leading-relaxed">{body}</p>
          {note && <p className="mt-3 text-sm text-slate-500">{note}</p>}
        </div>
        <View />
      </div>
      <p className="mt-10 text-xs text-slate-400 max-w-2xl">
        {PRICES_LABEL}. Parte de los precios son estimados: son una referencia y no reemplazan una cotización de tu obra.
      </p>
    </div>
  );
};
