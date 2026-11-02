/**
 * TaskSketch — esquemas técnicos SVG con proporciones dinámicas.
 * Las dimensiones del dibujo se actualizan en tiempo real según los valores ingresados.
 */

import React, { useId } from 'react';
import { ChandiasTask, ChandiasTaskDim } from './catalog/chandiasCatalog';
import { Patterns, pat } from './sketches/primitives';
import { renderSketch, SketchCtx } from './sketches/drawings';

interface TaskSketchProps {
  task: ChandiasTask;
  dimValues: Record<string, string>;
}

// ─── Proyección oblicua cabinet (30°, 45% escorzo) ───────────────────────────

const DDX = Math.cos(Math.PI / 6) * 0.45;  // ~0.39
const DDY = -Math.sin(Math.PI / 6) * 0.45; // ~-0.225

const poly = (coords: [number, number][]) =>
  coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

function clamp(v: number, lo: number, hi: number) { return Math.min(Math.max(v, lo), hi); }

// ─── Formateo de etiquetas ────────────────────────────────────────────────────

function dimLabel(dim: ChandiasTaskDim | undefined, dimValues: Record<string, string>): string {
  if (!dim) return '';
  const raw = dimValues[dim.id] ?? '';
  const v = parseFloat(raw);
  if (!isNaN(v) && v > 0) {
    const s = v % 1 === 0 ? String(v) : parseFloat(v.toFixed(2)).toString().replace('.', ',');
    return `${s} ${dim.unit}`;
  }
  return dim.label;
}

// ─── Cálculo de dimensiones SVG proporcionales ───────────────────────────────

/** Parsea los primeros N dims y retorna valores numéricos (0 si vacío) */
function parseVals(dims: ChandiasTaskDim[], dimValues: Record<string, string>, n = 3): number[] {
  return dims.slice(0, n).map(d => Math.max(0, parseFloat(dimValues[d.id] ?? '') || 0));
}

/**
 * Box 3D: dim[0]=largo→W, dim[1]=ancho→D, dim[2]=alto→H
 * Rangos SVG: W[40..110], H[22..75], D[18..60]
 */
function boxDims(dims: ChandiasTaskDim[], dv: Record<string, string>) {
  const [v0, v1, v2] = parseVals(dims, dv);
  const anySet = v0 + v1 + v2 > 0;
  if (!anySet) return { W: 82, H: 52, D: 42 };
  const ref = Math.max(v0, v1, v2, 0.01);
  const n0 = v0 > 0 ? clamp(v0 / ref, 0.25, 1) : 0.65;
  const n1 = v1 > 0 ? clamp(v1 / ref, 0.2,  1) : 0.45;
  const n2 = v2 > 0 ? clamp(v2 / ref, 0.2,  1) : 0.52;
  return {
    W: Math.round(40 + n0 * 70),   // 40..110
    H: Math.round(22 + n2 * 53),   // 22..75
    D: Math.round(18 + n1 * 42),   // 18..60
  };
}

/**
 * Column: dim[0]=largo(height)→H, dim[1]=ancho(sect-w)→W, dim[2]=alto(sect-d)→D
 * Rangos: H[45..100], W[18..52], D[18..42]
 */
function columnDims(dims: ChandiasTaskDim[], dv: Record<string, string>) {
  const [h, w, dep] = parseVals(dims, dv);
  const anySet = h + w + dep > 0;
  if (!anySet) return { W: 40, H: 85, D: 34 };
  const maxSect = Math.max(w, dep, 0.01);
  const sectRef = Math.max(h * 0.05, maxSect, 0.01); // section al menos 5% de la altura
  const ratioH  = h > 0 ? Math.min(h / sectRef, 20) : 10;
  const W  = Math.round(clamp(18 + (w / sectRef) * 26, 18, 52));
  const D  = Math.round(clamp(18 + (dep / sectRef) * 20, 18, 42));
  const H  = Math.round(45 + (ratioH / 20) * 55); // 45..100
  return { W, H, D };
}

/**
 * Wall: dim[0]=ancho→W, dim[1]=alto→H
 * Rangos: W[55..135], H[32..90]
 */
function wallDims(dims: ChandiasTaskDim[], dv: Record<string, string>) {
  const [v0, v1] = parseVals(dims, dv, 2);
  if (v0 + v1 === 0) return { W: 108, H: 72 };
  const ref = Math.max(v0, v1, 0.01);
  const n0 = v0 > 0 ? clamp(v0 / ref, 0.3, 1) : 0.65;
  const n1 = v1 > 0 ? clamp(v1 / ref, 0.3, 1) : 0.6;
  return {
    W: Math.round(55 + n0 * 80),  // 55..135
    H: Math.round(32 + n1 * 58),  // 32..90
  };
}

/**
 * Floor: dim[0]=largo→L, dim[1]=ancho→Wd
 * Rangos: L[50..125], Wd[22..70]
 */
function floorDims(dims: ChandiasTaskDim[], dv: Record<string, string>) {
  const [v0, v1] = parseVals(dims, dv, 2);
  if (v0 + v1 === 0) return { L: 105, Wd: 58 };
  const ref = Math.max(v0, v1, 0.01);
  const n0 = v0 > 0 ? clamp(v0 / ref, 0.3, 1) : 0.65;
  const n1 = v1 > 0 ? clamp(v1 / ref, 0.2, 1) : 0.5;
  return {
    L:  Math.round(50 + n0 * 75),  // 50..125
    Wd: Math.round(22 + n1 * 48),  // 22..70
  };
}

// ─── Primitivos SVG ───────────────────────────────────────────────────────────

const FACE_FRONT  = '#ffffff';
const FACE_TOP    = '#f1f5f9';
const FACE_SIDE   = '#e2e8f0';
const STROKE_MAIN = '#475569';
const STROKE_SOFT = '#94a3b8';
const TEXT_MAIN   = '#475569';
const TEXT_SOFT   = '#94a3b8';

function Box3D({ W, H, D, ox, oy, lW, lD, lH }:
  { W: number; H: number; D: number; ox: number; oy: number;
    lW: string; lD: string; lH: string }) {
  const rf: [number, number][] = [
    [ox + W,           oy],
    [ox + W + D * DDX, oy + D * DDY],
    [ox + W + D * DDX, oy - H + D * DDY],
    [ox + W,           oy - H],
  ];
  const tf: [number, number][] = [
    [ox,               oy - H],
    [ox + W,           oy - H],
    [ox + W + D * DDX, oy - H + D * DDY],
    [ox + D * DDX,     oy - H + D * DDY],
  ];
  return (
    <g>
      <polygon points={poly(rf)} fill={FACE_SIDE} stroke={STROKE_SOFT} strokeWidth="0.9" />
      <polygon points={poly(tf)} fill={FACE_TOP}  stroke={STROKE_SOFT} strokeWidth="0.9" />
      <rect x={ox} y={oy - H} width={W} height={H} fill={FACE_FRONT} stroke={STROKE_MAIN} strokeWidth="1.4" />
      {/* ancho (W) */}
      {lW && (
        <text x={ox + W / 2} y={oy + 14} textAnchor="middle" fontSize="8.5" fill={TEXT_MAIN} fontFamily="sans-serif">{lW}</text>
      )}
      {/* alto (H) */}
      {lH && (
        <text x={ox - 4} y={oy - H / 2} textAnchor="end" dominantBaseline="middle" fontSize="8.5" fill={TEXT_MAIN} fontFamily="sans-serif">{lH}</text>
      )}
      {/* profundidad / ancho (D) */}
      {lD && (
        <text x={ox + W + D * DDX * 0.55 + 4} y={oy - H + D * DDY * 0.35}
          fontSize="8" fill={TEXT_SOFT} fontFamily="sans-serif">{lD}</text>
      )}
    </g>
  );
}

function Column3D({ W, H, D, ox, oy, lH, lW, lD }:
  { W: number; H: number; D: number; ox: number; oy: number;
    lH: string; lW: string; lD: string }) {
  const rf: [number, number][] = [
    [ox + W,           oy],
    [ox + W + D * DDX, oy + D * DDY],
    [ox + W + D * DDX, oy - H + D * DDY],
    [ox + W,           oy - H],
  ];
  const tf: [number, number][] = [
    [ox,               oy - H],
    [ox + W,           oy - H],
    [ox + W + D * DDX, oy - H + D * DDY],
    [ox + D * DDX,     oy - H + D * DDY],
  ];
  return (
    <g>
      <polygon points={poly(rf)} fill={FACE_SIDE} stroke={STROKE_SOFT} strokeWidth="0.9" />
      <polygon points={poly(tf)} fill={FACE_TOP}  stroke={STROKE_SOFT} strokeWidth="0.9" />
      <rect x={ox} y={oy - H} width={W} height={H} fill={FACE_FRONT} stroke={STROKE_MAIN} strokeWidth="1.4" />
      {lH && (
        <text x={ox - 4} y={oy - H / 2} textAnchor="end" dominantBaseline="middle" fontSize="8.5" fill={TEXT_MAIN} fontFamily="sans-serif">{lH}</text>
      )}
      {lW && (
        <text x={ox + W / 2} y={oy + 13} textAnchor="middle" fontSize="8.5" fill={TEXT_MAIN} fontFamily="sans-serif">{lW}</text>
      )}
      {lD && (
        <text x={ox + W + D * DDX * 0.6 + 4} y={oy - H + D * DDY * 0.4}
          fontSize="8" fill={TEXT_SOFT} fontFamily="sans-serif">{lD}</text>
      )}
    </g>
  );
}

function WallFace({ W, H, ox, oy, lW, lH }:
  { W: number; H: number; ox: number; oy: number; lW: string; lH: string }) {
  const rows = 5;
  const rH   = H / rows;
  return (
    <g>
      <rect x={ox} y={oy - H} width={W} height={H} fill="#fafafa" stroke={STROKE_MAIN} strokeWidth="1.4" />
      {Array.from({ length: rows - 1 }, (_, i) => (
        <line key={`h${i}`}
          x1={ox} y1={oy - rH * (i + 1)} x2={ox + W} y2={oy - rH * (i + 1)}
          stroke="#cbd5e1" strokeWidth="0.6" />
      ))}
      {Array.from({ length: rows }, (_, i) => {
        const offset = (i % 2) * (W / 4);
        return ([W / 2, W] as number[]).map((x, j) => (
          <line key={`v${i}-${j}`}
            x1={ox + ((x + offset) % W)} y1={oy - rH * i}
            x2={ox + ((x + offset) % W)} y2={oy - rH * (i + 1)}
            stroke="#cbd5e1" strokeWidth="0.6" />
        ));
      })}
      {lW && (
        <text x={ox + W / 2} y={oy + 14} textAnchor="middle" fontSize="8.5" fill={TEXT_MAIN} fontFamily="sans-serif">{lW}</text>
      )}
      {lH && (
        <text x={ox - 4} y={oy - H / 2} textAnchor="end" dominantBaseline="middle" fontSize="8.5" fill={TEXT_MAIN} fontFamily="sans-serif">{lH}</text>
      )}
    </g>
  );
}

function FloorTop({ L, Wd, ox, oy, lL, lWd }:
  { L: number; Wd: number; ox: number; oy: number; lL: string; lWd: string }) {
  const dxD = DDX * Wd;
  const dyD = DDY * Wd;
  const tf: [number, number][] = [
    [ox,      oy],
    [ox + L,  oy],
    [ox + L + dxD, oy + dyD],
    [ox + dxD,     oy + dyD],
  ];
  return (
    <g>
      <polygon points={poly(tf)} fill="#f8fafc" stroke={STROKE_MAIN} strokeWidth="1.4" />
      {[L / 4, L / 2, 3 * L / 4].map((dx, i) => (
        <line key={i}
          x1={ox + dx} y1={oy}
          x2={ox + dx + dxD} y2={oy + dyD}
          stroke="#e2e8f0" strokeWidth="0.8" />
      ))}
      {[Wd / 3, 2 * Wd / 3].map((f, i) => (
        <line key={i}
          x1={ox + f * DDX} y1={oy + f * DDY}
          x2={ox + L + f * DDX} y2={oy + f * DDY}
          stroke="#e2e8f0" strokeWidth="0.8" />
      ))}
      {lL && (
        <text x={ox + L / 2} y={oy + 14} textAnchor="middle" fontSize="8.5" fill={TEXT_MAIN} fontFamily="sans-serif">{lL}</text>
      )}
      {lWd && (
        <text x={ox + L + dxD + 4} y={oy + dyD / 2} dominantBaseline="middle"
          fontSize="8" fill={TEXT_SOFT} fontFamily="sans-serif">{lWd}</text>
      )}
    </g>
  );
}

// ─── Variantes y mapeo ────────────────────────────────────────────────────────

type SketchVariant = 'box3d' | 'column3d' | 'wall' | 'floor';

function getVariant(task: ChandiasTask): SketchVariant {
  if (task.structuralConfig?.sketchVariant) return task.structuralConfig.sketchVariant;
  const cat = task.categoria;
  if (['Mampostería', 'Revoques', 'Pinturas', 'Revestimientos', 'Cielorrasos'].includes(cat)) return 'wall';
  if (['Contrapisos y Pisos', 'Cubiertas', 'Aislaciones'].includes(cat)) return 'floor';
  return 'box3d';
}

// ─── Componente principal ─────────────────────────────────────────────────────

export const TaskSketch: React.FC<TaskSketchProps> = ({ task, dimValues }) => {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  if (task.sketch) {
    const ctx: SketchCtx = {
      uid,
      lbl: i => dimLabel(task.dims[i], dimValues).replace(/\s*\(.*?\)/g, ''),
      v: i => {
        const d = task.dims[i];
        const n = d ? parseFloat(dimValues[d.id] ?? '') : NaN;
        return Number.isFinite(n) && n > 0 ? n : 0;
      },
      p: name => pat(uid, name),
      arrow: `url(#${uid}-arrow)`,
    };
    return (
      <svg viewBox="0 0 336 170" className="w-full max-w-[440px] mx-auto block" role="img" aria-label={`Esquema: ${task.nombre}`}>
        <Patterns uid={uid} />
        {renderSketch(task.sketch, ctx)}
      </svg>
    );
  }
  return <LegacySketch task={task} dimValues={dimValues} />;
};

const LegacySketch: React.FC<TaskSketchProps> = ({ task, dimValues }) => {
  const variant = getVariant(task);
  const d = task.dims;
  const lbl = (i: number) => dimLabel(d[i], dimValues);

  if (variant === 'box3d') {
    const { W, H, D } = boxDims(d, dimValues);
    // ox/oy: dejar espacio para etiquetas izquierda (~16px) y abajo (~18px), arriba (~15px)
    // Max extent right: ox + W + D*DDX; max top: oy - H + D*DDY
    const ox = 38, oy = 108;
    return (
      <svg viewBox="0 0 200 130" className="w-full max-w-[200px] mx-auto block" aria-hidden="true">
        <Box3D W={W} H={H} D={D} ox={ox} oy={oy} lW={lbl(0)} lD={lbl(1)} lH={lbl(2)} />
      </svg>
    );
  }

  if (variant === 'column3d') {
    const { W, H, D } = columnDims(d, dimValues);
    const ox = 72, oy = 116;
    return (
      <svg viewBox="0 0 200 130" className="w-full max-w-[200px] mx-auto block" aria-hidden="true">
        <Column3D W={W} H={H} D={D} ox={ox} oy={oy} lH={lbl(0)} lW={lbl(1)} lD={lbl(2)} />
      </svg>
    );
  }

  if (variant === 'wall') {
    const { W, H } = wallDims(d, dimValues);
    const ox = Math.round((200 - W) / 2 - 8); // centra horizontalmente con margen izq
    const oy = 108;
    return (
      <svg viewBox="0 0 200 130" className="w-full max-w-[200px] mx-auto block" aria-hidden="true">
        <WallFace W={W} H={H} ox={Math.max(ox, 32)} oy={oy} lW={lbl(0)} lH={lbl(1)} />
      </svg>
    );
  }

  // floor
  const { L, Wd } = floorDims(d, dimValues);
  const ox = 14, oy = 92;
  return (
    <svg viewBox="0 0 200 130" className="w-full max-w-[200px] mx-auto block" aria-hidden="true">
      <FloorTop L={L} Wd={Wd} ox={ox} oy={oy} lL={lbl(0)} lWd={lbl(1)} />
    </svg>
  );
};
