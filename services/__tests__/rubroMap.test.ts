import { describe, it, expect } from 'vitest';
import { officialRubro } from '../../src/features/budgets/rubroMap';

// Casos reales (proyecto Casa Ciro) que «Análisis de costos» mandaba a «Sin categoría» o duplicaba.
describe('officialRubro', () => {
  it.each([
    ['Movimiento de Suelos', 'Excavación a cielo abierto', '03 MOVIMIENTO DE SUELOS'],
    ['Fundaciones', 'Viga de Fundación de H.A.', '04 FUNDACIONES'],
    ['Estructura H.A.', 'Columna de H.A. 20X20', '05 ESTRUCTURAS RESISTENTES'],
    ['05 ESTRUCTURA HA', 'Columna de H.A.', '05 ESTRUCTURAS RESISTENTES'],
    ['06 MAMPOSTERIA, Y OTROS CERRAMIENTOS', 'Muro de ladrillo hueco', '06 MAMPOSTERÍA, Y OTROS CERRAMIENTOS'],
    ['OBRA GRUESA', 'MAMPOSTERIA', '06 MAMPOSTERÍA, Y OTROS CERRAMIENTOS'],
    ['TERMINACIONES', 'REVOQUE', '08 REVOQUES'],
  ])('%s / %s → %s', (cat, name, expected) => {
    expect(officialRubro(cat, name)).toBe(expected);
  });
});
