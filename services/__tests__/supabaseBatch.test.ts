import { describe, it, expect, vi, beforeEach } from 'vitest';

// Tabla simulada: 2500 filas repartidas entre 800 task_id.
const TASK_IDS = Array.from({ length: 800 }, (_, i) => `t${i}`);
const ROWS = Array.from({ length: 2500 }, (_, i) => ({ id: `r${String(i).padStart(5, '0')}`, task_id: TASK_IDS[i % 800] }));

const calls: { inSize: number; from: number; to: number }[] = [];

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: () => {
      let ids: string[] = [];
      const q: any = {
        select: () => q,
        in: (_col: string, v: string[]) => { ids = v; return q; },
        order: () => q,
        range: async (from: number, to: number) => {
          calls.push({ inSize: ids.length, from, to });
          if (ids.length > 200) return { data: null, error: { message: 'Bad Request' } };
          const set = new Set(ids);
          const matched = ROWS.filter(r => set.has(r.task_id)).sort((a, b) => a.id.localeCompare(b.id));
          return { data: matched.slice(from, to + 1), error: null };
        },
      };
      return q;
    },
  },
}));

import { selectInChunks } from '../supabaseBatch';

describe('selectInChunks', () => {
  beforeEach(() => { calls.length = 0; });

  it('trae todas las filas partiendo los IDs en lotes chicos', async () => {
    const { data, error } = await selectInChunks('task_yields', 'task_id', TASK_IDS);
    expect(error).toBeNull();
    expect(data).toHaveLength(ROWS.length);
    expect(Math.max(...calls.map(c => c.inSize))).toBeLessThanOrEqual(150);
  });

  it('pagina cuando un lote supera el tope de filas por request', async () => {
    const { data } = await selectInChunks('task_yields', 'task_id', TASK_IDS, { chunkSize: 200, pageSize: 100 });
    expect(data).toHaveLength(ROWS.length);
    expect(new Set(data.map(r => r.id)).size).toBe(ROWS.length);
    expect(calls.some(c => c.from > 0)).toBe(true);
  });

  it('informa el error sin romper', async () => {
    const { error } = await selectInChunks('task_yields', 'task_id', TASK_IDS, { chunkSize: 800 });
    expect(error?.message).toBe('Bad Request');
  });

  it('con lista vacía no hace requests', async () => {
    const { data } = await selectInChunks('task_yields', 'task_id', []);
    expect(data).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
