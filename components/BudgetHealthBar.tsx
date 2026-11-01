import React, { useState } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle, ChevronRight } from 'lucide-react';
import type { HealthIssue } from '../utils/budgetHealth';

interface Props {
  issues: HealthIssue[];
  itemCount: number;
  /** Resalta los ítems y lleva la vista al de la posición `index`. */
  onShow: (itemIds: string[], index: number) => void;
}

/** Franja «Salud del presupuesto»: datos faltantes y números que no cierran, con acceso a cada ítem. */
export const BudgetHealthBar: React.FC<Props> = ({ issues, itemCount, onShow }) => {
  // Posición del próximo ítem a mostrar por cada aviso (recorre los ítems con clics sucesivos).
  const [cursor, setCursor] = useState<Record<string, number>>({});
  if (itemCount === 0) return null;

  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-1.5 text-xs text-emerald-700" data-testid="budget-health-ok">
        <CheckCircle size={13} className="shrink-0" />
        <span>Salud del presupuesto: sin problemas detectados en {itemCount} {itemCount === 1 ? 'ítem' : 'ítems'}.</span>
      </div>
    );
  }

  const hasError = issues.some(i => i.level === 'error');
  const show = (issue: HealthIssue) => {
    const idx = (cursor[issue.id] ?? 0) % issue.itemIds.length;
    onShow(issue.itemIds, idx);
    setCursor(c => ({ ...c, [issue.id]: idx + 1 }));
  };

  return (
    <div
      className={`flex items-start gap-3 rounded-lg px-4 py-2 text-sm border ${hasError ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}
      role="status" aria-label="Salud del presupuesto" data-testid="budget-health"
    >
      {hasError
        ? <AlertOctagon size={15} className="shrink-0 mt-1 text-red-500" />
        : <AlertTriangle size={15} className="shrink-0 mt-1 text-amber-500" />}
      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-bold text-xs uppercase tracking-wide mr-1">Salud del presupuesto</span>
        {issues.map(issue => {
          const seen = cursor[issue.id];
          const n = issue.itemIds.length;
          return (
            <button
              key={issue.id}
              onClick={() => show(issue)}
              title={issue.hint}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors ${
                issue.level === 'error'
                  ? 'bg-white border-red-300 text-red-700 hover:bg-red-100'
                  : 'bg-white border-amber-300 text-amber-800 hover:bg-amber-100'
              }`}
            >
              {issue.title}
              <span className="font-bold flex items-center">
                · {seen && n > 1 ? `Ver ${((seen - 1) % n) + 1}/${n}` : 'Ver'}
                <ChevronRight size={12} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
