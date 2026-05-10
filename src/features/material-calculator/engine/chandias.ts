import { ChandiasTask, ChandiasTaskMaterial, ChandiasTaskDerivedOutput } from '../catalog/chandiasCatalog';
import { normalizeStr } from '../../../../utils/normalizeStr';
import { getSteelBarWeight, getSteelBarsNeeded, DEFAULT_REBAR_DIAMETER_MM } from './steelRebars';
import { isSteelMaterial, isGenericSteelMaterial, resolveSteelPricingModel } from './steelWorkflow';

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
  steelDiameterMm?: number;  // diámetro de barra elegido (beam family) — para compra inteligente en consolidado
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
 * Inyecta el conversion_factor correcto para materiales de acero en barra cuyo
 * CF no está almacenado en DB (varía por diámetro — ver migration 022).
 *
 * Criterio de detección: nombre contiene 'acero' o 'hierro' Y no tiene CF definido.
 * NO depende de que commercial_unit exista en DB (puede llegar NULL).
 *
 * En ese estado: `cost` en OrgMaterialLookup = precio por barra (comercial).
 * Tras inyección: `commercialPrice = cost` (precio/barra), `conversionFactor = barWeightKg`,
 * `commercialUnit = "barra ∅Nmm · 12m"` (generado localmente si se provee diameterMm).
 * Esto permite que `mapMaterialToReal` calcule: precioTécnico = commercialPrice / CF.
 *
 * Función pura — no muta el array original. Usar en contextos donde se conoce
 * el diámetro de barra (ej: beam family en ChandiasCalculator).
 */
export function injectSteelConversionFactor(
  orgMaterials: OrgMaterialLookup[],
  barWeightKg: number,
  diameterMm?: number,
): OrgMaterialLookup[] {
  if (barWeightKg <= 0) return orgMaterials;
  return orgMaterials.map(m => {
    const n = normalizeStr(m.name);
    const isSteelBar =
      (n.includes('acero') || n.includes('hierro')) &&
      (!m.conversionFactor || m.conversionFactor <= 0);
    if (!isSteelBar) return m;
    // Material genérico paramétrico ("Acero ADN 420 (Genérico por Cuantía)"):
    // NO inyectar CF — su unidad comercial es kg, no barras.
    // La compra por barras la muestra el panel de beamResult (Fase 2), no la composición.
    if (isGenericSteelMaterial(m.name)) return m;
    const commercialUnit = diameterMm
      ? `barra ∅${diameterMm}mm · 12m`
      : (m.commercialUnit ?? 'barra 12m');
    const isAlreadyKg = m.unit?.toLowerCase() === 'kg';
    if (isAlreadyKg) {
      // Ya está en $/kg (precio técnico). Solo inyectar CF para calcular compra en barras.
      // NO tocar commercialPrice: mapMaterialToReal usará cost directamente.
      return { ...m, conversionFactor: barWeightKg, commercialUnit };
    }
    // Precio en $/barra o $/TN: marcar como commercialPrice para que mapMaterialToReal
    // calcule: precioTécnico = commercialPrice / conversionFactor.
    return {
      ...m,
      unit: 'kg',
      conversionFactor: barWeightKg,
      commercialPrice:  m.cost,
      commercialUnit,
    };
  });
}

/**
 * Inyecta factores de conversión comercial (bolsas, envases) para materiales
 * a granel comunes que pueden no tenerlos en DB (previo a migration 022).
 *
 * Solo actúa cuando el material NO tiene CF definido (evita sobreescribir DB).
 * NO toca commercialPrice — el cost ya llega como precio técnico ($/kg, $/m³, etc.)
 * Permite que convertToCommercial calcule purchaseQty en unidades de compra.
 */
export function injectBulkConversionFactors(
  orgMaterials: OrgMaterialLookup[],
): OrgMaterialLookup[] {
  const BULK: Array<{ test: (n: string) => boolean; cf: number; unit: string }> = [
    {
      test: n => (n.includes('cemento') || n.includes('portland')) && !n.includes('cola') && !n.includes('adhesivo'),
      cf: 50, unit: 'bolsa 50 kg',
    },
    {
      // Cal hidráulica — bolsa 25 kg (solo hidráulica; hidratada tiene su propia entrada en DB)
      test: n => n.includes('cal hidraulica'),
      cf: 25, unit: 'bolsa 25 kg',
    },
    {
      // Cal hidratada — también bolsa 25 kg pero entrada de DB propia (migración 041)
      test: n => n.includes('cal hidratada'),
      cf: 25, unit: 'bolsa 25 kg',
    },
    {
      test: n => n.includes('cal aerea'),
      cf: 20, unit: 'bolsa 20 kg',
    },
    {
      test: n => n.includes('yeso'),
      cf: 40, unit: 'bolsa 40 kg',
    },
    {
      test: n => n.includes('adhesivo') || (n.includes('cemento') && n.includes('cola')),
      cf: 25, unit: 'bolsa 25 kg',
    },
  ];

  return orgMaterials.map(m => {
    if (m.conversionFactor && m.conversionFactor > 0) return m; // ya tiene CF (DB o inyectado)
    const n = normalizeStr(m.name);
    const rule = BULK.find(r => r.test(n));
    if (!rule) return m;
    return {
      ...m,
      conversionFactor: rule.cf,
      commercialUnit: m.commercialUnit ?? rule.unit,
      // NO commercialPrice: cost ya es precio técnico ($/kg); mapMaterialToReal usará cost directo
    };
  });
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
 * Unidad comercial de fallback para materiales sin CF inyectado.
 */
function fallbackCommercialUnit(nombre: string, unit: string): string {
  const n = nombre.toLowerCase();
  if (n.includes('hormig'))    return 'm³';
  if (n.includes('encofrado')) return 'm²';
  return unit;
}

/**
 * purchaseQty de fallback para materiales sin CF inyectado.
 * - Hormigón: redondeo a 2 decimales hacia arriba (ej: 1.498 → 1.50)
 * - Acero ya tiene CF inyectado por injectSteelConversionFactor → no llega aquí
 * - Encofrado y default: cantidad técnica (se compra exacto)
 */
function fallbackPurchaseQty(nombre: string, cantidad: number): number {
  const n = nombre.toLowerCase();
  if (n.includes('hormig')) return Math.ceil(cantidad * 100) / 100;
  return cantidad;
}


/**
 * Aliases de nombres: variantes de nomenclatura entre catálogo y DB.
 * IMPORTANTE: las claves y valores deben estar ya normalizadas (sin acentos, lowercase)
 * porque tanto el key-lookup como la comparación de candidatos usan normalizeStr().
 * Regla: normalizeStr("Cal Hidráulica") === "cal hidraulica" → clave sin acento.
 */
const NAME_ALIASES: Record<string, string[]> = {
  // ── Aglomerantes ──────────────────────────────────────────────────────────
  // Cal hidratada (Ca(OH)₂ — para morteros de mampostería y revoques interiores).
  // NOTA: aliases bidireccionales con cal hidráulica ELIMINADOS (migración 041).
  // Cal hidratada ≠ Cal hidráulica: productos distintos, no intercambiables.
  // Si el catálogo pide "cal hidratada", debe existir en DB; no cae en cal hidráulica.
  'cal hidratada':              ['cal hidratada en polvo'],
  'cal hidratada en polvo':     ['cal hidratada'],

  // Cal hidráulica (NHL — para restauración, morteros especiales).
  // NO es alias de cal hidratada. Alias solo dentro del mismo producto.
  'cal hidraulica':             ['cal hidraulica en polvo'],
  'cal hidraulica en polvo':    ['cal hidraulica'],

  // Cal aérea — alias solo dentro de su familia.
  'cal aerea en polvo':         ['cal aerea'],
  'cal aerea':                  ['cal aerea en polvo'],
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
  // 'Ladrillo cerámico 18x18x33' (seed 019) no lleva "hueco" en el nombre —
  // se agrega aquí para cerrar el gap de resolución en MAM-003.
  'ladrillo hueco 18x18x33':         ['ladrillo ceramico 18x18x33', 'ladrillo ceramico hueco 18x18x33', 'i1014'],
  'ladrillo ceramico hueco 18x18x33': ['ladrillo hueco 18x18x33', 'ladrillo ceramico 18x18x33'],
  'ladrillo ceramico 18x18x33':      ['ladrillo hueco 18x18x33', 'ladrillo ceramico hueco 18x18x33'],

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

  // ── Fundaciones ──────────────────────────────────────────────────────────
  // "Hormigón Elaborado H-21" cubre variantes con/sin acento y con/sin espacio en H21
  'hormigon elaborado h-21':    ['hormigon elaborado h21', 'hormigon h-21', 'hormigon h21'],
  'hormigon elaborado h21':     ['hormigon elaborado h-21', 'hormigon h-21'],
  'hormigon h-21':              ['hormigon elaborado h-21', 'hormigon elaborado h21'],
  // ── Acero — arquitectura dos modos ────────────────────────────────────────
  // PRIORIDAD de lookup (orden de aliases = orden de búsqueda):
  //   1. "Acero ADN 420 (Genérico por Cuantía)" — Modo 1 paramétrico (migration 034)
  //   2. "Hierro nervado ØX mm" — Modo 2 comercial por diámetro (seed 019/023)
  //   3. Variantes de nombres directos
  //
  // NOTA: normalizeStr preserva 'ø' (U+00F8).
  // "Hierro nervado Ø12 mm" → normalizeStr → "hierro nervado ø12 mm"
  // "Acero ADN 420 (Genérico por Cuantía)" → "acero adn 420 (generico por cuantia)"
  'acero adn 420': [
    'acero adn 420 (generico por cuantia)',   // ← PRIMERO: genérico $/kg (migration 034)
    'acero dn 420',
    'hierro adn 420',
    'acero en barras adn 420',
    'hierro nervado \u00f812 mm',             // Modo 2: caída natural al ∅12mm
    'hierro nervado \u00f810 mm',
  ],
  'acero adn 420 (generico por cuantia)': ['acero adn 420', 'acero dn 420'],
  'acero dn 420':  ['acero adn 420 (generico por cuantia)', 'acero adn 420', 'hierro adn 420'],
  'hierro adn 420': ['acero adn 420 (generico por cuantia)', 'acero adn 420', 'acero dn 420'],
  // Seed 019/023: "Hierro nervado ØNmm" — alias de vuelta hacia el catálogo
  'hierro nervado \u00f86 mm':  ['acero adn 420', 'acero adn 420 (generico por cuantia)'],
  'hierro nervado \u00f88 mm':  ['acero adn 420', 'acero adn 420 (generico por cuantia)'],
  'hierro nervado \u00f810 mm': ['acero adn 420', 'acero adn 420 (generico por cuantia)'],
  'hierro nervado \u00f812 mm': ['acero adn 420', 'acero adn 420 (generico por cuantia)'],
  'hierro nervado \u00f816 mm': ['acero adn 420', 'acero adn 420 (generico por cuantia)'],

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

  // 3. Fallback acero: si el catálogo pide 'acero'/'hierro' y no hubo match por nombre,
  //    busca cualquier orgMaterial de acero/hierro (con o sin CF).
  //    Precio: si tiene commercialPrice+CF → divide; si ya está en $/kg → usa cost directo.
  if (matchedBy === 'missing') {
    const nc = normalizeStr(m.nombre);
    if (nc.includes('acero') || nc.includes('hierro')) {
      const fb = orgMaterials.find(r => {
        const rn = normalizeStr(r.name);
        return rn.includes('acero') || rn.includes('hierro');
      });
      if (fb) { matched = fb; matchedBy = 'name'; }
    }
  }

  const conversionFactor = matched?.conversionFactor;
  const commercialUnit   = matched?.commercialUnit ?? fallbackCommercialUnit(m.nombre, m.unit);

  if (isSteelMaterial(m.nombre)) {
    // ── Acero: delegar a resolveSteelPricingModel ──────────────────────────────
    // Fase 1 — precio técnico ($/kg):
    //   Para genérico:          technicalUnitPrice = cost ($/kg directo)
    //   Para comercial $/barra: technicalUnitPrice = commercialPrice / CF_propio
    //   Para comercial $/kg:    technicalUnitPrice = cost (injected CF solo afecta compra)
    // Fase 2 — purchaseQty:
    //   CEIL(kg / CF_inyectado) vía convertToCommercial abajo.
    //   diameterMm=null: la compra en barras la gestiona el panel de beamResult,
    //   no la tabla de composición.
    const sw = resolveSteelPricingModel(m.cantidad, matched ?? null, null, orgMaterials);
    unitCost = sw.technicalUnitPrice;
  } else {
    // ── Resto de materiales: precio estándar ──────────────────────────────────
    if (matched) {
      const cf = conversionFactor;
      if (cf && cf > 0 && matched.commercialPrice) {
        unitCost = matched.commercialPrice / cf;
      } else {
        unitCost = matched.cost;
      }
    }
  }

  return {
    ...m,
    unitCost,
    totalCost: parseFloat((unitCost * m.cantidad).toFixed(2)),
    matchedBy,
    conversionFactor,
    commercialUnit,
    purchaseQty: convertToCommercial(m.cantidad, conversionFactor) ?? fallbackPurchaseQty(m.nombre, m.cantidad),
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
        acc.purchaseQty = convertToCommercial(acc.cantidad, acc.conversionFactor) ?? fallbackPurchaseQty(acc.nombre, acc.cantidad);
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

// ─── Salidas derivadas paramétricas ───────────────────────────────────────────

export interface DerivedOutputResult extends ChandiasTaskDerivedOutput {
  value: number;  // resultado de evaluar formula con los dims actuales
}

/**
 * Evalúa los cómputos derivados de una tarea (ej: superficie de encofrado).
 * Retorna array vacío si la tarea no tiene derivedOutputs definidos.
 * El resultado es informativo — no impacta en cantidades de materiales.
 */
export function computeDerivedOutputs(
  task: ChandiasTask,
  dims: Record<string, number>,
): DerivedOutputResult[] {
  if (!task.derivedOutputs?.length) return [];
  return task.derivedOutputs.map(d => ({
    ...d,
    value: parseFloat(evaluateFormula(d.formula, dims).toFixed(4)),
  }));
}

// ─── Vigas, columnas y fundaciones de H.A. ───────────────────────────────────

export interface BeamAdvancedConfig {
  nBeams: number;           // vigas/elementos iguales (≥ 1)
  wastePercent: number;     // % desperdicio hormigón (ej: 5 → 1.05)
  steelRatio: number;       // kg acero por m³ de volumen estructural
  steelDiameterMm: number;  // diámetro de barra a comprar (para convertir kg → barras)
  formwork: {
    fondo: boolean;         // cara inferior (base de viga/losa)
    lat1: boolean;          // lateral 1
    lat2: boolean;          // lateral 2
    lat3?: boolean;         // lateral 3 — 4ª cara para columnas (largo × ancho)
  };
}

export const BEAM_CONFIG_DEFAULTS: BeamAdvancedConfig = {
  nBeams: 1,
  wastePercent: 5,
  steelRatio: 130,
  steelDiameterMm: DEFAULT_REBAR_DIAMETER_MM,  // 12mm
  formwork: { fondo: true, lat1: true, lat2: true },
};

export interface BeamDerivedResult {
  volumePerBeam: number;          // m³ de 1 elemento (largo×ancho×alto)
  totalVolumeBruto: number;       // volumePerBeam × nBeams
  totalHormigon: number;          // totalVolumeBruto × (1 + waste)
  totalAcero: number;             // totalVolumeBruto × steelRatio  [unidad APU: kg]
  encofradoPerBeam: number;       // m² de encofrado por elemento
  totalEncofrado: number;         // encofradoPerBeam × nBeams
  hormiPurchaseSuggested: number; // ceil(totalHormigon × 2) / 2 → múltiplos 0.5 m³
  // ── Compra inteligente de acero ──
  steelBarWeightKg: number;       // kg por barra de 12m para el diámetro elegido
  steelBarsNeeded: number;        // CEIL(totalAcero / steelBarWeightKg) → barras a comprar
}

/**
 * Calcula resultado ajustado para fundaciones/columnas de H.A. con config avanzada.
 * Reemplaza el calcResult base aplicando: nBeams, wastePercent, steelRatio y encofrado.
 * Función pura — misma API que la familia de muros y pisos.
 */
export function computeBeamResult(
  base: ChandiasCalcResult,
  dims: Record<string, number>,
  cfg: BeamAdvancedConfig,
): { calcResult: ChandiasCalcResult; derived: BeamDerivedResult } {
  const n     = Math.max(1, cfg.nBeams);
  const waste = Math.max(0, cfg.wastePercent) / 100;
  const sr    = Math.max(0, cfg.steelRatio);

  const volumePerBeam    = base.quantity;                               // largo×ancho×alto
  const totalVolumeBruto = parseFloat((volumePerBeam * n).toFixed(4)); // × N elementos
  const totalHormigon    = parseFloat((totalVolumeBruto * (1 + waste)).toFixed(4));
  const totalAcero       = parseFloat((totalVolumeBruto * sr).toFixed(4));

  // Encofrado por cara seleccionada
  const largo = dims.largo ?? 0;
  const ancho = dims.ancho ?? 0;
  const alto  = dims.alto  ?? 0;
  let encofradoPerBeam = 0;
  if (cfg.formwork.fondo) encofradoPerBeam += largo * ancho;
  if (cfg.formwork.lat1)  encofradoPerBeam += largo * alto;
  if (cfg.formwork.lat2)  encofradoPerBeam += largo * alto;
  if (cfg.formwork.lat3)  encofradoPerBeam += largo * ancho; // 4ª cara: columnas
  encofradoPerBeam     = parseFloat(encofradoPerBeam.toFixed(4));
  const totalEncofrado = parseFloat((encofradoPerBeam * n).toFixed(4));
  const hormiPurchaseSuggested = Math.ceil(totalHormigon * 2) / 2;

  // Compra inteligente de acero: kg técnicos → barras de 12m del diámetro elegido
  const steelBarWeightKg = getSteelBarWeight(cfg.steelDiameterMm);
  const steelBarsNeeded  = getSteelBarsNeeded(totalAcero, cfg.steelDiameterMm);

  const derived: BeamDerivedResult = {
    volumePerBeam, totalVolumeBruto, totalHormigon, totalAcero,
    encofradoPerBeam, totalEncofrado, hormiPurchaseSuggested,
    steelBarWeightKg, steelBarsNeeded,
  };

  // Recomputar cantidades de materiales del catálogo
  const newMateriales = base.materiales.map(m => {
    const norm = normalizeStr(m.nombre);
    if (norm.includes('hormig'))                              return { ...m, cantidad: totalHormigon };
    if (norm.includes('acero') || norm.includes('hierro'))   return { ...m, cantidad: totalAcero };
    return { ...m, cantidad: parseFloat((m.coef * totalVolumeBruto).toFixed(4)) };
  });

  return {
    calcResult: { ...base, quantity: totalVolumeBruto, materiales: newMateriales },
    derived,
  };
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
