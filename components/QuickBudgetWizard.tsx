import React, { useEffect, useMemo, useState } from 'react';
import { X, ArrowLeft, ArrowRight, Check, Zap, Loader2, Info, Search, Layers } from 'lucide-react';
import { MasterTask } from '../types';
import { masterTasksService } from '../services/masterTasksSupabaseService';
import { QUICK_TEMPLATES } from '../src/features/quickBudget/templates';
import { DURLOCK_TEMPLATE } from '../src/features/quickBudget/durlockTemplate';
import { buildRows, defaultValues, evaluate } from '../src/features/quickBudget/engine';
import type { QuickRow, QuickTemplate, V } from '../src/features/quickBudget/types';
import { FichaThumb } from '../src/features/catalog-media/TaskTechnicalDetail';
import { fichaImage, rubroFicha } from '../src/features/catalog-media/catalogMedia';

export type QuickSource = { kind: 'org'; task: MasterTask } | { kind: 'global'; task: MasterTask } | { kind: 'none' };

export interface QuickSelection extends QuickRow {
  source: QuickSource;
  /** La tarea ya está en el presupuesto. */
  already?: boolean;
}

interface Props {
  orgTasks: MasterTask[];
  onClose: () => void;
  /** Devuelve un resumen para mostrar al terminar. */
  onApply: (rows: QuickSelection[], template: QuickTemplate) => Promise<string>;
  /** Abre el asistente directo en las tareas de este rubro (por ejemplo, "34 PINTURA"). */
  initialRubro?: string;
  /** Códigos y nombres de las tareas que ya están en el presupuesto. */
  existing?: { codes: string[]; names: string[] };
}

const norm = (s?: string) => (s ?? '').trim().toLowerCase();

const fmt = (x: number) => x.toLocaleString('es-AR', { maximumFractionDigits: 2 });

const SOURCE_BADGE: Record<QuickSource['kind'], { label: string; cls: string; title: string }> = {
  org: { label: 'En tu catálogo', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', title: 'Se usa el análisis de precio de tu catálogo.' },
  global: { label: 'Catálogo ObraFlow', cls: 'bg-blue-50 text-blue-700 border-blue-200', title: 'Se copia a tu catálogo con su análisis de precio.' },
  none: { label: 'Precio a completar', cls: 'bg-amber-50 text-amber-700 border-amber-200', title: 'Todavía no tiene análisis de precio: se agrega la tarea y la cantidad, y el precio lo completás vos.' },
};

// La plantilla de placa de yeso se reemplaza por la de sistemas Durlock.
const OBRA_IMAGES = new Set(['cocina', 'muro', 'pintura', 'piso', 'terraza', 'durlock', 'frente', 'vereda', 'electrica', 'ampliacion']);
const obraImage = (id: string) => (OBRA_IMAGES.has(id) ? `/catalogo/obras/${id}.svg` : null);
/** Imagen del paso de datos: la de la obra completa o, si es un rubro, su esquema representativo. */
const stepImage = (t: QuickTemplate) => {
  const obra = obraImage(t.id);
  if (obra) return obra;
  const f = rubroFicha(t.rubros[0]?.rubro);
  return f ? fichaImage(f) : null;
};

const TEMPLATES = QUICK_TEMPLATES.map(t => (t.id === DURLOCK_TEMPLATE.id ? DURLOCK_TEMPLATE : t));

export const QuickBudgetWizard: React.FC<Props> = ({ orgTasks, onClose, onApply, initialRubro, existing }) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [picked, setPicked] = useState<QuickTemplate[]>([]);
  const [inputsBy, setInputsBy] = useState<Record<string, V>>({});
  const [rubroTemplates, setRubroTemplates] = useState<QuickTemplate[]>([]);
  const [checked, setChecked] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [overrides, setOverrides] = useState<Record<number, { included?: boolean; quantity?: number }>>({});
  const [globalTasks, setGlobalTasks] = useState<MasterTask[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    masterTasksService.listGlobal().then(setGlobalTasks).catch(() => setGlobalTasks([]));
    import('../src/features/quickBudget/rubroTemplates')
      .then(m => {
        setRubroTemplates(m.RUBRO_TEMPLATES);
        const num = initialRubro?.trim().slice(0, 2);
        if (!num || !/^\d\d$/.test(num)) return;
        const matches = m.RUBRO_TEMPLATES.filter(t => t.name.startsWith(num + ' '));
        if (matches.length === 1) {
          pick(matches);
          setStep(3);
        } else if (matches.length > 1) {
          setChecked(matches.map(t => t.id));
        }
      })
      .catch(() => setRubroTemplates([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAlready = useMemo(() => {
    const codes = new Set((existing?.codes ?? []).map(norm));
    const names = new Set((existing?.names ?? []).map(norm));
    return (name: string, code?: string) => (!!code && codes.has(norm(code))) || names.has(norm(name));
  }, [existing]);

  const resolve = useMemo(() => {
    const orgByCode = new Map<string, MasterTask>(orgTasks.filter(t => t.code).map(t => [norm(t.code), t]));
    const orgByName = new Map<string, MasterTask>(orgTasks.map(t => [norm(t.name), t]));
    const globByCode = new Map<string, MasterTask>(globalTasks.filter(t => t.code).map(t => [norm(t.code), t]));
    const globByName = new Map<string, MasterTask>(globalTasks.map(t => [norm(t.name), t]));
    return (name: string, code?: string): QuickSource => {
      const o = (code ? orgByCode.get(norm(code)) : undefined) ?? orgByName.get(norm(name));
      if (o) return { kind: 'org', task: o };
      const g = (code ? globByCode.get(norm(code)) : undefined) ?? globByName.get(norm(name));
      if (g) return { kind: 'global', task: g };
      return { kind: 'none' };
    };
  }, [orgTasks, globalTasks]);

  const pick = (ts: QuickTemplate[]) => {
    setPicked(ts);
    setInputsBy(prev => Object.fromEntries(ts.map(t => [t.id, prev[t.id] ?? defaultValues(t)])));
    setOverrides({});
    setStep(2);
  };

  const tpl: QuickTemplate | null = picked.length === 0 ? null
    : picked.length === 1 ? picked[0]
    : { ...picked[0], id: 'combinado', name: `${picked.length} rubros`, description: picked.map(t => t.name).join(', ') };

  const toggleChecked = (id: string) =>
    setChecked(c => (c.includes(id) ? c.filter(x => x !== id) : [...c, id]));

  const visibleRubros = useMemo(() => {
    const q = norm(search);
    if (!q) return rubroTemplates;
    return rubroTemplates.filter(t =>
      norm(t.name).includes(q) || norm(t.description).includes(q) ||
      t.rubros.some(r => r.tasks.some(k => norm(k.name).includes(q))));
  }, [rubroTemplates, search]);

  const setInput = (tid: string, key: string, val: number) =>
    setInputsBy(p => ({ ...p, [tid]: { ...p[tid], [key]: val } }));

  const evaluatedBy = useMemo(
    () => Object.fromEntries(picked.map(t => [t.id, evaluate(t, inputsBy[t.id] ?? defaultValues(t))])),
    [picked, inputsBy],
  );
  const baseRows = useMemo(
    () => picked.flatMap(t => buildRows(t, inputsBy[t.id] ?? defaultValues(t))),
    [picked, inputsBy],
  );
  const rows: QuickSelection[] = useMemo(
    () => baseRows.map((r, i) => {
      const already = isAlready(r.task.name, r.task.code);
      return {
        ...r,
        included: overrides[i]?.included ?? (r.included && !already),
        quantity: overrides[i]?.quantity ?? r.quantity,
        source: resolve(r.task.name, r.task.code),
        already,
      };
    }),
    [baseRows, overrides, resolve, isAlready],
  );
  const selected = rows.filter(r => r.included && r.quantity > 0);
  const counts = selected.reduce((a, r) => ({ ...a, [r.source.kind]: (a[r.source.kind] ?? 0) + 1 }), {} as Record<string, number>);

  const groups = useMemo(() => {
    const out: { rubro: string; items: { row: QuickSelection; idx: number }[] }[] = [];
    rows.forEach((row, idx) => {
      const g = out[out.length - 1];
      if (g && g.rubro === row.rubro) g.items.push({ row, idx });
      else out.push({ rubro: row.rubro, items: [{ row, idx }] });
    });
    return out;
  }, [rows]);

  const setOv = (i: number, patch: { included?: boolean; quantity?: number }) =>
    setOverrides(o => ({ ...o, [i]: { ...o[i], ...patch } }));

  const apply = async () => {
    if (!tpl) return;
    setBusy(true); setError('');
    try {
      setResult(await onApply(selected, tpl));
      setStep(4);
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo cargar el presupuesto.');
    } finally {
      setBusy(false);
    }
  };

  const titles = ['Elegí qué vas a presupuestar', 'Medidas y opciones', 'Revisá las tareas', 'Listo'];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="qb-title">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center"><Zap size={18} className="text-orange-600" /></div>
          <div className="flex-1 min-w-0">
            <h2 id="qb-title" className="font-bold text-slate-800">Presupuesto rápido{tpl && step > 1 ? ` · ${tpl.name}` : ''}</h2>
            <p className="text-xs text-slate-500">Paso {step} de 4 · {titles[step - 1]}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="p-2 rounded-full hover:bg-slate-100 text-slate-500"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {step === 1 && (
            <div className="space-y-6">
              <section>
                <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">Obras completas</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {TEMPLATES.map(t => {
                    const n = t.rubros.reduce((a, r) => a + r.tasks.length, 0);
                    return (
                      <button key={t.id} onClick={() => pick([t])}
                        className="text-left p-4 border border-slate-200 rounded-xl hover:border-orange-400 hover:shadow-sm transition-all flex gap-3 items-start">
                        {obraImage(t.id) && <img src={obraImage(t.id)!} alt="" className="w-24 h-16 object-cover rounded-lg shrink-0" loading="lazy" />}
                        <span className="min-w-0">
                          <span className="block font-bold text-sm text-slate-800">{t.name}</span>
                          <span className="block text-xs text-slate-500 mt-1 leading-relaxed">{t.description}</span>
                          <span className="block text-[11px] text-slate-400 mt-2">{n} tareas posibles</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <div className="flex flex-wrap items-end gap-3 mb-2">
                  <div className="flex-1 min-w-[200px]">
                    <h3 className="text-xs font-bold text-slate-500 uppercase">Por rubro</h3>
                    <p className="text-xs text-slate-500">Elegí uno o varios rubros: cada uno trae todas sus tareas con opciones y cantidades de una vivienda tipo de 70 m² para que las ajustes.</p>
                  </div>
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar rubro o tarea"
                      aria-label="Buscar rubro o tarea"
                      className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-orange-400" />
                  </div>
                </div>
                {rubroTemplates.length === 0 ? (
                  <p className="text-xs text-slate-400 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Cargando rubros…</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {visibleRubros.map(t => {
                      const n = t.rubros.reduce((a, r) => a + r.tasks.length, 0);
                      const on = checked.includes(t.id);
                      return (
                        <label key={t.id}
                          className={`flex gap-2 items-start p-3 border rounded-xl cursor-pointer transition-all ${on ? 'border-orange-500 bg-orange-50' : 'border-slate-200 hover:border-slate-300'}`}>
                          <input type="checkbox" checked={on} onChange={() => toggleChecked(t.id)} className="mt-0.5 accent-orange-600" />
                          <span className="min-w-0">
                            <span className="block font-semibold text-sm text-slate-800">{t.name}</span>
                            <span className="block text-[11px] text-slate-500 leading-snug">{t.description}</span>
                            <span className="block text-[11px] text-slate-400 mt-0.5">{n} tareas</span>
                          </span>
                          <span className="ml-auto"><FichaThumb task={{ category: t.rubros[0]?.rubro }} /></span>
                        </label>
                      );
                    })}
                    {visibleRubros.length === 0 && <p className="text-xs text-slate-400">No hay rubros ni tareas con ese nombre.</p>}
                  </div>
                )}
              </section>
            </div>
          )}

          {step === 2 && picked.length > 0 && (
            <div className="space-y-4">
              {picked.map(t => {
                const ev = evaluatedBy[t.id];
                const vals = inputsBy[t.id] ?? {};
                return (
                  <details key={t.id} open={picked.length <= 2} className="border border-slate-200 rounded-xl">
                    <summary className="px-4 py-2 bg-slate-50 text-sm font-bold text-slate-700 cursor-pointer rounded-t-xl">
                      {t.name} <span className="font-normal text-xs text-slate-400">· {t.inputs.length} datos</span>
                    </summary>
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 p-4">
                      <div className="lg:col-span-3 space-y-3">
                        {t.inputs.map(inp => (
                          <div key={inp.key} className="space-y-1">
                            <label htmlFor={`qb-${t.id}-${inp.key}`} className="text-sm font-semibold text-slate-700 block">{inp.label}</label>
                            {inp.kind === 'option' && inp.options ? (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label={inp.label}>
                                {inp.options.map(o => (
                                  <button key={o.value} role="radio" aria-checked={vals[inp.key] === o.value}
                                    onClick={() => setInput(t.id, inp.key, o.value)}
                                    className={`text-left text-xs px-3 py-2 rounded-lg border ${vals[inp.key] === o.value ? 'border-orange-500 bg-orange-50 text-orange-800 font-semibold' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                                    {o.label}
                                  </button>
                                ))}
                              </div>
                            ) : inp.kind === 'bool' ? (
                              <div className="flex gap-2" role="radiogroup" aria-label={inp.label}>
                                {[[1, 'Sí'], [0, 'No']].map(([val, lab]) => (
                                  <button key={val} role="radio" aria-checked={vals[inp.key] === val}
                                    onClick={() => setInput(t.id, inp.key, val as number)}
                                    className={`text-xs px-4 py-1.5 rounded-lg border ${vals[inp.key] === val ? 'border-orange-500 bg-orange-50 text-orange-800 font-semibold' : 'border-slate-200 text-slate-600'}`}>
                                    {lab}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <input id={`qb-${t.id}-${inp.key}`} type="number" step="any" min={0} value={vals[inp.key] ?? 0}
                                  onChange={e => setInput(t.id, inp.key, Number(e.target.value))}
                                  className="w-28 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400" />
                                <span className="text-xs text-slate-500">{inp.unit}</span>
                              </div>
                            )}
                            {inp.note && inp.kind !== 'option' && <p className="text-[11px] text-slate-400">{inp.note}</p>}
                          </div>
                        ))}
                      </div>
                      {((t.calcs.length > 0 && ev) || stepImage(t)) && (
                        <div className="lg:col-span-2 space-y-3 lg:sticky lg:top-0 self-start">
                          {stepImage(t) && (
                            <img src={stepImage(t)!} alt={t.name} className="w-full rounded-xl border border-slate-200 bg-white" loading="lazy" />
                          )}
                          {t.calcs.length > 0 && ev && (
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                            <div className="text-xs font-bold text-slate-500 uppercase">Se calcula solo</div>
                            {t.calcs.map(c => (
                              <div key={c.key} className="flex justify-between gap-3 text-sm">
                                <span className="text-slate-600">{c.label}</span>
                                <span className="font-semibold text-slate-800 whitespace-nowrap">
                                  {ev.labels[c.key] ?? `${fmt(ev.values[c.key] ?? 0)} ${c.unit}`}
                                </span>
                              </div>
                            ))}
                          </div>
                          )}
                        </div>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2 text-xs">
                {(['org', 'global', 'none'] as const).map(k => (
                  <span key={k} title={SOURCE_BADGE[k].title} className={`px-2 py-1 border rounded ${SOURCE_BADGE[k].cls}`}>
                    {SOURCE_BADGE[k].label}: {counts[k] ?? 0}
                  </span>
                ))}
              </div>
              {groups.map(g => {
                const anyIncluded = g.items.some(({ row }) => row.included);
                return (
                  <details key={g.rubro} open={anyIncluded} className="border border-slate-200 rounded-xl overflow-hidden">
                    <summary className="px-4 py-2 bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer">
                      {g.rubro} <span className="font-normal text-slate-400">· {g.items.filter(i => i.row.included).length} de {g.items.length}{!anyIncluded ? ' · no corresponde con lo elegido' : ''}</span>
                    </summary>
                    <ul className="divide-y divide-slate-100">
                      {g.items.map(({ row, idx }) => (
                        <li key={idx} className={`px-4 py-3 flex gap-3 items-start ${row.included ? '' : 'opacity-50'}`}>
                          <input type="checkbox" checked={row.included} aria-label={`Incluir ${row.task.name}`}
                            onChange={e => setOv(idx, { included: e.target.checked })} className="mt-1 accent-orange-600" />
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-slate-800">{row.task.name}</span>
                              <span title={SOURCE_BADGE[row.source.kind].title} className={`text-[10px] px-1.5 py-0.5 border rounded ${SOURCE_BADGE[row.source.kind].cls}`}>
                                {SOURCE_BADGE[row.source.kind].label}
                              </span>
                              {row.already && (
                                <span title="Ya está en el presupuesto: no se agrega salvo que la tildes." className="text-[10px] px-1.5 py-0.5 border rounded bg-amber-50 text-amber-700 border-amber-200">
                                  Ya incluida
                                </span>
                              )}
                            </div>
                            <div className="flex gap-3 items-start mt-0.5">
                              <p className="text-xs text-slate-600 flex-1">{row.task.includes}</p>
                              <FichaThumb task={{ name: row.task.name, category: row.rubro }} size="md" />
                            </div>
                            {row.task.note && <p className="text-[11px] text-slate-400 mt-0.5">{row.task.note}</p>}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <input type="number" step="any" min={0} value={row.quantity} aria-label={`Cantidad de ${row.task.name}`}
                              onChange={e => setOv(idx, { quantity: Number(e.target.value) })}
                              className="w-20 px-2 py-1 text-sm text-right border border-slate-200 rounded-lg" />
                            <span className="text-xs text-slate-500 w-7">{row.task.unit}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </details>
                );
              })}
            </div>
          )}

          {step === 4 && (
            <div className="max-w-md mx-auto text-center py-10 space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto"><Check className="text-emerald-600" /></div>
              <p className="font-bold text-slate-800">Tareas agregadas al presupuesto</p>
              <p className="text-sm text-slate-600 whitespace-pre-line">{result}</p>
            </div>
          )}
        </div>

        {error && <div className="mx-6 mb-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

        <div className="px-6 py-4 border-t border-slate-200 flex items-center gap-3">
          {step === 3 && (
            <p className="text-xs text-slate-500 flex items-center gap-1 flex-1">
              <Info size={14} /> {selected.length} tareas seleccionadas. Podés cambiar cantidades y precios después en el presupuesto.
            </p>
          )}
          {step !== 3 && <div className="flex-1" />}
          {step > 1 && step < 4 && (
            <button onClick={() => setStep(s => (s - 1) as 1 | 2 | 3)} disabled={busy}
              className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1">
              <ArrowLeft size={14} /> Volver
            </button>
          )}
          {step === 1 && checked.length > 0 && (
            <button onClick={() => pick(rubroTemplates.filter(t => checked.includes(t.id)))}
              className="px-4 py-2 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-lg flex items-center gap-1">
              <Layers size={14} /> Continuar con {checked.length} {checked.length === 1 ? 'rubro' : 'rubros'} <ArrowRight size={14} />
            </button>
          )}
          {step === 2 && (
            <button onClick={() => setStep(3)} className="px-4 py-2 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-lg flex items-center gap-1">
              Ver tareas <ArrowRight size={14} />
            </button>
          )}
          {step === 3 && (
            <button onClick={apply} disabled={busy || selected.length === 0}
              className="px-4 py-2 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-lg flex items-center gap-1 disabled:opacity-40">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Agregar {selected.length} tareas al presupuesto
            </button>
          )}
          {step === 4 && (
            <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-lg">Ver presupuesto</button>
          )}
        </div>
      </div>
    </div>
  );
};
