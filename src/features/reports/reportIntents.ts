/**
 * Pedidos de apertura de un reporte en otra pantalla. La pantalla de Reportes deja el pedido
 * y navega; la pantalla destino lo toma una sola vez al montarse.
 */
export type BudgetPrintMode = 'cliente' | 'tecnico' | 'interno' | 'resumido';
export type HubReportId = 'compras' | 'cotizacion' | 'mano-obra' | 'fichas-apu' | 'explosion' | 'apu-empresa' | 'desglose-fecha';

export type ReportIntent =
  | { kind: 'budget'; mode: BudgetPrintMode }
  | { kind: 'executive' }
  | { kind: 'planning' }
  | { kind: 'hub'; report: HubReportId };

let pending: ReportIntent | null = null;

export const setReportIntent = (intent: ReportIntent) => { pending = intent; };

export function takeReportIntent<K extends ReportIntent['kind']>(kind: K): Extract<ReportIntent, { kind: K }> | null {
  if (pending?.kind !== kind) return null;
  const i = pending as Extract<ReportIntent, { kind: K }>;
  pending = null;
  return i;
}
