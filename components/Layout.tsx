import React, { useEffect, useRef, useState } from 'react';
import { LayoutDashboard, Calculator, CalendarDays, HardHat, Wrench, SlidersHorizontal, Truck, TrendingUp, Users, LogOut, FileText, ClipboardCheck, Save, CheckCircle2, X, FolderKanban, PanelLeftClose, PanelLeftOpen, ChevronDown, ShieldCheck, Lock, BookOpen, BarChart3, Settings2, Plus, LucideIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Role } from '../types';
import { useERP } from '../context/ERPContext';
import { useSave } from '../context/SaveContext';
import { getProjectStage } from './ProjectStage';
import { BUDGET_MODULE_TABS } from './BudgetModule';

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
}

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const SIDEBAR_KEY = 'obraflow_sidebar_open';

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab }) => {
  const { user, logout, isMasterAdmin } = useAuth();
  const { project, exitProject } = useERP();
  const { saveHandler } = useSave();
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) !== '0'; } catch { return true; }
  });
  const toggleSidebar = () => {
    setIsSidebarOpen(open => {
      try { localStorage.setItem(SIDEBAR_KEY, open ? '0' : '1'); } catch { /* sin almacenamiento local */ }
      return !open;
    });
  };

  const canSave = saveHandler !== null;

  const handleGlobalSave = async () => {
    if (!saveHandler) return;
    setSaveStatus('saving');
    try {
      await saveHandler();
      setSaveStatus('ok');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      console.error('[Layout] handleGlobalSave:', err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const stage = getProjectStage(project.status);
  const role = user?.role as Role;
  const can = (roles: Role[]) => roles.includes(role);

  // ── Herramientas activables por obra ──────────────────────────────────────
  const toolsKey = `obraflow_active_tools_${project.id}`;
  const [activeTools, setActiveTools] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(toolsKey) || '[]'); } catch { return []; }
  });
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!toolsOpen) return;
    const close = (e: MouseEvent) => { if (!toolsRef.current?.contains(e.target as Node)) setToolsOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [toolsOpen]);
  const saveTools = (next: string[]) => {
    setActiveTools(next);
    try { localStorage.setItem(toolsKey, JSON.stringify(next)); } catch { /* sin almacenamiento local */ }
  };

  const extraTools = ([
    { id: 'subcontractors', label: 'Subcontratistas', icon: Users, roles: ['admin', 'project_manager'] },
    { id: 'reception', label: 'Recepción de remitos', icon: Truck, roles: ['admin', 'worker'] },
    { id: 'tools', label: 'Equipos', icon: Wrench, roles: ['admin', 'project_manager'] },
    { id: 'quality', label: 'Control de calidad', icon: ClipboardCheck, roles: ['admin', 'project_manager', 'worker'] },
    { id: 'documents', label: 'Documentación', icon: FileText, roles: ['admin', 'project_manager', 'worker', 'client'] },
  ] as NavItem[]).filter(t => can(t.roles));
  const shownTools = extraTools.filter(t => activeTools.includes(t.id) || activeTab === t.id);
  const hiddenTools = extraTools.filter(t => !shownTools.includes(t));

  // ── Pestañas de la obra ───────────────────────────────────────────────────
  const projectTabs = ([
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'project_manager', 'worker', 'client'] },
    { id: 'budget', label: 'Presupuesto', icon: Calculator, roles: ['admin', 'project_manager'] },
    { id: 'planning', label: 'Cronograma', icon: CalendarDays, roles: ['admin', 'project_manager', 'worker'] },
    { id: 'management', label: 'Avances', icon: TrendingUp, roles: ['admin', 'project_manager', 'client'] },
    { id: 'project_labor', label: 'Personal', icon: HardHat, roles: ['admin'] },
    { id: 'reports_view', label: 'Reportes', icon: BarChart3, roles: ['admin', 'project_manager', 'worker', 'client'] },
    { id: 'settings', label: 'Ajustes', icon: Settings2, roles: ['admin'] },
  ] as NavItem[]).filter(i => can(i.roles));
  const lockedTabs = stage === 'budget' ? ['planning', 'management'] : [];

  // ── Menú de la empresa (barra lateral) ────────────────────────────────────
  const companyItems = ([
    { id: 'company_labor', label: 'Personal y cuadrillas', icon: HardHat, roles: ['admin', 'project_manager'] },
    { id: 'admin_apu', label: 'Catálogo maestro', icon: BookOpen, roles: ['admin', 'project_manager'] },
    { id: 'admin_indices', label: 'Configuración', icon: SlidersHorizontal, roles: ['admin'] },
    ...(isMasterAdmin ? [{ id: 'system_admin', label: 'Admin del Sistema', icon: ShieldCheck, roles: [] as Role[] }] : []),
  ] as NavItem[]).filter(i => i.id === 'system_admin' || can(i.roles));

  const isActive = (id: string) =>
    id === 'budget' ? BUDGET_MODULE_TABS.includes(activeTab as typeof BUDGET_MODULE_TABS[number])
    : id === 'admin_indices' ? ['admin_system', 'admin_indices'].includes(activeTab)
    : activeTab === id;

  const RailButton: React.FC<{ icon: LucideIcon; label: string; onClick: () => void; active?: boolean }> = ({ icon: Icon, label, onClick, active }) => (
    <button
      onClick={onClick}
      title={isSidebarOpen ? undefined : label}
      aria-label={isSidebarOpen ? undefined : label}
      className={`w-full flex items-center gap-3 rounded-lg transition-colors text-sm font-medium min-h-[44px] ${isSidebarOpen ? 'px-3' : 'justify-center'} ${
        active ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'text-slate-400 hover:text-white hover:bg-slate-800'
      }`}
    >
      <Icon size={18} className="shrink-0" />
      {isSidebarOpen && <span className="flex-1 text-left truncate">{label}</span>}
    </button>
  );

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
      {/* Barra lateral: menú de la empresa. Al ocultarla queda como columna de íconos. */}
      <aside className={`${isSidebarOpen ? 'w-64' : 'w-16'} bg-slate-900 text-white flex flex-col flex-shrink-0 print:hidden transition-all duration-300 ease-in-out relative z-20 shadow-xl overflow-hidden`}>
        <div className={`flex items-center gap-3 p-3 ${isSidebarOpen ? 'justify-between' : 'justify-center'}`}>
          {isSidebarOpen && (
            <div className="flex items-center gap-2 px-1">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold">O</div>
              <span className="font-bold">Obraflow</span>
            </div>
          )}
          <button
            onClick={toggleSidebar}
            title={isSidebarOpen ? 'Ocultar menú' : 'Mostrar menú'}
            aria-label={isSidebarOpen ? 'Ocultar menú' : 'Mostrar menú'}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            {isSidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>
        </div>

        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          <RailButton icon={FolderKanban} label="Mis obras" onClick={exitProject} />
          {companyItems.length > 0 && (
            <>
              {isSidebarOpen
                ? <div className="px-3 pt-4 pb-1 text-[11px] font-bold tracking-wider text-slate-500 uppercase">Empresa</div>
                : <div className="my-3 border-t border-slate-800" />}
              {companyItems.map(item => (
                <RailButton key={item.id} icon={item.icon} label={item.label} onClick={() => setActiveTab(item.id)} active={isActive(item.id)} />
              ))}
            </>
          )}
        </nav>

        <div className="p-2 border-t border-slate-800 space-y-1 bg-slate-900">
          <button
            onClick={handleGlobalSave}
            disabled={!canSave || saveStatus === 'saving' || saveStatus === 'ok'}
            title={!canSave ? 'Esta vista se guarda automáticamente' : 'Guardar cambios de esta vista'}
            aria-label={isSidebarOpen ? undefined : 'Guardar'}
            className={`w-full flex items-center justify-center gap-2 text-sm font-bold rounded-lg min-h-[44px] transition-all disabled:cursor-not-allowed ${isSidebarOpen ? 'px-4' : ''} ${
              saveStatus === 'ok'     ? 'bg-green-600 text-white' :
              saveStatus === 'error'  ? 'bg-red-600 text-white opacity-90' :
              saveStatus === 'saving' ? 'bg-blue-400 text-white' :
              canSave                 ? 'bg-blue-700 hover:bg-blue-600 text-white' :
                                        'bg-slate-800 text-slate-500'
            }`}
          >
            {saveStatus === 'ok' ? <CheckCircle2 size={18} /> : saveStatus === 'error' ? <X size={18} /> : <Save size={18} />}
            {isSidebarOpen && (saveStatus === 'ok' ? 'Guardado' : saveStatus === 'error' ? 'Error al guardar' : saveStatus === 'saving' ? 'Guardando…' : canSave ? 'Guardar' : 'Auto-guardado')}
          </button>
          <RailButton icon={LogOut} label="Cerrar sesión" onClick={logout} />
          {isSidebarOpen && <div className="px-3 pt-1 text-[11px] text-slate-500 truncate">{user?.name} · {user?.role}</div>}
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-slate-100 relative">
        {/* Encabezado y pestañas de la obra */}
        <div className="bg-white border-b border-slate-200 px-6 md:px-8 pt-4 print:hidden">
          <div className="max-w-[1600px] mx-auto">
            <button onClick={exitProject} className="text-xs text-slate-500 hover:text-slate-800">‹ Mis obras</button>
            <div className="flex flex-wrap items-center gap-3 mt-1">
              <h1 className="text-xl font-bold text-slate-800">{project.name}</h1>
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${stage === 'works' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                {stage === 'works' ? 'En obra' : 'En presupuesto'}
              </span>
            </div>
            {project.client && <div className="text-sm text-slate-500">{project.client}</div>}
            <div role="tablist" aria-label="Secciones de la obra" className="flex flex-wrap items-end gap-1 mt-3 -mb-px">
              {projectTabs.map(t => {
                const selected = isActive(t.id);
                const locked = lockedTabs.includes(t.id);
                return (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setActiveTab(t.id)}
                    title={locked ? 'Se habilita al aprobar el presupuesto' : undefined}
                    className={`flex items-center gap-2 px-3 py-2.5 text-sm border-b-2 transition-colors ${
                      selected ? 'border-blue-600 text-blue-700 font-semibold' : `border-transparent hover:text-slate-800 ${locked ? 'text-slate-400' : 'text-slate-500'}`
                    }`}
                  >
                    {locked ? <Lock size={15} /> : <t.icon size={15} />} {t.label}
                  </button>
                );
              })}
              {shownTools.map(t => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={activeTab === t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-2 px-3 py-2.5 text-sm border-b-2 transition-colors ${
                    activeTab === t.id ? 'border-blue-600 text-blue-700 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <t.icon size={15} /> {t.label}
                </button>
              ))}
              {hiddenTools.length > 0 && (
                <div className="relative" ref={toolsRef}>
                  <button
                    onClick={() => setToolsOpen(o => !o)}
                    aria-expanded={toolsOpen}
                    className="flex items-center gap-1 px-3 py-2.5 text-sm text-slate-500 hover:text-slate-800 border-b-2 border-transparent"
                  >
                    <Plus size={15} /> Más herramientas <ChevronDown size={14} />
                  </button>
                  {toolsOpen && (
                    <div className="absolute right-0 top-full mt-1 z-30 w-64 bg-white border border-slate-200 rounded-xl shadow-lg p-2">
                      {hiddenTools.map(t => (
                        <div key={t.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
                          <span className="flex items-center gap-2 text-sm text-slate-700"><t.icon size={15} /> {t.label}</span>
                          <button
                            onClick={() => { saveTools([...activeTools, t.id]); setActiveTab(t.id); setToolsOpen(false); }}
                            className="text-xs font-bold text-blue-700 hover:bg-blue-50 rounded px-2 py-1"
                          >
                            Activar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 md:p-8 max-w-[1600px] mx-auto h-full">
          {children}
        </div>
      </main>
    </div>
  );
};
