/**
 * steelRebars.ts — Tabla técnica de barras de acero ADN 420 y helpers de compra.
 *
 * Estándar: CIRSOC 201 / DIN 488 — barras de 12 m de longitud.
 * Fuente: tabla de pesos teóricos para acero corrugado ADN 420.
 *
 * Estas constantes son frontend-only en esta etapa.
 * Si en el futuro se necesita que sean editables por organización, el camino
 * natural es una tabla `steel_rebar_specs` en Supabase con RLS por org_id.
 * Los helpers permanecen idénticos — solo cambia la fuente de los datos.
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface SteelRebarSpec {
  /** Diámetro nominal en milímetros */
  diameterMm: number;
  /** Peso lineal en kg/m */
  weightKgM: number;
  /** Área de la sección transversal en cm² */
  areaCm2: number;
  /** Longitud estándar de barra en metros (siempre 12 en Argentina) */
  barLengthM: number;
  /** Peso de una barra completa = weightKgM × barLengthM */
  barWeightKg: number;
}

// ─── Tabla de especificaciones ────────────────────────────────────────────────

const RAW_SPECS = [
  { diameterMm:  6, weightKgM: 0.22, areaCm2: 0.28 },
  { diameterMm:  8, weightKgM: 0.40, areaCm2: 0.50 },
  { diameterMm: 10, weightKgM: 0.62, areaCm2: 0.79 },
  { diameterMm: 12, weightKgM: 0.89, areaCm2: 1.13 },
  { diameterMm: 16, weightKgM: 1.58, areaCm2: 2.01 },
  { diameterMm: 20, weightKgM: 2.47, areaCm2: 3.14 },
  { diameterMm: 25, weightKgM: 3.85, areaCm2: 4.91 },
  { diameterMm: 32, weightKgM: 6.31, areaCm2: 8.04 },
] as const;

/** Longitud estándar de barra en Argentina */
export const REBAR_BAR_LENGTH_M = 12;

/** Tabla completa de especificaciones con barWeightKg pre-calculado */
export const STEEL_REBAR_SPECS: SteelRebarSpec[] = RAW_SPECS.map(s => ({
  ...s,
  barLengthM: REBAR_BAR_LENGTH_M,
  barWeightKg: parseFloat((s.weightKgM * REBAR_BAR_LENGTH_M).toFixed(3)),
}));

/** Diámetro por defecto para tareas de fundación (valor típico para vigas y bases) */
export const DEFAULT_REBAR_DIAMETER_MM = 12;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Retorna la especificación completa para un diámetro dado, o undefined si no existe.
 */
export function getSteelRebarSpec(diameterMm: number): SteelRebarSpec | undefined {
  return STEEL_REBAR_SPECS.find(s => s.diameterMm === diameterMm);
}

/**
 * Retorna el peso de una barra de 12m para el diámetro dado.
 * Retorna 0 si el diámetro no está en la tabla.
 */
export function getSteelBarWeight(diameterMm: number): number {
  return getSteelRebarSpec(diameterMm)?.barWeightKg ?? 0;
}

/**
 * Calcula la cantidad de barras de 12m necesarias para cubrir un total de kg de acero.
 * Aplica CEIL — nunca queda corto.
 *
 * @param totalKg  Kilos técnicos totales de acero
 * @param diameterMm  Diámetro de la barra a comprar
 * @returns Cantidad entera de barras (0 si diámetro inválido o totalKg ≤ 0)
 *
 * @example
 * // 150 kg de acero ∅10mm (7.44 kg/barra)
 * getSteelBarsNeeded(150, 10) // → 21
 */
export function getSteelBarsNeeded(totalKg: number, diameterMm: number): number {
  const barWeight = getSteelBarWeight(diameterMm);
  if (barWeight <= 0 || totalKg <= 0) return 0;
  return Math.ceil(totalKg / barWeight);
}
