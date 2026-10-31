import React from 'react';
import {
  type ApuSheet, type LaborBreakdown, type PurchaseLine, WORKDAY_HOURS, groupBy,
} from './reportData';
import { exportReportXlsx, safeFilename } from './exportXlsx';

// Estilos en línea: la misma marca se usa en pantalla y en la ventana de impresión.
const SERIF = "'Times New Roman', Times, serif";
const S = {
  page: { fontFamily: SERIF, color: '#111827', fontSize: 12, lineHeight: 1.4 } as React.CSSProperties,
  title: { fontSize: 20, fontWeight: 700, margin: 0 } as React.CSSProperties,
  info: { fontSize: 11, color: '#4b5563', margin: '2px 0 0' } as React.CSSProperties,
  rule: { border: 0, borderTop: '1.5px solid #111827', margin: '10px 0 14px' } as React.CSSProperties,
  h2: { fontSize: 14, fontWeight: 700, margin: '18px 0 6px' } as React.CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 11 } as React.CSSProperties,
  th: { borderBottom: '1px solid #111827', padding: '4px 6px', textAlign: 'left', fontWeight: 700 } as React.CSSProperties,
  td: { borderBottom: '1px solid #e5e7eb', padding: '4px 6px', verticalAlign: 'top' } as React.CSSProperties,
  group: { padding: '8px 6px 3px', fontWeight: 700, borderBottom: '1px solid #9ca3af' } as React.CSSProperties,
  sub: { padding: '4px 6px', fontWeight: 700, borderTop: '1px solid #9ca3af' } as React.CSSProperties,
  total: { padding: '6px', fontWeight: 700, borderTop: '1.5px solid #111827', fontSize: 12 } as React.CSSProperties,
  note: { fontSize: 10, color: '#4b5563', marginTop: 12, textAlign: 'justify' } as React.CSSProperties,
  card: { breakInside: 'avoid', pageBreakInside: 'avoid', border: '1px solid #d1d5db', padding: '10px 12px', marginBottom: 14 } as React.CSSProperties,
};
const R: React.CSSProperties = { textAlign: 'right', whiteSpace: 'nowrap' };

export const money = (n: number) => '$ ' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const qty = (n: number, d = 2) => n.toLocaleString('es-AR', { maximumFractionDigits: d });
const today = () => new Date().toLocaleDateString('es-AR');

export interface DocContext { projectName: string; client?: string; address?: string }

const Header = ({ title, ctx, lines }: { title: string; ctx?: DocContext; lines?: string[] }) => (
  <header>
    <h1 style={S.title}>{title}</h1>
    {ctx && <p style={S.info}>Obra: {ctx.projectName}{ctx.address ? ` · ${ctx.address}` : ''}{ctx.client ? ` · Comitente: ${ctx.client}` : ''}</p>}
    <p style={S.info}>Fecha: {today()}</p>
    {lines?.map(l => <p key={l} style={S.info}>{l}</p>)}
    <hr style={S.rule} />
  </header>
);

// ── Lista de compras ────────────────────────────────────────────────────────

export const PurchaseListDoc = ({ ctx, lines }: { ctx: DocContext; lines: PurchaseLine[] }) => {
  const total = lines.reduce((s, l) => s + l.purchaseCost, 0);
  return (
    <div style={S.page}>
      <Header title="Lista de compras" ctx={ctx} lines={['Cantidades redondeadas hacia arriba a la unidad de compra. Precios del catálogo de la empresa.']} />
      <table style={S.table}>
        <thead><tr>
          <th style={S.th}>Material</th><th style={S.th}>Unidad</th><th style={{ ...S.th, ...R }}>Necesario</th>
          <th style={{ ...S.th, ...R }}>A comprar</th><th style={{ ...S.th, ...R }}>Precio unit.</th><th style={{ ...S.th, ...R }}>Subtotal</th>
        </tr></thead>
        <tbody>
          {groupBy(lines, l => l.category).map(([cat, rows]) => (
            <React.Fragment key={cat}>
              <tr><td colSpan={6} style={S.group}>{cat}</td></tr>
              {rows.map(l => (
                <tr key={l.id}>
                  <td style={S.td}>{l.name}</td>
                  <td style={S.td}>{l.purchaseUnit}</td>
                  <td style={{ ...S.td, ...R, color: '#6b7280' }}>{qty(l.technicalQty)} {l.unit}</td>
                  <td style={{ ...S.td, ...R, fontWeight: 700 }}>{qty(l.purchaseQty, 0)}</td>
                  <td style={{ ...S.td, ...R }}>{money(l.purchaseUnitCost)}</td>
                  <td style={{ ...S.td, ...R }}>{money(l.purchaseCost)}</td>
                </tr>
              ))}
              <tr><td colSpan={5} style={{ ...S.sub, ...R }}>Subtotal {cat}</td><td style={{ ...S.sub, ...R }}>{money(rows.reduce((s, l) => s + l.purchaseCost, 0))}</td></tr>
            </React.Fragment>
          ))}
          <tr><td colSpan={5} style={{ ...S.total, ...R }}>Total estimado de compras</td><td style={{ ...S.total, ...R }}>{money(total)}</td></tr>
        </tbody>
      </table>
      <p style={S.note}>«Necesario» es la cantidad que piden las tareas del presupuesto, con su desperdicio. Verificá precios y stock con el proveedor antes de comprar.</p>
    </div>
  );
};

export const exportPurchaseList = (ctx: DocContext, lines: PurchaseLine[]) =>
  exportReportXlsx({
    filename: `lista_compras_${safeFilename(ctx.projectName)}`,
    title: 'Lista de compras',
    info: [`Obra: ${ctx.projectName}`, `Fecha: ${today()}`, 'Cantidades redondeadas hacia arriba a la unidad de compra.'],
    columns: [
      { header: 'Material', width: 42 }, { header: 'Unidad de compra', width: 16 }, { header: 'Necesario', width: 12, format: '#,##0.00' },
      { header: 'Unidad técnica', width: 12 }, { header: 'A comprar', width: 11, format: '#,##0' },
      { header: 'Precio unitario', width: 15, format: '"$" #,##0.00' }, { header: 'Subtotal', width: 16, format: '"$" #,##0.00' },
    ],
    sections: groupBy(lines, l => l.category).map(([cat, rows]) => ({
      title: cat,
      rows: rows.map(l => [l.name, l.purchaseUnit, l.technicalQty, l.unit, l.purchaseQty, l.purchaseUnitCost, l.purchaseCost]),
      subtotal: ['', '', '', '', '', `Subtotal ${cat}`, rows.reduce((s, l) => s + l.purchaseCost, 0)],
    })),
    total: ['', '', '', '', '', 'Total', lines.reduce((s, l) => s + l.purchaseCost, 0)],
  });

// ── Pedido de cotización (sin membrete ni datos del estudio) ───────────────

export const QuoteRequestDoc = ({ lines }: { lines: PurchaseLine[] }) => (
  <div style={S.page}>
    <Header title="Pedido de cotización" />
    <p style={{ margin: '0 0 12px' }}>Solicito cotización de los siguientes materiales, indicando precio unitario, disponibilidad y costo de envío.</p>
    <table style={S.table}>
      <thead><tr>
        <th style={{ ...S.th, width: 28 }}>N°</th><th style={S.th}>Material</th><th style={S.th}>Unidad</th>
        <th style={{ ...S.th, ...R }}>Cantidad</th><th style={{ ...S.th, ...R, width: 90 }}>Precio unit.</th><th style={{ ...S.th, ...R, width: 90 }}>Subtotal</th>
      </tr></thead>
      <tbody>
        {lines.map((l, i) => (
          <tr key={l.id}>
            <td style={S.td}>{i + 1}</td><td style={S.td}>{l.name}</td><td style={S.td}>{l.purchaseUnit}</td>
            <td style={{ ...S.td, ...R, fontWeight: 700 }}>{qty(l.purchaseQty, 0)}</td><td style={S.td} /><td style={S.td} />
          </tr>
        ))}
        <tr><td colSpan={5} style={{ ...S.total, ...R }}>Total</td><td style={S.total} /></tr>
      </tbody>
    </table>
    <div style={{ marginTop: 18, fontSize: 11, lineHeight: 2 }}>
      <div>Plazo de entrega: ______________________________</div>
      <div>Costo de envío: ______________________________</div>
      <div>Forma de pago: ______________________________</div>
      <div>Validez de la cotización: ______________________________</div>
    </div>
  </div>
);

export const exportQuoteRequest = (lines: PurchaseLine[]) =>
  exportReportXlsx({
    filename: `pedido_cotizacion_${new Date().toISOString().slice(0, 10)}`,
    title: 'Pedido de cotización',
    info: [`Fecha: ${today()}`, 'Indicar precio unitario, disponibilidad y costo de envío.'],
    columns: [
      { header: 'N°', width: 6 }, { header: 'Material', width: 44 }, { header: 'Unidad', width: 16 },
      { header: 'Cantidad', width: 11, format: '#,##0' }, { header: 'Precio unitario', width: 16 }, { header: 'Subtotal', width: 16 },
    ],
    sections: [{ rows: lines.map((l, i) => [i + 1, l.name, l.purchaseUnit, l.purchaseQty, '', '']) }],
    total: ['', '', '', '', 'Total', ''],
    notes: ['Plazo de entrega:', 'Costo de envío:', 'Forma de pago:', 'Validez de la cotización:'],
  });

// ── Mano de obra ────────────────────────────────────────────────────────────

const TradeRows = ({ trades }: { trades: LaborBreakdown['trades'] }) => (
  <>
    {trades.map(t => (
      <tr key={t.role}>
        <td style={S.td}>{t.role}</td>
        <td style={{ ...S.td, ...R }}>{qty(t.hours, 1)}</td>
        <td style={{ ...S.td, ...R }}>{qty(t.days, 1)}</td>
        <td style={{ ...S.td, ...R }}>{money(t.hourlyCost)}</td>
        <td style={{ ...S.td, ...R }}>{money(t.cost)}</td>
      </tr>
    ))}
  </>
);

const tradeHead = (
  <thead><tr>
    <th style={S.th}>Oficio</th><th style={{ ...S.th, ...R }}>Horas</th><th style={{ ...S.th, ...R }}>Jornales</th>
    <th style={{ ...S.th, ...R }}>Costo hora</th><th style={{ ...S.th, ...R }}>Costo</th>
  </tr></thead>
);

export const LaborDoc = ({ ctx, data }: { ctx: DocContext; data: LaborBreakdown }) => (
  <div style={S.page}>
    <Header title="Desglose de mano de obra" ctx={ctx} lines={[`Jornal de ${WORKDAY_HOURS} horas. Costo hora con cargas sociales y seguros.`]} />
    <h2 style={S.h2}>Por oficio</h2>
    <table style={S.table}>
      {tradeHead}
      <tbody>
        <TradeRows trades={data.trades} />
        {data.unassignedCost > 0 && (
          <tr><td style={S.td} colSpan={4}>Tareas con mano de obra global (sin oficios cargados)</td><td style={{ ...S.td, ...R }}>{money(data.unassignedCost)}</td></tr>
        )}
        <tr>
          <td style={S.total}>Total</td><td style={{ ...S.total, ...R }}>{qty(data.totalHours, 1)}</td>
          <td style={{ ...S.total, ...R }}>{qty(data.totalHours / WORKDAY_HOURS, 1)}</td><td style={S.total} />
          <td style={{ ...S.total, ...R }}>{money(data.totalCost)}</td>
        </tr>
      </tbody>
    </table>
    <h2 style={S.h2}>Por rubro</h2>
    <table style={S.table}>
      {tradeHead}
      <tbody>
        {data.rubros.map(r => (
          <React.Fragment key={r.rubro}>
            <tr><td colSpan={5} style={S.group}>{r.rubro}</td></tr>
            <TradeRows trades={r.trades} />
            <tr>
              <td style={S.sub}>Subtotal</td><td style={{ ...S.sub, ...R }}>{qty(r.hours, 1)}</td>
              <td style={{ ...S.sub, ...R }}>{qty(r.hours / WORKDAY_HOURS, 1)}</td><td style={S.sub} /><td style={{ ...S.sub, ...R }}>{money(r.cost)}</td>
            </tr>
          </React.Fragment>
        ))}
      </tbody>
    </table>
  </div>
);

export const exportLabor = (ctx: DocContext, data: LaborBreakdown) => {
  const row = (t: LaborBreakdown['trades'][number]) => [t.role, t.hours, t.days, t.hourlyCost, t.cost];
  exportReportXlsx({
    filename: `mano_de_obra_${safeFilename(ctx.projectName)}`,
    title: 'Desglose de mano de obra',
    info: [`Obra: ${ctx.projectName}`, `Fecha: ${today()}`, `Jornal de ${WORKDAY_HOURS} horas. Costo hora con cargas sociales y seguros.`],
    columns: [
      { header: 'Oficio', width: 38 }, { header: 'Horas', width: 11, format: '#,##0.0' }, { header: 'Jornales', width: 11, format: '#,##0.0' },
      { header: 'Costo hora', width: 15, format: '"$" #,##0.00' }, { header: 'Costo', width: 17, format: '"$" #,##0.00' },
    ],
    sections: [
      {
        title: 'POR OFICIO',
        rows: [...data.trades.map(row), ...(data.unassignedCost > 0 ? [['Tareas con mano de obra global', null, null, null, data.unassignedCost]] : [])],
        subtotal: ['Total', data.totalHours, data.totalHours / WORKDAY_HOURS, null, data.totalCost],
      },
      ...data.rubros.map(r => ({ title: r.rubro, rows: r.trades.map(row), subtotal: ['Subtotal', r.hours, r.hours / WORKDAY_HOURS, null, r.cost] })),
    ],
  });
};

// ── Fichas de APU ───────────────────────────────────────────────────────────

const ApuTable = ({ title, rows, total }: { title: string; rows: ApuSheet['materials']; total: number }) =>
  rows.length === 0 ? null : (
    <table style={{ ...S.table, marginTop: 6, tableLayout: 'fixed' }}>
      <colgroup><col style={{ width: '44%' }} /><col style={{ width: '10%' }} /><col style={{ width: '14%' }} /><col style={{ width: '16%' }} /><col style={{ width: '16%' }} /></colgroup>
      <thead><tr>
        <th style={S.th}>{title}</th><th style={S.th}>Unidad</th><th style={{ ...S.th, ...R }}>Cantidad</th>
        <th style={{ ...S.th, ...R }}>Precio unit.</th><th style={{ ...S.th, ...R }}>Subtotal</th>
      </tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td style={S.td}>{r.name}</td><td style={S.td}>{r.unit}</td><td style={{ ...S.td, ...R }}>{qty(r.qty, 4)}</td>
            <td style={{ ...S.td, ...R }}>{money(r.unitCost)}</td><td style={{ ...S.td, ...R }}>{money(r.subtotal)}</td>
          </tr>
        ))}
        <tr><td colSpan={4} style={{ ...S.sub, ...R }}>Subtotal {title.toLowerCase()}</td><td style={{ ...S.sub, ...R }}>{money(total)}</td></tr>
      </tbody>
    </table>
  );

export const ApuSheetsDoc = ({ ctx, sheets }: { ctx: DocContext; sheets: ApuSheet[] }) => (
  <div style={S.page}>
    <Header title="Fichas de análisis de precios (APU)" ctx={ctx} lines={['Costos directos por unidad, con los precios actuales del catálogo de la empresa.']} />
    {sheets.map(s => (
      <section key={s.taskId} style={S.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{s.code ? `${s.code} · ` : ''}{s.name}</div>
            <div style={S.info}>{s.rubro} · Unidad: {s.unit} · Rendimiento: {qty(s.dailyYield)} {s.unit}/día · En presupuesto: {qty(s.budgetQty)} {s.unit}</div>
          </div>
          <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
            <div style={S.info}>Costo unitario</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{money(s.unitCost)}</div>
          </div>
        </div>
        <ApuTable title="Materiales" rows={s.materials} total={s.materialCost} />
        <ApuTable title="Mano de obra" rows={s.labor} total={s.laborCost} />
        <ApuTable title="Equipos" rows={s.equipment} total={s.equipmentCost} />
        {s.labor.length === 0 && s.laborCost > 0 && (
          <p style={S.note}>Mano de obra global del APU: {money(s.laborCost)} por {s.unit}.</p>
        )}
      </section>
    ))}
  </div>
);

export const exportApuSheets = (ctx: DocContext, sheets: ApuSheet[]) =>
  exportReportXlsx({
    filename: `fichas_apu_${safeFilename(ctx.projectName)}`,
    title: 'Fichas de análisis de precios (APU)',
    info: [`Obra: ${ctx.projectName}`, `Fecha: ${today()}`],
    columns: [
      { header: 'Componente', width: 42 }, { header: 'Tipo', width: 14 }, { header: 'Unidad', width: 10 },
      { header: 'Cantidad por unidad', width: 14, format: '#,##0.0000' }, { header: 'Precio unitario', width: 15, format: '"$" #,##0.00' },
      { header: 'Subtotal', width: 15, format: '"$" #,##0.00' },
    ],
    sections: sheets.map(s => ({
      title: `${s.code ? `${s.code} · ` : ''}${s.name} (${s.unit}) — ${s.rubro}`,
      rows: [
        ...s.materials.map(r => [r.name, 'Material', r.unit, r.qty, r.unitCost, r.subtotal]),
        ...s.labor.map(r => [r.name, 'Mano de obra', r.unit, r.qty, r.unitCost, r.subtotal]),
        ...s.equipment.map(r => [r.name, 'Equipo', r.unit, r.qty, r.unitCost, r.subtotal]),
        ...(s.labor.length === 0 && s.laborCost > 0 ? [['Mano de obra global', 'Mano de obra', s.unit, 1, s.laborCost, s.laborCost]] : []),
      ],
      subtotal: ['Costo unitario', '', '', null, null, s.unitCost],
    })),
  });
