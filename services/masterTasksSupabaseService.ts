import { supabase } from './supabaseClient';
import {
  MasterTask,
  MasterTaskMaterial,
  MasterTaskLabor,
  MasterTaskEquipment,
} from '../types';
import { normalizeUnit } from '../utils/normalizeUnit';

// ─── Mappers snake_case ↔ camelCase ──────────────────────────────────────────

function taskFromRow(row: Record<string, any>): Omit<MasterTask, 'materials' | 'labor' | 'equipment'> {
  return {
    id: row.id,
    organizationId: row.organization_id,
    code: row.code ?? undefined,
    name: row.name,
    description: row.description ?? undefined,
    unit: normalizeUnit(row.unit),
    category: row.category ?? undefined,
    dailyYield: Number(row.daily_yield),
    fixedCost: row.fixed_cost != null ? Number(row.fixed_cost) : undefined,
    fixedCostDescription: row.fixed_cost_description ?? undefined,
    specifications:  row.specifications   ?? undefined,
    sourceMetadata:  row.source_metadata  ?? undefined,
    tags: row.tags ?? [],
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function materialFromRow(row: Record<string, any>): MasterTaskMaterial {
  return {
    id: row.id,
    masterMaterialId:   row.master_material_id   ?? undefined,
    materialName:       row.material_name,
    unit:               normalizeUnit(row.unit),
    quantity:           Number(row.quantity),
    wastePercent:       row.waste_percent        != null ? Number(row.waste_percent)         : undefined,
    lastKnownUnitPrice: row.last_known_unit_price != null ? Number(row.last_known_unit_price) : undefined,
    // Motor recursivo (migration 010)
    resourceId:       row.resource_id        ?? undefined,
    subMasterTaskId:  row.sub_master_task_id ?? undefined,
    conversionFactor: row.conversion_factor  != null ? Number(row.conversion_factor) : undefined,
    // Unidad comercial (migration 017)
    commercialUnit:   row.commercial_unit    ?? undefined,
  };
}

function laborFromRow(row: Record<string, any>): MasterTaskLabor {
  return {
    id:               row.id,
    laborCategoryId:  row.labor_category_id,
    laborCategoryName: row.labor_category_name,
    quantity:         Number(row.quantity),
    // Motor recursivo (migration 010)
    resourceId:          row.resource_id           ?? undefined,
    snapshotHourlyRate:  row.snapshot_hourly_rate  != null ? Number(row.snapshot_hourly_rate) : undefined,
  };
}

function equipmentFromRow(row: Record<string, any>): MasterTaskEquipment {
  return {
    id:           row.id,
    toolId:       row.tool_id,
    toolName:     row.tool_name,
    hoursPerUnit: Number(row.hours_per_unit),
    // Motor recursivo (migration 010)
    resourceId:           row.resource_id            ?? undefined,
    snapshotCostPerHour:  row.snapshot_cost_per_hour != null ? Number(row.snapshot_cost_per_hour) : undefined,
  };
}

function taskToRow(
  t: Omit<MasterTask, 'id' | 'createdAt' | 'updatedAt' | 'materials' | 'labor' | 'equipment'> & { organizationId: string },
): Record<string, any> {
  return {
    organization_id: t.organizationId,
    code: t.code ?? null,
    name: t.name,
    description: t.description ?? null,
    unit: t.unit,
    category: t.category ?? null,
    daily_yield: Math.max(0.01, t.dailyYield),
    fixed_cost: t.fixedCost ?? 0,
    fixed_cost_description: t.fixedCostDescription ?? null,
    specifications:  t.specifications  ?? null,
    ...(t.sourceMetadata != null ? { source_metadata: t.sourceMetadata } : {}),
    tags: t.tags ?? [],
    is_active: t.isActive,
  };
}

// ─── Tipos de entrada ─────────────────────────────────────────────────────────

export type MasterTaskInput = Omit<
  MasterTask,
  'id' | 'organizationId' | 'isActive' | 'createdAt' | 'updatedAt'
>;

// ─── Servicio ─────────────────────────────────────────────────────────────────

export const masterTasksService = {

  /**
   * Devuelve todas las tareas activas de la organización con sus hijas.
   * Hace 4 queries (no hay JOIN en supabase-js v2 para multi-tabla) pero
   * el volumen de datos es pequeño (decenas a cientos de registros).
   */
  async list(organizationId: string): Promise<MasterTask[]> {
    const { data: taskRows, error } = await supabase
      .from('master_tasks')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('name');
    if (error) throw new Error(error.message);
    if (!taskRows || taskRows.length === 0) return [];

    const ids = taskRows.map(r => r.id);

    const [matsResult, laborResult, equipResult] = await Promise.all([
      supabase.from('master_task_materials').select('*').in('master_task_id', ids),
      supabase.from('master_task_labor').select('*').in('master_task_id', ids),
      supabase.from('master_task_equipment').select('*').in('master_task_id', ids),
    ]);

    if (matsResult.error) throw new Error(matsResult.error.message);
    if (laborResult.error) throw new Error(laborResult.error.message);
    if (equipResult.error) throw new Error(equipResult.error.message);

    // Indexar hijas por master_task_id para O(1) lookup
    const matsMap: Record<string, MasterTaskMaterial[]> = {};
    const laborMap: Record<string, MasterTaskLabor[]> = {};
    const equipMap: Record<string, MasterTaskEquipment[]> = {};

    for (const r of matsResult.data ?? []) {
      (matsMap[r.master_task_id] ??= []).push(materialFromRow(r));
    }
    for (const r of laborResult.data ?? []) {
      (laborMap[r.master_task_id] ??= []).push(laborFromRow(r));
    }
    for (const r of equipResult.data ?? []) {
      (equipMap[r.master_task_id] ??= []).push(equipmentFromRow(r));
    }

    // ── Fallback para tareas clonadas desde catálogo global ─────────────────
    // Las tareas clonadas via RPC usan el esquema NUEVO (catalog_task_yields +
    // resources) en lugar del esquema LEGACY (master_task_materials/labor/equipment).
    // Si una tarea no tiene datos en el esquema legacy, intentamos leer del nuevo.
    const emptyTaskIds = taskRows
      .filter(r => !matsMap[r.id]?.length && !laborMap[r.id]?.length && !equipMap[r.id]?.length)
      .map(r => r.id);

    if (emptyTaskIds.length > 0) {
      const { data: catalogYields } = await supabase
        .from('catalog_task_yields')
        .select('quantity, master_task_id, resources(id, name, unit, base_cost, type)')
        .in('master_task_id', emptyTaskIds);

      for (const y of catalogYields ?? []) {
        const res = y.resources as Record<string, any> | null;
        if (!res) continue;
        const taskId: string = y.master_task_id;

        if (res.type === 'MATERIAL' || res.type === 'SUBCONTRACT') {
          (matsMap[taskId] ??= []).push({
            id: y.master_task_id + '_' + res.id,
            masterMaterialId: undefined,
            materialName: res.name,
            unit: res.unit,
            quantity: Number(y.quantity),
            lastKnownUnitPrice: res.base_cost != null ? Number(res.base_cost) : undefined,
          });
        } else if (res.type === 'LABOR') {
          (laborMap[taskId] ??= []).push({
            id: y.master_task_id + '_' + res.id,
            // laborCategoryId usa el resource.id — puede no coincidir con la org.
            // En buildImportPayload será "skipped" si no hay match, pero al menos
            // el nombre aparece en el preview del modal de importación.
            laborCategoryId: res.id,
            laborCategoryName: res.name,
            quantity: Number(y.quantity),
          });
        } else if (res.type === 'EQUIPMENT') {
          (equipMap[taskId] ??= []).push({
            id: y.master_task_id + '_' + res.id,
            toolId: res.id,
            toolName: res.name,
            hoursPerUnit: Number(y.quantity),
          });
        }
      }
    }

    return taskRows.map(r => ({
      ...taskFromRow(r),
      materials: matsMap[r.id] ?? [],
      labor:     laborMap[r.id] ?? [],
      equipment: equipMap[r.id] ?? [],
    }));
  },

  /**
   * Crea una tarea maestra con sus hijas en una sola transacción lógica.
   * (Supabase no expone transacciones multi-tabla en el client — insertamos
   * secuencialmente; si falla una hija la tarea padre queda huérfana pero
   * activa; en la próxima recarga se verá sin hijas, no un estado corrupto.)
   *
   * Resilencia ante migraciones pendientes:
   * - Si 037 (source_metadata) no está ejecutada: reintenta sin ese campo.
   * - Si 017 (commercial_unit/conversion_factor) no está ejecutada: lo maneja _insertChildren.
   */
  async create(organizationId: string, input: MasterTaskInput): Promise<MasterTask> {
    const row = taskToRow({ ...input, organizationId, isActive: true });
    let res = await supabase.from('master_tasks').insert(row).select().single();

    // Fallback: migration 037 (source_metadata) puede no estar ejecutada todavía
    if (res.error?.message.includes('source_metadata')) {
      const { source_metadata: _ignored, ...rowWithout } = row as Record<string, any>;
      res = await supabase.from('master_tasks').insert(rowWithout).select().single();
    }
    if (res.error) throw new Error(res.error.message);
    const taskRow = res.data;

    const taskId = taskRow.id;
    await masterTasksService._insertChildren(taskId, input);

    return {
      ...taskFromRow(taskRow),
      materials: input.materials,
      labor:     input.labor,
      equipment: input.equipment,
    };
  },

  /**
   * Estrategia de actualización: UPDATE padre + DELETE hijas + INSERT hijas nuevas.
   * Simple y predecible; evita lógica de diff.
   */
  async update(id: string, input: Partial<MasterTaskInput>): Promise<void> {
    const parentUpdates: Record<string, any> = {};
    if (input.code !== undefined)                 parentUpdates.code = input.code ?? null;
    if (input.name !== undefined)                 parentUpdates.name = input.name;
    if (input.description !== undefined)          parentUpdates.description = input.description ?? null;
    if (input.unit !== undefined)                 parentUpdates.unit = input.unit;
    if (input.category !== undefined)             parentUpdates.category = input.category ?? null;
    if (input.dailyYield !== undefined)           parentUpdates.daily_yield = Math.max(0.01, input.dailyYield);
    if (input.fixedCost !== undefined)            parentUpdates.fixed_cost = input.fixedCost ?? null;
    if (input.fixedCostDescription !== undefined) parentUpdates.fixed_cost_description = input.fixedCostDescription ?? null;
    if (input.specifications !== undefined)       parentUpdates.specifications   = input.specifications   ?? null;
    if (input.sourceMetadata !== undefined)       parentUpdates.source_metadata  = input.sourceMetadata   ?? null;
    if (input.tags !== undefined)                 parentUpdates.tags = input.tags ?? [];

    if (Object.keys(parentUpdates).length > 0) {
      let { error } = await supabase
        .from('master_tasks')
        .update(parentUpdates)
        .eq('id', id);

      // Fallback: migration 037 (source_metadata) puede no estar ejecutada todavía
      if (error?.message.includes('source_metadata')) {
        const { source_metadata: _ignored, ...updatesWithout } = parentUpdates as Record<string, any>;
        const retryResult = await supabase
          .from('master_tasks')
          .update(updatesWithout)
          .eq('id', id);
        error = retryResult.error;
      }
      if (error) throw new Error(error.message);
    }

    // Si se incluyen hijas, reemplazar todas
    if (
      input.materials !== undefined ||
      input.labor !== undefined ||
      input.equipment !== undefined
    ) {
      // Borrar hijas existentes
      await Promise.all([
        supabase.from('master_task_materials').delete().eq('master_task_id', id),
        supabase.from('master_task_labor').delete().eq('master_task_id', id),
        supabase.from('master_task_equipment').delete().eq('master_task_id', id),
      ]);

      // Insertar nuevas hijas
      await masterTasksService._insertChildren(id, {
        materials: input.materials ?? [],
        labor:     input.labor ?? [],
        equipment: input.equipment ?? [],
      });
    }
  },

  /**
   * Devuelve todas las tareas del catálogo global (organization_id IS NULL).
   * No carga las sub-tablas de composición (materials/labor/equipment) porque
   * los APUs globales usan catalog_task_yields + resources en lugar del esquema legado.
   */
  async listGlobal(): Promise<MasterTask[]> {
    const { data, error } = await supabase
      .from('master_tasks')
      .select('*')
      .is('organization_id', null)
      .eq('is_active', true)
      .order('name');
    if (error) throw new Error(error.message);
    return (data ?? []).map(r => ({
      ...taskFromRow(r),
      materials: [],
      labor: [],
      equipment: [],
    }));
  },

  /** Soft delete: is_active = false */
  async deactivate(id: string): Promise<void> {
    const { error } = await supabase
      .from('master_tasks')
      .update({ is_active: false })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  // ── Catálogo Global (organization_id IS NULL) — solo master_admin ──────────

  /** Lista TODOS los APUs globales (activos e inactivos) para la vista admin */
  async listGlobalAll(): Promise<MasterTask[]> {
    const { data, error } = await supabase
      .from('master_tasks')
      .select('*')
      .is('organization_id', null)
      .order('name');
    if (error) throw new Error(error.message);
    return (data ?? []).map(r => ({ ...taskFromRow(r), materials: [], labor: [], equipment: [] }));
  },

  /** Activa un APU global (revertir soft-delete) */
  async activate(id: string): Promise<void> {
    const { error } = await supabase
      .from('master_tasks')
      .update({ is_active: true })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  /** Crea un APU en el catálogo global (organization_id = null) — solo campos básicos */
  async createGlobal(input: Omit<MasterTaskInput, 'materials' | 'labor' | 'equipment'>): Promise<MasterTask> {
    const row: Record<string, any> = {
      ...taskToRow({ ...input, organizationId: '' } as any),
      organization_id: null,
      is_active: true,
    };
    delete row.organization_id;  // rebuild below
    const { data, error } = await supabase
      .from('master_tasks')
      .insert({ ...row, organization_id: null })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { ...taskFromRow(data), materials: [], labor: [], equipment: [] };
  },

  /** Actualiza campos básicos de un APU global */
  async updateGlobal(id: string, input: Partial<Omit<MasterTaskInput, 'materials' | 'labor' | 'equipment'>>): Promise<void> {
    const row = taskToRow({ ...input, organizationId: '' } as any);
    delete row.organization_id;
    const { error } = await supabase
      .from('master_tasks')
      .update(row)
      .eq('id', id)
      .is('organization_id', null);
    if (error) throw new Error(error.message);
  },

  // ── Internal helper ────────────────────────────────────────────────────────

  async _insertChildren(
    taskId: string,
    input: Pick<MasterTaskInput, 'materials' | 'labor' | 'equipment'>,
  ): Promise<void> {
    // ── Materiales — separado del Promise.all para poder reintentar sin campos comerciales
    if (input.materials.length > 0) {
      const buildMatRow = (m: MasterTaskMaterial, withCommercial: boolean) => {
        const cf = withCommercial && (m.conversionFactor != null && m.conversionFactor > 0)
          ? m.conversionFactor
          : null;
        const cu = cf != null ? (m.commercialUnit ?? null) : null;
        return {
          master_task_id:        taskId,
          master_material_id:    m.masterMaterialId ?? null,
          material_name:         m.materialName,
          unit:                  m.unit,
          quantity:              m.quantity,
          waste_percent:         m.wastePercent ?? 0,
          last_known_unit_price: m.lastKnownUnitPrice ?? null,
          // sub-APU anidado (migration 010) — reemplaza precio directo con costo recursivo
          ...(m.subMasterTaskId != null ? { sub_master_task_id: m.subMasterTaskId } : {}),
          ...(cf != null ? { conversion_factor: cf } : {}),
          ...(cu != null ? { commercial_unit: cu } : {}),
        };
      };

      let matRes = await supabase
        .from('master_task_materials')
        .insert(input.materials.map(m => buildMatRow(m, true)));

      // Fallback: migration 017 (commercial_unit / conversion_factor) puede no estar ejecutada
      if (matRes.error && (
        matRes.error.message.includes('commercial_unit') ||
        matRes.error.message.includes('conversion_factor')
      )) {
        matRes = await supabase
          .from('master_task_materials')
          .insert(input.materials.map(m => buildMatRow(m, false)));
      }
      if (matRes.error) throw new Error(matRes.error.message);
    }

    // ── Labor y Equipos — sin dependencias de migraciones → en paralelo
    const others: Promise<any>[] = [];

    if (input.labor.length > 0) {
      others.push(
        supabase.from('master_task_labor').insert(
          input.labor.map(l => ({
            master_task_id:       taskId,
            labor_category_id:    l.laborCategoryId,
            labor_category_name:  l.laborCategoryName,
            quantity:             l.quantity,
          })),
        ).then(r => { if (r.error) throw new Error(r.error.message); }),
      );
    }

    if (input.equipment.length > 0) {
      others.push(
        supabase.from('master_task_equipment').insert(
          input.equipment.map(e => ({
            master_task_id: taskId,
            tool_id:        e.toolId,
            tool_name:      e.toolName,
            hours_per_unit: e.hoursPerUnit,
          })),
        ).then(r => { if (r.error) throw new Error(r.error.message); }),
      );
    }

    await Promise.all(others);
  },

  /** Devuelve un MasterTask por ID con sus sub-tablas inline, o null si no existe. */
  async getById(id: string): Promise<MasterTask | null> {
    const { data, error } = await supabase
      .from('master_tasks')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) return null;

    const [matsRes, laborRes, equipRes] = await Promise.all([
      supabase.from('master_task_materials').select('*').eq('master_task_id', id),
      supabase.from('master_task_labor').select('*').eq('master_task_id', id),
      supabase.from('master_task_equipment').select('*').eq('master_task_id', id),
    ]);

    return {
      ...taskFromRow(data),
      materials: (matsRes.data ?? []).map(materialFromRow),
      labor:     (laborRes.data ?? []).map(laborFromRow),
      equipment: (equipRes.data ?? []).map(equipmentFromRow),
    };
  },
};
