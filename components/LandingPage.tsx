import React from 'react';
import { HardHat, ArrowRight, ArrowUpRight } from 'lucide-react';

interface Props {
  onLogin: () => void;
}

const MODULES: [string, string][] = [
  ['Recursos', 'Materiales, herramientas y mano de obra con una base común.'],
  ['APU', 'Rendimientos y costos reutilizables para presupuestar con criterio.'],
  ['Presupuesto', 'Partidas trazables desde la estimación hasta la ejecución.'],
  ['Planificación', 'Tareas, responsables y avances conectados al costo real.'],
  ['Control', 'Desvíos visibles a tiempo para decidir antes de perder margen.'],
  ['Documentación', 'La información de obra ordenada, accesible y contextual.'],
];

const FLOW = ['Empresa', 'Proyecto', 'Presupuesto', 'Plan', 'Obra', 'Aprendizaje'];

const FRAGMENTS: [string, string][] = [
  ['PLANILLA', 'Presupuesto_v8_FINAL.xlsx'],
  ['MENSAJE', '"¿Cuánto hormigón queda?"'],
  ['CARPETA', 'Certificados / Julio / nuevos'],
  ['MEMORIA', '"Ese rendimiento lo tenía Juan"'],
];

const STATS: [string, string, string, string][] = [
  ['14–15%', 'ganancias potenciales de productividad mediante transformación digital.', 'McKinsey', 'https://www.mckinsey.com/capabilities/operations/our-insights/decoding-digital-transformation-in-construction'],
  ['64%', 'de quienes invierten en tecnología buscan mejorar presupuesto y job costing.', 'Procore', 'https://mkt-cdn.procore.com/downloads/reports/Global_Report_EBK.pdf'],
  ['20 M', 'de empleos genera la construcción en América Latina y el Caribe.', 'BID', 'https://publications.iadb.org/en/transforming-construction-sector-latin-america-and-caribbean-digitalization-innovation-and'],
];

export const LandingPage: React.FC<Props> = ({ onLogin }) => {
  return (
    <div className="min-h-screen bg-white text-slate-800">
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-20 h-16 flex items-center justify-between px-6 md:px-10 bg-white/90 backdrop-blur border-b border-slate-100">
        <a href="#inicio" className="flex items-center gap-2 font-black text-slate-800">
          <span className="bg-blue-600 w-8 h-8 rounded-lg flex items-center justify-center">
            <HardHat size={18} className="text-white" />
          </span>
          obraf<span className="text-blue-600">low</span>
        </a>
        <div className="hidden md:flex items-center gap-6 text-sm text-slate-600">
          <a href="#producto" className="hover:text-slate-900">Producto</a>
          <a href="#impacto" className="hover:text-slate-900">Impacto</a>
        </div>
        <button
          onClick={onLogin}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          Ingresar a la plataforma
        </button>
      </nav>

      {/* Hero */}
      <section id="inicio" className="pt-32 pb-20 px-6 md:px-10 bg-gradient-to-b from-blue-50/60 to-white">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-blue-700 bg-blue-100 px-3 py-1.5 rounded-full mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600" /> Gestión integral para constructoras
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 leading-[1.05]">
              La obra avanza.<br /><span className="text-blue-600">La información también.</span>
            </h1>
            <p className="mt-5 text-lg text-slate-600 max-w-md">
              Obraflow conecta la base de conocimiento de la empresa con cada proyecto, para transformar datos dispersos en decisiones claras.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                onClick={onLogin}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-3 rounded-lg transition-colors"
              >
                Ingresar a la plataforma <ArrowRight size={16} />
              </button>
              <a href="#producto" className="text-sm font-medium text-slate-600 hover:text-slate-900">
                Conocer Obraflow ↓
              </a>
            </div>
            <p className="mt-4 text-xs font-medium text-slate-400 tracking-wide">
              PRESUPUESTO · PLANIFICACIÓN · EJECUCIÓN · CONTROL
            </p>
          </div>

          {/* Vista conceptual del panel */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xl shadow-slate-200/50 p-5" aria-label="Vista conceptual del panel de Obraflow">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-4">
              <span className="font-semibold text-slate-700">Proyecto / Edificio Rivera</span>
              <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> En ejecución
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-5">
              <div>
                <p className="text-xs text-slate-400">Avance físico</p>
                <p className="text-3xl font-bold text-slate-900">68%</p>
                <div className="h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-blue-600 rounded-full" style={{ width: '68%' }} />
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-400">Desvío proyectado</p>
                <p className="text-3xl font-bold text-emerald-600">−2,4%</p>
                <p className="text-xs text-slate-400 mt-2">Dentro del objetivo</p>
              </div>
            </div>
            <div className="flex items-end gap-1.5 h-16 border-t border-slate-100 pt-3">
              {[20, 42, 34, 70, 54, 82, 100].map((h, i) => (
                <span
                  key={i}
                  className={`flex-1 rounded-t ${i === 6 ? 'bg-blue-100' : 'bg-blue-600'}`}
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Problema */}
      <section className="py-24 px-6 md:px-10 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-semibold text-slate-400 tracking-widest mb-4">01 / EL PROBLEMA</p>
          <div className="grid md:grid-cols-3 gap-10">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 leading-tight md:col-span-2">
              Una obra no pierde control de golpe.<br /><span className="text-blue-600">Lo pierde entre sistemas.</span>
            </h2>
            <div className="space-y-3 text-slate-600">
              <p>Presupuestos en planillas. Avances en mensajes. Compras en otro sistema. Rendimientos que quedan en la memoria de una persona.</p>
              <p className="text-slate-400">Cuando la información llega tarde o fuera de contexto, el equipo reacciona. No conduce.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px mt-16 bg-slate-200 border border-slate-200 rounded-xl overflow-hidden">
            {FRAGMENTS.map(([label, value]) => (
              <div key={label} className="bg-white p-5 flex flex-col justify-between min-h-[120px]">
                <span className="text-[10px] font-mono text-slate-400">{label}</span>
                <span className="font-semibold text-slate-800 text-sm">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Solución */}
      <section id="producto" className="py-24 px-6 md:px-10 bg-slate-900 text-white">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-semibold text-blue-300 tracking-widest mb-4">02 / LA PROPUESTA</p>
          <h2 className="text-3xl md:text-4xl font-bold max-w-2xl leading-tight">
            Un sistema operativo<br />para la <span className="text-blue-400">gestión de obra.</span>
          </h2>
          <p className="mt-4 text-slate-300 max-w-xl">Obraflow ordena la operación en dos capas que se potencian entre sí.</p>
          <div className="grid md:grid-cols-[1fr_auto_1fr] gap-8 items-center mt-12">
            <div className="border border-white/15 rounded-xl p-8">
              <span className="text-xs font-mono text-blue-300">01</span>
              <h3 className="text-xl font-bold mt-4 mb-2">Base de empresa</h3>
              <p className="text-slate-300 text-sm">Recursos, mano de obra, análisis de precios unitarios y plantillas que preservan el conocimiento construido.</p>
              <div className="flex flex-wrap gap-2 mt-5">
                {['Recursos', 'Mano de obra', 'APU', 'Plantillas'].map(t => (
                  <span key={t} className="text-[10px] font-mono border border-white/20 rounded px-2 py-1">{t}</span>
                ))}
              </div>
            </div>
            <ArrowRight className="hidden md:block text-blue-400" size={28} />
            <div className="border border-white/15 rounded-xl p-8">
              <span className="text-xs font-mono text-blue-300">02</span>
              <h3 className="text-xl font-bold mt-4 mb-2">Gestión de proyecto</h3>
              <p className="text-slate-300 text-sm">Presupuesto, planificación y ejecución trabajando sobre una única fuente de información.</p>
              <div className="flex flex-wrap gap-2 mt-5">
                {['Costos', 'Tareas', 'Avances', 'Control'].map(t => (
                  <span key={t} className="text-[10px] font-mono border border-white/20 rounded px-2 py-1">{t}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Módulos */}
      <section className="py-24 px-6 md:px-10">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-semibold text-slate-400 tracking-widest mb-4">03 / EL PRODUCTO</p>
          <div className="grid md:grid-cols-3 gap-10 items-end mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 md:col-span-2">
              Todo lo necesario.<br /><span className="text-blue-600">En un mismo flujo.</span>
            </h2>
            <p className="text-slate-500">Cada módulo resuelve una tarea concreta. Juntos construyen trazabilidad de punta a punta.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 border border-slate-200 rounded-xl overflow-hidden">
            {MODULES.map(([name, description], i) => (
              <div key={name} className="p-6 border-slate-200 [&:not(:last-child)]:border-r [&:not(:nth-last-child(-n+3))]:border-b md:[&:not(:nth-last-child(-n+3))]:border-b relative">
                <span className="text-xs font-mono text-slate-400">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="font-bold text-lg mt-6 mb-2">{name}</h3>
                <p className="text-sm text-slate-500 max-w-[260px]">{description}</p>
                <ArrowUpRight className="absolute top-6 right-6 text-blue-500" size={16} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recorrido */}
      <section className="py-24 px-6 md:px-10 bg-slate-900 text-white">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-semibold text-blue-300 tracking-widest mb-4">04 / EL RECORRIDO</p>
          <h2 className="text-3xl md:text-4xl font-bold max-w-2xl leading-tight">
            De cada obra,<br /><span className="text-blue-400">una empresa más inteligente.</span>
          </h2>
          <div className="flex flex-wrap border-t border-white/15 mt-12 pt-7 gap-6">
            {FLOW.map((item, i) => (
              <div key={item} className="flex items-center gap-3">
                <div>
                  <span className="text-xs font-mono text-blue-300 block">{i + 1}</span>
                  <b className="text-sm">{item}</b>
                </div>
                {i < FLOW.length - 1 && <ArrowRight size={16} className="text-slate-500" />}
              </div>
            ))}
          </div>
          <p className="mt-10 max-w-2xl text-slate-300 text-lg">
            El dato no termina en un informe: vuelve a la base de empresa como mejor criterio para presupuestar, planificar y ejecutar el próximo proyecto.
          </p>
        </div>
      </section>

      {/* Oportunidad */}
      <section id="impacto" className="py-24 px-6 md:px-10 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-semibold text-slate-400 tracking-widest mb-4">05 / LA OPORTUNIDAD</p>
          <div className="grid md:grid-cols-3 gap-10 mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 leading-tight md:col-span-2">
              El sector ya está cambiando.<br /><span className="text-blue-600">La gestión tiene que acompañar.</span>
            </h2>
            <p className="text-slate-600">La digitalización de la construcción no se trata de sumar aplicaciones. Se trata de conectar decisiones, personas y resultados.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-px bg-slate-200 border border-slate-200 rounded-xl overflow-hidden">
            {STATS.map(([value, desc, source, url]) => (
              <div key={source} className="bg-white p-6">
                <strong className="text-4xl font-bold text-blue-600">{value}</strong>
                <p className="text-sm text-slate-600 mt-3 max-w-[260px]">{desc}</p>
                <a href={url} target="_blank" rel="noreferrer" className="text-xs font-mono text-slate-400 hover:text-blue-600 mt-3 inline-block">{source} ↗</a>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 mt-4">Cifras de referencia sectorial; no constituyen resultados propios ni promesas de desempeño de Obraflow.</p>
        </div>
      </section>

      {/* Valor */}
      <section className="py-24 px-6 md:px-10">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-semibold text-slate-400 tracking-widest mb-4">06 / EL VALOR</p>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 max-w-xl leading-tight mb-12">
            Menos fricción.<br /><span className="text-blue-600">Más capacidad de decidir.</span>
          </h2>
          <div className="grid md:grid-cols-2 gap-px bg-slate-200 border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-50 p-6">
              <span className="text-xs font-mono text-slate-400">ANTES</span>
              <b className="block text-lg mt-4 mb-1">Buscar la información</b>
              <p className="text-sm text-slate-500">Datos aislados, versiones duplicadas y contexto repartido.</p>
            </div>
            <div className="bg-blue-600 text-white p-6">
              <span className="text-xs font-mono text-blue-200">CON OBRAFLOW</span>
              <b className="block text-lg mt-4 mb-1">Actuar con información</b>
              <p className="text-sm text-blue-100">Una lectura común del proyecto, actualizada y trazable.</p>
            </div>
            <div className="bg-slate-50 p-6">
              <span className="text-xs font-mono text-slate-400">ANTES</span>
              <b className="block text-lg mt-4 mb-1">Repetir el aprendizaje</b>
              <p className="text-sm text-slate-500">Cada obra vuelve a resolver problemas que la empresa ya vivió.</p>
            </div>
            <div className="bg-blue-600 text-white p-6">
              <span className="text-xs font-mono text-blue-200">CON OBRAFLOW</span>
              <b className="block text-lg mt-4 mb-1">Capitalizar experiencia</b>
              <p className="text-sm text-blue-100">Cada proyecto mejora la base con la que comienza el siguiente.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Cierre */}
      <section className="py-24 px-6 md:px-10 bg-slate-900 text-white text-center">
        <div className="max-w-2xl mx-auto flex flex-col items-center">
          <div className="w-14 h-14 rounded-full border-2 border-blue-400 text-blue-400 flex items-center justify-center font-bold mb-6">O</div>
          <p className="text-xs font-semibold text-blue-300 tracking-widest mb-4">EL PRÓXIMO PASO</p>
          <h2 className="text-3xl md:text-4xl font-bold leading-tight">
            Empecemos a gestionar<br /><span className="text-blue-400">tu obra con Obraflow.</span>
          </h2>
          <p className="mt-5 text-slate-300">
            Entrá a la plataforma y probá el flujo completo: empresa, proyecto, presupuesto y planificación conectados.
          </p>
          <button
            onClick={onLogin}
            className="mt-8 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
          >
            Ingresar a la plataforma <ArrowRight size={16} />
          </button>
        </div>
        <footer className="max-w-6xl mx-auto mt-20 pt-6 border-t border-white/10 flex flex-wrap justify-between gap-2 text-xs text-slate-400">
          <span>OBRAFLOW</span>
          <span>La obra, bajo control.</span>
          <span>{new Date().getFullYear()}</span>
        </footer>
      </section>
    </div>
  );
};
