import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DURLOCK_TEMPLATE } from '../durlockTemplate';
import { DURLOCK_SYSTEMS } from '../durlockSystems';
import { buildRows, defaultValues } from '../engine';

const migDir = join(__dirname, '../../../../supabase/migrations');
const sql065 = readFileSync(join(migDir, '065_catalogo_durlock.sql'), 'utf-8');
const catalogSql = readdirSync(migDir)
  .filter(f => /^06[1-5]_/.test(f))
  .map(f => readFileSync(join(migDir, f), 'utf-8'))
  .join('\n');

const rowsWith = (patch: Record<string, number>) =>
  buildRows(DURLOCK_TEMPLATE, { ...defaultValues(DURLOCK_TEMPLATE), ...patch });
const find = (rows: ReturnType<typeof buildRows>, name: string) => rows.find(r => r.task.name === name);

describe('Presupuesto rápido · sistemas Durlock', () => {
  it('cada sistema tiene su APU en la migración 065', () => {
    expect(DURLOCK_SYSTEMS.length).toBe(44);
    for (const s of DURLOCK_SYSTEMS) expect(sql065, s.code).toContain(`('${s.code}', `);
  });

  it('todas las tareas de la plantilla apuntan a un APU del catálogo', () => {
    const v = defaultValues(DURLOCK_TEMPLATE);
    for (const r of DURLOCK_TEMPLATE.rubros)
      for (const t of r.tasks) {
        const code = t.pick ? t.pick(v).code : t.code;
        expect(code, t.name).toBeTruthy();
        expect(catalogSql, t.name).toContain(`'${code}'`);
        expect(t.includes.length, t.name).toBeGreaterThan(10);
      }
  });

  it('con los valores por defecto arma tabique estándar y cielorraso de 9,5 mm', () => {
    const rows = buildRows(DURLOCK_TEMPLATE, defaultValues(DURLOCK_TEMPLATE));
    const tab = rows.find(r => r.task.code === 'OF-DUR-004');
    expect(tab?.included).toBe(true);
    expect(tab?.quantity).toBeCloseTo(4 * 2.6 - 1.6, 2);
    const cie = rows.find(r => r.task.code === 'OF-DUR-022');
    expect(cie?.included).toBe(true);
    expect(cie?.quantity).toBe(12);
    expect(rows.find(r => r.task.code === 'OF-DUR-049')?.included).toBe(false);
    expect(find(rows, 'Pintura látex')?.quantity).toBeCloseTo((4 * 2.6 - 1.6) * 2 + 12, 2);
  });

  it('el sistema elegido cambia el APU sin cambiar la cantidad de filas', () => {
    const base = rowsWith({});
    const rf = rowsWith({ sist_t: 6 });
    expect(rf).toHaveLength(base.length);
    expect(rf.some(r => r.task.code === 'OF-DUR-006' && r.included)).toBe(true);
    expect(find(rf, 'Sellado de juntas y pasos con Promaseal-A (Durlock)')?.included).toBe(true);
    expect(find(base, 'Sellado de juntas y pasos con Promaseal-A (Durlock)')?.included).toBe(false);
  });

  it('revestimiento exterior suma barrera de agua y viento', () => {
    const ext = rowsWith({ sr: 20, sist_r: 65 });
    expect(ext.some(r => r.task.code === 'OF-DUR-065' && r.included && r.quantity === 20)).toBe(true);
    expect(find(ext, 'Barrera de agua y viento (Durlock)')?.included).toBe(true);
    const int = rowsWith({ sr: 20, sist_r: 49 });
    expect(find(int, 'Barrera de agua y viento (Durlock)')?.included).toBe(false);
  });

  it('cielorraso desmontable no lleva buña ni pintura', () => {
    const rows = rowsWith({ lt: 0, sc: 30, sist_c: 26 });
    expect(rows.some(r => r.task.code === 'OF-DUR-026' && r.included)).toBe(true);
    expect(find(rows, 'Buña perimetral')?.included).toBe(false);
    expect(find(rows, 'Pintura látex')?.included).toBe(false);
  });

  it('la lana se agrega solo si el sistema no la trae', () => {
    const conLana = rowsWith({ ais: 1, sist_t: 4 });
    const lana4 = DURLOCK_SYSTEMS.find(s => s.ref === 4)?.lana;
    expect(find(conLana, 'Aislación de lana de vidrio')?.included).toBe(!lana4);
  });
});
