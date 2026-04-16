/**
 * importMasterRubro — importación masiva de un rubro completo desde Base Maestra.
 *
 * Función pura: recibe datos, devuelve payloads listos para escribir.
 * El caller (MasterTasksPanel) es responsable de invocar las acciones de ERPContext.
 *
 * Construye un ImportMasterTaskPayload por cada MasterTask activa del rubro,
 * delegando en buildImportPayload para la lógica de FK, laborYields y toolYields.
 *
 * Deduplicación de materiales entre tareas del mismo rubro:
 * Se acumula la lista de projectMaterials entre llamadas sucesivas, de modo que
 * si dos tareas del rubro usan el mismo material, el segundo lookup lo encuentra
 * en el payload ya construido y reutiliza el id — sin crear duplicados.
 */

import { MasterTask, MasterMaterial, Material, LaborCategory, Tool } from '../types';
import { buildImportPayload, ImportMasterTaskPayload } from './importMasterTask';

export interface RubroImportResult {
  /** Payload listo para escribir por cada tarea del rubro. */
  payloads: ImportMasterTaskPayload[];
  /** Total de líneas MO/Equipo omitidas por FK inválida en todos los payloads. */
  skippedTotal: number;
}

/**
 * Filtra las MasterTask del rubro dado y construye los payloads de importación.
 *
 * @param rubro               Categoría canónica a importar (ej: "06 MAMPOSTERÍA...")
 * @param masterTasks         Tareas activas de la org (ya filtradas por isActive y orgId)
 * @param organizationId      Org del proyecto destino
 * @param projectId           ID del proyecto destino (para BudgetItem.projectId)
 * @param laborCategoriesMap  Mapa id→LaborCategory disponible en el proyecto
 * @param toolsMap            Mapa id→Tool disponible en el proyecto
 * @param projectMaterials    Materiales actuales del proyecto (para lookup por nombre)
 * @param masterMaterialsMap  Mapa id→MasterMaterial (para precio vivo). Opcional.
 */
export function buildRubroImportPayloads(
  rubro: string,
  masterTasks: MasterTask[],
  organizationId: string,
  projectId: string,
  laborCategoriesMap: Record<string, LaborCategory>,
  toolsMap: Record<string, Tool>,
  projectMaterials: Material[] = [],
  masterMaterialsMap: Record<string, MasterMaterial> = {},
): RubroImportResult {
  const matching = masterTasks.filter(t => t.category === rubro);

  // Acumulamos los materiales disponibles iteración a iteración para que los
  // MaterialesToCreate de una tarea sean visibles como "existentes" en la siguiente.
  let runningMaterials = [...projectMaterials];
  const payloads: ImportMasterTaskPayload[] = [];

  for (const task of matching) {
    const payload = buildImportPayload(
      task, organizationId, projectId, 1,
      laborCategoriesMap, toolsMap, runningMaterials, masterMaterialsMap,
    );
    runningMaterials = [...runningMaterials, ...payload.materialsToCreate];
    payloads.push(payload);
  }

  const skippedTotal = payloads.reduce(
    (sum, p) => sum + p.skippedLabor.length + p.skippedTools.length,
    0,
  );

  return { payloads, skippedTotal };
}
