
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { printDocument } from '../utils/printDocument';
import { generateId } from '../utils/generateId';
import { useERP } from '../context/ERPContext';
import { calculateUnitPrice } from '../services/calculationService';
import {
  Trash2, Plus, Search, Settings, CheckSquare, Square,
  ArrowRight, Printer, Calculator, ChevronDown, ChevronRight, ChevronUp,
  Info, RefreshCcw, DollarSign, Clock, X, Package, Hammer, Edit3, AlertCircle, PenTool, Sparkles,
  BookOpen, LayoutGrid, Zap, FileText, ShoppingCart, HardHat,
} from 'lucide-react';
import { setReportIntent, takeReportIntent, type BudgetPrintMode, type HubReportId } from '../src/features/reports/reportIntents';
import { BusinessConfig, Task, MasterTask, LaborCategory, ProjectTemplate, MasterTaskMaterial, MasterTaskLabor, MasterTaskEquipment } from '../types';
import { useBudgetTemplates } from '../hooks/useBudgetTemplates';
import { BudgetCostComparisonPanel } from '../src/features/budgets/components/BudgetCostComparisonPanel';
import { BudgetIndexUpdatePanel } from '../src/features/budgets/components/BudgetIndexUpdatePanel';
import { BudgetStalenessAlert } from './BudgetStalenessAlert';
import { PROJECT_TEMPLATES } from '../constants';
import { APUBuilder } from './APUBuilder';
import { useMasterTasks } from '../hooks/useMasterTasks';
import { useMasterMaterials } from '../hooks/useMasterMaterials';
import { buildRubroImportPayloads } from '../services/importMasterRubro';
import { buildImportPayload } from '../services/importMasterTask';
import { QuickBudgetWizard, QuickSelection } from './QuickBudgetWizard';
import { rubroCategory } from '../src/features/quickBudget/engine';
import { officialRubro, isLegacyRubro } from '../src/features/budgets/rubroMap';
import type { QuickTemplate } from '../src/features/quickBudget/types';
import { masterTasksService } from '../services/masterTasksSupabaseService';
import { supabase } from '../services/supabaseClient';
import { laborCategoriesService } from '../services/laborCategoriesService';
import { BudgetBusinessPanel } from './BudgetBusinessPanel';
import { useBudgetKStore, selectBusinessConfig, computeBudgetKSummary } from '../store/useBudgetKStore';
import { computeBudgetItemSaleBreakdown, BudgetItemSaleBreakdown, ItemDirectCostInput } from '../services/budgetItemBreakdown';
import { projectsService } from '../services/projectsService';
import { YieldsErrorBanner, useYieldsBlocked } from './YieldsErrorBanner';
import { TaskTechnicalDetail, RubroBanner } from '../src/features/catalog-media/TaskTechnicalDetail';
import { BudgetRubroIndex } from '../src/features/budgets/components/BudgetRubroIndex';
import { arrangeRubros, loadIndexView, loadPinnedRubros, saveIndexView, savePinnedRubros, sortRubros } from '../src/features/budgets/rubroGroups';
import { MeasurementDrawer } from './MeasurementDrawer';
import { DecimalInput } from './DecimalInput';
import { APUCompositionPanel } from './APUCompositionPanel';
import { buildApuComposition } from '../utils/apuComposition';
import { QuantitySourceBadge } from './QuantitySourceBadge';
import { getQuantitySource, consumePendingHighlight } from '../utils/quantitySource';

interface BudgetEditorProps {
  onNavigate?: (tab: string) => void;
}

export const BudgetEditor: React.FC<BudgetEditorProps> = ({ onNavigate }) => {
  const {
    project, tasks, rubros, rubroPresets,
    materials: projectMaterials,
    addBudgetItem, removeBudgetItem, updateBudgetItem, updateTask, addTask,
    addMaterial, updateMaterial, updateLaborCategory, addLaborCategory, addTaskYield, addTaskLaborYield, addTaskToolYield,
    addRubroPreset, removeRubroPreset, addRubro, removeRubro,
    yieldsIndex, materialsMap, toolYieldsIndex, toolsMap,
    taskCrewYieldsIndex, crewsMap, laborCategoriesMap, taskLaborYieldsIndex,
    loadTemplate,
    updateProjectSettings,
    budgetItemsLoading,
    tasksLoaded,
    measurementSheets,
  } = useERP();
  const yieldsBlocked = useYieldsBlocked();

  // --- UI STATES ---
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(2); 
  // Rubros fijados en el índice (incluye rubros vacíos que agregó el usuario); por proyecto.
  const [pinnedRubros, setPinnedRubros] = useState<string[]>(() => loadPinnedRubros(project.id));
  const [activeRubro, setActiveRubro] = useState<string | undefined>(undefined);
  // Vista del índice (código / etapas / incidencia): ordena índice y tabla.
  const [indexPref, setIndexPref] = useState(loadIndexView);
  useEffect(() => saveIndexView(indexPref), [indexPref]);
  const [globalAdjustment, setGlobalAdjustment] = useState<number>(0); 
  const [expandedRubros, setExpandedRubros] = useState<Set<string>>(new Set(rubros)); 
  const [managePresetsMode, setManagePresetsMode] = useState(false);
  const [showKPanel, setShowKPanel] = useState(false);

  // ── Persistencia del Cuadro Empresario ───────────────────────────────────────
  // Doble escritura intencional:
  //  1. projectsService.update() → Supabase real (awaitable, propaga error)
  //  2. updateProjectSettings()  → optimistic update en ERPContext (UI inmediata)
  const handleSaveBusinessConfig = useCallback(
    async (config: BusinessConfig): Promise<void> => {
      await projectsService.update(project.id, { businessConfig: config });
      updateProjectSettings({ businessConfig: config });
    },
    [project.id, updateProjectSettings],
  );
  const [newPresetName, setNewPresetName] = useState('');

  // Ref para awaitar el INSERT de tarea nueva antes de insertar el budget_item (evita FK violation).
  const pendingTaskRef = useRef<Promise<void> | null>(null);
  // Guard síncrono contra doble-click: en React 18 el state batching no previene que dos eventos
  // rápidos entren al handler antes del primer re-render con saveStatus='saving'.
  const isSavingRef = useRef(false);

  // --- CONFIG PANEL STATE (Quick Add/Edit Item) ---
  const [configPanel, setConfigPanel] = useState<{
      isOpen: boolean;
      mode: 'add' | 'edit';
      category: string; 
      itemId?: string; 
      selectedTaskId: string;
      quantity: number;
  }>({
      isOpen: false,
      mode: 'add',
      category: '',
      selectedTaskId: '',
      quantity: 1
  });

  // --- WIZARD STATE ---
  const [wizardDismissed, setWizardDismissed] = useState(false);
  useEffect(() => setWizardDismissed(false), [project.id]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle');
  const [wizardRubroOpen, setWizardRubroOpen] = useState(false);
  const [wizardSelectedRubro, setWizardSelectedRubro] = useState('');
  const [wizardTemplateOpen, setWizardTemplateOpen] = useState(false);
  const [wizardSelectedTemplateId, setWizardSelectedTemplateId] = useState('');
  const [wizardTemplateMsg, setWizardTemplateMsg] = useState('');
  const [taskSearch, setTaskSearch] = useState('');
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [importingMaster, setImportingMaster] = useState(false);

  // writePayload es async: espera que la Task exista en Supabase antes de insertar
  // el BudgetItem, evitando la violación de FK que causaba pérdida de datos en recarga.
  const writePayload = async (p: ReturnType<typeof buildImportPayload>): Promise<void> => {
    p.materialsToCreate.forEach(m => addMaterial(m));
    p.materialsToUpdate.forEach(({ id, cost }) => updateMaterial(id, { cost }));
    p.laborCategoriesToUpdate.forEach(({ id, basicHourlyRate }) => updateLaborCategory(id, { basicHourlyRate }));
    try {
      await addTask(p.task); // espera confirmación Supabase antes de linkar el budget_item
    } catch (err) {
      // Task no persistió → no insertar yields ni budget_item para evitar FK inválida.
      // La task quedó en local state (optimistic) pero desaparecerá al recargar.
      console.error('[writePayload] Falló el insert de tarea — se cancela el payload:', err);
      return;
    }
    p.taskYields.forEach(ty => addTaskYield(ty));
    p.laborYields.forEach(ly => addTaskLaborYield(ly));
    p.toolYields.forEach(ty => addTaskToolYield(ty));
    try {
      await addBudgetItem(p.budgetItem);
    } catch (err) {
      console.error('[writePayload] Falló el insert de budget_item — tarea importada pero sin ítem de presupuesto:', err);
    }
  };

  const handleWizardRubroImport = async () => {
    if (project.id === '__phantom__' || !wizardSelectedRubro) return;
    const { payloads } = buildRubroImportPayloads(
      wizardSelectedRubro, masterTasks, project.organizationId, project.id,
      laborCategoriesMap, toolsMap, projectMaterials, masterMaterialsMap,
    );
    // for...of para serializar: cada task persiste antes de que empiece la siguiente.
    for (const p of payloads) {
      await writePayload(p);
    }
    setWizardDismissed(true);
  };

  const handleWizardLibraryImport = async () => {
    if (project.id === '__phantom__') return;
    let runningMaterials = [...projectMaterials];
    for (const masterTask of masterTasks) {
      const p = buildImportPayload(
        masterTask, project.organizationId, project.id, 1,
        laborCategoriesMap, toolsMap, runningMaterials, masterMaterialsMap,
      );
      runningMaterials = [...runningMaterials, ...p.materialsToCreate];
      await writePayload(p);
    }
    setWizardDismissed(true);
  };

  // --- MASTER TASKS & TEMPLATES ---
  const { add: addToMaster, tasks: masterTasks, refetch: refetchMasterTasks } = useMasterTasks(project.organizationId);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickRubro, setQuickRubro] = useState<string | undefined>(undefined);
  const [globalTasks, setGlobalTasks] = useState<MasterTask[] | null>(null);
  const [globalError, setGlobalError] = useState('');
  const { templates: budgetTemplates } = useBudgetTemplates(project.organizationId);
  const { items: masterMaterials } = useMasterMaterials(project.organizationId);
  const masterMaterialsMap = useMemo(
    () => Object.fromEntries(masterMaterials.map(m => [m.id, m])),
    [masterMaterials],
  );

  const handleWizardTemplateImport = async () => {
    if (project.id === '__phantom__' || !wizardSelectedTemplateId) return;
    const template = budgetTemplates.find(t => t.id === wizardSelectedTemplateId);
    if (!template) return;

    const sorted = [...template.items].sort((a, b) => a.sortOrder - b.sortOrder);
    let runningMaterials = [...projectMaterials];
    const skipped: string[] = [];

    // for...of serializado: cada task persiste en Supabase antes de que empiece la siguiente.
    // Sin await, los INSERTs corren en paralelo y el budget_item puede violar la FK de task_id.
    for (const item of sorted) {
      const masterTask = masterTasks.find(t => t.id === item.masterTaskId);
      if (!masterTask) {
        skipped.push(item.masterTaskId);
        continue;
      }
      const qty = item.quantity ?? 1;
      const p = buildImportPayload(
        masterTask, project.organizationId, project.id, qty,
        laborCategoriesMap, toolsMap, runningMaterials, masterMaterialsMap,
      );
      runningMaterials = [...runningMaterials, ...p.materialsToCreate];
      await writePayload(p);
    }

    if (skipped.length > 0) {
      setWizardTemplateMsg(`Plantilla aplicada. ${skipped.length} tarea${skipped.length !== 1 ? 's' : ''} no encontrada${skipped.length !== 1 ? 's' : ''} en la base maestra y fue${skipped.length !== 1 ? 'ron' : ''} salteada${skipped.length !== 1 ? 's' : ''}.`);
    } else {
      setWizardDismissed(true);
    }
  };
  // ── Presupuesto rápido: plantillas del sistema ──────────────────────────────
  const handleQuickApply = async (rows: QuickSelection[], template: QuickTemplate): Promise<string> => {
    if (project.id === '__phantom__') throw new Error('Abrí una obra para cargar el presupuesto.');
    const orgId = project.organizationId;

    // 1. Copiar a la empresa los APU que solo están en el catálogo general.
    const globals = rows.filter(r => r.source.kind === 'global');
    const cloneFailed: string[] = [];
    for (const g of Array.from(new Map(globals.map(r => [r.source.kind === 'global' ? r.source.task.id : '', r])).values())) {
      if (g.source.kind !== 'global') continue;
      const { error } = await supabase.rpc('clone_master_task_to_org', {
        p_master_task_id: g.source.task.id,
        p_organization_id: orgId,
      });
      if (error) cloneFailed.push(g.task.name);
    }
    const orgTasks = globals.length > 0 ? await masterTasksService.list(orgId) : masterTasks;
    if (globals.length > 0) refetchMasterTasks();

    // 2. La mano de obra de los APU copiados se vincula por nombre de categoría;
    //    si la empresa no tiene ese oficio, se crea con el valor hora de referencia.
    const resolveMt = (row: QuickSelection): MasterTask | undefined => {
      if (row.source.kind === 'org') return row.source.task;
      if (row.source.kind === 'global') {
        const src = row.source.task;
        return orgTasks.find(t => t.code === src.code && t.name === src.name);
      }
      return undefined;
    };
    const laborMap: Record<string, LaborCategory> = { ...laborCategoriesMap };
    const laborByRole = new Map((Object.values(laborMap) as LaborCategory[]).map(c => [c.role.trim().toLowerCase(), c.id]));
    for (const row of rows) {
      for (const l of resolveMt(row)?.labor ?? []) {
        const key = l.laborCategoryName.trim().toLowerCase();
        if (laborMap[l.laborCategoryId] || laborByRole.has(key)) continue;
        const lc: LaborCategory = {
          id: crypto.randomUUID(), organizationId: orgId, role: l.laborCategoryName,
          basicHourlyRate: l.snapshotHourlyRate ?? 0,
          socialChargesPercent: l.socialChargesPct ?? 95, insurancePercent: l.socialChargesPct === 0 ? 0 : 5,
          family: 'MANO DE OBRA',
        };
        try {
          await laborCategoriesService.create(lc);
          addLaborCategory(lc);
          laborMap[lc.id] = lc;
          laborByRole.set(key, lc.id);
        } catch (e) {
          console.error('[handleQuickApply] No se pudo crear la categoría de mano de obra', l.laborCategoryName, e);
        }
      }
    }
    const withLocalLabor = (mt: MasterTask): MasterTask => ({
      ...mt,
      labor: mt.labor.map(l => laborMap[l.laborCategoryId]
        ? l
        : { ...l, laborCategoryId: laborByRole.get(l.laborCategoryName.trim().toLowerCase()) ?? l.laborCategoryId }),
    });

    let runningMaterials = [...projectMaterials];
    let withApu = 0, withoutApu = 0;
    const skippedLabor = new Set<string>();
    for (const row of rows) {
      const mt = resolveMt(row);
      const category = rubroCategory(row.rubro);
      const base: MasterTask = mt ? withLocalLabor(mt) : {
        id: '', organizationId: orgId, name: row.task.name, unit: row.task.unit, category,
        description: row.task.includes, dailyYield: 1, materials: [], labor: [], equipment: [],
        tags: [], isActive: true, createdAt: '', updatedAt: '',
      } as MasterTask;
      const p = buildImportPayload(
        base, orgId, project.id, row.quantity,
        laborMap, toolsMap, runningMaterials, masterMaterialsMap,
      );
      p.budgetItem.quantity = row.quantity;
      if (!mt) p.task.masterTaskId = undefined;
      if (!p.task.category) p.task.category = category;
      if (!p.task.description) p.task.description = row.task.includes;
      p.skippedLabor.forEach(n => skippedLabor.add(n));
      runningMaterials = [...runningMaterials, ...p.materialsToCreate];
      await writePayload(p);
      if (mt) withApu++; else withoutApu++;
    }
    setWizardDismissed(true);

    const lines = [`${template.name}: ${rows.length} tareas agregadas.`];
    lines.push(`${withApu} con análisis de precio.`);
    if (withoutApu > 0) lines.push(`${withoutApu} sin análisis de precio todavía: tienen la cantidad cargada y el precio lo completás en cada tarea.`);
    if (cloneFailed.length > 0) lines.push(`No se pudieron copiar del catálogo general: ${cloneFailed.join(', ')}.`);
    if (skippedLabor.size > 0) lines.push(`Mano de obra que no está en tu lista de oficios: ${Array.from(skippedLabor).join(', ')}. Agregala en Personal y cuadrillas.`);
    return lines.join('\n');
  };

  const [savedToMasterIds, setSavedToMasterIds] = useState<Set<string>>(new Set());

  const handleSaveToMaster = (task: Task) => {
    const materials: MasterTaskMaterial[] = (yieldsIndex[task.id] ?? [])
      .map(ty => {
        const mat = materialsMap[ty.materialId];
        if (!mat) return null;
        return {
          id: generateId(),
          materialName: mat.name,
          unit: mat.unit,
          quantity: ty.quantity,
          wastePercent: ty.wastePercent,
          lastKnownUnitPrice: mat.cost,
        };
      })
      .filter(Boolean) as MasterTaskMaterial[];

    const labor: MasterTaskLabor[] = (taskLaborYieldsIndex[task.id] ?? [])
      .map(ly => {
        const cat = laborCategoriesMap[ly.laborCategoryId];
        if (!cat) return null;
        return {
          id: generateId(),
          laborCategoryId: ly.laborCategoryId,
          laborCategoryName: cat.role,
          quantity: ly.quantity,
        };
      })
      .filter(Boolean) as MasterTaskLabor[];

    const equipment: MasterTaskEquipment[] = (toolYieldsIndex[task.id] ?? [])
      .map(ty => {
        const tool = toolsMap[ty.toolId];
        if (!tool) return null;
        return {
          id: generateId(),
          toolId: ty.toolId,
          toolName: tool.name,
          hoursPerUnit: ty.hoursPerUnit,
        };
      })
      .filter(Boolean) as MasterTaskEquipment[];

    addToMaster({
      name: task.name,
      unit: task.unit,
      category: task.category ?? '',
      dailyYield: task.dailyYield,
      code: task.code ?? '',
      description: task.description ?? '',
      fixedCost: task.fixedCost ?? 0,
      fixedCostDescription: task.fixedCostDescription ?? '',
      specifications: task.specifications ?? '',
      tags: [],
      materials,
      labor,
      equipment,
    });

    setSavedToMasterIds(prev => new Set(prev).add(task.id));
    setTimeout(() => {
      setSavedToMasterIds(prev => { const n = new Set(prev); n.delete(task.id); return n; });
    }, 3000);
  };

  // --- MASTER APU EDITOR STATE ---
  const [apuEditorTaskId, setApuEditorTaskId] = useState<string | null>(null);
  const [editingQuantityId, setEditingQuantityId] = useState<string | null>(null);
  // Al bajar por la tabla los totales se achican (solo visual: scale). Histéresis + rAF + bloqueo
  // de 200 ms tras cada cambio para que ningún recorte de scrollTop vuelva a disparar el cambio.
  const [tableScrolled, setTableScrolled] = useState(false);
  const scrollRaf = useRef(0);
  const scrollLockUntil = useRef(0);
  const onTableScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (scrollRaf.current) return;
    scrollRaf.current = requestAnimationFrame(() => {
      scrollRaf.current = 0;
      if (performance.now() < scrollLockUntil.current) return;
      const top = el.scrollTop;
      setTableScrolled(prev => {
        const next = prev ? top >= 8 : top > 80;
        if (next !== prev) scrollLockUntil.current = performance.now() + 200;
        return next;
      });
    });
  }, []);
  useEffect(() => () => cancelAnimationFrame(scrollRaf.current), []);
  // Alto de los paneles (índice y presupuesto) = espacio visible de <main> debajo de las pestañas,
  // para que el final de ambos (totales, Cuadro empresario, «Agregar rubro») entre sin scrollear la página.
  const [editorRoot, setEditorRoot] = useState<HTMLDivElement | null>(null);
  const [panelH, setPanelH] = useState<number | null>(null);
  useEffect(() => {
    const root = editorRoot;
    const scroller = root?.closest('main');
    if (!root || !scroller) return;
    const update = () => {
      const top = root.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      const padBottom = parseFloat(getComputedStyle(scroller.firstElementChild ?? scroller).paddingBottom) || 0;
      setPanelH(Math.max(420, Math.floor(scroller.clientHeight - top - padBottom)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(scroller);
    return () => ro.disconnect();
  }, [editorRoot]);
  // Planilla de medición abierta (panel lateral) para un ítem.
  const [measuringItemId, setMeasuringItemId] = useState<string | null>(null);
  // Ítems recién enviados/actualizados desde el Calculador de cómputo: se resaltan unos segundos.
  const [highlightIds, setHighlightIds] = useState<Set<string>>(() => new Set(consumePendingHighlight()));
  useEffect(() => {
    if (highlightIds.size === 0) return;
    const first = document.querySelector(`[data-budget-item-id="${[...highlightIds][0]}"]`);
    first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t = setTimeout(() => setHighlightIds(new Set()), 5000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- PRINT PREVIEW STATE ---
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [comparisonMode, setComparisonMode] = useState<'index' | 'dates'>('index');
  const [tableViewMode, setTableViewMode] = useState<'tecnico' | 'comercial'>('tecnico');
  const [printOptions, setPrintOptions] = useState({
      showUnitPrice: true,
      showQuantity: true,
      showMatSubtotal: true,
      showLabSubtotal: true,
      showTotal: true,
      showCategoryHeaders: true,
      showFooter: true,
      // NEW OPTIONS
      paperSize: 'a4', // 'a4', 'letter', 'legal'
      orientation: 'portrait', // 'portrait', 'landscape'
      showIcon: false,
      customText: '',
      showIncidence: false,
      printMode: 'legacy' as 'legacy' | 'cliente' | 'tecnico' | 'interno' | 'resumido',
  });
  const [printLogo, setPrintLogo] = useState<string | null>(null);
  const budgetPrintRef = useRef<HTMLDivElement | null>(null);

  // --- MENÚ REPORTES ---
  const [reportsMenuOpen, setReportsMenuOpen] = useState(false);
  const reportsMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
      if (!reportsMenuOpen) return;
      const close = (e: MouseEvent) => {
          if (reportsMenuRef.current && !reportsMenuRef.current.contains(e.target as Node)) setReportsMenuOpen(false);
      };
      document.addEventListener('mousedown', close);
      return () => document.removeEventListener('mousedown', close);
  }, [reportsMenuOpen]);
  const openBudgetPrint = (mode?: BudgetPrintMode) => {
      if (mode) setPrintOptions(p => ({ ...p, printMode: mode }));
      setShowPrintPreview(true);
      setReportsMenuOpen(false);
  };
  const openHubReport = (report?: HubReportId) => {
      if (!onNavigate) return;
      if (report) setReportIntent({ kind: 'hub', report });
      setReportsMenuOpen(false);
      onNavigate('reports_view');
  };
  // Abierto desde Reportes → Presupuesto: vista de impresión con el modo elegido
  useEffect(() => {
      const intent = takeReportIntent('budget');
      if (intent) openBudgetPrint(intent.mode);
  }, []);

  const BUDGET_PRINT_STYLES = `
    /* BudgetEditor-specific overrides */
    .space-y-1 > * + * { margin-top: 0.25rem; }
    .justify-end { justify-content: flex-end; }
    .items-end   { align-items: flex-end; }
  `;

  const handlePrintBudget = () => {
    const el = budgetPrintRef.current;
    if (!el || yieldsBlocked) return;
    printDocument({
      title: `${
        printOptions.printMode === 'cliente' ? 'Presupuesto' :
        printOptions.printMode === 'tecnico' ? 'Presupuesto Técnico' :
        printOptions.printMode === 'interno' ? 'Análisis Interno' :
        'Presupuesto'
      } - ${project.name}`,
      html: el.innerHTML,
      styles: BUDGET_PRINT_STYLES,
      pageSize: printOptions.paperSize,
      pageOrientation: printOptions.orientation as 'portrait' | 'landscape',
      pageMargin: '10mm',
    });
  };

  // --- CALCULATIONS & DATA PREP ---
  const budgetData = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    const categoryTotals: Record<string, { mat: number, lab: number, total: number }> = {};

    pinnedRubros.filter((r: string) => !isLegacyRubro(r)).forEach((r: string) => {
        grouped[r] = [];
        categoryTotals[r] = { mat: 0, lab: 0, total: 0 };
    });
    
    grouped['Otros'] = [];
    categoryTotals['Otros'] = { mat: 0, lab: 0, total: 0 };

    let discardedCount = 0;
    project.items.forEach(item => {
      const task = tasks.find(t => t.id === item.taskId);
      if (!task) {
        discardedCount++;
        console.warn('[BudgetEditor] budget_item descartado: task no encontrada en allTasks', {
          itemId: item.id,
          taskId: item.taskId,
          projectId: item.projectId,
          totalTasks: tasks.length,
          hint: 'Si totalTasks=0, las tasks no cargaron. Si totalTasks>0, hay mismatch de IDs o organizationId.',
        });
        return;
      }

      // Fix: usar la categoría real de la tarea; crear bucket dinámico si no existe.
      // Antes: caía en 'Otros' si la categoría no estaba en selectedRubros.
      const category = officialRubro(task.category, task.name);
      if (!grouped[category]) {
        grouped[category] = [];
        categoryTotals[category] = { mat: 0, lab: 0, total: 0 };
        console.info('[BudgetEditor] Bucket dinámico creado para categoría:', category);
      }

      const analysis = calculateUnitPrice(task, yieldsIndex, materialsMap, toolYieldsIndex, toolsMap, taskCrewYieldsIndex, crewsMap, laborCategoriesMap, 9, taskLaborYieldsIndex);
      
      const unitMatEq = analysis.materialCost + analysis.toolCost + analysis.fixedCost;
      const unitLab = analysis.laborCost;
      
      const totalMatEq = unitMatEq * item.quantity;
      const totalLab = unitLab * item.quantity;
      const totalItem = totalMatEq + totalLab;

      if (categoryTotals[category]) {
          categoryTotals[category].mat += totalMatEq;
          categoryTotals[category].lab += totalLab;
          categoryTotals[category].total += totalItem;
      }

      if (grouped[category]) {
          grouped[category].push({
              item,
              task,
              analysis,
              unitMatEq,
              unitLab,
              totalMatEq,
              totalLab,
              totalItem
          });
      }
    });

    if (discardedCount > 0) {
      console.error(
        `[BudgetEditor] ⚠ ${discardedCount}/${project.items.length} budget_items DESCARTADOS por task no encontrada.`,
        `Tasks disponibles: ${tasks.length}. Causa probable: INSERT de task falló o task.organizationId ≠ orgId.`,
      );
    }

    // Ordenar cada grupo por sortOrder (NULLS LAST). Items sin sort_order mantienen
    // el orden de inserción (por created_at, que es el orden en que llegaron de DB).
    for (const cat of Object.keys(grouped)) {
      grouped[cat].sort((a: any, b: any) => {
        const ao = a.item.sortOrder ?? Infinity;
        const bo = b.item.sortOrder ?? Infinity;
        return ao - bo;
      });
    }

    return { grouped, categoryTotals };
  }, [project.items, tasks, pinnedRubros, yieldsIndex, materialsMap, toolYieldsIndex, toolsMap, taskCrewYieldsIndex, crewsMap, laborCategoriesMap]);

  const grandTotals = useMemo(() => {
      let mat = 0;
      let lab = 0;
      Object.values(budgetData.categoryTotals).forEach((t: any) => {
          mat += t.mat;
          lab += t.lab;
      });
      const subtotal = mat + lab;
      const adjustmentAmount = subtotal * (globalAdjustment / 100);
      const finalTotal = subtotal + adjustmentAmount;

      return { mat, lab, subtotal, adjustmentAmount, finalTotal };
  }, [budgetData, globalAdjustment]);

  // ── Valorización comercial por ítem (Cuadro Empresario distribuido) ──────────
  //
  // Lee businessConfig del mismo store Zustand que BudgetBusinessPanel.
  // No re-inicializa la config: BudgetBusinessPanel ya lo hace a través de su
  // prop businessConfigFromDB / legacyPricing. Aquí solo leemos.
  //
  // Dependencia directa sobre grandTotals.subtotal para que al cambiar
  // las cantidades de los ítems los breakdowns se actualicen de inmediato.
  const kConfigSelector = useMemo(() => selectBusinessConfig(project.id), [project.id]);
  const budgetBusinessConfig = useBudgetKStore(kConfigSelector) as BusinessConfig;

  const budgetKSummary = useMemo(
    () => computeBudgetKSummary(grandTotals.subtotal, budgetBusinessConfig),
    [grandTotals.subtotal, budgetBusinessConfig],
  );

  /**
   * Map keyed by BudgetItem.id → BudgetItemSaleBreakdown.
   * Lookup O(1) en render: breakdownByItemId[row.item.id]?.salePriceUnit
   *
   * Para totales del presupuesto usar budgetKSummary.finalSalePrice
   * (fuente de verdad), NO la suma de salePriceTotal de los ítems
   * (puede diferir por punto flotante).
   */
  const breakdownByItemId = useMemo((): Record<string, BudgetItemSaleBreakdown> => {
    const inputs: ItemDirectCostInput[] = [];

    // Recorre TODOS los rubros, incluyendo 'Otros'
    Object.values(budgetData.grouped).forEach((rows: any[]) => {
      rows.forEach(row => {
        inputs.push({
          id:              row.item.id as string,
          quantity:        row.item.quantity as number,
          directCostUnit:  (row.unitMatEq + row.unitLab) as number,
          directCostTotal: row.totalItem as number,
        });
      });
    });

    const breakdowns = computeBudgetItemSaleBreakdown(inputs, budgetKSummary);
    return Object.fromEntries(breakdowns.map(b => [b.id, b]));
  }, [budgetData.grouped, budgetKSummary]);

  // Auto-expandir 'Otros' cuando tiene ítems (no está en la lista inicial de rubros)
  useEffect(() => {
    if (budgetData.grouped['Otros']?.length > 0) {
      setExpandedRubros(prev => new Set([...prev, 'Otros']));
    }
  }, [budgetData.grouped]);

  // ── Fix 1: Auto-agregar categorías de tareas que no existen en rubros ─────────
  // Corre cuando las tareas terminan de cargar. Evita loop usando ref para rubros.
  const rubrosRef = useRef(rubros);
  rubrosRef.current = rubros;
  useEffect(() => {
    if (!tasksLoaded) return;
    const currentRubros = rubrosRef.current;
    currentRubros.filter(isLegacyRubro).forEach(r => removeRubro(r));
    const unknown = [
      ...new Set(
        tasks
          .filter(t => t.category?.trim())
          .map(t => officialRubro(t.category, t.name))
          .filter(c => !currentRubros.includes(c)),
      ),
    ];
    if (unknown.length > 0) {
      console.info('[BudgetEditor] Categorías de tarea sin rubro registrado — agregando dinámicamente:', unknown);
      unknown.forEach(cat => addRubro(cat));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, tasksLoaded]);

  // ── Fix 2: expandir rubros nuevos cuando rubros crece con entradas nuevas ──
  const seenRubrosRef = useRef(new Set(rubros));
  useEffect(() => {
    const newEntries = rubros.filter(r => !seenRubrosRef.current.has(r));
    if (newEntries.length > 0) {
      newEntries.forEach(r => seenRubrosRef.current.add(r));
      setExpandedRubros(prev => new Set([...prev, ...newEntries]));
    }
  }, [rubros]);

  // ── Índice de rubros ──────────────────────────────────────────────────────
  // Fijados por proyecto: se recargan al cambiar de proyecto.
  const pinnedProjectRef = useRef(project.id);
  useEffect(() => {
    if (pinnedProjectRef.current === project.id) return;
    pinnedProjectRef.current = project.id;
    setPinnedRubros(loadPinnedRubros(project.id));
  }, [project.id]);

  // Un rubro con ítems queda fijado: si se borra su último ítem no desaparece del índice.
  useEffect(() => {
    const withItems = Object.keys(budgetData.grouped).filter(
      r => r !== 'Otros' && budgetData.grouped[r].length > 0,
    );
    const missing = withItems.filter(r => !pinnedRubros.includes(r));
    if (missing.length > 0) setPinnedRubros(prev => sortRubros([...prev, ...missing]));
  }, [budgetData.grouped, pinnedRubros]);

  useEffect(() => {
    if (project.id === '__phantom__' || pinnedProjectRef.current !== project.id) return;
    savePinnedRubros(project.id, pinnedRubros);
  }, [pinnedRubros, project.id]);

  /** Rubros visibles en tabla, índice e impresión: fijados + con ítems, por código. 'Otros' al final. */
  const visibleRubros = useMemo(() => {
    const withItems = Object.keys(budgetData.grouped).filter(r => budgetData.grouped[r].length > 0);
    return sortRubros([...pinnedRubros, ...withItems]).filter(r => !isLegacyRubro(r));
  }, [pinnedRubros, budgetData.grouped]);

  const rubroIndexEntries = useMemo(() => visibleRubros.map(rubro => {
    const rows = budgetData.grouped[rubro] || [];
    const amount = tableViewMode === 'comercial'
      ? rows.reduce((s: number, r: any) => s + (breakdownByItemId[r.item.id]?.salePriceTotal ?? 0), 0)
      : budgetData.categoryTotals[rubro]?.total ?? 0;
    return { rubro, count: rows.length, amount };
  }), [visibleRubros, budgetData, breakdownByItemId, tableViewMode]);

  /** Rubros de la tabla en el orden de la vista elegida; en «Etapas», con encabezado por etapa. */
  const tableRubroSections = useMemo(
    () => arrangeRubros(rubroIndexEntries, indexPref.view),
    [rubroIndexEntries, indexPref.view],
  );
  const tableTotal = tableViewMode === 'comercial' ? budgetKSummary.finalSalePrice : grandTotals.subtotal;

  // ── Todos los rubros a mostrar en sidebar = ERPContext + categorías dinámicas ──
  const allSidebarRubros = useMemo(() => {
    const extra = new Set<string>();
    tasks.forEach(t => {
      if (!t.category?.trim()) return;
      const cat = officialRubro(t.category, t.name);
      if (!rubros.includes(cat)) extra.add(cat);
    });
    const base = rubros.filter(r => !isLegacyRubro(r));
    return extra.size > 0 ? [...base, ...[...extra].sort()] : base;
  }, [rubros, tasks]);

  // --- HANDLERS ---

  const jumpToRubro = (rubro: string) => {
      setActiveRubro(rubro);
      setShowComparison(false);
      setExpandedRubros(prev => new Set([...prev, rubro]));
      requestAnimationFrame(() => requestAnimationFrame(() => {
          document.querySelector(`[data-rubro-row="${CSS.escape(rubro)}"]`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }));
  };

  const addRubroToIndex = (rubro: string) => {
      setPinnedRubros(prev => sortRubros([...prev, rubro]));
      jumpToRubro(rubro);
      handleQuickAddTask(rubro);
  };

  const removeRubroFromIndex = (rubro: string) => {
      if ((budgetData.grouped[rubro]?.length ?? 0) > 0) return;
      setPinnedRubros(prev => prev.filter(r => r !== rubro));
      if (activeRubro === rubro) setActiveRubro(undefined);
  };

  const toggleRubroExpansion = (rubro: string) => {
      const newSet = new Set(expandedRubros);
      if (newSet.has(rubro)) newSet.delete(rubro);
      else newSet.add(rubro);
      setExpandedRubros(newSet);
  };


  // ── Reordenamiento de ítems dentro de un rubro ────────────────────────────
  const handleMoveItem = (category: string, rowIndex: number, direction: 'up' | 'down') => {
    const categoryItems = budgetData.grouped[category];
    if (!categoryItems) return;
    const targetIndex = direction === 'up' ? rowIndex - 1 : rowIndex + 1;
    if (targetIndex < 0 || targetIndex >= categoryItems.length) return;

    const movingRow = categoryItems[rowIndex] as any;
    const swapRow   = categoryItems[targetIndex] as any;

    // Verificar si algún ítem del proyecto carece de sort_order (primera operación).
    const allProjectRows: any[] = Object.values(budgetData.grouped).flat();
    const needsInit = allProjectRows.some((r: any) => r.item.sortOrder == null);

    if (needsInit) {
      // Asignar sort_order = (posición global + 1) × 10 a todos los ítems,
      // intercalando el swap pedido para que quede reflejado en esta inicialización.
      const movingId = movingRow.item.id;
      const swapId   = swapRow.item.id;
      const movingGlobal = allProjectRows.findIndex((r: any) => r.item.id === movingId);
      const swapGlobal   = allProjectRows.findIndex((r: any) => r.item.id === swapId);
      allProjectRows.forEach((row: any, i: number) => {
        let order = (i + 1) * 10;
        if (row.item.id === movingId) order = (swapGlobal   + 1) * 10;
        else if (row.item.id === swapId)   order = (movingGlobal + 1) * 10;
        updateBudgetItem(row.item.id, { sortOrder: order });
      });
    } else {
      // Intercambio simple de sort_orders ya asignados.
      updateBudgetItem(movingRow.item.id, { sortOrder: swapRow.item.sortOrder });
      updateBudgetItem(swapRow.item.id,   { sortOrder: movingRow.item.sortOrder });
    }
  };

  useEffect(() => {
    if (!configPanel.isOpen || configPanel.mode !== 'add' || globalTasks !== null) return;
    masterTasksService.listGlobal().then(setGlobalTasks).catch(() => setGlobalTasks([]));
  }, [configPanel.isOpen, configPanel.mode, globalTasks]);

  const budgetExisting = useMemo(() => {
    const codes: string[] = [];
    const names: string[] = [];
    for (const it of project.items) {
      const t = tasks.find(x => x.id === it.taskId);
      if (!t) continue;
      names.push(t.name);
      const code = t.masterTaskId ? masterTasks.find(m => m.id === t.masterTaskId)?.code : undefined;
      if (code) codes.push(code);
    }
    return { codes, names };
  }, [project.items, tasks, masterTasks]);

  const GLOBAL_PREFIX = 'global:';
  const selectedGlobal = configPanel.selectedTaskId.startsWith(GLOBAL_PREFIX)
    ? (globalTasks ?? []).find(g => g.id === configPanel.selectedTaskId.slice(GLOBAL_PREFIX.length))
    : undefined;

  const openQuickForRubro = (rubro?: string) => {
    setQuickRubro(rubro);
    setConfigPanel(prev => ({ ...prev, isOpen: false }));
    setQuickOpen(true);
  };

  // Quick Add Handler
  const handleQuickAddTask = (category: string) => {
      setTaskSearch('');
      setDuplicateWarning(false);
      setConfigPanel({
          isOpen: true,
          mode: 'add',
          category: category,
          selectedTaskId: '',
          quantity: 1
      });
  };

  // Item Edit Handler (Quantity/Task Swap)
  const handleEditItem = (item: any) => {
      const task = tasks.find(t => t.id === item.taskId);
      setTaskSearch('');
      setDuplicateWarning(false);
      setConfigPanel({
          isOpen: true,
          mode: 'edit',
          category: task?.category || 'Otros',
          itemId: item.id,
          selectedTaskId: item.taskId,
          quantity: item.quantity
      });
  };

  const handleSavePanel = async () => {
      // Guard síncrono: previene doble-INSERT aunque React 18 batching retrase el re-render
      if (isSavingRef.current) return;
      if (!configPanel.selectedTaskId) return;

      if (selectedGlobal) {
          isSavingRef.current = true;
          setSaveStatus('saving');
          setGlobalError('');
          try {
              const rubro = officialRubro(configPanel.category);
              await handleQuickApply([{
                  rubro,
                  task: {
                      name: selectedGlobal.name, includes: selectedGlobal.description ?? '', scope: '',
                      unit: selectedGlobal.unit, qty: configPanel.quantity, include: true, code: selectedGlobal.code,
                  },
                  quantity: configPanel.quantity,
                  included: true,
                  source: { kind: 'global', task: selectedGlobal },
              }], { id: 'panel', name: selectedGlobal.name, description: '', inputs: [], calcs: [], rubros: [] });
              setSaveStatus('ok');
              setTimeout(() => { setSaveStatus('idle'); setConfigPanel(prev => ({ ...prev, isOpen: false })); }, 700);
          } catch (e: any) {
              setGlobalError(e?.message ?? 'No se pudo agregar la tarea.');
              setSaveStatus('error');
              setTimeout(() => setSaveStatus('idle'), 2500);
          } finally {
              isSavingRef.current = false;
          }
          return;
      }

      // Dedup: no insertar si la tarea ya está en el presupuesto
      if (configPanel.mode === 'add') {
          if (project.items.some(bi => bi.taskId === configPanel.selectedTaskId)) {
              setDuplicateWarning(true);
              return;
          }
      } else if (configPanel.mode === 'edit' && configPanel.itemId) {
          if (project.items.some(bi => bi.taskId === configPanel.selectedTaskId && bi.id !== configPanel.itemId)) {
              setDuplicateWarning(true);
              return;
          }
      }
      setDuplicateWarning(false);

      isSavingRef.current = true;

      try {
          if (configPanel.mode === 'add') {
              // Deshabilitar el botón ANTES del primer await para evitar que un doble-click
              // mientras pendingTaskRef está en vuelo llame addBudgetItem dos veces.
              setSaveStatus('saving');

              // Si hay una tarea nueva pendiente, esperarla y abortar si falló (evita FK violation).
              if (pendingTaskRef.current) {
                  let taskOk = true;
                  try {
                      await pendingTaskRef.current;
                  } catch {
                      taskOk = false;
                      console.error('[handleSavePanel] addTask falló — budget_item cancelado');
                  } finally {
                      pendingTaskRef.current = null;
                  }
                  if (!taskOk) {
                      setSaveStatus('error');
                      setTimeout(() => setSaveStatus('idle'), 2500);
                      return;
                  }
              }
              try {
                  await addBudgetItem({
                      id: generateId(),
                      taskId: configPanel.selectedTaskId,
                      quantity: configPanel.quantity,
                      progress: 0,
                  });
                  setSaveStatus('ok');
                  setTimeout(() => {
                      setSaveStatus('idle');
                      setConfigPanel(prev => ({ ...prev, isOpen: false }));
                  }, 900);
              } catch {
                  setSaveStatus('error');
                  setTimeout(() => setSaveStatus('idle'), 2500);
              }
          } else if (configPanel.mode === 'edit' && configPanel.itemId) {
              setSaveStatus('saving');
              updateBudgetItem(configPanel.itemId, {
                  taskId: configPanel.selectedTaskId,
                  quantity: configPanel.quantity,
              });
              setSaveStatus('ok');
              setTimeout(() => {
                  setSaveStatus('idle');
                  setConfigPanel(prev => ({ ...prev, isOpen: false }));
              }, 900);
          }
      } finally {
          // Siempre liberar el guard (incluye early returns de taskOk=false)
          isSavingRef.current = false;
      }
  };

  const handleSelectPreset = (preset: Partial<Task>) => {
      // Guard: tarea anterior todavía en vuelo (evita doble-insert por doble-click o StrictMode)
      if (pendingTaskRef.current) return;
      // Check if task exists
      const existing = tasks.find(t => t.name === preset.name && t.category === configPanel.category);
      if (existing) {
          setConfigPanel(prev => ({ ...prev, selectedTaskId: existing.id }));
          pendingTaskRef.current = null;
      } else {
          // Create new task — actualizamos el panel de inmediato (UX) y guardamos la
          // Promise en un ref para que handleSavePanel pueda awaitar antes de insertar
          // el budget_item, evitando la violación de FK si el INSERT de tarea no terminó.
          const newId = generateId();
          const newTask: Task = {
              id: newId,
              organizationId: project.organizationId,
              name: preset.name || 'Nueva Tarea',
              unit: preset.unit || 'u',
              category: configPanel.category,
              laborCost: preset.laborCost || 0,
              dailyYield: preset.dailyYield || 1,
              description: preset.description || '',
              // ... defaults
          };
          pendingTaskRef.current = addTask(newTask);
          setConfigPanel(prev => ({ ...prev, selectedTaskId: newId }));
      }
  };

  const handleSelectMasterTask = (mt: MasterTask) => {
      if (pendingTaskRef.current || importingMaster) return;
      setDuplicateWarning(false);

      // If already imported into project tasks, just select it
      const existing = tasks.find(t => t.masterTaskId === mt.id);
      if (existing) {
          setConfigPanel(prev => ({ ...prev, selectedTaskId: existing.id }));
          return;
      }

      // Import from master: creates task + yields, stores Promise so handleSavePanel awaits FK
      setImportingMaster(true);
      const payload = buildImportPayload(
          mt, project.organizationId, project.id, 1,
          laborCategoriesMap, toolsMap, projectMaterials, masterMaterialsMap,
      );
      setConfigPanel(prev => ({ ...prev, selectedTaskId: payload.task.id }));

      pendingTaskRef.current = (async () => {
          payload.materialsToCreate.forEach(m => addMaterial(m));
          payload.materialsToUpdate.forEach(({ id, cost }) => updateMaterial(id, { cost }));
          payload.laborCategoriesToUpdate.forEach(({ id, basicHourlyRate }) => updateLaborCategory(id, { basicHourlyRate }));
          await addTask(payload.task);
          payload.taskYields.forEach(ty => addTaskYield(ty));
          payload.laborYields.forEach(ly => addTaskLaborYield(ly));
          payload.toolYields.forEach(ty => addTaskToolYield(ty));
      })().finally(() => {
          setImportingMaster(false);
          pendingTaskRef.current = null;
      });
  };

  const handleAddPreset = () => {
      if (!newPresetName.trim()) return;
      addRubroPreset(configPanel.category, {
          name: newPresetName,
          unit: 'u', // Default unit
          category: configPanel.category,
          laborCost: 0,
          dailyYield: 1
      });
      setNewPresetName('');
  };

  const handleDeletePreset = (name: string) => {
      removeRubroPreset(configPanel.category, name);
  };

  // ── Wizard de inicio ────────────────────────────────────────────────────────
  // Bloquear el render hasta que AMBAS cargas terminen:
  //  • budgetItemsLoading: budget_items del proyecto cargados desde Supabase
  //  • tasksLoaded: tareas de la org cargadas (necesarias para resolver task → ítem)
  //
  // Sin este guard, el wizard aparecería mientras project.items === [] (gap de carga),
  // O el editor mostraría la tabla vacía porque tasks aún no llegaron.
  if (budgetItemsLoading || !tasksLoaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-slate-400 animate-pulse">Cargando presupuesto...</p>
      </div>
    );
  }

  const quickModal = quickOpen ? (
    <QuickBudgetWizard orgTasks={masterTasks} initialRubro={quickRubro} existing={budgetExisting}
      onClose={() => { setQuickOpen(false); setQuickRubro(undefined); }} onApply={handleQuickApply} />
  ) : null;

  if (project.items.length === 0 && !wizardDismissed) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 bg-slate-50/50">
        {quickModal}
        <div className="max-w-md w-full">

          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto mb-4">
              <Sparkles size={28} className="text-blue-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-800">¿Cómo querés empezar?</h2>
            <p className="text-sm text-slate-500 mt-1.5">
              Este presupuesto está vacío. Elegí una opción para comenzar.
            </p>
          </div>

          {/* Picker de rubro */}
          {wizardRubroOpen ? (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <p className="text-sm font-bold text-slate-800">Seleccioná el rubro a importar</p>
              <select
                value={wizardSelectedRubro}
                onChange={e => setWizardSelectedRubro(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {rubros.length === 0 && <option value="">Sin rubros disponibles</option>}
                {rubros.map(r => (
                  <option key={r} value={r}>
                    {r} ({masterTasks.filter(t => t.category === r).length} tareas)
                  </option>
                ))}
              </select>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setWizardRubroOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Volver
                </button>
                <button
                  onClick={handleWizardRubroImport}
                  disabled={!wizardSelectedRubro || rubros.length === 0}
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Importar rubro
                </button>
              </div>
            </div>

          ) : wizardTemplateOpen ? (
            /* Picker de plantilla */
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <p className="text-sm font-bold text-slate-800">Seleccioná una plantilla</p>
              <select
                value={wizardSelectedTemplateId}
                onChange={e => { setWizardSelectedTemplateId(e.target.value); setWizardTemplateMsg(''); }}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                {budgetTemplates.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.category ? ` — ${t.category}` : ''} ({t.items.length} ítem{t.items.length !== 1 ? 's' : ''})
                  </option>
                ))}
              </select>
              {wizardTemplateMsg && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  {wizardTemplateMsg}
                </p>
              )}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setWizardTemplateOpen(false); setWizardTemplateMsg(''); }}
                  className="px-4 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Volver
                </button>
                {wizardTemplateMsg ? (
                  <button
                    onClick={() => setWizardDismissed(true)}
                    className="px-4 py-2 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors"
                  >
                    Ver presupuesto
                  </button>
                ) : (
                  <button
                    onClick={handleWizardTemplateImport}
                    disabled={!wizardSelectedTemplateId}
                    className="px-4 py-2 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Aplicar plantilla
                  </button>
                )}
              </div>
            </div>

          ) : (
            <div className="space-y-3">

              {/* Opción 0 — continuar con trabajo previo */}
              <button
                onClick={() => setWizardDismissed(true)}
                className="w-full flex items-start gap-4 p-4 bg-slate-900 border border-slate-700 rounded-xl hover:bg-slate-800 transition-all text-left group"
              >
                <div className="w-9 h-9 rounded-lg bg-slate-700 flex items-center justify-center flex-shrink-0">
                  <ArrowRight size={18} className="text-white" />
                </div>
                <div>
                  <p className="font-bold text-sm text-white">Continuar con el presupuesto →</p>
                  <p className="text-xs text-slate-400 mt-0.5">Ya trabajé en este presupuesto. Ir directamente al editor.</p>
                </div>
              </button>

              {/* Presupuesto rápido — plantillas del sistema */}
              <button
                onClick={() => setQuickOpen(true)}
                className="w-full flex items-start gap-4 p-4 bg-orange-50 border border-orange-200 rounded-xl hover:border-orange-400 hover:shadow-sm transition-all text-left group"
              >
                <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
                  <Zap size={18} className="text-orange-600" />
                </div>
                <div>
                  <p className="font-bold text-sm text-slate-800">Presupuesto rápido</p>
                  <p className="text-xs text-slate-500 mt-0.5">Cocina, muro, pintura, pisos, terraza, ampliación y más: cargás las medidas y se arma el listado de tareas.</p>
                </div>
              </button>

              {/* Opción 1 — vacío */}
              <button
                onClick={() => setWizardDismissed(true)}
                className="w-full flex items-start gap-4 p-4 bg-white border border-slate-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all text-left group"
              >
                <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100 transition-colors">
                  <Plus size={18} className="text-slate-500 group-hover:text-blue-600 transition-colors" />
                </div>
                <div>
                  <p className="font-bold text-sm text-slate-800">Crear presupuesto vacío</p>
                  <p className="text-xs text-slate-500 mt-0.5">Empezá desde cero, agregando tareas manualmente.</p>
                </div>
              </button>

              {/* Opción 2 — rubros desde Base Maestra */}
              <button
                onClick={() => { setWizardSelectedRubro(rubros[0] ?? ''); setWizardRubroOpen(true); }}
                disabled={masterTasks.length === 0 || rubros.length === 0}
                className="w-full flex items-start gap-4 p-4 bg-white border border-slate-200 rounded-xl hover:border-indigo-300 hover:shadow-sm transition-all text-left group disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-100 transition-colors">
                  <Package size={18} className="text-slate-500 group-hover:text-indigo-600 transition-colors" />
                </div>
                <div>
                  <p className="font-bold text-sm text-slate-800">Copiar rubros desde Base Maestra</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {masterTasks.length === 0 ? 'No hay tareas maestras en tu organización.' : 'Importá las tareas APU de tu organización, agrupadas por rubro.'}
                  </p>
                </div>
              </button>

              {/* Opción 3 — biblioteca completa */}
              <button
                onClick={handleWizardLibraryImport}
                disabled={masterTasks.length === 0}
                className="w-full flex items-start gap-4 p-4 bg-white border border-slate-200 rounded-xl hover:border-emerald-300 hover:shadow-sm transition-all text-left group disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-100 transition-colors">
                  <DollarSign size={18} className="text-slate-500 group-hover:text-emerald-600 transition-colors" />
                </div>
                <div>
                  <p className="font-bold text-sm text-slate-800">Copiar biblioteca completa</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {masterTasks.length === 0 ? 'No hay tareas maestras en tu organización.' : `Importar las ${masterTasks.length} tarea${masterTasks.length !== 1 ? 's' : ''} disponibles de una vez.`}
                  </p>
                </div>
              </button>

              {/* Opción 4 — desde plantilla */}
              <button
                onClick={() => { setWizardSelectedTemplateId(budgetTemplates[0]?.id ?? ''); setWizardTemplateMsg(''); setWizardTemplateOpen(true); }}
                disabled={budgetTemplates.length === 0}
                className="w-full flex items-start gap-4 p-4 bg-white border border-slate-200 rounded-xl hover:border-violet-300 hover:shadow-sm transition-all text-left group disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 group-hover:bg-violet-100 transition-colors">
                  <LayoutGrid size={18} className="text-slate-500 group-hover:text-violet-600 transition-colors" />
                </div>
                <div>
                  <p className="font-bold text-sm text-slate-800">Crear desde plantilla</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {budgetTemplates.length === 0
                      ? 'No hay plantillas en tu organización. Creá una en la pestaña Plantillas de Administración.'
                      : `${budgetTemplates.length} plantilla${budgetTemplates.length !== 1 ? 's' : ''} disponible${budgetTemplates.length !== 1 ? 's' : ''}.`}
                  </p>
                </div>
              </button>

            </div>
          )}
        </div>
      </div>
    );
  }

  // Render logic
  return (
    <div
      ref={setEditorRoot}
      style={panelH ? ({ '--panel-h': `${panelH}px` } as React.CSSProperties) : undefined}
      className="flex h-full gap-6 font-sans relative">
      {quickModal}
      {measuringItemId && <MeasurementDrawer budgetItemId={measuringItemId} onClose={() => setMeasuringItemId(null)} />}
      {yieldsBlocked && <div className="absolute top-0 inset-x-0 z-30"><YieldsErrorBanner /></div>}
      
      {/* LEFT SIDEBAR: ÍNDICE DE RUBROS */}
      <BudgetRubroIndex
        entries={rubroIndexEntries}
        total={tableTotal}
        amountLabel={tableViewMode === 'comercial' ? 'Precio de venta' : 'Costo directo'}
        allRubros={allSidebarRubros}
        activeRubro={activeRubro}
        onJump={jumpToRubro}
        onAdd={addRubroToIndex}
        onRemove={removeRubroFromIndex}
        onExpandAll={() => setExpandedRubros(new Set(visibleRubros))}
        onCollapseAll={() => setExpandedRubros(new Set())}
        pref={indexPref}
        onPrefChange={setIndexPref}
      />

      {/* MAIN CONTENT */}
      <div
        className="flex-1 min-w-0 flex flex-col h-full md:sticky md:top-4 md:h-[var(--panel-h,calc(100dvh-2rem))] bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden relative print:hidden">
          
          {/* HEADER & STEPPER */}
          {/* Barra de botones: alto constante. El título va dentro del área que scrollea. */}
          <div className="border-b border-slate-100 px-6 py-3">
              <div className="flex flex-wrap justify-end items-center gap-3">
                  <div className="flex flex-wrap items-center justify-end gap-2 ml-auto">
                      <div className="flex items-center rounded-lg overflow-hidden border border-slate-200 text-xs font-bold">
                          <button
                              onClick={() => setTableViewMode('tecnico')}
                              className={`h-9 px-3 transition-colors ${tableViewMode === 'tecnico' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                          >
                              Costo Directo
                          </button>
                          <button
                              onClick={() => setTableViewMode('comercial')}
                              className={`h-9 px-3 transition-colors ${tableViewMode === 'comercial' ? 'bg-emerald-700 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                          >
                              Precio Venta
                          </button>
                      </div>
                      <button
                          onClick={() => setQuickOpen(true)}
                          title="Presupuesto rápido"
                          className="flex items-center gap-2 h-9 px-2.5 2xl:px-3.5 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                          <Zap size={15} className="text-orange-500" /> <span className="hidden 2xl:inline">Presupuesto rápido</span>
                      </button>
                      <button
                          onClick={() => setShowComparison(v => !v)}
                          aria-pressed={showComparison}
                          title="Actualizar presupuesto"
                          className={`flex items-center gap-2 h-9 px-2.5 2xl:px-3.5 rounded-lg text-xs font-bold border transition-colors ${showComparison ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                      >
                          <DollarSign size={15} className={showComparison ? 'text-blue-600' : 'text-slate-500'} /> <span className="hidden 2xl:inline">Actualizar presupuesto</span>
                      </button>
                      <div className="relative" ref={reportsMenuRef}>
                          <button
                              onClick={() => setReportsMenuOpen(v => !v)}
                              aria-haspopup="menu"
                              aria-expanded={reportsMenuOpen}
                              className="flex items-center gap-2 h-9 pl-3.5 pr-2.5 rounded-lg text-xs font-bold bg-slate-900 text-white hover:bg-black transition-colors"
                          >
                              <Printer size={15} /> Reportes <ChevronDown size={14} className={`transition-transform ${reportsMenuOpen ? 'rotate-180' : ''}`} />
                          </button>
                          {reportsMenuOpen && (
                              <div role="menu" className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-40 py-2 text-sm">
                                  <p className="px-4 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Imprimir presupuesto</p>
                                  {([
                                      ['cliente', 'Para el cliente', 'Precio de venta, sin costos internos'],
                                      ['tecnico', 'Técnico', 'Costo directo y precio de venta'],
                                      ['interno', 'Interno', 'Desglose completo'],
                                      ['resumido', 'Por rubros', 'Solo totales de cada rubro'],
                                  ] as [BudgetPrintMode, string, string][]).map(([mode, label, desc]) => (
                                      <button key={mode} role="menuitem" onClick={() => openBudgetPrint(mode)} className="w-full text-left px-4 py-1.5 hover:bg-slate-50 flex items-start gap-2.5">
                                          <FileText size={15} className="text-slate-400 mt-0.5" />
                                          <span><span className="font-semibold text-slate-800 block">{label}</span><span className="text-xs text-slate-500">{desc}</span></span>
                                      </button>
                                  ))}
                                  <button role="menuitem" onClick={() => openBudgetPrint()} className="w-full text-left px-4 py-1.5 hover:bg-slate-50 text-xs text-slate-500 pl-11">
                                      Personalizar columnas y formato…
                                  </button>
                                  {onNavigate && (
                                      <>
                                          <div className="my-2 border-t border-slate-100" />
                                          <p className="px-4 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">Obra</p>
                                          {([
                                              ['compras', 'Lista de compras', ShoppingCart],
                                              ['cotizacion', 'Pedido de cotización', Package],
                                              ['mano-obra', 'Mano de obra por oficio', HardHat],
                                          ] as [HubReportId, string, typeof Package][]).map(([id, label, Icon]) => (
                                              <button key={id} role="menuitem" onClick={() => openHubReport(id)} className="w-full text-left px-4 py-1.5 hover:bg-slate-50 flex items-center gap-2.5 font-semibold text-slate-800">
                                                  <Icon size={15} className="text-slate-400" /> {label}
                                              </button>
                                          ))}
                                          <div className="my-2 border-t border-slate-100" />
                                          <button role="menuitem" onClick={() => openHubReport()} className="w-full text-left px-4 py-1.5 hover:bg-slate-50 text-blue-600 font-semibold flex items-center gap-2.5">
                                              <ArrowRight size={15} /> Ver todos los reportes
                                          </button>
                                      </>
                                  )}
                              </div>
                          )}
                      </div>
                  </div>
              </div>
          </div>

          {/* COMPARISON PANEL */}
          {showComparison && (
              <div className="flex-1 min-h-0 overflow-auto bg-slate-50/50 p-6">
                  <div className="mb-4">
                      <h1 className="text-2xl font-black text-slate-800 tracking-tight">Cómputo y Presupuesto Profesional</h1>
                      <div className="text-sm text-slate-500 mt-1 flex items-center gap-2">
                          <Clock size={14} /> Última actualización: {new Date().toLocaleDateString()}
                      </div>
                  </div>
                  <div role="tablist" aria-label="Tipo de comparación" className="flex flex-wrap gap-1 border-b border-slate-200 mb-6">
                      {([['index', 'Actualizar por índice (CAC, ICC, inflación, dólar)'], ['dates', 'Comparar precios de la base entre dos fechas']] as const).map(([id, label]) => (
                          <button
                              key={id}
                              role="tab"
                              aria-selected={comparisonMode === id}
                              onClick={() => setComparisonMode(id)}
                              className={`px-4 py-3 text-sm font-semibold border-b-[3px] -mb-px ${comparisonMode === id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                          >
                              {label}
                          </button>
                      ))}
                  </div>
                  {comparisonMode === 'index' ? (
                      <BudgetIndexUpdatePanel />
                  ) : (
                      <BudgetCostComparisonPanel
                          projectId={project.id}
                          organizationId={project.organizationId}
                      />
                  )}
              </div>
          )}

          {/* STALENESS ALERT */}
          {!showComparison && project.id && project.id !== '__phantom__' && project.organizationId && (
              <div className="px-6 pt-3">
                  <BudgetStalenessAlert
                      projectId={project.id}
                      organizationId={project.organizationId}
                  />
              </div>
          )}

          {/* TABLE CONTENT */}
          {/* La tabla scrollea dentro del panel (alto de pantalla en desktop) y el encabezado queda fijo. */}
          {/* El título se va con el contenido; la fila de columnas es sticky en este mismo contenedor
              (vertical y horizontal). Nada de lo que cambia al scrollear altera el alto de este contenedor. */}
          {!showComparison && <div className="flex-1 min-h-0 overflow-auto bg-slate-50/50 p-6 pt-0" onScroll={onTableScroll}>
              <div className="sticky left-6 pt-5 pb-1">
                  <h1 className="text-2xl font-black text-slate-800 tracking-tight">Cómputo y Presupuesto Profesional</h1>
                  <div className="text-sm text-slate-500 mt-1 flex items-center gap-2">
                      <Clock size={14} /> Última actualización: {new Date().toLocaleDateString()}
                  </div>
              </div>
              <div className="mt-4 w-max min-w-full bg-white border border-slate-200 shadow-sm rounded-lg overflow-clip">
                  <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 z-20 shadow-[0_1px_0_0_rgb(226_232_240),0_2px_4px_-2px_rgb(15_23_42/0.15)]">
                          <tr className="bg-slate-100 text-slate-500 text-[10px] uppercase font-bold border-b border-slate-200">
                              <th className="p-3 min-w-[14rem]">Descripción del Ítem</th>
                              <th className="p-3 w-16 text-center">Unidad</th>
                              <th className="p-3 w-24 text-center">Cantidad</th>
                              {tableViewMode === 'tecnico' ? (
                                  <>
                                      <th className="p-3 w-28 text-right bg-blue-50/50 border-l border-slate-200">Material<br/>x Unidad</th>
                                      <th className="p-3 w-28 text-right bg-blue-50/50">Material<br/>Subtotal</th>
                                      <th className="p-3 w-28 text-right bg-orange-50/50 border-l border-slate-200">M.Obra<br/>x Unidad</th>
                                      <th className="p-3 w-28 text-right bg-orange-50/50">M.Obra<br/>Subtotal</th>
                                      <th className="p-3 w-32 text-right bg-slate-200/50 border-l border-slate-200">Subtotal CD</th>
                                  </>
                              ) : (
                                  <>
                                      <th className="p-3 w-32 text-right bg-emerald-50 border-l border-slate-200">PV<br/>Unit.</th>
                                      <th className="p-3 w-36 text-right bg-emerald-100/60">PV<br/>Total</th>
                                  </>
                              )}
                              <th className="p-3 w-20 text-center"></th>
                          </tr>
                      </thead>
                      <tbody>
                          {tableRubroSections.flatMap(section => section.entries.map((entry, entryIdx) => {
                              const rubro = entry.rubro;
                              const items = budgetData.grouped[rubro] || [];
                              const isExpanded = expandedRubros.has(rubro);
                              const totals = budgetData.categoryTotals[rubro];

                              return (
                                  <React.Fragment key={rubro}>
                                      {/* ETAPA HEADER (vista «Etapas») */}
                                      {section.label && entryIdx === 0 && (
                                          <tr className="bg-slate-100 border-y border-slate-300">
                                              <td colSpan={tableViewMode === 'tecnico' ? 9 : 6} className="px-4 py-2">
                                                  <div className="flex items-baseline justify-between text-xs">
                                                      <span className="font-black uppercase tracking-wider text-slate-600">{section.label}</span>
                                                      <span className="font-mono font-bold text-slate-700">
                                                          ${section.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                          <span className="ml-2 text-slate-400 font-normal">{tableTotal > 0 ? ((section.amount / tableTotal) * 100).toFixed(1) : '0.0'}%</span>
                                                      </span>
                                                  </div>
                                              </td>
                                          </tr>
                                      )}
                                      {/* RUBRO HEADER */}
                                      <tr data-rubro-row={rubro} className="bg-slate-800 text-white cursor-pointer hover:bg-slate-700 transition-colors scroll-mt-12" onClick={() => toggleRubroExpansion(rubro)}>
                                          <td colSpan={3} className="p-2 pl-4 font-bold text-sm uppercase tracking-wide">
                                              <span className="flex items-center gap-2">
                                                  {isExpanded ? <ChevronDown size={16} className="shrink-0" /> : <ChevronRight size={16} className="shrink-0" />}
                                                  {rubro}
                                              </span>
                                          </td>
                                          {tableViewMode === 'tecnico' ? (
                                              <>
                                                  <td colSpan={4}></td>
                                                  <td className="p-2 text-right font-mono font-bold text-sm">
                                                      ${totals.total.toLocaleString(undefined, {minimumFractionDigits: 2})}
                                                  </td>
                                              </>
                                          ) : (
                                              <>
                                                  <td colSpan={1}></td>
                                                  <td className="p-2 text-right font-mono font-bold text-sm text-emerald-300">
                                                      ${items.reduce((s, r) => s + (breakdownByItemId[r.item.id]?.salePriceTotal ?? 0), 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
                                                  </td>
                                              </>
                                          )}
                                          <td></td>
                                      </tr>

                                      {/* RUBRO ITEMS */}
                                      {isExpanded && (
                                          <>
                                              {items.length === 0 ? (
                                                  <tr>
                                                      <td colSpan={tableViewMode === 'tecnico' ? 9 : 6} className="p-4 text-center bg-slate-50 border-b border-slate-200">
                                                          <div className="flex flex-col items-center justify-center text-slate-400 gap-2">
                                                              <span className="text-xs italic">No hay ítems en esta etapa.</span>
                                                              <button onClick={() => handleQuickAddTask(rubro)} className="text-blue-600 font-bold text-xs hover:underline flex items-center gap-1">
                                                                  <Plus size={12} /> Agregar Tarea Estándar
                                                              </button>
                                                          </div>
                                                      </td>
                                                  </tr>
                                              ) : (
                                                  <>
                                                    {items.map((row, rowIndex) => (
                                                        <tr key={row.item.id} data-budget-item-id={row.item.id} className={`border-b border-slate-100 hover:bg-blue-50/30 transition-colors group ${highlightIds.has(row.item.id) ? 'bg-teal-50 ring-2 ring-inset ring-teal-300' : ''}`}>
                                                            {/* Description */}
                                                            <td className="p-2 pl-8">
                                                                <div className="font-medium text-slate-700 text-xs max-w-[24rem]">{row.task.name}</div>
                                                                <div className="text-[9px] text-slate-400">{row.task.code}</div>
                                                            </td>
                                                            
                                                            {/* Unit */}
                                                            <td className="p-2 text-center text-xs text-slate-500 bg-slate-50/50">{row.task.unit}</td>
                                                            
                                                            {/* Quantity Input — con origen (Manual / Medido / Calculador) */}
                                                            {(() => {
                                                                const src = getQuantitySource(row.item, measurementSheets);
                                                                const openSheet = () => { setEditingQuantityId(null); setMeasuringItemId(row.item.id); };
                                                                return (
                                                            <td className="p-2" onDoubleClick={() => src.kind === 'medido' ? openSheet() : setEditingQuantityId(row.item.id)}>
                                                                {editingQuantityId === row.item.id ? (
                                                                    <DecimalInput
                                                                        autoFocus
                                                                        className="w-full text-center p-1 border border-blue-500 rounded text-sm font-bold text-slate-800 focus:outline-none shadow-sm"
                                                                        value={row.item.quantity}
                                                                        onValue={(n) => updateBudgetItem(row.item.id, {
                                                                            quantity: n,
                                                                            // Al tipear a mano deja de ser una cantidad del calculador.
                                                                            ...(row.item.computationItemId ? { computationItemId: null } : {}),
                                                                        })}
                                                                        onBlur={() => setEditingQuantityId(null)}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === 'Enter') setEditingQuantityId(null);
                                                                        }}
                                                                    />
                                                                ) : (
                                                                    <div className="flex flex-col items-center gap-0.5">
                                                                        <div
                                                                            className="text-center text-sm font-bold text-slate-700 cursor-pointer hover:text-blue-600 hover:bg-blue-50 px-2 py-0.5 rounded transition-colors"
                                                                            title={src.kind === 'medido' ? 'Doble clic para abrir la planilla de medición' : 'Doble clic para editar'}
                                                                        >
                                                                            {row.item.quantity}
                                                                        </div>
                                                                        <QuantitySourceBadge source={src} onClick={openSheet} />
                                                                    </div>
                                                                )}
                                                            </td>
                                                                );
                                                            })()}

                                                            {/* Material / Labor / PV Columns */}
                                                            {tableViewMode === 'tecnico' ? (
                                                                <>
                                                                    <td className="p-2 text-right text-xs text-slate-500 border-l border-slate-100 font-mono">
                                                                        ${row.unitMatEq.toFixed(2)}
                                                                    </td>
                                                                    <td className="p-2 text-right text-xs font-bold text-slate-600 bg-blue-50/20 font-mono">
                                                                        ${row.totalMatEq.toLocaleString(undefined, {minimumFractionDigits: 2})}
                                                                    </td>
                                                                    <td className="p-2 text-right text-xs text-slate-500 border-l border-slate-100 font-mono">
                                                                        ${row.unitLab.toFixed(2)}
                                                                    </td>
                                                                    <td className="p-2 text-right text-xs font-bold text-slate-600 bg-orange-50/20 font-mono">
                                                                        ${row.totalLab.toLocaleString(undefined, {minimumFractionDigits: 2})}
                                                                    </td>
                                                                    <td className="p-2 text-right text-xs font-bold text-slate-800 bg-slate-100/50 border-l border-slate-200 font-mono">
                                                                        ${row.totalItem.toLocaleString(undefined, {minimumFractionDigits: 2})}
                                                                    </td>
                                                                </>
                                                            ) : (() => {
                                                                const bd = breakdownByItemId[row.item.id];
                                                                const fmt = (n: number) => n.toLocaleString(undefined, {minimumFractionDigits: 2});
                                                                return (
                                                                    <>
                                                                        <td className="p-2 text-right text-xs text-slate-600 border-l border-slate-100 font-mono bg-emerald-50/30">
                                                                            ${fmt(bd?.salePriceUnit ?? 0)}
                                                                        </td>
                                                                        <td className="p-2 text-right text-xs font-bold text-emerald-800 bg-emerald-50/50 font-mono">
                                                                            ${fmt(bd?.salePriceTotal ?? 0)}
                                                                        </td>
                                                                    </>
                                                                );
                                                            })()}
                                                            <td className="p-2 text-center">
                                                                <div className="flex justify-center gap-1">
                                                                    <button
                                                                        onClick={() => handleMoveItem(rubro, rowIndex, 'up')}
                                                                        disabled={rowIndex === 0}
                                                                        className="p-1 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors disabled:opacity-0 disabled:cursor-default"
                                                                        title="Subir"
                                                                    >
                                                                        <ChevronUp size={14} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleMoveItem(rubro, rowIndex, 'down')}
                                                                        disabled={rowIndex === items.length - 1}
                                                                        className="p-1 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors disabled:opacity-0 disabled:cursor-default"
                                                                        title="Bajar"
                                                                    >
                                                                        <ChevronDown size={14} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleEditItem(row.item)}
                                                                        className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                                                        title="Cambiar Cantidad / Tarea"
                                                                    >
                                                                        <Settings size={14} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => setApuEditorTaskId(row.task.id)}
                                                                        className="p-1 text-purple-400 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors"
                                                                        title="Editar APU Maestro"
                                                                    >
                                                                        <PenTool size={14} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => removeBudgetItem(row.item.id)}
                                                                        className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                                                        title="Eliminar"
                                                                    >
                                                                        <Trash2 size={14} />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {/* Row to add item at end of list */}
                                                    <tr>
                                                        <td colSpan={9} className="p-2">
                                                            <button 
                                                                onClick={() => handleQuickAddTask(rubro)} 
                                                                className="w-full py-2 border-2 border-dashed border-slate-200 rounded-lg text-xs font-bold text-slate-400 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-all flex items-center justify-center gap-2"
                                                            >
                                                                <Plus size={14} /> Agregar Nueva Tarea en {rubro}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                  </>
                                              )}
                                          </>
                                      )}
                                  </React.Fragment>
                              );
                          }))}
                      </tbody>
                  </table>
              </div>
          </div>}

          {/* FOOTER TOTALS */}
          {/* Alto fijo en desktop: el achique al scrollear es solo visual (transform), nunca cambia el layout. */}
          <div className="bg-slate-900 text-white border-t-4 border-blue-600 shadow-2xl z-10 px-6 py-4 md:py-0 md:h-[76px] shrink-0 overflow-hidden">
              <div className="h-full flex flex-col md:flex-row justify-between items-end md:items-center gap-x-6 gap-y-2">
                  {yieldsBlocked && (
                      <div className="min-w-0 truncate text-xs font-bold text-amber-300 uppercase">Totales no disponibles — sin validar</div>
                  )}
                  <div className={`flex flex-wrap md:flex-nowrap justify-end items-end gap-x-5 xl:gap-x-8 gap-y-2 text-right ml-auto shrink-0 whitespace-nowrap origin-right transition-transform duration-200 ${tableScrolled ? 'md:scale-[0.85]' : ''} ${yieldsBlocked ? 'opacity-40' : ''}`}>
                      <div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase">Materiales + Eq</div>
                          <div className="text-sm xl:text-lg font-mono font-medium text-blue-300">
                              ${grandTotals.mat.toLocaleString(undefined, {maximumFractionDigits: 0})}
                          </div>
                      </div>
                      <div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase">Mano de Obra</div>
                          <div className="text-sm xl:text-lg font-mono font-medium text-orange-300">
                              ${grandTotals.lab.toLocaleString(undefined, {maximumFractionDigits: 0})}
                          </div>
                      </div>
                      <div>
                          <div className="text-xs font-bold text-slate-300 uppercase mb-1">TOTAL GENERAL</div>
                          <div className="text-xl xl:text-3xl font-black text-white font-mono tracking-tight leading-none">
                              ${grandTotals.finalTotal.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          </div>
                      </div>
                  </div>
              </div>
          </div>

          {/* CUADRO EMPRESARIO / COEFICIENTE K */}
          <BudgetBusinessPanel
            projectId={project.id}
            directCost={grandTotals.subtotal}
            businessConfigFromDB={project.businessConfig}
            legacyPricing={project.pricing}
            isOpen={showKPanel}
            onToggle={() => setShowKPanel(prev => !prev)}
            onSave={handleSaveBusinessConfig}
          />

          {/* CONFIGURATION SIDE PANEL (OVERLAY) */}
          {configPanel.isOpen && (
              <div className="fixed inset-0 z-50 flex justify-end">
                  <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm transition-opacity" onClick={() => setConfigPanel({ ...configPanel, isOpen: false })}></div>
                  <div className="w-[450px] bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 z-50">
                      
                      {/* Panel Header */}
                      <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                          <div>
                              <h3 className="font-bold text-lg text-slate-800">
                                  {configPanel.mode === 'add' ? 'Agregar Nueva Tarea' : 'Modificar Ítem'}
                              </h3>
                              <p className="text-xs text-slate-500 font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded w-fit mt-1">
                                  {configPanel.category}
                              </p>
                              {configPanel.mode === 'add' && (
                                  <button onClick={() => openQuickForRubro(officialRubro(configPanel.category))}
                                      className="mt-2 text-xs font-bold text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg px-2.5 py-1 flex items-center gap-1">
                                      <Zap size={12} /> Elegir varias tareas del rubro
                                  </button>
                              )}
                          </div>
                          <button onClick={() => setConfigPanel({ ...configPanel, isOpen: false })} className="p-2 hover:bg-slate-200 rounded-full text-slate-400"><X size={20}/></button>
                      </div>

                      {/* Panel Body */}
                      <div className="flex-1 overflow-y-auto p-6 space-y-6">
                          
                          {/* Task Selector */}
                          {(() => {
                              const search = taskSearch.toLowerCase();

                              // Normalize: strip accents, lowercase, trim
                              const normCat = (s: string) =>
                                  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
                              const normPanel = normCat(configPanel.category);

                              const activeMasterTasks = masterTasks.filter(mt => mt.isActive);
                              const noMasterTasksAtAll = activeMasterTasks.length === 0;

                              // Broad category match: either normalized string contains the other
                              const isSameCat = (cat?: string) => {
                                  if (!cat || !normPanel) return false;
                                  const n = normCat(cat);
                                  return n === normPanel || n.includes(normPanel) || normPanel.includes(n);
                              };

                              const sameCatMaster = activeMasterTasks.filter(mt =>
                                  isSameCat(mt.category) &&
                                  (!search || mt.name.toLowerCase().includes(search))
                              );
                              const otherCatMaster = activeMasterTasks.filter(mt =>
                                  !isSameCat(mt.category) &&
                                  (!search || mt.name.toLowerCase().includes(search))
                              );

                              const allMasterIds = new Set(activeMasterTasks.map(mt => mt.id));
                              const catProjectTasks = tasks.filter(t =>
                                  t.category === configPanel.category &&
                                  (!t.masterTaskId || !allMasterIds.has(t.masterTaskId)) &&
                                  (!search || t.name.toLowerCase().includes(search))
                              );

                              const orgCodes = new Set(activeMasterTasks.filter(mt => mt.code).map(mt => normCat(mt.code!)));
                              const panelRubro = officialRubro(configPanel.category);
                              const freeGlobals = (configPanel.mode === 'add' ? globalTasks ?? [] : []).filter(g =>
                                  !(g.code && orgCodes.has(normCat(g.code))) &&
                                  (!search || normCat(g.name).includes(normCat(search))));
                              const sameCatGlobal = freeGlobals.filter(g => officialRubro(g.category, g.name) === panelRubro);
                              const otherCatGlobal = search
                                  ? freeGlobals.filter(g => officialRubro(g.category, g.name) !== panelRubro).slice(0, 40)
                                  : [];
                              const anyGlobal = sameCatGlobal.length > 0 || otherCatGlobal.length > 0;

                              const renderGlobalRow = (g: MasterTask) => {
                                  const isSelected = configPanel.selectedTaskId === GLOBAL_PREFIX + g.id;
                                  const showCat = officialRubro(g.category, g.name) !== panelRubro && g.category;
                                  return (
                                      <button
                                          key={g.id}
                                          onClick={() => { setConfigPanel(prev => ({ ...prev, selectedTaskId: GLOBAL_PREFIX + g.id })); setDuplicateWarning(false); setGlobalError(''); }}
                                          disabled={importingMaster}
                                          className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 border-b border-slate-100 last:border-0 transition-colors disabled:opacity-60 ${isSelected ? 'bg-orange-50 border-l-2 border-l-orange-500' : 'hover:bg-orange-50/60'}`}
                                      >
                                          <div className="flex-1 min-w-0">
                                              <span className="text-sm text-slate-700 font-medium truncate block">{g.name}</span>
                                              <span className="text-[10px] text-slate-400">{g.unit}{showCat ? ` · ${officialRubro(g.category, g.name)}` : ''}</span>
                                          </div>
                                          <span className="text-[9px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-bold shrink-0">Catálogo ObraFlow</span>
                                      </button>
                                  );
                              };

                              const hasAnyResults = sameCatMaster.length > 0 || otherCatMaster.length > 0 || catProjectTasks.length > 0 || anyGlobal;

                              const renderMasterRow = (mt: MasterTask) => {
                                  const projTask = tasks.find(t => t.masterTaskId === mt.id);
                                  const isSelected = projTask ? configPanel.selectedTaskId === projTask.id : configPanel.selectedTaskId === mt.id;
                                  const hasAPU = mt.materials.length > 0 || mt.labor.length > 0 || mt.equipment.length > 0;
                                  const inBudget = projTask ? project.items.some(bi => bi.taskId === projTask.id) : false;
                                  const showCat = !isSameCat(mt.category) && mt.category;
                                  return (
                                      <button
                                          key={mt.id}
                                          onClick={() => handleSelectMasterTask(mt)}
                                          disabled={importingMaster}
                                          className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 border-b border-slate-100 last:border-0 transition-colors disabled:opacity-60 ${isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'hover:bg-blue-50'}`}
                                      >
                                          <div className="flex-1 min-w-0">
                                              <span className="text-sm text-slate-700 font-medium truncate block">{mt.name}</span>
                                              <span className="text-[10px] text-slate-400">{mt.unit}{showCat ? ` · ${mt.category}` : ''}</span>
                                          </div>
                                          <div className="flex items-center gap-1 shrink-0">
                                              {inBudget && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">Ya incluida</span>}
                                              {hasAPU
                                                  ? <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">APU Base</span>
                                                  : <span className="text-[9px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded">A costear</span>
                                              }
                                              {projTask && <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Importada</span>}
                                          </div>
                                      </button>
                                  );
                              };

                              return (
                                  <div className="space-y-2">
                                      <label className="text-xs font-bold text-slate-500 uppercase">Tarea a presupuestar</label>

                                      {/* Search */}
                                      <div className="relative">
                                          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                          <input
                                              className="w-full pl-8 pr-7 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                              placeholder="Buscar en todas las APUs..."
                                              value={taskSearch}
                                              onChange={e => { setTaskSearch(e.target.value); setDuplicateWarning(false); }}
                                          />
                                          {taskSearch && (
                                              <button onClick={() => setTaskSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                                  <X size={12} />
                                              </button>
                                          )}
                                      </div>

                                      {/* Empty state: no master tasks at all */}
                                      {noMasterTasksAtAll && catProjectTasks.length === 0 && !anyGlobal && globalTasks !== null && !search && (
                                          <div className="border border-slate-200 rounded-lg px-4 py-5 text-center space-y-3">
                                              <p className="text-sm font-bold text-slate-700">No hay APUs disponibles para agregar.</p>
                                              <p className="text-xs text-slate-500">Primero importá o creá APUs en el Catálogo de Empresa. Luego podrás agregarlas al presupuesto.</p>
                                              {onNavigate && (
                                                  <div className="flex flex-col gap-1.5">
                                                      <button
                                                          onClick={() => { onNavigate('admin_apu'); setConfigPanel(prev => ({ ...prev, isOpen: false })); }}
                                                          className="px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors"
                                                      >
                                                          Ir a APUs de Empresa
                                                      </button>
                                                      <button
                                                          onClick={() => { onNavigate('admin_resources'); setConfigPanel(prev => ({ ...prev, isOpen: false })); }}
                                                          className="px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                                                      >
                                                          Importar APUs Globales
                                                      </button>
                                                  </div>
                                              )}
                                          </div>
                                      )}

                                      <RubroBanner category={panelRubro} />

                                      {/* Grouped list */}
                                      {(!noMasterTasksAtAll || catProjectTasks.length > 0 || anyGlobal || !!search) && (
                                          <div className={`${configPanel.selectedTaskId ? 'max-h-48' : 'max-h-80'} overflow-y-auto border border-slate-200 rounded-lg transition-all`}>
                                              {/* Same-category APUs */}
                                              {sameCatMaster.length > 0 && (
                                                  <>
                                                      <div className="px-3 py-1.5 bg-blue-50 sticky top-0 z-10">
                                                          <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wide flex items-center gap-1">
                                                              <BookOpen size={9} /> APUs de Empresa — {configPanel.category}
                                                          </span>
                                                      </div>
                                                      {sameCatMaster.map(renderMasterRow)}
                                                  </>
                                              )}

                                              {/* Catálogo ObraFlow (todavía no copiado a la empresa) */}
                                              {sameCatGlobal.length > 0 && (
                                                  <>
                                                      <div className="px-3 py-1.5 bg-orange-50 sticky top-0 z-10">
                                                          <span className="text-[10px] font-bold text-orange-700 uppercase tracking-wide flex items-center gap-1">
                                                              <Zap size={9} /> Catálogo ObraFlow — {panelRubro}
                                                          </span>
                                                      </div>
                                                      {sameCatGlobal.map(renderGlobalRow)}
                                                  </>
                                              )}

                                              {/* Other-category APUs */}
                                              {otherCatMaster.length > 0 && (
                                                  <>
                                                      <div className="px-3 py-1.5 bg-slate-50 sticky top-0 z-10">
                                                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                                                              <BookOpen size={9} /> Otras APUs de Empresa
                                                          </span>
                                                      </div>
                                                      {otherCatMaster.map(renderMasterRow)}
                                                  </>
                                              )}

                                              {/* Project tasks (custom / legacy) */}
                                              {catProjectTasks.length > 0 && (
                                                  <>
                                                      <div className="px-3 py-1.5 bg-slate-50 sticky top-0 z-10">
                                                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Del Proyecto</span>
                                                      </div>
                                                      {catProjectTasks.map(t => {
                                                          const isSelected = configPanel.selectedTaskId === t.id;
                                                          const hasYields = (yieldsIndex[t.id] ?? []).length > 0 || (taskLaborYieldsIndex[t.id] ?? []).length > 0;
                                                          const inBudget = project.items.some(bi => bi.taskId === t.id);
                                                          return (
                                                              <button
                                                                  key={t.id}
                                                                  onClick={() => { setConfigPanel(prev => ({ ...prev, selectedTaskId: t.id })); setDuplicateWarning(false); }}
                                                                  className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 border-b border-slate-100 last:border-0 transition-colors ${isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'hover:bg-slate-50'}`}
                                                              >
                                                                  <div className="flex-1 min-w-0">
                                                                      <span className="text-sm text-slate-700 truncate block">{t.name}</span>
                                                                      <span className="text-[10px] text-slate-400">{t.unit}</span>
                                                                  </div>
                                                                  <div className="flex items-center gap-1 shrink-0">
                                                                      {inBudget && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">Ya incluida</span>}
                                                                      {!hasYields && <span className="text-[9px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded">A costear</span>}
                                                                  </div>
                                                              </button>
                                                          );
                                                      })}
                                                  </>
                                              )}

                                              {otherCatGlobal.length > 0 && (
                                                  <>
                                                      <div className="px-3 py-1.5 bg-orange-50/60 sticky top-0 z-10">
                                                          <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wide flex items-center gap-1">
                                                              <Zap size={9} /> Catálogo ObraFlow — otros rubros
                                                          </span>
                                                      </div>
                                                      {otherCatGlobal.map(renderGlobalRow)}
                                                  </>
                                              )}

                                              {configPanel.mode === 'add' && globalTasks === null && (
                                                  <div className="px-3 py-2 text-[11px] text-slate-400 italic">Cargando el Catálogo ObraFlow…</div>
                                              )}

                                              {!hasAnyResults && (
                                                  <div className="px-3 py-5 text-xs text-slate-400 text-center italic">
                                                      {taskSearch
                                                          ? `No encontramos tareas con "${taskSearch}".`
                                                          : 'No hay tareas disponibles para agregar.'
                                                      }
                                                  </div>
                                              )}
                                          </div>
                                      )}

                                      {(() => {
                                          const sel = selectedGlobal
                                              ?? tasks.find(t => t.id === configPanel.selectedTaskId)
                                              ?? activeMasterTasks.find(mt => mt.id === configPanel.selectedTaskId);
                                          return sel ? <TaskTechnicalDetail key={sel.id} task={sel} /> : null;
                                      })()}

                                      {/* Feedback messages */}
                                      {selectedGlobal && (
                                          <div className="text-xs text-orange-800 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 space-y-1">
                                              <p className="font-bold">{selectedGlobal.name}</p>
                                              <p className="text-[11px] text-orange-600">Al agregarla se copia a los APU de tu empresa con materiales y mano de obra.</p>
                                          </div>
                                      )}
                                      {globalError && (
                                          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{globalError}</p>
                                      )}
                                      {duplicateWarning && (
                                          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-2">
                                              <AlertCircle size={13} /> Esta tarea ya está en el presupuesto. Editá la cantidad desde el ítem existente.
                                          </p>
                                      )}
                                      {importingMaster && (
                                          <p className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                                              Importando del catálogo maestro...
                                          </p>
                                      )}
                                  </div>
                              );
                          })()}

                          {/* Composición del APU — visible al seleccionar una tarea */}
                          {configPanel.selectedTaskId && !selectedGlobal && (() => {
                              const selTask   = tasks.find(t => t.id === configPanel.selectedTaskId);
                              if (!selTask) return null;
                              const mats      = yieldsIndex[selTask.id]          ?? [];
                              const labors    = taskLaborYieldsIndex[selTask.id] ?? [];
                              const equips    = toolYieldsIndex[selTask.id]      ?? [];
                              const hasData   = mats.length > 0 || labors.length > 0 || equips.length > 0 || !!selTask.fixedCost || !!selTask.laborCost;
                              if (!hasData) return (
                                  <div className="pt-4 border-t border-slate-100">
                                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-2">
                                          <AlertCircle size={13}/> Esta tarea no tiene recursos APU cargados.
                                      </p>
                                  </div>
                              );
                              const comp = buildApuComposition(selTask, mats, materialsMap, labors, laborCategoriesMap, equips, toolsMap);
                              const analysis = calculateUnitPrice(selTask, yieldsIndex, materialsMap, toolYieldsIndex, toolsMap, taskCrewYieldsIndex, crewsMap, laborCategoriesMap, 9, taskLaborYieldsIndex);
                              return <APUCompositionPanel comp={comp} analysis={analysis} />;
                          })()}

                          {/* Presets Section */}
                          {configPanel.mode === 'add' && (
                              <div className="space-y-3 pt-4 border-t border-slate-100">
                                  <div className="flex justify-between items-center">
                                      <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                                          <Sparkles size={12} className="text-yellow-500" /> Tareas Típicas / Sugeridas
                                      </label>
                                      <button 
                                          onClick={() => setManagePresetsMode(!managePresetsMode)}
                                          className="text-[10px] text-blue-600 font-bold hover:underline"
                                      >
                                          {managePresetsMode ? 'Terminar Edición' : 'Gestionar Lista'}
                                      </button>
                                  </div>
                                  
                                  {managePresetsMode && (
                                      <div className="flex gap-2 mb-2">
                                          <input 
                                              className="flex-1 p-2 text-xs border border-slate-300 rounded"
                                              placeholder="Nombre de nueva tarea típica..."
                                              value={newPresetName}
                                              onChange={e => setNewPresetName(e.target.value)}
                                          />
                                          <button 
                                              onClick={handleAddPreset}
                                              className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700"
                                          >
                                              <Plus size={14} />
                                          </button>
                                      </div>
                                  )}

                                  <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
                                      {(rubroPresets[configPanel.category] || []).map((preset, idx) => (
                                          <div key={idx} className="flex items-center gap-2 group">
                                              <button 
                                                  onClick={() => handleSelectPreset(preset)}
                                                  className="flex-1 text-left p-2 text-xs bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded transition-colors flex justify-between items-center"
                                              >
                                                  <span className="font-medium text-slate-700">{preset.name}</span>
                                                  <span className="text-[10px] text-slate-400 bg-white px-1 rounded border border-slate-100">{preset.unit}</span>
                                              </button>
                                              {managePresetsMode && (
                                                  <button 
                                                      onClick={() => handleDeletePreset(preset.name!)}
                                                      className="p-2 text-red-400 hover:bg-red-50 rounded bg-red-50"
                                                  >
                                                      <Trash2 size={14} />
                                                  </button>
                                              )}
                                          </div>
                                      ))}
                                      {(rubroPresets[configPanel.category] || []).length === 0 && (
                                          <div className="text-center p-4 text-xs text-slate-400 italic bg-slate-50 rounded border border-dashed border-slate-200">
                                              No hay tareas típicas definidas para este rubro.
                                          </div>
                                      )}
                                  </div>
                              </div>
                          )}

                          {/* Quantity Input */}
                          <div className="space-y-2 pt-4 border-t border-slate-100">
                              <label className="text-xs font-bold text-slate-500 uppercase">Cantidad Presupuestada</label>
                              <div className="flex items-center gap-3">
                                  <DecimalInput
                                      className="flex-1 min-w-0 p-3 border border-slate-300 rounded-lg text-lg font-bold text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                                      value={configPanel.quantity}
                                      onValue={(n) => setConfigPanel(prev => ({ ...prev, quantity: n }))}
                                  />
                                  <div className="w-16 h-12 flex items-center justify-center bg-slate-100 rounded-lg text-sm font-bold text-slate-500 border border-slate-200">
                                      {selectedGlobal?.unit || tasks.find(t => t.id === configPanel.selectedTaskId)?.unit || '-'}
                                  </div>
                              </div>
                          </div>
                      </div>

                      {/* Footer Actions */}
                      <div className="p-5 border-t border-slate-200 bg-slate-50 flex gap-3">
                          <button 
                              onClick={() => setConfigPanel({ ...configPanel, isOpen: false })}
                              className="flex-1 py-3 bg-white border border-slate-300 text-slate-600 rounded-xl font-bold hover:bg-slate-100 transition-colors"
                          >
                              Cancelar
                          </button>
                          <button
                              onClick={handleSavePanel}
                              disabled={!configPanel.selectedTaskId || configPanel.quantity <= 0 || saveStatus === 'saving' || saveStatus === 'ok' || importingMaster}
                              className={`flex-1 py-3 rounded-xl font-bold transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${
                                  saveStatus === 'ok'     ? 'bg-green-500 text-white' :
                                  saveStatus === 'error'  ? 'bg-red-500 text-white' :
                                  saveStatus === 'saving' ? 'bg-blue-400 text-white' :
                                  'bg-blue-600 text-white hover:bg-blue-700'
                              }`}
                          >
                              {saveStatus === 'ok'     ? 'Guardado ✓' :
                               saveStatus === 'error'  ? 'Error al guardar' :
                               saveStatus === 'saving' ? 'Guardando...' :
                               configPanel.mode === 'add' ? 'Agregar Ítem' : 'Guardar Cambios'}
                          </button>
                      </div>
                  </div>
              </div>
          )}

          {/* MASTER APU EDITOR MODAL */}
          {apuEditorTaskId && (
              <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-white w-full max-w-5xl h-[90vh] rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95">
                      <APUBuilder taskId={apuEditorTaskId} onClose={() => setApuEditorTaskId(null)} />
                  </div>
              </div>
          )}

          {/* PRINT PREVIEW MODAL */}
          {showPrintPreview && (
              <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 print:p-0 print:bg-white print:static">
                  <div className="bg-white w-full max-w-6xl h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col print:h-auto print:w-full print:max-w-none print:shadow-none print:rounded-none">
                      
                      {/* HEADER (Hidden on Print) */}
                      <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 print:hidden">
                          <div>
                              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                                  <Printer size={20} className="text-blue-600"/> Vista Previa de Impresión
                              </h3>
                              <p className="text-xs text-slate-500">Configure qué columnas desea incluir en el reporte.</p>
                          </div>
                          <div className="flex items-center gap-3">
                              <button onClick={handlePrintBudget} disabled={yieldsBlocked} className="disabled:opacity-50 px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 flex items-center gap-2 shadow-lg shadow-blue-200">
                                  <Printer size={16} /> Imprimir Ahora
                              </button>
                              <button onClick={() => setShowPrintPreview(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-400">
                                  <X size={20} />
                              </button>
                          </div>
                      </div>

                      <div className="flex flex-1 overflow-hidden print:overflow-visible print:h-auto">
                          {/* SIDEBAR CONFIG (Hidden on Print) */}
                          <div className="w-80 bg-slate-50 border-r border-slate-200 p-4 overflow-y-auto print:hidden flex flex-col gap-6">
                              
                              {/* Print Mode Selector */}
                              <div>
                                  <h4 className="font-bold text-xs text-slate-500 uppercase mb-3 flex items-center gap-2">
                                      <BookOpen size={12} /> Modo de Impresión
                                  </h4>
                                  <div className="grid grid-cols-2 gap-2">
                                      {([
                                          { value: 'cliente',  label: 'Cliente',   desc: 'Precio de venta' },
                                          { value: 'tecnico',  label: 'Técnico',   desc: 'CD + precio venta' },
                                          { value: 'interno',  label: 'Interno',   desc: 'Desglose completo' },
                                          { value: 'legacy',   label: 'Clásico',   desc: 'Columnas manuales' },
                                          { value: 'resumido', label: 'Resumido',  desc: 'Solo rubros/capítulos' },
                                      ] as const).map(m => (
                                          <button
                                              key={m.value}
                                              onClick={() => setPrintOptions({ ...printOptions, printMode: m.value })}
                                              className={`p-2 rounded border text-left transition-colors ${m.value === 'resumido' ? 'col-span-2' : ''} ${
                                                  printOptions.printMode === m.value
                                                      ? 'bg-blue-50 border-blue-400 text-blue-800'
                                                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                                              }`}
                                          >
                                              <div className="text-xs font-bold">{m.label}</div>
                                              <div className="text-[10px] text-slate-500">{m.desc}</div>
                                          </button>
                                      ))}
                                  </div>
                                  {printOptions.printMode === 'interno' && (
                                      <p className="mt-2 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                                          Modo Interno tiene 10 columnas. Se recomienda orientación <strong>Horizontal</strong>.
                                      </p>
                                  )}
                              </div>

                              {/* Page Settings */}
                              <div>
                                  <h4 className="font-bold text-xs text-slate-500 uppercase mb-3 flex items-center gap-2">
                                      <Settings size={12} /> Configuración de Página
                                  </h4>
                                  <div className="space-y-3">
                                      <div>
                                          <label className="text-xs font-bold text-slate-600 block mb-1">Tamaño de Hoja</label>
                                          <select 
                                              className="w-full p-2 text-xs border border-slate-300 rounded bg-white"
                                              value={printOptions.paperSize}
                                              onChange={e => setPrintOptions({...printOptions, paperSize: e.target.value})}
                                          >
                                              <option value="a4">A4 (210mm x 297mm)</option>
                                              <option value="letter">Carta (Letter)</option>
                                              <option value="legal">Oficio (Legal)</option>
                                          </select>
                                      </div>
                                      <div>
                                          <label className="text-xs font-bold text-slate-600 block mb-1">Orientación</label>
                                          <div className="flex gap-2">
                                              <button 
                                                  onClick={() => setPrintOptions({...printOptions, orientation: 'portrait'})}
                                                  className={`flex-1 py-2 text-xs font-bold rounded border ${printOptions.orientation === 'portrait' ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-white border-slate-300 text-slate-600'}`}
                                              >
                                                  Vertical
                                              </button>
                                              <button 
                                                  onClick={() => setPrintOptions({...printOptions, orientation: 'landscape'})}
                                                  className={`flex-1 py-2 text-xs font-bold rounded border ${printOptions.orientation === 'landscape' ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-white border-slate-300 text-slate-600'}`}
                                              >
                                                  Horizontal
                                              </button>
                                          </div>
                                      </div>
                                  </div>
                              </div>

                              {/* Content Options */}
                              <div>
                                  <h4 className="font-bold text-xs text-slate-500 uppercase mb-3 flex items-center gap-2">
                                      <CheckSquare size={12} /> Contenido del Reporte
                                  </h4>
                                  <div className="space-y-2">
                                      {/* Column toggles — legacy mode only */}
                                      {printOptions.printMode === 'legacy' && (
                                          <>
                                              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-100 p-1 rounded">
                                                  <input type="checkbox" checked={printOptions.showQuantity} onChange={e => setPrintOptions({...printOptions, showQuantity: e.target.checked})} className="rounded text-blue-600 focus:ring-blue-500"/>
                                                  Mostrar Cantidad
                                              </label>
                                              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-100 p-1 rounded">
                                                  <input type="checkbox" checked={printOptions.showUnitPrice} onChange={e => setPrintOptions({...printOptions, showUnitPrice: e.target.checked})} className="rounded text-blue-600 focus:ring-blue-500"/>
                                                  Mostrar Precios Unitarios
                                              </label>
                                              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-100 p-1 rounded">
                                                  <input type="checkbox" checked={printOptions.showMatSubtotal} onChange={e => setPrintOptions({...printOptions, showMatSubtotal: e.target.checked})} className="rounded text-blue-600 focus:ring-blue-500"/>
                                                  Mostrar Subtotal Materiales
                                              </label>
                                              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-100 p-1 rounded">
                                                  <input type="checkbox" checked={printOptions.showLabSubtotal} onChange={e => setPrintOptions({...printOptions, showLabSubtotal: e.target.checked})} className="rounded text-blue-600 focus:ring-blue-500"/>
                                                  Mostrar Subtotal Mano de Obra
                                              </label>
                                              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-100 p-1 rounded">
                                                  <input type="checkbox" checked={printOptions.showTotal} onChange={e => setPrintOptions({...printOptions, showTotal: e.target.checked})} className="rounded text-blue-600 focus:ring-blue-500"/>
                                                  Mostrar Total Ítem
                                              </label>
                                              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-100 p-1 rounded bg-blue-50 border border-blue-100">
                                                  <input type="checkbox" checked={printOptions.showIncidence} onChange={e => setPrintOptions({...printOptions, showIncidence: e.target.checked})} className="rounded text-blue-600 focus:ring-blue-500"/>
                                                  Mostrar Incidencia %
                                              </label>
                                              <div className="h-px bg-slate-200 my-2"></div>
                                          </>
                                      )}
                                      {/* Shared options for all modes */}
                                      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-100 p-1 rounded">
                                          <input type="checkbox" checked={printOptions.showCategoryHeaders} onChange={e => setPrintOptions({...printOptions, showCategoryHeaders: e.target.checked})} className="rounded text-blue-600 focus:ring-blue-500"/>
                                          Agrupar por Rubros
                                      </label>
                                      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-100 p-1 rounded">
                                          <input type="checkbox" checked={printOptions.showFooter} onChange={e => setPrintOptions({...printOptions, showFooter: e.target.checked})} className="rounded text-blue-600 focus:ring-blue-500"/>
                                          Mostrar Totales Generales
                                      </label>
                                  </div>
                              </div>

                              {/* Customization */}
                              <div>
                                  <h4 className="font-bold text-xs text-slate-500 uppercase mb-3 flex items-center gap-2">
                                      <Edit3 size={12} /> Personalización
                                  </h4>
                                  <div className="space-y-3">
                                      <div>
                                          <label className="flex items-center gap-2 text-xs font-bold text-slate-600 mb-2 cursor-pointer">
                                              <input type="checkbox" checked={printOptions.showIcon} onChange={e => setPrintOptions({...printOptions, showIcon: e.target.checked})} className="rounded text-blue-600 focus:ring-blue-500"/>
                                              Incluir Logo / Ícono
                                          </label>
                                          {printOptions.showIcon && (
                                              <div className="flex items-center gap-2">
                                                  {printLogo && <img src={printLogo} alt="Logo" className="w-8 h-8 object-contain border rounded bg-white" />}
                                                  <label className="flex-1 cursor-pointer bg-white border border-slate-300 hover:bg-slate-50 text-slate-600 text-xs py-1.5 px-3 rounded text-center transition-colors">
                                                      Subir Imagen...
                                                      <input 
                                                          type="file" 
                                                          accept="image/*" 
                                                          className="hidden" 
                                                          onChange={(e) => {
                                                              const file = e.target.files?.[0];
                                                              if (file) {
                                                                  const reader = new FileReader();
                                                                  reader.onload = (ev) => setPrintLogo(ev.target?.result as string);
                                                                  reader.readAsDataURL(file);
                                                              }
                                                          }}
                                                      />
                                                  </label>
                                              </div>
                                          )}
                                      </div>
                                      <div>
                                          <label className="text-xs font-bold text-slate-600 block mb-1">Texto Personalizado (Encabezado)</label>
                                          <textarea 
                                              className="w-full p-2 text-xs border border-slate-300 rounded bg-white h-20 resize-none focus:ring-2 focus:ring-blue-500 outline-none"
                                              placeholder="Ej: Presupuesto válido por 15 días..."
                                              value={printOptions.customText}
                                              onChange={e => setPrintOptions({...printOptions, customText: e.target.value})}
                                          />
                                      </div>
                                  </div>
                              </div>

                          </div>

                          {/* PREVIEW CONTENT */}
                          <div className="flex-1 overflow-auto bg-slate-100 p-8 print:p-0 print:overflow-visible print:bg-white flex justify-center">
                              <div
                                ref={budgetPrintRef}
                                className={`bg-white shadow-lg border border-slate-200 p-8 print:shadow-none print:border-none print:p-0 transition-all duration-300 origin-top`}
                                style={{
                                    width: printOptions.paperSize === 'a4' 
                                        ? (printOptions.orientation === 'portrait' ? '210mm' : '297mm') 
                                        : printOptions.paperSize === 'legal' 
                                            ? (printOptions.orientation === 'portrait' ? '216mm' : '356mm')
                                            : (printOptions.orientation === 'portrait' ? '216mm' : '279mm'), // Letter
                                    minHeight: printOptions.paperSize === 'a4' 
                                        ? (printOptions.orientation === 'portrait' ? '297mm' : '210mm') 
                                        : printOptions.paperSize === 'legal' 
                                            ? (printOptions.orientation === 'portrait' ? '356mm' : '216mm')
                                            : (printOptions.orientation === 'portrait' ? '279mm' : '216mm') // Letter
                                }}
                              >
                                  
                                  {/* Report Header */}
                                  <div className="mb-6 border-b-2 border-slate-800 pb-4">
                                      <div className="flex justify-between items-start mb-4">
                                          <div>
                                              <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight leading-none mb-1">{project.name}</h1>
                                              <p className="text-sm text-slate-600 font-bold">
                                                  {printOptions.printMode === 'cliente' ? 'Presupuesto de Obra' :
                                                   printOptions.printMode === 'tecnico' ? 'Presupuesto Técnico' :
                                                   printOptions.printMode === 'interno' ? 'Análisis de Costos' :
                                                   'Cómputo y Presupuesto de Obra'}
                                              </p>
                                              {printOptions.printMode === 'interno' && (
                                                  <span className="mt-1 inline-block text-[9px] font-bold uppercase tracking-widest bg-slate-900 text-white px-2 py-0.5 rounded">
                                                      Confidencial — Uso Interno
                                                  </span>
                                              )}
                                          </div>
                                          {printOptions.showIcon && printLogo && (
                                              <img src={printLogo} alt="Project Logo" className="h-16 object-contain" />
                                          )}
                                      </div>
                                      
                                      <div className="flex justify-between items-end mt-2">
                                          <div className="text-xs text-slate-500 space-y-1">
                                              <p><strong>Fecha de Emisión:</strong> {new Date().toLocaleDateString()}</p>
                                              {project.client && <p><strong>Cliente:</strong> {project.client}</p>}
                                              {project.address && <p><strong>Ubicación:</strong> {project.address}</p>}
                                          </div>
                                          <div className="text-right">
                                              <p className="text-xs text-slate-400">Generado por Obraflow</p>
                                          </div>
                                      </div>

                                      {printOptions.customText && (
                                          <div className="mt-4 p-3 bg-slate-50 border border-slate-100 rounded text-xs text-slate-600 italic whitespace-pre-wrap">
                                              {printOptions.customText}
                                          </div>
                                      )}
                                  </div>

                                  {/* Report Table */}
                                  {printOptions.printMode === 'legacy' ? (
                                      <table className="w-full text-left border-collapse text-xs">
                                          <thead>
                                              <tr className="border-b-2 border-slate-800">
                                                  <th className="py-2 font-bold text-slate-700 uppercase">Ítem / Descripción</th>
                                                  <th className="py-2 text-center font-bold text-slate-700 w-12">Unid.</th>
                                                  {printOptions.showQuantity && <th className="py-2 text-center font-bold text-slate-700 w-16">Cant.</th>}
                                                  {printOptions.showUnitPrice && <th className="py-2 text-right font-bold text-slate-700 w-24">P. Unit.</th>}
                                                  {printOptions.showMatSubtotal && <th className="py-2 text-right font-bold text-slate-700 w-24">Mat. Total</th>}
                                                  {printOptions.showLabSubtotal && <th className="py-2 text-right font-bold text-slate-700 w-24">M.O. Total</th>}
                                                  {printOptions.showTotal && <th className="py-2 text-right font-bold text-slate-900 w-28">Total</th>}
                                                  {printOptions.showIncidence && <th className="py-2 text-right font-bold text-slate-900 w-16">% Inc.</th>}
                                              </tr>
                                          </thead>
                                          <tbody>
                                              {visibleRubros.map((rubro) => {
                                                  const items = budgetData.grouped[rubro] || [];
                                                  if (items.length === 0) return null;
                                                  const totals = budgetData.categoryTotals[rubro];
                                                  const rubroIncidence = grandTotals.finalTotal > 0 ? (totals.total / grandTotals.finalTotal) * 100 : 0;

                                                  return (
                                                      <React.Fragment key={rubro}>
                                                          {printOptions.showCategoryHeaders && (
                                                              <tr className="bg-slate-100 break-inside-avoid">
                                                                  <td colSpan={10} className="py-2 px-2 font-bold text-slate-800 uppercase text-[10px] tracking-wider border-t border-slate-300 mt-4">
                                                                      {rubro}
                                                                  </td>
                                                              </tr>
                                                          )}
                                                          {items.map((row) => {
                                                              const itemIncidence = grandTotals.finalTotal > 0 ? (row.totalItem / grandTotals.finalTotal) * 100 : 0;
                                                              return (
                                                                <tr key={row.item.id} className="border-b border-slate-100 break-inside-avoid">
                                                                    <td className="py-1.5 pr-2">
                                                                        <div className="font-medium text-slate-800">{row.task.name}</div>
                                                                        <div className="text-[9px] text-slate-500">{row.task.code}</div>
                                                                    </td>
                                                                    <td className="py-1.5 text-center text-slate-500">{row.task.unit}</td>
                                                                    {printOptions.showQuantity && <td className="py-1.5 text-center font-mono font-bold text-slate-700">{row.item.quantity}</td>}
                                                                    {printOptions.showUnitPrice && <td className="py-1.5 text-right font-mono text-slate-600">${row.analysis.totalUnitCost.toFixed(2)}</td>}
                                                                    {printOptions.showMatSubtotal && <td className="py-1.5 text-right font-mono text-slate-600">${row.totalMatEq.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>}
                                                                    {printOptions.showLabSubtotal && <td className="py-1.5 text-right font-mono text-slate-600">${row.totalLab.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>}
                                                                    {printOptions.showTotal && <td className="py-1.5 text-right font-mono font-bold text-slate-900">${row.totalItem.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>}
                                                                    {printOptions.showIncidence && <td className="py-1.5 text-right font-mono text-slate-500 text-[10px]">{itemIncidence.toFixed(2)}%</td>}
                                                                </tr>
                                                              );
                                                          })}
                                                          {printOptions.showCategoryHeaders && (
                                                              <tr className="break-inside-avoid bg-slate-50 border-t border-slate-300">
                                                                  <td colSpan={2} className="py-2 text-right font-bold text-[10px] text-slate-500 uppercase">Subtotal {rubro}</td>
                                                                  {printOptions.showQuantity && <td></td>}
                                                                  {printOptions.showUnitPrice && <td></td>}
                                                                  {printOptions.showMatSubtotal && <td className="py-2 text-right font-mono font-bold text-slate-700">${totals.mat.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>}
                                                                  {printOptions.showLabSubtotal && <td className="py-2 text-right font-mono font-bold text-slate-700">${totals.lab.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>}
                                                                  {printOptions.showTotal && <td className="py-2 text-right font-mono font-bold text-slate-900">${totals.total.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>}
                                                                  {printOptions.showIncidence && <td className="py-2 text-right font-mono font-bold text-slate-900">{rubroIncidence.toFixed(2)}%</td>}
                                                              </tr>
                                                          )}
                                                      </React.Fragment>
                                                  );
                                              })}
                                          </tbody>
                                      </table>
                                  ) : (() => {
                                      const pm = printOptions.printMode;
                                      const isCliente = pm === 'cliente';
                                      const isTecnico = pm === 'tecnico';
                                      const isInterno = pm === 'interno';
                                      const isResumido = pm === 'resumido';

                                      if (isResumido) {
                                          const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2 });
                                          return (
                                              <table className="w-full text-left border-collapse text-xs">
                                                  <thead>
                                                      <tr className="border-b-2 border-slate-800">
                                                          <th className="py-2 font-bold text-slate-700 uppercase">Rubro / Capítulo</th>
                                                          <th className="py-2 text-right font-bold text-slate-700 w-32">CD Total</th>
                                                          <th className="py-2 text-right font-bold text-slate-700 w-16">Inc. %</th>
                                                          <th className="py-2 text-right font-bold text-slate-900 w-36">Precio de Venta</th>
                                                      </tr>
                                                  </thead>
                                                  <tbody>
                                                      {visibleRubros.map(rubro => {
                                                          const rubroItems = budgetData.grouped[rubro] || [];
                                                          if (rubroItems.length === 0) return null;
                                                          const rubroDC  = budgetData.categoryTotals[rubro]?.total ?? 0;
                                                          const rubroPV  = rubroItems.reduce((s, r) => s + (breakdownByItemId[r.item.id]?.salePriceTotal ?? 0), 0);
                                                          const rubroInc = grandTotals.subtotal > 0 ? (rubroDC / grandTotals.subtotal * 100) : 0;
                                                          return (
                                                              <tr key={rubro} className="border-b border-slate-100">
                                                                  <td className="py-2 font-bold text-slate-800 uppercase text-[11px] tracking-wide">{rubro}</td>
                                                                  <td className="py-2 text-right font-mono text-slate-600">${fmt(rubroDC)}</td>
                                                                  <td className="py-2 text-right font-mono text-slate-500 text-[10px]">{rubroInc.toFixed(1)}%</td>
                                                                  <td className="py-2 text-right font-mono font-bold text-slate-900">${fmt(rubroPV)}</td>
                                                              </tr>
                                                          );
                                                      })}
                                                  </tbody>
                                              </table>
                                          );
                                      }
                                      // colSpan for the "Subtotal rubro" label cell:
                                      // Cliente:  Desc + Unid + Cant + PVUnit         = 4 label cols, 1 value col
                                      // Técnico:  Desc + Unid + Cant + CDUnit + PVUnit = 5 label cols, 1 value col
                                      // Interno:  Desc + Unid + Cant + CDTot + Inc + GGD + GGI + Benef + Imp = 9 label cols, 1 value col
                                      const subtotalLabelColSpan = isInterno ? 9 : isTecnico ? 5 : 4;
                                      return (
                                          <table className="w-full text-left border-collapse text-xs">
                                              <thead>
                                                  <tr className="border-b-2 border-slate-800">
                                                      <th className="py-2 font-bold text-slate-700 uppercase">Ítem / Descripción</th>
                                                      <th className="py-2 text-center font-bold text-slate-700 w-12">Unid.</th>
                                                      <th className="py-2 text-center font-bold text-slate-700 w-16">Cant.</th>
                                                      {isTecnico && <th className="py-2 text-right font-bold text-slate-700 w-24">CD Unit.</th>}
                                                      {isInterno && <th className="py-2 text-right font-bold text-slate-700 w-24">CD Total</th>}
                                                      {isInterno && <th className="py-2 text-right font-bold text-slate-700 w-14">Inc. %</th>}
                                                      {isInterno && <th className="py-2 text-right font-bold text-slate-700 w-20">GGD</th>}
                                                      {isInterno && <th className="py-2 text-right font-bold text-slate-700 w-20">GGI</th>}
                                                      {isInterno && <th className="py-2 text-right font-bold text-slate-700 w-20">Benef.</th>}
                                                      {isInterno && <th className="py-2 text-right font-bold text-slate-700 w-20">Imp.</th>}
                                                      {!isInterno && <th className="py-2 text-right font-bold text-slate-700 w-24">PV Unit.</th>}
                                                      <th className="py-2 text-right font-bold text-slate-900 w-28">PV Total</th>
                                                  </tr>
                                              </thead>
                                              <tbody>
                                                  {visibleRubros.map((rubro) => {
                                                      const items = budgetData.grouped[rubro] || [];
                                                      if (items.length === 0) return null;
                                                      const rubroSaleTotal = items.reduce((sum, row) => {
                                                          const bd = breakdownByItemId[row.item.id];
                                                          return sum + (bd?.salePriceTotal ?? 0);
                                                      }, 0);
                                                      return (
                                                          <React.Fragment key={rubro}>
                                                              {printOptions.showCategoryHeaders && (
                                                                  <tr className="bg-slate-100 break-inside-avoid">
                                                                      <td colSpan={10} className="py-2 px-2 font-bold text-slate-800 uppercase text-[10px] tracking-wider border-t border-slate-300 mt-4">
                                                                          {rubro}
                                                                      </td>
                                                                  </tr>
                                                              )}
                                                              {items.map((row) => {
                                                                  const bd = breakdownByItemId[row.item.id];
                                                                  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2 });
                                                                  return (
                                                                      <tr key={row.item.id} className="border-b border-slate-100 break-inside-avoid">
                                                                          <td className="py-1.5 pr-2">
                                                                              <div className="font-medium text-slate-800">{row.task.name}</div>
                                                                              <div className="text-[9px] text-slate-500">{row.task.code}</div>
                                                                          </td>
                                                                          <td className="py-1.5 text-center text-slate-500">{row.task.unit}</td>
                                                                          <td className="py-1.5 text-center font-mono font-bold text-slate-700">{row.item.quantity}</td>
                                                                          {isTecnico && <td className="py-1.5 text-right font-mono text-slate-600">${fmt(bd?.directCostUnit ?? 0)}</td>}
                                                                          {isInterno && <td className="py-1.5 text-right font-mono text-slate-600">${fmt(bd?.directCostTotal ?? 0)}</td>}
                                                                          {isInterno && <td className="py-1.5 text-right font-mono text-slate-500 text-[10px]">{((bd?.incidence ?? 0) * 100).toFixed(2)}%</td>}
                                                                          {isInterno && <td className="py-1.5 text-right font-mono text-slate-600">${fmt(bd?.ggdAllocated ?? 0)}</td>}
                                                                          {isInterno && <td className="py-1.5 text-right font-mono text-slate-600">${fmt(bd?.ggiAllocated ?? 0)}</td>}
                                                                          {isInterno && <td className="py-1.5 text-right font-mono text-slate-600">${fmt(bd?.profitAllocated ?? 0)}</td>}
                                                                          {isInterno && <td className="py-1.5 text-right font-mono text-slate-600">${fmt(bd?.taxAllocated ?? 0)}</td>}
                                                                          {!isInterno && <td className="py-1.5 text-right font-mono text-slate-700">${fmt(bd?.salePriceUnit ?? 0)}</td>}
                                                                          <td className="py-1.5 text-right font-mono font-bold text-slate-900">${fmt(bd?.salePriceTotal ?? 0)}</td>
                                                                      </tr>
                                                                  );
                                                              })}
                                                              {printOptions.showCategoryHeaders && (
                                                                  <tr className="break-inside-avoid bg-slate-50 border-t border-slate-300">
                                                                      <td colSpan={subtotalLabelColSpan} className="py-2 text-right font-bold text-[10px] text-slate-500 uppercase">Subtotal {rubro}</td>
                                                                      <td className="py-2 text-right font-mono font-bold text-slate-900">${rubroSaleTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                                                  </tr>
                                                              )}
                                                          </React.Fragment>
                                                      );
                                                  })}
                                              </tbody>
                                          </table>
                                      );
                                  })()}

                                  {/* Footer Totals */}
                                  {printOptions.showFooter && (
                                      printOptions.printMode === 'legacy' ? (
                                          <div className="mt-8 border-t-2 border-slate-800 pt-4 break-inside-avoid">
                                              <div className="flex justify-end gap-8">
                                                  {printOptions.showMatSubtotal && (
                                                      <div className="text-right">
                                                          <div className="text-[10px] font-bold text-slate-500 uppercase">Total Materiales</div>
                                                          <div className="text-sm font-mono font-bold text-slate-800">${grandTotals.mat.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                                                      </div>
                                                  )}
                                                  {printOptions.showLabSubtotal && (
                                                      <div className="text-right">
                                                          <div className="text-[10px] font-bold text-slate-500 uppercase">Total Mano de Obra</div>
                                                          <div className="text-sm font-mono font-bold text-slate-800">${grandTotals.lab.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                                                      </div>
                                                  )}
                                                  <div className="text-right">
                                                      <div className="text-[10px] font-bold text-slate-500 uppercase">TOTAL GENERAL</div>
                                                      <div className="text-xl font-black text-slate-900 font-mono">${grandTotals.finalTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                                                  </div>
                                              </div>
                                          </div>
                                      ) : (
                                          <div className="mt-8 border-t-2 border-slate-800 pt-4 break-inside-avoid">
                                              {/* Interno/Resumido: full Cuadro Empresario breakdown row */}
                                              {(printOptions.printMode === 'interno' || printOptions.printMode === 'resumido') && (
                                                  <div className="flex justify-end gap-6 mb-4 pb-3 border-b border-slate-200 text-xs">
                                                      {[
                                                          { label: 'Costo Directo',   val: grandTotals.subtotal },
                                                          { label: 'GGD',             val: budgetKSummary.ggdAmount },
                                                          { label: 'GGI',             val: budgetKSummary.ggiAmount },
                                                          { label: 'Beneficio',       val: budgetKSummary.profitAmount },
                                                          { label: 'Impuestos',       val: budgetKSummary.taxAmount },
                                                      ].map(({ label, val }) => (
                                                          <div key={label} className="text-right">
                                                              <div className="text-[10px] font-bold text-slate-500 uppercase">{label}</div>
                                                              <div className="font-mono text-slate-700">${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                                          </div>
                                                      ))}
                                                  </div>
                                              )}
                                              {/* Técnico: CD total alongside sale price */}
                                              <div className="flex justify-end gap-8 items-end">
                                                  {printOptions.printMode === 'tecnico' && (
                                                      <div className="text-right">
                                                          <div className="text-[10px] font-bold text-slate-500 uppercase">Costo Directo Total</div>
                                                          <div className="text-sm font-mono font-bold text-slate-700">${grandTotals.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                                      </div>
                                                  )}
                                                  <div className="text-right">
                                                      <div className="text-[10px] font-bold text-slate-500 uppercase">Precio de Venta</div>
                                                      <div className="text-xl font-black text-slate-900 font-mono">${budgetKSummary.finalSalePrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                                  </div>
                                              </div>
                                          </div>
                                      )
                                  )}
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
          )}

      </div>
    </div>
  );
};
