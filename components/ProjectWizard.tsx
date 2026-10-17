import React, { useState } from 'react';
import { useERP } from '../context/ERPContext';
import { 
  Briefcase, ArrowRight, Building, Calendar, FileText, 
  MapPin, CheckCircle2, User, Ruler, LayoutTemplate, PlusCircle, FolderOpen
} from 'lucide-react';
import { PROJECT_TEMPLATES, CONSTRUCTION_SYSTEMS } from '../constants';
import { Project } from '../types';

interface ProjectWizardProps {
  onComplete: () => void;
  initialMode?: 'welcome' | 'create';
}

export const ProjectWizard: React.FC<ProjectWizardProps> = ({ onComplete, initialMode = 'welcome' }) => {
  const { projects, createNewProject, setActiveProject, loadTemplate } = useERP();

  const [mode, setMode] = useState<'welcome' | 'create' | 'load'>(initialMode);
  const [step, setStep] = useState(0); // 0: Info, 1: Technical, 2: Template
  
  // Create Form State
  const [newProjectData, setNewProjectData] = useState<Partial<Project>>({
      name: '',
      client: '',
      address: '',
      startDate: new Date().toISOString().split('T')[0],
      surface: 0,
      constructionSystem: '',
      items: []
  });
  
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const handleCreate = () => {
      createNewProject(newProjectData);
      
      // If template selected, apply it immediately
      if (selectedTemplate) {
          const tmpl = PROJECT_TEMPLATES.find(t => t.id === selectedTemplate);
          if (tmpl) loadTemplate(tmpl);
      }
      onComplete();
  };

  const handleLoad = (id: string) => {
      setActiveProject(id);
      onComplete();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col md:flex-row h-[600px] animate-in zoom-in-95 duration-300">
        
        {/* Left Banner */}
        <div className="md:w-1/3 bg-slate-900 text-white p-8 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-blue-500 via-slate-900 to-slate-900"></div>
            
            <div className="relative z-10">
                <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mb-6 shadow-lg shadow-blue-900/50">
                    <Briefcase size={24} />
                </div>
                <h1 className="text-3xl font-black leading-tight mb-2">Bienvenido a Obraflow</h1>
                <p className="text-slate-400 text-sm">Plataforma integral para gestión de obras y presupuestos.</p>
            </div>

            <div className="relative z-10 space-y-4">
                <div className="flex items-center gap-3 text-sm text-slate-300">
                    <CheckCircle2 size={16} className="text-emerald-500" />
                    <span>Control de Costos</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-300">
                    <CheckCircle2 size={16} className="text-emerald-500" />
                    <span>Planificación Gantt</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-300">
                    <CheckCircle2 size={16} className="text-emerald-500" />
                    <span>Gestión de Acopio</span>
                </div>
            </div>
        </div>

        {/* Right Content */}
        <div className="flex-1 p-8 bg-slate-50 flex flex-col">
            
            {/* MODE: WELCOME */}
            {mode === 'welcome' && (
                <div className="flex-1 flex flex-col justify-center gap-6">
                    <h2 className="text-2xl font-bold text-slate-800">¿Qué deseas hacer hoy?</h2>
                    
                    <button 
                        onClick={() => setMode('create')}
                        className="group flex items-center justify-between p-6 bg-white border-2 border-slate-200 rounded-xl hover:border-blue-500 hover:shadow-xl transition-all text-left"
                    >
                        <div>
                            <span className="block font-bold text-lg text-slate-800 group-hover:text-blue-600 transition-colors">Crear Nuevo Proyecto</span>
                            <span className="text-sm text-slate-500">Configurar una nueva obra desde cero o usando plantillas.</span>
                        </div>
                        <div className="bg-slate-100 p-3 rounded-full group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                            <PlusCircle size={24} />
                        </div>
                    </button>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center" aria-hidden="true">
                            <div className="w-full border-t border-slate-300"></div>
                        </div>
                        <div className="relative flex justify-center">
                            <span className="bg-slate-50 px-2 text-sm text-slate-500">O continuar trabajando</span>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Proyectos Recientes</h3>
                        <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-2">
                            {projects.length === 0 && <p className="text-sm text-slate-400 italic">No hay proyectos guardados.</p>}
                            {projects.map(p => (
                                <button 
                                    key={p.id}
                                    onClick={() => handleLoad(p.id)}
                                    className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200 hover:bg-white hover:border-blue-400 hover:shadow-md transition-all text-left group"
                                >
                                    <FolderOpen size={18} className="text-slate-400 group-hover:text-blue-500" />
                                    <div className="flex-1 truncate">
                                        <div className="font-bold text-slate-700 text-sm">{p.name}</div>
                                        <div className="text-xs text-slate-400">{p.client}</div>
                                    </div>
                                    <ArrowRight size={16} className="text-slate-300 group-hover:text-blue-500" />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* MODE: CREATE WIZARD */}
            {mode === 'create' && (
                <div className="flex-1 flex flex-col">
                    {/* Stepper */}
                    <div className="flex items-center gap-2 mb-8">
                        {[0, 1, 2].map(i => (
                            <div key={i} className={`h-2 flex-1 rounded-full transition-all ${i <= step ? 'bg-blue-600' : 'bg-slate-200'}`}></div>
                        ))}
                    </div>

                    {/* Step 0: Basic Info */}
                    {step === 0 && (
                        <div className="flex-1 space-y-4 animate-in slide-in-from-right">
                            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <Building className="text-blue-600"/> Datos Generales
                            </h3>
                            
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nombre del Proyecto</label>
                                <input 
                                    className="w-full p-3 border border-slate-300 rounded-lg focus:outline-blue-500"
                                    placeholder="Ej: Edificio Central"
                                    value={newProjectData.name}
                                    onChange={e => setNewProjectData({...newProjectData, name: e.target.value})}
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Cliente</label>
                                <div className="relative">
                                    <User size={18} className="absolute left-3 top-3 text-slate-400" />
                                    <input 
                                        className="w-full p-3 pl-10 border border-slate-300 rounded-lg focus:outline-blue-500"
                                        placeholder="Nombre del Cliente"
                                        value={newProjectData.client}
                                        onChange={e => setNewProjectData({...newProjectData, client: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Ubicación</label>
                                <div className="relative">
                                    <MapPin size={18} className="absolute left-3 top-3 text-slate-400" />
                                    <input 
                                        className="w-full p-3 pl-10 border border-slate-300 rounded-lg focus:outline-blue-500"
                                        placeholder="Dirección de la obra"
                                        value={newProjectData.address}
                                        onChange={e => setNewProjectData({...newProjectData, address: e.target.value})}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 1: Technical Specs */}
                    {step === 1 && (
                        <div className="flex-1 space-y-4 animate-in slide-in-from-right">
                            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <Ruler className="text-blue-600"/> Ficha Técnica
                            </h3>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fecha Inicio</label>
                                    <input 
                                        type="date"
                                        className="w-full p-3 border border-slate-300 rounded-lg focus:outline-blue-500"
                                        value={newProjectData.startDate}
                                        onChange={e => setNewProjectData({...newProjectData, startDate: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Superficie (m²)</label>
                                    <input 
                                        type="number"
                                        className="w-full p-3 border border-slate-300 rounded-lg focus:outline-blue-500 font-bold"
                                        placeholder="0"
                                        value={newProjectData.surface || ''}
                                        onChange={e => setNewProjectData({...newProjectData, surface: parseFloat(e.target.value)})}
                                    />
                                </div>
                            </div>
                            
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Sistema Constructivo</label>
                                <select 
                                    className="w-full p-3 border border-slate-300 rounded-lg focus:outline-blue-500 bg-white"
                                    value={newProjectData.constructionSystem}
                                    onChange={e => setNewProjectData({...newProjectData, constructionSystem: e.target.value})}
                                >
                                    <option value="">Seleccionar...</option>
                                    {CONSTRUCTION_SYSTEMS.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Templates */}
                    {step === 2 && (
                        <div className="flex-1 space-y-4 animate-in slide-in-from-right">
                            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <LayoutTemplate className="text-blue-600"/> Plantilla Inicial
                            </h3>
                            <p className="text-sm text-slate-500">Seleccione una plantilla para precargar tareas comunes o comience en blanco.</p>
                            
                            <div className="grid grid-cols-1 gap-3 max-h-60 overflow-y-auto">
                                <div 
                                    onClick={() => setSelectedTemplate(null)}
                                    className={`p-4 border rounded-xl cursor-pointer transition-all ${selectedTemplate === null ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-200 hover:border-blue-300'}`}
                                >
                                    <div className="font-bold text-slate-800">Proyecto en Blanco</div>
                                    <div className="text-xs text-slate-500">Configuración manual desde cero.</div>
                                </div>
                                {PROJECT_TEMPLATES.map(t => (
                                    <div 
                                        key={t.id}
                                        onClick={() => setSelectedTemplate(t.id)}
                                        className={`p-4 border rounded-xl cursor-pointer transition-all ${selectedTemplate === t.id ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-200 hover:border-blue-300'}`}
                                    >
                                        <div className="font-bold text-slate-800">{t.name}</div>
                                        <div className="text-xs text-slate-500">{t.description}</div>
                                        <div className="mt-2 text-xs font-bold text-blue-600 bg-blue-100 inline-block px-2 py-0.5 rounded">
                                            {t.tasks.length} Tareas
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Footer Navigation */}
                    <div className="flex justify-between mt-6 pt-6 border-t border-slate-200">
                        {step > 0 ? (
                            <button onClick={() => setStep(step - 1)} className="text-slate-500 font-bold hover:bg-slate-200 px-4 py-2 rounded-lg transition-colors">
                                Atrás
                            </button>
                        ) : (
                            <button onClick={() => setMode('welcome')} className="text-slate-500 font-bold hover:bg-slate-200 px-4 py-2 rounded-lg transition-colors">
                                Cancelar
                            </button>
                        )}

                        {step < 2 ? (
                            <button 
                                onClick={() => setStep(step + 1)}
                                disabled={step === 0 && !newProjectData.name}
                                className="bg-slate-900 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-black transition-colors disabled:opacity-50"
                            >
                                Siguiente <ArrowRight size={16} />
                            </button>
                        ) : (
                            <button 
                                onClick={handleCreate}
                                className="bg-blue-600 text-white px-8 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-blue-700 shadow-lg shadow-blue-200 transition-colors"
                            >
                                <CheckCircle2 size={18} /> Crear Proyecto
                            </button>
                        )}
                    </div>
                </div>
            )}

        </div>
      </div>
    </div>
  );
};