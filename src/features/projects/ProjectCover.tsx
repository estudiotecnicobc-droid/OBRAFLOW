import React, { useRef, useState } from 'react';
import { X, Upload, Loader2, Check, RotateCcw } from 'lucide-react';
import type { Project } from '../../../types';
import { COVER_PHOTOS, PresetArt, defaultPresetKey } from './covers';
import { setCover, uploadCover, useCoverUrl, useCoverValue } from './coverService';

type CoverProject = Pick<Project, 'id' | 'name' | 'coverImage' | 'organizationId'>;

/** Portada del proyecto: foto subida, ilustración elegida o la de por defecto. */
export const ProjectCover: React.FC<{ project: CoverProject; className?: string; size?: 'sm' | 'md' | 'lg' }> = ({ project, className = '', size }) => {
  const value = useCoverValue(project);
  const url = useCoverUrl(value);
  if (value.startsWith('upload:')) {
    return url
      ? <img src={url} alt={`Foto de ${project.name}`} className={`object-cover ${className}`} loading="lazy" />
      : <div className={`bg-slate-200 animate-pulse ${className}`} aria-label="Cargando foto" />;
  }
  const key = value.startsWith('preset:') ? value.slice(7) : defaultPresetKey(project.id);
  return <PresetArt presetKey={key} className={className} size={size} label={`Portada de ${project.name}`} />;
};

/** Ventana para elegir una ilustración, subir una foto o volver a la de por defecto. */
export const CoverPicker: React.FC<{ project: CoverProject; onClose: () => void }> = ({ project, onClose }) => {
  const value = useCoverValue(project);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const current = value.startsWith('preset:') ? value.slice(7) : value ? '' : defaultPresetKey(project.id);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setError('');
    try { await fn(); onClose(); } catch (e: any) { setError(e?.message ?? 'No se pudo guardar la portada.'); } finally { setBusy(null); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="cp-title"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h2 id="cp-title" className="font-bold text-slate-800">Portada del proyecto</h2>
            <p className="text-xs text-slate-500 truncate">{project.name}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="p-2 rounded-full hover:bg-slate-100 text-slate-500"><X size={18} /></button>
        </div>
        <div className="p-5 overflow-auto space-y-4">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => fileRef.current?.click()} disabled={!!busy}
              className="px-3 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-1 disabled:opacity-50">
              {busy === 'upload' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Subir una foto
            </button>
            {value && (
              <button onClick={() => run('reset', () => setCover(project, ''))} disabled={!!busy}
                className="px-3 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1 disabled:opacity-50">
                {busy === 'reset' ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Volver a la imagen por defecto
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) run('upload', () => uploadCover(project, f)); }} />
          </div>
          <p className="text-[11px] text-slate-400">JPG, PNG o WebP. La foto se achica sola antes de subirla y solo la ven los miembros de tu empresa.</p>
          {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">O elegí una imagen</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {COVER_PHOTOS.map(p => (
                <button key={p.key} onClick={() => run(p.key, () => setCover(project, `preset:${p.key}`))} disabled={!!busy}
                  aria-pressed={current === p.key}
                  className={`relative rounded-xl overflow-hidden border-2 text-left transition-all disabled:opacity-60 ${current === p.key ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200 hover:border-slate-400'}`}>
                  <PresetArt presetKey={p.key} size="sm" className="w-full h-20 block" />
                  <span className="block text-[11px] font-semibold text-slate-700 px-2 py-1 bg-white">{p.label}</span>
                  {current === p.key && <span className="absolute top-1 right-1 bg-blue-600 text-white rounded-full p-0.5"><Check size={12} /></span>}
                  {busy === p.key && <span className="absolute inset-0 bg-white/60 flex items-center justify-center"><Loader2 size={18} className="animate-spin text-blue-600" /></span>}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-slate-400">Fotos de Unsplash, de uso libre.</p>
        </div>
      </div>
    </div>
  );
};
