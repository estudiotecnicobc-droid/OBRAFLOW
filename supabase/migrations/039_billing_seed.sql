-- ============================================================
-- Migration 039: Billing seed — planes, entitlements, RPC,
--   trigger auto-create subscription, backfill orgs existentes
-- ============================================================

-- ─── Planes ───────────────────────────────────────────────────

INSERT INTO public.subscription_plans (id, name, sort_order) VALUES
  ('starter',      'Starter',      1),
  ('professional', 'Professional', 2),
  ('business',     'Business',     3)
ON CONFLICT (id) DO UPDATE SET
  name       = EXCLUDED.name,
  is_active  = true;

-- ─── Entitlements ─────────────────────────────────────────────
-- Limpiar y re-insertar para que sea idempotente sin UPSERT condicional.

DELETE FROM public.plan_entitlements
WHERE plan_id IN ('starter', 'professional', 'business');

INSERT INTO public.plan_entitlements (plan_id, feature_key, feature_type, bool_value, numeric_value) VALUES

-- ── STARTER ──────────────────────────────────────────────────
('starter', 'max_projects',           'numeric', null, 3),
('starter', 'max_members',            'numeric', null, 1),
('starter', 'presupuesto_basico',     'boolean', true,  null),
('starter', 'apu_maestros',           'boolean', false, null),
('starter', 'computo_parametrico',    'boolean', false, null),
('starter', 'reportes_centralizados', 'boolean', false, null),
('starter', 'comparacion_costos',     'boolean', false, null),
('starter', 'branding_reportes',      'boolean', false, null),
('starter', 'sincronizacion_viva',    'boolean', false, null),

-- ── PROFESSIONAL ─────────────────────────────────────────────
('professional', 'max_projects',           'numeric', null, 15),
('professional', 'max_members',            'numeric', null, 3),
('professional', 'presupuesto_basico',     'boolean', true,  null),
('professional', 'apu_maestros',           'boolean', true,  null),
('professional', 'computo_parametrico',    'boolean', true,  null),
('professional', 'reportes_centralizados', 'boolean', true,  null),
('professional', 'comparacion_costos',     'boolean', false, null),
('professional', 'branding_reportes',      'boolean', true,  null),  -- branding básico (logo) desde Professional
('professional', 'sincronizacion_viva',    'boolean', true,  null),

-- ── BUSINESS ─────────────────────────────────────────────────
('business', 'max_projects',           'numeric', null, 0),   -- 0 = ilimitado
('business', 'max_members',            'numeric', null, 10),
('business', 'presupuesto_basico',     'boolean', true, null),
('business', 'apu_maestros',           'boolean', true, null),
('business', 'computo_parametrico',    'boolean', true, null),
('business', 'reportes_centralizados', 'boolean', true, null),
('business', 'comparacion_costos',     'boolean', true, null),
('business', 'branding_reportes',      'boolean', true, null),
('business', 'sincronizacion_viva',    'boolean', true, null);

-- ─── RPC get_org_entitlements ─────────────────────────────────
-- Devuelve JSONB con todos los entitlements de la org activa.
-- Retorna NULL si la org no tiene subscription activa/trialing.
-- SECURITY DEFINER para que el anon key pueda leer aunque RLS lo filtre.

CREATE OR REPLACE FUNCTION public.get_org_entitlements(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT jsonb_object_agg(
    pe.feature_key,
    CASE pe.feature_type
      WHEN 'boolean' THEN to_jsonb(COALESCE(pe.bool_value, false))
      WHEN 'numeric' THEN to_jsonb(COALESCE(pe.numeric_value, 0))
    END
  )
  FROM public.organization_subscriptions os
  JOIN public.plan_entitlements pe ON pe.plan_id = os.plan_id
  WHERE os.organization_id = p_org_id
    AND os.status IN ('trialing', 'active');
$$;

-- ─── Trigger: auto-create subscription al crear org ───────────

CREATE OR REPLACE FUNCTION public.trg_fn_create_org_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  BEGIN
    INSERT INTO public.organization_subscriptions (
      organization_id,
      plan_id,
      status,
      trial_ends_at
    ) VALUES (
      NEW.id,
      'starter',
      'trialing',
      now() + interval '14 days'
    )
    ON CONFLICT (organization_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- No fallar la creación de la org si la subscription falla
    RAISE WARNING 'trg_fn_create_org_subscription: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_new_org_subscription ON public.organizations;
CREATE TRIGGER trg_new_org_subscription
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_create_org_subscription();

-- ─── Backfill: subscriptions para orgs existentes ────────────
-- Las orgs creadas antes de esta migración quedan en plan starter,
-- trialing con 14 días desde ahora. ON CONFLICT NO hace nada
-- si ya tienen subscription (ej: si se ejecuta dos veces).

INSERT INTO public.organization_subscriptions (
  organization_id,
  plan_id,
  status,
  trial_ends_at
)
SELECT
  id,
  'starter',
  'trialing',
  now() + interval '14 days'
FROM public.organizations
ON CONFLICT (organization_id) DO NOTHING;
