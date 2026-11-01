-- =============================================================================
-- Aplicación en producción 31/10/2026 — 070, 067, 069, 060 (en ese orden)
-- Pegar completo en Supabase → SQL Editor → Run. Corre en una sola transacción:
-- si algo falla, no se aplica nada. Al final registra cada migración en
-- supabase_migrations.schema_migrations para que quede en el historial.
-- Respaldo / reversión: docs/db/rollback-2026-10-31.sql
-- =============================================================================
BEGIN;

-- ───────────────────────── 070_rls_organization_members ─────────────────────────
-- =============================================================================
-- Migración 070: cerrar el alta/edición libre de miembros de empresa (CRÍTICO)
--
-- En producción había políticas creadas fuera del repo con condición `true`:
--   organization_members_insert_authenticated  (INSERT  WITH CHECK true)
--   organization_members_update_authenticated  (UPDATE  USING true / CHECK true)
--   organization_members_delete_authenticated  (DELETE  USING true)
-- Como las políticas permisivas se suman, cualquier usuario logueado podía
-- agregarse como owner a cualquier empresa y leer o editar todos sus datos.
-- Además:
--   members_insert  dejaba a cualquier miembro (también viewer) insertar filas
--                   con cualquier rol en su empresa;
--   members_update  dejaba a cualquier miembro cambiar roles (p. ej. viewer → admin);
--   members_delete  dejaba a cualquier miembro dar de baja a otros, incluso al owner;
--   organizations_insert_authenticated permitía crear empresas sueltas por API
--                   (disparando el seed y la suscripción de prueba).
--
-- La app no los necesita: el alta de empresa y de miembros va por
-- bootstrap_organization y accept_invitation (SECURITY DEFINER), y la UI solo
-- cambia roles, lo que cubre org_members_update_role (admin, nunca el owner).
--
-- Queda:
--   SELECT  members_select, org_members_select, organization_members_select_own
--   UPDATE  org_members_update_role (admin de la empresa; no toca al owner ni asigna owner)
--   DELETE  members_delete (admin de la empresa; nunca al owner)
--   INSERT  ninguna (solo RPC SECURITY DEFINER)
--
-- Idempotente.
-- =============================================================================

DROP POLICY IF EXISTS organization_members_insert_authenticated ON public.organization_members;
DROP POLICY IF EXISTS organization_members_update_authenticated ON public.organization_members;
DROP POLICY IF EXISTS organization_members_delete_authenticated ON public.organization_members;
DROP POLICY IF EXISTS members_insert ON public.organization_members;
DROP POLICY IF EXISTS members_update ON public.organization_members;

DROP POLICY IF EXISTS members_delete ON public.organization_members;
CREATE POLICY members_delete ON public.organization_members
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id) AND role <> 'owner');

DROP POLICY IF EXISTS organizations_insert_authenticated ON public.organizations;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261031230000', '070_rls_organization_members', ARRAY[$mig$-- =============================================================================
-- Migración 070: cerrar el alta/edición libre de miembros de empresa (CRÍTICO)
--
-- En producción había políticas creadas fuera del repo con condición `true`:
--   organization_members_insert_authenticated  (INSERT  WITH CHECK true)
--   organization_members_update_authenticated  (UPDATE  USING true / CHECK true)
--   organization_members_delete_authenticated  (DELETE  USING true)
-- Como las políticas permisivas se suman, cualquier usuario logueado podía
-- agregarse como owner a cualquier empresa y leer o editar todos sus datos.
-- Además:
--   members_insert  dejaba a cualquier miembro (también viewer) insertar filas
--                   con cualquier rol en su empresa;
--   members_update  dejaba a cualquier miembro cambiar roles (p. ej. viewer → admin);
--   members_delete  dejaba a cualquier miembro dar de baja a otros, incluso al owner;
--   organizations_insert_authenticated permitía crear empresas sueltas por API
--                   (disparando el seed y la suscripción de prueba).
--
-- La app no los necesita: el alta de empresa y de miembros va por
-- bootstrap_organization y accept_invitation (SECURITY DEFINER), y la UI solo
-- cambia roles, lo que cubre org_members_update_role (admin, nunca el owner).
--
-- Queda:
--   SELECT  members_select, org_members_select, organization_members_select_own
--   UPDATE  org_members_update_role (admin de la empresa; no toca al owner ni asigna owner)
--   DELETE  members_delete (admin de la empresa; nunca al owner)
--   INSERT  ninguna (solo RPC SECURITY DEFINER)
--
-- Idempotente.
-- =============================================================================

DROP POLICY IF EXISTS organization_members_insert_authenticated ON public.organization_members;
DROP POLICY IF EXISTS organization_members_update_authenticated ON public.organization_members;
DROP POLICY IF EXISTS organization_members_delete_authenticated ON public.organization_members;
DROP POLICY IF EXISTS members_insert ON public.organization_members;
DROP POLICY IF EXISTS members_update ON public.organization_members;

DROP POLICY IF EXISTS members_delete ON public.organization_members;
CREATE POLICY members_delete ON public.organization_members
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id) AND role <> 'owner');

DROP POLICY IF EXISTS organizations_insert_authenticated ON public.organizations;$mig$])
ON CONFLICT (version) DO NOTHING;

-- ───────────────────────── 067_fix_get_org_entitlements_membership ─────────────────────────
-- get_org_entitlements: SECURITY DEFINER sin chequeo de membresía permitía
-- leer el plan de cualquier organización. Mismo contrato (jsonb o NULL);
-- para un no miembro devuelve NULL, que el cliente ya trata como {}.
CREATE OR REPLACE FUNCTION public.get_org_entitlements(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    AND os.status IN ('trialing', 'active')
    AND public.is_org_member(p_org_id);
$function$;

REVOKE EXECUTE ON FUNCTION public.get_org_entitlements(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_org_entitlements(uuid) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261031230100', '067_fix_get_org_entitlements_membership', ARRAY[$mig$-- get_org_entitlements: SECURITY DEFINER sin chequeo de membresía permitía
-- leer el plan de cualquier organización. Mismo contrato (jsonb o NULL);
-- para un no miembro devuelve NULL, que el cliente ya trata como {}.
CREATE OR REPLACE FUNCTION public.get_org_entitlements(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    AND os.status IN ('trialing', 'active')
    AND public.is_org_member(p_org_id);
$function$;

REVOKE EXECUTE ON FUNCTION public.get_org_entitlements(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_org_entitlements(uuid) TO authenticated;$mig$])
ON CONFLICT (version) DO NOTHING;

-- ───────────────────────── 069_hardening_funciones ─────────────────────────
-- =============================================================================
-- Migración 069: endurecimiento de funciones (advisors de seguridad de Supabase)
--
--   1. search_path fijo en 12 funciones que lo tenían mutable
--      (lint 0011_function_search_path_mutable). get_org_entitlements lo
--      resuelve la 067.
--   2. Funciones de trigger / event trigger con SECURITY DEFINER: se quita
--      EXECUTE a PUBLIC, anon y authenticated para que no figuren como RPC
--      (lint 0029). Los triggers siguen funcionando: Postgres verifica EXECUTE
--      al crear el trigger, no al dispararse.
--
-- Revisadas sin cambios (validan membresía/rol del parámetro de empresa):
-- apply_commercial_rules, clone_master_task_to_org, generate_monthly_snapshots,
-- get_resource_cost, get_resource_snapshot, import_global_catalog_to_org,
-- upsert_index_value. Las de invitación y alta de empresa son públicas a propósito.
--
-- Idempotente. No cambia el cuerpo de ninguna función.
-- =============================================================================

DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.set_updated_at()',
    'public.handle_updated_at()',
    'public.trg_set_updated_at_org_sub()',
    'public.get_org_uuid(text)',
    'public.calc_index_variation()',
    'public.resync_org_material_prices(text)',
    'public.repair_master_task_material_prices(text)',
    'public.is_valid_positive_number(jsonb)',
    'public.validate_composite_components(jsonb)',
    'public.get_my_admin_organization_ids()',
    'public.sync_current_snapshot_cache()',
    'public.trg_fn_create_org_subscription()'
  ] LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public', f);
    ELSE
      RAISE NOTICE '069: % no existe, se omite', f;
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.audit_master_catalog()',
    'public.sync_profile_email()',
    'public.trg_fn_create_org_subscription()',
    'public.trg_fn_new_org_seed()',
    'public.rls_auto_enable()'
  ] LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    ELSE
      RAISE NOTICE '069: % no existe, se omite', f;
    END IF;
  END LOOP;
END $$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261031230200', '069_hardening_funciones', ARRAY[$mig$-- =============================================================================
-- Migración 069: endurecimiento de funciones (advisors de seguridad de Supabase)
--
--   1. search_path fijo en 12 funciones que lo tenían mutable
--      (lint 0011_function_search_path_mutable). get_org_entitlements lo
--      resuelve la 067.
--   2. Funciones de trigger / event trigger con SECURITY DEFINER: se quita
--      EXECUTE a PUBLIC, anon y authenticated para que no figuren como RPC
--      (lint 0029). Los triggers siguen funcionando: Postgres verifica EXECUTE
--      al crear el trigger, no al dispararse.
--
-- Revisadas sin cambios (validan membresía/rol del parámetro de empresa):
-- apply_commercial_rules, clone_master_task_to_org, generate_monthly_snapshots,
-- get_resource_cost, get_resource_snapshot, import_global_catalog_to_org,
-- upsert_index_value. Las de invitación y alta de empresa son públicas a propósito.
--
-- Idempotente. No cambia el cuerpo de ninguna función.
-- =============================================================================

DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.set_updated_at()',
    'public.handle_updated_at()',
    'public.trg_set_updated_at_org_sub()',
    'public.get_org_uuid(text)',
    'public.calc_index_variation()',
    'public.resync_org_material_prices(text)',
    'public.repair_master_task_material_prices(text)',
    'public.is_valid_positive_number(jsonb)',
    'public.validate_composite_components(jsonb)',
    'public.get_my_admin_organization_ids()',
    'public.sync_current_snapshot_cache()',
    'public.trg_fn_create_org_subscription()'
  ] LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public', f);
    ELSE
      RAISE NOTICE '069: % no existe, se omite', f;
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.audit_master_catalog()',
    'public.sync_profile_email()',
    'public.trg_fn_create_org_subscription()',
    'public.trg_fn_new_org_seed()',
    'public.rls_auto_enable()'
  ] LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    ELSE
      RAISE NOTICE '069: % no existe, se omite', f;
    END IF;
  END LOOP;
END $$;$mig$])
ON CONFLICT (version) DO NOTHING;

-- ───────────────────────── 060_price_index_sync_runs ─────────────────────────
-- 060 · Registro de la actualización automática de índices (CAC e ICC INDEC)
-- Lo escribe la función api/sync-indices con la clave de servicio (que no pasa por RLS).
-- Los usuarios autenticados solo lo leen, para ver la fecha de la última actualización.

CREATE TABLE IF NOT EXISTS public.price_index_sync_runs (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at   timestamptz NOT NULL DEFAULT now(),
  ok       boolean NOT NULL,
  trigger  text NOT NULL CHECK (trigger IN ('cron', 'manual')),
  message  text,
  details  jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS price_index_sync_runs_ran_at_idx ON public.price_index_sync_runs (ran_at DESC);

ALTER TABLE public.price_index_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "price_index_sync_runs_select" ON public.price_index_sync_runs;
CREATE POLICY "price_index_sync_runs_select" ON public.price_index_sync_runs
  FOR SELECT TO authenticated USING ( true );

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261031230300', '060_price_index_sync_runs', ARRAY[$mig$-- 060 · Registro de la actualización automática de índices (CAC e ICC INDEC)
-- Lo escribe la función api/sync-indices con la clave de servicio (que no pasa por RLS).
-- Los usuarios autenticados solo lo leen, para ver la fecha de la última actualización.

CREATE TABLE IF NOT EXISTS public.price_index_sync_runs (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at   timestamptz NOT NULL DEFAULT now(),
  ok       boolean NOT NULL,
  trigger  text NOT NULL CHECK (trigger IN ('cron', 'manual')),
  message  text,
  details  jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS price_index_sync_runs_ran_at_idx ON public.price_index_sync_runs (ran_at DESC);

ALTER TABLE public.price_index_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "price_index_sync_runs_select" ON public.price_index_sync_runs;
CREATE POLICY "price_index_sync_runs_select" ON public.price_index_sync_runs
  FOR SELECT TO authenticated USING ( true );$mig$])
ON CONFLICT (version) DO NOTHING;

COMMIT;
