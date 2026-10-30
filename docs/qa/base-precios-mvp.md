# QA base de precios

## Sin bases remotas

Ejecutar pruebas unitarias y compilación con dependencias del lockfile. Las pruebas embebidas de PostgreSQL verifican funciones y roles en una base efímera; no sustituyen Supabase Storage, colas, API ni concurrencia real.

Comandos: `npm test`, `npm run build`, `npm run lint`. Vitest excluye tests/e2e porque esos archivos pertenecen a `npm run test:e2e` (Playwright).

Resultado primera entrega: 14 pruebas nuevas de PostgreSQL pasan y build pasa. El chequeo de tipos reporta errores en BudgetEditor, Dashboard, MasterMaterialsPanel, useBudgetSummary, usePlan, servicios de billing/importación/APU, BudgetCostComparisonPanel y ReportPreviewModal; esos archivos no fueron modificados por esta entrega. No se declara el repositorio libre de errores de tipos ni se ejecutó Playwright contra una aplicación conectada.

## Reanudación en obraflow-local-staging

1. Verificar que Docker esté activo y seleccionar exactamente supabase_db_obraflow-local-staging. No reiniciar, borrar ni resetear bases.
2. Consultar el lote confirmado, distribución de estados, supplier_products del SKU y price_observations del lote. Comparar con el antecedente y detenerse ante diferencias inexplicadas.
3. Identificar organization_id y usuario editor de ese tenant sin inventar IDs. Verificar material local 22222222-2222-4222-8222-222222222222 y proveedor 33333333-3333-4333-8333-333333333333.
4. Con sesión de usuario local, aprobar SKU_000002_AR con factor 1 únicamente si aún falta. Repetir la aprobación idéntica y comprobar misma identidad, autor y fecha.
5. Ejecutar worker acotado; verificar observación normalizada, mapped y ausencia de duplicados en reintento. No procesar 99.990 filas para demostrar un solo precio.
6. Verificar aislamiento con anon, viewer, editor y otro tenant. Verificar material ajeno y proyecto de otro tenant, también siendo miembro de ambos.
7. No promover el PR #35 hasta tener pruebas de proveedor → resolvedor → APU → presupuesto → FROZEN y advisors sin pendientes materiales.
