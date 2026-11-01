import { describe, expect, it } from 'vitest';
import { INITIAL_RUBROS } from '../../constants';
import { arrangeRubros, groupRubros, isAuxiliaryRubro, rubroLabel, sortRubros } from '../../src/features/budgets/rubroGroups';

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

  describe('arrangeRubros', () => {
    const e = [
      { rubro: '34 PINTURA', amount: 900 },
      { rubro: '04 FUNDACIONES', amount: 2100 },
      { rubro: 'Otros', amount: 50 },
      { rubro: '06 MAMPOSTERÍA, Y OTROS CERRAMIENTOS', amount: 3400 },
      { rubro: '08 REVOQUES', amount: 900 },
    ];
    const names = (v: 'codigo' | 'etapas' | 'incidencia') =>
      arrangeRubros(e, v).flatMap(s => s.entries.map(x => x.rubro.slice(0, 2)));

    it('código: por número y Otros al final', () => {
      expect(names('codigo')).toEqual(['04', '06', '08', '34', 'Ot']);
    });

    it('incidencia: mayor a menor, empate por código', () => {
      expect(names('incidencia')).toEqual(['06', '04', '08', '34', 'Ot']);
    });

    it('etapas: agrupa con subtotal y conserva Otros', () => {
      const s = arrangeRubros(e, 'etapas');
      expect(s.map(x => [x.label, x.amount])).toEqual([
        ['Estructura', 2100], ['Albañilería', 4300], ['Terminaciones', 900], ['Otros rubros', 50],
      ]);
    });
  });
});
