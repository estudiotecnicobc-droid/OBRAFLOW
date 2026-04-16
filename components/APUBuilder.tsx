
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  Calculator, Hammer, Package, Save, RefreshCcw, 
  Info, DollarSign, ChevronRight, BookOpen, AlertCircle, Trash2, Plus, X, PenTool, Wrench, Users, ArrowRightLeft
} from 'lucide-react';
import { useERP } from '../context/ERPContext';
import { Task, TaskYield, TaskToolYield, TaskCrewYield, TaskLaborYield, StandardYields } from '../types';
import { calculateUnitPrice } from '../services/calculationService';
import { masterTasksService } from '../services/masterTasksSupabaseService';
import { useSave } from '../context/SaveContext';

import { TaskRelations } from './TaskRelations';

interface APUBuilderProps {
    taskId?: string; // Master Task ID (Library Mode)
    budgetItemId?: string; // Project Task ID (Gantt Mode)
    onClose?: () => void;
}

type TabType = 'general' | 'materials' | 'labor' | 'relations';

export const APUBuilder: React.FC<APUBuilderProps> = ({ taskId, budgetItemId, onClose }) => {
  const { 
      tasks, materials, tools, crews, laborCategories, updateTaskMaster,
      yieldsIndex, toolYieldsIndex, taskCrewYieldsIndex, taskLaborYieldsIndex,
      materialsMap, toolsMap, crewsMap, laborCategoriesMap, project
  } = useERP(); 
  
  const { registerSave, unregisterSave } = useSave();
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle');

  // --- LOCAL STATE (DRAFT) ---
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  
  // Real Yields (Active in Budget)
  const [localMaterials, setLocalMaterials] = useState<TaskYield[]>([]);
  const [localTools, setLocalTools] = useState<TaskToolYield[]>([]);
  const [localCrews, setLocalCrews] = useState<TaskCrewYield[]>([]);
  const [localLabor, setLocalLabor] = useState<TaskLaborYield[]>([]);

  // Selection states
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [selectedToolId, setSelectedToolId] = useState('');
  const [selectedCrewId, setSelectedCrewId] = useState('');
  const [selectedLaborId, setSelectedLaborId] = useState('');

  // --- INITIALIZATION ---
  useEffect(() => {
    // Resolución de taskId: Library Mode (taskId directo) o Gantt Mode (vía budgetItemId)
    let resolvedTaskId = taskId;
    if (!resolvedTaskId && budgetItemId) {
      const item = project.items.find(i => i.id === budgetItemId);
      if (item) resolvedTaskId = item.taskId;
    }
    if (!resolvedTaskId) return;

    const t = tasks.find(x => x.id === resolvedTaskId);
    if (!t) return;

    setCurrentTask({ ...t });

    const existingMaterials = yieldsIndex[resolvedTaskId]          ?? [];
    const existingTools     = toolYieldsIndex[resolvedTaskId]      ?? [];
    const existingLabor     = taskLaborYieldsIndex[resolvedTaskId] ?? [];

    const hasOwnYields = existingMaterials.length > 0 || existingTools.length > 0 || existingLabor.length > 0;

    if (hasOwnYields || !t.masterTaskId) {
      // Caso 1: yields propios → usarlos / Caso 3: sin masterTaskId → vacío
      setLocalMaterials(existingMaterials);
      setLocalTools(existingTools);
      setLocalCrews(taskCrewYieldsIndex[resolvedTaskId] ?? []);
      setLocalLabor(existingLabor);
      return;
    }

    // Caso 2: sin yields propios + tiene masterTaskId → pre-poblar desde MasterTask (draft, sin auto-save)
    setLocalCrews(taskCrewYieldsIndex[resolvedTaskId] ?? []);

    masterTasksService.getById(t.masterTaskId).then(mt => {
      if (!mt) return;

      const nameToMaterial = new Map<string, typeof materials[0]>(materials.map(m => [m.name.toLowerCase().trim(), m]));

      const preYields: TaskYield[] = mt.materials
        .map(mtm => {
          const mat = nameToMaterial.get(mtm.materialName.toLowerCase().trim());
          if (!mat) return null;
          return {
            taskId: t.id,
            materialId: mat.id,
            quantity: mtm.quantity,
            ...(mtm.wastePercent != null ? { wastePercent: mtm.wastePercent } : {}),
            organizationId: project.organizationId,
          } as TaskYield;
        })
        .filter((y): y is TaskYield => y !== null);

      const preLabor: TaskLaborYield[] = mt.labor
        .filter(l => !!laborCategoriesMap[l.laborCategoryId])
        .map(l => ({
          taskId: t.id,
          laborCategoryId: l.laborCategoryId,
          quantity: l.quantity,
          organizationId: project.organizationId,
        }));

      const preTools: TaskToolYield[] = mt.equipment
        .filter(e => !!toolsMap[e.toolId])
        .map(e => ({
          taskId: t.id,
          toolId: e.toolId,
          hoursPerUnit: e.hoursPerUnit,
          organizationId: project.organizationId,
        }));

      setLocalMaterials(preYields);
      setLocalLabor(preLabor);
      setLocalTools(preTools);
    });
  }, [taskId, budgetItemId, tasks]);

  // --- DYNAMIC CALCULATIONS ---
  const analysis = useMemo(() => {
      if (!currentTask) return { materialCost: 0, toolCost: 0, laborCost: 0, totalUnitCost: 0 };

      let matCost = 0;
      localMaterials.forEach(m => {
          const mat = materialsMap[m.materialId];
          if(mat) {
              // Formula: Quantity * Price * (1 + Waste%)
              const wasteFactor = 1 + ((m.wastePercent || 0) / 100);
              matCost += (mat.cost * m.quantity * wasteFactor);
          }
      });

      let toolCost = 0;
      localTools.forEach(t => {
          const tool = toolsMap[t.toolId];
          if(tool) toolCost += tool.costPerHour * t.hoursPerUnit;
      });

      let labCost = 0;
      
      // 1. Crew Cost
      if (localCrews.length > 0) {
          localCrews.forEach(c => {
              const crew = crewsMap[c.crewId];
              if(crew) {
                  let hourly = 0;
                  crew.composition.forEach(member => {
                      const cat = laborCategoriesMap[member.laborCategoryId];
                      if(cat) hourly += (cat.basicHourlyRate * (1 + (cat.socialChargesPercent+cat.insurancePercent)/100)) * member.count;
                  });
                  // Cost = (Hourly * 9hs * CrewCount) / Yield
                  if (currentTask.dailyYield > 0) {
                      labCost += (hourly * (project.workdayHours || 9) * c.quantity) / currentTask.dailyYield;
                  }
              }
          });
      }

      // 2. Individual Labor Cost
      if (localLabor.length > 0) {
          localLabor.forEach(l => {
              const cat = laborCategoriesMap[l.laborCategoryId];
              if(cat) {
                  const hourly = (cat.basicHourlyRate * (1 + (cat.socialChargesPercent+cat.insurancePercent)/100));
                  if (currentTask.dailyYield > 0) {
                      labCost += (hourly * (project.workdayHours || 9) * l.quantity) / currentTask.dailyYield;
                  }
              }
          });
      }

      // Fallback to manual if no derived cost
      if (labCost === 0) {
          labCost = currentTask.laborCost || 0;
      }

      return {
          materialCost: matCost,
          toolCost: toolCost,
          laborCost: labCost,
          totalUnitCost: matCost + toolCost + labCost
      };
  }, [currentTask, localMaterials, localTools, localCrews, localLabor, materialsMap, toolsMap, crewsMap, laborCategoriesMap, project.workdayHours]);

  // --- HELPER: COMPARE WITH STANDARD (Chandias) ---
  const getStandardDiff = (type: 'material' | 'yield' | 'labor', id?: string, value?: number) => {
      if (!currentTask?.standardYields) return null;
      
      // Comparison Logic
      if (type === 'yield') {
          // Compare HH/Unit (Calculated from Daily Yield) vs Standard HH/Unit
          // Current HH = (CrewSize * Hours) / DailyYield
          // Standard HH is stored directly
          // This is complex because we need to know the 'Standard' Daily Yield, which isn't explicitly stored, but 'Standard HH' is.
          // Let's just compare if the user manually changed HH
          return null; 
      }
      
      if (type === 'material' && id && value !== undefined) {
          const std = currentTask.standardYields.materials?.find(m => m.materialId === id);
          if (!std) return { isNew: true };
          const diff = value - std.quantity;
          const percent = std.quantity > 0 ? (diff / std.quantity) * 100 : 0;
          return { diff, percent, isDifferent: Math.abs(percent) > 1 };
      }

      return null;
  };

  // --- HANDLERS ---

  const handleSave = async () => {
      if (!currentTask) return;
      setSaveStatus('saving');
      try {
          await updateTaskMaster(currentTask.id, {
              ...currentTask,
              laborCost: (localCrews.length > 0 || localLabor.length > 0) ? analysis.laborCost : currentTask.laborCost,
              materialsYield: localMaterials,
              equipmentYield: localTools,
              laborYield: localCrews,
              laborIndividualYield: localLabor
          });
          setSaveStatus('ok');
          setTimeout(() => { if (onClose) onClose(); }, 900);
      } catch (err) {
          console.error('[APUBuilder.handleSave]', err);
          setSaveStatus('error');
          setTimeout(() => setSaveStatus('idle'), 2500);
      }
  };

  // Save handler para el botón global — igual que handleSave pero sin onClose y con re-throw
  const saveForContext = useCallback(async () => {
      if (!currentTask) return;
      setSaveStatus('saving');
      try {
          await updateTaskMaster(currentTask.id, {
              ...currentTask,
              laborCost: (localCrews.length > 0 || localLabor.length > 0) ? analysis.laborCost : currentTask.laborCost,
              materialsYield: localMaterials,
              equipmentYield: localTools,
              laborYield: localCrews,
              laborIndividualYield: localLabor,
          });
          setSaveStatus('ok');
          setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (err) {
          setSaveStatus('error');
          setTimeout(() => setSaveStatus('idle'), 2500);
          throw err;
      }
  }, [currentTask, localMaterials, localTools, localCrews, localLabor, analysis.laborCost, updateTaskMaster]);

  useEffect(() => {
      if (currentTask) {
          registerSave(saveForContext);
      } else {
          unregisterSave();
      }
      return () => unregisterSave();
  }, [currentTask, saveForContext, registerSave, unregisterSave]);

  // Update Daily Yield based on Crew Size or HH change
  // Formula: DailyYield = (CrewHours) / HH_per_Unit
  const recalculateYield = (crewCount: number, hhPerUnit: number) => {
      const workday = project.workdayHours || 9;
      // Get total people in current crews
      let totalPeople = 0;
      localCrews.forEach(c => {
          const crew = crewsMap[c.crewId];
          if(crew) {
              const peopleInCrew = crew.composition.reduce((acc, curr) => acc + curr.count, 0);
              totalPeople += peopleInCrew * c.quantity;
          }
      });
      // Add individual labor
      localLabor.forEach(l => {
          totalPeople += l.quantity;
      });

      // Fallback if no crews
      if (totalPeople === 0) totalPeople = 1;

      const dailyCapacity = (totalPeople * workday) / hhPerUnit;
      setCurrentTask(prev => prev ? { ...prev, dailyYield: dailyCapacity, yieldHH: hhPerUnit } : null);
  };

  // --- RENDERERS ---

  if (!currentTask) return <div className="p-10 text-center">Cargando Ficha Técnica...</div>;

  return (
    <div className="flex flex-col h-full bg-slate-50 animate-in fade-in duration-300">
      
      {/* HEADER BAR */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shadow-sm">
        <div>
            <div className="flex items-center gap-2 text-blue-600 mb-1">
                <BookOpen size={18} />
                <span className="text-xs font-bold uppercase tracking-wider">Ficha Técnica de Ingeniería</span>
            </div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                {currentTask.name}
            </h2>
            <div className="flex gap-4 text-xs text-slate-500 mt-1">
                <span>Unidad: <strong className="text-slate-700">{currentTask.unit}</strong></span>
                <span>Categoría: <strong className="text-slate-700">{currentTask.category}</strong></span>
            </div>
        </div>
        
        <div className="flex items-center gap-3">
            <div className="bg-slate-100 px-4 py-2 rounded-lg border border-slate-200 text-right">
                <div className="text-[10px] uppercase font-bold text-slate-400">Costo Unitario</div>
                <div className="text-lg font-mono font-bold text-slate-800">${analysis.totalUnitCost.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
            </div>
            <button
                onClick={handleSave}
                disabled={saveStatus === 'saving' || saveStatus === 'ok'}
                className={`flex items-center gap-2 px-6 py-2 rounded-lg font-bold text-sm transition-colors shadow-md disabled:opacity-70 disabled:cursor-not-allowed ${
                    saveStatus === 'ok'      ? 'bg-green-500 text-white shadow-green-200 cursor-default' :
                    saveStatus === 'error'   ? 'bg-red-500 text-white shadow-red-200' :
                    saveStatus === 'saving'  ? 'bg-blue-400 text-white shadow-blue-200' :
                    'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200'
                }`}
            >
                <Save size={16} />
                {saveStatus === 'ok'     ? 'Guardado ✓' :
                 saveStatus === 'error'  ? 'Error al guardar' :
                 saveStatus === 'saving' ? 'Guardando...' :
                 'Guardar Ficha'}
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20} /></button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        
        {/* LEFT MENU (TABS) */}
        <div className="w-64 bg-white border-r border-slate-200 flex flex-col pt-4">
            <button 
                onClick={() => setActiveTab('general')}
                className={`flex items-center gap-3 px-6 py-4 text-sm font-bold border-l-4 transition-all ${activeTab === 'general' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
            >
                <Info size={18} /> General
            </button>
            <button 
                onClick={() => setActiveTab('materials')}
                className={`flex items-center gap-3 px-6 py-4 text-sm font-bold border-l-4 transition-all ${activeTab === 'materials' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
            >
                <Package size={18} /> Materiales
            </button>
            <button 
                onClick={() => setActiveTab('labor')}
                className={`flex items-start gap-3 px-6 py-4 text-sm font-bold border-l-4 transition-all ${activeTab === 'labor' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
            >
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-3"><Users size={18} /> Mano de Obra</div>
                    <span className="text-[10px] font-normal opacity-70 ml-8">Cuadrillas y Oficiales</span>
                </div>
            </button>
            <button 
                onClick={() => setActiveTab('relations')}
                className={`flex items-center gap-3 px-6 py-4 text-sm font-bold border-l-4 transition-all ${activeTab === 'relations' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
            >
                <ArrowRightLeft size={18} /> Relaciones
            </button>
        </div>

        {/* CENTER CONTENT */}
        <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50">
            
            {/* TAB: GENERAL */}
            {activeTab === 'general' && (
                <div className="max-w-3xl space-y-6 animate-in slide-in-from-bottom-2">
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <h3 className="text-lg font-bold text-slate-800 mb-4">Definición de Tarea</h3>
                        <div className="grid grid-cols-2 gap-6">
                            <div className="col-span-2">
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nombre</label>
                                <input 
                                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={currentTask.name}
                                    onChange={e => setCurrentTask({...currentTask, name: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Código</label>
                                <input 
                                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                                    value={currentTask.code || ''}
                                    onChange={e => setCurrentTask({...currentTask, code: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Unidad</label>
                                <input 
                                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                                    value={currentTask.unit}
                                    onChange={e => setCurrentTask({...currentTask, unit: e.target.value})}
                                />
                            </div>
                            <div className="col-span-2">
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Especificación Técnica</label>
                                <textarea 
                                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-24 resize-none"
                                    placeholder="Descripción del procedimiento constructivo..."
                                    value={currentTask.specifications || ''}
                                    onChange={e => setCurrentTask({...currentTask, specifications: e.target.value})}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB: MATERIALS */}
            {activeTab === 'materials' && (
                <div className="max-w-5xl space-y-6 animate-in slide-in-from-bottom-2">
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-slate-800">Consumo de Materiales</h3>
                            <div className="flex gap-2">
                                <select 
                                    className="text-sm border border-slate-300 rounded-lg p-2 w-64 bg-slate-50"
                                    value={selectedMaterialId}
                                    onChange={e => setSelectedMaterialId(e.target.value)}
                                >
                                    <option value="">+ Añadir Insumo...</option>
                                    {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                                <button 
                                    onClick={() => {
                                        if(!selectedMaterialId) return;
                                        setLocalMaterials([...localMaterials, { taskId: currentTask.id, materialId: selectedMaterialId, quantity: 1, wastePercent: 5, organizationId: project.organizationId }]);
                                        setSelectedMaterialId('');
                                    }} 
                                    className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700"
                                >
                                    <Plus size={20}/>
                                </button>
                            </div>
                        </div>

                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                                <tr>
                                    <th className="p-3 pl-4">Material</th>
                                    <th className="p-3 text-right w-32">Cant. Neta</th>
                                    <th className="p-3 text-right w-24">Desp. %</th>
                                    <th className="p-3 text-right">Costo Unit.</th>
                                    <th className="p-3 text-right">Subtotal</th>
                                    <th className="p-3 w-10"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {localMaterials.map(m => {
                                    const mat = materialsMap[m.materialId];
                                    const diff = getStandardDiff('material', m.materialId, m.quantity);
                                    const subtotal = (mat?.cost || 0) * m.quantity * (1 + (m.wastePercent||0)/100);
                                    
                                    return (
                                        <tr key={m.materialId} className="group hover:bg-slate-50">
                                            <td className="p-3 pl-4">
                                                <div className="font-bold text-slate-700">{mat?.name}</div>
                                                <div className="text-xs text-slate-400">{mat?.commercialFormat}</div>
                                                {diff?.isDifferent && (
                                                    <div className="text-[10px] text-orange-600 font-bold flex items-center gap-1 mt-1">
                                                        <AlertCircle size={10} />
                                                        Difiere de Chandías ({diff.percent > 0 ? '+' : ''}{diff.percent.toFixed(0)}%)
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-3 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <input 
                                                        type="number" 
                                                        className={`w-20 text-right p-1.5 border rounded font-bold ${diff?.isDifferent ? 'border-orange-300 text-orange-700 bg-orange-50' : 'border-slate-300'}`}
                                                        value={m.quantity}
                                                        onChange={e => {
                                                            const val = parseFloat(e.target.value) || 0;
                                                            setLocalMaterials(prev => prev.map(im => im.materialId === m.materialId ? { ...im, quantity: val } : im));
                                                        }}
                                                    />
                                                    <span className="text-xs text-slate-400 w-8">{mat?.unit}</span>
                                                </div>
                                            </td>
                                            <td className="p-3 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <input 
                                                        type="number" 
                                                        className="w-14 text-right p-1.5 border border-slate-300 rounded text-slate-600"
                                                        value={m.wastePercent || 0}
                                                        onChange={e => {
                                                            const val = parseFloat(e.target.value) || 0;
                                                            setLocalMaterials(prev => prev.map(im => im.materialId === m.materialId ? { ...im, wastePercent: val } : im));
                                                        }}
                                                    />
                                                    <span className="text-xs text-slate-400">%</span>
                                                </div>
                                            </td>
                                            <td className="p-3 text-right font-mono text-slate-500">
                                                ${mat?.cost.toFixed(2)}
                                            </td>
                                            <td className="p-3 text-right font-mono font-bold text-slate-800">
                                                ${subtotal.toFixed(2)}
                                            </td>
                                            <td className="p-3 text-center">
                                                <button 
                                                    onClick={() => setLocalMaterials(prev => prev.filter(im => im.materialId !== m.materialId))}
                                                    className="text-slate-300 hover:text-red-500 p-1"
                                                >
                                                    <Trash2 size={16}/>
                                                </button>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* TAB: LABOR */}
            {activeTab === 'labor' && (
                <div className="max-w-5xl space-y-6 animate-in slide-in-from-bottom-2">
                    
                    {/* Performance & Crew Size */}
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm grid grid-cols-2 gap-8">
                        <div>
                            <h4 className="text-xs font-bold text-slate-500 uppercase mb-4 flex items-center gap-2">
                                <Users size={16} /> Configuración de Cuadrilla
                            </h4>
                            
                            {localCrews.length === 0 && localLabor.length === 0 ? (
                                <div className="p-4 bg-orange-50 border border-orange-100 rounded-lg text-orange-800 text-sm mb-4">
                                    No hay cuadrilla ni oficiales asignados. Se usa rendimiento manual.
                                </div>
                            ) : (
                                <div className="space-y-4 mb-4">
                                    {/* Crews List */}
                                    {localCrews.map(c => {
                                        const crew = crewsMap[c.crewId];
                                        return (
                                            <div key={c.crewId} className="flex justify-between items-center bg-slate-50 p-3 rounded border border-slate-200">
                                                <div>
                                                    <div className="font-bold text-slate-700">{crew?.name}</div>
                                                    <div className="text-[10px] text-slate-400">Cuadrilla Predefinida</div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-slate-400">Cant:</span>
                                                    <input 
                                                        type="number"
                                                        className="w-12 text-center p-1 border border-slate-300 rounded font-bold"
                                                        value={c.quantity}
                                                        onChange={e => {
                                                            const val = parseFloat(e.target.value) || 1;
                                                            const newCrews = localCrews.map(lc => lc.crewId === c.crewId ? { ...lc, quantity: val } : lc);
                                                            setLocalCrews(newCrews);
                                                        }}
                                                    />
                                                    <button onClick={() => setLocalCrews(prev => prev.filter(x => x.crewId !== c.crewId))} className="text-slate-400 hover:text-red-500 ml-2"><Trash2 size={14}/></button>
                                                </div>
                                            </div>
                                        )
                                    })}

                                    {/* Individual Labor List */}
                                    {localLabor.map(l => {
                                        const cat = laborCategoriesMap[l.laborCategoryId];
                                        return (
                                            <div key={l.laborCategoryId} className="flex justify-between items-center bg-blue-50 p-3 rounded border border-blue-100">
                                                <div>
                                                    <div className="font-bold text-blue-800">{cat?.role}</div>
                                                    <div className="text-[10px] text-blue-400">Oficial Individual</div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-blue-400">Cant:</span>
                                                    <input 
                                                        type="number"
                                                        className="w-12 text-center p-1 border border-blue-200 rounded font-bold text-blue-700"
                                                        value={l.quantity}
                                                        onChange={e => {
                                                            const val = parseFloat(e.target.value) || 1;
                                                            setLocalLabor(prev => prev.map(il => il.laborCategoryId === l.laborCategoryId ? { ...il, quantity: val } : il));
                                                        }}
                                                    />
                                                    <button onClick={() => setLocalLabor(prev => prev.filter(x => x.laborCategoryId !== l.laborCategoryId))} className="text-blue-400 hover:text-red-500 ml-2"><Trash2 size={14}/></button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}

                            <div className="space-y-2">
                                <div className="flex gap-2">
                                    <select 
                                        className="flex-1 text-sm border border-slate-300 rounded-lg p-2 bg-white"
                                        value={selectedCrewId}
                                        onChange={e => setSelectedCrewId(e.target.value)}
                                    >
                                        <option value="">+ Asignar Cuadrilla...</option>
                                        {crews.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                    <button 
                                        onClick={() => {
                                            if(!selectedCrewId) return;
                                            setLocalCrews([...localCrews, { taskId: currentTask.id, crewId: selectedCrewId, quantity: 1 }]);
                                            setSelectedCrewId('');
                                        }}
                                        className="bg-slate-600 text-white p-2 rounded-lg hover:bg-slate-700"
                                    >
                                        <Plus size={20}/>
                                    </button>
                                </div>
                                
                                <div className="flex gap-2">
                                    <select 
                                        className="flex-1 text-sm border border-blue-200 rounded-lg p-2 bg-blue-50 text-blue-800"
                                        value={selectedLaborId}
                                        onChange={e => setSelectedLaborId(e.target.value)}
                                    >
                                        <option value="">+ Añadir Oficial Individual...</option>
                                        {laborCategories.map(c => <option key={c.id} value={c.id}>{c.role}</option>)}
                                    </select>
                                    <button 
                                        onClick={() => {
                                            if(!selectedLaborId) return;
                                            setLocalLabor([...localLabor, { taskId: currentTask.id, laborCategoryId: selectedLaborId, quantity: 1, organizationId: project.organizationId }]);
                                            setSelectedLaborId('');
                                        }}
                                        className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700"
                                    >
                                        <Plus size={20}/>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h4 className="text-xs font-bold text-slate-500 uppercase mb-4 flex items-center gap-2">
                                <RefreshCcw size={16} /> Rendimiento (Productividad)
                            </h4>
                            
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Horas Hombre / Unidad</label>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="number"
                                            className="flex-1 p-2 border border-slate-300 rounded font-bold text-lg text-slate-800"
                                            value={currentTask.yieldHH || 0}
                                            onChange={e => { const v = parseFloat(e.target.value); if (v > 0) recalculateYield(1, v); }}
                                        />
                                        <span className="text-sm font-bold text-slate-500">hh/{currentTask.unit}</span>
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-1">Estándar Chandías: {currentTask.standardYields?.labor?.[0]?.hhPerUnit || 'N/A'}</p>
                                </div>

                                <div className="pt-4 border-t border-slate-200">
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Producción Diaria (Estimada)</label>
                                    <div className="flex items-center gap-2">
                                        <span className="text-2xl font-black text-blue-600">{currentTask.dailyYield.toFixed(2)}</span>
                                        <span className="text-sm font-bold text-slate-500">{currentTask.unit}/día</span>
                                    </div>
                                    <p className="text-[10px] text-blue-400 mt-1">
                                        Impacta directamente en la duración del cronograma.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Tools */}
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-slate-800">Equipos y Herramientas</h3>
                            <div className="flex gap-2">
                                <select 
                                    className="text-sm border border-slate-300 rounded-lg p-2 w-64 bg-slate-50"
                                    value={selectedToolId}
                                    onChange={e => setSelectedToolId(e.target.value)}
                                >
                                    <option value="">+ Añadir Equipo...</option>
                                    {tools.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                                <button 
                                    onClick={() => {
                                        if(!selectedToolId) return;
                                        setLocalTools([...localTools, { taskId: currentTask.id, toolId: selectedToolId, hoursPerUnit: 1, organizationId: project.organizationId }]);
                                        setSelectedToolId('');
                                    }}
                                    className="bg-purple-600 text-white p-2 rounded-lg hover:bg-purple-700"
                                >
                                    <Plus size={20}/>
                                </button>
                            </div>
                        </div>
                        
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                                <tr>
                                    <th className="p-3 pl-4">Equipo</th>
                                    <th className="p-3 text-right">Hs / Unidad</th>
                                    <th className="p-3 text-right">Costo Hora</th>
                                    <th className="p-3 text-right">Subtotal</th>
                                    <th className="p-3 w-10"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {localTools.map(t => {
                                    const tool = toolsMap[t.toolId];
                                    return (
                                        <tr key={t.toolId} className="group hover:bg-slate-50">
                                            <td className="p-3 pl-4 font-bold text-slate-700">{tool?.name}</td>
                                            <td className="p-3 text-right">
                                                <input 
                                                    type="number"
                                                    className="w-16 text-right p-1 border border-slate-300 rounded"
                                                    value={t.hoursPerUnit}
                                                    onChange={e => setLocalTools(prev => prev.map(it => it.toolId === t.toolId ? { ...it, hoursPerUnit: parseFloat(e.target.value) || 0 } : it))}
                                                />
                                            </td>
                                            <td className="p-3 text-right font-mono text-slate-500">${tool?.costPerHour}</td>
                                            <td className="p-3 text-right font-mono font-bold text-slate-800">
                                                ${(tool?.costPerHour * t.hoursPerUnit).toFixed(2)}
                                            </td>
                                            <td className="p-3 text-center">
                                                <button 
                                                    onClick={() => setLocalTools(prev => prev.filter(it => it.toolId !== t.toolId))}
                                                    className="text-slate-300 hover:text-red-500 p-1"
                                                >
                                                    <Trash2 size={16}/>
                                                </button>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* TAB: RELATIONS */}
            {activeTab === 'relations' && (
                <div className="max-w-3xl space-y-6 animate-in slide-in-from-bottom-2">
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                        <h3 className="text-lg font-bold text-slate-800 mb-4">Relaciones y Dependencias</h3>
                        {budgetItemId ? (
                            <TaskRelations taskId={budgetItemId} />
                        ) : (
                            <div className="p-4 bg-orange-50 border border-orange-100 rounded-lg text-orange-800 text-sm flex items-center gap-2">
                                <AlertCircle size={16} />
                                <span>Las relaciones de precedencia solo se pueden editar desde la vista de Planificación (Gantt), ya que dependen del proyecto específico.</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

        </div>
      </div>
    </div>
  );
};
