import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3, Check, ChevronsDownUp, ChevronsUpDown, Layers, ListOrdered, ListTree, Plus, Rows3, Search, X,
} from 'lucide-react';
import { arrangeRubros, groupRubros, rubroCode, rubroLabel, type RubroIndexView } from '../rubroGroups';

export interface RubroIndexPref {
  view: RubroIndexView;
  compact: boolean;
}

export interface RubroIndexEntry {
  rubro: string;
  count: number;
  amount: number;
}

interface Props {
  entries: RubroIndexEntry[];
  total: number;
  amountLabel: string;
  allRubros: string[];
  activeRubro?: string;
  onJump: (rubro: string) => void;
  onAdd: (rubro: string) => void;
  onRemove: (rubro: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  pref: RubroIndexPref;
  onPrefChange: (pref: RubroIndexPref) => void;
}

const compactFmt = new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 });
const full = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const codeText = (rubro: string) => {
  const code = rubroCode(rubro);
  return code !== null ? String(code).padStart(2, '0') : '··';
};

const VIEWS: { id: RubroIndexView; label: string; icon: React.ElementType; hint: string }[] = [
  { id: 'codigo', label: 'Código', icon: ListOrdered, hint: 'Índice y tabla por código de rubro' },
  { id: 'etapas', label: 'Etapas', icon: Layers, hint: 'Índice y tabla agrupados por etapa de obra, con subtotal' },
  { id: 'incidencia', label: 'Incidencia', icon: BarChart3, hint: 'Índice y tabla de mayor a menor monto' },
];

export const BudgetRubroIndex: React.FC<Props> = ({
  entries, total, amountLabel, allRubros, activeRubro, onJump, onAdd, onRemove, onExpandAll, onCollapseAll, pref, onPrefChange,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pickerOpen) searchRef.current?.focus();
    else setQuery('');
  }, [pickerOpen]);

  const inIndex = useMemo(() => new Set(entries.map(e => e.rubro)), [entries]);

  const sections = useMemo(() => arrangeRubros(entries, pref.view), [entries, pref.view]);

  const pickerGroups = useMemo(() => {
    const q = norm(query.trim());
    return groupRubros(allRubros)
      .map(g => ({ ...g, rubros: q ? g.rubros.filter(r => norm(r).includes(q)) : g.rubros }))
      .filter(g => g.rubros.length > 0);
  }, [allRubros, query]);

  const pick = (rubro: string) => {
    setPickerOpen(false);
    if (inIndex.has(rubro)) onJump(rubro);
    else onAdd(rubro);
  };

  const renderEntry = ({ rubro, count, amount }: RubroIndexEntry) => {
    const pct = total > 0 ? (amount / total) * 100 : 0;
    const active = rubro === activeRubro;
    return (
      <div key={rubro} className="group relative">
        <button
          onClick={() => onJump(rubro)}
          title={`${rubro} · ${count} ítem${count !== 1 ? 's' : ''} · $${full.format(amount)}`}
          className={`w-full text-left rounded-lg px-2 ${pref.compact ? 'py-1' : 'py-2'} transition-colors ${active ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
        >
          <div className="flex items-center gap-2">
            <span className={`w-6 text-[11px] font-mono ${active ? 'text-blue-600' : 'text-slate-400'}`}>{codeText(rubro)}</span>
            <span className={`flex-1 text-xs truncate ${active ? 'font-bold text-blue-700' : 'font-medium text-slate-700'}`}>
              {rubroLabel(rubro)}
            </span>
            {count > 0 ? (
              <span className="text-[11px] font-mono text-slate-500">
                {pref.compact ? `${pct.toFixed(0)}%` : `$${compactFmt.format(amount)}`}
              </span>
            ) : (
              <span className="text-[10px] text-slate-400 italic group-hover:opacity-0">vacío</span>
            )}
          </div>
          {!pref.compact && (
            <div className="flex items-center gap-2 mt-1 pl-8">
              <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-1 bg-blue-500 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
              </div>
              <span className="text-[10px] font-mono text-slate-400 w-14 text-right">
                {count > 0 ? `${pct.toFixed(1)}% · ${count}` : ''}
              </span>
            </div>
          )}
        </button>
        {count === 0 && (
          <button
            onClick={() => onRemove(rubro)}
            aria-label={`Quitar ${rubro} del índice`}
            title="Quitar del índice"
            className={`absolute right-2 ${pref.compact ? 'top-1' : 'top-2'} p-0.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity`}
          >
            <X size={13} />
          </button>
        )}
      </div>
    );
  };

  const iconBtn = 'p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors';

  return (
    <div className="w-72 flex-shrink-0 self-start sticky top-4 h-[var(--panel-h,calc(100dvh-2rem))] bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden shadow-sm print:hidden">
      <div className="px-4 pt-3 pb-2 border-b border-slate-200 space-y-2">
        <div className="flex items-center gap-2">
          <ListTree size={16} className="text-slate-500" />
          <h3 className="font-bold text-sm text-slate-800 flex-1">Rubros del presupuesto</h3>
          <span className="text-xs font-mono text-slate-400">{entries.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <div role="radiogroup" aria-label="Vista del índice" className="flex flex-1 rounded-lg bg-slate-100 p-0.5">
            {VIEWS.map(v => {
              const on = pref.view === v.id;
              return (
                <button
                  key={v.id}
                  role="radio"
                  aria-checked={on}
                  title={v.hint}
                  onClick={() => onPrefChange({ ...pref, view: v.id })}
                  className={`flex-1 flex items-center justify-center gap-1 h-7 rounded-md text-[11px] font-bold transition-colors ${on ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <v.icon size={12} /> {v.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <button
            onClick={() => onPrefChange({ ...pref, compact: !pref.compact })}
            aria-pressed={pref.compact}
            title="Lista compacta: una línea por rubro"
            className={`flex items-center gap-1 px-2 h-7 rounded-md text-[11px] font-bold transition-colors ${pref.compact ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            <Rows3 size={12} /> Compacta
          </button>
          <div className="flex items-center">
            <button onClick={onExpandAll} title="Expandir todos los rubros de la tabla" aria-label="Expandir todos" className={iconBtn}>
              <ChevronsUpDown size={14} />
            </button>
            <button onClick={onCollapseAll} title="Contraer todos los rubros de la tabla" aria-label="Contraer todos" className={iconBtn}>
              <ChevronsDownUp size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {entries.length === 0 ? (
          <p className="text-xs text-slate-400 text-center px-4 py-8 leading-relaxed">
            Todavía no hay rubros. Agregá el primero para empezar a cargar tareas.
          </p>
        ) : (
          sections.map(sec => (
            <div key={sec.label || 'all'} className={sec.label ? 'mb-2' : ''}>
              {sec.label && (
                <div className="flex items-baseline justify-between px-2 pt-2 pb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{sec.label}</span>
                  <span className="text-[10px] font-mono text-slate-400">
                    ${compactFmt.format(sec.amount)} · {total > 0 ? ((sec.amount / total) * 100).toFixed(0) : 0}%
                  </span>
                </div>
              )}
              {sec.entries.map(renderEntry)}
            </div>
          ))
        )}
      </div>

      <div className="p-2 border-t border-slate-200 space-y-2">
        <div className="flex justify-between items-baseline px-2 text-xs">
          <span className="text-slate-500">{amountLabel}</span>
          <span className="font-mono font-bold text-slate-800">${full.format(total)}</span>
        </div>
        <button
          onClick={() => setPickerOpen(v => !v)}
          aria-expanded={pickerOpen}
          className="w-full flex items-center justify-center gap-1.5 h-9 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <Plus size={14} /> Agregar rubro
        </button>
      </div>

      {pickerOpen && (
        <div className="absolute inset-x-2 bottom-24 top-14 z-20 bg-white border border-slate-200 rounded-xl shadow-xl flex flex-col overflow-hidden">
          <div className="p-2 border-b border-slate-100 flex items-center gap-2">
            <Search size={14} className="text-slate-400 ml-1" />
            <input
              ref={searchRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') setPickerOpen(false);
                if (e.key === 'Enter' && pickerGroups[0]?.rubros[0]) pick(pickerGroups[0].rubros[0]);
              }}
              placeholder="Buscar rubro"
              className="flex-1 text-xs h-8 outline-none bg-transparent"
            />
            <button onClick={() => setPickerOpen(false)} aria-label="Cerrar" className="p-1 rounded text-slate-400 hover:bg-slate-100">
              <X size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-1">
            {pickerGroups.length === 0 && <p className="text-xs text-slate-400 text-center py-6">Sin coincidencias.</p>}
            {pickerGroups.map(g => (
              <div key={g.label} className="mb-1">
                <p className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{g.label}</p>
                {g.rubros.map(r => {
                  const added = inIndex.has(r);
                  return (
                    <button
                      key={r}
                      onClick={() => pick(r)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs hover:bg-slate-50"
                    >
                      <span className="w-6 font-mono text-[11px] text-slate-400">{codeText(r)}</span>
                      <span className={`flex-1 truncate ${added ? 'text-slate-400' : 'text-slate-700'}`}>{rubroLabel(r)}</span>
                      {added && <Check size={13} className="text-emerald-500" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
