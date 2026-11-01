import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Search, Plus, Trash2, RefreshCcw, Download, Package, X, AlertTriangle, CheckCircle2, BookPlus, Loader2, Layers, ChevronDown, Settings2, ShoppingCart, FileText, BookOpen, Save } from 'lucide-react';
import { CHANDIAS_CATALOG, ChandiasTask } from './catalog/chandiasCatalog';
import { TaskSketch } from './TaskSketch';
import {
  calculateTask, consolidateMaterials, getCategories,
  mapMaterialToReal, consolidateResolved, convertToCommercial,
  computeDerivedOutputs, DerivedOutputResult,
  ChandiasAddedItem, ManualMaterial, OrgMaterialLookup, ResolvedMaterial,
  WallOpening, computeNetWallArea,
  FloorSector, computeNetFloorArea,
  BeamAdvancedConfig, BEAM_CONFIG_DEFAULTS, BeamDerivedResult, computeBeamResult,
  injectSteelConversionFactor, injectBulkConversionFactors,
} from './engine/chandias';
import { STEEL_REBAR_SPECS, getSteelBarWeight, DEFAULT_REBAR_DIAMETER_MM } from './engine/steelRebars';
import { generateId } from '../../../utils/generateId';
import { useAuth } from '../../../context/AuthContext';
import { useERP } from '../../../context/ERPContext';
import { useMasterTasks } from '../../../hooks/useMasterTasks';
import { useUnifiedMaterials } from '../../../hooks/useUnifiedMaterials';
import { masterTasksService, MasterTaskInput } from '../../../services/masterTasksSupabaseService';
import { MasterTaskMaterial, APUSourceMetadata } from '../../../types';
import { ReportPreviewModal, ReportMode } from './ReportPreviewModal';
import { computationService } from '../../../services/computationService';
import { buildComputationImportPayloads } from '../../../services/importComputationItems';
import { setPendingHighlight } from '../../../utils/quantitySource';
import { DecimalInput } from '../../../components/DecimalInput';

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
  'Fundaciones':          'bg-stone-200 text-stone-700',
  'Estructura H.A.':     'bg-stone-300 text-stone-800',
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

// ─── Helper: normaliza materiales desde un grupo de ítems del mismo taskId ────
// Suma las cantidades reales (incluye manuales) y las divide por Σquantity.
// Resultado: receta por 1 unidad de tarea, capturando la configuración real
// del usuario (beamSteelRatio, beamWaste, manuales, etc.).

function buildAPUMaterialsFromGroup(
  groupItems: ChandiasAddedItem[],
  orgMaterials: OrgMaterialLookup[],
): MasterTaskMaterial[] {
  const totalQty = groupItems.reduce((s, i) => s + i.quantity, 0);
  if (totalQty === 0 || groupItems.length === 0) return [];

  // Sumar cantidades reales por nombre|unit
  const matMap = new Map<string, { nombre: string; unit: string; total: number }>();
  for (const item of groupItems) {
    const allMats = [
      ...item.materiales,
      ...(item.manualMaterials ?? []).map(m => ({
        nombre: m.nombre, unit: m.unit, coef: 0, cantidad: m.cantidad,
      })),
    ];
    for (const m of allMats) {
      const key = `${m.nombre.toLowerCase()}|${m.unit}`;
      const ex  = matMap.get(key);
      if (ex) { ex.total += m.cantidad; }
      else    { matMap.set(key, { nombre: m.nombre, unit: m.unit, total: m.cantidad }); }
    }
  }

  return Array.from(matMap.values()).map(({ nombre, unit, total }) => {
    const normalizedCoef = total / totalQty;
    const resolved = mapMaterialToReal(
      { nombre, unit, coef: normalizedCoef, cantidad: normalizedCoef },
      orgMaterials,
    );
    // Solo persistir la capa comercial cuando hay un factor de conversión real
    // (unidad técnica ≠ unidad de compra: kg→bolsa, kg→barra, lt→balde).
    // Hormigón (m³→m³), encofrado (m²→m²): sin conversión → null ambos.
    // Constraint DB: commercial_unit IS NULL OR conversion_factor IS NOT NULL.
    const hasCF = resolved.conversionFactor != null && resolved.conversionFactor > 0;
    return {
      id:                 generateId(),
      materialName:       nombre,
      unit,
      quantity:           normalizedCoef,
      lastKnownUnitPrice: resolved.unitCost > 0 ? resolved.unitCost : undefined,
      conversionFactor:   hasCF ? resolved.conversionFactor : undefined,
      commercialUnit:     hasCF ? (resolved.commercialUnit ?? undefined) : undefined,
    };
  });
}

// ─── Modal: Transformar en APU Maestro ───────────────────────────────────────
// Agrupa todos los ítems del mismo taskId, normaliza la receta por Σquantity,
// y guarda en master_tasks con trazabilidad source_metadata.

interface CreateAPUModalProps {
  triggerItem:    ChandiasAddedItem;    // ítem que disparó el modal (define taskId)
  allItems:       ChandiasAddedItem[];  // todos los ítems — para agrupar por taskId
  orgMaterials:   OrgMaterialLookup[];
  existingNames:  Set<string>;
  organizationId: string;
  onClose:        () => void;
  onCreated:      (taskName: string) => void;
}

const CreateAPUModal: React.FC<CreateAPUModalProps> = ({
  triggerItem, allItems, orgMaterials, existingNames, organizationId, onClose, onCreated,
}) => {
  const catalogTask  = CHANDIAS_CATALOG.find(t => t.id === triggerItem.taskId)!;

  // Agrupar todos los ítems del mismo tipo
  const groupItems   = allItems.filter(i => i.taskId === triggerItem.taskId);
  const totalQty     = groupItems.reduce((s, i) => s + i.quantity, 0);
  const itemCount    = groupItems.length;

  const [name,        setName]        = useState(triggerItem.taskNombre);
  const [code,        setCode]        = useState('');
  const [description, setDescription] = useState('');
  const [dailyYield,  setDailyYield]  = useState('1');
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [success,     setSuccess]     = useState(false);

  const isDuplicate = existingNames.has(name.trim().toLowerCase());
  const yieldNum    = parseFloat(dailyYield) || 0;
  const canSubmit   = name.trim().length > 0 && yieldNum > 0 && !saving;

  // Inyectar CF de acero para el grupo (usa el diámetro del triggerItem como referencia)
  const orgMaterialsForAPU = useMemo((): OrgMaterialLookup[] => {
    const diam      = triggerItem.steelDiameterMm ?? DEFAULT_REBAR_DIAMETER_MM;
    const withSteel = injectSteelConversionFactor(orgMaterials, getSteelBarWeight(diam), diam);
    return injectBulkConversionFactors(withSteel);
  }, [orgMaterials, triggerItem.steelDiameterMm]);

  // Receta normalizada por unidad
  const materials = useMemo(
    () => buildAPUMaterialsFromGroup(groupItems, orgMaterialsForAPU),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groupItems.map(i => i.itemId).join(','), orgMaterialsForAPU],
  );

  const missingPrices = materials.filter(m => !m.lastKnownUnitPrice).length;
  const unitCostTotal = materials.reduce((s, m) => s + (m.lastKnownUnitPrice ?? 0) * m.quantity, 0);

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    try {
      const sourceMetadata: APUSourceMetadata = {
        source:           'chandias_computation',
        catalogTaskId:    triggerItem.taskId,
        catalogTaskName:  triggerItem.taskNombre,
        catalogTaskUnit:  triggerItem.unidad,
        totalQuantity:    totalQty,
        itemCount,
        inputItems: groupItems.map(i => ({
          itemId:      i.itemId,
          dims:        i.dims,
          quantity:    i.quantity,
          description: i.description || undefined,
        })),
        steelDiameterMm: triggerItem.steelDiameterMm,
        snapshotDate:    new Date().toISOString().slice(0, 10),
      };

      const input: MasterTaskInput = {
        name:           name.trim(),
        code:           code.trim() || undefined,
        unit:           triggerItem.unidad,
        category:       catalogTask.categoria,
        description:    description.trim() || `Generado desde calculadora Chandías — ${triggerItem.taskId}`,
        dailyYield:     yieldNum,
        materials,
        labor:          [],
        equipment:      [],
        sourceMetadata,
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

  const fmtQty = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 3 });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 bg-blue-700 text-white shrink-0">
          <BookPlus size={18} />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-sm">Transformar en APU Maestro</p>
            <p className="text-xs text-blue-200 font-mono truncate">
              {triggerItem.taskId} · {triggerItem.unidad} · {itemCount} ítem{itemCount !== 1 ? 's' : ''} · {fmtQty(totalQty)} {triggerItem.unidad} total
            </p>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 hover:bg-blue-800 rounded-lg shrink-0">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">

          {/* Info de agrupación */}
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800">
            <Layers size={13} className="shrink-0 text-blue-500" />
            <span>
              Este APU agrupa <strong>{itemCount} ítem{itemCount !== 1 ? 's' : ''}</strong> del tipo
              <strong> {catalogTask.nombre}</strong>
              {' '}(<strong>{fmtQty(totalQty)} {triggerItem.unidad}</strong> total).
              La receta unitaria se calculó normalizando por el volumen/área total.
            </span>
          </div>

          {/* Nombre */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre del APU</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            {isDuplicate && (
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                <AlertTriangle size={11} /> Ya existe un APU con este nombre en la base maestra
              </p>
            )}
          </div>

          {/* Código + Rendimiento */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Código (opcional)</label>
              <input type="text" value={code} onChange={e => setCode(e.target.value)}
                placeholder="Ej: FUN-004-C"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Rendimiento diario</label>
              <div className="flex rounded-lg border border-slate-200 overflow-hidden focus-within:ring-1 focus-within:ring-blue-400">
                <DecimalInput step={1} value={dailyYield}
                  onValue={(n, raw) => setDailyYield(raw === '' ? '' : String(n))}
                  className="flex-1 px-3 py-2 text-sm focus:outline-none min-w-0"
                />
                <span className="px-2 text-xs text-slate-400 bg-slate-50 flex items-center border-l border-slate-200 whitespace-nowrap">
                  {triggerItem.unidad}/día
                </span>
              </div>
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Descripción / observaciones (opcional)
            </label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Ej: Columna de fundación H-21, 200 kg/m³ acero…"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          {/* Badges */}
          <div className="flex gap-2 flex-wrap">
            <span className="text-xs px-2 py-1 bg-slate-100 rounded-lg text-slate-600">
              Unidad: <strong>{triggerItem.unidad}</strong>
            </span>
            <span className={`text-xs px-2 py-1 rounded-lg ${catColor(catalogTask.categoria)}`}>
              {catalogTask.categoria}
            </span>
            <span className="text-xs px-2 py-1 bg-slate-100 rounded-lg text-slate-500">
              {materials.length} material{materials.length !== 1 ? 'es' : ''}
            </span>
            {missingPrices > 0 && (
              <span className="text-xs px-2 py-1 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 flex items-center gap-1">
                <AlertTriangle size={10} /> {missingPrices} sin precio
              </span>
            )}
          </div>

          {/* Receta unitaria */}
          <div className="border border-slate-100 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-100">
              <p className="text-xs font-bold text-slate-600">
                Receta unitaria — por 1 {triggerItem.unidad}
              </p>
              {unitCostTotal > 0 && (
                <span className="text-xs font-bold text-blue-700">
                  ${fmtCost(unitCostTotal)} / {triggerItem.unidad}
                </span>
              )}
            </div>
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
                      <td className="px-2 py-1.5 text-right font-mono text-slate-600">
                        {m.quantity.toLocaleString('es-AR', { maximumFractionDigits: 4 })}
                      </td>
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

          {/* Aviso precios faltantes */}
          {missingPrices > 0 && !success && (
            <p className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200 flex items-center gap-1.5">
              <AlertTriangle size={12} className="shrink-0" />
              {missingPrices} material{missingPrices !== 1 ? 'es' : ''} sin precio. El APU se guardará correctamente — podés actualizarlos desde Base de Datos → APUs.
            </p>
          )}

          {/* Error */}
          {error && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200">{error}</p>
          )}

          {/* Success */}
          {success && (
            <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-200">
              <CheckCircle2 size={14} className="shrink-0" />
              <span>
                APU <strong>{name.trim()}</strong> guardado en la base maestra.
                Podés verlo en Base de Datos → APUs.
              </span>
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
              className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <BookPlus size={14} />}
              {saving ? 'Guardando…' : 'Guardar en Base Maestra'}
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

/** Estado serializable del DetailPanel para persistir en el borrador. */
interface DetailPanelState {
  taskId: string;
  dimValues: Record<string, string>;
  description: string;
  manualMaterials: ManualMaterial[];
  excludedMaterialNames: string[];
  nWalls: number;
  openings: WallOpening[];
  nRooms: number;
  floorSectors: FloorSector[];
  beamNBeams: number;
  beamWaste: number;
  beamSteelRatio: number;
  beamSteelDiameter: number;
  beamFondo: boolean;
  beamLat1: boolean;
  beamLat2: boolean;
  beamLat3: boolean;
}

interface DetailPanelProps {
  task: ChandiasTask | null;
  orgMaterials: OrgMaterialLookup[];
  onAdd: (item: ChandiasAddedItem) => void;
  /** Callback disparado tras cada cambio de estado relevante del panel (para autosave). */
  onPanelStateChange?: (state: DetailPanelState) => void;
  /** Estado inicial a restaurar cuando el taskId coincide (borrador previo). */
  initialPanelState?: DetailPanelState | null;
}
const DetailPanel: React.FC<DetailPanelProps> = ({ task, orgMaterials, onAdd, onPanelStateChange, initialPanelState }) => {
  const [dimValues,   setDimValues]   = useState<Record<string, string>>({});
  const [description, setDescription] = useState('');

  // ── Materiales manuales ───────────────────────────────────────────────────
  const [excludedMaterialNames, setExcludedMaterialNames] = useState<Set<string>>(new Set());
  const [manualMaterials, setManualMaterials] = useState<ManualMaterial[]>([]);
  const [addingMat,       setAddingMat]       = useState(false);
  const [matSearch,       setMatSearch]       = useState('');
  const [matSelected,     setMatSelected]     = useState<OrgMaterialLookup | null>(null);
  const [matQty,          setMatQty]          = useState('');
  const [matDropdown,     setMatDropdown]     = useState(false);
  // Coordenadas para el dropdown con position:fixed.
  // Necesario porque el dropdown está adentro de overflow-hidden (card) y
  // overflow-y-auto (scroll container) — ambos recortan position:absolute.
  const [dropTop,         setDropTop]         = useState(0);
  const [dropLeft,        setDropLeft]        = useState(0);
  const [dropWidth,       setDropWidth]       = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const recalcDropPos = () => {
    if (searchInputRef.current) {
      const r = searchInputRef.current.getBoundingClientRect();
      const minW = 320;
      const w = Math.max(r.width, minW);
      // Clamp to viewport right edge
      const left = Math.min(r.left, window.innerWidth - w - 8);
      // Flip upward if not enough space below
      const spaceBelow = window.innerHeight - r.bottom;
      const openUp = spaceBelow < 240 && r.top > spaceBelow;
      setDropTop(openUp ? Math.max(8, r.top - 296) : r.bottom + 4);
      setDropLeft(left);
      setDropWidth(w);
    }
  };

  // Abre el dropdown y calcula su posición fija.
  // requestAnimationFrame garantiza que el DOM está pintado antes de leer el rect.
  useEffect(() => {
    if (addingMat) {
      requestAnimationFrame(() => {
        recalcDropPos();
        searchInputRef.current?.focus();
        setMatDropdown(true);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addingMat]);

  // ── Configuración avanzada de muro (Mampostería / Revoques / Revestimientos) ─
  const [nWalls,       setNWalls]       = useState(1);
  const [openings,     setOpenings]     = useState<WallOpening[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ── Configuración avanzada de piso (Contrapisos y Pisos) ─────────────────
  const [nRooms,           setNRooms]           = useState(1);
  const [floorSectors,     setFloorSectors]     = useState<FloorSector[]>([]);
  const [showFloorAdvanced, setShowFloorAdvanced] = useState(false);

  // ── Configuración avanzada de fundaciones / H.A. ──────────────────────────
  const [beamNBeams,        setBeamNBeams]        = useState(BEAM_CONFIG_DEFAULTS.nBeams);
  const [beamWaste,         setBeamWaste]         = useState(BEAM_CONFIG_DEFAULTS.wastePercent);
  const [beamSteelRatio,    setBeamSteelRatio]    = useState(BEAM_CONFIG_DEFAULTS.steelRatio);
  const [beamSteelDiameter, setBeamSteelDiameter] = useState(BEAM_CONFIG_DEFAULTS.steelDiameterMm);
  const [beamFondo,         setBeamFondo]         = useState(BEAM_CONFIG_DEFAULTS.formwork.fondo);
  const [beamLat1,          setBeamLat1]          = useState(BEAM_CONFIG_DEFAULTS.formwork.lat1);
  const [beamLat2,          setBeamLat2]          = useState(BEAM_CONFIG_DEFAULTS.formwork.lat2);
  const [beamLat3,          setBeamLat3]          = useState(false);
  const [showBeamAdvanced,  setShowBeamAdvanced]  = useState(false);

  const prevTaskId = React.useRef<string | null>(null);
  if (task && task.id !== prevTaskId.current) {
    // Si hay estado guardado que coincide con esta tarea, restaurarlo; si no, usar defaults.
    const init = initialPanelState?.taskId === task.id ? initialPanelState : null;
    const defaults: Record<string, string> = {};
    task.dims.forEach(d => { defaults[d.id] = init?.dimValues?.[d.id] ?? ''; });
    setDimValues(init?.dimValues ?? defaults);
    setDescription(init?.description ?? '');
    setExcludedMaterialNames(new Set(init?.excludedMaterialNames ?? []));
    setManualMaterials(init?.manualMaterials ?? []);
    setAddingMat(false);
    setMatSearch('');
    setMatSelected(null);
    setMatQty('');
    setMatDropdown(false);
    setNWalls(init?.nWalls ?? 1);
    setOpenings(init?.openings ?? []);
    setShowAdvanced(false);
    setNRooms(init?.nRooms ?? 1);
    setFloorSectors(init?.floorSectors ?? []);
    setShowFloorAdvanced(false);
    if (init) {
      // Restaurar config de vigas desde el borrador
      setBeamNBeams(init.beamNBeams);
      setBeamWaste(init.beamWaste);
      setBeamSteelRatio(init.beamSteelRatio);
      setBeamSteelDiameter(init.beamSteelDiameter);
      setBeamFondo(init.beamFondo);
      setBeamLat1(init.beamLat1);
      setBeamLat2(init.beamLat2);
      setBeamLat3(init.beamLat3);
    } else if (task.structuralConfig?.enabled) {
      // Beam: inicializar desde structuralConfig del catálogo (o defaults si ausente)
      const sc = task.structuralConfig;
      setBeamWaste(sc.defaultWastePercent);
      setBeamSteelRatio(sc.defaultSteelRatio);
      setBeamFondo(sc.defaultFormwork.fondo);
      setBeamLat1(sc.defaultFormwork.lat1);
      setBeamLat2(sc.defaultFormwork.lat2);
      setBeamLat3(sc.defaultFormwork.lat3);
      setBeamNBeams(BEAM_CONFIG_DEFAULTS.nBeams);
      setBeamSteelDiameter(BEAM_CONFIG_DEFAULTS.steelDiameterMm);
    } else {
      setBeamFondo(BEAM_CONFIG_DEFAULTS.formwork.fondo ?? true);
      setBeamLat1(BEAM_CONFIG_DEFAULTS.formwork.lat1);
      setBeamLat2(BEAM_CONFIG_DEFAULTS.formwork.lat2);
      setBeamLat3(false);
      setBeamNBeams(BEAM_CONFIG_DEFAULTS.nBeams);
      setBeamSteelDiameter(BEAM_CONFIG_DEFAULTS.steelDiameterMm);
    }
    setShowBeamAdvanced(init ? (init.beamNBeams > 1 || init.beamWaste !== BEAM_CONFIG_DEFAULTS.wastePercent || init.beamSteelRatio !== BEAM_CONFIG_DEFAULTS.steelRatio) : (task.structuralConfig?.defaultPanelOpen ?? false));
    prevTaskId.current = task.id;
  }

  // Reportar estado del panel al padre para persistencia en borrador
  useEffect(() => {
    if (!task || !onPanelStateChange) return;
    onPanelStateChange({
      taskId: task.id,
      dimValues,
      description,
      manualMaterials,
      excludedMaterialNames: Array.from(excludedMaterialNames),
      nWalls,
      openings,
      nRooms,
      floorSectors,
      beamNBeams,
      beamWaste,
      beamSteelRatio,
      beamSteelDiameter,
      beamFondo,
      beamLat1,
      beamLat2,
      beamLat3,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    task?.id, dimValues, description, manualMaterials, excludedMaterialNames,
    nWalls, openings, nRooms, floorSectors,
    beamNBeams, beamWaste, beamSteelRatio, beamSteelDiameter,
    beamFondo, beamLat1, beamLat2, beamLat3,
  ]);

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
  const isFloorFamily  = task?.categoria === 'Contrapisos y Pisos';
  const isBeamFamily   = !!task?.structuralConfig?.enabled;

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

  const beamCfg = useMemo((): BeamAdvancedConfig => ({
    nBeams: beamNBeams,
    wastePercent: beamWaste,
    steelRatio: beamSteelRatio,
    steelDiameterMm: beamSteelDiameter,
    formwork: { fondo: beamFondo, lat1: beamLat1, lat2: beamLat2, lat3: beamLat3 },
  }), [beamNBeams, beamWaste, beamSteelRatio, beamSteelDiameter, beamFondo, beamLat1, beamLat2, beamLat3]);

  const beamResult = useMemo((): { calcResult: ReturnType<typeof computeBeamResult>['calcResult']; derived: BeamDerivedResult } | null => {
    if (!isBeamFamily || !baseCalcResult) return null;
    return computeBeamResult(baseCalcResult, dims, beamCfg);
  }, [isBeamFamily, baseCalcResult, dims, beamCfg]);

  /**
   * calcResult efectivo:
   *  - Familias de muro/revoque/revestimiento → superficie neta (largo×alto×N − aberturas)
   *  - Pisos → superficie total (largo×ancho×N + sectores)
   *  - Fundaciones → volumen ajustado por nBeams, waste, steelRatio
   *  - Todo lo demás → igual que baseCalcResult (sin cambios).
   */
  const calcResult = useMemo(() => {
    if (!baseCalcResult) return null;
    if (beamResult) return beamResult.calcResult;
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
  }, [baseCalcResult, beamResult, wallSurface, floorSurface]);

  // Cómputos derivados (ej: encofrado paramétrico de FUN-002)
  const derivedOutputs = useMemo((): DerivedOutputResult[] => {
    if (!task) return [];
    return computeDerivedOutputs(task, dims);
  }, [task, dims]);

  // Para beam family: reemplaza el valor de 'encofrado' con el calculado por beamResult
  // (que aplica nBeams y selección de caras). Para otras familias: igual que derivedOutputs.
  const effectiveDerivedOutputs = useMemo((): DerivedOutputResult[] => {
    if (!isBeamFamily || !beamResult) return derivedOutputs;
    return derivedOutputs.map(d =>
      d.id === 'encofrado' ? { ...d, value: beamResult.derived.totalEncofrado } : d,
    );
  }, [isBeamFamily, beamResult, derivedOutputs]);

  // Siempre inyectar CF de acero (diámetro según contexto) + CF de materiales a granel.
  // Para beam family: usa el diámetro seleccionado; para otras tareas: diámetro por defecto.
  // injectBulkConversionFactors agrega CF para cemento/cal/yeso (necesario si migration 022 no ejecutada).
  const orgMaterialsEffective = useMemo((): OrgMaterialLookup[] => {
    const steelDiam = isBeamFamily ? beamSteelDiameter : DEFAULT_REBAR_DIAMETER_MM;
    const withSteel = injectSteelConversionFactor(orgMaterials, getSteelBarWeight(steelDiam), steelDiam);
    return injectBulkConversionFactors(withSteel);
  }, [orgMaterials, isBeamFamily, beamSteelDiameter]);

  // Materiales automáticos con precios resueltos
  const resolvedMaterials = useMemo((): ResolvedMaterial[] => {
    if (!calcResult || !task) return [];
    return calcResult.materiales.map((m, i) =>
      mapMaterialToReal({ ...m, code: task.materiales[i]?.code }, orgMaterialsEffective),
    );
  }, [calcResult, task, orgMaterialsEffective]);

  // Materiales del catálogo filtrados por exclusión manual del usuario
  const resolvedMaterialsVisible = useMemo(
    () => resolvedMaterials.filter(m => !excludedMaterialNames.has(m.nombre)),
    [resolvedMaterials, excludedMaterialNames],
  );

  // Materiales manuales con precios resueltos (misma lógica técnica/comercial)
  const resolvedManual = useMemo((): ResolvedMaterial[] =>
    manualMaterials.map(m =>
      mapMaterialToReal(
        { nombre: m.nombre, unit: m.unit, coef: 0, cantidad: m.cantidad, code: m.code },
        orgMaterialsEffective,
      ),
    ),
    [manualMaterials, orgMaterialsEffective],
  );

  // Materiales derivados por geometría: derivedOutputs con asMaterial → líneas de composición.
  // La cantidad usa effectiveDerivedOutputs (ya aplica nBeams/caras para beam family).
  const resolvedDerived = useMemo((): Array<ResolvedMaterial & { derivedOutputId: string }> => {
    if (!task) return [];
    return effectiveDerivedOutputs
      .filter(d => !!task.derivedOutputs?.find(od => od.id === d.id)?.asMaterial)
      .map(d => {
        const cat = task.derivedOutputs!.find(od => od.id === d.id)!;
        const am  = cat.asMaterial!;
        const resolved = mapMaterialToReal(
          { nombre: am.nombre ?? cat.label, unit: cat.unit, coef: 0, cantidad: d.value, code: am.code },
          orgMaterialsEffective,
        );
        return { ...resolved, derivedOutputId: d.id };
      });
  }, [task, effectiveDerivedOutputs, orgMaterialsEffective]);

  // Sugerencias para el selector de material (filtradas por búsqueda — sin límite).
  // Usa orgMaterialsEffective para mostrar unidades técnicas correctas (kg, no TN)
  // y datos comerciales inyectados (bolsas, barras).
  const matSuggestions = useMemo(() => {
    const q = matSearch.trim().toLowerCase();
    if (!q) return orgMaterialsEffective;
    return orgMaterialsEffective.filter(m =>
      m.name.toLowerCase().includes(q) ||
      (m.code && m.code.toLowerCase().includes(q)),
    );
  }, [matSearch, orgMaterialsEffective]);

  const allFilled      = task?.dims.every(d => (parseFloat(dimValues[d.id] || '0') || 0) > 0) ?? false;
  const quantity       = calcResult?.quantity ?? 0;
  const missingAuto    = resolvedMaterialsVisible.filter(m => m.matchedBy === 'missing').length;
  const missingManual  = resolvedManual.filter(m => m.matchedBy === 'missing').length;
  const missingDerived = resolvedDerived.filter(m => m.matchedBy === 'missing').length;
  const missingAll     = missingAuto + missingManual + missingDerived;
  const totalAutoCost  = resolvedMaterialsVisible.reduce((s, m) => s + m.totalCost, 0);
  const totalManCost   = resolvedManual.reduce((s, m) => s + m.totalCost, 0);
  const totalDervCost  = resolvedDerived.reduce((s, m) => s + m.totalCost, 0);
  const totalAllCost   = totalAutoCost + totalManCost + totalDervCost;
  const totalCount     = resolvedMaterialsVisible.length + manualMaterials.length + resolvedDerived.length;

  const handleAdd = useCallback(() => {
    if (!calcResult || !task || quantity <= 0) return;
    // Convertir líneas derivadas a manualMaterials para persistirlas en el ítem
    const derivedAsManual: ManualMaterial[] = resolvedDerived
      .filter(m => m.cantidad > 0)
      .map(m => ({
        id: generateId(),
        nombre: m.nombre,
        unit: m.unit,
        cantidad: m.cantidad,
        code: task.derivedOutputs?.find(d => d.id === m.derivedOutputId)?.asMaterial?.code,
      }));
    onAdd({
      ...calcResult,
      materiales: calcResult.materiales.filter(m => !excludedMaterialNames.has(m.nombre)),
      itemId: generateId(),
      description,
      manualMaterials: [...manualMaterials, ...derivedAsManual],
      steelDiameterMm: isBeamFamily ? beamSteelDiameter : undefined,
    });
  }, [calcResult, task, quantity, description, onAdd, manualMaterials, resolvedDerived, isBeamFamily, beamSteelDiameter, excludedMaterialNames]);

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

          {/* Esquema de referencia — proporcional a las dimensiones ingresadas */}
          <div className="mt-3 mb-1 bg-slate-50 rounded-xl border border-slate-100 py-2 px-1">
            <TaskSketch task={task} dimValues={dimValues} />
          </div>

          {/* Inputs dinámicos */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
            {task.dims.map(dim => (
              <div key={dim.id}>
                <label className="block text-xs font-semibold text-slate-500 mb-1">{dim.label}</label>
                <div className="flex rounded-lg border border-slate-200 overflow-hidden focus-within:ring-1 focus-within:ring-blue-400 focus-within:border-blue-400">
                  <DecimalInput step={0.05}
                    value={dimValues[dim.id] ?? ''}
                    onValue={(n, raw) => setDimValues(prev => ({ ...prev, [dim.id]: raw === '' ? '' : String(n) }))}
                    placeholder="0"
                    className="flex-1 pl-2 py-2 text-sm bg-white focus:outline-none min-w-0"
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
                              <DecimalInput step={0.05}
                                value={o.ancho || ''}
                                onValue={n => updateOpening(o.id, 'ancho', n)}
                                placeholder="0.00"
                                className="px-1.5 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 text-center"
                              />
                              <DecimalInput step={0.05}
                                value={o.alto || ''}
                                onValue={n => updateOpening(o.id, 'alto', n)}
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
                            <DecimalInput step={0.05}
                              value={s.largo || ''}
                              onValue={n => updateFloorSector(s.id, 'largo', n)}
                              placeholder="0.00"
                              className="px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                            <DecimalInput step={0.05}
                              value={s.ancho || ''}
                              onValue={n => updateFloorSector(s.id, 'ancho', n)}
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

          {/* ── Configuración avanzada de fundaciones (Fundaciones H.A.) ─────── */}
          {isBeamFamily && (
            <div className="mt-4 border border-stone-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowBeamAdvanced(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2 bg-stone-50 hover:bg-stone-100 transition-colors"
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold text-stone-700">
                  <Settings2 size={13} />
                  Parámetros de cómputo
                  {(() => {
                    const activeFaceCount = [beamFondo, beamLat1, beamLat2, beamLat3].filter(Boolean).length;
                    const defaultFaceCount = task?.structuralConfig
                      ? Object.values(task.structuralConfig.defaultFormwork).filter(Boolean).length
                      : 3;
                    const defaultWaste = task?.structuralConfig?.defaultWastePercent ?? 5;
                    const badgeItems = [
                      beamNBeams > 1 && `×${beamNBeams} el.`,
                      beamWaste !== defaultWaste && `desp. ${beamWaste}%`,
                      activeFaceCount !== defaultFaceCount && `${activeFaceCount} caras enc.`,
                    ].filter(Boolean);
                    return badgeItems.length > 0 ? (
                      <span className="px-1.5 py-0.5 text-[9px] font-bold bg-stone-200 text-stone-600 rounded-full">
                        {badgeItems.join(' · ')}
                      </span>
                    ) : null;
                  })()}
                </span>
                <ChevronDown
                  size={13}
                  className={`text-stone-400 transition-transform duration-150 ${showBeamAdvanced ? 'rotate-180' : ''}`}
                />
              </button>

              {showBeamAdvanced && (
                <div className="px-3 pt-3 pb-3 space-y-4 border-t border-stone-100">
                  {/* Cantidad de elementos */}
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-semibold text-stone-600 min-w-[140px]">
                      Elementos iguales
                    </label>
                    <div className="flex rounded-lg border border-stone-200 overflow-hidden focus-within:ring-1 focus-within:ring-stone-400 w-28">
                      <input
                        type="number" min="1" step="1"
                        value={beamNBeams}
                        onChange={e => setBeamNBeams(Math.max(1, parseInt(e.target.value) || 1))}
                        className="flex-1 px-3 py-1.5 text-sm bg-white focus:outline-none min-w-0"
                      />
                      <span className="px-2 text-xs text-stone-400 bg-stone-50 flex items-center border-l border-stone-200">un</span>
                    </div>
                  </div>

                  {/* Desperdicio hormigón */}
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-semibold text-stone-600 min-w-[140px]">
                      Desperdicio hormigón
                    </label>
                    <div className="flex rounded-lg border border-stone-200 overflow-hidden focus-within:ring-1 focus-within:ring-stone-400 w-28">
                      <DecimalInput step={1} max={30}
                        value={beamWaste}
                        onValue={n => setBeamWaste(Math.max(0, Math.min(30, n)))}
                        className="flex-1 px-3 py-1.5 text-sm bg-white focus:outline-none min-w-0"
                      />
                      <span className="px-2 text-xs text-stone-400 bg-stone-50 flex items-center border-l border-stone-200">%</span>
                    </div>
                  </div>

                  {/* Cuantía de acero */}
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-semibold text-stone-600 min-w-[140px]">
                      Cuantía de acero
                    </label>
                    <div className="flex rounded-lg border border-stone-200 overflow-hidden focus-within:ring-1 focus-within:ring-stone-400 w-28">
                      <DecimalInput step={5}
                        value={beamSteelRatio}
                        onValue={n => setBeamSteelRatio(Math.max(0, n))}
                        className="flex-1 px-3 py-1.5 text-sm bg-white focus:outline-none min-w-0"
                      />
                      <span className="px-2 text-xs text-stone-400 bg-stone-50 flex items-center border-l border-stone-200">kg/m³</span>
                    </div>
                  </div>

                  {/* Diámetro de barra */}
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-semibold text-stone-600 min-w-[140px]">
                      Diámetro de barra
                    </label>
                    <select
                      value={beamSteelDiameter}
                      onChange={e => setBeamSteelDiameter(parseInt(e.target.value))}
                      className="px-3 py-1.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-stone-400 bg-white w-36"
                    >
                      {STEEL_REBAR_SPECS.map(s => (
                        <option key={s.diameterMm} value={s.diameterMm}>
                          ∅{s.diameterMm}mm — {s.barWeightKg} kg/barra
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Encofrado */}
                  <div>
                    <p className="text-xs font-semibold text-stone-600 mb-2">Caras de encofrado</p>
                    <div className="flex flex-wrap gap-2">
                      {(() => {
                        const fl = task?.structuralConfig?.faceLabels;
                        return ([
                          { key: 'fondo', label: fl?.fondo ?? 'Fondo',     val: beamFondo, set: setBeamFondo },
                          { key: 'lat1',  label: fl?.lat1  ?? 'Lateral 1', val: beamLat1,  set: setBeamLat1 },
                          { key: 'lat2',  label: fl?.lat2  ?? 'Lateral 2', val: beamLat2,  set: setBeamLat2 },
                          { key: 'lat3',  label: fl?.lat3  ?? 'Lateral 3', val: beamLat3,  set: setBeamLat3 },
                        ] as const).map(f => (
                          <button
                            key={f.key}
                            type="button"
                            onClick={() => f.set(v => !v)}
                            className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
                              f.val
                                ? 'bg-stone-700 text-white border-stone-700'
                                : 'bg-white text-stone-400 border-stone-200'
                            }`}
                          >
                            {f.label}
                          </button>
                        ));
                      })()}
                    </div>
                    <p className="text-[10px] text-stone-400 mt-1 italic">
                      Encofrado = suma de áreas de caras activas
                    </p>
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
          ) : isBeamFamily && beamResult && quantity > 0 ? (
            /* ── Resumen de cómputo de H.A. ──────────────────────────────── */
            <div className="mt-4 px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl space-y-2.5">
              <p className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">
                {task?.categoria === 'Fundaciones' ? 'Cómputo de fundación' : `Cómputo — ${task?.categoria ?? 'H.A.'}`}
              </p>

              {/* Volumen estructural */}
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium text-stone-700">
                  Volumen estructural
                  {beamNBeams > 1 && (
                    <span className="ml-1 text-[10px] text-stone-400">
                      ({fmtNum(beamResult.derived.volumePerBeam, 3)} × {beamNBeams})
                    </span>
                  )}
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-stone-800">{fmtNum(beamResult.derived.totalVolumeBruto, 3)}</span>
                  <span className="text-xs text-stone-500">m³</span>
                </div>
              </div>

              <div className="border-t border-stone-200" />

              {/* Hormigón */}
              <div className="space-y-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-medium text-stone-700">
                    Hormigón H-21
                    <span className="ml-1 text-[10px] text-stone-400">(+{beamWaste}% desp.)</span>
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-bold text-stone-800">{fmtNum(beamResult.derived.totalHormigon, 3)}</span>
                    <span className="text-xs text-stone-500">m³</span>
                  </div>
                </div>
                <div className="flex items-center justify-between pl-1">
                  <span className="flex items-center gap-1 text-[10px] text-stone-500">
                    <ShoppingCart size={10} />
                    Compra sugerida (múltiplos 0.5 m³)
                  </span>
                  <span className="text-xs font-semibold text-stone-600">
                    {fmtNum(beamResult.derived.hormiPurchaseSuggested, 1)} m³
                  </span>
                </div>
              </div>

              {/* Acero */}
              <div className="space-y-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-medium text-stone-700">
                    Acero ADN 420
                    <span className="ml-1 text-[10px] text-stone-400">({beamSteelRatio} kg/m³)</span>
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-bold text-stone-800">{fmtNum(beamResult.derived.totalAcero, 1)}</span>
                    <span className="text-xs text-stone-500">kg</span>
                  </div>
                </div>
                {beamResult.derived.steelBarsNeeded > 0 && (
                  <div className="flex items-center justify-between pl-1">
                    <span className="flex items-center gap-1 text-[10px] text-stone-500">
                      <ShoppingCart size={10} />
                      Compra (∅{beamSteelDiameter}mm · {fmtNum(beamResult.derived.steelBarWeightKg, 3)} kg/barra)
                    </span>
                    <span className="text-xs font-semibold text-stone-600">
                      {beamResult.derived.steelBarsNeeded} barras 12m
                    </span>
                  </div>
                )}
              </div>

              {/* Encofrado */}
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium text-stone-700">
                  Encofrado
                  <span className="ml-1 text-[10px] text-stone-400">
                    ({[beamFondo && 'fondo', beamLat1 && 'lat1', beamLat2 && 'lat2', beamLat3 && 'lat3'].filter(Boolean).join('+') || 'sin caras'})
                  </span>
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-stone-800">{fmtNum(beamResult.derived.totalEncofrado, 2)}</span>
                  <span className="text-xs text-stone-500">m²</span>
                </div>
              </div>

              {/* Auditoría */}
              <div className="border-t border-stone-200 pt-1.5">
                <p className="text-[10px] text-stone-400 font-mono leading-relaxed">
                  V = {fmtNum(dims.largo??0,2)}×{fmtNum(dims.ancho??0,2)}×{fmtNum(dims.alto??0,2)}
                  {beamNBeams > 1 ? `×${beamNBeams}` : ''} = {fmtNum(beamResult.derived.totalVolumeBruto,3)} m³
                  {'  '}|{'  '}
                  H = V×{(1 + beamWaste/100).toFixed(2)} = {fmtNum(beamResult.derived.totalHormigon,3)} m³
                  {'  '}|{'  '}
                  A = V×{beamSteelRatio} = {fmtNum(beamResult.derived.totalAcero,1)} kg
                  {beamResult.derived.steelBarsNeeded > 0 && (
                    <>
                      {'  '}|{'  '}
                      CEIL({fmtNum(beamResult.derived.totalAcero,1)}/{fmtNum(beamResult.derived.steelBarWeightKg,3)}) = {beamResult.derived.steelBarsNeeded} barras ∅{beamSteelDiameter}mm
                    </>
                  )}
                </p>
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

          {/* ── Cómputos derivados — solo para familias no-beam ──────────── */}
          {!isBeamFamily && derivedOutputs.length > 0 && quantity > 0 && (
            <div className="mt-3 px-4 py-3 bg-stone-50 border border-stone-200 rounded-lg space-y-2">
              <p className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">
                Cómputos derivados
              </p>
              {derivedOutputs.map(d => (
                <div key={d.id}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-medium text-stone-700">{d.label}</span>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-lg font-bold text-stone-800">
                        {fmtNum(d.value, 2)}
                      </span>
                      <span className="text-xs text-stone-500">{d.unit}</span>
                    </div>
                  </div>
                  {d.nota && (
                    <p className="text-[10px] text-stone-400 italic mt-0.5">{d.nota}</p>
                  )}
                </div>
              ))}
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
          {/* Muestra el subtotal cuando hay costos calculados; "(parcial)" si faltan precios.
              El badge de "sin precio" solo aparece cuando no hay subtotal que mostrar. */}
          {quantity > 0 && totalCount > 0 && totalAllCost > 0 ? (
            <span className="ml-auto text-xs font-bold text-slate-700">
              Subtotal: ${fmtCost(totalAllCost)}
              {missingAll > 0 && (
                <span className="font-normal text-amber-500 ml-1">(parcial)</span>
              )}
            </span>
          ) : missingAll > 0 ? (
            <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 ml-auto">
              <AlertTriangle size={11} /> {missingAll} sin precio
            </span>
          ) : null}
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
              {resolvedMaterialsVisible.map((m, i) => (
                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 group/matrow">
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
                    <div className="flex items-center justify-end gap-1.5">
                      {quantity > 0 && m.matchedBy !== 'missing'
                        ? <span className="text-slate-800">${fmtCost(m.totalCost)}</span>
                        : <span className="text-slate-300">—</span>
                      }
                      <button
                        onClick={() => setExcludedMaterialNames(prev => new Set([...prev, m.nombre]))}
                        className="shrink-0 p-0.5 text-slate-200 hover:text-red-500 opacity-0 group-hover/matrow:opacity-100 transition-opacity"
                        title="Quitar del cálculo"
                      >
                        <X size={11} />
                      </button>
                    </div>
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

              {/* ── Derivados por geometría ─────────────────────────────────── */}
              {resolvedDerived.length > 0 && quantity > 0 && (
                <>
                  <tr className="bg-amber-50/70">
                    <td colSpan={7} className="px-4 py-1 text-[10px] font-bold text-amber-600 uppercase tracking-wider select-none">
                      Derivados por geometría
                    </td>
                  </tr>
                  {resolvedDerived.map((m, i) => (
                    <tr key={`derived-${i}`} className="border-b border-amber-50 hover:bg-amber-50/40">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="shrink-0 px-1 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-700 rounded leading-none"
                            title="Cantidad calculada por geometría — no es coeficiente fijo del APU"
                          >
                            Σ
                          </span>
                          {m.matchedBy === 'missing'
                            ? <AlertTriangle size={11} className="text-amber-500 shrink-0" title="No encontrado en tu base de materiales" />
                            : <CheckCircle2 size={11} className="text-emerald-500 shrink-0" title={`Coincidencia por ${m.matchedBy}`} />
                          }
                          <span className={`font-medium italic ${m.matchedBy === 'missing' ? 'text-slate-400' : 'text-slate-700'}`}>
                            {m.nombre}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center text-slate-500 font-mono">{m.unit}</td>
                      <td className="px-3 py-2.5 text-right text-slate-300 select-none text-[10px] italic">geom.</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-700">
                        {fmtNum(m.cantidad, 2)}
                      </td>
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
                      <td className="px-3 py-2.5 text-right font-semibold">
                        {m.matchedBy !== 'missing'
                          ? <span className="text-slate-800">${fmtCost(m.totalCost)}</span>
                          : <span className="text-slate-300">—</span>
                        }
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
                  onChange={e => { setMatSearch(e.target.value); setMatSelected(null); setMatDropdown(true); recalcDropPos(); }}
                  onFocus={() => { recalcDropPos(); setMatDropdown(true); }}
                  onBlur={() => setTimeout(() => setMatDropdown(false), 150)}
                  placeholder="Buscar material…"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                {/* Dropdown con position:fixed — escapa de overflow-hidden y overflow-y-auto */}
                {matDropdown && matSuggestions.length > 0 && (
                  <div
                    style={{ position: 'fixed', top: dropTop, left: dropLeft, width: dropWidth, zIndex: 9999 }}
                    className="bg-white border border-slate-200 rounded-lg shadow-xl flex flex-col"
                  >
                    <div className="max-h-72 overflow-y-auto">
                      {matSuggestions.map(m => (
                        <button
                          key={m.name}
                          onMouseDown={e => { e.preventDefault(); setMatSelected(m); setMatSearch(m.name); setMatDropdown(false); }}
                          className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-slate-50 last:border-0"
                        >
                          <div className="flex justify-between gap-2 items-baseline">
                            <span className="truncate text-xs font-medium text-slate-800">{m.name}</span>
                            <span className="text-xs whitespace-nowrap shrink-0">
                              {m.unit && <span className="text-slate-400">{m.unit} · </span>}
                              {m.cost > 0
                                ? <span className="text-emerald-600 font-medium">${fmtCost(m.cost)}</span>
                                : <span className="text-amber-500">sin precio</span>
                              }
                            </span>
                          </div>
                          {m.code && (
                            <div className="text-[10px] text-slate-400 mt-0.5">{m.code}</div>
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="px-3 py-1.5 border-t border-slate-100 bg-slate-50 rounded-b-lg text-[10px] text-slate-400 text-right">
                      {matSuggestions.length} {matSuggestions.length === 1 ? 'material' : 'materiales'}
                    </div>
                  </div>
                )}
                {/* Sin resultados para la búsqueda */}
                {matDropdown && matSearch.trim().length > 0 && matSuggestions.length === 0 && orgMaterials.length > 0 && (
                  <div
                    style={{ position: 'fixed', top: dropTop, left: dropLeft, width: dropWidth, zIndex: 9999 }}
                    className="bg-white border border-slate-200 rounded-lg shadow-xl px-3 py-4 text-center"
                  >
                    <p className="text-xs text-slate-400">Sin resultados para "{matSearch.trim()}"</p>
                    <p className="text-[10px] text-slate-300 mt-0.5">Borrá el texto para ver todos los materiales</p>
                  </div>
                )}
                {/* Sin materiales disponibles */}
                {matDropdown && matSuggestions.length === 0 && orgMaterials.length === 0 && (
                  <div
                    style={{ position: 'fixed', top: dropTop, left: dropLeft, width: dropWidth, zIndex: 9999 }}
                    className="bg-white border border-slate-200 rounded-lg shadow-xl px-3 py-4 text-center"
                  >
                    <p className="text-xs text-slate-400">Sin materiales disponibles</p>
                    <p className="text-[10px] text-slate-300 mt-0.5">Importá materiales en Base de Datos → Base Maestra</p>
                  </div>
                )}
              </div>

              {/* Cantidad */}
              <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden focus-within:ring-1 focus-within:ring-blue-400 shrink-0">
                <DecimalInput
                  value={matQty}
                  onValue={(n, raw) => setMatQty(raw === '' ? '' : String(n))}
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
  projectId:      string;
  existingNames:  Set<string>;
  onRemove:       (itemId: string) => void;
  onClear:        () => void;
  onExportCSV:    () => void;
  /** Guardar sesión de cómputo en Supabase. Rechaza con error si falla. */
  onSaveComputation: () => Promise<void>;
  /**
   * Guardar cómputo + crear tasks/budget_items en el proyecto activo.
   * Devuelve mensaje de éxito. Rechaza con error si falla.
   */
  onSendToPresupuesto: () => Promise<string>;
  /** Incrementar este valor fuerza al panel a mostrar la pestaña Rubros (tras restaurar borrador). */
  restoredAt?:    number;
  /** Callback invocado tras crear un APU exitosamente — el padre debe llamar refetch(). */
  onAPUCreated?:  () => void;
  /** Ir a «Ítems y presupuesto» (resaltando lo enviado). Si falta, no se muestra el botón. */
  onViewInBudget?: () => void;
}
const RightPanel: React.FC<RightPanelProps> = ({
  items, orgMaterials, organizationId, projectId, existingNames,
  onRemove, onClear, onExportCSV, onSaveComputation, onSendToPresupuesto, restoredAt, onAPUCreated, onViewInBudget,
}) => {
  const [tab,        setTab]        = useState<RightTab>('items');
  const [apuItem,    setApuItem]    = useState<ChandiasAddedItem | null>(null);
  const [apuSuccess, setApuSuccess] = useState<string | null>(null);
  const [reportMode, setReportMode] = useState<ReportMode | null>(null);

  type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError,  setSaveError]  = useState<string | null>(null);

  const handleSaveComputation = async () => {
    setSaveStatus('saving');
    setSaveError(null);
    try {
      await onSaveComputation();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 4000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al guardar';
      setSaveError(msg);
      setSaveStatus('error');
      setTimeout(() => { setSaveStatus('idle'); setSaveError(null); }, 6000);
    }
  };

  type SendStatus = 'idle' | 'sending' | 'sent' | 'error';
  const [sendStatus, setSendStatus] = useState<SendStatus>('idle');
  const [sendMsg,    setSendMsg]    = useState<string | null>(null);

  const handleSendToPresupuesto = async () => {
    setSendStatus('sending');
    setSendMsg(null);
    try {
      const msg = await onSendToPresupuesto();
      setSendMsg(msg);
      setSendStatus('sent');
      setTimeout(() => { setSendStatus('idle'); setSendMsg(null); }, 15000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al enviar';
      setSendMsg(msg);
      setSendStatus('error');
      setTimeout(() => { setSendStatus('idle'); setSendMsg(null); }, 6000);
    }
  };

  // Cuando se restaura un borrador, forzar pestaña Rubros para que el usuario vea los ítems
  useEffect(() => {
    if (restoredAt) setTab('items');
  }, [restoredAt]);

  // Inyectar CF de acero (∅12mm default) + materiales a granel para el panel consolidado.
  const orgMaterialsForPanel = useMemo(() => {
    const withSteel = injectSteelConversionFactor(orgMaterials, getSteelBarWeight(DEFAULT_REBAR_DIAMETER_MM), DEFAULT_REBAR_DIAMETER_MM);
    return injectBulkConversionFactors(withSteel);
  }, [orgMaterials]);
  const resolved = useMemo(
    () => consolidateResolved(withManualMerged(items), orgMaterialsForPanel),
    [items, orgMaterialsForPanel],
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

      {/* Banner guardado exitoso */}
      {saveStatus === 'saved' && (
        <div className="mx-2 mt-2 flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-[10px] text-emerald-700 shrink-0">
          <CheckCircle2 size={11} className="shrink-0" />
          Cómputo guardado correctamente.
        </div>
      )}
      {/* Banner error al guardar */}
      {saveStatus === 'error' && saveError && (
        <div className="mx-2 mt-2 flex items-start gap-1.5 px-2.5 py-1.5 bg-red-50 border border-red-200 rounded-lg text-[10px] text-red-700 shrink-0">
          <AlertTriangle size={11} className="shrink-0 mt-px" />
          <span className="break-all">{saveError}</span>
        </div>
      )}

      {/* Banner enviado al presupuesto */}
      {sendStatus === 'sent' && sendMsg && (
        <div className={`mx-2 mt-2 flex items-center gap-1.5 px-2.5 py-1.5 border rounded-lg text-[10px] shrink-0 ${sendMsg.includes('No se actualizó') ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
          {sendMsg.includes('No se actualizó') ? <AlertTriangle size={11} className="shrink-0" /> : <CheckCircle2 size={11} className="shrink-0" />}
          <span className="flex-1">{sendMsg}</span>
          {onViewInBudget && (
            <button onClick={onViewInBudget} className="shrink-0 px-2 py-0.5 rounded bg-emerald-600 text-white font-semibold hover:bg-emerald-700">
              Ver en presupuesto →
            </button>
          )}
        </div>
      )}
      {/* Banner error al enviar */}
      {sendStatus === 'error' && sendMsg && (
        <div className="mx-2 mt-2 flex items-start gap-1.5 px-2.5 py-1.5 bg-red-50 border border-red-200 rounded-lg text-[10px] text-red-700 shrink-0">
          <AlertTriangle size={11} className="shrink-0 mt-px" />
          <span className="break-all">{sendMsg}</span>
        </div>
      )}

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
                    <button
                      onClick={() => setApuItem(item)}
                      title="Transformar en APU Maestro (agrupa todos los ítems del mismo tipo)"
                      className="p-1 text-slate-300 hover:text-blue-600 transition-colors"
                    >
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
        <div className="p-2 border-t border-slate-100 flex flex-col gap-1.5 shrink-0">
          {/* Fila 1: acciones secundarias */}
          <div className="flex items-center gap-1">
            <button onClick={onClear}
              className="flex items-center gap-1 px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-200 transition-colors">
              <RefreshCcw size={11} /> Limpiar
            </button>
            <div className="ml-auto flex items-center gap-1">
              <button onClick={onExportCSV} title="Descargar CSV"
                className="flex items-center gap-1 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors">
                <Download size={11} /> CSV
              </button>
              <button onClick={() => setReportMode('computo')} title="Vista previa — Reporte Cómputo"
                className="flex items-center gap-1 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors">
                <FileText size={11} /> Cómputo
              </button>
              <button onClick={() => setReportMode('apu')} title="Vista previa — Reporte APU"
                className="flex items-center gap-1 px-2 py-1.5 text-xs text-blue-700 hover:bg-blue-50 rounded-lg border border-blue-200 transition-colors">
                <BookOpen size={11} /> APU
              </button>
            </div>
          </div>
          {/* Fila 2: CTAs principales */}
          {projectId ? (
            <>
              {/* Enviar al presupuesto — CTA primaria */}
              <button
                onClick={handleSendToPresupuesto}
                disabled={sendStatus === 'sending' || saveStatus === 'saving'}
                title="Guarda el cómputo, crea los ítems nuevos y actualiza la cantidad de los que ya están en el presupuesto"
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {sendStatus === 'sending'
                  ? <><Loader2 size={12} className="animate-spin" /> Enviando…</>
                  : <><ShoppingCart size={12} /> Enviar al presupuesto</>
                }
              </button>
              {/* Guardar cómputo — acción secundaria (solo persiste, sin budget_items) */}
              <button
                onClick={handleSaveComputation}
                disabled={saveStatus === 'saving' || sendStatus === 'sending'}
                title="Guarda los rubros como sesión de cómputo sin crear ítems de presupuesto"
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {saveStatus === 'saving'
                  ? <><Loader2 size={11} className="animate-spin" /> Guardando…</>
                  : <><Save size={11} /> Guardar cómputo</>
                }
              </button>
            </>
          ) : (
            <div className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] text-slate-400 bg-slate-50 border border-slate-200 rounded-lg">
              Seleccioná un proyecto para guardar
            </div>
          )}
        </div>
      )}

      {/* Modal transformar en APU */}
      {apuItem && (
        <CreateAPUModal
          triggerItem={apuItem}
          allItems={items}
          orgMaterials={orgMaterials}
          existingNames={existingNames}
          organizationId={organizationId}
          onClose={() => setApuItem(null)}
          onCreated={taskName => {
            setApuItem(null);
            setApuSuccess(taskName);
            setTimeout(() => setApuSuccess(null), 5000);
            onAPUCreated?.();
          }}
        />
      )}

      {/* Modal reporte */}
      {reportMode && (
        <ReportPreviewModal
          mode={reportMode}
          items={items}
          resolved={resolved}
          grandTotal={grandTotal}
          onClose={() => setReportMode(null)}
        />
      )}
    </div>
  );
};

// ─── Layout presets y escala tipográfica ─────────────────────────────────────

type FontScale = 'sm' | 'md' | 'lg';

const clampW = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

const LAYOUT_PRESETS = [
  { key: 'catalog',     label: 'Catálogo',    left: 360, right: 340 },
  { key: 'balanced',    label: 'Balanceada',  left: 290, right: 290 },
  { key: 'calc',        label: 'Cálculo',     left: 200, right: 200 },
  { key: 'composition', label: 'Composición', left: 200, right: 420 },
] as const;

const FONT_ZOOM: Record<FontScale, number> = { sm: 0.875, md: 1, lg: 1.125 };

// ─── Draft persistence (localStorage) ────────────────────────────────────────

const DRAFT_VERSION = 'v2'; // v2: key scoped por projectId (v1 queda huérfana)

function draftKey(orgId: string, userId: string, projectId: string) {
  return `chandias_draft_${DRAFT_VERSION}_${orgId}_${userId}_${projectId}`;
}

interface ChandiasDraft {
  items: ChandiasAddedItem[];
  savedAt: string; // ISO
  selectedTaskId?: string;
  panelState?: DetailPanelState | null;
}

function loadDraft(orgId: string, userId: string, projectId: string): ChandiasDraft | null {
  if (!orgId || !userId || !projectId) return null;
  try {
    const raw = localStorage.getItem(draftKey(orgId, userId, projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChandiasDraft;
    if (!Array.isArray(parsed.items) || parsed.items.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveDraft(
  orgId: string,
  userId: string,
  projectId: string,
  items: ChandiasAddedItem[],
  selectedTaskId: string | null,
  panelState?: DetailPanelState | null,
) {
  if (!orgId || !userId || !projectId) return;
  if (items.length === 0) {
    localStorage.removeItem(draftKey(orgId, userId, projectId));
    return;
  }
  try {
    const draft: ChandiasDraft = {
      items,
      savedAt: new Date().toISOString(),
      ...(selectedTaskId ? { selectedTaskId } : {}),
      ...(panelState ? { panelState } : {}),
    };
    localStorage.setItem(draftKey(orgId, userId, projectId), JSON.stringify(draft));
  } catch {
    // cuota de storage llena — ignorar silenciosamente
  }
}

// ─── Componente principal ─────────────────────────────────────────────────────

export const ChandiasCalculator: React.FC<{ onNavigate?: (tab: string) => void }> = ({ onNavigate }) => {
  const { user } = useAuth();
  const orgId    = user?.organizationId ?? '';

  const { tasks: masterTasks, refetch: refetchMasterTasks } = useMasterTasks(orgId);
  const {
    materials: erpMaterials,
    project,
    tasks: projectTasks,
    laborCategoriesMap,
    toolsMap,
    addTask,
    addMaterial,
    updateMaterial,
    updateLaborCategory,
    addBudgetItem,
    updateBudgetItem,
    addTaskYield,
    addTaskLaborYield,
    addTaskToolYield,
  } = useERP();
  const { list: unifiedList }            = useUnifiedMaterials(orgId);
  // Fallback: si unifiedList todavía está vacío (Supabase aún cargando),
  // usar los materiales del proyecto ya disponibles en ERPContext.
  const orgMaterials: OrgMaterialLookup[] = unifiedList.length > 0 ? unifiedList : erpMaterials;

  // Set de nombres existentes para el check de duplicados en el modal
  const existingNames = useMemo(
    () => new Set(masterTasks.map(t => t.name.trim().toLowerCase())),
    [masterTasks],
  );

  // Set de nombres de tareas YA en el presupuesto — para dedup en "Enviar al presupuesto"
  const budgetTaskNamesSet = useMemo(() => {
    const budgetTaskIds = new Set((project?.items ?? []).map(bi => bi.taskId));
    return new Set(
      projectTasks
        .filter(t => budgetTaskIds.has(t.id))
        .map(t => t.name.trim().toLowerCase()),
    );
  }, [project?.items, projectTasks]);

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [items, setItems] = useState<ChandiasAddedItem[]>([]);
  const [restoredAt, setRestoredAt] = useState(0);

  // ── Draft persistence ────────────────────────────────────────────────────
  const userId    = user?.id ?? '';
  const projectId = project?.id ?? '';
  // Estado del panel de detalle (dims, config avanzada) para persistir en el borrador
  const [panelState, setPanelState]               = useState<DetailPanelState | null>(null);
  const [initialPanelState, setInitialPanelState] = useState<DetailPanelState | null>(null);
  // Banner: muestra confirmación DESPUÉS de auto-restaurar (o null si no hay borrador)
  const [draftBanner, setDraftBanner] = useState<{ savedAt: string } | null>(null);

  const handlePanelStateChange = useCallback((state: DetailPanelState) => {
    setPanelState(state);
  }, []);

  // Flag: evita que el auto-save borre el borrador antes de que auth cargue.
  const itemsInteracted = useRef(false);

  // Al montar Y al cambiar de proyecto: limpiar estado y restaurar el draft del proyecto activo.
  // Incluir projectId en deps garantiza que al cambiar de proyecto se resetea correctamente.
  useEffect(() => {
    if (!orgId || !userId || !projectId) return;
    // Limpiar estado del proyecto anterior antes de restaurar el nuevo
    setItems([]);
    setSelectedTaskId(null);
    setPanelState(null);
    setInitialPanelState(null);
    setDraftBanner(null);
    itemsInteracted.current = false;
    // Restaurar draft del proyecto activo (si existe)
    const draft = loadDraft(orgId, userId, projectId);
    if (!draft) return;
    setItems(draft.items);
    if (draft.selectedTaskId) setSelectedTaskId(draft.selectedTaskId);
    if (draft.panelState)    setInitialPanelState(draft.panelState);
    setRestoredAt(n => n + 1);
    itemsInteracted.current = true;
    setDraftBanner({ savedAt: draft.savedAt });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, userId, projectId]);

  // Auto-save con debounce 1.5 s cada vez que items, selectedTaskId o panelState cambia.
  // Solo activa luego de la primera interacción o restauración.
  useEffect(() => {
    if (!orgId || !userId || !projectId || !itemsInteracted.current) return;
    const t = setTimeout(() => saveDraft(orgId, userId, projectId, items, selectedTaskId, panelState), 1500);
    return () => clearTimeout(t);
  }, [items, selectedTaskId, panelState, orgId, userId, projectId]);

  const handleDiscardDraft = () => {
    localStorage.removeItem(draftKey(orgId, userId, projectId));
    setItems([]);
    setSelectedTaskId(null);
    setInitialPanelState(null);
    setPanelState(null);
    itemsInteracted.current = false;
    setDraftBanner(null);
  };

  // ── Panel resize ──────────────────────────────────────────────────────────
  const [leftW,  setLeftW]  = useState(360);  // preset "Catálogo" por defecto
  const [rightW, setRightW] = useState(340);

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

  const handleAdd    = useCallback((item: ChandiasAddedItem) => {
    itemsInteracted.current = true;
    setItems(prev => [...prev, item]);
  }, []);
  const handleRemove = useCallback((id: string) => {
    itemsInteracted.current = true;
    setItems(prev => prev.filter(i => i.itemId !== id));
  }, []);
  const handleClear  = useCallback(() => {
    itemsInteracted.current = false;
    setItems([]);
    setPanelState(null);
    setInitialPanelState(null);
    setDraftBanner(null);
    if (orgId && userId && projectId) localStorage.removeItem(draftKey(orgId, userId, projectId));
  }, [orgId, userId]);

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

  const handleSaveComputation = useCallback(async () => {
    if (items.length === 0) throw new Error('Sin rubros para guardar');
    if (!projectId) throw new Error('Seleccioná un proyecto activo');
    try {
      const session = await computationService.createSession(projectId, orgId);
      await computationService.addItems(session.id, orgId, items);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('does not exist') || msg.includes('42P01')) {
        throw new Error('Migración 040 pendiente — ejecutá el script en Supabase Dashboard');
      }
      throw err;
    }
  }, [items, projectId, orgId]);

  /**
   * Guarda cómputo en Supabase Y crea tasks + budget_items en el proyecto.
   * Retorna un mensaje de éxito para que RightPanel lo muestre.
   *
   * Duplicados: ítems cuyo taskNombre ya existe en el presupuesto son omitidos.
   * Trazabilidad: budgetItem.computationItemId = UUID del computation_item en DB.
   *   Si migration 040 no está ejecutada, se continúa sin computationItemId.
   */
  const handleSendToPresupuesto = useCallback(async (): Promise<string> => {
    if (items.length === 0) throw new Error('Sin rubros para enviar');
    if (!projectId || !project?.id) throw new Error('Seleccioná un proyecto activo');

    // ── 1. Guardar sesión de cómputo para trazabilidad ────────────────────
    // { chandiasAddedItem.itemId → computation_item UUID }
    let computationItemIdMap: Record<string, string> = {};
    try {
      const session    = await computationService.createSession(projectId, orgId);
      const savedItems = await computationService.addItems(session.id, orgId, items);
      // addItems inserta en el mismo orden → zip por posición
      items.forEach((item, i) => {
        if (savedItems[i]) computationItemIdMap[item.itemId] = savedItems[i].id;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('does not exist') || msg.includes('42P01')) {
        // Migration 040 no ejecutada — continuar sin computationItemId
        computationItemIdMap = {};
      } else {
        throw err;
      }
    }

    // ── 2. Construir payloads ─────────────────────────────────────────────
    const { payloads, noAPUPayloads, existingUpdates } = buildComputationImportPayloads(
      items,
      masterTasks,
      orgId,
      project.id,
      laborCategoriesMap,
      toolsMap,
      erpMaterials,
      budgetTaskNamesSet,
      computationItemIdMap,
    );

    const totalToSend = payloads.length + noAPUPayloads.length;

    // Ítems que ya estaban: se actualiza la cantidad (no se duplican ni se omiten).
    const budgetItemsByName = new Map<string, { id: string; quantity: number; name: string }[]>();
    for (const bi of project.items) {
      const t = projectTasks.find(pt => pt.id === bi.taskId);
      const key = t?.name.trim().toLowerCase();
      if (!key) continue;
      budgetItemsByName.set(key, [...(budgetItemsByName.get(key) ?? []), { id: bi.id, quantity: bi.quantity, name: t!.name.trim() }]);
    }
    const touchedIds: string[] = [];
    const repeated: string[] = [];
    let updatedCount = 0;
    for (const u of existingUpdates) {
      const matches = budgetItemsByName.get(u.nameKey) ?? [];
      if (matches.length === 0) continue;
      // Repetida en el presupuesto: no se adivina cuál actualizar; se avisa y se resaltan todas.
      if (matches.length > 1) {
        repeated.push(`${matches[0].name} está ${matches.length} veces`);
        touchedIds.push(...matches.map(m => m.id));
        continue;
      }
      const bi = matches[0];
      touchedIds.push(bi.id);
      const qty = Number(u.quantity.toFixed(2));
      if (Math.abs(bi.quantity - qty) > 0.005 || u.computationItemId) {
        updateBudgetItem(bi.id, { quantity: qty, ...(u.computationItemId ? { computationItemId: u.computationItemId } : {}) });
        updatedCount++;
      }
    }

    const repeatedMsg = repeated.length > 0 ? ` · No se actualizó porque ${repeated.join('; ')}: unificalas o editá la cantidad a mano` : '';

    if (totalToSend === 0 && updatedCount === 0) {
      setPendingHighlight(touchedIds);
      return (repeated.length > 0 ? 'Sin cambios' : 'Sin cambios: el presupuesto ya tiene estas cantidades') + repeatedMsg;
    }

    // ── 3. Crear tasks + yields + budget_items ────────────────────────────
    // Índice de precios vivos (master_materials / project materials) por nombre
    // para enriquecer materiales nuevos que llegan con lastKnownUnitPrice=null.
    const livePriceByName = new Map<string, number>(
      orgMaterials
        .filter(u => u.cost > 0)
        .map(u => [u.name.trim().toLowerCase(), u.cost]),
    );
    for (const p of payloads) {
      p.materialsToCreate
        .map(m => m.cost > 0 ? m : { ...m, cost: livePriceByName.get(m.name.trim().toLowerCase()) ?? 0 })
        .forEach(m => addMaterial(m));
      p.materialsToUpdate.forEach(({ id, cost }) => updateMaterial(id, { cost }));
      p.laborCategoriesToUpdate.forEach(({ id, basicHourlyRate }) => updateLaborCategory(id, { basicHourlyRate }));
      await addTask(p.task);
      p.taskYields.forEach(ty => addTaskYield(ty));
      p.laborYields.forEach(ly => addTaskLaborYield(ly));
      p.toolYields.forEach(ty => addTaskToolYield(ty));
      addBudgetItem(p.budgetItem);
      touchedIds.push(p.budgetItem.id);
    }
    for (const { task, budgetItem } of noAPUPayloads) {
      await addTask(task);
      addBudgetItem(budgetItem);
      touchedIds.push(budgetItem.id);
    }
    setPendingHighlight(touchedIds);

    // ── 4. Mensaje de resultado ───────────────────────────────────────────
    const parts: string[] = [];
    if (totalToSend > 0) parts.push(`${totalToSend} ítem${totalToSend > 1 ? 's' : ''} nuevo${totalToSend > 1 ? 's' : ''}`);
    if (updatedCount > 0) parts.push(`${updatedCount} cantidad${updatedCount > 1 ? 'es' : ''} actualizada${updatedCount > 1 ? 's' : ''}`);
    if (noAPUPayloads.length > 0) {
      parts.push(`${noAPUPayloads.length} sin APU (costo = 0)`);
    }
    return parts.join(' · ') + repeatedMsg;
  }, [
    items, projectId, project?.id, orgId, masterTasks, orgMaterials,
    laborCategoriesMap, toolsMap, erpMaterials, budgetTaskNamesSet,
    addTask, addMaterial, updateMaterial, updateLaborCategory,
    addTaskYield, addTaskLaborYield, addTaskToolYield, addBudgetItem, updateBudgetItem, project?.items, projectTasks,
  ]);

  // ── Preset activo (coincidencia exacta de anchos) ─────────────────────────
  const activePreset = LAYOUT_PRESETS.find(p => p.left === leftW && p.right === rightW)?.key ?? null;

  return (
    <div
      className="flex flex-col bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden"
      style={{ height: 'calc(100vh - 220px)', minHeight: '500px' }}
    >
      {/* ── Banner de borrador restaurado ────────────────────────────────────── */}
      {draftBanner && (
        <div className="flex items-center gap-3 px-4 py-2 bg-emerald-50 border-b border-emerald-200 shrink-0">
          <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
          <span className="text-xs text-emerald-800">
            Borrador restaurado del{' '}
            <strong>{new Date(draftBanner.savedAt).toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}</strong>
            {' '}— podés continuar donde dejaste.
          </span>
          <button
            onClick={handleDiscardDraft}
            className="ml-auto px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-300 rounded-lg hover:bg-emerald-100 transition-colors"
          >
            Descartar
          </button>
          <button
            onClick={() => setDraftBanner(null)}
            className="p-1 text-emerald-500 hover:text-emerald-700 rounded"
            title="Cerrar notificación"
          >
            <X size={13} />
          </button>
        </div>
      )}

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
        <DetailPanel
          task={selectedTask}
          orgMaterials={orgMaterials}
          onAdd={handleAdd}
          onPanelStateChange={handlePanelStateChange}
          initialPanelState={initialPanelState}
        />

        {/* Separador arrastreable R */}
        <div
          className="w-1.5 shrink-0 cursor-col-resize bg-transparent hover:bg-blue-200 active:bg-blue-400 transition-colors"
          onMouseDown={e => { e.preventDefault(); startDrag('right', e.clientX, rightW); }}
        />

        {/* Panel derecho — resumen */}
        <div style={{ width: rightW }} className="shrink-0 overflow-hidden">
          <RightPanel
            items={items} orgMaterials={orgMaterials}
            organizationId={orgId} projectId={projectId} existingNames={existingNames}
            onRemove={handleRemove} onClear={handleClear} onExportCSV={handleExportCSV}
            onSaveComputation={handleSaveComputation}
            onSendToPresupuesto={handleSendToPresupuesto}
            restoredAt={restoredAt}
            onAPUCreated={refetchMasterTasks}
            onViewInBudget={onNavigate ? () => onNavigate('budget') : undefined}
          />
        </div>
      </div>
    </div>
  );
};
