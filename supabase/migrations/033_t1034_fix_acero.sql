-- ============================================================
-- MIGRATION 033 — T1034: reemplazo quirúrgico de acero legacy
--
-- Problema diagnosticado:
--   master_task_materials de T1034 contiene una fila de acero legacy:
--     · material_name = "Acero Aletado conform. de 10 mm"
--     · unit           = 'Kg'   (inconsistente — debería ser 'kg')
--     · unit_price     = 4.85   (precio incorrecto / era de otra época)
--     · master_material_id = NULL  (sin FK canónica)
--     · conversion_factor  = NULL
--     · commercial_unit    = NULL
--
--   Causa raíz: migration 029 tenía una guardia "skip si ya existe composición".
--   T1034 ya tenía datos legacy cuando 029 se ejecutó → RETURN temprano.
--   La fila legacy sobrevivió.
--
-- Solución (Opción A — FK canónica):
--   Reemplazar la fila de acero por una vinculada a "Hierro nervado Ø12 mm"
--   del catálogo master_materials:
--     · material_name      = 'Acero ADN 420'         (nombre APU / técnico)
--     · unit               = 'kg'
--     · quantity           = 130.0                   (kg/m3 sin cambio)
--     · last_known_unit_price = precio actual del maestro (≈ 960 $/kg)
--     · master_material_id = FK a 'Hierro nervado Ø12 mm'
--     · conversion_factor  = NULL  (varia por diámetro; frontend lo inyecta)
--     · commercial_unit    = NULL  (constraint exige CF si CU ≠ NULL)
--
-- Compatibilidad mantenida:
--   · APU / calculateMasterTaskCost: usa last_known_unit_price → correcto
--   · RPC 015 (calculadora): usa last_known_unit_price (PATH A) → correcto
--   · RPC 016 (reporte técnico APU): idem → correcto
--   · frontend mapMaterialToReal: step 3 + fallback precio → 960 $/kg
--   · budget_items: NO TOCADO
--   · master_task_labor: NO TOCADO
--   · T1033: NO TOCADO
--
-- IDEMPOTENTE: re-ejecutar elimina solo la fila de acero y la recrea igual.
-- NO toca hormigón ni mano de obra de T1034.
-- ============================================================

DO $$
DECLARE
  v_org_text  CONSTANT text := '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f';
  v_org_uuid  CONSTANT uuid := '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f';

  v_t1034         uuid;
  v_fe12_id       uuid;
  v_fe12_price    numeric := 0;
  v_deleted_ct    int;
  v_task_exists   boolean;
BEGIN

  -- Seed/reparación histórica de una organización concreta: no crear
  -- usuarios ni organizaciones artificiales durante un arranque local limpio.
  -- La migración de esquema sigue siendo válida aunque esa organización no exista.
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations WHERE id = v_org_uuid
  ) THEN
    RAISE NOTICE 'Omitiendo 033_t1034_fix_acero.sql: organización de origen no presente';
    RETURN;
  END IF;


  -- ── 0. Verificar que T1034 existe en la org canónica ───────────────────────
  SELECT id INTO v_t1034
  FROM public.master_tasks
  WHERE organization_id = v_org_uuid
    AND code = 'T1034'
    AND is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_t1034 IS NULL THEN
    RAISE EXCEPTION 'T1034 no encontrada en org %. Abortando.', v_org_text;
  END IF;
  RAISE NOTICE 'T1034 id=%', v_t1034;

  -- ── 1. Resolver "Hierro nervado Ø12 mm" en master_materials ────────────────
  -- Búsqueda por nombre exacto primero; fallback a cualquier hierro/acero en kg con precio.
  SELECT id, unit_price
    INTO v_fe12_id, v_fe12_price
  FROM public.master_materials
  WHERE organization_id = v_org_text
    AND is_active = true
    AND name = 'Hierro nervado Ø12 mm'
  LIMIT 1;

  IF v_fe12_id IS NULL THEN
    -- Fallback: cualquier hierro nervado en kg con precio > 0
    SELECT id, unit_price
      INTO v_fe12_id, v_fe12_price
    FROM public.master_materials
    WHERE organization_id = v_org_text
      AND is_active = true
      AND LOWER(unit) IN ('kg', 'kgs')
      AND unit_price > 0
      AND (LOWER(name) LIKE '%hierro nervado%' OR LOWER(name) LIKE '%acero adn%')
    ORDER BY unit_price DESC
    LIMIT 1;
  END IF;

  IF v_fe12_id IS NULL THEN
    RAISE EXCEPTION
      'No se encontró master_material de acero/hierro en kg para org %. '
      'Ejecutar seed_extended_materials antes de esta migración.',
      v_org_text;
  END IF;

  RAISE NOTICE 'Acero maestro: id=%, unit_price=%', v_fe12_id, v_fe12_price;

  -- ── 2. Eliminar SOLO la(s) fila(s) de acero/hierro legacy de T1034 ────────
  -- Identificadas por nombre (insensible a mayúsculas/espacios).
  -- NO toca hormigón ni otras filas.
  DELETE FROM public.master_task_materials
  WHERE master_task_id = v_t1034
    AND (
      LOWER(material_name) LIKE '%acero%'
      OR LOWER(material_name) LIKE '%hierro%'
    );

  GET DIAGNOSTICS v_deleted_ct = ROW_COUNT;
  RAISE NOTICE 'T1034: % fila(s) de acero eliminadas', v_deleted_ct;

  -- ── 3. Insertar fila canónica ──────────────────────────────────────────────
  INSERT INTO public.master_task_materials
    (id, master_task_id, master_material_id, material_name, unit, quantity,
     last_known_unit_price, conversion_factor, commercial_unit, waste_percent)
  VALUES
    (gen_random_uuid(),
     v_t1034,
     v_fe12_id,
     'Acero ADN 420',
     'kg',
     130.0,
     COALESCE(v_fe12_price, 0),
     NULL,   -- conversion_factor: varia por diámetro; frontend lo inyecta
     NULL,   -- commercial_unit:   constraint exige CF si CU ≠ NULL
     0);

  RAISE NOTICE '────────────────────────────────────────────────────────────────';
  RAISE NOTICE 'T1034 — acero corregido:';
  RAISE NOTICE '  material_name       = Acero ADN 420';
  RAISE NOTICE '  unit                = kg';
  RAISE NOTICE '  quantity            = 130.0';
  RAISE NOTICE '  last_known_unit_price = %', COALESCE(v_fe12_price, 0);
  RAISE NOTICE '  master_material_id  = %', v_fe12_id;
  RAISE NOTICE '  conversion_factor   = NULL (inyectado por frontend según diámetro)';
  RAISE NOTICE '  commercial_unit     = NULL';
  RAISE NOTICE '────────────────────────────────────────────────────────────────';

END $$;


-- ── QUERY DE VERIFICACIÓN POST-FIX ──────────────────────────────────────────
-- Ejecutar manualmente después del DO block para confirmar el resultado:
/*
SELECT
  mt.code                           AS task_code,
  mt.name                           AS task_name,
  mtm.material_name,
  mtm.unit,
  mtm.quantity::text,
  mtm.last_known_unit_price::text,
  mtm.master_material_id::text,
  mm.name                           AS mm_name,
  mm.unit                           AS mm_unit,
  mm.unit_price::text               AS mm_unit_price,
  mm.commercial_unit,
  mm.conversion_factor::text
FROM public.master_task_materials mtm
JOIN public.master_tasks mt
  ON mt.id = mtm.master_task_id
LEFT JOIN public.master_materials mm
  ON mm.id = mtm.master_material_id
WHERE mt.code = 'T1034'
ORDER BY mtm.material_name;
*/
