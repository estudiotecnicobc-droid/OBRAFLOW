import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Search, Plus, Trash2, RefreshCcw, Download, Package, X, AlertTriangle, CheckCircle2, BookPlus, Loader2, Layers, ChevronDown } from 'lucide-react';
import { CHANDIAS_CATALOG, ChandiasTask } from './catalog/chandiasCatalog';
import {
  calculateTask, consolidateMaterials, getCategories,
  mapMaterialToReal, consolidateResolved, convertToCommercial,
  ChandiasAddedItem, ManualMaterial, OrgMaterialLookup, ResolvedMaterial,
  WallOpening, computeNetWallArea,
  FloorSector, computeNetFloorArea,
} from './engine/chandias';
import { generateId } from '../../../utils/generateId';
import { useAuth } from '../../../context/AuthContext';
import { useERP } from '../../../context/ERPContext';
import { useMasterTasks } from '../../../hooks/useMasterTasks';
import { useUnifiedMaterials } from '../../../hooks/useUnifiedMaterials';
import { masterTasksService, MasterTaskInput } from '../../../services/masterTasksSupabaseService';
import { MasterTaskMaterial } from '../../../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtNum = (n: number, dec = 3) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: dec });

const fmtCost = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Mezcla los materiales manuales de cada ítem dentro de `materiales` antes de
 * pasarlos al motor de consolidación. No muta el estado original.
 */
function withManualMerged(items: ChandiasAddedItem[]): ChandiasAddedItem[] {
  return items.map(item => {
    const manual = item.manualMaterials;
    if (!manual?.length) return item;
    return {
      ...item,
      materiales: [
        ...item.materiales,
        ...manual.map(m => ({ nombre: m.nombre, unit: m.unit, coef: 0, cantidad: m.cantidad })),
      ],
    };
  });
}

const CATEGORY_COLORS: Record<string, string> = {
  'Movimiento de Suelos': 'bg-amber-100 text-amber-700',
  'Hormigones':           'bg-blue-100 text-blue-700',
  'Mampostería':          'bg-orange-100 text-orange-700',
  'Revoques':             'bg-yellow-100 text-yellow-700',
  'Contrapisos y Pisos':  'bg-emerald-100 text-emerald-700',
  'Revestimientos':       'bg-teal-100 text-teal-700',
  'Cubiertas':            'bg-sky-100 text-sky-700',
  'Aislaciones':          'bg-violet-100 text-violet-700',
  'Cielorrasos':          'bg-pink-100 text-pink-700',
  'Pinturas':             'bg-rose-100 text-rose-700',
  'Instalaciones':        'bg-indigo-100 text-indigo-700',
};
const catColor = (cat: string) => CATEGORY_COLORS[cat] ?? 'bg-slate-100 text-slate-600';

// ─── Helper: convierte un rubro Chandías en MasterTaskMaterial[] ──────────────
// Usa el coef como cantidad por unidad de tarea (rendimiento unitario).
// Resuelve precio y unidad comercial desde los materiales de la org.

function buildAPUMaterials(
  task: ChandiasTask,
  orgMaterials: OrgMaterialLookup[],
): MasterTaskMaterial[] {
  return task.materiales.map(m => {
    const resolved = mapMaterialToReal(
      { nombre: m.nombre, unit: m.unit, coef: m.coef, cantidad: m.coef, code: m.code },
      orgMaterials,
    );
    return {
      id: generateId(),
      materialName:       m.nombre,
      unit:               m.unit,
      quantity:           m.coef,
      lastKnownUnitPrice: resolved.unitCost > 0 ? resolved.unitCost : undefined,
      conversionFactor:   resolved.conversionFactor,
      commercialUnit:     resolved.commercialUnit,
    };
  });
}

// ─── Modal: Crear APU desde ítem Chandías ────────────────────────────────────

interface CreateAPUModalProps {
  item:           ChandiasAddedItem;
  orgMaterials:   OrgMaterialLookup[];
  existingNames:  Set<string>;
  organizationId: string;
  onClose:        () => void;
  onCreated:      (taskName: string) => void;
}

const CreateAPUModal: React.FC<CreateAPUModalProps> = ({
  item, orgMaterials, existingNames, organizationId, onClose, onCreated,
}) => {
  const catalogTask = CHANDIAS_CATALOG.find(t => t.id === item.taskId)!;
  const [name,       setName]       = useState(item.taskNombre);
  const [code,       setCode]       = useState('');
  const [dailyYield, setDailyYield] = useState('1');
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [success,    setSuccess]    = useState(false);

  const isDuplicate = existingNames.has(name.trim().toLowerCase());
  const yieldNum    = parseFloat(dailyYield) || 0;
  const canSubmit   = name.trim().length > 0 && yieldNum > 0 && !saving;

  // Preview de materiales (memo — solo varía si name/orgMaterials cambian)
  const materials = useMemo(() => buildAPUMaterials(catalogTask, orgMaterials), [catalogTask, orgMaterials]);

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    try {
      const input: MasterTaskInput = {
        name:        name.trim(),
        code:        code.trim() || undefined,
        unit:        item.unidad,
        category:    catalogTask.categoria,
        description: `Generado desde calculadora Chandías — rubro ${item.taskId}`,
        dailyYield:  yieldNum,
        materials,
        labor:     [],
        equipment: [],
      };
      await masterTasksService.create(organizationId, input);
      setSuccess(true);
      onCreated(name.trim());
    } catch (e: any) {
      setError(e?.message ?? 'Error al crear el APU');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 bg-blue-600 text-white shrink-0">
          <BookPlus size={18} />
          <div className="min-w-0">
            <p className="font-bold text-sm">Crear APU desde Chandías</p>
            <p className="text-xs text-blue-200 font-mono truncate">{item.taskId} · {item.unidad}</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 hover:bg-blue-700 rounded-lg shrink-0">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">

          {/* Nombre */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre del APU</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            {isDuplicate && (
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                <AlertTriangle size={11} /> Ya existe un APU con este nombre en tu base
              </p>
            )}
          </div>

          {/* Código + Rendimiento */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Código (opcional)</label>
              <input type="text" value={code} onChange={e => setCode(e.target.value)}
                placeholder="Ej: MAM-005"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Rendimiento diario</label>
              <div className="flex rounded-lg border border-slate-200 overflow-hidden focus-within:ring-1 focus-within:ring-blue-400">
                <input type="number" min="0.01" step="any" value={dailyYield}
                  onChange={e => setDailyYield(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm focus:outline-none min-w-0"
                />
                <span className="px-2 text-xs text-slate-400 bg-slate-50 flex items-center border-l border-slate-200 whitespace-nowrap">
                  {item.unidad}/día
                </span>
              </div>
            </div>
          </div>

          {/* Badges */}
          <div className="flex gap-2 flex-wrap">
            <span className="text-xs px-2 py-1 bg-slate-100 rounded-lg text-slate-600">
              Unidad: <strong>{item.unidad}</strong>
            </span>
            <span className={`text-xs px-2 py-1 rounded-lg ${catColor(catalogTask.categoria)}`}>
              {catalogTask.categoria}
            </span>
            <span className="text-xs px-2 py-1 bg-slate-100 rounded-lg text-slate-500">
              {materials.length} material{materials.length !== 1 ? 'es' : ''}
            </span>
          </div>

          {/* Preview materiales */}
          <div className="border border-slate-100 rounded-xl overflow-hidden">
            <p className="px-3 py-2 text-xs font-bold text-slate-600 bg-slate-50 border-b border-slate-100">
              Composición de materiales
            </p>
            <div className="max-h-44 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-slate-400 border-b border-slate-100 uppercase">
                    <th className="px-3 py-1.5 text-left">Material</th>
                    <th className="px-2 py-1.5 text-right">Coef.</th>
                    <th className="px-2 py-1.5 text-center">Und</th>
                    <th className="px-2 py-1.5 text-right">P. Unit.</th>
                  </tr>
                </thead>
                <tbody>
                  {materials.map((m, i) => (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-3 py-1.5 text-slate-700">{m.materialName}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-slate-600">{m.quantity}</td>
                      <td className="px-2 py-1.5 text-center text-slate-400">{m.unit}</td>
                      <td className="px-2 py-1.5 text-right">
                        {m.lastKnownUnitPrice
                          ? <span className="text-emerald-600 font-medium">${fmtCost(m.lastKnownUnitPrice)}</span>
                          : <span className="text-amber-400 text-[10px]">sin precio</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200">{error}</p>
          )}

          {/* Success */}
          {success && (
            <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-200">
              <CheckCircle2 size={14} className="shrink-0" />
              <span>APU <strong>{name.trim()}</strong> creado correctamente. Podés verlo en Base de Datos → APUs.</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
            {success ? 'Cerrar' : 'Cancelar'}
          </button>
          {!success && (
            <button onClick={handleCreate} disabled={!canSubmit}
              className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <BookPlus size={14} />}
              {saving ? 'Creando…' : 'Crear APU'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Sidebar ─────────────────────────────────────────────────────────────────

interface SidebarProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}
const Sidebar: React.FC<SidebarProps> = ({ selectedId, onSelect }) => {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return CHANDIAS_CATALOG;
    return CHANDIAS_CATALOG.filter(t =>
      t.nombre.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q) ||
      t.categoria.toLowerCase().includes(q),
    );
  }, [search]);

  const categories = useMemo(() => getCategories(filtered), [filtered]);
  const byCategory: Record<string, ChandiasTask[]> = {};
  for (const t of filtered) {
    if (!byCategory[t.categoria]) byCategory[t.categoria] = [];
    byCategory[t.categoria].push(t);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden border-r border-slate-100">
      <div className="p-2 border-b border-slate-100 shrink-0">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar rubro…"
            className="w-full pl-8 pr-7 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={12} />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {categories.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-8">Sin resultados</p>
        )}
        {categories.map(cat => (
          <div key={cat}>
            <p className="px-3 pt-3 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">{cat}</p>
            {byCategory[cat].map(t => (
              <button key={t.id} onClick={() => onSelect(t.id)}
                className={`w-full text-left px-3 py-2 border-l-2 transition-all text-xs
                  ${selectedId === t.id
                    ? 'border-blue-500 bg-blue-50 text-blue-800'
                    : 'border-transparent hover:bg-slate-50 hover:border-slate-200 text-slate-700'}`}
              >
                <span className="font-mono text-[10px] text-slate-400 mr-1">{t.id}</span>
                {t.nombre}
                <span className="float-right text-[10px] text-slate-400">{t.unidad}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="px-3 py-2 border-t border-slate-100 text-[10px] text-slate-400 shrink-0">
        {CHANDIAS_CATALOG.length} rubros · Metodología Chandías
      </div>
    </div>
  );
};

// ─── DetailPanel ──────────────────────────────────────────────────────────────

interface DetailPanelProps {
  task: ChandiasTask | null;
  orgMaterials: OrgMaterialLookup[];
  onAdd: (item: ChandiasAddedItem) => void;
}
const DetailPanel: React.FC<DetailPanelProps> = ({ task, orgMaterials, onAdd }) => {
  const [dimValues,   setDimValues]   = useState<Record<string, string>>({});
  const [description, setDescription] = useState('');

  // ── Materiales manuales ───────────────────────────────────────────────────
  const [manualMaterials, setManualMaterials] = useState<ManualMaterial[]>([]);
  const [addingMat,       setAddingMat]       = useState(false);
  const [matSearch,       setMatSearch]       = useState('');
  const [matSelected,     setMatSelected]     = useState<OrgMaterialLookup | null>(null);
  const [matQty,          setMatQty]          = useState('');
  const [matDropdown,     setMatDropdown]     = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Garantiza que el dropdown se abre cuando aparece el formulario,
  // independientemente de si autoFocus dispara onFocus o no.
  useEffect(() => {
    if (addingMat) {
      searchInputRef.current?.focus();
      setMatDropdown(true);
    }
  }, [addingMat]);

  // ── Configuración avanzada de muro (Mampostería / Revoques / Revestimientos) ─
  const [nWalls,       setNWalls]       = useState(1);
  const [openings,     setOpenings]     = useState<WallOpening[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ── Configuración avanzada de piso (Contrapisos y Pisos) ─────────────────
  const [nRooms,           setNRooms]           = useState(1);
  const [floorSectors,     setFloorSectors]     = useState<FloorSector[]>([]);
  const [showFloorAdvanced, setShowFloorAdvanced] = useState(false);

  const prevTaskId = React.useRef<string | null>(null);
  if (task && task.id !== prevTaskId.current) {
    const defaults: Record<string, string> = {};
    task.dims.forEach(d => { defaults[d.id] = ''; });
    setDimValues(defaults);
    setDescription('');
    setManualMaterials([]);
    setAddingMat(false);
    setMatSearch('');
    setMatSelected(null);
    setMatQty('');
    setMatDropdown(false);
    setNWalls(1);
    setOpenings([]);
    setShowAdvanced(false);
    setNRooms(1);
    setFloorSectors([]);
    setShowFloorAdvanced(false);
    prevTaskId.current = task.id;
  }

  const dims = useMemo(() => {
    if (!task) return {} as Record<string, number>;
    const r: Record<string, number> = {};
    task.dims.forEach(d => { r[d.id] = parseFloat(dimValues[d.id] || '0') || 0; });
    return r;
  }, [task, dimValues]);

  // Familias con config avanzada de superficies
  // isWallFamily: tarea con dims largo+alto — Mampostería, Revoques, Revestimientos (excl. zócalos lineales)
  const isWallFamily = (
    ['Mampostería', 'Revoques', 'Revestimientos'].includes(task?.categoria ?? '') &&
    (task?.dims.some(d => d.id === 'alto') ?? false)
  );
  const isFloorFamily = task?.categoria === 'Contrapisos y Pisos';

  const baseCalcResult = useMemo(
    () => task ? calculateTask(task, dims) : null,
    [task, dims],
  );

  const wallSurface = useMemo(() => {
    if (!isWallFamily) return null;
    return computeNetWallArea(dims.largo ?? 0, dims.alto ?? 0, { nWalls, openings });
  }, [isWallFamily, dims, nWalls, openings]);

  const floorSurface = useMemo(() => {
    if (!isFloorFamily) return null;
    return computeNetFloorArea(dims.largo ?? 0, dims.ancho ?? 0, { nRooms, sectors: floorSectors });
  }, [isFloorFamily, dims, nRooms, floorSectors]);

  /**
   * calcResult efectivo:
   *  - Familias de muro/revoque/revestimiento → superficie neta (largo×alto×N − aberturas)
   *  - Pisos → superficie total (largo×ancho×N + sectores)
   *  - Todo lo demás → igual que baseCalcResult (sin cambios).
   */
  const calcResult = useMemo(() => {
    if (!baseCalcResult) return null;
    const net = wallSurface?.neta ?? floorSurface?.total ?? null;
    if (net === null) return baseCalcResult;
    return {
      ...baseCalcResult,
      quantity: parseFloat(net.toFixed(4)),
      materiales: baseCalcResult.materiales.map(m => ({
        ...m,
        cantidad: parseFloat((m.coef * net).toFixed(4)),
      })),
    };
  }, [baseCalcResult, wallSurface, floorSurface]);

  // Materiales automáticos con precios resueltos
  const resolvedMaterials = useMemo((): ResolvedMaterial[] => {
    if (!calcResult || !task) return [];
    return calcResult.materiales.map((m, i) =>
      mapMaterialToReal({ ...m, code: task.materiales[i]?.code }, orgMaterials),
    );
  }, [calcResult, task, orgMaterials]);

  // Materiales manuales con precios resueltos (misma lógica técnica/comercial)
  const resolvedManual = useMemo((): ResolvedMaterial[] =>
    manualMaterials.map(m =>
      mapMaterialToReal(
        { nombre: m.nombre, unit: m.unit, coef: 0, cantidad: m.cantidad, code: m.code },
        orgMaterials,
      ),
    ),
    [manualMaterials, orgMaterials],
  );

  // Sugerencias para el selector de material (filtradas por búsqueda)
  const matSuggestions = useMemo(() => {
    const q = matSearch.trim().toLowerCase();
    if (!q) return orgMaterials.slice(0, 8);
    return orgMaterials.filter(m => m.name.toLowerCase().includes(q)).slice(0, 8);
  }, [matSearch, orgMaterials]);

  const allFilled      = task?.dims.every(d => (parseFloat(dimValues[d.id] || '0') || 0) > 0) ?? false;
  const quantity       = calcResult?.quantity ?? 0;
  const missingAuto    = resolvedMaterials.filter(m => m.matchedBy === 'missing').length;
  const missingManual  = resolvedManual.filter(m => m.matchedBy === 'missing').length;
  const missingAll     = missingAuto + missingManual;
  const totalAutoCost  = resolvedMaterials.reduce((s, m) => s + m.totalCost, 0);
  const totalManCost   = resolvedManual.reduce((s, m) => s + m.totalCost, 0);
  const totalAllCost   = totalAutoCost + totalManCost;
  const totalCount     = (task?.materiales.length ?? 0) + manualMaterials.length;

  const handleAdd = useCallback(() => {
    if (!calcResult || !task || quantity <= 0) return;
    onAdd({ ...calcResult, itemId: generateId(), description, manualMaterials });
  }, [calcResult, task, quantity, description, onAdd, manualMaterials]);

  const handleAddManual = useCallback(() => {
    if (!matSelected || parseFloat(matQty) <= 0) return;
    setManualMaterials(prev => [...prev, {
      id: generateId(),
      nombre: matSelected.name,
      unit: matSelected.unit ?? '',
      cantidad: parseFloat(matQty),
      code: matSelected.code,
    }]);
    setAddingMat(false);
    setMatSearch('');
    setMatSelected(null);
    setMatQty('');
    setMatDropdown(false);
  }, [matSelected, matQty]);

  const removeManual = useCallback((id: string) => {
    setManualMaterials(prev => prev.filter(m => m.id !== id));
  }, []);

  // ── Handlers de aberturas ─────────────────────────────────────────────────
  const addOpening = useCallback(() => {
    setOpenings(prev => [...prev, { id: generateId(), tipo: 'Ventana', ancho: 0, alto: 0, cantidad: 1 }]);
    setShowAdvanced(true);
  }, []);

  const removeOpening = useCallback((id: string) => {
    setOpenings(prev => prev.filter(o => o.id !== id));
  }, []);

  const updateOpening = useCallback((
    id: string,
    field: keyof Omit<WallOpening, 'id'>,
    value: string | number,
  ) => {
    setOpenings(prev => prev.map(o => o.id === id ? { ...o, [field]: value } : o));
  }, []);

  // ── Handlers de sectores de piso ──────────────────────────────────────────
  const addFloorSector = useCallback(() => {
    setFloorSectors(prev => [...prev, { id: generateId(), largo: 0, ancho: 0 }]);
    setShowFloorAdvanced(true);
  }, []);

  const removeFloorSector = useCallback((id: string) => {
    setFloorSectors(prev => prev.filter(s => s.id !== id));
  }, []);

  const updateFloorSector = useCallback((id: string, field: 'largo' | 'ancho', value: number) => {
    setFloorSectors(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  }, []);

  if (!task) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400">
        <div className="text-center">
          <Package size={48} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">Seleccioná un rubro de la lista</p>
          <p className="text-xs mt-1">Los inputs se generan automáticamente</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">

      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100">
          <span className="font-mono text-xs text-slate-400">{task.id}</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${catColor(task.categoria)}`}>
            {task.categoria}
          </span>
          <span className="ml-auto text-xs text-slate-500">{task.unidad}</span>
        </div>
        <div className="px-4 py-3">
          <h2 className="font-bold text-slate-800">{task.nombre}</h2>
          <p className="text-xs text-slate-500 mt-0.5 italic">{task.descripcion}</p>

          {/* Inputs dinámicos */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
            {task.dims.map(dim => (
              <div key={dim.id}>
                <label className="block text-xs font-semibold text-slate-500 mb-1">{dim.label}</label>
                <div className="flex rounded-lg border border-slate-200 overflow-hidden focus-within:ring-1 focus-within:ring-blue-400 focus-within:border-blue-400">
                  <input
                    type="number" min="0" step="any"
                    value={dimValues[dim.id] ?? ''}
                    onChange={e => setDimValues(prev => ({ ...prev, [dim.id]: e.target.value }))}
                    placeholder="0"
                    className="flex-1 px-3 py-2 text-sm bg-white focus:outline-none min-w-0"
                  />
                  <span className="px-2.5 text-xs text-slate-400 bg-slate-50 flex items-center border-l border-slate-200 whitespace-nowrap">
                    {dim.unit}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* ── Configuración avanzada de muro / paño (Mampostería · Revoques · Revestimientos) ── */}
          {isWallFamily && (() => {
            const isMam = task.categoria === 'Mampostería';
            const wallLabel  = isMam ? 'Configuración de muro'  : 'Configuración de paño';
            const nWallLabel = isMam ? 'Muros iguales' : 'Paños iguales';
            return (
              <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <Layers size={13} />
                    {wallLabel}
                    {(nWalls > 1 || openings.length > 0) && (
                      <span className="px-1.5 py-0.5 text-[9px] font-bold bg-orange-100 text-orange-600 rounded-full">
                        {[
                          nWalls > 1 && `×${nWalls} ${isMam ? 'muros' : 'paños'}`,
                          openings.length > 0 && `−${openings.length} abertura${openings.length !== 1 ? 's' : ''}`,
                        ].filter(Boolean).join(' ')}
                      </span>
                    )}
                  </span>
                  <ChevronDown
                    size={13}
                    className={`text-slate-400 transition-transform duration-150 ${showAdvanced ? 'rotate-180' : ''}`}
                  />
                </button>

                {showAdvanced && (
                  <div className="px-3 pt-3 pb-3 space-y-4 border-t border-slate-100">
                    <div className="flex items-center gap-3">
                      <label className="text-xs font-semibold text-slate-500 min-w-[110px]">
                        {nWallLabel}
                      </label>
                      <div className="flex rounded-lg border border-slate-200 overflow-hidden focus-within:ring-1 focus-within:ring-blue-400 w-28">
                        <input
                          type="number" min="1" step="1"
                          value={nWalls}
                          onChange={e => setNWalls(Math.max(1, parseInt(e.target.value) || 1))}
                          className="flex-1 px-3 py-1.5 text-sm bg-white focus:outline-none min-w-0"
                        />
                        <span className="px-2 text-xs text-slate-400 bg-slate-50 flex items-center border-l border-slate-200 whitespace-nowrap">
                          un
                        </span>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-2">Aberturas / descuentos</p>
                      {openings.length > 0 && (
                        <div className="space-y-1.5 mb-2">
                          <div className="grid grid-cols-[1fr_58px_58px_44px_20px] gap-1.5 text-[10px] font-semibold text-slate-400 uppercase px-0.5">
                            <span>Tipo</span>
                            <span className="text-center">Ancho m</span>
                            <span className="text-center">Alto m</span>
                            <span className="text-center">Cant.</span>
                            <span />
                          </div>
                          {openings.map(o => (
                            <div key={o.id} className="grid grid-cols-[1fr_58px_58px_44px_20px] gap-1.5 items-center">
                              <select
                                value={o.tipo}
                                onChange={e => updateOpening(o.id, 'tipo', e.target.value)}
                                className="px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                              >
                                <option>Ventana</option>
                                <option>Puerta</option>
                                <option>Otro</option>
                              </select>
                              <input
                                type="number" min="0.01" step="any"
                                value={o.ancho || ''}
                                onChange={e => updateOpening(o.id, 'ancho', parseFloat(e.target.value) || 0)}
                                placeholder="0.00"
                                className="px-1.5 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 text-center"
                              />
                              <input
                                type="number" min="0.01" step="any"
                                value={o.alto || ''}
                                onChange={e => updateOpening(o.id, 'alto', parseFloat(e.target.value) || 0)}
                                placeholder="0.00"
                                className="px-1.5 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 text-center"
                              />
                              <input
                                type="number" min="1" step="1"
                                value={o.cantidad}
                                onChange={e => updateOpening(o.id, 'cantidad', parseInt(e.target.value) || 1)}
                                className="px-1.5 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 text-center"
                              />
                              <button
                                onClick={() => removeOpening(o.id)}
                                className="flex items-center justify-center text-slate-300 hover:text-red-500 transition-colors"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={addOpening}
                        className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-blue-600 transition-colors"
                      >
                        <Plus size={12} /> Agregar abertura
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Configuración avanzada de piso (Contrapisos y Pisos) ──────────── */}
          {isFloorFamily && (
            <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowFloorAdvanced(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <Layers size={13} />
                  Configuración de piso
                  {(nRooms > 1 || floorSectors.length > 0) && (
                    <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-600 rounded-full">
                      {[
                        nRooms > 1 && `×${nRooms} amb.`,
                        floorSectors.length > 0 && `+${floorSectors.length} sector${floorSectors.length !== 1 ? 'es' : ''}`,
                      ].filter(Boolean).join(' ')}
                    </span>
                  )}
                </span>
                <ChevronDown
                  size={13}
                  className={`text-slate-400 transition-transform duration-150 ${showFloorAdvanced ? 'rotate-180' : ''}`}
                />
              </button>

              {showFloorAdvanced && (
                <div className="px-3 pt-3 pb-3 space-y-4 border-t border-slate-100">
                  {/* Ambientes iguales */}
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-semibold text-slate-500 min-w-[130px]">
                      Ambientes iguales
                    </label>
                    <div className="flex rounded-lg border border-slate-200 overflow-hidden focus-within:ring-1 focus-within:ring-blue-400 w-28">
                      <input
                        type="number" min="1" step="1"
                        value={nRooms}
                        onChange={e => setNRooms(Math.max(1, parseInt(e.target.value) || 1))}
                        className="flex-1 px-3 py-1.5 text-sm bg-white focus:outline-none min-w-0"
                      />
                      <span className="px-2 text-xs text-slate-400 bg-slate-50 flex items-center border-l border-slate-200 whitespace-nowrap">
                        un
                      </span>
                    </div>
                  </div>

                  {/* Sectores adicionales */}
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-2">Sectores adicionales</p>
                    {floorSectors.length > 0 && (
                      <div className="space-y-1.5 mb-2">
                        <div className="grid grid-cols-[1fr_1fr_20px] gap-1.5 text-[10px] font-semibold text-slate-400 uppercase px-0.5">
                          <span>Largo m</span>
                          <span>Ancho m</span>
                          <span />
                        </div>
                        {floorSectors.map(s => (
                          <div key={s.id} className="grid grid-cols-[1fr_1fr_20px] gap-1.5 items-center">
                            <input
                              type="number" min="0.01" step="any"
                              value={s.largo || ''}
                              onChange={e => updateFloorSector(s.id, 'largo', parseFloat(e.target.value) || 0)}
                              placeholder="0.00"
                              className="px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                            <input
                              type="number" min="0.01" step="any"
                              value={s.ancho || ''}
                              onChange={e => updateFloorSector(s.id, 'ancho', parseFloat(e.target.value) || 0)}
                              placeholder="0.00"
                              className="px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                            <button
                              onClick={() => removeFloorSector(s.id)}
                              className="flex items-center justify-center text-slate-300 hover:text-red-500 transition-colors"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={addFloorSector}
                      className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-blue-600 transition-colors"
                    >
                      <Plus size={12} /> Agregar sector
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Cantidad / Superficie calculada ─────────────────────────────── */}
          {isWallFamily && wallSurface && (nWalls > 1 || openings.length > 0) ? (
            <div className="mt-4 px-4 py-3 bg-blue-50 border border-blue-100 rounded-lg space-y-1">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Superficie bruta</span>
                <span className="font-mono">
                  {fmtNum(wallSurface.bruta, 2)} m²
                  {nWalls > 1 && (
                    <span className="text-slate-400 ml-1.5">
                      ({fmtNum(dims.largo ?? 0, 2)} × {fmtNum(dims.alto ?? 0, 2)} × {nWalls})
                    </span>
                  )}
                </span>
              </div>
              {openings.length > 0 && (
                <div className="flex justify-between text-xs text-red-500">
                  <span>Descuentos ({openings.length} abertura{openings.length !== 1 ? 's' : ''})</span>
                  <span className="font-mono">−{fmtNum(wallSurface.descontada, 2)} m²</span>
                </div>
              )}
              {wallSurface.descontada > wallSurface.bruta && (
                <div className="flex items-center gap-1 text-[10px] text-amber-600 mt-0.5">
                  <AlertTriangle size={11} />
                  Los descuentos superan la superficie bruta — se computa 0 m²
                </div>
              )}
              <div className="flex items-baseline justify-between pt-1.5 border-t border-blue-200">
                <span className="text-sm text-slate-600">Superficie neta:</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold text-blue-700">{fmtNum(quantity)}</span>
                  <span className="text-sm text-slate-500">m²</span>
                </div>
              </div>
            </div>
          ) : isFloorFamily && floorSurface && (nRooms > 1 || floorSectors.length > 0) ? (
            <div className="mt-4 px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-lg space-y-1">
              {nRooms > 1 && (
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Ambientes iguales ({nRooms})</span>
                  <span className="font-mono">
                    {fmtNum(floorSurface.base, 2)} m²
                    <span className="text-slate-400 ml-1.5">
                      ({fmtNum(dims.largo ?? 0, 2)} × {fmtNum(dims.ancho ?? 0, 2)} × {nRooms})
                    </span>
                  </span>
                </div>
              )}
              {floorSectors.length > 0 && (
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Sectores adicionales ({floorSectors.length})</span>
                  <span className="font-mono">+{fmtNum(floorSurface.sectoresTotal, 2)} m²</span>
                </div>
              )}
              <div className="flex items-baseline justify-between pt-1.5 border-t border-emerald-200">
                <span className="text-sm text-slate-600">Superficie total:</span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold text-emerald-700">{fmtNum(quantity)}</span>
                  <span className="text-sm text-slate-500">m²</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex items-center justify-between px-4 py-3 bg-blue-50 border border-blue-100 rounded-lg">
              <span className="text-sm text-slate-600">Cantidad calculada:</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-blue-700">{fmtNum(quantity)}</span>
                <span className="text-sm text-slate-500">{task.unidad}</span>
              </div>
            </div>
          )}

          <input type="text" value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Descripción / ubicación (opcional)"
            className="mt-3 w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <button onClick={handleAdd} disabled={!allFilled || quantity <= 0}
            className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={15} /> Agregar al presupuesto
          </button>
        </div>
      </div>

      {/* Tabla de composición (automáticos + manuales) */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100 flex-wrap">
          <h3 className="text-sm font-bold text-slate-700">Composición de materiales</h3>
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
            {totalCount} {totalCount === 1 ? 'material' : 'materiales'}
          </span>
          {missingAll > 0 && (
            <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 ml-auto">
              <AlertTriangle size={11} /> {missingAll} sin precio
            </span>
          )}
          {quantity > 0 && missingAll === 0 && totalCount > 0 && (
            <span className="ml-auto text-xs font-bold text-slate-700">
              Subtotal: ${fmtCost(totalAllCost)}
            </span>
          )}
        </div>

        {totalCount === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6 italic">Sin materiales definidos</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-500 uppercase tracking-wide text-[10px]">
                <th className="px-4 py-2.5 text-left">Material</th>
                <th className="px-3 py-2.5 text-center">Und</th>
                <th className="px-3 py-2.5 text-right">Coef.</th>
                <th className="px-3 py-2.5 text-right">Cant. técnica</th>
                <th className="px-3 py-2.5 text-right">Compra</th>
                <th className="px-3 py-2.5 text-right">P. Unit.</th>
                <th className="px-3 py-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody>

              {/* ── Materiales del catálogo (automáticos) ──────────────────── */}
              {resolvedMaterials.map((m, i) => (
                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {m.matchedBy === 'missing'
                        ? <AlertTriangle size={11} className="text-amber-500 shrink-0" title="No encontrado en tu base de materiales" />
                        : <CheckCircle2 size={11} className="text-emerald-500 shrink-0" title={`Coincidencia por ${m.matchedBy}`} />
                      }
                      <span className={`font-medium ${m.matchedBy === 'missing' ? 'text-slate-500' : 'text-slate-800'}`}>
                        {m.nombre}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center text-slate-500 font-mono">{m.unit}</td>
                  <td className="px-3 py-2.5 text-right text-slate-400">{m.coef}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-slate-700">
                    {quantity > 0 ? fmtNum(m.cantidad) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {quantity > 0 && m.purchaseQty !== undefined
                      ? (
                        <span className="inline-flex flex-col items-end leading-tight">
                          <span className="font-bold text-slate-800">{m.purchaseQty}</span>
                          <span className="text-[10px] text-slate-400">{m.commercialUnit}</span>
                        </span>
                      )
                      : <span className="text-slate-300">—</span>
                    }
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {m.matchedBy === 'missing'
                      ? <span className="text-amber-500 text-[10px]">sin precio</span>
                      : <span className="text-slate-600">${fmtCost(m.unitCost)}</span>
                    }
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold">
                    {quantity > 0 && m.matchedBy !== 'missing'
                      ? <span className="text-slate-800">${fmtCost(m.totalCost)}</span>
                      : <span className="text-slate-300">—</span>
                    }
                  </td>
                </tr>
              ))}

              {/* ── Materiales ingresados manualmente ──────────────────────── */}
              {manualMaterials.length > 0 && (
                <>
                  <tr className="bg-violet-50/60">
                    <td colSpan={7} className="px-4 py-1 text-[10px] font-bold text-violet-500 uppercase tracking-wider select-none">
                      Adicionales manuales
                    </td>
                  </tr>
                  {resolvedManual.map((m, i) => (
                    <tr key={manualMaterials[i].id} className="border-b border-violet-50 hover:bg-violet-50/50">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="shrink-0 px-1 py-0.5 text-[9px] font-bold bg-violet-100 text-violet-600 rounded leading-none">M</span>
                          {m.matchedBy === 'missing'
                            ? <AlertTriangle size={11} className="text-amber-500 shrink-0" />
                            : <CheckCircle2 size={11} className="text-emerald-500 shrink-0" />
                          }
                          <span className={`font-medium ${m.matchedBy === 'missing' ? 'text-slate-500' : 'text-slate-800'}`}>
                            {m.nombre}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center text-slate-500 font-mono">{m.unit}</td>
                      <td className="px-3 py-2.5 text-right text-slate-300 select-none">—</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-700">{fmtNum(m.cantidad)}</td>
                      <td className="px-3 py-2.5 text-right">
                        {m.purchaseQty !== undefined
                          ? (
                            <span className="inline-flex flex-col items-end leading-tight">
                              <span className="font-bold text-slate-800">{m.purchaseQty}</span>
                              <span className="text-[10px] text-slate-400">{m.commercialUnit}</span>
                            </span>
                          )
                          : <span className="text-slate-300">—</span>
                        }
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {m.matchedBy === 'missing'
                          ? <span className="text-amber-500 text-[10px]">sin precio</span>
                          : <span className="text-slate-600">${fmtCost(m.unitCost)}</span>
                        }
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {m.matchedBy !== 'missing' && (
                            <span className="font-semibold text-slate-800">${fmtCost(m.totalCost)}</span>
                          )}
                          <button
                            onClick={() => removeManual(manualMaterials[i].id)}
                            className="shrink-0 p-0.5 text-slate-300 hover:text-red-500 transition-colors"
                            title="Quitar material"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        )}

        {/* ── Formulario inline: agregar material ────────────────────────────── */}
        <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/50">
          {!addingMat ? (
            <button
              onClick={() => setAddingMat(true)}
              className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-blue-600 transition-colors py-0.5"
            >
              <Plus size={12} /> Agregar material
            </button>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              {/* Selector con búsqueda */}
              <div className="relative min-w-[180px] flex-1">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={matSearch}
                  onChange={e => { setMatSearch(e.target.value); setMatSelected(null); setMatDropdown(true); }}
                  onFocus={() => setMatDropdown(true)}
                  onBlur={() => setTimeout(() => setMatDropdown(false), 150)}
                  placeholder="Buscar material…"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                {matDropdown && matSuggestions.length > 0 && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-0.5 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {matSuggestions.map(m => (
                      <button
                        key={m.name}
                        onMouseDown={e => { e.preventDefault(); setMatSelected(m); setMatSearch(m.name); setMatDropdown(false); }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 flex justify-between gap-2 border-b border-slate-50 last:border-0"
                      >
                        <span className="truncate font-medium text-slate-800">{m.name}</span>
                        <span className="text-slate-400 whitespace-nowrap shrink-0">
                          {m.unit && <>{m.unit} · </>}
                          {m.cost > 0
                            ? <span className="text-emerald-600">${fmtCost(m.cost)}</span>
                            : <span className="text-amber-500">sin precio</span>
                          }
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Cantidad */}
              <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden focus-within:ring-1 focus-within:ring-blue-400 shrink-0">
                <input
                  type="number" min="0.001" step="any"
                  value={matQty}
                  onChange={e => setMatQty(e.target.value)}
                  placeholder="Cantidad"
                  className="w-24 px-2.5 py-1.5 text-xs focus:outline-none"
                />
                {matSelected?.unit && (
                  <span className="px-2 py-1.5 text-xs text-slate-400 bg-slate-50 border-l border-slate-200 whitespace-nowrap">
                    {matSelected.unit}
                  </span>
                )}
              </div>

              {/* Confirmar */}
              <button
                onClick={handleAddManual}
                disabled={!matSelected || !matQty || parseFloat(matQty) <= 0}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                <Plus size={12} /> Agregar
              </button>

              {/* Cancelar */}
              <button
                onClick={() => { setAddingMat(false); setMatSearch(''); setMatSelected(null); setMatQty(''); setMatDropdown(false); }}
                className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors shrink-0"
              >
                <X size={13} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── RightPanel ───────────────────────────────────────────────────────────────

type RightTab = 'items' | 'totales';

interface RightPanelProps {
  items:          ChandiasAddedItem[];
  orgMaterials:   OrgMaterialLookup[];
  organizationId: string;
  existingNames:  Set<string>;
  onRemove:       (itemId: string) => void;
  onClear:        () => void;
  onExportCSV:    () => void;
}
const RightPanel: React.FC<RightPanelProps> = ({
  items, orgMaterials, organizationId, existingNames,
  onRemove, onClear, onExportCSV,
}) => {
  const [tab,        setTab]        = useState<RightTab>('items');
  const [apuItem,    setApuItem]    = useState<ChandiasAddedItem | null>(null);
  const [apuSuccess, setApuSuccess] = useState<string | null>(null);

  const resolved = useMemo(
    () => consolidateResolved(withManualMerged(items), orgMaterials),
    [items, orgMaterials],
  );
  const missingCount = resolved.filter(m => m.matchedBy === 'missing').length;
  const grandTotal   = resolved.reduce((s, m) => s + m.totalCost, 0);

  return (
    <div className="flex flex-col h-full overflow-hidden border-l border-slate-100">
      {/* Tabs */}
      <div className="flex border-b border-slate-100 shrink-0">
        {(['items', 'totales'] as RightTab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              tab === t ? 'border-blue-500 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            {t === 'items' ? `Rubros (${items.length})` : `Materiales (${resolved.length})`}
          </button>
        ))}
      </div>

      {/* Warning de faltantes (global) */}
      {tab === 'totales' && missingCount > 0 && items.length > 0 && (
        <div className="mx-2 mt-2 flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-700 shrink-0">
          <AlertTriangle size={11} className="shrink-0" />
          {missingCount} material{missingCount > 1 ? 'es' : ''} sin precio en tu base
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* Tab: Rubros */}
        {tab === 'items' && (
          <>
            {/* Banner de éxito tras crear APU */}
            {apuSuccess && (
              <div className="mx-2 mt-2 flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-[10px] text-emerald-700">
                <CheckCircle2 size={11} className="shrink-0" />
                APU creado: <strong className="truncate">{apuSuccess}</strong>
              </div>
            )}

            {items.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <Package size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-xs">Aún no agregaste rubros</p>
              </div>
            ) : items.map(item => (
              <div key={item.itemId} className="px-3 py-2.5 border-b border-slate-50 hover:bg-slate-50">
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">{item.taskNombre}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{item.taskId}</p>
                    {item.description && (
                      <p className="text-[10px] text-slate-500 italic truncate">{item.description}</p>
                    )}
                    <p className="text-xs text-blue-600 font-bold mt-0.5">
                      {fmtNum(item.quantity)} {item.unidad}
                    </p>
                    {(item.manualMaterials?.length ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-violet-600 bg-violet-50 border border-violet-100 px-1.5 py-0.5 rounded-full mt-0.5">
                        +{item.manualMaterials!.length} manual
                      </span>
                    )}
                  </div>
                  <div className="flex gap-0.5 shrink-0">
                    <button onClick={() => setApuItem(item)} title="Crear APU en base maestra"
                      className="p-1 text-slate-300 hover:text-blue-500 transition-colors">
                      <BookPlus size={13} />
                    </button>
                    <button onClick={() => onRemove(item.itemId)}
                      className="p-1 text-slate-300 hover:text-red-500 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* Tab: Materiales consolidados con costos */}
        {tab === 'totales' && (
          <>
            {resolved.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                Agregá rubros para ver el consolidado
              </div>
            ) : (
              <>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] text-slate-400 uppercase">
                      <th className="px-3 py-2 text-left">Material</th>
                      <th className="px-2 py-2 text-right">Téc.</th>
                      <th className="px-2 py-2 text-right">Und</th>
                      <th className="px-2 py-2 text-right">Compra</th>
                      <th className="px-2 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resolved.map((m, i) => (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            {m.matchedBy === 'missing'
                              ? <AlertTriangle size={10} className="text-amber-400 shrink-0" />
                              : <CheckCircle2 size={10} className="text-emerald-400 shrink-0" />
                            }
                            <span className={`leading-tight ${m.matchedBy === 'missing' ? 'text-slate-400' : 'text-slate-700 font-medium'}`}>
                              {m.nombre}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-slate-600">{fmtNum(m.cantidad)}</td>
                        <td className="px-2 py-2 text-right text-slate-400">{m.unit}</td>
                        <td className="px-2 py-2 text-right">
                          {m.purchaseQty !== undefined
                            ? (
                              <span className="inline-flex flex-col items-end leading-tight">
                                <span className="font-bold text-slate-800">{m.purchaseQty}</span>
                                <span className="text-[10px] text-slate-400">{m.commercialUnit}</span>
                              </span>
                            )
                            : <span className="text-slate-300">—</span>
                          }
                        </td>
                        <td className="px-2 py-2 text-right font-semibold">
                          {m.matchedBy === 'missing'
                            ? <span className="text-amber-400 text-[10px]">—</span>
                            : <span className="text-slate-800">${fmtCost(m.totalCost)}</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Total */}
                {grandTotal > 0 && (
                  <div className="mx-2 my-2 flex items-center justify-between px-3 py-2.5 bg-blue-50 border border-blue-100 rounded-lg">
                    <span className="text-xs font-bold text-slate-700">Total materiales</span>
                    <span className="text-base font-bold text-blue-700">${fmtCost(grandTotal)}</span>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      {items.length > 0 && (
        <div className="p-2 border-t border-slate-100 flex gap-1.5 shrink-0">
          <button onClick={onClear}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-200 transition-colors">
            <RefreshCcw size={11} /> Limpiar
          </button>
          <button onClick={onExportCSV}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors ml-auto">
            <Download size={11} /> CSV
          </button>
        </div>
      )}

      {/* Modal crear APU */}
      {apuItem && (
        <CreateAPUModal
          item={apuItem}
          orgMaterials={orgMaterials}
          existingNames={existingNames}
          organizationId={organizationId}
          onClose={() => setApuItem(null)}
          onCreated={taskName => {
            setApuItem(null);
            setApuSuccess(taskName);
            setTimeout(() => setApuSuccess(null), 5000);
          }}
        />
      )}
    </div>
  );
};

// ─── Layout presets y escala tipográfica ─────────────────────────────────────

type FontScale = 'sm' | 'md' | 'lg';

const clampW = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

const LAYOUT_PRESETS = [
  { key: 'balanced',    label: 'Balanceada',  left: 224, right: 256 },
  { key: 'catalog',     label: 'Catálogo',    left: 340, right: 180 },
  { key: 'calc',        label: 'Cálculo',     left: 180, right: 180 },
  { key: 'composition', label: 'Composición', left: 180, right: 380 },
] as const;

const FONT_ZOOM: Record<FontScale, number> = { sm: 0.875, md: 1, lg: 1.125 };

// ─── Componente principal ─────────────────────────────────────────────────────

export const ChandiasCalculator: React.FC = () => {
  const { user } = useAuth();
  const orgId    = user?.organizationId ?? '';

  const { tasks: masterTasks }           = useMasterTasks(orgId);
  const { materials: erpMaterials }      = useERP();
  const { list: unifiedList }            = useUnifiedMaterials(orgId);
  // Fallback: si unifiedList todavía está vacío (Supabase aún cargando),
  // usar los materiales del proyecto ya disponibles en ERPContext.
  const orgMaterials: OrgMaterialLookup[] = unifiedList.length > 0 ? unifiedList : erpMaterials;

  // Set de nombres existentes para el check de duplicados en el modal
  const existingNames = useMemo(
    () => new Set(masterTasks.map(t => t.name.trim().toLowerCase())),
    [masterTasks],
  );

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [items, setItems] = useState<ChandiasAddedItem[]>([]);

  // ── Panel resize ──────────────────────────────────────────────────────────
  const [leftW,  setLeftW]  = useState(224);
  const [rightW, setRightW] = useState(256);

  // ── Tipografía ────────────────────────────────────────────────────────────
  const [fontScale, setFontScale] = useState<FontScale>('md');

  // ── Drag resize — captura startX y startW en mousedown, sin closure stale ─
  const startDrag = useCallback((
    side: 'left' | 'right',
    startX: number,
    startW: number,
  ) => {
    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - startX;
      if (side === 'left') {
        setLeftW(clampW(startW + delta, 160, 400));
      } else {
        setRightW(clampW(startW - delta, 160, 440));
      }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  const selectedTask = useMemo(
    () => CHANDIAS_CATALOG.find(t => t.id === selectedTaskId) ?? null,
    [selectedTaskId],
  );

  const handleAdd    = useCallback((item: ChandiasAddedItem) => setItems(prev => [...prev, item]), []);
  const handleRemove = useCallback((id: string) => setItems(prev => prev.filter(i => i.itemId !== id)), []);
  const handleClear  = useCallback(() => setItems([]), []);

  const handleExportCSV = useCallback(() => {
    const cons = consolidateMaterials(withManualMerged(items));
    const rows = [
      'CALCULADORA CHANDÍAS — LISTA DE MATERIALES',
      `Generado: ${new Date().toLocaleDateString('es-AR')}`,
      '',
      'RUBROS AGREGADOS',
      'ID,Nombre,Unidad,Cantidad,Descripción',
      ...items.map(i => `"${i.taskId}","${i.taskNombre}","${i.unidad}",${i.quantity},"${i.description}"`),
      '',
      'MATERIALES CONSOLIDADOS',
      'Material,Unidad,Cantidad',
      ...cons.map(m => `"${m.nombre}","${m.unit}",${m.cantidad}`),
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `chandias_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }, [items]);

  // ── Preset activo (coincidencia exacta de anchos) ─────────────────────────
  const activePreset = LAYOUT_PRESETS.find(p => p.left === leftW && p.right === rightW)?.key ?? null;

  return (
    <div
      className="flex flex-col bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden"
      style={{ height: 'calc(100vh - 220px)', minHeight: '500px' }}
    >
      {/* ── Barra de controles ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-slate-100 bg-slate-50/80 shrink-0 flex-wrap">

        {/* Vistas predeterminadas */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mr-0.5 select-none">
            Vista
          </span>
          {LAYOUT_PRESETS.map(p => (
            <button
              key={p.key}
              onClick={() => { setLeftW(p.left); setRightW(p.right); }}
              className={`px-2 py-1 text-[10px] font-medium rounded border transition-colors select-none
                ${activePreset === p.key
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50'
                }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-slate-200 shrink-0" />

        {/* Escala tipográfica */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mr-0.5 select-none">
            Tipo
          </span>
          {(['sm', 'md', 'lg'] as FontScale[]).map((s, i) => (
            <button
              key={s}
              onClick={() => setFontScale(s)}
              style={{ fontSize: [10, 12, 14][i] }}
              className={`px-2 py-1 font-bold leading-none rounded border transition-colors select-none
                ${fontScale === s
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50'
                }`}
            >
              A
            </button>
          ))}
        </div>
      </div>

      {/* ── Paneles ───────────────────────────────────────────────────────────── */}
      <div
        className="flex flex-1 overflow-hidden"
        style={fontScale !== 'md' ? { zoom: FONT_ZOOM[fontScale] } : undefined}
      >
        {/* Panel izquierdo — catálogo */}
        <div style={{ width: leftW }} className="shrink-0 overflow-hidden">
          <Sidebar selectedId={selectedTaskId} onSelect={setSelectedTaskId} />
        </div>

        {/* Separador arrastreable L */}
        <div
          className="w-1.5 shrink-0 cursor-col-resize bg-transparent hover:bg-blue-200 active:bg-blue-400 transition-colors"
          onMouseDown={e => { e.preventDefault(); startDrag('left', e.clientX, leftW); }}
        />

        {/* Panel central — detalle / cálculo */}
        <DetailPanel task={selectedTask} orgMaterials={orgMaterials} onAdd={handleAdd} />

        {/* Separador arrastreable R */}
        <div
          className="w-1.5 shrink-0 cursor-col-resize bg-transparent hover:bg-blue-200 active:bg-blue-400 transition-colors"
          onMouseDown={e => { e.preventDefault(); startDrag('right', e.clientX, rightW); }}
        />

        {/* Panel derecho — resumen */}
        <div style={{ width: rightW }} className="shrink-0 overflow-hidden">
          <RightPanel
            items={items} orgMaterials={orgMaterials}
            organizationId={orgId} existingNames={existingNames}
            onRemove={handleRemove} onClear={handleClear} onExportCSV={handleExportCSV}
          />
        </div>
      </div>
    </div>
  );
};
