
import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useERP } from '../context/ERPContext';
import { useProjectSchedule } from '../hooks/useProjectSchedule';
import {
  Calendar, Clock, AlertCircle, ArrowDown, Calculator,
  ChevronsRight, Users, Check, Layout, List, PenTool,
  ZoomIn, ZoomOut, MoveRight, Download, Printer, FileText, ChevronLeft, ChevronRight, DollarSign, TrendingUp, Crosshair,
  ChevronsDownUp, ChevronsUpDown, Eye, EyeOff, Flag, GitBranch, Activity, CalendarDays
} from 'lucide-react';
import { LinkType, ProjectDependency } from '../types';
import { toLocalDate, diffDays } from '../services/calculationService';
import { computeSchedule, resolveDependencies } from '../services/scheduleEngine';
import { comparePlanVsReal } from '../services/planVsReal';
import { APUBuilder } from './APUBuilder';
import { ResizableSplitPane } from './ResizableSplitPane';

export const Planning: React.FC = () => {
  const {
    project, tasks, tasksMap, updateBudgetItem,
    createSnapshot, snapshots, measurementSheets,
    addDependency, removeDependency
  } = useERP();

  const { evm, itemCosts, scheduledItems, cpmItems, criticalPathStats } = useProjectSchedule();

  // --- UI STATE ---
  // El Gantt dejó de ser una pestaña aparte (Etapa B): ahora es un panel que se abre al
  // lado de la tabla de Planificación, con scroll vertical compartido.
  const [viewMode, setViewMode] = useState<'table' | 'control'>('table');
  const [showGanttPanel, setShowGanttPanel] = useState(true);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  // Modo lectura por defecto: nadie cambia cantidad/avance/precedencia sin querer. "Editar"
  // habilita los inputs de la tabla (no afecta el panel de ajuste de rendimiento del APU).
  const [editMode, setEditMode] = useState(false);
  // Color de barra del Gantt a elección: por estado automático (default), por partida, o
  // el binario crítica/normal de antes de la Etapa B.
  const [barColorMode, setBarColorMode] = useState<'status' | 'category' | 'critical'>('status');
  // Cursor de fecha: "YYYY-MM-DD" elegido por el usuario, o null si está apagado.
  const [cursorDate, setCursorDate] = useState<string | null>(null);
  // Etapa C1: capas del Gantt que se prenden y apagan (solo vista, no escriben datos).
  const [showProgressLayer, setShowProgressLayer] = useState(true);
  const [showDependencies, setShowDependencies] = useState(true);
  const [showBaseline, setShowBaseline] = useState(true);

  // Gantt Specific State
  const [timeScale, setTimeScale] = useState<'day' | 'week' | 'month' | 'quarter' | 'project'>('day');
  const [ganttScale, setGanttScale] = useState(40); // Pixels per day
  const [controlSubView, setControlSubView] = useState<'table' | 'gantt'>('table');
  // scrollContainerRef: panel del Gantt (compartido entre el panel de Tabla y el de Control,
  // nunca se montan los dos a la vez). tableScrollRef: tabla de Planificación cuando el panel
  // de Gantt está abierto. sidebarRef: lista simplificada del Gantt en Seguimiento y Control.
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Fila de la tabla = barra del Gantt: misma altura en los dos, para que el scroll
  // vertical compartido alinee de verdad una con la otra.
  const ROW_HEIGHT = 44;
  const HEADER_HEIGHT = 40;
  const BAR_HEIGHT = 20;
  const BAR_Y_OFFSET = (ROW_HEIGHT - BAR_HEIGHT) / 2;

  // Collapsed Summaries State
  const [collapsedSummaries, setCollapsedSummaries] = useState<Set<string>>(new Set());

  const toggleSummary = (summaryId: string) => {
    setCollapsedSummaries(prev => {
      const next = new Set(prev);
      if (next.has(summaryId)) {
        next.delete(summaryId);
      } else {
        next.add(summaryId);
      }
      return next;
    });
  };

  // Scroll sync: el sidebar list (Control) o la tabla (Planificación) comparten el scroll
  // vertical con el SVG del Gantt. Nunca están montados los dos paneles a la vez.
  const handleChartScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const top = (e.target as HTMLDivElement).scrollTop;
    if (sidebarRef.current) sidebarRef.current.scrollTop = top;
    if (tableScrollRef.current) tableScrollRef.current.scrollTop = top;
  }, []);
  const handleSidebarScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = (e.target as HTMLDivElement).scrollTop;
  }, []);
  const handleTableScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = (e.target as HTMLDivElement).scrollTop;
  }, []);

  // Para colorear días no hábiles en el Gantt
  const workingDays = project.workingDays || [1, 2, 3, 4, 5];

  // --- ESTADO AUTOMÁTICO POR TAREA (Etapa B) ---
  // Calculado solo a partir de fechas/avance, sin tocar nada que el usuario cargó.
  const todayMidnight = useMemo(() => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d.getTime();
  }, []);

  const STATUS_COLORS: Record<string, string> = {
      no_iniciada: '#94a3b8', // slate-400
      en_curso: '#3b82f6',    // blue-500
      completada: '#22c55e',  // emerald-500
      atrasada: '#ef4444',    // red-500
  };
  const STATUS_LABELS: Record<string, string> = {
      no_iniciada: 'No iniciada',
      en_curso: 'En curso',
      completada: 'Completada',
      atrasada: 'Atrasada',
  };

  const getItemStatus = useCallback((item: { start: string; end: string; progress?: number }): keyof typeof STATUS_COLORS => {
      if ((item.progress || 0) >= 100) return 'completada';
      const start = toLocalDate(item.start).getTime();
      const end = toLocalDate(item.end).getTime();
      if (todayMidnight < start) return 'no_iniciada';
      if (todayMidnight > end) return 'atrasada';
      return 'en_curso';
  }, [todayMidnight]);

  // Color por partida (Etapa B, color a elección): hash determinístico sobre el nombre de
  // la categoría, así la misma partida siempre sale del mismo color en toda la obra.
  const CATEGORY_PALETTE = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ec4899', '#06b6d4', '#f97316', '#84cc16'];
  const getCategoryColor = useCallback((category: string): string => {
      let hash = 0;
      for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
      return CATEGORY_PALETTE[hash % CATEGORY_PALETTE.length];
  }, []);

  // Cursor de fecha (Etapa B): "¿cuánto debería estar hecho a esta fecha?", sin CPM —
  // interpolación lineal del costo planificado de cada tarea entre su inicio y su fin, igual
  // criterio que ya usa evm.PV en useProjectSchedule pero para una fecha elegida, no "hoy".
  const cursorStats = useMemo(() => {
      if (!cursorDate) return null;
      const target = toLocalDate(cursorDate).getTime();
      let planned = 0;
      let total = 0;
      cpmItems.forEach(item => {
          const cost = item.totalCost || 0;
          total += cost;
          const start = toLocalDate(item.start).getTime();
          const end = toLocalDate(item.end).getTime();
          let frac = 0;
          if (target >= end) frac = 1;
          else if (target > start) frac = (target - start) / (end - start);
          planned += cost * frac;
      });
      return { percent: total > 0 ? Math.round((planned / total) * 100) : 0 };
  }, [cursorDate, cpmItems]);

  const cursorLineX = useMemo(() => {
      if (!cursorDate) return null;
      const projectStart = toLocalDate(project.startDate).getTime();
      const target = toLocalDate(cursorDate).getTime();
      const diffDaysFromStart = Math.floor((target - projectStart) / 86400000);
      return diffDaysFromStart * ganttScale + ganttScale / 2;
  }, [cursorDate, project.startDate, ganttScale]);

  // Posición X de la línea de HOY (null si el proyecto todavía no arrancó) — se reutiliza
  // para dibujar la línea y para el botón "Ir a HOY".
  const todayLineX = useMemo(() => {
      const projectStart = toLocalDate(project.startDate).getTime();
      if (todayMidnight < projectStart) return null;
      const diffDaysFromStart = Math.floor((todayMidnight - projectStart) / 86400000);
      return diffDaysFromStart * ganttScale + ganttScale / 2;
  }, [project.startDate, todayMidnight, ganttScale]);

  // Duración corrida (de calendario). criticalPathStats.totalDays también es corrido: los
  // días hábiles se cuentan aparte con el calendario del proyecto (workingDays + feriados).
  const naturalDays = useMemo(() => {
      if (criticalPathStats.totalDays === 0) return 0;
      const f = criticalPathStats.finishDate;
      const finishStr = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
      return diffDays(project.startDate, finishStr);
  }, [criticalPathStats, project.startDate]);

  const workingDaysCount = useMemo(() => {
      if (criticalPathStats.totalDays === 0) return 0;
      const holidays = new Set((project.nonWorkingDates || []).map(h => h.date));
      const d = toLocalDate(project.startDate);
      const end = criticalPathStats.finishDate;
      let count = 0;
      while (d <= end) {
          const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          if (workingDays.includes(d.getDay()) && !holidays.has(ymd)) count++;
          d.setDate(d.getDate() + 1);
      }
      return count;
  }, [criticalPathStats, project.startDate, project.nonWorkingDates, workingDays]);

  const goToToday = () => {
      if (scrollContainerRef.current && todayLineX != null) {
          scrollContainerRef.current.scrollLeft = Math.max(0, todayLineX - scrollContainerRef.current.clientWidth / 2);
      }
  };

  // --- SNAPSHOT HANDLER ---
  // evm.BAC es la suma de totalCost de todos los ítems — equivalente al reduce anterior.
  const handleSnapshot = () => {
      const name = prompt("Nombre para la línea base (Snapshot):", `Linea Base ${snapshots.length + 1}`);
      if (name) {
          createSnapshot(name, evm.BAC);
      }
  };

  // --- PLAN BASE EN EL GANTT (Etapa C1) ---
  // Las líneas base guardan los ítems, no las fechas: se recalculan con el mismo motor puro
  // (computeSchedule). Usa rendimientos y vínculos actuales — limitación documentada en la spec.
  const selectedSnapshot = useMemo(
      () => snapshots.find(s => s.id === selectedSnapshotId) || null,
      [snapshots, selectedSnapshotId],
  );

  const baselineSchedule = useMemo(() => {
      if (!selectedSnapshot) return null;
      const items = selectedSnapshot.items || [];
      const deps = resolveDependencies(project.dependencies, items.map(i => ({ id: i.id, legacyDependencies: i.dependencies })));
      return computeSchedule(
          items.flatMap(item => {
              const task = tasks.find(t => t.id === item.taskId);
              if (!task) return [];
              return [{
                  id: item.id,
                  quantity: item.quantity || 0,
                  manualDuration: item.manualDuration,
                  startDate: item.startDate,
                  dailyYield: task.dailyYield,
                  crewSize: item.crewsAssigned || 1,
              }];
          }),
          deps,
          project.startDate,
          workingDays,
          project.nonWorkingDates || [],
      );
  }, [selectedSnapshot, tasks, project.dependencies, project.startDate, project.nonWorkingDates, workingDays]);

  // Banda "Plan vs Real": contra la línea base si hay una elegida; si no, conteo por estado.
  const planVsReal = useMemo(() => {
      if (!baselineSchedule) return null;
      const current = cpmItems.map(i => ({ id: i.id, name: i.taskName, end: i.end }));
      const baseline = cpmItems
          .filter(i => baselineSchedule.has(i.id))
          .map(i => ({ id: i.id, name: i.taskName, end: baselineSchedule.get(i.id)!.end }));
      return comparePlanVsReal(current, baseline);
  }, [baselineSchedule, cpmItems]);

  const statusCounts = useMemo(() => {
      const counts: Record<string, number> = { atrasada: 0, en_curso: 0, completada: 0, no_iniciada: 0 };
      cpmItems.forEach(i => { counts[getItemStatus(i)]++; });
      return counts;
  }, [cpmItems, getItemStatus]);

  // Avance físico de la obra: avance ponderado por costo (EV / BAC).
  const physicalProgress = evm.BAC > 0 ? Math.round((evm.EV / evm.BAC) * 100) : 0;

  const allSummaryIds = useMemo(
      () => Array.from(new Set(cpmItems.map(i => `summary-${i.category || 'Sin Categoría'}`))),
      [cpmItems],
  );
  const allCollapsed = allSummaryIds.length > 0 && allSummaryIds.every(id => collapsedSummaries.has(id));
  const toggleCollapseAll = () => setCollapsedSummaries(allCollapsed ? new Set() : new Set(allSummaryIds));

  // --- DEPENDENCY NORMALIZATION ---
  const allDependencies = useMemo(() => {
      if (project.dependencies && project.dependencies.length > 0) {
          return project.dependencies;
      }
      // Fallback extraction
      const extracted: ProjectDependency[] = [];
      project.items.forEach(item => {
          if (item.dependencies) {
              item.dependencies.forEach(d => {
                  extracted.push({
                      id: `${item.id}-${d.predecessorId}`,
                      fromTaskId: d.predecessorId,
                      toTaskId: item.id,
                      type: d.type,
                      lag: d.lag
                  });
              });
          }
      });
      return extracted;
  }, [project.dependencies, project.items]);

  // --- GANTT ITEMS (WITH SUMMARIES) ---
  // scheduledItems, cpmItems y criticalPathStats vienen de useProjectSchedule.
  const ganttItems = useMemo(() => {
      if (cpmItems.length === 0) return [];

      // Group by Category
      const grouped: Record<string, typeof cpmItems> = {};
      const categories: string[] = []; 

      cpmItems.forEach(item => {
          const cat = item.category || 'Sin Categoría';
          if (!grouped[cat]) {
              grouped[cat] = [];
              categories.push(cat);
          }
          grouped[cat].push(item);
      });

      const results: any[] = [];
      
      categories.forEach(cat => {
          const items = grouped[cat];
          const start = Math.min(...items.map(i => i.earlyStart));
          const end = Math.max(...items.map(i => i.earlyFinish));
          const duration = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
          const totalCost = items.reduce((sum, i) => sum + (i.totalCost || 0), 0);
          const progress = totalCost > 0
              ? Math.round(items.reduce((sum, i) => sum + (i.totalCost || 0) * (i.progress || 0), 0) / totalCost)
              : 0;
          const summaryId = `summary-${cat}`;

          results.push({
              id: summaryId,
              taskId: summaryId,
              taskName: cat,
              type: 'summary',
              start: new Date(start).toISOString().split('T')[0],
              end: new Date(end).toISOString().split('T')[0],
              duration,
              totalCost,
              progress,
              category: cat,
              earlyStart: start,
              earlyFinish: end,
              isCritical: items.some(i => i.isCritical)
          });
          
          if (!collapsedSummaries.has(summaryId)) {
              results.push(...items);
          }
      });

      return results;
  }, [cpmItems, collapsedSummaries]);

  // --- GANTT CONFIGURATION ---
  useEffect(() => {
      // Auto-adjust scale based on selected time mode
      switch (timeScale) {
          case 'day': setGanttScale(40); break;
          case 'week': setGanttScale(15); break;
          case 'month': setGanttScale(5); break;
          case 'quarter': setGanttScale(2); break;
          case 'project': 
              // Calculate scale to fit container
              if (scrollContainerRef.current && criticalPathStats.totalDays > 0) {
                  const width = scrollContainerRef.current.clientWidth - 50; // padding
                  setGanttScale(Math.max(1, width / criticalPathStats.totalDays));
              }
              break;
      }
  }, [timeScale, criticalPathStats.totalDays]);

  const ganttHeaders = useMemo(() => {
      const months: any[] = [];
      const weeks: any[] = [];
      const totalDays = criticalPathStats.totalDays + 45; // Buffer
      const startDate = toLocalDate(project.startDate);
      
      // Helper to get days diff
      const getDiff = (d1: Date, d2: Date) => Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));

      // 1. Months (Top Row)
      let curr = new Date(startDate);
      // Align to first day of month? No, project starts at specific date.
      // We iterate from project start, finding month boundaries.
      let offset = 0;
      
      // First partial month
      let y = curr.getFullYear();
      let m = curr.getMonth();
      let nextMonth = new Date(y, m + 1, 1);
      
      while (offset < totalDays) {
          const daysInSegment = getDiff(curr, nextMonth);
          // If segment goes beyond totalDays, clamp it
          const width = Math.min(daysInSegment, totalDays - offset);
          
          if (width > 0) {
              months.push({
                  label: curr.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
                  x: offset * ganttScale,
                  width: width * ganttScale
              });
          }
          
          offset += width;
          curr = nextMonth;
          y = curr.getFullYear();
          m = curr.getMonth();
          nextMonth = new Date(y, m + 1, 1);
      }

      // 2. Weeks (Bottom Row)
      // Simple 7-day chunks relative to start for now, labeled with date
      for (let i = 0; i < totalDays; i += 7) {
          const d = new Date(startDate);
          d.setDate(d.getDate() + i);
          const label = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
          
          weeks.push({
              label,
              x: i * ganttScale,
              width: 7 * ganttScale
          });
      }

      return { months, weeks };
  }, [timeScale, ganttScale, criticalPathStats.totalDays, project.startDate]);

  // --- EXPORT HANDLERS ---
  const handleExportProject = () => {
      // Generate MS Project XML (Simplified)
      let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project">
<Name>${project.name}</Name>
<StartDate>${project.startDate}T08:00:00</StartDate>
<Tasks>`;
      
      cpmItems.forEach((item, idx) => {
          xml += `
    <Task>
        <UID>${idx + 1}</UID>
        <ID>${idx + 1}</ID>
        <Name>${item.taskName}</Name>
        <Start>${item.start}T08:00:00</Start>
        <Finish>${item.end}T17:00:00</Finish>
        <Duration>PT${item.duration * 8}H0M0S</Duration>
    </Task>`;
      });

      xml += `
</Tasks>
</Project>`;

      const blob = new Blob([xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name || 'proyecto'}_gantt.xml`;
      a.click();
  };

  const handlePrint = () => {
      window.print();
  };

  // --- HANDLERS ---
  const handleUpdate = (id: string, field: string, value: any) => {
      updateBudgetItem(id, { [field]: value });
  };

  const handleSetPredecessor = (itemId: string, predId: string) => {
      // Remove existing predecessors (Single select logic)
      const existing = allDependencies.filter(d => d.toTaskId === itemId);
      existing.forEach(d => removeDependency(d.id));
      
      if (predId) {
          addDependency({
              id: crypto.randomUUID(),
              fromTaskId: predId,
              toTaskId: itemId,
              type: LinkType.FS,
              lag: 0
          });
      }
  };

  // --- TABLA DE PRESUPUESTO/PLANIFICACIÓN ---
  // Cuando el panel de Gantt está abierto, las filas usan una altura fija (ROW_HEIGHT) y
  // contenido de una sola línea, para que calcen exactamente con las barras del SVG — ver
  // docs/specs/gantt-etapa-b2-panel-tabla.md. El encabezado deja de ser "sticky" en ese modo
  // porque el Gantt tampoco lo es: con los dos usando scroll "plano" alcanza con sincronizar
  // el scrollTop para que queden alineados.
  const renderBudgetTable = () => (
      <table className="w-full text-left border-collapse">
          <thead className={`bg-slate-100 text-slate-500 uppercase text-[10px] font-bold ${showGanttPanel ? '' : 'sticky top-0 z-10'}`}>
              <tr style={showGanttPanel ? { height: HEADER_HEIGHT, whiteSpace: 'nowrap' } : undefined}>
                  <th className="p-3 border-r border-slate-200 w-12 text-center">ID</th>
                  <th className="p-3 border-r border-slate-200 min-w-[200px]">Actividad</th>
                  <th className="p-3 border-r border-slate-200 w-24 text-center bg-blue-50/50">Cómputo</th>
                  <th className="p-3 border-r border-slate-200 w-24 text-center bg-orange-50/50">Frentes (Cuadrillas)</th>
                  <th className="p-3 border-r border-slate-200 w-24 text-center">Rend. Base (u/día)</th>
                  <th className="p-3 border-r border-slate-200 w-24 text-center">Prod. Total</th>
                  <th className="p-3 border-r border-slate-200 w-24 text-center font-black text-slate-700">Duración (Días)</th>
                  <th className="p-3 border-r border-slate-200 w-24 text-center bg-emerald-50/50">Avance %</th>
                  <th className="p-3 border-r border-slate-200 w-24 text-center">Estado</th>
                  <th className="p-3 border-r border-slate-200 w-40 text-center">Precedencia</th>
                  <th className="p-3 border-r border-slate-200 w-28 text-center">Fecha Inicio</th>
                  <th className="p-3 border-r border-slate-200 w-28 text-center">Fecha Fin</th>
                  <th className="p-3 w-32 text-right bg-emerald-50/50 font-bold text-emerald-700">Costo Total</th>
              </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
              {ganttItems.map((item, idx) => {
                  const rowStyle = showGanttPanel ? { height: ROW_HEIGHT } : undefined;
                  if (item.type === 'summary') {
                      return (
                          <tr key={item.id} style={rowStyle} className="bg-slate-100 font-bold text-slate-700">
                              <td className="p-2 text-center text-slate-400"></td>
                              <td className="p-2 truncate" colSpan={5}>
                                  <button
                                      onClick={() => toggleSummary(item.id)}
                                      className="inline-flex items-center gap-2 hover:text-slate-900"
                                      title={collapsedSummaries.has(item.id) ? 'Expandir partida' : 'Colapsar partida'}
                                  >
                                      <ChevronRight size={14} className={`transition-transform ${collapsedSummaries.has(item.id) ? '' : 'rotate-90'}`} />
                                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: getCategoryColor(item.category) }} />
                                      {item.taskName}
                                      <span className="text-[10px] font-medium text-slate-500">{item.progress}%</span>
                                  </button>
                              </td>
                              <td className="p-2 text-center">{item.duration}</td>
                              <td className="p-2"></td>
                              <td className="p-2"></td>
                              <td className="p-2 text-center">{toLocalDate(item.start).toLocaleDateString()}</td>
                              <td className="p-2 text-center">{toLocalDate(item.end).toLocaleDateString()}</td>
                              <td className="p-2 text-right font-mono text-emerald-700">
                                  ${(item.totalCost || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                              </td>
                          </tr>
                      );
                  }

                  const sheet = measurementSheets.find(s => s.budgetItemId === item.id);
                  const medPercent = sheet && item.quantity > 0
                      ? Math.min(100, Math.round((sheet.totalQuantity / item.quantity) * 100))
                      : null;

                  return (
                  <tr key={item.id} style={rowStyle} className={`hover:bg-slate-50 transition-colors group ${item.isCritical ? 'bg-red-50/30' : ''}`}>
                      <td className="p-2 text-center text-slate-400 font-mono">{item.index}</td>
                      <td className="p-2 font-medium text-slate-700">
                          <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                  {item.isCritical && <AlertCircle size={12} className="text-red-500 flex-shrink-0" />}
                                  {item.hasCycleError && (
                                      <span title="Ciclo de dependencias: se ignoraron sus vínculos para poder mostrarla">
                                          <AlertCircle size={12} className="text-amber-500 flex-shrink-0" />
                                      </span>
                                  )}
                                  {showGanttPanel ? (
                                      <div className="truncate" title={item.category ? `${item.taskName} · ${item.category}` : item.taskName}>
                                          {item.taskName}
                                          {item.category && <span className="text-slate-400 font-normal"> · {item.category}</span>}
                                      </div>
                                  ) : (
                                      <div className="min-w-0">
                                          {item.taskName}
                                          <div className="text-[9px] text-slate-400 font-normal">{item.category}</div>
                                      </div>
                                  )}
                              </div>
                              <button onClick={() => setEditingItemId(item.id)} className="text-purple-300 hover:text-purple-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" title="Ajustar Rendimiento Maestro">
                                  <PenTool size={14} />
                              </button>
                          </div>
                      </td>

                      {/* INPUT: Quantity */}
                      <td className="p-2 text-center bg-blue-50/30">
                          {editMode ? (
                              <input
                                type="number"
                                className="w-16 p-1 text-center border border-slate-300 rounded font-bold text-slate-700 focus:border-blue-500 outline-none"
                                value={item.quantity}
                                onChange={(e) => handleUpdate(item.id, 'quantity', parseFloat(e.target.value))}
                              />
                          ) : (
                              <span className="font-bold text-slate-700">{item.quantity}</span>
                          )}
                      </td>

                      {/* INPUT: Crew Size */}
                      <td className="p-2 text-center bg-orange-50/30">
                          <div className="flex justify-center items-center gap-1">
                              <Users size={12} className="text-orange-400" />
                              {editMode ? (
                                  <input
                                    type="number"
                                    min="1"
                                    className="w-12 p-1 text-center border border-slate-300 rounded font-bold text-slate-700 focus:border-orange-500 outline-none"
                                    value={item.crewSize}
                                    onChange={(e) => handleUpdate(item.id, 'crewsAssigned', parseInt(e.target.value))}
                                  />
                              ) : (
                                  <span className="font-bold text-slate-700">{item.crewSize}</span>
                              )}
                          </div>
                      </td>

                      {/* READ ONLY: Yield (Base) */}
                      <td className="p-2 text-center text-slate-500">
                          {(item.dailyCapacity / item.crewSize).toFixed(2)}
                      </td>

                      {/* CALC: Daily Capacity */}
                      <td className="p-2 text-center text-slate-500 font-mono">
                          {item.dailyCapacity.toFixed(2)}
                      </td>

                      {/* CALC: Duration */}
                      <td className="p-2 text-center font-black bg-slate-50 text-sm border-l border-r border-slate-100">
                          {item.hasYield ? (
                              <span className="text-blue-600">{item.duration}</span>
                          ) : (
                              <span className="text-amber-600 font-bold" title="Sin rendimiento cargado en la tarea maestra: no se puede estimar la duración real.">
                                  Sin rend.
                              </span>
                          )}
                      </td>

                      {/* INPUT: Progress */}
                      <td className="p-2 text-center bg-emerald-50/30">
                          <div
                            className={`flex items-center justify-center gap-1 ${showGanttPanel ? '' : 'flex-col'}`}
                            title={medPercent != null ? `Según Planilla de Mediciones: ${medPercent}%` : undefined}
                          >
                              {editMode ? (
                                  <div className="flex items-center gap-1">
                                      <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        className="w-12 p-1 text-center border border-slate-300 rounded font-bold text-slate-700 focus:border-emerald-500 outline-none"
                                        value={item.progress || 0}
                                        onChange={(e) => handleUpdate(item.id, 'progress', Math.min(100, Math.max(0, parseFloat(e.target.value))))}
                                      />
                                      <span className="text-[10px] text-slate-400">%</span>
                                  </div>
                              ) : (
                                  <span className="font-bold text-slate-700">{item.progress || 0}%</span>
                              )}
                              {!showGanttPanel && medPercent != null && (
                                  <div className="text-[9px] text-slate-400">(Med: {medPercent}%)</div>
                              )}
                          </div>
                      </td>

                      {/* CALC: Estado automático */}
                      <td className="p-2 text-center">
                          {(() => {
                              const status = getItemStatus(item);
                              return (
                                  <span
                                    className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold text-white"
                                    style={{ backgroundColor: STATUS_COLORS[status] }}
                                  >
                                      {STATUS_LABELS[status]}
                                  </span>
                              );
                          })()}
                      </td>

                      {/* INPUT: Predecessor */}
                      <td className="p-2 text-center">
                          {editMode ? (
                              <select
                                className="w-full p-1 border border-slate-200 rounded text-[10px] text-slate-600 truncate"
                                value={allDependencies.find(d => d.toTaskId === item.id)?.fromTaskId || ''}
                                onChange={(e) => handleSetPredecessor(item.id, e.target.value)}
                              >
                                  <option value="">-- Inicio --</option>
                                  {cpmItems
                                    .filter(i => i.id !== item.id) // Avoid self-loop
                                    .map(i => (
                                      <option key={i.id} value={i.id}>{i.taskName.substring(0, 30)}...</option>
                                  ))}
                              </select>
                          ) : (() => {
                              const predId = allDependencies.find(d => d.toTaskId === item.id)?.fromTaskId;
                              const pred = predId ? cpmItems.find(i => i.id === predId) : null;
                              return (
                                  <span className="text-[10px] text-slate-500 truncate block" title={pred?.taskName}>
                                      {pred ? pred.taskName : '-- Inicio --'}
                                  </span>
                              );
                          })()}
                      </td>

                      {/* CALC: Dates */}
                      <td className="p-2 text-center text-slate-600">
                          {toLocalDate(item.start).toLocaleDateString()}
                      </td>
                      <td className="p-2 text-center font-bold text-slate-700">
                          {toLocalDate(item.end).toLocaleDateString()}
                      </td>

                      {/* CALC: Total Cost */}
                      <td className="p-2 text-right font-mono text-emerald-600 bg-emerald-50/30 font-medium">
                          ${(item.totalCost || 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                      </td>
                  </tr>
                  );
              })}
          </tbody>
      </table>
  );

  // --- GRÁFICO DE GANTT (SVG) ---
  // Compartido entre el panel de Planificación (al lado de renderBudgetTable) y la pestaña
  // Gantt de Seguimiento y Control (al lado de la lista simplificada). ROW_HEIGHT/HEADER_HEIGHT
  // son los mismos que usa renderBudgetTable, así el scroll compartido alinea fila con barra.
  const renderGanttChart = () => (
      <svg
          style={{ display: 'block' }}
          width={Math.max(1000, criticalPathStats.totalDays * ganttScale + 400)}
          height={ganttItems.length * ROW_HEIGHT + HEADER_HEIGHT}
          className="font-sans"
      >
          <defs>
              <pattern id="grid" width={ganttScale} height="100%" patternUnits="userSpaceOnUse">
                  <line x1={ganttScale} y1="0" x2={ganttScale} y2="100%" stroke="#e2e8f0" strokeWidth="1" />
              </pattern>
              <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="0" refY="2" orient="auto">
                  <polygon points="0 0, 6 2, 0 4" fill="#94a3b8" />
              </marker>
          </defs>

          {/* Background Grid */}
          <rect width="100%" height="100%" fill="url(#grid)" y={HEADER_HEIGHT} />

          {/* Non-Working Days Background */}
          {Array.from({ length: criticalPathStats.totalDays + 10 }).map((_, i) => {
              // Use local time construction to ensure getDay() is correct
              const currentDate = new Date(project.startDate + 'T00:00:00');
              currentDate.setDate(currentDate.getDate() + i);

              const dayOfWeek = currentDate.getDay(); // 0=Sun, 6=Sat
              const isWorking = workingDays.includes(dayOfWeek);

              if (!isWorking) {
                  return (
                      <rect
                          key={`nw-${i}`}
                          x={i * ganttScale}
                          y={HEADER_HEIGHT}
                          width={ganttScale}
                          height="100%"
                          fill="#f1f5f9"
                          fillOpacity="0.6"
                      />
                  );
              }
              return null;
          })}

          {/* Project Start Line */}
          <g>
              <line x1={0} y1={HEADER_HEIGHT} x2={0} y2="100%" stroke="#3b82f6" strokeWidth="2" strokeDasharray="4 2" />
              <text x={5} y="55" fontSize="9" fill="#3b82f6" fontWeight="bold">
                  INICIO · {toLocalDate(project.startDate).toLocaleDateString()}
              </text>
          </g>

          {/* Today Line */}
          {todayLineX != null && (
              <g>
                  <line x1={todayLineX} y1={HEADER_HEIGHT} x2={todayLineX} y2="100%" stroke="#ef4444" strokeWidth="2" strokeDasharray="4 2" />
                  <text x={todayLineX + 5} y="55" fontSize="9" fill="#ef4444" fontWeight="bold">HOY</text>
              </g>
          )}

          {/* Cursor de fecha */}
          {cursorLineX != null && cursorStats != null && (
              <g>
                  <line x1={cursorLineX} y1={HEADER_HEIGHT} x2={cursorLineX} y2="100%" stroke="#7c3aed" strokeWidth="2" strokeDasharray="2 2" />
                  <text x={cursorLineX + 5} y="67" fontSize="9" fill="#7c3aed" fontWeight="bold">
                      {toLocalDate(cursorDate!).toLocaleDateString()} · plan esperado {cursorStats.percent}%
                  </text>
              </g>
          )}

          {/* Timeline Header */}
          <g>
              {/* Top Row: Months */}
              {ganttHeaders.months.map((header: any, i: number) => (
                  <React.Fragment key={`m-${i}`}>
                      <rect x={header.x} y="0" width={header.width} height="20" fill="#e2e8f0" stroke="#cbd5e1" />
                      <text
                          x={header.x + 5}
                          y="14"
                          fontSize="10"
                          fill="#334155"
                          fontWeight="bold"
                          className="uppercase"
                      >
                          {header.label}
                      </text>
                  </React.Fragment>
              ))}

              {/* Bottom Row: Weeks */}
              {ganttHeaders.weeks.map((header: any, i: number) => (
                  <React.Fragment key={`w-${i}`}>
                      <rect x={header.x} y="20" width={header.width} height="20" fill="#f8fafc" stroke="#e2e8f0" />
                      <text
                          x={header.x + 5}
                          y="34"
                          fontSize="9"
                          fill="#64748b"
                      >
                          {header.label}
                      </text>
                  </React.Fragment>
              ))}

              {/* Minor Headers (Days) - Only show if scale is large enough */}
              {ganttScale > 20 && Array.from({ length: criticalPathStats.totalDays + 5 }).map((_, i) => (
                  <text
                    key={i}
                    x={i * ganttScale + (ganttScale/2)}
                    y="52"
                    fontSize="8"
                    fill="#94a3b8"
                    textAnchor="middle"
                  >
                      {i+1}
                  </text>
              ))}
          </g>

          {/* Task Bars & Logic */}
          {ganttItems.map((item, index) => {
              const projectStart = new Date(project.startDate).getTime();
              const itemStart = new Date(item.start).getTime();

              // Calculate pixel offset days
              const startOffsetDay = Math.floor((itemStart - projectStart) / (1000 * 60 * 60 * 24));
              const x = startOffsetDay * ganttScale;
              const width = Math.max(2, item.duration * ganttScale);
              const y = index * ROW_HEIGHT + HEADER_HEIGHT;

              // Summary Task Render
              if (item.type === 'summary') {
                  const isCollapsed = collapsedSummaries.has(item.id);
                  const summaryBarY = y + (ROW_HEIGHT - 8) / 2;
                  // Barra resumen de partida (C1): fina, con el color de la partida y su %.
                  const summaryColor = getCategoryColor(item.category);
                  const summaryProgressWidth = width * ((item.progress || 0) / 100);
                  return (
                      <g key={item.id} className="cursor-pointer hover:opacity-80" onClick={() => toggleSummary(item.id)}>
                          <title>{item.taskName} · {item.progress}% · click para {isCollapsed ? 'expandir' : 'colapsar'}</title>
                          <rect x={x} y={summaryBarY} width={width} height="8" fill={summaryColor} fillOpacity={0.3} rx="4" />
                          {showProgressLayer && summaryProgressWidth > 0 && (
                              <rect x={x} y={summaryBarY} width={summaryProgressWidth} height="8" fill={summaryColor} rx="4" />
                          )}
                          <text x={x + 2} y={summaryBarY - 3} fontSize="9" fill="#475569" fontWeight="bold">
                              {item.progress}%
                          </text>
                      </g>
                  );
              }

              // Color de barra a elección (Etapa B): por estado automático, por partida, o el
              // binario crítica/normal de antes de la Etapa B. La ruta crítica, cuando no es
              // el color elegido, se marca como borde — nunca compite con el color de barra.
              const status = getItemStatus(item);
              const barColor = barColorMode === 'status' ? STATUS_COLORS[status]
                  : barColorMode === 'category' ? getCategoryColor(item.category || 'Sin Categoría')
                  : (item.isCritical ? '#ef4444' : '#3b82f6');

              // Progress Calculation
              const progress = item.progress || 0;
              const progressWidth = width * (progress / 100);

              // Etiqueta "Nd · X%" (duración + avance): el nombre ya se ve en la tabla/
              // sidebar de al lado (Etapa B-2), así que adentro de la barra no hace falta
              // repetirlo — queda en el tooltip para consultarlo igual.
              const barLabel = `${item.hasYield ? `${item.duration}d` : 's/r'}${progress > 0 ? ` · ${progress}%` : ''}`;
              const charWidth = 6; // Approx
              const textWidth = barLabel.length * charWidth;
              const fitsInside = width > textWidth + 10;

              const task = tasksMap[item.taskId];
              const barY = y + BAR_Y_OFFSET;
              const labelY = barY + BAR_HEIGHT / 2 + 4;

              return (
                  <g key={item.id} className="group cursor-pointer" onClick={() => setEditingItemId(item.id)}>
                      <title>
                          {task?.code ? `${task.code} - ` : ''}{item.taskName}
                          {' · '}{toLocalDate(item.start).toLocaleDateString()} → {toLocalDate(item.end).toLocaleDateString()}
                          {' · '}{item.hasYield ? `${item.duration} días` : 'sin rendimiento cargado'}
                          {' · '}{progress}% avance
                          {item.hasCycleError ? ' — ⚠ ciclo de dependencias: se ignoraron sus vínculos' : ''}
                      </title>
                      {/* Dependency Lines */}
                      {showDependencies && allDependencies.filter(d => d.toTaskId === item.id).map((dep, depIdx) => {
                          const pred = ganttItems.find(p => p.id === dep.fromTaskId);
                          if (!pred) return null;

                          // Find predator index/position
                          const predIdx = ganttItems.indexOf(pred);
                          const predStartDay = Math.floor((new Date(pred.start).getTime() - projectStart) / (1000 * 60 * 60 * 24));
                          const predXEnd = (predStartDay + pred.duration) * ganttScale;
                          const predY = predIdx * ROW_HEIGHT + HEADER_HEIGHT + ROW_HEIGHT / 2;

                          const currY = y + ROW_HEIGHT / 2;

                          // Draw Bezier Connector
                          const path = `M ${predXEnd} ${predY}
                                        C ${predXEnd + 15} ${predY}, ${x - 15} ${currY}, ${x} ${currY}`;

                          return (
                              <path
                                key={`${item.id}-dep-${depIdx}`}
                                d={path}
                                fill="none"
                                stroke="#94a3b8"
                                strokeWidth="1.5"
                                markerEnd="url(#arrowhead)"
                                className="opacity-50"
                              />
                          );
                      })}

                      {/* Plan base (C1): barra fina punteada con las fechas de la línea base elegida */}
                      {showBaseline && baselineSchedule?.has(item.id) && (() => {
                          const base = baselineSchedule.get(item.id)!;
                          const baseStartDay = Math.floor((new Date(base.start).getTime() - projectStart) / 86400000);
                          return (
                              <rect
                                  x={baseStartDay * ganttScale}
                                  y={barY + BAR_HEIGHT + 3}
                                  width={Math.max(2, base.duration * ganttScale)}
                                  height={4}
                                  rx="2"
                                  fill="#cbd5e1"
                                  stroke="#94a3b8"
                                  strokeWidth="1"
                                  strokeDasharray="3 2"
                              >
                                  <title>Plan base: {toLocalDate(base.start).toLocaleDateString()} → {toLocalDate(base.end).toLocaleDateString()}</title>
                              </rect>
                          );
                      })()}

                      {/* Task Bar — resto (claro): todo el ancho, opacidad baja */}
                      <rect
                          x={x}
                          y={barY}
                          width={width}
                          height={BAR_HEIGHT}
                          rx="4"
                          fill={barColor}
                          fillOpacity={showProgressLayer ? 0.55 : 0.95}
                          stroke={item.isCritical ? '#991b1b' : 'none'}
                          strokeWidth={item.isCritical ? 2 : 0}
                          className="transition-all shadow-sm"
                      />

                      {/* Tramo real (sólido): solo el avance ejecutado, mismo color que el resto */}
                      {showProgressLayer && progress > 0 && (
                          <rect
                              x={x}
                              y={barY}
                              width={progressWidth}
                              height={BAR_HEIGHT}
                              fill={barColor}
                              fillOpacity={0.95}
                              rx="4"
                              clipPath={`inset(0 ${width - progressWidth}px 0 0)`}
                          />
                      )}

                      {/* Label: "Nd · X%" — texto oscuro si no queda totalmente sobre el
                          tramo sólido (progreso bajo/0%), porque ahí el fondo es el segmento
                          claro de 55% opacidad y el blanco pierde contraste */}
                      {fitsInside ? (
                          <text
                              x={x + 10}
                              y={labelY}
                              fontSize="10"
                              fill={(showProgressLayer ? progressWidth : width) >= textWidth + 10 ? 'white' : '#475569'}
                              fontWeight="bold"
                              pointerEvents="none"
                              className="select-none"
                          >
                              {barLabel}
                          </text>
                      ) : (
                          <text x={x + width + 5} y={labelY} fontSize="10" fill="#475569" fontWeight="medium">
                              {barLabel}
                          </text>
                      )}
                  </g>
              );
          })}
      </svg>
  );

  return (
    <div className="flex flex-col h-full space-y-6 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
         <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Calendar className="text-blue-600" /> Planificación de Obra
            </h2>
            <p className="text-sm text-slate-500 mt-1">Motor de cálculo CPM (Ruta Crítica) basado en Rendimientos Maestros.</p>
         </div>
         
      </div>

      {/* Cabecera de 4 tarjetas (C1): Inicio · Fin · Duración · Avance físico */}
      {(() => {
          const fmtDate = (d: Date) => d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: '2-digit' });
          const fmtWeekday = (d: Date) => {
              const w = d.toLocaleDateString('es-AR', { weekday: 'long' });
              return w.charAt(0).toUpperCase() + w.slice(1);
          };
          const startD = toLocalDate(project.startDate);
          const finishD = criticalPathStats.finishDate;
          const hasSchedule = criticalPathStats.totalDays > 0;
          const ringR = 20;
          const ringC = 2 * Math.PI * ringR;
          return (
              <div className="bg-white rounded-xl shadow-sm border border-slate-100 grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-slate-100">
                  <div className="p-4">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 uppercase"><CalendarDays size={12} /> Inicio</div>
                      <div className="text-xl font-bold text-slate-800 mt-1">{fmtDate(startD)}</div>
                      <div className="text-[11px] text-slate-400">{fmtWeekday(startD)}</div>
                  </div>
                  <div className="p-4">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 uppercase"><Clock size={12} /> Fin</div>
                      <div className="text-xl font-bold text-slate-800 mt-1">{hasSchedule ? fmtDate(finishD) : '—'}</div>
                      <div className="text-[11px] text-slate-400">{hasSchedule ? fmtWeekday(finishD) : 'Sin tareas programadas'}</div>
                  </div>
                  <div className="p-4">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase"><Calendar size={12} /> Duración</div>
                      <div className="text-xl font-bold text-slate-800 mt-1">{Math.ceil(naturalDays / 7)} sem</div>
                      <div className="text-[11px] text-slate-400">{workingDaysCount} hábiles · {naturalDays} corridos</div>
                  </div>
                  <div className="p-4 flex items-center gap-3">
                      <svg width="52" height="52" viewBox="0 0 52 52" className="flex-shrink-0">
                          <circle cx="26" cy="26" r={ringR} fill="none" stroke="#e2e8f0" strokeWidth="6" />
                          <circle
                              cx="26" cy="26" r={ringR} fill="none" stroke="#f97316" strokeWidth="6" strokeLinecap="round"
                              strokeDasharray={`${(ringC * physicalProgress) / 100} ${ringC}`}
                              transform="rotate(-90 26 26)"
                          />
                      </svg>
                      <div>
                          <div className="text-[10px] font-bold text-slate-500 uppercase">Avance físico</div>
                          <div className="text-xl font-bold text-slate-800">{physicalProgress}%</div>
                      </div>
                  </div>
              </div>
          );
      })()}

      {/* Main Content */}
      <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          
          <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50 print:hidden flex-wrap gap-3">
              <div className="flex gap-2">
                  <button
                    onClick={() => setViewMode('table')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${viewMode === 'table' ? 'bg-white text-blue-600 shadow' : 'text-slate-500 hover:bg-slate-200'}`}
                  >
                      <List size={16} /> Tabla
                  </button>
                  <button
                    onClick={() => setViewMode('control')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${viewMode === 'control' ? 'bg-white text-blue-600 shadow' : 'text-slate-500 hover:bg-slate-200'}`}
                  >
                      <TrendingUp size={16} /> Seguimiento y Control
                  </button>
                  {viewMode === 'table' && (
                      <button
                          onClick={() => setShowGanttPanel(v => !v)}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${showGanttPanel ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'}`}
                          title="El Gantt se abre al lado de la tabla, con el mismo scroll"
                      >
                          <Layout size={16} /> {showGanttPanel ? 'Ocultar Gantt' : 'Mostrar Gantt'}
                      </button>
                  )}
                  {viewMode === 'table' && (
                      <button
                          onClick={() => setEditMode(v => !v)}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${editMode ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'}`}
                          title={editMode ? 'Volver a modo lectura' : 'Habilitar edición de cantidad, frentes, avance y precedencia'}
                      >
                          <PenTool size={16} /> {editMode ? 'Modo lectura' : 'Editar'}
                      </button>
                  )}
              </div>

              {viewMode === 'control' && (
                  <div className="flex bg-white rounded-lg border border-slate-200 p-1">
                      <button onClick={() => setControlSubView('table')} className={`px-3 py-1 text-[10px] uppercase font-bold rounded transition-colors ${controlSubView === 'table' ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}>Tabla</button>
                      <button onClick={() => setControlSubView('gantt')} className={`px-3 py-1 text-[10px] uppercase font-bold rounded transition-colors ${controlSubView === 'gantt' ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}>Gantt</button>
                  </div>
              )}

          </div>

          {((viewMode === 'table' && showGanttPanel) || (viewMode === 'control' && controlSubView === 'gantt')) && (() => {
              const chip = (active: boolean) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${active ? 'bg-white text-slate-700 border-slate-300 shadow-sm' : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600'}`;
              return (
              <div className="px-4 py-3 border-b border-slate-200 bg-white space-y-2 print:hidden">
                  {/* Fila 1: estructura, color, capas, cursor, hoy */}
                  <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={toggleCollapseAll} className={chip(true)} title={allCollapsed ? 'Expandir todas las partidas' : 'Colapsar todas las partidas'}>
                          {allCollapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />} {allCollapsed ? 'Expandir todo' : 'Colapsar todo'}
                      </button>

                      <div className="flex items-center gap-1 bg-white rounded-lg border border-slate-200 p-1">
                          {(['status', 'category', 'critical'] as const).map(mode => (
                              <button
                                  key={mode}
                                  onClick={() => setBarColorMode(mode)}
                                  className={`px-3 py-1 text-xs font-bold rounded-md ${barColorMode === mode ? 'bg-orange-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                                  title={mode === 'status' ? 'Color por estado (atrasada/en curso/completada)' : mode === 'category' ? 'Color por partida' : 'Rojo = ruta crítica, azul = resto'}
                              >
                                  {mode === 'status' ? 'Estado' : mode === 'category' ? 'Partida' : 'Ruta crítica'}
                              </button>
                          ))}
                      </div>

                      <button onClick={() => setShowProgressLayer(v => !v)} className={chip(showProgressLayer)} title="Mostrar el tramo de avance real dentro de cada barra">
                          {showProgressLayer ? <Eye size={14} /> : <EyeOff size={14} />} Avance real
                      </button>
                      <button onClick={() => setShowDependencies(v => !v)} className={chip(showDependencies)} title="Mostrar las líneas de dependencia entre tareas">
                          {showDependencies ? <Eye size={14} /> : <EyeOff size={14} />} Dependencias
                      </button>

                      <div className="flex items-center gap-1.5 bg-white rounded-lg border border-slate-200 px-2 py-1">
                          <Crosshair size={14} className="text-violet-500" />
                          <input
                              type="date"
                              value={cursorDate || ''}
                              onChange={(e) => setCursorDate(e.target.value || null)}
                              className="text-[11px] text-slate-600 outline-none w-28"
                              title="Cursor de fecha: ¿cuánto debería estar hecho a esta fecha?"
                          />
                          {cursorDate && cursorStats && (
                              <>
                                  <span className="text-[11px] font-bold text-violet-600">{cursorStats.percent}% plan</span>
                                  <button onClick={() => setCursorDate(null)} className="text-slate-300 hover:text-slate-500 text-xs leading-none" title="Apagar cursor">✕</button>
                              </>
                          )}
                      </div>

                      <button
                          onClick={goToToday}
                          disabled={todayLineX == null}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:text-red-600 hover:border-red-200 rounded-lg text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          title={todayLineX == null ? 'La obra todavía no arrancó' : 'Ir a la fecha de hoy'}
                      >
                          <CalendarDays size={14} /> Hoy
                      </button>
                  </div>

                  {/* Fila 2: escala, zoom, plan base, exportar */}
                  <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex bg-white rounded-lg border border-slate-200 p-1">
                          {(['day', 'week', 'month', 'quarter', 'project'] as const).map(mode => (
                              <button
                                  key={mode}
                                  onClick={() => setTimeScale(mode)}
                                  className={`px-3 py-1 text-[10px] uppercase font-bold rounded ${timeScale === mode ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}
                              >
                                  {mode === 'day' ? 'Día' : mode === 'week' ? 'Sem' : mode === 'month' ? 'Mes' : mode === 'quarter' ? 'Trim' : 'Todo'}
                              </button>
                          ))}
                      </div>

                      <div className="flex items-center gap-1 bg-white rounded-lg p-1 border border-slate-200">
                          <button onClick={() => setGanttScale(s => Math.max(1, s * 0.8))} className="p-1 hover:bg-slate-100 rounded text-slate-500" title="Alejar"><ZoomOut size={16}/></button>
                          <button onClick={() => setGanttScale(s => Math.min(200, s * 1.2))} className="p-1 hover:bg-slate-100 rounded text-slate-500" title="Acercar"><ZoomIn size={16}/></button>
                      </div>

                      {/* Plan base: elegir línea base, mostrar/ocultar, fijar una nueva */}
                      <div className="flex items-center gap-1.5 bg-white rounded-lg border border-slate-200 px-2 py-1">
                          <Flag size={14} className="text-slate-500" />
                          <span className="text-xs font-bold text-slate-600">Plan base</span>
                          <select
                              value={selectedSnapshotId || ''}
                              onChange={(e) => setSelectedSnapshotId(e.target.value || null)}
                              className="text-[11px] text-slate-600 outline-none bg-transparent max-w-[160px]"
                              title="Línea base contra la que se compara el cronograma"
                          >
                              <option value="">— ninguna —</option>
                              {snapshots.map(s => (
                                  <option key={s.id} value={s.id}>{s.name} · {new Date(s.date).toLocaleDateString()}</option>
                              ))}
                          </select>
                          {selectedSnapshotId && (
                              <button onClick={() => setShowBaseline(v => !v)} className="text-slate-400 hover:text-slate-600" title={showBaseline ? 'Ocultar plan base en el Gantt' : 'Mostrar plan base en el Gantt'}>
                                  {showBaseline ? <Eye size={14} /> : <EyeOff size={14} />}
                              </button>
                          )}
                          <button
                              onClick={handleSnapshot}
                              className="ml-1 px-2 py-0.5 bg-slate-900 text-white hover:bg-black rounded text-[10px] font-bold"
                              title="Guardar el estado actual como nueva línea base"
                          >
                              Fijar
                          </button>
                      </div>

                      <div className="flex items-center gap-2 ml-auto">
                          <button onClick={handleExportProject} className="p-2 bg-white border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-200 rounded-lg transition-colors" title="Exportar a MS Project (XML)">
                              <Download size={16} />
                          </button>
                          <button onClick={handlePrint} className="p-2 bg-white border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-200 rounded-lg transition-colors" title="Imprimir / PDF">
                              <Printer size={16} />
                          </button>
                      </div>
                  </div>

                  {/* Banda "Plan vs Real" */}
                  {planVsReal ? (
                      <div className={`flex items-center gap-3 flex-wrap px-3 py-2 rounded-lg border text-xs ${planVsReal.status === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : planVsReal.status === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-red-50 border-red-200 text-red-900'}`}>
                          <span className="flex items-center gap-1.5 font-bold"><Activity size={14} /> Plan vs Real</span>
                          <span>
                              Fin de obra:{' '}
                              <b>{planVsReal.projectDelayDays > 0 ? `atrasado ${planVsReal.projectDelayDays} días` : planVsReal.projectDelayDays < 0 ? `adelantado ${-planVsReal.projectDelayDays} días` : 'en tiempo'}</b>
                          </span>
                          <span className="opacity-70">{planVsReal.late} atrasadas · {planVsReal.early} adelantadas · {planVsReal.onTime} en tiempo</span>
                          {planVsReal.maxDelay && (
                              <span className="opacity-70">Mayor desfase: <b>{planVsReal.maxDelay.name}</b> +{planVsReal.maxDelay.days} días</span>
                          )}
                      </div>
                  ) : (
                      <div className="flex items-center gap-3 flex-wrap px-3 py-2 rounded-lg border bg-slate-50 border-slate-200 text-xs text-slate-600">
                          <span className="flex items-center gap-1.5 font-bold"><Activity size={14} /> Plan vs Real</span>
                          <span>Fijá o elegí una línea base para comparar el plan contra lo real.</span>
                          <span className="opacity-70">
                              Hoy: {statusCounts.atrasada} atrasadas · {statusCounts.en_curso} en curso · {statusCounts.completada} completadas · {statusCounts.no_iniciada} sin iniciar
                          </span>
                      </div>
                  )}
              </div>
              );
          })()}

          {viewMode === 'table' && !showGanttPanel && (
              <div className="flex-1 overflow-auto">
                  {renderBudgetTable()}
              </div>
          )}

          {viewMode === 'table' && showGanttPanel && (
              <div className="flex-1 flex overflow-hidden">
                  <ResizableSplitPane
                      storageKey="planning-table-gantt"
                      initialLeftWidth={760}
                      left={
                          <div className="h-full overflow-auto" ref={tableScrollRef} onScroll={handleTableScroll}>
                              {renderBudgetTable()}
                          </div>
                      }
                      right={
                          <div className="h-full overflow-auto bg-slate-50" ref={scrollContainerRef} onScroll={handleChartScroll}>
                              {renderGanttChart()}
                          </div>
                      }
                  />
              </div>
          )}


          {viewMode === 'control' && controlSubView === 'gantt' && (
              // --- GANTT: lista simplificada + SVG, con el mismo ROW_HEIGHT que renderBudgetTable ---
              <div className="flex-1 flex overflow-hidden">
                      <ResizableSplitPane
                          storageKey="planning-gantt-sidebar"
                          initialLeftWidth={450}
                          left={
                              <div className="h-full bg-white overflow-y-auto flex flex-col print:hidden" ref={sidebarRef} onScroll={handleSidebarScroll}>
                          <div style={{ height: HEADER_HEIGHT }} className="bg-slate-100 border-b border-slate-200 flex items-center px-4 text-[11px] font-bold text-slate-600 uppercase sticky top-0 z-10 tracking-wide">
                              <div className="w-10 text-center border-r border-slate-200/50 mr-2">ID</div>
                              <div className="flex-1 px-2 border-r border-slate-200/50 mr-2">Tarea</div>
                              <div className="w-16 text-center border-r border-slate-200/50 mr-2">Dur.</div>
                              <div className="w-20 text-center border-r border-slate-200/50 mr-2">Inicio</div>
                              <div className="w-20 text-center">Fin</div>
                          </div>
                          {ganttItems.map((item, idx) => (
                              <div
                                  key={item.id}
                                  style={{ height: ROW_HEIGHT }}
                                  className={`flex items-center px-4 border-b border-slate-100 hover:bg-slate-50 text-xs group cursor-pointer transition-colors ${item.type === 'summary' ? 'bg-slate-50 font-bold text-slate-800' : 'text-slate-600'} ${item.isCritical && item.type !== 'summary' ? 'bg-red-50/20' : ''}`}
                                  onClick={() => item.type !== 'summary' && setEditingItemId(item.id)}
                              >
                                  <div className="w-10 text-center text-slate-400 font-mono text-[10px] border-r border-slate-100 mr-2">{item.index || ''}</div>
                                  <div className="flex-1 truncate font-medium px-2 flex items-center gap-2 border-r border-slate-100 mr-2" title={item.taskName}>
                                      {item.isCritical && item.type !== 'summary' && <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0 shadow-sm" title="Ruta Crítica"></div>}
                                      {item.type === 'summary' ? (
                                          <span className="truncate uppercase text-[10px] tracking-wider text-slate-500">{item.taskName}</span>
                                      ) : (
                                          <span className="truncate pl-1">{item.taskName}</span>
                                      )}
                                  </div>
                                  <div className="w-16 text-center text-slate-500 font-mono text-[11px] border-r border-slate-100 mr-2">
                                      {item.type === 'summary' || item.hasYield ? `${item.duration}d` : (
                                          <span className="text-amber-600" title="Sin rendimiento cargado">s/r</span>
                                      )}
                                  </div>
                                  <div className="w-20 text-center text-slate-500 text-[10px] font-mono border-r border-slate-100 mr-2">{toLocalDate(item.start).toLocaleDateString()}</div>
                                  <div className="w-20 text-center text-slate-500 text-[10px] font-mono">{toLocalDate(item.end).toLocaleDateString()}</div>
                              </div>
                          ))}

                              </div>
                          }
                          right={
                              <div className="h-full overflow-auto bg-slate-50" ref={scrollContainerRef} onScroll={handleChartScroll}>
                                  {renderGanttChart()}
                              </div>
                          }
                      />
              </div>
          )}


          {/* Leyenda de partidas (C1): al pie del Gantt cuando el color es por partida */}
          {barColorMode === 'category' && ((viewMode === 'table' && showGanttPanel) || (viewMode === 'control' && controlSubView === 'gantt')) && (
              <div className="flex items-center gap-4 flex-wrap px-4 py-2 border-t border-slate-200 bg-white text-[11px] text-slate-600">
                  <span className="font-bold text-slate-400 uppercase text-[10px]">Leyenda · Partidas</span>
                  {Array.from(new Set(cpmItems.map(i => i.category || 'Sin Categoría'))).map(cat => (
                      <span key={cat} className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getCategoryColor(cat) }} />
                          {cat}
                      </span>
                  ))}
              </div>
          )}

          {viewMode === 'control' && controlSubView === 'table' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Control Toolbar */}
                  <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center gap-4">
                      <div className="flex items-center gap-2">
                          <Clock size={16} className="text-slate-500" />
                          <span className="text-sm font-bold text-slate-700">Línea Base:</span>
                          <select 
                              className="text-sm border border-slate-300 rounded-lg p-1.5 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                              value={selectedSnapshotId || ''}
                              onChange={(e) => setSelectedSnapshotId(e.target.value)}
                          >
                              <option value="">-- Seleccionar Snapshot --</option>
                              {snapshots.map(s => (
                                  <option key={s.id} value={s.id}>{s.name} ({new Date(s.date).toLocaleDateString()})</option>
                              ))}
                          </select>
                      </div>
                      
                      {selectedSnapshotId && (() => {
                          // Costos desde itemCosts — sin recálculo de calculateUnitPrice.
                          const controlData = project.items.map(item => {
                              const ic = itemCosts.find(c => c.id === item.id);
                              if (!ic) return null;
                              const snapshot = snapshots.find(s => s.id === selectedSnapshotId);
                              let baseQty = 0;
                              if (snapshot) {
                                  const baseItem = snapshot.items.find(i => i.id === item.id) || snapshot.items.find(i => i.taskId === item.taskId);
                                  if (baseItem) baseQty = baseItem.quantity;
                              }
                              const currentCost  = ic.totalCost;
                              const baselineCost = baseQty * ic.unitCost;
                              const earnedValue  = ic.earnedValue;
                              return { baselineCost, currentCost, earnedValue };
                          }).filter(Boolean) as any[];

                          const totals = controlData.reduce((acc, item) => ({
                              baseline: acc.baseline + item.baselineCost,
                              current: acc.current + item.currentCost,
                              earned: acc.earned + item.earnedValue
                          }), { baseline: 0, current: 0, earned: 0 });

                          return (
                              <div className="flex gap-6 ml-auto">
                                  <div className="text-right">
                                      <div className="text-[10px] text-slate-400 uppercase font-bold">Presupuesto Base</div>
                                      <div className="text-sm font-bold text-slate-600">${totals.baseline.toLocaleString()}</div>
                                  </div>
                                  <div className="text-right">
                                      <div className="text-[10px] text-slate-400 uppercase font-bold">Presupuesto Actual</div>
                                      <div className="text-sm font-bold text-blue-600">${totals.current.toLocaleString()}</div>
                                  </div>
                                  <div className="text-right">
                                      <div className="text-[10px] text-slate-400 uppercase font-bold">Valor Ganado (EV)</div>
                                      <div className="text-sm font-bold text-emerald-600">${totals.earned.toLocaleString()}</div>
                                  </div>
                                  <div className="text-right">
                                      <div className="text-[10px] text-slate-400 uppercase font-bold">Desviación</div>
                                      <div className={`text-sm font-bold ${totals.current - totals.baseline > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                                          ${(totals.current - totals.baseline).toLocaleString()}
                                      </div>
                                  </div>
                              </div>
                          );
                      })()}
                  </div>

                  {/* Control Table */}
                  <div className="flex-1 overflow-auto">
                      <table className="w-full text-sm text-left border-collapse">
                          <thead className="bg-slate-50 sticky top-0 z-10 text-[11px] uppercase text-slate-500 font-bold tracking-wide shadow-sm">
                              <tr>
                                  <th className="p-2 border-b border-slate-200 pl-4">Tarea / Ítem</th>
                                  <th className="p-2 border-b border-slate-200 text-center w-12">Und</th>
                                  <th className="p-2 border-b border-slate-200 text-center bg-slate-100/50 border-l border-slate-200" colSpan={2}>Línea Base</th>
                                  <th className="p-2 border-b border-slate-200 text-center bg-blue-50/30 border-l border-slate-200" colSpan={2}>Actual</th>
                                  <th className="p-2 border-b border-slate-200 text-center bg-emerald-50/30 border-l border-slate-200" colSpan={2}>Avance</th>
                                  <th className="p-2 border-b border-slate-200 text-right border-l border-slate-200 pr-4 w-24">Desviación</th>
                              </tr>
                              <tr className="text-[10px] text-slate-400">
                                  <th className="p-1 border-b border-slate-200"></th>
                                  <th className="p-1 border-b border-slate-200"></th>
                                  {/* Baseline Sub-headers */}
                                  <th className="p-1 border-b border-slate-200 text-right bg-slate-100/50 border-l border-slate-200 font-normal">Cant.</th>
                                  <th className="p-1 border-b border-slate-200 text-right bg-slate-100/50 font-normal pr-2">Costo</th>
                                  {/* Actual Sub-headers */}
                                  <th className="p-1 border-b border-slate-200 text-right bg-blue-50/30 border-l border-slate-200 font-normal">Cant.</th>
                                  <th className="p-1 border-b border-slate-200 text-right bg-blue-50/30 font-normal pr-2">Costo</th>
                                  {/* Progress Sub-headers */}
                                  <th className="p-1 border-b border-slate-200 text-center bg-emerald-50/30 border-l border-slate-200 font-normal">%</th>
                                  <th className="p-1 border-b border-slate-200 text-right bg-emerald-50/30 font-normal pr-2">Valor Ganado</th>
                                  {/* Deviation */}
                                  <th className="p-1 border-b border-slate-200 text-right border-l border-slate-200 font-normal pr-4">Costo</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                              {project.items.map((item, idx) => {
                                  const ic   = itemCosts.find(c => c.id === item.id);
                                  const task = tasks.find(t => t.id === item.taskId);
                                  if (!ic || !task) return null;

                                  // Costos desde itemCosts — sin recálculo de calculateUnitPrice.
                                  const snapshot = snapshots.find(s => s.id === selectedSnapshotId);
                                  let baseQty = 0;
                                  if (snapshot) {
                                      const baseItem = snapshot.items.find(i => i.id === item.id) || snapshot.items.find(i => i.taskId === item.taskId);
                                      if (baseItem) baseQty = baseItem.quantity;
                                  }

                                  const currentCost  = ic.totalCost;
                                  const baselineCost = baseQty * ic.unitCost;
                                  const deviation    = currentCost - baselineCost;
                                  const progress     = ic.progress;
                                  const earnedValue  = ic.earnedValue;

                                  return (
                                      <tr key={item.id} className="hover:bg-slate-50 transition-colors group h-10">
                                          <td className="px-4 py-2 border-r border-slate-50">
                                              <div className="font-medium text-slate-700 text-xs truncate max-w-[250px]" title={task.name}>{task.name}</div>
                                              <div className="text-[10px] text-slate-400 truncate max-w-[200px]">{task.category || 'S/C'}</div>
                                          </td>
                                          <td className="px-2 py-2 text-center text-[10px] text-slate-400 font-mono border-r border-slate-50">{task.unit}</td>
                                          
                                          {/* Baseline */}
                                          <td className="px-2 py-2 text-right font-mono text-xs text-slate-500 bg-slate-50/30 border-r border-slate-50">
                                              {baseQty > 0 ? baseQty.toLocaleString() : '-'}
                                          </td>
                                          <td className="px-2 py-2 text-right font-mono text-xs text-slate-500 bg-slate-50/30 border-r border-slate-50">
                                              {baselineCost > 0 ? `$${baselineCost.toLocaleString()}` : '-'}
                                          </td>

                                          {/* Actual */}
                                          <td className="px-2 py-2 text-right font-mono text-xs text-slate-700 bg-blue-50/5 border-r border-slate-50 font-medium">
                                              {item.quantity.toLocaleString()}
                                          </td>
                                          <td className="px-2 py-2 text-right font-mono text-xs text-blue-600 bg-blue-50/5 font-medium">
                                              ${currentCost.toLocaleString()}
                                          </td>

                                          {/* Progress */}
                                          <td className="px-2 py-2 text-center bg-emerald-50/5 border-r border-slate-50">
                                              <div className="flex items-center justify-center gap-1">
                                                  <div className="w-12 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                                      <div className="h-full bg-emerald-500" style={{ width: `${progress}%` }}></div>
                                                  </div>
                                                  <span className="text-[10px] font-bold text-emerald-700 w-8 text-right">{progress}%</span>
                                              </div>
                                          </td>
                                          <td className="px-2 py-2 text-right font-mono text-xs text-emerald-600 bg-emerald-50/5 font-medium">
                                              ${earnedValue.toLocaleString()}
                                          </td>

                                          {/* Deviation */}
                                          <td className={`px-4 py-2 text-right font-mono text-xs font-bold ${deviation > 0 ? 'text-red-500' : deviation < 0 ? 'text-emerald-500' : 'text-slate-300'}`}>
                                              {deviation > 0 ? '+' : ''}{deviation !== 0 ? `$${deviation.toLocaleString()}` : '-'}
                                          </td>
                                      </tr>
                                  );
                              })}
                          </tbody>
                      </table>
                  </div>
              </div>
          )}
          
          <div className="bg-slate-50 px-3 py-2 border-t border-slate-200 flex justify-between items-center text-[10px] text-slate-500">
              <div className="flex gap-4">
                  <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                      <span>Ruta Crítica</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <span>Tarea Normal</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                      <div className="w-6 h-1.5 bg-slate-600 rounded-sm"></div>
                      <span>Resumen</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 bg-slate-200 border border-slate-300"></div>
                      <span>No Laborable</span>
                  </div>
              </div>
              <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-700 rounded border border-blue-100">
                  <Calculator size={10} />
                  <span>Duración = Cómputo / (Rend. × Frentes)</span>
              </div>
          </div>
      </div>

      {editingItemId && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-5xl h-[90vh] rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95">
                  <APUBuilder budgetItemId={editingItemId} onClose={() => setEditingItemId(null)} />
              </div>
          </div>
      )}
    </div>
  );
};
