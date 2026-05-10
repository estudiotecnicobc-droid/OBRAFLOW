-- =============================================================================
-- Migración 042: Sub-APUs base de Morteros
-- Fecha: 2026-04-27
--
-- Crea 4 APUs maestros de mortero (sub-APUs base, sin labor):
--
--   MOR-001 — Mortero 1:1:6           (mampostería en general)
--   MOR-002 — Mortero 1:2:9           (revoque grueso interior)
--   MOR-003 — Mortero 1:3 cem-arena   (revoque exterior, sin cal)
--   MOR-004 — Mortero 1:4 cem-arena   (contrapisos y pisos)
--
-- Características de cada APU:
--   · unit = 'm3' (m³ de mortero producido y puesto en obra)
--   · Sin labor (la MO va en el APU padre: MAM/REV/PIS — migración 043)
--   · Sin sub-APU anidado (son recetas base)
--   · Coeficientes por m³ de mortero puesto en obra (waste incluido en coef)
--   · waste_percent = 0 en los materiales (waste ya bakeado en coef)
--
-- Materiales usados (nombres exactos de DB):
--   · 'Cemento Portland CPN 40'    → 019
--   · 'Cal hidratada'              → 041 (Ca(OH)₂, NO intercambiable con Cal hidráulica)
--   · 'Arena gruesa limpia'        → 019
--   · 'Arena fina lavada'          → 019
--   · 'Arena media lavada'         → 041
--
-- Idempotencia:
--   · master_tasks: find-or-create por (organization_id, code).
--     No se elimina el registro padre para no romper FK desde budget_items.
--   · master_task_materials: DELETE + INSERT (igual que 035/036).
--     Re-ejecutar siempre produce el mismo resultado final.
--
-- Patrón: función seed_apu_morteros(p_org_id text) + DO block de backfill.
--   Consistente con 019/023 para soporte multi-org.
--
-- Prerrequisitos:
--   · 019_extended_seed_data     → Cemento, Arena fina lavada, Arena gruesa limpia
--   · 041_canonical_materials_morteros → Cal hidratada, Arena media lavada
-- =============================================================================

-- =============================================================================
-- FUNCIÓN: seed_apu_morteros
-- =============================================================================

CREATE OR REPLACE FUNCTION public.seed_apu_morteros(
  p_org_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- ── IDs de materiales (resueltos por nombre exacto) ─────────────────────
  v_cem_id    uuid;   -- Cemento Portland CPN 40
  v_cem_price numeric;

  v_cal_id    uuid;   -- Cal hidratada (Ca(OH)₂)
  v_cal_price numeric;

  v_arg_id    uuid;   -- Arena gruesa limpia
  v_arg_price numeric;

  v_arf_id    uuid;   -- Arena fina lavada
  v_arf_price numeric;

  v_arm_id    uuid;   -- Arena media lavada
  v_arm_price numeric;

  -- ── IDs de tareas ────────────────────────────────────────────────────────
  v_mor001    uuid;
  v_mor002    uuid;
  v_mor003    uuid;
  v_mor004    uuid;

  v_org_uuid  uuid;
  v_created   integer := 0;
  v_updated   integer := 0;
BEGIN

  v_org_uuid := p_org_id::uuid;

  RAISE NOTICE '════════════════════════════════════════════════';
  RAISE NOTICE 'seed_apu_morteros — org: %', p_org_id;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 0. Resolver materiales (nombres exactos de DB)
  -- ══════════════════════════════════════════════════════════════════════════

  SELECT id,
    CASE WHEN conversion_factor IS NOT NULL AND conversion_factor > 1
         THEN unit_price / conversion_factor
         ELSE unit_price END
  INTO v_cem_id, v_cem_price
  FROM public.master_materials
  WHERE organization_id = p_org_id AND is_active = true
    AND name = 'Cemento Portland CPN 40'
  LIMIT 1;

  SELECT id, unit_price
  INTO v_cal_id, v_cal_price
  FROM public.master_materials
  WHERE organization_id = p_org_id AND is_active = true
    AND name = 'Cal hidratada'
  LIMIT 1;

  SELECT id, unit_price
  INTO v_arg_id, v_arg_price
  FROM public.master_materials
  WHERE organization_id = p_org_id AND is_active = true
    AND name = 'Arena gruesa limpia'
  LIMIT 1;

  SELECT id, unit_price
  INTO v_arf_id, v_arf_price
  FROM public.master_materials
  WHERE organization_id = p_org_id AND is_active = true
    AND name = 'Arena fina lavada'
  LIMIT 1;

  SELECT id, unit_price
  INTO v_arm_id, v_arm_price
  FROM public.master_materials
  WHERE organization_id = p_org_id AND is_active = true
    AND name = 'Arena media lavada'
  LIMIT 1;

  RAISE NOTICE 'Materiales → cemento=%, cal=%, arena_g=%, arena_f=%, arena_m=%',
    v_cem_id, v_cal_id, v_arg_id, v_arf_id, v_arm_id;

  IF v_cem_id IS NULL THEN
    RAISE WARNING 'Cemento Portland CPN 40 no encontrado — prerequisito: migración 019.';
  END IF;
  IF v_cal_id IS NULL THEN
    RAISE WARNING 'Cal hidratada no encontrada — prerequisito: migración 041.';
  END IF;
  IF v_arm_id IS NULL THEN
    RAISE WARNING 'Arena media lavada no encontrada — prerequisito: migración 041.';
  END IF;


  -- ══════════════════════════════════════════════════════════════════════════
  -- MOR-001 — Mortero 1:1:6 (mampostería en general)
  --
  -- Dosaje por m³ de mortero puesto en obra:
  --   140 kg  cemento Portland
  --   130 kg  cal hidratada
  --   1.050 m³ arena gruesa (incluye ~5% de desperdicio en coef)
  --
  -- Rendimiento típico Chandías: 6 m³/día (equipo de 2 personas)
  -- Uso: MAM-001/002 (muros portantes), MAM-003/004/005/006 (huecos)
  -- ══════════════════════════════════════════════════════════════════════════

  SELECT id INTO v_mor001
  FROM public.master_tasks
  WHERE organization_id = v_org_uuid AND code = 'MOR-001'
  LIMIT 1;

  IF v_mor001 IS NULL THEN
    INSERT INTO public.master_tasks
      (id, organization_id, code, name, unit, category, daily_yield, is_active)
    VALUES
      (gen_random_uuid(), v_org_uuid, 'MOR-001',
       'Mortero 1:1:6 (mampostería)', 'm3', 'Morteros', 6, true)
    RETURNING id INTO v_mor001;
    v_created := v_created + 1;
    RAISE NOTICE 'MOR-001 → CREADO id=%', v_mor001;
  ELSE
    UPDATE public.master_tasks
    SET name = 'Mortero 1:1:6 (mampostería)', unit = 'm3',
        category = 'Morteros', daily_yield = 6, is_active = true
    WHERE id = v_mor001;
    v_updated := v_updated + 1;
    RAISE NOTICE 'MOR-001 → ACTUALIZADO id=%', v_mor001;
  END IF;

  -- Materiales: DELETE + INSERT (idempotente, igual que 035/036)
  DELETE FROM public.master_task_materials WHERE master_task_id = v_mor001;

  IF v_cem_id IS NOT NULL THEN
    INSERT INTO public.master_task_materials
      (id, master_task_id, master_material_id, material_name, unit, quantity,
       waste_percent, last_known_unit_price)
    VALUES
      (gen_random_uuid(), v_mor001, v_cem_id, 'Cemento Portland CPN 40',
       'kg', 140, 0, COALESCE(v_cem_price, 0));
  END IF;

  IF v_cal_id IS NOT NULL THEN
    INSERT INTO public.master_task_materials
      (id, master_task_id, master_material_id, material_name, unit, quantity,
       waste_percent, last_known_unit_price)
    VALUES
      (gen_random_uuid(), v_mor001, v_cal_id, 'Cal hidratada',
       'kg', 130, 0, COALESCE(v_cal_price, 0));
  END IF;

  IF v_arg_id IS NOT NULL THEN
    INSERT INTO public.master_task_materials
      (id, master_task_id, master_material_id, material_name, unit, quantity,
       waste_percent, last_known_unit_price)
    VALUES
      (gen_random_uuid(), v_mor001, v_arg_id, 'Arena gruesa limpia',
       'm3', 1.050, 0, COALESCE(v_arg_price, 0));
  END IF;


  -- ══════════════════════════════════════════════════════════════════════════
  -- MOR-002 — Mortero 1:2:9 (revoque grueso interior)
  --
  -- Dosaje por m³:
  --   80 kg   cemento Portland
  --   100 kg  cal hidratada
  --   1.050 m³ arena fina lavada
  --
  -- Rendimiento: 8 m³/día
  -- Uso: REV-001 (revoque grueso interior 1:2:9)
  -- ══════════════════════════════════════════════════════════════════════════

  SELECT id INTO v_mor002
  FROM public.master_tasks
  WHERE organization_id = v_org_uuid AND code = 'MOR-002'
  LIMIT 1;

  IF v_mor002 IS NULL THEN
    INSERT INTO public.master_tasks
      (id, organization_id, code, name, unit, category, daily_yield, is_active)
    VALUES
      (gen_random_uuid(), v_org_uuid, 'MOR-002',
       'Mortero 1:2:9 (revoque grueso interior)', 'm3', 'Morteros', 8, true)
    RETURNING id INTO v_mor002;
    v_created := v_created + 1;
    RAISE NOTICE 'MOR-002 → CREADO id=%', v_mor002;
  ELSE
    UPDATE public.master_tasks
    SET name = 'Mortero 1:2:9 (revoque grueso interior)', unit = 'm3',
        category = 'Morteros', daily_yield = 8, is_active = true
    WHERE id = v_mor002;
    v_updated := v_updated + 1;
    RAISE NOTICE 'MOR-002 → ACTUALIZADO id=%', v_mor002;
  END IF;

  DELETE FROM public.master_task_materials WHERE master_task_id = v_mor002;

  IF v_cem_id IS NOT NULL THEN
    INSERT INTO public.master_task_materials
      (id, master_task_id, master_material_id, material_name, unit, quantity,
       waste_percent, last_known_unit_price)
    VALUES
      (gen_random_uuid(), v_mor002, v_cem_id, 'Cemento Portland CPN 40',
       'kg', 80, 0, COALESCE(v_cem_price, 0));
  END IF;

  IF v_cal_id IS NOT NULL THEN
    INSERT INTO public.master_task_materials
      (id, master_task_id, master_material_id, material_name, unit, quantity,
       waste_percent, last_known_unit_price)
    VALUES
      (gen_random_uuid(), v_mor002, v_cal_id, 'Cal hidratada',
       'kg', 100, 0, COALESCE(v_cal_price, 0));
  END IF;

  IF v_arf_id IS NOT NULL THEN
    INSERT INTO public.master_task_materials
      (id, master_task_id, master_material_id, material_name, unit, quantity,
       waste_percent, last_known_unit_price)
    VALUES
      (gen_random_uuid(), v_mor002, v_arf_id, 'Arena fina lavada',
       'm3', 1.050, 0, COALESCE(v_arf_price, 0));
  END IF;


  -- ══════════════════════════════════════════════════════════════════════════
  -- MOR-003 — Mortero 1:3 cemento-arena (revoque exterior, sin cal)
  --
  -- Dosaje por m³:
  --   350 kg  cemento Portland
  --   1.050 m³ arena media lavada
  --
  -- Rendimiento: 8 m³/día
  -- Uso: REV-003 (revoque exterior hidrófugo, el hidrófugo va aparte en el APU padre)
  --      REV-004 (revoque grueso exterior 1:3)
  -- ══════════════════════════════════════════════════════════════════════════

  SELECT id INTO v_mor003
  FROM public.master_tasks
  WHERE organization_id = v_org_uuid AND code = 'MOR-003'
  LIMIT 1;

  IF v_mor003 IS NULL THEN
    INSERT INTO public.master_tasks
      (id, organization_id, code, name, unit, category, daily_yield, is_active)
    VALUES
      (gen_random_uuid(), v_org_uuid, 'MOR-003',
       'Mortero 1:3 cemento-arena (revoque exterior)', 'm3', 'Morteros', 8, true)
    RETURNING id INTO v_mor003;
    v_created := v_created + 1;
    RAISE NOTICE 'MOR-003 → CREADO id=%', v_mor003;
  ELSE
    UPDATE public.master_tasks
    SET name = 'Mortero 1:3 cemento-arena (revoque exterior)', unit = 'm3',
        category = 'Morteros', daily_yield = 8, is_active = true
    WHERE id = v_mor003;
    v_updated := v_updated + 1;
    RAISE NOTICE 'MOR-003 → ACTUALIZADO id=%', v_mor003;
  END IF;

  DELETE FROM public.master_task_materials WHERE master_task_id = v_mor003;

  IF v_cem_id IS NOT NULL THEN
    INSERT INTO public.master_task_materials
      (id, master_task_id, master_material_id, material_name, unit, quantity,
       waste_percent, last_known_unit_price)
    VALUES
      (gen_random_uuid(), v_mor003, v_cem_id, 'Cemento Portland CPN 40',
       'kg', 350, 0, COALESCE(v_cem_price, 0));
  END IF;

  -- Arena media lavada: si no existe en 041, fallback a arena gruesa limpia
  IF v_arm_id IS NOT NULL THEN
    INSERT INTO public.master_task_materials
      (id, master_task_id, master_material_id, material_name, unit, quantity,
       waste_percent, last_known_unit_price)
    VALUES
      (gen_random_uuid(), v_mor003, v_arm_id, 'Arena media lavada',
       'm3', 1.050, 0, COALESCE(v_arm_price, 0));
  ELSIF v_arg_id IS NOT NULL THEN
    RAISE WARNING 'MOR-003: Arena media lavada no encontrada — usando Arena gruesa limpia como fallback. Ejecutar migración 041.';
    INSERT INTO public.master_task_materials
      (id, master_task_id, master_material_id, material_name, unit, quantity,
       waste_percent, last_known_unit_price)
    VALUES
      (gen_random_uuid(), v_mor003, v_arg_id, 'Arena gruesa limpia',
       'm3', 1.050, 0, COALESCE(v_arg_price, 0));
  END IF;


  -- ══════════════════════════════════════════════════════════════════════════
  -- MOR-004 — Mortero 1:4 cemento-arena (contrapisos y pisos)
  --
  -- Dosaje por m³:
  --   250 kg  cemento Portland
  --   1.050 m³ arena gruesa limpia
  --
  -- Rendimiento: 10 m³/día
  -- Uso: PIS-001 (contrapiso cascote), PIS-002 (contrapiso hormigón pobre),
  --      PIS-003 (piso cemento alisado)
  -- ══════════════════════════════════════════════════════════════════════════

  SELECT id INTO v_mor004
  FROM public.master_tasks
  WHERE organization_id = v_org_uuid AND code = 'MOR-004'
  LIMIT 1;

  IF v_mor004 IS NULL THEN
    INSERT INTO public.master_tasks
      (id, organization_id, code, name, unit, category, daily_yield, is_active)
    VALUES
      (gen_random_uuid(), v_org_uuid, 'MOR-004',
       'Mortero 1:4 cemento-arena (contrapisos y pisos)', 'm3', 'Morteros', 10, true)
    RETURNING id INTO v_mor004;
    v_created := v_created + 1;
    RAISE NOTICE 'MOR-004 → CREADO id=%', v_mor004;
  ELSE
    UPDATE public.master_tasks
    SET name = 'Mortero 1:4 cemento-arena (contrapisos y pisos)', unit = 'm3',
        category = 'Morteros', daily_yield = 10, is_active = true
    WHERE id = v_mor004;
    v_updated := v_updated + 1;
    RAISE NOTICE 'MOR-004 → ACTUALIZADO id=%', v_mor004;
  END IF;

  DELETE FROM public.master_task_materials WHERE master_task_id = v_mor004;

  IF v_cem_id IS NOT NULL THEN
    INSERT INTO public.master_task_materials
      (id, master_task_id, master_material_id, material_name, unit, quantity,
       waste_percent, last_known_unit_price)
    VALUES
      (gen_random_uuid(), v_mor004, v_cem_id, 'Cemento Portland CPN 40',
       'kg', 250, 0, COALESCE(v_cem_price, 0));
  END IF;

  IF v_arg_id IS NOT NULL THEN
    INSERT INTO public.master_task_materials
      (id, master_task_id, master_material_id, material_name, unit, quantity,
       waste_percent, last_known_unit_price)
    VALUES
      (gen_random_uuid(), v_mor004, v_arg_id, 'Arena gruesa limpia',
       'm3', 1.050, 0, COALESCE(v_arg_price, 0));
  END IF;


  RAISE NOTICE 'seed_apu_morteros → creados=%, actualizados=%', v_created, v_updated;

  RETURN jsonb_build_object(
    'created', v_created,
    'updated', v_updated,
    'total',   4
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_apu_morteros(text)
  TO authenticated;

COMMENT ON FUNCTION public.seed_apu_morteros IS
  'Siembra 4 sub-APUs base de morteros (MOR-001 a MOR-004). '
  'Sin labor, sin sub-APU anidado. Unit = m3 de mortero puesto en obra. '
  'Idempotente: find-or-create en master_tasks, DELETE+INSERT en master_task_materials. '
  'Prerequisitos: migración 019 (Cemento, Arenas) + migración 041 (Cal hidratada, Arena media). '
  'Los APUs dependientes (MAM/REV/PIS con labor) van en migración 043.';


-- =============================================================================
-- BACKFILL — ejecutar para cada org que ya tiene materiales sembrados
-- =============================================================================

DO $$
DECLARE
  v_org_id  text;
  v_result  jsonb;
  v_count   integer := 0;
  v_skipped integer := 0;
  -- Patrón canónico UUID v4: 8-4-4-4-12 hex, case-insensitive
  v_uuid_re text    := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
  FOR v_org_id IN
    SELECT DISTINCT organization_id
    FROM public.master_materials
    WHERE is_active = true
  LOOP
    -- Omitir organization_id legacy (no casteables a uuid)
    IF v_org_id !~ v_uuid_re THEN
      RAISE NOTICE 'Backfill 042: omitiendo org legacy "%" (no es UUID válido)', v_org_id;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_result := public.seed_apu_morteros(v_org_id);
    v_count  := v_count + 1;
    RAISE NOTICE 'seed_apu_morteros org %: %', v_org_id, v_result;
  END LOOP;

  IF v_count = 0 AND v_skipped = 0 THEN
    RAISE NOTICE 'No hay organizaciones con master_materials activos — backfill omitido.';
  ELSE
    RAISE NOTICE 'Backfill 042 completado: % procesada(s), % omitida(s) por org legacy.', v_count, v_skipped;
  END IF;
END;
$$;


-- =============================================================================
-- VERIFICACIÓN RÁPIDA (ejecutar manualmente si se quiere confirmar el seed)
-- =============================================================================
--
-- SELECT mt.code, mt.name, mt.unit, mt.daily_yield,
--        mtm.material_name, mtm.unit AS mat_unit, mtm.quantity
-- FROM public.master_tasks mt
-- JOIN public.master_task_materials mtm ON mtm.master_task_id = mt.id
-- WHERE mt.category = 'Morteros'
--   AND mt.code IN ('MOR-001','MOR-002','MOR-003','MOR-004')
-- ORDER BY mt.code, mtm.material_name;
--
-- Resultado esperado: 11 filas (3+3+2+2+1 +1 = MOR-001×3, MOR-002×3, MOR-003×2, MOR-004×2)
--
-- SELECT code, name, count(*) AS mats
-- FROM public.master_tasks mt
-- JOIN public.master_task_materials mtm ON mtm.master_task_id = mt.id
-- WHERE mt.category = 'Morteros'
-- GROUP BY code, name ORDER BY code;
-- Esperado: MOR-001→3, MOR-002→3, MOR-003→2, MOR-004→2
-- =============================================================================
