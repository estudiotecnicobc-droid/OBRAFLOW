-- ============================================================
-- Migration 038: Billing schema — subscription_plans,
--   plan_entitlements, organization_subscriptions,
--   stripe_webhook_events
-- ============================================================

-- ─── subscription_plans ──────────────────────────────────────
-- Catálogo de planes del producto (seed data, no editable por org).

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id                      text        PRIMARY KEY,           -- 'starter' | 'professional' | 'business'
  name                    text        NOT NULL,
  stripe_price_id_monthly text,                              -- price_xxx (Stripe) — rellenar en PR 2
  stripe_price_id_yearly  text,
  sort_order              integer     NOT NULL DEFAULT 0,
  is_active               boolean     NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now()
);

-- ─── plan_entitlements ───────────────────────────────────────
-- Features booleanas y límites numéricos por plan.
-- numeric_value = 0 significa ilimitado.

CREATE TABLE IF NOT EXISTS public.plan_entitlements (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id       text    NOT NULL REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
  feature_key   text    NOT NULL,
  feature_type  text    NOT NULL CHECK (feature_type IN ('boolean', 'numeric')),
  bool_value    boolean,
  numeric_value integer,
  UNIQUE (plan_id, feature_key)
);
CREATE INDEX IF NOT EXISTS idx_plan_entitlements_plan ON public.plan_entitlements(plan_id);

-- ─── organization_subscriptions ─────────────────────────────
-- Una fila por organización. Se crea automáticamente al crear la org
-- (ver trigger en 039). Estado inicial: 'trialing' 14 días.

CREATE TABLE IF NOT EXISTS public.organization_subscriptions (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid        NOT NULL UNIQUE
                            REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id                 text        NOT NULL DEFAULT 'starter'
                            REFERENCES public.subscription_plans(id),
  status                  text        NOT NULL DEFAULT 'trialing'
                            CHECK (status IN (
                              'trialing', 'active', 'past_due',
                              'canceled', 'unpaid', 'paused'
                            )),
  trial_ends_at           timestamptz,
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  cancel_at_period_end    boolean     NOT NULL DEFAULT false,
  canceled_at             timestamptz,
  -- Stripe IDs (rellenar al activar Checkout en PR 2)
  stripe_customer_id      text        UNIQUE,
  stripe_subscription_id  text        UNIQUE,
  stripe_price_id         text,
  -- Billing info
  billing_email           text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_subs_org_id
  ON public.organization_subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_subs_stripe_cust
  ON public.organization_subscriptions(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_org_subs_stripe_sub
  ON public.organization_subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- updated_at auto-refresh
CREATE OR REPLACE FUNCTION public.trg_set_updated_at_org_sub()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_org_sub_updated_at ON public.organization_subscriptions;
CREATE TRIGGER trg_org_sub_updated_at
  BEFORE UPDATE ON public.organization_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_updated_at_org_sub();

-- ─── stripe_webhook_events ───────────────────────────────────
-- Log de idempotencia: cada evento Stripe se inserta una sola vez.
-- Si el id ya existe el INSERT falla silenciosamente.

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id           text        PRIMARY KEY,  -- event.id de Stripe (evt_xxx)
  type         text        NOT NULL,
  payload      jsonb       NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  error        text                       -- si hubo error al procesar
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type
  ON public.stripe_webhook_events(type);

-- ─── RLS ──────────────────────────────────────────────────────

ALTER TABLE public.subscription_plans        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_entitlements         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_webhook_events     ENABLE ROW LEVEL SECURITY;

-- subscription_plans: lectura pública (info de producto)
DROP POLICY IF EXISTS "billing_plans_select_all"  ON public.subscription_plans;
CREATE POLICY "billing_plans_select_all"
  ON public.subscription_plans FOR SELECT USING (true);

-- plan_entitlements: lectura pública
DROP POLICY IF EXISTS "billing_entitlements_select_all" ON public.plan_entitlements;
CREATE POLICY "billing_entitlements_select_all"
  ON public.plan_entitlements FOR SELECT USING (true);

-- organization_subscriptions:
--   SELECT solo para miembros de la org
--   ALL para service_role (webhooks, triggers)

DROP POLICY IF EXISTS "org_sub_select_own"    ON public.organization_subscriptions;
DROP POLICY IF EXISTS "org_sub_service_all"   ON public.organization_subscriptions;

CREATE POLICY "org_sub_select_own"
  ON public.organization_subscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = organization_subscriptions.organization_id
        AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "org_sub_service_all"
  ON public.organization_subscriptions FOR ALL
  USING (auth.role() = 'service_role');

-- stripe_webhook_events: solo service_role
DROP POLICY IF EXISTS "webhook_events_service" ON public.stripe_webhook_events;
CREATE POLICY "webhook_events_service"
  ON public.stripe_webhook_events FOR ALL
  USING (auth.role() = 'service_role');
