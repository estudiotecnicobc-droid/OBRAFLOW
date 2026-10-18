import { describe, it, expect } from 'vitest';
import { computeSchedule, resolveDependencies, topologicalOrder } from '../scheduleEngine';
import { LinkType, ProjectDependency } from '../../types';

const dep = (fromTaskId: string, toTaskId: string): ProjectDependency => ({
  id: `${fromTaskId}-${toTaskId}`,
  fromTaskId,
  toTaskId,
  type: LinkType.FS,
  lag: 0,
});

const PROJECT_START = '2026-01-05'; // lunes

describe('resolveDependencies', () => {
  it('prioriza project.dependencies (modelo centralizado) cuando existe', () => {
    const centralized = [dep('A', 'B')];
    const result = resolveDependencies(centralized, [
      { id: 'B', legacyDependencies: [{ predecessorId: 'X', type: LinkType.FS, lag: 0 }] },
    ]);
    expect(result).toBe(centralized);
  });

  it('cae al campo legacy item.dependencies si project.dependencies está vacío', () => {
    const result = resolveDependencies(undefined, [
      { id: 'B', legacyDependencies: [{ predecessorId: 'A', type: LinkType.FS, lag: 0 }] },
    ]);
    expect(result).toEqual([{ id: 'B-A', fromTaskId: 'A', toTaskId: 'B', type: LinkType.FS, lag: 0 }]);
  });
});

describe('topologicalOrder', () => {
  it('ordena una cadena simple A -> B -> C', () => {
    const { order, cyclic } = topologicalOrder(['C', 'A', 'B'], [dep('A', 'B'), dep('B', 'C')]);
    expect(cyclic).toEqual([]);
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'));
    expect(order.indexOf('B')).toBeLessThan(order.indexOf('C'));
  });

  it('detecta un ciclo sin colgarse y separa los ítems afectados', () => {
    const { order, cyclic } = topologicalOrder(['A', 'B'], [dep('A', 'B'), dep('B', 'A')]);
    expect(order).toEqual([]);
    expect(cyclic.sort()).toEqual(['A', 'B']);
  });

  it('ignora una autodependencia (misma tarea) en vez de romper el orden', () => {
    const { order, cyclic } = topologicalOrder(['A'], [dep('A', 'A')]);
    expect(order).toEqual(['A']);
    expect(cyclic).toEqual([]);
  });
});

describe('computeSchedule — cadena', () => {
  it('cada tarea empieza el día hábil siguiente al fin de su predecesora', () => {
    const items = [
      { id: 'A', quantity: 10, dailyYield: 5, crewSize: 1 }, // 2 días
      { id: 'B', quantity: 10, dailyYield: 5, crewSize: 1 },
      { id: 'C', quantity: 10, dailyYield: 5, crewSize: 1 },
    ];
    const dependencies = [dep('A', 'B'), dep('B', 'C')];
    const schedule = computeSchedule(items, dependencies, PROJECT_START, [1, 2, 3, 4, 5], []);

    const a = schedule.get('A')!;
    const b = schedule.get('B')!;
    const c = schedule.get('C')!;

    expect(a.start).toBe('2026-01-05');
    expect(a.end).toBe('2026-01-06'); // 2 días hábiles: lun-mar
    expect(b.start).toBe('2026-01-07'); // día siguiente (miércoles)
    expect(c.start > b.end).toBe(true);
  });
});

describe('computeSchedule — abanico (fan-in)', () => {
  it('la tarea sucesora espera al predecesor que termina más tarde', () => {
    const items = [
      { id: 'A', quantity: 10, dailyYield: 5, crewSize: 1 }, // 2 días: termina antes
      { id: 'B', quantity: 50, dailyYield: 5, crewSize: 1 }, // 10 días: termina después
      { id: 'C', quantity: 10, dailyYield: 5, crewSize: 1 },
    ];
    const dependencies = [dep('A', 'C'), dep('B', 'C')];
    const schedule = computeSchedule(items, dependencies, PROJECT_START, [1, 2, 3, 4, 5], []);

    const b = schedule.get('B')!;
    const c = schedule.get('C')!;
    expect(c.start > b.end).toBe(true);
  });
});

describe('computeSchedule — ciclo', () => {
  it('no descarta las tareas cíclicas: las programa igual, marcadas con hasCycleError', () => {
    const items = [
      { id: 'A', quantity: 10, dailyYield: 5, crewSize: 1 },
      { id: 'B', quantity: 10, dailyYield: 5, crewSize: 1 },
    ];
    const dependencies = [dep('A', 'B'), dep('B', 'A')];
    const schedule = computeSchedule(items, dependencies, PROJECT_START, [1, 2, 3, 4, 5], []);

    expect(schedule.size).toBe(2);
    expect(schedule.get('A')!.hasCycleError).toBe(true);
    expect(schedule.get('B')!.hasCycleError).toBe(true);
    // Sin vínculos confiables, cada una arranca en la fecha de inicio del proyecto.
    expect(schedule.get('A')!.start).toBe(PROJECT_START);
    expect(schedule.get('B')!.start).toBe(PROJECT_START);
  });
});

describe('computeSchedule — feriados', () => {
  it('salta los feriados de la organización al calcular la fecha de fin', () => {
    const items = [{ id: 'A', quantity: 15, dailyYield: 5, crewSize: 1 }]; // 3 días hábiles
    // Feriado el martes 2026-01-06: debe correrse un día más.
    const schedule = computeSchedule(items, [], PROJECT_START, [1, 2, 3, 4, 5], [{ date: '2026-01-06', description: 'Feriado de prueba' }]);
    const a = schedule.get('A')!;
    expect(a.start).toBe('2026-01-05');
    // lun 05, (mar 06 feriado, se salta), mie 07, jue 08 -> fin jue 08
    expect(a.end).toBe('2026-01-08');
  });
});

describe('computeSchedule — sin rendimiento', () => {
  it('marca hasYield=false en vez de inventar una duración real', () => {
    const items = [{ id: 'A', quantity: 10, dailyYield: 0, crewSize: 1 }];
    const schedule = computeSchedule(items, [], PROJECT_START, [1, 2, 3, 4, 5], []);
    const a = schedule.get('A')!;
    expect(a.hasYield).toBe(false);
    expect(a.duration).toBe(1); // fallback interno de calculateDuration, pero queda marcado
  });

  it('respeta la duración manual aunque no haya rendimiento', () => {
    const items = [{ id: 'A', quantity: 10, dailyYield: 0, crewSize: 1, manualDuration: 7 }];
    const schedule = computeSchedule(items, [], PROJECT_START, [1, 2, 3, 4, 5], []);
    const a = schedule.get('A')!;
    expect(a.duration).toBe(7);
    expect(a.hasYield).toBe(false);
  });
});
