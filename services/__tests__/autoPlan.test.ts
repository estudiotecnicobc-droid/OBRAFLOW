import { describe, it, expect } from 'vitest';
import { buildAutoPlan, planNode } from '../autoPlan';
import { computeSchedule, topologicalOrder } from '../scheduleEngine';
import { LinkType } from '../../types';

let n = 0;
const id = () => `d${++n}`;

const items = [
  { id: 'mamp1', rubro: '06 MAMPOSTERÍA, Y OTROS CERRAMIENTOS', name: 'Muro de ladrillo hueco 18' },
  { id: 'mamp2', rubro: '06 MAMPOSTERÍA, Y OTROS CERRAMIENTOS', name: 'Tabique de ladrillo hueco 12' },
  { id: 'cai', rubro: '07 AISLACIONES EN MUROS', name: 'Capa aisladora horizontal' },
  { id: 'agua', rubro: '23 INSTALACIÓN SANITARIA', name: 'Distribución de agua fría' },
  { id: 'inod', rubro: '23 INSTALACIÓN SANITARIA', name: 'Inodoro con mochila' },
  { id: 'boca', rubro: '26 INSTALACIÓN ELÉCTRICA', name: 'Bocas de tomacorriente' },
  { id: 'rev', rubro: '08 REVOQUES', name: 'Revoque grueso interior' },
  { id: 'piso', rubro: '11 PISOS', name: 'Porcelanato' },
  { id: 'pint', rubro: '34 PINTURA', name: 'Látex interior dos manos' },
];

describe('autoPlan', () => {
  it('separa las instalaciones en gruesa y terminación', () => {
    expect(planNode(items[3])).toBe('23a');
    expect(planNode(items[4])).toBe('23b');
    expect(planNode(items[5])).toBe('26a');
    expect(planNode({ id: 'x', rubro: '23 INSTALACIÓN SANITARIA', name: 'Cámara de inspección' })).toBe('23a');
  });

  it('encadena el rubro en serie y respeta la secuencia constructiva sin ciclos', () => {
    const deps = buildAutoPlan(items, id);
    const has = (a: string, b: string, t = LinkType.FS) => deps.some(d => d.fromTaskId === a && d.toTaskId === b && d.type === t);
    expect(has('mamp1', 'mamp2')).toBe(true);
    expect(has('mamp1', 'cai', LinkType.SS)).toBe(true);
    expect(has('mamp2', 'agua')).toBe(true);
    expect(has('agua', 'rev')).toBe(true);
    expect(has('boca', 'rev')).toBe(true);
    // 09 y 10 no están: pisos espera a revoques
    expect(has('rev', 'piso')).toBe(true);
    expect(has('piso', 'inod')).toBe(true);
    expect(has('piso', 'pint')).toBe(true);
    expect(topologicalOrder(items.map(i => i.id), deps).cyclic).toEqual([]);
  });

  it('da fechas en el orden esperado', () => {
    const deps = buildAutoPlan(items, id);
    const s = computeSchedule(
      items.map(i => ({ id: i.id, quantity: 10, dailyYield: 5, crewSize: 1 })),
      deps, '2026-11-02', [1, 2, 3, 4, 5], [],
    );
    const end = (x: string) => s.get(x)!.end;
    const start = (x: string) => s.get(x)!.start;
    expect(start('mamp1')).toBe('2026-11-02');
    expect(start('rev') > end('agua')).toBe(true);
    expect(start('pint') > end('piso')).toBe(true);
    expect(start('inod') > end('piso')).toBe(true);
  });
});
