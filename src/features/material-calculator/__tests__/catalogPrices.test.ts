import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { CHANDIAS_CATALOG } from '../catalog/chandiasCatalog';
import {
  buildCatalogPriceIndex, mapMaterialToReal, consolidateResolved, calculateTask,
  ReferencePrice, OrgMaterialLookup,
} from '../engine/chandias';

const sql = readFileSync(resolve(__dirname, '../../../../supabase/migrations/062_base_maestra_obraflow_rubros.sql'), 'utf-8');
const OF = new Map<string, { name: string; unit: string; cost: number }>();
for (const m of sql.matchAll(/\('(OF-M-[A-Z0-9]+)', '((?:[^']|'')*)', '([^']*)', 'MATERIAL', ([0-9.]+)/g)) {
  OF.set(m[1], { name: m[2].replace(/''/g, "'"), unit: m[3], cost: Number(m[4]) });
}
const APUS = new Set([...sql.matchAll(/\('(OF-[A-Z]+-[0-9]+)', '/g)].map(m => m[1]));
const refs = new Map<string, ReferencePrice>([...OF].map(([code, r]) => [code, { code, ...r }]));
const sameUnit = (a: string, b: string) => (a === 'un' ? 'u' : a) === (b === 'un' ? 'u' : b);

describe('precios del calculador desde el Catálogo ObraFlow', () => {
  it('cada ref existe en la base ObraFlow y con la misma unidad', () => {
    for (const t of CHANDIAS_CATALOG) {
      for (const m of t.materiales) {
        if (!m.ref) continue;
        const r = OF.get(m.ref);
        expect(r, `${t.id} ${m.nombre} → ${m.ref}`).toBeDefined();
        expect(sameUnit(m.unit, r!.unit), `${t.id} ${m.nombre}: ${m.unit} vs ${r!.unit}`).toBe(true);
      }
      if (t.apu) expect(APUS.has(t.apu), `${t.id} → ${t.apu}`).toBe(true);
    }
  });

  it('usa el precio ObraFlow aunque la empresa tenga el mismo nombre con precio viejo', () => {
    const org: Array<OrgMaterialLookup & { source?: string }> = [
      { name: 'Cemento Portland', code: 'I1001', cost: 0.5, unit: 'kg', source: 'master_materials' },
    ];
    const lookup = [...buildCatalogPriceIndex(CHANDIAS_CATALOG, refs, org), ...org];
    const r = mapMaterialToReal({ nombre: 'Cemento Portland', unit: 'kg', coef: 1, cantidad: 10, code: 'OF-M-CEM' }, lookup);
    expect(r.unitCost).toBe(OF.get('OF-M-CEM')!.cost);
    expect(r.priceSource).toBe('obraflow');
  });

  it('manda el precio de la empresa cuando tiene el mismo recurso OF-M con precio', () => {
    const org: Array<OrgMaterialLookup & { source?: string }> = [
      { name: 'Arena gruesa', code: 'OF-M-ARG', cost: 55000, unit: 'm³', source: 'master_materials' },
    ];
    const lookup = [...buildCatalogPriceIndex(CHANDIAS_CATALOG, refs, org), ...org];
    const r = mapMaterialToReal({ nombre: 'Arena gruesa', unit: 'm³', coef: 1, cantidad: 1, code: 'OF-M-ARG' }, lookup);
    expect(r.unitCost).toBe(55000);
    expect(r.priceSource).toBe('empresa');
  });

  it('un material encontrado con precio 0 queda «sin precio»', () => {
    const r = mapMaterialToReal(
      { nombre: 'Ladrillo hueco 8cm', unit: 'un', coef: 1, cantidad: 5 },
      [{ name: 'Ladrillo hueco 8cm', cost: 0 }],
    );
    expect(r.matchedBy).toBe('missing');
  });

  it('el muro de hueco 18 sale con precios de una misma escala', () => {
    const t = CHANDIAS_CATALOG.find(x => x.id === 'MAM-003')!;
    const calc = calculateTask(t, { largo: 10, alto: 1 });
    const lookup = buildCatalogPriceIndex(CHANDIAS_CATALOG, refs, []);
    const res = consolidateResolved([{ ...calc, itemId: 'a', description: '' }], lookup);
    expect(res.every(m => m.matchedBy !== 'missing')).toBe(true);
    const ladrillos = res.find(m => m.nombre.startsWith('Ladrillo'))!;
    expect(ladrillos.unitCost).toBe(OF.get('OF-M-LH18')!.cost);
    expect(ladrillos.cantidad).toBeCloseTo(163, 5);
  });

  it('el acero de las tareas de H.A. toma el precio por kg de la base', () => {
    const lookup = buildCatalogPriceIndex(CHANDIAS_CATALOG, refs, []);
    const r = mapMaterialToReal({ nombre: 'Acero ADN 420', unit: 'kg', coef: 105, cantidad: 105, code: 'OF-M-ACE' }, lookup);
    expect(r.unitCost).toBe(OF.get('OF-M-ACE')!.cost);
  });
});
