import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseCacWorkbook, parseIccIndecWorkbook, findFileUrl } from '../../api/sync-indices';

const toBuf = (wb: XLSX.WorkBook) => XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

describe('sync-indices parsers', () => {
  it('lee la hoja ICC - CAC (fecha, general, materiales, mano de obra)', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Índice del Costo de la Construcción (ICC-CAC).'],
      ['Período', null, 'Nivel general', 'Capítulo'],
      [null, null, null, 'Materiales', 'Mano de obra'],
      [new Date(Date.UTC(2026, 3, 1, 12)), null, 20493.2, 22870, 17009.6],
      [new Date(Date.UTC(2026, 4, 1, 12)), null, 21035.6, 23500.2, 17423.2],
      [new Date(Date.UTC(2026, 5, 1, 12)), null, 'El último dato estará disponible…'],
    ], { cellDates: true });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ICC - CAC');
    const rows = parseCacWorkbook(toBuf(wb));
    expect(rows.filter(r => r.code === 'cac_general').map(r => r.period)).toEqual(['2026-04-01', '2026-05-01']);
    expect(rows.find(r => r.code === 'cac_mano_obra' && r.period === '2026-05-01')?.value).toBe(17423.2);
  });

  it('encadena las variaciones mensuales del ICC INDEC con base oct-2015 = 100', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Índice del Costo de la Construcción (ICC-INDEC)'],
      [null, 'Nov-15', 'Dic-15', 'Ene-Dic 2016', 'Ene-16*'],
      ['Nivel General', 1, 2, 99, 10],
      ['Materiales', 0, 0, 99, 0],
      ['Mano de obra 1', 5, 0, 99, 0],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ICC - Desde Nov 2015');
    const rows = parseIccIndecWorkbook(toBuf(wb));
    const gen = rows.filter(r => r.code === 'icc_general');
    expect(gen.map(r => r.period)).toEqual(['2015-10-01', '2015-11-01', '2015-12-01', '2016-01-01']);
    expect(gen[3].value).toBeCloseTo(100 * 1.01 * 1.02 * 1.1, 3);
    expect(rows.find(r => r.code === 'icc_mano_obra' && r.period === '2015-11-01')?.value).toBe(105);
  });

  it('encuentra el último link a la planilla en la página de IERIC', () => {
    const html = '<a href="https://www.ieric.org.ar/wp-content/uploads/2026/08/ICC-CAC.xls">a</a> <a href="https://www.ieric.org.ar/wp-content/uploads/2026/09/ICC-CAC.xls">b</a>';
    expect(findFileUrl(html, 'ICC-CAC.xls')).toBe('https://www.ieric.org.ar/wp-content/uploads/2026/09/ICC-CAC.xls');
    expect(findFileUrl(html, 'ICC-INDEC.xls')).toBeNull();
  });
});
