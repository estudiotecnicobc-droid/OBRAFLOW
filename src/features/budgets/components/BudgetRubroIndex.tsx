import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ListTree, Plus, Search, X } from 'lucide-react';
import { groupRubros, rubroCode, rubroLabel } from '../rubroGroups';

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
}

const compact = new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 });
const full = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export const BudgetRubroIndex: React.FC<Props> = ({
  entries, total, amountLabel, allRubros, activeRubro, onJump, onAdd, onRemove,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pickerOpen) searchRef.current?.focus();
    else setQuery('');
  }, [pickerOpen]);

  const inIndex = useMemo(() => new Set(entries.map(e => e.rubro)), [entries]);

  const groups = useMemo(() => {
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

  return (
    <div className="w-72 flex-shrink-0 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden shadow-sm h-full print:hidden relative">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
        <ListTree size={16} className="text-slate-500" />
        <h3 className="font-bold text-sm text-slate-800 flex-1">Rubros del presupuesto</h3>
        <span className="text-xs font-mono text-slate-400">{entries.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {entries.length === 0 ? (
          <p className="text-xs text-slate-400 text-center px-4 py-8 leading-relaxed">
            Todavía no hay rubros. Agregá el primero para empezar a cargar tareas.
          </p>
        ) : (
          entries.map(({ rubro, count, amount }) => {
            const code = rubroCode(rubro);
            const pct = total > 0 ? (amount / total) * 100 : 0;
            const active = rubro === activeRubro;
            return (
              <div key={rubro} className="group relative">
                <button
                  onClick={() => onJump(rubro)}
                  title={`${rubro} · ${count} ítem${count !== 1 ? 's' : ''} · $${full.format(amount)}`}
                  className={`w-full text-left rounded-lg px-2 py-2 transition-colors ${active ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-6 text-[11px] font-mono ${active ? 'text-blue-600' : 'text-slate-400'}`}>
                      {code !== null ? String(code).padStart(2, '0') : '··'}
                    </span>
                    <span className={`flex-1 text-xs truncate ${active ? 'font-bold text-blue-700' : 'font-medium text-slate-700'}`}>
                      {rubroLabel(rubro)}
                    </span>
                    {count > 0 ? (
                      <span className="text-[11px] font-mono text-slate-500">${compact.format(amount)}</span>
                    ) : (
                      <span className="text-[10px] text-slate-400 italic group-hover:opacity-0">vacío</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 pl-8">
                    <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-1 bg-blue-500 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 w-14 text-right">
                      {count > 0 ? `${pct.toFixed(1)}% · ${count}` : ''}
                    </span>
                  </div>
                </button>
                {count === 0 && (
                  <button
                    onClick={() => onRemove(rubro)}
                    aria-label={`Quitar ${rubro} del índice`}
                    title="Quitar del índice"
                    className="absolute right-2 top-2 p-0.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            );
          })
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
                if (e.key === 'Enter' && groups[0]?.rubros[0]) pick(groups[0].rubros[0]);
              }}
              placeholder="Buscar rubro"
              className="flex-1 text-xs h-8 outline-none bg-transparent"
            />
            <button onClick={() => setPickerOpen(false)} aria-label="Cerrar" className="p-1 rounded text-slate-400 hover:bg-slate-100">
              <X size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-1">
            {groups.length === 0 && <p className="text-xs text-slate-400 text-center py-6">Sin coincidencias.</p>}
            {groups.map(g => (
              <div key={g.label} className="mb-1">
                <p className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{g.label}</p>
                {g.rubros.map(r => {
                  const added = inIndex.has(r);
                  const code = rubroCode(r);
                  return (
                    <button
                      key={r}
                      onClick={() => pick(r)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs hover:bg-slate-50"
                    >
                      <span className="w-6 font-mono text-[11px] text-slate-400">{code !== null ? String(code).padStart(2, '0') : '··'}</span>
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
