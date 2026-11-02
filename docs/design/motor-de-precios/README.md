# Motor de precios — diseños en revisión (octubre 2026)

Reúne en un solo lugar los diseños del motor de precios que estaban repartidos en los PRs #28, #30, #33, #34 y #35 (26/10/2026). **Nada de esto está aplicado ni desplegado**: son documentos de revisión. Se retoma como etapa propia después de los bloqueantes de la beta (coherencia de totales y planillas en Supabase).

Consolidado el 01/11/2026. Los PRs originales se cerraron; sus ramas siguen en GitHub con el código de prototipo.

## Objetivo

Una sola fuente de verdad para el precio de cada insumo en cada presupuesto, con origen trazable (catálogo general, empresa, proveedor, ajuste de obra) y presupuestos históricos reproducibles, sin cálculos paralelos en distintas pantallas.

## Fases

| Fase | Qué propone | Documentos | Estado |
|---|---|---|---|
| 2 | Resolvedor de precios en PostgreSQL: `resolve_reference_price` (SECURITY INVOKER), tipo `resolved_reference_price` y tabla `project_price_overrides` con RLS. Modos `CURRENT`, `AS_OF`, `FROZEN` (falla hasta tener snapshot) y `LEGACY_FALLBACK` (no utilizable). Sin conversión tácita de unidad ni moneda. | `phase2_resolve_reference_price_draft.sql`, `phase2_resolver_integration_review.md` | Borrador; propone integrarse a `calculate_consolidated_resources` sin cambiar su firma |
| 3 | Importación asíncrona de listas de precios en CSV: bucket privado, cola `pgmq`, tablas `price_import_batches` / `price_import_rows`, carga por partes con checkpoints. | `phase3_async_price_import_review.md`, `phase3_async_price_import_review.sql`, `phase3_storage_csv_infrastructure_review.sql` | Borrador con bloqueantes (CSV, permisos, leases) |
| 4 | Homologación con proveedores: `price_suppliers`, `supplier_products`, `price_observations`; normalización de SKU, moneda y unidad. | `phase4_supplier_homologation_review.sql` | Borrador |
| 5 | Idempotencia del worker (ACK + commit atómico), aprobación humana de equivalencias, sugerencias con IA y prueba de 100.000 filas. | `phase5_worker_atomic_ack_idempotency.sql`, `phase5_approve_supplier_mapping_review.sql`, `phase5_ai_suggester_system_prompt.md`, `phase5_csv_100k_stress_plan.md`, `phase5_staging_react_design.md` | Borrador |
| 7 | Orden de ejecución en staging y validaciones mínimas. | `phase7_staging_execution_order.md` | Runbook para un proyecto Supabase de staging independiente |

## Dónde quedó el código de prototipo

No se trae a `main` porque no está listo para producción:

- **PR #33** (`design/phase3-async-price-import-20261026`): funciones `price-import-start` y `price-import-worker`.
- **PR #34** (`design/phase5-homologation-staging-idempotency-20261026`): además, `price-mapping-suggest`, la pantalla `PriceHomologationPage` con su hook y el generador `scripts/pricing/generate_mock_prices.mjs`.
- **PR #35** (`feature/staging-integration`): harness local que convierte las fases en migraciones de 14 dígitos, con seed sintético y runbook. **Renombra migraciones existentes** (`0200_…`, `0431_…`) y agrega `000_legacy_base_schema.sql`: no usar contra el historial real sin conciliarlo primero con el inventario de la Tanda 1 (PR #55, migración 071).
- **PR #28** (`chore/align-agents-react-vite-pricing-audit-20261026`): definiciones de agentes en `.claude/`, incorporadas en este mismo PR.

## Hallazgos de la auditoría del 26/10 (PR #28)

- 585 materiales en `master_materials` y 6 snapshots de recursos.
- 66 componentes de APU vinculados a `master_materials`, ninguno solo a `resources`; 31 sin vínculo y 7 anidados.
- **No unificar precios con una sincronización destructiva de columnas.**

## Antes de retomarlo

1. Cerrar la coherencia de totales: mismo costo directo, al centavo, en Inicio, Presupuesto y la base, y estable al recargar.
2. Conciliar estos borradores con el esquema real (inventario de la Tanda 1, migraciones 066 a 073 ya aplicadas).
3. Validarlos primero en un entorno local y después en un proyecto de staging independiente. Nunca contra la URL de producción.
4. Decidir el modo `FROZEN` junto con el estado del presupuesto (borrador / enviado / aprobado) y las versiones selladas, que comparten la migración.
