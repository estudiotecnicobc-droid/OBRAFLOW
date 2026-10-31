-- ============================================================
-- MIGRATION 034 — Arquitectura de dos modos para el acero ADN 420
--
-- Decisión de negocio confirmada:
--   - El precio del acero por diámetro se carga por BARRA (no por kg).
--   - El APU paramétrico usa un material genérico en $/kg.
--
-- MODO 1 — parametric_generic
--   Material: "Acero ADN 420 (Genérico por Cuantía)"
--   · unit = kg   · sin conversion_factor   · sin commercial_unit
--   · Precio cargado = $/kg
--   · Usado en: APU, presupuesto, cuantías, T1033, T1034
--
-- MODO 2 — commercial_diameter
--   Materiales: "Hierro nervado ∅6/8/10/12 mm" (seed 019/023)
--   · unit = barra   · conversion_factor = kgPorBarra
--   · commercial_unit = "barra ∅Xmm · 12m"
--   · Precio cargado = $/barra
--   · Sistema deriva: technicalPrice = precioBarra / kgPorBarra
--   · Usado en: compra inteligente, lista de compras, logística
--
-- Tabla técnica ADN 420 (barras de 12 m):
--   ∅6mm  → 0.22 kg/m →  2.64 kg/barra
--   ∅8mm  → 0.40 kg/m →  4.80 kg/barra
--   ∅10mm → 0.62 kg/m →  7.44 kg/barra
--   ∅12mm → 0.89 kg/m → 10.68 kg/barra
--   ∅16mm → 1.58 kg/m → 18.96 kg/barra
--
-- CAMBIOS:
--   1. Crear "Acero ADN 420 (Genérico por Cuantía)" (si no existe)
--   2. Actualizar "Hierro nervado ∅6/8/10/12 mm":
--        unit → 'barra'
--        unit_price → precio por barra (derivado del $/kg existente × kgPorBarra)
--        conversion_factor → kgPorBarra
--        commercial_unit → "barra ∅Xmm · 12m"
--   3. Actualizar T1033 y T1034: FK → "Acero ADN 420 (Genérico por Cuantía)"
--
-- IDEMPOTENTE:
--   - INSERT del genérico usa ON CONFLICT DO UPDATE
--   - UPDATE de "Hierro nervado" es re-ejecutable (set same values)
--   - UPDATE de T1033/T1034 es re-ejecutable (SET es idempotente)
--
-- PREREQUISITO: migration 032 (T1033) y migration 033 (T1034) ejecutadas.
-- NO toca: master_task_labor, budget_items, ERPContext, estructura DB.
-- ============================================================

DO $$
DECLARE
  v_org_text  CONSTANT text := '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f';
  v_org_uuid  CONSTANT uuid := '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f';

  v_gen_id      uuid;
  v_gen_price   numeric := 960;    -- $/kg para el material genérico

  v_t1033       uuid;
  v_t1034       uuid;
  v_updated_ct  int;
BEGIN

  -- Seed/reparación histórica de una organización concreta: no crear
  -- usuarios ni organizaciones artificiales durante un arranque local limpio.
  -- La migración de esquema sigue siendo válida aunque esa organización no exista.
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations WHERE id = v_org_uuid
  ) THEN
    RAISE NOTICE 'Omitiendo 034_steel_pricing_architecture.sql: organización de origen no presente';
    RETURN;
  END IF;


  -- ── 1. Crear o actualizar "Acero ADN 420 (Genérico por Cuantía)" ─────────────
  SELECT id INTO v_gen_id
  FROM public.master_materials
  WHERE organization_id = v_org_text
    AND name = 'Acero ADN 420 (Genérico por Cuantía)'
    AND is_active = true;

  IF v_gen_id IS NULL THEN
    v_gen_id := gen_random_uuid();
    INSERT INTO public.master_materials
      (id, organization_id, name, unit, unit_price, category,
       conversion_factor, commercial_unit, waste_percent, is_active)
    VALUES
      (v_gen_id, v_org_text,
       'Acero ADN 420 (Genérico por Cuantía)',
       'kg',
       v_gen_price,
       'Estructural',
       NULL,   -- sin CF: unidad comercial = kg (no barras)
       NULL,   -- sin commercial_unit por constraint
       5,      -- 5% desperdicio estándar
       true);
    RAISE NOTICE 'Acero genérico creado: id=%', v_gen_id;
  ELSE
    UPDATE public.master_materials
    SET unit_price = v_gen_price, updated_at = now()
    WHERE id = v_gen_id;
    RAISE NOTICE 'Acero genérico existente actualizado: id=%', v_gen_id;
  END IF;

  -- ── 2. Actualizar "Hierro nervado ∅X mm" → Modo 2 ($/barra + CF) ────────────
  -- Precio por barra = precio_kg_actual × kgPorBarra
  -- Los precios base del seed 019/023 son los $/kg actuales.
  -- Se preserva la magnitud económica: para el usuario la barra vale P × kgPorBarra.

  -- ∅6mm: 2.64 kg/barra — precio_kg=920 → 920 × 2.64 = 2429 $/barra
  UPDATE public.master_materials SET
    unit              = 'barra',
    unit_price        = 2429,
    conversion_factor = 2.64,
    commercial_unit   = 'barra ∅6mm · 12m',
    updated_at        = now()
  WHERE organization_id = v_org_text
    AND name = 'Hierro nervado Ø6 mm'
    AND is_active = true;
  GET DIAGNOSTICS v_updated_ct = ROW_COUNT;
  RAISE NOTICE 'Hierro nervado ∅6mm: % fila(s) actualizadas (2429 $/barra, CF=2.64)', v_updated_ct;

  -- ∅8mm: 4.80 kg/barra — precio_kg=935 → 935 × 4.80 = 4488 $/barra
  UPDATE public.master_materials SET
    unit              = 'barra',
    unit_price        = 4488,
    conversion_factor = 4.80,
    commercial_unit   = 'barra ∅8mm · 12m',
    updated_at        = now()
  WHERE organization_id = v_org_text
    AND name = 'Hierro nervado Ø8 mm'
    AND is_active = true;
  GET DIAGNOSTICS v_updated_ct = ROW_COUNT;
  RAISE NOTICE 'Hierro nervado ∅8mm: % fila(s) actualizadas (4488 $/barra, CF=4.80)', v_updated_ct;

  -- ∅10mm: 7.44 kg/barra — precio_kg=950 → 950 × 7.44 = 7068 $/barra
  UPDATE public.master_materials SET
    unit              = 'barra',
    unit_price        = 7068,
    conversion_factor = 7.44,
    commercial_unit   = 'barra ∅10mm · 12m',
    updated_at        = now()
  WHERE organization_id = v_org_text
    AND name = 'Hierro nervado Ø10 mm'
    AND is_active = true;
  GET DIAGNOSTICS v_updated_ct = ROW_COUNT;
  RAISE NOTICE 'Hierro nervado ∅10mm: % fila(s) actualizadas (7068 $/barra, CF=7.44)', v_updated_ct;

  -- ∅12mm: 10.68 kg/barra — precio_kg=960 → 960 × 10.68 = 10253 $/barra
  UPDATE public.master_materials SET
    unit              = 'barra',
    unit_price        = 10253,
    conversion_factor = 10.68,
    commercial_unit   = 'barra ∅12mm · 12m',
    updated_at        = now()
  WHERE organization_id = v_org_text
    AND name = 'Hierro nervado Ø12 mm'
    AND is_active = true;
  GET DIAGNOSTICS v_updated_ct = ROW_COUNT;
  RAISE NOTICE 'Hierro nervado ∅12mm: % fila(s) actualizadas (10253 $/barra, CF=10.68)', v_updated_ct;

  -- ── 3. Actualizar T1033: FK acero → material genérico ────────────────────────
  SELECT id INTO v_t1033
  FROM public.master_tasks
  WHERE organization_id = v_org_uuid
    AND code = 'T1033'
    AND is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_t1033 IS NOT NULL THEN
    UPDATE public.master_task_materials SET
      master_material_id    = v_gen_id,
      material_name         = 'Acero ADN 420 (Genérico por Cuantía)',
      last_known_unit_price = v_gen_price,
      conversion_factor     = NULL,   -- genérico: sin CF
      commercial_unit       = NULL    -- genérico: unidad técnica = kg
    WHERE master_task_id = v_t1033
      AND (LOWER(material_name) LIKE '%acero%' OR LOWER(material_name) LIKE '%hierro%');
    GET DIAGNOSTICS v_updated_ct = ROW_COUNT;
    RAISE NOTICE 'T1033 acero actualizado: % fila(s) → genérico id=%', v_updated_ct, v_gen_id;
  ELSE
    RAISE NOTICE 'T1033 no encontrada en org %. Skipping.', v_org_text;
  END IF;

  -- ── 4. Actualizar T1034: FK acero → material genérico ────────────────────────
  SELECT id INTO v_t1034
  FROM public.master_tasks
  WHERE organization_id = v_org_uuid
    AND code = 'T1034'
    AND is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_t1034 IS NOT NULL THEN
    UPDATE public.master_task_materials SET
      master_material_id    = v_gen_id,
      material_name         = 'Acero ADN 420 (Genérico por Cuantía)',
      last_known_unit_price = v_gen_price,
      conversion_factor     = NULL,
      commercial_unit       = NULL
    WHERE master_task_id = v_t1034
      AND (LOWER(material_name) LIKE '%acero%' OR LOWER(material_name) LIKE '%hierro%');
    GET DIAGNOSTICS v_updated_ct = ROW_COUNT;
    RAISE NOTICE 'T1034 acero actualizado: % fila(s) → genérico id=%', v_updated_ct, v_gen_id;
  ELSE
    RAISE NOTICE 'T1034 no encontrada en org %. Skipping.', v_org_text;
  END IF;

  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE 'Arquitectura de pricing del acero configurada:';
  RAISE NOTICE '  MODO 1 — Genérico paramétrico:';
  RAISE NOTICE '    "Acero ADN 420 (Genérico por Cuantía)" | kg | % $/kg', v_gen_price;
  RAISE NOTICE '    → T1033 y T1034 actualizados con esta FK';
  RAISE NOTICE '  MODO 2 — Comercial por diámetro:';
  RAISE NOTICE '    Hierro nervado ∅6mm  = 2429 $/barra  (CF=2.64)';
  RAISE NOTICE '    Hierro nervado ∅8mm  = 4488 $/barra  (CF=4.80)';
  RAISE NOTICE '    Hierro nervado ∅10mm = 7068 $/barra  (CF=7.44)';
  RAISE NOTICE '    Hierro nervado ∅12mm = 10253 $/barra (CF=10.68)';
  RAISE NOTICE '════════════════════════════════════════════════════════════';

END $$;


-- ── QUERY DE VERIFICACIÓN POST-FIX ──────────────────────────────────────────
-- Ejecutar manualmente para validar los dos modos:
/*
-- Modo 1: materiales genéricos (APU/presupuesto)
SELECT name, unit, unit_price, conversion_factor, commercial_unit
FROM public.master_materials
WHERE organization_id = '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f'
  AND is_active = true
  AND name LIKE '%Acero ADN%'
ORDER BY name;

-- Modo 2: materiales comerciales por diámetro
SELECT name, unit, unit_price, conversion_factor, commercial_unit,
       ROUND(unit_price::numeric / conversion_factor::numeric, 2) AS precio_tecnico_kg
FROM public.master_materials
WHERE organization_id = '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f'
  AND is_active = true
  AND name LIKE '%nervado%'
ORDER BY conversion_factor;

-- Verificar T1033 y T1034 usan el genérico
SELECT mt.code, mtm.material_name, mtm.unit, mtm.quantity::text, mtm.last_known_unit_price::text,
       mm.name AS mm_name, mm.unit AS mm_unit, mm.unit_price::text AS mm_price,
       mm.conversion_factor::text AS mm_cf
FROM public.master_task_materials mtm
JOIN public.master_tasks mt ON mt.id = mtm.master_task_id
LEFT JOIN public.master_materials mm ON mm.id = mtm.master_material_id
WHERE mt.code IN ('T1033','T1034')
  AND (LOWER(mtm.material_name) LIKE '%acero%' OR LOWER(mtm.material_name) LIKE '%hierro%');
*/
