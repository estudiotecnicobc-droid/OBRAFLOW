import type { BudgetVersionItem, BudgetVersionTotals } from '../../../../services/budgetVersionsService';
import { formatPeriod } from '../../../../services/priceIndicesService';

interface ReportInput {
  projectName: string;
  title: string;
  methodLabel: string;
  basePeriod?: string;
  targetPeriod?: string;
  formulas: { comp: string; text: string }[];
  original: { items: BudgetVersionItem[]; totals: BudgetVersionTotals };
  updated: { items: BudgetVersionItem[]; totals: BudgetVersionTotals };
  kFactor: number;
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const money = (v: number) => '$ ' + Math.round(v).toLocaleString('es-AR');
const pct = (a: number, b: number) => (a > 0 ? ((b / a - 1) * 100).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %' : '—');

function totalsByCategory(items: BudgetVersionItem[]) {
  const m = new Map<string, number>();
  for (const i of items) m.set(i.category, (m.get(i.category) ?? 0) + i.total);
  return m;
}

export function openBudgetVersionReport(r: ReportInput) {
  const orig = totalsByCategory(r.original.items);
  const upd = totalsByCategory(r.updated.items);
  const updById = new Map(r.updated.items.map(i => [i.budgetItemId, i]));

  const rubroRows = [...orig.entries()].map(([cat, o]) => {
    const u = upd.get(cat) ?? 0;
    return `<tr><td>${esc(cat)}</td><td class="n">${money(o)}</td><td class="n">${money(u)}</td><td class="n">${money(u - o)}</td><td class="n">${pct(o, u)}</td></tr>`;
  }).join('');

  const itemRows = r.original.items.map(o => {
    const u = updById.get(o.budgetItemId);
    const uo = o.materialUnit + o.laborUnit + o.equipmentUnit + o.fixedUnit;
    const uu = u ? u.materialUnit + u.laborUnit + u.equipmentUnit + u.fixedUnit : 0;
    return `<tr><td>${esc(o.name)}</td><td>${esc(o.unit)}</td><td class="n">${o.quantity.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</td><td class="n">${money(uo)}</td><td class="n">${money(uu)}</td><td class="n">${money(u?.total ?? 0)}</td></tr>`;
  }).join('');

  const period = r.basePeriod && r.targetPeriod ? `${formatPeriod(r.basePeriod)} → ${formatPeriod(r.targetPeriod)}` : '';
  const formulas = r.formulas.map(f => `<li><strong>${esc(f.comp)}:</strong> ${esc(f.text)}</li>`).join('');

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(r.title)} · ${esc(r.projectName)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: 'Times New Roman', Times, serif; color: #111; font-size: 11pt; line-height: 1.4; margin: 0; padding: 24px; }
  h1 { font-size: 16pt; margin: 0 0 4px 0; }
  h2 { font-size: 12pt; margin: 22px 0 8px 0; border-bottom: 1px solid #999; padding-bottom: 3px; }
  p { text-align: justify; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  th, td { border-bottom: 1px solid #ccc; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { border-bottom: 1px solid #333; }
  .n { text-align: right; white-space: nowrap; }
  tfoot td { font-weight: bold; border-top: 1px solid #333; }
  ul { margin: 4px 0; padding-left: 18px; }
  .meta { color: #333; }
  .noprint { margin-bottom: 16px; }
  @media print { .noprint { display: none; } body { padding: 0; } }
</style></head><body>
<div class="noprint"><button onclick="window.print()">Imprimir o guardar como PDF</button></div>
<h1>${esc(r.title)}</h1>
<p class="meta">Obra: ${esc(r.projectName)} · Fecha del reporte: ${new Date().toLocaleDateString('es-AR')}</p>
<p class="meta">Método: ${esc(r.methodLabel)}${period ? ` · Período: ${esc(period)}` : ''}</p>
<h2>Cálculo del coeficiente</h2>
<ul>${formulas}</ul>
<p>Los precios unitarios se actualizan multiplicando cada componente (materiales, mano de obra, equipos y otros) por el coeficiente correspondiente. El precio de venta aplica el coeficiente de pase K ${r.kFactor.toLocaleString('es-AR', { maximumFractionDigits: 4 })}.</p>
<h2>Resumen</h2>
<table>
  <thead><tr><th></th><th class="n">Original</th><th class="n">Actualizado</th><th class="n">Diferencia</th><th class="n">Variación</th></tr></thead>
  <tbody>
    <tr><td>Costo directo</td><td class="n">${money(r.original.totals.direct)}</td><td class="n">${money(r.updated.totals.direct)}</td><td class="n">${money(r.updated.totals.direct - r.original.totals.direct)}</td><td class="n">${pct(r.original.totals.direct, r.updated.totals.direct)}</td></tr>
    <tr><td>Precio de venta</td><td class="n">${money(r.original.totals.sale)}</td><td class="n">${money(r.updated.totals.sale)}</td><td class="n">${money(r.updated.totals.sale - r.original.totals.sale)}</td><td class="n">${pct(r.original.totals.sale, r.updated.totals.sale)}</td></tr>
  </tbody>
</table>
<h2>Por rubro (costo directo)</h2>
<table>
  <thead><tr><th>Rubro</th><th class="n">Original</th><th class="n">Actualizado</th><th class="n">Diferencia</th><th class="n">Variación</th></tr></thead>
  <tbody>${rubroRows}</tbody>
</table>
<h2>Detalle por ítem</h2>
<table>
  <thead><tr><th>Ítem</th><th>Unidad</th><th class="n">Cantidad</th><th class="n">P. unit. original</th><th class="n">P. unit. actualizado</th><th class="n">Total actualizado</th></tr></thead>
  <tbody>${itemRows}</tbody>
  <tfoot><tr><td colspan="5">Costo directo actualizado</td><td class="n">${money(r.updated.totals.direct)}</td></tr></tfoot>
</table>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) {
    alert('El navegador bloqueó la ventana del reporte. Permití las ventanas emergentes para obraflow.net.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
