import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useERP } from '../context/ERPContext';
import { calculateUnitPrice } from '../services/calculationService';
import {
  Upload, FileText, CheckCircle, AlertTriangle, RefreshCcw,
  Database, Wrench, Package, ListChecks, Plus, Trash2, Edit2, Save, X, Users, Clock, BarChart3, Tags, ClipboardCopy, ArrowRight, Calculator, FileSpreadsheet, Settings, Hammer, AlertCircle, HardHat, Info, Printer, PieChart as PieChartIcon, Activity,
  ZoomOut, ZoomIn, DollarSign, Percent, LayoutGrid, Truck, CheckSquare, Square, Check, Bot, Sparkles, TrendingUp, Search, Download, ShieldCheck, ChevronDown, ChevronRight, ArrowUp, ArrowDown, BookOpen, Globe, Ruler
} from 'lucide-react';
import { INITIAL_MATERIALS, INITIAL_TOOLS, INITIAL_LABOR_CATEGORIES } from '../constants';
import { generateId } from '../utils/generateId';
import { Material, Task, Tool, LaborCategory, TaskYield, Crew } from '../types';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { GoogleGenAI } from "@google/genai";
import { MasterMaterialsPanel } from './MasterMaterialsPanel';
import { MasterTasksPanel } from './MasterTasksPanel';
import { BudgetTemplatesPanel } from './BudgetTemplatesPanel';
import { UsersPanel } from './UsersPanel';
import { MaterialsCalculator } from './MaterialsCalculator';
import { CalcErrorBoundary } from './CalcErrorBoundary';
import { useAuth } from '../context/AuthContext';
import { seedDemoData, type SeedResult } from '../services/seedDemoData';
import { ReportsPanel } from '../src/features/reports/ReportsPanel';
import { GlobalResourcesPanel } from './GlobalResourcesPanel';
import { ChandiasCalculator } from '../src/features/material-calculator/ChandiasCalculator';
import { ParametricCalculator } from '../src/features/parametric-calculator/ParametricCalculator';

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const InfoTooltip = ({ text, formula }: { text: string, formula?: string }) => (
  <div className="group relative inline-block ml-1 align-middle">
    <Info size={14} className="text-slate-400 cursor-help" />
    <div className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-slate-800 text-white text-xs rounded p-2 z-50 shadow-lg transition-opacity duration-300 opacity-0 group-hover:opacity-100 delay-1000 pointer-events-none">
      <p className="font-bold mb-1 text-purple-300">Ayuda:</p>
      <p className="mb-2">{text}</p>
      {formula && (
        <div className="bg-slate-900 p-1.5 rounded border border-slate-700">
            <span className="text-[10px] text-slate-400 block mb-0.5">Fórmula:</span>
            <code className="font-mono text-[10px] text-green-400">{formula}</code>
        </div>
      )}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
    </div>
  </div>
);

export type DataAdminScope = 'labor' | 'catalog' | 'system';

const SCOPE_TABS: Record<DataAdminScope, string[]> = {
  labor: ['labor'],
  catalog: ['master-tasks', 'materials', 'master', 'resources', 'templates'],
  system: ['system'],
};

interface DataAdminProps {
  scope?: DataAdminScope;
  initialSubTab?: 'materials' | 'tasks' | 'tools' | 'labor' | 'rubros' | 'apu' | 'crews' | 'system' | 'master' | 'master-tasks' | 'templates' | 'calculator' | 'chandias' | 'computo' | 'reports' | 'resources';
}

export const DataAdmin: React.FC<DataAdminProps> = ({ initialSubTab, scope }) => {
  const show = (tab: string) => !scope || SCOPE_TABS[scope].includes(tab);
  const { user, activeOrganizationId } = useAuth();
  const organizationId = activeOrganizationId ?? user?.organizationId ?? '';
  const {
    materials, tasks, tools, laborCategories, rubros, rubroPresets, crews, project, yields, toolYields, 
    importData, resetData, updateProjectSettings,
    addMaterial, updateMaterial, removeMaterial,
    addTask, updateTask, removeTask,
    addTool, updateTool, removeTool,
    addLaborCategory, updateLaborCategory, removeLaborCategory,
    addCrew, updateCrew, removeCrew,
    addRubro, removeRubro,
    addTaskYield, removeTaskYield, addTaskToolYield, removeTaskToolYield,
    addTaskCrewYield, removeTaskCrewYield, addTaskLaborYield, removeTaskLaborYield,
    // Database Management
    exportDatabase, importDatabase,
    // Indexes
    yieldsIndex, materialsMap, toolYieldsIndex, toolsMap, laborCategoriesMap, taskCrewYieldsIndex, crewsMap, taskLaborYieldsIndex
  } = useERP();
  
  const [activeSubTab, setActiveSubTab] = useState<'materials' | 'tasks' | 'tools' | 'labor' | 'rubros' | 'apu' | 'crews' | 'system' | 'master' | 'master-tasks' | 'templates' | 'calculator' | 'chandias' | 'computo' | 'reports' | 'resources'>(initialSubTab ?? 'materials');
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  
  // Task Filtering & Sorting State
  const [taskFilterCategory, setTaskFilterCategory] = useState<string>('ALL');
  const [taskSortOrder, setTaskSortOrder] = useState<'asc' | 'desc'>('asc');

  // APU Filtering & Sorting State
  const [apuFilterCategory, setApuFilterCategory] = useState<string>('ALL');
  const [apuSortOrder, setApuSortOrder] = useState<'asc' | 'desc'>('asc');

  // Material Filtering & Sorting State
  const [materialFilterCategory, setMaterialFilterCategory] = useState<string>('ALL');
  const [materialSortOrder, setMaterialSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // Bulk Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedRubro, setExpandedRubro] = useState<string | null>(null);

  // State for APU Editor Panel
  const [editingAPUTask, setEditingAPUTask] = useState<Task | null>(null);
  const [localTask, setLocalTask] = useState<Task | null>(null); // Draft state for editing
  const [isNewTask, setIsNewTask] = useState(false); // Track if we are creating a fresh task

  const [resourceToAdd, setResourceToAdd] = useState<string>('');
  const [resourceType, setResourceType] = useState<'material' | 'tool' | 'crew' | 'labor'>('material');

  // State for Material Configuration Panel
  const [editingMaterialConfig, setEditingMaterialConfig] = useState<Material | null>(null);

  // State for Crew Editor Panel
  const [editingCrew, setEditingCrew] = useState<Crew | null>(null);
  const [crewMemberToAdd, setCrewMemberToAdd] = useState<string>('');
  const [crewMemberCount, setCrewMemberCount] = useState(1);

  // State for Report
  const [showReport, setShowReport] = useState(false);
  const [reportScale, setReportScale] = useState(1);
  const [reportConfig, setReportConfig] = useState({
      includeIntegrity: true,
      includeStats: true,
      includeCharts: true,
      includeFullList: false // Default off to save paper/view
  });
  
  // Smart Import State
  const [showSmartImport, setShowSmartImport] = useState(false);
  const [rawText, setRawText] = useState('');
  
  // AI Market Intelligence State
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiQuery, setAiQuery] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [aiProposedUpdates, setAiProposedUpdates] = useState<any[]>([]);
  const [aiExplanation, setAiExplanation] = useState('');

  const [seedLoading, setSeedLoading] = useState(false);
  const [seedResult, setSeedResult] = useState<SeedResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null); // For system restore

  // Draft states for forms
  const [draftMaterial, setDraftMaterial] = useState<Partial<Material>>({});
  const [draftTask, setDraftTask] = useState<Partial<Task>>({});
  const [draftTool, setDraftTool] = useState<Partial<Tool>>({});
  const [draftLabor, setDraftLabor] = useState<Partial<LaborCategory>>({});
  const [draftRubro, setDraftRubro] = useState<string>('');
  const [draftCrew, setDraftCrew] = useState<Partial<Crew>>({});

  // Reset selection when changing tabs
  useEffect(() => {
      setSelectedIds(new Set());
      setEditingId(null);
      setIsAdding(false);
  }, [activeSubTab]);

  // Sync localTask when editingAPUTask changes
  useEffect(() => {
      if (editingAPUTask && !isNewTask) {
          setLocalTask({ ...editingAPUTask });
      }
  }, [editingAPUTask]);

  // --- Helper: Get Current List ---
  const currentList = useMemo(() => {
      let list: any[] = [];
      if (activeSubTab === 'materials') list = materials;
      else if (activeSubTab === 'tasks' || activeSubTab === 'apu') list = tasks;
      else if (activeSubTab === 'tools') list = tools;
      else if (activeSubTab === 'labor') list = laborCategories;
      else if (activeSubTab === 'crews') list = crews;
      else if (activeSubTab === 'rubros') list = rubros;
      
      // Apply Task Filters & Sorting
      if (activeSubTab === 'tasks') {
          if (taskFilterCategory !== 'ALL') {
              list = list.filter((t: any) => t.category === taskFilterCategory);
          }
          
          // Create a copy to sort
          list = [...list].sort((a: any, b: any) => {
              const nameA = (a.name || '').toLowerCase();
              const nameB = (b.name || '').toLowerCase();
              if (nameA < nameB) return taskSortOrder === 'asc' ? -1 : 1;
              if (nameA > nameB) return taskSortOrder === 'asc' ? 1 : -1;
              return 0;
          });
      }

      // Apply APU Filters & Sorting
      if (activeSubTab === 'apu') {
          if (apuFilterCategory !== 'ALL') {
              list = list.filter((t: any) => t.category === apuFilterCategory);
          }
          
          // Create a copy to sort
          list = [...list].sort((a: any, b: any) => {
              const nameA = (a.name || '').toLowerCase();
              const nameB = (b.name || '').toLowerCase();
              if (nameA < nameB) return apuSortOrder === 'asc' ? -1 : 1;
              if (nameA > nameB) return apuSortOrder === 'asc' ? 1 : -1;
              return 0;
          });
      }

      // Apply Material Filters & Sorting
      if (activeSubTab === 'materials') {
          if (materialFilterCategory !== 'ALL') {
              list = list.filter((m: any) => m.category === materialFilterCategory);
          }
          
          // Create a copy to sort
          list = [...list].sort((a: any, b: any) => {
              const nameA = (a.name || '').toLowerCase();
              const nameB = (b.name || '').toLowerCase();
              if (nameA < nameB) return materialSortOrder === 'asc' ? -1 : 1;
              if (nameA > nameB) return materialSortOrder === 'asc' ? 1 : -1;
              return 0;
          });
      }
      
      return list;
  }, [activeSubTab, materials, tasks, tools, laborCategories, crews, rubros, taskFilterCategory, taskSortOrder, apuFilterCategory, apuSortOrder, materialFilterCategory, materialSortOrder]);

  // --- Bulk Actions ---
  const toggleSelectAll = () => {
      if (selectedIds.size === currentList.length && currentList.length > 0) {
          setSelectedIds(new Set());
      } else {
          const allIds = new Set(currentList.map((item: any) => activeSubTab === 'rubros' ? item : item.id));
          setSelectedIds(allIds);
      }
  };

  const toggleSelectRow = (id: string) => {
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedIds(newSet);
  };

  const handleBulkDelete = () => {
      if (selectedIds.size === 0) return;
      if (!window.confirm(`¿Está seguro de eliminar ${selectedIds.size} elementos seleccionados permanentemente?`)) return;

      selectedIds.forEach(id => {
          if (activeSubTab === 'materials') removeMaterial(id);
          else if (activeSubTab === 'tasks' || activeSubTab === 'apu') removeTask(id);
          else if (activeSubTab === 'tools') removeTool(id);
          else if (activeSubTab === 'labor') removeLaborCategory(id);
          else if (activeSubTab === 'crews') removeCrew(id);
          else if (activeSubTab === 'rubros') removeRubro(id);
      });
      setSelectedIds(new Set());
      setMessage({ type: 'success', text: 'Elementos eliminados correctamente.' });
  };

  // --- DATABASE BACKUP HANDLERS ---
  const handleBackupDownload = () => {
      const json = exportDatabase();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `obraflow_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: 'Copia de seguridad descargada exitosamente.' });
  };

  const handleBackupRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (event) => {
          if (event.target?.result) {
              const res = importDatabase(event.target.result as string);
              if (res.success) {
                  setMessage({ type: 'success', text: res.message });
              } else {
                  setMessage({ type: 'error', text: res.message });
              }
          }
      };
      reader.readAsText(file);
      e.target.value = ''; // Reset input
  };

  // --- Report Statistics (Enhanced for Audit) ---
  const reportStats = useMemo(() => {
      // 1. Integrity Check Lists
      const materialsZeroCostList = materials.filter(m => m.cost === 0);
      const tasksZeroYieldList = tasks.filter(t => t.dailyYield === 0);
      const tasksWithoutAPUList = tasks.filter(t => 
          (!yieldsIndex[t.id] || yieldsIndex[t.id].length === 0) && 
          (!toolYieldsIndex[t.id] || toolYieldsIndex[t.id].length === 0) && 
          (!taskCrewYieldsIndex[t.id] || taskCrewYieldsIndex[t.id].length === 0) &&
          t.laborCost === 0 // And no manual cost
      );
      
      // 2. Cost Analysis
      const topMaterials = [...materials].sort((a, b) => b.cost - a.cost).slice(0, 5);
      const avgLaborCost = laborCategories.reduce((acc, curr) => acc + curr.basicHourlyRate, 0) / (laborCategories.length || 1);
      
      // 3. Distribution
      const materialsByCategory = materials.reduce((acc, curr) => {
          const cat = curr.category || 'Otros';
          acc[cat] = (acc[cat] || 0) + 1;
          return acc;
      }, {} as Record<string, number>);
      
      const distributionData = Object.entries(materialsByCategory)
          .map(([name, value]) => ({ name, value }))
          .sort((a,b) => (b.value as number) - (a.value as number))
          .slice(0, 5);

      // 4. Labor Cost Chart Data
      const laborChartData = laborCategories.map(l => ({
          name: l.role,
          Costo: ((l.basicHourlyRate || 0) * (1 + ((l.socialChargesPercent || 0) + (l.insurancePercent || 0))/100))
      })).sort((a,b) => b.Costo - a.Costo);

      return {
          materialsZeroCostList,
          tasksZeroYieldList,
          tasksWithoutAPUList,
          topMaterials,
          avgLaborCost,
          distributionData,
          laborChartData,
          totalMaterials: materials.length,
          totalTasks: tasks.length
      };
  }, [materials, tasks, laborCategories, yieldsIndex, toolYieldsIndex, taskCrewYieldsIndex]);

  // --- AI MARKET INTELLIGENCE HANDLER ---
  const handleAskAI = async () => {
      if (!aiQuery.trim()) return;
      setIsAiThinking(true);
      setAiProposedUpdates([]);
      setAiExplanation('');

      try {
          // 1. Identificar materiales candidatos en base a la query
          const keywords = aiQuery.toLowerCase().split(' ').filter(k => k.length > 3);
          const candidates = materials.filter(m => 
              keywords.some(k => m.name.toLowerCase().includes(k)) || 
              m.name.toLowerCase().includes(aiQuery.toLowerCase())
          ).map(m => ({ id: m.id, name: m.name, currentPrice: m.cost, unit: m.unit }));

          if (candidates.length === 0) {
              setMessage({ type: 'error', text: 'No se encontraron materiales en tu base de datos que coincidan con la búsqueda.' });
              setIsAiThinking(false);
              return;
          }

          // 2. Configurar Google GenAI con Grounding
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          
          // 3. Prompt de Ingeniería + Búsqueda
          const prompt = `
            Actúa como el "Asistente de Inteligencia de Mercado" de Obraflow.
            
            OBJETIVO:
            Tu tarea es buscar precios de mercado actualizados en Argentina para los siguientes materiales de construcción.
            Prioriza buscar en 'mercadolibre.com.ar', 'cifras.com.ar', 'construar.com.ar' o sitios de corralones grandes.
            
            MATERIALES A CONSULTAR (Contexto interno):
            ${JSON.stringify(candidates)}
            
            CONSULTA DEL USUARIO: "${aiQuery}"
            
            REGLAS:
            1. Busca el precio actual de mercado (minorista promedio) para cada material.
            2. Si hay mucha volatilidad, aplica un margen de seguridad del 5% sobre el precio encontrado.
            3. RESPONDE UNICAMENTE CON UN BLOQUE JSON VALIDO. No incluyas texto antes ni después del bloque JSON.
            
            FORMATO JSON ESPERADO:
            {
              "explanation": "Resumen técnico del análisis de precios y fuentes consultadas.",
              "updates": [
                { 
                  "id": "ID_DEL_MATERIAL_ORIGINAL", 
                  "name": "Nombre", 
                  "current_price": 100, 
                  "new_price": 120, 
                  "source": "Nombre Fuente", 
                  "date": "YYYY-MM-DD" 
                }
              ]
            }
          `;

          const response = await ai.models.generateContent({
              model: "gemini-3-flash-preview",
              contents: prompt,
              config: {
                  tools: [{ googleSearch: {} }],
                  // NOTE: JSON Schema enforcement is disabled when using Search Tool to avoid API conflicts.
                  // We rely on the prompt to format the output as JSON.
              }
          });

          if (response.text) {
              let jsonStr = response.text;
              // Simple cleanup for potential markdown fencing
              jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
              
              const data = JSON.parse(jsonStr);
              setAiExplanation(data.explanation || "Análisis completado.");
              // Mapear updates para asegurar formato correcto
              const updates = (data.updates || []).map((u: any) => ({
                  ...u,
                  current_price: candidates.find(c => c.id === u.id)?.currentPrice || 0
              }));
              setAiProposedUpdates(updates);
          }

      } catch (error: any) {
          console.error("AI Error:", error);
          let errorMsg = 'Error al consultar el servicio de Inteligencia de Mercado.';
          if (error.message?.includes('404') || error.message?.includes('NOT_FOUND')) {
              errorMsg = 'El modelo de IA solicitado no está disponible o la configuración de la API es incorrecta.';
          } else if (error.message?.includes('JSON')) {
              errorMsg = 'Error al procesar la respuesta de la IA (Formato inválido).';
          }
          setMessage({ type: 'error', text: errorMsg });
      } finally {
          setIsAiThinking(false);
      }
  };

  const applyAiUpdates = () => {
      let count = 0;
      aiProposedUpdates.forEach(u => {
          updateMaterial(u.id, { cost: u.new_price });
          count++;
      });
      setMessage({ type: 'success', text: `Se actualizaron ${count} precios mediante Inteligencia de Mercado.` });
      setShowAIModal(false);
      setAiProposedUpdates([]);
      setAiQuery('');
  };

  // --- APU Editor Helpers ---
  const apuAnalysis = useMemo(() => {
    if (!localTask) return null;
    return calculateUnitPrice(localTask, yieldsIndex, materialsMap, toolYieldsIndex, toolsMap, taskCrewYieldsIndex, crewsMap, laborCategoriesMap, 9, taskLaborYieldsIndex);
  }, [localTask, yieldsIndex, materialsMap, toolYieldsIndex, toolsMap, taskCrewYieldsIndex, crewsMap, laborCategoriesMap]);

  const currentAPUMaterials = useMemo(() => {
    if (!localTask) return [];
    return (yieldsIndex[localTask.id] || []).map(y => ({
      ...y,
      data: materialsMap[y.materialId]
    }));
  }, [localTask, yieldsIndex, materialsMap]);

  const currentAPUTools = useMemo(() => {
    if (!localTask) return [];
    return (toolYieldsIndex[localTask.id] || []).map(y => ({
      ...y,
      data: toolsMap[y.toolId]
    }));
  }, [localTask, toolYieldsIndex, toolsMap]);

  const currentAPUCrew = useMemo(() => {
      if (!localTask) return null;
      const crewYield = taskCrewYieldsIndex[localTask.id]?.[0]; 
      return crewYield ? { ...crewYield, data: crewsMap[crewYield.crewId] } : null;
  }, [localTask, taskCrewYieldsIndex, crewsMap]);

  const currentAPULabor = useMemo(() => {
    if (!localTask) return [];
    return (taskLaborYieldsIndex[localTask.id] || []).map(y => ({
      ...y,
      data: laborCategoriesMap[y.laborCategoryId]
    }));
  }, [localTask, taskLaborYieldsIndex, laborCategoriesMap]);

  const handleAddResourceToAPU = () => {
    if (!localTask || !resourceToAdd) return;
    if (resourceType === 'material') {
        addTaskYield({ taskId: localTask.id, materialId: resourceToAdd, quantity: 1, wastePercent: 0 });
    } else if (resourceType === 'tool') {
        addTaskToolYield({ taskId: localTask.id, toolId: resourceToAdd, hoursPerUnit: 1 });
    } else if (resourceType === 'crew') {
        if (currentAPUCrew) {
            removeTaskCrewYield(localTask.id, currentAPUCrew.crewId);
        }
        addTaskCrewYield({ taskId: localTask.id, crewId: resourceToAdd, quantity: 1 });
    } else if (resourceType === 'labor') {
        addTaskLaborYield({ taskId: localTask.id, laborCategoryId: resourceToAdd, quantity: 1 });
    }
    setResourceToAdd('');
  };
  
  // --- Create Task Flow ---
  const handleCreateTask = () => {
      const newId = generateId();
      const newTask: Task = {
          id: newId,
          organizationId: 'org_a',
          name: 'Nueva Tarea',
          unit: 'gl',
          laborCost: 0,
          dailyYield: 1,
          category: rubros[0] || 'GENERAL',
          fixedCost: 0,
          fixedCostDescription: ''
      };
      addTask(newTask); 
      setEditingAPUTask(newTask);
      setLocalTask({ ...newTask }); 
      setIsNewTask(true);
  };

  const handleCreateTaskFromPreset = (preset: Partial<Task>) => {
      const newId = generateId();
      const newTask: Task = {
          id: newId,
          organizationId: 'org_a',
          name: preset.name || 'Nueva Tarea',
          unit: preset.unit || 'gl',
          laborCost: preset.laborCost || 0,
          dailyYield: preset.dailyYield || 1,
          yieldHH: preset.yieldHH || 0,
          category: preset.category || rubros[0] || 'GENERAL',
          fixedCost: 0,
          fixedCostDescription: '',
          description: preset.description || ''
      };
      
      addTask(newTask);
      
      // Switch to tasks tab and open editor
      setActiveSubTab('tasks');
      setEditingAPUTask(newTask);
      setLocalTask({...newTask});
      setIsNewTask(true);
      setMessage({ type: 'success', text: 'Tarea creada desde plantilla. Puede editarla ahora.' });
  };

  const handleSaveTaskChanges = () => {
      if (localTask) {
          updateTask(localTask.id, localTask);
          setEditingAPUTask(null);
          setLocalTask(null);
          setIsNewTask(false);
          setMessage({ type: 'success', text: 'Tarea guardada correctamente.' });
      }
  };

  const handleCancelTaskChanges = () => {
      if (isNewTask && localTask) {
          removeTask(localTask.id);
      }
      setEditingAPUTask(null);
      setLocalTask(null);
      setIsNewTask(false);
  };

  // --- Global Save Action (Simulation) ---
  const handleGlobalSave = () => {
      // Since usePersistentState saves automatically on change, this button acts as a confirmation/trigger
      // In a real API scenario, this would trigger a batch POST/PUT
      setMessage({ type: 'success', text: 'Todos los cambios en la Base de Datos Maestra han sido guardados.' });
  };

  // --- Crew Editor Helpers ---
  const handleAddMemberToCrew = () => {
      if(!editingCrew || !crewMemberToAdd || crewMemberCount < 1) return;
      const newComposition = [...editingCrew.composition];
      const existingIdx = newComposition.findIndex(c => c.laborCategoryId === crewMemberToAdd);
      
      if(existingIdx >= 0) {
          newComposition[existingIdx].count += crewMemberCount;
      } else {
          newComposition.push({ laborCategoryId: crewMemberToAdd, count: crewMemberCount, participation: 100 });
      }
      
      const updatedCrew = { ...editingCrew, composition: newComposition };
      setEditingCrew(updatedCrew);
      updateCrew(editingCrew.id, { composition: newComposition });
      setCrewMemberToAdd('');
      setCrewMemberCount(1);
  };

  const updateMemberInCrew = (laborId: string, field: 'count' | 'participation', value: number) => {
      if(!editingCrew) return;
      const newComposition = editingCrew.composition.map(c => {
          if (c.laborCategoryId === laborId) {
              return { ...c, [field]: value };
          }
          return c;
      });
      const updatedCrew = { ...editingCrew, composition: newComposition };
      setEditingCrew(updatedCrew);
      updateCrew(editingCrew.id, { composition: newComposition });
  };

  const removeMemberFromCrew = (laborId: string) => {
      if(!editingCrew) return;
      const newComposition = editingCrew.composition.filter(c => c.laborCategoryId !== laborId);
      const updatedCrew = { ...editingCrew, composition: newComposition };
      setEditingCrew(updatedCrew);
      updateCrew(editingCrew.id, { composition: newComposition });
  };

  const calculateCrewHourlyCost = (crew: Crew) => {
      return crew.composition.reduce((acc, member) => {
          const cat = laborCategoriesMap[member.laborCategoryId];
          if(cat) {
              const hourly = (cat.basicHourlyRate || 0) * (1 + ((cat.socialChargesPercent || 0) + (cat.insurancePercent || 0))/100);
              return acc + (hourly * member.count * ((member.participation ?? 100) / 100));
          }
          return acc;
      }, 0);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        const result = importData(activeSubTab as any, event.target.result as string);
        if (result.success) setMessage({ type: 'success', text: result.message });
        else setMessage({ type: 'error', text: result.message });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const triggerUpload = () => fileInputRef.current?.click();

  const handleDownloadTemplate = () => {
    let data: any = [];
    if (activeSubTab === 'materials') data = INITIAL_MATERIALS;
    if (activeSubTab === 'tools') data = INITIAL_TOOLS;
    if (activeSubTab === 'tasks') data = [{ id: "new_task", name: "Ejemplo", unit: "m2", laborCost: 10, dailyYield: 10, category: "06 MAMPOSTERÍA" }];
    if (activeSubTab === 'labor') data = INITIAL_LABOR_CATEGORIES;
    if (activeSubTab === 'rubros') data = rubros;
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `template_${activeSubTab}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const startEdit = (item: any) => {
    setIsAdding(false);
    setEditingId(item.id);
    if (activeSubTab === 'materials') setDraftMaterial(item);
    if (activeSubTab === 'tasks') setDraftTask(item);
    if (activeSubTab === 'tools') setDraftTool(item);
    if (activeSubTab === 'labor') setDraftLabor(item);
    if (activeSubTab === 'crews') setDraftCrew(item);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsAdding(false);
    setDraftMaterial({});
    setDraftTask({});
    setDraftTool({});
    setDraftLabor({});
    setDraftCrew({});
    setDraftRubro('');
  };

  const saveItem = () => {
    if (activeSubTab === 'materials' && draftMaterial) {
      if (isAdding) addMaterial({ ...draftMaterial, id: generateId() } as Material);
      else if (editingId) updateMaterial(editingId, draftMaterial);
    } else if (activeSubTab === 'tasks' && draftTask) {
      if (isAdding) addTask({ ...draftTask, id: generateId() } as Task);
      else if (editingId) updateTask(editingId, draftTask);
    } else if (activeSubTab === 'tools' && draftTool) {
      if (isAdding) addTool({ ...draftTool, id: generateId() } as Tool);
      else if (editingId) updateTool(editingId, draftTool);
    } else if (activeSubTab === 'labor' && draftLabor) {
      if (isAdding) addLaborCategory({ ...draftLabor, id: generateId() } as LaborCategory);
      else if (editingId) updateLaborCategory(editingId, draftLabor);
    } else if (activeSubTab === 'crews' && draftCrew) {
      if (isAdding) addCrew({ ...draftCrew, id: generateId(), composition: [] } as Crew);
      else if (editingId) updateCrew(editingId, draftCrew);
    } else if (activeSubTab === 'rubros' && draftRubro) {
        addRubro(draftRubro.toUpperCase());
    }
    cancelEdit();
  };

  const deleteItem = (id: string) => {
    if (!window.confirm('¿Eliminar este registro permanentemente?')) return;
    if (activeSubTab === 'materials') removeMaterial(id);
    if (activeSubTab === 'tasks') removeTask(id);
    if (activeSubTab === 'tools') removeTool(id);
    if (activeSubTab === 'labor') removeLaborCategory(id);
    if (activeSubTab === 'crews') removeCrew(id);
    if (activeSubTab === 'rubros') removeRubro(id);
  };

  const calculateTotalLabor = (base: number, social: number, insurance: number) => {
    const b = base || 0;
    const s = social || 0;
    const i = insurance || 0;
    return b * (1 + (s + i) / 100);
  };

  // --- SMART IMPORT LOGIC ---
  const handleProcessSmartImport = () => {
      const rows = rawText.split(/\r?\n/).filter(r => r.trim() !== '');
      let count = 0;

      rows.forEach(row => {
          const cols = row.split('\t');
          // Basic validation
          if (cols.length < 2) return;

          const name = cols[0].trim();
          
          if (activeSubTab === 'materials') {
              // Format: Name | Unit | Cost | Category
              const unit = cols[1]?.trim() || 'u';
              const cost = parseFloat(cols[2]?.replace(/[$,]/g, '').replace(',', '.') || '0');
              const category = cols[3]?.trim() || 'General';
              
              if (!materials.some(m => m.name === name)) {
                  addMaterial({ id: generateId(), organizationId: 'org_a', name, unit, cost, category });
                  count++;
              }
          } else if (activeSubTab === 'tasks' || activeSubTab === 'apu') {
              // Format: Name | Unit | Category | Labor Cost | Yield
              const unit = cols[1]?.trim() || 'u';
              const category = cols[2]?.trim() || 'General';
              const laborCost = parseFloat(cols[3]?.replace(/[$,]/g, '').replace(',', '.') || '0');
              const dailyYield = parseFloat(cols[4]?.replace(',', '.') || '1');

              if (!tasks.some(t => t.name === name)) {
                  addTask({ id: generateId(), organizationId: 'org_a', name, unit, category, laborCost, dailyYield });
                  count++;
              }
          } else if (activeSubTab === 'tools') {
              // Format: Name | Category | Cost/Hour
              const category = cols[1]?.trim() || 'General';
              const costPerHour = parseFloat(cols[2]?.replace(/[$,]/g, '').replace(',', '.') || '0');
              
              if (!tools.some(t => t.name === name)) {
                  addTool({ id: generateId(), organizationId: 'org_a', name, category, costPerHour });
                  count++;
              }
          } else if (activeSubTab === 'labor') {
              // Format: Role | Cost/Hour | Charges% | Insurance%
              const basicHourlyRate = parseFloat(cols[1]?.replace(/[$,]/g, '').replace(',', '.') || '0');
              const socialChargesPercent = parseFloat(cols[2]?.replace('%', '') || '0');
              const insurancePercent = parseFloat(cols[3]?.replace('%', '') || '0');

              if (!laborCategories.some(l => l.role === name)) {
                  addLaborCategory({ id: generateId(), organizationId: 'org_a', role: name, basicHourlyRate, socialChargesPercent, insurancePercent });
                  count++;
              }
          } else if (activeSubTab === 'rubros') {
              // Format: Name
              if (!rubros.includes(name)) {
                  addRubro(name);
                  count++;
              }
          }
      });

      setMessage({ type: 'success', text: `Se importaron ${count} registros nuevos.` });
      setShowSmartImport(false);
      setRawText('');
  };

  const getImportInstructions = () => {
      switch(activeSubTab) {
          case 'materials': return 'Nombre | Unidad | Costo Unit. | Categoría';
          case 'tasks': 
          case 'apu': return 'Nombre | Unidad | Categoría | Costo M.O. | Rendimiento';
          case 'tools': return 'Nombre | Categoría | Costo Hora';
          case 'labor': return 'Rol | Valor Hora Básico | % Cargas Sociales | % Seguros';
          case 'rubros': return 'Nombre del Rubro';
          default: return 'No disponible';
      }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative flex gap-4">
      
      {/* CSS Injection for Report Printing */}
      <style>{`
        @media print {
          @page { margin: 0.5cm; size: A4; }
          body > *:not(#report-portal) { display: none !important; }
          #report-portal { display: block !important; position: absolute; top: 0; left: 0; width: 100%; z-index: 9999; }
          #report-content { width: 100% !important; transform: none !important; box-shadow: none !important; border: none !important; margin: 0 !important; }
          .no-print { display: none !important; }
          .break-inside-avoid { break-inside: avoid; }
        }
      `}</style>

      <div className="flex-1 space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Database className="text-blue-600" /> {scope === 'labor' ? 'Personal y cuadrillas' : scope === 'catalog' ? 'Catálogo maestro' : scope === 'system' ? 'Sistema' : 'Base de Datos Maestra'}
          </h2>
          <p className="text-sm text-slate-500">{scope === 'labor' ? 'Oficios, jornales y cuadrillas de la empresa. Todas las obras toman la mano de obra de acá.' : scope === 'catalog' ? 'Análisis de precios, insumos, equipos, materiales y plantillas que alimentan sus presupuestos.' : scope === 'system' ? 'Respaldos, importación y datos del sistema.' : 'Gestione los insumos, tareas, equipos y cuadrillas que alimentan sus presupuestos.'}</p>
        </div>
        <div className="flex gap-2 items-center">
          {/* Global Save Button */}
          <button 
            onClick={handleGlobalSave}
            className="flex items-center gap-2 px-4 py-2 bg-blue-900 hover:bg-black text-white rounded-lg text-sm font-bold transition-all shadow-md mr-2"
            title="Confirmar y guardar todos los cambios en la base de datos"
          >
            <Save size={16} /> Guardar Cambios
          </button>

          {/* New Bulk Delete Action */}
          {selectedIds.size > 0 && (
              <button 
                onClick={handleBulkDelete}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold transition-colors shadow-sm animate-in fade-in mr-2"
              >
                <Trash2 size={16} /> Eliminar ({selectedIds.size})
              </button>
          )}

          {/* AI Button */}
          {activeSubTab === 'materials' && (
              <button 
                onClick={() => setShowAIModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-lg text-sm font-bold transition-all shadow-md mr-2"
                title="Actualizar precios con Inteligencia Artificial"
              >
                <Sparkles size={16} /> IA Precios
              </button>
          )}

          {/* New Report Button */}
          <button 
            onClick={() => setShowReport(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            <BarChart3 size={16} /> Auditoría BD
          </button>

          <button 
            onClick={() => { setShowSmartImport(true); setRawText(''); }}
            disabled={activeSubTab === 'crews' || activeSubTab === 'system'}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm shadow-emerald-200 disabled:opacity-50"
          >
            <FileSpreadsheet size={16} /> Importar Excel
          </button>
          <button 
            onClick={triggerUpload}
            disabled={activeSubTab === 'apu' || activeSubTab === 'rubros' || activeSubTab === 'crews' || activeSubTab === 'system'}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Upload size={16} /> JSON
          </button>
          <button 
            onClick={handleDownloadTemplate}
            disabled={activeSubTab === 'system'}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg transition-colors disabled:opacity-50"
            title="Descargar Plantilla JSON"
          >
            <FileText size={18} />
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg flex items-center justify-between gap-2 animate-in slide-in-from-top ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          <div className="flex items-center gap-2">
            {message.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
            <span className="text-sm font-medium">{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)}><X size={16} /></button>
        </div>
      )}

      {/* Tabs */}
      {(!scope || scope === 'catalog') && (
      <div className="flex flex-wrap gap-2 bg-white p-2 rounded-xl shadow-sm border border-slate-100">
        {show('materials') && (
        <button
          onClick={() => { setActiveSubTab('materials'); cancelEdit(); setEditingAPUTask(null); setEditingCrew(null); setEditingMaterialConfig(null); }}
          className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition-all ${activeSubTab === 'materials' || activeSubTab === 'tools' ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <Package size={18} /> Recursos
        </button>
        )}
        {show('master') && (
        <button
          onClick={() => { setActiveSubTab('master'); cancelEdit(); setEditingAPUTask(null); setEditingCrew(null); setEditingMaterialConfig(null); }}
          className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition-all ${activeSubTab === 'master' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <Database size={18} /> Materiales de Empresa
        </button>
        )}
        {show('labor') && (
        <button
          onClick={() => { setActiveSubTab('labor'); cancelEdit(); setEditingAPUTask(null); setEditingCrew(null); setEditingMaterialConfig(null); }}
          className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition-all ${activeSubTab === 'labor' || activeSubTab === 'crews' ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <Users size={18} /> Mano de Obra
        </button>
        )}
        {show('master-tasks') && (
        <button
          onClick={() => { setActiveSubTab('master-tasks'); cancelEdit(); setEditingAPUTask(null); setEditingCrew(null); setEditingMaterialConfig(null); }}
          className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition-all ${activeSubTab === 'master-tasks' ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <BookOpen size={18} /> Analisis de Precios (APU)
        </button>
        )}
        {show('resources') && (
        <button
          onClick={() => { setActiveSubTab('resources'); cancelEdit(); setEditingAPUTask(null); setEditingCrew(null); setEditingMaterialConfig(null); }}
          className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition-all ${activeSubTab === 'resources' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <Globe size={18} /> Recursos Globales
        </button>
        )}
        {show('templates') && (
        <button
          onClick={() => { setActiveSubTab('templates'); cancelEdit(); setEditingAPUTask(null); setEditingCrew(null); setEditingMaterialConfig(null); }}
          className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition-all ${activeSubTab === 'templates' ? 'bg-violet-600 text-white shadow-md shadow-violet-200' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <LayoutGrid size={18} /> Plantillas
        </button>
        )}
        {show('computo') && (
        <button
          onClick={() => { setActiveSubTab('computo'); cancelEdit(); setEditingAPUTask(null); setEditingCrew(null); setEditingMaterialConfig(null); }}
          className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition-all ${activeSubTab === 'computo' || activeSubTab === 'calculator' || activeSubTab === 'chandias' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <Ruler size={18} /> Cómputo
        </button>
        )}
        {show('reports') && (
        <button
          onClick={() => { setActiveSubTab('reports'); cancelEdit(); setEditingAPUTask(null); setEditingCrew(null); setEditingMaterialConfig(null); }}
          className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition-all ${activeSubTab === 'reports' ? 'bg-blue-700 text-white shadow-md shadow-blue-200' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <BarChart3 size={18} /> Reportes
        </button>
        )}
        {show('system') && (
        <button
          onClick={() => { setActiveSubTab('system'); cancelEdit(); setEditingAPUTask(null); setEditingCrew(null); setEditingMaterialConfig(null); }}
          className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold transition-all ${activeSubTab === 'system' ? 'bg-slate-800 text-white shadow-md shadow-slate-200' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <ShieldCheck size={18} /> Sistema
        </button>
        )}
      </div>
      )}
      <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileUpload} />
      
      {/* SYSTEM TAB */}
      {activeSubTab === 'system' && (
          <div className="space-y-6 animate-in fade-in">

          {/* Usuarios y Permisos */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden p-8">
              <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                  <Users className="text-slate-600" size={20} /> Usuarios y Permisos
              </h3>
              <UsersPanel />
          </div>

          {/* Datos de Prueba */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden p-8">
              <h3 className="text-xl font-bold text-slate-800 mb-2 flex items-center gap-2">
                  <Database className="text-emerald-600" size={20} /> Datos de Prueba
              </h3>
              <p className="text-sm text-slate-500 mb-6">
                  Carga un set de materiales, herramientas, categorías de MO y APU de demo para poder probar presupuesto,
                  planificación y mediciones desde una obra nueva. La operación es idempotente: omite registros que ya
                  existan con el mismo nombre.
              </p>

              <div className="flex items-center gap-4 flex-wrap">
                  <button
                      onClick={async () => {
                          const orgId = user?.organizationId;
                          if (!orgId) { alert('No hay organización activa.'); return; }
                          setSeedLoading(true);
                          setSeedResult(null);
                          try {
                              const r = await seedDemoData(orgId);
                              setSeedResult(r);
                          } catch (e) {
                              setSeedResult({ materials: { created: 0, skipped: 0 }, tools: { created: 0, skipped: 0 }, laborCategories: { created: 0, skipped: 0 }, masterTasks: { created: 0, skipped: 0 }, errors: [(e as Error).message] });
                          } finally {
                              setSeedLoading(false);
                          }
                      }}
                      disabled={seedLoading}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg shadow transition-colors flex items-center gap-2"
                  >
                      {seedLoading ? <RefreshCcw size={16} className="animate-spin" /> : <Sparkles size={16} />}
                      {seedLoading ? 'Cargando…' : 'Cargar datos de prueba'}
                  </button>
                  {seedResult && (
                      <button onClick={() => setSeedResult(null)} className="text-xs text-slate-400 hover:text-slate-600">
                          Limpiar
                      </button>
                  )}
              </div>

              {seedResult && (
                  <div className={`mt-4 p-4 rounded-lg border text-sm ${seedResult.errors.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                      <p className="font-semibold text-slate-700 mb-2">
                          {seedResult.errors.length === 0 ? '✓ Carga completada' : '⚠ Carga con advertencias'}
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-600">
                          <span>Materiales: <strong className="text-emerald-700">{seedResult.materials.created} creados</strong> / {seedResult.materials.skipped} omitidos</span>
                          <span>Herramientas: <strong className="text-emerald-700">{seedResult.tools.created} creadas</strong> / {seedResult.tools.skipped} omitidas</span>
                          <span>Cat. MO: <strong className="text-emerald-700">{seedResult.laborCategories.created} creadas</strong> / {seedResult.laborCategories.skipped} omitidas</span>
                          <span>APU: <strong className="text-emerald-700">{seedResult.masterTasks.created} creadas</strong> / {seedResult.masterTasks.skipped} omitidas</span>
                      </div>
                      {seedResult.errors.length > 0 && (
                          <ul className="mt-2 space-y-0.5 text-amber-700 text-xs">
                              {seedResult.errors.map((e, i) => <li key={i}>• {e}</li>)}
                          </ul>
                      )}
                  </div>
              )}
          </div>

          {/* Respaldo y Recuperación */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden min-h-[200px] p-8">
              <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                  <ShieldCheck className="text-slate-600" /> Respaldo y Recuperación del Sistema
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-6">
                      <div className="flex items-start gap-4">
                          <div className="p-3 bg-blue-100 rounded-lg text-blue-600">
                              <Download size={24} />
                          </div>
                          <div>
                              <h4 className="font-bold text-blue-900 text-lg">Descargar Copia de Seguridad</h4>
                              <p className="text-sm text-slate-600 mt-2 mb-4">
                                  Genere un archivo JSON completo con toda la base de datos maestra, proyectos, plantillas y configuraciones. Ideal para transferir datos a otro equipo o guardar un punto de restauración.
                              </p>
                              <button 
                                onClick={handleBackupDownload}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-bold shadow-lg transition-all flex items-center gap-2"
                              >
                                  <Download size={18} /> Descargar Backup Completo
                              </button>
                          </div>
                      </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-6">
                      <div className="flex items-start gap-4">
                          <div className="p-3 bg-amber-100 rounded-lg text-amber-600">
                              <Upload size={24} />
                          </div>
                          <div>
                              <h4 className="font-bold text-amber-900 text-lg">Restaurar Sistema</h4>
                              <p className="text-sm text-slate-600 mt-2 mb-4">
                                  Cargue un archivo de respaldo previamente descargado. 
                                  <strong className="text-red-600 block mt-1">⚠️ ADVERTENCIA: Esta acción reemplazará TODOS los datos actuales.</strong>
                              </p>
                              <input 
                                  type="file" 
                                  ref={backupInputRef} 
                                  className="hidden" 
                                  accept=".json" 
                                  onChange={handleBackupRestore} 
                              />
                              <button 
                                onClick={() => backupInputRef.current?.click()}
                                className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-3 rounded-lg font-bold shadow-lg transition-all flex items-center gap-2"
                              >
                                  <Upload size={18} /> Cargar Respaldo
                              </button>
                          </div>
                      </div>
                  </div>
              </div>

              <div className="mt-12 pt-8 border-t border-slate-200">
                  <h4 className="text-sm font-bold text-red-600 uppercase mb-4 flex items-center gap-2">
                      <AlertTriangle size={16} /> Zona de Peligro
                  </h4>
                  <div className="flex items-center justify-between bg-red-50 border border-red-100 p-4 rounded-lg">
                      <div className="text-sm text-slate-700">
                          <strong>Restablecimiento de Fábrica:</strong> Borra todos los datos y restaura los valores iniciales de demostración.
                      </div>
                      <button 
                          onClick={() => {
                              if(confirm('¿Está seguro de restablecer el sistema a valores de fábrica? Se perderán todos los cambios.')) {
                                  resetData();
                                  setMessage({ type: 'success', text: 'Sistema restablecido correctamente.' });
                              }
                          }}
                          className="px-4 py-2 border border-red-300 text-red-600 hover:bg-red-100 rounded font-bold text-sm transition-colors"
                      >
                          Resetear Todo
                      </button>
                  </div>
              </div>
          </div>
          </div>
      )}

      {/* Materiales de Empresa */}
      {activeSubTab === 'master' && (
        <MasterMaterialsPanel onNavigateToResources={() => setActiveSubTab('resources')} />
      )}

      {/* APU Maestro — Base Maestra de Tareas (localStorage) */}
      {activeSubTab === 'master-tasks' && <MasterTasksPanel />}

      {/* Catálogo Global de Recursos */}
      {activeSubTab === 'resources' && <GlobalResourcesPanel />}

      {/* Plantillas de Presupuesto */}
      {activeSubTab === 'templates' && <BudgetTemplatesPanel />}

      {/* Calculadora de Materiales */}
      {activeSubTab === 'calculator' && organizationId && (
        <CalcErrorBoundary>
          <MaterialsCalculator organizationId={organizationId} />
        </CalcErrorBoundary>
      )}

      {/* Reportes de Ingeniería */}
      {activeSubTab === 'reports' && <ReportsPanel />}

      {/* Calculadora Chandías (legacy — mantenido para backward compat) */}
      {activeSubTab === 'chandias' && <ChandiasCalculator />}

      {/* Cómputo Paramétrico — módulo unificado */}
      {activeSubTab === 'computo' && organizationId && (
        <ParametricCalculator organizationId={organizationId} />
      )}

      {/* Main Table Content (Only for data tabs) */}
      {activeSubTab !== 'system' && activeSubTab !== 'master' && activeSubTab !== 'master-tasks' && activeSubTab !== 'templates' && activeSubTab !== 'calculator' && activeSubTab !== 'chandias' && activeSubTab !== 'computo' && activeSubTab !== 'reports' && activeSubTab !== 'resources' && (
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden min-h-[400px]">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
            {activeSubTab === 'materials' && `Catálogo de Materiales (${materials.length})`}
            {activeSubTab === 'tasks' && `Listado de Tareas (${tasks.length})`}
            {activeSubTab === 'apu' && `Análisis de Precios Unitarios (${tasks.length})`}
            {activeSubTab === 'tools' && `Equipos Disponibles (${tools.length})`}
            {activeSubTab === 'labor' && `Categorías de Operarios (${laborCategories.length})`}
            {activeSubTab === 'crews' && `Configuración de Cuadrillas (${crews.length})`}
            {activeSubTab === 'rubros' && `Rubros Configurados (${rubros.length})`}
          </h3>
          {activeSubTab === 'tasks' && (
              <div className="flex items-center gap-2 mr-2">
                  <select 
                      className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium text-slate-600 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      value={taskFilterCategory}
                      onChange={(e) => setTaskFilterCategory(e.target.value)}
                  >
                      <option value="ALL">Todas las Categorías</option>
                      {rubros.map(r => (
                          <option key={r} value={r}>{r}</option>
                      ))}
                  </select>
              </div>
          )}
          {activeSubTab === 'apu' && (
              <div className="flex items-center gap-2 mr-2">
                  <select 
                      className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium text-slate-600 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      value={apuFilterCategory}
                      onChange={(e) => setApuFilterCategory(e.target.value)}
                  >
                      <option value="ALL">Todas las Categorías</option>
                      {rubros.map(r => (
                          <option key={r} value={r}>{r}</option>
                      ))}
                  </select>
              </div>
          )}
          {activeSubTab === 'materials' && (
              <div className="flex items-center gap-2 mr-2">
                  <select 
                      className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-medium text-slate-600 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      value={materialFilterCategory}
                      onChange={(e) => setMaterialFilterCategory(e.target.value)}
                  >
                      <option value="ALL">Todas las Categorías</option>
                      {Array.from(new Set(materials.map(m => m.category).filter(Boolean))).sort().map(c => (
                          <option key={c} value={c}>{c}</option>
                      ))}
                  </select>
              </div>
          )}
          {activeSubTab !== 'apu' && (
            <button 
                onClick={() => { 
                    if(activeSubTab === 'tasks') {
                        handleCreateTask(); // Create and open full editor
                    } else {
                        setIsAdding(true); 
                        setEditingId(null); 
                    }
                }}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors"
            >
                <Plus size={14} /> Nuevo {activeSubTab === 'materials' ? 'Insumo' : activeSubTab === 'crews' ? 'Cuadrilla' : activeSubTab === 'tasks' ? 'Tarea' : activeSubTab === 'labor' ? 'Rol' : activeSubTab === 'rubros' ? 'Rubro' : 'Equipo'}
            </button>
          )}
        </div>

        {/* Subtabs internos — solo visibles en Recursos */}
        {(activeSubTab === 'materials' || activeSubTab === 'tools') && (
          <div className="flex gap-1 px-4 pt-3 pb-0 border-b border-slate-100 bg-slate-50/30">
            <button
              onClick={() => { cancelEdit(); setActiveSubTab('materials'); }}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-all ${activeSubTab === 'materials' ? 'border-blue-500 text-blue-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <Package size={13} /> Insumos
            </button>
            <button
              onClick={() => { cancelEdit(); setActiveSubTab('tools'); }}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-all ${activeSubTab === 'tools' ? 'border-blue-500 text-blue-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <Wrench size={13} /> Equipos
            </button>
          </div>
        )}

        {/* Subtabs internos — solo visibles en Mano de Obra */}
        {(activeSubTab === 'labor' || activeSubTab === 'crews') && (
          <div className="flex gap-1 px-4 pt-3 pb-0 border-b border-slate-100 bg-slate-50/30">
            <button
              onClick={() => { cancelEdit(); setActiveSubTab('labor'); }}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-all ${activeSubTab === 'labor' ? 'border-blue-500 text-blue-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <Users size={13} /> Categorías
            </button>
            <button
              onClick={() => { cancelEdit(); setActiveSubTab('crews'); }}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-all ${activeSubTab === 'crews' ? 'border-orange-500 text-orange-600 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <HardHat size={13} /> Cuadrillas
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="p-4 w-10 text-center">
                    <input 
                        type="checkbox" 
                        className="cursor-pointer"
                        checked={selectedIds.size === currentList.length && currentList.length > 0}
                        onChange={toggleSelectAll}
                    />
                </th>
                <th 
                    className={`p-4 text-xs font-semibold text-slate-500 ${(activeSubTab === 'tasks' || activeSubTab === 'apu' || activeSubTab === 'materials') ? 'cursor-pointer hover:text-blue-600 select-none' : ''}`}
                    onClick={() => {
                        if (activeSubTab === 'tasks') {
                            setTaskSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                        } else if (activeSubTab === 'apu') {
                            setApuSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                        } else if (activeSubTab === 'materials') {
                            setMaterialSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                        }
                    }}
                >
                    <div className="flex items-center gap-1">
                        {activeSubTab === 'labor' || activeSubTab === 'rubros' ? 'Nombre / Descripción' : 'Nombre / Identificador'}
                        {activeSubTab === 'tasks' && (
                            taskSortOrder === 'asc' ? <ArrowDown size={14} /> : <ArrowUp size={14} />
                        )}
                        {activeSubTab === 'apu' && (
                            apuSortOrder === 'asc' ? <ArrowDown size={14} /> : <ArrowUp size={14} />
                        )}
                        {activeSubTab === 'materials' && (
                            materialSortOrder === 'asc' ? <ArrowDown size={14} /> : <ArrowUp size={14} />
                        )}
                    </div>
                </th>
                
                {activeSubTab !== 'labor' && activeSubTab !== 'rubros' && activeSubTab !== 'crews' && <th className="p-4 text-xs font-semibold text-slate-500">Categoría</th>}
                
                {/* NEW: Unit Column for Tasks */}
                {activeSubTab === 'tasks' && <th className="p-4 text-xs font-semibold text-slate-500">Unidad</th>}

                {/* APU SPECIFIC HEADERS */}
                {activeSubTab === 'apu' && (
                    <>
                        <th className="p-4 text-xs font-semibold text-slate-500 text-right">Materiales</th>
                        <th className="p-4 text-xs font-semibold text-slate-500 text-right">Mano Obra</th>
                        <th className="p-4 text-xs font-semibold text-slate-500 text-right">Equipos</th>
                    </>
                )}

                {activeSubTab === 'crews' && <th className="p-4 text-xs font-semibold text-slate-500">Composición</th>}

                {activeSubTab === 'materials' && <th className="p-4 text-xs font-semibold text-slate-500">Unidad</th>}
                {activeSubTab === 'labor' && <th className="p-4 text-xs font-semibold text-slate-500 text-right">Valor Básico/Hora</th>}
                {activeSubTab === 'labor' && <th className="p-4 text-xs font-semibold text-slate-500 text-right">Cargas Soc. (%)</th>}
                {activeSubTab === 'labor' && <th className="p-4 text-xs font-semibold text-slate-500 text-right">Aportes/Seg. (%)</th>}
                
                {activeSubTab !== 'rubros' && (
                    <th className="p-4 text-xs font-semibold text-slate-500 text-right">
                    {activeSubTab === 'materials' ? 'Costo Unit.' : activeSubTab === 'tasks' ? 'Costo MO Est.' : activeSubTab === 'crews' ? 'Costo Hora (Est.)' : activeSubTab === 'labor' ? 'COSTO FINAL' : activeSubTab === 'apu' ? 'TOTAL APU' : 'Costo x Hora'}
                    </th>
                )}
                <th className="p-4 text-xs font-semibold text-slate-500 text-center w-32">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* Add New Row Inline */}
              {isAdding && activeSubTab !== 'apu' && activeSubTab !== 'tasks' && (
                <tr className="bg-blue-50/50 border-l-4 border-blue-500">
                  <td className="p-3"></td>
                  <td className="p-3">
                    <input 
                      className="w-full p-2 text-sm border rounded focus:ring-2 focus:ring-blue-500 bg-white shadow-sm" 
                      placeholder={activeSubTab === 'labor' ? "Ej: Oficial Especializado" : activeSubTab === 'crews' ? "Ej: Cuadrilla Hormigón" : activeSubTab === 'rubros' ? "Ej: 99 NUEVO RUBRO" : "Nombre..."}
                      autoFocus
                      onChange={e => {
                          const val = e.target.value;
                          if (activeSubTab === 'materials') setDraftMaterial({...draftMaterial, name: val});
                          else if (activeSubTab === 'tools') setDraftTool({...draftTool, name: val});
                          else if (activeSubTab === 'labor') setDraftLabor({...draftLabor, role: val});
                          else if (activeSubTab === 'crews') setDraftCrew({...draftCrew, name: val});
                          else if (activeSubTab === 'rubros') setDraftRubro(val);
                      }}
                    />
                  </td>
                  {/* ... Existing input cells logic ... */}
                  {activeSubTab === 'crews' && (
                      <td className="p-3">
                          <input className="w-full p-2 text-sm border rounded" placeholder="Descripción opcional" onChange={e => setDraftCrew({...draftCrew, description: e.target.value})}/>
                      </td>
                  )}
                  {/* ... other tabs inputs ... */}
                  
                  {/* Save buttons */}
                  <td className="p-3 flex justify-center gap-2">
                    <button onClick={saveItem} className="flex items-center gap-1 bg-green-600 text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-green-700 shadow-sm"><Save size={14} /> Guardar</button>
                    <button onClick={cancelEdit} className="flex items-center gap-1 bg-white border border-slate-300 text-slate-500 px-3 py-1.5 rounded text-xs font-bold hover:bg-slate-100"><X size={14} /> Cancelar</button>
                  </td>
                </tr>
              )}

              {/* Data Rows */}
              {(currentList).map((item: any) => {
                const itemId = activeSubTab === 'rubros' ? item : item.id;
                const displayName = activeSubTab === 'rubros' ? item : activeSubTab === 'labor' ? item.role : item.name;
                const isEditingAPU = editingAPUTask?.id === item.id;
                const isEditingCrew = editingCrew?.id === item.id;
                const isEditingConfig = editingMaterialConfig?.id === item.id;
                const isSelected = selectedIds.has(itemId);
                
                // Calculate APU if needed (Now also for TASKS to show dynamic labor cost)
                let apu = null;
                if (activeSubTab === 'apu' || activeSubTab === 'tasks') {
                    apu = calculateUnitPrice(item, yieldsIndex, materialsMap, toolYieldsIndex, toolsMap, taskCrewYieldsIndex, crewsMap, laborCategoriesMap, 9, taskLaborYieldsIndex);
                }

                // NEW: Rubro Expansion Logic
                const isExpanded = activeSubTab === 'rubros' && expandedRubro === item;
                const presetTasks = activeSubTab === 'rubros' ? rubroPresets[item] || [] : [];

                return (
                <React.Fragment key={itemId}>
                <tr className={`hover:bg-slate-50 group ${editingId === itemId || isEditingAPU || isEditingCrew || isEditingConfig ? 'bg-blue-50' : ''} ${isSelected ? 'bg-blue-50/30' : ''}`}>
                  <td className="p-4 text-center">
                      <input 
                        type="checkbox" 
                        className="cursor-pointer"
                        checked={isSelected}
                        onChange={() => toggleSelectRow(itemId)}
                      />
                  </td>
                  <td className="p-4">
                    {editingId === itemId && activeSubTab !== 'rubros' && activeSubTab !== 'apu' ? (
                      <input 
                        className="w-full p-1 text-sm border rounded bg-white focus:ring-2 focus:ring-blue-500" 
                        value={activeSubTab === 'labor' ? draftLabor.role : activeSubTab === 'crews' ? draftCrew.name : item.name}
                        onChange={e => {
                            const val = e.target.value;
                            if (activeSubTab === 'materials') setDraftMaterial({...draftMaterial, name: val});
                            else if (activeSubTab === 'tools') setDraftTool({...draftTool, name: val});
                            else if (activeSubTab === 'labor') setDraftLabor({...draftLabor, role: val});
                            else if (activeSubTab === 'crews') setDraftCrew({...draftCrew, name: val});
                        }}
                      />
                    ) : (
                      activeSubTab === 'rubros' ? (
                          <div 
                              className="flex items-center gap-2 cursor-pointer select-none"
                              onClick={() => setExpandedRubro(expandedRubro === item ? null : item)}
                          >
                              {presetTasks.length > 0 && (
                                  <div className="text-slate-400 transition-transform duration-200">
                                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                  </div>
                              )}
                              <div className="font-medium text-slate-800">{displayName}</div>
                              {presetTasks.length > 0 && (
                                  <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full border border-slate-200">
                                      {presetTasks.length} plantillas
                                  </span>
                              )}
                          </div>
                      ) : (
                          <div>
                              <div className="font-medium text-slate-800">{displayName}</div>
                              {activeSubTab === 'crews' && item.description && <div className="text-[10px] text-slate-400">{item.description}</div>}
                              {activeSubTab === 'materials' && item.commercialFormat && <div className="text-[10px] text-slate-400">{item.commercialFormat}</div>}
                              {activeSubTab === 'apu' && (
                                 <div className="text-[10px] text-slate-400">Rend: {item.dailyYield} u/d • {item.unit}</div>
                              )}
                          </div>
                      )
                    )}
                    {(activeSubTab !== 'rubros' && activeSubTab !== 'apu') && <div className="text-[10px] text-slate-400 font-mono mt-0.5">{itemId.substring(0, 12)}</div>}
                  </td>

                  {activeSubTab !== 'labor' && activeSubTab !== 'rubros' && activeSubTab !== 'crews' && (
                    <td className="p-4">
                        {editingId === itemId ? (
                            <input className="w-full p-1 text-sm border rounded" value={activeSubTab === 'materials' ? draftMaterial.category : draftTool.category} onChange={e => activeSubTab === 'materials' ? setDraftMaterial({...draftMaterial, category: e.target.value}) : setDraftTool({...draftTool, category: e.target.value})} />
                        ) : (
                        <span className="text-xs text-slate-500 font-medium px-2 py-0.5 bg-slate-100 rounded border border-slate-200">{item.category || 'S/C'}</span>
                        )}
                    </td>
                  )}

                  {/* Task Unit Column (Added Request) */}
                  {activeSubTab === 'tasks' && (
                      <td className="p-4">
                          {editingId === itemId ? (
                              <input className="w-16 p-1 text-sm border rounded" value={draftTask.unit} onChange={e => setDraftTask({...draftTask, unit: e.target.value})} />
                          ) : (
                              <span className="text-xs text-slate-500 font-medium px-2 py-0.5 bg-slate-100 rounded border border-slate-200">{item.unit}</span>
                          )}
                      </td>
                  )}

                  {/* Crew Composition Cell */}
                  {activeSubTab === 'crews' && (
                      <td className="p-4">
                          <div className="flex flex-wrap gap-1">
                              {item.composition?.map((c: any, i: number) => {
                                  const cat = laborCategoriesMap[c.laborCategoryId];
                                  return (
                                      <span key={i} className="text-[10px] bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-slate-600">
                                          {c.count}x {cat?.role || '?'} {(c.participation && c.participation < 100) ? `(${c.participation}%)` : ''}
                                      </span>
                                  )
                              })}
                              {(!item.composition || item.composition.length === 0) && <span className="text-xs text-slate-400 italic">Sin integrantes</span>}
                          </div>
                      </td>
                  )}

                  {/* APU BREAKDOWN COLUMNS */}
                  {activeSubTab === 'apu' && apu && (
                      <>
                        <td className="p-4 text-right text-xs text-slate-600">${apu.materialCost.toFixed(2)}</td>
                        <td className="p-4 text-right text-xs text-slate-600">${apu.laborCost.toFixed(2)}</td>
                        <td className="p-4 text-right text-xs text-slate-600">${apu.toolCost.toFixed(2)}</td>
                      </>
                  )}

                  {/* Material Unit Column */}
                  {activeSubTab === 'materials' && (
                      <td className="p-4">
                          {editingId === itemId ? (
                              <input className="w-16 p-1 text-sm border rounded" value={draftMaterial.unit} onChange={e => setDraftMaterial({...draftMaterial, unit: e.target.value})} />
                          ) : (
                              <span className="text-xs text-slate-500 font-medium px-2 py-0.5 bg-slate-100 rounded border border-slate-200">{item.unit}</span>
                          )}
                      </td>
                  )}

                  {/* Labor Columns Editable */}
                  {activeSubTab === 'labor' && (
                      <>
                        <td className="p-4 text-right">
                             {editingId === itemId ? <input type="number" className="w-20 p-1 text-sm text-right border rounded" value={draftLabor.basicHourlyRate} onChange={e => setDraftLabor({...draftLabor, basicHourlyRate: parseFloat(e.target.value)})} /> : <span className="text-slate-600">${item.basicHourlyRate?.toFixed(2)}</span>}
                        </td>
                        <td className="p-4 text-right">
                             {editingId === itemId ? <input type="number" className="w-16 p-1 text-sm text-right border rounded" value={draftLabor.socialChargesPercent} onChange={e => setDraftLabor({...draftLabor, socialChargesPercent: parseFloat(e.target.value)})} /> : <span className="text-slate-500">{item.socialChargesPercent}%</span>}
                        </td>
                        <td className="p-4 text-right">
                             {editingId === itemId ? <input type="number" className="w-16 p-1 text-sm text-right border rounded" value={draftLabor.insurancePercent} onChange={e => setDraftLabor({...draftLabor, insurancePercent: parseFloat(e.target.value)})} /> : <span className="text-slate-500">{item.insurancePercent}%</span>}
                        </td>
                      </>
                  )}

                  {activeSubTab !== 'rubros' && (
                    <td className="p-4 text-right">
                        {editingId === itemId && activeSubTab !== 'labor' && activeSubTab !== 'apu' && activeSubTab !== 'crews' ? (
                        <input 
                            type="number" className="w-24 p-1 text-sm border rounded text-right" 
                            value={activeSubTab === 'materials' ? draftMaterial.cost : activeSubTab === 'tasks' ? draftTask.laborCost : draftTool.costPerHour}
                            onChange={e => {
                            const val = parseFloat(e.target.value);
                            if(activeSubTab === 'materials') setDraftMaterial({...draftMaterial, cost: val});
                            else if(activeSubTab === 'tasks') setDraftTask({...draftTask, laborCost: val});
                            else setDraftTool({...draftTool, costPerHour: val});
                            }}
                        />
                        ) : (
                        <span className={`font-mono font-bold ${activeSubTab === 'apu' ? 'text-purple-700' : 'text-slate-700'}`}>
                            {activeSubTab === 'labor' 
                            ? `$${calculateTotalLabor(
                                    editingId === itemId ? draftLabor.basicHourlyRate! : item.basicHourlyRate,
                                    editingId === itemId ? draftLabor.socialChargesPercent! : item.socialChargesPercent,
                                    editingId === itemId ? draftLabor.insurancePercent! : item.insurancePercent
                                ).toFixed(2)}`
                            : activeSubTab === 'apu'
                                ? `$${(apu?.totalUnitCost || 0).toFixed(2)}`
                                : activeSubTab === 'crews'
                                    ? `$${calculateCrewHourlyCost(item).toFixed(2)}`
                                    : `$${(activeSubTab === 'materials' ? (item.cost || 0) : activeSubTab === 'tasks' ? (apu?.laborCost || 0) : (item.costPerHour || 0)).toFixed(2)}`
                            }
                        </span>
                        )}
                        {(activeSubTab === 'labor' || activeSubTab === 'crews' || activeSubTab === 'tools') && <div className="text-[10px] text-slate-400 uppercase font-bold">Total Hora</div>}
                    </td>
                  )}
                  
                  <td className="p-4 text-center">
                      <div className="flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {editingId === itemId ? (
                          <>
                          <button onClick={saveItem} className="flex items-center gap-1 bg-green-600 text-white px-2 py-1 rounded text-[10px] font-bold hover:bg-green-700 shadow-sm" title="Guardar"><Save size={12} /> Guardar</button>
                          <button onClick={cancelEdit} className="flex items-center gap-1 bg-white border border-slate-300 text-slate-500 px-2 py-1 rounded text-[10px] font-bold hover:bg-slate-100" title="Cancelar"><X size={12} /> Cancelar</button>
                          </>
                      ) : (
                          <>
                           {/* Botón de edición de APU / Tarea */}
                           {(activeSubTab === 'apu' || activeSubTab === 'tasks') && (
                               <button 
                                 onClick={() => { setEditingAPUTask(item); setLocalTask({...item}); setIsNewTask(false); }}
                                 className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" 
                                 title="Configurar APU y Rendimientos"
                               >
                                  <Settings size={16} />
                               </button>
                           )}
                           
                           {/* Botón de Configuración Material (Extended) */}
                           {activeSubTab === 'materials' && (
                               <button 
                                 onClick={() => setEditingMaterialConfig(item)}
                                 className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" 
                                 title="Configurar Detalles del Material"
                               >
                                  <Settings size={16} />
                               </button>
                           )}
                           
                           {/* Botón de edición de Cuadrilla */}
                           {activeSubTab === 'crews' && (
                               <button 
                                 onClick={() => setEditingCrew(item)}
                                 className="p-1.5 text-orange-600 hover:bg-orange-50 rounded" 
                                 title="Configurar Composición"
                               >
                                  <Users size={16} />
                               </button>
                           )}

                           {(activeSubTab !== 'rubros' && activeSubTab !== 'apu' && activeSubTab !== 'crews' && activeSubTab !== 'tasks') && <button onClick={() => startEdit(item)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded" title="Editar"><Edit2 size={14} /></button>}
                           <button onClick={() => deleteItem(itemId)} className="p-1.5 text-red-400 hover:bg-red-50 rounded" title="Eliminar"><Trash2 size={14} /></button>
                          </>
                      )}
                      </div>
                  </td>
                </tr>
                {/* Expanded Row for Rubros */}
                {isExpanded && (
                    <tr className="bg-slate-50/50 animate-in fade-in slide-in-from-top-2">
                        <td colSpan={10} className="p-0">
                            <div className="p-4 pl-12 border-b border-slate-100 shadow-inner">
                                <h4 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
                                    <ListChecks size={14} className="text-blue-500" /> Tareas Sugeridas para {item}
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {presetTasks.map((pt, idx) => (
                                        <div key={idx} className="bg-white border border-slate-200 rounded-lg p-3 hover:shadow-md transition-all group/card relative overflow-hidden">
                                            <div className="flex justify-between items-start mb-1">
                                                <h5 className="font-bold text-slate-700 text-sm">{pt.name}</h5>
                                                <span className="text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 border border-slate-200">{pt.unit}</span>
                                            </div>
                                            <p className="text-xs text-slate-500 mb-3 line-clamp-2">{pt.description || 'Sin descripción'}</p>
                                            
                                            <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-50">
                                                <div className="text-xs font-mono text-slate-400">
                                                    Rend: {pt.dailyYield} u/d
                                                </div>
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleCreateTaskFromPreset(pt);
                                                    }}
                                                    className="flex items-center gap-1 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white px-2 py-1 rounded text-xs font-bold transition-colors"
                                                >
                                                    <Plus size={12} /> Crear Tarea
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </td>
                    </tr>
                )}
                </React.Fragment>
              )})}
            </tbody>
          </table>
        </div>
      </div>
      )}

      </div>

      {/* ... (Existing AI Modal, Material Config Panel, APU Editor Side Panel, Crew Editor Side Panel, Report Preview Modal, Smart Import Modal code remains the same as previous DataAdmin file) ... */}
      {showAIModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]">
                  {/* Header */}
                  <div className="p-6 bg-slate-900 text-white flex justify-between items-start">
                      <div>
                          <h3 className="font-bold text-lg flex items-center gap-2">
                              <Sparkles className="text-purple-400 animate-pulse" /> Asistente de Mercado IA
                          </h3>
                          <p className="text-xs text-slate-400 mt-1">
                              Consultas automatizadas de precios e índices (Clarín Arq, Cifras, INDEC).
                          </p>
                      </div>
                      <button onClick={() => setShowAIModal(false)} className="p-1 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-colors">
                          <X size={20} />
                      </button>
                  </div>

                  {/* Body */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                      {!aiProposedUpdates.length ? (
                          <div className="space-y-4">
                              <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl">
                                  <label className="block text-xs font-bold text-blue-800 uppercase mb-2">Consulta de Precios</label>
                                  <textarea 
                                      className="w-full p-3 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm h-24 resize-none placeholder:text-slate-400"
                                      placeholder="Ej: Actualizar precio de la bolsa de cemento y arena fina según último índice de la Cámara Argentina de la Construcción..."
                                      value={aiQuery}
                                      onChange={e => setAiQuery(e.target.value)}
                                      autoFocus
                                  />
                                  <p className="text-[10px] text-blue-500 mt-2 text-right">
                                      * La IA analizará la base de datos y propondrá actualizaciones.
                                  </p>
                              </div>
                              
                              {isAiThinking && (
                                  <div className="flex flex-col items-center justify-center py-8 text-center animate-pulse">
                                      <Bot size={32} className="text-purple-600 mb-2" />
                                      <span className="text-sm font-bold text-slate-600">Analizando fuentes de mercado...</span>
                                      <span className="text-xs text-slate-400">Consultando MercadoLibre y Cifras Online</span>
                                  </div>
                              )}
                          </div>
                      ) : (
                          <div className="space-y-4 animate-in slide-in-from-right">
                              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm text-slate-600 leading-relaxed">
                                  <strong className="text-purple-700 block mb-1">Análisis del Asistente:</strong>
                                  {aiExplanation}
                              </div>

                              <div className="border border-slate-200 rounded-xl overflow-x-auto">
                                  <table className="w-full text-left text-xs">
                                      <thead className="bg-slate-100 text-slate-500 font-bold uppercase">
                                          <tr>
                                              <th className="p-3">Material</th>
                                              <th className="p-3 text-right">Actual</th>
                                              <th className="p-3 text-right">Nuevo</th>
                                              <th className="p-3 text-center">Var.</th>
                                          </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                          {aiProposedUpdates.map((u, idx) => {
                                              const current = Number(u.current_price || 0);
                                              const newer = Number(u.new_price || 0);
                                              const variance = current > 0 ? ((newer - current) / current) * 100 : 0;
                                              return (
                                                  <tr key={idx} className="hover:bg-slate-50">
                                                      <td className="p-3 font-medium text-slate-700">
                                                          {u.name}
                                                          <div className="text-[9px] text-slate-400 font-normal">Fuente: {u.source}</div>
                                                      </td>
                                                      <td className="p-3 text-right font-mono text-slate-500">${current}</td>
                                                      <td className="p-3 text-right font-mono font-bold text-slate-800">${newer}</td>
                                                      <td className="p-3 text-center">
                                                          <span className={`px-1.5 py-0.5 rounded ${variance > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'} font-bold`}>
                                                              {variance > 0 ? '+' : ''}{variance.toFixed(1)}%
                                                          </span>
                                                      </td>
                                                  </tr>
                                              )
                                          })}
                                      </tbody>
                                  </table>
                              </div>
                          </div>
                      )}
                  </div>

                  {/* Footer */}
                  <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                      {!aiProposedUpdates.length ? (
                          <button 
                              onClick={handleAskAI}
                              disabled={!aiQuery || isAiThinking}
                              className="bg-purple-600 text-white px-6 py-2 rounded-lg font-bold shadow-lg shadow-purple-200 hover:bg-purple-700 disabled:opacity-50 transition-all flex items-center gap-2"
                          >
                              {isAiThinking ? 'Procesando...' : <><Search size={16} /> Consultar Mercado</>}
                          </button>
                      ) : (
                          <>
                              <button onClick={() => { setAiProposedUpdates([]); setAiQuery(''); }} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-200 rounded-lg text-sm">Rechazar</button>
                              <button onClick={applyAiUpdates} className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-bold shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all flex items-center gap-2 text-sm">
                                  <Check size={16} /> Aplicar Actualización
                              </button>
                          </>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* --- MATERIAL CONFIGURATION PANEL --- */}
      {editingMaterialConfig && (
          <aside className="w-[450px] max-w-full max-md:fixed max-md:inset-0 max-md:w-full max-md:!h-[100dvh] max-md:!rounded-none max-md:!z-50 flex-shrink-0 bg-white border-l border-slate-200 shadow-2xl flex flex-col h-[calc(100vh-80px)] sticky top-0 rounded-l-xl animate-in slide-in-from-right z-20">
             {/* Header */}
             <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-start">
                <div>
                    <span className="text-[10px] font-bold uppercase text-blue-600 tracking-wider">Ficha de Insumo</span>
                    <h3 className="font-bold text-lg text-slate-800 leading-tight mt-1">{editingMaterialConfig.name}</h3>
                    <p className="text-xs text-slate-500 mt-1">Configuración extendida del material</p>
                </div>
                <button onClick={() => setEditingMaterialConfig(null)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
                    <X size={20} />
                </button>
             </div>

             <div className="flex-1 overflow-y-auto p-5 space-y-6">
                 
                 {/* Basic Info */}
                 <div className="space-y-4">
                     <h4 className="text-xs font-bold text-slate-800 uppercase flex items-center gap-2 pb-2 border-b border-slate-100">
                        <Package size={14} className="text-blue-500" /> Información Básica
                     </h4>
                     
                     <div className="space-y-3">
                         <div>
                             <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Nombre del Material</label>
                             <input 
                                className="w-full p-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                                value={editingMaterialConfig.name}
                                onChange={e => setEditingMaterialConfig({...editingMaterialConfig, name: e.target.value})}
                             />
                         </div>
                         <div className="grid grid-cols-2 gap-3">
                             <div>
                                 <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Unidad de Medida</label>
                                 <input 
                                    className="w-full p-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-center font-bold"
                                    value={editingMaterialConfig.unit}
                                    onChange={e => setEditingMaterialConfig({...editingMaterialConfig, unit: e.target.value})}
                                 />
                             </div>
                             <div>
                                 <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Costo Base ($)</label>
                                 <input 
                                    type="number"
                                    className="w-full p-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-right font-mono"
                                    value={editingMaterialConfig.cost}
                                    onChange={e => setEditingMaterialConfig({...editingMaterialConfig, cost: parseFloat(e.target.value)})}
                                 />
                             </div>
                         </div>
                         <div>
                             <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Categoría</label>
                             <input 
                                className="w-full p-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                                value={editingMaterialConfig.category || ''}
                                onChange={e => setEditingMaterialConfig({...editingMaterialConfig, category: e.target.value})}
                             />
                         </div>
                     </div>
                 </div>

                 {/* Extended Details */}
                 <div className="space-y-4">
                     <h4 className="text-xs font-bold text-slate-800 uppercase flex items-center gap-2 pb-2 border-b border-slate-100">
                        <ListChecks size={14} className="text-purple-500" /> Detalles Técnicos
                     </h4>
                     
                     <div className="space-y-3">
                         <div>
                             <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Formato Comercial</label>
                             <input 
                                className="w-full p-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="Ej: Bolsa de 50kg, Pallet de 100u"
                                value={editingMaterialConfig.commercialFormat || ''}
                                onChange={e => setEditingMaterialConfig({...editingMaterialConfig, commercialFormat: e.target.value})}
                             />
                             <p className="text-[9px] text-slate-400 mt-1 italic">Especificación de cómo se compra el material en el mercado.</p>
                         </div>
                         
                         <div>
                             <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Desperdicio Estándar (%)</label>
                             <div className="flex items-center gap-2">
                                <input 
                                    type="number"
                                    min="0" max="100"
                                    className="w-20 p-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-right font-bold"
                                    value={editingMaterialConfig.wastePercent || 0}
                                    onChange={e => setEditingMaterialConfig({...editingMaterialConfig, wastePercent: parseFloat(e.target.value)})}
                                />
                                <span className="text-xs text-slate-500">%</span>
                             </div>
                             <p className="text-[9px] text-slate-400 mt-1 italic">Porcentaje de pérdida estimada en obra.</p>
                         </div>

                         <div>
                             <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Descripción / Especificación</label>
                             <textarea 
                                className="w-full p-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 outline-none h-24 resize-none"
                                placeholder="Detalles técnicos, marca sugerida, normas IRAM, etc."
                                value={editingMaterialConfig.description || ''}
                                onChange={e => setEditingMaterialConfig({...editingMaterialConfig, description: e.target.value})}
                             />
                         </div>
                     </div>
                 </div>

             </div>

             {/* Footer */}
             <div className="p-5 border-t border-slate-200 bg-slate-50 flex gap-3">
                 <button 
                    onClick={() => setEditingMaterialConfig(null)}
                    className="flex-1 bg-white border border-slate-300 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-100 transition-all"
                 >
                    Cancelar
                 </button>
                 <button 
                    onClick={() => {
                        updateMaterial(editingMaterialConfig.id, editingMaterialConfig);
                        setEditingMaterialConfig(null);
                        setMessage({ type: 'success', text: 'Material actualizado correctamente.' });
                    }}
                    className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all flex justify-center items-center gap-2"
                 >
                    <Save size={18} /> Guardar Ficha
                 </button>
             </div>
          </aside>
      )}

      {/* --- APU EDITOR SIDE PANEL --- */}
      {editingAPUTask && localTask && apuAnalysis && (
          <aside className="w-[480px] max-w-full max-md:fixed max-md:inset-0 max-md:w-full max-md:!h-[100dvh] max-md:!rounded-none max-md:!z-50 flex-shrink-0 bg-white border-l border-slate-200 shadow-2xl flex flex-col h-[calc(100vh-80px)] sticky top-0 rounded-l-xl animate-in slide-in-from-right z-20">
             {/* Header with Basic Info Editing */}
             <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-start">
                <div className="w-full pr-4">
                    <span className="text-[10px] font-bold uppercase text-purple-600 tracking-wider">Editor de Tarea y APU</span>
                    
                    {/* Basic Info Inputs (Binding to localTask) */}
                    <div className="mt-2 space-y-2">
                        <input 
                            className="w-full text-lg font-bold text-slate-800 bg-transparent border-b border-dashed border-slate-400 focus:border-purple-600 focus:outline-none pb-1"
                            value={localTask.name}
                            onChange={e => setLocalTask({...localTask, name: e.target.value })}
                            placeholder="Nombre de la Tarea"
                        />
                        <div className="flex gap-2">
                            <input 
                                className="w-20 text-xs font-bold text-slate-500 bg-white border border-slate-300 rounded px-2 py-1 focus:border-purple-500 outline-none"
                                value={localTask.unit}
                                onChange={e => setLocalTask({...localTask, unit: e.target.value })}
                                placeholder="Unidad"
                            />
                            <select 
                                className="flex-1 text-xs text-slate-500 bg-white border border-slate-300 rounded px-2 py-1 focus:border-purple-500 outline-none"
                                value={localTask.category || ''}
                                onChange={e => setLocalTask({...localTask, category: e.target.value })}
                            >
                                <option value="">-- Categoría --</option>
                                {rubros.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                    </div>
                </div>
                <button onClick={handleCancelTaskChanges} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors flex-shrink-0">
                    <X size={20} />
                </button>
             </div>
             {/* Content */}
             <div className="flex-1 overflow-y-auto p-5 space-y-6">
                
                {/* Description */}
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Descripción / Especificación</label>
                    <textarea 
                        className="w-full p-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-purple-500 outline-none h-20 resize-none"
                        placeholder="Detalles técnicos de la tarea..."
                        value={localTask.description || ''}
                        onChange={e => setLocalTask({...localTask, description: e.target.value})}
                    />
                </div>

                {/* Parameters Grid */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1 uppercase flex items-center gap-1">
                            Rendimiento Diario (u/d)
                            <InfoTooltip text="Cantidad de unidades que se pueden ejecutar en un día de trabajo." formula="Producción / Jornada" />
                        </label>
                        <input 
                            type="number"
                            className="w-full p-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-purple-500 outline-none"
                            value={localTask.dailyYield}
                            onChange={e => setLocalTask({...localTask, dailyYield: parseFloat(e.target.value)})}
                        />
                        <p className="text-[10px] text-slate-400 mt-1">Unidades por día de trabajo.</p>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1 uppercase flex items-center gap-1">
                            Rendimiento HH (h/u)
                            <InfoTooltip text="Horas hombre requeridas para producir una unidad." formula="Horas Totales / Cantidad" />
                        </label>
                        <input 
                            type="number"
                            className="w-full p-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-purple-500 outline-none"
                            value={localTask.yieldHH || 0}
                            onChange={e => setLocalTask({...localTask, yieldHH: parseFloat(e.target.value)})}
                        />
                        <p className="text-[10px] text-slate-400 mt-1">Horas Hombre por unidad.</p>
                    </div>
                </div>

                {/* Manual Cost Override */}
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase flex items-center gap-1">
                        Costo Mano de Obra (Manual)
                        <InfoTooltip text="Costo directo de mano de obra por unidad. Si se ingresa, sobrescribe el cálculo automático basado en cuadrillas." />
                    </label>
                    <div className="flex items-center gap-2">
                        <span className="text-slate-400 font-bold">$</span>
                        <input 
                            type="number"
                            className="w-full p-2 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-purple-500 outline-none"
                            value={localTask.laborCost}
                            onChange={e => setLocalTask({...localTask, laborCost: parseFloat(e.target.value)})}
                        />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">Si se define, anula el cálculo automático del APU.</p>
                </div>

                {/* Resources List (Simplified) */}
                <div className="pt-4 border-t border-slate-100">
                    <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                        <ListChecks size={16} className="text-purple-600" /> Recursos Asignados (APU)
                    </h4>
                    
                    {/* Materials */}
                    <div className="mb-4">
                        <h5 className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-2">
                            Materiales
                            <InfoTooltip text="Insumos necesarios por unidad de tarea." formula="Costo = (Cant. * (1 + Desp.%)) * Precio Unit." />
                        </h5>
                        <div className="space-y-2">
                            {currentAPUMaterials.map((m: any) => (
                                <div key={m.materialId} className="flex flex-col gap-2 text-sm bg-slate-50 p-2 rounded border border-slate-100">
                                    <div className="flex justify-between items-center">
                                        <span className="font-medium text-slate-700">{m.data?.name || 'Material Desconocido'}</span>
                                        <button onClick={() => removeTaskYield(localTask.id, m.materialId)} className="text-red-400 hover:text-red-600"><X size={14} /></button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-1">
                                                Rendimiento
                                                <InfoTooltip text="Cantidad neta por unidad." />
                                            </label>
                                            <div className="flex items-center gap-1">
                                                <input 
                                                    type="number" 
                                                    className="w-full p-1 text-xs border rounded text-right focus:ring-1 focus:ring-blue-500 outline-none"
                                                    value={m.quantity}
                                                    onChange={(e) => addTaskYield({ ...m, quantity: parseFloat(e.target.value) || 0 })}
                                                />
                                                <span className="text-[10px] text-slate-400 w-8 text-right truncate" title={m.data?.unit}>{m.data?.unit}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-1">
                                                Desp. %
                                                <InfoTooltip text="Desperdicio estimado." />
                                            </label>
                                            <div className="flex items-center gap-1">
                                                <input 
                                                    type="number" 
                                                    className="w-full p-1 text-xs border rounded text-right focus:ring-1 focus:ring-blue-500 outline-none"
                                                    value={m.wastePercent || 0}
                                                    onChange={(e) => addTaskYield({ ...m, wastePercent: parseFloat(e.target.value) || 0 })}
                                                />
                                                <span className="text-[10px] text-slate-400">%</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {currentAPUMaterials.length === 0 && <p className="text-xs text-slate-400 italic">Sin materiales asignados.</p>}
                        </div>
                    </div>

                    {/* Labor (Individual) */}
                    <div className="mb-4">
                        <h5 className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-2">
                            Mano de Obra (Individual)
                            <InfoTooltip text="Oficiales o Ayudantes asignados individualmente." formula="Costo = (Cant. * Horas * Valor Hora) / Rendimiento" />
                        </h5>
                        <div className="space-y-2">
                            {currentAPULabor.map((l: any) => (
                                <div key={l.laborCategoryId} className="flex flex-col gap-2 text-sm bg-slate-50 p-2 rounded border border-slate-100">
                                    <div className="flex justify-between items-center">
                                        <span className="font-medium text-slate-700">{l.data?.role || 'Rol Desconocido'}</span>
                                        <button onClick={() => removeTaskLaborYield(localTask.id, l.laborCategoryId)} className="text-red-400 hover:text-red-600"><X size={14} /></button>
                                    </div>
                                    <div className="flex items-center justify-between mt-1">
                                        <label className="text-[10px] text-slate-500 font-bold uppercase">Cantidad (Personas)</label>
                                        <input 
                                            type="number" 
                                            className="w-20 p-1 text-xs border rounded text-right focus:ring-1 focus:ring-blue-500 outline-none"
                                            value={l.quantity}
                                            onChange={(e) => addTaskLaborYield({ ...l, quantity: parseFloat(e.target.value) || 0 })}
                                        />
                                    </div>
                                </div>
                            ))}
                            {currentAPULabor.length === 0 && <p className="text-xs text-slate-400 italic">Sin mano de obra individual asignada.</p>}
                        </div>
                    </div>

                    {/* Tools */}
                    <div className="mb-4">
                        <h5 className="text-xs font-bold text-slate-500 uppercase mb-2">Equipos</h5>
                        <div className="space-y-2">
                            {currentAPUTools.map((t: any) => (
                                <div key={t.toolId} className="flex items-center justify-between text-sm bg-slate-50 p-2 rounded border border-slate-100">
                                    <span className="font-medium text-slate-700">{t.data?.name || 'Equipo Desconocido'}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-slate-500">{t.hoursPerUnit} h/u</span>
                                        <button onClick={() => removeTaskToolYield(localTask.id, t.toolId)} className="text-red-400 hover:text-red-600"><X size={14} /></button>
                                    </div>
                                </div>
                            ))}
                            {currentAPUTools.length === 0 && <p className="text-xs text-slate-400 italic">Sin equipos asignados.</p>}
                        </div>
                    </div>

                    {/* Add Resource Form */}
                    <div className="mt-4 bg-purple-50 p-3 rounded-lg border border-purple-100">
                        <label className="block text-[10px] font-bold text-purple-800 uppercase mb-2">Agregar Recurso</label>
                        <div className="flex gap-2 mb-2">
                            <select 
                                className="flex-1 text-xs border border-purple-200 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500"
                                value={resourceType}
                                onChange={(e: any) => setResourceType(e.target.value)}
                            >
                                <option value="material">Material</option>
                                <option value="tool">Equipo</option>
                                <option value="labor">Mano de Obra</option>
                                <option value="crew">Cuadrilla</option>
                            </select>
                            <select 
                                className="flex-[2] text-xs border border-purple-200 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500"
                                value={resourceToAdd}
                                onChange={e => setResourceToAdd(e.target.value)}
                            >
                                <option value="">-- Seleccionar --</option>
                                {resourceType === 'material' && materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                {resourceType === 'tool' && tools.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                {resourceType === 'labor' && laborCategories.map(l => <option key={l.id} value={l.id}>{l.role}</option>)}
                                {resourceType === 'crew' && crews.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <button 
                            onClick={handleAddResourceToAPU}
                            disabled={!resourceToAdd}
                            className="w-full bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold py-1.5 rounded transition-colors disabled:opacity-50"
                        >
                            + Agregar
                        </button>
                    </div>
                </div>

             </div>

             {/* Footer Actions */}
             <div className="p-5 border-t border-slate-200 bg-slate-50 flex gap-3">
                 <button 
                    onClick={handleCancelTaskChanges}
                    className="flex-1 bg-white border border-slate-300 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-100 transition-all flex justify-center items-center gap-2"
                 >
                    <X size={18} /> Cancelar
                 </button>
                 <button 
                    onClick={handleSaveTaskChanges}
                    className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all flex justify-center items-center gap-2"
                 >
                    <Save size={18} /> {isNewTask ? 'Crear Tarea' : 'Guardar Cambios'}
                 </button>
             </div>
          </aside>
      )}

      {/* --- CREW EDITOR SIDE PANEL --- */}
      {editingCrew && (
          <aside className="w-[550px] max-w-full max-md:fixed max-md:inset-0 max-md:w-full max-md:!h-[100dvh] max-md:!rounded-none max-md:!z-50 flex-shrink-0 bg-white border-l border-slate-200 shadow-2xl flex flex-col h-[calc(100vh-80px)] sticky top-0 rounded-l-xl animate-in slide-in-from-right z-20">
             {/* Header */}
             <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-start">
                <div>
                    <span className="text-[10px] font-bold uppercase text-orange-600 tracking-wider">Configuración de Cuadrilla</span>
                    <h3 className="font-bold text-lg text-slate-800 leading-tight mt-1">{editingCrew.name}</h3>
                    <p className="text-xs text-slate-500 mt-1">{editingCrew.description || 'Sin descripción'}</p>
                </div>
                <button onClick={() => setEditingCrew(null)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
                    <X size={20} />
                </button>
             </div>
             {/* ... (Existing Crew Editor Body) ... */}
             <div className="flex-1 overflow-y-auto p-5 space-y-6">
                 {/* ... Content ... */}
             </div>
          </aside>
      )}

      {/* --- REPORT PREVIEW MODAL --- */}
      {showReport && (
          <div id="da-report-modal" className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex flex-col animate-in fade-in duration-200">
             <style>{`@media print{@page{size:A4 portrait;margin:0;}#da-report-modal{background-color:white!important;backdrop-filter:none!important;display:block!important;}#da-report-toolbar{display:none!important;}#da-report-scroll{display:block!important;overflow:visible!important;background-color:transparent!important;padding:0!important;}#report-portal{transform:none!important;box-shadow:none!important;width:210mm!important;min-height:auto!important;padding:15mm!important;margin:0 auto!important;}}`}</style>

             {/* Toolbar */}
             <div id="da-report-toolbar" className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0">
                <div className="flex items-center gap-4">
                   <h3 className="font-bold text-slate-800 flex items-center gap-2"><BarChart3 size={20} className="text-slate-600" /> Auditoría de Base de Datos</h3>
                   <div className="h-6 w-px bg-slate-200 mx-2"></div>
                   
                   {/* Configuration Toggles */}
                   <div className="flex items-center gap-3 text-sm mr-4">
                       <label className="flex items-center gap-2 cursor-pointer select-none">
                          <div onClick={() => setReportConfig({...reportConfig, includeIntegrity: !reportConfig.includeIntegrity})} className={`transition-colors ${reportConfig.includeIntegrity ? 'text-blue-600' : 'text-slate-300'}`}>
                             {reportConfig.includeIntegrity ? <CheckSquare size={18} /> : <Square size={18} />}
                          </div>
                          <span className={reportConfig.includeIntegrity ? 'text-slate-700 font-medium' : 'text-slate-400'}>Auditoría Salud</span>
                       </label>
                       <label className="flex items-center gap-2 cursor-pointer select-none">
                          <div onClick={() => setReportConfig({...reportConfig, includeStats: !reportConfig.includeStats})} className={`transition-colors ${reportConfig.includeStats ? 'text-blue-600' : 'text-slate-300'}`}>
                             {reportConfig.includeStats ? <CheckSquare size={18} /> : <Square size={18} />}
                          </div>
                          <span className={reportConfig.includeStats ? 'text-slate-700 font-medium' : 'text-slate-400'}>Estadísticas</span>
                       </label>
                       <label className="flex items-center gap-2 cursor-pointer select-none">
                          <div onClick={() => setReportConfig({...reportConfig, includeCharts: !reportConfig.includeCharts})} className={`transition-colors ${reportConfig.includeCharts ? 'text-blue-600' : 'text-slate-300'}`}>
                             {reportConfig.includeCharts ? <CheckSquare size={18} /> : <Square size={18} />}
                          </div>
                          <span className={reportConfig.includeCharts ? 'text-slate-700 font-medium' : 'text-slate-400'}>Gráficos</span>
                       </label>
                       <label className="flex items-center gap-2 cursor-pointer select-none">
                          <div onClick={() => setReportConfig({...reportConfig, includeFullList: !reportConfig.includeFullList})} className={`transition-colors ${reportConfig.includeFullList ? 'text-blue-600' : 'text-slate-300'}`}>
                             {reportConfig.includeFullList ? <CheckSquare size={18} /> : <Square size={18} />}
                          </div>
                          <span className={reportConfig.includeFullList ? 'text-slate-700 font-medium' : 'text-slate-400'}>Listados Completos</span>
                       </label>
                   </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex bg-slate-100 rounded-lg p-1 gap-1">
                      <button onClick={() => setReportScale(s => Math.max(0.5, s - 0.1))} className="p-1.5 hover:bg-white rounded shadow-sm text-slate-600"><ZoomOut size={16}/></button>
                      <span className="text-xs font-mono font-bold w-12 flex items-center justify-center text-slate-500">{Math.round(reportScale * 100)}%</span>
                      <button onClick={() => setReportScale(s => Math.min(2, s + 0.1))} className="p-1.5 hover:bg-white rounded shadow-sm text-slate-600"><ZoomIn size={16}/></button>
                   </div>
                    <button 
                       onClick={() => window.print()}
                       className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all"
                    >
                       <Printer size={18} /> Imprimir / PDF
                    </button>
                    <button onClick={() => setShowReport(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500"><X size={24}/></button>
                </div>
             </div>

             {/* Preview Area */}
             <div id="da-report-scroll" className="flex-1 overflow-auto bg-slate-500/10 p-8 flex justify-center items-start">
                <div 
                   id="report-portal"
                   className="bg-white shadow-2xl transition-transform origin-top duration-200"
                   style={{ 
                      width: '210mm', minHeight: '297mm', padding: '15mm',
                      transform: `scale(${reportScale})`
                   }}
                >
                    <div id="report-content" className="font-sans text-slate-900 space-y-8">
                        {/* Header */}
                        <div className="flex justify-between items-end border-b-2 border-slate-900 pb-4">
                           <div>
                              <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900">Auditoría de Base de Datos</h1>
                              <p className="text-sm font-medium text-slate-500 mt-1">Fecha: {new Date().toLocaleDateString('es-ES', { dateStyle: 'full' })}</p>
                           </div>
                           <div className="text-right">
                              <div className="text-lg font-bold text-slate-800">{project.companyName || 'EMPRESA CONSTRUCTORA'}</div>
                              <div className="text-xs text-slate-400">Sistema ERP</div>
                           </div>
                        </div>

                        {/* SECTION 1: INTEGRITY HEALTH CHECK */}
                        {reportConfig.includeIntegrity && (
                            <div className="break-inside-avoid">
                                <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2 border-l-4 border-red-500 pl-3">
                                    <Activity size={20} className="text-red-500" /> Diagnóstico de Salud (Integridad)
                                </h2>
                                <div className="grid grid-cols-3 gap-4">
                                    <div className={`p-4 rounded-lg border ${reportStats.materialsZeroCostList.length > 0 ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                                        <div className="text-xs font-bold text-slate-500 uppercase">Materiales con Costo $0</div>
                                        <div className={`text-2xl font-black ${reportStats.materialsZeroCostList.length > 0 ? 'text-red-600' : 'text-green-600'}`}>{reportStats.materialsZeroCostList.length}</div>
                                        {reportStats.materialsZeroCostList.length > 0 && (
                                            <ul className="mt-2 text-[10px] text-red-500 list-disc list-inside">
                                                {reportStats.materialsZeroCostList.slice(0,3).map(m => <li key={m.id}>{m.name}</li>)}
                                                {reportStats.materialsZeroCostList.length > 3 && <li>... y {reportStats.materialsZeroCostList.length - 3} más</li>}
                                            </ul>
                                        )}
                                    </div>
                                    <div className={`p-4 rounded-lg border ${reportStats.tasksZeroYieldList.length > 0 ? 'bg-amber-50 border-amber-100' : 'bg-green-50 border-green-100'}`}>
                                        <div className="text-xs font-bold text-slate-500 uppercase">Tareas sin Rendimiento</div>
                                        <div className={`text-2xl font-black ${reportStats.tasksZeroYieldList.length > 0 ? 'text-amber-600' : 'text-green-600'}`}>{reportStats.tasksZeroYieldList.length}</div>
                                    </div>
                                    <div className={`p-4 rounded-lg border ${reportStats.tasksWithoutAPUList.length > 0 ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                                        <div className="text-xs font-bold text-slate-500 uppercase">Tareas sin Análisis (APU)</div>
                                        <div className={`text-2xl font-black ${reportStats.tasksWithoutAPUList.length > 0 ? 'text-red-600' : 'text-green-600'}`}>{reportStats.tasksWithoutAPUList.length}</div>
                                        {reportStats.tasksWithoutAPUList.length > 0 && (
                                            <p className="text-[10px] text-red-400 mt-1">Requieren configuración de recursos.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* SECTION 2: CHARTS */}
                        {reportConfig.includeCharts && (
                            <div className="break-inside-avoid">
                                <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2 border-l-4 border-blue-500 pl-3">
                                    <PieChartIcon size={20} className="text-blue-500" /> Distribución de Insumos
                                </h2>
                                <div className="grid grid-cols-2 gap-8 h-48">
                                    <div className="border border-slate-200 rounded p-4">
                                        <h3 className="text-xs font-bold text-slate-500 uppercase mb-2 text-center">Top 5 Categorías</h3>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={reportStats.distributionData}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={25}
                                                    outerRadius={40}
                                                    paddingAngle={5}
                                                    dataKey="value"
                                                    isAnimationActive={false}
                                                >
                                                    {reportStats.distributionData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                                    ))}
                                                </Pie>
                                                <Legend wrapperStyle={{ fontSize: '10px' }} layout="vertical" align="right" />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div className="border border-slate-200 rounded p-4">
                                        <h3 className="text-xs font-bold text-slate-500 uppercase mb-2 text-center">Costo Mano de Obra (Hora)</h3>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={reportStats.laborChartData} layout="vertical">
                                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                                <XAxis type="number" fontSize={8} tickFormatter={(v) => `$${v}`} />
                                                <YAxis dataKey="name" type="category" width={80} fontSize={8} />
                                                <Bar dataKey="Costo" fill="#10b981" barSize={15} radius={[0, 4, 4, 0]} isAnimationActive={false} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* SECTION 3: STATS TABLES */}
                        {reportConfig.includeStats && (
                            <div className="grid grid-cols-2 gap-8 break-inside-avoid">
                                <div>
                                    <h3 className="text-sm font-bold text-slate-700 mb-2 uppercase">Materiales Más Costosos</h3>
                                    <table className="w-full text-xs text-left border border-slate-200">
                                        <thead className="bg-slate-100">
                                            <tr>
                                                <th className="p-2 border-b">Nombre</th>
                                                <th className="p-2 border-b text-right">Costo Unit.</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {reportStats.topMaterials.map((m, i) => (
                                                <tr key={m.id} className="border-b last:border-0">
                                                    <td className="p-2 truncate max-w-[120px]" title={m.name}>{m.name}</td>
                                                    <td className="p-2 text-right font-mono">${m.cost.toFixed(2)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-700 mb-2 uppercase">Métricas Generales</h3>
                                    <div className="space-y-2">
                                        <div className="flex justify-between p-2 bg-slate-50 rounded border border-slate-200">
                                            <span className="text-xs text-slate-500">Total Materiales</span>
                                            <span className="text-xs font-bold">{reportStats.totalMaterials}</span>
                                        </div>
                                        <div className="flex justify-between p-2 bg-slate-50 rounded border border-slate-200">
                                            <span className="text-xs text-slate-500">Total Tareas (APU)</span>
                                            <span className="text-xs font-bold">{reportStats.totalTasks}</span>
                                        </div>
                                        <div className="flex justify-between p-2 bg-slate-50 rounded border border-slate-200">
                                            <span className="text-xs text-slate-500">Costo Promedio Mano Obra</span>
                                            <span className="text-xs font-bold font-mono">${reportStats.avgLaborCost.toFixed(2)}/h</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* SECTION 4: FULL LIST */}
                        {reportConfig.includeFullList && (
                            <div>
                                <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2 border-l-4 border-slate-500 pl-3 break-before-page">
                                    <ListChecks size={20} className="text-slate-500" /> Listado Completo de Tareas y APU
                                </h2>
                                <table className="w-full text-xs text-left border border-slate-200">
                                    <thead className="bg-slate-100">
                                        <tr>
                                            <th className="p-2 border">Tarea</th>
                                            <th className="p-2 border">Unidad</th>
                                            <th className="p-2 border text-right">Rend.</th>
                                            <th className="p-2 border text-right">Costo MO</th>
                                            <th className="p-2 border text-right">Costo Mat.</th>
                                            <th className="p-2 border text-right font-bold">Total Unit.</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tasks.map((t, i) => {
                                            const analysis = calculateUnitPrice(t, yieldsIndex, materialsMap, toolYieldsIndex, toolsMap, taskCrewYieldsIndex, crewsMap, laborCategoriesMap, 9, taskLaborYieldsIndex);
                                            return (
                                                <tr key={t.id} className="border-b last:border-0 break-inside-avoid">
                                                    <td className="p-2 border-r">{t.name}</td>
                                                    <td className="p-2 border-r text-center">{t.unit}</td>
                                                    <td className="p-2 border-r text-right">{t.dailyYield}</td>
                                                    <td className="p-2 border-r text-right">${analysis.laborCost.toFixed(2)}</td>
                                                    <td className="p-2 border-r text-right">${analysis.materialCost.toFixed(2)}</td>
                                                    <td className="p-2 text-right font-bold">${analysis.totalUnitCost.toFixed(2)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="mt-8 pt-4 border-t border-slate-200 text-center text-[10px] text-slate-400">
                            Auditoría generada el {new Date().toLocaleString()} por Obraflow
                        </div>
                    </div>
                </div>
             </div>
          </div>
      )}

      {/* --- SMART IMPORT MODAL --- */}
      {showSmartImport && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col h-[500px]">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-lg text-slate-800">Importar Excel</h3>
                    <button onClick={() => setShowSmartImport(false)}><X className="text-slate-400 hover:text-slate-600" /></button>
                </div>
                <div className="p-4 flex-1 flex flex-col gap-2">
                    <div className="text-xs text-slate-500 bg-blue-50 p-2 rounded border border-blue-100">
                        <p className="font-bold text-blue-700 mb-1">Instrucciones de Copiado (Excel):</p>
                        <p>Copie las celdas de su Excel y péguelas debajo. El orden de columnas debe ser:</p>
                        <p className="font-mono text-slate-800 mt-1 bg-white p-1 rounded border border-blue-100">{getImportInstructions()}</p>
                    </div>
                    <textarea 
                        className="flex-1 w-full p-3 border border-slate-300 rounded text-xs font-mono focus:outline-blue-500 resize-none"
                        placeholder="Pegue aquí los datos..."
                        value={rawText}
                        onChange={e => setRawText(e.target.value)}
                    />
                </div>
                <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
                    <button onClick={() => setShowSmartImport(false)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-200 rounded">Cancelar</button>
                    <button onClick={handleProcessSmartImport} className="px-4 py-2 bg-emerald-600 text-white font-bold rounded hover:bg-emerald-700 shadow-md">Procesar Datos</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};