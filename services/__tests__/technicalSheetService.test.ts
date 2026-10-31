import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = { id: string; organization_id: string | null; code: string; technical_sheet: unknown };

const SHEET = { version: 1, ficha: 'MAM-COM15', titulo: 'Muro', datosTecnicos: [{ label: 'Espesor', value: '0,15 m' }], notas: ['n'], relacionadas: [] };
let rows: Row[] = [];
let missingColumn = false;

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: () => {
      const filters: ((r: Row) => boolean)[] = [];
      const q: any = {
        select: () => q,
        eq: (col: keyof Row, v: unknown) => { filters.push(r => r[col] === v); return q; },
        is: (col: keyof Row, v: unknown) => { filters.push(r => r[col] === v); return q; },
        not: (col: keyof Row) => { filters.push(r => r[col] != null); return q; },
        limit: () => q,
        maybeSingle: async () => {
          if (missingColumn) return { data: null, error: { message: 'column master_tasks.technical_sheet does not exist' } };
          const found = rows.find(r => filters.every(f => f(r)));
          return { data: found ? { technical_sheet: found.technical_sheet } : null, error: null };
        },
      };
      return q;
    },
  },
}));

import { getTechnicalSheet } from '../technicalSheetService';

describe('getTechnicalSheet', () => {
  beforeEach(() => {
    missingColumn = false;
    rows = [
      { id: 'global', organization_id: null, code: 'OF-MAM-101', technical_sheet: SHEET },
      { id: 'copia', organization_id: 'org-1', code: 'OF-MAM-101', technical_sheet: null },
      { id: 'sin', organization_id: 'org-1', code: 'X-1', technical_sheet: null },
    ];
  });

  it('devuelve la ficha propia del APU', async () => {
    const s = await getTechnicalSheet('global', 'OF-MAM-101');
    expect(s?.ficha).toBe('MAM-COM15');
    expect(s?.datosTecnicos).toHaveLength(1);
  });

  it('una copia de empresa sin ficha usa la del catálogo general por código', async () => {
    const s = await getTechnicalSheet('copia', 'OF-MAM-101');
    expect(s?.titulo).toBe('Muro');
  });

  it('sin ficha en ningún lado devuelve null', async () => {
    expect(await getTechnicalSheet('sin', 'X-1')).toBeNull();
  });

  it('si la migración 068 no está aplicada devuelve null sin error', async () => {
    missingColumn = true;
    expect(await getTechnicalSheet('global', 'OF-MAM-101')).toBeNull();
  });
});
