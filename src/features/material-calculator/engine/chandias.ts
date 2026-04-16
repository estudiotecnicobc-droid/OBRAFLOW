import { ChandiasTask, ChandiasTaskMaterial } from '../catalog/chandiasCatalog';
import { normalizeStr } from '../../../../utils/normalizeStr';

// ─── Tipos del motor ──────────────────────────────────────────────────────────

export interface ChandiasCalcMaterial {
  nombre: string;
  unit: string;
  coef: number;
  cantidad: number; // coef × quantity
}

export interface ChandiasCalcResult {
  taskId: string;
  taskNombre: string;
  unidad: string;
  quantity: number;
  dims: Record<string, number>;
  materiales: ChandiasCalcMaterial[];
}

/** Material ingresado manualmente al ítem (no derivado del catálogo paramétrico). */
export interface ManualMaterial {
  id: string;
  nombre: string;
  unit: string;
  cantidad: number;   // cantidad directa (no coeficiente)
  code?: string;      // para mejor matching por código
}

export interface ChandiasAddedItem extends ChandiasCalcResult {
  itemId: string;       // UUID local
  description: string;  // texto libre (ubicación, eje, etc.)
  manualMaterials?: ManualMaterial[];  // materiales adicionales ingresados a mano
}

export interface ConsolidatedMaterial {
  nombre: string;
  unit: string;
  cantidad: number;
}

// ─── Funciones puras ──────────────────────────────────────────────────────────

/**
 * Evalúa una expresión aritmética con los ids de dims como variables.
 * Usa new Function — safe para expresiones propias del catálogo (sin input externo).
 */
export function evaluateFormula(
  formula: string,
  dims: Record<string, number>,
): number {
  if (!formula || Object.values(dims).some(v => isNaN(v))) return 0;
  try {
    const keys = Object.keys(dims);
    const vals = Object.values(dims);
    // eslint-disable-next-line no-new-func
    const result = new Function(...keys, `return (${formula});`)(...vals);
    return typeof result === 'number' && isFinite(result) ? result : 0;
  } catch {
    return 0;
  }
}

/**
 * Calcula la cantidad del rubro y los materiales derivados para unas dimensiones dadas.
 */
export function calculateTask(
  task: ChandiasTask,
  dims: Record<string, number>,
): ChandiasCalcResult {
  const quantity = evaluateFormula(task.formula, dims);
  const materiales: ChandiasCalcMaterial[] = task.materiales.map(m => ({
    nombre: m.nombre,
    unit: m.unit,
    coef: m.coef,
    cantidad: parseFloat((m.coef * quantity).toFixed(4)),
  }));
  return {
    taskId: task.id,
    taskNombre: task.nombre,
    unidad: task.unidad,
    quantity: parseFloat(quantity.toFixed(4)),
    dims,
    materiales,
  };
}

/**
 * Consolida los materiales de todos los ítems agregados sumando por nombre+unidad.
 */
export function consolidateMaterials(
  items: ChandiasAddedItem[],
): ConsolidatedMaterial[] {
  const map = new Map<string, ConsolidatedMaterial>();
  for (const item of items) {
    for (const m of item.materiales) {
      const k = `${m.nombre}|${m.unit}`;
      if (!map.has(k)) {
        map.set(k, { nombre: m.nombre, unit: m.unit, cantidad: 0 });
      }
      map.get(k)!.cantidad += m.cantidad;
    }
  }
  return [...map.values()]
    .map(m => ({ ...m, cantidad: parseFloat(m.cantidad.toFixed(4)) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

// ─── Mapeo a materiales reales ────────────────────────────────────────────────

/**
 * Lookup mínimo: solo los campos necesarios para resolver costo y conversión.
 * Satisfecho por Material (types.ts) sin importarlo — el motor permanece puro.
 *
 * Convención de precios:
 *   · cost          — precio de referencia (puede ser técnico o comercial según la fuente)
 *   · commercialPrice — precio comercial ORIGINAL cuando conversionFactor > 1
 *                       (ej: precio por bolsa 50 kg = 13500)
 *   Si commercialPrice está disponible: precioTécnico = commercialPrice / conversionFactor
 *   Si no: precioTécnico = cost (ya técnico, sin conversión pendiente)
 */
export interface OrgMaterialLookup {
  code?: string;
  name: string;
  unit?: string;              // unidad técnica (kg, m2, m3, etc.)
  cost: number;
  commercialUnit?: string;    // Ej: "bolsa 50 kg"
  conversionFactor?: number;  // 1 unidad comercial = N unidades técnicas
  commercialPrice?: number;   // precio comercial original (antes de dividir por CF)
}

export type MatchedBy = 'code' | 'name' | 'missing';

export interface ResolvedMaterial extends ChandiasCalcMaterial {
  unitCost: number;
  totalCost: number;
  matchedBy: MatchedBy;
  commercialUnit?: string;   // Heredado del material org
  conversionFactor?: number;
  purchaseQty?: number;      // CEIL(cantidad / conversionFactor), undefined si no aplica
}

/**
 * Convierte cantidad técnica a unidades comerciales (redondeando hacia arriba).
 * Retorna undefined si no hay factor de conversión definido o es inválido.
 */
export function convertToCommercial(
  quantity: number,
  conversionFactor: number | undefined,
): number | undefined {
  if (!conversionFactor || conversionFactor <= 0) return undefined;
  return Math.ceil(quantity / conversionFactor);
}


/**
 * Aliases de nombres: variantes de nomenclatura entre catálogo y DB.
 * IMPORTANTE: las claves y valores deben estar ya normalizadas (sin acentos, lowercase)
 * porque tanto el key-lookup como la comparación de candidatos usan normalizeStr().
 * Regla: normalizeStr("Cal Hidráulica") === "cal hidraulica" → clave sin acento.
 */
const NAME_ALIASES: Record<string, string[]> = {
  // ── Aglomerantes ──────────────────────────────────────────────────────────
  // Cal: cubre 'Cal hidráulica', 'Cal hidratada', 'CAL HIDRÁULICA EN POLVO' (seed I1000)
  'cal hidratada':              ['cal hidraulica', 'cal hidraulica en polvo'],
  'cal hidraulica':             ['cal hidratada',  'cal hidraulica en polvo'],
  'cal hidraulica en polvo':    ['cal hidraulica', 'cal hidratada'],
  'cal hidratada en polvo':     ['cal aerea en polvo', 'cal hidraulica en polvo'],
  'cal aerea en polvo':         ['cal hidratada en polvo', 'cal hidraulica en polvo'],
  // Cemento: cubre 'Cemento Portland CPN 40', 'CEMENTO PORTLAND' (seed I1001), 'Cemento Loma Negra'
  'cemento portland cpn 40':    ['cemento portland cpn40', 'cemento portland', 'cemento loma negra'],
  'cemento portland cpn40':     ['cemento portland cpn 40', 'cemento portland', 'cemento loma negra'],
  'cemento portland':           ['cemento portland cpn 40', 'cemento portland cpn40', 'cemento loma negra'],
  'cemento loma negra':         ['cemento portland cpn 40', 'cemento portland'],

  // ── Áridos ────────────────────────────────────────────────────────────────
  'arena gruesa':            ['arena gruesa limpia'],
  'arena gruesa limpia':     ['arena gruesa'],
  'arena fina cernida':      ['arena fina lavada', 'arena fina'],
  'arena fina lavada':       ['arena fina cernida', 'arena fina'],
  'piedra partida 6/20':     ['piedra triturada 6/20'],
  'piedra triturada 6/20':   ['piedra partida 6/20'],

  // ── Ladrillo común ────────────────────────────────────────────────────────
  // normalizeStr elimina acentos → "común"/"comun" → misma clave "ladrillo comun"
  'ladrillo comun 6x12x24':  ['ladrillo comun', 'ladrillo comun 15 cm', 'i1003'],
  'ladrillo comun':          ['ladrillo comun 6x12x24', 'ladrillo comun 15 cm'],
  'ladrillo comun 15 cm':    ['ladrillo comun', 'ladrillo comun 6x12x24'],

  // ── Ladrillo hueco 8 cm (e=0.08) ─────────────────────────────────────────
  'ladrillo hueco 8x18x33':  ['ladrillo hueco 8cm', 'i1012', 'mat_ladrillo_hueco_8_18_33'],
  'ladrillo hueco 8cm':      ['ladrillo hueco 8x18x33', 'mat_ladrillo_hueco_8_18_33'],

  // ── Ladrillo hueco 12 cm (e=0.12) ────────────────────────────────────────
  'ladrillo hueco 12x18x33':         ['ladrillo ceramico hueco 12x18x33', 'i1013'],
  'ladrillo ceramico hueco 12x18x33': ['ladrillo hueco 12x18x33'],

  // ── Ladrillo hueco 18 cm (e=0.20) ────────────────────────────────────────
  'ladrillo hueco 18x18x33':         ['ladrillo ceramico hueco 18x18x33', 'i1014'],
  'ladrillo ceramico hueco 18x18x33': ['ladrillo hueco 18x18x33'],

  // ── Yeso ─────────────────────────────────────────────────────────────────
  // Catálogo usa "Yeso común para construcción" y "Yeso común para cielorraso"
  // Seed 019 tiene "Yeso de construcción"
  'yeso comun para construccion':    ['yeso de construccion', 'yeso comun'],
  'yeso comun para cielorraso':      ['yeso de construccion', 'yeso comun'],
  'yeso de construccion':            ['yeso comun para construccion', 'yeso comun para cielorraso'],

  // ── Adhesivo / Cemento cola ───────────────────────────────────────────────
  // Catálogo usa variantes: "Cemento cola blanca", "Cemento cola (bolsa 25kg)", etc.
  // Seed 019 tiene "Adhesivo para cerámicos"
  'cemento cola blanca':             ['adhesivo para ceramicos'],
  'cemento cola blanca flexible':    ['adhesivo para ceramicos'],
  'cemento cola (bolsa 25kg)':       ['adhesivo para ceramicos'],
  'cemento cola flexible':           ['adhesivo para ceramicos'],
  'cemento cola':                    ['adhesivo para ceramicos'],
  'adhesivo para ceramicos':         ['cemento cola blanca', 'cemento cola (bolsa 25kg)', 'cemento cola'],

  // ── Pastina ───────────────────────────────────────────────────────────────
  // Catálogo usa "Pastina blanca fina", "Pastina cementicia blanca", "Pastina epoxi / cementicia"
  // Seed 023 agrega "Pastina cementicia" como material base
  'pastina blanca fina':             ['pastina cementicia', 'pastina'],
  'pastina cementicia blanca':       ['pastina cementicia', 'pastina'],
  'pastina epoxi / cementicia':      ['pastina cementicia', 'pastina'],
  'pastina':                         ['pastina cementicia'],
  'pastina cementicia':              ['pastina blanca fina', 'pastina cementicia blanca'],

  // ── Azulejo ──────────────────────────────────────────────────────────────
  // "Azulejo 15×15cm (c/4% desp.)" — el "(c/X% desp.)" es waste embebido en el nombre.
  // El × (U+00D7) no es ASCII x — normalizeStr lo preserva. Se cubren ambas grafías.
  // Seed 023 agrega "Azulejo 15×15cm" como material base.
  'azulejo 15\u00d715cm (c/4% desp.)': ['azulejo 15\u00d715cm', 'azulejo 15x15cm', 'azulejo ceramico', 'azulejo'],

  // ── Porcelanato — variante con factor desperdicio en el nombre ─────────────
  // Seed 019 tiene "Porcelanato 60x60 cm" (ASCII x, espacio); catálogo usa "60×60cm" (×, sin espacio)
  'porcelanato 60\u00d760cm (c/5% desp.)': ['porcelanato 60x60 cm', 'porcelanato 60\u00d760cm', 'porcelanato 60\u00d760 cm'],

  // ── Pinturas ─────────────────────────────────────────────────────────────
  // "Pintura látex vinílico interior" → Seed 019: "Pintura látex interior blanco"
  'pintura latex vinilico interior':    ['pintura latex interior blanco', 'pintura latex interior'],
  // "Pintura látex acrílico exterior" → Seed 019: "Pintura látex exterior"
  'pintura latex acrilico exterior':    ['pintura latex exterior', 'latex exterior'],
  // "Enduído plástico interior" → Seed 019: "Enduido plástico"
  'enduido plastico interior':          ['enduido plastico'],
  // "Sellador acrílico fijador" → Seed 019: "Fijador de paredes"
  'sellador acrilico fijador':          ['fijador de paredes', 'sellador fijador', 'fijador acrilico'],
  // "Fijador acrílico para exteriores" → Seed 019: "Fijador de paredes"
  'fijador acrilico para exteriores':   ['fijador de paredes'],
};

/**
 * Resuelve el costo real de un material calculado buscando en la base de la org.
 * Prioridad: 1) code exacto (case-insensitive)  2) name normalizado (con aliases)  3) missing
 */
export function mapMaterialToReal(
  m: ChandiasCalcMaterial & Pick<ChandiasTaskMaterial, 'code'>,
  orgMaterials: OrgMaterialLookup[],
): ResolvedMaterial {
  let unitCost = 0;
  let matchedBy: MatchedBy = 'missing';
  let matched: OrgMaterialLookup | undefined;

  // 1. Buscar por code exacto (case-insensitive)
  if (m.code) {
    matched = orgMaterials.find(
      r => r.code && r.code.toLowerCase() === m.code!.toLowerCase(),
    );
    if (matched) { unitCost = matched.cost; matchedBy = 'code'; }
  }

  // 2. Fallback por nombre normalizado (con aliases para variantes de nomenclatura)
  if (matchedBy === 'missing') {
    const target = normalizeStr(m.nombre);
    const candidates = [target, ...(NAME_ALIASES[target] ?? [])];
    for (const candidate of candidates) {
      matched = orgMaterials.find(r => normalizeStr(r.name) === candidate);
      if (matched) { unitCost = matched.cost; matchedBy = 'name'; break; }
    }
  }

  const conversionFactor = matched?.conversionFactor;
  const commercialUnit   = matched?.commercialUnit;

  // Convertir precio comercial → técnico cuando el material tiene CF.
  // Si commercialPrice está disponible (precio por bolsa, barra, etc.):
  //   precioTécnico = commercialPrice / conversionFactor
  // Si solo hay cost (ya técnico) y no hay commercialPrice: usar cost directo.
  if (matched) {
    const cf = conversionFactor;
    if (cf && cf > 0 && matched.commercialPrice) {
      unitCost = matched.commercialPrice / cf;
    } else {
      unitCost = matched.cost;
    }
  }

  return {
    ...m,
    unitCost,
    totalCost: parseFloat((unitCost * m.cantidad).toFixed(2)),
    matchedBy,
    conversionFactor,
    commercialUnit,
    purchaseQty: convertToCommercial(m.cantidad, conversionFactor),
  };
}

/**
 * Consolida materiales resueltos (suma cantidad y costo) para el panel de totales.
 */
export function consolidateResolved(
  items: ChandiasAddedItem[],
  orgMaterials: OrgMaterialLookup[],
): ResolvedMaterial[] {
  // Acumular por clave nombre|unit
  const map = new Map<string, ResolvedMaterial>();
  for (const item of items) {
    for (const m of item.materiales) {
      const k = `${m.nombre}|${m.unit}`;
      const resolved = mapMaterialToReal({ ...m, code: undefined }, orgMaterials);
      if (!map.has(k)) {
        map.set(k, { ...resolved });
      } else {
        const acc = map.get(k)!;
        acc.cantidad = parseFloat((acc.cantidad + m.cantidad).toFixed(4));
        acc.totalCost = parseFloat((acc.unitCost * acc.cantidad).toFixed(2));
        // Recomputar purchaseQty sobre la cantidad acumulada final
        acc.purchaseQty = convertToCommercial(acc.cantidad, acc.conversionFactor);
      }
    }
  }
  return [...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

// ─── Superficie neta de muros (extensible a revoques, pisos, etc.) ─────────────

/**
 * Representa una abertura o descuento de superficie (puerta, ventana, vano).
 * Se mantiene separado del catálogo — es configuración de obra, no del rubro.
 */
export interface WallOpening {
  id: string;
  tipo: string;     // 'Ventana' | 'Puerta' | 'Otro'
  ancho: number;    // m
  alto: number;     // m
  cantidad: number; // unidades iguales
}

export interface AdvancedWallConfig {
  nWalls: number;           // muros iguales (≥ 1)
  openings: WallOpening[];  // aberturas a descontar
}

/**
 * Calcula superficie bruta, descontada y neta para un conjunto de muros iguales.
 * Función pura — sin side effects, extensible a revoques / pisos / losas.
 *
 * superficie bruta    = largo × alto × nWalls
 * superficie descontada = Σ(abertura.ancho × abertura.alto × abertura.cantidad)
 * superficie neta     = max(0, bruta - descontada)
 */
export function computeNetWallArea(
  largo: number,
  alto: number,
  cfg: AdvancedWallConfig,
): { bruta: number; descontada: number; neta: number } {
  const n      = Math.max(1, cfg.nWalls);
  const bruta  = Math.max(0, largo) * Math.max(0, alto) * n;
  const descontada = cfg.openings.reduce(
    (s, o) => s + Math.max(0, o.ancho) * Math.max(0, o.alto) * Math.max(0, o.cantidad),
    0,
  );
  return { bruta, descontada, neta: Math.max(0, bruta - descontada) };
}

// ─── Superficie neta de pisos ─────────────────────────────────────────────────

/**
 * Sector de piso con dimensiones propias (ambiente adicional de distinto tamaño).
 */
export interface FloorSector {
  id: string;
  largo: number;
  ancho: number;
}

export interface AdvancedFloorConfig {
  nRooms: number;           // Ambientes iguales con las dims base (≥ 1)
  sectors: FloorSector[];   // Sectores adicionales con dimensiones propias
}

/**
 * Calcula superficie total de pisos.
 *
 * base       = largo × ancho × nRooms
 * sectores   = Σ(sector.largo × sector.ancho)
 * total      = base + sectores
 */
export function computeNetFloorArea(
  largo: number,
  ancho: number,
  cfg: AdvancedFloorConfig,
): { base: number; sectoresTotal: number; total: number } {
  const n = Math.max(1, cfg.nRooms);
  const base = Math.max(0, largo) * Math.max(0, ancho) * n;
  const sectoresTotal = cfg.sectors.reduce(
    (s, sec) => s + Math.max(0, sec.largo) * Math.max(0, sec.ancho),
    0,
  );
  return { base, sectoresTotal, total: parseFloat((base + sectoresTotal).toFixed(4)) };
}

/**
 * Devuelve las categorías únicas del catálogo (en orden de aparición).
 */
export function getCategories(tasks: ChandiasTask[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const t of tasks) {
    if (!seen.has(t.categoria)) {
      seen.add(t.categoria);
      result.push(t.categoria);
    }
  }
  return result;
}
