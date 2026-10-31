import { describe, it, expect } from 'vitest';
import { buildApuSheets, buildLaborBreakdown, buildPurchaseList, type ReportSource, WORKDAY_HOURS } from '../reportData';
import type { Task } from '../../../../types';

const task = (id: string, category: string, dailyYield: number, laborCost = 0): Task =>
  ({ id, organizationId: 'o', name: `Tarea ${id}`, unit: 'm²', laborCost, dailyYield, category } as unknown as Task);

const src: ReportSource = {
  items: [
    { id: 'i1', taskId: 'tab', quantity: 100 } as any,
    { id: 'i2', taskId: 'cie', quantity: 20 } as any,
    { id: 'i3', taskId: 'glob', quantity: 10 } as any,
  ],
  tasks: [task('tab', '06 MAMPOSTERÍA', 9), task('cie', '13 CIELORRASOS', 18), task('glob', '34 PINTURA', 10, 500)],
  yieldsIndex: {
    tab: [{ taskId: 'tab', materialId: 'placa', quantity: 0.72 }, { taskId: 'tab', materialId: 'masilla', quantity: 1.8 }],
    cie: [{ taskId: 'cie', materialId: 'placa', quantity: 0.37 }, { taskId: 'cie', materialId: 'cemento', quantity: 2, wastePercent: 10 }],
  },
  materialsMap: {
    placa: { id: 'placa', organizationId: 'o', name: 'Placa 12,5', unit: 'u', cost: 20000, category: 'Placas' },
    masilla: { id: 'masilla', organizationId: 'o', name: 'Masilla', unit: 'kg', cost: 1700, category: 'Masillas' },
    cemento: { id: 'cemento', organizationId: 'o', name: 'Cemento', unit: 'kg', cost: 300, commercialUnit: 'bolsa 50 kg', conversionFactor: 50 },
  },
  toolYieldsIndex: {},
  toolsMap: {},
  taskLaborYieldsIndex: {
    tab: [{ taskId: 'tab', laborCategoryId: 'of', quantity: 1 }, { taskId: 'tab', laborCategoryId: 'ay', quantity: 1 }],
    cie: [{ taskId: 'cie', laborCategoryId: 'of', quantity: 1 }],
  },
  laborCategoriesMap: {
    of: { id: 'of', organizationId: 'o', role: 'Oficial', basicHourlyRate: 1000, socialChargesPercent: 100, insurancePercent: 0 },
    ay: { id: 'ay', organizationId: 'o', role: 'Ayudante', basicHourlyRate: 800, socialChargesPercent: 0, insurancePercent: 0 },
  },
  taskCrewYieldsIndex: {},
  crewsMap: {},
};

describe('Reportes · lista de compras', () => {
  const list = buildPurchaseList(src);
  const byId = Object.fromEntries(list.map(l => [l.id, l]));

  it('suma el material de todas las tareas y redondea hacia arriba', () => {
    expect(byId.placa.technicalQty).toBeCloseTo(72 + 7.4, 6);
    expect(byId.placa.purchaseQty).toBe(80);
    expect(byId.placa.rubros).toEqual(['06 MAMPOSTERÍA', '13 CIELORRASOS']);
  });

  it('usa la unidad comercial y el desperdicio', () => {
    expect(byId.cemento.technicalQty).toBeCloseTo(44, 6);
    expect(byId.cemento.purchaseQty).toBe(1);
    expect(byId.cemento.purchaseUnit).toBe('bolsa 50 kg');
    expect(byId.cemento.purchaseCost).toBe(15000);
  });

  it('agrupa por categoría del material', () => {
    expect(byId.cemento.category).toBe('Otros materiales');
    expect(list.map(l => l.category)).toEqual(['Masillas', 'Otros materiales', 'Placas']);
  });
});

describe('Reportes · mano de obra', () => {
  const lb = buildLaborBreakdown(src);

  it('calcula horas por oficio con la jornada del motor de precios', () => {
    const of = lb.trades.find(t => t.role === 'Oficial')!;
    // tabique: 9 h / 9 m²/día × 100 m² = 100 h; cielorraso: 9/18 × 20 = 10 h
    expect(of.hours).toBeCloseTo(110, 6);
    expect(of.days).toBeCloseTo(110 / WORKDAY_HOURS, 6);
    expect(of.hourlyCost).toBe(2000);
    expect(of.cost).toBeCloseTo(220000, 6);
  });

  it('separa por rubro y deja aparte la mano de obra sin oficios', () => {
    expect(lb.rubros.map(r => r.rubro)).toEqual(['06 MAMPOSTERÍA', '13 CIELORRASOS']);
    expect(lb.rubros[0].hours).toBeCloseTo(200, 6);
    expect(lb.unassignedCost).toBe(5000);
    expect(lb.totalCost).toBeCloseTo(220000 + 80000 + 5000, 6);
  });
});

describe('Reportes · fichas de APU', () => {
  it('una ficha por tarea, con el mismo costo que el motor de precios', () => {
    const sheets = buildApuSheets(src);
    expect(sheets).toHaveLength(3);
    const tab = sheets.find(s => s.taskId === 'tab')!;
    expect(tab.budgetQty).toBe(100);
    expect(tab.labor.reduce((s, r) => s + r.subtotal, 0)).toBeCloseTo(tab.laborCost, 2);
    expect(tab.materials.reduce((s, r) => s + r.subtotal, 0)).toBeCloseTo(tab.materialCost, 2);
  });
});
