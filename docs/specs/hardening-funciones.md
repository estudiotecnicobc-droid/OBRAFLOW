# Endurecimiento de funciones (advisors de seguridad)

Relevamiento del 31/10/2026 con los advisors de Supabase y lectura de las funciones en la base (sin modificarla).

## Migración 069
- `search_path = public` en 12 funciones que lo tenían mutable.
- Sin `EXECUTE` para `PUBLIC`, `anon` y `authenticated` en las funciones de trigger con SECURITY DEFINER (`audit_master_catalog`, `sync_profile_email`, `trg_fn_create_org_subscription`, `trg_fn_new_org_seed`, `rls_auto_enable`). Los triggers siguen funcionando.

## Revisadas sin cambios
Validan membresía o rol sobre el parámetro de empresa: `apply_commercial_rules`, `clone_master_task_to_org`, `generate_monthly_snapshots`, `get_resource_cost`, `get_resource_snapshot`, `import_global_catalog_to_org`, `upsert_index_value`. `accept_invitation`, `get_invitation_by_token` y `bootstrap_organization` son públicas a propósito. Las `seed_*` ya no son ejecutables por usuarios.

## Pendientes fuera de esta migración
- `get_org_entitlements` sin chequeo de membresía: lo corrige la **067**, que está en `main` pero **no está aplicada** en producción.
- Auth → activar "Leaked password protection" (panel de Supabase).
- `public.v_org_uuid`: tabla con RLS y sin políticas (nadie la lee desde la API); confirmar si se usa o eliminar.
