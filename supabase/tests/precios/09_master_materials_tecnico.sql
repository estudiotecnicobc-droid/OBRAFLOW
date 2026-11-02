-- Test de la migración 20261103100100: unit_price técnico único en master_materials.
-- Precondición: fixture_master_materials.sql ya aplicado + migración ya corrida (una vez).
-- Verifica totales, idempotencia (segunda ejecución noop), hierros, UPDATE dirigido de
-- last_known_unit_price, exclusión manual de la pintura látex, y backup correcto.

DO $test$
DECLARE
  v_total_backup           int;
  v_marked_technical       int;
  v_hierros_kg             int;
  v_pintura_lkup           numeric;
  v_cemento_portland_tech  numeric;
  v_cal_hidraulica_tech    numeric;
  v_hierro_12_tech         numeric;
  v_cal_hidraulica_lkup    numeric;
  v_cemento_demo_lkup      numeric;
BEGIN
  -- 1. Backup contiene las 80 filas de factor > 1
  SELECT COUNT(*) INTO v_total_backup FROM public.master_materials_precio_comercial_backup;
  IF v_total_backup <> 80 THEN
    RAISE EXCEPTION 'Backup: esperados 80, obtenidos %', v_total_backup;
  END IF;

  -- 2. 80 filas marcadas 'technical' en master_materials
  SELECT COUNT(*) INTO v_marked_technical
    FROM public.master_materials WHERE price_unit_basis = 'technical';
  IF v_marked_technical <> 80 THEN
    RAISE EXCEPTION 'Marcadas technical: esperadas 80, obtenidas %', v_marked_technical;
  END IF;

  -- 3. Hierros: unit = 'kg' (los 4 ids explícitos)
  SELECT COUNT(*) INTO v_hierros_kg
    FROM public.master_materials
    WHERE id IN (
      '47007849-ac1b-43f8-8c61-f237f19e6516',
      '7fa33df3-1823-4a45-b126-30e20bad516a',
      '814e64a6-67fe-4074-ae35-e32d39925a3d',
      '998cd42b-0929-409b-a8ab-536ef8d07504'
    ) AND unit = 'kg';
  IF v_hierros_kg <> 4 THEN
    RAISE EXCEPTION 'Hierros con unit=kg: esperados 4, obtenidos %', v_hierros_kg;
  END IF;

  -- 4. Spot checks de precios técnicos
  SELECT unit_price INTO v_cemento_portland_tech
    FROM public.master_materials WHERE id = '81b2191d-275f-43e0-80ed-608744322162';
  IF ABS(v_cemento_portland_tech - 310) > 0.01 THEN
    RAISE EXCEPTION 'Cemento Portland org_demo: esperado 310, obtenido %', v_cemento_portland_tech;
  END IF;

  SELECT unit_price INTO v_cal_hidraulica_tech
    FROM public.master_materials WHERE id = '74e8a96e-d412-4c1f-b11f-57a55807f4b2';
  IF ABS(v_cal_hidraulica_tech - 3.80) > 0.01 THEN
    RAISE EXCEPTION 'Cal hidráulica 3e5c: esperado 3.80, obtenido %', v_cal_hidraulica_tech;
  END IF;

  SELECT unit_price INTO v_hierro_12_tech
    FROM public.master_materials WHERE id = '7fa33df3-1823-4a45-b126-30e20bad516a';
  IF ABS(v_hierro_12_tech - 960.02) > 0.01 THEN
    RAISE EXCEPTION 'Hierro Ø12: esperado 960.02, obtenido %', v_hierro_12_tech;
  END IF;

  -- 5. last_known_unit_price actualizado para cemento Portland demo (comercial 15500 → técnico 310)
  SELECT last_known_unit_price INTO v_cemento_demo_lkup
    FROM public.master_task_materials WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-000000000002';
  IF ABS(v_cemento_demo_lkup - 310) > 0.01 THEN
    RAISE EXCEPTION 'last_known_unit_price cemento demo: esperado 310, obtenido %', v_cemento_demo_lkup;
  END IF;

  -- 6. Cal hidráulica vacía (0.0000) ahora toma el técnico (3.80)
  SELECT last_known_unit_price INTO v_cal_hidraulica_lkup
    FROM public.master_task_materials WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-000000000005';
  IF ABS(v_cal_hidraulica_lkup - 3.80) > 0.01 THEN
    RAISE EXCEPTION 'last_known_unit_price cal hidráulica (vacía): esperado 3.80, obtenido %', v_cal_hidraulica_lkup;
  END IF;

  -- 7. Pintura látex con valor manual (72.50) NO fue tocada
  SELECT last_known_unit_price INTO v_pintura_lkup
    FROM public.master_task_materials WHERE id = '6bdf5331-060a-4424-bd9c-c50be7f82b7c';
  IF ABS(v_pintura_lkup - 72.50) > 0.01 THEN
    RAISE EXCEPTION 'Pintura látex (excluida): debía quedarse en 72.50, obtenido %', v_pintura_lkup;
  END IF;

  RAISE NOTICE 'OK: backup=80, technical=80, hierros=4, spot checks OK, pintura intacta';
END $test$;

-- 8. Idempotencia: corremos la migración otra vez; backup y technical no deben cambiar.
\i ../../migrations/20261103100100_master_materials_precio_tecnico_unico.sql

DO $test_idempotent$
DECLARE
  v_total_backup     int;
  v_marked_technical int;
  v_cal_lkup         numeric;
  v_pintura_lkup     numeric;
BEGIN
  SELECT COUNT(*) INTO v_total_backup FROM public.master_materials_precio_comercial_backup;
  SELECT COUNT(*) INTO v_marked_technical FROM public.master_materials WHERE price_unit_basis = 'technical';
  SELECT last_known_unit_price INTO v_cal_lkup
    FROM public.master_task_materials WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-000000000005';
  SELECT last_known_unit_price INTO v_pintura_lkup
    FROM public.master_task_materials WHERE id = '6bdf5331-060a-4424-bd9c-c50be7f82b7c';

  IF v_total_backup <> 80 THEN
    RAISE EXCEPTION 'Idempotencia FALLÓ: backup pasó a %', v_total_backup;
  END IF;
  IF v_marked_technical <> 80 THEN
    RAISE EXCEPTION 'Idempotencia FALLÓ: marcadas technical pasaron a %', v_marked_technical;
  END IF;
  IF ABS(v_cal_lkup - 3.80) > 0.01 THEN
    RAISE EXCEPTION 'Idempotencia FALLÓ: cal hidráulica lkup pasó a %', v_cal_lkup;
  END IF;
  IF ABS(v_pintura_lkup - 72.50) > 0.01 THEN
    RAISE EXCEPTION 'Idempotencia FALLÓ: pintura látex lkup pasó a %', v_pintura_lkup;
  END IF;

  RAISE NOTICE 'Idempotencia OK: segunda corrida no cambió nada';
END $test_idempotent$;
