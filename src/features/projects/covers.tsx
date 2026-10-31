import React from 'react';

/** Ilustraciones de respaldo (si una foto no carga). */
export interface CoverPreset {
  key: string;
  label: string;
  sky: [string, string];
  render: () => React.ReactNode;
}

const ground = (fill: string) => <rect x="0" y="150" width="400" height="50" fill={fill} />;

const COVER_PRESETS: CoverPreset[] = [
  {
    key: 'casa', label: 'Casa', sky: ['#bfdbfe', '#eff6ff'],
    render: () => (
      <>
        {ground('#86efac')}
        <rect x="120" y="95" width="160" height="60" fill="#f8fafc" stroke="#334155" strokeWidth="2" />
        <polygon points="105,98 200,45 295,98" fill="#b45309" stroke="#334155" strokeWidth="2" />
        <rect x="185" y="115" width="30" height="40" fill="#92400e" />
        <rect x="140" y="110" width="30" height="22" fill="#7dd3fc" stroke="#334155" />
        <rect x="230" y="110" width="30" height="22" fill="#7dd3fc" stroke="#334155" />
        <circle cx="330" cy="135" r="18" fill="#22c55e" /><rect x="327" y="140" width="6" height="15" fill="#78350f" />
      </>
    ),
  },
  {
    key: 'edificio', label: 'Edificio', sky: ['#c7d2fe', '#eef2ff'],
    render: () => (
      <>
        {ground('#cbd5e1')}
        <rect x="150" y="30" width="100" height="125" fill="#e2e8f0" stroke="#334155" strokeWidth="2" />
        {[0, 1, 2, 3, 4].map(r => [0, 1, 2].map(c => (
          <rect key={`${r}${c}`} x={162 + c * 28} y={42 + r * 22} width="18" height="13" fill="#93c5fd" />
        )))}
        <rect x="80" y="85" width="60" height="70" fill="#f1f5f9" stroke="#334155" strokeWidth="2" />
        <rect x="260" y="70" width="70" height="85" fill="#f1f5f9" stroke="#334155" strokeWidth="2" />
      </>
    ),
  },
  {
    key: 'obra', label: 'Obra en construcción', sky: ['#fde68a', '#fffbeb'],
    render: () => (
      <>
        {ground('#d6a96b')}
        <rect x="130" y="70" width="140" height="85" fill="none" stroke="#475569" strokeWidth="3" />
        <line x1="130" y1="112" x2="270" y2="112" stroke="#475569" strokeWidth="3" />
        <line x1="177" y1="70" x2="177" y2="155" stroke="#475569" strokeWidth="3" />
        <line x1="223" y1="70" x2="223" y2="155" stroke="#475569" strokeWidth="3" />
        <rect x="130" y="112" width="47" height="43" fill="#f97316" opacity="0.5" />
        <line x1="320" y1="155" x2="320" y2="30" stroke="#eab308" strokeWidth="5" />
        <line x1="250" y1="35" x2="360" y2="35" stroke="#eab308" strokeWidth="5" />
        <line x1="280" y1="35" x2="280" y2="60" stroke="#334155" strokeWidth="1.5" />
        <rect x="272" y="60" width="16" height="10" fill="#64748b" />
      </>
    ),
  },
  {
    key: 'remodelacion', label: 'Remodelación interior', sky: ['#fbcfe8', '#fdf2f8'],
    render: () => (
      <>
        <rect x="0" y="0" width="400" height="200" fill="#fce7f3" />
        <rect x="0" y="150" width="400" height="50" fill="#d6b48a" />
        <rect x="60" y="40" width="110" height="80" fill="#e0f2fe" stroke="#334155" strokeWidth="2" />
        <line x1="115" y1="40" x2="115" y2="120" stroke="#334155" strokeWidth="2" />
        <rect x="230" y="100" width="40" height="50" fill="#f8fafc" stroke="#334155" strokeWidth="2" />
        <line x1="250" y1="100" x2="300" y2="55" stroke="#64748b" strokeWidth="3" />
        <rect x="292" y="40" width="40" height="18" rx="4" fill="#ec4899" />
        <rect x="300" y="125" width="40" height="25" fill="#94a3b8" />
      </>
    ),
  },
  {
    key: 'local', label: 'Local comercial', sky: ['#a7f3d0', '#ecfdf5'],
    render: () => (
      <>
        {ground('#cbd5e1')}
        <rect x="90" y="55" width="220" height="100" fill="#f8fafc" stroke="#334155" strokeWidth="2" />
        <rect x="90" y="55" width="220" height="22" fill="#059669" />
        {[0, 1, 2, 3, 4, 5, 6].map(i => <rect key={i} x={90 + i * 31.4} y="77" width="15.7" height="10" fill="#34d399" />)}
        <rect x="110" y="98" width="110" height="57" fill="#bae6fd" stroke="#334155" />
        <rect x="240" y="98" width="45" height="57" fill="#64748b" />
      </>
    ),
  },
  {
    key: 'industrial', label: 'Nave industrial', sky: ['#e2e8f0', '#f8fafc'],
    render: () => (
      <>
        {ground('#a3a3a3')}
        <polygon points="60,155 60,85 140,60 220,85 220,155" fill="#cbd5e1" stroke="#334155" strokeWidth="2" />
        <polygon points="220,155 220,85 300,60 360,85 360,155" fill="#e2e8f0" stroke="#334155" strokeWidth="2" />
        <rect x="110" y="110" width="60" height="45" fill="#64748b" />
        {[0, 1, 2, 3].map(i => <line key={i} x1="110" y1={116 + i * 10} x2="170" y2={116 + i * 10} stroke="#94a3b8" />)}
        <rect x="270" y="110" width="40" height="45" fill="#64748b" />
        <rect x="70" y="30" width="12" height="55" fill="#94a3b8" />
      </>
    ),
  },
  {
    key: 'fachada', label: 'Frente y medianera', sky: ['#bae6fd', '#f0f9ff'],
    render: () => (
      <>
        {ground('#cbd5e1')}
        <rect x="140" y="20" width="120" height="135" fill="#fed7aa" stroke="#334155" strokeWidth="2" />
        {[0, 1, 2, 3].map(r => (
          <g key={r}>
            <rect x="155" y={32 + r * 30} width="35" height="20" fill="#e0f2fe" stroke="#334155" />
            <rect x="210" y={32 + r * 30} width="35" height="20" fill="#e0f2fe" stroke="#334155" />
            <line x1="150" y1={55 + r * 30} x2="250" y2={55 + r * 30} stroke="#334155" />
          </g>
        ))}
        <rect x="260" y="40" width="70" height="115" fill="#e5e7eb" stroke="#334155" strokeWidth="2" />
        <line x1="295" y1="10" x2="295" y2="60" stroke="#334155" />
        <rect x="285" y="60" width="20" height="8" fill="#f59e0b" />
      </>
    ),
  },
  {
    key: 'terreno', label: 'Terreno', sky: ['#bbf7d0', '#f0fdf4'],
    render: () => (
      <>
        <rect x="0" y="120" width="400" height="80" fill="#a3e635" />
        <polygon points="0,120 120,80 220,115 320,70 400,100 400,120" fill="#65a30d" />
        <rect x="140" y="135" width="140" height="45" fill="none" stroke="#f8fafc" strokeWidth="2" strokeDasharray="6 4" />
        <line x1="140" y1="135" x2="140" y2="118" stroke="#334155" strokeWidth="2" />
        <polygon points="140,118 155,123 140,128" fill="#dc2626" />
        <circle cx="330" cy="40" r="16" fill="#facc15" />
      </>
    ),
  },
];

const SVG_MAP = new Map(COVER_PRESETS.map(p => [p.key, p]));

/** Fotos de portada (Unsplash, licencia libre). Si una foto no carga, se muestra la ilustración de respaldo. */
export interface CoverPhoto {
  key: string;
  label: string;
  photo: string;
  /** Ilustración de respaldo. */
  fallback: string;
}

export const COVER_PHOTOS: CoverPhoto[] = [
  { key: 'casa', label: 'Casa', photo: 'photo-1783125127199-860da9744dcc', fallback: 'casa' },
  { key: 'edificio', label: 'Edificio de departamentos', photo: 'photo-1612637968894-660373e23b03', fallback: 'edificio' },
  { key: 'obra', label: 'Obra en construcción', photo: 'photo-1429497419816-9ca5cfb4571a', fallback: 'obra' },
  { key: 'remodelacion', label: 'Remodelación en curso', photo: 'photo-1736182615481-3795ea557614', fallback: 'remodelacion' },
  { key: 'interior', label: 'Interior terminado', photo: 'photo-1649083048337-4aeb6dda80bb', fallback: 'remodelacion' },
  { key: 'local', label: 'Local comercial', photo: 'photo-1528698827591-e19ccd7bc23d', fallback: 'local' },
  { key: 'industrial', label: 'Nave industrial', photo: 'photo-1759310347467-578dfd846229', fallback: 'industrial' },
  { key: 'fachada', label: 'Frente de edificio', photo: 'photo-1782896193190-2e97504a9f7e', fallback: 'fachada' },
  { key: 'restauracion', label: 'Restauración de fachada', photo: 'photo-1458022799175-1eb17cf09d90', fallback: 'fachada' },
  { key: 'terreno', label: 'Terreno', photo: 'photo-1647893168443-6322905c938b', fallback: 'terreno' },
];

const PHOTO_MAP = new Map(COVER_PHOTOS.map(p => [p.key, p]));

const photoUrl = (id: string, w: number) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&h=${Math.round(w / 2)}&q=75`;

/** Portada por defecto: siempre la misma para cada proyecto. */
export function defaultPresetKey(projectId: string): string {
  let h = 2166136261;
  for (const ch of projectId) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return COVER_PHOTOS[h % COVER_PHOTOS.length].key;
}

const SvgArt: React.FC<{ svgKey: string; className?: string; label: string }> = ({ svgKey, className, label }) => {
  const p = SVG_MAP.get(svgKey) ?? COVER_PRESETS[0];
  const gid = `sky-${p.key}`;
  return (
    <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" className={className} role="img" aria-label={label}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.sky[0]} />
          <stop offset="1" stopColor={p.sky[1]} />
        </linearGradient>
      </defs>
      <rect width="400" height="200" fill={`url(#${gid})`} />
      {p.render()}
    </svg>
  );
};

export const PresetArt: React.FC<{ presetKey: string; className?: string; label?: string; size?: 'sm' | 'md' | 'lg' }> = ({ presetKey, className, label, size = 'md' }) => {
  const photo = PHOTO_MAP.get(presetKey);
  const [failed, setFailed] = React.useState(false);
  const alt = label ?? photo?.label ?? SVG_MAP.get(presetKey)?.label ?? 'Portada';
  if (!photo || failed) return <SvgArt svgKey={photo?.fallback ?? presetKey} className={className} label={alt} />;
  const w = size === 'sm' ? 240 : size === 'lg' ? 1600 : 800;
  return (
    <img
      src={photoUrl(photo.photo, w)}
      srcSet={`${photoUrl(photo.photo, w)} 1x, ${photoUrl(photo.photo, w * 2)} 2x`}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`object-cover bg-slate-200 ${className ?? ''}`}
    />
  );
};
