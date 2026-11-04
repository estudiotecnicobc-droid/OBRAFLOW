-- ============================================================
-- MIGRATION 032 — T1033 reset quirúrgico completo
--
-- Situación confirmada al momento de este SQL:
--   - master_task_materials contiene composición incorrecta insertada por 027:
--       · ACERO EN BARRAS (h=0.00035) | 0.35 kg | precio 0  ← WRONG nombre, WRONG qty
--       · HORMIGÓN ELABORADO H-21    | 1.05 m3 | precio 0  ← correcto qty, sin precio
--   - master_task_labor: OFICIAL HORMIGON (1.0) + AYUDANTE HORMIGON (1.5)
--       ← presumiblemente correcto, NO SE TOCA
--   - T1034 NO SE TOCA
--
-- Acción:
--   1. DELETE all master_task_materials WHERE master_task_id = v_t1033
--   2. Resolver FK + precio desde master_materials (post 031)
--      Fallback a materials si aún sin precio
--   3. INSERT composición correcta:
--       · Hormigón Elaborado H-21 | m3 | 1.05
--       · Acero ADN 420           | kg | 50.0
--
-- PREREQUISITO:
--   Ejecutar 031_resync_org_material_prices.sql ANTES de este bloque
--   para que master_materials ya tenga precios corregidos.
--
-- IDEMPOTENTE: re-ejecutar elimina la composición y la recrea → mismo resultado.
-- NO toca: master_task_labor, T1034, budget_items, estructura DB.
-- ============================================================

DO $$
DECLARE
  -- IDs exactos confirmados en sesión anterior
  v_t1033    CONSTANT uuid := 'bca7fb59-83a2-447f-a3fa-1c2e35581eb5';
  v_org_text CONSTANT text := '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f';
  v_org_uuid CONSTANT uuid := '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f';

  -- FK y precios para cada material
  v_horm_id     uuid;
  v_horm_price  numeric := 0;
  v_acero_id    uuid;
  v_acero_price numeric := 0;

  v_deleted_ct  int;
  v_task_exists boolean;
BEGIN

  -- ── 0. Verificar que v_t1033 existe y pertenece a la org canónica ───────────
  SELECT EXISTS(
    SELECT 1 FROM public.master_tasks
    WHERE id = v_t1033 AND organization_id = v_org_uuid
  ) INTO v_task_exists;

  IF NOT v_task_exists THEN
    RAISE EXCEPTION 'T1033 id=% no existe o no pertenece a org %. Abortando.', v_t1033, v_org_uuid;
  END IF;

  -- ── 1. Limpiar SOLO los materiales incorrectos ───────────────────────────────
  -- NO toca master_task_labor (labor ya quedó correcto desde migration 027 fixed).
  DELETE FROM public.master_task_materials
  WHERE master_task_id = v_t1033;

  GET DIAGNOSTICS v_deleted_ct = ROW_COUNT;
  RAISE NOTICE 'T1033: % filas de master_task_materials eliminadas', v_deleted_ct;

  -- ── 2. Resolver Hormigón H-21 ────────────────────────────────────────────────
  -- Fuente prioritaria: master_materials con precio > 0 (post migration 031)
  SELECT id,
    CASE
      WHEN conversion_factor IS NOT NULL AND conversion_factor > 1
      THEN unit_price / conversion_factor
      ELSE unit_price
    END
  INTO v_horm_id, v_horm_price
  FROM public.master_materials
  WHERE organization_id = v_org_text
    AND is_active = true
    AND unit_price > 0
    AND (
      -- Match flexible: cubre variantes H-21 / H21 / H 21
      REGEXP_REPLACE(
        LOWER(TRANSLATE(TRIM(name),
          'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï',
          'AEIOUAEIOUaeiouaeiouNnUuIi')),
        '[-\s]+', '', 'g')
      LIKE '%hormig%h21%'
    )
  ORDER BY unit_price DESC NULLS LAST
  LIMIT 1;

  -- Fallback: materials legacy (sin FK, solo snapshot)
  IF v_horm_price IS NULL OR v_horm_price = 0 THEN
    SELECT cost INTO v_horm_price
    FROM public.materials
    WHERE organization_id = v_org_text
      AND cost > 0
      AND (
        REGEXP_REPLACE(
          LOWER(TRANSLATE(TRIM(name),
            'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï',
            'AEIOUAEIOUaeiouaeiouNnUuIi')),
          '[-\s]+', '', 'g')
        LIKE '%hormig%'
        AND LOWER(name) NOT LIKE '%limpieza%'
      )
    ORDER BY cost DESC NULLS LAST
    LIMIT 1;
    v_horm_id := NULL;  -- sin FK, precio es solo referencia
    RAISE NOTICE 'T1033: Hormigón H-21 sin FK en master_materials. Usando snapshot de materials: %', v_horm_price;
  ELSE
    RAISE NOTICE 'T1033: Hormigón H-21 → master_material_id=%, precio_técnico=%', v_horm_id, v_horm_price;
  END IF;

  -- ── 3. Resolver Acero ADN 420 ─────────────────────────────────────────────────
  SELECT id,
    CASE
      WHEN conversion_factor IS NOT NULL AND conversion_factor > 1
      THEN unit_price / conversion_factor
      ELSE unit_price
    END
  INTO v_acero_id, v_acero_price
  FROM public.master_materials
  WHERE organization_id = v_org_text
    AND is_active = true
    AND unit_price > 0
    AND LOWER(unit) IN ('kg', 'kgs')
    AND (
      LOWER(name) LIKE '%acero adn%'
      OR LOWER(name) LIKE '%acero dn%'
      OR (code IS NOT NULL AND LOWER(code) LIKE '%adn%')
    )
  ORDER BY unit_price DESC NULLS LAST
  LIMIT 1;

  -- Fallback: materials legacy
  IF v_acero_price IS NULL OR v_acero_price = 0 THEN
    SELECT cost INTO v_acero_price
    FROM public.materials
    WHERE organization_id = v_org_text
      AND cost > 0
      AND LOWER(unit) IN ('kg', 'kgs')
      AND (LOWER(name) LIKE '%acero%' OR LOWER(name) LIKE '%hierro%')
    ORDER BY cost DESC NULLS LAST
    LIMIT 1;
    v_acero_id := NULL;
    RAISE NOTICE 'T1033: Acero ADN 420 sin FK en master_materials. Usando snapshot de materials: %', v_acero_price;
  ELSE
    RAISE NOTICE 'T1033: Acero ADN 420 → master_material_id=%, precio_técnico=%', v_acero_id, v_acero_price;
  END IF;

  -- ── 4. Insertar composición correcta ─────────────────────────────────────────
  INSERT INTO public.master_task_materials
    (id, master_task_id, master_material_id, material_name, unit, quantity, last_known_unit_price)
  VALUES
    -- Hormigón: 1.05 m3/m3 (5% desperdicio)
    (gen_random_uuid(), v_t1033, v_horm_id,
     'Hormigón Elaborado H-21', 'm3', 1.05,
     COALESCE(v_horm_price, 0)),
    -- Acero: 50 kg/m3 (bases de H.A.)
    (gen_random_uuid(), v_t1033, v_acero_id,
     'Acero ADN 420', 'kg', 50.0,
     COALESCE(v_acero_price, 0));

  RAISE NOTICE '────────────────────────────────────────────────────────';
  RAISE NOTICE 'T1033 reset quirúrgico COMPLETO';
  RAISE NOTICE '  Hormigón Elaborado H-21 | m3  | qty=1.05  | precio=%', COALESCE(v_horm_price, 0);
  RAISE NOTICE '  Acero ADN 420           | kg  | qty=50.0  | precio=%', COALESCE(v_acero_price, 0);
  RAISE NOTICE '  master_task_labor: NO TOCADO (labor validada desde migration 027)';
  RAISE NOTICE '────────────────────────────────────────────────────────';

END $$;
