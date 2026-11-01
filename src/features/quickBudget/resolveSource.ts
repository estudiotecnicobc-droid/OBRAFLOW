import type { MasterTask } from '../../../types';

export type QuickSource = { kind: 'org'; task: MasterTask } | { kind: 'global'; task: MasterTask } | { kind: 'none' };

const norm = (s?: string) => (s ?? '').trim().toLowerCase();

/**
 * Busca la tarea de una fila del presupuesto rápido: primero en el catálogo de la empresa y después
 * en el Catálogo ObraFlow, por código y, si no hay código, por nombre.
 */
export function makeSourceResolver(orgTasks: MasterTask[], globalTasks: MasterTask[]) {
  const orgByCode = new Map<string, MasterTask>(orgTasks.filter(t => t.code).map(t => [norm(t.code), t]));
  const orgByName = new Map<string, MasterTask>(orgTasks.map(t => [norm(t.name), t]));
  const globByCode = new Map<string, MasterTask>(globalTasks.filter(t => t.code).map(t => [norm(t.code), t]));
  const globByName = new Map<string, MasterTask>(globalTasks.map(t => [norm(t.name), t]));
  return (name: string, code?: string): QuickSource => {
    const o = (code ? orgByCode.get(norm(code)) : undefined) ?? orgByName.get(norm(name));
    if (o) return { kind: 'org', task: o };
    const g = (code ? globByCode.get(norm(code)) : undefined) ?? globByName.get(norm(name));
    if (g) return { kind: 'global', task: g };
    return { kind: 'none' };
  };
}
