import { describe, expect, it } from 'vitest';
import { INITIAL_RUBROS } from '../../constants';
import { groupRubros, isAuxiliaryRubro, rubroLabel, sortRubros } from '../../src/features/budgets/rubroGroups';

describe('rubroGroups', () => {
  it('agrupa los 38 rubros oficiales en 6 grupos y deja afuera los auxiliares', () => {
    const groups = groupRubros(INITIAL_RUBROS);
    expect(groups.map(g => g.label)).toEqual([
      'Estructura', 'Albañilería', 'Terminaciones', 'Carpinterías', 'Instalaciones', 'Equipamiento y exteriores',
    ]);
    const all = groups.flatMap(g => g.rubros);
    expect(all).toHaveLength(38);
    expect(new Set(all).size).toBe(38);
    expect(all.some(isAuxiliaryRubro)).toBe(false);
  });

  it('manda los rubros sin código a «Otros rubros»', () => {
    const groups = groupRubros(['06 MAMPOSTERÍA, Y OTROS CERRAMIENTOS', 'Durlock']);
    expect(groups.at(-1)).toEqual({ label: 'Otros rubros', rubros: ['Durlock'] });
  });

  it('ordena por código, sin código al final y «Otros» último', () => {
    expect(sortRubros(['Otros', '34 PINTURA', 'Zeta', '04 FUNDACIONES', '34 PINTURA']))
      .toEqual(['04 FUNDACIONES', '34 PINTURA', 'Zeta', 'Otros']);
  });

  it('muestra el nombre en tipo oración sin el código', () => {
    expect(rubroLabel('23 INSTALACIÓN SANITARIA')).toBe('Instalación sanitaria');
    expect(rubroLabel('Durlock')).toBe('Durlock');
  });
});
