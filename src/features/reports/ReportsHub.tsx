import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, BarChart3, BookOpen, CalendarRange, ClipboardList, Eye, FileSpreadsheet, FileText,
  HardHat, History, Layers, Package, Printer, Receipt, ShoppingCart, TrendingUp,
} from 'lucide-react';
import { useERP } from '../../../context/ERPContext';
import { useAuth } from '../../../context/AuthContext';
import { printDocument } from '../../../utils/printDocument';
import { APUSummaryReport } from './APUSummaryReport';
import { BudgetBreakdownReport } from './BudgetBreakdownReport';
import { ConsolidatedProjectReport } from './ConsolidatedProjectReport';
import { YieldsErrorBanner, useYieldsBlocked } from '../../../components/YieldsErrorBanner';
import { buildApuSheets, buildLaborBreakdown, buildPurchaseList, type ReportSource } from './reportData';
import {
  ApuSheetsDoc, LaborDoc, PurchaseListDoc, QuoteRequestDoc, type DocContext,
  exportApuSheets, exportLabor, exportPurchaseList, exportQuoteRequest,
} from './ReportDocuments';
import { type BudgetPrintMode, type HubReportId, setReportIntent, takeReportIntent } from './reportIntents';

type Role = 'admin' | 'project_manager' | 'worker' | 'client';
const STAFF: Role[] = ['admin', 'project_manager'];
const FIELD: Role[] = ['admin', 'project_manager', 'worker'];
const ALL: Role[] = ['admin', 'project_manager', 'worker', 'client'];

type Action =
  | { type: 'budget'; mode: BudgetPrintMode }
  | { type: 'executive' }
  | { type: 'planning' }
  | { type: 'open'; report: HubReportId };

interface Card {
  title: string;
  description: string;
  icon: typeof FileText;
  formats: string[];
  roles: Role[];
  action: Action;
  needsItems?: boolean;
}

const SECTIONS: { title: string; hint: string; cards: Card[] }[] = [
  {
    title: 'Presupuesto',
    hint: 'Se abren en la vista de impresión del presupuesto, con el modo ya elegido.',
    cards: [
      { title: 'Para el cliente', description: 'Precio de venta por ítem y total. Sin costos internos.', icon: Receipt, formats: ['PDF'], roles: STAFF, action: { type: 'budget', mode: 'cliente' } },
      { title: 'Técnico', description: 'Costo directo y precio de venta por ítem.', icon: FileText, formats: ['PDF'], roles: STAFF, action: { type: 'budget', mode: 'tecnico' } },
      { title: 'Interno', description: 'Desglose completo: materiales, mano de obra, equipos y coeficiente K.', icon: Layers, formats: ['PDF'], roles: STAFF, action: { type: 'budget', mode: 'interno' } },
      { title: 'Por rubros', description: 'Solo los totales de cada rubro, para una lectura rápida.', icon: ClipboardList, formats: ['PDF'], roles: STAFF, action: { type: 'budget', mode: 'resumido' } },
    ],
  },
  {
    title: 'Materiales',
    hint: 'Cantidades calculadas con los APU de las tareas del presupuesto.',
    cards: [
      { title: 'Lista de compras', description: 'Qué comprar y cuánto, redondeado a la unidad de compra y agrupado por tipo de material.', icon: ShoppingCart, formats: ['PDF', 'Excel'], roles: FIELD, action: { type: 'open', report: 'compras' }, needsItems: true },
      { title: 'Pedido de cotización', description: 'Listado sin precios ni datos del estudio, para pedir precio al corralón.', icon: Package, formats: ['PDF', 'Excel'], roles: FIELD, action: { type: 'open', report: 'cotizacion' }, needsItems: true },
      { title: 'Explosión de insumos', description: 'Materiales, mano de obra y equipos totales, con costos del catálogo a una fecha.', icon: Layers, formats: ['PDF', 'Excel', 'CSV'], roles: STAFF, action: { type: 'open', report: 'explosion' } },
    ],
  },
  {
    title: 'Mano de obra',
    hint: 'Horas y jornales que surgen de los rendimientos de cada APU.',
    cards: [
      { title: 'Por oficio y por rubro', description: 'Horas, jornales y costo con cargas sociales de cada oficio, en total y por rubro.', icon: HardHat, formats: ['PDF', 'Excel'], roles: FIELD, action: { type: 'open', report: 'mano-obra' }, needsItems: true },
    ],
  },
  {
    title: 'Análisis de precios',
    hint: 'Composición de cada precio unitario.',
    cards: [
      { title: 'Fichas de APU de la obra', description: 'Una ficha por tarea del presupuesto: materiales, mano de obra, equipos y rendimiento.', icon: BookOpen, formats: ['PDF', 'Excel'], roles: STAFF, action: { type: 'open', report: 'fichas-apu' }, needsItems: true },
      { title: 'APU de la empresa', description: 'Costo unitario y desglose de todos los APU de la base de la empresa.', icon: BarChart3, formats: ['Excel', 'CSV'], roles: STAFF, action: { type: 'open', report: 'apu-empresa' } },
    ],
  },
  {
    title: 'Seguimiento',
    hint: 'Plazos, avance y reportes para presentar.',
    cards: [
      { title: 'Plan de trabajos', description: 'Diagrama de Gantt de la planificación de la obra.', icon: CalendarRange, formats: ['PDF'], roles: FIELD, action: { type: 'planning' } },
      { title: 'Reporte ejecutivo', description: 'Resumen de la obra con gráficos, presupuesto, materiales y fichas técnicas.', icon: TrendingUp, formats: ['PDF'], roles: ALL, action: { type: 'executive' } },
      { title: 'Presupuesto a una fecha de costos', description: 'Costos de cada ítem recalculados con los precios vigentes a la fecha que elijas.', icon: History, formats: ['Excel', 'CSV'], roles: STAFF, action: { type: 'open', report: 'desglose-fecha' } },
    ],
  },
];

const TITLES: Record<HubReportId, string> = {
  compras: 'Lista de compras',
  cotizacion: 'Pedido de cotización',
  'mano-obra': 'Desglose de mano de obra',
  'fichas-apu': 'Fichas de APU de la obra',
  explosion: 'Explosión de insumos',
  'apu-empresa': 'APU de la empresa',
  'desglose-fecha': 'Presupuesto a una fecha de costos',
};

const PRINTABLE: HubReportId[] = ['compras', 'cotizacion', 'mano-obra', 'fichas-apu'];

export const ReportsHub: React.FC<{ onNavigate: (tab: string) => void }> = ({ onNavigate }) => {
  const erp = useERP();
  const { user, activeOrganizationId } = useAuth();
  const organizationId = activeOrganizationId ?? user?.organizationId ?? '';
  const role = (user?.role ?? 'worker') as Role;
  const [open, setOpen] = useState<HubReportId | null>(null);
  const yieldsBlocked = useYieldsBlocked();
  useEffect(() => {
    const intent = takeReportIntent('hub');
    if (intent) setOpen(intent.report);
  }, []);

  const { project } = erp;
  const hasItems = project.items.length > 0;

  const run = (a: Action) => {
    if (a.type === 'open') return setOpen(a.report);
    setReportIntent(a.type === 'budget' ? { kind: 'budget', mode: a.mode } : { kind: a.type });
    onNavigate(a.type === 'budget' ? 'budget' : a.type === 'planning' ? 'planning' : 'dashboard');
  };

  if (open) return <ReportViewer report={open} organizationId={organizationId} onBack={() => setOpen(null)} />;

  return (
    <div className="space-y-8 pb-10">
      <YieldsErrorBanner />
      <div>
        <h1 className="text-2xl font-black text-slate-800 tracking-tight">Reportes</h1>
        <p className="text-sm text-slate-500 mt-1">
          {project.name} · Elegí un reporte para verlo, imprimirlo o descargarlo.
        </p>
      </div>
      {!hasItems && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3">
          La obra todavía no tiene tareas en el presupuesto. Los reportes de materiales, mano de obra y APU se completan cuando cargues el presupuesto.
        </div>
      )}
      {SECTIONS.map(section => {
        const cards = section.cards.filter(c => c.roles.includes(role));
        if (cards.length === 0) return null;
        return (
          <section key={section.title}>
            <div className="flex items-baseline justify-between gap-4 mb-3">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">{section.title}</h2>
              <p className="text-xs text-slate-400 hidden md:block">{section.hint}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {cards.map(card => {
                const Icon = card.icon;
                const disabled = card.needsItems && (!hasItems || yieldsBlocked);
                return (
                  <button
                    key={card.title}
                    onClick={() => run(card.action)}
                    disabled={disabled}
                    className="group text-left bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-400 hover:shadow-md transition-all disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:shadow-none flex flex-col"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 group-hover:bg-blue-600 group-hover:text-white flex items-center justify-center transition-colors">
                        <Icon size={18} />
                      </span>
                      <span className="font-bold text-sm text-slate-800">{card.title}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-2.5 leading-relaxed flex-1">{card.description}</p>
                    <div className="flex items-center gap-1.5 mt-3">
                      {card.formats.map(f => (
                        <span key={f} className="text-[10px] font-bold uppercase tracking-wide text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">{f}</span>
                      ))}
                      <span className="ml-auto text-xs font-semibold text-blue-600 opacity-0 group-hover:opacity-100 flex items-center gap-1">
                        <Eye size={13} /> Abrir
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
};

const ReportViewer: React.FC<{ report: HubReportId; organizationId: string; onBack: () => void }> = ({ report, organizationId, onBack }) => {
  const erp = useERP();
  const sheetRef = useRef<HTMLDivElement>(null);
  const { project } = erp;
  const yieldsBlocked = useYieldsBlocked();

  const src: ReportSource = useMemo(() => ({
    items: project.items,
    tasks: erp.tasks,
    yieldsIndex: erp.yieldsIndex,
    materialsMap: erp.materialsMap,
    toolYieldsIndex: erp.toolYieldsIndex,
    toolsMap: erp.toolsMap,
    taskLaborYieldsIndex: erp.taskLaborYieldsIndex,
    laborCategoriesMap: erp.laborCategoriesMap,
    taskCrewYieldsIndex: erp.taskCrewYieldsIndex,
    crewsMap: erp.crewsMap,
  }), [project.items, erp.tasks, erp.yieldsIndex, erp.materialsMap, erp.toolYieldsIndex, erp.toolsMap, erp.taskLaborYieldsIndex, erp.laborCategoriesMap, erp.taskCrewYieldsIndex, erp.crewsMap]);

  const ctx: DocContext = { projectName: project.name, client: project.client, address: project.address };
  const purchase = useMemo(() => (report === 'compras' || report === 'cotizacion' ? buildPurchaseList(src) : []), [report, src]);
  const labor = useMemo(() => (report === 'mano-obra' ? buildLaborBreakdown(src) : null), [report, src]);
  const sheets = useMemo(() => (report === 'fichas-apu' ? buildApuSheets(src) : []), [report, src]);

  useEffect(() => { window.scrollTo?.(0, 0); }, [report]);

  const printable = PRINTABLE.includes(report);
  const print = () => {
    if (!sheetRef.current) return;
    printDocument({ title: TITLES[report], html: sheetRef.current.innerHTML, pageMargin: '14mm' });
  };
  const excel = () => {
    if (report === 'compras') exportPurchaseList(ctx, purchase);
    if (report === 'cotizacion') exportQuoteRequest(purchase);
    if (report === 'mano-obra' && labor) exportLabor(ctx, labor);
    if (report === 'fichas-apu') exportApuSheets(ctx, sheets);
  };
  const empty =
    (report === 'compras' || report === 'cotizacion') ? purchase.length === 0
      : report === 'mano-obra' ? (labor?.totalCost ?? 0) === 0
        : report === 'fichas-apu' ? sheets.length === 0 : false;

  return (
    <div className="space-y-4 pb-10">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 px-2 py-1.5 rounded-lg hover:bg-slate-100">
          <ArrowLeft size={16} /> Reportes
        </button>
        <h1 className="text-xl font-black text-slate-800 tracking-tight">{TITLES[report]}</h1>
        <div className="basis-full"><YieldsErrorBanner /></div>
        {printable && !empty && !yieldsBlocked && (
          <div className="ml-auto flex items-center gap-2">
            <button onClick={excel} className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50">
              <FileSpreadsheet size={16} /> Excel
            </button>
            <button onClick={print} className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-slate-900 text-white hover:bg-black">
              <Printer size={16} /> Imprimir / PDF
            </button>
          </div>
        )}
      </div>

      {printable ? (
        empty ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
            No hay datos para este reporte: revisá que las tareas del presupuesto tengan sus APU con materiales y mano de obra.
          </div>
        ) : (
          <div className="bg-slate-100 rounded-xl p-4 md:p-8 overflow-x-auto">
            <div ref={sheetRef} className="bg-white shadow-sm mx-auto p-8 md:p-12" style={{ maxWidth: 820 }}>
              {report === 'compras' && <PurchaseListDoc ctx={ctx} lines={purchase} />}
              {report === 'cotizacion' && <QuoteRequestDoc lines={purchase} />}
              {report === 'mano-obra' && labor && <LaborDoc ctx={ctx} data={labor} />}
              {report === 'fichas-apu' && <ApuSheetsDoc ctx={ctx} sheets={sheets} />}
            </div>
          </div>
        )
      ) : !organizationId ? (
        <div className="text-center py-12 text-slate-400 text-sm">Organización no disponible. Recargá la página.</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          {report === 'explosion' && <ConsolidatedProjectReport organizationId={organizationId} />}
          {report === 'apu-empresa' && <APUSummaryReport organizationId={organizationId} />}
          {report === 'desglose-fecha' && <BudgetBreakdownReport organizationId={organizationId} />}
        </div>
      )}
    </div>
  );
};
