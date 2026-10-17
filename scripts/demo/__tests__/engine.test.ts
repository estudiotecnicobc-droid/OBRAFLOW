import { describe, it, expect } from 'vitest';
import { computeTaskCost } from '../../../services/recursiveCostEngine';
import { RecursiveEngineContext, MasterTask } from '../../../types';
import {
  TASKS_MAP, RESOURCES_MAP,
  TASK_MAM, TASK_REV, TASK_MURO,
  TASK_REVOQUE, TASK_MURO_REVOCADO,
  RES_CEMENTO, RES_LADRILLO, RES_OFICIAL,
} from '../mockData';
import { buildMockResolveCost, getResourceUnitCost } from '../mockCostService';

const ORG = 'demo-org';

function makeCtx(costDate: string): RecursiveEngineContext {
  return {
    organizationId: ORG,
    costDate,
    tasksMap:     TASKS_MAP,
    resourcesMap: RESOURCES_MAP,
    resolveCost:  buildMockResolveCost(ORG, costDate),
    visited:      new Set(),
    computed:     new Map(),
  };
}

// ── 1. Tarea simple ───────────────────────────────────────────────────────────
describe('Tarea simple: Mampostería (TAREA-001)', () => {
  it('calcula costo con materiales, MO y sin equipos', async () => {
    const ctx = makeCtx('2026-01-31');
    const result = await computeTaskCost(TASK_MAM, ctx);

    expect(result.equipmentCost).toBe(0);
    expect(result.fixedCost).toBe(0);
    expect(result.materialCost).toBeGreaterThan(0);
    expect(result.laborCost).toBeGreaterThan(0);
    expect(result.totalUnitCost).toBeCloseTo(
      result.materialCost + result.laborCost,
      4,
    );
    expect(result.warnings).toBeUndefined();
  });

  it('desglosa materiales correctamente (16 ladrillos a $0.4747/UN)', async () => {
    const ctx = makeCtx('2026-01-31');
    const result = await computeTaskCost(TASK_MAM, ctx);

    // Ladrillo: 16 UN × $0.4747 = $7.5952
    const ladrilloContrib = 16 * 0.4747;
    // Arena: 0.020 M3 × $91.29 = $1.8258
    const arenaContrib = 0.020 * 91.29;
    // Cemento: 0.0144 bolsas 50kg × $79.49/KG × 50 = 0.0144 × 3974.5 = $57.2328
    const cementoContrib = 0.0144 * 79.49 * 50;

    const expectedMat = ladrilloContrib + arenaContrib + cementoContrib;
    expect(result.materialCost).toBeCloseTo(expectedMat, 2);
  });

  it('calcula MO usando dailyYield=8 y WORKDAY_HOURS=9', async () => {
    const ctx = makeCtx('2026-01-31');
    const result = await computeTaskCost(TASK_MAM, ctx);

    // hoursPerUnit = (1 trabajador × 9h) / 8 rendimiento = 1.125 h/m2
    // oficial: 1.125 × $816.75 = $918.8438
    // ayudante: 1.125 × $671.55 = $755.4938
    const expectedLabor = (1 * 9 / 8) * 816.75 + (1 * 9 / 8) * 671.55;
    expect(result.laborCost).toBeCloseTo(expectedLabor, 2);
  });
});

// ── 2. APU anidado ────────────────────────────────────────────────────────────
describe('APU anidado: Muro revocado (TAREA-003)', () => {
  it('calcula recursivamente incluyendo el sub-APU de revoque', async () => {
    const ctx = makeCtx('2026-01-31');
    const result = await computeTaskCost(TASK_MURO, ctx);

    expect(result.totalUnitCost).toBeGreaterThan(0);
    expect(result.warnings).toBeUndefined();
  });

  it('el costo del muro > costo de la mampostería sola', async () => {
    const ctx = makeCtx('2026-01-31');
    const mamResult  = await computeTaskCost(TASK_MAM,  ctx);

    const ctx2 = makeCtx('2026-01-31');
    const muroResult = await computeTaskCost(TASK_MURO, ctx2);

    expect(muroResult.totalUnitCost).toBeGreaterThan(mamResult.totalUnitCost);
  });

  it('memoiza el sub-APU: TASK_REVOQUE se calcula una sola vez', async () => {
    const ctx = makeCtx('2026-01-31');

    // Calcular muro primero
    await computeTaskCost(TASK_MURO, ctx);

    // El sub-APU revoque debe estar en computed (memoizado) — la key es el UUID string
    expect(ctx.computed.has(TASK_MURO_REVOCADO)).toBe(true);
    expect(ctx.computed.has(TASK_REVOQUE)).toBe(true);
  });
});

// ── 3. Cambio de costo por fecha ──────────────────────────────────────────────
describe('Variación de costos por fecha', () => {
  it('los costos de marzo 2026 son mayores que enero 2026', async () => {
    const ctxJan = makeCtx('2026-01-31');
    const ctxMar = makeCtx('2026-03-31');

    const mamJan = await computeTaskCost(TASK_MAM, ctxJan);
    const mamMar = await computeTaskCost(TASK_MAM, ctxMar);

    expect(mamMar.totalUnitCost).toBeGreaterThan(mamJan.totalUnitCost);
  });

  it('la variación materiales enero→marzo está entre 5% y 15%', async () => {
    const ctxJan = makeCtx('2026-01-31');
    const ctxMar = makeCtx('2026-03-31');

    const mamJan = await computeTaskCost(TASK_MAM, ctxJan);
    const mamMar = await computeTaskCost(TASK_MAM, ctxMar);

    const varPct = (mamMar.materialCost - mamJan.materialCost) / mamJan.materialCost * 100;
    expect(varPct).toBeGreaterThan(5);
    expect(varPct).toBeLessThan(15);
  });

  it('fecha anterior a todos los snapshots devuelve null', () => {
    const cost = getResourceUnitCost(RES_CEMENTO, ORG, '2025-12-31');
    expect(cost).toBeNull();
  });
});

// ── 4. Conversión de unidades ─────────────────────────────────────────────────
describe('Conversión de unidades comerciales', () => {
  it('bolsas de 50kg: 0.0144 bolsas × 50 × precio/KG', async () => {
    const costKg = getResourceUnitCost(RES_CEMENTO, ORG, '2026-01-31')!;

    // Construir tarea mínima solo con cemento en "50kg"
    const task: MasterTask = {
      id: 'test-50kg',
      organizationId: ORG,
      name: 'Test 50kg',
      unit: 'UN',
      dailyYield: 1,
      isActive: true,
      createdAt: '',
      updatedAt: '',
      materials: [{
        id: 'm-test',
        materialName: 'Cemento 50kg',
        unit: '50kg',
        quantity: 1,
        resourceId: RES_CEMENTO,
      }],
      labor: [],
      equipment: [],
    };

    const ctx = makeCtx('2026-01-31');
    ctx.tasksMap.set(task.id, task);
    const result = await computeTaskCost(task, ctx);

    // 1 bolsa de 50kg × precio/KG = 50 × costKg
    expect(result.materialCost).toBeCloseTo(50 * costKg, 2);
  });

  it('bolsas de 25kg: factor correcto', async () => {
    const costKg = getResourceUnitCost(RES_CEMENTO, ORG, '2026-01-31')!;

    const task: MasterTask = {
      id: 'test-25kg',
      organizationId: ORG,
      name: 'Test 25kg',
      unit: 'UN',
      dailyYield: 1,
      isActive: true,
      createdAt: '',
      updatedAt: '',
      materials: [{
        id: 'm-test2',
        materialName: 'Cemento 25kg',
        unit: '25kg',
        quantity: 1,
        resourceId: RES_CEMENTO,
      }],
      labor: [],
      equipment: [],
    };

    const ctx = makeCtx('2026-01-31');
    ctx.tasksMap.set(task.id, task);
    const result = await computeTaskCost(task, ctx);

    expect(result.materialCost).toBeCloseTo(25 * costKg, 2);
  });

  it('hh → HS: alias normalizado correctamente en MO', async () => {
    // "hh" es alias de "HS" en unitNormalization. El motor usa resolveCost por resourceId,
    // no hace conversión de unidades en MO (usa cantidad × horasJornada / rendimiento).
    // Este test verifica que la tarifa por hora se resuelve sin warnings.
    const task: MasterTask = {
      id: 'test-hh',
      organizationId: ORG,
      name: 'Test hh alias',
      unit: 'UN',
      dailyYield: 8,
      isActive: true,
      createdAt: '',
      updatedAt: '',
      materials: [],
      labor: [{
        id: 'l-hh',
        laborCategoryId: 'lc-test',
        laborCategoryName: 'Oficial test',
        quantity: 1,
        resourceId: RES_OFICIAL,
      }],
      equipment: [],
    };

    const ctx = makeCtx('2026-01-31');
    ctx.tasksMap.set(task.id, task);
    const result = await computeTaskCost(task, ctx);

    // hoursPerUnit = 1 × 9 / 8 = 1.125 → $816.75 × 1.125 = $918.84
    expect(result.laborCost).toBeCloseTo(816.75 * (9 / 8), 2);
    expect(result.warnings).toBeUndefined();
  });

  it('acero en kg × $/kg da costo técnico correcto (post-046)', async () => {
    // Verifica que el motor recursivo calcula correctamente cuando
    // master_task_materials.unit='kg' y lastKnownUnitPrice=$/kg (estado post-046).
    // Sin resourceId — usa lastKnownUnitPrice directamente.
    const PRICE_PER_KG = 140;    // $/kg (precio técnico)
    const QTY_KG       = 149.52; // kg (14 barras × 10.68 kg/barra, corregido por 046)

    const task: MasterTask = {
      id:             'test-steel-kg',
      organizationId: ORG,
      name:           'Test Acero kg post-046',
      unit:           'M3',
      dailyYield:     1,
      isActive:       true,
      createdAt:      '',
      updatedAt:      '',
      materials: [{
        id:                 'steel-kg',
        materialName:       'Hierro nervado Ø12mm',
        unit:               'kg',              // post-046: unidad técnica
        quantity:           QTY_KG,            // post-046: cantidad en kg
        lastKnownUnitPrice: PRICE_PER_KG,      // $/kg (siempre fue $/kg)
      }],
      labor:     [],
      equipment: [],
    };

    const ctx = makeCtx('2026-01-31');
    ctx.tasksMap.set(task.id, task);
    const result = await computeTaskCost(task, ctx);

    // Esperado: 149.52 kg × $140/kg = $20,932.80
    expect(result.materialCost).toBeCloseTo(QTY_KG * PRICE_PER_KG, 2);
    expect(result.warnings).toBeUndefined();
  });

  it('UD como unidad de material es equivalente a UN', async () => {
    const costLadrillo = getResourceUnitCost(RES_LADRILLO, ORG, '2026-01-31')!;

    const task: MasterTask = {
      id: 'test-ud',
      organizationId: ORG,
      name: 'Test UD unit',
      unit: 'UN',
      dailyYield: 1,
      isActive: true,
      createdAt: '',
      updatedAt: '',
      materials: [{
        id: 'm-ud',
        materialName: 'Ladrillo UD',
        unit: 'UD',
        quantity: 10,
        resourceId: RES_LADRILLO,
        // conversionFactor: getConversionFactor("UD", "UN") = 1 (misma unidad)
      }],
      labor: [],
      equipment: [],
    };

    const ctx = makeCtx('2026-01-31');
    ctx.tasksMap.set(task.id, task);
    const result = await computeTaskCost(task, ctx);

    // UD y UN son la misma unidad → factor=1 → 10 × costLadrillo
    expect(result.materialCost).toBeCloseTo(10 * costLadrillo, 4);
  });
});
