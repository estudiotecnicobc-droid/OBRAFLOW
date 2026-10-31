import { describe, it, expect, vi } from 'vitest';

vi.mock('../supabaseClient', () => ({ supabase: {} }));

import { loadAllYields, EMPTY_YIELDS } from '../yieldsLoader';

const ok = {
  tasks: { listYieldsForTasks: async () => ({ yields: [{ taskId: 't1' }], laborYields: [{ taskId: 't1' }], toolYields: [] }) },
  crews: { listCrewYieldsForTasks: async () => [{ taskId: 't1' }] },
} as any;

describe('loadAllYields', () => {
  it('devuelve todos los rendimientos cuando la carga es completa', async () => {
    const { data, error } = await loadAllYields(['t1'], ok);
    expect(error).toBeNull();
    expect(data.yields).toHaveLength(1);
    expect(data.crewYields).toHaveLength(1);
  });

  it('si falla la carga de yields no devuelve datos parciales', async () => {
    const deps = { ...ok, tasks: { listYieldsForTasks: async () => { throw new Error('400 Bad Request'); } } };
    const { data, error } = await loadAllYields(['t1'], deps);
    expect(error).toBe('400 Bad Request');
    expect(data).toEqual(EMPTY_YIELDS);
  });

  it('si falla la carga de cuadrillas tampoco devuelve datos parciales', async () => {
    const deps = { ...ok, crews: { listCrewYieldsForTasks: async () => { throw new Error('timeout'); } } };
    const { data, error } = await loadAllYields(['t1'], deps);
    expect(error).toBe('timeout');
    expect(data).toEqual(EMPTY_YIELDS);
  });

  it('un reintento exitoso limpia el error', async () => {
    let fail = true;
    const deps = { ...ok, tasks: { listYieldsForTasks: async () => { if (fail) throw new Error('x'); return ok.tasks.listYieldsForTasks(); } } };
    expect((await loadAllYields(['t1'], deps)).error).toBe('x');
    fail = false;
    const retry = await loadAllYields(['t1'], deps);
    expect(retry.error).toBeNull();
    expect(retry.data.yields).toHaveLength(1);
  });

  it('sin tareas no consulta y no da error', async () => {
    const spy = vi.fn();
    const { data, error } = await loadAllYields([], { tasks: { listYieldsForTasks: spy }, crews: { listCrewYieldsForTasks: spy } } as any);
    expect(spy).not.toHaveBeenCalled();
    expect(error).toBeNull();
    expect(data).toEqual(EMPTY_YIELDS);
  });
});
