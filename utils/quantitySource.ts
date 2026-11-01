import type { BudgetItem, MeasurementSheet } from '../types';

export type QuantitySourceKind = 'manual' | 'medido' | 'calculador';

export interface QuantitySource {
  kind: QuantitySourceKind;
  sheet?: MeasurementSheet;
  /** Solo en 'medido': la cantidad del ítem no coincide con el total de la planilla. */
  outOfSync: boolean;
}

const EPS = 0.005;

/** Origen de la cantidad de un ítem: planilla de medición > calculador > manual. */
export function getQuantitySource(item: BudgetItem, sheets: MeasurementSheet[]): QuantitySource {
  const sheet = sheets.find(s => s.budgetItemId === item.id && s.lines.length > 0);
  if (sheet) {
    return { kind: 'medido', sheet, outOfSync: Math.abs(sheet.totalQuantity - item.quantity) > EPS };
  }
  if (item.computationItemId) return { kind: 'calculador', outOfSync: false };
  return { kind: 'manual', outOfSync: false };
}

// ── Resaltado de ítems al volver desde el calculador ─────────────────────────

const HIGHLIGHT_KEY = 'obraflow:highlightBudgetItems';

export function setPendingHighlight(itemIds: string[]): void {
  try { sessionStorage.setItem(HIGHLIGHT_KEY, JSON.stringify(itemIds)); } catch { /* sin storage */ }
}

export function consumePendingHighlight(): string[] {
  try {
    const raw = sessionStorage.getItem(HIGHLIGHT_KEY);
    sessionStorage.removeItem(HIGHLIGHT_KEY);
    const ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
