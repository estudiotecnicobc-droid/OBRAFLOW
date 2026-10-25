import React from 'react';
import { SlidersHorizontal, ShieldCheck } from 'lucide-react';
import { ProjectSettings } from './ProjectSettings';
import { DataAdmin } from './DataAdmin';

const TABS = [
  { id: 'settings', label: 'Proyecto', icon: SlidersHorizontal },
  { id: 'admin_system', label: 'Sistema', icon: ShieldCheck },
];

export const SettingsModule: React.FC<{ activeTab: string; onNavigate: (tab: string) => void }> = ({ activeTab, onNavigate }) => (
  <div className="space-y-4">
    <div role="tablist" aria-label="Secciones de configuración" className="flex flex-wrap gap-1 border-b border-slate-200 print:hidden">
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
    {activeTab === 'settings' && <ProjectSettings />}
    {activeTab === 'admin_system' && <DataAdmin scope="system" initialSubTab="system" />}
  </div>
);
