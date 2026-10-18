import { describe, it, expect } from 'vitest';
import { computeSchedule, resolveDependencies, topologicalOrder } from '../scheduleEngine';
import { LinkType, ProjectDependency } from '../../types';

const dep = (
  fromTaskId: string,
  toTaskId: string,
  type: LinkType = LinkType.FS,
  lag: number = 0,
): ProjectDependency => ({
  id: `${fromTaskId}-${toTaskId}`,
  fromTaskId,
  toTaskId,
  type,
  lag,
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

describe('computeSchedule — lag en Fin-Comienzo', () => {
  it('corre el inicio del sucesor el lag indicado (positivo)', () => {
    const items = [
      { id: 'A', quantity: 10, dailyYield: 5, crewSize: 1 }, // termina 2026-01-06 (martes)
      { id: 'B', quantity: 10, dailyYield: 5, crewSize: 1 },
    ];
    const schedule = computeSchedule(items, [dep('A', 'B', LinkType.FS, 2)], PROJECT_START, [1, 2, 3, 4, 5], []);
    expect(schedule.get('B')!.start).toBe('2026-01-09'); // fin de A + 1 + 2 días de lag
  });
});

describe('computeSchedule — Comienzo-Comienzo (SS)', () => {
  it('el sucesor arranca junto con el predecesor, más el lag', () => {
    const items = [
      { id: 'A', quantity: 10, dailyYield: 5, crewSize: 1 },
      { id: 'B', quantity: 15, dailyYield: 5, crewSize: 1 },
    ];
    const noLag = computeSchedule(items, [dep('A', 'B', LinkType.SS, 0)], PROJECT_START, [1, 2, 3, 4, 5], []);
    expect(noLag.get('B')!.start).toBe(noLag.get('A')!.start);

    const withLag = computeSchedule(items, [dep('A', 'B', LinkType.SS, 2)], PROJECT_START, [1, 2, 3, 4, 5], []);
    expect(withLag.get('B')!.start).toBe('2026-01-07'); // inicio de A + 2 días
  });
});

describe('computeSchedule — Fin-Fin (FF)', () => {
  it('el sucesor termina junto con el predecesor (lag=0)', () => {
    const items = [
      { id: 'A', quantity: 10, dailyYield: 5, crewSize: 1 }, // termina 2026-01-06
      { id: 'B', quantity: 10, dailyYield: 5, crewSize: 1 }, // 2 días hábiles
    ];
    const schedule = computeSchedule(items, [dep('A', 'B', LinkType.FF, 0)], PROJECT_START, [1, 2, 3, 4, 5], []);
    expect(schedule.get('B')!.end).toBe(schedule.get('A')!.end);
  });

  it('el lag corre la fecha de fin deseada del sucesor', () => {
    const items = [
      { id: 'A', quantity: 10, dailyYield: 5, crewSize: 1 }, // termina 2026-01-06
      { id: 'B', quantity: 10, dailyYield: 5, crewSize: 1 },
    ];
    const schedule = computeSchedule(items, [dep('A', 'B', LinkType.FF, 1)], PROJECT_START, [1, 2, 3, 4, 5], []);
    expect(schedule.get('B')!.end).toBe('2026-01-07'); // fin de A + 1 día
  });
});

describe('computeSchedule — Comienzo-Fin (SF)', () => {
  it('el sucesor termina cuando arranca el predecesor, saltando el fin de semana hacia atrás', () => {
    const items = [
      // A arranca el lunes siguiente (2026-01-12): deja hueco para que la
      // restricción SF empuje a B más tarde que la fecha de inicio del
      // proyecto — si no, no se podría distinguir de "sin efecto" (ver nota
      // de la política "nunca antes del baseline" en scheduleEngine.ts).
      { id: 'A', quantity: 10, dailyYield: 5, crewSize: 1, startDate: '2026-01-12' },
      { id: 'B', quantity: 10, dailyYield: 5, crewSize: 1 }, // 2 días hábiles
    ];
    const schedule = computeSchedule(items, [dep('A', 'B', LinkType.SF, 0)], PROJECT_START, [1, 2, 3, 4, 5], []);
    const b = schedule.get('B')!;
    expect(b.end).toBe('2026-01-12'); // termina cuando A arranca
    expect(b.start).toBe('2026-01-09'); // viernes anterior: 2 días hábiles salteando el fin de semana
  });

  it('nunca empuja el inicio antes del baseline del propio ítem (política del motor)', () => {
    const items = [
      { id: 'A', quantity: 10, dailyYield: 5, crewSize: 1 }, // arranca 2026-01-05
      { id: 'B', quantity: 10, dailyYield: 5, crewSize: 1 }, // 2 días hábiles
    ];
    // SF sin lag pediría que B termine el 2026-01-05 (cuando A arranca), lo
    // que requeriría empezar antes del inicio del proyecto. El motor no
    // retrocede: B se programa igual que si no tuviera esa dependencia.
    const schedule = computeSchedule(items, [dep('A', 'B', LinkType.SF, 0)], PROJECT_START, [1, 2, 3, 4, 5], []);
    const b = schedule.get('B')!;
    expect(b.start).toBe(PROJECT_START);
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
