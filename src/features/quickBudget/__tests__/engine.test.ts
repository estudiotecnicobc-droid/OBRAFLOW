import { describe, it, expect } from 'vitest';
import { QUICK_TEMPLATES } from '../templates';
import { buildRows, defaultValues } from '../engine';
import expected from './excelExpected.json';

describe('Presupuesto rápido · plantillas', () => {
  it('tiene las 10 plantillas con nombre y descripción', () => {
    expect(QUICK_TEMPLATES).toHaveLength(10);
    for (const t of QUICK_TEMPLATES) {
      expect(t.name.length).toBeGreaterThan(3);
      expect(t.description.length).toBeGreaterThan(20);
    }
  });

  it('cada tarea tiene su descripción de qué incluye', () => {
    for (const t of QUICK_TEMPLATES)
      for (const r of t.rubros)
        for (const task of r.tasks) expect(task.includes.length, task.name).toBeGreaterThan(10);
  });

  QUICK_TEMPLATES.forEach((t, i) => {
    it(`${t.name}: cantidades e inclusión iguales a la planilla Excel`, () => {
      const rows = buildRows(t, defaultValues(t));
      const exp = (expected as [string, number, boolean][][])[i];
      expect(rows.map(r => r.task.name)).toEqual(exp.map(e => e[0]));
      rows.forEach((r, k) => {
        expect(r.quantity, r.task.name).toBeCloseTo(exp[k][1], 2);
        expect(r.included, r.task.name).toBe(exp[k][2]);
      });
    });
  });

  it('ampliación: cada combinación de cubierta y piso da cantidades válidas', () => {
    const t = QUICK_TEMPLATES.find(x => x.id === 'ampliacion')!;
    const counts = new Set<number>();
    for (const cub of [1, 2, 3, 4])
      for (const piso of [1, 2, 3, 4]) {
        const rows = buildRows(t, { ...defaultValues(t), cub, piso });
        rows.forEach(r => expect(Number.isFinite(r.quantity)).toBe(true));
        counts.add(rows.filter(r => r.included).map(r => r.task.name).join('|').length);
      }
    expect(counts.size).toBeGreaterThan(4);
  });
});
