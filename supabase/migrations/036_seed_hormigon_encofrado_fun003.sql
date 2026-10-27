-- ============================================================
-- MIGRATION 036 — Seed Hormigón H-21 + Encofrados + T1038 FUN-003
--
-- Sección A: 4 materiales nuevos en master_materials
--   · Hormigón Elaborado H-21       85 000 $/m³
--   · Encofrado de columna (ENC-COL) 25 000 $/m²
--   · Encofrado de viga (ENC-VIGA)  22 000 $/m²
--   · Encofrado de losa / cimbra (ENC-LOSA) 18 000 $/m²
--
-- Sección B: T1038 — Columna de Fundación (FUN-003, 200 kg/m³ acero)
--   · Mismo patrón idempotente que migration 035.
--   · category = '04 FUNDACIONES' (fundación, no estructura aérea).
--   · Encofrado NO está en el APU base: se calcula paramétricamente.
--
-- PATRÓN SECCIÓN A: SELECT → IS NULL → INSERT / ELSE UPDATE (sin ON CONFLICT,
--   porque master_materials no tiene UNIQUE(organization_id, name)).
--   · Materiales con code: lookup por code primero, fallback a nombre.
--   · Hormigón (sin code): lookup por LOWER(TRIM(name)) exacto.
--   · Idempotente: re-ejecutar siempre produce el mismo resultado final.
--
-- PREREQUISITOS:
--   · 034_steel_pricing_architecture → "Acero ADN 420 (Genérico por Cuantía)"
--   · 035_seed_structural_families_fun_004_005_006
-- ============================================================

DO $$
DECLARE
  v_org_uuid  CONSTANT uuid := '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f';
  v_org_text  CONSTANT text := '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f';

  -- ── Precios editables ────────────────────────────────────────────────────
  v_horm_price  CONSTANT numeric := 85000;   -- $/m³ Hormigón H-21 elaborado
  v_enc_col_p   CONSTANT numeric := 25000;   -- $/m² Encofrado columna
  v_enc_viga_p  CONSTANT numeric := 22000;   -- $/m² Encofrado viga
  v_enc_losa_p  CONSTANT numeric := 18000;   -- $/m² Encofrado losa (cimbra)

  -- ── IDs de materiales (resueltos o creados en Sección A) ─────────────────
  v_horm_id     uuid;
  v_enc_col_id  uuid;
  v_enc_viga_id uuid;
  v_enc_losa_id uuid;
  v_acero_id    uuid;
  v_acero_price numeric := 0;

  -- ── T1038 ────────────────────────────────────────────────────────────────
  v_t1038       uuid;

  -- ── MO ──────────────────────────────────────────────────────────────────
  v_lab_ofi     text;
  v_lab_ayu     text;

  v_deleted_ct  int;
BEGIN

  -- Seed/reparación histórica de una organización concreta: no crear
  -- usuarios ni organizaciones artificiales durante un arranque local limpio.
  -- La migración de esquema sigue siendo válida aunque esa organización no exista.
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations WHERE id = v_org_uuid
  ) THEN
    RAISE NOTICE 'Omitiendo 036_seed_hormigon_encofrado_fun003.sql: organización de origen no presente';
    RETURN;
  END IF;


  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE 'MIGRATION 036 — Inicio';

  -- ══════════════════════════════════════════════════════════════════════
  -- SECCIÓN A — 4 materiales en master_materials
  -- Patrón: SELECT → IS NULL → INSERT / ELSE UPDATE
  -- No usa ON CONFLICT (la tabla no tiene UNIQUE sobre organization_id,name).
  -- ══════════════════════════════════════════════════════════════════════

  -- ── A1. Hormigón Elaborado H-21 (sin code → lookup por nombre exacto) ────
  SELECT id INTO v_horm_id
  FROM public.master_materials
  WHERE organization_id = v_org_text
    AND LOWER(TRIM(name)) = LOWER(TRIM('Hormigón Elaborado H-21'))
  ORDER BY is_active DESC, created_at DESC
  LIMIT 1;

  IF v_horm_id IS NULL THEN
    INSERT INTO public.master_materials
      (id, organization_id, name, unit, unit_price, category, is_active)
    VALUES
      (gen_random_uuid(), v_org_text,
       'Hormigón Elaborado H-21', 'm3', v_horm_price,
       'Hormigones', true)
    RETURNING id INTO v_horm_id;
    RAISE NOTICE 'A1. Hormigón H-21 → INSERTADO id=%', v_horm_id;
  ELSE
    UPDATE public.master_materials SET
      unit       = 'm3',
      unit_price = v_horm_price,
      category   = 'Hormigones',
      is_active  = true,
      updated_at = now()
    WHERE id = v_horm_id;
    RAISE NOTICE 'A1. Hormigón H-21 → ACTUALIZADO id=%', v_horm_id;
  END IF;

  RAISE NOTICE 'A1. Hormigón H-21 precio=% $/m³', v_horm_price;

  -- ── A2. Encofrado de columna (lookup por code 'ENC-COL', fallback nombre) ─
  SELECT id INTO v_enc_col_id
  FROM public.master_materials
  WHERE organization_id = v_org_text
    AND (
      code = 'ENC-COL'
      OR LOWER(TRIM(name)) = LOWER(TRIM('Encofrado de columna (tablas y puntales)'))
    )
  ORDER BY is_active DESC, created_at DESC
  LIMIT 1;

  IF v_enc_col_id IS NULL THEN
    INSERT INTO public.master_materials
      (id, organization_id, name, unit, unit_price, category, code, is_active)
    VALUES
      (gen_random_uuid(), v_org_text,
       'Encofrado de columna (tablas y puntales)', 'm2', v_enc_col_p,
       'Estructural', 'ENC-COL', true)
    RETURNING id INTO v_enc_col_id;
    RAISE NOTICE 'A2. ENC-COL → INSERTADO id=%', v_enc_col_id;
  ELSE
    UPDATE public.master_materials SET
      name       = 'Encofrado de columna (tablas y puntales)',
      unit       = 'm2',
      unit_price = v_enc_col_p,
      category   = 'Estructural',
      code       = 'ENC-COL',
      is_active  = true,
      updated_at = now()
    WHERE id = v_enc_col_id;
    RAISE NOTICE 'A2. ENC-COL → ACTUALIZADO id=%', v_enc_col_id;
  END IF;

  RAISE NOTICE 'A2. Encofrado columna (ENC-COL) precio=% $/m²', v_enc_col_p;

  -- ── A3. Encofrado de viga (lookup por code 'ENC-VIGA', fallback nombre) ──
  SELECT id INTO v_enc_viga_id
  FROM public.master_materials
  WHERE organization_id = v_org_text
    AND (
      code = 'ENC-VIGA'
      OR LOWER(TRIM(name)) = LOWER(TRIM('Encofrado de viga (tablas y puntales)'))
    )
  ORDER BY is_active DESC, created_at DESC
  LIMIT 1;

  IF v_enc_viga_id IS NULL THEN
    INSERT INTO public.master_materials
      (id, organization_id, name, unit, unit_price, category, code, is_active)
    VALUES
      (gen_random_uuid(), v_org_text,
       'Encofrado de viga (tablas y puntales)', 'm2', v_enc_viga_p,
       'Estructural', 'ENC-VIGA', true)
    RETURNING id INTO v_enc_viga_id;
    RAISE NOTICE 'A3. ENC-VIGA → INSERTADO id=%', v_enc_viga_id;
  ELSE
    UPDATE public.master_materials SET
      name       = 'Encofrado de viga (tablas y puntales)',
      unit       = 'm2',
      unit_price = v_enc_viga_p,
      category   = 'Estructural',
      code       = 'ENC-VIGA',
      is_active  = true,
      updated_at = now()
    WHERE id = v_enc_viga_id;
    RAISE NOTICE 'A3. ENC-VIGA → ACTUALIZADO id=%', v_enc_viga_id;
  END IF;

  RAISE NOTICE 'A3. Encofrado viga (ENC-VIGA) precio=% $/m²', v_enc_viga_p;

  -- ── A4. Encofrado de losa (lookup por code 'ENC-LOSA', fallback nombre) ──
  SELECT id INTO v_enc_losa_id
  FROM public.master_materials
  WHERE organization_id = v_org_text
    AND (
      code = 'ENC-LOSA'
      OR LOWER(TRIM(name)) = LOWER(TRIM('Encofrado de losa (cimbra)'))
    )
  ORDER BY is_active DESC, created_at DESC
  LIMIT 1;

  IF v_enc_losa_id IS NULL THEN
    INSERT INTO public.master_materials
      (id, organization_id, name, unit, unit_price, category, code, is_active)
    VALUES
      (gen_random_uuid(), v_org_text,
       'Encofrado de losa (cimbra)', 'm2', v_enc_losa_p,
       'Estructural', 'ENC-LOSA', true)
    RETURNING id INTO v_enc_losa_id;
    RAISE NOTICE 'A4. ENC-LOSA → INSERTADO id=%', v_enc_losa_id;
  ELSE
    UPDATE public.master_materials SET
      name       = 'Encofrado de losa (cimbra)',
      unit       = 'm2',
      unit_price = v_enc_losa_p,
      category   = 'Estructural',
      code       = 'ENC-LOSA',
      is_active  = true,
      updated_at = now()
    WHERE id = v_enc_losa_id;
    RAISE NOTICE 'A4. ENC-LOSA → ACTUALIZADO id=%', v_enc_losa_id;
  END IF;

  RAISE NOTICE 'A4. Encofrado losa (ENC-LOSA) precio=% $/m²', v_enc_losa_p;

  RAISE NOTICE 'Sección A completa: 4 materiales seeded.';
  RAISE NOTICE '════════════════════════════════════════════════════════════';

  -- ══════════════════════════════════════════════════════════════════════
  -- SECCIÓN B — T1038: Columna de Fundación (FUN-003, 200 kg/m³ acero)
  -- ══════════════════════════════════════════════════════════════════════

  -- ── Resolver Acero ADN 420 genérico (mismo fallback 3-nivel que migration 035) ──

  -- Paso 1: buscar "Acero ADN 420 (Genérico por Cuantía)" exacto
  SELECT id, unit_price
  INTO v_acero_id, v_acero_price
  FROM public.master_materials
  WHERE organization_id = v_org_text
    AND is_active = true
    AND unit_price > 0
    AND name = 'Acero ADN 420 (Genérico por Cuantía)'
  LIMIT 1;

  -- Paso 2: fallback — cualquier acero ADN/DN en $/kg
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
      AND (
        LOWER(name) LIKE '%acero adn%'  OR
        LOWER(name) LIKE '%acero dn%'   OR
        (code IS NOT NULL AND LOWER(code) LIKE '%adn%')
      )
    ORDER BY unit_price DESC NULLS LAST
    LIMIT 1;
  END IF;

  -- Paso 3: fallback final — cualquier hierro/acero con precio
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
    RAISE WARNING 'Acero ADN 420 no encontrado. T1038 se creará con last_known_unit_price=0 para acero.';
  ELSE
    RAISE NOTICE 'Acero ADN 420 → id=%, precio=% $/kg', v_acero_id, v_acero_price;
  END IF;

  -- ── Resolver MO ──────────────────────────────────────────────────────────
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
    RAISE WARNING 'MO OFICIAL/AYUDANTE HORMIGON no encontradas. T1038 creada sin MO.';
  ELSE
    RAISE NOTICE 'MO → OFICIAL=%, AYUDANTE=%', v_lab_ofi, v_lab_ayu;
  END IF;

  -- ── T1038: buscar o crear ─────────────────────────────────────────────────
  SELECT id INTO v_t1038
  FROM public.master_tasks
  WHERE organization_id = v_org_uuid
    AND code = 'T1038'
  ORDER BY is_active DESC, created_at DESC
  LIMIT 1;

  IF v_t1038 IS NULL THEN
    v_t1038 := gen_random_uuid();
    INSERT INTO public.master_tasks
      (id, organization_id, code, name, unit, category, daily_yield, description, is_active)
    VALUES
      (v_t1038, v_org_uuid, 'T1038',
       'Columna de Hormigón Armado H-21',
       'm3', '04 FUNDACIONES', 2,
       'Columna de fundación de H.A. H-21. 200 kg/m³ de acero ADN 420. Encofrado calculado paramétricamente: 4 caras laterales sin fondo (FUN-003).',
       true);
    RAISE NOTICE 'T1038 creada: id=%', v_t1038;
  ELSE
    UPDATE public.master_tasks SET
      is_active   = true,
      name        = 'Columna de Hormigón Armado H-21',
      unit        = 'm3',
      category    = '04 FUNDACIONES',
      daily_yield = 2
    WHERE id = v_t1038;
    RAISE NOTICE 'T1038 existente actualizada: %', v_t1038;
  END IF;

  -- ── Composición idempotente: DELETE + INSERT ─────────────────────────────
  DELETE FROM public.master_task_materials
  WHERE master_task_id = v_t1038;
  GET DIAGNOSTICS v_deleted_ct = ROW_COUNT;
  RAISE NOTICE 'T1038: % filas de materiales eliminadas', v_deleted_ct;

  INSERT INTO public.master_task_materials
    (id, master_task_id, master_material_id, material_name, unit, quantity, last_known_unit_price)
  VALUES
    -- Hormigón: 1.05 m³/m³ (5% desperdicio)
    (gen_random_uuid(), v_t1038, v_horm_id,
     'Hormigón Elaborado H-21', 'm3', 1.05,
     v_horm_price),
    -- Acero genérico: 200 kg/m³ (columnas de fundación, alta cuantía)
    (gen_random_uuid(), v_t1038, v_acero_id,
     'Acero ADN 420', 'kg', 200.0,
     COALESCE(v_acero_price, 0));

  -- ── MO ───────────────────────────────────────────────────────────────────
  -- HH/m³ × daily_yield / 9h/día = workers
  -- 4.20 HH/m³ × 2 m³/día / 9 h/día = 0.9333
  IF v_lab_ofi IS NOT NULL AND v_lab_ayu IS NOT NULL THEN
    DELETE FROM public.master_task_labor WHERE master_task_id = v_t1038;

    INSERT INTO public.master_task_labor
      (id, master_task_id, labor_category_id, labor_category_name, quantity, snapshot_hourly_rate)
    SELECT gen_random_uuid(), v_t1038,
           v_lab_ofi, role, 0.9333, basic_hourly_rate
    FROM public.labor_categories WHERE id::text = v_lab_ofi;

    INSERT INTO public.master_task_labor
      (id, master_task_id, labor_category_id, labor_category_name, quantity, snapshot_hourly_rate)
    SELECT gen_random_uuid(), v_t1038,
           v_lab_ayu, role, 0.9333, basic_hourly_rate
    FROM public.labor_categories WHERE id::text = v_lab_ayu;
  END IF;

  RAISE NOTICE 'T1038 OK → Hormigón 1.05 m³ (% $/m³), Acero 200 kg (% $/kg)',
    v_horm_price, COALESCE(v_acero_price, 0);

  -- ══════════════════════════════════════════════════════════════════════
  -- Resumen final
  -- ══════════════════════════════════════════════════════════════════════
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE 'MIGRATION 036 COMPLETA:';
  RAISE NOTICE '  Sección A — Materiales:';
  RAISE NOTICE '    Hormigón H-21   : % $/m³  id=%', v_horm_price, v_horm_id;
  RAISE NOTICE '    ENC-COL         : % $/m²  id=%', v_enc_col_p,  v_enc_col_id;
  RAISE NOTICE '    ENC-VIGA        : % $/m²  id=%', v_enc_viga_p, v_enc_viga_id;
  RAISE NOTICE '    ENC-LOSA        : % $/m²  id=%', v_enc_losa_p, v_enc_losa_id;
  RAISE NOTICE '  Sección B — T1038:';
  RAISE NOTICE '    Columna de Fundación (FUN-003) | 04 FUNDACIONES | yield=2';
  RAISE NOTICE '    Hormigón 1.05 m³, Acero 200 kg';
  RAISE NOTICE '    Acero usado: id=%, precio=% $/kg', v_acero_id, COALESCE(v_acero_price, 0);
  RAISE NOTICE '    MO: ofi=% ayu=%',
    COALESCE(v_lab_ofi, 'NO ENCONTRADO'),
    COALESCE(v_lab_ayu, 'NO ENCONTRADO');
  RAISE NOTICE '════════════════════════════════════════════════════════════';

END $$;


-- ── QUERIES DE VERIFICACIÓN POST-MIGRACIÓN ───────────────────────────────────
/*

-- 1. Verificar los 4 materiales nuevos
SELECT name, unit, unit_price, category, code, is_active
FROM public.master_materials
WHERE organization_id = '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f'
  AND (name LIKE '%Hormig%' OR code IN ('ENC-COL','ENC-VIGA','ENC-LOSA'))
ORDER BY name;
-- ESPERADO: 4 filas

-- 2. Verificar T1038
SELECT code, name, unit, category, daily_yield
FROM public.master_tasks
WHERE organization_id = '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f'
  AND code = 'T1038';

-- 3. Composición de T1038
SELECT mt.code, mtm.material_name, mtm.unit, mtm.quantity, mtm.last_known_unit_price
FROM public.master_task_materials mtm
JOIN public.master_tasks mt ON mt.id = mtm.master_task_id
WHERE mt.code = 'T1038'
ORDER BY mtm.material_name;
-- ESPERADO: Acero ADN 420 (200 kg) + Hormigón H-21 (1.05 m³)

*/
