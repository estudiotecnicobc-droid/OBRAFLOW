
import React, { useState } from 'react';
import { LayoutDashboard, Calculator, CalendarDays, HardHat, Wrench, SlidersHorizontal, Truck, TrendingUp, Users, LogOut, FileText, ClipboardCheck, Save, CheckCircle2, X, ArrowLeftRight, Building, Menu, ChevronLeft, ChevronDown, ChevronRight, ShieldCheck, Lock, BookOpen, LucideIcon } from 'lucide-react';
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

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab }) => {
  const { user, logout, isMasterAdmin } = useAuth();
  const { project, exitProject } = useERP();
  const { saveHandler } = useSave();
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

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

  const budgetItem: NavItem = { id: 'budget', label: 'Presupuesto', icon: Calculator, roles: ['admin', 'project_manager'] };
  const worksItems = ([
    { id: 'planning', label: 'Planificación', icon: CalendarDays, roles: ['admin', 'project_manager', 'worker'] },
    { id: 'management', label: 'Avance y control', icon: TrendingUp, roles: ['admin', 'project_manager', 'client'] },
  ] as NavItem[]).filter(i => can(i.roles));
  const companyItems = ([
    { id: 'company_labor', label: 'Personal y cuadrillas', icon: HardHat, roles: ['admin', 'project_manager'] },
    { id: 'admin_apu', label: 'Catálogo maestro', icon: BookOpen, roles: ['admin', 'project_manager'] },
    { id: 'settings', label: 'Configuración', icon: SlidersHorizontal, roles: ['admin'] },
    ...(isMasterAdmin ? [{ id: 'system_admin', label: 'Admin del Sistema', icon: ShieldCheck, roles: [] as Role[] }] : []),
  ] as NavItem[]).filter(i => i.id === 'system_admin' || can(i.roles));

  const isActive = (id: string) =>
    id === 'budget' ? BUDGET_MODULE_TABS.includes(activeTab as typeof BUDGET_MODULE_TABS[number]) : activeTab === id;

  const NavButton: React.FC<{ item: NavItem; locked?: boolean; badge?: string }> = ({ item, locked, badge }) => (
    <button
      onClick={() => setActiveTab(item.id)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${
        isActive(item.id)
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50'
          : locked ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-800' : 'text-slate-400 hover:text-white hover:bg-slate-800'
      }`}
    >
      {locked ? <Lock size={18} /> : <item.icon size={18} />}
      <span className="flex-1 text-left">{item.label}</span>
      {badge && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-800">{badge}</span>}
    </button>
  );

  const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="px-3 pt-4 pb-1 text-[11px] font-bold tracking-wider text-slate-500 uppercase">{children}</div>
  );

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside 
        className={`${isSidebarOpen ? 'w-64 translate-x-0' : 'w-0 -translate-x-full opacity-0'} bg-slate-900 text-white flex flex-col flex-shrink-0 print:hidden transition-all duration-300 ease-in-out relative z-20 shadow-xl overflow-hidden`}
      >
        
        {/* Sidebar Header with Context Card */}
        <div className="p-4 bg-slate-950 relative">
            <div className="bg-slate-800 rounded-xl p-3 border border-slate-700 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <Building size={10} /> Proyecto Activo
                    </span>
                    <button 
                        onClick={exitProject}
                        className="text-[10px] bg-slate-700 hover:bg-blue-600 text-slate-200 hover:text-white px-2 py-1 rounded transition-colors flex items-center gap-1"
                        title="Cambiar de Proyecto"
                    >
                        <ArrowLeftRight size={10} /> Cambiar
                    </button>
                </div>
                <div className="font-bold text-white text-sm truncate leading-tight mb-1" title={project.name}>
                    {project.name}
                </div>
                <div className="text-[10px] text-slate-400 truncate">{project.client}</div>
                <span className={`inline-block mt-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${stage === 'works' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                    {stage === 'works' ? 'En obra' : 'En presupuesto'}
                </span>
            </div>
            
            {/* Close Sidebar Button */}
            <button 
                onClick={() => setIsSidebarOpen(false)}
                className="absolute top-2 right-2 text-slate-500 hover:text-white p-1 rounded-full hover:bg-slate-800 transition-colors"
                title="Ocultar Menú"
            >
                <ChevronLeft size={16} />
            </button>
        </div>

        {/* User Info */}
        <div className="px-6 py-4 border-b border-slate-800/50">
            <div className="text-sm font-bold text-white">{user?.name}</div>
            <div className="text-xs text-slate-400 flex items-center justify-between mt-1">
                <span className="capitalize bg-slate-800 px-2 py-0.5 rounded-full">{user?.role}</span>
            </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <NavButton item={{ id: 'dashboard', label: 'Inicio', icon: LayoutDashboard, roles: [] }} />

          {can(budgetItem.roles) && (
            <>
              <SectionTitle>Presupuesto</SectionTitle>
              <NavButton item={budgetItem} badge={stage === 'works' ? 'Aprobado' : undefined} />
            </>
          )}

          {worksItems.length > 0 && (
            <>
              <SectionTitle>Obra</SectionTitle>
              {worksItems.map(item => <NavButton key={item.id} item={item} locked={stage === 'budget'} />)}
              {stage === 'budget' && (
                <div className="px-3 pl-10 pb-1 text-[11px] leading-snug text-slate-500">Se habilita al aprobar el presupuesto</div>
              )}
            </>
          )}

          {shownTools.length > 0 && (
            <>
              <SectionTitle>Herramientas</SectionTitle>
              {shownTools.map(item => <NavButton key={item.id} item={item} />)}
            </>
          )}

          {hiddenTools.length > 0 && (
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
              <div className="mt-4 border-t border-slate-800" />
              <SectionTitle>Empresa</SectionTitle>
              {companyItems.map(item => <NavButton key={item.id} item={item} />)}
            </>
          )}
        </nav>
        
        <div className="p-4 border-t border-slate-800 space-y-2 bg-slate-900">
            <button
                onClick={handleGlobalSave}
                disabled={!canSave || saveStatus === 'saving' || saveStatus === 'ok'}
                title={!canSave ? 'Esta vista se guarda automáticamente' : 'Guardar cambios de esta vista'}
                className={`w-full flex items-center justify-center gap-2 text-sm font-bold px-4 py-3 rounded-lg transition-all shadow-md disabled:cursor-not-allowed ${
                    saveStatus === 'ok'     ? 'bg-green-600 text-white' :
                    saveStatus === 'error'  ? 'bg-red-600 text-white opacity-90' :
                    saveStatus === 'saving' ? 'bg-blue-400 text-white' :
                    canSave                 ? 'bg-blue-700 hover:bg-blue-600 text-white' :
                                             'bg-slate-700 text-slate-500'
                }`}
            >
                {saveStatus === 'ok'     ? <><CheckCircle2 size={18}/> Guardado ✓</> :
                 saveStatus === 'error'  ? <><X size={18}/> Error al guardar</> :
                 saveStatus === 'saving' ? <><CheckCircle2 size={18} className="animate-spin"/> Guardando...</> :
                 canSave                 ? <><Save size={18}/> Guardar</> :
                                          <><Save size={18}/> Auto-guardado</>}
            </button>

            <button onClick={logout} className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-red-400 text-xs font-bold px-4 py-2 hover:bg-slate-800 rounded-lg transition-colors mt-2">
                <LogOut size={14} /> Cerrar Sesión
            </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-slate-100 relative transition-all duration-300">
        {/* Open Sidebar Button (Floating) */}
        {!isSidebarOpen && (
            <button
                onClick={() => setIsSidebarOpen(true)}
                className="absolute top-4 left-4 z-30 bg-white p-2 rounded-lg shadow-md border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-300 transition-all animate-in fade-in slide-in-from-left-2"
                title="Mostrar Menú"
            >
                <Menu size={20} />
            </button>
        )}

        <div className="p-6 md:p-8 max-w-[1600px] mx-auto h-full">
            {children}
        </div>
      </main>
    </div>
  );
};
