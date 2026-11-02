import React from 'react';
import type { TaskSketchSpec } from '../catalog/chandiasCatalog';
import {
  INK, MID, SOFT, ACC, ACC_FILL, STEEL, GHOST,
  PatternName, T, DimH, DimV, Leader, Inset, Chip, Plate, plateOffset, clamp, fit, poly,
} from './primitives';

export interface SketchCtx {
  uid: string;
  /** Etiqueta de la dimensión i: valor con unidad si está cargado, nombre si no. */
  lbl: (i: number) => string;
  /** Valor numérico de la dimensión i (0 si está vacío). */
  v: (i: number) => number;
  p: (n: PatternName) => string;
  arrow: string;
}

type Spec<K extends TaskSketchSpec['kind']> = Extract<TaskSketchSpec, { kind: K }>;

interface Layer { key: string; label: string; t: number; fill: string; target?: boolean; ghost?: boolean }

/** Pila de capas en corte, de abajo hacia arriba (o de izquierda a derecha si horizontal). */
const LayerStack: React.FC<{
  x: number; y: number; w: number; layers: Layer[]; horizontal?: boolean; labelX?: number;
}> = ({ x, y, w, layers, horizontal, labelX }) => {
  let acc = 0;
  const labelYs: number[] = [];
  {
    let p = 0;
    layers.forEach((l, i) => {
      const center = y - p - l.t / 2;
      p += l.t;
      labelYs.push(i === 0 ? center : Math.min(center, labelYs[i - 1] - 13));
    });
  }
  return (
    <g>
      {layers.map((l, i) => {
        const pos = acc;
        acc += l.t;
        const stroke = l.target ? ACC : l.ghost ? GHOST : SOFT;
        const dash = l.ghost ? '3 2' : undefined;
        if (horizontal) {
          const lx = x + pos;
          const ty = y + 16 + i * 14;
          return (
            <g key={l.key}>
              <rect x={lx} y={y} width={l.t} height={w} fill={l.fill} stroke={stroke}
                strokeWidth={l.target ? 1.3 : 0.7} strokeDasharray={dash} opacity={l.ghost ? 0.7 : 1} />
              <Leader x={lx + l.t / 2} y={y + w * 0.5 + (i % 2 ? 12 : -12)} tx={labelX ?? x + acc + 10} ty={ty}
                text={l.label} strong={l.target} ghost={l.ghost} />
            </g>
          );
        }
        const ly = y - pos - l.t;
        const ty = labelYs[i];
        const lx = labelX ?? x + w + 12;
        return (
          <g key={l.key}>
            <rect x={x} y={ly} width={w} height={l.t} fill={l.fill} stroke={stroke}
              strokeWidth={l.target ? 1.3 : 0.7} strokeDasharray={dash} opacity={l.ghost ? 0.7 : 1} />
            {l.label && (
              <g>
                <polyline points={`${x + w - 3},${ly + l.t / 2} ${lx - 4},${ty}`} fill="none" stroke={l.target ? ACC : SOFT} strokeWidth="0.6" />
                <circle cx={x + w - 3} cy={ly + l.t / 2} r="1.2" fill={l.target ? ACC : MID} />
                <T x={lx} y={ty} size={7.2} color={l.target ? ACC : l.ghost ? SOFT : MID} bold={l.target}>{l.label}</T>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
};

function secLabel(c: SketchCtx, a: number, b: number) {
  if (c.v(a) > 0 && c.v(b) > 0) return `${Math.round(c.v(a) * 100)} × ${Math.round(c.v(b) * 100)} cm`;
  return 'ancho × alto';
}

function cmLabel(c: SketchCtx, i: number) {
  return c.v(i) > 0 ? `${Math.round(c.v(i) * 1000) / 10} cm`.replace('.', ',') : c.lbl(i);
}

const Ground: React.FC<{ c: SketchCtx; x1: number; x2: number; y: number; y2?: number }> = ({ c, x1, x2, y, y2 = 164 }) => (
  <g>
    <rect x={x1} y={y} width={x2 - x1} height={y2 - y} fill={c.p('soil')} />
    <line x1={x1} y1={y} x2={x2} y2={y} stroke={INK} strokeWidth="1.3" />
  </g>
);

const PlanInset: React.FC<{ c: SketchCtx; a: number; b: number; la: string; lb: string; fill?: string; title?: string; children?: React.ReactNode }> =
  ({ c, a, b, la, lb, fill, title = 'Planta', children }) => {
    const { w, h } = fit(a, b, 66, 96, 60, 44);
    const x = 222 + (70 - w) / 2, y = 30 + (104 - h) / 2;
    return (
      <Inset title={title}>
        <rect x={x} y={y} width={w} height={h} fill={fill ?? ACC_FILL} stroke={ACC} strokeWidth="1.1" />
        {children}
        <DimH x1={x} x2={x + w} y={y + h + 9} label={la} below />
        <DimV x={x + w + 6} y1={y} y2={y + h} label="" right />
        <T x={x + w + 8} y={y + h / 2 - 8} size={7.5} color={INK}>{lb}</T>
      </Inset>
    );
  };

// ─── Movimiento de suelos ─────────────────────────────────────────────────────

function Excavation(s: Spec<'excavation'>, c: SketchCtx) {
  const trench = s.mode === 'trench';
  const { w, h } = fit(c.v(1), c.v(2), trench ? 70 : 110, 92, trench ? 34 : 96, trench ? 78 : 58);
  const gy = 52, x0 = 34, x1 = x0 + w;
  const mx = x1 + 14;
  return (
    <g>
      <Ground c={c} x1={6} x2={206} y={gy} />
      <path d={`M${x0} ${gy} L${x0 + (trench ? 0 : 3)} ${gy + h} L${x1 - (trench ? 0 : 3)} ${gy + h} L${x1} ${gy} Z`}
        fill="#ffffff" stroke={INK} strokeWidth="1.3" />
      <path d={`M${mx} ${gy} Q ${mx + 26} ${gy - 34} ${Math.min(mx + 62, 204)} ${gy} Z`}
        fill={c.p('soil')} stroke={MID} strokeWidth="0.8" strokeDasharray="3 2" />
      <Leader x={mx + 26} y={gy - 12} tx={Math.min(mx + 40, 160)} ty={18} text="acopio" />
      <DimH x1={x0} x2={x1} y={gy - 10} label={c.lbl(1)} />
      <DimV x={x0 - 8} y1={gy} y2={gy + h} label={c.lbl(2)} />
      {trench && <T x={x1 + 6} y={gy + h - 6} size={7} color={SOFT}>hasta 1,50 m</T>}
      <T x={10} y={gy + h + 12 > 160 ? 160 : gy + h + 12} size={7} color={SOFT}>Corte transversal</T>
      <PlanInset c={c} a={c.v(0)} b={c.v(1)} la={c.lbl(0)} lb={c.lbl(1)} fill="#ffffff" />
    </g>
  );
}

function Fill(_s: Spec<'fill'>, c: SketchCtx) {
  const x0 = 30, x1 = 176, top = 46, n = 5, lh = 19;
  const tones = ['#e7d8c1', '#efe4d2'];
  return (
    <g>
      <Ground c={c} x1={6} x2={206} y={top - 4} />
      <rect x={x0} y={top - 4} width={x1 - x0} height={n * lh + 4} fill="#ffffff" />
      {Array.from({ length: n }, (_, i) => {
        const y = top + (n - 1 - i) * lh;
        const loose = i === n - 1;
        return (
          <rect key={i} x={x0} y={loose ? y - 5 : y} width={x1 - x0} height={loose ? lh + 5 : lh}
            fill={loose ? '#f8f1e6' : tones[i % 2]} stroke={loose ? SOFT : ACC} strokeWidth={loose ? 0.8 : 0.9}
            strokeDasharray={loose ? '3 2' : undefined} />
        );
      })}
      <path d={`M${x0} ${top - 4} L${x0} ${top + n * lh} L${x1} ${top + n * lh} L${x1} ${top - 4}`} fill="none" stroke={INK} strokeWidth="1.3" />
      <g>
        <rect x={120} y={top - 14} width={24} height={5} fill={MID} />
        <line x1={132} y1={top - 14} x2={132} y2={top - 34} stroke={MID} strokeWidth="2" />
        <line x1={124} y1={top - 34} x2={140} y2={top - 34} stroke={MID} strokeWidth="2" />
        <line x1={150} y1={top - 30} x2={150} y2={top - 12} stroke={MID} strokeWidth="0.8" markerEnd={c.arrow} />
      </g>
      <T x={154} y={top - 24} size={7}>pisón</T>
      <DimV x={x1 + 8} y1={top + 2 * lh} y2={top + 3 * lh} label="20 cm" right />
      <Leader x={70} y={top + 3} tx={40} ty={18} text="capa suelta" ghost />
      <Leader x={80} y={top + 3.5 * lh} tx={60} ty={156} text="capas compactadas" strong />
      <Inset title="Volumen">
        <rect x={232} y={50} width={28} height={80} fill="#f8f1e6" stroke={SOFT} strokeDasharray="3 2" />
        <rect x={274} y={66} width={28} height={64} fill={ACC_FILL} stroke={ACC} strokeWidth="1.1" />
        <T x={246} y={140} anchor="middle" size={7}>suelto</T>
        <T x={288} y={140} anchor="middle" size={7} color={ACC} bold>compactado</T>
        <line x1={262} y1={90} x2={272} y2={90} stroke={MID} strokeWidth="0.8" markerEnd={c.arrow} />
        <T x={265} y={30} anchor="middle" size={7.5} color={INK}>{c.v(0) > 0 ? `V = ${c.lbl(0)}` : 'V compactado'}</T>
      </Inset>
    </g>
  );
}

function Grading(_s: Spec<'grading'>, c: SketchCtx) {
  const lvl = 80;
  const terr = 'M6 70 C 30 58, 46 64, 62 76 S 96 98, 118 88 S 150 60, 172 70 S 196 90, 206 84';
  const terrPoly = `${terr} L206 164 L6 164 Z`;
  return (
    <g>
      <clipPath id={`${c.uid}-terr`}><path d={terrPoly} /></clipPath>
      <rect x={6} y={lvl} width={200} height={84} fill={ACC_FILL} />
      <path d={terrPoly} fill={c.p('soil')} />
      <rect x={6} y={6} width={200} height={lvl - 6} fill="#fecaca" opacity="0.75" clipPath={`url(#${c.uid}-terr)`} />
      <path d={terr} fill="none" stroke={MID} strokeWidth="1" strokeDasharray="4 2" />
      <line x1={6} y1={lvl} x2={206} y2={lvl} stroke={ACC} strokeWidth="1.6" />
      <Leader x={40} y={63} tx={20} ty={30} text="terreno natural" />
      <Leader x={190} y={lvl} tx={150} ty={140} text="nivel terminado" strong />
      <T x={150} y={60} size={7} color="#b91c1c" anchor="middle">desmonte</T>
      <T x={96} y={86} size={7} color={ACC} anchor="middle">relleno</T>
      <PlanInset c={c} a={c.v(0)} b={c.v(1)} la={c.lbl(0)} lb={c.lbl(1)} />
    </g>
  );
}

function LeanConcrete(_s: Spec<'leanConcrete'>, c: SketchCtx) {
  const gy = 40, x0 = 36, x1 = 176, by = 112;
  return (
    <g>
      <Ground c={c} x1={6} x2={206} y={gy} />
      <rect x={x0} y={gy} width={x1 - x0} height={by - gy} fill="#ffffff" />
      <rect x={58} y={70} width={96} height={by - 70 - 8} fill="none" stroke={SOFT} strokeDasharray="3 2" />
      <T x={106} y={86} anchor="middle" size={7} color={SOFT}>base (aparte)</T>
      <rect x={x0} y={by - 8} width={x1 - x0} height={8} fill={c.p('concrete')} stroke={ACC} strokeWidth="1.3" />
      <path d={`M${x0} ${gy} L${x0} ${by} L${x1} ${by} L${x1} ${gy}`} fill="none" stroke={INK} strokeWidth="1.3" />
      <DimV x={x1 + 8} y1={by - 8} y2={by} label="5 cm" right />
      <Leader x={80} y={by - 4} tx={60} ty={140} text="hormigón de limpieza H-4" strong />
      <PlanInset c={c} a={c.v(0)} b={c.v(1)} la={c.lbl(0)} lb={c.lbl(1)} fill={c.p('concrete')} />
    </g>
  );
}

// ─── Hormigones ───────────────────────────────────────────────────────────────

function MixBars({ mix, c }: { mix: string; c: SketchCtx }) {
  const parts = mix.split(':').map(s => parseFloat(s.replace(',', '.')) || 0);
  const names = ['cemento', 'arena', 'piedra'];
  const fills = ['#94a3b8', c.p('sand'), c.p('concrete')];
  const max = Math.max(...parts, 1);
  return (
    <Inset title="Dosaje en volumen">
      {parts.slice(0, 3).map((p, i) => {
        const h = (p / max) * 90;
        const x = 228 + i * 28;
        return (
          <g key={i}>
            <rect x={x} y={138 - h} width={20} height={h} fill={fills[i]} stroke={MID} strokeWidth="0.7" />
            <T x={x + 10} y={132 - h} anchor="middle" size={8} color={INK} bold>{String(p).replace('.', ',')}</T>
            <T x={x + 10} y={148} anchor="middle" size={6.8}>{names[i]}</T>
          </g>
        );
      })}
    </Inset>
  );
}

function Concrete(s: Spec<'concrete'>, c: SketchCtx) {
  if (s.shape === 'strip') {
    const L = 116;
    const { w: D, h: H } = fit(c.v(1), c.v(2), 56, 52, 40, 36);
    const x = 40, y = 124 - H;
    const { dx, dy } = plateOffset(D);
    return (
      <g>
        <Plate x={x} y={y} L={L} D={D} t={H} top="#e5e7eb" front={c.p('concrete')} side="#dfe3e8" />
        <DimH x1={x} x2={x + L} y={y + H + 10} label={c.lbl(0)} below />
        <DimV x={x - 6} y1={y} y2={y + H} label={c.lbl(2)} />
        <T x={x + L + dx * 0.5 + 6} y={y + dy * 0.5 - 4} size={8} color={INK}>{c.lbl(1)}</T>
        <Chip x={14} y={18} text={`${s.grade} · simple`} />
        <Inset title="Corte">
          <rect x={220} y={70} width={90} height={88} fill={c.p('soil')} />
          <line x1={220} y1={70} x2={310} y2={70} stroke={INK} strokeWidth="1.2" />
          <rect x={246} y={100} width={38} height={36} fill={c.p('concrete')} stroke={ACC} strokeWidth="1.2" />
          <rect x={256} y={36} width={18} height={64} fill={c.p('brick')} stroke={SOFT} strokeDasharray="3 2" opacity="0.8" />
          <T x={278} y={46} size={7} color={SOFT}>muro</T>
          <Leader x={265} y={118} tx={240} ty={150} text="cimiento corrido" strong />
        </Inset>
      </g>
    );
  }
  const x = 40, y = 64, L = 92, D = 60, H = 72;
  const { dx, dy } = plateOffset(D);
  return (
    <g>
      <Plate x={x} y={y} L={L} D={D} t={H} top="#e5e7eb" front={c.p('concrete')} side="#dfe3e8" />
      <T x={x + L / 2} y={y + H / 2} anchor="middle" size={10} color={INK} bold>{c.v(0) > 0 ? c.lbl(0) : '1 m³'}</T>
      <Chip x={x + L / 2 + dx / 2} y={y + dy - 12} text={s.grade} anchor="middle" />
      <T x={x + L / 2} y={y + H + 12} anchor="middle" size={7.5}>hecho en obra con hormigonera</T>
      {s.mix && <MixBars mix={s.mix} c={c} />}
    </g>
  );
}

function Slab(s: Spec<'slab'>, c: SketchCtx) {
  const { w: L, h: D } = fit(c.v(0), c.v(1), 132, 86, 124, 70);
  const t = 10, x = 14, y = 130;
  const { dx, dy } = plateOffset(D);
  const thick = s.thickness ?? cmLabel(c, 2);
  const elaborado = !s.thickness;
  const mesh: React.ReactNode[] = [];
  for (let i = 1; i < 8; i++) {
    const f = i / 8;
    mesh.push(<line key={`a${i}`} x1={x + L * f} y1={y} x2={x + L * f + dx} y2={y + dy} stroke={STEEL} strokeWidth="0.6" strokeDasharray="2 2" />);
  }
  for (let i = 1; i < 5; i++) {
    const f = i / 5;
    mesh.push(<line key={`b${i}`} x1={x + dx * f} y1={y + dy * f} x2={x + L + dx * f} y2={y + dy * f} stroke={STEEL} strokeWidth="0.6" strokeDasharray="2 2" />);
  }
  return (
    <g>
      <Plate x={x} y={y} L={L} D={D} t={t} top="#eef0f3" front={c.p('concrete')} side="#dfe3e8" />
      {mesh}
      <DimH x1={x} x2={x + L} y={y + t + 10} label={c.lbl(0)} below />
      <T x={x + L + dx * 0.55 + 10} y={y + dy * 0.55 + 4} size={8} color={INK}>{c.lbl(1)}</T>
      <Leader x={x + L * 0.3 + dx * 0.4} y={y + dy * 0.4} tx={20} ty={16} text="armadura (malla inferior)" />
      <Inset title="Corte">
        <rect x={224} y={60} width={82} height={30} fill={c.p('concrete')} stroke={ACC} strokeWidth="1.2" />
        <line x1={226} y1={82} x2={304} y2={82} stroke={STEEL} strokeWidth="0.9" />
        {[0, 1, 2, 3, 4, 5].map(i => <circle key={i} cx={232 + i * 13.5} cy={85} r="2" fill={STEEL} />)}
        <DimV x={312} y1={60} y2={90} label="" right />
        <T x={265} y={50} anchor="middle" size={8} color={INK} bold>e = {thick}</T>
        <T x={265} y={106} anchor="middle" size={7} color={SOFT}>recubrimiento ≈ 2 cm</T>
        {elaborado ? (
          <>
            <line x1={222} y1={93} x2={308} y2={93} stroke={ACC} strokeWidth="2" />
            <T x={265} y={122} anchor="middle" size={7.2} color={ACC} bold>cimbra incluida</T>
          </>
        ) : (
          <>
            <line x1={222} y1={95} x2={308} y2={95} stroke={GHOST} strokeWidth="2" strokeDasharray="4 2" />
            <T x={265} y={122} anchor="middle" size={7.2} color={SOFT}>encofrado: aparte</T>
          </>
        )}
        <Chip x={265} y={146} text={elaborado ? 'elaborado H-21' : 'hecho en obra'} anchor="middle" />
      </Inset>
    </g>
  );
}

const SectionRC: React.FC<{ cx: number; cy: number; w: number; h: number; formwork?: 'U' | 'O' }> =
  ({ cx, cy, w, h, formwork }) => {
    const x = cx - w / 2, y = cy - h / 2, r = Math.min(w, h) * 0.14;
    return (
      <g>
        {formwork === 'U' && <path d={`M${x - 4} ${y} L${x - 4} ${y + h + 4} L${x + w + 4} ${y + h + 4} L${x + w + 4} ${y}`} fill="none" stroke={ACC} strokeWidth="2" />}
        {formwork === 'O' && <rect x={x - 4} y={y - 4} width={w + 8} height={h + 8} fill="none" stroke={ACC} strokeWidth="2" />}
        <rect x={x} y={y} width={w} height={h} fill={'#eef0f3'} stroke={INK} strokeWidth="1.1" />
        <rect x={x + 4} y={y + 4} width={w - 8} height={h - 8} rx="2" fill="none" stroke={STEEL} strokeWidth="0.9" />
        {[[x + 4 + r, y + 4 + r], [x + w - 4 - r, y + 4 + r], [x + 4 + r, y + h - 4 - r], [x + w - 4 - r, y + h - 4 - r]].map(([px, py], i) => (
          <circle key={i} cx={px} cy={py} r={2.6} fill={STEEL} />
        ))}
      </g>
    );
  };

function Beam(s: Spec<'beam'>, c: SketchCtx) {
  const fixed = !!s.section;
  const L = 156, x = 38;
  const hRaw = !fixed && c.v(0) > 0 && c.v(2) > 0 ? (c.v(2) / c.v(0)) * L : 26;
  const H = clamp(hRaw, 16, 44);
  const y = s.onGround ? 96 - H : 70;
  const stirrups = Array.from({ length: 15 }, (_, i) => x + 6 + i * ((L - 12) / 14));
  const { w: sw, h: sh } = fixed ? { w: 40, h: 60 } : fit(c.v(1), c.v(2), 52, 80, 40, 60, 0.35);
  return (
    <g>
      {s.onGround
        ? <Ground c={c} x1={6} x2={206} y={y + H} />
        : (
          <>
            <rect x={x - 12} y={y - 30} width={12} height={H + 70} fill="#f8fafc" stroke={GHOST} strokeDasharray="3 2" />
            <rect x={x + L} y={y - 30} width={12} height={H + 70} fill="#f8fafc" stroke={GHOST} strokeDasharray="3 2" />
          </>
        )}
      <rect x={x} y={y} width={L} height={H} fill={c.p('concrete')} stroke={ACC} strokeWidth="1.3" />
      {stirrups.map((sx, i) => <line key={i} x1={sx} y1={y + 2.5} x2={sx} y2={y + H - 2.5} stroke={fixed ? GHOST : STEEL} strokeWidth="0.6" />)}
      <line x1={x + 2} y1={y + 3} x2={x + L - 2} y2={y + 3} stroke={STEEL} strokeWidth="1" />
      <line x1={x + 2} y1={y + H - 3} x2={x + L - 2} y2={y + H - 3} stroke={STEEL} strokeWidth="1" />
      <DimH x1={x} x2={x + L} y={s.onGround ? y - 10 : y + H + 12} label={c.lbl(0)} below={!s.onGround} />
      {!fixed && <DimV x={x - (s.onGround ? 6 : 18)} y1={y} y2={y + H} label={cmLabel(c, 2)} />}
      <T x={x} y={s.onGround ? 22 : 24} size={7.5}>{s.onGround ? 'Viga de fundación · vista' : 'Viga · vista lateral'}</T>
      <Inset title="Sección">
        <SectionRC cx={265} cy={78} w={sw} h={sh} formwork={fixed ? undefined : 'U'} />
        <T x={265} y={130} anchor="middle" size={8} color={INK} bold>{fixed ? s.section : secLabel(c, 1, 2)}</T>
        {fixed
          ? <T x={265} y={145} anchor="middle" size={7} color={SOFT}>estribos y encofrado: aparte</T>
          : <T x={265} y={145} anchor="middle" size={7} color={ACC} bold>encofrado fondo + laterales</T>}
      </Inset>
    </g>
  );
}

function Column(s: Spec<'column'>, c: SketchCtx) {
  const fixed = !!s.section;
  const H = 118, y = 26;
  const wRaw = !fixed && c.v(0) > 0 && c.v(1) > 0 ? (c.v(1) / c.v(0)) * H : 22;
  const W = clamp(wRaw, 14, 40);
  const x = 100 - W / 2;
  return (
    <g>
      <rect x={40} y={y - 14} width={120} height={14} fill="#f8fafc" stroke={GHOST} strokeDasharray="3 2" />
      {s.base
        ? (
          <>
            <Ground c={c} x1={6} x2={206} y={y + H} />
            <rect x={70} y={y + H + 4} width={60} height={14} fill="#f8fafc" stroke={GHOST} strokeDasharray="3 2" />
            <T x={136} y={y + H + 11} size={7} color={SOFT}>base</T>
          </>
        )
        : <line x1={30} y1={y + H} x2={170} y2={y + H} stroke={INK} strokeWidth="1.3" />}
      <rect x={x} y={y} width={W} height={H} fill={c.p('concrete')} stroke={ACC} strokeWidth="1.3" />
      {Array.from({ length: 12 }, (_, i) => y + 5 + i * ((H - 10) / 11)).map((sy, i) => (
        <line key={i} x1={x + 2.5} y1={sy} x2={x + W - 2.5} y2={sy} stroke={STEEL} strokeWidth="0.6" />
      ))}
      <line x1={x + 3} y1={y + 2} x2={x + 3} y2={y + H - 2} stroke={STEEL} strokeWidth="1" />
      <line x1={x + W - 3} y1={y + 2} x2={x + W - 3} y2={y + H - 2} stroke={STEEL} strokeWidth="1" />
      <DimV x={x - 10} y1={y} y2={y + H} label={c.lbl(0)} />
      <T x={170} y={y - 7} size={7} color={SOFT}>losa o viga</T>
      <Inset title="Sección">
        {(() => {
          const { w, h } = fixed ? { w: 50, h: 50 } : fit(c.v(1), c.v(2), 60, 60, 50, 50, 0.4);
          return <SectionRC cx={265} cy={78} w={w} h={h} formwork={fixed ? undefined : 'O'} />;
        })()}
        <T x={265} y={130} anchor="middle" size={8} color={INK} bold>{fixed ? s.section : secLabel(c, 1, 2)}</T>
        {fixed
          ? <T x={265} y={145} anchor="middle" size={7} color={SOFT}>encofrado: aparte</T>
          : <T x={265} y={145} anchor="middle" size={7} color={ACC} bold>encofrado 4 caras</T>}
      </Inset>
    </g>
  );
}

function Footing(_s: Spec<'footing'>, c: SketchCtx) {
  const gy = 40;
  const { w, h } = fit(c.v(0), c.v(2), 130, 52, 110, 34);
  const x = 104 - w / 2, by = 140;
  return (
    <g>
      <Ground c={c} x1={6} x2={206} y={gy} />
      <rect x={x - 8} y={gy} width={w + 16} height={by - gy + 4} fill="#ffffff" />
      <rect x={x - 8} y={by} width={w + 16} height={4} fill={c.p('concrete')} stroke={SOFT} strokeWidth="0.6" />
      <rect x={x} y={by - h} width={w} height={h} fill={c.p('concrete')} stroke={ACC} strokeWidth="1.3" />
      <line x1={x + 4} y1={by - 5} x2={x + w - 4} y2={by - 5} stroke={STEEL} strokeWidth="1" />
      {Array.from({ length: 8 }, (_, i) => x + 6 + i * ((w - 12) / 7)).map((bx, i) => <circle key={i} cx={bx} cy={by - 7.5} r="1.6" fill={STEEL} />)}
      <rect x={96} y={20} width={16} height={by - h - 20} fill="#f8fafc" stroke={GHOST} strokeDasharray="3 2" />
      <Leader x={112} y={30} tx={130} ty={18} text="columna (aparte)" ghost />
      <DimH x1={x} x2={x + w} y={by + 12} label={c.lbl(0)} below />
      <DimV x={x - 14} y1={by - h} y2={by} label={cmLabel(c, 2)} />
      <PlanInset c={c} a={c.v(0)} b={c.v(1)} la={c.lbl(0)} lb={c.lbl(1)} fill={c.p('concrete')}>
        <PlanGrid c={c} />
      </PlanInset>
    </g>
  );
}

const PlanGrid: React.FC<{ c: SketchCtx }> = ({ c }) => {
  const { w, h } = fit(c.v(0), c.v(1), 66, 96, 60, 44);
  const x = 222 + (70 - w) / 2, y = 30 + (104 - h) / 2;
  return (
    <g>
      {[1, 2, 3, 4].map(i => <line key={`v${i}`} x1={x + (w * i) / 5} y1={y + 3} x2={x + (w * i) / 5} y2={y + h - 3} stroke={STEEL} strokeWidth="0.6" />)}
      {[1, 2, 3, 4].map(i => <line key={`h${i}`} x1={x + 3} y1={y + (h * i) / 5} x2={x + w - 3} y2={y + (h * i) / 5} stroke={STEEL} strokeWidth="0.6" />)}
      <rect x={x + w / 2 - 6} y={y + h / 2 - 6} width={12} height={12} fill="none" stroke={MID} strokeDasharray="2 2" />
    </g>
  );
};

// ─── Mampostería ──────────────────────────────────────────────────────────────

function wallBox(c: SketchCtx) {
  const { w, h } = fit(c.v(0), c.v(1), 160, 112, 156, 100);
  return { x: 36 + (166 - w) / 2, y: 140 - h, w, h };
}

const WallDims: React.FC<{ c: SketchCtx; b: { x: number; y: number; w: number; h: number } }> = ({ c, b }) => (
  <g>
    <DimH x1={b.x} x2={b.x + b.w} y={b.y + b.h + 10} label={c.lbl(0)} below />
    <DimV x={b.x - 6} y1={b.y} y2={b.y + b.h} label={c.lbl(1)} />
  </g>
);

function BrickWall(s: Spec<'brickWall'>, c: SketchCtx) {
  const b = wallBox(c);
  const two = s.wythes === 2;
  const k = 2.2;
  const tw = (two ? 24 : 12) * k;
  const x0 = 270 - tw / 2;
  const bricks = two
    ? Array.from({ length: 4 }, (_, i) => ({ x: x0, y: 40 + i * (12 * k + 1.5), w: 24 * k, h: 12 * k }))
    : Array.from({ length: 2 }, (_, i) => ({ x: x0, y: 40 + i * (24 * k + 1.5), w: 12 * k, h: 24 * k }));
  return (
    <g>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={c.p('brick')} stroke={ACC} strokeWidth="1.3" />
      <WallDims c={c} b={b} />
      <Inset title="Planta del muro">
        <rect x={x0 - 4} y={37} width={tw + 8} height={108} fill="none" stroke={GHOST} strokeDasharray="3 2" />
        {bricks.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill="#f2d8c9" stroke="#c48a6a" strokeWidth="0.8" />)}
        <T x={x0 + tw + 8} y={60} size={7} color={SOFT}>revoque</T>
        <DimH x1={x0} x2={x0 + tw} y={152} label={`${two ? '24' : '12'} cm · revocado ≈ ${two ? '30' : '15'}`} below />
        <T x={225} y={26} size={7}>{two ? 'ladrillos a tizón' : 'ladrillos a soga'}</T>
      </Inset>
    </g>
  );
}

function HollowWall(s: Spec<'hollowWall'>, c: SketchCtx) {
  const b = wallBox(c);
  const bw = s.block * 2.3, bh = 18 * 2.3;
  const cols = s.block === 18 ? 3 : s.block === 12 ? 2 : 1;
  const x0 = 252 - bw / 2, y0 = 70;
  const depth = 30;
  const { dx, dy } = { dx: depth * 0.72, dy: -depth * 0.42 };
  const gw = (bw - 6 - (cols - 1) * 3) / cols, gh = (bh - 6 - 2 * 3) / 3;
  return (
    <g>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={c.p('hollow')} stroke={ACC} strokeWidth="1.3" />
      <WallDims c={c} b={b} />
      <Inset title="Pieza">
        <polygon points={poly([[x0 + bw, y0], [x0 + bw + dx, y0 + dy], [x0 + bw + dx, y0 + dy + bh], [x0 + bw, y0 + bh]])} fill="#e9bfa6" stroke="#c48a6a" strokeWidth="0.8" />
        <polygon points={poly([[x0, y0], [x0 + bw, y0], [x0 + bw + dx, y0 + dy], [x0 + dx, y0 + dy]])} fill="#efcdb8" stroke="#c48a6a" strokeWidth="0.8" />
        <rect x={x0} y={y0} width={bw} height={bh} fill="#f3d6c4" stroke="#b5714f" strokeWidth="1" />
        {Array.from({ length: cols * 3 }, (_, i) => {
          const cx = i % cols, cy = Math.floor(i / cols);
          return <rect key={i} x={x0 + 3 + cx * (gw + 3)} y={y0 + 3 + cy * (gh + 3)} width={gw} height={gh} fill="#ffffff" stroke="#c48a6a" strokeWidth="0.6" />;
        })}
        <T x={265} y={130} anchor="middle" size={8} color={INK} bold>{s.block} × 18 × 33 cm</T>
        <T x={265} y={145} anchor="middle" size={7}>muro de {s.block} cm</T>
      </Inset>
    </g>
  );
}

// ─── Revoques ─────────────────────────────────────────────────────────────────

function plasterLayers(layer: Spec<'plaster'>['layer'], c: SketchCtx): Layer[] {
  const hid: Layer = { key: 'hid', label: 'hidrófugo', t: 4, fill: '#bfdbfe' };
  const gru: Layer = { key: 'gru', label: 'grueso', t: 14, fill: c.p('sand') };
  const fin: Layer = { key: 'fin', label: 'fino', t: 4, fill: '#fafaf9' };
  switch (layer) {
    case 'grueso': return [{ ...gru, target: true }, { ...fin, ghost: true }];
    case 'fino': return [gru, { ...fin, target: true }];
    case 'hidrofugo': return [{ ...hid, target: true }, { ...gru, ghost: true }, { ...fin, ghost: true }];
    case 'gruesoExt': return [hid, { ...gru, target: true }, { ...fin, ghost: true }];
    case 'bajoRev': return [
      { ...gru, label: 'grueso peinado', target: true },
      { key: 'adh', label: 'adhesivo', t: 3, fill: '#e5e7eb', ghost: true },
      { key: 'rev', label: 'revestimiento', t: 6, fill: '#ffffff', ghost: true },
    ];
  }
}

function Plaster(s: Spec<'plaster'>, c: SketchCtx) {
  const b = wallBox(c);
  const layers = plasterLayers(s.layer, c);
  const n = layers.length;
  const ext = s.layer === 'hidrofugo' || s.layer === 'gruesoExt';
  return (
    <g>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={c.p('brick')} stroke={INK} strokeWidth="1" />
      {layers.map((l, i) => {
        const frac = 0.82 - (0.62 / Math.max(n - 1, 1)) * i;
        const w = b.w * (n === 1 ? 0.7 : frac);
        return (
          <rect key={l.key} x={b.x} y={b.y} width={w} height={b.h}
            fill={l.target ? (l.key === 'hid' ? '#bfdbfe' : l.key === 'fin' ? '#fafaf9' : c.p('sand')) : l.ghost ? '#ffffff' : l.fill}
            opacity={l.ghost ? 0.55 : 1}
            stroke={l.target ? ACC : l.ghost ? GHOST : SOFT} strokeWidth={l.target ? 1.3 : 0.7}
            strokeDasharray={l.ghost ? '3 2' : undefined} />
        );
      })}
      {layers.map((l, i) => {
        if (l.ghost) return null;
        const end = b.w * (n === 1 ? 0.7 : 0.82 - (0.62 / Math.max(n - 1, 1)) * i);
        const start = i + 1 < n ? b.w * (0.82 - (0.62 / Math.max(n - 1, 1)) * (i + 1)) : 0;
        return (
          <T key={l.key} x={b.x + (start + end) / 2} y={b.y + 9} anchor="middle" size={7}
            color={l.target ? ACC : l.ghost ? SOFT : MID} bold={l.target}>{l.label.split(' ')[0]}</T>
        );
      })}
      <T x={b.x + b.w * 0.91} y={b.y + 9} anchor="middle" size={7}>muro</T>
      <WallDims c={c} b={b} />
      <T x={b.x + 2} y={b.y - 8} size={7} color={SOFT}>{ext ? 'Paramento exterior' : 'Paramento interior'}</T>
      <Inset title="Corte">
        <rect x={222} y={28} width={26} height={120} fill={c.p('brick')} stroke={SOFT} strokeWidth="0.7" />
        <T x={235} y={156} anchor="middle" size={7}>muro</T>
        <LayerStack x={248} y={28} w={120} horizontal layers={layers} labelX={272} />
      </Inset>
    </g>
  );
}

// ─── Pisos y contrapisos ──────────────────────────────────────────────────────

function floorBox(c: SketchCtx) {
  const { w: L, h: D } = fit(c.v(0), c.v(1), 132, 84, 124, 68);
  return { x: 14, y: 134, L, D };
}

const FloorDims: React.FC<{ c: SketchCtx; f: { x: number; y: number; L: number; D: number }; t: number }> = ({ c, f, t }) => {
  const { dx, dy } = plateOffset(f.D);
  return (
    <g>
      <DimH x1={f.x} x2={f.x + f.L} y={f.y + t + 10} label={c.lbl(0)} below />
      <T x={f.x + f.L + dx * 0.55 + 10} y={f.y + dy * 0.55 + 4} size={8} color={INK}>{c.lbl(1)}</T>
    </g>
  );
};

function Screed(s: Spec<'screed'>, c: SketchCtx) {
  const f = floorBox(c);
  const fillByType: Record<typeof s.type, string> = {
    cascote: c.p('rubble'), pobre: c.p('concrete'), alisado: '#e5e7eb', visto: c.p('concrete'),
  };
  const labelByType: Record<typeof s.type, string> = {
    cascote: 'cascote', pobre: 'hormigón pobre', alisado: 'cemento alisado', visto: 'hormigón visto',
  };
  const t = s.type === 'alisado' ? 5 : 12;
  const layers: Layer[] = s.type === 'alisado'
    ? [
      { key: 'ter', label: 'terreno', t: 30, fill: c.p('soil') },
      { key: 'cp', label: 'contrapiso (aparte)', t: 40, fill: c.p('rubble'), ghost: true },
      { key: 'al', label: `alisado ${s.thickness}`, t: 12, fill: '#e5e7eb', target: true },
    ]
    : [
      { key: 'ter', label: 'terreno', t: 34, fill: c.p('soil') },
      { key: 'cp', label: `${labelByType[s.type]}`, t: 44, fill: fillByType[s.type], target: true },
      ...(s.type === 'visto' ? [] : [{ key: 'car', label: 'carpeta (aparte)', t: 10, fill: '#f1f5f9', ghost: true }]),
    ];
  return (
    <g>
      <Plate x={f.x} y={f.y} L={f.L} D={f.D} t={t} top={s.type === 'cascote' ? c.p('rubble') : fillByType[s.type]} front={fillByType[s.type]} side="#dfe3e8" stroke={ACC} />
      {s.type === 'visto' && Array.from({ length: 10 }, (_, i) => {
        const { dx, dy } = plateOffset(f.D);
        const fx = f.x + (f.L * (i + 0.5)) / 10;
        return <line key={i} x1={fx} y1={f.y} x2={fx + dx} y2={f.y + dy} stroke={SOFT} strokeWidth="0.5" />;
      })}
      <FloorDims c={c} f={f} t={t} />
      <Inset title="Corte">
        <LayerStack x={224} y={146} w={34} layers={layers} labelX={266} />
        <T x={241} y={30} anchor="middle" size={8} color={INK} bold>e = {s.thickness}</T>
      </Inset>
    </g>
  );
}

function TileFloor(s: Spec<'tileFloor'>, c: SketchCtx) {
  const f = floorBox(c);
  const { dx, dy } = plateOffset(f.D);
  const nL = clamp(c.v(0) > 0 ? Math.round((c.v(0) * 100) / s.cm) : Math.round(360 / s.cm), 3, 16);
  const nD = clamp(c.v(1) > 0 ? Math.round((c.v(1) * 100) / s.cm) : Math.round(240 / s.cm), 2, 10);
  const tone = s.finish === 'porcelanato' ? '#f1f5f9' : s.finish === 'calcareo' ? '#fde7d9' : '#fbf4e8';
  const cells: React.ReactNode[] = [];
  for (let i = 0; i < nL; i++) {
    for (let j = 0; j < nD; j++) {
      const p = (a: number, b: number): [number, number] => [f.x + (f.L * a) / nL + dx * (b / nD), f.y + dy * (b / nD)];
      const alt = s.finish === 'calcareo' && (i + j) % 2 === 1;
      cells.push(
        <polygon key={`${i}-${j}`} points={poly([p(i, j), p(i + 1, j), p(i + 1, j + 1), p(i, j + 1)])}
          fill={alt ? '#f6c9ae' : tone} stroke="#a8a29e" strokeWidth="0.5" />,
      );
    }
  }
  const mortar = s.finish === 'calcareo';
  return (
    <g>
      <Plate x={f.x} y={f.y} L={f.L} D={f.D} t={6} top={tone} front={c.p('concrete')} side="#dfe3e8" />
      {cells}
      <polygon points={poly([[f.x, f.y], [f.x + f.L, f.y], [f.x + f.L + dx, f.y + dy], [f.x + dx, f.y + dy]])} fill="none" stroke={ACC} strokeWidth="1.3" />
      <FloorDims c={c} f={f} t={6} />
      <Chip x={18} y={20} text={`${s.cm} × ${s.cm} cm`} />
      <Inset title="Corte">
        <LayerStack x={224} y={146} w={34} labelX={266} layers={[
          { key: 'cp', label: 'contrapiso (aparte)', t: 40, fill: c.p('rubble'), ghost: true },
          ...(mortar
            ? [{ key: 'mo', label: 'mortero de asiento', t: 14, fill: c.p('sand') } as Layer]
            : [
              { key: 'ca', label: 'carpeta (aparte)', t: 14, fill: '#f1f5f9', ghost: true } as Layer,
              { key: 'ad', label: 'adhesivo', t: 6, fill: '#d1d5db' } as Layer,
            ]),
          { key: 'pz', label: s.finish === 'calcareo' ? 'mosaico' : s.finish === 'porcelanato' ? 'porcelanato' : 'cerámica', t: 10, fill: tone, target: true },
        ]} />
        {(() => {
          const top = 146 - 40 - (mortar ? 14 : 20) - 10;
          return (
            <>
              <rect x={240} y={top} width={2} height={10} fill="#64748b" />
              <Leader x={241} y={top} tx={256} ty={top - 22} text="junta con pastina" />
            </>
          );
        })()}
      </Inset>
    </g>
  );
}

function WallTile(s: Spec<'wallTile'>, c: SketchCtx) {
  const b = wallBox(c);
  const cols = clamp(c.v(0) > 0 ? Math.round((c.v(0) * 100) / s.w) : Math.round(300 / s.w), 3, 20);
  const rows = clamp(c.v(1) > 0 ? Math.round((c.v(1) * 100) / s.h) : Math.round(200 / s.h), 2, 14);
  const cw = b.w / cols, rh = b.h / rows;
  return (
    <g>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="#f8fafc" stroke={ACC} strokeWidth="1.3" />
      {Array.from({ length: cols - 1 }, (_, i) => <line key={`c${i}`} x1={b.x + cw * (i + 1)} y1={b.y} x2={b.x + cw * (i + 1)} y2={b.y + b.h} stroke="#a8a29e" strokeWidth="0.5" />)}
      {Array.from({ length: rows - 1 }, (_, i) => <line key={`r${i}`} x1={b.x} y1={b.y + rh * (i + 1)} x2={b.x + b.w} y2={b.y + rh * (i + 1)} stroke="#a8a29e" strokeWidth="0.5" />)}
      <WallDims c={c} b={b} />
      <Chip x={14} y={16} text={`${Math.min(s.w, s.h)} × ${Math.max(s.w, s.h)} cm`} />
      <Inset title="Corte">
        <rect x={222} y={28} width={26} height={120} fill={c.p('brick')} stroke={SOFT} strokeWidth="0.7" />
        <T x={235} y={156} anchor="middle" size={7}>muro</T>
        <LayerStack x={248} y={28} w={120} horizontal labelX={272} layers={[
          { key: 'rb', label: 'revoque (aparte)', t: 10, fill: c.p('sand'), ghost: true },
          { key: 'ad', label: 'adhesivo', t: 3, fill: '#d1d5db' },
          { key: 'pz', label: 'pieza', t: 6, fill: '#ffffff', target: true },
        ]} />
      </Inset>
    </g>
  );
}

function StoneWall(_s: Spec<'stoneWall'>, c: SketchCtx) {
  const b = wallBox(c);
  return (
    <g>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={c.p('stone')} stroke={ACC} strokeWidth="1.3" />
      <WallDims c={c} b={b} />
      <Inset title="Corte">
        <rect x={222} y={28} width={26} height={120} fill={c.p('brick')} stroke={SOFT} strokeWidth="0.7" />
        <T x={235} y={156} anchor="middle" size={7}>muro</T>
        <rect x={248} y={28} width={8} height={120} fill={c.p('sand')} stroke={SOFT} strokeWidth="0.7" />
        <path d="M256 28 L266 30 L264 52 L268 54 L265 78 L269 80 L266 104 L268 106 L265 128 L267 148 L256 148 Z" fill="#e7e1d6" stroke={ACC} strokeWidth="1.2" />
        <Leader x={252} y={70} tx={276} ty={50} text="mortero" />
        <Leader x={262} y={110} tx={276} ty={124} text="laja" strong />
      </Inset>
    </g>
  );
}

function Skirting(_s: Spec<'skirting'>, c: SketchCtx) {
  const x0 = 12, x1 = 202, fy = 120, zh = 10;
  const pieces = 9;
  const pw = (x1 - x0) / pieces;
  return (
    <g>
      <rect x={x0} y={30} width={x1 - x0} height={fy - 30} fill="#fafaf9" stroke={SOFT} strokeWidth="0.7" />
      <rect x={120} y={46} width={34} height={fy - 46} fill="#ffffff" stroke={GHOST} strokeDasharray="3 2" />
      <T x={137} y={60} anchor="middle" size={7} color={SOFT}>puerta</T>
      {Array.from({ length: pieces }, (_, i) => {
        const px = x0 + i * pw;
        if (px + pw > 120 && px < 154) return null;
        return <rect key={i} x={px} y={fy - zh} width={pw - 0.8} height={zh} fill={ACC_FILL} stroke={ACC} strokeWidth="0.9" />;
      })}
      <line x1={x0} y1={fy} x2={x1} y2={fy} stroke={INK} strokeWidth="1.3" />
      <DimH x1={x0} x2={x1} y={fy + 14} label={c.lbl(0)} below />
      <T x={x0} y={22} size={7.5}>Vista del paramento · se descuentan las puertas</T>
      <Inset title="Corte">
        <rect x={270} y={24} width={30} height={110} fill={c.p('brick')} stroke={SOFT} strokeWidth="0.7" />
        <rect x={222} y={134} width={84} height={14} fill={c.p('concrete')} stroke={SOFT} strokeWidth="0.7" />
        <rect x={266} y={110} width={3} height={24} fill="#d1d5db" />
        <rect x={260} y={110} width={6} height={24} fill={ACC_FILL} stroke={ACC} strokeWidth="1.2" />
        <DimV x={252} y1={110} y2={134} label="10 cm" />
        <Leader x={263} y={116} tx={232} ty={90} text="zócalo" anchor="start" strong />
      </Inset>
    </g>
  );
}

// ─── Cubiertas ────────────────────────────────────────────────────────────────

function SlopedSection({ c, children, label }: { c: SketchCtx; children: React.ReactNode; label: string }) {
  return (
    <g>
      <rect x={12} y={112} width={10} height={40} fill="#f8fafc" stroke={GHOST} strokeDasharray="3 2" />
      <rect x={186} y={52} width={10} height={100} fill="#f8fafc" stroke={GHOST} strokeDasharray="3 2" />
      {children}
      <DimH x1={14} x2={194} y={160} label={`proyección: ${c.lbl(0)}`} />
      <line x1={14} y1={114} x2={58} y2={114} stroke={SOFT} strokeWidth="0.6" />
      <path d="M50 114 A 36 36 0 0 0 48.3 103" fill="none" stroke={MID} strokeWidth="0.8" />
      <T x={62} y={110} size={7}>pendiente</T>
      <T x={14} y={14} size={7.5}>{label}</T>
    </g>
  );
}

function SheetRoof(_s: Spec<'sheetRoof'>, c: SketchCtx) {
  const yAt = (x: number) => 114 - ((x - 14) * 60) / 186;
  const pts = [34, 64, 94, 124, 154, 184].map(x => [x, yAt(x)] as [number, number]);
  return (
    <g>
      <SlopedSection c={c} label="Corte en el sentido de la pendiente">
        {pts.map(([x, y], i) => <rect key={i} x={x - 4} y={y + 1.5} width={8} height={10} fill="#f8fafc" stroke={GHOST} strokeDasharray="2 1.5" />)}
        <line x1={14} y1={114} x2={200} y2={54} stroke={ACC} strokeWidth="2.6" />
        <line x1={100} y1={86.5} x2={132} y2={76.2} stroke={ACC} strokeWidth="2.6" transform="translate(0,-2.5)" />
        <Leader x={116} y={79} tx={110} ty={36} text="solape longitudinal" />
        <Leader x={94} y={yAt(94) + 8} tx={100} ty={136} text="correas (aparte)" ghost />
      </SlopedSection>
      <Inset title="Onda C25">
        <path d={Array.from({ length: 41 }, (_, i) => {
          const x = 222 + i * 2.15;
          const y = 80 + Math.sin((i / 40) * Math.PI * 6) * 9;
          return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
        }).join(' ')} fill="none" stroke={ACC} strokeWidth="2" />
        <line x1={240.5} y1={58} x2={240.5} y2={74} stroke={INK} strokeWidth="1.2" />
        <rect x={237} y={56} width={7} height={3} fill={INK} />
        <Leader x={240.5} y={66} tx={252} ty={40} text="tornillo en la cresta" />
        <T x={265} y={116} anchor="middle" size={7}>chapa galvanizada</T>
        <T x={265} y={130} anchor="middle" size={7} color={SOFT}>desarrollo &gt; proyección</T>
      </Inset>
    </g>
  );
}

function TileRoof(_s: Spec<'tileRoof'>, c: SketchCtx) {
  const n = 9;
  return (
    <g>
      <SlopedSection c={c} label="Corte en el sentido de la pendiente">
        <polygon points="14,120 200,60 200,52 14,112" fill={c.p('mud')} stroke={SOFT} strokeWidth="0.7" />
        {Array.from({ length: n }, (_, i) => {
          const t0 = i / n, t1 = (i + 1.25) / n;
          const x0 = 14 + 186 * t0, y0 = 112 - 60 * t0 - 2;
          const x1 = 14 + 186 * t1, y1 = 112 - 60 * t1 - 2;
          return <path key={i} d={`M${x0.toFixed(1)} ${y0.toFixed(1)} Q ${((x0 + x1) / 2).toFixed(1)} ${((y0 + y1) / 2 - 9).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`} fill={ACC_FILL} stroke={ACC} strokeWidth="1.1" />;
        })}
        <Leader x={100} y={88} tx={100} ty={136} text="torta de barro y cal" />
        <Leader x={130} y={67} tx={120} ty={30} text="teja cerámica" strong />
      </SlopedSection>
      <Inset title="Vista de frente">
        {[0, 1, 2].map(i => (
          <g key={i}>
            <path d={`M${228 + i * 28} 104 Q ${242 + i * 28} 122 ${256 + i * 28} 104`} fill="#f6c9ae" stroke="#b5714f" strokeWidth="0.9" />
          </g>
        ))}
        {[0, 1].map(i => (
          <path key={i} d={`M${244 + i * 28} 104 Q ${256 + i * 28} 84 ${268 + i * 28} 104`} fill="#efb595" stroke="#b5714f" strokeWidth="0.9" />
        ))}
        <T x={265} y={70} anchor="middle" size={7}>canal y cobija</T>
        <T x={265} y={136} anchor="middle" size={7} color={SOFT}>cumbreras: aparte</T>
      </Inset>
    </g>
  );
}

function Membrane(_s: Spec<'membrane'>, c: SketchCtx) {
  return (
    <g>
      <rect x={6} y={116} width={186} height={22} fill={c.p('concrete')} stroke={SOFT} strokeWidth="0.7" />
      <T x={12} y={148} size={7}>losa</T>
      <rect x={180} y={40} width={22} height={98} fill={c.p('brick')} stroke={SOFT} strokeWidth="0.7" />
      <polygon points="6,116 180,116 180,100 6,108" fill={c.p('sand')} stroke={GHOST} strokeDasharray="3 2" />
      <polyline points="6,107 180,99" fill="none" stroke="#1f2937" strokeWidth="0.9" />
      <polyline points="6,104 177,96 177,72" fill="none" stroke={ACC} strokeWidth="2.6" />
      <Leader x={50} y={112} tx={30} ty={150} text="carpeta de pendiente (aparte)" ghost />
      <Leader x={110} y={102} tx={80} ty={70} text="imprimación" />
      <Leader x={140} y={97} tx={120} ty={48} text="membrana 4 mm" strong />
      <Leader x={177} y={80} tx={150} ty={22} text="babeta 20 cm" />
      <Inset title="Solape">
        <rect x={226} y={70} width={60} height={14} fill={ACC_FILL} stroke={ACC} strokeWidth="1" />
        <rect x={262} y={78} width={46} height={14} fill="#bfdbfe" stroke={ACC} strokeWidth="1" />
        <DimH x1={262} x2={286} y={104} label="10 cm" below />
        <T x={265} y={46} anchor="middle" size={7}>soldada con soplete</T>
      </Inset>
    </g>
  );
}

function JoistSlab(_s: Spec<'joistSlab'>, c: SketchCtx) {
  const base = 128, bh = 30;
  const xs = [36, 86, 136, 186];
  return (
    <g>
      {xs.slice(0, 3).map((x, i) => (
        <g key={i}>
          <rect x={x + 6} y={base - bh} width={38} height={bh} fill="#f3d6c4" stroke="#b5714f" strokeWidth="0.8" />
          {[0, 1, 2].map(k => <rect key={k} x={x + 10 + k * 11.5} y={base - bh + 6} width={8} height={bh - 12} fill="#ffffff" stroke="#c48a6a" strokeWidth="0.5" />)}
        </g>
      ))}
      {xs.map((x, i) => (
        <path key={i} d={`M${x - 6} ${base} L${x + 6} ${base} L${x + 6} ${base - 4} L${x + 2} ${base - 4} L${x + 2} ${base - bh} L${x - 2} ${base - bh} L${x - 2} ${base - 4} L${x - 6} ${base - 4} Z`}
          fill="#d1d5db" stroke={INK} strokeWidth="0.9" />
      ))}
      <rect x={24} y={base - bh - 12} width={180} height={12} fill={c.p('concrete')} stroke={ACC} strokeWidth="1.2" />
      <line x1={26} y1={base - bh - 7} x2={202} y2={base - bh - 7} stroke={STEEL} strokeWidth="0.8" strokeDasharray="3 2" />
      <DimV x={16} y1={base - bh - 12} y2={base - bh} label="5" />
      <DimV x={16} y1={base - bh} y2={base} label="20" />
      <Leader x={36} y={base - 14} tx={30} ty={158} text="vigueta pretensada" />
      <Leader x={110} y={base - 20} tx={120} ty={146} text="bloque cerámico" />
      <Leader x={150} y={base - bh - 7} tx={60} ty={56} text="capa de compresión + malla" strong />
      <T x={24} y={20} size={7.5}>Corte transversal a las viguetas (cm)</T>
      <Inset title="Planta">
        {[0, 1, 2, 3].map(i => <line key={i} x1={232 + i * 22} y1={30} x2={232 + i * 22} y2={140} stroke={INK} strokeWidth="1.6" />)}
        {[0, 1, 2].map(i => [0, 1, 2, 3, 4].map(k => (
          <rect key={`${i}-${k}`} x={234 + i * 22} y={32 + k * 21.5} width={18} height={20} fill="#f3d6c4" stroke="#c48a6a" strokeWidth="0.5" />
        )))}
        <line x1={300} y1={140} x2={300} y2={34} stroke={MID} strokeWidth="0.8" markerEnd={c.arrow} />
        <T x={265} y={152} anchor="middle" size={7}>{c.lbl(0)} × {c.lbl(1)}</T>
      </Inset>
    </g>
  );
}

// ─── Aislaciones ──────────────────────────────────────────────────────────────

function Insulation(s: Spec<'insulation'>, c: SketchCtx) {
  if (s.type === 'lana') {
    return (
      <g>
        <path d={Array.from({ length: 41 }, (_, i) => `${i === 0 ? 'M' : 'L'}${(8 + i * 4.9).toFixed(1)} ${(40 + Math.sin(i * 0.9) * 3).toFixed(1)}`).join(' ')}
          fill="none" stroke={GHOST} strokeWidth="1.6" strokeDasharray="4 2" />
        {[30, 90, 150].map((x, i) => <rect key={i} x={x} y={44} width={12} height={12} fill="#f8fafc" stroke={GHOST} strokeDasharray="2 1.5" />)}
        <rect x={8} y={58} width={196} height={30} fill={c.p('insul')} stroke={ACC} strokeWidth="1.3" />
        <line x1={8} y1={90} x2={204} y2={90} stroke="#92400e" strokeWidth="1.4" />
        <rect x={8} y={112} width={196} height={8} fill="#f8fafc" stroke={GHOST} strokeDasharray="3 2" />
        <T x={10} y={24} size={7.5}>exterior</T>
        <T x={10} y={152} size={7.5}>interior (lado calefaccionado)</T>
        <Leader x={100} y={73} tx={110} ty={102} text="lana de vidrio 50 mm" strong />
        <Leader x={40} y={90} tx={20} ty={128} text="kraft (barrera de vapor)" />
        <Leader x={180} y={116} tx={130} ty={128} text="cielorraso (aparte)" ghost />
        <PlanInset c={c} a={c.v(0)} b={c.v(1)} la={c.lbl(0)} lb={c.lbl(1)} fill={c.p('insul')} />
      </g>
    );
  }
  if (s.type === 'film') {
    return (
      <g>
        <Ground c={c} x1={6} x2={206} y={110} />
        <line x1={6} y1={106} x2={118} y2={106} stroke={ACC} strokeWidth="2" />
        <line x1={92} y1={103} x2={206} y2={103} stroke={ACC} strokeWidth="2" />
        <rect x={6} y={70} width={200} height={30} fill={c.p('concrete')} stroke={GHOST} strokeDasharray="3 2" opacity="0.7" />
        <DimH x1={92} x2={118} y={124} label="solape 15 cm" below />
        <Leader x={40} y={106} tx={30} ty={150} text="film de polietileno 200 µm" strong />
        <Leader x={160} y={84} tx={110} ty={40} text="contrapiso o losa (aparte)" ghost />
        <PlanInset c={c} a={c.v(0)} b={c.v(1)} la={c.lbl(0)} lb={c.lbl(1)} fill="#eff6ff" />
      </g>
    );
  }
  return (
    <g>
      <Ground c={c} x1={6} x2={206} y={110} />
      <rect x={6} y={104} width={200} height={6} fill="#1f2937" stroke={ACC} strokeWidth="1.2" />
      <rect x={6} y={64} width={200} height={36} fill={c.p('rubble')} stroke={GHOST} strokeDasharray="3 2" opacity="0.7" />
      <Leader x={60} y={107} tx={40} ty={150} text="pintura asfáltica, 2 manos" strong />
      <Leader x={150} y={82} tx={140} ty={40} text="contrapiso (aparte)" ghost />
      <PlanInset c={c} a={c.v(0)} b={c.v(1)} la={c.lbl(0)} lb={c.lbl(1)} fill="#9ca3af" />
    </g>
  );
}

// ─── Cielorrasos ──────────────────────────────────────────────────────────────

function Ceiling(s: Spec<'ceiling'>, c: SketchCtx) {
  const slab = <rect x={6} y={22} width={200} height={24} fill={c.p('concrete')} stroke={SOFT} strokeWidth="0.7" />;
  if (s.type === 'aplicado') {
    return (
      <g>
        {slab}
        <rect x={6} y={46} width={200} height={7} fill="#fafaf9" stroke={ACC} strokeWidth="1.3" />
        <rect x={6} y={53} width={14} height={100} fill={c.p('brick')} stroke={SOFT} strokeWidth="0.7" />
        <rect x={192} y={53} width={14} height={100} fill={c.p('brick')} stroke={SOFT} strokeWidth="0.7" />
        <T x={30} y={34} size={7}>losa</T>
        <Leader x={100} y={50} tx={80} ty={90} text="revoque aplicado bajo losa" strong />
        <PlanInset c={c} a={c.v(0)} b={c.v(1)} la={c.lbl(0)} lb={c.lbl(1)} fill="#fafaf9" />
      </g>
    );
  }
  if (s.type === 'suspendido') {
    return (
      <g>
        {slab}
        {[30, 80, 130, 180].map((x, i) => <line key={i} x1={x} y1={46} x2={x} y2={98} stroke={GHOST} strokeWidth="1" strokeDasharray="3 2" />)}
        <line x1={10} y1={100} x2={202} y2={100} stroke={MID} strokeWidth="3" />
        {[18, 58, 98, 138, 178].map((x, i) => <rect key={i} x={x} y={102} width={8} height={6} fill="#e5e7eb" stroke={MID} strokeWidth="0.7" />)}
        <rect x={10} y={108} width={192} height={5} fill="#ffffff" stroke={ACC} strokeWidth="1.3" />
        <Leader x={80} y={70} tx={100} ty={64} text="cuelgues (aparte)" ghost />
        <Leader x={140} y={100} tx={150} ty={84} text="perfiles" />
        <Leader x={60} y={111} tx={40} ty={140} text="placa de yeso 12,5 mm" strong />
        <Inset title="Junta">
          <rect x={226} y={60} width={82} height={8} fill="#e5e7eb" stroke={MID} strokeWidth="0.8" />
          <rect x={226} y={70} width={40} height={8} fill="#ffffff" stroke={ACC} strokeWidth="1.1" />
          <rect x={268} y={70} width={40} height={8} fill="#ffffff" stroke={ACC} strokeWidth="1.1" />
          <line x1={263} y1={56} x2={263} y2={78} stroke={INK} strokeWidth="1" />
          <line x1={271} y1={56} x2={271} y2={78} stroke={INK} strokeWidth="1" />
          <path d="M256 82 Q 267 86 278 82" fill="none" stroke={MID} strokeWidth="1.4" />
          <Leader x={267} y={84} tx={250} ty={110} text="masilla y cinta" />
          <Leader x={263} y={60} tx={240} ty={40} text="tornillos" />
        </Inset>
      </g>
    );
  }
  return (
    <g>
      {[20, 80, 140].map((x, i) => <rect key={i} x={x} y={40} width={16} height={40} fill="#f8fafc" stroke={GHOST} strokeDasharray="3 2" />)}
      <rect x={8} y={80} width={196} height={8} fill={c.p('wood')} stroke={ACC} strokeWidth="1.3" />
      {Array.from({ length: 13 }, (_, i) => <line key={i} x1={8 + i * 15} y1={80} x2={8 + i * 15} y2={88} stroke="#b08968" strokeWidth="0.7" />)}
      <Leader x={88} y={50} tx={110} ty={30} text="tirantes (aparte)" ghost />
      <Leader x={60} y={86} tx={40} ty={130} text="machimbre de pino" strong />
      <Inset title="Encastre">
        <path d="M224 70 L262 70 L262 75 L270 75 L270 81 L262 81 L262 86 L224 86 Z" fill="#f5e1c0" stroke={ACC} strokeWidth="1" />
        <path d="M264 70 L308 70 L308 86 L264 86 L264 81 L272 81 L272 75 L264 75 Z" fill="#efd3a6" stroke={ACC} strokeWidth="1" />
        <T x={265} y={106} anchor="middle" size={7}>macho y hembra</T>
      </Inset>
    </g>
  );
}

// ─── Pinturas ─────────────────────────────────────────────────────────────────

function Paint(s: Spec<'paint'>, c: SketchCtx) {
  if (s.type === 'esmalte') {
    const { w, h } = fit(c.v(1), c.v(0), 90, 130, 60, 120);
    const x = 100 - w / 2, y = 150 - h;
    return (
      <g>
        <rect x={x - 6} y={y - 6} width={w + 12} height={h + 6} fill="#f8fafc" stroke={SOFT} strokeWidth="0.8" />
        <rect x={x} y={y} width={w} height={h} fill={ACC_FILL} stroke={ACC} strokeWidth="1.3" />
        <rect x={x + w * 0.15} y={y + h * 0.08} width={w * 0.7} height={h * 0.36} fill="none" stroke={ACC} strokeWidth="0.8" />
        <rect x={x + w * 0.15} y={y + h * 0.52} width={w * 0.7} height={h * 0.38} fill="none" stroke={ACC} strokeWidth="0.8" />
        <circle cx={x + w - 8} cy={y + h * 0.5} r="2.2" fill={MID} />
        <DimH x1={x} x2={x + w} y={y + h + 10} label={c.lbl(1)} below />
        <DimV x={x - 14} y1={y} y2={y + h} label={c.lbl(0)} />
        <Inset title="Desarrollo">
          <rect x={258} y={30} width={14} height={110} fill="#f5e1c0" stroke={SOFT} strokeWidth="0.7" />
          <path d="M256 30 L256 140 M274 30 L274 140" stroke={ACC} strokeWidth="2.2" />
          <line x1={256} y1={29} x2={274} y2={29} stroke={ACC} strokeWidth="2.2" />
          <T x={265} y={152} anchor="middle" size={7}>2 caras + cantos</T>
        </Inset>
      </g>
    );
  }
  const b = wallBox(c);
  const coats: Layer[] = s.type === 'cal'
    ? [
      { key: 'm1', label: '1ª mano', t: 4, fill: '#f5f5f4', target: true },
      { key: 'm2', label: '2ª mano', t: 4, fill: '#ffffff', target: true },
    ]
    : [
      { key: 'fi', label: s.type === 'exterior' ? 'fijador exterior' : 'fijador sellador', t: 3, fill: '#e0f2fe' },
      ...(s.type === 'interior' ? [{ key: 'en', label: 'enduido parcial', t: 3, fill: '#f5f5f4' } as Layer] : []),
      { key: 'm1', label: '1ª mano', t: 3, fill: s.type === 'exterior' ? '#fde68a' : '#c7d2fe', target: true },
      { key: 'm2', label: '2ª mano', t: 3, fill: s.type === 'exterior' ? '#fcd34d' : '#a5b4fc', target: true },
    ];
  const n = coats.length;
  return (
    <g>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={c.p('sand')} stroke={INK} strokeWidth="1" />
      {coats.map((l, i) => (
        <rect key={l.key} x={b.x} y={b.y} width={b.w * (0.85 - (0.6 / Math.max(n - 1, 1)) * i)} height={b.h}
          fill={l.fill} stroke={l.target ? ACC : SOFT} strokeWidth={l.target ? 1.1 : 0.6} />
      ))}
      {(() => {
        const rx = b.x + b.w * 0.25;
        return (
          <g>
            <rect x={rx - 9} y={b.y + b.h * 0.35} width={18} height={9} rx="2" fill="#ffffff" stroke={MID} strokeWidth="0.9" />
            <path d={`M${rx} ${b.y + b.h * 0.35 + 9} L${rx} ${b.y + b.h * 0.35 + 30}`} stroke={MID} strokeWidth="1.4" />
          </g>
        );
      })()}
      <WallDims c={c} b={b} />
      <Inset title="Capas">
        <rect x={222} y={28} width={26} height={120} fill={c.p('sand')} stroke={SOFT} strokeWidth="0.7" />
        <T x={235} y={156} anchor="middle" size={7}>revoque</T>
        <LayerStack x={248} y={28} w={120} horizontal labelX={268} layers={coats} />
      </Inset>
    </g>
  );
}

// ─── Instalaciones ────────────────────────────────────────────────────────────

function Pipe(s: Spec<'pipe'>, c: SketchCtx) {
  if (s.type === 'cloaca') {
    return (
      <g>
        <Ground c={c} x1={6} x2={206} y={36} />
        <polygon points="14,58 176,90 176,112 14,80" fill={c.p('sand')} />
        <line x1={14} y1={69} x2={176} y2={101} stroke={ACC_FILL} strokeWidth="9" />
        <line x1={14} y1={64.5} x2={176} y2={96.5} stroke={ACC} strokeWidth="1.3" />
        <line x1={14} y1={73.5} x2={176} y2={105.5} stroke={ACC} strokeWidth="1.3" />
        <line x1={50} y1={60} x2={110} y2={72} stroke={MID} strokeWidth="0.9" markerEnd={c.arrow} />
        <rect x={176} y={36} width={26} height={90} fill="#ffffff" stroke={GHOST} strokeDasharray="3 2" />
        <T x={189} y={46} anchor="middle" size={7} color={SOFT}>cámara</T>
        <T x={20} y={124} size={7.5} color={INK}>pendiente 1:20 a 1:60</T>
        <Leader x={130} y={102} tx={110} ty={136} text="cama de arena (aparte)" ghost />
        <DimH x1={14} x2={176} y={148} label={c.lbl(0)} below />
        <Inset title="Sección">
          <circle cx={265} cy={80} r={32} fill="#ffffff" stroke={ACC} strokeWidth="2.4" />
          <T x={265} y={80} anchor="middle" size={9} color={INK} bold>Ø 110</T>
          <T x={265} y={130} anchor="middle" size={7}>PVC sanitario</T>
        </Inset>
      </g>
    );
  }
  return (
    <g>
      <rect x={6} y={20} width={200} height={110} fill="#fafaf9" stroke={SOFT} strokeWidth="0.7" />
      <path d="M14 118 L120 118 L120 54 L196 54" fill="none" stroke={ACC} strokeWidth="4" strokeLinejoin="round" />
      <path d="M70 118 L70 78" fill="none" stroke={ACC} strokeWidth="4" />
      {[[120, 118], [120, 54], [70, 118]].map(([x, y], i) => <rect key={i} x={x - 5} y={y - 5} width={10} height={10} fill="#ffffff" stroke={INK} strokeWidth="1" />)}
      <circle cx={70} cy={72} r={5} fill="#ffffff" stroke={INK} strokeWidth="1" />
      <Leader x={120} y={54} tx={140} ty={36} text="codo" />
      <Leader x={70} y={118} tx={40} ty={100} text="te" />
      <Leader x={160} y={54} tx={160} ty={80} text={'caño PVC ¾"'} strong />
      <DimH x1={14} x2={196} y={146} label={c.lbl(0)} below />
      <Inset title="Sección">
        <circle cx={265} cy={80} r={22} fill="#ffffff" stroke={ACC} strokeWidth="3.4" />
        <T x={265} y={80} anchor="middle" size={8.5} color={INK} bold>Ø 20</T>
        <T x={265} y={124} anchor="middle" size={7}>agua fría</T>
      </Inset>
    </g>
  );
}

export function renderSketch(spec: TaskSketchSpec, c: SketchCtx): React.ReactNode {
  switch (spec.kind) {
    case 'excavation': return Excavation(spec, c);
    case 'fill': return Fill(spec, c);
    case 'grading': return Grading(spec, c);
    case 'leanConcrete': return LeanConcrete(spec, c);
    case 'concrete': return Concrete(spec, c);
    case 'slab': return Slab(spec, c);
    case 'beam': return Beam(spec, c);
    case 'column': return Column(spec, c);
    case 'footing': return Footing(spec, c);
    case 'brickWall': return BrickWall(spec, c);
    case 'hollowWall': return HollowWall(spec, c);
    case 'plaster': return Plaster(spec, c);
    case 'screed': return Screed(spec, c);
    case 'tileFloor': return TileFloor(spec, c);
    case 'wallTile': return WallTile(spec, c);
    case 'skirting': return Skirting(spec, c);
    case 'stoneWall': return StoneWall(spec, c);
    case 'sheetRoof': return SheetRoof(spec, c);
    case 'tileRoof': return TileRoof(spec, c);
    case 'membrane': return Membrane(spec, c);
    case 'joistSlab': return JoistSlab(spec, c);
    case 'insulation': return Insulation(spec, c);
    case 'ceiling': return Ceiling(spec, c);
    case 'paint': return Paint(spec, c);
    case 'pipe': return Pipe(spec, c);
  }
}

