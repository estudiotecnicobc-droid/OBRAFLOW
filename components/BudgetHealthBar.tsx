import React, { useState } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle, ChevronRight, EyeOff } from 'lucide-react';
import type { HealthIssue, HealthIssueId } from '../utils/budgetHealth';

interface Props {
  issues: HealthIssue[];
  itemCount: number;
  /** Nombre visible de cada ítem, para indicar cuál se está revisando. */
  itemNames: Record<string, string>;
  /** Cantidad de avisos descartados en esta obra. */
  ignoredCount: number;
  /** Resalta los ítems y lleva la vista al de la posición `index`. */
  onShow: (itemIds: string[], index: number) => void;
  /** Descarta un aviso para un ítem (por ejemplo, «Volquetes» sin mano de obra). */
  onIgnore: (issueId: HealthIssueId, itemId: string) => void;
  onResetIgnored: () => void;
}

/** Franja «Salud del presupuesto»: datos faltantes y números que no cierran, con acceso a cada ítem. */
export const BudgetHealthBar: React.FC<Props> = ({ issues, itemCount, itemNames, ignoredCount, onShow, onIgnore, onResetIgnored }) => {
  // Aviso en revisión y posición del ítem actual dentro de ese aviso.
  const [active, setActive] = useState<{ id: HealthIssueId; index: number } | null>(null);
  if (itemCount === 0) return null;

  const resetLink = ignoredCount > 0 && (
    <button onClick={onResetIgnored} className="underline hover:no-underline whitespace-nowrap">
      {ignoredCount} {ignoredCount === 1 ? 'aviso descartado' : 'avisos descartados'} · restablecer
    </button>
  );

  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-1.5 text-xs text-emerald-700" data-testid="budget-health-ok">
        <CheckCircle size={13} className="shrink-0" />
        <span className="flex-1">Salud del presupuesto: sin problemas detectados en {itemCount} {itemCount === 1 ? 'ítem' : 'ítems'}.</span>
        {resetLink}
      </div>
    );
  }

  const hasError = issues.some(i => i.level === 'error');
  const activeIssue = active ? issues.find(i => i.id === active.id) : undefined;
  const index = activeIssue ? Math.min(active!.index, activeIssue.itemIds.length - 1) : 0;
  const currentId = activeIssue?.itemIds[index];

  const show = (issue: HealthIssue) => {
    const next = active?.id === issue.id ? (index + 1) % issue.itemIds.length : 0;
    setActive({ id: issue.id, index: next });
    onShow(issue.itemIds, next);
  };

  const ignoreCurrent = () => {
    if (!activeIssue || !currentId) return;
    onIgnore(activeIssue.id, currentId);
    const remaining = activeIssue.itemIds.filter(id => id !== currentId);
    if (remaining.length === 0) { setActive(null); return; }
    const nextIndex = index % remaining.length;
    setActive({ id: activeIssue.id, index: nextIndex });
    onShow(remaining, nextIndex);
  };

  return (
    <div
      className={`rounded-lg px-4 py-2 text-sm border ${hasError ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}
      role="status" aria-label="Salud del presupuesto" data-testid="budget-health"
    >
      <div className="flex items-start gap-3">
        {hasError
          ? <AlertOctagon size={15} className="shrink-0 mt-1 text-red-500" />
          : <AlertTriangle size={15} className="shrink-0 mt-1 text-amber-500" />}
        <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-bold text-xs uppercase tracking-wide mr-1">Salud del presupuesto</span>
          {issues.map(issue => {
            const isActive = issue.id === activeIssue?.id;
            const n = issue.itemIds.length;
            const tone = issue.level === 'error'
              ? (isActive ? 'bg-red-100 border-red-400 text-red-800' : 'bg-white border-red-300 text-red-700 hover:bg-red-100')
              : (isActive ? 'bg-amber-100 border-amber-400 text-amber-900' : 'bg-white border-amber-300 text-amber-800 hover:bg-amber-100');
            return (
              <button
                key={issue.id}
                onClick={() => show(issue)}
                title={issue.hint}
                aria-pressed={isActive}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors ${tone}`}
              >
                {issue.title}
                <span className="font-bold flex items-center">
                  · {isActive && n > 1 ? `Ver ${index + 1}/${n}` : 'Ver'}
                  <ChevronRight size={12} />
                </span>
              </button>
            );
          })}
        </div>
        {!activeIssue && resetLink && <span className="text-xs mt-0.5">{resetLink}</span>}
      </div>

      {activeIssue && currentId && (
        <div className="mt-1.5 ml-7 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span>
            Revisando <strong>{itemNames[currentId] ?? 'ítem'}</strong>
            {activeIssue.itemIds.length > 1 && ` (${index + 1} de ${activeIssue.itemIds.length})`}. {activeIssue.hint}
          </span>
          <button onClick={ignoreCurrent} className="inline-flex items-center gap-1 font-semibold underline hover:no-underline whitespace-nowrap">
            <EyeOff size={12} /> No es un error, ignorar en este ítem
          </button>
          {resetLink}
        </div>
      )}
    </div>
  );
};
