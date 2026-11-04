-- =============================================================================
-- Migracion 043A: APUs dependientes - Mamposterla y Revoques Gruesos
-- Fecha: 2026-04-27
--
-- APUs creados (7):
--   MAM-001 - Muro ladrillo comun 6x12x24, e=0.15m (1 pie)
--   MAM-002 - Muro ladrillo comun 6x12x24, e=0.30m (2 pies)
--   MAM-005 - Tabique ladrillo hueco 8x18x33, e=0.08m
--   MAM-006 - Tabique ladrillo hueco 8x18x33 e=0.10m (doble hoja)
--   REV-001 - Revoque grueso interior 1:2:9, e=15mm
--   REV-003 - Revoque exterior hidrofugo, e=20mm
--   REV-004 - Revoque grueso exterior 1:3, e=20mm
--
-- Sub-APUs referenciados (via sub_master_task_id):
--   MOR-001 => MAM-001, MAM-002, MAM-005, MAM-006
--   MOR-002 => REV-001, REV-004
--   MOR-003 => REV-003
--
-- Prerequisitos: 019 + 041 (materiales) + 042 (MOR-*)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.seed_apu_mam_rev(p_org_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_uuid      uuid;
  v_lad_com_id    uuid;  v_lad_com_price numeric;
  v_lad_h8_id     uuid;  v_lad_h8_price  numeric;
  v_hid_id        uuid;  v_hid_price     numeric;
  v_mor001        uuid;  v_mor002  uuid;  v_mor003  uuid;
  v_oficial_id    text;  v_oficial_name  text;
  v_ayudante_id   text;  v_ayudante_name text;
  v_mam001  uuid;  v_mam002  uuid;  v_mam005  uuid;  v_mam006  uuid;
  v_rev001  uuid;  v_rev003  uuid;  v_rev004  uuid;
  v_created integer := 0;
  v_updated integer := 0;
BEGIN

  v_org_uuid := p_org_id::uuid;

  -- 0A. Materiales (organization_id = text en master_materials)
  SELECT id, unit_price INTO v_lad_com_id, v_lad_com_price
  FROM public.master_materials
  WHERE organization_id = p_org_id AND is_active = true
    AND name = 'Ladrillo común 6x12x24' LIMIT 1;

  SELECT id, unit_price INTO v_lad_h8_id, v_lad_h8_price
  FROM public.master_materials
  WHERE organization_id = p_org_id AND is_active = true
    AND name = 'Ladrillo hueco 8x18x33' LIMIT 1;

  SELECT id, unit_price INTO v_hid_id, v_hid_price
  FROM public.master_materials
  WHERE organization_id = p_org_id AND is_active = true
    AND name = 'Hidrófugo líquido integral' LIMIT 1;

  -- 0B. Sub-APUs MOR-* (organization_id = uuid en master_tasks)
  SELECT id INTO v_mor001 FROM public.master_tasks
  WHERE organization_id = v_org_uuid AND code = 'MOR-001' AND is_active = true LIMIT 1;

  SELECT id INTO v_mor002 FROM public.master_tasks
  WHERE organization_id = v_org_uuid AND code = 'MOR-002' AND is_active = true LIMIT 1;

  SELECT id INTO v_mor003 FROM public.master_tasks
  WHERE organization_id = v_org_uuid AND code = 'MOR-003' AND is_active = true LIMIT 1;

  -- 0C. Categorias MO (organization_id = text en labor_categories)
  SELECT id, role INTO v_oficial_id, v_oficial_name
  FROM public.labor_categories
  WHERE organization_id::text = p_org_id AND role ILIKE '%oficial%'
  ORDER BY role LIMIT 1;

  SELECT id, role INTO v_ayudante_id, v_ayudante_name
  FROM public.labor_categories
  WHERE organization_id::text = p_org_id AND role ILIKE '%ayudante%'
  ORDER BY role LIMIT 1;

  -- =========================================================================
  -- MAM-001: Muro ladrillo comun 6x12x24 e=0.15m
  --   70 un ladrillo + 0.043 m3 MOR-001 + 1.143 h/m2 MO
  -- =========================================================================
  SELECT id INTO v_mam001 FROM public.master_tasks
  WHERE organization_id = v_org_uuid AND code = 'MAM-001' LIMIT 1;

  IF v_mam001 IS NULL THEN
    INSERT INTO public.master_tasks
      (id, organization_id, code, name, unit, category, daily_yield, is_active)
    VALUES
      (gen_random_uuid(), v_org_uuid, 'MAM-001',
       'Muro ladrillo común 6x12x24 e=0.15m (1 pie)', 'm2', 'Mampostería', 7, true)
    RETURNING id INTO v_mam001;
    v_created := v_created + 1;
  ELSE
    UPDATE public.master_tasks SET
      name = 'Muro ladrillo común 6x12x24 e=0.15m (1 pie)',
      unit = 'm2', category = 'Mampostería', daily_yield = 7, is_active = true
    WHERE id = v_mam001;
    v_updated := v_updated + 1;
  END IF;

  DELETE FROM public.master_task_materials WHERE master_task_id = v_mam001;
  IF v_lad_com_id IS NOT NULL THEN
    INSERT INTO public.master_task_materials
      (id, master_task_id, master_material_id, material_name, unit, quantity, waste_percent, last_known_unit_price)
    VALUES
      (gen_random_uuid(), v_mam001, v_lad_com_id,
       'Ladrillo común 6x12x24', 'un', 70, 0, COALESCE(v_lad_com_price, 0));
  END IF;
  IF v_mor001 IS NOT NULL THEN
    INSERT INTO public.master_task_materials
      (id, master_task_id, master_material_id, sub_master_task_id, material_name, unit, quantity, waste_percent, last_known_unit_price)
    VALUES
      (gen_random_uuid(), v_mam001, NULL, v_mor001, 'MOR-001', 'm3', 0.043, 0, 0);
  END IF;

  DELETE FROM public.master_task_labor WHERE master_task_id = v_mam001;
  IF v_oficial_id IS NOT NULL AND v_ayudante_id IS NOT NULL THEN
    INSERT INTO public.master_task_labor
      (id, master_task_id, labor_category_id, labor_category_name, quantity)
    VALUES
      (gen_random_uuid(), v_mam001, v_oficial_id,  v_oficial_name,  1.143),
      (gen_random_uuid(), v_mam001, v_ayudante_id, v_ayudante_name, 1.143);
  END IF;

  -- =========================================================================
  -- MAM-002: Muro ladrillo comun 6x12x24 e=0.30m
  --   140 un ladrillo + 0.087 m3 MOR-001 + 2.000 h/m2 MO
  -- =========================================================================
  SELECT id INTO v_mam002 FROM public.master_tasks
  WHERE organization_id = v_org_uuid AND code = 'MAM-002' LIMIT 1;

  IF v_mam002 IS NULL THEN
    INSERT INTO public.master_tasks
      (id, organization_id, code, name, unit, category, daily_yield, is_active)
    VALUES
      (gen_random_uuid(), v_org_uuid, 'MAM-002',
       'Muro ladrillo común 6x12x24 e=0.30m (2 pies)', 'm2', 'Mampostería', 4, true)
    RETURNING id INTO v_mam002;
    v_created := v_created + 1;
  ELSE
    UPDATE public.master_tasks SET
      name = 'Muro ladrillo común 6x12x24 e=0.30m (2 pies)',
      unit = 'm2', category = 'Mampostería', daily_yield = 4, is_active = true
    WHERE id = v_mam002;
    v_updated := v_updated + 1;
  END IF;

  DELETE FROM public.master_task_materials WHERE master_task_id = v_mam002;
  IF v_lad_com_id IS NOT NULL THEN
    INSERT INTO public.master_task_materials
      (id, master_task_id, master_material_id, material_name, unit, quantity, waste_percent, last_known_unit_price)
    VALUES
      (gen_random_uuid(), v_mam002, v_lad_com_id,
       'Ladrillo común 6x12x24', 'un', 140, 0, COALESCE(v_lad_com_price, 0));
  END IF;
  IF v_mor001 IS NOT NULL THEN
    INSERT INTO public.master_task_materials
      (id, master_task_id, master_material_id, sub_master_task_id, material_name, unit, quantity, waste_percent, last_known_unit_price)
    VALUES
      (gen_random_uuid(), v_mam002, NULL, v_mor001, 'MOR-001', 'm3', 0.087, 0, 0);
  END IF;

  DELETE FROM public.master_task_labor WHERE master_task_id = v_mam002;
  IF v_oficial_id IS NOT NULL AND v_ayudante_id IS NOT NULL THEN
    INSERT INTO public.master_task_labor
      (id, master_task_id, labor_category_id, labor_category_name, quantity)
    VALUES
      (gen_random_uuid(), v_mam002, v_oficial_id,  v_oficial_name,  2.000),
      (gen_random_uuid(), v_mam002, v_ayudante_id, v_ayudante_name, 2.000);
  END IF;

  -- =========================================================================
  -- MAM-005: Tabique ladrillo hueco 8x18x33 e=0.08m
  --   20 un ladrillo + 0.010 m3 MOR-001 + 0.667 h/m2 MO
  -- =========================================================================
  SELECT id INTO v_mam005 FROM public.master_tasks
  WHERE organization_id = v_org_uuid AND code = 'MAM-005' LIMIT 1;

  IF v_mam005 IS NULL THEN
    INSERT INTO public.master_tasks
      (id, organization_id, code, name, unit, category, daily_yield, is_active)
    VALUES
      (gen_random_uuid(), v_org_uuid, 'MAM-005',
       'Tabique ladrillo hueco 8x18x33 e=0.08m', 'm2', 'Mampostería', 12, true)
    RETURNING id INTO v_mam005;
    v_created := v_created + 1;
  ELSE
    UPDATE public.master_tasks SET
      name = 'Tabique ladrillo hueco 8x18x33 e=0.08m',
      unit = 'm2', category = 'Mampostería', daily_yield = 12, is_active = true
    WHERE id = v_mam005;
    v_updated := v_updated + 1;
  END IF;

  DELETE FROM public.master_task_materials WHERE master_task_id = v_mam005;
  IF v_lad_h8_id IS NOT NULL THEN
    INSERT INTO public.master_task_materials
      (id, master_task_id, master_material_id, material_name, unit, quantity, waste_percent, last_known_unit_price)
    VALUES
      (gen_random_uuid(), v_mam005, v_lad_h8_id,
       'Ladrillo hueco 8x18x33', 'un', 20, 0, COALESCE(v_lad_h8_price, 0));
  END IF;
  IF v_mor001 IS NOT NULL THEN
    INSERT INTO public.master_task_materials
      (id, master_task_id, master_material_id, sub_master_task_id, material_name, unit, quantity, waste_percent, last_known_unit_price)
    VALUES
      (gen_random_uuid(), v_mam005, NULL, v_mor001, 'MOR-001', 'm3', 0.010, 0, 0);
  END IF;

  DELETE FROM public.master_task_labor WHERE master_task_id = v_mam005;
  IF v_oficial_id IS NOT NULL AND v_ayudante_id IS NOT NULL THEN
    INSERT INTO public.master_task_labor
      (id, master_task_id, labor_category_id, labor_category_name, quantity)
    VALUES
      (gen_random_uuid(), v_mam005, v_oficial_id,  v_oficial_name,  0.667),
      (gen_random_uuid(), v_mam005, v_ayudante_id, v_ayudante_name, 0.667);
  END IF;

  -- =========================================================================
  -- MAM-006: Muro ladrillo ceramico 18x18x33 e=0.18m
  --   16 un ladrillo + 0.020 m3 MOR-001 + 1.143 h/m2 MO
  -- =========================================================================
  SELECT id INTO v_mam006 FROM public.master_tasks
  WHERE organization_id = v_org_uuid AND code = 'MAM-006' LIMIT 1;

  IF v_mam006 IS NULL THEN
    INSERT INTO public.master_tasks
      (id, organization_id, code, name, unit, category, daily_yield, is_active)
    VALUES
      (gen_random_uuid(), v_org_uuid, 'MAM-006',
       'Tabique ladrillo hueco 8x18x33 e=0.10m (doble hoja)', 'm2', 'Mampostería', 8, true)
    RETURNING id INTO v_mam006;
    v_created := v_created + 1;
  ELSE
    UPDATE public.master_tasks SET
      name = 'Tabique ladrillo hueco 8x18x33 e=0.10m (doble hoja)',
      unit = 'm2', category = 'Mampostería', daily_yield = 8, is_active = true
    WHERE id = v_mam006;
    v_updated := v_updated + 1;
  END IF;

  DELETE FROM public.master_task_materials WHERE master_task_id = v_mam006;
  IF v_lad_h8_id IS NOT NULL THEN
    INSERT INTO public.master_task_materials
      (id, master_task_id, master_material_id, material_name, unit, quantity, waste_percent, last_known_unit_price)
    VALUES
      (gen_random_uuid(), v_mam006, v_lad_h8_id,
       'Ladrillo hueco 8x18x33', 'un', 32, 0, COALESCE(v_lad_h8_price, 0));
  END IF;
  IF v_mor001 IS NOT NULL THEN
    INSERT INTO public.master_task_materials
      (id, master_task_id, master_material_id, sub_master_task_id, material_name, unit, quantity, waste_percent, last_known_unit_price)
    VALUES
      (gen_random_uuid(), v_mam006, NULL, v_mor001, 'MOR-001', 'm3', 0.020, 0, 0);
  END IF;

  DELETE FROM public.master_task_labor WHERE master_task_id = v_mam006;
  IF v_oficial_id IS NOT NULL AND v_ayudante_id IS NOT NULL THEN
    INSERT INTO public.master_task_labor
      (id, master_task_id, labor_category_id, labor_category_name, quantity)
    VALUES
      (gen_random_uuid(), v_mam006, v_oficial_id,  v_oficial_name,  1.000),
      (gen_random_uuid(), v_mam006, v_ayudante_id, v_ayudante_name, 1.000);
  END IF;

  -- =========================================================================
  -- REV-001: Revoque grueso interior 1:2:9 e=15mm
  --   0.020 m3 MOR-002 + 0.533 h/m2 MO
  -- =========================================================================
  SELECT id INTO v_rev001 FROM public.master_tasks
  WHERE organization_id = v_org_uuid AND code = 'REV-001' LIMIT 1;

  IF v_rev001 IS NULL THEN
    INSERT INTO public.master_tasks
      (id, organization_id, code, name, unit, category, daily_yield, is_active)
    VALUES
      (gen_random_uuid(), v_org_uuid, 'REV-001',
       'Revoque grueso interior 1:2:9 e=15mm', 'm2', 'Revoques', 15, true)
    RETURNING id INTO v_rev001;
    v_created := v_created + 1;
  ELSE
    UPDATE public.master_tasks SET
      name = 'Revoque grueso interior 1:2:9 e=15mm',
      unit = 'm2', category = 'Revoques', daily_yield = 15, is_active = true
    WHERE id = v_rev001;
    v_updated := v_updated + 1;
  END IF;

  DELETE FROM public.master_task_materials WHERE master_task_id = v_rev001;
  IF v_mor002 IS NOT NULL THEN
    INSERT INTO public.master_task_materials
      (id, master_task_id, master_material_id, sub_master_task_id, material_name, unit, quantity, waste_percent, last_known_unit_price)
    VALUES
      (gen_random_uuid(), v_rev001, NULL, v_mor002, 'MOR-002', 'm3', 0.020, 0, 0);
  END IF;

  DELETE FROM public.master_task_labor WHERE master_task_id = v_rev001;
  IF v_oficial_id IS NOT NULL AND v_ayudante_id IS NOT NULL THEN
    INSERT INTO public.master_task_labor
      (id, master_task_id, labor_category_id, labor_category_name, quantity)
    VALUES
      (gen_random_uuid(), v_rev001, v_oficial_id,  v_oficial_name,  0.533),
      (gen_random_uuid(), v_rev001, v_ayudante_id, v_ayudante_name, 0.533);
  END IF;

  -- =========================================================================
  -- REV-003: Revoque exterior hidrofugo e=20mm
  --   0.010 m3 MOR-003 + 0.200 lt hidrofugo + 0.800 h/m2 MO
  -- =========================================================================
  SELECT id INTO v_rev003 FROM public.master_tasks
  WHERE organization_id = v_org_uuid AND code = 'REV-003' LIMIT 1;

  IF v_rev003 IS NULL THEN
    INSERT INTO public.master_tasks
      (id, organization_id, code, name, unit, category, daily_yield, is_active)
    VALUES
      (gen_random_uuid(), v_org_uuid, 'REV-003',
       'Revoque exterior hidrófugo e=20mm', 'm2', 'Revoques', 10, true)
    RETURNING id INTO v_rev003;
    v_created := v_created + 1;
  ELSE
    UPDATE public.master_tasks SET
      name = 'Revoque exterior hidrófugo e=20mm',
      unit = 'm2', category = 'Revoques', daily_yield = 10, is_active = true
    WHERE id = v_rev003;
    v_updated := v_updated + 1;
  END IF;

  DELETE FROM public.master_task_materials WHERE master_task_id = v_rev003;
  IF v_mor003 IS NOT NULL THEN
    INSERT INTO public.master_task_materials
      (id, master_task_id, master_material_id, sub_master_task_id, material_name, unit, quantity, waste_percent, last_known_unit_price)
    VALUES
      (gen_random_uuid(), v_rev003, NULL, v_mor003, 'MOR-003', 'm3', 0.010, 0, 0);
  END IF;
  IF v_hid_id IS NOT NULL THEN
    INSERT INTO public.master_task_materials
      (id, master_task_id, master_material_id, material_name, unit, quantity, waste_percent, last_known_unit_price)
    VALUES
      (gen_random_uuid(), v_rev003, v_hid_id,
       'Hidrófugo líquido integral', 'lt', 0.200, 0, COALESCE(v_hid_price, 0));
  END IF;

  DELETE FROM public.master_task_labor WHERE master_task_id = v_rev003;
  IF v_oficial_id IS NOT NULL AND v_ayudante_id IS NOT NULL THEN
    INSERT INTO public.master_task_labor
      (id, master_task_id, labor_category_id, labor_category_name, quantity)
    VALUES
      (gen_random_uuid(), v_rev003, v_oficial_id,  v_oficial_name,  0.800),
      (gen_random_uuid(), v_rev003, v_ayudante_id, v_ayudante_name, 0.800);
  END IF;

  -- =========================================================================
  -- REV-004: Revoque grueso exterior 1:3 e=20mm
  --   0.025 m3 MOR-002 + 0.667 h/m2 MO
  -- =========================================================================
  SELECT id INTO v_rev004 FROM public.master_tasks
  WHERE organization_id = v_org_uuid AND code = 'REV-004' LIMIT 1;

  IF v_rev004 IS NULL THEN
    INSERT INTO public.master_tasks
      (id, organization_id, code, name, unit, category, daily_yield, is_active)
    VALUES
      (gen_random_uuid(), v_org_uuid, 'REV-004',
       'Revoque grueso exterior 1:3 e=20mm', 'm2', 'Revoques', 12, true)
    RETURNING id INTO v_rev004;
    v_created := v_created + 1;
  ELSE
    UPDATE public.master_tasks SET
      name = 'Revoque grueso exterior 1:3 e=20mm',
      unit = 'm2', category = 'Revoques', daily_yield = 12, is_active = true
    WHERE id = v_rev004;
    v_updated := v_updated + 1;
  END IF;

  DELETE FROM public.master_task_materials WHERE master_task_id = v_rev004;
  IF v_mor002 IS NOT NULL THEN
    INSERT INTO public.master_task_materials
      (id, master_task_id, master_material_id, sub_master_task_id, material_name, unit, quantity, waste_percent, last_known_unit_price)
    VALUES
      (gen_random_uuid(), v_rev004, NULL, v_mor002, 'MOR-002', 'm3', 0.025, 0, 0);
  END IF;

  DELETE FROM public.master_task_labor WHERE master_task_id = v_rev004;
  IF v_oficial_id IS NOT NULL AND v_ayudante_id IS NOT NULL THEN
    INSERT INTO public.master_task_labor
      (id, master_task_id, labor_category_id, labor_category_name, quantity)
    VALUES
      (gen_random_uuid(), v_rev004, v_oficial_id,  v_oficial_name,  0.667),
      (gen_random_uuid(), v_rev004, v_ayudante_id, v_ayudante_name, 0.667);
  END IF;

  RETURN jsonb_build_object('created', v_created, 'updated', v_updated, 'total', 7);
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_apu_mam_rev(text) TO authenticated;

COMMENT ON FUNCTION public.seed_apu_mam_rev IS
  'Siembra 7 APUs de mamposterla y revoques gruesos (043A). '
  'MAM-001/002/005/006 + REV-001/003/004. Incluye MO si labor_category_id es resolvible. '
  'Sub-APUs: MOR-001 => MAM-*, MOR-002 => REV-001/004, MOR-003 => REV-003. '
  'Idempotente: find-or-create en master_tasks, DELETE+INSERT en hijos. '
  'Prerequisitos: 019 + 041 (materiales) + 042 (MOR-*).';


-- =============================================================================
-- BACKFILL (ejecutar en bloque separado, DESPUES de confirmar que la funcion existe)
-- =============================================================================
-- DO $$
-- DECLARE
--   v_org_id  text;
--   v_result  jsonb;
--   v_count   integer := 0;
--   v_skipped integer := 0;
--   v_uuid_re text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
-- BEGIN
--   FOR v_org_id IN
--     SELECT DISTINCT organization_id FROM public.master_materials WHERE is_active = true
--   LOOP
--     IF v_org_id !~ v_uuid_re THEN
--       v_skipped := v_skipped + 1;
--       CONTINUE;
--     END IF;
--     v_result := public.seed_apu_mam_rev(v_org_id);
--     v_count  := v_count + 1;
--     RAISE NOTICE 'seed_apu_mam_rev org %: %', v_org_id, v_result;
--   END LOOP;
--   RAISE NOTICE 'Backfill 043A: % procesadas, % omitidas.', v_count, v_skipped;
-- END;
-- $$;
