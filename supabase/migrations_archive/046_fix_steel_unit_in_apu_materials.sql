-- 046_fix_steel_unit_in_apu_materials.sql
-- Data fix: master_task_materials rows with unit='barra' (pre-fix APUs).
-- Those rows were created when useUnifiedMaterials exposed unit='barra' for
-- commercial-diameter steel (Hierro nervado ∅X). The cost was already $/kg
-- but quantities were stored as if in barras → wrong totals.
--
-- Fix: multiply quantity by the material's conversion_factor and set unit='kg'.
-- Idempotent: WHERE unit = 'barra' — safe to run multiple times.

UPDATE master_task_materials mtm
SET
  quantity = mtm.quantity * mm.conversion_factor,
  unit     = 'kg'
FROM master_materials mm
WHERE mtm.master_material_id = mm.id
  AND mtm.unit = 'barra'
  AND mm.conversion_factor IS NOT NULL
  AND mm.conversion_factor > 1
  AND (mm.name ILIKE '%hierro%' OR mm.name ILIKE '%acero%');
