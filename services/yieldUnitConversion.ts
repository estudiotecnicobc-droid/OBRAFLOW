// ─── Conversión de unidades comerciales → unidad base del recurso ─────────────
// Maneja formatos como "50kg", "25 kg", "1,5 m3" → factor numérico.

import { normalizeUnit, unitsMatch } from './unitNormalization';

// Patrón: número opcional (con punto o coma decimal) seguido de unidad.
// Ejemplos: "50kg", "25 KG", "1.5m3", "1,5 M3", "12m"
const COMMERCIAL_PATTERN = /^([0-9]+(?:[.,][0-9]+)?)\s*([a-zA-Z²³]+)$/;

/**
 * Calcula el factor de conversión entre la unidad de rendimiento del APU
 * y la unidad base del recurso en el catálogo.
 *
 * Casos:
 *   yieldUnit = "KG",   resourceUnit = "KG"   → 1
 *   yieldUnit = "50kg", resourceUnit = "KG"   → 50
 *   yieldUnit = "1,5m3",resourceUnit = "M3"   → 1.5
 *   yieldUnit = "bolsa",resourceUnit = "KG"   → 1 + warn (unidades incompatibles)
 *
 * Nota: parseFloat con coma → se reemplaza coma por punto antes de parsear.
 *
 * @deprecated Desde el criterio de "unidad técnica única" (noviembre 2026) ya
 *   no se usa para calcular costos de APU. Cantidad y precio viven siempre en
 *   la unidad técnica del componente; `conversion_factor` quedó como evidencia
 *   para compras. Si la unidad del precio no coincide con la del componente,
 *   el material queda fuera del costo con UNIT_MISMATCH. Esta función se
 *   conserva por si algún flujo de compras futuro necesita inferir factor a
 *   partir de etiquetas tipo "50kg", pero no debe usarse en el motor de costo.
 */
export function getConversionFactor(
  yieldUnit: string,
  resourceBaseUnit: string,
): number {
  // Caso 1: misma unidad normalizada → factor 1
  if (unitsMatch(yieldUnit, resourceBaseUnit)) return 1;

  // Caso 2: formato comercial "NUMunit" (ej: "50kg")
  const match = yieldUnit.trim().match(COMMERCIAL_PATTERN);
  if (match) {
    const rawNumber = match[1].replace(',', '.'); // fix B3: coma como separador decimal
    const factor    = parseFloat(rawNumber);
    const suffix    = match[2];
    if (!isNaN(factor) && factor > 0 && unitsMatch(suffix, resourceBaseUnit)) {
      return factor;
    }
  }

  // Caso 3: unidades incompatibles — fallback con warning
  console.warn(
    `[yieldUnitConversion] No se pudo convertir "${yieldUnit}" → "${resourceBaseUnit}". ` +
    `Usando factor=1. Verificar datos del APU.`,
  );
  return 1;
}
