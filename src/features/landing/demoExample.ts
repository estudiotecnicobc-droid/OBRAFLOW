// Montos fijos de la Casa de ejemplo para la landing. Salen del Catálogo ObraFlow con las cantidades de
// src/features/demo/demoHouse.ts (162 ítems). Se publican como foto: no se leen de la base.

export const PRICES_LABEL = 'Precios de referencia AMBA, octubre 2026';
export const SURFACE_M2 = 70;
export const ITEM_COUNT = 162;
export const RUBRO_COUNT = 29;

export const WALL_CODE = 'OF-MAM-002';

export interface SheetLine { label: string; formula: string; subtotal: number }

/** Planilla de medición del muro exterior: misma definición que DEMO_SHEETS. */
export const WALL_SHEET: SheetLine[] = [
  { label: 'Frente y contrafrente', formula: '10,00 × 2,80 × 2', subtotal: 56 },
  { label: 'Laterales', formula: '7,00 × 2,80 × 2', subtotal: 39.2 },
  { label: 'Descuento de aberturas', formula: '', subtotal: -10.55 },
];

export interface ApuLine { name: string; unit: string; quantity: number; unitPrice: number }

/** Mano de obra: 9 h de jornada ÷ 10 m²/día, tarifa UOCRA con 95 % de cargas sociales. */
export const WALL_APU: { materials: ApuLine[]; labor: ApuLine[] } = {
  materials: [
    { name: 'Ladrillo cerámico hueco 18×18×33', unit: 'u', quantity: 16.3, unitPrice: 1339 },
    { name: 'Cemento de albañilería', unit: 'kg', quantity: 6.25, unitPrice: 304 },
    { name: 'Arena gruesa', unit: 'm³', quantity: 0.0275, unitPrice: 49949 },
  ],
  labor: [
    { name: 'Oficial', unit: 'h', quantity: 0.9, unitPrice: 12840.75 },
    { name: 'Ayudante', unit: 'h', quantity: 0.9, unitPrice: 10921.95 },
  ],
};

export const lineTotal = (l: ApuLine) => l.quantity * l.unitPrice;
export const wallUnitCost = () => [...WALL_APU.materials, ...WALL_APU.labor].reduce((s, l) => s + lineTotal(l), 0);
export const wallQuantity = () => WALL_SHEET.reduce((s, l) => s + l.subtotal, 0);

export const BUDGET_GROUPS: { name: string; rubros: string; amount: number }[] = [
  { name: 'Suelos, fundaciones y estructura', rubros: '03 a 05', amount: 18196141 },
  { name: 'Preliminares y documentación', rubros: '02 y 38', amount: 15919595 },
  { name: 'Instalaciones', rubros: '22, 23, 25 y 26', amount: 13698135 },
  { name: 'Revoques, contrapisos y carpetas', rubros: '08 a 10', amount: 12961819 },
  { name: 'Carpinterías y herrería', rubros: '17 a 21 y 33', amount: 9330306 },
  { name: 'Mampostería y aislaciones', rubros: '06 y 07', amount: 7811640 },
  { name: 'Pintura y exteriores', rubros: '34 y 35', amount: 5553036 },
  { name: 'Pisos, revestimientos y cielorrasos', rubros: '11 a 14', amount: 5544819 },
  { name: 'Equipamiento y amoblamiento', rubros: '30 y 31', amount: 4803625 },
  { name: 'Cubierta', rubros: '16', amount: 3009180 },
];

export const COST_SPLIT = { materials: 40450650, labor: 36725841, other: 19651805 };

export const DIRECT_COST = BUDGET_GROUPS.reduce((s, g) => s + g.amount, 0);

/** Orden de services/autoPlan.ts (PLAN_ORDER). Inicio y largo son esquemáticos, en % del plazo. */
export const PLAN_PHASES: [string, number, number][] = [
  ['Preliminares', 0, 8],
  ['Suelos y fundaciones', 6, 12],
  ['Estructura y muros', 16, 20],
  ['Cubierta', 32, 8],
  ['Instalaciones · obra gruesa', 36, 14],
  ['Revoques y contrapisos', 46, 18],
  ['Carpinterías', 60, 10],
  ['Pisos y revestimientos', 66, 12],
  ['Pintura', 76, 12],
  ['Instalaciones · terminación', 84, 8],
  ['Equipamiento y exteriores', 88, 12],
];
