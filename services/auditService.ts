import { supabase } from './supabaseClient';

export interface AuditEvent {
  id: string;
  actorId: string | null;
  operation: string;
  entity: string;
  entityId: string;
  beforeData: Record<string, any> | null;
  afterData: Record<string, any> | null;
  createdAt: string;
}

function auditEventFromRow(row: Record<string, any>): AuditEvent {
  return {
    id: row.id,
    actorId: row.actor_id,
    operation: row.operation,
    entity: row.entity,
    entityId: row.entity_id,
    beforeData: row.before_data ?? null,
    afterData: row.after_data ?? null,
    createdAt: row.created_at,
  };
}

export const auditService = {
  async listRecent(limit = 50): Promise<AuditEvent[]> {
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.error('[auditService.listRecent]', error.message);
      return [];
    }
    return (data ?? []).map(auditEventFromRow);
  },

  async record(params: {
    operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'MANUAL';
    entity: string;
    entityId: string;
    beforeData?: Record<string, any>;
    afterData?: Record<string, any>;
  }): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('audit_log').insert({
      actor_id: user.id,
      operation: params.operation,
      entity: params.entity,
      entity_id: params.entityId,
      before_data: params.beforeData ?? null,
      after_data: params.afterData ?? null,
    });
    if (error) console.error('[auditService.record]', error.message);
  },
};
