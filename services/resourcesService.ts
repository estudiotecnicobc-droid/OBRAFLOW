import { supabase } from './supabaseClient';
import { Resource } from '../types';

function fromRow(row: Record<string, any>): Resource {
  return {
    id:                row.id,
    catalogId:         row.catalog_id         ?? undefined,
    organizationId:    row.organization_id    ?? undefined,
    code:              row.code               ?? undefined,
    name:              row.name,
    unit:              row.unit,
    type:              row.type,
    baseCost:          Number(row.base_cost   ?? 0),
    socialChargesPct:  row.social_charges_pct != null ? Number(row.social_charges_pct) : undefined,
    isActive:          row.is_active,
    pricingNotes:      row.pricing_notes      ?? undefined,
    currentSnapshotId: row.current_snapshot_id ?? undefined,
    categoryName:      row.category_name       ?? undefined,
  };
}

export const resourcesService = {

  /**
   * Lista recursos activos accesibles para una organización:
   * globales (organization_id IS NULL) + propios (organization_id = orgId).
   * orgId debe ser UUID real (de organizations.id), no ID legacy de la app.
   */
  async listForOrg(organizationId: string): Promise<Resource[]> {
    const { data, error } = await supabase
      .from('resources')
      .select(
        'id, catalog_id, organization_id, code, name, unit, type, ' +
        'base_cost, social_charges_pct, is_active, pricing_notes, current_snapshot_id',
      )
      .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
      .eq('is_active', true)
      .order('organization_id', { nullsFirst: true })
      .order('name');

    if (error) {
      console.error('[resourcesService.listForOrg]', error.message);
      return [];
    }
    return (data ?? []).map(fromRow);
  },

  /** Devuelve un Map<resourceId, Resource> para lookups O(1). */
  async mapForOrg(organizationId: string): Promise<Map<string, Resource>> {
    const list = await resourcesService.listForOrg(organizationId);
    return new Map(list.map(r => [r.id, r]));
  },

  /**
   * Lista solo los recursos del catálogo global (organization_id IS NULL).
   * Usados como precios de referencia importables a cualquier organización.
   */
  async listGlobal(): Promise<Resource[]> {
    const { data, error } = await supabase
      .from('resources')
      .select('id, catalog_id, organization_id, code, name, unit, type, base_cost, social_charges_pct, is_active, category_name')
      .is('organization_id', null)
      .eq('is_active', true)
      .order('type')
      .order('name');
    if (error) {
      console.error('[resourcesService.listGlobal]', error.message);
      return [];
    }
    return (data ?? []).map(fromRow);
  },
};
