-- ============================================================
-- MIGRATION 029 — T1034 Vigas de Fundación de H.A.
-- Saneamiento idempotente + carga de composición APU base
--
-- APU base (volumétrico):
--   Hormigón Elaborado H-21   1.05 m3/m3
--   Acero ADN 420             130  kg/m3
--   Oficial Hormigón          4.20 HH/m3  → workers = 4.20 × 2 / 9 = 0.9333
--   Ayudante Hormigón         4.20 HH/m3  → workers = 4.20 × 2 / 9 = 0.9333
--
-- Encofrado NO incluido en el APU base — se calcula paramétricamente
-- en la calculadora frontend con la fórmula:
--   sup_encofrado = largo × (ancho + 2 × alto)   (fondo + dos laterales)
--
-- PREREQUISITO: ejecutar migration 026 (saneamiento T1033) y 028 (corrección acero)
-- antes de este bloque.
-- ============================================================

-- ── PASO 0: Diagnóstico previo — ejecutar antes del DO para validar ──────────
/*
SELECT
  id::text,
  organization_id::text,
  code,
  name,
  unit,
  category,
  daily_yield,
  is_active
FROM public.master_tasks
WHERE code = 'T1034'
ORDER BY is_active DESC, created_at;
*/

-- ── PASO 1: Saneamiento + carga ───────────────────────────────────────────────
DO $$
DECLARE
  v_org_uuid  CONSTANT uuid := '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f';
  v_org_text  CONSTANT text := '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f';

  v_t1034     uuid;
  v_active_ct int;
  v_lab_ofi   text;
  v_lab_ayu   text;
  v_horm_id   uuid;
  v_acero_id  uuid;
  v_horm_price  numeric := 0;
  v_acero_price numeric := 0;
BEGIN

  -- Seed/reparación histórica de una organización concreta: no crear
  -- usuarios ni organizaciones artificiales durante un arranque local limpio.
  -- La migración de esquema sigue siendo válida aunque esa organización no exista.
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations WHERE id = v_org_uuid
  ) THEN
    RAISE NOTICE 'Omitiendo 029_t1034_vigas_fundacion.sql: organización de origen no presente';
    RETURN;
  END IF;


  -- ── 1. Sanear duplicados activos en la org canónica ────────────────────────
  SELECT COUNT(*) INTO v_active_ct
  FROM public.master_tasks
  WHERE organization_id = v_org_uuid
    AND code = 'T1034'
    AND is_active = true;

  IF v_active_ct > 1 THEN
    -- Desactivar todos los activos
    UPDATE public.master_tasks
    SET is_active = false
    WHERE organization_id = v_org_uuid
      AND code = 'T1034'
      AND is_active = true;

    -- Reactivar el más reciente (mayor created_at)
    UPDATE public.master_tasks
    SET is_active = true
    WHERE id = (
      SELECT id FROM public.master_tasks
      WHERE organization_id = v_org_uuid
        AND code = 'T1034'
      ORDER BY created_at DESC
      LIMIT 1
    );
    RAISE NOTICE 'T1034: % filas activas encontradas → saneadas a 1', v_active_ct;
  END IF;

  -- ── 2. Resolver ID canónico (puede ser NULL si no existe) ──────────────────
  SELECT id INTO v_t1034
  FROM public.master_tasks
  WHERE organization_id = v_org_uuid
    AND code = 'T1034'
  ORDER BY is_active DESC, created_at DESC
  LIMIT 1;

  -- ── 3. Crear si no existe; actualizar si ya existe ─────────────────────────
  IF v_t1034 IS NULL THEN
    v_t1034 := gen_random_uuid();
    INSERT INTO public.master_tasks
      (id, organization_id, code, name, unit, category, daily_yield, description, is_active)
    VALUES
      (v_t1034, v_org_uuid, 'T1034',
       'Vigas de Fundación de Hormigón Armado',
       'm3', '04 FUNDACIONES', 2,
       'Viga de H.A. H-21, 130 kg/m3 de acero ADN 420. Encofrado calculado paramétricamente (no incluido en el APU base).',
       true);
    RAISE NOTICE 'T1034 creada con id=%', v_t1034;
  ELSE
    UPDATE public.master_tasks
    SET
      is_active   = true,
      name        = 'Vigas de Fundación de Hormigón Armado',
      unit        = 'm3',
      category    = '04 FUNDACIONES',
      daily_yield = 2
    WHERE id = v_t1034;
    RAISE NOTICE 'T1034 existente actualizada: %', v_t1034;
  END IF;

  -- ── 4. Resolver IDs de categorías de MO (columna id es TEXT) ──────────────
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
    RAISE EXCEPTION
      'Faltan categorías MO en org %. Requeridas: OFICIAL HORMIGON y AYUDANTE HORMIGON',
      v_org_text;
  END IF;

  -- ── 5. Resolver materiales maestros ───────────────────────────────────────
  SELECT id, unit_price
    INTO v_horm_id, v_horm_price
  FROM public.master_materials
  WHERE organization_id = v_org_text
    AND UPPER(name) LIKE '%HORMIG%H-21%'
    AND is_active = true
  ORDER BY unit_price DESC NULLS LAST
  LIMIT 1;

  SELECT id, unit_price
    INTO v_acero_id, v_acero_price
  FROM public.master_materials
  WHERE organization_id = v_org_text
    AND is_active = true
    AND LOWER(unit) IN ('kg', 'kgs')
    AND (LOWER(name) LIKE '%acero adn%' OR LOWER(code) LIKE '%adn%')
  ORDER BY unit_price DESC NULLS LAST
  LIMIT 1;

  RAISE NOTICE 'Hormigón H-21: id=%, precio=%', v_horm_id, v_horm_price;
  RAISE NOTICE 'Acero ADN 420: id=%, precio=%', v_acero_id, v_acero_price;

  -- ── 6. Guardia: no reinsertar si composición ya existe ────────────────────
  IF EXISTS (
    SELECT 1 FROM public.master_task_materials
    WHERE master_task_id = v_t1034
  ) THEN
    RAISE NOTICE 'T1034 ya tiene composición. Skipping INSERT de materiales y MO.';
    RETURN;
  END IF;

  -- ── 7. Materiales del APU base ────────────────────────────────────────────
  INSERT INTO public.master_task_materials
    (id, master_task_id, master_material_id, material_name, unit, quantity, last_known_unit_price)
  VALUES
    -- Hormigón: 1.05 m3/m3 (5% de desperdicio sobre el volumen teórico)
    (gen_random_uuid(), v_t1034, v_horm_id,
     'Hormigón Elaborado H-21', 'm3', 1.05,
     COALESCE(v_horm_price, 0)),
    -- Acero: 130 kg/m3 (valor típico para vigas de fundación)
    (gen_random_uuid(), v_t1034, v_acero_id,
     'Acero ADN 420', 'kg', 130.0,
     COALESCE(v_acero_price, 0));

  -- ── 8. Mano de obra ────────────────────────────────────────────────────────
  -- Fórmula: workers = HH/m3 × daily_yield / 9 h/día
  --   4.20 HH/m3 × 2 m3/día / 9 h/día = 0.9333 workers (oficial = ayudante)
  INSERT INTO public.master_task_labor
    (id, master_task_id, labor_category_id, labor_category_name, quantity, snapshot_hourly_rate)
  SELECT gen_random_uuid(), v_t1034,
         v_lab_ofi, role, 0.9333, basic_hourly_rate
  FROM public.labor_categories
  WHERE id::text = v_lab_ofi;

  INSERT INTO public.master_task_labor
    (id, master_task_id, labor_category_id, labor_category_name, quantity, snapshot_hourly_rate)
  SELECT gen_random_uuid(), v_t1034,
         v_lab_ayu, role, 0.9333, basic_hourly_rate
  FROM public.labor_categories
  WHERE id::text = v_lab_ayu;

  RAISE NOTICE 'T1034 composición cargada OK: 2 materiales, 2 MO. id=%', v_t1034;

END $$;
