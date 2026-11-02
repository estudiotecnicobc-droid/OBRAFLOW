-- =============================================================================
-- Rollback de la migración 20261103100100_master_materials_precio_tecnico_unico
-- Fecha: 2026-11-03
--
-- IMPORTANTE: este archivo NO está en supabase/migrations/ para que la CLI
-- (supabase db push / supabase migration up) nunca lo aplique automáticamente.
-- Se corre manualmente desde el SQL Editor del dashboard, SOLO en caso de que
-- la migración haya producido valores incorrectos y antes de que haya tráfico
-- de carga de precios desde la UI (porque la UI nueva ya guarda técnico y una
-- reversión duplicaría la unidad para esas filas).
--
-- Pasos:
--   1. Restaura unit_price desde master_materials_precio_comercial_backup.
--   2. Revierte unit de los 4 hierros a 'barra'.
--   3. Marca price_unit_basis = 'commercial_legacy'.
--   4. Reinicia last_known_unit_price a 0 en los componentes afectados (quedará
--      que resync_org_material_prices lo recalcule la próxima vez).
--   5. Vacía la tabla de backup.
--
-- Verificación previa a correr este script:
--   SELECT COUNT(*) FROM public.master_materials_precio_comercial_backup;
-- debe coincidir con el número de filas que esperás revertir.
-- =============================================================================
BEGIN;

-- 1. Restaurar unit_price y unit originales
UPDATE public.master_materials mm
   SET unit_price       = b.old_unit_price,
       unit             = b.old_unit,
       price_unit_basis = 'commercial_legacy',
       updated_at       = now()
  FROM public.master_materials_precio_comercial_backup b
 WHERE mm.id = b.id;

-- 2. Reiniciar last_known_unit_price para los componentes afectados.
--    No se restaura al valor previo porque el valor previo podría haber sido
--    comercial o técnico (dependiendo de si 030/031 ya había corrido). Dejar
--    en 0 fuerza a la próxima resincronización a recalcular desde cero.
UPDATE public.master_task_materials
   SET last_known_unit_price = 0
 WHERE master_material_id IN (SELECT id FROM public.master_materials_precio_comercial_backup);

-- 3. Vaciar backup (append-only pero se puede truncar en caso de reversión)
TRUNCATE public.master_materials_precio_comercial_backup;

-- 4. Verificación
DO $post$
DECLARE v_tech int;
BEGIN
  SELECT COUNT(*) INTO v_tech FROM public.master_materials WHERE price_unit_basis = 'technical';
  IF v_tech > 0 THEN
    RAISE EXCEPTION 'Reversión incompleta: todavía hay % filas marcadas como technical', v_tech;
  END IF;
  RAISE NOTICE 'Reversión OK: todas las filas vuelven a commercial_legacy';
END $post$;

COMMIT;
