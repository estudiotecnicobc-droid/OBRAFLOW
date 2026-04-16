/**
 * Normaliza un string para comparación de materiales:
 * trim + lowercase + descomposición NFD + eliminación de marcas de acento.
 *
 * Ejemplos:
 *   "Cal Hidráulica"  → "cal hidraulica"
 *   "  CEMENTO "      → "cemento"
 *   "Áridos finos"    → "aridos finos"
 *
 * Usada en: useUnifiedMaterials, engine/chandias, matching de recursos.
 */
export function normalizeStr(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '');
}
