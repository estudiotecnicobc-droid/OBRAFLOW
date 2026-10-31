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
