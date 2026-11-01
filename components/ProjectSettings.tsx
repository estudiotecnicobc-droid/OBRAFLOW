import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useERP } from '../context/ERPContext';
import { DemoProjectActions } from './DemoProjectActions';
import { useSave } from '../context/SaveContext';
import { generateId } from '../utils/generateId';
import { Building, MapPin, User, Calendar, Save, CreditCard, Briefcase, CheckCircle, Ruler, Component, Layers, ArrowDownCircle, BookOpen, Clock, CalendarX, Plus, Trash2, FolderOpen, Bookmark, DollarSign, Users, HardHat, UserPlus, Download, Upload, Edit, X } from 'lucide-react';
import { CONSTRUCTION_SYSTEMS, STRUCTURE_TYPES, FOUNDATION_TYPES, PROJECT_TEMPLATES, DEFAULT_PRICING_CONFIG } from '../constants';
import { projectsService } from '../services/projectsService';
import { Holiday, ProjectLaborDefinition, ProjectCrewDefinition, CalendarPreset, Crew, CrewComposition } from '../types';

type Tab = 'general' | 'financial' | 'calendar' | 'labor';

export const ProjectSettings: React.FC<{ initialTab?: Tab }> = ({ initialTab }) => {
  const { project, updateProjectSettings, loadTemplate, calendarPresets, addCalendarPreset, applyCalendarPreset, deleteProject, laborCategories, crews, laborCategoriesMap, addCrew, updateCrew, removeCrew } = useERP();
  const { registerSave, unregisterSave } = useSave();
  const [activeTab, setActiveTab] = useState<Tab>(initialTab ?? 'general');

  // Crew Editing State
  const [isCrewModalOpen, setIsCrewModalOpen] = useState(false);
  const [editingCrew, setEditingCrew] = useState<Partial<Crew>>({
      name: '',
      description: '',
      composition: []
  });

  const [formData, setFormData] = useState({
    name: '',
    client: '',
    address: '',
    companyName: '',
    startDate: '',
    endDate: '', // Added End Date
    currency: '$',
    surface: '',
    constructionSystem: '',
    structureType: '',
    foundationType: '',
    workdayHours: 9,
    workdayStartTime: "08:00",
    workdayEndTime: "17:00",
    lunchBreakDuration: 60
  });
  
  // Pricing Form Data
  const [pricingData, setPricingData] = useState(DEFAULT_PRICING_CONFIG);

  const [workingDays, setWorkingDays] = useState<number[]>([1,2,3,4,5]);
  const [nonWorkingDates, setNonWorkingDates] = useState<Holiday[]>([]);
  const [newHoliday, setNewHoliday] = useState({ date: '', description: '' });

  // Calendar Preset State
  const [selectedPresetId, setSelectedPresetId] = useState('');

  // Labor Force Data
  const [laborForce, setLaborForce] = useState<ProjectLaborDefinition[]>([]);
  const [assignedCrews, setAssignedCrews] = useState<ProjectCrewDefinition[]>([]);

  useEffect(() => {
      if (project) {
          setFormData({
              name: project.name || '',
              client: project.client || '',
              address: project.address || '',
              companyName: project.companyName || '',
              startDate: project.startDate || '',
              endDate: project.endDate || '', // Load endDate
              currency: project.currency || '$',
              surface: project.surface?.toString() || '',
              constructionSystem: project.constructionSystem || '',
              structureType: project.structureType || '',
              foundationType: project.foundationType || '',
              workdayHours: project.workdayHours || 9,
              workdayStartTime: project.workdayStartTime || "08:00",
              workdayEndTime: project.workdayEndTime || "17:00",
              lunchBreakDuration: project.lunchBreakDuration || 60
          });
          setPricingData(project.pricing || DEFAULT_PRICING_CONFIG);
          setWorkingDays(project.workingDays || [1,2,3,4,5]);
          setNonWorkingDates(project.nonWorkingDates || []);
          setLaborForce(project.laborForce || []);
          setAssignedCrews(project.assignedCrews || []);
      }
  }, [project]);

  const handleSave = useCallback(async () => {
      const updates = {
          ...formData,
          surface: parseFloat(formData.surface) || 0,
          pricing: pricingData,
          workingDays,
          nonWorkingDates,
          laborForce,
          assignedCrews,
      };
      updateProjectSettings(updates);                            // optimista: local state + fire-and-forget Supabase
      await projectsService.update(project.id, updates);        // awaitable: propaga error real al botón global
      // Feedback para el botón interno de la vista
      const btn = document.getElementById('save-btn');
      if (btn) {
          const orig = btn.innerText;
          btn.innerText = 'Guardado!';
          setTimeout(() => { btn.innerText = orig; }, 2000);
      }
  }, [formData, pricingData, workingDays, nonWorkingDates, laborForce, assignedCrews, updateProjectSettings, project.id]);

  useEffect(() => {
      registerSave(handleSave);
      return () => unregisterSave();
  }, [handleSave, registerSave, unregisterSave]);

  // --- Calendar Logic ---
  const toggleWorkingDay = (dayIndex: number) => {
      if (workingDays.includes(dayIndex)) {
          setWorkingDays(workingDays.filter(d => d !== dayIndex));
      } else {
          setWorkingDays([...workingDays, dayIndex].sort());
      }
  };

  const addHoliday = () => {
      if (newHoliday.date && newHoliday.description) {
          setNonWorkingDates([...nonWorkingDates, { ...newHoliday }]);
          setNewHoliday({ date: '', description: '' });
      }
  };

  const removeHoliday = (date: string) => {
      setNonWorkingDates(nonWorkingDates.filter(h => h.date !== date));
  };

  const handleLoadPreset = () => {
      if (!selectedPresetId) return;
      const preset = calendarPresets.find(p => p.id === selectedPresetId);
      if (preset) {
          setFormData(prev => ({
              ...prev,
              workdayHours: preset.workdayHours,
              workdayStartTime: preset.workdayStartTime,
              workdayEndTime: preset.workdayEndTime,
              lunchBreakDuration: preset.lunchBreakDuration
          }));
          setWorkingDays(preset.workingDays);
          setNonWorkingDates(preset.nonWorkingDates); // Optional: Do we want to load holidays from template? Yes.
          alert(`Plantilla "${preset.name}" aplicada. Recuerde guardar los cambios.`);
      }
  };

  const handleCreatePreset = () => {
      const name = prompt("Ingrese un nombre para el nuevo calendario:");
      if (!name) return;

      const newPreset: CalendarPreset = {
          id: generateId(),
          name,
          workdayHours: formData.workdayHours,
          workdayStartTime: formData.workdayStartTime,
          workdayEndTime: formData.workdayEndTime,
          lunchBreakDuration: formData.lunchBreakDuration,
          workingDays,
          nonWorkingDates
      };
      addCalendarPreset(newPreset);
      setSelectedPresetId(newPreset.id);
  };

  const handleDeleteProject = () => {
      if (window.confirm("¿Está seguro de eliminar este proyecto permanentemente? Esta acción no se puede deshacer.")) {
          deleteProject(project.id);
      }
  };

  // --- Labor Management Handlers ---
  const updateLaborCount = (id: string, delta: number) => {
      setLaborForce(prev => {
          const existing = prev.find(l => l.laborCategoryId === id);
          if (existing) {
              const newCount = Math.max(0, existing.count + delta);
              if (newCount === 0) return prev.filter(l => l.laborCategoryId !== id);
              return prev.map(l => l.laborCategoryId === id ? { ...l, count: newCount } : l);
          } else if (delta > 0) {
              return [...prev, { laborCategoryId: id, count: delta }];
          }
          return prev;
      });
  };

  const updateCrewCount = (id: string, delta: number) => {
      setAssignedCrews(prev => {
          const existing = prev.find(c => c.crewId === id);
          if (existing) {
              const newCount = Math.max(0, existing.count + delta);
              if (newCount === 0) return prev.filter(c => c.crewId !== id);
              return prev.map(c => c.crewId === id ? { ...c, count: newCount } : c);
          } else if (delta > 0) {
              return [...prev, { crewId: id, count: delta }];
          }
          return prev;
      });
  };

  // Calculate Daily Labor Cost of Defined Force
  const dailyLaborCost = useMemo(() => {
      let totalHourly = 0;
      
      // Individual
      laborForce.forEach(lf => {
          const cat = laborCategoriesMap[lf.laborCategoryId];
          if(cat) {
              const hourly = (cat.basicHourlyRate * (1 + (cat.socialChargesPercent + cat.insurancePercent)/100));
              totalHourly += hourly * lf.count;
          }
      });

      // Crews
      assignedCrews.forEach(ac => {
          const crew = crews.find(c => c.id === ac.crewId);
          if(crew) {
              crew.composition.forEach(member => {
                  const cat = laborCategoriesMap[member.laborCategoryId];
                  if(cat) {
                      const hourly = (cat.basicHourlyRate * (1 + (cat.socialChargesPercent + cat.insurancePercent)/100));
                      // Crew composition participation
                      const part = (member.participation ?? 100) / 100;
                      totalHourly += hourly * member.count * part * ac.count;
                  }
              });
          }
      });

      return totalHourly * formData.workdayHours;
  }, [laborForce, assignedCrews, laborCategoriesMap, crews, formData.workdayHours]);

  // --- Crew Management Handlers ---
  const handleOpenCrewModal = (crew?: Crew) => {
      if (crew) {
          setEditingCrew({ ...crew });
      } else {
          setEditingCrew({
              name: '',
              description: '',
              composition: []
          });
      }
      setIsCrewModalOpen(true);
  };

  const handleSaveCrew = () => {
      if (!editingCrew.name) return alert("El nombre es obligatorio");
      
      if (editingCrew.id) {
          updateCrew(editingCrew.id, editingCrew);
      } else {
          addCrew({
              ...editingCrew as Crew,
              id: generateId(),
              composition: editingCrew.composition || []
          });
      }
      setIsCrewModalOpen(false);
  };

  const addMemberToCrew = (laborCategoryId: string) => {
      setEditingCrew(prev => ({
          ...prev,
          composition: [
              ...(prev.composition || []),
              { laborCategoryId, count: 1, participation: 100 }
          ]
      }));
  };

  const removeMemberFromCrew = (index: number) => {
      setEditingCrew(prev => ({
          ...prev,
          composition: (prev.composition || []).filter((_, i) => i !== index)
      }));
  };

  const updateMemberInCrew = (index: number, field: keyof CrewComposition, value: number) => {
      setEditingCrew(prev => ({
          ...prev,
          composition: (prev.composition || []).map((c, i) => i === index ? { ...c, [field]: value } : c)
      }));
  };

  const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
        
        {/* Header */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <Briefcase className="text-blue-600" /> Configuración del Proyecto
                </h2>
                <p className="text-sm text-slate-500">Parámetros generales, técnicos, financieros y recursos.</p>
            </div>
            <div className="flex gap-2">
                <button 
                    onClick={handleDeleteProject}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-lg text-sm font-bold transition-all"
                >
                    <Trash2 size={18} /> Eliminar Proyecto
                </button>
                <button 
                    id="save-btn"
                    onClick={handleSave}
                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-bold shadow-lg shadow-blue-200 transition-all"
                >
                    <Save size={18} /> Guardar Cambios
                </button>
            </div>
        </div>

        <DemoProjectActions />

        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-slate-100 p-1 rounded-xl">
            <button 
                onClick={() => setActiveTab('general')}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'general' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:bg-slate-200'}`}
            >
                <Building size={16} /> General y Técnico
            </button>
            <button 
                onClick={() => setActiveTab('financial')}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'financial' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:bg-slate-200'}`}
            >
                <DollarSign size={16} /> Financiero
            </button>
            <button 
                onClick={() => setActiveTab('calendar')}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'calendar' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:bg-slate-200'}`}
            >
                <Calendar size={16} /> Calendario
            </button>
            <button 
                onClick={() => setActiveTab('labor')}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'labor' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:bg-slate-200'}`}
            >
                <Users size={16} /> Plantel de Obra
            </button>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 min-h-[500px]">
            
            {/* TAB: GENERAL */}
            {activeTab === 'general' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in">
                    <div className="space-y-4">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2 border-b border-slate-100 pb-2">
                            <Building size={18} className="text-slate-400" /> Información General
                        </h3>
                        <div className="grid grid-cols-1 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nombre de la Obra</label>
                                <input className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Cliente</label>
                                    <div className="relative">
                                        <User size={16} className="absolute left-3 top-2.5 text-slate-400" />
                                        <input className="w-full pl-9 p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" value={formData.client} onChange={e => setFormData({...formData, client: e.target.value})} />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Empresa Constructora</label>
                                    <input className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Dirección / Ubicación</label>
                                <div className="relative">
                                    <MapPin size={16} className="absolute left-3 top-2.5 text-slate-400" />
                                    <input className="w-full pl-9 p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fecha de Inicio</label>
                                    <input type="date" className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Moneda</label>
                                    <select className="w-full p-2 border border-slate-300 rounded bg-white" value={formData.currency} onChange={e => setFormData({...formData, currency: e.target.value})}>
                                        <option value="$">Peso Argentino ($)</option>
                                        <option value="USD">Dólar (USD)</option>
                                        <option value="EUR">Euro (€)</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2 border-b border-slate-100 pb-2">
                            <Ruler size={18} className="text-slate-400" /> Ficha Técnica
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Superficie Total (m²)</label>
                                <input type="number" className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none font-bold" value={formData.surface} onChange={e => setFormData({...formData, surface: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Sistema Constructivo</label>
                                <select className="w-full p-2 border border-slate-300 rounded bg-white" value={formData.constructionSystem} onChange={e => setFormData({...formData, constructionSystem: e.target.value})}>
                                    <option value="">Seleccionar...</option>
                                    {CONSTRUCTION_SYSTEMS.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tipo de Estructura</label>
                                <select className="w-full p-2 border border-slate-300 rounded bg-white" value={formData.structureType} onChange={e => setFormData({...formData, structureType: e.target.value})}>
                                    <option value="">Seleccionar...</option>
                                    {STRUCTURE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fundaciones</label>
                                <select className="w-full p-2 border border-slate-300 rounded bg-white" value={formData.foundationType} onChange={e => setFormData({...formData, foundationType: e.target.value})}>
                                    <option value="">Seleccionar...</option>
                                    {FOUNDATION_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB: FINANCIAL */}
            {activeTab === 'financial' && (
                <div className="animate-in fade-in max-w-2xl">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2 border-b border-slate-100 pb-2 mb-4">
                        <DollarSign size={18} className="text-slate-400" /> Estructura de Costos Indirectos
                    </h3>
                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Gastos Generales (%)</label>
                            <input type="number" className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-right font-mono" value={pricingData.generalExpensesPercent} onChange={e => setPricingData({...pricingData, generalExpensesPercent: parseFloat(e.target.value)})} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Beneficio / Utilidad (%)</label>
                            <input type="number" className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-right font-mono" value={pricingData.profitPercent} onChange={e => setPricingData({...pricingData, profitPercent: parseFloat(e.target.value)})} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Gastos Financieros (%)</label>
                            <input type="number" className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-right font-mono" value={pricingData.financialExpensesPercent} onChange={e => setPricingData({...pricingData, financialExpensesPercent: parseFloat(e.target.value)})} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Impuestos (IVA/IIBB) (%)</label>
                            <input type="number" className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-right font-mono" value={pricingData.taxPercent} onChange={e => setPricingData({...pricingData, taxPercent: parseFloat(e.target.value)})} />
                        </div>
                    </div>
                    
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 mt-6">
                        <p className="text-[10px] text-slate-500 italic">
                            <strong>Nota:</strong> Estos porcentajes se utilizan para calcular el precio de venta final en los reportes, aplicándose sobre el Costo Directo total.
                        </p>
                    </div>
                </div>
            )}

            {/* TAB: CALENDAR */}
            {activeTab === 'calendar' && (
                <div className="animate-in fade-in max-w-2xl">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2 border-b border-slate-100 pb-2 mb-4">
                        <Calendar size={18} className="text-slate-400" /> Jornada y Calendario
                    </h3>
                    
                    <div className="space-y-6">
                        {/* PRESET MANAGER */}
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex flex-col md:flex-row gap-4 items-end">
                            <div className="flex-1 w-full">
                                <label className="block text-xs font-bold text-blue-800 uppercase mb-1">Plantillas de Calendario</label>
                                <select 
                                    className="w-full p-2 border border-blue-200 rounded text-sm text-slate-700"
                                    value={selectedPresetId}
                                    onChange={(e) => setSelectedPresetId(e.target.value)}
                                >
                                    <option value="">-- Seleccionar Plantilla --</option>
                                    {calendarPresets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                            <button 
                                onClick={handleLoadPreset}
                                disabled={!selectedPresetId}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                            >
                                <Download size={16} /> Cargar
                            </button>
                            <button 
                                onClick={handleCreatePreset}
                                className="px-4 py-2 bg-white border border-blue-200 text-blue-700 rounded-lg text-sm font-bold hover:bg-blue-100 flex items-center gap-2"
                            >
                                <Upload size={16} /> Guardar como Nuevo
                            </button>
                        </div>

                        {/* New Date Range Section */}
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <h4 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
                                <Clock size={14} /> Límites Temporales del Proyecto
                            </h4>
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Inicio de Obra</label>
                                    <input 
                                        type="date" 
                                        className="w-full p-2 border border-slate-300 rounded bg-white text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                                        value={formData.startDate} 
                                        onChange={e => setFormData({...formData, startDate: e.target.value})} 
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fin de Obra (Previsto)</label>
                                    <input 
                                        type="date" 
                                        className="w-full p-2 border border-slate-300 rounded bg-white text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                                        value={formData.endDate} 
                                        onChange={e => setFormData({...formData, endDate: e.target.value})} 
                                    />
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Días Laborables</label>
                            <div className="flex gap-2">
                                {DAYS.map((day, idx) => (
                                    <button 
                                        key={idx}
                                        onClick={() => toggleWorkingDay(idx)}
                                        className={`w-10 h-10 rounded-full text-xs font-bold transition-all ${workingDays.includes(idx) ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                                    >
                                        {day}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Horas Jornada</label>
                                <input type="number" className="w-full p-2 border border-slate-300 rounded text-center" value={formData.workdayHours} onChange={e => setFormData({...formData, workdayHours: parseFloat(e.target.value)})} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Hora Inicio</label>
                                <input type="time" className="w-full p-2 border border-slate-300 rounded text-center" value={formData.workdayStartTime} onChange={e => setFormData({...formData, workdayStartTime: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Hora Fin</label>
                                <input type="time" className="w-full p-2 border border-slate-300 rounded text-center" value={formData.workdayEndTime} onChange={e => setFormData({...formData, workdayEndTime: e.target.value})} />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Feriados y Días No Laborables</label>
                            <div className="flex gap-2 mb-2">
                                <input type="date" className="p-2 border border-slate-300 rounded text-sm" value={newHoliday.date} onChange={e => setNewHoliday({...newHoliday, date: e.target.value})} />
                                <input type="text" className="flex-1 p-2 border border-slate-300 rounded text-sm" placeholder="Descripción (ej: Navidad)" value={newHoliday.description} onChange={e => setNewHoliday({...newHoliday, description: e.target.value})} />
                                <button onClick={addHoliday} disabled={!newHoliday.date} className="bg-slate-800 text-white px-3 py-2 rounded hover:bg-black disabled:opacity-50"><Plus size={16} /></button>
                            </div>
                            <div className="max-h-32 overflow-y-auto border border-slate-200 rounded-lg p-2 bg-slate-50 space-y-1">
                                {nonWorkingDates.length === 0 && <p className="text-xs text-slate-400 italic text-center">Sin feriados configurados.</p>}
                                {nonWorkingDates.map((h, i) => (
                                    <div key={i} className="flex justify-between items-center text-xs bg-white p-2 rounded border border-slate-100">
                                        <span className="font-bold text-slate-700">{new Date(h.date + 'T12:00:00').toLocaleDateString()}</span>
                                        <span className="text-slate-500 flex-1 ml-2">{h.description}</span>
                                        <button onClick={() => removeHoliday(h.date)} className="text-red-400 hover:text-red-600"><Trash2 size={12} /></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB: LABOR FORCE (NEW) */}
            {activeTab === 'labor' && (
                <div className="animate-in fade-in flex flex-col lg:flex-row gap-8">
                    {/* Left: Configuration */}
                    <div className="flex-1 space-y-8">
                        {/* Individual Workers */}
                        <div>
                            <h3 className="font-bold text-slate-700 flex items-center gap-2 border-b border-slate-100 pb-2 mb-4">
                                <UserPlus size={18} className="text-blue-500" /> Personal Individual (Jornales)
                            </h3>
                            <div className="space-y-2">
                                {laborCategories.map(cat => {
                                    const assigned = laborForce.find(l => l.laborCategoryId === cat.id)?.count || 0;
                                    return (
                                        <div key={cat.id} className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-200">
                                            <div>
                                                <div className="font-bold text-sm text-slate-700">{cat.role}</div>
                                                <div className="text-xs text-slate-400">${cat.basicHourlyRate}/h (Básico)</div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <button onClick={() => updateLaborCount(cat.id, -1)} className="w-8 h-8 rounded-full bg-white border border-slate-300 flex items-center justify-center hover:bg-slate-100 text-slate-500 font-bold">-</button>
                                                <span className="w-8 text-center font-bold text-lg">{assigned}</span>
                                                <button onClick={() => updateLaborCount(cat.id, 1)} className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 shadow-sm font-bold">+</button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Crews */}
                        <div>
                            <div className="flex justify-between items-center border-b border-slate-100 pb-2 mb-4">
                                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                    <HardHat size={18} className="text-orange-500" /> Cuadrillas Armadas
                                </h3>
                                <button 
                                    onClick={() => handleOpenCrewModal()}
                                    className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded hover:bg-orange-200 font-bold flex items-center gap-1"
                                >
                                    <Plus size={14} /> Nueva
                                </button>
                            </div>
                            <div className="space-y-2">
                                {crews.map(crew => {
                                    const assigned = assignedCrews.find(c => c.crewId === crew.id)?.count || 0;
                                    return (
                                        <div key={crew.id} className="flex justify-between items-center bg-orange-50 p-3 rounded-lg border border-orange-100 group">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <div className="font-bold text-sm text-slate-800">{crew.name}</div>
                                                    <button onClick={() => handleOpenCrewModal(crew)} className="text-slate-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Edit size={12} />
                                                    </button>
                                                </div>
                                                <div className="text-xs text-slate-500">{crew.description}</div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <button onClick={() => updateCrewCount(crew.id, -1)} className="w-8 h-8 rounded-full bg-white border border-slate-300 flex items-center justify-center hover:bg-slate-100 text-slate-500 font-bold">-</button>
                                                <span className="w-8 text-center font-bold text-lg">{assigned}</span>
                                                <button onClick={() => updateCrewCount(crew.id, 1)} className="w-8 h-8 rounded-full bg-orange-600 text-white flex items-center justify-center hover:bg-orange-700 shadow-sm font-bold">+</button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Right: Summary Card */}
                    <div className="w-full lg:w-80">
                        <div className="bg-slate-800 text-white p-6 rounded-xl shadow-lg sticky top-6">
                            <h4 className="text-xs font-bold text-slate-400 uppercase mb-4 tracking-wider">Resumen del Plantel</h4>
                            
                            <div className="mb-6">
                                <p className="text-3xl font-mono font-bold text-emerald-400">${dailyLaborCost.toLocaleString(undefined, {maximumFractionDigits: 0})}</p>
                                <p className="text-xs text-slate-400 mt-1">Costo Diario Estimado (Jornada {formData.workdayHours}hs)</p>
                            </div>

                            <div className="space-y-3 text-sm border-t border-slate-700 pt-4">
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Jornales (Indiv.)</span>
                                    <span className="font-bold">{laborForce.reduce((acc, curr) => acc + curr.count, 0)} operarios</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Cuadrillas</span>
                                    <span className="font-bold">{assignedCrews.reduce((acc, curr) => acc + curr.count, 0)} equipos</span>
                                </div>
                            </div>

                            <div className="mt-6 p-3 bg-slate-700 rounded-lg text-xs text-slate-300 leading-relaxed">
                                <p>Este plantel estará disponible para ser asignado en el módulo de Planificación para cálculos de rendimiento real.</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>

        {/* Crew Editor Modal */}
        {isCrewModalOpen && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                    <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-center">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <HardHat className="text-orange-500" size={20} /> 
                            {editingCrew.id ? 'Editar Cuadrilla' : 'Nueva Cuadrilla'}
                        </h3>
                        <button onClick={() => setIsCrewModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                            <X size={20} />
                        </button>
                    </div>
                    
                    <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nombre de la Cuadrilla</label>
                            <input 
                                className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-orange-500 outline-none" 
                                placeholder="Ej: Cuadrilla Hormigón (1+3)"
                                value={editingCrew.name}
                                onChange={e => setEditingCrew({...editingCrew, name: e.target.value})}
                                autoFocus
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Descripción</label>
                            <input 
                                className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-orange-500 outline-none" 
                                placeholder="Descripción opcional"
                                value={editingCrew.description || ''}
                                onChange={e => setEditingCrew({...editingCrew, description: e.target.value})}
                            />
                        </div>

                        <div className="pt-4 border-t border-slate-100">
                            <div className="flex justify-between items-center mb-2">
                                <label className="block text-xs font-bold text-slate-500 uppercase">Integrantes</label>
                                <div className="relative group">
                                    <button className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100 font-bold flex items-center gap-1">
                                        <Plus size={12} /> Agregar Rol
                                    </button>
                                    {/* Dropdown for adding role */}
                                    <div className="absolute right-0 top-full mt-1 w-48 bg-white shadow-xl rounded-lg border border-slate-100 hidden group-hover:block z-10 max-h-48 overflow-y-auto">
                                        {laborCategories.map(cat => (
                                            <button 
                                                key={cat.id}
                                                onClick={() => addMemberToCrew(cat.id)}
                                                className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 text-slate-700 block"
                                            >
                                                {cat.role}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            
                            <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-200 min-h-[100px]">
                                {(!editingCrew.composition || editingCrew.composition.length === 0) && (
                                    <div className="text-center py-8 text-slate-400 text-xs italic">
                                        Sin integrantes asignados.
                                    </div>
                                )}
                                {editingCrew.composition?.map((member, idx) => {
                                    const role = laborCategoriesMap[member.laborCategoryId];
                                    return (
                                        <div key={idx} className="bg-white p-2 rounded border border-slate-200 flex items-center gap-2 shadow-sm">
                                            <div className="flex-1">
                                                <div className="font-bold text-xs text-slate-700">{role?.role || 'Rol desconocido'}</div>
                                                <div className="text-[10px] text-slate-400">${role?.basicHourlyRate}/h</div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="flex flex-col items-end">
                                                    <label className="text-[9px] text-slate-400 uppercase">Cant.</label>
                                                    <input 
                                                        type="number" 
                                                        min="1"
                                                        className="w-12 p-1 text-xs border rounded text-center"
                                                        value={member.count}
                                                        onChange={e => updateMemberInCrew(idx, 'count', parseFloat(e.target.value))}
                                                    />
                                                </div>
                                                <div className="flex flex-col items-end">
                                                    <label className="text-[9px] text-slate-400 uppercase">% Inc.</label>
                                                    <input 
                                                        type="number" 
                                                        min="1"
                                                        max="100"
                                                        className="w-12 p-1 text-xs border rounded text-center"
                                                        value={member.participation || 100}
                                                        onChange={e => updateMemberInCrew(idx, 'participation', parseFloat(e.target.value))}
                                                    />
                                                </div>
                                                <button onClick={() => removeMemberFromCrew(idx)} className="text-red-400 hover:text-red-600 p-1">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                        <button 
                            onClick={() => setIsCrewModalOpen(false)}
                            className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-sm font-bold"
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={handleSaveCrew}
                            className="px-4 py-2 bg-orange-600 text-white hover:bg-orange-700 rounded-lg text-sm font-bold shadow-lg shadow-orange-200 flex items-center gap-2"
                        >
                            <Save size={16} /> Guardar Cuadrilla
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};