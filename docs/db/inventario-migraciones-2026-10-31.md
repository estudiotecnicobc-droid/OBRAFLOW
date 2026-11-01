# Inventario de migraciones — repo vs. producción (31/10/2026)

Relevamiento de solo lectura sobre el proyecto Supabase «Obra Flow». Para cada migración del repo se buscaron en el catálogo de producción los objetos que crea (tablas, columnas, funciones, políticas, índices, triggers). Las migraciones que solo cargan o corrigen datos no se pueden verificar así.

## Resumen
- Registro de migraciones de Supabase (`schema_migrations`): **9 entradas**; el resto se aplicó a mano desde el editor SQL.
- De 66 archivos: 44 aplicadas, 2 parciales, 3 no aplicadas, 17 sin objetos verificables.
- En producción había objetos que **ningún archivo del repo crea**: 9 funciones, 61 políticas y 2 triggers. Ahora están en `071_baseline_objetos_de_produccion.sql`, salvo las políticas peligrosas que elimina la 070.
- La `066_recuperar_insumos_tareas_importadas` estaba aplicada y no estaba en el repo: recuperada desde `schema_migrations`.

## Hallazgos que requieren decisión
1. **CRÍTICO — `organization_members`** con políticas `true` para cualquier usuario logueado → PR #54 (migración 070).
2. **060 no aplicada:** no existe `price_index_sync_runs`. `api/sync-indices.ts` escribe ahí al terminar, así que la sincronización automática diaria de CAC/ICC falla; `price_indices` tiene una sola fila (icc_mano_obra, cargada a mano). Aplicar 060.
3. **018 no aplicada:** falta `budget_cost_snapshots` y `snapshot_budget_costs`, `get_budget_cost_staleness`, `get_budget_for_calculator`. Lo usa `services/budgetSnapshotService.ts`: esas funciones fallan en producción. Decidir: aplicar 018 o retirar el servicio.
4. **003 parcial:** faltan `tasks.quality_controls`, `task_yields.commercial_unit` y `task_yields.conversion_factor`; el código actual no los usa. Se puede dejar.
5. **020 no aplicada:** `seed_material_codes` no se usa. Se puede dejar.
6. **007 parcial:** sus políticas fueron reemplazadas en producción por las `*_member` (equivalentes, chequean `is_org_member`).

## Recomendación de proceso
- Aplicar toda migración nueva con el registro de Supabase (`supabase db push` o el MCP), no con el editor SQL, para que quede en `schema_migrations`.
- Registrar como aplicadas las que ya lo están (`supabase migration repair --status applied <versión>`), una vez decidido el estado de 003/018/020/060.

## Detalle por archivo
| Archivo | Estado | Objetos encontrados | Nota |
|---|---|---|---|
| 001_global_catalog.sql | ✅ aplicada | 8/8 |  |
| 002_clone_master_task_rpc.sql | ✅ aplicada | 5/5 |  |
| 003_quality_controls_commercial_units.sql | ⚠️ parcial | 2/6 | faltan tasks.quality_controls, task_yields.commercial_unit y conversion_factor (el código no los usa) |
| 003_validate_and_test.sql | — solo datos | 0/0 | faltan tasks.quality_controls, task_yields.commercial_unit y conversion_factor (el código no los usa) |
| 004_projects_business_config.sql | ✅ aplicada | 4/4 |  |
| 005_projects_technical_fields.sql | ✅ aplicada | 6/6 |  |
| 006_yield_unique_constraints.sql | — sin objetos verificables | 0/0 |  |
| 007_rls_policies.sql | ⚠️ parcial | 56/102 | 43 políticas reemplazadas en producción por las *_member (fuera del repo; ahora en 071) |
| 008_cost_versioning.sql | ✅ aplicada | 41/41 |  |
| 009_cost_versioning_hardening.sql | ✅ aplicada | 8/8 |  |
| 010_link_resources.sql | ✅ aplicada | 13/13 |  |
| 011_service_role_bypass.sql | ✅ aplicada | 1/1 |  |
| 012_project_dependencies.sql | ✅ aplicada | 1/1 |  |
| 013_project_calendar_labor.sql | ✅ aplicada | 9/9 |  |
| 014_budget_items_sort_order.sql | ✅ aplicada | 1/1 |  |
| 015_consolidated_calculator_rpc.sql | ✅ aplicada | 1/1 |  |
| 016_apu_technical_report_rpc.sql | ✅ aplicada | 1/1 |  |
| 017_commercial_units_and_constraints.sql | ✅ aplicada | 4/4 |  |
| 018_budget_cost_snapshots.sql | ❌ no aplicada | 0/9 | falta budget_cost_snapshots y sus 3 funciones; los usa services/budgetSnapshotService.ts |
| 019_extended_seed_data.sql | ✅ aplicada | 3/3 |  |
| 020_add_code_to_base_tables.sql | ✅ aplicada | 6/6 | falta seed_material_codes (no se usa) |
| 020_material_code_aliases.sql | ❌ no aplicada | 0/1 | falta seed_material_codes (no se usa) |
| 021_commercial_fields_on_catalog_tables.sql | ✅ aplicada | 4/4 |  |
| 022_commercial_rules.sql | ✅ aplicada | 4/4 |  |
| 023_seed_revestimiento_materials.sql | ✅ aplicada | 1/1 |  |
| 029_t1034_vigas_fundacion.sql | — solo datos | 0/0 |  |
| 030_repair_material_prices_fn.sql | ✅ aplicada | 1/1 |  |
| 031_resync_org_material_prices.sql | ✅ aplicada | 1/1 |  |
| 032_t1033_complete_reset.sql | — solo datos | 0/0 |  |
| 033_t1034_fix_acero.sql | — solo datos | 0/0 |  |
| 034_steel_pricing_architecture.sql | — solo datos | 0/0 |  |
| 035_seed_structural_families_fun_004_005_006.sql | — solo datos | 0/0 |  |
| 036_seed_hormigon_encofrado_fun003.sql | — solo datos | 0/0 |  |
| 037_apu_source_metadata.sql | ✅ aplicada | 1/1 |  |
| 038_billing_schema.sql | ✅ aplicada | 16/16 |  |
| 039_billing_seed.sql | ✅ aplicada | 3/3 |  |
| 040_computation_schema.sql | ✅ aplicada | 20/20 |  |
| 041_canonical_materials_morteros.sql | ✅ aplicada | 1/1 |  |
| 042_apu_morteros.sql | ✅ aplicada | 1/1 |  |
| 043a_apu_mam_rev.sql | ✅ aplicada | 1/1 |  |
| 044_canonical_materials_exc_mam.sql | ✅ aplicada | 1/1 |  |
| 045_consolidated_rpc_v2.sql | ✅ aplicada | 1/1 |  |
| 046_fix_steel_unit_in_apu_materials.sql | — sin objetos verificables | 0/0 |  |
| 047_fix_steel_unit_in_project_materials.sql | — sin objetos verificables | 0/0 |  |
| 048_master_admin_audit.sql | ✅ aplicada | 21/21 |  |
| 049_global_materials_write.sql | ✅ aplicada | 3/3 |  |
| 050_allow_null_organization_id_in_master_materials.sql | — sin objetos verificables | 0/0 |  |
| 051_global_tasks_unique_constraints.sql | ✅ aplicada | 2/2 |  |
| 052_global_materials_select_for_all.sql | ✅ aplicada | 1/1 |  |
| 053_master_materials_global_import_tracking.sql | ✅ aplicada | 7/7 |  |
| 054_master_materials_global_resource_id.sql | ✅ aplicada | 3/3 |  |
| 055_reports_consumption_schema_bridge.sql | ✅ aplicada | 5/5 |  |
| 056_fix_catalog_task_yields_commercial_columns.sql | ✅ aplicada | 2/2 |  |
| 057_fix_resources_commercial_columns.sql | ✅ aplicada | 3/3 |  |
| 058_master_materials_technical_metadata.sql | ✅ aplicada | 3/3 |  |
| 059_price_indices_and_budget_versions.sql | ✅ aplicada | 10/10 |  |
| 060_price_index_sync_runs.sql | ❌ no aplicada | 0/3 | falta price_index_sync_runs; la usa api/sync-indices.ts (cron diario) |
| 061_catalogo_obraflow_presupuesto_rapido.sql | — solo datos | 0/0 |  |
| 062_base_maestra_obraflow_rubros.sql | — solo datos | 0/0 |  |
| 063_pintura_ampliada.sql | — solo datos | 0/0 |  |
| 064_project_cover_images.sql | ✅ aplicada (políticas en storage.objects) | 1/5 |  |
| 065_catalogo_durlock.sql | — solo datos | 0/0 |  |
| 067_fix_get_org_entitlements_membership.sql | ✅ aplicada | 1/1 |  |
| 20261026031101_secure_master_materials_revoke_anon_access.sql | — sin objetos verificables | 0/0 |  |
| 20261026031937_secure_privileged_catalog_mutations.sql | ✅ aplicada | 1/1 |  |
| 20261026032149_restrict_remaining_privileged_rpcs_to_authenticated.sql | — sin objetos verificables | 0/0 |  |
