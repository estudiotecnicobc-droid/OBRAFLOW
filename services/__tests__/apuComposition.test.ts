import { describe, it, expect } from 'vitest';
import { buildApuComposition, prettyName } from '../../utils/apuComposition';
import { calculateUnitPrice } from '../calculationService';
import type { Task, LaborCategory, Material, Tool } from '../../types';

describe('prettyName', () => {
  it('pasa a formato oración los nombres en mayúsculas y conserva siglas', () => {
    expect(prettyName('AYUDANTE ')).toBe('Ayudante');
    expect(prettyName('OFICIAL ESPECIALIZADO H° A')).toBe('Oficial especializado H° A');
    expect(prettyName('Oficial hormigón')).toBe('Oficial hormigón');
  });
});

describe('buildApuComposition', () => {
  // Caso real (Casa Ciro): «Bases de H°A°», 3 m³/día, 1 oficial + 1,5 ayudantes.
  const task = { id: 't', name: 'Bases de H°A°', unit: 'm3', dailyYield: 3, laborCost: 0, fixedCost: 0, category: '' } as unknown as Task;
  const lc: Record<string, LaborCategory> = {
    of: { id: 'of', organizationId: 'o', role: 'OFICIAL HORMIGON', code: 'I1030', basicHourlyRate: 5500, socialChargesPercent: 0, insurancePercent: 0 },
    ay: { id: 'ay', organizationId: 'o', role: 'AYUDANTE HORMIGON', code: 'I1031', basicHourlyRate: 4500, socialChargesPercent: 0, insurancePercent: 0 },
  };
  const mats = { h: { id: 'h', name: 'Hormigón H-21', unit: 'm3', cost: 100000 } as unknown as Material };
  const tools = { t: { id: 't', name: 'Hormigonera', costPerHour: 2000 } as unknown as Tool };
  const yields = [{ taskId: 't', materialId: 'h', quantity: 1.05 }];
  const ly = [{ taskId: 't', laborCategoryId: 'of', quantity: 1 }, { taskId: 't', laborCategoryId: 'ay', quantity: 1.5 }, { taskId: 't', laborCategoryId: 'zz', quantity: 1 }];
  const ty = [{ taskId: 't', toolId: 't', hoursPerUnit: 0.5 }];

  const comp = buildApuComposition(task, yields as any, mats, ly as any, lc, ty as any, tools);

  it('muestra el oficio por su nombre, nunca por ID ni código', () => {
    expect(comp.labor.map(l => l.name)).toEqual(['Oficial hormigon', 'Ayudante hormigon', 'Oficio no encontrado']);
    expect(comp.labor[0].detail).toBe('1 pers. · 3 h-h/m3');
    expect(comp.crew).toBe('1 Oficial hormigon + 1,5 Ayudante hormigon');
    expect(comp.hasMissing).toBe(true);
  });

  it('los costos por línea suman lo mismo que calculateUnitPrice', () => {
    const a = calculateUnitPrice(task, { t: yields } as any, mats, { t: ty } as any, tools, undefined, undefined, lc, 9, { t: ly } as any);
    const sum = (ls: { cost: number | null }[]) => ls.reduce((s, l) => s + (l.cost ?? 0), 0);
    expect(sum(comp.materials)).toBeCloseTo(a.materialCost, 2);
    expect(sum(comp.labor)).toBeCloseTo(a.laborCost, 2);
    expect(sum(comp.tools)).toBeCloseTo(a.toolCost, 2);
  });
});
