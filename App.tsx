
import React, { useState, useEffect } from 'react';
import { ERPProvider, useERP } from './context/ERPContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { BudgetEditor } from './components/BudgetEditor';
import { BudgetGrid } from './components/BudgetGrid';
import { Planning } from './components/Planning';
import { DataAdmin } from './components/DataAdmin';
import { ToolsManager } from './components/ToolsManager';
import { ProjectSettings } from './components/ProjectSettings';
import { MaterialReception } from './components/MaterialReception';
import { ManagementPanel } from './components/ManagementPanel';
import { Subcontractors } from './components/Subcontractors';
import { DocumentManager } from './components/DocumentManager';
import { MeasurementSheetComponent } from './components/MeasurementSheet';
import { QualityControl } from './components/QualityControl';
import { ProjectHub } from './components/ProjectHub';
import { APUBuilder } from './components/APUBuilder';
import { InvitationAccept } from './components/InvitationAccept';
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
  const { user, loading } = useAuth();
  const { activeProjectId } = useERP();
  const [activeTab, setActiveTab] = useState('dashboard');

  // Leer token de invitación de la URL al montar y limpiarla inmediatamente
  const [inviteToken, setInviteToken] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('invite');
    if (t) window.history.replaceState({}, '', window.location.pathname);
    return t;
  });

  // STATE 0: Resolving Supabase session
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
    return <Login hasInvite={!!inviteToken} />;
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

  // STATE 2: Authenticated but No Project Selected -> HUB
  if (!activeProjectId) {
      return <ProjectHub />;
  }

  // STATE 3: Active Project (Main Layout)
  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': 
        return <ProtectedRoute allowedRoles={['admin', 'project_manager', 'worker', 'client']}><Dashboard /></ProtectedRoute>;
      case 'management': 
        return <ProtectedRoute allowedRoles={['admin', 'project_manager', 'client']}><ManagementPanel /></ProtectedRoute>;
      case 'subcontractors': 
        return <ProtectedRoute allowedRoles={['admin', 'project_manager']}><Subcontractors /></ProtectedRoute>;
      case 'budget': 
        return <ProtectedRoute allowedRoles={['admin', 'project_manager']}><BudgetEditor /></ProtectedRoute>;
      case 'apu':
        return <ProtectedRoute allowedRoles={['admin', 'project_manager']}><APUBuilder /></ProtectedRoute>;
      case 'grid': 
        return <ProtectedRoute allowedRoles={['admin', 'project_manager']}><BudgetGrid /></ProtectedRoute>;
      case 'planning': 
        return <ProtectedRoute allowedRoles={['admin', 'project_manager', 'worker']}><Planning /></ProtectedRoute>;
      case 'reception': 
        return <ProtectedRoute allowedRoles={['admin', 'worker']}><MaterialReception /></ProtectedRoute>;
      case 'tools': 
        return <ProtectedRoute allowedRoles={['admin', 'project_manager']}><ToolsManager /></ProtectedRoute>;
      case 'admin': 
        return <ProtectedRoute allowedRoles={['admin', 'project_manager']}><DataAdmin /></ProtectedRoute>;
      case 'settings': 
        return <ProtectedRoute allowedRoles={['admin']}><ProjectSettings /></ProtectedRoute>;
      case 'documents':
        return <ProtectedRoute allowedRoles={['admin', 'project_manager', 'worker', 'client']}><DocumentManager /></ProtectedRoute>;
      case 'measurements':
        return <ProtectedRoute allowedRoles={['admin', 'project_manager']}><MeasurementSheetComponent /></ProtectedRoute>;
      case 'quality':
        return <ProtectedRoute allowedRoles={['admin', 'project_manager', 'worker']}><QualityControl /></ProtectedRoute>;
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
