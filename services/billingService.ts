import { supabase } from './supabaseClient';
import { OrgSubscription, OrgEntitlements, PlanId, BillingCycle } from '../types';

// ─── Mapper snake_case → camelCase ────────────────────────────────────────────

function subFromRow(row: Record<string, any>): OrgSubscription {
  return {
    id:                    row.id,
    organizationId:        row.organization_id,
    planId:                (row.plan_id ?? 'starter') as PlanId,
    status:                row.status,
    trialEndsAt:           row.trial_ends_at          ?? undefined,
    currentPeriodStart:    row.current_period_start   ?? undefined,
    currentPeriodEnd:      row.current_period_end     ?? undefined,
    cancelAtPeriodEnd:     row.cancel_at_period_end   ?? false,
    canceledAt:            row.canceled_at             ?? undefined,
    stripeCustomerId:      row.stripe_customer_id     ?? undefined,
    stripeSubscriptionId:  row.stripe_subscription_id ?? undefined,
    stripePriceId:         row.stripe_price_id        ?? undefined,
    billingEmail:          row.billing_email          ?? undefined,
    createdAt:             row.created_at,
    updatedAt:             row.updated_at,
  };
}

// ─── Servicio ─────────────────────────────────────────────────────────────────

export const billingService = {

  /**
   * Devuelve la suscripción activa de una organización, o null si no existe.
   */
  async getSubscription(orgId: string): Promise<OrgSubscription | null> {
    if (!orgId) return null;
    const { data, error } = await supabase
      .from('organization_subscriptions')
      .select('*')
      .eq('organization_id', orgId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? subFromRow(data) : null;
  },

  /**
   * Devuelve el mapa de entitlements de la org via RPC get_org_entitlements().
   * Si la org no tiene subscription activa/trialing, retorna {}.
   */
  async getEntitlements(orgId: string): Promise<OrgEntitlements> {
    if (!orgId) return {};
    const { data, error } = await supabase
      .rpc('get_org_entitlements', { p_org_id: orgId });
    if (error) throw new Error(error.message);
    return (data as OrgEntitlements) ?? {};
  },

  /**
   * Crea una sesión de Stripe Checkout y devuelve la URL de redirección.
   * El backend resuelve el price ID desde subscription_plans (stripe_price_id_monthly/yearly).
   * El frontend nunca conoce el price ID de Stripe.
   */
  async createCheckoutSession(orgId: string, planId: PlanId, billingCycle: BillingCycle): Promise<string> {
    const { data, error } = await supabase.functions.invoke('billing-create-checkout', {
      body: { orgId, planId, billingCycle },
    });
    if (error) throw new Error(error.message);
    if (!data?.url) throw new Error('No se recibió URL de checkout');
    return data.url as string;
  },

  /**
   * Crea una sesión del Stripe Customer Portal y devuelve la URL.
   * Llama a la Edge Function billing-create-portal.
   */
  async openCustomerPortal(orgId: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke('billing-create-portal', {
      body: { orgId },
    });
    if (error) throw new Error(error.message);
    if (!data?.url) throw new Error('No se recibió URL del portal');
    return data.url as string;
  },
};
