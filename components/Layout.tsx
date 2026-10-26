import React, { useState } from 'react';
import { LayoutDashboard, Calculator, CalendarDays, HardHat, Wrench, SlidersHorizontal, Truck, TrendingUp, Users, LogOut, FileText, ClipboardCheck, Save, CheckCircle2, X, ArrowLeftRight, Building, ChevronDown, ChevronRight, ShieldCheck, Lock, BookOpen, BarChart3, Settings2, PanelLeftClose, PanelLeftOpen, LucideIcon } from 'lucide-react';
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

  // ── Secciones de la obra ──────────────────────────────────────────────────
  const homeItem: NavItem = { id: 'dashboard', label: 'Inicio', icon: LayoutDashboard, roles: [] };
  const budgetItem: NavItem = { id: 'budget', label: 'Presupuesto', icon: Calculator, roles: ['admin', 'project_manager'] };
  const worksItems = ([
    { id: 'planning', label: 'Planificación', icon: CalendarDays, roles: ['admin', 'project_manager', 'worker'] },
    { id: 'management', label: 'Avance y control', icon: TrendingUp, roles: ['admin', 'project_manager', 'client'] },
  ] as NavItem[]).filter(i => can(i.roles));
  const projectItems = ([
    { id: 'project_labor', label: 'Personal de la obra', icon: HardHat, roles: ['admin'] },
    { id: 'reports_view', label: 'Reportes', icon: BarChart3, roles: ['admin', 'project_manager', 'worker', 'client'] },
    { id: 'settings', label: 'Ajustes de la obra', icon: Settings2, roles: ['admin'] },
  ] as NavItem[]).filter(i => can(i.roles));

  // ── Empresa ───────────────────────────────────────────────────────────────
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

  const NavButton: React.FC<{ item: NavItem; locked?: boolean; badge?: string }> = ({ item, locked, badge }) => {
    const label = locked ? `${item.label} (se habilita al aprobar el presupuesto)` : item.label;
    return (
      <button
        onClick={() => setActiveTab(item.id)}
        title={isSidebarOpen ? undefined : label}
        aria-label={isSidebarOpen ? undefined : label}
        className={`w-full flex items-center gap-3 rounded-lg transition-colors text-sm font-medium min-h-[40px] ${isSidebarOpen ? 'px-3' : 'justify-center'} ${
          isActive(item.id)
            ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50'
            : locked ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-800' : 'text-slate-400 hover:text-white hover:bg-slate-800'
        }`}
      >
        {locked ? <Lock size={18} className="shrink-0" /> : <item.icon size={18} className="shrink-0" />}
        {isSidebarOpen && <span className="flex-1 text-left truncate">{item.label}</span>}
        {isSidebarOpen && badge && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-800">{badge}</span>}
      </button>
    );
  };

  const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    isSidebarOpen
      ? <div className="px-3 pt-4 pb-1 text-[11px] font-bold tracking-wider text-slate-500 uppercase">{children}</div>
      : <div className="my-2 border-t border-slate-800" />
  );

  const initials = (project.name || '?').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
      <aside className={`${isSidebarOpen ? 'w-64' : 'w-16'} bg-slate-900 text-white flex flex-col flex-shrink-0 print:hidden transition-all duration-300 ease-in-out relative z-20 shadow-xl overflow-hidden`}>

        {/* Obra activa */}
        <div className={`bg-slate-950 relative ${isSidebarOpen ? 'p-4' : 'p-2 flex flex-col items-center gap-2'}`}>
          {isSidebarOpen ? (
            <div className="bg-slate-800 rounded-xl p-3 border border-slate-700 shadow-sm">
              <div className="flex items-center gap-1 mb-2">
                <span className="flex-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 whitespace-nowrap">
                  <Building size={10} /> Proyecto activo
                </span>
                <button
                  onClick={exitProject}
                  className="text-[10px] bg-slate-700 hover:bg-blue-600 text-slate-200 hover:text-white px-2 py-1 rounded transition-colors flex items-center gap-1"
                  title="Cambiar de proyecto"
                >
                  <ArrowLeftRight size={10} /> Cambiar
                </button>
                <button
                  onClick={toggleSidebar}
                  className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-700 transition-colors"
                  title="Ocultar menú"
                  aria-label="Ocultar menú"
                >
                  <PanelLeftClose size={14} />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-600/80 flex items-center justify-center text-sm font-bold shrink-0" aria-hidden="true">
                  {initials}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-white text-sm truncate leading-tight" title={project.name}>{project.name}</div>
                  {project.client && <div className="text-[11px] text-slate-400 truncate">{project.client}</div>}
                </div>
              </div>
              <span className={`inline-block mt-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${stage === 'works' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                {stage === 'works' ? 'En obra' : 'En presupuesto'}
              </span>
            </div>
          ) : (
            <>
              <button onClick={toggleSidebar} title="Mostrar menú" aria-label="Mostrar menú" className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
                <PanelLeftOpen size={18} />
              </button>
              <button
                onClick={exitProject}
                title={`${project.name} · cambiar de proyecto`}
                aria-label={`${project.name}: cambiar de proyecto`}
                className="w-10 h-10 rounded-lg bg-blue-600/80 hover:bg-blue-600 flex items-center justify-center text-sm font-bold"
              >
                {initials}
              </button>
            </>
          )}
        </div>

        {/* Usuario */}
        {isSidebarOpen && (
          <div className="px-6 py-4 border-b border-slate-800/50">
            <div className="text-sm font-bold text-white truncate">{user?.name}</div>
            <div className="text-xs text-slate-400 mt-1">
              <span className="capitalize bg-slate-800 px-2 py-0.5 rounded-full">{user?.role}</span>
            </div>
          </div>
        )}

        <nav className={`flex-1 space-y-1 overflow-y-auto ${isSidebarOpen ? 'p-3' : 'p-2'}`}>
          <NavButton item={homeItem} />

          {can(budgetItem.roles) && (
            <>
              <SectionTitle>Presupuesto</SectionTitle>
              <NavButton item={budgetItem} badge={stage === 'works' ? 'Aprobado' : undefined} />
            </>
          )}

          {(worksItems.length > 0 || projectItems.length > 0) && (
            <>
              <SectionTitle>Obra</SectionTitle>
              {worksItems.map(item => <NavButton key={item.id} item={item} locked={stage === 'budget'} />)}
              {isSidebarOpen && stage === 'budget' && worksItems.length > 0 && (
                <div className="px-3 pl-10 pb-1 text-[11px] leading-snug text-slate-500">Se habilita al aprobar el presupuesto</div>
              )}
              {projectItems.map(item => <NavButton key={item.id} item={item} />)}
            </>
          )}

          {shownTools.length > 0 && (
            <>
              <SectionTitle>Herramientas</SectionTitle>
              {shownTools.map(item => <NavButton key={item.id} item={item} />)}
            </>
          )}

          {isSidebarOpen && hiddenTools.length > 0 && (
            <div className="pt-3">
              <button
                onClick={() => setToolsOpen(o => !o)}
                aria-expanded={toolsOpen}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 text-xs font-semibold"
              >
                {toolsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Más herramientas ({hiddenTools.length})
              </button>
              {toolsOpen && hiddenTools.map(item => (
                <div key={item.id} className="flex items-center justify-between gap-2 pl-8 pr-1 py-1">
                  <span className="text-xs text-slate-400">{item.label}</span>
                  <button
                    onClick={() => { saveTools([...activeTools, item.id]); setActiveTab(item.id); }}
                    className="text-[11px] font-bold text-blue-300 hover:text-white bg-slate-800 border border-slate-700 rounded px-2 py-1"
                  >
                    Activar
                  </button>
                </div>
              ))}
            </div>
          )}

          {companyItems.length > 0 && (
            <>
              {isSidebarOpen && <div className="mt-4 border-t border-slate-800" />}
              <SectionTitle>Empresa</SectionTitle>
              {companyItems.map(item => <NavButton key={item.id} item={item} />)}
            </>
          )}
        </nav>

        <div className={`border-t border-slate-800 space-y-2 bg-slate-900 ${isSidebarOpen ? 'p-4' : 'p-2'}`}>
          <button
            onClick={handleGlobalSave}
            disabled={!canSave || saveStatus === 'saving' || saveStatus === 'ok'}
            title={!canSave ? 'Esta vista se guarda automáticamente' : 'Guardar cambios de esta vista'}
            aria-label={isSidebarOpen ? undefined : 'Guardar'}
            className={`w-full flex items-center justify-center gap-2 text-sm font-bold rounded-lg min-h-[44px] transition-all shadow-md disabled:cursor-not-allowed ${isSidebarOpen ? 'px-4' : ''} ${
              saveStatus === 'ok'     ? 'bg-green-600 text-white' :
              saveStatus === 'error'  ? 'bg-red-600 text-white opacity-90' :
              saveStatus === 'saving' ? 'bg-blue-400 text-white' :
              canSave                 ? 'bg-blue-700 hover:bg-blue-600 text-white' :
                                        'bg-slate-700 text-slate-500'
            }`}
          >
            {saveStatus === 'ok' ? <CheckCircle2 size={18} /> : saveStatus === 'error' ? <X size={18} /> : <Save size={18} />}
            {isSidebarOpen && (saveStatus === 'ok' ? 'Guardado' : saveStatus === 'error' ? 'Error al guardar' : saveStatus === 'saving' ? 'Guardando…' : canSave ? 'Guardar' : 'Auto-guardado')}
          </button>
          <button
            onClick={logout}
            title={isSidebarOpen ? undefined : 'Cerrar sesión'}
            aria-label={isSidebarOpen ? undefined : 'Cerrar sesión'}
            className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-red-400 text-xs font-bold px-2 py-2 hover:bg-slate-800 rounded-lg transition-colors min-h-[40px]"
          >
            <LogOut size={isSidebarOpen ? 14 : 18} /> {isSidebarOpen && 'Cerrar sesión'}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-slate-100 relative">
        <div className="p-6 md:p-8 max-w-[1600px] mx-auto h-full">
          {children}
        </div>
      </main>
    </div>
  );
};
