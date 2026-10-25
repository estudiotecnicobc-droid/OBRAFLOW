import { describe, it, expect } from 'vitest';
import { comparePlanVsReal } from '../planVsReal';

const base = [
  { id: 'a', name: 'Limpieza', end: '2026-05-04' },
  { id: 'b', name: 'Excavación', end: '2026-05-12' },
  { id: 'c', name: 'Hormigón', end: '2026-05-20' },
];

describe('comparePlanVsReal', () => {
  it('todo en tiempo → status ok', () => {
    const r = comparePlanVsReal(base, base);
    expect(r).toMatchObject({ late: 0, early: 0, onTime: 3, projectDelayDays: 0, maxDelay: null, status: 'ok' });
  });

  it('una tarea intermedia atrasada sin mover el fin de obra → warning', () => {
    const current = [base[0], { ...base[1], end: '2026-05-15' }, base[2]];
    const r = comparePlanVsReal(current, base);
    expect(r.late).toBe(1);
    expect(r.onTime).toBe(2);
    expect(r.maxDelay).toEqual({ id: 'b', name: 'Excavación', days: 3 });
    expect(r.projectDelayDays).toBe(0);
    expect(r.status).toBe('warning');
  });

  it('fin de obra atrasado → late, y elige el mayor desfase', () => {
    const current = [{ ...base[0], end: '2026-05-06' }, base[1], { ...base[2], end: '2026-05-27' }];
    const r = comparePlanVsReal(current, base);
    expect(r.late).toBe(2);
    expect(r.maxDelay?.id).toBe('c');
    expect(r.maxDelay?.days).toBe(7);
    expect(r.projectDelayDays).toBe(7);
    expect(r.status).toBe('late');
  });

  it('cuenta adelantadas y no las toma como atraso', () => {
    const current = [{ ...base[0], end: '2026-05-01' }, base[1], base[2]];
    const r = comparePlanVsReal(current, base);
    expect(r.early).toBe(1);
    expect(r.late).toBe(0);
    expect(r.status).toBe('ok');
  });

  it('ignora tareas que no estaban en la línea base', () => {
    const current = [...base, { id: 'z', name: 'Nueva', end: '2026-06-30' }];
    const r = comparePlanVsReal(current, base);
    expect(r.late + r.early + r.onTime).toBe(3);
    expect(r.projectDelayDays).toBe(41);
  });

  it('cruza fin de mes y cambio de horario sin errores de redondeo', () => {
    const r = comparePlanVsReal([{ id: 'a', name: 'x', end: '2026-11-02' }], [{ id: 'a', name: 'x', end: '2026-10-30' }]);
    expect(r.maxDelay?.days).toBe(3);
  });
});
