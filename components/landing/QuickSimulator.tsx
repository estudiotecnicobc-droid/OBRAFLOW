import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, Loader2 } from 'lucide-react';
import { buildRows, defaultValues, rubroCategory } from '../../src/features/quickBudget/engine';
import type { QuickInput, QuickTemplate, V } from '../../src/features/quickBudget/types';
import { MONO, Window } from './shared';

/** Plantillas de la demo y las medidas que se muestran; el resto queda en su valor por defecto. */
const DEMO_FIELDS: { id: string; label: string; keys: string[] }[] = [
  { id: 'pintura', label: 'Pintura', keys: ['sup', 'h', 'pue', 'ext'] },
  { id: 'piso', label: 'Cambio de piso', keys: ['l', 'a', 'pue', 'con'] },
  { id: 'muro', label: 'Muro', keys: ['m5', 'm6', 'm8', 'm15'] },
  { id: 'vereda', label: 'Vereda', keys: ['l', 'a', 'ramp', 'ret'] },
  { id: 'terraza', label: 'Terraza', keys: ['l', 'a', 'ret', 'tra'] },
];

const qtyFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
const prettyRubro = (r: string) => {
  const name = rubroCategory(r).replace(/^\d+\s*/, '').toLowerCase();
  return name.charAt(0).toUpperCase() + name.slice(1);
};
const shortLabel = (i: QuickInput) => i.label.replace(/^¿|\?$/g, '').split(' (')[0];

const Field: React.FC<{ input: QuickInput; value: number; onChange: (n: number) => void }> = ({ input, value, onChange }) => {
  const label = shortLabel(input);
  if (input.kind === 'bool') {
    const on = value === 1;
    return (
      <div className="flex items-center justify-between gap-3 text-[13px] text-slate-600">
        <span id={`sim-${input.key}`}>{label}</span>
        <button
          type="button" role="switch" aria-checked={on} aria-labelledby={`sim-${input.key}`}
          onClick={() => onChange(on ? 0 : 1)}
          className={`w-11 h-6 rounded-full relative shrink-0 transition-colors ${on ? 'bg-blue-600' : 'bg-slate-300'}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? 'right-0.5' : 'left-0.5'}`} />
        </button>
      </div>
    );
  }
  return (
    <label className="flex items-center justify-between gap-3 text-[13px] text-slate-600">
      <span className="min-w-0">{label}</span>
      <span className="flex items-center gap-1.5 shrink-0">
        <input
          type="number" inputMode="decimal" min={0} step="any" value={value}
          onChange={e => onChange(Math.max(0, Number(e.target.value) || 0))}
          className={`w-20 text-right border border-slate-300 rounded px-2 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 ${MONO}`}
        />
        <span className={`text-[11px] text-slate-400 w-7 ${MONO}`}>{input.unit}</span>
      </span>
    </label>
  );
};

export const QuickSimulator: React.FC<{ onSignup: () => void }> = ({ onSignup }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [templates, setTemplates] = useState<QuickTemplate[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(DEMO_FIELDS[0].id);
  const [values, setValues] = useState<Record<string, V>>({});

  // Las plantillas pesan unos 90 kB: se bajan recién cuando la sección se acerca a la pantalla.
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const load = () => import('../../src/features/quickBudget/templates')
      .then(m => setTemplates(m.QUICK_TEMPLATES))
      .catch(() => setFailed(true));
    if (typeof IntersectionObserver === 'undefined') { load(); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { observer.disconnect(); load(); }
    }, { rootMargin: '600px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const template = templates?.find(t => t.id === active);
  const fields = DEMO_FIELDS.find(f => f.id === active)!;
  const current = useMemo(() => (template ? { ...defaultValues(template), ...values[active] } : {}), [template, values, active]);
  const inputs = template ? fields.keys.map(k => template.inputs.find(i => i.key === k)).filter((i): i is QuickInput => !!i) : [];
  const groups = useMemo(() => {
    if (!template) return [];
    const rows = buildRows(template, current).filter(r => r.included && r.quantity > 0);
    const map = new Map<string, typeof rows>();
    for (const r of rows) map.set(prettyRubro(r.rubro), [...(map.get(prettyRubro(r.rubro)) ?? []), r]);
    return [...map.entries()];
  }, [template, current]);
  const taskCount = groups.reduce((s, [, rows]) => s + rows.length, 0);

  const setValue = (key: string, n: number) => setValues(v => ({ ...v, [active]: { ...v[active], [key]: n } }));

  return (
    <div ref={rootRef}>
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1" role="tablist" aria-label="Tipo de obra">
        {DEMO_FIELDS.map(f => (
          <button
            key={f.id} type="button" role="tab" aria-selected={f.id === active} onClick={() => setActive(f.id)}
            className={`shrink-0 text-sm font-semibold px-4 py-2 rounded-lg border transition-colors ${f.id === active ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-300 text-slate-700 hover:border-slate-400'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Window title={`Presupuesto rápido · ${fields.label}`} className="mt-4">
        {failed ? (
          <p className="p-8 text-sm text-slate-600">No se pudo cargar la demo. Recargá la página para volver a probar.</p>
        ) : !template ? (
          <p className="p-8 text-sm text-slate-500 flex items-center gap-2" role="status"><Loader2 size={15} className="animate-spin text-blue-600" /> Cargando la demo</p>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div className="p-5 md:p-6 border-b md:border-b-0 md:border-r border-slate-100">
              <p className={`text-[10px] uppercase tracking-wider text-slate-400 ${MONO}`}>1 · Tus medidas</p>
              <div className="mt-4 space-y-3.5">
                {inputs.map(i => <Field key={i.key} input={i} value={current[i.key] ?? 0} onChange={n => setValue(i.key, n)} />)}
              </div>
              <button type="button" onClick={onSignup} className="mt-6 w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors">
                Verlo con precios <ArrowRight size={15} />
              </button>
              <p className="mt-2 text-xs text-slate-400 text-center">Creás tu cuenta gratis y armás el presupuesto con el catálogo.</p>
            </div>
            <div className="p-5 md:p-6 min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <p className={`text-[10px] uppercase tracking-wider text-slate-400 ${MONO}`}>2 · Lo que computa ObraFlow</p>
                <p className="text-xs font-medium text-blue-700 shrink-0" aria-live="polite">{taskCount} tareas</p>
              </div>
              <div className="mt-3 max-h-80 overflow-y-auto pr-1 space-y-4">
                {groups.map(([rubro, rows]) => (
                  <div key={rubro}>
                    <p className="text-[11px] font-semibold text-slate-500">{rubro}</p>
                    <ul className="mt-1 divide-y divide-slate-100">
                      {rows.map(r => (
                        <li key={r.task.code ?? r.task.name}>
                          <details className="group">
                            <summary className="flex items-center gap-2 py-2 cursor-pointer list-none text-[13px] text-slate-700 [&::-webkit-details-marker]:hidden">
                              <ChevronDown size={13} className="text-slate-400 shrink-0 transition-transform group-open:rotate-180" />
                              <span className="flex-1 min-w-0">{r.task.name}</span>
                              <span className={`text-[12px] text-slate-500 shrink-0 ${MONO}`}>{qtyFormat.format(r.quantity)} {r.task.unit}</span>
                            </summary>
                            <p className="pl-5 pb-2 text-xs text-slate-500 leading-relaxed">{r.task.includes}</p>
                          </details>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Window>
    </div>
  );
};
