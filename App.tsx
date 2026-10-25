
import React, { useState, useEffect } from 'react';
import { ERPProvider, useERP } from './context/ERPContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { Login } from './components/Login';
import { LandingPage } from './components/LandingPage';
import { Dashboard } from './components/Dashboard';
import { BudgetModule } from './components/BudgetModule';
import { getProjectStage, StageLockedNotice } from './components/ProjectStage';
import { Planning } from './components/Planning';
import { DataAdmin } from './components/DataAdmin';
import { ToolsManager } from './components/ToolsManager';
import { ProjectSettings } from './components/ProjectSettings';
import { MaterialReception } from './components/MaterialReception';
import { ManagementPanel } from './components/ManagementPanel';
import { Subcontractors } from './components/Subcontractors';
import { DocumentManager } from './components/DocumentManager';
import { QualityControl } from './components/QualityControl';
import { ProjectHub } from './components/ProjectHub';
import { APUBuilder } from './components/APUBuilder';
import { AdminPanel } from './components/AdminPanel';
import { UpdatePassword } from './components/UpdatePassword';
import { InvitationAccept } from './components/InvitationAccept';
import { BillingSuccess } from './src/features/billing/BillingSuccess';
import { Role } from './types';
import { SaveProvider } from './context/SaveContext';

// Route Protection Component (Middleware Simulation)
const ProtectedRoute: React.FC<{ 
  allowedRoles: Role[], 
  children: React.ReactNode 
}> = ({ allowedRoles, children }) => {
  const { user } = useAuth();
  
  if (!user || !allowedRoles.includes(user.role)) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-400">
        <div className="text-4xl mb-4">🚫</div>
        <h2 className="text-xl font-bold text-slate-700">Acceso Restringido</h2>
        <p>No tienes permisos para ver este módulo.</p>
      </div>
    );
  }
  return <>{children}</>;
};

const AppContent = () => {
  const { user, loading, isMasterAdmin, isPasswordRecovery, clearPasswordRecovery } = useAuth();
  const { activeProjectId, project } = useERP();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [openedLocked, setOpenedLocked] = useState<string[]>([]);
  const [showLogin, setShowLogin] = useState(false);

  // Leer token de invitación de la URL al montar y limpiarla inmediatamente
  const [inviteToken, setInviteToken] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('invite');
    if (t) window.history.replaceState({}, '', window.location.pathname);
    return t;
  });

  // Leer billing_status=success de la URL al montar y limpiarla inmediatamente
  const [billSuccess, setBillSuccess] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('billing_status');
    if (v) window.history.replaceState({}, '', window.location.pathname);
    return v === 'success';
  });

  // STATE 0: Password recovery (show immediately — URL hash detected or onAuthStateChange fired)
  if (isPasswordRecovery) {
    return <UpdatePassword onDone={clearPasswordRecovery} />;
  }

  // STATE 0.5: Resolving Supabase session
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Cargando sesión…</p>
        </div>
      </div>
    );
  }

  // STATE 1: Unauthenticated
  if (!user) {
    // Un link de invitación va directo al login (con el formulario de aceptación), sin pasar por la landing
    if (inviteToken || showLogin) {
      return (
        <Login
          hasInvite={!!inviteToken}
          onBack={inviteToken ? undefined : () => setShowLogin(false)}
        />
      );
    }
    return <LandingPage onLogin={() => setShowLogin(true)} />;
  }

  // STATE 1.5: Pending invitation acceptance
  if (inviteToken) {
    return (
      <InvitationAccept
        token={inviteToken}
        onComplete={() => setInviteToken(null)}
        onSkip={() => setInviteToken(null)}
      />
    );
  }

  // STATE 1.6: Post-Stripe checkout success
  if (billSuccess) {
    return <BillingSuccess onDone={() => setBillSuccess(false)} />;
  }

  // STATE 2: Authenticated but No Project Selected -> HUB
  if (!activeProjectId) {
      return <ProjectHub />;
  }

  // STATE 2.5: System Admin area (master_admin only, project-agnostic)
  if (activeTab === 'system_admin') {
    return <AdminPanel onBack={() => setActiveTab('dashboard')} />;
  }

  // STATE 3: Active Project (Main Layout)
  const stage = getProjectStage(project.status);
  const gate = (tab: string, label: string, content: React.ReactNode) =>
    stage === 'budget' && !openedLocked.includes(`${project.id}:${tab}`)
      ? <StageLockedNotice moduleLabel={label} onNavigate={setActiveTab} onOpenAnyway={() => setOpenedLocked(prev => [...prev, `${project.id}:${tab}`])} />
      : content;

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <ProtectedRoute allowedRoles={['admin', 'project_manager', 'worker', 'client']}><Dashboard onNavigate={setActiveTab} /></ProtectedRoute>;
      case 'management': 
        return <ProtectedRoute allowedRoles={['admin', 'project_manager', 'client']}>{gate('management', 'Avance y control', <ManagementPanel />)}</ProtectedRoute>;
      case 'subcontractors': 
        return <ProtectedRoute allowedRoles={['admin', 'project_manager']}><Subcontractors /></ProtectedRoute>;
      case 'budget':
      case 'grid':
      case 'measurements':
        return <ProtectedRoute allowedRoles={['admin', 'project_manager']}><BudgetModule activeTab={activeTab} onNavigate={setActiveTab} /></ProtectedRoute>;
      case 'apu':
        return <ProtectedRoute allowedRoles={['admin', 'project_manager']}><APUBuilder /></ProtectedRoute>;
      case 'planning': 
        return <ProtectedRoute allowedRoles={['admin', 'project_manager', 'worker']}>{gate('planning', 'Planificación', <Planning />)}</ProtectedRoute>;
      case 'reception': 
        return <ProtectedRoute allowedRoles={['admin', 'worker']}><MaterialReception /></ProtectedRoute>;
      case 'tools': 
        return <ProtectedRoute allowedRoles={['admin', 'project_manager']}><ToolsManager /></ProtectedRoute>;
      case 'admin':
        return <ProtectedRoute allowedRoles={['admin', 'project_manager']}><DataAdmin key={activeTab} /></ProtectedRoute>;
      case 'chandias':
        return <ProtectedRoute allowedRoles={['admin', 'project_manager']}><DataAdmin key={activeTab} initialSubTab="chandias" /></ProtectedRoute>;
      case 'reports':
        return <ProtectedRoute allowedRoles={['admin', 'project_manager']}><DataAdmin key={activeTab} initialSubTab="reports" /></ProtectedRoute>;
      case 'admin_resources':
        return <ProtectedRoute allowedRoles={['admin', 'project_manager']}><DataAdmin key={activeTab} initialSubTab="resources" /></ProtectedRoute>;
      case 'admin_catalog':
        return <ProtectedRoute allowedRoles={['admin', 'project_manager']}><DataAdmin key={activeTab} initialSubTab="master" /></ProtectedRoute>;
      case 'admin_apu':
        return <ProtectedRoute allowedRoles={['admin', 'project_manager']}><DataAdmin key={activeTab} initialSubTab="master-tasks" /></ProtectedRoute>;
      case 'company_labor':
        return <ProtectedRoute allowedRoles={['admin', 'project_manager']}><DataAdmin key={activeTab} initialSubTab="labor" /></ProtectedRoute>;
      case 'settings':
        return <ProtectedRoute allowedRoles={['admin']}><ProjectSettings /></ProtectedRoute>;
      case 'documents':
        return <ProtectedRoute allowedRoles={['admin', 'project_manager', 'worker', 'client']}><DocumentManager /></ProtectedRoute>;
      case 'quality':
        return <ProtectedRoute allowedRoles={['admin', 'project_manager', 'worker']}><QualityControl /></ProtectedRoute>;
      case 'system_admin':
        return isMasterAdmin
          ? <AdminPanel onBack={() => setActiveTab('dashboard')} />
          : <ProtectedRoute allowedRoles={[]}>{null}</ProtectedRoute>;
      default: return <Dashboard />;
    }
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {renderContent()}
    </Layout>
  );
};

const App = () => {
  return (
    <AuthProvider>
      <ERPProvider>
        <SaveProvider>
          <AppContent />
        </SaveProvider>
      </ERPProvider>
    </AuthProvider>
  );
};

export default App;
