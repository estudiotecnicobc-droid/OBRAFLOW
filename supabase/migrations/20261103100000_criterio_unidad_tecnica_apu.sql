-- =============================================================================
-- Migración 20261103100000: documentación del criterio "unidad técnica única"
-- Fecha: 2026-11-03
--
-- Fija por COMMENT el criterio que ya aplica calculate_consolidated_resources
-- (057) y freeze_budget_prices (100009): en el APU la cantidad y el precio
-- están siempre en la unidad técnica del componente; `conversion_factor` NO
-- interviene en el costo — es evidencia para calcular cantidades de compra
-- en unidad comercial. La única conversión comercial→técnica ocurre una vez,
-- al normalizar el precio del proveedor (`price_observations.unit_factor`,
-- aplicado por la homologación en `normalized_price`).
--
-- Esta migración NO cambia tablas, funciones ni datos. Solo documenta el
-- criterio para que quede explícito en la DB. El motor TS fue alineado en el
-- mismo PR (services/pricing/apuPricing.ts y services/recursiveCostEngine.ts
-- dejan de multiplicar el precio por `conversion_factor` y marcan
-- UNIT_MISMATCH ante unidades distintas sin conversión).
--
-- Pendiente separado (PR 2): unificar la convención de `master_materials.unit_price`
-- a unidad técnica (hoy convive con precios en unidad comercial para
-- materiales con `conversion_factor` ≠ 1), con migración de datos y backup.
-- =============================================================================
BEGIN;

COMMENT ON COLUMN public.master_task_materials.conversion_factor IS
  'Unidades técnicas (de la columna unit) por 1 unidad comercial. '
  'No interviene en el costo del APU: cantidad y precio están siempre en unidad técnica. '
  'Usado solo para derivar cantidades de compra: purchaseQty = CEIL(quantity / conversion_factor). '
  'La conversión comercial→técnica se hace una vez, al normalizar el precio del proveedor en la homologación.';

COMMENT ON COLUMN public.budget_cost_snapshot_prices.apu_conversion_factor IS
  'master_task_materials.conversion_factor en el momento del congelado (COALESCE 1). '
  'Evidencia inmutable; NO se aplica al unit_price congelado — ese precio ya está en unidad técnica.';

COMMENT ON COLUMN public.budget_cost_snapshot_prices.supplier_unit_factor IS
  'price_observations.unit_factor de la observación de referencia (NULL si fuente ≠ SUPPLIER_OBSERVED). '
  'Factor comercial→técnico ya aplicado por la homologación al calcular normalized_price. Evidencia solamente.';

COMMENT ON FUNCTION public.calculate_consolidated_resources(jsonb, text, date) IS
  'Agrega recursos de un conjunto de APUs. Criterio de unidades: cantidad y precio están siempre en la '
  'unidad técnica del componente. conversion_factor viene como evidencia (para pintar unidades de compra), '
  'nunca se multiplica por el precio. Reservar la conversión comercial→técnica para la homologación de proveedores.';

COMMENT ON FUNCTION public.freeze_budget_prices(uuid, uuid, date) IS
  'Congela el detalle de precios de un presupuesto en budget_cost_snapshots + budget_cost_snapshot_prices. '
  'Reutiliza el precio tal cual lo devuelve resolve_reference_price (unidad técnica) y guarda '
  'apu_conversion_factor / supplier_unit_factor como evidencia inmutable (no se reaplican).';

COMMIT;
