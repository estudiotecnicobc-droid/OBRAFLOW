import React from 'react';

export const INK = '#334155';
export const MID = '#64748b';
export const SOFT = '#94a3b8';
export const LINE = '#cbd5e1';
export const ACC = '#2563eb';
export const ACC_FILL = '#dbeafe';
export const STEEL = '#b91c1c';
export const GHOST = '#cbd5e1';

export type PatternName =
  | 'soil' | 'concrete' | 'sand' | 'brick' | 'hollow' | 'insul' | 'rubble' | 'stone' | 'mud' | 'wood';

export const pat = (uid: string, name: PatternName) => `url(#${uid}-${name})`;

export const Patterns: React.FC<{ uid: string }> = ({ uid }) => (
  <defs>
    <pattern id={`${uid}-soil`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="7" height="7" fill="#f3ede4" />
      <line x1="0" y1="0" x2="0" y2="7" stroke="#c4b29a" strokeWidth="1" />
    </pattern>
    <pattern id={`${uid}-concrete`} width="12" height="12" patternUnits="userSpaceOnUse">
      <rect width="12" height="12" fill="#eef0f3" />
      <circle cx="2.5" cy="3" r="0.8" fill="#9ca3af" />
      <circle cx="8.5" cy="8" r="0.7" fill="#9ca3af" />
      <polygon points="7,2 9,2.6 7.6,4" fill="#b6bcc6" />
      <polygon points="2,8 3.8,9.5 1.6,10.2" fill="#b6bcc6" />
    </pattern>
    <pattern id={`${uid}-sand`} width="6" height="6" patternUnits="userSpaceOnUse">
      <rect width="6" height="6" fill="#f7f1e3" />
      <circle cx="1.5" cy="1.5" r="0.55" fill="#cdb98f" />
      <circle cx="4.5" cy="4.2" r="0.5" fill="#cdb98f" />
    </pattern>
    <pattern id={`${uid}-brick`} width="26" height="8" patternUnits="userSpaceOnUse">
      <rect width="26" height="8" fill="#f2d8c9" />
      <line x1="0" y1="0" x2="26" y2="0" stroke="#c99a80" strokeWidth="0.8" />
      <line x1="0" y1="4" x2="26" y2="4" stroke="#c99a80" strokeWidth="0.8" />
      <line x1="0" y1="0" x2="0" y2="4" stroke="#c99a80" strokeWidth="0.8" />
      <line x1="13" y1="4" x2="13" y2="8" stroke="#c99a80" strokeWidth="0.8" />
    </pattern>
    <pattern id={`${uid}-hollow`} width="44" height="24" patternUnits="userSpaceOnUse">
      <rect width="44" height="24" fill="#f3d6c4" />
      <line x1="0" y1="0" x2="44" y2="0" stroke="#c48a6a" strokeWidth="0.9" />
      <line x1="0" y1="12" x2="44" y2="12" stroke="#c48a6a" strokeWidth="0.9" />
      <line x1="0" y1="0" x2="0" y2="12" stroke="#c48a6a" strokeWidth="0.9" />
      <line x1="22" y1="12" x2="22" y2="24" stroke="#c48a6a" strokeWidth="0.9" />
    </pattern>
    <pattern id={`${uid}-insul`} width="10" height="10" patternUnits="userSpaceOnUse">
      <rect width="10" height="10" fill="#fef3c7" />
      <polyline points="0,8 2.5,2 5,8 7.5,2 10,8" fill="none" stroke="#d97706" strokeWidth="0.7" />
    </pattern>
    <pattern id={`${uid}-rubble`} width="16" height="12" patternUnits="userSpaceOnUse">
      <rect width="16" height="12" fill="#eef0f3" />
      <polygon points="1,2 5,1 6,4 2,5" fill="#e3b49b" stroke="#c48a6a" strokeWidth="0.4" />
      <polygon points="9,6 14,5 13,9 10,10" fill="#e3b49b" stroke="#c48a6a" strokeWidth="0.4" />
      <polygon points="3,8 6,7.5 5.5,11 2.5,10.5" fill="#e8c2ad" stroke="#c48a6a" strokeWidth="0.4" />
      <circle cx="11" cy="2" r="0.6" fill="#9ca3af" />
    </pattern>
    <pattern id={`${uid}-stone`} width="44" height="32" patternUnits="userSpaceOnUse">
      <rect width="44" height="32" fill="#9ca3af" />
      <polygon points="1,1 17,2 15,12 2,13" fill="#e7e1d6" />
      <polygon points="19,1 43,1 42,10 18,11" fill="#ddd5c6" />
      <polygon points="1,15 12,15 13,31 1,31" fill="#d8d0c0" />
      <polygon points="15,14 30,13 31,24 16,25" fill="#e9e4da" />
      <polygon points="33,12 43,12 43,31 32,30" fill="#e2dbcd" />
      <polygon points="15,27 30,26 30,31 15,31" fill="#ddd5c6" />
    </pattern>
    <pattern id={`${uid}-mud`} width="8" height="8" patternUnits="userSpaceOnUse">
      <rect width="8" height="8" fill="#e8d5bd" />
      <circle cx="2" cy="2" r="0.7" fill="#b08968" />
      <circle cx="6" cy="5.5" r="0.6" fill="#b08968" />
    </pattern>
    <pattern id={`${uid}-wood`} width="30" height="6" patternUnits="userSpaceOnUse">
      <rect width="30" height="6" fill="#f5e1c0" />
      <path d="M0 3 Q 8 1.5 15 3 T 30 3" fill="none" stroke="#d4a373" strokeWidth="0.6" />
    </pattern>
    <marker id={`${uid}-arrow`} viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M0,0 L6,3 L0,6 z" fill={MID} />
    </marker>
  </defs>
);

interface TextProps {
  x: number; y: number; children: React.ReactNode;
  anchor?: 'start' | 'middle' | 'end'; size?: number; color?: string; bold?: boolean;
}

export const T: React.FC<TextProps> = ({ x, y, children, anchor = 'start', size = 8, color = MID, bold }) => (
  <text x={x} y={y} textAnchor={anchor} dominantBaseline="middle" fontSize={size}
    fill={color} fontFamily="system-ui, sans-serif" fontWeight={bold ? 600 : 400}>
    {children}
  </text>
);

export const DimH: React.FC<{ x1: number; x2: number; y: number; label: string; below?: boolean }> =
  ({ x1, x2, y, label, below }) => (
    <g>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={SOFT} strokeWidth="0.7" />
      <line x1={x1 - 2} y1={y + 2} x2={x1 + 2} y2={y - 2} stroke={MID} strokeWidth="0.9" />
      <line x1={x2 - 2} y1={y + 2} x2={x2 + 2} y2={y - 2} stroke={MID} strokeWidth="0.9" />
      {label && <T x={(x1 + x2) / 2} y={below ? y + 7 : y - 6} anchor="middle" color={INK}>{label}</T>}
    </g>
  );

export const DimV: React.FC<{ x: number; y1: number; y2: number; label: string; right?: boolean }> =
  ({ x, y1, y2, label, right }) => (
    <g>
      <line x1={x} y1={y1} x2={x} y2={y2} stroke={SOFT} strokeWidth="0.7" />
      <line x1={x - 2} y1={y1 + 2} x2={x + 2} y2={y1 - 2} stroke={MID} strokeWidth="0.9" />
      <line x1={x - 2} y1={y2 + 2} x2={x + 2} y2={y2 - 2} stroke={MID} strokeWidth="0.9" />
      {label && <T x={right ? x + 4 : x - 4} y={(y1 + y2) / 2} anchor={right ? 'start' : 'end'} color={INK}>{label}</T>}
    </g>
  );

export const Leader: React.FC<{
  x: number; y: number; tx: number; ty: number; text: string;
  anchor?: 'start' | 'end'; strong?: boolean; ghost?: boolean;
}> = ({ x, y, tx, ty, text, anchor = 'start', strong, ghost }) => (
  <g>
    <circle cx={x} cy={y} r="1.3" fill={strong ? ACC : MID} />
    <polyline points={`${x},${y} ${tx},${ty} ${anchor === 'start' ? tx + 3 : tx - 3},${ty}`}
      fill="none" stroke={strong ? ACC : SOFT} strokeWidth="0.7" />
    <T x={anchor === 'start' ? tx + 5 : tx - 5} y={ty} anchor={anchor}
      color={strong ? ACC : ghost ? SOFT : MID} bold={strong} size={7.2}>{text}</T>
  </g>
);

export const Inset: React.FC<{ x?: number; y?: number; w?: number; h?: number; title: string; children: React.ReactNode }> =
  ({ x = 214, y = 6, w = 118, h = 158, title, children }) => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="6" fill="#ffffff" stroke={LINE} strokeWidth="0.8" />
      <T x={x + 7} y={y + 9} size={7} color={SOFT} bold>{title.toUpperCase()}</T>
      {children}
    </g>
  );

export const Chip: React.FC<{ x: number; y: number; text: string; anchor?: 'start' | 'middle' }> =
  ({ x, y, text, anchor = 'start' }) => {
    const w = text.length * 4.6 + 10;
    const x0 = anchor === 'middle' ? x - w / 2 : x;
    return (
      <g>
        <rect x={x0} y={y - 6.5} width={w} height={13} rx="6.5" fill={ACC_FILL} stroke={ACC} strokeWidth="0.6" />
        <T x={x0 + w / 2} y={y} anchor="middle" color={ACC} bold size={7.5}>{text}</T>
      </g>
    );
  };

export function clamp(v: number, lo: number, hi: number) {
  return Math.min(Math.max(v, lo), hi);
}

/** Ajusta dos medidas reales a un rectángulo de dibujo conservando la proporción. */
export function fit(a: number, b: number, maxW: number, maxH: number, defW: number, defH: number, minFrac = 0.28) {
  if (!(a > 0) && !(b > 0)) return { w: defW, h: defH };
  const aa = a > 0 ? a : b * (defW / defH);
  const bb = b > 0 ? b : aa * (defH / defW);
  const k = Math.min(maxW / aa, maxH / bb);
  return { w: Math.max(aa * k, maxW * minFrac), h: Math.max(bb * k, maxH * minFrac) };
}

export const poly = (pts: [number, number][]) => pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

/** Placa en perspectiva caballera: cara superior, frente y lateral derecho. */
export const Plate: React.FC<{
  x: number; y: number; L: number; D: number; t: number;
  top: string; front: string; side?: string; stroke?: string; dashed?: boolean;
}> = ({ x, y, L, D, t, top, front, side, stroke = INK, dashed }) => {
  const dx = D * 0.72, dy = -D * 0.42;
  const dash = dashed ? '3 2' : undefined;
  return (
    <g>
      <polygon points={poly([[x + L, y], [x + L + dx, y + dy], [x + L + dx, y + dy + t], [x + L, y + t]])}
        fill={side ?? front} stroke={stroke} strokeWidth="0.8" strokeDasharray={dash} />
      <rect x={x} y={y} width={L} height={t} fill={front} stroke={stroke} strokeWidth="1" strokeDasharray={dash} />
      <polygon points={poly([[x, y], [x + L, y], [x + L + dx, y + dy], [x + dx, y + dy]])}
        fill={top} stroke={stroke} strokeWidth="1" strokeDasharray={dash} />
    </g>
  );
};

export const plateOffset = (D: number) => ({ dx: D * 0.72, dy: -D * 0.42 });
