import { useERP } from '../context/ERPContext';
import { buildImportPayload } from '../services/importMasterTask';
import { masterTasksService } from '../services/masterTasksSupabaseService';
import { laborCategoriesService } from '../services/laborCategoriesService';
import { supabase } from '../services/supabaseClient';
import { rubroCategory } from '../src/features/quickBudget/engine';
import type { QuickSelection } from '../components/QuickBudgetWizard';
import type { LaborCategory, MasterMaterial, MasterTask } from '../types';

/** Copias simultáneas del Catálogo ObraFlow a la empresa. */
const CLONE_CONCURRENCY = 6;

export interface QuickApplyResult {
  /** Resumen para mostrar al usuario. */
  message: string;
  /** Ítems de presupuesto creados, en el orden de las filas. */
  created: { row: QuickSelection; budgetItemId: string }[];
}

interface Deps {
  masterTasks: MasterTask[];
  refetchMasterTasks: () => void;
  masterMaterialsMap: Record<string, MasterMaterial>;
}

/**
 * Carga en la obra activa las filas del presupuesto rápido: copia a la empresa los APU del
 * catálogo general, crea los oficios que falten y graba tarea, rendimientos e ítem de presupuesto.
 * Lo usan el presupuesto rápido (BudgetEditor) y la obra de ejemplo (DemoSeeder).
 */
export function useQuickBudgetApply({ masterTasks, refetchMasterTasks, masterMaterialsMap }: Deps) {
  const {
    project, materials: projectMaterials, laborCategoriesMap, toolsMap,
    addTask, addBudgetItem, addMaterial, updateMaterial, updateLaborCategory, addLaborCategory,
    addTaskYield, addTaskLaborYield, addTaskToolYield,
  } = useERP();

  const writePayload = async (p: ReturnType<typeof buildImportPayload>): Promise<boolean> => {
    p.materialsToCreate.forEach(m => addMaterial(m));
    p.materialsToUpdate.forEach(({ id, cost }) => updateMaterial(id, { cost }));
    p.laborCategoriesToUpdate.forEach(({ id, basicHourlyRate }) => updateLaborCategory(id, { basicHourlyRate }));
    try {
      await addTask(p.task); // espera confirmación Supabase antes de linkar el budget_item
    } catch (err) {
      // Task no persistió → no insertar yields ni budget_item para evitar FK inválida.
      // La task quedó en local state (optimistic) pero desaparecerá al recargar.
      console.error('[writePayload] Falló el insert de tarea — se cancela el payload:', err);
      return false;
    }
    p.taskYields.forEach(ty => addTaskYield(ty));
    p.laborYields.forEach(ly => addTaskLaborYield(ly));
    p.toolYields.forEach(ty => addTaskToolYield(ty));
    try {
      await addBudgetItem(p.budgetItem);
      return true;
    } catch (err) {
      console.error('[writePayload] Falló el insert de budget_item — tarea importada pero sin ítem de presupuesto:', err);
      return false;
    }
  };

  const apply = async (
    rows: QuickSelection[],
    templateName: string,
    onProgress?: (done: number, total: number, phase: 'catalog' | 'items') => void,
  ): Promise<QuickApplyResult> => {
    if (project.id === '__phantom__') throw new Error('Abrí una obra para cargar el presupuesto.');
    const orgId = project.organizationId;

    // 1. Copiar a la empresa los APU que solo están en el catálogo general.
    const globals = rows.filter(r => r.source.kind === 'global');
    const cloneFailed: string[] = [];
    const uniqueGlobals = Array.from(new Map(globals.map(r => [r.source.kind === 'global' ? r.source.task.id : '', r])).values());
    // En lotes paralelos: la copia es idempotente y bloquea por (empresa, tarea).
    let cloned = 0;
    for (let i = 0; i < uniqueGlobals.length; i += CLONE_CONCURRENCY) {
      await Promise.all(uniqueGlobals.slice(i, i + CLONE_CONCURRENCY).map(async g => {
        if (g.source.kind !== 'global') return;
        const { error } = await supabase.rpc('clone_master_task_to_org', {
          p_master_task_id: g.source.task.id,
          p_organization_id: orgId,
        });
        if (error) cloneFailed.push(g.task.name);
        onProgress?.(++cloned, uniqueGlobals.length, 'catalog');
      }));
    }
    const orgTasks = globals.length > 0 ? await masterTasksService.list(orgId) : masterTasks;
    if (globals.length > 0) refetchMasterTasks();

    // 2. La mano de obra de los APU copiados se vincula por nombre de categoría;
    //    si la empresa no tiene ese oficio, se crea con el valor hora de referencia.
    const resolveMt = (row: QuickSelection): MasterTask | undefined => {
      if (row.source.kind === 'org') return row.source.task;
      if (row.source.kind === 'global') {
        const src = row.source.task;
        return orgTasks.find(t => t.code === src.code && t.name === src.name);
      }
      return undefined;
    };
    const laborMap: Record<string, LaborCategory> = { ...laborCategoriesMap };
    const laborByRole = new Map((Object.values(laborMap) as LaborCategory[]).map(c => [c.role.trim().toLowerCase(), c.id]));
    for (const row of rows) {
      for (const l of resolveMt(row)?.labor ?? []) {
        const key = l.laborCategoryName.trim().toLowerCase();
        if (laborMap[l.laborCategoryId] || laborByRole.has(key)) continue;
        const lc: LaborCategory = {
          id: crypto.randomUUID(), organizationId: orgId, role: l.laborCategoryName,
          basicHourlyRate: l.snapshotHourlyRate ?? 0,
          socialChargesPercent: l.socialChargesPct ?? 95, insurancePercent: l.socialChargesPct === 0 ? 0 : 5,
          family: 'MANO DE OBRA',
        };
        try {
          await laborCategoriesService.create(lc);
          addLaborCategory(lc);
          laborMap[lc.id] = lc;
          laborByRole.set(key, lc.id);
        } catch (e) {
          console.error('[handleQuickApply] No se pudo crear la categoría de mano de obra', l.laborCategoryName, e);
        }
      }
    }
    const withLocalLabor = (mt: MasterTask): MasterTask => ({
      ...mt,
      labor: mt.labor.map(l => laborMap[l.laborCategoryId]
        ? l
        : { ...l, laborCategoryId: laborByRole.get(l.laborCategoryName.trim().toLowerCase()) ?? l.laborCategoryId }),
    });

    let runningMaterials = [...projectMaterials];
    let withApu = 0, withoutApu = 0;
    const created: { row: QuickSelection; budgetItemId: string }[] = [];
    const skippedLabor = new Set<string>();
    for (const row of rows) {
      const mt = resolveMt(row);
      const category = rubroCategory(row.rubro);
      const base: MasterTask = mt ? withLocalLabor(mt) : {
        id: '', organizationId: orgId, name: row.task.name, unit: row.task.unit, category,
        description: row.task.includes, dailyYield: 1, materials: [], labor: [], equipment: [],
        tags: [], isActive: true, createdAt: '', updatedAt: '',
      } as MasterTask;
      const p = buildImportPayload(
        base, orgId, project.id, row.quantity,
        laborMap, toolsMap, runningMaterials, masterMaterialsMap,
      );
      p.budgetItem.quantity = row.quantity;
      if (!mt) p.task.masterTaskId = undefined;
      if (!p.task.category) p.task.category = category;
      if (!p.task.description) p.task.description = row.task.includes;
      p.skippedLabor.forEach(n => skippedLabor.add(n));
      runningMaterials = [...runningMaterials, ...p.materialsToCreate];
      if (await writePayload(p)) created.push({ row, budgetItemId: p.budgetItem.id });
      if (mt) withApu++; else withoutApu++;
      onProgress?.(withApu + withoutApu, rows.length, 'items');
    }

    const lines = [`${templateName}: ${rows.length} tareas agregadas.`];
    lines.push(`${withApu} con análisis de precio.`);
    if (withoutApu > 0) lines.push(`${withoutApu} sin análisis de precio todavía: tienen la cantidad cargada y el precio lo completás en cada tarea.`);
    if (cloneFailed.length > 0) lines.push(`No se pudieron copiar del catálogo general: ${cloneFailed.join(', ')}.`);
    if (skippedLabor.size > 0) lines.push(`Mano de obra que no está en tu lista de oficios: ${Array.from(skippedLabor).join(', ')}. Agregala en Personal y cuadrillas.`);
    return { message: lines.join('\n'), created };
  };


  return { apply, writePayload };
}
