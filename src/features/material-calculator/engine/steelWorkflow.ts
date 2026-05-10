/**
 * steelWorkflow.ts — Núcleo de dominio del acero ADN 420.
 *
 * Arquitectura de DOS MODOS (decisión de negocio confirmada):
 *
 * MODO 1 — parametric_generic
 *   Material canónico: "Acero ADN 420 (Genérico por Cuantía)"
 *   · technicalUnit = kg            · commercialUnit = kg
 *   · Precio cargado = $/kg         · inputPriceMode = price_per_kg
 *   · technicalUnitPrice = precioKg (directo, sin conversión)
 *   · Sin CEIL, sin barras, sin diámetro
 *   · Alimenta: APU, presupuesto inicial, cuantías paramétricas
 *
 * MODO 2 — commercial_diameter
 *   Materiales: "Hierro nervado ∅6mm", "∅8mm", "∅10mm", "∅12mm", "∅16mm", etc.
 *   · technicalUnit = kg            · commercialUnit = "barra ∅Xmm · 12m"
 *   · Precio cargado = $/barra      · inputPriceMode = price_per_bar
 *   · technicalUnitPrice = precioBarra / kgPorBarra   (kgPorBarra = kgPorMetro × 12)
 *   · commercialQuantity = CEIL(kgTécnicos / kgPorBarra)
 *   · Alimenta: compra inteligente, lista de compras, logística
 *
 * REGLA FUNDAMENTAL:
 *   technicalUnitPrice NUNCA varía con el diámetro de compra seleccionado en UI.
 *   Para $/barra se usa el CF propio del material (no el diámetro del selector).
 *
 * DEPENDENCIAS: solo steelRebars.ts y utils/normalizeStr.ts.
 * NO importar chandias.ts → evita dependencia circular.
 */

import {
  getSteelBarWeight,
  getSteelBarsNeeded,
  STEEL_REBAR_SPECS,
  REBAR_BAR_LENGTH_M,
  DEFAULT_REBAR_DIAMETER_MM,
} from './steelRebars';
import { normalizeStr } from '../../../../utils/normalizeStr';

// ─── Interfaz mínima ──────────────────────────────────────────────────────────

/**
 * Subconjunto de OrgMaterialLookup necesario para este módulo.
 * Duck-compatible con OrgMaterialLookup — no importamos chandias.ts.
 */
export interface SteelMaterialLookup {
  name: string;
  unit?: string;
  cost: number;
  commercialPrice?: number;
  conversionFactor?: number;
}

// ─── Tipos públicos ────────────────────────────────────────────────────────────

/** Modo de resolución del acero. */
export type SteelResolutionMode = 'parametric_generic' | 'commercial_diameter';

/**
 * Cómo se cargó el precio del material en DB:
 *   price_per_kg  → el usuario ingresó directamente $/kg
 *   price_per_bar → el usuario ingresó $/barra; el sistema deriva $/kg
 */
export type SteelInputMode = 'price_per_kg' | 'price_per_bar';

/**
 * Trazabilidad del precio técnico calculado:
 *   kg_direct     → cost directo (material ya en $/kg)
 *   barra_divided → commercialPrice / CF_propio (material originalmente $/barra)
 *   fallback      → material coincidente sin precio; se usó otro con precio real
 *   missing       → no se encontró ningún material de acero con precio
 */
export type SteelPricingRule = 'kg_direct' | 'barra_divided' | 'fallback' | 'missing';

export interface SteelPricingModelResult {
  /** Modo de resolución determinado por el material coincidente. */
  mode: SteelResolutionMode;

  // ── Unidades ────────────────────────────────────────────────────────────────
  technicalUnit: 'kg';
  /** 'kg' para parametric_generic; "barra ∅Xmm · 12m" para commercial_diameter. */
  commercialUnit: string;

  // ── Datos del diámetro (Fase 2) ──────────────────────────────────────────────
  /** null para parametric_generic. */
  diameterMm: number | null;
  /** kg/m de la barra (0 para parametric_generic). */
  kgPerMeter: number;
  /** kg por barra de 12 m (0 para parametric_generic). */
  kgPerBar: number;

  // ── Precio ──────────────────────────────────────────────────────────────────
  /** Cómo se cargó el precio en DB. */
  inputPriceMode: SteelInputMode;
  /** Precio tal como se cargó: $/barra o $/kg según inputPriceMode. */
  commercialUnitPrice: number;
  /**
   * Precio técnico en $/kg — SIEMPRE por kg, independiente del diámetro UI.
   * Fase 1: este es el precio que debe usarse en APU y presupuesto inicial.
   */
  technicalUnitPrice: number;

  // ── Cantidades ──────────────────────────────────────────────────────────────
  /** Cantidad técnica en kg (Fase 1: volumen × cuantía). */
  technicalQuantity: number;
  /**
   * Fase 2: CEIL(kg / kgPorBarra).
   * Para parametric_generic: igual a technicalQuantity (en kg).
   */
  commercialQuantity: number;

  pricingRuleApplied: SteelPricingRule;
}

// ─── Helpers públicos ─────────────────────────────────────────────────────────

/** True si el nombre normalizado corresponde a acero o hierro. */
export function isSteelMaterial(nombre: string): boolean {
  const n = normalizeStr(nombre);
  return n.includes('acero') || n.includes('hierro');
}

/**
 * True si el nombre normalizado del material de DB corresponde al acero
 * genérico paramétrico ("Acero ADN 420 (Genérico por Cuantía)" u equivalentes).
 * Señal: contiene 'generico' O 'cuantia'.
 *
 * Usos:
 *   1. injectSteelConversionFactor omite estos materiales (sin CF, sin compra en barras).
 *   2. resolveSteelPricingModel los clasifica como mode='parametric_generic'.
 */
export function isGenericSteelMaterial(name: string): boolean {
  const n = normalizeStr(name);
  return n.includes('generico') || n.includes('cuantia');
}

// ─── Helper de precio interno ─────────────────────────────────────────────────

/**
 * Determina el precio técnico ($/kg) e inputPriceMode de un material.
 *
 * REGLA para $/barra:
 *   commercialPrice establece que el precio original fue por barra.
 *   Se usa el CF PROPIO del material (no el canónico) para derivar $/kg.
 *   Razón: cada diámetro tiene su propio CF (kgPerBar).
 *   Ej: Ø10mm CF=7.44 → $7068/barra / 7.44 = $950/kg
 *       Ø12mm CF=10.68 → $10253/barra / 10.68 = $960/kg
 *
 * DIFERENCIA clave respecto a la versión anterior:
 *   La versión anterior usaba CF canónico (∅12mm) para TODO, lo que daba
 *   precios incorrectos para materiales Ø10 o Ø16.
 *   Esta versión usa el CF propio del material matcheado.
 */
function resolveTechnicalPrice(m: SteelMaterialLookup): {
  technicalUnitPrice: number;
  commercialUnitPrice: number;
  inputPriceMode: SteelInputMode;
  pricingRuleApplied: SteelPricingRule;
} {
  if (m.commercialPrice !== undefined && m.commercialPrice > 0) {
    // Material originalmente en $/barra (commercialPrice set por injectSteelConversionFactor
    // o por useUnifiedMaterials cuando CF > 1 en DB).
    // Usar CF PROPIO del material para derivar $/kg.
    const ownCf = m.conversionFactor && m.conversionFactor > 0
      ? m.conversionFactor
      : getSteelBarWeight(DEFAULT_REBAR_DIAMETER_MM); // fallback ∅12mm
    const techPrice = m.commercialPrice / ownCf;
    return {
      technicalUnitPrice: techPrice,
      commercialUnitPrice: m.commercialPrice,
      inputPriceMode: 'price_per_bar',
      pricingRuleApplied: 'barra_divided',
    };
  }
  // Material en $/kg (cost directo, o CF inyectado con isAlreadyKg=true).
  return {
    technicalUnitPrice: m.cost,
    commercialUnitPrice: m.cost,
    inputPriceMode: 'price_per_kg',
    pricingRuleApplied: m.cost > 0 ? 'kg_direct' : 'missing',
  };
}

// ─── Helper principal ─────────────────────────────────────────────────────────

/**
 * Resuelve el modelo de pricing del acero en dos modos independientes.
 *
 * CUÁNDO llamar con diameterMm:
 *   · Panel de compra inteligente: pasar el diámetro seleccionado por el usuario.
 *   · Composición técnica (APU/presupuesto): pasar null.
 *
 * El technicalUnitPrice SIEMPRE es $/kg independiente del diámetro.
 * El commercialQuantity (barras) usa el diameterMm de la llamada, NO el del material.
 *
 * @param totalKg           Cantidad técnica en kg (Fase 1: volumen × cuantía)
 * @param matchedMaterial   Material de org coincidente (puede ser null)
 * @param diameterMm        Diámetro seleccionado para compra (Fase 2). null = sin barras.
 * @param allOrgMaterials   Lista completa de org para fallback de precio
 */
export function resolveSteelPricingModel(
  totalKg: number,
  matchedMaterial: SteelMaterialLookup | null,
  diameterMm: number | null,
  allOrgMaterials: SteelMaterialLookup[],
): SteelPricingModelResult {

  // ── Detectar modo (Fase 1 vs Fase 2) ────────────────────────────────────────
  const mode: SteelResolutionMode =
    matchedMaterial && isGenericSteelMaterial(matchedMaterial.name)
      ? 'parametric_generic'
      : 'commercial_diameter';

  // ── Fase 1: Precio técnico ($/kg) ────────────────────────────────────────────
  let priceResult = matchedMaterial
    ? resolveTechnicalPrice(matchedMaterial)
    : { technicalUnitPrice: 0, commercialUnitPrice: 0, inputPriceMode: 'price_per_kg' as SteelInputMode, pricingRuleApplied: 'missing' as SteelPricingRule };

  // Fallback: si el material coincidente no tiene precio real,
  // buscar el PRIMER orgMaterial de acero/hierro con precio > 0.
  // Prioridad: genérico (si existe) → cualquier acero/hierro.
  if (priceResult.technicalUnitPrice <= 0) {
    const genericCandidate = allOrgMaterials.find(r =>
      isSteelMaterial(r.name) && isGenericSteelMaterial(r.name) &&
      (r.cost > 0 || (r.commercialPrice != null && r.commercialPrice > 0)),
    );
    const anyCandidate = allOrgMaterials.find(r =>
      isSteelMaterial(r.name) &&
      (r.cost > 0 || (r.commercialPrice != null && r.commercialPrice > 0)),
    );
    const fallback = genericCandidate ?? anyCandidate;
    if (fallback) {
      const fp = resolveTechnicalPrice(fallback);
      priceResult = {
        ...fp,
        pricingRuleApplied: fp.technicalUnitPrice > 0 ? 'fallback' : 'missing',
      };
    }
  }

  // ── Fase 2: Compra inteligente (solo para commercial_diameter con diameterMm) ─
  const kgPerBar = mode === 'parametric_generic' || diameterMm === null
    ? 0
    : getSteelBarWeight(diameterMm);

  const spec = diameterMm !== null
    ? STEEL_REBAR_SPECS.find(s => s.diameterMm === diameterMm)
    : undefined;

  const kgPerMeter = spec ? spec.weightKgM : (kgPerBar > 0 ? kgPerBar / REBAR_BAR_LENGTH_M : 0);

  const hasCommercial =
    mode === 'commercial_diameter' &&
    diameterMm !== null &&
    kgPerBar > 0 &&
    totalKg > 0;

  const commercialQuantity = hasCommercial
    ? getSteelBarsNeeded(totalKg, diameterMm!)
    : totalKg;

  const commercialUnit = hasCommercial
    ? `barra ∅${diameterMm}mm · 12m`
    : 'kg';

  return {
    mode,
    technicalUnit:      'kg',
    commercialUnit,
    diameterMm:         hasCommercial ? diameterMm : null,
    kgPerMeter,
    kgPerBar,
    inputPriceMode:     priceResult.inputPriceMode,
    commercialUnitPrice: priceResult.commercialUnitPrice,
    technicalUnitPrice: priceResult.technicalUnitPrice,
    technicalQuantity:  totalKg,
    commercialQuantity,
    pricingRuleApplied: priceResult.pricingRuleApplied,
  };
}

/**
 * @deprecated Usar resolveSteelPricingModel.
 * Alias de compatibilidad para migración gradual.
 */
export const resolveSteelWorkflow = (
  totalKg: number,
  matchedMaterial: SteelMaterialLookup | null,
  diameterMm: number | null,
  allOrgMaterials: SteelMaterialLookup[],
) => resolveSteelPricingModel(totalKg, matchedMaterial, diameterMm, allOrgMaterials);
