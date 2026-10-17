import React, { useState } from 'react';
import { useERP } from '../context/ERPContext';
import { useAuth } from '../context/AuthContext';
import { FolderPlus, HardHat, ArrowRight, MapPin, Calendar, User, CheckCircle2, FolderOpen, LogOut, Activity, BarChart2, Briefcase } from 'lucide-react';
import { Project } from '../types';
import { ProjectWizard } from './ProjectWizard';

export const ProjectHub: React.FC = () => {
  const { projects, setActiveProject } = useERP();
  const { user, logout, hasPermission } = useAuth();

  const [showWizard, setShowWizard] = useState(false);

  const canCreate = hasPermission(['admin', 'project_manager']);

  const getProjectProgress = (proj: Project) => {
      if (!proj.items || proj.items.length === 0) return 0;
      // Simple weighted average based on quantity (not cost for speed in this view)
      const totalItems = proj.items.length;
      const totalProgress = proj.items.reduce((acc, item) => acc + (item.progress || 0), 0);
      return Math.round(totalProgress / totalItems);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        {/* Navbar */}
        <div className="bg-slate-900 text-white px-6 py-4 shadow-md flex justify-between items-center">
            <div className="flex items-center gap-3">
                <div className="bg-blue-600 p-2 rounded-lg">
                    <HardHat size={24} className="text-white" />
                </div>
                <div>
                    <h1 className="font-bold text-xl leading-none">Obraflow</h1>
                    <span className="text-xs text-slate-400">Panel de Proyectos</span>
                </div>
            </div>
            <div className="flex items-center gap-6">
                <div className="text-right hidden md:block">
                    <div className="text-sm font-bold">{user?.name}</div>
                    <div className="text-xs text-slate-400 capitalize">{user?.role}</div>
                </div>
                <button 
                    onClick={logout}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium transition-colors border border-slate-700"
                >
                    <LogOut size={16} /> <span className="hidden sm:inline">Cerrar Sesión</span>
                </button>
            </div>
        </div>

        {/* Hero Section */}
        <div className="bg-white border-b border-slate-200 py-10 px-8">
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-end gap-6">
                <div>
                    <h2 className="text-3xl font-black text-slate-800 mb-2">Mis Proyectos</h2>
                    <p className="text-slate-500 text-lg">Seleccione una obra para acceder al tablero de control.</p>
                </div>
                {canCreate && (
                    <button
                        onClick={() => setShowWizard(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-200 flex items-center gap-2 transition-transform active:scale-95"
                    >
                        <FolderPlus size={20} /> Nuevo Proyecto
                    </button>
                )}
            </div>
        </div>

        {/* Content */}
        <div className="flex-1 max-w-7xl mx-auto w-full p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {/* Project Cards */}
                {projects.map((project) => {
                    const progress = getProjectProgress(project);
                    return (
                        <div 
                            key={project.id}
                            onClick={() => setActiveProject(project.id)}
                            className="bg-white rounded-2xl p-6 border border-slate-200 border-l-4 border-l-emerald-500 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group flex flex-col h-64 relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Briefcase size={80} className="text-slate-800" />
                            </div>

                            <div className="flex justify-between items-start mb-4 relative z-10">
                                <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
                                    project.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                    project.status === 'completed' ? 'bg-slate-100 text-slate-600 border-slate-200' :
                                    project.status === 'suspended' ? 'bg-red-50 text-red-700 border-red-100' :
                                    'bg-blue-50 text-blue-700 border-blue-100' // planning
                                }`}>
                                    {project.status === 'active' ? 'En Ejecución' :
                                     project.status === 'completed' ? 'Finalizado' :
                                     project.status === 'suspended' ? 'Suspendido' :
                                     'Planificación'}
                                </div>
                            </div>
                            
                            <div className="flex-1 relative z-10">
                                <h3 className="text-xl font-bold text-slate-800 truncate mb-1" title={project.name}>{project.name}</h3>
                                <p className="text-sm text-slate-500 truncate flex items-center gap-1 mb-4">
                                    <User size={14}/> {project.client}
                                </p>
                                <div className="flex items-center gap-2 text-slate-400 text-xs mb-6">
                                    <MapPin size={14} /> <span>{project.address || 'Ubicación no definida'}</span>
                                </div>
                            </div>

                            <div className="relative z-10">
                                <div className="flex justify-between items-end mb-2">
                                    <span className="text-xs font-bold text-slate-400 uppercase">Avance General</span>
                                    <span className="text-lg font-bold text-emerald-600">{progress}%</span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                    <div className="bg-emerald-500 h-full rounded-full transition-all duration-1000" style={{ width: `${progress}%` }}></div>
                                </div>
                            </div>
                        </div>
                    );
                })}

                {/* Empty State */}
                {projects.length === 0 && (
                    <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-300 rounded-2xl bg-white/50">
                        <FolderPlus size={48} className="mx-auto text-slate-300 mb-4" />
                        <h3 className="text-lg font-bold text-slate-600">No hay proyectos creados</h3>
                        <p className="text-slate-400 text-sm mb-6">Comience creando su primera obra.</p>
                        {canCreate && (
                            <button
                                onClick={() => setShowWizard(true)}
                                className="text-blue-600 font-bold hover:underline"
                            >
                                Crear ahora
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>

        {showWizard && (
            <ProjectWizard
                initialMode="create"
                onComplete={() => setShowWizard(false)}
            />
        )}
    </div>
  );
};