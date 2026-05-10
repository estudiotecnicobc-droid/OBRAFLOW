import { supabase } from './supabaseClient';
import {
  ComputationSession,
  ComputationItem,
  MaterialSnapshot,
  ManualMaterialSnapshot,
} from '../types';
import { ChandiasAddedItem } from '../src/features/material-calculator/engine/chandias';

// ─── Mappers ──────────────────────────────────────────────────────────────────

function sessionFromRow(row: Record<string, any>): ComputationSession {
  return {
    id:             row.id,
    projectId:      row.project_id,
    organizationId: row.organization_id,
    name:           row.name ?? undefined,
    status:         row.status,
    computedBy:     row.computed_by ?? undefined,
    computedAt:     row.computed_at,
    createdAt:      row.created_at,
    updatedAt:      row.updated_at,
  };
}

function itemFromRow(row: Record<string, any>): ComputationItem {
  return {
    id:                  row.id,
    computationId:       row.computation_id,
    organizationId:      row.organization_id,
    chandiasTaskId:      row.chandias_task_id,
    masterTaskId:        row.master_task_id ?? undefined,
    description:         row.description ?? undefined,
    dims:                row.dims ?? {},
    quantity:            Number(row.quantity),
    unidad:              row.unidad,
    materialesSnapshot:  (row.materiales_snapshot ?? []) as MaterialSnapshot[],
    manualMaterials:     (row.manual_materials ?? []) as ManualMaterialSnapshot[],
    steelDiameterMm:     row.steel_diameter_mm != null ? Number(row.steel_diameter_mm) : undefined,
    sortOrder:           row.sort_order ?? undefined,
    createdAt:           row.created_at,
    updatedAt:           row.updated_at,
  };
}

// ─── Helpers de snapshot ──────────────────────────────────────────────────────

/** Convierte materiales calculados del motor en snapshot técnico sin precios. */
function toMaterialesSnapshot(item: ChandiasAddedItem): MaterialSnapshot[] {
  return (item.materiales ?? []).map(m => ({
    nombre:   m.nombre,
    unit:     m.unit,
    coef:     m.coef,
    cantidad: m.cantidad,
  }));
}

/** Convierte materiales manuales en snapshot sin precios. */
function toManualMaterialsSnapshot(item: ChandiasAddedItem): ManualMaterialSnapshot[] {
  return (item.manualMaterials ?? []).map(m => ({
    id:       m.id,
    nombre:   m.nombre,
    unit:     m.unit,
    cantidad: m.cantidad,
    ...(m.code ? { code: m.code } : {}),
  }));
}

// ─── Servicio ─────────────────────────────────────────────────────────────────

export const computationService = {

  /**
   * Crea una nueva sesión de cómputo en estado 'draft'.
   * Devuelve la sesión creada.
   */
  async createSession(
    projectId: string,
    orgId: string,
    name?: string,
  ): Promise<ComputationSession> {
    const row: Record<string, any> = {
      project_id:      projectId,
      organization_id: orgId,
      status:          'draft',
    };
    if (name) row.name = name;

    const { data, error } = await supabase
      .from('project_computations')
      .insert(row)
      .select()
      .single();

    if (error) throw new Error(`[computationService.createSession] ${error.message}`);
    return sessionFromRow(data);
  },

  /**
   * Inserta computation_items a partir de ChandiasAddedItems.
   * masterTaskIdMap: { [chandiasTaskId]: masterTaskUUID } — opcional.
   * Devuelve los ítems insertados.
   */
  async addItems(
    sessionId: string,
    orgId: string,
    items: ChandiasAddedItem[],
    masterTaskIdMap?: Record<string, string>,
  ): Promise<ComputationItem[]> {
    if (items.length === 0) return [];

    const rows = items.map((item, index) => {
      const row: Record<string, any> = {
        computation_id:      sessionId,
        organization_id:     orgId,
        chandias_task_id:    item.taskId,
        description:         item.description || null,
        dims:                item.dims,
        quantity:            item.quantity,
        unidad:              item.unidad,
        materiales_snapshot: toMaterialesSnapshot(item),
        manual_materials:    toManualMaterialsSnapshot(item),
        sort_order:          index,
      };

      if (masterTaskIdMap?.[item.taskId]) {
        row.master_task_id = masterTaskIdMap[item.taskId];
      }
      if (item.steelDiameterMm != null) {
        row.steel_diameter_mm = item.steelDiameterMm;
      }

      return row;
    });

    const { data, error } = await supabase
      .from('computation_items')
      .insert(rows)
      .select();

    if (error) throw new Error(`[computationService.addItems] ${error.message}`);
    return (data ?? []).map(itemFromRow);
  },

  /**
   * Lista todas las sesiones de un proyecto, ordenadas por creación descendente.
   */
  async listSessions(projectId: string): Promise<ComputationSession[]> {
    const { data, error } = await supabase
      .from('project_computations')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`[computationService.listSessions] ${error.message}`);
    return (data ?? []).map(sessionFromRow);
  },

  /**
   * Lista los ítems de una sesión en sort_order ascendente.
   */
  async listItems(sessionId: string): Promise<ComputationItem[]> {
    const { data, error } = await supabase
      .from('computation_items')
      .select('*')
      .eq('computation_id', sessionId)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (error) throw new Error(`[computationService.listItems] ${error.message}`);
    return (data ?? []).map(itemFromRow);
  },

  /**
   * Avanza el status de la sesión a 'approved'.
   * Solo válido desde 'draft'. El check de estado está en app, no en DB.
   */
  async approve(sessionId: string): Promise<void> {
    const { error } = await supabase
      .from('project_computations')
      .update({ status: 'approved', computed_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (error) throw new Error(`[computationService.approve] ${error.message}`);
  },

  /**
   * Avanza el status de la sesión a 'frozen'.
   * Solo válido desde 'approved'. Las cantidades quedan bloqueadas.
   */
  async freeze(sessionId: string): Promise<void> {
    const { error } = await supabase
      .from('project_computations')
      .update({ status: 'frozen' })
      .eq('id', sessionId);

    if (error) throw new Error(`[computationService.freeze] ${error.message}`);
  },
};
