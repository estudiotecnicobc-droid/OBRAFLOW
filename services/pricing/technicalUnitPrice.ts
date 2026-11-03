/**
 * services/pricing/technicalUnitPrice.ts
 * ─────────────────────────────────────
 * Devuelve el precio técnico unitario de un master_material, soportando los
 * dos estados de datos que conviven mientras no se corra la migración
 * 20261103100100 en producción:
 *
 *   · `priceUnitBasis = 'technical'`  → `unitPrice` ya está en unidad técnica.
 *                                       Se devuelve tal cual.
 *   · `priceUnitBasis = 'commercial_legacy'` o `undefined`, con
 *     `conversionFactor > 1`         → `unitPrice` está en unidad comercial.
 *                                       Se divide por `conversionFactor` una vez.
 *   · Sin `conversionFactor` (o = 1) → `unitPrice` tal cual.
 *
 * Objetivo: que el código de la app sea compatible con los dos estados del
 * esquema (antes y después de la migración manual), para que un deploy de
 * Vercel pueda mergearse antes de aplicar la migración sin romper los
 * presupuestos vivos ni la carga de precios en la UI.
 */

export interface PriceBasisFields {
  unitPrice: number;
  conversionFactor?: number | null;
  priceUnitBasis?: 'commercial_legacy' | 'technical' | null;
}

function hasFactor(m: PriceBasisFields): m is PriceBasisFields & { conversionFactor: number } {
  return m.conversionFactor != null && m.conversionFactor > 1;
}

/** Precio del material en su unidad técnica (la de la columna `unit`). */
export function technicalUnitPrice(m: PriceBasisFields): number {
  if (m.priceUnitBasis === 'technical') return m.unitPrice;
  if (hasFactor(m)) return m.unitPrice / m.conversionFactor;
  return m.unitPrice;
}

/**
 * Precio del material en su unidad comercial (la de `commercial_unit`).
 * Devuelve `undefined` si el material no tiene factor > 1 (no aplica).
 */
export function commercialUnitPrice(m: PriceBasisFields): number | undefined {
  if (!hasFactor(m)) return undefined;
  if (m.priceUnitBasis === 'technical') return m.unitPrice * m.conversionFactor;
  // commercial_legacy o undefined con factor > 1: unitPrice ya es comercial
  return m.unitPrice;
}

/**
 * Convierte lo que el usuario escribe en el form (`displayPrice` + modo
 * comercial/técnico + factor) al par `{ unitPrice, priceUnitBasis }` que debe
 * persistirse: `unitPrice` SIEMPRE en unidad técnica y la fila marcada
 * `'technical'` si tiene factor > 1 (idempotente con la migración).
 */
export function priceInputToTechnical(input: {
  displayPrice: number;
  priceMode: 'commercial' | 'technical';
  conversionFactor?: number | null;
}): { unitPrice: number; priceUnitBasis: 'technical' | undefined } {
  const f = input.conversionFactor;
  const hasFactor = f != null && f > 1;
  const unitPrice = input.priceMode === 'commercial' && hasFactor
    ? input.displayPrice / f
    : input.displayPrice;
  return { unitPrice, priceUnitBasis: hasFactor ? 'technical' : undefined };
}
