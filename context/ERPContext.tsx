
import React, { createContext, useContext, useMemo, useState, ReactNode, useEffect, useRef, useCallback } from 'react';
import { Material, Task, TaskYield, TaskToolYield, Tool, Project, BudgetItem, ImportResult, LaborCategory, ProjectTemplate, Snapshot, Reception, Subcontractor, Contract, Certification, CalendarPreset, ProjectDocument, MeasurementSheet, Crew, TaskCrewYield, TaskLaborYield, QualityProtocol, QualityInspection, NonConformity, ProjectCertificate, ProjectDependency, LinkType } from '../types';
import { INITIAL_PROJECT, INITIAL_RUBROS, INITIAL_CALENDAR_PRESETS, INITIAL_QUALITY_PROTOCOLS, RUBRO_PRESETS, hydrateWithOrg } from '../constants';
import { useAuth } from './AuthContext';
import { usePersistentState } from '../hooks/usePersistentState';
import { projectsService } from '../services/projectsService';
import { tasksService } from '../services/tasksService';
import { budgetItemsService } from '../services/budgetItemsService';
import { materialsService } from '../services/materialsService';
import { toolsService } from '../services/toolsService';
import { laborCategoriesService } from '../services/laborCategoriesService';
import { crewsService } from '../services/crewsService';
import { loadAllYields } from '../services/yieldsLoader';
import { generateId } from '../utils/generateId';

interface MaterialStockStatus {
    material: Material;
    budgeted: number;
    received: number;
    pending: number;
}

interface ERPContextType {
  // Data Lists (Filtered by Org)
  materials: Material[];
  tasks: Task[];
  yields: TaskYield[];
  tools: Tool[];
  toolYields: TaskToolYield[];
  laborCategories: LaborCategory[];
  rubros: string[];
  rubroPresets: Record<string, Partial<Task>[]>;
  crews: Crew[];
  taskCrewYields: TaskCrewYield[];
  taskLaborYields: TaskLaborYield[];

  // Project Management
  project: Project; // The Active Project
  projects: Project[]; // All Projects for Org
  activeProjectId: string | null;
  createNewProject: (data: Partial<Project>) => void;
  setActiveProject: (id: string) => void;
  exitProject: () => void; // NEW: Go back to Hub
  deleteProject: (id: string) => void;
  saveProject: () => Promise<void>;

  snapshots: Snapshot[];
  receptions: Reception[];
  subcontractors: Subcontractor[];
  contracts: Contract[];
  certifications: Certification[];
  calendarPresets: CalendarPreset[];
  documents: ProjectDocument[];
  measurementSheets: MeasurementSheet[];

  // Quality Management
  qualityProtocols: QualityProtocol[];
  qualityInspections: QualityInspection[];
  nonConformities: NonConformity[];

  // Optimization Indexes (For O(1) Lookups)
  materialsMap: Record<string, Material>;
  tasksMap: Record<string, Task>;
  toolsMap: Record<string, Tool>;
  laborCategoriesMap: Record<string, LaborCategory>;
  crewsMap: Record<string, Crew>;
  yieldsIndex: Record<string, TaskYield[]>;
  toolYieldsIndex: Record<string, TaskToolYield[]>;
  taskCrewYieldsIndex: Record<string, TaskCrewYield[]>;
  taskLaborYieldsIndex: Record<string, TaskLaborYield[]>;
  // Dependency Management
  addDependency: (dep: ProjectDependency) => void;
  updateDependency: (id: string, updates: Partial<ProjectDependency>) => void;
  removeDependency: (id: string) => void;

  // Actions
  addMaterial: (m: Material) => void;
  updateMaterial: (id: string, updates: Partial<Material>) => void;
  removeMaterial: (id: string) => void;

  addTask: (t: Task) => Promise<void>;
  updateTask: (id: string, updates: Partial<Task>) => void;
  updateTaskMaster: (taskId: string, updates: Partial<Task>) => Promise<void>;
  removeTask: (id: string) => void;

  addTool: (t: Tool) => void;
  updateTool: (id: string, updates: Partial<Tool>) => void;
  removeTool: (id: string) => void;

  addLaborCategory: (lc: LaborCategory) => void;
  updateLaborCategory: (id: string, updates: Partial<LaborCategory>) => void;
  removeLaborCategory: (id: string) => void;

  addCrew: (c: Crew) => void;
  updateCrew: (id: string, updates: Partial<Crew>) => void;
  removeCrew: (id: string) => void;

  addRubro: (name: string) => void;
  removeRubro: (name: string) => void;
  addRubroPreset: (rubro: string, task: Partial<Task>) => void;
  removeRubroPreset: (rubro: string, taskName: string) => void;

  updateProjectSettings: (p: Partial<Project>) => void;
  budgetItemsLoading: boolean;
  /** true una vez que allTasks terminó de cargar para la org activa */
  tasksLoaded: boolean;
  /** true mientras se cargan los rendimientos (yields) de las tareas */
  yieldsLoading: boolean;
  /** Error de la última carga de rendimientos; con error, los costos no son confiables */
  yieldsError: string | null;
  reloadYields: () => Promise<void>;
  addBudgetItem: (item: BudgetItem) => Promise<void>;
  removeBudgetItem: (itemId: string) => void;
  updateBudgetItem: (itemId: string, updates: Partial<BudgetItem>) => void;

  // Resource Actions
  addTaskYield: (yieldData: TaskYield) => void;
  removeTaskYield: (taskId: string, materialId: string) => void;
  addTaskToolYield: (toolYieldData: TaskToolYield) => void;
  removeTaskToolYield: (taskId: string, toolId: string) => void;
  addTaskCrewYield: (crewYieldData: TaskCrewYield) => void;
  removeTaskCrewYield: (taskId: string, crewId: string) => void;
  addTaskLaborYield: (laborYieldData: TaskLaborYield) => void;
  removeTaskLaborYield: (taskId: string, laborCategoryId: string) => void;

  loadTemplate: (template: ProjectTemplate) => void;
  importData: (type: 'materials' | 'tasks' | 'tools' | 'labor', jsonData: string) => ImportResult;
  createSnapshot: (name: string, totalCost: number) => void;
  resetData: () => void;

  // Database Management
  exportDatabase: () => string;
  importDatabase: (json: string) => ImportResult;

  /** Re-fetches materials, tools y labor_categories desde Supabase y actualiza el estado. */
  reloadOrgResources: () => Promise<void>;

  addReception: (reception: Reception) => void;
  getProjectStockStatus: () => MaterialStockStatus[];

  addSubcontractor: (s: Subcontractor) => void;
  updateSubcontractor: (id: string, updates: Partial<Subcontractor>) => void;
  addContract: (c: Contract) => void;
  addCertification: (c: Certification) => void;

  // Calendar
  addCalendarPreset: (preset: CalendarPreset) => void;
  applyCalendarPreset: (presetId: string) => void;

  // Documents & Measurements
  addDocument: (doc: ProjectDocument) => void;
  removeDocument: (id: string) => void;
  saveMeasurementSheet: (sheet: MeasurementSheet) => void;
  syncMeasurementToBudget: (sheetId: string) => void;

  // Quality Actions
  addQualityProtocol: (p: QualityProtocol) => void;
  updateQualityProtocol: (id: string, updates: Partial<QualityProtocol>) => void;
  addQualityInspection: (i: QualityInspection) => void;
  addNonConformity: (n: NonConformity) => void;
  updateNonConformity: (id: string, updates: Partial<NonConformity>) => void;

  // Project Certificates (Certificados de Avance de Obra)
  projectCertificates: ProjectCertificate[];
  addProjectCertificate: (cert: ProjectCertificate) => void;
}

const ERPContext = createContext<ERPContextType | undefined>(undefined);

export const ERPProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const orgId = user?.organizationId ?? '';

  // ─── SUPABASE-backed state ────────────────────────────────────────────────
  // projects, tasks, budget_items, yields → se cargan desde Supabase.
  // Las mutations actualizan el estado local de inmediato (optimistic)
  // y sincronizan con Supabase en background (fire-and-forget).

  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false); // true después del primer fetch exitoso
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [allBudgetItems, setAllBudgetItems] = useState<BudgetItem[]>([]);
  const [budgetItemsLoading, setBudgetItemsLoading] = useState(false);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [yields, setYields] = useState<TaskYield[]>([]);
  const [yieldsLoading, setYieldsLoading] = useState(false);
  const [yieldsError, setYieldsError] = useState<string | null>(null);
  const yieldsOrgRef = useRef('');
  const [toolYields, setToolYields] = useState<TaskToolYield[]>([]);
  const [taskLaborYields, setTaskLaborYields] = useState<TaskLaborYield[]>([]);

  // ─── localStorage-backed state ────────────────────────────────────────────
  // Resto de entidades: materials, tools, labor, crews, rubros, docs, etc.

  // ── Supabase-backed (migradas en Fase 1) ──────────────────────────────────
  const [allMaterials, setAllMaterials] = useState<Material[]>([]);
  const [allTools, setAllTools] = useState<Tool[]>([]);
  const [allLaborCategories, setAllLaborCategories] = useState<LaborCategory[]>([]);
  const [allCrews, setAllCrews] = useState<Crew[]>([]);
  const [activeProjectId, setActiveProjectId] = usePersistentState<string | null>('erp_active_project_id', null);

  const [allSnapshots, setAllSnapshots] = usePersistentState<Snapshot[]>('erp_snapshots', []);
  const [allReceptions, setAllReceptions] = usePersistentState<Reception[]>('erp_receptions', []);
  const [allSubcontractors, setAllSubcontractors] = usePersistentState<Subcontractor[]>('erp_subcontractors', []);
  const [allContracts, setAllContracts] = usePersistentState<Contract[]>('erp_contracts', []);
  const [allCertifications, setAllCertifications] = usePersistentState<Certification[]>('erp_certifications', []);

  const [taskCrewYields, setTaskCrewYields] = useState<TaskCrewYield[]>([]);
  const [rubros, setRubros] = usePersistentState<string[]>('erp_rubros', INITIAL_RUBROS);
  const [rubroPresets, setRubroPresets] = usePersistentState<Record<string, Partial<Task>[]>>('erp_rubro_presets', RUBRO_PRESETS);
  const [calendarPresets, setCalendarPresets] = usePersistentState<CalendarPreset[]>('erp_calendar_presets', INITIAL_CALENDAR_PRESETS);

  const [allDocuments, setAllDocuments] = usePersistentState<ProjectDocument[]>('erp_documents', []);
  const [allMeasurementSheets, setAllMeasurementSheets] = usePersistentState<MeasurementSheet[]>('erp_measurements', []);
  const [allQualityProtocols, setAllQualityProtocols] = usePersistentState<QualityProtocol[]>('erp_quality_protocols', []);
  const [allQualityInspections, setAllQualityInspections] = usePersistentState<QualityInspection[]>('erp_quality_inspections', []);
  const [allNonConformities, setAllNonConformities] = usePersistentState<NonConformity[]>('erp_non_conformities', []);
  const [allProjectCertificates, setAllProjectCertificates] = usePersistentState<ProjectCertificate[]>('erp_project_certificates', []);

  // ─── SEEDING localStorage entities (crews, quality) ─────────────────────
  // materials, tools, laborCategories ya no se siembran aquí — vienen de Supabase.
  useEffect(() => {
    if (!orgId) return;

    function seedOrMigrate<T extends { organizationId: string }>(
      prev: T[],
      initialSeed: Omit<T, 'organizationId'>[]
    ): T[] {
      const hasOrgData = prev.some(x => x.organizationId === orgId);
      if (hasOrgData) return prev;

      const legacyItems = prev.filter(x => !x.organizationId || x.organizationId === '');
      if (legacyItems.length > 0) {
        console.info(`[ERP] Migrando ${legacyItems.length} items legacy sin organizationId → org '${orgId}'`);
        return prev.map(x =>
          (!x.organizationId || x.organizationId === '')
            ? { ...x, organizationId: orgId }
            : x
        );
      }

      console.info(`[ERP] Sembrando datos iniciales para org '${orgId}'`);
      return [...prev, ...hydrateWithOrg(initialSeed as T[], orgId)];
    }

    setAllQualityProtocols(prev => seedOrMigrate(prev, INITIAL_QUALITY_PROTOCOLS));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  // Carga yields sin datos parciales; descarta la respuesta si cambió la org.
  const applyYields = useCallback(async (forOrg: string, taskIds: string[]) => {
    yieldsOrgRef.current = forOrg;
    setYieldsLoading(true);
    const { data, error } = await loadAllYields(taskIds);
    if (yieldsOrgRef.current !== forOrg) return;
    if (error) console.error('[ERP] Error cargando yields desde Supabase:', error);
    setYields(data.yields);
    setTaskLaborYields(data.laborYields);
    setToolYields(data.toolYields);
    setTaskCrewYields(data.crewYields);
    setYieldsError(error);
    setYieldsLoading(false);
  }, []);

  // ─── SUPABASE: cargar resources + projects + tasks + yields cuando cambia la org ─
  useEffect(() => {
    if (!orgId) {
      setAllMaterials([]);
      setAllTools([]);
      setAllLaborCategories([]);
      setAllCrews([]);
      setAllProjects([]);
      setProjectsLoaded(false);
      setAllTasks([]);
      setTasksLoaded(false);
      setYields([]);
      setToolYields([]);
      setTaskLaborYields([]);
      setTaskCrewYields([]);
      yieldsOrgRef.current = '';
      setYieldsError(null);
      setYieldsLoading(false);
      return;
    }

    setProjectsLoaded(false);
    setTasksLoaded(false);

    const load = async () => {
      // ── Fase 1: resources + crews + projects + tasks en paralelo ──────────
      let fetchedMaterials: Material[] = [];
      let fetchedTools: Tool[] = [];
      let fetchedLaborCategories: LaborCategory[] = [];
      let fetchedCrews: Crew[] = [];
      let fetchedProjects: Project[] = [];
      let fetchedTasks: Task[] = [];

      try {
        [
          fetchedMaterials,
          fetchedTools,
          fetchedLaborCategories,
          fetchedCrews,
          fetchedProjects,
          fetchedTasks,
        ] = await Promise.all([
          materialsService.listForOrg(orgId),
          toolsService.listForOrg(orgId),
          laborCategoriesService.listForOrg(orgId),
          crewsService.listForOrg(orgId),
          projectsService.list(orgId),
          tasksService.listForOrg(orgId),
        ]);
      } catch (err: any) {
        console.error('[ERP] Error cargando recursos/proyectos/tareas desde Supabase:', err?.message ?? err);
        // Estado queda en [] — la app muestra vacío pero no crashea.
        // projectsLoaded queda false para evitar validación prematura de activeProjectId.
        setTasksLoaded(true); // desbloquear editor aunque no haya tareas, para no quedar en spinner eterno
        return;
      }

      setAllMaterials(fetchedMaterials);
      setAllTools(fetchedTools);
      setAllLaborCategories(fetchedLaborCategories);
      setAllCrews(fetchedCrews);
      setAllProjects(fetchedProjects);
      setProjectsLoaded(true); // marcar ANTES de que el useEffect de validación corra
      setAllTasks(fetchedTasks);
      setTasksLoaded(true); // tareas disponibles — BudgetEditor puede renderizar ítems

      // ── Fase 2: yields + crew yields (dependen de fetchedTasks) ──────────
      await applyYields(orgId, fetchedTasks.map(t => t.id));
      // NOTA: la validación de activeProjectId se hace en el useEffect de abajo,
      // fuera del async, para evitar stale closure y race conditions entre loads.
    };

    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  // ─── Validar activeProjectId DESPUÉS de que los projects carguen ──────────
  // Separado del async load() para evitar que dos loads concurrentes se pisen.
  useEffect(() => {
    // Solo actuar cuando ya cargamos proyectos para esta org.
    // Si projectsLoaded es false, no limpiar: puede ser una carga en curso.
    if (!projectsLoaded || !activeProjectId) return;
    const valid = allProjects.some(
      p => p.id === activeProjectId && p.organizationId === orgId
    );
    if (!valid) {
      console.info('[ERP] activeProjectId no pertenece a esta org, limpiando.');
      setActiveProjectId(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectsLoaded, allProjects, orgId]);

  // ─── SUPABASE: cargar budget_items cuando cambia el proyecto activo ────────
  // IMPORTANTE: depende también de orgId para evitar que el effect dispare en
  // mount con el activeProjectId stale de localStorage antes de que el usuario
  // esté autenticado (llamada sin sesión → RLS bloquea → never reload on login).
  useEffect(() => {
    if (!activeProjectId || !orgId) {
      setAllBudgetItems([]);
      setBudgetItemsLoading(false);
      return;
    }
    setBudgetItemsLoading(true);
    setAllBudgetItems([]); // limpiar mientras carga
    console.log(`[ERP:budgetItems] cargando para proyecto=${activeProjectId?.slice(0,8)} org=${orgId?.slice(0,8)}`);
    budgetItemsService.listForProject(activeProjectId)
      .then(items => {
        console.log(`[ERP:budgetItems] setAllBudgetItems(${items.length} items)`);
        setAllBudgetItems(items);
      })
      .catch(err => {
        console.error('[ERP:budgetItems] fetch falló:', err);
      })
      .finally(() => setBudgetItemsLoading(false));
  }, [activeProjectId, orgId]);

  // --- FILTERED DATA (MULTITENANT) ---
  const materials = useMemo(() => allMaterials.filter(x => x.organizationId === orgId), [allMaterials, orgId]);
  const tasks = useMemo(() => allTasks.filter(x => x.organizationId === orgId), [allTasks, orgId]);
  const tools = useMemo(() => allTools.filter(x => x.organizationId === orgId), [allTools, orgId]);
  const laborCategories = useMemo(() => allLaborCategories.filter(x => x.organizationId === orgId), [allLaborCategories, orgId]);
  const crews = useMemo(() => allCrews.filter(x => x.organizationId === orgId), [allCrews, orgId]);

  // --- PROJECT LOGIC ---
  const projects = useMemo(() => allProjects.filter(x => x.organizationId === orgId), [allProjects, orgId]);

  const rawProject = useMemo(() => {
      return projects.find(p => p.id === activeProjectId) || projects[0] || {
          ...INITIAL_PROJECT,
          id: '__phantom__',
          organizationId: '__no_org__',
          name: 'Sin Proyecto',
          items: []
      };
  }, [projects, activeProjectId]);

  // Budget items del proyecto activo (ya filtrados por activeProjectId en el useEffect)
  const currentBudgetItems = useMemo(() => {
    const fromStore = allBudgetItems.filter(bi => bi.projectId === rawProject.id);
    return fromStore.length > 0 ? fromStore : rawProject.items;
  }, [allBudgetItems, rawProject.id, rawProject.items]);

  const project = useMemo(() =>
    ({ ...rawProject, items: currentBudgetItems }),
    [rawProject, currentBudgetItems]
  );

  const snapshots = useMemo(() => allSnapshots.filter(x => x.organizationId === orgId && x.projectId === project.id), [allSnapshots, orgId, project.id]);
  const receptions = useMemo(() => allReceptions.filter(x => x.organizationId === orgId), [allReceptions, orgId]);
  const subcontractors = useMemo(() => allSubcontractors.filter(x => x.organizationId === orgId), [allSubcontractors, orgId]);
  const contracts = useMemo(() => allContracts.filter(x => x.organizationId === orgId), [allContracts, orgId]);
  const certifications = useMemo(() => allCertifications.filter(x => x.organizationId === orgId), [allCertifications, orgId]);
  const documents = useMemo(() => allDocuments.filter(x => x.organizationId === orgId && x.projectId === project.id), [allDocuments, orgId, project.id]);
  const measurementSheets = useMemo(() => allMeasurementSheets.filter(x => x.organizationId === orgId), [allMeasurementSheets, orgId]);

  const qualityProtocols = useMemo(() => allQualityProtocols.filter(x => x.organizationId === orgId), [allQualityProtocols, orgId]);
  const qualityInspections = useMemo(() => allQualityInspections.filter(x => x.organizationId === orgId && x.projectId === project.id), [allQualityInspections, orgId, project.id]);
  const nonConformities = useMemo(() => allNonConformities.filter(x => x.organizationId === orgId && x.projectId === project.id), [allNonConformities, orgId, project.id]);

  const projectCertificates = useMemo(() =>
    allProjectCertificates
      .filter(c => c.organizationId === orgId && c.projectId === project.id)
      .sort((a, b) => a.number - b.number),
    [allProjectCertificates, orgId, project.id]
  );

  // --- OPTIMIZATION INDEXES ---
  const materialsMap = useMemo(() => {
    return materials.reduce((acc, m) => { acc[m.id] = m; return acc; }, {} as Record<string, Material>);
  }, [materials]);

  const tasksMap = useMemo(() => {
    return tasks.reduce((acc, t) => { acc[t.id] = t; return acc; }, {} as Record<string, Task>);
  }, [tasks]);

  const toolsMap = useMemo(() => {
    return tools.reduce((acc, t) => { acc[t.id] = t; return acc; }, {} as Record<string, Tool>);
  }, [tools]);

  const laborCategoriesMap = useMemo(() => {
    return laborCategories.reduce((acc, t) => { acc[t.id] = t; return acc; }, {} as Record<string, LaborCategory>);
  }, [laborCategories]);

  const crewsMap = useMemo(() => {
    return crews.reduce((acc, t) => { acc[t.id] = t; return acc; }, {} as Record<string, Crew>);
  }, [crews]);

  const yieldsIndex = useMemo(() => {
    const index: Record<string, TaskYield[]> = {};
    yields.forEach(y => {
      if(!index[y.taskId]) index[y.taskId] = [];
      index[y.taskId].push(y);
    });
    return index;
  }, [yields]);

  const toolYieldsIndex = useMemo(() => {
    const index: Record<string, TaskToolYield[]> = {};
    toolYields.forEach(y => {
      if(!index[y.taskId]) index[y.taskId] = [];
      index[y.taskId].push(y);
    });
    return index;
  }, [toolYields]);

  const taskCrewYieldsIndex = useMemo(() => {
    const index: Record<string, TaskCrewYield[]> = {};
    taskCrewYields.forEach(y => {
      if(!index[y.taskId]) index[y.taskId] = [];
      index[y.taskId].push(y);
    });
    return index;
  }, [taskCrewYields]);

  const taskLaborYieldsIndex = useMemo(() => {
    const index: Record<string, TaskLaborYield[]> = {};
    taskLaborYields.forEach(y => {
      if(!index[y.taskId]) index[y.taskId] = [];
      index[y.taskId].push(y);
    });
    return index;
  }, [taskLaborYields]);


  // --- ACTIONS (Inject OrgId) ---

  // ── Materials — optimistic + Supabase background sync ────────────────────

  const addMaterial = (m: Material) => {
    const enriched = { ...m, organizationId: orgId };
    setAllMaterials(prev => [...prev, enriched]);
    materialsService.create(enriched).catch(console.error);
  };
  const updateMaterial = (id: string, updates: Partial<Material>) => {
    setAllMaterials(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
    materialsService.update(id, updates).catch(console.error);
  };
  const removeMaterial = (id: string) => {
    setAllMaterials(prev => prev.filter(m => m.id !== id));
    materialsService.remove(id).catch(console.error);
  };

  // ── Tasks — optimistic + Supabase background sync ─────────────────────────

  const addTask = (t: Task): Promise<void> => {
    const enriched = { ...t, organizationId: orgId };
    setAllTasks(prev => [...prev, enriched]);
    // Devuelve la Promise para que los callers puedan secuenciar inserts dependientes (FK).
    // Los callers que no necesitan esperar pueden ignorar el valor devuelto.
    return tasksService.create(enriched);
  };

  const updateTask = (id: string, updates: Partial<Task>) => {
    setAllTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    tasksService.update(id, updates).catch(console.error);
  };

  const updateTaskMaster = async (taskId: string, updates: Partial<Task>): Promise<void> => {
    // 1. Update basic task info
    updateTask(taskId, updates);

    // 2. Cascade Update Resources if present in 'updates'
    if (updates.materialsYield) {
      setYields(prev => {
        const others = prev.filter(y => y.taskId !== taskId);
        return [...others, ...updates.materialsYield!];
      });
    }
    if (updates.equipmentYield) {
      setToolYields(prev => {
        const others = prev.filter(y => y.taskId !== taskId);
        return [...others, ...updates.equipmentYield!];
      });
    }
    if (updates.laborYield) {
      setTaskCrewYields(prev => {
        const others = prev.filter(y => y.taskId !== taskId);
        return [...others, ...updates.laborYield!];
      });
    }
    if (updates.laborIndividualYield) {
      setTaskLaborYields(prev => {
        const others = prev.filter(y => y.taskId !== taskId);
        return [...others, ...updates.laborIndividualYield!];
      });
    }

    // 3. Sync Supabase yields — awaited para feedback real
    const promises: Promise<void>[] = [];
    if (
      updates.materialsYield !== undefined ||
      updates.equipmentYield !== undefined ||
      updates.laborIndividualYield !== undefined
    ) {
      promises.push(
        tasksService.replaceAllYields(
          taskId,
          updates.materialsYield       ?? yields.filter(y => y.taskId === taskId),
          updates.laborIndividualYield ?? taskLaborYields.filter(y => y.taskId === taskId),
          updates.equipmentYield       ?? toolYields.filter(y => y.taskId === taskId),
        )
      );
    }
    if (updates.laborYield !== undefined) {
      promises.push(crewsService.replaceCrewYields(taskId, updates.laborYield));
    }
    if (promises.length > 0) await Promise.all(promises);
  };

  const removeTask = (id: string) => {
    setAllTasks(prev => prev.filter(t => t.id !== id));
    tasksService.remove(id).catch(console.error);
  };

  // ── Tools — optimistic + Supabase background sync ────────────────────────

  const addTool = (t: Tool) => {
    const enriched = { ...t, organizationId: orgId };
    setAllTools(prev => [...prev, enriched]);
    toolsService.create(enriched).catch(console.error);
  };
  const updateTool = (id: string, updates: Partial<Tool>) => {
    setAllTools(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    toolsService.update(id, updates).catch(console.error);
  };
  const removeTool = (id: string) => {
    setAllTools(prev => prev.filter(t => t.id !== id));
    toolsService.remove(id).catch(console.error);
  };

  // ── LaborCategories — optimistic + Supabase background sync ──────────────

  const addLaborCategory = (lc: LaborCategory) => {
    const enriched = { ...lc, organizationId: orgId };
    setAllLaborCategories(prev => [...prev, enriched]);
    laborCategoriesService.create(enriched).catch(console.error);
  };
  const updateLaborCategory = (id: string, updates: Partial<LaborCategory>) => {
    setAllLaborCategories(prev => prev.map(lc => lc.id === id ? { ...lc, ...updates } : lc));
    laborCategoriesService.update(id, updates).catch(console.error);
  };
  const removeLaborCategory = (id: string) => {
    setAllLaborCategories(prev => prev.filter(lc => lc.id !== id));
    laborCategoriesService.remove(id).catch(console.error);
  };

  // ── Crews — optimistic + Supabase background sync ────────────────────────

  const addCrew = (c: Crew) => {
    const enriched = { ...c, organizationId: orgId };
    setAllCrews(prev => [...prev, enriched]);
    crewsService.create(enriched).catch(console.error);
  };
  const updateCrew = (id: string, updates: Partial<Crew>) => {
    setAllCrews(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    crewsService.update(id, updates).catch(console.error);
  };
  const removeCrew = (id: string) => {
    setAllCrews(prev => prev.filter(c => c.id !== id));
    crewsService.remove(id).catch(console.error);
  };

  const addRubro = (name: string) => setRubros(prev => [...prev, name].sort());
  const removeRubro = (name: string) => setRubros(prev => prev.filter(r => r !== name));

  const addRubroPreset = (rubro: string, task: Partial<Task>) => {
      setRubroPresets(prev => ({
          ...prev,
          [rubro]: [...(prev[rubro] || []), task]
      }));
  };

  const removeRubroPreset = (rubro: string, taskName: string) => {
      setRubroPresets(prev => ({
          ...prev,
          [rubro]: (prev[rubro] || []).filter(t => t.name !== taskName)
      }));
  };

  // --- PROJECT ACTIONS ---
  const setActiveProject = (id: string) => {
      setActiveProjectId(id);
  };

  const exitProject = () => {
      setActiveProjectId(null);
  };

  const createNewProject = (data: Partial<Project>) => {
    const newId = generateId();
    const newProject: Project = {
      ...INITIAL_PROJECT,
      ...data,
      id: newId,
      organizationId: orgId,
      items: [],
    };
    // 🔍 DEBUG — eliminar antes de producción
    console.log('[ERP] createNewProject — orgId:', orgId);
    console.log('[ERP] createNewProject — newProject:', JSON.stringify(newProject, null, 2));

    // Optimistic: muestra en UI de inmediato
    setAllProjects(prev => [...prev, newProject]);
    setActiveProjectId(newId);

    // Persistir en Supabase; revertir si falla para evitar data loss silencioso
    projectsService.create(newProject).catch(err => {
      console.error('[ERP] Error al guardar proyecto en Supabase — revirtiendo:', err.message);
      setAllProjects(prev => prev.filter(p => p.id !== newId));
      setActiveProjectId(null);
    });
  };

  const deleteProject = (id: string) => {
    setAllProjects(prev => prev.filter(p => p.id !== id));
    setAllBudgetItems(prev => prev.filter(bi => bi.projectId !== id));
    if (activeProjectId === id) setActiveProjectId(null);
    Promise.all([
      projectsService.remove(id),
      budgetItemsService.removeAllForProject(id),
    ]).catch(console.error);
  };

  const updateProjectSettings = (p: Partial<Project>) => {
    setAllProjects(prev => prev.map(proj =>
      (proj.id === project.id && proj.organizationId === orgId) ? { ...proj, ...p } : proj
    ));
    projectsService.update(project.id, p).catch(console.error);
  };

  // Proyectos se persisten en tiempo real vía optimistic updates.
  // saveProject se mantiene por compatibilidad de API.
  const saveProject = async (): Promise<void> => {
    return Promise.resolve();
  };

  // ── Budget Items — optimistic + Supabase background sync ─────────────────

  const addBudgetItem = (item: BudgetItem): Promise<void> => {
    const enriched = { ...item, projectId: project.id, organizationId: orgId };
    console.log(`[ERP:addBudgetItem] intentando INSERT taskId=${enriched.taskId?.slice(0,8)} projectId=${enriched.projectId?.slice(0,8)} orgId=${enriched.organizationId?.slice(0,8)}`);
    setAllBudgetItems(prev => [...prev, enriched]);
    return budgetItemsService.create(enriched)
      .then(() => console.log('[ERP:addBudgetItem] ✓ INSERT OK en Supabase'))
      .catch(err => {
        console.error('[ERP:addBudgetItem] ✗ INSERT FALLÓ — revirtiendo optimistic:', err.message);
        // Revertir el optimistic update para que el estado quede en sincronía con la DB
        setAllBudgetItems(prev => prev.filter(bi => bi.id !== enriched.id));
        throw err; // re-throw para que el caller reaccione (muestra 'error al guardar')
      });
  };

  const removeBudgetItem = (itemId: string) => {
    setAllBudgetItems(prev => prev.filter(bi => bi.id !== itemId));
    budgetItemsService.remove(itemId).catch(console.error);
  };

  const updateBudgetItem = (itemId: string, updates: Partial<BudgetItem>) => {
    setAllBudgetItems(prev => prev.map(bi => bi.id === itemId ? { ...bi, ...updates } : bi));
    budgetItemsService.update(itemId, updates).catch(console.error);
  };

  // ── Yields — optimistic + Supabase background sync ───────────────────────

  const addTaskYield = (y: TaskYield) => {
    const enriched = { ...y, organizationId: orgId };
    setYields(prev => {
      const exists = prev.some(i => i.taskId === enriched.taskId && i.materialId === enriched.materialId);
      if (exists) return prev.map(i => (i.taskId === enriched.taskId && i.materialId === enriched.materialId) ? enriched : i);
      return [...prev, enriched];
    });
    tasksService.upsertYield(enriched).catch(console.error);
  };

  const removeTaskYield = (taskId: string, materialId: string) => {
    setYields(prev => prev.filter(i => !(i.taskId === taskId && i.materialId === materialId)));
    tasksService.removeYield(taskId, materialId).catch(console.error);
  };

  const addTaskToolYield = (y: TaskToolYield) => {
    const enriched = { ...y, organizationId: orgId };
    setToolYields(prev => {
      const exists = prev.some(i => i.taskId === enriched.taskId && i.toolId === enriched.toolId);
      if (exists) return prev.map(i => (i.taskId === enriched.taskId && i.toolId === enriched.toolId) ? enriched : i);
      return [...prev, enriched];
    });
    tasksService.upsertToolYield(enriched).catch(console.error);
  };

  const removeTaskToolYield = (taskId: string, toolId: string) => {
    setToolYields(prev => prev.filter(i => !(i.taskId === taskId && i.toolId === toolId)));
    tasksService.removeToolYield(taskId, toolId).catch(console.error);
  };

  // ── TaskCrewYields — optimistic + Supabase background sync ──────────────

  const addTaskCrewYield = (y: TaskCrewYield) => {
    setTaskCrewYields(prev => {
      const exists = prev.some(i => i.taskId === y.taskId && i.crewId === y.crewId);
      if (exists) return prev.map(i => (i.taskId === y.taskId && i.crewId === y.crewId) ? y : i);
      return [...prev, y];
    });
    crewsService.upsertCrewYield(y).catch(console.error);
  };

  const removeTaskCrewYield = (taskId: string, crewId: string) => {
    setTaskCrewYields(prev => prev.filter(i => !(i.taskId === taskId && i.crewId === crewId)));
    crewsService.removeCrewYield(taskId, crewId).catch(console.error);
  };

  const addTaskLaborYield = (y: TaskLaborYield) => {
    const enriched = { ...y, organizationId: orgId };
    setTaskLaborYields(prev => {
      const exists = prev.some(i => i.taskId === enriched.taskId && i.laborCategoryId === enriched.laborCategoryId);
      if (exists) return prev.map(i => (i.taskId === enriched.taskId && i.laborCategoryId === enriched.laborCategoryId) ? enriched : i);
      return [...prev, enriched];
    });
    tasksService.upsertLaborYield(enriched).catch(console.error);
  };

  const removeTaskLaborYield = (taskId: string, laborCategoryId: string) => {
    setTaskLaborYields(prev => prev.filter(i => !(i.taskId === taskId && i.laborCategoryId === laborCategoryId)));
    tasksService.removeLaborYield(taskId, laborCategoryId).catch(console.error);
  };

  const loadTemplate = (template: ProjectTemplate) => {
    const newTasks: Task[] = [];
    const newBudgetItems: BudgetItem[] = [];

    template.tasks.forEach(t => {
      let taskId = t.id;
      const existing = tasks.find(et => et.name.toLowerCase() === t.name.toLowerCase());
      if (existing) {
        taskId = existing.id;
      } else {
        taskId = generateId();
        newTasks.push({ ...t, id: taskId, organizationId: orgId } as Task);
      }

      newBudgetItems.push({
        id: generateId(),
        taskId: taskId,
        quantity: 1,
        manualDuration: 0
      });
    });

    if (newTasks.length > 0) {
      setAllTasks(prev => [...prev, ...newTasks]);
      newTasks.forEach(t => tasksService.create(t).catch(console.error));
    }

    const enrichedItems = newBudgetItems.map(item => ({ ...item, projectId: project.id }));
    setAllBudgetItems(prev => [...prev, ...enrichedItems]);
    enrichedItems.forEach(item => budgetItemsService.create(item).catch(console.error));
  };

  const createSnapshot = (name: string, totalCost: number) => {
      const newSnapshot: Snapshot = {
          id: generateId(),
          organizationId: orgId,
          projectId: project.id,
          date: new Date().toISOString(),
          name,
          totalCost,
          items: JSON.parse(JSON.stringify(project.items)),
          materialsSnapshot: JSON.parse(JSON.stringify(materials))
      };
      setAllSnapshots(prev => [newSnapshot, ...prev]);
  };

  const addReception = (reception: Reception) => {
      setAllReceptions(prev => [{ ...reception, organizationId: orgId }, ...prev]);
  };

  const getProjectStockStatus = (): MaterialStockStatus[] => {
      const status: Record<string, MaterialStockStatus> = {};

      project.items.forEach(item => {
          const taskYields = yieldsIndex[item.taskId] || [];
          taskYields.forEach(ty => {
              if (!status[ty.materialId]) {
                  const mat = materialsMap[ty.materialId];
                  if (mat) {
                      status[ty.materialId] = { material: mat, budgeted: 0, received: 0, pending: 0 };
                  }
              }
              if (status[ty.materialId]) {
                  status[ty.materialId].budgeted += ty.quantity * item.quantity;
              }
          });
      });

      receptions.forEach(rec => {
          if (rec.projectId === project.id) {
              rec.items.forEach(ri => {
                  if (status[ri.materialId]) {
                      status[ri.materialId].received += ri.quantityReceived;
                  } else {
                      const mat = materialsMap[ri.materialId];
                      if(mat) {
                         status[ri.materialId] = { material: mat, budgeted: 0, received: ri.quantityReceived, pending: 0 };
                      }
                  }
              });
          }
      });

      Object.values(status).forEach(s => {
          s.pending = Math.max(0, s.budgeted - s.received);
      });

      return Object.values(status).sort((a,b) => b.pending - a.pending);
  };

  const resetData = () => {
    // Limpia estado local para la org activa.
    // Nota: las entidades Supabase (projects, tasks, budget_items, yields)
    // no se eliminan del servidor en este reset — solo se limpia la memoria local.
    const orgProjectIds = new Set(allProjects.filter(p => p.organizationId === orgId).map(p => p.id));
    setAllMaterials(prev => prev.filter(x => x.organizationId !== orgId));
    setAllProjects([]);
    setAllTasks([]);
    setAllBudgetItems([]);
    setYields([]);
    setToolYields([]);
    setTaskLaborYields([]);
    setActiveProjectId(null);
    // Snapshots y otros en localStorage
    void orgProjectIds;
  };

  // --- DATABASE EXPORT / IMPORT (PERSISTENCE) ---
  const exportDatabase = (): string => {
      const db = {
          version: '1.0',
          timestamp: new Date().toISOString(),
          data: {
              allMaterials,
              allTasks,
              allTools,
              allLaborCategories,
              allCrews,
              allProjects,
              allBudgetItems,
              yields,
              toolYields,
              taskCrewYields,
              taskLaborYields,
              rubros,
              calendarPresets,
              allDocuments,
              allMeasurementSheets,
              allQualityProtocols,
              allQualityInspections,
              allNonConformities,
              allProjectCertificates
          }
      };
      return JSON.stringify(db, null, 2);
  };

  const importDatabase = (json: string): ImportResult => {
      try {
          const db = JSON.parse(json);
          if (!db.data) return { success: false, message: 'Formato de respaldo inválido.' };

          if(confirm('ADVERTENCIA: Esta acción sobrescribirá todos los datos actuales. ¿Desea continuar?')) {
              setAllMaterials(db.data.allMaterials || []);
              setAllTasks(db.data.allTasks || []);
              setAllTools(db.data.allTools || []);
              setAllLaborCategories(db.data.allLaborCategories || []);
              setAllCrews(db.data.allCrews || []);
              setAllProjects(db.data.allProjects || []);
              setAllBudgetItems(db.data.allBudgetItems || []);
              setYields(db.data.yields || []);
              setToolYields(db.data.toolYields || []);
              setTaskCrewYields(db.data.taskCrewYields || []);
              setTaskLaborYields(db.data.taskLaborYields || []);
              setRubros(db.data.rubros || INITIAL_RUBROS);
              setCalendarPresets(db.data.calendarPresets || []);
              setAllDocuments(db.data.allDocuments || []);
              setAllMeasurementSheets(db.data.allMeasurementSheets || []);
              setAllQualityProtocols(db.data.allQualityProtocols || []);
              setAllQualityInspections(db.data.allQualityInspections || []);
              setAllNonConformities(db.data.allNonConformities || []);
              setAllProjectCertificates(db.data.allProjectCertificates || []);
              setActiveProjectId(null);
              return { success: true, message: 'Base de datos restaurada correctamente.' };
          }
          return { success: false, message: 'Restauración cancelada.' };
      } catch (e) {
          return { success: false, message: 'Error al leer el archivo JSON.' };
      }
  };

  const importData = (type: 'materials' | 'tasks' | 'tools' | 'labor', jsonData: string): ImportResult => {
    try {
      const parsed = JSON.parse(jsonData);
      if (!Array.isArray(parsed)) return { success: false, message: 'Formato inválido.' };

      const enriched = parsed.map(i => ({...i, organizationId: orgId}));

      if (type === 'materials') setAllMaterials(prev => [...prev, ...enriched]);
      else if (type === 'tasks') {
        setAllTasks(prev => [...prev, ...enriched]);
        enriched.forEach((t: Task) => tasksService.create(t).catch(console.error));
      }
      else if (type === 'tools') setAllTools(prev => [...prev, ...enriched]);
      else if (type === 'labor') setAllLaborCategories(prev => [...prev, ...enriched]);
      return { success: true, message: 'Importación exitosa.' };
    } catch (e) {
      return { success: false, message: 'Error en el JSON.' };
    }
  };

  const addSubcontractor = (s: Subcontractor) => setAllSubcontractors(prev => [...prev, { ...s, organizationId: orgId }]);
  const updateSubcontractor = (id: string, updates: Partial<Subcontractor>) =>
      setAllSubcontractors(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));

  const addContract = (c: Contract) => setAllContracts(prev => [...prev, { ...c, organizationId: orgId }]);
  const addCertification = (c: Certification) => setAllCertifications(prev => [...prev, { ...c, organizationId: orgId }]);

  const addCalendarPreset = (preset: CalendarPreset) => {
      setCalendarPresets(prev => [...prev, preset]);
  };

  const applyCalendarPreset = (presetId: string) => {
      const preset = calendarPresets.find(p => p.id === presetId);
      if (preset) {
          updateProjectSettings({
              workdayHours: preset.workdayHours,
              workdayStartTime: preset.workdayStartTime,
              workdayEndTime: preset.workdayEndTime,
              lunchBreakDuration: preset.lunchBreakDuration,
              workingDays: preset.workingDays,
              nonWorkingDates: preset.nonWorkingDates
          });
      }
  };

  const addDocument = (doc: ProjectDocument) => {
      setAllDocuments(prev => [{ ...doc, organizationId: orgId }, ...prev]);
  };

  const removeDocument = (id: string) => {
      setAllDocuments(prev => prev.filter(d => d.id !== id));
  };

  const saveMeasurementSheet = (sheet: MeasurementSheet) => {
      const owned = { ...sheet, organizationId: orgId };
      setAllMeasurementSheets(prev => {
          const exists = prev.find(s => s.id === owned.id);
          if (exists) return prev.map(s => s.id === owned.id ? owned : s);
          return [...prev, owned];
      });
  };

  const syncMeasurementToBudget = (sheetId: string) => {
      const sheet = allMeasurementSheets.find(s => s.id === sheetId);
      if (!sheet) return;
      updateBudgetItem(sheet.budgetItemId, { quantity: sheet.totalQuantity });
  };

  const addQualityProtocol = (p: QualityProtocol) => setAllQualityProtocols(prev => [...prev, {...p, organizationId: orgId}]);
  const updateQualityProtocol = (id: string, updates: Partial<QualityProtocol>) =>
      setAllQualityProtocols(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));

  const addQualityInspection = (i: QualityInspection) =>
      setAllQualityInspections(prev => [{ ...i, organizationId: orgId }, ...prev]);
  const addNonConformity = (n: NonConformity) =>
      setAllNonConformities(prev => [{ ...n, organizationId: orgId }, ...prev]);
  const updateNonConformity = (id: string, updates: Partial<NonConformity>) =>
      setAllNonConformities(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));

  const addProjectCertificate = (cert: ProjectCertificate) =>
      setAllProjectCertificates(prev => [...prev, cert]);

  // --- DEPENDENCY MANAGEMENT ---
  const detectCycle = (newDep: ProjectDependency, currentDeps: ProjectDependency[]): boolean => {
      const graph = new Map<string, string[]>();
      currentDeps.forEach(d => {
          if (!graph.has(d.fromTaskId)) graph.set(d.fromTaskId, []);
          graph.get(d.fromTaskId)!.push(d.toTaskId);
      });
      if (!graph.has(newDep.fromTaskId)) graph.set(newDep.fromTaskId, []);
      graph.get(newDep.fromTaskId)!.push(newDep.toTaskId);

      const visited = new Set<string>();
      const recursionStack = new Set<string>();
      const dfs = (node: string): boolean => {
          visited.add(node);
          recursionStack.add(node);
          for (const neighbor of (graph.get(node) || [])) {
              if (!visited.has(neighbor)) { if (dfs(neighbor)) return true; }
              else if (recursionStack.has(neighbor)) return true;
          }
          recursionStack.delete(node);
          return false;
      };
      return dfs(newDep.fromTaskId);
  };

  const addDependency = (dep: ProjectDependency) => {
      if (!project) return;
      if (dep.fromTaskId === dep.toTaskId) { alert("No se puede crear una dependencia cíclica (misma tarea)."); return; }
      const currentDeps = project.dependencies || [];
      if (currentDeps.some(d => d.fromTaskId === dep.fromTaskId && d.toTaskId === dep.toTaskId)) {
          alert("Ya existe una relación entre estas tareas."); return;
      }
      if (detectCycle(dep, currentDeps)) { alert("No se puede crear la relación porque generaría un ciclo infinito."); return; }
      updateProjectSettings({ dependencies: [...currentDeps, dep] });
  };

  const updateDependency = (id: string, updates: Partial<ProjectDependency>) => {
      if (!project) return;
      updateProjectSettings({ dependencies: (project.dependencies || []).map(d => d.id === id ? { ...d, ...updates } : d) });
  };

  const removeDependency = (id: string) => {
      if (!project) return;
      updateProjectSettings({ dependencies: (project.dependencies || []).filter(d => d.id !== id) });
  };

  const reloadOrgResources = async () => {
    if (!orgId) return;
    const [mats, tls, lcs] = await Promise.all([
      materialsService.listForOrg(orgId),
      toolsService.listForOrg(orgId),
      laborCategoriesService.listForOrg(orgId),
    ]);
    setAllMaterials(mats);
    setAllTools(tls);
    setAllLaborCategories(lcs);
  };

  const reloadYields = useCallback(
    () => applyYields(orgId, allTasks.filter(t => t.organizationId === orgId).map(t => t.id)),
    [applyYields, orgId, allTasks],
  );

  return (
    <ERPContext.Provider value={{
      materials, tasks, yields, tools, toolYields, laborCategories, crews, rubros, rubroPresets, project, projects, activeProjectId,
      snapshots, receptions, subcontractors, contracts, certifications, calendarPresets, documents, measurementSheets, taskCrewYields, taskLaborYields,
      qualityProtocols, qualityInspections, nonConformities,
      // Indexes
      materialsMap, tasksMap, toolsMap, yieldsIndex, toolYieldsIndex, laborCategoriesMap, crewsMap, taskCrewYieldsIndex, taskLaborYieldsIndex,
      // Actions
      addMaterial, updateMaterial, removeMaterial,
      addTask, updateTask, updateTaskMaster, removeTask,
      addTool, updateTool, removeTool,
      addLaborCategory, updateLaborCategory, removeLaborCategory,
      addCrew, updateCrew, removeCrew,
      addRubro, removeRubro, addRubroPreset, removeRubroPreset,
      budgetItemsLoading, tasksLoaded, yieldsLoading, yieldsError, reloadYields, updateProjectSettings, addBudgetItem, removeBudgetItem, updateBudgetItem,
      addTaskYield, removeTaskYield, addTaskToolYield, removeTaskToolYield, addTaskCrewYield, removeTaskCrewYield, addTaskLaborYield, removeTaskLaborYield,
      loadTemplate, importData, createSnapshot, resetData,
      exportDatabase, importDatabase,
      addReception, getProjectStockStatus,
      addSubcontractor, updateSubcontractor, addContract, addCertification,
      addCalendarPreset, applyCalendarPreset,
      addDocument, removeDocument, saveMeasurementSheet, syncMeasurementToBudget,
      createNewProject, setActiveProject, deleteProject, saveProject, exitProject,
      // Quality
      addQualityProtocol, updateQualityProtocol, addQualityInspection, addNonConformity, updateNonConformity,
      // Project Certificates
      projectCertificates, addProjectCertificate,
      // Dependencies
      addDependency, updateDependency, removeDependency,
      reloadOrgResources
    }}>
      {children}
    </ERPContext.Provider>
  );
};

export const useERP = () => {
  const context = useContext(ERPContext);
  if (!context) throw new Error("useERP must be used within an ERPProvider");
  return context;
};
