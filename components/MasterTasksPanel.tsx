import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Plus, Edit2, Trash2, Save, X, ArrowLeft,
  BookOpen, Search, ChevronDown, AlertTriangle, CheckCircle,
  ArrowRight, Package, Layers, Copy, Globe, Loader2, Wand2, RefreshCcw, FileSearch, Download,
} from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useERP } from '../context/ERPContext';
import { useMasterTasks } from '../hooks/useMasterTasks';
import { useUnifiedMaterials } from '../hooks/useUnifiedMaterials';
import { normalizeStr } from '../utils/normalizeStr';
import { calculateMasterTaskCost, MASTER_WORKDAY_HOURS } from '../services/masterTaskCostService';
import { masterTasksService } from '../services/masterTasksSupabaseService';
import { buildImportPayload } from '../services/importMasterTask';
import { buildRubroImportPayloads } from '../services/importMasterRubro';
import { CatalogImportModal } from './CatalogImportModal';
import { MasterTask, MasterTaskMaterial, MasterTaskLabor, MasterTaskEquipment } from '../types';
import { APUTechnicalReportDrawer } from '../src/features/reports/APUTechnicalReportDrawer';
import { generateId } from '../utils/generateId';
import { suggestTaskCode } from '../utils/codeGenerator';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const uid = () => generateId();

const EMPTY_TASK: Omit<MasterTask, 'id' | 'organizationId' | 'isActive' | 'createdAt' | 'updatedAt'> = {
  code: '',
  name: '',
  description: '',
  unit: '',
  category: '',
  dailyYield: 8,
  fixedCost: 0,
  fixedCostDescription: '',
  specifications: '',
  tags: [],
  materials: [],
  labor: [],
  equipment: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// Modal de confirmación de importación
// ─────────────────────────────────────────────────────────────────────────────
interface ImportModalProps {
  task: MasterTask;
  projectName: string;
  projectIsPhantom: boolean;
  hasDuplicateName: boolean;
  laborCategoriesMap: Record<string, any>;
  toolsMap: Record<string, any>;
  onConfirm: (quantity: number) => void;
  onClose: () => void;
}

const ImportModal: React.FC<ImportModalProps> = ({
  task,
  projectName,
  projectIsPhantom,
  hasDuplicateName,
  laborCategoriesMap,
  toolsMap,
  onConfirm,
  onClose,
}) => {
  const [quantity, setQuantity] = useState(1);
  const [importing, setImporting] = useState(false);

  // Preview de líneas que se van a importar y cuáles se omiten
  const validLabor = task.labor.filter(l => !!laborCategoriesMap[l.laborCategoryId]);
  const skippedLabor = task.labor.filter(l => !laborCategoriesMap[l.laborCategoryId]);
  const validTools = task.equipment.filter(e => !!toolsMap[e.toolId]);
  const skippedTools = task.equipment.filter(e => !toolsMap[e.toolId]);

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">

        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
              <ArrowRight size={18} className="text-blue-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Usar en Presupuesto</h3>
              <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[220px]">{task.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">

          {/* Sin proyecto activo */}
          {projectIsPhantom && (
            <div className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-red-700">
                <strong>No hay un proyecto activo.</strong> Abrí o creá un proyecto antes de importar un análisis.
              </div>
            </div>
          )}

          {/* Proyecto destino */}
          {!projectIsPhantom && (
            <div className="text-xs text-slate-600">
              Proyecto destino: <span className="font-bold text-slate-800">{projectName}</span>
            </div>
          )}

          {/* Advertencia nombre duplicado */}
          {hasDuplicateName && !projectIsPhantom && (
            <div className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-amber-800">
                <strong>Ya existe una tarea con este nombre en el proyecto.</strong> Se creará igualmente como una entrada adicional.
              </div>
            </div>
          )}

          {/* Aviso materiales */}
          <div className="flex items-start gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <Package size={16} className="text-slate-400 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-slate-600">
              <strong className="text-slate-700">Los materiales no se importan en esta versión.</strong> Se copian MO y Equipos. Los materiales se configuran por separado desde el editor APU del proyecto.
            </div>
          </div>

          {/* Resumen de lo que se importa */}
          {!projectIsPhantom && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Qué se crea</p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-slate-700">
                  <CheckCircle size={13} className="text-emerald-500 flex-shrink-0" />
                  <span>Tarea: <strong>{task.name}</strong> ({task.unit})</span>
                </div>
                {validLabor.length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-slate-700">
                    <CheckCircle size={13} className="text-emerald-500 flex-shrink-0" />
                    <span>{validLabor.length} línea{validLabor.length !== 1 ? 's' : ''} de Mano de Obra</span>
                  </div>
                )}
                {validTools.length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-slate-700">
                    <CheckCircle size={13} className="text-emerald-500 flex-shrink-0" />
                    <span>{validTools.length} línea{validTools.length !== 1 ? 's' : ''} de Equipos</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-slate-700">
                  <CheckCircle size={13} className="text-emerald-500 flex-shrink-0" />
                  <span>Ítem de presupuesto con cantidad inicial</span>
                </div>
              </div>

              {/* Líneas omitidas */}
              {(skippedLabor.length > 0 || skippedTools.length > 0) && (
                <div className="mt-2 p-2.5 bg-amber-50 border border-amber-100 rounded-lg space-y-1">
                  <p className="text-xs font-bold text-amber-700">Líneas omitidas (FK no encontrada en proyecto):</p>
                  {skippedLabor.map(l => (
                    <p key={l.id} className="text-xs text-amber-600">· MO: {l.laborCategoryName}</p>
                  ))}
                  {skippedTools.map(e => (
                    <p key={e.id} className="text-xs text-amber-600">· Equipo: {e.toolName}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Input de cantidad */}
          {!projectIsPhantom && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Cantidad inicial del ítem ({task.unit})
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={e => setQuantity(Math.max(1, parseFloat(e.target.value) || 1))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 font-medium"
          >
            Cancelar
          </button>
          <button
            onClick={async () => {
              if (importing) return;
              setImporting(true);
              try { await onConfirm(quantity); } finally { setImporting(false); }
            }}
            disabled={projectIsPhantom || importing}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
          >
            <ArrowRight size={13} /> {importing ? 'Importando…' : 'Importar al Proyecto'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Modal de importación por rubro (selector propio)
// ─────────────────────────────────────────────────────────────────────────────
interface RubroImportModalProps {
  rubros: string[];
  masterTasks: MasterTask[];
  projectName: string;
  projectTaskNames: Set<string>;
  laborCategoriesMap: Record<string, any>;
  toolsMap: Record<string, any>;
  onConfirm: (rubro: string) => void;
  onClose: () => void;
}

const RubroImportModal: React.FC<RubroImportModalProps> = ({
  rubros, masterTasks, projectName, projectTaskNames,
  laborCategoriesMap, toolsMap, onConfirm, onClose,
}) => {
  const [selectedRubro, setSelectedRubro] = useState(rubros[0] ?? '');
  if (rubros.length === 0) return null;

  const preview = masterTasks.filter(t => t.category === selectedRubro);
  const duplicates = preview.filter(t => projectTaskNames.has(t.name.toLowerCase().trim()));
  const skippedLineCount = preview.reduce((sum, t) => {
    const sl = t.labor.filter(l => !laborCategoriesMap[l.laborCategoryId]).length;
    const se = t.equipment.filter(e => !toolsMap[e.toolId]).length;
    return sum + sl + se;
  }, 0);

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">

        <div className="p-5 border-b border-slate-100 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Layers size={18} className="text-indigo-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Copiar rubro al proyecto</h3>
              <p className="text-xs text-slate-500 mt-0.5">Destino: <span className="font-medium text-slate-700">{projectName}</span></p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Rubro a importar</label>
            <select
              value={selectedRubro}
              onChange={e => setSelectedRubro(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {rubros.map(r => (
                <option key={r} value={r}>
                  {r} ({masterTasks.filter(t => t.category === r).length} tareas)
                </option>
              ))}
            </select>
          </div>

          {preview.length > 0 && (
            <div className="border border-slate-100 rounded-xl overflow-hidden">
              <div className="max-h-40 overflow-y-auto divide-y divide-slate-50">
                {preview.map(t => {
                  const isDup = projectTaskNames.has(t.name.toLowerCase().trim());
                  return (
                    <div key={t.id} className="flex items-center justify-between px-3 py-2">
                      <span className="text-xs text-slate-700 truncate max-w-[260px]">{t.name}</span>
                      {isDup && (
                        <span className="text-[10px] text-amber-600 font-medium whitespace-nowrap ml-2">ya en proyecto</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {preview.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-3">Este rubro no tiene tareas maestras.</p>
          )}

          {duplicates.length > 0 && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{duplicates.length} tarea{duplicates.length !== 1 ? 's' : ''} ya exist{duplicates.length !== 1 ? 'en' : 'e'} en el proyecto y se agregarán como entradas adicionales.</span>
            </div>
          )}

          {skippedLineCount > 0 && (
            <div className="flex items-start gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{skippedLineCount} línea{skippedLineCount !== 1 ? 's' : ''} de MO/Equipo ser{skippedLineCount !== 1 ? 'án' : 'á'} omitida{skippedLineCount !== 1 ? 's' : ''} por categorías no disponibles en el proyecto.</span>
            </div>
          )}
        </div>

        <div className="p-5 pt-0 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(selectedRubro)}
            disabled={preview.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Layers size={13} /> Importar {preview.length} tarea{preview.length !== 1 ? 's' : ''}
          </button>
        </div>

      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Panel principal
// ─────────────────────────────────────────────────────────────────────────────
export const MasterTasksPanel: React.FC = () => {
  const { user, activeOrganizationId } = useAuth();
  const orgId = activeOrganizationId ?? user?.organizationId ?? '';

  // Data sources
  const { tasks, loading: tasksLoading, error: tasksError, add, update, remove, refetch } = useMasterTasks(orgId);
  const { list: unifiedMaterials, masterMaterialsMap, refetch: refetchMaterials } = useUnifiedMaterials(orgId);
  const {
    laborCategories, laborCategoriesMap,
    tools, toolsMap,
    tasks: projectTasks,
    materials: projectMaterials,
    project,
    projects,
    rubros,
    addTask, addMaterial, updateMaterial, updateLaborCategory, addTaskYield, addTaskLaborYield, addTaskToolYield, addBudgetItem,
  } = useERP();

  // Índice precio técnico por nombre/código — para materiales sin FK en el draft
  const nameIndex = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of unifiedMaterials) {
      if (u.cost > 0) {
        if (u.code) m.set(normalizeStr(u.code), u.cost);
        m.set(normalizeStr(u.name), u.cost);
      }
    }
    return m;
  }, [unifiedMaterials]);

  // ── UI state ──────────────────────────────────────────────────────────────
  type View = 'list' | 'edit';
  const [view, setView] = useState<View>('list');
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('ALL');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Draft (task being edited or created)
  const [draft, setDraft] = useState<typeof EMPTY_TASK & { id?: string }>(EMPTY_TASK);
  const isNew = !draft.id;

  // ── Autogeneración de código APU ───────────────────────────────────────────
  const [autoCode, setAutoCode] = useState('');
  const autoCodeRef = useRef('');

  useEffect(() => {
    if (!isNew) return; // solo en creación, nunca en edición
    const existingCodes = tasks.map(t => t.code).filter((c): c is string => !!c);
    const suggested = suggestTaskCode(draft.category ?? '', existingCodes);
    const prevAuto = autoCodeRef.current;
    autoCodeRef.current = suggested;
    setAutoCode(suggested);
    // Rellenar si el campo está vacío o aún muestra la sugerencia anterior.
    setDraft(d => ({
      ...d,
      code: (d.code === '' || d.code === prevAuto) ? suggested : d.code,
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.category, isNew]);

  // Import modal state
  const [importTarget, setImportTarget] = useState<MasterTask | null>(null);
  const [rubroImportOpen, setRubroImportOpen] = useState(false);

  // APU technical report drawer
  const [reportTask, setReportTask] = useState<MasterTask | null>(null);

  // Catálogo global: toggle + datos + clonado por fila
  type Catalog = 'private' | 'global';
  const [catalog, setCatalog] = useState<Catalog>('private');
  const [globalTasks, setGlobalTasks] = useState<MasterTask[]>([]);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [cloning, setCloning] = useState<Record<string, boolean>>({});
  const [showImportModal, setShowImportModal] = useState(false);

  // Selectors for adding yield lines
  const [selMaterial, setSelMaterial] = useState('');
  const [selLabor, setSelLabor] = useState('');
  const [selEquipment, setSelEquipment] = useState('');

  const [refreshingPrices, setRefreshingPrices] = useState(false);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleRefreshPrices = async () => {
    setRefreshingPrices(true);
    try {
      await refetchMaterials();
      // Actualizar lastKnownUnitPrice en materiales sin FK (unlinked) desde nameIndex
      setDraft(d => ({
        ...d,
        materials: d.materials.map(m => {
          if (m.masterMaterialId) return m;
          const freshPrice = nameIndex.get(normalizeStr(m.materialName));
          return freshPrice && freshPrice > 0 ? { ...m, lastKnownUnitPrice: freshPrice } : m;
        }),
      }));
      showMsg('success', 'Precios actualizados desde Catálogo de Empresa. Guardá el APU para conservar estos valores.');
    } catch {
      showMsg('error', 'Error al actualizar precios.');
    } finally {
      setRefreshingPrices(false);
    }
  };

  const projectIsPhantom = project.id === '__phantom__';

  const openNew = () => {
    setDraft({ ...EMPTY_TASK });
    setAutoCode('');
    autoCodeRef.current = '';
    setSelMaterial('');
    setSelLabor('');
    setSelEquipment('');
    setView('edit');
  };

  const openEdit = (task: MasterTask) => {
    setDraft({
      id: task.id,
      code: task.code ?? '',
      name: task.name,
      description: task.description ?? '',
      unit: task.unit,
      category: task.category ?? '',
      dailyYield: task.dailyYield,
      fixedCost: task.fixedCost ?? 0,
      fixedCostDescription: task.fixedCostDescription ?? '',
      specifications: task.specifications ?? '',
      tags: task.tags ?? [],
      materials: [...task.materials],
      labor: [...task.labor],
      equipment: [...task.equipment],
    });
    setSelMaterial('');
    setSelLabor('');
    setSelEquipment('');
    setView('edit');
  };

  const backToList = () => {
    setView('list');
    setDraft({ ...EMPTY_TASK });
    setAutoCode('');
    autoCodeRef.current = '';
  };

  // ── Import handler ────────────────────────────────────────────────────────
  const handleImport = async (quantity: number) => {
    if (!importTarget || projectIsPhantom) return;

    // Dedup: si la tarea ya fue importada al proyecto, reutilizar en lugar de duplicar
    const existingProjectTask = projectTasks.find(t => t.masterTaskId === importTarget.id);
    if (existingProjectTask) {
      if (project.items.some(bi => bi.taskId === existingProjectTask.id)) {
        showMsg('error', `"${importTarget.name}" ya fue incorporada al presupuesto. Editá la cantidad desde el ítem existente.`);
        setImportTarget(null);
        return;
      }
      // Tarea importada pero aún sin línea de presupuesto — solo crear el budget_item
      await addBudgetItem({ id: generateId(), taskId: existingProjectTask.id, quantity, progress: 0 });
      showMsg('success', `"${importTarget.name}" agregada al presupuesto con cantidad ${quantity}.`);
      setImportTarget(null);
      return;
    }

    const payload = buildImportPayload(
      importTarget,
      orgId,
      project.id,
      quantity,
      laborCategoriesMap,
      toolsMap,
      projectMaterials,
      masterMaterialsMap,
    );

    // Escribir al proyecto usando las acciones ya expuestas por ERPContext.
    // addTask se awaita para que el budget_item no viole la FK de task_id.
    payload.materialsToCreate.forEach(m => addMaterial(m));
    // Corregir materiales existentes que tenían cost=0
    payload.materialsToUpdate.forEach(({ id, cost }) => updateMaterial(id, { cost }));
    // Corregir categorías MO con basicHourlyRate=0 usando la tarifa snapshot de la tarea maestra
    payload.laborCategoriesToUpdate.forEach(({ id, basicHourlyRate }) => updateLaborCategory(id, { basicHourlyRate }));
    try {
      await addTask(payload.task);
    } catch (err) {
      // Task no persistió → cancelar yields + budget_item para no dejar FK inválida.
      console.error('[handleImport] Falló el insert de tarea — importación cancelada:', err);
      showMsg('error', `No se pudo importar "${importTarget.name}". Error al guardar la tarea.`);
      return;
    }
    payload.taskYields.forEach(ty => addTaskYield(ty));
    payload.laborYields.forEach(ly => addTaskLaborYield(ly));
    payload.toolYields.forEach(ty => addTaskToolYield(ty));
    addBudgetItem(payload.budgetItem);

    const skipped = [...payload.skippedLabor, ...payload.skippedTools];
    const skippedNote = skipped.length > 0
      ? ` (${skipped.length} línea${skipped.length !== 1 ? 's' : ''} omitida${skipped.length !== 1 ? 's' : ''} por FK inválida)`
      : '';

    showMsg('success', `"${importTarget.name}" importada al presupuesto con cantidad ${quantity}.${skippedNote}`);
    setImportTarget(null);
  };

  // ── Fetch catálogo global cuando se activa ────────────────────────────────
  useEffect(() => {
    if (catalog !== 'global') return;
    setGlobalLoading(true);
    masterTasksService.listGlobal()
      .then(setGlobalTasks)
      .catch((e: any) => showMsg('error', e.message ?? 'Error al cargar el catálogo global.'))
      .finally(() => setGlobalLoading(false));
  }, [catalog]);

  // ── Clonar APU global a la org privada ────────────────────────────────────
  const handleClone = async (taskId: string) => {
    if (!orgId) return;
    setCloning(prev => ({ ...prev, [taskId]: true }));
    try {
      const { data, error } = await supabase.rpc('clone_master_task_to_org', {
        p_master_task_id:  taskId,
        p_organization_id: orgId,
      });
      if (error) throw new Error(error.message);
      if (data?.created === false) {
        showMsg('success', 'Este APU ya estaba copiado a tu empresa.');
        await refetch();
        setFilterCat('ALL');
        setSearch('');
        setCatalog('private');
      } else {
        showMsg('success', 'APU clonado a tu catálogo privado. Ya podés editarlo.');
        // Await refetch para que la lista privada incluya el clon antes de cambiar de tab.
        await refetch();
        // Limpiar filtros para que el clon recién creado sea visible sin importar su categoría.
        setFilterCat('ALL');
        setSearch('');
        setCatalog('private');
      }
    } catch (e: any) {
      showMsg('error', e.message ?? 'Error al clonar el APU.');
    } finally {
      setCloning(prev => ({ ...prev, [taskId]: false }));
    }
  };

  // ── Rubro import handler ──────────────────────────────────────────────────
  const handleRubroImport = async (rubro: string) => {
    if (projectIsPhantom) return;
    const { payloads, skippedTotal } = buildRubroImportPayloads(
      rubro, tasks, orgId, project.id, laborCategoriesMap, toolsMap, projectMaterials, masterMaterialsMap,
    );
    let skippedDups = 0;
    // for...of serializado: cada task persiste en Supabase antes de insertar su budget_item.
    for (const p of payloads) {
      // Dedup: si la tarea maestra ya fue importada al proyecto, reutilizar
      const existingProjectTask = projectTasks.find(t => t.masterTaskId === p.task.masterTaskId);
      if (existingProjectTask) {
        if (!project.items.some(bi => bi.taskId === existingProjectTask.id)) {
          await addBudgetItem({ id: generateId(), taskId: existingProjectTask.id, quantity: p.budgetItem.quantity, progress: 0 });
        } else {
          skippedDups++;
        }
        continue;
      }
      p.materialsToCreate.forEach(m => addMaterial(m));
      p.materialsToUpdate.forEach(({ id, cost }) => updateMaterial(id, { cost }));
      p.laborCategoriesToUpdate.forEach(({ id, basicHourlyRate }) => updateLaborCategory(id, { basicHourlyRate }));
      try {
        await addTask(p.task);
      } catch (err) {
        // Task no persistió → saltear yields + budget_item de este payload y continuar con el resto.
        console.error('[handleRubroImport] Falló el insert de tarea — se omite este payload:', err);
        continue;
      }
      p.taskYields.forEach(ty => addTaskYield(ty));
      p.laborYields.forEach(ly => addTaskLaborYield(ly));
      p.toolYields.forEach(ty => addTaskToolYield(ty));
      addBudgetItem(p.budgetItem);
    }
    const note = skippedTotal > 0
      ? ` (${skippedTotal} línea${skippedTotal !== 1 ? 's' : ''} omitida${skippedTotal !== 1 ? 's' : ''} por FK)`
      : '';
    const dupNote = skippedDups > 0
      ? ` · ${skippedDups} ya estaba${skippedDups !== 1 ? 'n' : ''} en el presupuesto`
      : '';
    showMsg('success', `${payloads.length - skippedDups} tarea${(payloads.length - skippedDups) !== 1 ? 's' : ''} importada${(payloads.length - skippedDups) !== 1 ? 's' : ''} al presupuesto.${note}${dupNote}`);
    setRubroImportOpen(false);
  };

  // ── Live cost calculation ──────────────────────────────────────────────────
  // Enriquece materiales sin FK (masterMaterialId = null) con precio técnico
  // desde nameIndex antes de calcular. Materiales con FK usan masterMaterialsMap.
  const liveCost = useMemo(() => {
    const enrichedMaterials = draft.materials.map(m => {
      if (m.masterMaterialId) return m;
      const price = nameIndex.get(normalizeStr(m.materialName));
      if (!price) return m;
      return { ...m, lastKnownUnitPrice: price };
    });
    const base: MasterTask = {
      ...draft,
      id: draft.id ?? '',
      organizationId: orgId,
      isActive: true,
      dailyYield: Math.max(0.01, draft.dailyYield || 0),
      createdAt: '',
      updatedAt: '',
      materials: enrichedMaterials,
    };
    return calculateMasterTaskCost(base, masterMaterialsMap, laborCategoriesMap, toolsMap, MASTER_WORKDAY_HOURS);
  }, [draft, masterMaterialsMap, nameIndex, laborCategoriesMap, toolsMap, orgId]);

  // ── Add yield lines ────────────────────────────────────────────────────────
  const addMaterialLine = () => {
    const idx = parseInt(selMaterial, 10);
    const umat = isNaN(idx) ? undefined : unifiedMaterials[idx];
    if (!umat) return;
    // Precio técnico: umat.cost ya está convertido en useUnifiedMaterials
    // wastePercent: leer del masterMaterialsMap si hay FK, sino 0
    const waste = umat.masterId ? (masterMaterialsMap[umat.masterId]?.wastePercent ?? 0) : 0;
    const line: MasterTaskMaterial = {
      id: uid(),
      masterMaterialId: umat.masterId,     // undefined para materiales sin FK
      materialName: umat.name,
      unit: umat.unit,
      quantity: 1,
      wastePercent: waste,
      lastKnownUnitPrice: umat.cost,       // precio TÉCNICO — umat.cost ya dividido por CF
    };
    setDraft(d => ({ ...d, materials: [...d.materials, line] }));
    setSelMaterial('');
  };

  const addLaborLine = () => {
    const cat = laborCategoriesMap[selLabor];
    if (!cat) return;
    const line: MasterTaskLabor = {
      id: uid(),
      laborCategoryId: cat.id,
      laborCategoryName: cat.role,
      quantity: 1,
    };
    setDraft(d => ({ ...d, labor: [...d.labor, line] }));
    setSelLabor('');
  };

  const addEquipmentLine = () => {
    const tool = toolsMap[selEquipment];
    if (!tool) return;
    const line: MasterTaskEquipment = {
      id: uid(),
      toolId: tool.id,
      toolName: tool.name,
      hoursPerUnit: 1,
    };
    setDraft(d => ({ ...d, equipment: [...d.equipment, line] }));
    setSelEquipment('');
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!draft.name.trim()) { showMsg('error', 'El nombre es obligatorio.'); return; }
    if (!draft.unit.trim()) { showMsg('error', 'La unidad es obligatoria.'); return; }
    if ((draft.dailyYield ?? 0) <= 0) { showMsg('error', 'El rendimiento debe ser mayor a 0.'); return; }

    // Enriquecer materiales sin FK con precio actual de nameIndex antes de persistir.
    // Esto garantiza que lastKnownUnitPrice refleje el precio vigente del catálogo.
    const enrichedMaterials = draft.materials.map(m => {
      if (m.masterMaterialId) return m;
      const freshPrice = nameIndex.get(normalizeStr(m.materialName));
      return freshPrice && freshPrice > 0 ? { ...m, lastKnownUnitPrice: freshPrice } : m;
    });
    const draftToSave = { ...draft, materials: enrichedMaterials };

    setSaving(true);
    try {
      if (isNew) {
        await add(draftToSave as typeof EMPTY_TASK);
        showMsg('success', `Tarea "${draft.name}" creada.`);
      } else {
        await update(draft.id!, draftToSave as typeof EMPTY_TASK);
        showMsg('success', `Tarea "${draft.name}" actualizada.`);
      }
      backToList();
    } catch (e: any) {
      showMsg('error', e.message ?? 'Error al guardar la tarea.');
    } finally {
      setSaving(false);
    }
  };

  // ── Filtered list ─────────────────────────────────────────────────────────
  // Fusiona los rubros canónicos con las categorías reales de las tareas cargadas.
  // Evita que tareas con categorías no normalizadas (ej: '4.1. Mampostería') queden
  // sin opción de filtro y parezcan "perdidas" al cambiar el selector.
  const categories = useMemo(() => {
    const taskCats = [
      ...new Set(
        tasks
          .map(t => t.category?.trim())
          .filter((c): c is string => !!c && !rubros.includes(c)),
      ),
    ].sort();
    if (taskCats.length > 0) {
      console.info('[MasterTasksPanel] Categorías de tareas fuera de rubros canónicos:', taskCats);
    }
    return ['ALL', ...rubros, ...taskCats];
  }, [rubros, tasks]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return tasks.filter(t => {
      const matchCat = filterCat === 'ALL' || t.category === filterCat;
      const matchSearch = !q || t.name.toLowerCase().includes(q) || (t.code ?? '').toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [tasks, search, filterCat]);

  const filteredGlobal = useMemo(() => {
    const q = search.toLowerCase();
    return globalTasks.filter(t =>
      !q || t.name.toLowerCase().includes(q) || (t.code ?? '').toLowerCase().includes(q),
    );
  }, [globalTasks, search]);

  // Fix: "ya en presupuesto" — verificar contra project.items (budget_items reales),
  // no contra tasks completo. Evita falsos positivos con tasks huérfanas (creadas
  // pero sin BudgetItem asociado por fallo en persist o estado stale).
  const budgetTaskNames = useMemo(() => {
    const budgetTaskIds = new Set(project.items.map(i => i.taskId));
    const namesInBudget = new Set(
      projectTasks
        .filter(t => budgetTaskIds.has(t.id))
        .map(t => t.name.toLowerCase().trim()),
    );
    if (namesInBudget.size !== budgetTaskIds.size) {
      console.info(
        '[MasterTasksPanel] budgetTaskNames: resolvedNames=%d, budgetItems=%d',
        namesInBudget.size,
        budgetTaskIds.size,
      );
    }
    return namesInBudget;
  }, [project.items, projectTasks]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="animate-in fade-in">

      {/* Modal de importación por rubro */}
      {rubroImportOpen && !projectIsPhantom && (
        <RubroImportModal
          rubros={rubros}
          masterTasks={tasks}
          projectName={project.name}
          projectTaskNames={budgetTaskNames}
          laborCategoriesMap={laborCategoriesMap}
          toolsMap={toolsMap}
          onConfirm={handleRubroImport}
          onClose={() => setRubroImportOpen(false)}
        />
      )}

      {/* Modal de importación */}
      {importTarget && (
        <ImportModal
          task={importTarget}
          projectName={project.name}
          projectIsPhantom={projectIsPhantom}
          hasDuplicateName={budgetTaskNames.has(importTarget.name.toLowerCase().trim())}
          laborCategoriesMap={laborCategoriesMap}
          toolsMap={toolsMap}
          onConfirm={handleImport}
          onClose={() => setImportTarget(null)}
        />
      )}

      {/* Toast */}
      {message && (
        <div className={`mb-4 flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          {message.text}
        </div>
      )}

      {/* ── VISTA LISTA ─────────────────────────────────────────────────── */}
      {view === 'list' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">

          {/* Header */}
          <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2">
              <BookOpen size={18} className="text-blue-600" />
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Analisis de Precios (APU)</h3>
                <p className="text-xs text-slate-500">{tasks.length} análisis · Org: {orgId} · Jornada: {MASTER_WORKDAY_HOURS}h</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar..."
                  className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
                />
              </div>
              {catalog === 'private' && (
                <div className="relative">
                  <select
                    value={filterCat}
                    onChange={e => setFilterCat(e.target.value)}
                    className="pl-3 pr-7 py-1.5 text-xs border border-slate-200 rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {categories.map(c => <option key={c} value={c}>{c === 'ALL' ? 'Todos los rubros' : c}</option>)}
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              )}
              {/* Toggle catálogo privado / global */}
              <button
                onClick={() => setCatalog(c => c === 'private' ? 'global' : 'private')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                  catalog === 'global'
                    ? 'bg-slate-800 text-white hover:bg-slate-700'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Globe size={14} />
                {catalog === 'global' ? 'Catálogo Global' : 'Ver Global'}
              </button>
              {catalog === 'private' && (
                <>
                  <button
                    onClick={() => setRubroImportOpen(true)}
                    disabled={projectIsPhantom || rubros.length === 0}
                    title={
                      projectIsPhantom ? 'Abrí un proyecto primero'
                      : rubros.length === 0 ? 'No hay rubros configurados en el proyecto'
                      : 'Copiar un rubro completo al presupuesto'
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Layers size={14} /> Copiar rubro al proyecto
                  </button>
                  <button
                    onClick={openNew}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                  >
                    <Plus size={14} /> Nueva Tarea
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Aviso sin proyecto activo */}
          {projectIsPhantom && (
            <div className="mx-4 mt-4 flex items-start gap-2.5 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <span>
                {projects.length > 0
                  ? <>El botón "Usar en Presupuesto" está deshabilitado. <strong>Abrí un proyecto desde el Hub</strong> para habilitarlo.</>
                  : <>No tenés proyectos creados aún. <strong>Creá un proyecto desde el Hub</strong> antes de importar tareas.</>
                }
              </span>
            </div>
          )}

          {/* Loading / Error de Supabase */}
          {tasksLoading && (
            <div className="mx-4 mt-4 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500 animate-pulse">
              Cargando tareas maestras…
            </div>
          )}
          {tasksError && !tasksLoading && (
            <div className="mx-4 mt-4 flex items-center gap-2.5 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <AlertTriangle size={14} className="flex-shrink-0" />
              {tasksError}
            </div>
          )}

          {/* ── Tabla: catálogo privado ───────────────────────────────────── */}
          {catalog === 'private' && !tasksLoading && (filtered.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <BookOpen size={32} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium text-sm">
                {tasks.length === 0
                  ? 'No hay tareas maestras todavía.'
                  : filterCat !== 'ALL'
                    ? `No hay tareas en el rubro "${filterCat}".`
                    : 'Ninguna tarea coincide con la búsqueda.'}
              </p>
              {tasks.length === 0 && (
                <button onClick={openNew} className="mt-3 text-blue-600 text-xs font-bold hover:underline">
                  Crear primera tarea →
                </button>
              )}
              {tasks.length > 0 && filterCat !== 'ALL' && (
                <button
                  onClick={() => setFilterCat('ALL')}
                  className="mt-3 text-blue-600 text-xs font-bold hover:underline"
                >
                  Ver todos los rubros →
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Código</th>
                    <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Nombre</th>
                    <th className="px-4 py-2.5 text-center text-xs font-bold text-slate-500 uppercase tracking-wide">Unid.</th>
                    <th className="px-4 py-2.5 text-center text-xs font-bold text-slate-500 uppercase tracking-wide">Rubro</th>
                    <th className="px-4 py-2.5 text-center text-xs font-bold text-slate-500 uppercase tracking-wide">Rdto.</th>
                    <th className="px-4 py-2.5 text-right text-xs font-bold text-slate-500 uppercase tracking-wide">Costo/u</th>
                    <th className="px-4 py-2.5 text-center text-xs font-bold text-slate-500 uppercase tracking-wide">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(task => {
                    const cost = calculateMasterTaskCost(task, masterMaterialsMap, laborCategoriesMap, toolsMap, MASTER_WORKDAY_HOURS);
                    const isDuplicate = budgetTaskNames.has(task.name.toLowerCase().trim());
                    return (
                      <tr key={task.id} className="border-b border-slate-50 hover:bg-blue-50/30 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{task.code || '—'}</td>
                        <td className="px-4 py-2.5 font-medium text-slate-800">
                          {task.name}
                          {isDuplicate && !projectIsPhantom && (
                            <span className="ml-1.5 text-[10px] text-amber-600 font-normal">(ya en proyecto)</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center text-slate-600 text-xs">{task.unit}</td>
                        <td className="px-4 py-2.5 text-center">
                          {task.category && (
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">{task.category}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center font-mono text-xs text-slate-600">{task.dailyYield} u/d</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold">
                          {cost.totalUnitCost === 0 && (task.materials.length > 0 || task.labor.length > 0)
                            ? (
                              <span className="flex items-center justify-end gap-1 text-amber-600" title="Sin precios definidos — abrí el APU para verificar fuentes">
                                <AlertTriangle size={11}/> $0,00
                              </span>
                            )
                            : <span className="text-slate-800">${fmt(cost.totalUnitCost)}</span>
                          }
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setImportTarget(task)}
                              disabled={projectIsPhantom}
                              title={projectIsPhantom ? 'Abrí un proyecto primero' : 'Usar en Presupuesto'}
                              className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <ArrowRight size={11} /> Usar
                            </button>
                            <button
                              onClick={() => setReportTask(task)}
                              className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded transition-colors"
                              title="Ver ficha técnica"
                            >
                              <FileSearch size={14} />
                            </button>
                            <button
                              onClick={() => openEdit(task)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Editar"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={async () => { if (confirm(`¿Eliminar "${task.name}"?`)) { try { await remove(task.id); showMsg('success', 'Tarea eliminada.'); } catch (e: any) { showMsg('error', e.message ?? 'Error al eliminar.'); } } }}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="px-4 py-2 border-t border-slate-50 text-xs text-slate-400">
                {filtered.length} de {tasks.length} tarea{tasks.length !== 1 ? 's' : ''}
              </div>
            </div>
          ))}

          {/* ── Tabla: catálogo global ────────────────────────────────────── */}
          {catalog === 'global' && !globalLoading && globalTasks.length > 0 && (
            <div className="px-4 py-2.5 border-b border-slate-100 bg-amber-50/60 flex items-center justify-between">
              <span className="text-xs text-amber-700">
                {globalTasks.length} APU{globalTasks.length !== 1 ? 's' : ''} disponibles en el catálogo global
              </span>
              {user?.role === 'admin' ? (
                <button
                  onClick={() => setShowImportModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors"
                >
                  <Download size={12} /> Importar a mi empresa
                </button>
              ) : (
                <span className="text-[11px] text-amber-600/70">Solo un administrador puede importar al catálogo de la empresa</span>
              )}
            </div>
          )}
          {catalog === 'global' && (
            globalLoading ? (
              <div className="p-12 text-center text-slate-400">
                <Loader2 size={24} className="mx-auto mb-3 animate-spin opacity-40" />
                <p className="text-sm">Cargando catálogo global…</p>
              </div>
            ) : filteredGlobal.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <Globe size={32} className="mx-auto mb-3 opacity-30" />
                <p className="font-medium text-sm">
                  {globalTasks.length === 0
                    ? 'El catálogo global no tiene tareas todavía.'
                    : 'Ninguna tarea coincide con la búsqueda.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Código</th>
                      <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Nombre</th>
                      <th className="px-4 py-2.5 text-center text-xs font-bold text-slate-500 uppercase tracking-wide">Unid.</th>
                      <th className="px-4 py-2.5 text-center text-xs font-bold text-slate-500 uppercase tracking-wide">Rubro</th>
                      <th className="px-4 py-2.5 text-center text-xs font-bold text-slate-500 uppercase tracking-wide">Rdto.</th>
                      <th className="px-4 py-2.5 text-center text-xs font-bold text-slate-500 uppercase tracking-wide">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGlobal.map(task => {
                      const isCloning = !!cloning[task.id];
                      return (
                        <tr key={task.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{task.code || '—'}</td>
                          <td className="px-4 py-2.5 font-medium text-slate-800">{task.name}</td>
                          <td className="px-4 py-2.5 text-center text-slate-600 text-xs">{task.unit}</td>
                          <td className="px-4 py-2.5 text-center">
                            {task.category && (
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-medium">{task.category}</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-center font-mono text-xs text-slate-600">{task.dailyYield} u/d</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-center">
                              <button
                                onClick={() => handleClone(task.id)}
                                disabled={isCloning}
                                title="Copiar este APU a tu catálogo privado para editarlo"
                                className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isCloning
                                  ? <><Loader2 size={11} className="animate-spin" /> Clonando…</>
                                  : <><Copy size={11} /> Clonar</>
                                }
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="px-4 py-2 border-t border-slate-50 text-xs text-slate-400">
                  {filteredGlobal.length} de {globalTasks.length} tarea{globalTasks.length !== 1 ? 's' : ''} · Solo lectura — cloná para editar
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* ── VISTA EDICIÓN ────────────────────────────────────────────────── */}
      {view === 'edit' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">

          {/* Edit Header */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={backToList} className="flex items-center gap-1 text-slate-500 hover:text-slate-800 text-xs font-medium transition-colors">
                <ArrowLeft size={14} /> Volver
              </button>
              <div className="w-px h-4 bg-slate-200" />
              <h3 className="font-bold text-slate-800 text-sm">
                {isNew ? 'Nuevo Análisis' : `Editando: ${draft.name || '…'}`}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={backToList} className="px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                <X size={12} className="inline mr-1" />Cancelar
              </button>
              <button
                onClick={handleRefreshPrices}
                disabled={refreshingPrices || saving}
                title="Recargar precios desde el Catálogo de Empresa"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RefreshCcw size={12} className={refreshingPrices ? 'animate-spin' : ''} />
                {refreshingPrices ? 'Actualizando…' : 'Actualizar precios'}
              </button>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                <Save size={12} /> {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>

          <div className="p-5 space-y-6">

            {/* ── Datos básicos ─────────────────────────────────────────── */}
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Datos básicos</h4>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {/* Código con sugerencia automática */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1.5">
                    Código
                    {isNew && autoCode && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                        <Wand2 size={8} /> auto
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      value={draft.code ?? ''}
                      onChange={e => setDraft(d => ({ ...d, code: e.target.value }))}
                      placeholder={isNew ? autoCode || 'APU-001' : 'APU-001'}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono pr-7"
                    />
                    {isNew && autoCode && draft.code !== autoCode && (
                      <button
                        type="button"
                        title={`Restaurar sugerencia: ${autoCode}`}
                        onClick={() => setDraft(d => ({ ...d, code: autoCode }))}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 transition-colors"
                      >
                        <RefreshCcw size={11} />
                      </button>
                    )}
                  </div>
                  {isNew && autoCode && draft.code !== autoCode && (
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Sugerido:{' '}
                      <button
                        type="button"
                        onClick={() => setDraft(d => ({ ...d, code: autoCode }))}
                        className="font-mono text-blue-600 underline underline-offset-2"
                      >
                        {autoCode}
                      </button>
                    </p>
                  )}
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Nombre <span className="text-red-500">*</span></label>
                  <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                    placeholder="Mampostería ladrillo hueco 0.15"
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Unidad <span className="text-red-500">*</span></label>
                  <input value={draft.unit} onChange={e => setDraft(d => ({ ...d, unit: e.target.value }))}
                    placeholder="m2"
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Rubro / Categoría</label>
                  <select value={draft.category} onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— Sin categoría —</option>
                    {rubros.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Rendimiento (u/día) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number" min="0.01" step="0.5"
                    value={draft.dailyYield}
                    onChange={e => setDraft(d => ({ ...d, dailyYield: parseFloat(e.target.value) || 0 }))}
                    className={`w-full px-2.5 py-1.5 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${(draft.dailyYield ?? 0) <= 0 ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}
                  />
                  {(draft.dailyYield ?? 0) <= 0 && (
                    <p className="text-red-500 text-[10px] mt-0.5">Debe ser mayor a 0 para calcular MO</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Costo Fijo ($/u)</label>
                  <input type="number" min="0" step="0.01"
                    value={draft.fixedCost ?? 0}
                    onChange={e => setDraft(d => ({ ...d, fixedCost: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Descripción del costo fijo</label>
                  <input value={draft.fixedCostDescription ?? ''}
                    onChange={e => setDraft(d => ({ ...d, fixedCostDescription: e.target.value }))}
                    placeholder="Flete, ayuda gremio, etc."
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </div>

            {/* ── Materiales ────────────────────────────────────────────── */}
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Materiales</h4>
              <div className="flex gap-2 mb-3">
                <div className="relative flex-1">
                  <select value={selMaterial} onChange={e => setSelMaterial(e.target.value)}
                    className="w-full pl-3 pr-7 py-1.5 text-xs border border-slate-200 rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    <option value="">— Seleccionar material —</option>
                    {unifiedMaterials.map((m, i) => {
                      const priceLabel = m.commercialUnit
                        ? `$${fmt(m.cost)}/${m.unit} · $${fmt(m.commercialPrice ?? m.cost * (m.conversionFactor ?? 1))}/${m.commercialUnit}`
                        : `$${fmt(m.cost)}/${m.unit}`;
                      return (
                        <option key={i} value={String(i)}>
                          {m.name} ({m.unit}) — {priceLabel}
                        </option>
                      );
                    })}
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
                <button onClick={addMaterialLine} disabled={!selMaterial}
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
                  <Plus size={12} /> Agregar
                </button>
              </div>
              {unifiedMaterials.length === 0 && (
                <p className="mb-3 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                  No hay materiales en tu catálogo maestro. Creá materiales en el panel <strong>Materiales Maestros</strong> antes de agregarlos aquí.
                </p>
              )}
              {draft.materials.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Sin materiales. Seleccioná uno arriba.</p>
              ) : (
                <div className="rounded-lg border border-slate-100 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-bold text-slate-500">Material</th>
                        <th className="px-3 py-2 text-center font-bold text-slate-500 w-12">Unid.</th>
                        <th className="px-3 py-2 text-center font-bold text-slate-500 w-20">Cantidad</th>
                        <th className="px-3 py-2 text-center font-bold text-slate-500 w-20">Desper.%</th>
                        <th className="px-3 py-2 text-right font-bold text-slate-500 w-24">Precio/u</th>
                        <th className="px-3 py-2 text-right font-bold text-slate-500 w-24">Subtotal</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.materials.map(m => {
                        const liveMat = m.masterMaterialId ? masterMaterialsMap[m.masterMaterialId] : undefined;
                        const livePrice = liveMat?.unitPrice;
                        const price = livePrice ?? m.lastKnownUnitPrice ?? 0;
                        const waste = 1 + (m.wastePercent ?? 0) / 100;
                        const sub = price * m.quantity * waste;

                        // Badge de fuente de precio
                        let sourceLabel: string;
                        let sourceCls: string;
                        if (price === 0) {
                          sourceLabel = 'Sin precio';
                          sourceCls = 'bg-red-100 text-red-600';
                        } else if (liveMat) {
                          if (liveMat.localOverride) {
                            sourceLabel = 'Editado localmente';
                            sourceCls = 'bg-green-100 text-green-700';
                          } else if (liveMat.globalSourceId || liveMat.globalResourceId) {
                            sourceLabel = 'Importado';
                            sourceCls = 'bg-blue-100 text-blue-700';
                          } else {
                            sourceLabel = 'Catálogo empresa';
                            sourceCls = 'bg-blue-100 text-blue-700';
                          }
                        } else {
                          sourceLabel = 'Snapshot';
                          sourceCls = 'bg-amber-100 text-amber-700';
                        }

                        return (
                          <tr key={m.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                            <td className="px-3 py-1.5 text-slate-800">
                              <div>{m.materialName}</div>
                              <span className={`inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded-full mt-0.5 ${sourceCls}`}>
                                {sourceLabel}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 text-center text-slate-500">{m.unit}</td>
                            <td className="px-3 py-1.5 text-center">
                              <input type="number" min="0" step="0.001"
                                value={m.quantity}
                                onChange={e => setDraft(d => ({ ...d, materials: d.materials.map(x => x.id === m.id ? { ...x, quantity: parseFloat(e.target.value) || 0 } : x) }))}
                                className="w-16 text-center border border-slate-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              <input type="number" min="0" step="0.5" max="100"
                                value={m.wastePercent ?? 0}
                                onChange={e => setDraft(d => ({ ...d, materials: d.materials.map(x => x.id === m.id ? { ...x, wastePercent: parseFloat(e.target.value) || 0 } : x) }))}
                                className="w-14 text-center border border-slate-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono">
                              {price === 0
                                ? <span className="flex items-center justify-end gap-1 text-red-500"><AlertTriangle size={10}/> $0,00</span>
                                : <span className="text-slate-600">${fmt(price)}</span>
                              }
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono font-bold text-slate-800">${fmt(sub)}</td>
                            <td className="px-3 py-1.5">
                              <button onClick={() => setDraft(d => ({ ...d, materials: d.materials.filter(x => x.id !== m.id) }))}
                                className="p-0.5 text-slate-300 hover:text-red-500 transition-colors">
                                <Trash2 size={12} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Mano de Obra ──────────────────────────────────────────── */}
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
                Mano de Obra
                <span className="ml-2 font-normal text-slate-400 normal-case">({MASTER_WORKDAY_HOURS}h/día · {draft.dailyYield} u/día)</span>
              </h4>
              <div className="flex gap-2 mb-3">
                <div className="relative flex-1">
                  <select value={selLabor} onChange={e => setSelLabor(e.target.value)}
                    className="w-full pl-3 pr-7 py-1.5 text-xs border border-slate-200 rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    <option value="">— Seleccionar categoría laboral —</option>
                    {laborCategories.map(lc => (
                      <option key={lc.id} value={lc.id}>{lc.role}</option>
                    ))}
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
                <button onClick={addLaborLine} disabled={!selLabor}
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
                  <Plus size={12} /> Agregar
                </button>
              </div>
              {laborCategories.length === 0 && (
                <p className="mb-3 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                  No hay categorías laborales configuradas. Creá categorías en <strong>Administración → Mano de Obra</strong> antes de asignarlas aquí.
                </p>
              )}
              {draft.labor.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Sin mano de obra asignada.</p>
              ) : (
                <div className="rounded-lg border border-slate-100 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-bold text-slate-500">Categoría</th>
                        <th className="px-3 py-2 text-center font-bold text-slate-500 w-24">Cant. (trab.)</th>
                        <th className="px-3 py-2 text-right font-bold text-slate-500 w-28">Costo/u tarea</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.labor.map(l => {
                        const cat = laborCategoriesMap[l.laborCategoryId];
                        const rate = cat
                          ? (cat.basicHourlyRate || 0) * (1 + ((cat.socialChargesPercent || 0) + (cat.insurancePercent || 0)) / 100)
                          : 0;
                        const yieldOk = (draft.dailyYield || 0) > 0;
                        const costPerUnit = yieldOk ? (rate * MASTER_WORKDAY_HOURS * l.quantity) / draft.dailyYield : 0;
                        const hasNoCat = !cat;
                        const hasZeroRate = !!cat && (cat.basicHourlyRate || 0) === 0;
                        return (
                          <tr key={l.id} className={`border-t border-slate-50 hover:bg-slate-50/50 ${hasNoCat ? 'bg-red-50/40' : hasZeroRate ? 'bg-amber-50/40' : ''}`}>
                            <td className="px-3 py-1.5 text-slate-800">
                              <div>{l.laborCategoryName}</div>
                              {hasNoCat && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full mt-0.5 bg-red-100 text-red-600">
                                  <AlertTriangle size={8}/> Cat. no encontrada en proyecto
                                </span>
                              )}
                              {hasZeroRate && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full mt-0.5 bg-amber-100 text-amber-700">
                                  <AlertTriangle size={8}/> Sin tarifa horaria
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              <input type="number" min="0.1" step="0.1"
                                value={l.quantity}
                                onChange={e => setDraft(d => ({ ...d, labor: d.labor.map(x => x.id === l.id ? { ...x, quantity: parseFloat(e.target.value) || 0 } : x) }))}
                                className="w-16 text-center border border-slate-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono font-bold">
                              {hasNoCat
                                ? <span className="text-red-500 text-[10px] flex items-center justify-end gap-1"><AlertTriangle size={10}/> $0,00</span>
                                : hasZeroRate
                                  ? <span className="text-amber-600 text-[10px] flex items-center justify-end gap-1"><AlertTriangle size={10}/> Sin tarifa</span>
                                  : <span className="text-slate-800">${fmt(costPerUnit)}</span>
                              }
                            </td>
                            <td className="px-3 py-1.5">
                              <button onClick={() => setDraft(d => ({ ...d, labor: d.labor.filter(x => x.id !== l.id) }))}
                                className="p-0.5 text-slate-300 hover:text-red-500 transition-colors">
                                <Trash2 size={12} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Equipos ───────────────────────────────────────────────── */}
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Equipos</h4>
              <div className="flex gap-2 mb-3">
                <div className="relative flex-1">
                  <select value={selEquipment} onChange={e => setSelEquipment(e.target.value)}
                    className="w-full pl-3 pr-7 py-1.5 text-xs border border-slate-200 rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    <option value="">— Seleccionar equipo —</option>
                    {tools.map(t => (
                      <option key={t.id} value={t.id}>{t.name} (${fmt(t.costPerHour)}/h)</option>
                    ))}
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
                <button onClick={addEquipmentLine} disabled={!selEquipment}
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
                  <Plus size={12} /> Agregar
                </button>
              </div>
              {tools.length === 0 && (
                <p className="mb-3 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                  No hay equipos configurados. Creá equipos en <strong>Administración → Equipos</strong> antes de asignarlos aquí.
                </p>
              )}
              {draft.equipment.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Sin equipos asignados.</p>
              ) : (
                <div className="rounded-lg border border-slate-100 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-bold text-slate-500">Equipo</th>
                        <th className="px-3 py-2 text-center font-bold text-slate-500 w-20">h/u tarea</th>
                        <th className="px-3 py-2 text-right font-bold text-slate-500 w-24">$/h</th>
                        <th className="px-3 py-2 text-right font-bold text-slate-500 w-24">Subtotal/u</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.equipment.map(e => {
                        const tool = toolsMap[e.toolId];
                        const sub = (tool?.costPerHour || 0) * e.hoursPerUnit;
                        return (
                          <tr key={e.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                            <td className="px-3 py-1.5 text-slate-800">{e.toolName}</td>
                            <td className="px-3 py-1.5 text-center">
                              <input type="number" min="0" step="0.05"
                                value={e.hoursPerUnit}
                                onChange={ev => setDraft(d => ({ ...d, equipment: d.equipment.map(x => x.id === e.id ? { ...x, hoursPerUnit: parseFloat(ev.target.value) || 0 } : x) }))}
                                className="w-14 text-center border border-slate-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono text-slate-600">${fmt(tool?.costPerHour ?? 0)}</td>
                            <td className="px-3 py-1.5 text-right font-mono font-bold text-slate-800">${fmt(sub)}</td>
                            <td className="px-3 py-1.5">
                              <button onClick={() => setDraft(d => ({ ...d, equipment: d.equipment.filter(x => x.id !== e.id) }))}
                                className="p-0.5 text-slate-300 hover:text-red-500 transition-colors">
                                <Trash2 size={12} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Barra de costo vivo ───────────────────────────────────── */}
            <div className="rounded-xl bg-slate-900 text-white p-4">
              <div className="flex flex-wrap gap-6 items-center justify-between">
                <div className="flex flex-wrap gap-6 text-xs">
                  <div>
                    <div className="text-slate-400 mb-0.5">Materiales</div>
                    <div className="font-mono font-bold">${fmt(liveCost.materialCost)}</div>
                  </div>
                  <div>
                    <div className="text-slate-400 mb-0.5">Mano de Obra</div>
                    <div className="font-mono font-bold">${fmt(liveCost.laborCost)}</div>
                  </div>
                  <div>
                    <div className="text-slate-400 mb-0.5">Equipos</div>
                    <div className="font-mono font-bold">${fmt(liveCost.equipmentCost)}</div>
                  </div>
                  {liveCost.fixedCost > 0 && (
                    <div>
                      <div className="text-slate-400 mb-0.5">Fijo</div>
                      <div className="font-mono font-bold">${fmt(liveCost.fixedCost)}</div>
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-slate-400 text-xs mb-0.5">COSTO UNITARIO TOTAL</div>
                  <div className="text-2xl font-black font-mono">
                    ${fmt(liveCost.totalUnitCost)}
                    <span className="text-slate-400 text-sm font-normal ml-1">/{draft.unit || 'u'}</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Importar catálogo global */}
      {showImportModal && (
        <CatalogImportModal
          organizationId={orgId}
          globalTasks={globalTasks}
          onClose={() => setShowImportModal(false)}
          onSuccess={async () => { setShowImportModal(false); await refetch(); setFilterCat('ALL'); setSearch(''); setCatalog('private'); }}
        />
      )}

      {/* APU Technical Report Drawer */}
      {reportTask && (
        <APUTechnicalReportDrawer
          masterTaskId={reportTask.id}
          taskName={reportTask.name}
          taskCode={reportTask.code}
          taskUnit={reportTask.unit}
          organizationId={orgId}
          onClose={() => setReportTask(null)}
        />
      )}
    </div>
  );
};
