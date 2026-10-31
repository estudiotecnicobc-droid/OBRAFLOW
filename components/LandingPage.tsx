import React from 'react';
import {
  HardHat, ArrowRight, Search, Check, CalendarRange, TrendingUp, LayoutGrid,
  BookOpen, ListChecks, UserPlus, FolderPlus, GanttChart,
} from 'lucide-react';

interface Props {
  onLogin: () => void;
  onSignup: () => void;
}

const SANS = "font-['Archivo',ui-sans-serif,system-ui,sans-serif]";
const MONO = "font-['IBM_Plex_Mono',ui-monospace,monospace]";

const FACTS: [string, string][] = [
  ['≈ 590', 'análisis de precios unitarios cargados'],
  ['40', 'rubros de obra tradicional'],
  ['51', 'plantillas de presupuesto rápido'],
  ['CAC · ICC', 'índices que se actualizan solos'],
];

/* ---------- Maquetas dibujadas (datos de ejemplo) ---------- */

const Window: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
  <div className={`bg-white border border-slate-200 rounded-xl shadow-[0_24px_60px_-24px_rgba(15,23,42,0.25)] overflow-hidden ${className}`}>
    <div className="flex items-center gap-2 px-4 h-9 border-b border-slate-100 bg-slate-50/80">
      <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
      <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
      <span className="w-2.5 h-2.5 rounded-full bg-slate-200" />
      <span className={`ml-2 text-[11px] text-slate-500 truncate ${MONO}`}>{title}</span>
    </div>
    {children}
  </div>
);

const BUDGET_ROWS: [string, string, number][] = [
  ['Trabajos preliminares', '1 gl', 3],
  ['Mampostería', '62 m²', 18],
  ['Revoques', '124 m²', 14],
  ['Contrapisos y carpetas', '70 m²', 11],
  ['Pisos y revestimientos', '70 m²', 22],
  ['Pintura', '186 m²', 9],
];

const BudgetMock = () => (
  <Window title="Presupuesto · Vivienda 70 m² · ejemplo">
    <div className="p-5">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <p className={`text-[10px] uppercase tracking-wider text-slate-400 ${MONO}`}>Rubros</p>
          <p className="text-sm font-semibold text-slate-800">6 rubros · 38 tareas</p>
        </div>
        <span className="text-[11px] font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded">Presupuesto rápido</span>
      </div>
      <div className="space-y-2.5">
        {BUDGET_ROWS.map(([name, qty, pct]) => (
          <div key={name} className="grid grid-cols-[1fr_auto] gap-x-4 items-center">
            <div>
              <div className="flex justify-between text-[13px]">
                <span className="text-slate-700">{name}</span>
                <span className={`text-slate-400 text-[11px] ${MONO}`}>{qty}</span>
              </div>
              <div className="h-1 bg-slate-100 rounded-full mt-1.5">
                <div className="h-full bg-blue-600 rounded-full" style={{ width: `${pct * 4}%` }} />
              </div>
            </div>
            <span className={`text-[11px] text-slate-500 w-8 text-right ${MONO}`}>{pct}%</span>
          </div>
        ))}
      </div>
      <div className="mt-5 pt-4 border-t border-dashed border-slate-200 grid grid-cols-3 gap-3 text-[11px]">
        <div><p className="text-slate-400">Costo directo</p><p className={`text-slate-800 font-semibold ${MONO}`}>100,0</p></div>
        <div><p className="text-slate-400">Coef. K</p><p className={`text-slate-800 font-semibold ${MONO}`}>× 1,48</p></div>
        <div><p className="text-slate-400">Precio</p><p className={`text-blue-700 font-semibold ${MONO}`}>148,0</p></div>
      </div>
    </div>
  </Window>
);

const CATALOG_ROWS: [string, string, string][] = [
  ['OF-REV-003', 'Revoque grueso a la cal, interior', 'm²'],
  ['OF-REV-004', 'Revoque fino a la cal, interior', 'm²'],
  ['OF-REV-011', 'Revoque impermeable con hidrófugo', 'm²'],
  ['OF-REV-015', 'Azotado hidrófugo bajo revestimiento', 'm²'],
];

const CatalogMock = () => (
  <Window title="Catálogo ObraFlow">
    <div className="p-4">
      <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 h-9 text-sm text-slate-500">
        <Search size={14} /> revoque
        <span className="ml-auto text-[10px] text-slate-400">Rubro: Revoques</span>
      </div>
      <div className="mt-3 divide-y divide-slate-100">
        {CATALOG_ROWS.map(([code, name, unit], i) => (
          <div key={code} className={`flex items-center gap-3 py-2.5 ${i === 0 ? 'bg-blue-50/60 -mx-2 px-2 rounded' : ''}`}>
            <span className={`text-[10px] text-slate-400 w-20 shrink-0 ${MONO}`}>{code}</span>
            <span className="text-[13px] text-slate-700 flex-1 min-w-0 truncate">{name}</span>
            <span className={`text-[11px] text-slate-400 ${MONO}`}>{unit}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg bg-slate-50 p-3 text-[11px] text-slate-500 grid grid-cols-3 gap-2">
        <span><b className="block text-slate-700">Materiales</b>cal, arena, cemento</span>
        <span><b className="block text-slate-700">Mano de obra</b>oficial + ayudante</span>
        <span><b className="block text-slate-700">Rendimiento</b>h/m² por oficio</span>
      </div>
    </div>
  </Window>
);

const WizardMock = () => (
  <Window title="Presupuesto rápido · Pintura">
    <div className="p-5">
      <div className="flex items-center gap-2 mb-5">
        {['Plantilla', 'Medidas', 'Tareas', 'Confirmar'].map((s, i) => (
          <React.Fragment key={s}>
            <span className={`flex items-center gap-1.5 text-[11px] ${i <= 1 ? 'text-blue-700 font-semibold' : 'text-slate-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${i < 1 ? 'bg-blue-600 text-white' : i === 1 ? 'border-2 border-blue-600' : 'border border-slate-300'}`}>
                {i < 1 ? <Check size={11} /> : i + 1}
              </span>
              <span className="hidden sm:inline">{s}</span>
            </span>
            {i < 3 && <span className="flex-1 h-px bg-slate-200" />}
          </React.Fragment>
        ))}
      </div>
      <div className="space-y-3">
        {[['Superficie de muros', '148', 'm²'], ['Superficie de cielorrasos', '70', 'm²'], ['Aberturas a pintar', '9', 'u']].map(([l, v, u]) => (
          <label key={l} className="flex items-center justify-between text-[13px] text-slate-600">
            {l}
            <span className="flex items-center gap-1.5">
              <span className={`w-16 text-right border border-slate-200 rounded px-2 py-1 text-slate-800 ${MONO}`}>{v}</span>
              <span className={`text-[11px] text-slate-400 w-5 ${MONO}`}>{u}</span>
            </span>
          </label>
        ))}
        <div className="flex items-center justify-between text-[13px] text-slate-600">
          Tipo de pintura
          <span className="flex gap-1">
            <span className="text-[11px] px-2 py-1 rounded bg-blue-600 text-white">Látex interior</span>
            <span className="text-[11px] px-2 py-1 rounded border border-slate-200">Satinado</span>
          </span>
        </div>
        <div className="flex items-center justify-between text-[13px] text-slate-600">
          Incluye enduido
          <span className="w-9 h-5 rounded-full bg-blue-600 relative"><span className="absolute right-0.5 top-0.5 w-4 h-4 rounded-full bg-white" /></span>
        </div>
      </div>
    </div>
  </Window>
);

const GANTT_ROWS: [string, number, number, string][] = [
  ['Preliminares', 0, 8, 'bg-slate-400'],
  ['Mampostería', 6, 26, 'bg-blue-600'],
  ['Inst. sanitaria · gruesa', 22, 14, 'bg-sky-500'],
  ['Revoques', 34, 22, 'bg-blue-600'],
  ['Pisos y revestimientos', 54, 20, 'bg-blue-600'],
  ['Inst. sanitaria · terminación', 70, 12, 'bg-sky-500'],
  ['Pintura', 78, 18, 'bg-blue-600'],
  ['Gastos generales', 0, 100, 'bg-slate-200'],
];

const GanttMock = () => (
  <Window title="Planificación · Generar plan de trabajos">
    <div className="p-5">
      <div className="flex justify-between text-[11px] text-slate-500 mb-3">
        <span>Inicio <b className={`text-slate-800 ${MONO}`}>02/11</b></span>
        <span>Fin estimado <b className={`text-slate-800 ${MONO}`}>19/02</b></span>
        <span>Plazo <b className={`text-slate-800 ${MONO}`}>15 sem</b></span>
      </div>
      <div className="relative space-y-2">
        <div className="absolute inset-0 grid grid-cols-6 pointer-events-none ml-[38%]">
          {Array.from({ length: 6 }).map((_, i) => <span key={i} className="border-l border-dashed border-slate-100" />)}
        </div>
        {GANTT_ROWS.map(([name, start, len, color]) => (
          <div key={name} className="relative grid grid-cols-[38%_1fr] items-center gap-2">
            <span className="text-[11px] text-slate-600 truncate">{name}</span>
            <div className="h-3.5 relative">
              <span className={`absolute h-full rounded-sm ${color}`} style={{ left: `${start}%`, width: `${len}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  </Window>
);

const IndexMock = () => (
  <Window title="Comparar costos · Actualizar por índice">
    <div className="p-5">
      <div className="flex flex-wrap gap-1.5 mb-4">
        {['Índice CAC', 'ICC INDEC', 'Inflación', 'Dólar', 'Por componente', '% fijo'].map((m, i) => (
          <span key={m} className={`text-[11px] px-2 py-1 rounded ${i === 4 ? 'bg-blue-600 text-white' : 'border border-slate-200 text-slate-500'}`}>{m}</span>
        ))}
      </div>
      <div className="flex items-center gap-3 text-[12px] mb-4">
        <span className="border border-slate-200 rounded px-2 py-1">Base <b className={MONO}>mar 2026</b></span>
        <ArrowRight size={14} className="text-slate-400" />
        <span className="border border-slate-200 rounded px-2 py-1">Destino <b className={MONO}>sep 2026</b></span>
      </div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-slate-400 text-left">
            <th className="font-normal pb-2">Componente</th>
            <th className="font-normal pb-2">Serie</th>
            <th className="font-normal pb-2 text-right">Coef.</th>
          </tr>
        </thead>
        <tbody className={`${MONO} text-slate-700`}>
          {[['Materiales', 'cac_materiales', '1,214'], ['Mano de obra', 'cac_mano_obra', '1,187'], ['Equipos', 'usd_oficial', '1,096'], ['Otros', 'cac_general', '1,201']].map(([c, s, k]) => (
            <tr key={c} className="border-t border-slate-100">
              <td className={`py-2 ${SANS}`}>{c}</td>
              <td className="py-2 text-[11px] text-slate-400">{s}</td>
              <td className="py-2 text-right font-semibold">{k}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </Window>
);

const PROJECTS: [string, string, string, string][] = [
  ['Vivienda unifamiliar', 'Presupuesto', 'from-amber-200 to-orange-300', 'bg-amber-100 text-amber-800'],
  ['Local comercial', 'En ejecución', 'from-sky-200 to-blue-400', 'bg-emerald-100 text-emerald-800'],
  ['Puesta en valor de frente', 'En ejecución', 'from-stone-200 to-stone-400', 'bg-emerald-100 text-emerald-800'],
  ['Remodelación de cocina', 'Terminada', 'from-teal-100 to-teal-300', 'bg-slate-100 text-slate-600'],
];

const ProjectsMock = () => (
  <Window title="Mis proyectos · Tarjetas">
    <div className="p-4 grid grid-cols-2 gap-3">
      {PROJECTS.map(([name, status, cover, chip]) => (
        <div key={name} className="border border-slate-200 rounded-lg overflow-hidden">
          <div className={`h-16 bg-gradient-to-br ${cover} relative`}>
            <svg viewBox="0 0 100 40" className="absolute bottom-0 left-0 w-full h-10 opacity-40" aria-hidden="true">
              <path d="M10 40 V18 L30 6 L50 18 V40 M58 40 V12 H90 V40" fill="none" stroke="white" strokeWidth="2" />
            </svg>
          </div>
          <div className="p-2.5">
            <p className="text-[12px] font-semibold text-slate-800 truncate">{name}</p>
            <span className={`inline-block mt-1.5 text-[10px] px-1.5 py-0.5 rounded ${chip}`}>{status}</span>
          </div>
        </div>
      ))}
    </div>
  </Window>
);

/* ---------- Secciones ---------- */

const FEATURES: { tag: string; icon: typeof BookOpen; title: string; body: string; points: string[]; Mock: React.FC }[] = [
  {
    tag: '01 / Catálogo ObraFlow',
    icon: BookOpen,
    title: 'Una base de análisis de precios lista para usar.',
    body: 'Cerca de 590 APU de obra tradicional, ordenados en 40 rubros. Cada uno trae sus materiales, la mano de obra por oficio, el rendimiento y qué incluye la tarea.',
    points: [
      'Mano de obra UOCRA y precios de referencia del AMBA, con su fuente.',
      'Al usar un APU se copia a tu empresa: lo editás sin tocar el original.',
      'Tu base crece con cada obra y la próxima arranca con mejor criterio.',
    ],
    Mock: CatalogMock,
  },
  {
    tag: '02 / Presupuesto rápido',
    icon: ListChecks,
    title: 'De las medidas al presupuesto, sin cargar APU a mano.',
    body: 'Elegís una plantilla o combinás rubros, cargás las medidas y las opciones de la obra, y revisás qué incluye cada tarea antes de confirmar.',
    points: [
      'Plantillas para cocina, pintura, cambio de piso, terraza, placa de yeso, frente y medianera (Ley 6116), vereda, instalación eléctrica y ampliación.',
      'Una plantilla por cada rubro, con las opciones de la planilla: tipo de piso, de pintura, de mesada…',
      'Precio de venta con el coeficiente K de tu cuadro empresario.',
    ],
    Mock: WizardMock,
  },
  {
    tag: '03 / Plan de trabajos',
    icon: GanttChart,
    title: 'El plan de trabajos sale del presupuesto.',
    body: 'Con un clic se arma el diagrama a partir del rendimiento de cada tarea y la secuencia habitual de una obra. Después lo ajustás a mano.',
    points: [
      'Rubros encadenados en orden de obra: preliminares, estructura, mampostería, revoques, pisos, pintura…',
      'Instalaciones partidas en obra gruesa y terminación.',
      'Gastos generales distribuidos en todo el plazo.',
    ],
    Mock: GanttMock,
  },
  {
    tag: '04 / Actualización por índice',
    icon: TrendingUp,
    title: 'Un presupuesto de hace meses, puesto al día.',
    body: 'Si el cliente tardó en aprobar, actualizás el presupuesto con el índice que elijas y obtenés un reporte con el cálculo para presentarle.',
    points: [
      'Índice CAC, ICC del INDEC, inflación, dólar oficial, MEP o blue, o un porcentaje fijo.',
      'Por componente: materiales, mano de obra y equipos con su propia serie.',
      'CAC e ICC se actualizan solos todos los días desde las planillas públicas.',
    ],
    Mock: IndexMock,
  },
  {
    tag: '05 / Panel de proyectos',
    icon: LayoutGrid,
    title: 'Todas tus obras a la vista.',
    body: 'Cada obra con su portada y su estado. Buscás por obra, cliente o dirección y elegís cómo verlas.',
    points: [
      'Vistas de tarjetas, galería, lista y por estado.',
      'Portada a elección o una foto propia de la obra.',
      'Accesos por rol: dueño, administrador, editor o cliente.',
    ],
    Mock: ProjectsMock,
  },
];

const STEPS: [typeof UserPlus, string, string][] = [
  [UserPlus, 'Creá tu cuenta', 'Registrate con tu email y el nombre de tu empresa o estudio. No pide tarjeta.'],
  [FolderPlus, 'Cargá tu primera obra', 'Armá el presupuesto con una plantilla o sumá tareas desde el catálogo.'],
  [CalendarRange, 'Generá el plan', 'El plan de trabajos sale del presupuesto. Lo ajustás y seguís la obra.'],
];

export const LandingPage: React.FC<Props> = ({ onLogin, onSignup }) => {
  return (
    <div className={`min-h-screen bg-[#F7F6F2] text-slate-800 overflow-x-clip ${SANS}`}>
      {/* Navegación */}
      <nav className="fixed top-0 inset-x-0 z-30 bg-[#F7F6F2]/90 backdrop-blur border-b border-slate-900/5">
        <div className="max-w-6xl mx-auto h-16 px-4 md:px-8 flex items-center justify-between gap-4">
          <a href="#inicio" className="flex items-center gap-2 font-black text-slate-900 text-lg">
            <span className="bg-blue-600 w-8 h-8 rounded-lg flex items-center justify-center">
              <HardHat size={18} className="text-white" />
            </span>
            <span>obraf<span className="text-blue-600">low</span></span>
          </a>
          <div className="hidden md:flex items-center gap-7 text-sm text-slate-600">
            <a href="#funciones" className="hover:text-slate-900">Funciones</a>
            <a href="#como-empezar" className="hover:text-slate-900">Cómo empezar</a>
            <a href="#beta" className="hover:text-slate-900">Beta</a>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <button onClick={onLogin} className="text-sm font-semibold text-slate-700 hover:text-slate-900 px-2.5 sm:px-3 py-2 rounded-lg">
              Ingresar
            </button>
            <button onClick={onSignup} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-3 sm:px-4 py-2 rounded-lg transition-colors">
              Crear cuenta<span className="hidden sm:inline"> gratis</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Portada */}
      <header id="inicio" className="relative pt-28 md:pt-36 pb-20 md:pb-28 overflow-hidden">
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.5]" aria-hidden="true">
          <defs>
            <pattern id="grid-sm" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#0f172a" strokeOpacity="0.04" strokeWidth="1" />
            </pattern>
            <pattern id="grid-lg" width="120" height="120" patternUnits="userSpaceOnUse">
              <rect width="120" height="120" fill="url(#grid-sm)" />
              <path d="M 120 0 L 0 0 0 120" fill="none" stroke="#0f172a" strokeOpacity="0.07" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid-lg)" />
        </svg>

        <div className="relative max-w-6xl mx-auto px-5 md:px-8 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-16 items-center">
          <div>
            <p className={`inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-blue-700 ${MONO}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" /> Beta abierta · sin costo
            </p>
            <h1 className="mt-5 text-[2.6rem] leading-[1.02] md:text-6xl font-extrabold tracking-[-0.03em] text-slate-900">
              Presupuestá tu obra en minutos, con una base que ya conoce el oficio.
            </h1>
            <p className="mt-6 text-lg text-slate-600 max-w-xl leading-relaxed">
              ObraFlow trae cargados cerca de 590 análisis de precios unitarios de obra tradicional. Armás el presupuesto,
              generás el plan de trabajos y lo actualizás por índice, todo en el mismo lugar.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <button
                onClick={onSignup}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3.5 rounded-lg transition-colors shadow-sm"
              >
                Crear cuenta gratis <ArrowRight size={17} />
              </button>
              <button
                onClick={onLogin}
                className="inline-flex items-center gap-2 border border-slate-300 hover:border-slate-400 bg-white text-slate-800 font-semibold px-6 py-3.5 rounded-lg transition-colors"
              >
                Ya tengo cuenta
              </button>
            </div>
            <p className="mt-4 text-xs text-slate-400">Sin tarjeta. Gratis mientras dure la beta.</p>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 bg-blue-600/[0.06] rounded-[28px] -rotate-2" aria-hidden="true" />
            <BudgetMock />
            <p className={`mt-3 text-[10px] text-slate-400 text-right ${MONO}`}>Pantalla ilustrativa · datos de ejemplo</p>
          </div>
        </div>
      </header>

      {/* Datos del producto */}
      <section className="border-y border-slate-900/10 bg-white">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-900/10 xl:border-x border-slate-900/10">
          {FACTS.map(([value, label]) => (
            <div key={label} className="bg-white px-5 md:px-8 py-7">
              <p className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900">{value}</p>
              <p className="mt-1 text-sm text-slate-500">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Funciones */}
      <section id="funciones" className="py-24 md:py-32">
        <div className="max-w-6xl mx-auto px-5 md:px-8">
          <div className="max-w-2xl mb-20">
            <p className={`text-[11px] uppercase tracking-[0.14em] text-slate-400 ${MONO}`}>Qué hace hoy</p>
            <h2 className="mt-3 text-3xl md:text-5xl font-extrabold tracking-[-0.02em] text-slate-900 leading-[1.05]">
              Del cómputo al plan de trabajos, sin pasar por cinco planillas.
            </h2>
          </div>

          <div className="space-y-24 md:space-y-32">
            {FEATURES.map(({ tag, icon: Icon, title, body, points, Mock }, i) => (
              <article key={tag} className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-2 gap-10 lg:gap-16 items-center">
                <div className={i % 2 === 1 ? 'lg:order-2' : ''}>
                  <p className={`flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-blue-700 ${MONO}`}>
                    <Icon size={14} /> {tag}
                  </p>
                  <h3 className="mt-4 text-2xl md:text-[2rem] font-bold tracking-[-0.02em] text-slate-900 leading-tight">{title}</h3>
                  <p className="mt-4 text-slate-600 leading-relaxed">{body}</p>
                  <ul className="mt-6 space-y-3">
                    {points.map(p => (
                      <li key={p} className="flex gap-3 text-[15px] text-slate-700">
                        <span className="mt-1 w-4 h-4 rounded-full bg-blue-600/10 text-blue-700 flex items-center justify-center shrink-0">
                          <Check size={11} strokeWidth={3} />
                        </span>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={i % 2 === 1 ? 'lg:order-1' : ''}>
                  <Mock />
                </div>
              </article>
            ))}
          </div>

          <p className="mt-20 text-xs text-slate-400 max-w-2xl">
            Los precios y rendimientos del catálogo son de referencia: revisalos y ajustalos a cada obra. Las pantallas de esta página son ilustrativas.
          </p>
        </div>
      </section>

      {/* Cómo empezar */}
      <section id="como-empezar" className="py-24 md:py-28 bg-slate-900 text-white">
        <div className="max-w-6xl mx-auto px-5 md:px-8">
          <p className={`text-[11px] uppercase tracking-[0.14em] text-blue-300 ${MONO}`}>Cómo empezar</p>
          <h2 className="mt-3 text-3xl md:text-5xl font-extrabold tracking-[-0.02em] leading-[1.05] max-w-2xl">
            Tres pasos y tu primera obra está presupuestada.
          </h2>
          <ol className="mt-14 grid md:grid-cols-3 gap-px bg-white/10 rounded-xl overflow-hidden">
            {STEPS.map(([Icon, title, desc], i) => (
              <li key={title} className="bg-slate-900 p-7 md:p-8">
                <div className="flex items-center justify-between">
                  <span className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center"><Icon size={19} /></span>
                  <span className={`text-sm text-slate-500 ${MONO}`}>{String(i + 1).padStart(2, '0')}</span>
                </div>
                <h3 className="mt-6 text-xl font-bold">{title}</h3>
                <p className="mt-2 text-slate-400 leading-relaxed">{desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Base de empresa */}
      <section className="py-24 md:py-28">
        <div className="max-w-6xl mx-auto px-5 md:px-8 grid md:grid-cols-[1fr_1.2fr] gap-10 md:gap-16 items-start">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-[-0.02em] text-slate-900 leading-[1.08]">
            Lo que aprende una obra queda en la empresa.
          </h2>
          <div className="space-y-4 text-lg text-slate-600 leading-relaxed">
            <p>
              Los rendimientos, los precios y las tareas que ajustás en cada presupuesto quedan en la base de tu empresa, no en una planilla
              que solo entiende quien la armó.
            </p>
            <p>
              Pensado para estudios, constructoras y profesionales independientes que presupuestan y dirigen obra tradicional en Argentina.
            </p>
          </div>
        </div>
      </section>

      {/* Cierre */}
      <section id="beta" className="px-5 md:px-8 pb-24">
        <div className="max-w-6xl mx-auto rounded-2xl bg-blue-600 text-white px-7 py-14 md:px-16 md:py-20 relative overflow-hidden">
          <svg className="absolute right-0 top-0 h-full opacity-20 pointer-events-none" viewBox="0 0 300 300" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
            <path d="M40 300 V140 L150 60 L260 140 V300 M90 300 V200 H140 V300 M180 190 H230 V240 H180 Z" fill="none" stroke="white" strokeWidth="2" />
            <path d="M0 300 H300" stroke="white" strokeWidth="2" strokeDasharray="6 6" />
          </svg>
          <div className="relative max-w-xl">
            <p className={`text-[11px] uppercase tracking-[0.14em] text-blue-100 ${MONO}`}>Beta abierta</p>
            <h2 className="mt-3 text-3xl md:text-5xl font-extrabold tracking-[-0.02em] leading-[1.05]">
              Gratis mientras dure la beta.
            </h2>
            <p className="mt-5 text-blue-100 text-lg leading-relaxed">
              Creá tu cuenta y armá tu primer presupuesto hoy. Tus comentarios definen lo que viene.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <button onClick={onSignup} className="inline-flex items-center gap-2 bg-white text-blue-700 hover:bg-blue-50 font-semibold px-6 py-3.5 rounded-lg transition-colors">
                Crear cuenta gratis <ArrowRight size={17} />
              </button>
              <button onClick={onLogin} className="inline-flex items-center gap-2 border border-white/40 hover:border-white text-white font-semibold px-6 py-3.5 rounded-lg transition-colors">
                Ingresar
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Pie */}
      <footer className="border-t border-slate-900/10">
        <div className="max-w-6xl mx-auto px-5 md:px-8 py-8 flex flex-col md:flex-row md:items-center justify-between gap-4 text-sm text-slate-500">
          <span className="font-black text-slate-900">
            obraf<span className="text-blue-600">low</span>
            <span className="ml-3 font-normal text-slate-400">© {new Date().getFullYear()}</span>
          </span>
          <nav className="flex flex-wrap gap-6">
            <a href="/terminos" className="hover:text-slate-900">Términos y condiciones</a>
            <a href="/privacidad" className="hover:text-slate-900">Política de privacidad</a>
          </nav>
        </div>
      </footer>
    </div>
  );
};
