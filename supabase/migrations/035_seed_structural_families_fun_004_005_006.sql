-- ============================================================
-- MIGRATION 035 — Seed familias estructurales H.A. (aéreas)
--
-- Siembra en master_tasks + master_task_materials los tres
-- nuevos rubros creados en chandiasCatalog.ts (structuralConfig):
--
--   T1035 → FUN-004: Columna de H.A.         (95  kg/m³ acero)
--   T1036 → FUN-005: Viga de H.A. Aérea      (120 kg/m³ acero)
--   T1037 → FUN-006: Losa Maciza de H.A.     (55  kg/m³ acero)
--
-- ACERO: usa "Acero ADN 420 (Genérico por Cuantía)" (migration 034).
--   · Prioridad explícita al genérico; fallback a cualquier $/kg acero.
--   · NO se usan barras por diámetro — eso es la capa comercial.
--   · Alimenta APU paramétrico / presupuesto inicial.
--
-- ENCOFRADO: NO incluido en el APU base (igual que T1034).
--   · Se calcula paramétricamente en el frontend con structuralConfig.
--   · La fórmula vive en chandiasCatalog.ts → derivedOutputs.
--
-- MANO DE OBRA: OFICIAL HORMIGON + AYUDANTE HORMIGON (igual que T1034).
--   · Si las categorías no existen la migración continúa con WARNING,
--     las tareas quedan creadas con materiales pero sin MO.
--
-- IDEMPOTENTE: DELETE + INSERT (no usa la guardia "skip if exists" de 029,
--   que causó el bug documentado en la migración 033).
--   Re-ejecutar esta migración siempre produce el mismo resultado final.
--
-- PREREQUISITOS (en orden):
--   · 019_extended_seed_data  → Hormigón H-21 en master_materials
--   · 034_steel_pricing_architecture → "Acero ADN 420 (Genérico por Cuantía)"
--
-- NO TOCA: T1033, T1034, budget_items, master_materials, ERPContext.
-- ============================================================

DO $$
DECLARE
  v_org_uuid  CONSTANT uuid := '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f';
  v_org_text  CONSTANT text := '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f';

  -- IDs de tareas (resueltos dinámicamente o creados)
  v_t1035  uuid;
  v_t1036  uuid;
  v_t1037  uuid;

  -- Materiales compartidos (se resuelven una vez para las 3 tareas)
  v_horm_id     uuid;
  v_horm_price  numeric := 0;
  v_acero_id    uuid;
  v_acero_price numeric := 0;

  -- Categorías de mano de obra
  v_lab_ofi  text;
  v_lab_ayu  text;

  v_deleted_ct  int;
BEGIN

  -- Seed/reparación histórica de una organización concreta: no crear
  -- usuarios ni organizaciones artificiales durante un arranque local limpio.
  -- La migración de esquema sigue siendo válida aunque esa organización no exista.
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations WHERE id = v_org_uuid
  ) THEN
    RAISE NOTICE 'Omitiendo 035_seed_structural_families_fun_004_005_006.sql: organización de origen no presente';
    RETURN;
  END IF;


  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE 'MIGRATION 035 — Inicio';

  -- ══════════════════════════════════════════════════════════════════════
  -- 0. Resolver materiales (una sola vez para las 3 tareas)
  -- ══════════════════════════════════════════════════════════════════════

  -- ── Hormigón H-21 (flexible: cubre H-21, H21, H 21) ─────────────────────
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
      REGEXP_REPLACE(
        LOWER(TRANSLATE(TRIM(name),
          'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï',
          'AEIOUAEIOUaeiouaeiouNnUuIi')),
        '[-\s]+', '', 'g')
      LIKE '%hormig%h21%'
    )
  ORDER BY unit_price DESC NULLS LAST
  LIMIT 1;

  IF v_horm_id IS NULL THEN
    RAISE WARNING 'Hormigón H-21 no encontrado en master_materials. last_known_unit_price = 0.';
  ELSE
    RAISE NOTICE 'Hormigón H-21 → id=%, precio_técnico=%', v_horm_id, v_horm_price;
  END IF;

  -- ── Acero ADN 420 Genérico (prioridad al material de migration 034) ──────
  --   Paso 1: buscar "Acero ADN 420 (Genérico por Cuantía)" exacto
  SELECT id, unit_price
  INTO v_acero_id, v_acero_price
  FROM public.master_materials
  WHERE organization_id = v_org_text
    AND is_active = true
    AND unit_price > 0
    AND name = 'Acero ADN 420 (Genérico por Cuantía)'
  LIMIT 1;

  --   Paso 2: fallback — cualquier acero ADN/DN en $/kg
  IF v_acero_id IS NULL THEN
    SELECT id,
      CASE
        WHEN conversion_factor IS NOT NULL AND conversion_factor > 1
        THEN unit_price / conversion_factor   -- $/barra → $/kg
        ELSE unit_price
      END
    INTO v_acero_id, v_acero_price
    FROM public.master_materials
    WHERE organization_id = v_org_text
      AND is_active = true
      AND unit_price > 0
      AND (
        LOWER(name) LIKE '%acero adn%'   OR
        LOWER(name) LIKE '%acero dn%'    OR
        (code IS NOT NULL AND LOWER(code) LIKE '%adn%')
      )
    ORDER BY unit_price DESC NULLS LAST
    LIMIT 1;
  END IF;

  --   Paso 3: fallback final — cualquier hierro/acero con precio
  IF v_acero_id IS NULL THEN
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
      AND (LOWER(name) LIKE '%acero%' OR LOWER(name) LIKE '%hierro%')
    ORDER BY unit_price DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_acero_id IS NULL THEN
    RAISE WARNING 'Acero ADN 420 no encontrado en master_materials. last_known_unit_price = 0.';
    RAISE WARNING 'Ejecutar migration 034 para crear "Acero ADN 420 (Generico por Cuantia)".';
  ELSE
    RAISE NOTICE 'Acero ADN 420 → id=%, precio_técnico=% $/kg', v_acero_id, v_acero_price;
  END IF;

  -- ── Mano de obra (mismo criterio que T1034 en migration 029) ─────────────
  SELECT id::text INTO v_lab_ofi
  FROM public.labor_categories
  WHERE organization_id = v_org_text
    AND UPPER(TRIM(role)) = 'OFICIAL HORMIGON'
  LIMIT 1;

  SELECT id::text INTO v_lab_ayu
  FROM public.labor_categories
  WHERE organization_id = v_org_text
    AND UPPER(TRIM(role)) = 'AYUDANTE HORMIGON'
  LIMIT 1;

  IF v_lab_ofi IS NULL OR v_lab_ayu IS NULL THEN
    RAISE WARNING 'Categorías MO no encontradas (OFICIAL/AYUDANTE HORMIGON). Tareas creadas sin MO.';
  ELSE
    RAISE NOTICE 'MO → OFICIAL=%, AYUDANTE=%', v_lab_ofi, v_lab_ayu;
  END IF;

  RAISE NOTICE '════════════════════════════════════════════════════════════';

  -- ══════════════════════════════════════════════════════════════════════
  -- 1. T1035 — Columna de H.A. (FUN-004, 95 kg/m³ acero)
  -- ══════════════════════════════════════════════════════════════════════

  SELECT id INTO v_t1035
  FROM public.master_tasks
  WHERE organization_id = v_org_uuid
    AND code = 'T1035'
  ORDER BY is_active DESC, created_at DESC
  LIMIT 1;

  IF v_t1035 IS NULL THEN
    v_t1035 := gen_random_uuid();
    INSERT INTO public.master_tasks
      (id, organization_id, code, name, unit, category, daily_yield, description, is_active)
    VALUES
      (v_t1035, v_org_uuid, 'T1035',
       'Columna de H.A.',
       'm3', '05 ESTRUCTURA HA', 2,
       'Columna estructural de H.A. H-21. 95 kg/m³ de acero ADN 420. Encofrado calculado paramétricamente: 4 caras laterales sin fondo (FUN-004).',
       true);
    RAISE NOTICE 'T1035 creada: id=%', v_t1035;
  ELSE
    UPDATE public.master_tasks SET
      is_active   = true,
      name        = 'Columna de H.A.',
      unit        = 'm3',
      category    = '05 ESTRUCTURA HA',
      daily_yield = 2
    WHERE id = v_t1035;
    RAISE NOTICE 'T1035 existente actualizada: %', v_t1035;
  END IF;

  -- Composición idempotente: DELETE + INSERT
  DELETE FROM public.master_task_materials
  WHERE master_task_id = v_t1035;
  GET DIAGNOSTICS v_deleted_ct = ROW_COUNT;
  RAISE NOTICE 'T1035: % filas de materiales eliminadas', v_deleted_ct;

  INSERT INTO public.master_task_materials
    (id, master_task_id, master_material_id, material_name, unit, quantity, last_known_unit_price)
  VALUES
    -- Hormigón: 1.05 m³/m³ (5% de desperdicio sobre volumen teórico)
    (gen_random_uuid(), v_t1035, v_horm_id,
     'Hormigón Elaborado H-21', 'm3', 1.05,
     COALESCE(v_horm_price, 0)),
    -- Acero genérico: 95 kg/m³ (cuantía paramétrica — sin diámetro)
    (gen_random_uuid(), v_t1035, v_acero_id,
     'Acero ADN 420', 'kg', 95.0,
     COALESCE(v_acero_price, 0));

  -- Mano de obra (idempotente)
  IF v_lab_ofi IS NOT NULL AND v_lab_ayu IS NOT NULL THEN
    DELETE FROM public.master_task_labor WHERE master_task_id = v_t1035;
    -- HH/m³ × daily_yield / 9h/día = workers
    -- 4.20 HH/m³ × 2 m³/día / 9 h/día = 0.9333
    INSERT INTO public.master_task_labor
      (id, master_task_id, labor_category_id, labor_category_name, quantity, snapshot_hourly_rate)
    SELECT gen_random_uuid(), v_t1035,
           v_lab_ofi, role, 0.9333, basic_hourly_rate
    FROM public.labor_categories WHERE id::text = v_lab_ofi;

    INSERT INTO public.master_task_labor
      (id, master_task_id, labor_category_id, labor_category_name, quantity, snapshot_hourly_rate)
    SELECT gen_random_uuid(), v_t1035,
           v_lab_ayu, role, 0.9333, basic_hourly_rate
    FROM public.labor_categories WHERE id::text = v_lab_ayu;
  END IF;

  RAISE NOTICE 'T1035 OK → Hormigón 1.05 m³, Acero 95 kg (% $/kg)', COALESCE(v_acero_price, 0);

  -- ══════════════════════════════════════════════════════════════════════
  -- 2. T1036 — Viga de H.A. Aérea (FUN-005, 120 kg/m³ acero)
  -- ══════════════════════════════════════════════════════════════════════

  SELECT id INTO v_t1036
  FROM public.master_tasks
  WHERE organization_id = v_org_uuid
    AND code = 'T1036'
  ORDER BY is_active DESC, created_at DESC
  LIMIT 1;

  IF v_t1036 IS NULL THEN
    v_t1036 := gen_random_uuid();
    INSERT INTO public.master_tasks
      (id, organization_id, code, name, unit, category, daily_yield, description, is_active)
    VALUES
      (v_t1036, v_org_uuid, 'T1036',
       'Viga de H.A. Aérea',
       'm3', '05 ESTRUCTURA HA', 2,
       'Viga aérea de H.A. H-21. 120 kg/m³ de acero ADN 420. Encofrado calculado paramétricamente: fondo + 2 laterales (FUN-005).',
       true);
    RAISE NOTICE 'T1036 creada: id=%', v_t1036;
  ELSE
    UPDATE public.master_tasks SET
      is_active   = true,
      name        = 'Viga de H.A. Aérea',
      unit        = 'm3',
      category    = '05 ESTRUCTURA HA',
      daily_yield = 2
    WHERE id = v_t1036;
    RAISE NOTICE 'T1036 existente actualizada: %', v_t1036;
  END IF;

  DELETE FROM public.master_task_materials
  WHERE master_task_id = v_t1036;
  GET DIAGNOSTICS v_deleted_ct = ROW_COUNT;
  RAISE NOTICE 'T1036: % filas de materiales eliminadas', v_deleted_ct;

  INSERT INTO public.master_task_materials
    (id, master_task_id, master_material_id, material_name, unit, quantity, last_known_unit_price)
  VALUES
    (gen_random_uuid(), v_t1036, v_horm_id,
     'Hormigón Elaborado H-21', 'm3', 1.05,
     COALESCE(v_horm_price, 0)),
    -- Acero genérico: 120 kg/m³ (vigas aéreas, más armadas que fundación)
    (gen_random_uuid(), v_t1036, v_acero_id,
     'Acero ADN 420', 'kg', 120.0,
     COALESCE(v_acero_price, 0));

  IF v_lab_ofi IS NOT NULL AND v_lab_ayu IS NOT NULL THEN
    DELETE FROM public.master_task_labor WHERE master_task_id = v_t1036;
    INSERT INTO public.master_task_labor
      (id, master_task_id, labor_category_id, labor_category_name, quantity, snapshot_hourly_rate)
    SELECT gen_random_uuid(), v_t1036,
           v_lab_ofi, role, 0.9333, basic_hourly_rate
    FROM public.labor_categories WHERE id::text = v_lab_ofi;

    INSERT INTO public.master_task_labor
      (id, master_task_id, labor_category_id, labor_category_name, quantity, snapshot_hourly_rate)
    SELECT gen_random_uuid(), v_t1036,
           v_lab_ayu, role, 0.9333, basic_hourly_rate
    FROM public.labor_categories WHERE id::text = v_lab_ayu;
  END IF;

  RAISE NOTICE 'T1036 OK → Hormigón 1.05 m³, Acero 120 kg (% $/kg)', COALESCE(v_acero_price, 0);

  -- ══════════════════════════════════════════════════════════════════════
  -- 3. T1037 — Losa Maciza de H.A. (FUN-006, 55 kg/m³ acero)
  -- ══════════════════════════════════════════════════════════════════════

  SELECT id INTO v_t1037
  FROM public.master_tasks
  WHERE organization_id = v_org_uuid
    AND code = 'T1037'
  ORDER BY is_active DESC, created_at DESC
  LIMIT 1;

  IF v_t1037 IS NULL THEN
    v_t1037 := gen_random_uuid();
    INSERT INTO public.master_tasks
      (id, organization_id, code, name, unit, category, daily_yield, description, is_active)
    VALUES
      (v_t1037, v_org_uuid, 'T1037',
       'Losa Maciza de H.A.',
       'm3', '05 ESTRUCTURA HA', 4,
       'Losa maciza de H.A. H-21. 55 kg/m³ de acero ADN 420. Cimbra calculada paramétricamente: cara inferior (FUN-006).',
       true);
    RAISE NOTICE 'T1037 creada: id=%', v_t1037;
  ELSE
    UPDATE public.master_tasks SET
      is_active   = true,
      name        = 'Losa Maciza de H.A.',
      unit        = 'm3',
      category    = '05 ESTRUCTURA HA',
      daily_yield = 4
    WHERE id = v_t1037;
    RAISE NOTICE 'T1037 existente actualizada: %', v_t1037;
  END IF;

  DELETE FROM public.master_task_materials
  WHERE master_task_id = v_t1037;
  GET DIAGNOSTICS v_deleted_ct = ROW_COUNT;
  RAISE NOTICE 'T1037: % filas de materiales eliminadas', v_deleted_ct;

  INSERT INTO public.master_task_materials
    (id, master_task_id, master_material_id, material_name, unit, quantity, last_known_unit_price)
  VALUES
    (gen_random_uuid(), v_t1037, v_horm_id,
     'Hormigón Elaborado H-21', 'm3', 1.05,
     COALESCE(v_horm_price, 0)),
    -- Acero genérico: 55 kg/m³ (losa maciza, menos armada que vigas)
    (gen_random_uuid(), v_t1037, v_acero_id,
     'Acero ADN 420', 'kg', 55.0,
     COALESCE(v_acero_price, 0));

  IF v_lab_ofi IS NOT NULL AND v_lab_ayu IS NOT NULL THEN
    DELETE FROM public.master_task_labor WHERE master_task_id = v_t1037;
    INSERT INTO public.master_task_labor
      (id, master_task_id, labor_category_id, labor_category_name, quantity, snapshot_hourly_rate)
    SELECT gen_random_uuid(), v_t1037,
           v_lab_ofi, role, 0.9333, basic_hourly_rate
    FROM public.labor_categories WHERE id::text = v_lab_ofi;

    INSERT INTO public.master_task_labor
      (id, master_task_id, labor_category_id, labor_category_name, quantity, snapshot_hourly_rate)
    SELECT gen_random_uuid(), v_t1037,
           v_lab_ayu, role, 0.9333, basic_hourly_rate
    FROM public.labor_categories WHERE id::text = v_lab_ayu;
  END IF;

  RAISE NOTICE 'T1037 OK → Hormigón 1.05 m³, Acero 55 kg (% $/kg)', COALESCE(v_acero_price, 0);

  -- ══════════════════════════════════════════════════════════════════════
  -- Resumen final
  -- ══════════════════════════════════════════════════════════════════════
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE 'MIGRATION 035 COMPLETA:';
  RAISE NOTICE '  T1035 Columna H.A.     | 05 ESTRUCTURA HA | yield=2 | Horm=1.05m³ Acero=95kg';
  RAISE NOTICE '  T1036 Viga H.A. Aérea  | 05 ESTRUCTURA HA | yield=2 | Horm=1.05m³ Acero=120kg';
  RAISE NOTICE '  T1037 Losa Maciza H.A. | 05 ESTRUCTURA HA | yield=4 | Horm=1.05m³ Acero=55kg';
  RAISE NOTICE '  Acero usado: id=%, precio=% $/kg', v_acero_id, v_acero_price;
  RAISE NOTICE '  Hormigón usado: id=%, precio=% $/m³', v_horm_id, v_horm_price;
  RAISE NOTICE '  MO: ofi=% ayu=%', COALESCE(v_lab_ofi, 'NO ENCONTRADO'), COALESCE(v_lab_ayu, 'NO ENCONTRADO');
  RAISE NOTICE '════════════════════════════════════════════════════════════';

END $$;


-- ── QUERIES DE VERIFICACIÓN POST-MIGRACIÓN ───────────────────────────────────
-- Ejecutar manualmente en Supabase Dashboard para confirmar el resultado.
/*

-- 1. Ver las 3 tareas creadas
SELECT code, name, unit, category, daily_yield, is_active
FROM public.master_tasks
WHERE organization_id = '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f'
  AND code IN ('T1035', 'T1036', 'T1037')
ORDER BY code;

-- 2. Ver composición de materiales
SELECT
  mt.code,
  mt.name AS task_name,
  mtm.material_name,
  mtm.unit,
  mtm.quantity::text,
  mtm.last_known_unit_price::text,
  mm.name AS mm_name,
  mm.unit AS mm_unit,
  mm.unit_price::text AS mm_price,
  mm.conversion_factor::text AS mm_cf
FROM public.master_task_materials mtm
JOIN public.master_tasks mt ON mt.id = mtm.master_task_id
LEFT JOIN public.master_materials mm ON mm.id = mtm.master_material_id
WHERE mt.code IN ('T1035', 'T1036', 'T1037')
ORDER BY mt.code, mtm.material_name;

-- 3. Verificar que el acero apunta al material genérico (no a "Hierro nervado ∅Xmm")
SELECT
  mt.code,
  mtm.material_name,
  mm.name AS mm_name,
  mm.unit AS mm_unit,
  mm.unit_price::text AS mm_unit_price,
  mm.conversion_factor::text AS mm_cf,
  mtm.last_known_unit_price::text AS snapshot_price
FROM public.master_task_materials mtm
JOIN public.master_tasks mt ON mt.id = mtm.master_task_id
LEFT JOIN public.master_materials mm ON mm.id = mtm.master_material_id
WHERE mt.code IN ('T1035', 'T1036', 'T1037')
  AND (LOWER(mtm.material_name) LIKE '%acero%' OR LOWER(mtm.material_name) LIKE '%hierro%')
ORDER BY mt.code;
-- ESPERADO: mm.name = 'Acero ADN 420 (Genérico por Cuantía)', mm.unit = 'kg', mm.cf = NULL

-- 4. Ver mano de obra
SELECT
  mt.code,
  mtl.labor_category_name,
  mtl.quantity::text,
  mtl.snapshot_hourly_rate::text
FROM public.master_task_labor mtl
JOIN public.master_tasks mt ON mt.id = mtl.master_task_id
WHERE mt.code IN ('T1035', 'T1036', 'T1037')
ORDER BY mt.code, mtl.labor_category_name;

-- 5. Confirmar que T1033/T1034 NO fueron modificadas
SELECT code, name,
  (SELECT count(*) FROM public.master_task_materials WHERE master_task_id = mt.id) AS mat_count,
  (SELECT count(*) FROM public.master_task_labor     WHERE master_task_id = mt.id) AS lab_count
FROM public.master_tasks mt
WHERE organization_id = '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f'
  AND code IN ('T1033', 'T1034')
ORDER BY code;

*/
