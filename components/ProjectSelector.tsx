import React, { useState } from 'react';
import { useERP } from '../context/ERPContext';
import { useAuth } from '../context/AuthContext';
import { FolderPlus, HardHat, ArrowRight, MapPin, Calendar, User, CheckCircle2, FolderOpen, LogOut } from 'lucide-react';
import { Project } from '../types';

export const ProjectSelector: React.FC = () => {
  const { projects, setActiveProject, createNewProject } = useERP();
  const { user, logout, hasPermission } = useAuth();
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProject, setNewProject] = useState<Partial<Project>>({
      name: '',
      client: '',
      address: '',
      startDate: new Date().toISOString().split('T')[0]
  });

  const canCreate = hasPermission(['admin', 'project_manager']);

  const handleCreate = () => {
      if (!newProject.name) return;
      createNewProject(newProject);
      setShowCreateModal(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
        {/* Navbar */}
        <div className="bg-slate-900 text-white p-4 shadow-md flex justify-between items-center">
            <div className="flex items-center gap-2">
                <div className="bg-blue-600 p-1.5 rounded-lg">
                    <HardHat size={20} className="text-white" />
                </div>
                <h1 className="font-bold text-lg">Obraflow</h1>
            </div>
            <div className="flex items-center gap-4">
                <div className="text-right hidden md:block">
                    <div className="text-sm font-bold">{user?.name}</div>
                    <div className="text-xs text-slate-400 capitalize">{user?.role}</div>
                </div>
                <button 
                    onClick={logout}
                    className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
                    title="Cerrar Sesión"
                >
                    <LogOut size={20} />
                </button>
            </div>
        </div>

        {/* Content */}
        <div className="flex-1 max-w-6xl mx-auto w-full p-8">
            <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
                <div>
                    <h2 className="text-3xl font-black text-slate-800">Mis Proyectos</h2>
                    <p className="text-slate-500 mt-2">Seleccione una obra para comenzar a trabajar.</p>
                </div>
                {canCreate && (
                    <button 
                        onClick={() => setShowCreateModal(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-200 flex items-center gap-2 transition-transform active:scale-95"
                    >
                        <FolderPlus size={20} /> Nuevo Proyecto
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Project Cards */}
                {projects.map((project) => (
                    <div 
                        key={project.id}
                        onClick={() => setActiveProject(project.id)}
                        className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group flex flex-col justify-between h-48"
                    >
                        <div>
                            <div className="flex justify-between items-start mb-2">
                                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                    <FolderOpen size={24} />
                                </div>
                                <span className="bg-slate-100 text-slate-500 text-xs px-2 py-1 rounded-full font-bold">
                                    Activo
                                </span>
                            </div>
                            <h3 className="text-lg font-bold text-slate-800 truncate mb-1">{project.name}</h3>
                            <p className="text-sm text-slate-500 truncate flex items-center gap-1">
                                <User size={14}/> {project.client}
                            </p>
                        </div>
                        
                        <div className="pt-4 border-t border-slate-100 flex justify-between items-center text-sm text-slate-400">
                            <span className="flex items-center gap-1"><MapPin size={14}/> {project.address || 'Sin dirección'}</span>
                            <ArrowRight size={18} className="text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                        </div>
                    </div>
                ))}

                {/* Empty State for Admins */}
                {projects.length === 0 && (
                    <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50">
                        <FolderPlus size={48} className="mx-auto text-slate-300 mb-4" />
                        <h3 className="text-lg font-bold text-slate-600">No hay proyectos creados</h3>
                        <p className="text-slate-400 text-sm mb-6">Comience creando su primera obra.</p>
                        {canCreate && (
                            <button 
                                onClick={() => setShowCreateModal(true)}
                                className="text-blue-600 font-bold hover:underline"
                            >
                                Crear ahora
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>

        {/* Create Modal */}
        {showCreateModal && (
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95">
                    <div className="p-6 border-b border-slate-100 bg-slate-50">
                        <h3 className="text-xl font-bold text-slate-800">Crear Nuevo Proyecto</h3>
                        <p className="text-sm text-slate-500">Ingrese los datos básicos de la obra.</p>
                    </div>
                    
                    <div className="p-6 space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nombre del Proyecto</label>
                            <input 
                                className="w-full p-3 border border-slate-300 rounded-lg focus:outline-blue-500"
                                placeholder="Ej: Torre Bellavista"
                                autoFocus
                                value={newProject.name}
                                onChange={e => setNewProject({...newProject, name: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Cliente</label>
                            <input 
                                className="w-full p-3 border border-slate-300 rounded-lg focus:outline-blue-500"
                                placeholder="Nombre del Cliente"
                                value={newProject.client}
                                onChange={e => setNewProject({...newProject, client: e.target.value})}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Ubicación</label>
                                <input 
                                    className="w-full p-3 border border-slate-300 rounded-lg focus:outline-blue-500"
                                    placeholder="Dirección"
                                    value={newProject.address}
                                    onChange={e => setNewProject({...newProject, address: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fecha Inicio</label>
                                <input 
                                    type="date"
                                    className="w-full p-3 border border-slate-300 rounded-lg focus:outline-blue-500"
                                    value={newProject.startDate}
                                    onChange={e => setNewProject({...newProject, startDate: e.target.value})}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                        <button 
                            onClick={() => setShowCreateModal(false)}
                            className="px-5 py-2.5 rounded-lg font-bold text-slate-500 hover:bg-slate-200 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={handleCreate}
                            disabled={!newProject.name}
                            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-lg shadow-blue-200 transition-all flex items-center gap-2 disabled:opacity-50"
                        >
                            <CheckCircle2 size={18} /> Crear Proyecto
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};