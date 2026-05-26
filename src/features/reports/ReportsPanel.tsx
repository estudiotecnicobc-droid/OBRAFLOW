import React, { useState } from 'react';
import { BarChart3, TrendingUp, Package } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { APUSummaryReport } from './APUSummaryReport';
import { BudgetBreakdownReport } from './BudgetBreakdownReport';
import { ConsolidatedProjectReport } from './ConsolidatedProjectReport';

type ReportTab = 'apu-summary' | 'budget-breakdown' | 'consolidated';

const REPORTS = [
  {
    id: 'apu-summary' as ReportTab,
    label: 'Análisis de APUs',
    description: 'Costo unitario y desglose mat/MO/eq para cada APU de la organización',
    icon: BarChart3,
    scope: 'Organización',
  },
  {
    id: 'budget-breakdown' as ReportTab,
    label: 'Desglose de Presupuesto',
    description: 'Costos por ítem del presupuesto con fecha base de costos configurable',
    icon: TrendingUp,
    scope: 'Proyecto',
  },
  {
    id: 'consolidated' as ReportTab,
    label: 'Explosión de Insumos',
    description: 'Desglose técnico y costos base usados para este presupuesto.',
    icon: Package,
    scope: 'Proyecto',
  },
] as const;

export function ReportsPanel() {
  const { user, activeOrganizationId } = useAuth();
  const organizationId = activeOrganizationId ?? user?.organizationId ?? '';
  const [active, setActive] = useState<ReportTab>('apu-summary');

  const current = REPORTS.find(r => r.id === active)!;

  return (
    <div className="space-y-4">
      {/* Report selector */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {REPORTS.map(r => {
          const Icon = r.icon;
          const isActive = active === r.id;
          return (
            <button
              key={r.id}
              onClick={() => setActive(r.id)}
              className={`text-left p-4 rounded-xl border-2 transition-all ${
                isActive
                  ? 'border-blue-500 bg-blue-50 shadow-sm'
                  : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div
                className={`flex items-center gap-2 mb-1.5 ${
                  isActive ? 'text-blue-700' : 'text-slate-600'
                }`}
              >
                <Icon size={15} />
                <span className="font-bold text-sm">{r.label}</span>
                <span
                  className={`ml-auto text-xs rounded-full px-2 py-0.5 ${
                    r.scope === 'Proyecto'
                      ? 'bg-violet-100 text-violet-600'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {r.scope}
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-snug">{r.description}</p>
            </button>
          );
        })}
      </div>

      {/* Report body */}
      <div className="bg-white rounded-xl border border-slate-100 p-6">
        <h3 className="text-base font-bold text-slate-800 mb-5">{current.label}</h3>

        {!organizationId ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            Organización no disponible. Recargá la página.
          </div>
        ) : (
          <>
            {active === 'apu-summary'      && <APUSummaryReport       organizationId={organizationId} />}
            {active === 'budget-breakdown' && <BudgetBreakdownReport  organizationId={organizationId} />}
            {active === 'consolidated'     && <ConsolidatedProjectReport organizationId={organizationId} />}
          </>
        )}
      </div>
    </div>
  );
}
