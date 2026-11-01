import React from 'react';
import { Calculator, Table, Shapes } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { BudgetEditor } from './BudgetEditor';
import { BudgetGrid } from './BudgetGrid';
import { ParametricCalculator } from '../src/features/parametric-calculator/ParametricCalculator';

// 'measurements' se conserva como alias de 'budget': la planilla de medición ahora vive en cada ítem.
export const BUDGET_MODULE_TABS = ['computo', 'budget', 'grid', 'measurements'] as const;

const TABS = [
  { id: 'computo', step: 1, label: 'Cómputo', icon: Shapes, hint: 'Medí por dimensiones y mandá los ítems al presupuesto' },
  { id: 'budget', step: 2, label: 'Ítems y presupuesto', icon: Calculator, hint: 'Ítems, cantidades (con su origen) y precios' },
  { id: 'grid', step: 3, label: 'Análisis de costos', icon: Table, hint: 'Desglose del APU de cada ítem' },
];

export const BudgetModule: React.FC<{ activeTab: string; onNavigate: (tab: string) => void }> = ({ activeTab, onNavigate }) => {
  const { user, activeOrganizationId } = useAuth();
  const organizationId = activeOrganizationId ?? user?.organizationId ?? '';
  const tab = activeTab === 'measurements' ? 'budget' : activeTab;
  return (
  <div className="space-y-4">
    <div role="tablist" aria-label="Secciones del presupuesto" className="flex flex-wrap gap-1 border-b border-slate-200 print:hidden">
      {TABS.map(t => {
        const selected = tab === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={selected}
            title={t.hint}
            onClick={() => onNavigate(t.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-[3px] -mb-px transition-colors ${
              selected ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${selected ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
              {t.step}
            </span>
            <t.icon size={16} /> {t.label}
          </button>
        );
      })}
    </div>
    {tab === 'budget' && <BudgetEditor onNavigate={onNavigate} />}
    {tab === 'grid' && <BudgetGrid />}
    {tab === 'computo' && organizationId && <ParametricCalculator organizationId={organizationId} onNavigate={onNavigate} />}
  </div>
  );
};
