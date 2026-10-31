import XLSXStyle from 'xlsx-js-style';

export interface XlsxColumn {
  header: string;
  width: number;
  /** Formato numérico de Excel, ej. '#,##0.00'. */
  format?: string;
}

export interface XlsxSection {
  /** Fila de subtítulo antes de las filas (ej. un rubro o una categoría). */
  title?: string;
  rows: (string | number | null)[][];
  /** Fila de subtotal al final de la sección. */
  subtotal?: (string | number | null)[];
}

export interface XlsxReport {
  filename: string;
  title: string;
  /** Líneas debajo del título (proyecto, fecha, aclaraciones). */
  info?: string[];
  columns: XlsxColumn[];
  sections: XlsxSection[];
  total?: (string | number | null)[];
  notes?: string[];
}

const BD = { style: 'thin' as const, color: { rgb: 'CBD5E1' } };
const BORDER = { top: BD, bottom: BD, left: BD, right: BD };
const FONT = 'Arial';

export function exportReportXlsx(r: XlsxReport): void {
  const n = r.columns.length;
  const aoa: (string | number | null)[][] = [];
  const styles: { row: number; kind: 'title' | 'info' | 'head' | 'section' | 'body' | 'subtotal' | 'total' | 'note' }[] = [];
  const push = (row: (string | number | null)[], kind: (typeof styles)[number]['kind']) => {
    styles.push({ row: aoa.length, kind });
    aoa.push([...row, ...Array(Math.max(0, n - row.length)).fill('')]);
  };

  push([r.title], 'title');
  for (const line of r.info ?? []) push([line], 'info');
  aoa.push(Array(n).fill(''));
  push(r.columns.map(c => c.header), 'head');
  for (const s of r.sections) {
    if (s.title) push([s.title], 'section');
    for (const row of s.rows) push(row, 'body');
    if (s.subtotal) push(s.subtotal, 'subtotal');
  }
  if (r.total) push(r.total, 'total');
  if (r.notes?.length) {
    aoa.push(Array(n).fill(''));
    for (const note of r.notes) push([note], 'note');
  }

  const ws = XLSXStyle.utils.aoa_to_sheet(aoa);
  ws['!cols'] = r.columns.map(c => ({ wch: c.width }));
  ws['!merges'] = styles
    .filter(s => ['title', 'info', 'section', 'note'].includes(s.kind))
    .map(s => ({ s: { r: s.row, c: 0 }, e: { r: s.row, c: n - 1 } }));

  for (const { row, kind } of styles) {
    for (let c = 0; c < n; c++) {
      const addr = XLSXStyle.utils.encode_cell({ r: row, c });
      if (!ws[addr]) ws[addr] = { v: '', t: 's' };
      const cell = ws[addr];
      const fmt = r.columns[c].format;
      const isNum = typeof cell.v === 'number';
      if (isNum && fmt) cell.z = fmt;
      const base = { font: { name: FONT, sz: 10, color: { rgb: '1E293B' } }, alignment: { vertical: 'center', horizontal: isNum ? 'right' : 'left', wrapText: kind === 'body' } };
      cell.s = {
        title: { font: { name: FONT, sz: 14, bold: true, color: { rgb: '0F172A' } } },
        info: { font: { name: FONT, sz: 10, color: { rgb: '64748B' } } },
        head: { ...base, font: { name: FONT, sz: 10, bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1E293B' } }, border: BORDER, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } },
        section: { font: { name: FONT, sz: 10, bold: true, color: { rgb: '0F172A' } }, fill: { fgColor: { rgb: 'E2E8F0' } }, border: BORDER },
        body: { ...base, border: BORDER },
        subtotal: { ...base, font: { name: FONT, sz: 10, bold: true }, fill: { fgColor: { rgb: 'F1F5F9' } }, border: BORDER },
        total: { ...base, font: { name: FONT, sz: 11, bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '0F172A' } }, border: BORDER },
        note: { font: { name: FONT, sz: 9, italic: true, color: { rgb: '64748B' } } },
      }[kind];
    }
  }

  const wb = XLSXStyle.utils.book_new();
  XLSXStyle.utils.book_append_sheet(wb, ws, 'Reporte');
  XLSXStyle.writeFile(wb, `${r.filename}.xlsx`);
}

export const safeFilename = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase();
