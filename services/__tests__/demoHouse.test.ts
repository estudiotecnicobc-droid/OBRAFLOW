import { describe, expect, it } from 'vitest';
import { RUBRO_TEMPLATES } from '../../src/features/quickBudget/rubroTemplates';
import { buildDemoRows, buildSheetLines, DEMO_EXCLUDED, DEMO_SHEETS, demoProjectData } from '../../src/features/demo/demoHouse';

const rows = buildDemoRows(RUBRO_TEMPLATES);
const byCode = (code: string) => rows.filter(r => r.task.code === code);

describe('obra de ejemplo: vivienda PB 70 m²', () => {
  it('arma 162 ítems con cantidad, todos con código del catálogo', () => {
    expect(rows).toHaveLength(162);
    expect(rows.every(r => r.quantity > 0 && r.included)).toBe(true);
    expect(rows.every(r => !!r.task.code)).toBe(true);
  });

  it('no repite tareas (la Salud del presupuesto no debe marcar repetidas)', () => {
    const codes = rows.map(r => r.task.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('deja afuera las tareas excluidas', () => {
    for (const code of Object.keys(DEMO_EXCLUDED)) expect(byCode(code)).toHaveLength(0);
  });

  it('cantidades clave de la definición', () => {
    const q = (code: string) => byCode(code)[0]?.quantity;
    expect(q('OF-CUB-017')).toBe(70);      // losa de viguetas
    expect(q('OF-MAM-002')).toBe(84.65);   // hueco 18 exterior
    expect(q('OF-MAM-105')).toBe(40);      // hueco 12 interior
    expect(q('OF-PIS-102')).toBe(62.3);    // porcelanato
    expect(q('OF-FUN-005')).toBe(3.07);    // zapatas
    expect(q('OF-EXC-103')).toBe(14);      // relleno 70 m² × 0,20
    expect(q('OF-EXT-107')).toBe(150);     // césped
  });

  it('cada planilla de medición suma la cantidad de su ítem (sin «Medido ≠»)', () => {
    let n = 0;
    const id = () => `l${n++}`;
    for (const [code, defs] of Object.entries(DEMO_SHEETS)) {
      const { total } = buildSheetLines(defs, id);
      const item = byCode(code)[0];
      expect(item, code).toBeDefined();
      expect(Math.abs(total - item.quantity)).toBeLessThan(0.01);
    }
  });

  it('datos de la obra: 70 m² y plazo de 8 meses', () => {
    const p = demoProjectData(new Date('2026-11-01T12:00:00Z'));
    expect(p.surface).toBe(70);
    expect(p.startDate).toBe('2026-11-01');
    expect(p.endDate).toBe('2027-07-01');
  });
});
