import React from 'react';
import { Calculator, Ruler, Table } from 'lucide-react';
import { BudgetEditor } from './BudgetEditor';
import { MeasurementSheetComponent } from './MeasurementSheet';
import { BudgetGrid } from './BudgetGrid';

export const BUDGET_MODULE_TABS = ['budget', 'measurements', 'grid'] as const;

const TABS = [
  { id: 'budget', label: 'Ítems y presupuesto', icon: Calculator },
  { id: 'measurements', label: 'Cómputos', icon: Ruler },
  { id: 'grid', label: 'Grilla de costos', icon: Table },
];

export const BudgetModule: React.FC<{ activeTab: string; onNavigate: (tab: string) => void }> = ({ activeTab, onNavigate }) => (
  <div className="space-y-4">
    <div role="tablist" aria-label="Secciones del presupuesto" className="flex flex-wrap gap-1 border-b border-slate-200 print:hidden">
      {TABS.map(t => {
        const selected = activeTab === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={selected}
            onClick={() => onNavigate(t.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-[3px] -mb-px transition-colors ${
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
  </div>
);
