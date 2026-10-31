export type V = Record<string, number>;

export interface QuickInput {
  key: string;
  label: string;
  kind: 'number' | 'bool' | 'option';
  default: number;
  unit: string;
  note?: string;
  options?: { value: number; label: string }[];
}

export interface QuickCalc {
  key: string;
  label: string;
  unit: string;
  fn: (v: V) => number | string;
}

export interface QuickTask {
  name: string;
  /** Qué incluye la tarea, en lenguaje simple para el usuario. */
  includes: string;
  /** Criterio técnico de medición. */
  scope: string;
  unit: string;
  qty: number | ((v: V) => number);
  include: boolean | ((v: V) => boolean);
  /** Código del APU en el catálogo global. */
  code?: string;
  note?: string;
  /** Variante según las medidas (por ejemplo, el sistema elegido): reemplaza nombre, código y textos. */
  pick?: (v: V) => Partial<Pick<QuickTask, 'name' | 'code' | 'includes' | 'scope'>>;
}

export interface QuickTemplate {
  id: string;
  name: string;
  description: string;
  inputs: QuickInput[];
  calcs: QuickCalc[];
  rubros: { rubro: string; tasks: QuickTask[] }[];
}

export interface QuickRow {
  rubro: string;
  task: QuickTask;
  quantity: number;
  included: boolean;
}
