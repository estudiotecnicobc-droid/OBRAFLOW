import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useERP } from '../context/ERPContext';
import { calculateUnitPrice, addDays, calculateDuration } from '../services/calculationService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, ComposedChart, Area, Line } from 'recharts';
import {
  DollarSign, Hammer, Package, Clock, Wrench, FileText,
  Download, ShoppingCart, ChevronRight, Printer, FileSpreadsheet,
  ZoomIn, ZoomOut, Image as ImageIcon, X, Move, Eye, CheckSquare, Square,
  BarChart2, TrendingUp, FileCheck, FolderPlus, PieChart as PieChartIcon,
  CheckCircle2, Circle, ArrowRight, BookOpen, Ruler, BarChart as BarChartIcon,
} from 'lucide-react';
import { ProjectWizard } from './ProjectWizard';

const COLORS = ['#0ea5e9', '#22c55e', '#9333ea', '#eab308', '#f97316', '#ef4444'];

// ── Tarjeta de arranque para proyectos vacíos ──────────────────────────────────

const OnboardingChecklist: React.FC<{
  materialsCount: number;
  apusCount: number;
  onNavigate?: (tab: string) => void;
}> = ({ materialsCount, apusCount, onNavigate }) => {
  const catalogDone = materialsCount > 0 && apusCount > 0;
  const catalogInProgress = !catalogDone && (materialsCount > 0 || apusCount > 0);

  const catalogStatus = catalogDone
    ? { label: 'Listo para computar', cls: 'bg-emerald-100 text-emerald-700' }
    : catalogInProgress
      ? { label: 'En proceso', cls: 'bg-amber-100 text-amber-700' }
      : { label: 'Pendiente', cls: 'bg-slate-100 text-slate-500' };

  interface SimpleStep {
    number: number;
    title: string;
    description: string;
    actionLabel: string;
    tab: string;
    done: boolean;
  }
  const simpleSteps: SimpleStep[] = [
    {
      number: 2,
      title: 'Medí tu proyecto',
      description: 'Usá el Calculador Chandías para medir por dimensiones y generar ítems automáticamente.',
      actionLabel: 'Iniciar Cómputo',
      tab: 'chandias',
      done: false,
    },
    {
      number: 3,
      title: 'Valorizá la obra',
      description: 'Revisá los ítems del presupuesto, ajustá cantidades y precios.',
      actionLabel: 'Ver Presupuesto',
      tab: 'budget',
      done: false,
    },
    {
      number: 4,
      title: 'Generá entregables',
      description: 'Descargá fichas APU, resúmenes de presupuesto y reportes de gestión.',
      actionLabel: 'Centro de Reportes',
      tab: 'reports',
      done: false,
    },
  ];

  return (
    <div className="bg-white border border-blue-100 rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-5">
        <h3 className="text-white font-bold text-lg">Empezá tu presupuesto en 4 pasos</h3>
        <p className="text-blue-100 text-sm mt-0.5">
          Este proyecto todavía no tiene ítems. Seguí el flujo para presupuestar tu obra.
        </p>
      </div>

      {/* Step 1 — expanded catalog step */}
      <div className={`px-6 py-5 border-b border-slate-100 ${catalogDone ? 'bg-emerald-50/40' : 'bg-white'}`}>
        <div className="flex items-start gap-4">
          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5 ${catalogDone ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'}`}>
            {catalogDone ? <CheckCircle2 size={18} /> : <span className="text-xs font-bold">1</span>}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className={`text-sm font-bold ${catalogDone ? 'text-emerald-700 line-through' : 'text-slate-800'}`}>
                Configurá tu catálogo de trabajo
              </span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${catalogStatus.cls}`}>
                {catalogStatus.label}
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Importá recursos globales, revisá tus materiales de empresa y elegí las APUs que vas a usar en este proyecto.
            </p>

            {/* Progress indicators */}
            <div className="flex gap-4 mb-3">
              <span className="text-xs text-slate-500">
                Materiales: <span className={`font-bold ${materialsCount > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{materialsCount > 0 ? materialsCount : '—'}</span>
              </span>
              <span className="text-xs text-slate-500">
                APUs: <span className={`font-bold ${apusCount > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>{apusCount > 0 ? apusCount : '—'}</span>
              </span>
            </div>

            {/* Three action buttons */}
            {onNavigate && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => onNavigate('admin_resources')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
                >
                  <ArrowRight size={12} /> Importar Recursos Globales
                </button>
                <button
                  onClick={() => onNavigate('admin_catalog')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 transition-colors"
                >
                  <ArrowRight size={12} /> Ver Materiales de Empresa
                </button>
                <button
                  onClick={() => onNavigate('admin_apu')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 transition-colors"
                >
                  <ArrowRight size={12} /> Importar / Crear APUs
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Steps 2–4 */}
      <div className="divide-y divide-slate-50">
        {simpleSteps.map((step, idx) => (
          <div
            key={step.number}
            className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/60 transition-colors"
          >
            <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-slate-100 text-slate-400">
              <span className="text-xs font-bold">{step.number}</span>
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-800">{step.title}</p>
              <p className="text-xs text-slate-500 mt-0.5">{step.description}</p>
            </div>

            {onNavigate && (
              <button
                onClick={() => onNavigate(step.tab)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                  idx === 0 && catalogDone
                    ? 'text-white bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-200'
                    : 'text-slate-500 bg-slate-100 hover:bg-slate-200'
                }`}
              >
                {step.actionLabel} <ArrowRight size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

interface DashboardProps {
  onNavigate?: (tab: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const { project, tasks, materials, yields, tools, toolYields, yieldsIndex, materialsMap, toolYieldsIndex, toolsMap, receptions, snapshots, laborCategoriesMap, taskLaborYieldsIndex, taskCrewYieldsIndex, crewsMap, budgetItemsLoading, tasksLoaded } = useERP();
  const [activeView, setActiveView] = useState<'stats' | 'reports'>('stats');

  // --- Wizard State ---
  const [showWizard, setShowWizard] = useState(false);

  // Check if we should show wizard on load (e.g. no items and default name, effectively a "New Project" placeholder)
  useEffect(() => {
      if (project.items.length === 0 && project.name === 'Nuevo Proyecto') {
          // Optional: Auto-open wizard if it's a blank default project
          // setShowWizard(true); 
      }
  }, [project]);

  // --- Detail Modal State ---
  const [detailModalType, setDetailModalType] = useState<'material' | 'labor' | 'tool' | null>(null);

  // --- Print Preview State ---
  const [showPreview, setShowPreview] = useState(false);
  const [printScale, setPrintScale] = useState(1);
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [includeProcurement, setIncludeProcurement] = useState(true);
  const [includeTechSpecs, setIncludeTechSpecs] = useState(true);
  const [includeCharts, setIncludeCharts] = useState(true); // New state for charts in report
  const logoInputRef = useRef<HTMLInputElement>(null);

  // 1. Cálculos de Estadísticas Globales
  const stats = useMemo(() => {
    let totalCost = 0;
    let totalMaterialCost = 0;
    let totalLaborCost = 0;
    let totalToolCost = 0;
    let totalFixedCost = 0;
    let totalDurationDays = 0;
    const byRubro: Record<string, number> = {}; // costo directo agrupado por rubro/categoría
    let discarded = 0;

    project.items.forEach(item => {
      const task = tasks.find(t => t.id === item.taskId);
      if (!task) {
        discarded++;
        return;
      }
      const unitAnalysis = calculateUnitPrice(task, yieldsIndex, materialsMap, toolYieldsIndex, toolsMap, taskCrewYieldsIndex, crewsMap, laborCategoriesMap, 9, taskLaborYieldsIndex);
      const itemTotal = unitAnalysis.totalUnitCost * item.quantity;

      totalCost          += itemTotal;
      totalMaterialCost  += unitAnalysis.materialCost * item.quantity;
      totalLaborCost     += unitAnalysis.laborCost    * item.quantity;
      totalToolCost      += unitAnalysis.toolCost     * item.quantity;
      totalFixedCost     += unitAnalysis.fixedCost    * item.quantity;

      const rubro = task.category?.trim() || 'Sin categoría';
      byRubro[rubro] = (byRubro[rubro] || 0) + itemTotal;

      const duration = item.manualDuration || (task.dailyYield > 0 ? item.quantity / task.dailyYield : 1);
      totalDurationDays += duration;
    });

    if (discarded > 0) {
      console.warn(`[Dashboard] ${discarded}/${project.items.length} ítems descartados: task no encontrada. Tasks disponibles: ${tasks.length}`);
    }

    // Costo indirecto: usa el % configurado en el proyecto. Fallback: 15%.
    // Nota: solo se aplica sobre costo directo (totalCost), nunca sobre sí mismo.
    const indirectPct = (project.pricing?.generalExpensesPercent ?? 15) / 100;
    const indirectCost = totalCost * indirectPct;
    const totalCostWithIndirects = totalCost + indirectCost;

    return {
      totalCost,
      totalCostWithIndirects,
      totalMaterialCost,
      totalLaborCost,
      totalToolCost,
      totalFixedCost,
      indirectCost,
      totalDurationDays,
      byRubro,
    };
  }, [project, tasks, yieldsIndex, materialsMap, toolYieldsIndex, toolsMap, laborCategoriesMap, taskLaborYieldsIndex, taskCrewYieldsIndex, crewsMap]);

  // --- REPORT S-CURVE CALCULATION ---
  const sCurveData = useMemo(() => {
    const startDate = new Date(project.startDate);
    let maxDuration = 0;
    
    // Calculate max duration approx
    project.items.forEach(item => {
        const task = tasks.find(t => t.id === item.taskId);
        if(!task) return;
        const dur = item.manualDuration || calculateDuration(item.quantity, task.dailyYield);
        const itemEndDay = (new Date(item.startDate || project.startDate).getTime() - startDate.getTime()) / (86400000) + dur;
        if(itemEndDay > maxDuration) maxDuration = itemEndDay;
    });

    if (maxDuration === 0) maxDuration = 30;

    // --- PRE-CALCULATE PHYSICAL PROGRESS HISTORY ---
    // 1. Map snapshots to { date, earnedValue }
    const progressHistory = snapshots.map(s => {
        const earnedValue = s.items.reduce((acc, item) => {
            const task = tasks.find(t => t.id === item.taskId);
            if (!task) return acc;
            // Use current unit prices for consistent "Physical Progress" valuation
            const analysis = calculateUnitPrice(task, yieldsIndex, materialsMap, toolYieldsIndex, toolsMap, taskCrewYieldsIndex, crewsMap, laborCategoriesMap, 9, taskLaborYieldsIndex);
            return acc + (analysis.totalUnitCost * item.quantity * (item.progress || 0) / 100);
        }, 0);
        return { date: new Date(s.date), value: earnedValue };
    });

    // 2. Add current state
    const currentEarnedValue = project.items.reduce((acc, item) => {
        const task = tasks.find(t => t.id === item.taskId);
        if (!task) return acc;
        const analysis = calculateUnitPrice(task, yieldsIndex, materialsMap, toolYieldsIndex, toolsMap, taskCrewYieldsIndex, crewsMap, laborCategoriesMap, 9, taskLaborYieldsIndex);
        return acc + (analysis.totalUnitCost * item.quantity * (item.progress || 0) / 100);
    }, 0);
    progressHistory.push({ date: new Date(), value: currentEarnedValue });

    // 3. Sort by date
    progressHistory.sort((a, b) => a.date.getTime() - b.date.getTime());

    const points = [];
    const weeks = Math.ceil(maxDuration / 7) + 2;
    const totalBudget = stats.totalCost;

    for (let w = 0; w <= weeks; w++) {
        const currentDate = addDays(project.startDate, w * 7);
        const dateObj = new Date(currentDate);
        let cumulativePlanned = 0;
        
        if (w <= Math.ceil(maxDuration / 7)) {
            const progress = Math.min(1, w / (maxDuration/7)); 
            const easedProgress = progress * progress * (3 - 2 * progress);
            cumulativePlanned = totalBudget * easedProgress;
        } else {
            cumulativePlanned = totalBudget;
        }

        const receptionsUntilNow = receptions.filter(r => new Date(r.date) <= dateObj);
        let cumulativeActual = 0;
        receptionsUntilNow.forEach(r => {
             r.items.forEach(ri => {
                 const mat = materialsMap[ri.materialId];
                 if(mat) cumulativeActual += mat.cost * ri.quantityReceived;
             });
        });

        // Find latest physical progress for this date
        // We take the last snapshot/point that is <= currentDate
        const progressPoint = progressHistory.filter(p => p.date <= dateObj).pop();
        const avanceFisico = progressPoint ? Math.round(progressPoint.value) : 0;

        const isFuture = dateObj > new Date();

        points.push({
            name: `Sem ${w}`,
            "Valor Planificado (PV)": Math.round(cumulativePlanned),
            "Costo Real (AC)": isFuture ? null : Math.round(cumulativeActual),
            "Valor Ganado (EV)": isFuture ? null : avanceFisico
        });
    }
    return points;
  }, [project, tasks, receptions, yieldsIndex, materialsMap, toolYieldsIndex, toolsMap, laborCategoriesMap, taskLaborYieldsIndex, taskCrewYieldsIndex, crewsMap, stats, snapshots]);

  // Calculate current EVM metrics
  const currentMetrics = useMemo(() => {
      if (sCurveData.length === 0) return null;
      const lastPoint = [...sCurveData].reverse().find(p => p["Valor Ganado (EV)"] !== null);
      if (!lastPoint) return null;

      const ev = lastPoint["Valor Ganado (EV)"] || 0;
      const ac = lastPoint["Costo Real (AC)"] || 0;
      const pv = lastPoint["Valor Planificado (PV)"] || 0;

      return {
          ev, ac, pv,
          sv: ev - pv,
          cv: ev - ac,
          spi: pv !== 0 ? ev / pv : 0,
          cpi: ac !== 0 ? ev / ac : 0
      };
  }, [sCurveData]);

  // --- RESOURCE HISTOGRAM CALCULATION ---
  const resourceHistogramData = useMemo(() => {
      if (!detailModalType) return [];

      const weeklyData: Record<string, number> = {};
      const startDate = new Date(project.startDate);
      let maxWeek = 0;

      project.items.forEach(item => {
          const task = tasks.find(t => t.id === item.taskId);
          if (!task) return;

          const analysis = calculateUnitPrice(task, yieldsIndex, materialsMap, toolYieldsIndex, toolsMap, taskCrewYieldsIndex, crewsMap, laborCategoriesMap, 9, taskLaborYieldsIndex);
          const duration = item.manualDuration || (task.dailyYield > 0 ? Math.ceil(item.quantity / task.dailyYield) : 1);
          
          // Determine cost based on selected type
          let totalItemCost = 0;
          if (detailModalType === 'labor') totalItemCost = analysis.laborCost * item.quantity;
          if (detailModalType === 'material') totalItemCost = analysis.materialCost * item.quantity;
          if (detailModalType === 'tool') totalItemCost = analysis.toolCost * item.quantity;

          if (totalItemCost <= 0) return;

          // Distribute cost over duration (Simplified Linear Distribution)
          const costPerDay = totalItemCost / duration;
          const startOffsetDays = item.startDate 
              ? Math.ceil((new Date(item.startDate).getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) 
              : 0;

          for (let d = 0; d < duration; d++) {
              const currentDayIndex = startOffsetDays + d;
              if (currentDayIndex < 0) continue;
              
              const weekIndex = Math.floor(currentDayIndex / 7);
              if (weekIndex > maxWeek) maxWeek = weekIndex;

              weeklyData[`Semana ${weekIndex + 1}`] = (weeklyData[`Semana ${weekIndex + 1}`] || 0) + costPerDay;
          }
      });

      // Convert to array and sort
      const chartData = [];
      for (let i = 0; i <= maxWeek; i++) {
          chartData.push({
              name: `Sem ${i + 1}`,
              Monto: Math.round(weeklyData[`Semana ${i + 1}`] || 0)
          });
      }
      return chartData;
  }, [detailModalType, project, tasks, yieldsIndex, materialsMap, toolYieldsIndex, toolsMap, laborCategoriesMap, taskLaborYieldsIndex, taskCrewYieldsIndex, crewsMap]);

  // --- RESOURCE BREAKDOWN (PARETO) ---
  const resourceBreakdownData = useMemo(() => {
      if (!detailModalType) return [];
      
      const map: Record<string, number> = {};

      project.items.forEach(item => {
          const task = tasks.find(t => t.id === item.taskId);
          if (!task) return;

          if (detailModalType === 'labor') {
              // For labor, categorize by Task Category since we don't have explicit roles in Item
              const cat = task.category || 'General';
              const cost = task.laborCost * item.quantity;
              map[cat] = (map[cat] || 0) + cost;
          } else if (detailModalType === 'material') {
              const taskYields = yieldsIndex[task.id] || [];
              taskYields.forEach(y => {
                  const mat = materialsMap[y.materialId];
                  if (mat) {
                      const cost = mat.cost * y.quantity * item.quantity;
                      map[mat.name] = (map[mat.name] || 0) + cost;
                  }
              });
          } else if (detailModalType === 'tool') {
              const itemTools = toolYieldsIndex[task.id] || [];
              itemTools.forEach(t => {
                  const tool = toolsMap[t.toolId];
                  if (tool) {
                      const cost = tool.costPerHour * t.hoursPerUnit * item.quantity;
                      map[tool.name] = (map[tool.name] || 0) + cost;
                  }
              });
          }
      });

      // Return top 6 categories/items
      return Object.entries(map)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 6);

  }, [detailModalType, project, tasks, yieldsIndex, materialsMap, toolYieldsIndex, toolsMap, laborCategoriesMap, taskLaborYieldsIndex, taskCrewYieldsIndex, crewsMap]);


  // 2. Reporte: Consolidado de Materiales (Explosión de Insumos)
  const materialProcurementList = useMemo(() => {
    const list: Record<string, { name: string, unit: string, totalQty: number, cost: number }> = {};
    
    project.items.forEach(item => {
      // Use indexed yields
      const taskYields = yieldsIndex[item.taskId] || [];
      taskYields.forEach(y => {
        const mat = materialsMap[y.materialId];
        if (mat) {
          if (!list[mat.id]) {
            list[mat.id] = { name: mat.name, unit: mat.unit, totalQty: 0, cost: mat.cost };
          }
          list[mat.id].totalQty += y.quantity * item.quantity;
        }
      });
    });

    return Object.values(list).sort((a, b) => a.name.localeCompare(b.name));
  }, [project, yieldsIndex, materialsMap]);

  // 3. Reporte: Detalle Técnico de Tareas
  const taskDetailReport = useMemo(() => {
    return project.items.map(item => {
      const task = tasks.find(t => t.id === item.taskId);
      const itemYields = (yieldsIndex[item.taskId] || []).map(y => ({
        ...y,
        name: materialsMap[y.materialId]?.name || 'Desconocido',
        unit: materialsMap[y.materialId]?.unit || '-',
        totalNeeded: y.quantity * item.quantity
      }));
      const itemTools = (toolYieldsIndex[item.taskId] || []).map(ty => ({
        ...ty,
        name: toolsMap[ty.toolId]?.name || 'Equipo',
        totalHours: ty.hoursPerUnit * item.quantity
      }));

      return {
        ...item,
        taskName: task?.name || '?',
        taskUnit: task?.unit || '-',
        taskCategory: task?.category || 'S/C',
        materials: itemYields,
        tools: itemTools
      };
    });
  }, [project, tasks, yieldsIndex, materialsMap, toolYieldsIndex, toolsMap, laborCategoriesMap, taskLaborYieldsIndex, taskCrewYieldsIndex, crewsMap]);

  // Pie de familias: solo costos directos (COSTO INDIRECTO se muestra en tarjeta KPI aparte).
  // Así la suma del pie = totalCost (costo directo total), sin inflación por indirectos.
  const costData = [
    { name: 'MATERIAL',     value: stats.totalMaterialCost },
    { name: 'MANO DE OBRA', value: stats.totalLaborCost    },
    { name: 'EQUIPOS',      value: stats.totalToolCost     },
    { name: 'SUBCONTRATO',  value: stats.totalFixedCost    },
  ].filter(d => d.value > 0);

  const exportCSV = (data: any[], filename: string) => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(obj => Object.values(obj).map(v => `"${v}"`).join(',')).join('\n');
    const csvContent = "data:text/csv;charset=utf-8," + headers + "\n" + rows;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCompanyLogo(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Check trigger for wizard (e.g., accessed via a specific action or initial state)
  const handleOpenWizard = () => setShowWizard(true);

  if (budgetItemsLoading || !tasksLoaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-slate-400 animate-pulse">Cargando datos del proyecto...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      
      {/* WIZARD OVERLAY */}
      {showWizard && <ProjectWizard onComplete={() => setShowWizard(false)} />}

      {/* CSS Injection for Print Media */}
      <style>{`
        @media print {
          @page { margin: 0.5cm; size: auto; }
          body > *:not(#print-portal) { display: none !important; }
          #print-portal { display: block !important; position: absolute; top: 0; left: 0; width: 100%; z-index: 9999; }
          #print-content { width: 100% !important; transform: none !important; box-shadow: none !important; border: none !important; margin: 0 !important; }
          .no-print { display: none !important; }
          .break-before-page { break-before: page; }
          .break-inside-avoid { break-inside: avoid; }
        }
      `}</style>

      {/* Header & Tabs */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold text-slate-800">{project.name}</h2>
                <button
                    onClick={handleOpenWizard}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
                >
                    <FolderPlus size={14} /> Configurar proyecto
                </button>
            </div>
            <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-slate-500">Cliente: {project.client}</span>
                <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                <span className="text-sm font-bold text-blue-600">Total: ${stats.totalCostWithIndirects.toLocaleString()}</span>
            </div>
        </div>
        <div className="flex items-center gap-2">
           <button 
             onClick={() => { setShowPreview(true); setIncludeCharts(true); setIncludeProcurement(true); setIncludeTechSpecs(true); }}
             className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-sm font-bold flex items-center gap-2 shadow-lg transition-all"
           >
             <FileCheck size={16} /> Generar Reporte Completo
           </button>
           
           <div className="flex bg-white p-1 rounded-xl shadow-sm border border-slate-200">
               <button 
                 onClick={() => setActiveView('stats')}
                 className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeView === 'stats' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:bg-slate-50'}`}
               >
                 Estadísticas
               </button>
               <button 
                 onClick={() => setActiveView('reports')}
                 className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeView === 'reports' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:bg-slate-50'}`}
               >
                 Reportes e Ingeniería
               </button>
           </div>
        </div>
      </div>

      {/* ── TARJETA DE ARRANQUE — solo cuando el proyecto está vacío ─── */}
      {project.items.length === 0 && (
        <OnboardingChecklist
          materialsCount={materials.length}
          apusCount={tasks.length}
          onNavigate={onNavigate}
        />
      )}

      {activeView === 'stats' ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            
            {/* MATERIAL CARD */}
            <div 
                onClick={() => setDetailModalType('material')}
                className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center space-x-4 cursor-pointer hover:shadow-md hover:border-blue-200 transition-all group"
            >
                <div className="p-3 bg-blue-50 text-blue-600 rounded-full group-hover:bg-blue-600 group-hover:text-white transition-colors"><Package size={20} /></div>
                <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold group-hover:text-blue-600">Materiales</p>
                    <p className="text-lg font-bold">${stats.totalMaterialCost.toLocaleString()}</p>
                </div>
            </div>

            {/* LABOR CARD */}
            <div 
                onClick={() => setDetailModalType('labor')}
                className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center space-x-4 cursor-pointer hover:shadow-md hover:border-emerald-200 transition-all group"
            >
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-full group-hover:bg-emerald-600 group-hover:text-white transition-colors"><Hammer size={20} /></div>
                <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold group-hover:text-emerald-600">Mano de Obra</p>
                    <p className="text-lg font-bold">${stats.totalLaborCost.toLocaleString()}</p>
                </div>
            </div>

            {/* TOOLS CARD */}
            <div 
                onClick={() => setDetailModalType('tool')}
                className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center space-x-4 cursor-pointer hover:shadow-md hover:border-purple-200 transition-all group"
            >
                <div className="p-3 bg-purple-50 text-purple-600 rounded-full group-hover:bg-purple-600 group-hover:text-white transition-colors"><Wrench size={20} /></div>
                <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold group-hover:text-purple-600">Equipos</p>
                    <p className="text-lg font-bold">${stats.totalToolCost.toLocaleString()}</p>
                </div>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center space-x-4">
                <div className="p-3 bg-amber-50 text-amber-600 rounded-full"><ShoppingCart size={20} /></div>
                <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold">Subcontrato</p>
                    <p className="text-lg font-bold">${stats.totalFixedCost.toLocaleString()}</p>
                </div>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center space-x-4">
                <div className="p-3 bg-slate-100 text-slate-600 rounded-full"><Clock size={20} /></div>
                <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold">C. Indirecto</p>
                    <p className="text-lg font-bold">${stats.indirectCost.toLocaleString()}</p>
                </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                <h3 className="text-sm font-bold mb-6 text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <PieChartIcon size={16} /> Distribución por Familia
                </h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={costData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {costData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                            <Legend layout="vertical" align="right" verticalAlign="middle" />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                <h3 className="text-sm font-bold mb-6 text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <BarChart2 size={16} /> Costo Directo por Rubro
                </h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={Object.entries(stats.byRubro)
                                .sort((a, b) => b[1] - a[1])
                                .map(([name, value]) => ({ name, Costo: Math.round(value) }))}
                            layout="vertical"
                            margin={{ left: 8, right: 16 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                            <XAxis type="number" fontSize={10} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${(v/1000).toFixed(0)}k`} />
                            <YAxis type="category" dataKey="name" fontSize={10} axisLine={false} tickLine={false} width={90} />
                            <Tooltip cursor={{fill: '#f8fafc'}} formatter={(value: number) => [`$${value.toLocaleString()}`, 'Costo directo']} />
                            <Bar dataKey="Costo" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={18} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Listado de Materiales (Procurement) */}
          <div className="xl:col-span-1 bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-[700px]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
               <div>
                  <h3 className="font-bold text-slate-800 flex items-center gap-2"><ShoppingCart size={18} className="text-emerald-500" /> Lista de Procura</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Consolidado Total de Insumos</p>
               </div>
               <button 
                 onClick={() => exportCSV(materialProcurementList, 'lista_compras_obra')}
                 className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors border border-emerald-100"
               >
                 <FileSpreadsheet size={18} />
               </button>
            </div>
            <div className="flex-1 overflow-auto">
               <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 sticky top-0 border-b">
                     <tr>
                        <th className="p-3 text-slate-500">Insumo</th>
                        <th className="p-3 text-slate-500 text-right">Cant. Total</th>
                        <th className="p-3 text-slate-500 text-right">Est. Costo</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                     {materialProcurementList.map((m, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                           <td className="p-3">
                              <div className="font-bold text-slate-700">{m.name}</div>
                              <div className="text-[10px] text-slate-400 uppercase">{m.unit}</div>
                           </td>
                           <td className="p-3 text-right font-mono font-bold text-blue-600">
                              {m.totalQty.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                           </td>
                           <td className="p-3 text-right font-mono text-slate-500">
                              ${(m.totalQty * m.cost).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                           </td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>
          </div>

          {/* Desglose de Tareas e Ingeniería */}
          <div className="xl:col-span-2 bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-[700px]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div>
                  <h3 className="font-bold text-slate-800 flex items-center gap-2"><FileText size={18} className="text-blue-500" /> Fichas Técnicas de Obra</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase">Recursos por Actividad del Presupuesto</p>
                </div>
            </div>
            
            <div className="flex-1 overflow-auto p-6 space-y-8">
               {taskDetailReport.map((t, idx) => (
                  <div key={t.id} className="border border-slate-100 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                     <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-center">
                        <div>
                           <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full uppercase mb-1 inline-block">{t.taskCategory}</span>
                           <h4 className="font-bold text-slate-800 text-sm">{idx + 1}. {t.taskName}</h4>
                        </div>
                        <div className="text-right">
                           <div className="text-xs font-bold text-slate-600">Cant: {t.quantity} {t.taskUnit}</div>
                        </div>
                     </div>
                     
                     <div className="grid grid-cols-1 md:grid-cols-2">
                        {/* Materiales */}
                        <div className="p-4 border-r border-slate-50">
                           <h5 className="text-[10px] font-bold text-slate-400 uppercase mb-3 flex items-center gap-1">
                              <Package size={12} /> Materiales Requeridos
                           </h5>
                           <div className="space-y-2">
                              {t.materials.length > 0 ? t.materials.map((m, mi) => (
                                 <div key={mi} className="flex justify-between items-center text-xs">
                                    <span className="text-slate-600">{m.name}</span>
                                    <span className="font-mono font-bold text-slate-700">{m.totalNeeded.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">{m.unit}</span></span>
                                 </div>
                              )) : <div className="text-xs text-slate-400 italic">Sin materiales asociados.</div>}
                           </div>
                        </div>
                        
                        {/* Equipos */}
                        <div className="p-4">
                           <h5 className="text-[10px] font-bold text-slate-400 uppercase mb-3 flex items-center gap-1">
                              <Wrench size={12} /> Equipos / Herramientas
                           </h5>
                           <div className="space-y-2">
                              {t.tools.length > 0 ? t.tools.map((eq, ei) => (
                                 <div key={ei} className="flex justify-between items-center text-xs">
                                    <span className="text-slate-600">{eq.name}</span>
                                    <span className="font-mono font-bold text-purple-700">{eq.totalHours.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">hs</span></span>
                                 </div>
                              )) : <div className="text-xs text-slate-400 italic">No requiere maquinaria especial.</div>}
                           </div>
                        </div>
                     </div>
                  </div>
               ))}
            </div>
          </div>
        </div>
      )}

      {/* --- RESOURCE DETAIL MODAL --- */}
      {detailModalType && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                      <div>
                          <div className="text-xs font-bold text-blue-600 uppercase mb-1">Informe Detallado</div>
                          <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                              {detailModalType === 'labor' && <><Hammer className="text-emerald-500" /> Mano de Obra</>}
                              {detailModalType === 'material' && <><Package className="text-blue-500" /> Insumos y Materiales</>}
                              {detailModalType === 'tool' && <><Wrench className="text-purple-500" /> Equipos y Herramientas</>}
                          </h3>
                      </div>
                      <button onClick={() => setDetailModalType(null)} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600"><X size={24}/></button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6">
                      
                      {/* Histogram Chart */}
                      <div className="mb-8">
                          <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                              <TrendingUp size={18} /> Histograma de Recursos (Curva de Inversión Semanal)
                          </h4>
                          <div className="h-64 bg-slate-50 rounded-xl border border-slate-100 p-4">
                              <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={resourceHistogramData}>
                                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                      <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                                      <YAxis fontSize={10} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v/1000}k`} />
                                      <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} cursor={{fill: '#f1f5f9'}} />
                                      <Bar 
                                        dataKey="Monto" 
                                        fill={detailModalType === 'labor' ? '#10b981' : detailModalType === 'tool' ? '#a855f7' : '#3b82f6'} 
                                        radius={[4, 4, 0, 0]} 
                                      />
                                  </BarChart>
                              </ResponsiveContainer>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-2 text-center">
                              Proyección estimada basada en la duración de las tareas y costo unitario.
                          </p>
                      </div>

                      {/* Top Resources Table */}
                      <div>
                          <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                              <BarChart2 size={18} /> Mayores Consumos (Top 6)
                          </h4>
                          <div className="overflow-hidden border border-slate-100 rounded-xl">
                              <table className="w-full text-sm text-left">
                                  <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-semibold">
                                      <tr>
                                          <th className="p-3 pl-4">Recurso / Categoría</th>
                                          <th className="p-3 text-right">Incidencia Total</th>
                                          <th className="p-3 pr-4 w-1/3">Participación</th>
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                      {resourceBreakdownData.map((item, idx) => {
                                          const totalVal = detailModalType === 'labor' ? stats.totalLaborCost : detailModalType === 'material' ? stats.totalMaterialCost : stats.totalToolCost;
                                          const percentage = totalVal > 0 ? (item.value / totalVal) * 100 : 0;
                                          
                                          return (
                                              <tr key={idx} className="hover:bg-slate-50/50">
                                                  <td className="p-3 pl-4 font-medium text-slate-700">{item.name}</td>
                                                  <td className="p-3 text-right font-mono text-slate-600">${item.value.toLocaleString()}</td>
                                                  <td className="p-3 pr-4">
                                                      <div className="flex items-center gap-2">
                                                          <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                                              <div 
                                                                className={`h-full rounded-full ${detailModalType === 'labor' ? 'bg-emerald-500' : detailModalType === 'tool' ? 'bg-purple-500' : 'bg-blue-500'}`} 
                                                                style={{ width: `${percentage}%` }}
                                                              />
                                                          </div>
                                                          <span className="text-[10px] font-bold text-slate-400 w-8 text-right">{percentage.toFixed(0)}%</span>
                                                      </div>
                                                  </td>
                                              </tr>
                                          )
                                      })}
                                  </tbody>
                              </table>
                          </div>
                      </div>

                  </div>
              </div>
          </div>
      )}

      {/* --- PRINT PREVIEW MODAL (FULL REPORT) --- */}
      {showPreview && (
          <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex flex-col animate-in fade-in duration-200">
             
             {/* Toolbar */}
             <div className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0">
                <div className="flex items-center gap-4">
                   <h3 className="font-bold text-slate-800 flex items-center gap-2"><Eye size={20} className="text-blue-600" /> Vista Previa de Reporte</h3>
                   <div className="h-6 w-px bg-slate-200 mx-2"></div>
                   
                   {/* View Controls */}
                   <div className="flex bg-slate-100 rounded-lg p-1 gap-1">
                      <button onClick={() => setPrintScale(s => Math.max(0.5, s - 0.1))} className="p-1.5 hover:bg-white rounded shadow-sm text-slate-600" title="Alejar"><ZoomOut size={16}/></button>
                      <span className="text-xs font-mono font-bold w-12 flex items-center justify-center text-slate-500">{Math.round(printScale * 100)}%</span>
                      <button onClick={() => setPrintScale(s => Math.min(2, s + 0.1))} className="p-1.5 hover:bg-white rounded shadow-sm text-slate-600" title="Acercar"><ZoomIn size={16}/></button>
                   </div>
                   
                   <button 
                     onClick={() => logoInputRef.current?.click()}
                     className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-blue-50 text-slate-700 text-xs font-bold rounded-lg transition-colors border border-slate-200"
                   >
                     <ImageIcon size={14} /> {companyLogo ? 'Cambiar Logo' : 'Agregar Logo'}
                   </button>
                   <input type="file" ref={logoInputRef} className="hidden" accept="image/*" onChange={handleLogoUpload} />
                </div>

                <div className="flex items-center gap-4">
                    {/* Content Toggles */}
                    <div className="flex items-center gap-3 text-sm mr-4">
                       <label className="flex items-center gap-2 cursor-pointer select-none">
                          <div onClick={() => setIncludeCharts(!includeCharts)} className={`transition-colors ${includeCharts ? 'text-blue-600' : 'text-slate-300'}`}>
                             {includeCharts ? <CheckSquare size={18} /> : <Square size={18} />}
                          </div>
                          <span className={includeCharts ? 'text-slate-700 font-medium' : 'text-slate-400'}>Gráficos</span>
                       </label>
                       <label className="flex items-center gap-2 cursor-pointer select-none">
                          <div onClick={() => setIncludeProcurement(!includeProcurement)} className={`transition-colors ${includeProcurement ? 'text-blue-600' : 'text-slate-300'}`}>
                             {includeProcurement ? <CheckSquare size={18} /> : <Square size={18} />}
                          </div>
                          <span className={includeProcurement ? 'text-slate-700 font-medium' : 'text-slate-400'}>Insumos</span>
                       </label>
                       <label className="flex items-center gap-2 cursor-pointer select-none">
                          <div onClick={() => setIncludeTechSpecs(!includeTechSpecs)} className={`transition-colors ${includeTechSpecs ? 'text-blue-600' : 'text-slate-300'}`}>
                             {includeTechSpecs ? <CheckSquare size={18} /> : <Square size={18} />}
                          </div>
                          <span className={includeTechSpecs ? 'text-slate-700 font-medium' : 'text-slate-400'}>Fichas</span>
                       </label>
                    </div>

                    <button 
                       onClick={() => window.print()}
                       className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all"
                    >
                       <Printer size={18} /> Imprimir / PDF
                    </button>
                    <button onClick={() => setShowPreview(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500"><X size={24}/></button>
                </div>
             </div>

             {/* Preview Area (Grey Background) */}
             <div className="flex-1 overflow-auto bg-slate-500/10 p-8 flex justify-center items-start cursor-move">
                
                {/* The Paper */}
                <div 
                   id="print-portal"
                   className="bg-white shadow-2xl transition-transform origin-top duration-200 ease-out"
                   style={{ 
                      width: '210mm', // A4 Width
                      minHeight: '297mm', // A4 Height
                      padding: '15mm', // Print Margins
                      transform: `scale(${printScale})`
                   }}
                >
                    {/* Print Content Container */}
                    <div id="print-content" className="space-y-6 font-sans text-slate-900">
                        
                        {/* Document Header */}
                        <div className="flex justify-between items-end border-b-2 border-slate-800 pb-4 mb-8">
                           <div>
                              <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900">Reporte Ejecutivo de Obra</h1>
                              <p className="text-sm font-medium text-slate-500 mt-1">{new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                           </div>
                           {companyLogo ? (
                               <img src={companyLogo} alt="Logo" className="h-16 object-contain max-w-[200px]" />
                           ) : (
                               <div className="text-right">
                                  <div className="text-lg font-bold text-slate-800">{project.companyName || 'EMPRESA CONSTRUCTORA'}</div>
                                  <div className="text-xs text-slate-400">ERP Construction System</div>
                               </div>
                           )}
                        </div>

                        {/* Project Info Grid */}
                        <div className="bg-slate-50 border border-slate-100 p-4 rounded-lg grid grid-cols-2 gap-4 text-sm mb-8">
                            <div>
                                <span className="block text-xs font-bold text-slate-400 uppercase">Proyecto</span>
                                <span className="font-bold text-slate-800 text-lg">{project.name}</span>
                            </div>
                            <div>
                                <span className="block text-xs font-bold text-slate-400 uppercase">Cliente</span>
                                <span className="font-medium text-slate-700">{project.client}</span>
                            </div>
                            <div>
                                <span className="block text-xs font-bold text-slate-400 uppercase">Ubicación</span>
                                <span className="font-medium text-slate-700">{project.address}</span>
                            </div>
                             <div>
                                <span className="block text-xs font-bold text-slate-400 uppercase">Presupuesto Estimado</span>
                                <span className="font-bold text-slate-800 font-mono">${stats.totalCost.toLocaleString()}</span>
                            </div>
                        </div>

                        {/* CONTENT: CHARTS */}
                        {includeCharts && (
                            <div className="mb-8 break-inside-avoid">
                                <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2 border-l-4 border-indigo-500 pl-3">
                                    <TrendingUp size={20} className="text-indigo-500" /> Análisis Financiero y de Recursos
                                </h2>
                                <div className="grid grid-cols-2 gap-6">
                                    {/* Cost Distribution */}
                                    <div className="border border-slate-200 rounded-lg p-4 bg-white">
                                        <h3 className="text-xs font-bold text-slate-500 uppercase mb-2 text-center">Distribución de Costos</h3>
                                        <div className="h-48">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie
                                                        data={costData}
                                                        cx="50%"
                                                        cy="50%"
                                                        innerRadius={40}
                                                        outerRadius={60}
                                                        paddingAngle={5}
                                                        dataKey="value"
                                                        isAnimationActive={false}
                                                    >
                                                        {costData.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                        ))}
                                                    </Pie>
                                                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                    {/* S-Curve */}
                                    <div className="border border-slate-200 rounded-lg p-4 bg-white col-span-2 lg:col-span-1">
                                        <h3 className="text-xs font-bold text-slate-500 uppercase mb-2 text-center">Curva S - Valor Ganado</h3>
                                        <div className="h-48 mb-4">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <ComposedChart data={sCurveData}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                                    <XAxis dataKey="name" fontSize={8} tickLine={false} axisLine={false} />
                                                    <YAxis fontSize={8} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v/1000}k`} />
                                                    <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                                                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                                                    <Area type="monotone" dataKey="Valor Planificado (PV)" stroke="#94a3b8" fillOpacity={0.1} fill="#94a3b8" strokeWidth={2} isAnimationActive={false} />
                                                    <Line type="monotone" dataKey="Costo Real (AC)" stroke="#ef4444" strokeWidth={2} dot={false} isAnimationActive={false} />
                                                    <Line type="monotone" dataKey="Valor Ganado (EV)" stroke="#10b981" strokeWidth={2} dot={true} isAnimationActive={false} />
                                                </ComposedChart>
                                            </ResponsiveContainer>
                                        </div>
                                        
                                        {/* EVM Metrics Summary */}
                                        {currentMetrics && (
                                            <div className="grid grid-cols-4 gap-2 text-[10px] border-t border-slate-100 pt-2">
                                                <div className="text-center">
                                                    <div className="text-slate-400">SV (Desvío Cronograma)</div>
                                                    <div className={`font-bold ${currentMetrics.sv >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                        ${Math.round(currentMetrics.sv).toLocaleString()}
                                                    </div>
                                                </div>
                                                <div className="text-center">
                                                    <div className="text-slate-400">CV (Desvío Costo)</div>
                                                    <div className={`font-bold ${currentMetrics.cv >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                        ${Math.round(currentMetrics.cv).toLocaleString()}
                                                    </div>
                                                </div>
                                                <div className="text-center">
                                                    <div className="text-slate-400">SPI (Eficiencia Cronograma)</div>
                                                    <div className={`font-bold ${currentMetrics.spi >= 1 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                        {currentMetrics.spi.toFixed(2)}
                                                    </div>
                                                </div>
                                                <div className="text-center">
                                                    <div className="text-slate-400">CPI (Eficiencia Costo)</div>
                                                    <div className={`font-bold ${currentMetrics.cpi >= 1 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                        {currentMetrics.cpi.toFixed(2)}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* CONTENT: PROCUREMENT LIST */}
                        {includeProcurement && (
                          <div className="mb-8 break-inside-avoid">
                             <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2 border-l-4 border-emerald-500 pl-3">
                                <ShoppingCart size={20} className="text-emerald-500" /> Listado Consolidado de Insumos
                             </h2>
                             <table className="w-full text-xs text-left border-collapse border border-slate-200">
                                <thead className="bg-slate-100">
                                   <tr>
                                      <th className="p-2 border border-slate-200">Recurso</th>
                                      <th className="p-2 border border-slate-200">Unidad</th>
                                      <th className="p-2 border border-slate-200 text-right">Cantidad Total</th>
                                      <th className="p-2 border border-slate-200 text-right">Costo Est.</th>
                                   </tr>
                                </thead>
                                <tbody>
                                   {materialProcurementList.map((m, i) => (
                                      <tr key={i} className="even:bg-slate-50">
                                         <td className="p-2 border border-slate-200 font-medium">{m.name}</td>
                                         <td className="p-2 border border-slate-200 text-slate-500">{m.unit}</td>
                                         <td className="p-2 border border-slate-200 text-right font-mono font-bold">{m.totalQty.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                                         <td className="p-2 border border-slate-200 text-right font-mono text-slate-500">${(m.totalQty * m.cost).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                      </tr>
                                   ))}
                                </tbody>
                             </table>
                          </div>
                        )}

                        {/* CONTENT: TECH SPECS */}
                        {includeTechSpecs && (
                           <div>
                              <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2 border-l-4 border-blue-500 pl-3 break-before-page">
                                 <FileText size={20} className="text-blue-500" /> Fichas Técnicas de Tareas
                              </h2>
                              <div className="space-y-6">
                                  {taskDetailReport.map((t, idx) => (
                                      <div key={t.id} className="border border-slate-200 rounded-lg overflow-hidden break-inside-avoid">
                                          <div className="bg-slate-100 p-2 border-b border-slate-200 flex justify-between items-center px-4">
                                              <h3 className="font-bold text-sm text-slate-800">#{idx + 1} {t.taskName}</h3>
                                              <span className="text-xs font-mono font-bold text-slate-600 bg-white px-2 rounded border border-slate-300">Total: {t.quantity} {t.taskUnit}</span>
                                          </div>
                                          <div className="p-4 grid grid-cols-2 gap-4">
                                              <div>
                                                  <div className="text-[10px] font-bold text-slate-400 uppercase mb-2">Materiales</div>
                                                  {t.materials.length > 0 ? (
                                                      <ul className="text-xs space-y-1">
                                                          {t.materials.map((m, i) => (
                                                              <li key={i} className="flex justify-between border-b border-slate-100 pb-1 last:border-0">
                                                                  <span>{m.name}</span>
                                                                  <span className="font-mono text-slate-600">{m.totalNeeded.toLocaleString()} {m.unit}</span>
                                                              </li>
                                                          ))}
                                                      </ul>
                                                  ) : <span className="text-xs italic text-slate-400">N/A</span>}
                                              </div>
                                              <div>
                                                  <div className="text-[10px] font-bold text-slate-400 uppercase mb-2">Equipos</div>
                                                  {t.tools.length > 0 ? (
                                                      <ul className="text-xs space-y-1">
                                                          {t.tools.map((to, i) => (
                                                              <li key={i} className="flex justify-between border-b border-slate-100 pb-1 last:border-0">
                                                                  <span>{to.name}</span>
                                                                  <span className="font-mono text-slate-600">{to.totalHours.toLocaleString()} hs</span>
                                                              </li>
                                                          ))}
                                                      </ul>
                                                  ) : <span className="text-xs italic text-slate-400">N/A</span>}
                                              </div>
                                          </div>
                                      </div>
                                  ))}
                              </div>
                           </div>
                        )}
                        
                        {/* Footer */}
                        <div className="mt-12 pt-4 border-t border-slate-200 text-center">
                            <p className="text-[10px] text-slate-400 uppercase">Generado por Obraflow • {new Date().getFullYear()}</p>
                        </div>
                    </div>
                </div>

             </div>
          </div>
      )}
    </div>
  );
};