// ─── Datos mockeados para demo local del motor recursivo ─────────────────────
// Sin dependencias Supabase. IDs fijos para reproducibilidad.

import { MasterTask, RecursiveEngineContext } from '../../types';

// ── UUIDs de recursos ─────────────────────────────────────────────────────────
export const RES_CEMENTO  = 'a0000000-0000-0000-0000-000000000001'; // KG
export const RES_ARENA    = 'a0000000-0000-0000-0000-000000000002'; // M3
export const RES_LADRILLO = 'a0000000-0000-0000-0000-000000000003'; // UN
export const RES_OFICIAL  = 'a0000000-0000-0000-0000-000000000004'; // HS
export const RES_AYUDANTE = 'a0000000-0000-0000-0000-000000000005'; // HS

// ── UUIDs de tareas ───────────────────────────────────────────────────────────
export const TASK_MAMPOSTERIA    = 'b0000000-0000-0000-0000-000000000001';
export const TASK_REVOQUE        = 'b0000000-0000-0000-0000-000000000002';
export const TASK_MURO_REVOCADO  = 'b0000000-0000-0000-0000-000000000003';

const ORG_ID = 'demo-org';
const NOW = '2026-01-01T00:00:00.000Z';

// ── TAREA_001: Mampostería (m2 de muro de ladrillos) ─────────────────────────
// dailyYield = 8 m2/día
// Materiales:
//   · 16 ladrillos/m2  (UN)
//   · 0.020 m3 arena/m2 (M3)
//   · 0.0144 bolsas 50kg cemento/m2 → 0.0144 × 50 = 0.72 kg de cemento/m2
// MO:
//   · 1.0 oficial + 1.0 ayudante
const TASK_MAM: MasterTask = {
  id: TASK_MAMPOSTERIA,
  organizationId: ORG_ID,
  code: 'MAM-001',
  name: 'Mampostería de ladrillos comunes',
  unit: 'M2',
  dailyYield: 8,
  isActive: true,
  createdAt: NOW,
  updatedAt: NOW,
  materials: [
    {
      id: 'm-001',
      materialName: 'Ladrillo común',
      unit: 'UN',
      quantity: 16,
      resourceId: RES_LADRILLO,
    },
    {
      id: 'm-002',
      materialName: 'Arena gruesa',
      unit: 'M3',
      quantity: 0.020,
      resourceId: RES_ARENA,
    },
    {
      id: 'm-003',
      materialName: 'Cemento Portland',
      // Rendimiento en unidad técnica (KG): 0.0144 bolsas × 50 kg/bolsa = 0.72 kg.
      unit: 'KG',
      quantity: 0.72,
      resourceId: RES_CEMENTO,
    },
  ],
  labor: [
    {
      id: 'l-001',
      laborCategoryId: 'lc-oficial',
      laborCategoryName: 'Oficial albañil',
      quantity: 1.0,
      resourceId: RES_OFICIAL,
    },
    {
      id: 'l-002',
      laborCategoryId: 'lc-ayudante',
      laborCategoryName: 'Ayudante',
      quantity: 1.0,
      resourceId: RES_AYUDANTE,
    },
  ],
  equipment: [],
};

// ── TAREA_002: Revoque fino (m2) — sub-APU para TAREA_003 ─────────────────────
// dailyYield = 20 m2/día
// Materiales:
//   · 0.12 bolsas 25kg cemento/m2 → 0.12 × 25 = 3 kg de cemento/m2
//   · 0.009 m3 arena fina/m2
// MO:
//   · 1.0 oficial
const TASK_REV: MasterTask = {
  id: TASK_REVOQUE,
  organizationId: ORG_ID,
  code: 'REV-001',
  name: 'Revoque fino interior',
  unit: 'M2',
  dailyYield: 20,
  isActive: true,
  createdAt: NOW,
  updatedAt: NOW,
  materials: [
    {
      id: 'm-004',
      materialName: 'Cemento Portland',
      // Rendimiento en unidad técnica (KG): 0.12 bolsas × 25 kg/bolsa = 3 kg.
      unit: 'KG',
      quantity: 3,
      resourceId: RES_CEMENTO,
    },
    {
      id: 'm-005',
      materialName: 'Arena fina',
      unit: 'M3',
      quantity: 0.009,
      resourceId: RES_ARENA,
    },
  ],
  labor: [
    {
      id: 'l-003',
      laborCategoryId: 'lc-oficial',
      laborCategoryName: 'Oficial albañil',
      quantity: 1.0,
      resourceId: RES_OFICIAL,
    },
  ],
  equipment: [],
};

// ── TAREA_003: Muro revocado (m2) — APU anidado ───────────────────────────────
// dailyYield = 6 m2/día
// Materiales:
//   · sub-APU TASK_REVOQUE × 1.0 m2 (APU anidado — precio del revoque por m2)
//   · 12 ladrillos/m2
// MO:
//   · 1.0 oficial (coordinación y refuerzo)
const TASK_MURO: MasterTask = {
  id: TASK_MURO_REVOCADO,
  organizationId: ORG_ID,
  code: 'MUR-001',
  name: 'Muro de ladrillos con revoque fino',
  unit: 'M2',
  dailyYield: 6,
  isActive: true,
  createdAt: NOW,
  updatedAt: NOW,
  materials: [
    {
      id: 'm-006',
      materialName: 'Revoque fino (sub-APU)',
      unit: 'M2',
      quantity: 1.0,
      // APU anidado: usa el costo total de TASK_REVOQUE como precio unitario
      subMasterTaskId: TASK_REVOQUE,
    },
    {
      id: 'm-007',
      materialName: 'Ladrillo común',
      unit: 'UN',
      quantity: 12,
      resourceId: RES_LADRILLO,
    },
  ],
  labor: [
    {
      id: 'l-004',
      laborCategoryId: 'lc-oficial',
      laborCategoryName: 'Oficial albañil',
      quantity: 1.0,
      resourceId: RES_OFICIAL,
    },
  ],
  equipment: [],
};

// ── Maps para el contexto del motor ──────────────────────────────────────────
export const TASKS_MAP = new Map<string, MasterTask>([
  [TASK_MAMPOSTERIA,   TASK_MAM],
  [TASK_REVOQUE,       TASK_REV],
  [TASK_MURO_REVOCADO, TASK_MURO],
]);

// resourcesMap: unidades base de cada recurso (necesario para conversiones)
import { Resource } from '../../types';

export const RESOURCES_MAP = new Map<string, Resource>([
  [RES_CEMENTO,  { id: RES_CEMENTO,  name: 'Cemento Portland', unit: 'KG', type: 'MATERIAL',  baseCost: 79.49, isActive: true }],
  [RES_ARENA,    { id: RES_ARENA,    name: 'Arena',            unit: 'M3', type: 'MATERIAL',  baseCost: 91.29, isActive: true }],
  [RES_LADRILLO, { id: RES_LADRILLO, name: 'Ladrillo común',   unit: 'UN', type: 'MATERIAL',  baseCost:  0.4747, isActive: true }],
  [RES_OFICIAL,  { id: RES_OFICIAL,  name: 'Oficial albañil',  unit: 'HS', type: 'LABOR',     baseCost: 816.75, isActive: true }],
  [RES_AYUDANTE, { id: RES_AYUDANTE, name: 'Ayudante',         unit: 'HS', type: 'LABOR',     baseCost: 671.55, isActive: true }],
]);

export { TASK_MAM, TASK_REV, TASK_MURO };
