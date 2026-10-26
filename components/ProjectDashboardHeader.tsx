import React, { useMemo } from 'react';
import { CalendarDays, Flag } from 'lucide-react';
import { useERP } from '../context/ERPContext';
import { useProjectSchedule } from '../hooks/useProjectSchedule';

const DAY = 86400000;
const MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

const localDay = (ymd: string) => {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
};

const pct = (v: number) => `${Math.round(v * 100)} %`;

const Ring: React.FC<{ value: number; color: string; label: string; title: string; sub: string; delta?: string }> = ({ value, color, label, title, sub, delta }) => {
  const c = 2 * Math.PI * 40;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4">
      <svg role="img" aria-label={`${title}: ${label}`} width="88" height="88" viewBox="0 0 100 100" className="shrink-0">
        <circle cx="50" cy="50" r="40" fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`} transform="rotate(-90 50 50)" />
        <text x="50" y="56" textAnchor="middle" fontSize="18" fontWeight="700" fill="#0f172a">{label}</text>
      </svg>
      <div className="text-sm space-y-1">
        <div className="font-bold text-slate-800">{title}</div>
        <div className="text-slate-500">{sub}</div>
        {delta && <div className="font-semibold text-red-600">{delta}</div>}
      </div>
    </div>
  );
};

export const ProjectDashboardHeader: React.FC = () => {
  const { project } = useERP();
  const { itemCosts, cpmItems, evm, criticalPathStats } = useProjectSchedule();

  const data = useMemo(() => {
    if (!project.startDate || cpmItems.length === 0) return null;
    const start = localDay(project.startDate);
    const end = criticalPathStats.finishDate.getTime();
    if (!(end > start)) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const now = today.getTime();
    const totalDays = Math.round((end - start) / DAY);
    const elapsed = Math.max(0, Math.min(totalDays, Math.round((now - start) / DAY)));
    const weeks = Math.max(1, Math.ceil(totalDays / 7));
    const week = Math.min(weeks, Math.floor(elapsed / 7) + 1);

    const costById = new Map<string, number>(itemCosts.map(ic => [ic.id, ic.totalCost] as [string, number]));
    const bac = itemCosts.reduce((a, ic) => a + ic.totalCost, 0);
    const plannedAt = (t: number) => {
      if (bac <= 0) return 0;
      let pv = 0;
      for (const it of cpmItems) {
        const cost = costById.get(it.id) ?? 0;
        const s = it.earlyStart, f = it.earlyFinish;
        const share = t >= f ? 1 : t <= s ? 0 : (t - s) / Math.max(f - s, DAY);
        pv += cost * share;
      }
      return pv / bac;
    };
    const curve = Array.from({ length: weeks + 1 }, (_, w) => plannedAt(Math.min(end, start + w * 7 * DAY)));
    const planToday = plannedAt(now);
    const physical = evm.BAC > 0 ? evm.EV / evm.BAC : 0;
    const financial = evm.BAC > 0 ? evm.AC / evm.BAC : 0;

    const fmt = (t: number) => { const d = new Date(t); return { day: d.getDate(), month: MONTHS[d.getMonth()], year: d.getFullYear() }; };
    return { start: fmt(start), end: fmt(end), totalDays, elapsed, weeks, week, curve, planToday, physical, financial, todayFrac: elapsed / totalDays };
  }, [project.startDate, cpmItems, itemCosts, evm, criticalPathStats]);

  if (!data) return null;

  const W = 640, H = 220, L = 40, T = 14, B = 196;
  const x = (w: number) => L + (w / data.weeks) * (W - L - 10);
  const y = (v: number) => B - v * (B - T);
  const planPts = data.curve.map((v, w) => `${x(w).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const todayX = L + data.todayFrac * (W - L - 10);
  const step = Math.max(1, Math.ceil(data.weeks / 6));
  const deltaPts = Math.round((data.physical - data.planToday) * 100);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex flex-wrap items-center gap-5">
        <div>
          <div className="text-[11px] font-bold text-green-700 flex items-center gap-1"><CalendarDays size={12} /> INICIO</div>
          <div className="text-2xl font-bold text-slate-800">{data.start.day} <span className="text-xs text-slate-500">{data.start.month} {data.start.year}</span></div>
        </div>
        <div className="flex-1 min-w-[240px] space-y-1.5">
          <div className="flex justify-between text-xs text-slate-500">
            <span><strong className="text-pink-700">{pct(data.todayFrac)} del plazo</strong> · {data.elapsed} días transcurridos</span>
            <span>{data.totalDays - data.elapsed} días restantes</span>
          </div>
          <div className="h-2 rounded-full bg-slate-200 relative">
            <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-orange-500 to-pink-600" style={{ width: `${data.todayFrac * 100}%` }} />
          </div>
          <div className="text-xs text-center text-slate-500"><strong className="text-slate-800">HOY · semana {data.week}</strong> · {data.weeks} semanas · {data.totalDays} días corridos</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1 justify-end"><Flag size={12} /> FIN</div>
          <div className="text-2xl font-bold text-slate-800">{data.end.day} <span className="text-xs text-slate-500">{data.end.month} {data.end.year}</span></div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-white border border-slate-200 rounded-xl p-5 space-y-2">
          <div className="flex flex-wrap justify-between gap-2">
            <div>
              <div className="font-bold text-slate-800">Curva S · plan vs. real</div>
              <div className="text-xs text-slate-500">Avance acumulado en costo · obra completa</div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2 py-1 border border-slate-200 rounded"><span className="text-blue-600">- - -</span> Planeado hoy {pct(data.planToday)}</span>
              <span className="px-2 py-1 border border-slate-200 rounded"><span className="text-orange-600">●</span> Real físico {pct(data.physical)}</span>
              <span className="px-2 py-1 border border-slate-200 rounded"><span className="text-teal-600">●</span> Costo real {pct(data.financial)}</span>
            </div>
          </div>
          <svg role="img" aria-label={`Curva S: planeado hoy ${pct(data.planToday)}, real físico ${pct(data.physical)}`} viewBox={`0 0 ${W} ${H + 20}`} className="w-full h-auto">
            {[0, 0.25, 0.5, 0.75, 1].map(v => (
              <g key={v}>
                <line x1={L} x2={W - 10} y1={y(v)} y2={y(v)} stroke="#e2e8f0" />
                <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="#64748b">{v * 100} %</text>
              </g>
            ))}
            {Array.from({ length: data.weeks + 1 }, (_, w) => w).filter(w => w % step === 0).map(w => (
              <text key={w} x={x(w)} y={B + 18} textAnchor="middle" fontSize="10" fill="#64748b">S{w}</text>
            ))}
            <polyline points={planPts} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeDasharray="7 5" />
            <line x1={todayX} x2={todayX} y1={T} y2={B} stroke="#ea580c" strokeDasharray="4 4" />
            <text x={todayX} y={T - 3} textAnchor="middle" fontSize="10" fontWeight="700" fill="#ea580c">HOY</text>
            <circle cx={todayX} cy={y(data.physical)} r="5" fill="#ea580c" />
            <circle cx={todayX} cy={y(data.financial)} r="5" fill="#0d9488" />
          </svg>
          <p className="text-xs text-slate-500">La curva real se va a dibujar semana a semana a medida que se registren avances; por ahora se marca el punto de hoy.</p>
        </div>
        <div className="space-y-4">
          <Ring value={data.physical} color="#ea580c" label={pct(data.physical)} title="Avance físico"
            sub={`Plan a hoy: ${pct(data.planToday)}`} delta={deltaPts < 0 ? `${deltaPts} pts vs plan` : undefined} />
          <Ring value={data.financial} color="#0d9488" label={pct(data.financial)} title="Costo real" sub="Sobre el presupuesto (materiales recibidos y mano de obra)" />
        </div>
      </div>
    </div>
  );
};
