// Estado de la obra de ejemplo por empresa, sin migraciones:
// · en los datos del usuario de Supabase (user_metadata.obraflow_demo[orgId]) queda si ya se ofreció,
//   para que la creación automática no la vuelva a crear si el usuario la borró;
// · en sessionStorage queda la carga pendiente entre crear la obra y llenarla.

import { supabase } from '../../../services/supabaseClient';

type DemoMark = 'creada' | 'borrada' | 'omitida';
const PENDING_KEY = 'obraflow:demo-pending';

async function readMarks(): Promise<Record<string, DemoMark>> {
  const { data } = await supabase.auth.getUser();
  const marks = data.user?.user_metadata?.obraflow_demo;
  return marks && typeof marks === 'object' ? marks : {};
}

/** true si la obra de ejemplo ya se creó, se borró o se omitió (empresa con obras) en esta empresa. */
export async function demoAlreadyOffered(orgId: string): Promise<boolean> {
  try { return !!(await readMarks())[orgId]; } catch { return true; } // ante la duda, no crear sola
}

export async function markDemo(orgId: string, mark: DemoMark): Promise<void> {
  try {
    const marks = await readMarks();
    await supabase.auth.updateUser({ data: { obraflow_demo: { ...marks, [orgId]: mark } } });
  } catch (e) {
    console.warn('[demo] No se pudo guardar el estado de la obra de ejemplo', e);
  }
}

export function setDemoPending(orgId: string): void {
  try { sessionStorage.setItem(PENDING_KEY, orgId); } catch { /* sin almacenamiento */ }
}

export function isDemoPending(orgId: string): boolean {
  try { return sessionStorage.getItem(PENDING_KEY) === orgId; } catch { return false; }
}

export function clearDemoPending(): void {
  try { sessionStorage.removeItem(PENDING_KEY); } catch { /* sin almacenamiento */ }
}

/** Cantidad de obras de la empresa, leída de la base (no del estado de la app, que puede estar cargando). */
export async function countProjects(orgId: string): Promise<number | null> {
  const { count, error } = await supabase
    .from('projects').select('id', { count: 'exact', head: true }).eq('organization_id', orgId);
  return error ? null : count ?? 0;
}

/** Espera a que la obra recién creada esté guardada (la creación es optimista). */
export async function waitForProject(projectId: string, tries = 20, delayMs = 500): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    const { data } = await supabase.from('projects').select('id').eq('id', projectId).maybeSingle();
    if (data) return true;
    await new Promise(r => setTimeout(r, delayMs));
  }
  return false;
}
