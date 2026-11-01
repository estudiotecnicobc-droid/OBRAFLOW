/**
 * importComputationItems — servicio puro para crear budget payloads
 * desde los ítems del cómputo Chandías.
 *
 * Para cada ChandiasAddedItem busca la MasterTask respaldante con tres criterios (en orden):
 *   1. sourceMetadata.catalogTaskId === item.taskId   (PRIMARIO — siempre presente en APUs
 *      creados desde la calculadora Chandías vía "Transformar en APU Maestro").
 *   2. masterTask.code === item.taskId   (campo opcional; solo si el usuario lo completó).
 *   3. Nombre exacto normalizado (trim + lowercase) — fallback final.
 *
 * Si no se encuentra master task → crea Task mínima + BudgetItem (costo = 0).
 * La categoría de la tarea mínima se toma del catálogo Chandías (category field),
 * evitando que caiga al rubro "Otros" cuando la categoría es conocida.
 *
 * Protección de duplicados:
 *   Si el nombre ya está en existingBudgetTaskNames → omite el ítem.
 *
 * Trazabilidad:
 *   computationItemIdMap: { chandiasAddedItem.itemId → computation_item UUID }
 *   Si migration 040 no está ejecutada → pasar {} (el servicio lo omite).
 */

import { buildImportPayload, ImportMasterTaskPayload } from './importMasterTask';
import { generateId } from '../utils/generateId';
import { normalizeUnit } from '../utils/normalizeUnit';
import { CHANDIAS_CATALOG } from '../src/features/material-calculator/catalog/chandiasCatalog';
import type {
  MasterTask,
  Task,
  BudgetItem,
  LaborCategory,
  Tool,
  Material,
} from '../types';
import type { ChandiasAddedItem } from '../src/features/material-calculator/engine/chandias';

// ── Índice del catálogo Chandías por ID — construido una sola vez (módulo-level) ──
// Permite recuperar la categoría de un ítem del catálogo sin importar si tiene APU.
const CATALOG_BY_ID = new Map(CHANDIAS_CATALOG.map(ct => [ct.id, ct]));

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface NoAPUPayload {
  task:       Task;
  budgetItem: BudgetItem;
}

export interface ComputationImportResult {
  /** Ítems con APU respaldante — task completa con yields. */
  payloads:      ImportMasterTaskPayload[];
  /** Ítems sin APU — task mínima, costo = 0. */
  noAPUPayloads: NoAPUPayload[];
  /** Nombres omitidos por ya existir en el presupuesto. */
  skippedNames:  string[];
  /**
   * Ítems que ya existen en el presupuesto: cantidad total del cómputo por tarea
   * (sumada si el cómputo trae varias líneas de la misma tarea), para actualizar en vez de omitir.
   */
  existingUpdates: { nameKey: string; quantity: number; computationItemId?: string }[];
}

// ── Función principal ─────────────────────────────────────────────────────────

/**
 * Construye payloads de importación para enviar computation items al presupuesto.
 *
 * @param items                  Ítems del cómputo Chandías.
 * @param masterTasks            Base maestra de tareas de la org.
 * @param orgId                  Org activa.
 * @param projectId              Proyecto activo.
 * @param laborCategoriesMap     Mapa id → LaborCategory del proyecto.
 * @param toolsMap               Mapa id → Tool del proyecto.
 * @param projectMaterials       Materiales actuales del proyecto (dedup por nombre).
 * @param existingBudgetTaskNames Nombres (lowercase) ya presentes en el presupuesto → se omiten.
 * @param computationItemIdMap   { chandiasAddedItem.itemId → computation_item UUID } para trazabilidad.
 */
export function buildComputationImportPayloads(
  items:                    ChandiasAddedItem[],
  masterTasks:              MasterTask[],
  orgId:                    string,
  projectId:                string,
  laborCategoriesMap:       Record<string, LaborCategory>,
  toolsMap:                 Record<string, Tool>,
  projectMaterials:         Material[],
  existingBudgetTaskNames:  Set<string>,
  computationItemIdMap:     Record<string, string> = {},
): ComputationImportResult {
  // ── Índice 1: por catalogTaskId en sourceMetadata (PRIMARIO) ─────────────
  // Siempre presente en APUs creados desde la calculadora Chandías via
  // "Transformar en APU Maestro" (sourceMetadata.catalogTaskId = item.taskId).
  // También presente en APUs sembrados (migración 043A y similares).
  // Si hay múltiples APUs para el mismo catalogTaskId, toma el primero encontrado.
  const masterByCatalogId = new Map<string, MasterTask>();
  for (const mt of masterTasks) {
    const cid = mt.sourceMetadata?.catalogTaskId;
    if (cid && !masterByCatalogId.has(cid)) {
      masterByCatalogId.set(cid, mt);
    }
  }

  // ── Índice 2: por code (campo explícito, ej. 'EXC-003') ──────────────────
  // Cubre APUs creados manualmente con code = catalogTaskId (ej. 'EXC-002').
  // Solo aplica cuando el usuario completó el campo "Código" explícitamente.
  const masterByCode = new Map<string, MasterTask>();
  for (const mt of masterTasks) {
    const code = mt.code?.trim();
    if (code && !masterByCode.has(code)) {
      masterByCode.set(code, mt);
    }
  }

  // ── Índice 3: por nombre normalizado (FALLBACK) ────────────────────────────
  const masterByName = new Map<string, MasterTask>(
    masterTasks.map(mt => [mt.name.trim().toLowerCase(), mt]),
  );

  const payloads:      ImportMasterTaskPayload[] = [];
  const noAPUPayloads: NoAPUPayload[]            = [];
  const skippedNames:  string[]                  = [];
  const existingByName = new Map<string, { nameKey: string; quantity: number; computationItemId?: string }>();

  for (const item of items) {
    const nameKey = item.taskNombre.trim().toLowerCase();

    // Dedup: ya existe en el presupuesto → omitir
    if (existingBudgetTaskNames.has(nameKey)) {
      skippedNames.push(item.taskNombre);
      const prev = existingByName.get(nameKey);
      existingByName.set(nameKey, {
        nameKey,
        quantity: (prev?.quantity ?? 0) + item.quantity,
        computationItemId: prev?.computationItemId ?? computationItemIdMap[item.itemId],
      });
      continue;
    }

    const computationItemId = computationItemIdMap[item.itemId] as string | undefined;

    // Busca master task: A) catalogTaskId en sourceMetadata, B) code, C) nombre normalizado
    const mt = masterByCatalogId.get(item.taskId)
            ?? masterByCode.get(item.taskId)
            ?? masterByName.get(nameKey);

    if (mt) {
      // ── Caso A: existe APU maestra ────────────────────────────────────────
      // Pasa {} para masterMaterialsMap → buildImportPayload usa lastKnownUnitPrice
      // como fallback, que es el precio guardado en master_task_materials.
      const payload = buildImportPayload(
        mt,
        orgId,
        projectId,
        item.quantity,
        laborCategoriesMap,
        toolsMap,
        projectMaterials,
        {},
      );

      if (computationItemId) {
        payload.budgetItem.computationItemId = computationItemId;
      }

      payloads.push(payload);
    } else {
      // ── Caso B: sin APU — task mínima ────────────────────────────────────
      // Usa la categoría del catálogo Chandías para evitar rubro "Otros".
      const catalogTask = CATALOG_BY_ID.get(item.taskId);
      const taskId      = generateId();

      const task: Task = {
        id:                   taskId,
        organizationId:       orgId,
        name:                 item.taskNombre,
        unit:                 normalizeUnit(item.unidad),
        dailyYield:           1,
        laborCost:            0,
        category:             catalogTask?.categoria ?? '',
        code:                 item.taskId,   // ID del catálogo Chandías como referencia
        description:          item.description ?? '',
        fixedCost:            0,
        fixedCostDescription: '',
        specifications:       '',
      };

      const budgetItem: BudgetItem = {
        id:        generateId(),
        projectId,
        taskId,
        quantity:  Math.max(1, item.quantity),
        status:    'pending',
        progress:  0,
        ...(computationItemId ? { computationItemId } : {}),
      };

      noAPUPayloads.push({ task, budgetItem });
    }
  }

  return { payloads, noAPUPayloads, skippedNames, existingUpdates: [...existingByName.values()] };
}
