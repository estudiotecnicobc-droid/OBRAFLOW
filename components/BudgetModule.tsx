import React from 'react';
import { Calculator, Ruler, Table, Shapes } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { BudgetEditor } from './BudgetEditor';
import { MeasurementSheetComponent } from './MeasurementSheet';
import { BudgetGrid } from './BudgetGrid';
import { ParametricCalculator } from '../src/features/parametric-calculator/ParametricCalculator';

export const BUDGET_MODULE_TABS = ['budget', 'measurements', 'grid', 'computo'] as const;

const TABS = [
  { id: 'budget', label: 'Ítems y presupuesto', icon: Calculator },
  { id: 'measurements', label: 'Cómputos', icon: Ruler },
  { id: 'grid', label: 'Grilla de costos', icon: Table },
  { id: 'computo', label: 'Calculador de cómputo', icon: Shapes },
];

export const BudgetModule: React.FC<{ activeTab: string; onNavigate: (tab: string) => void }> = ({ activeTab, onNavigate }) => {
  const { user, activeOrganizationId } = useAuth();
  const organizationId = activeOrganizationId ?? user?.organizationId ?? '';
  return (
  <div className="space-y-4">
    <div role="tablist" aria-label="Secciones del presupuesto" className="flex flex-nowrap md:flex-wrap gap-1 border-b border-slate-200 overflow-x-auto print:hidden">
      {TABS.map(t => {
        const selected = activeTab === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={selected}
            onClick={() => onNavigate(t.id)}
            className={`flex shrink-0 whitespace-nowrap items-center gap-2 px-3 md:px-4 py-3 text-sm font-semibold border-b-[3px] -mb-px transition-colors ${
              selected ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <t.icon size={16} /> {t.label}
          </button>
        );
      })}
    </div>
    {activeTab === 'budget' && <BudgetEditor onNavigate={onNavigate} />}
    {activeTab === 'measurements' && <MeasurementSheetComponent />}
    {activeTab === 'grid' && <BudgetGrid />}
    {activeTab === 'computo' && organizationId && <ParametricCalculator organizationId={organizationId} />}
  </div>
  );
};
