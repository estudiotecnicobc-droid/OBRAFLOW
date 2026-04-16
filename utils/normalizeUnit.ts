/**
 * utils/normalizeUnit.ts
 *
 * Normaliza variantes de unidades de medida a formato canónico en minúsculas.
 * Aplicar al importar tareas maestras, crear materiales y cargar seeds.
 *
 * Ejemplos:
 *   "M2"  → "m2"  |  "M3" → "m3"  |  "KG" → "kg"
 *   "Un"  → "un"  |  "HS" → "h"   |  "hh" → "h"
 *   "25kg"→ "25kg" (unidades compuestas no reconocidas se retornan en lowercase)
 */

const UNIT_MAP: Record<string, string> = {
  // Superficiales
  'm2': 'm2', 'm²': 'm2',
  // Volumétricas
  'm3': 'm3', 'm³': 'm3',
  // Masa
  'kg': 'kg', 'gr': 'g', 'g': 'g',
  // Longitud
  'm': 'm', 'ml': 'ml', 'lm': 'ml', 'cm': 'cm', 'mm': 'mm', 'km': 'km',
  // Unidades
  'un': 'un', 'u': 'un', 'und': 'un', 'ud': 'un', 'c/u': 'un',
  // Horas / tiempo
  'h': 'h', 'hs': 'h', 'hr': 'h', 'hora': 'h', 'horas': 'h',
  'hh': 'h', 'h/h': 'h',
  'día': 'día', 'dia': 'día', 'días': 'día', 'dias': 'día',
  'mes': 'mes',
  'año': 'año', 'anio': 'año',
  // Volúmenes líquidos
  'lt': 'lt', 'lts': 'lt', 'litro': 'lt', 'litros': 'lt', 'ltr': 'lt',
  // Toneladas
  'tn': 'tn', 'ton': 'tn', 'tonelada': 'tn',
  // Global / forfait
  'gl': 'gl', 'gbl': 'gl', 'global': 'gl',
  // Madera
  'p2': 'p2',
  // Piezas
  'pz': 'pz', 'pieza': 'pz', 'piezas': 'pz',
  // Juego / set
  'jgo': 'jgo', 'juego': 'jgo', 'set': 'jgo',
  // Porcentaje
  '%': '%',
};

export function normalizeUnit(raw: string | undefined | null): string {
  if (!raw) return 'un';
  const key = raw.trim().toLowerCase();
  return UNIT_MAP[key] ?? key;
}
