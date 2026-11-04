-- 047_fix_steel_unit_in_project_materials.sql
-- Data fix: project-level materials + task_yields rows created when
-- master_task_materials still had unit='barra' (pre-046).
--
-- Background:
--   buildImportPayload copies mtm.unit → materials.unit.
--   useUnifiedMaterials always stored lastKnownUnitPrice as $/kg (technical price),
--   so materials.cost = $/kg even when unit='barra'.
--   task_yields.quantity was entered by users in barras (not kg).
--
--   Result: calculateUnitPrice (calculationService.ts) computed
--   materials.cost($/kg) × task_yields.quantity(barras) = wrong subtotal.
--
-- Fix (two steps, order-dependent — run in a single transaction):
--   Step 1: Multiply task_yields.quantity by the material's conversion_factor
--           (barras → kg). Only touches yields for materials still with unit='barra'.
--   Step 2: Set materials.unit = 'kg' for affected steel materials.
--           After this step, Step 1 won't match any rows on future runs → idempotent.
--
-- Scope:
--   · Only materials with unit='barra', conversion_factor > 1, steel name.
--   · materials.cost is intentionally left untouched — it is already $/kg.

BEGIN;

-- ── Step 1: Fix task_yields quantities (barras → kg) ─────────────────────────
UPDATE task_yields ty
SET quantity = ty.quantity * m.conversion_factor
FROM materials m
WHERE ty.material_id = m.id
  AND m.unit = 'barra'
  AND m.conversion_factor IS NOT NULL
  AND m.conversion_factor > 1
  AND (m.name ILIKE '%hierro%' OR m.name ILIKE '%acero%');

-- ── Step 2: Fix materials.unit from 'barra' to 'kg' for steel ────────────────
-- cost stays as-is (already $/kg from import path).
UPDATE materials
SET unit = 'kg'
WHERE unit = 'barra'
  AND conversion_factor IS NOT NULL
  AND conversion_factor > 1
  AND (name ILIKE '%hierro%' OR name ILIKE '%acero%');

COMMIT;
