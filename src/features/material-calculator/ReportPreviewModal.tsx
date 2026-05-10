import React, { useState, useRef } from 'react';
import { X, Printer, FileText, BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import { ChandiasAddedItem, ResolvedMaterial } from './engine/chandias';

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type ReportMode = 'computo' | 'apu';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  mode:       ReportMode;
  items:      ChandiasAddedItem[];
  resolved:   ResolvedMaterial[];  // ya calculado en RightPanel (con costos + purchaseQty)
  grandTotal: number;
  onClose:    () => void;
}

// ─── Helpers de formato ───────────────────────────────────────────────────────

const fmtNum  = (n: number, d = 3) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: d });

const fmtCost = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const todayStr = () => new Date().toLocaleDateString('es-AR', {
  day: '2-digit', month: '2-digit', year: 'numeric',
});

// ─── Agrupación APU ──────────────────────────────────────────────────────────

interface APUGroup {
  taskId:    string;
  taskNombre:string;
  unidad:    string;
  totalQty:  number;
  itemCount: number;
  materials: Array<{ nombre: string; unit: string; coef: number }>;
}

function buildAPUGroups(items: ChandiasAddedItem[]): APUGroup[] {
  const byTask = new Map<string, ChandiasAddedItem[]>();
  for (const item of items) {
    if (!byTask.has(item.taskId)) byTask.set(item.taskId, []);
    byTask.get(item.taskId)!.push(item);
  }
  return Array.from(byTask.entries()).map(([taskId, group]) => {
    const first    = group[0];
    const totalQty = group.reduce((s, i) => s + i.quantity, 0);
    const matMap   = new Map<string, { nombre: string; unit: string; total: number }>();
    for (const item of group) {
      const allMats = [
        ...item.materiales,
        ...(item.manualMaterials ?? []).map(m => ({
          nombre: m.nombre, unit: m.unit, coef: 0, cantidad: m.cantidad,
        })),
      ];
      for (const m of allMats) {
        const key = `${m.nombre.toLowerCase()}|${m.unit}`;
        const ex  = matMap.get(key);
        if (ex) ex.total += m.cantidad;
        else    matMap.set(key, { nombre: m.nombre, unit: m.unit, total: m.cantidad });
      }
    }
    const materials = Array.from(matMap.values()).map(({ nombre, unit, total }) => ({
      nombre, unit, coef: totalQty > 0 ? total / totalQty : 0,
    }));
    return { taskId, taskNombre: first.taskNombre, unidad: first.unidad, totalQty, itemCount: group.length, materials };
  });
}

// ─── Generador de HTML de impresión ──────────────────────────────────────────
// Produce un documento HTML standalone con CSS embebido.
// No depende de Tailwind ni del DOM del modal.

interface PrintParams {
  title:        string;
  subtitle:     string;
  projectName:  string;
  clientName:   string;
  observations: string;
  showRubros:   boolean;
  showCosts:    boolean;
  isComputo:    boolean;
  items:        ChandiasAddedItem[];
  resolved:     ResolvedMaterial[];
  grandTotal:   number;
  apuGroups:    APUGroup[];
  resolvedByKey:Map<string, ResolvedMaterial>;
}

function buildPrintDoc(p: PrintParams): string {
  const css = `
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; color: #1e293b;
           padding: 12mm 18mm; margin: 0; }
    h1 { font-size: 14pt; margin: 0 0 3pt; font-weight: bold; }
    h2 { font-size: 9pt; font-weight: bold; text-transform: uppercase;
         letter-spacing: .05em; color: #475569; margin: 14pt 0 4pt; border-bottom: 1px solid #e2e8f0; padding-bottom: 2pt; }
    p  { margin: 0 0 2pt; font-size: 8.5pt; line-height: 1.5; }
    .meta { border: 1px solid #e2e8f0; padding: 6pt 10pt; margin-bottom: 10pt;
            background: #f8fafc; border-radius: 4pt; }
    .meta p { font-size: 8.5pt; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 10pt; font-size: 8.5pt; }
    th  { background: #f1f5f9; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .03em;
          padding: 3pt 5pt; text-align: left; border: 1px solid #cbd5e1; font-weight: bold; }
    td  { padding: 3pt 5pt; border: 1px solid #e2e8f0; vertical-align: top; }
    tr:nth-child(even) td { background: #f8fafc; }
    .r  { text-align: right; }
    .c  { text-align: center; }
    .mono { font-family: monospace; }
    .dim  { color: #64748b; font-size: 7.5pt; }
    .miss { color: #b45309; }
    .buy  { color: #0f5132; font-weight: bold; font-size: 8pt; }
    .buy-unit { color: #64748b; font-size: 7pt; }
    .total-row td { background: #dbeafe !important; font-weight: bold; border-top: 2px solid #3b82f6; }
    .apu-header { background: #1e3a8a; color: white; padding: 4pt 8pt; font-weight: bold;
                  font-size: 9.5pt; border-radius: 3pt 3pt 0 0; }
    .apu-sub    { background: #eff6ff; padding: 3pt 8pt; font-size: 7.5pt; color: #1d4ed8;
                  font-weight: bold; text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid #bfdbfe; }
    @page { margin: 10mm 15mm; }
    @media print { body { padding: 0; } }
  `;

  const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  let body = '';

  // ── Cabecera ────────────────────────────────────────────────────────────────
  body += `<h1>${esc(p.title)}</h1>`;
  body += `<p class="dim">${esc(p.subtitle)}</p>`;

  if (p.projectName || p.clientName || p.observations) {
    body += `<div class="meta">`;
    if (p.projectName)  body += `<p><strong>Proyecto:</strong> ${esc(p.projectName)}</p>`;
    if (p.clientName)   body += `<p><strong>Cliente:</strong> ${esc(p.clientName)}</p>`;
    if (p.observations) body += `<p><strong>Observaciones:</strong> ${esc(p.observations)}</p>`;
    body += `</div>`;
  }

  // ── MODO CÓMPUTO ─────────────────────────────────────────────────────────────
  if (p.isComputo) {
    // Tabla de rubros
    if (p.showRubros && p.items.length > 0) {
      body += `<h2>Rubros agregados (${p.items.length})</h2>`;
      body += `<table><thead><tr>
        <th>Rubro</th><th>ID</th>
        <th class="r">Cantidad</th><th class="c">Und</th>
        <th>Descripción / Ubicación</th>
      </tr></thead><tbody>`;
      for (const item of p.items) {
        body += `<tr>
          <td>${esc(item.taskNombre)}</td>
          <td class="mono dim">${esc(item.taskId)}</td>
          <td class="r mono">${fmtNum(item.quantity)}</td>
          <td class="c">${esc(item.unidad)}</td>
          <td class="dim">${esc(item.description || '—')}</td>
        </tr>`;
      }
      body += `</tbody></table>`;
    }

    // Tabla de materiales: técnica + compra + costos
    if (p.resolved.length > 0) {
      body += `<h2>Materiales consolidados (${p.resolved.length})</h2>`;
      body += `<table><thead><tr>
        <th>Material</th>
        <th class="r">Cant. técnica</th>
        <th class="c">Und</th>
        <th class="r">Compra sugerida</th>
        ${p.showCosts ? '<th class="r">P. Unit.</th><th class="r">Subtotal</th>' : ''}
      </tr></thead><tbody>`;

      for (const m of p.resolved) {
        const missing = m.matchedBy === 'missing';
        const nameCell = missing
          ? `<td class="miss">${esc(m.nombre)}</td>`
          : `<td>${esc(m.nombre)}</td>`;

        const buyCell = m.purchaseQty !== undefined
          ? `<td class="r"><span class="buy">${m.purchaseQty}</span> <span class="buy-unit">${esc(m.commercialUnit ?? '')}</span></td>`
          : `<td class="r dim">—</td>`;

        const costCells = p.showCosts
          ? `<td class="r">${missing ? '—' : '$' + fmtCost(m.unitCost)}</td>
             <td class="r">${missing ? '<span class="miss">sin precio</span>' : '$' + fmtCost(m.totalCost)}</td>`
          : '';

        body += `<tr>
          ${nameCell}
          <td class="r mono">${fmtNum(m.cantidad)}</td>
          <td class="c dim">${esc(m.unit)}</td>
          ${buyCell}
          ${costCells}
        </tr>`;
      }

      if (p.showCosts && p.grandTotal > 0) {
        const colspan = 4 + 1; // nombre + cant + und + compra + p.unit
        body += `<tr class="total-row">
          <td colspan="${colspan}"><strong>TOTAL MATERIALES</strong></td>
          <td class="r"><strong>$${fmtCost(p.grandTotal)}</strong></td>
        </tr>`;
      }

      body += `</tbody></table>`;
    }
  }

  // ── MODO APU ──────────────────────────────────────────────────────────────
  else {
    for (const group of p.apuGroups) {
      body += `<div class="apu-header">${esc(group.taskNombre)}
        <span style="font-size:8pt;opacity:.75;margin-left:10pt;font-family:monospace">${esc(group.taskId)}</span>
        <span style="float:right;font-size:8pt;opacity:.85">${fmtNum(group.totalQty)} ${esc(group.unidad)} · ${group.itemCount} ítem${group.itemCount !== 1 ? 's' : ''}</span>
      </div>`;
      body += `<div class="apu-sub">Receta unitaria — por 1 ${esc(group.unidad)}</div>`;

      body += `<table><thead><tr>
        <th>Material</th>
        <th class="r">Coef / ${esc(group.unidad)}</th>
        <th class="c">Und</th>
        ${p.showCosts ? '<th class="r">P. Unit.</th><th class="r">Costo / und</th>' : ''}
      </tr></thead><tbody>`;

      let unitTotalCost = 0;
      for (const m of group.materials) {
        const rKey  = `${m.nombre.toLowerCase()}|${m.unit}`;
        const rMat  = p.resolvedByKey.get(rKey);
        const price = rMat?.unitCost ?? 0;
        const costPerUnit = price * m.coef;
        unitTotalCost += costPerUnit;

        const costCells = p.showCosts
          ? `<td class="r">${price > 0 ? '$' + fmtCost(price) : '<span class="miss">—</span>'}</td>
             <td class="r">${costPerUnit > 0 ? '$' + fmtCost(costPerUnit) : '<span class="miss">—</span>'}</td>`
          : '';

        body += `<tr>
          <td>${esc(m.nombre)}</td>
          <td class="r mono">${fmtNum(m.coef, 4)}</td>
          <td class="c dim">${esc(m.unit)}</td>
          ${costCells}
        </tr>`;
      }

      if (p.showCosts && unitTotalCost > 0) {
        const colspan = p.showCosts ? 4 : 3;
        body += `<tr class="total-row">
          <td colspan="${colspan}"><strong>Costo unitario total</strong></td>
          <td class="r"><strong>$${fmtCost(unitTotalCost)} / ${esc(group.unidad)}</strong></td>
        </tr>`;
      }

      body += `</tbody></table>`;

      if (p.showRubros) {
        body += `<p class="dim" style="margin-bottom:12pt">
          Total de obra: <strong>${fmtNum(group.totalQty)} ${esc(group.unidad)}</strong> en ${group.itemCount} medición${group.itemCount !== 1 ? 'es' : ''}
        </p>`;
      }
    }
  }

  return `<!DOCTYPE html><html lang="es"><head>
    <meta charset="UTF-8">
    <title>${esc(p.title)}</title>
    <style>${css}</style>
  </head><body>${body}</body></html>`;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export const ReportPreviewModal: React.FC<Props> = ({
  mode, items, resolved, grandTotal, onClose,
}) => {
  const isComputo = mode === 'computo';

  // ── Opciones de visualización
  const [showRubros,   setShowRubros]   = useState(true);
  const [showCosts,    setShowCosts]    = useState(true);

  // ── Datos del informe
  const [showMeta,     setShowMeta]     = useState(false);
  const [projectName,  setProjectName]  = useState('');
  const [clientName,   setClientName]   = useState('');
  const [observations, setObservations] = useState('');

  const apuGroups    = !isComputo ? buildAPUGroups(items) : [];
  const resolvedByKey = new Map(resolved.map(r => [`${r.nombre.toLowerCase()}|${r.unit}`, r]));

  const title    = isComputo ? 'Reporte de Cómputo' : 'Reporte APU';
  const subtitle = isComputo
    ? `${items.length} rubro${items.length !== 1 ? 's' : ''} · ${todayStr()}`
    : `${apuGroups.length} tipo${apuGroups.length !== 1 ? 's' : ''} · receta unitaria · ${todayStr()}`;

  // ── Print: abre nueva ventana con HTML generado ──────────────────────────
  const handlePrint = () => {
    const html = buildPrintDoc({
      title, subtitle, projectName, clientName, observations,
      showRubros, showCosts, isComputo,
      items, resolved, grandTotal, apuGroups, resolvedByKey,
    });
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) { alert('El navegador bloqueó la ventana emergente. Habilitá las ventanas emergentes para este sitio.'); return; }
    w.document.write(html);
    w.document.close();
    // Pequeño delay para que el browser termine de renderizar antes de abrir el diálogo
    setTimeout(() => { w.focus(); w.print(); }, 350);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[92vh] overflow-hidden">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className={`flex items-center gap-3 px-5 py-3.5 shrink-0 text-white ${isComputo ? 'bg-slate-700' : 'bg-blue-700'}`}>
          {isComputo ? <FileText size={17} /> : <BookOpen size={17} />}
          <div className="min-w-0 flex-1">
            <p className="font-bold text-sm">{title}</p>
            <p className="text-xs opacity-70">{subtitle}</p>
          </div>
          <button
            onClick={handlePrint}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors mr-1 ${isComputo ? 'bg-slate-600 hover:bg-slate-500' : 'bg-blue-600 hover:bg-blue-500'}`}
          >
            <Printer size={13} /> Imprimir
          </button>
          <button onClick={onClose} className="p-1.5 hover:opacity-80 rounded-lg">
            <X size={15} />
          </button>
        </div>

        {/* ── Controles ───────────────────────────────────────────────────── */}
        <div className="px-5 py-2.5 border-b border-slate-100 bg-slate-50 shrink-0 space-y-2">

          {/* Row 1: toggles rápidos + acordeón datos */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Mostrar:</span>
            <ToggleChip label="Rubros"  active={showRubros} onClick={() => setShowRubros(v => !v)} />
            <ToggleChip label="Costos"  active={showCosts}  onClick={() => setShowCosts(v => !v)} />
            <button
              onClick={() => setShowMeta(v => !v)}
              className="ml-auto flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-200 rounded-lg border border-slate-200 transition-colors"
            >
              Datos del informe
              {showMeta ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
          </div>

          {/* Row 2: datos del informe (acordeón) */}
          {showMeta && (
            <div className="grid grid-cols-3 gap-2 pt-1 pb-0.5">
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Proyecto</label>
                <input
                  type="text" value={projectName} onChange={e => setProjectName(e.target.value)}
                  placeholder="Nombre del proyecto"
                  className="w-full px-2.5 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Cliente</label>
                <input
                  type="text" value={clientName} onChange={e => setClientName(e.target.value)}
                  placeholder="Nombre del cliente"
                  className="w-full px-2.5 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Observaciones</label>
                <input
                  type="text" value={observations} onChange={e => setObservations(e.target.value)}
                  placeholder="Notas breves"
                  className="w-full px-2.5 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Preview ─────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 text-slate-800">

          {/* Encabezado preview */}
          <div className="border-b border-slate-200 pb-3">
            <h2 className="text-base font-bold text-slate-800">{title}</h2>
            <p className="text-xs text-slate-500">{subtitle}</p>
            {(projectName || clientName || observations) && (
              <div className="mt-2 text-xs text-slate-600 space-y-0.5">
                {projectName  && <p><span className="font-semibold">Proyecto:</span> {projectName}</p>}
                {clientName   && <p><span className="font-semibold">Cliente:</span> {clientName}</p>}
                {observations && <p><span className="font-semibold">Obs.:</span> {observations}</p>}
              </div>
            )}
          </div>

          {/* ── CÓMPUTO ───────────────────────────────────────────────────── */}
          {isComputo && (
            <>
              {/* Rubros */}
              {showRubros && items.length > 0 && (
                <section>
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Rubros agregados ({items.length})
                  </h3>
                  <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
                    <thead>
                      <tr className="bg-slate-50 text-[10px] text-slate-500 uppercase">
                        <th className="px-3 py-2 text-left">Rubro</th>
                        <th className="px-2 py-2 text-right">Cant.</th>
                        <th className="px-2 py-2 text-center">Und</th>
                        <th className="px-3 py-2 text-left">Descripción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, i) => (
                        <tr key={item.itemId} className={i % 2 === 0 ? '' : 'bg-slate-50/50'}>
                          <td className="px-3 py-1.5 font-medium text-slate-800">{item.taskNombre}</td>
                          <td className="px-2 py-1.5 text-right font-bold font-mono text-blue-700">{fmtNum(item.quantity)}</td>
                          <td className="px-2 py-1.5 text-center text-slate-500">{item.unidad}</td>
                          <td className="px-3 py-1.5 text-slate-500 italic text-[10px]">{item.description || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}

              {/* Materiales con capas técnica + comercial unificadas */}
              {resolved.length > 0 && (
                <section>
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Materiales consolidados ({resolved.length})
                  </h3>
                  <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
                    <thead>
                      <tr className="bg-slate-50 text-[10px] text-slate-500 uppercase">
                        <th className="px-3 py-2 text-left">Material</th>
                        <th className="px-2 py-2 text-right">Cant. técnica</th>
                        <th className="px-2 py-2 text-center">Und</th>
                        <th className="px-2 py-2 text-right">Compra sugerida</th>
                        {showCosts && <th className="px-2 py-2 text-right">P. Unit.</th>}
                        {showCosts && <th className="px-2 py-2 text-right">Subtotal</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {resolved.map((m, i) => {
                        const missing = m.matchedBy === 'missing';
                        return (
                          <tr key={i} className={i % 2 === 0 ? '' : 'bg-slate-50/40'}>
                            <td className={`px-3 py-1.5 font-medium ${missing ? 'text-amber-600' : 'text-slate-800'}`}>
                              {m.nombre}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono text-slate-700">{fmtNum(m.cantidad)}</td>
                            <td className="px-2 py-1.5 text-center text-slate-400 text-[10px]">{m.unit}</td>
                            <td className="px-2 py-1.5 text-right">
                              {m.purchaseQty !== undefined
                                ? <span>
                                    <span className="font-bold text-emerald-700">{m.purchaseQty}</span>
                                    {' '}
                                    <span className="text-[10px] text-slate-400">{m.commercialUnit}</span>
                                  </span>
                                : <span className="text-slate-300 text-[10px]">—</span>
                              }
                            </td>
                            {showCosts && (
                              <td className="px-2 py-1.5 text-right text-slate-500">
                                {missing ? '—' : `$${fmtCost(m.unitCost)}`}
                              </td>
                            )}
                            {showCosts && (
                              <td className="px-2 py-1.5 text-right font-semibold">
                                {missing
                                  ? <span className="text-amber-400 text-[10px]">sin precio</span>
                                  : `$${fmtCost(m.totalCost)}`}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {showCosts && grandTotal > 0 && (
                    <div className="mt-2 flex justify-end">
                      <div className="flex items-center gap-4 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                        <span className="text-xs font-bold text-slate-600">TOTAL MATERIALES</span>
                        <span className="text-base font-bold text-blue-700">${fmtCost(grandTotal)}</span>
                      </div>
                    </div>
                  )}
                </section>
              )}
            </>
          )}

          {/* ── APU ───────────────────────────────────────────────────────── */}
          {!isComputo && apuGroups.map(group => {
            let unitTotalCost = 0;
            return (
              <section key={group.taskId} className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-blue-700 text-white">
                  <div>
                    <span className="font-bold text-sm">{group.taskNombre}</span>
                    <span className="ml-2 text-[10px] opacity-60 font-mono">{group.taskId}</span>
                  </div>
                  <div className="text-xs opacity-80 text-right">
                    <span className="font-semibold">{fmtNum(group.totalQty)} {group.unidad}</span>
                    <span className="ml-1">({group.itemCount} ítem{group.itemCount !== 1 ? 's' : ''})</span>
                  </div>
                </div>

                <div className="px-4 py-1.5 bg-blue-50 border-b border-slate-200">
                  <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wide">
                    Receta unitaria — por 1 {group.unidad}
                  </span>
                </div>

                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] text-slate-500 uppercase border-b border-slate-200">
                      <th className="px-3 py-2 text-left">Material</th>
                      <th className="px-2 py-2 text-right">Coef / {group.unidad}</th>
                      <th className="px-2 py-2 text-center">Und</th>
                      {showCosts && <th className="px-2 py-2 text-right">P. Unit.</th>}
                      {showCosts && <th className="px-2 py-2 text-right">Costo / und</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {group.materials.map((m, i) => {
                      const rKey   = `${m.nombre.toLowerCase()}|${m.unit}`;
                      const rMat   = resolvedByKey.get(rKey);
                      const price  = rMat?.unitCost ?? 0;
                      const cPUnit = price * m.coef;
                      unitTotalCost += cPUnit;
                      return (
                        <tr key={i} className={`border-b border-slate-50 ${i % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                          <td className="px-3 py-1.5 font-medium text-slate-700">{m.nombre}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-slate-700">{fmtNum(m.coef, 4)}</td>
                          <td className="px-2 py-1.5 text-center text-slate-400 text-[10px]">{m.unit}</td>
                          {showCosts && (
                            <td className="px-2 py-1.5 text-right text-slate-500">
                              {price > 0 ? `$${fmtCost(price)}` : <span className="text-amber-400 text-[10px]">—</span>}
                            </td>
                          )}
                          {showCosts && (
                            <td className="px-2 py-1.5 text-right font-semibold text-slate-700">
                              {cPUnit > 0 ? `$${fmtCost(cPUnit)}` : <span className="text-amber-400 text-[10px]">—</span>}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {showCosts && unitTotalCost > 0 && (
                  <div className="flex justify-end px-3 py-2 bg-blue-50 border-t border-blue-100">
                    <span className="text-xs font-bold text-slate-600 mr-4">Costo unitario total</span>
                    <span className="text-sm font-bold text-blue-700">${fmtCost(unitTotalCost)} / {group.unidad}</span>
                  </div>
                )}

                {showRubros && (
                  <div className="px-4 py-1.5 bg-slate-50 border-t border-slate-100">
                    <p className="text-[10px] text-slate-500">
                      Total de obra: <strong>{fmtNum(group.totalQty)} {group.unidad}</strong>
                      {' · '}{group.itemCount} medición{group.itemCount !== 1 ? 'es' : ''}
                    </p>
                  </div>
                )}
              </section>
            );
          })}

          {items.length === 0 && (
            <p className="text-center text-slate-400 text-sm py-12">Sin rubros para mostrar</p>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Chip de toggle ───────────────────────────────────────────────────────────

const ToggleChip: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({
  label, active, onClick,
}) => (
  <button
    onClick={onClick}
    className={`px-2.5 py-1 text-[10px] font-semibold rounded-lg border transition-colors ${
      active
        ? 'bg-blue-600 text-white border-blue-600'
        : 'text-slate-500 border-slate-200 hover:border-blue-300 bg-white'
    }`}
  >
    {label}
  </button>
);
