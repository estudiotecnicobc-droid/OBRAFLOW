import { useEffect, useState, useSyncExternalStore } from 'react';
import { supabase } from '../../../services/supabaseClient';
import { projectsService } from '../../../services/projectsService';
import type { Project } from '../../../types';

const BUCKET = 'project-covers';
const MAX_SIDE = 1600;

// ── Portadas cambiadas en esta sesión (para verlas al instante en el panel y en la barra lateral)
const overrides = new Map<string, string>();
const listeners = new Set<() => void>();
let version = 0;
const subscribe = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };
const notify = () => { version++; listeners.forEach(fn => fn()); };

/** Valor de portada vigente de un proyecto: '' = ilustración por defecto. */
export function useCoverValue(project: Pick<Project, 'id' | 'coverImage'>): string {
  useSyncExternalStore(subscribe, () => version);
  return overrides.has(project.id) ? overrides.get(project.id)! : (project.coverImage ?? '');
}

// ── URLs firmadas de las fotos subidas (el bucket es privado)
const urlCache = new Map<string, { url: string; expires: number }>();

export function useCoverUrl(value: string): string | null {
  const path = value.startsWith('upload:') ? value.slice(7) : '';
  const cached = path ? urlCache.get(path) : undefined;
  const [url, setUrl] = useState<string | null>(cached && cached.expires > Date.now() ? cached.url : null);
  useEffect(() => {
    if (!path) { setUrl(null); return; }
    const c = urlCache.get(path);
    if (c && c.expires > Date.now()) { setUrl(c.url); return; }
    let alive = true;
    supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60).then(({ data }) => {
      if (!alive || !data?.signedUrl) return;
      urlCache.set(path, { url: data.signedUrl, expires: Date.now() + 55 * 60 * 1000 });
      setUrl(data.signedUrl);
    });
    return () => { alive = false; };
  }, [path]);
  return url;
}

/** Achica la foto a 1600 px de lado mayor y la pasa a JPEG. */
async function resize(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen.'))), 'image/jpeg', 0.85));
}

async function removeUpload(value?: string) {
  if (value?.startsWith('upload:')) await supabase.storage.from(BUCKET).remove([value.slice(7)]);
}

/** Guarda la portada elegida ('' = volver a la ilustración por defecto). */
export async function setCover(project: Pick<Project, 'id' | 'coverImage'>, value: string): Promise<void> {
  const previous = overrides.has(project.id) ? overrides.get(project.id) : project.coverImage;
  await projectsService.update(project.id, { coverImage: value });
  overrides.set(project.id, value);
  notify();
  if (previous && previous !== value) removeUpload(previous).catch(() => undefined);
}

/** Sube una foto y la deja como portada del proyecto. */
export async function uploadCover(project: Pick<Project, 'id' | 'coverImage' | 'organizationId'>, file: File): Promise<void> {
  if (!file.type.startsWith('image/')) throw new Error('El archivo tiene que ser una imagen.');
  const blob = await resize(file);
  const path = `${project.organizationId}/${project.id}/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(`No se pudo subir la foto: ${error.message}`);
  await setCover(project, `upload:${path}`);
}
