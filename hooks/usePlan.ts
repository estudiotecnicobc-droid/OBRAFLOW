import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { billingService } from '../services/billingService';
import { useAuth } from '../context/AuthContext';
import {
  PlanId,
  BillingStatus,
  FeatureKey,
  OrgSubscription,
  OrgEntitlements,
} from '../types';

// ─── Interfaz pública ─────────────────────────────────────────────────────────

export interface PlanContext {
  planId:        PlanId;
  status:        BillingStatus;
  /** true si status es 'trialing' o 'active' */
  isActive:      boolean;
  /** Días restantes de trial, o null si no aplica */
  trialDaysLeft: number | null;
  /** Devuelve true si la org tiene acceso a esta feature boolean */
  hasFeature:    (key: FeatureKey) => boolean;
  /** Devuelve el límite numérico. 0 = ilimitado. */
  getLimit:      (key: FeatureKey) => number;
  /** Puede crear un proyecto más sin superar el límite del plan */
  canAddProject: boolean;
  /** Puede invitar un miembro más sin superar el límite del plan */
  canAddMember:  boolean;
  /** Proyectos actuales de la org */
  usageProjects: number;
  /** Miembros actuales de la org */
  usageMembers:  number;
  loading:       boolean;
  /** Re-fetches subscription and entitlements from Supabase */
  refetch:       () => void;
}

// ─── Defaults fail-open ───────────────────────────────────────────────────────
// Si la tabla aún no existe o hay un error de red, devolvemos acceso total
// para no bloquear a usuarios existentes durante el rollout del billing.

const FAIL_OPEN: PlanContext = {
  planId:        'business',
  status:        'active',
  isActive:      true,
  trialDaysLeft: null,
  hasFeature:    () => true,
  getLimit:      () => 0,
  canAddProject: true,
  canAddMember:  true,
  usageProjects: 0,
  usageMembers:  0,
  loading:       false,
  refetch:       () => {},
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePlan(): PlanContext {
  const { user } = useAuth();
  const orgId = user?.organizationId ?? '';

  const [sub, setSub]              = useState<OrgSubscription | null>(null);
  const [ents, setEnts]            = useState<OrgEntitlements>({});
  const [usageProjects, setUProj]  = useState(0);
  const [usageMembers, setUMemb]   = useState(0);
  const [loading, setLoading]      = useState(true);
  const [error, setError]          = useState(false);
  const [fetchKey, setFetchKey]    = useState(0);

  const refetch = useCallback(() => setFetchKey(k => k + 1), []);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(false);

    const countProjects = async (): Promise<number> => {
      try {
        const r = await supabase
          .from('projects')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId);
        return r.count ?? 0;
      } catch { return 0; }
    };

    const countMembers = async (): Promise<number> => {
      try {
        const r = await supabase
          .from('organization_members')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId);
        return r.count ?? 0;
      } catch { return 0; }
    };

    Promise.all([
      billingService.getSubscription(orgId).catch(() => null),
      billingService.getEntitlements(orgId).catch(() => ({})),
      countProjects(),
      countMembers(),
    ])
      .then(([fetchedSub, fetchedEnts, projCount, membCount]) => {
        setSub(fetchedSub);
        setEnts(fetchedEnts as OrgEntitlements);
        setUProj(projCount as number);
        setUMemb(membCount as number);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [orgId, fetchKey]);

  // Fail-open: si hubo error, dar acceso total
  if (error) return { ...FAIL_OPEN, refetch };

  const isActive = ['trialing', 'active'].includes(sub?.status ?? '');

  const trialDaysLeft: number | null = (() => {
    if (sub?.status !== 'trialing' || !sub.trialEndsAt) return null;
    const ms = new Date(sub.trialEndsAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 86_400_000));
  })();

  const hasFeature = (key: FeatureKey): boolean => {
    if (!isActive) return false;
    const val = ents[key];
    if (typeof val === 'boolean') return val;
    return false;
  };

  const getLimit = (key: FeatureKey): number => {
    if (!isActive) return 1; // mínimo de seguridad
    const val = ents[key];
    if (typeof val === 'number') return val;
    return 0; // 0 = sin límite cuando hay plan activo
  };

  const maxProjects = getLimit('max_projects');
  const maxMembers  = getLimit('max_members');

  return {
    planId:        sub?.planId ?? 'starter',
    status:        sub?.status ?? 'trialing',
    isActive,
    trialDaysLeft,
    hasFeature,
    getLimit,
    canAddProject: isActive && (maxProjects === 0 || usageProjects < maxProjects),
    canAddMember:  isActive && (maxMembers  === 0 || usageMembers  < maxMembers),
    usageProjects,
    usageMembers,
    loading,
    refetch,
  };
}
