-- =============================================================================
-- Migración 059: Guards de membresía cross-tenant en RPCs SECURITY DEFINER
-- Fecha: 2026-10-17
--
-- CONTEXTO / AUDITORÍA
-- ---------------------
-- Las siguientes 9 funciones son SECURITY DEFINER y hasta ahora NO validaban
-- que el usuario autenticado (auth.uid()) fuera miembro de la organización
-- cuyo UUID/text recibe como parámetro p_org_id. Como son invocables
-- directamente vía supabase.rpc(...) desde el cliente, cualquier usuario
-- autenticado de CUALQUIER organización podía pasar el UUID de OTRA
-- organización y leer o escribir datos de esa org ajena (seeds de
-- materiales/APUs, reglas comerciales, entitlements de billing).
--
-- Esta migración es exclusivamente un parche de seguridad (defense in depth
-- a nivel RPC, además de RLS): NO cambia la lógica de negocio de ninguna
-- función. Cada CREATE OR REPLACE FUNCTION reproduce el cuerpo vigente de
-- la función (última versión definida en migraciones anteriores) agregando:
--   1. Un guard de autorización al inicio del cuerpo:
--      - Funciones de escritura (8): is_org_member_with_role(p_org_id,
--        ARRAY['owner','admin']) — overload TEXT (ver 007_rls_policies.sql).
--        Si el caller no es owner/admin de esa org → RAISE EXCEPTION 'FORBIDDEN'
--        USING ERRCODE = '42501'.
--      - get_org_entitlements (1, solo lectura): is_org_member(p_org_id) —
--        overload UUID. Cualquier rol de la org puede leer sus entitlements;
--        si no es miembro, se retorna NULL (fail-closed, sin exponer datos).
--   2. SET search_path = public donde faltaba (solo get_org_entitlements).
--
-- Funciones corregidas:
--   1. seed_extended_materials(p_org_id text)   — 019 (última definición: 023)
--   2. seed_extended_apu(p_org_id text)         — 019
--   3. seed_material_codes(p_org_id text)       — 020
--   4. apply_commercial_rules(p_org_id text)    — 022
--   5. seed_mortero_materials(p_org_id text)    — 041
--   6. seed_apu_morteros(p_org_id text)         — 042
--   7. seed_apu_mam_rev(p_org_id text)          — 043a
--   8. seed_exc_mam_materials(p_org_id text)    — 044
--   9. get_org_entitlements(p_org_id uuid)      — 039 (lectura, solo membresía)
--
-- IMPORTANTE: esta migración NO fue aplicada a ninguna base de datos. Debe
-- revisarse y ejecutarse manualmente (supabase db push o SQL Editor del
-- dashboard) por el responsable del proyecto. Ver PR para el plan de test.
-- =============================================================================


-- =============================================================================
-- 1. seed_extended_materials(p_org_id text)
--    Cuerpo vigente: migración 023 (última redefinición).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.seed_extended_materials(
  p_org_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
  v_updated  integer := 0;
  v_total    integer := 0;

  v_materials jsonb := jsonb_build_array(

    -- ── AGLOMERANTES ─────────────────────────────────────────────────────────
    jsonb_build_object('name','Cemento Portland CPN 40',    'unit','kg',  'unit_price',180,  'category','Aglomerantes', 'commercial_format','Bolsa 50 kg',  'commercial_unit','bolsa 50 kg', 'waste_percent',3,  'conversion_factor',50),
    jsonb_build_object('name','Cal hidráulica',              'unit','kg',  'unit_price',95,   'category','Aglomerantes', 'commercial_format','Bolsa 25 kg',  'commercial_unit','bolsa 25 kg', 'waste_percent',3,  'conversion_factor',25),
    jsonb_build_object('name','Cal aérea en polvo',          'unit','kg',  'unit_price',85,   'category','Aglomerantes', 'commercial_format','Bolsa 20 kg',  'commercial_unit','bolsa 20 kg', 'waste_percent',3,  'conversion_factor',20),
    jsonb_build_object('name','Yeso de construcción',        'unit','kg',  'unit_price',70,   'category','Aglomerantes', 'commercial_format','Bolsa 40 kg',  'commercial_unit','bolsa 40 kg', 'waste_percent',5,  'conversion_factor',40),
    jsonb_build_object('name','Adhesivo para cerámicos',     'unit','kg',  'unit_price',320,  'category','Aglomerantes', 'commercial_format','Bolsa 25 kg',  'commercial_unit','bolsa 25 kg', 'waste_percent',10, 'conversion_factor',25),

    -- ── ÁRIDOS ───────────────────────────────────────────────────────────────
    jsonb_build_object('name','Arena fina lavada',           'unit','m3',  'unit_price',9500, 'category','Áridos',        'waste_percent',5),
    jsonb_build_object('name','Arena gruesa limpia',         'unit','m3',  'unit_price',8800, 'category','Áridos',        'waste_percent',5),
    jsonb_build_object('name','Piedra triturada 6/20',       'unit','m3',  'unit_price',11200,'category','Áridos',        'waste_percent',5),
    jsonb_build_object('name','Tosca compactable',           'unit','m3',  'unit_price',3200, 'category','Áridos',        'waste_percent',0),
    jsonb_build_object('name','Grout de nivelación',         'unit','kg',  'unit_price',280,  'category','Áridos',        'commercial_format','Bolsa 25 kg',  'commercial_unit','bolsa 25 kg', 'waste_percent',5, 'conversion_factor',25),

    -- ── ESTRUCTURAL ──────────────────────────────────────────────────────────
    -- NOTA: hierro nervado → commercial_unit omitido intencionalmente.
    -- La masa de 1 barra varía por diámetro (Ø6≈2.7kg, Ø8≈4.7kg, Ø10≈7.4kg, Ø12≈10.7kg),
    -- no existe un conversion_factor único correcto. La constraint
    -- mm_commercial_unit_requires_factor exige que si commercial_unit IS NOT NULL
    -- entonces conversion_factor también sea NOT NULL.
    -- Se mantiene commercial_format como texto informativo para el usuario.
    jsonb_build_object('name','Hierro nervado Ø6 mm',        'unit','kg',  'unit_price',920,  'category','Estructural',   'commercial_format','Barra 12 m',   'waste_percent',8),
    jsonb_build_object('name','Hierro nervado Ø8 mm',        'unit','kg',  'unit_price',935,  'category','Estructural',   'commercial_format','Barra 12 m',   'waste_percent',8),
    jsonb_build_object('name','Hierro nervado Ø10 mm',       'unit','kg',  'unit_price',950,  'category','Estructural',   'commercial_format','Barra 12 m',   'waste_percent',8),
    jsonb_build_object('name','Hierro nervado Ø12 mm',       'unit','kg',  'unit_price',960,  'category','Estructural',   'commercial_format','Barra 12 m',   'waste_percent',8),
    jsonb_build_object('name','Malla electrosoldada Ø5 c15', 'unit','m2',  'unit_price',1850, 'category','Estructural',   'waste_percent',10),
    jsonb_build_object('name','Estribos prefabricados Ø6',   'unit','kg',  'unit_price',980,  'category','Estructural',   'waste_percent',5),

    -- ── MAMPOSTERÍA ──────────────────────────────────────────────────────────
    jsonb_build_object('name','Ladrillo cerámico 18x18x33',  'unit','u',   'unit_price',260,  'category','Mampostería',   'waste_percent',5),
    jsonb_build_object('name','Ladrillo hueco 12x18x33',     'unit','u',   'unit_price',180,  'category','Mampostería',   'waste_percent',5),
    jsonb_build_object('name','Bloque cemento 20x20x40',     'unit','u',   'unit_price',420,  'category','Mampostería',   'waste_percent',3),
    jsonb_build_object('name','Ladrillo visto 5,5x12x25',    'unit','u',   'unit_price',310,  'category','Mampostería',   'waste_percent',5),

    -- ── PISOS Y REVESTIMIENTOS ───────────────────────────────────────────────
    jsonb_build_object('name','Porcelanato 60x60 cm',        'unit','m2',  'unit_price',8500, 'category','Pisos',         'waste_percent',10),
    jsonb_build_object('name','Cerámico 33x33 cm',           'unit','m2',  'unit_price',3200, 'category','Pisos',         'waste_percent',10),
    jsonb_build_object('name','Membrana asfáltica 4mm',      'unit','m2',  'unit_price',2800, 'category','Impermeab.',    'waste_percent',10),
    jsonb_build_object('name','Sellador epoxi para pisos',   'unit','lt',  'unit_price',1200, 'category','Pisos'),
    -- NUEVO 023: azulejo 15×15cm — unidad técnica = un (46 un por m² de pared en RVE-001)
    jsonb_build_object('name','Azulejo 15×15cm',             'unit','un',  'unit_price',90,   'category','Pisos',         'waste_percent',10),
    -- NUEVO 023: pastina cementicia — unidad técnica = kg
    jsonb_build_object('name','Pastina cementicia',          'unit','kg',  'unit_price',480,  'category','Pisos',         'waste_percent',5),

    -- ── PINTURAS ─────────────────────────────────────────────────────────────
    jsonb_build_object('name','Pintura látex interior blanco','unit','lt',  'unit_price',1450, 'category','Pinturas',     'commercial_format','Balde 20 lt',  'commercial_unit','balde 20 lt', 'waste_percent',5, 'conversion_factor',20),
    jsonb_build_object('name','Pintura látex exterior',       'unit','lt',  'unit_price',1650, 'category','Pinturas',     'commercial_format','Balde 20 lt',  'commercial_unit','balde 20 lt', 'waste_percent',5, 'conversion_factor',20),
    jsonb_build_object('name','Fijador de paredes',           'unit','lt',  'unit_price',780,  'category','Pinturas',     'commercial_format','Balde 20 lt',  'commercial_unit','balde 20 lt', 'conversion_factor',20),
    jsonb_build_object('name','Enduido plástico',             'unit','kg',  'unit_price',380,  'category','Pinturas',     'commercial_format','Balde 30 kg',  'commercial_unit','balde 30 kg', 'waste_percent',5, 'conversion_factor',30),

    -- ── MADERA Y ENCOFRADO ───────────────────────────────────────────────────
    jsonb_build_object('name','Tabla de pino 1"×10"×3m',     'unit','u',   'unit_price',3800, 'category','Madera',        'waste_percent',15),
    jsonb_build_object('name','Madera pino cepillada 3×3',   'unit','m',   'unit_price',1800, 'category','Madera'),
    jsonb_build_object('name','Puntal metálico telescópico', 'unit','u',   'unit_price',4500, 'category','Encofrado'),
    jsonb_build_object('name','Film polietileno 200 micrones','unit','m2',  'unit_price',180,  'category','Impermeab.'),

    -- ── ELECTRICIDAD ─────────────────────────────────────────────────────────
    jsonb_build_object('name','Cable NYY 2×1.5 mm²',         'unit','m',   'unit_price',850,  'category','Electricidad'),
    jsonb_build_object('name','Cable unipolar 2.5 mm² negro', 'unit','m',  'unit_price',380,  'category','Electricidad'),
    jsonb_build_object('name','Cañería PVC 20 mm (eléctrica)','unit','m',  'unit_price',180,  'category','Electricidad'),
    jsonb_build_object('name','Caja plástica 4×4"',           'unit','u',  'unit_price',120,  'category','Electricidad'),

    -- ── SANITARIA ────────────────────────────────────────────────────────────
    jsonb_build_object('name','Caño PVC 110 mm',             'unit','m',   'unit_price',1250, 'category','Sanitaria',     'commercial_format','Caño 3 m',     'commercial_unit','caño 3 m',    'conversion_factor',3),
    jsonb_build_object('name','Caño PVC 63 mm',              'unit','m',   'unit_price',680,  'category','Sanitaria',     'commercial_format','Caño 3 m',     'commercial_unit','caño 3 m',    'conversion_factor',3),
    jsonb_build_object('name','Codo PVC 110×90°',            'unit','u',   'unit_price',320,  'category','Sanitaria'),
    jsonb_build_object('name','Pegamento para PVC',          'unit','lt',  'unit_price',1100, 'category','Sanitaria',     'commercial_format','Frasco 250 cc')
  );

  v_m    jsonb;
  v_id   uuid;
  v_exists boolean;
  -- Normalización defensiva contra constraint mm_commercial_unit_requires_factor:
  -- commercial_unit solo puede ser NOT NULL cuando conversion_factor también lo es.
  v_cf   numeric;   -- conversion_factor del registro actual
  v_cu   text;      -- commercial_unit — se anula si v_cf es NULL
BEGIN
  -- ── GUARD (059): solo owner/admin de la org pueden sembrar datos de esa org ──
  IF NOT public.is_org_member_with_role(p_org_id, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  FOR v_m IN SELECT jsonb_array_elements(v_materials)
  LOOP
    -- Resolver conversion_factor y commercial_unit de forma atómica.
    -- Si el jsonb trae commercial_unit pero no conversion_factor (ej.: hierro),
    -- ambos quedan NULL para no violar mm_commercial_unit_requires_factor.
    v_cf := NULLIF(TRIM(COALESCE(v_m->>'conversion_factor', '')), '')::numeric;
    v_cu := CASE WHEN v_cf IS NOT NULL THEN NULLIF(TRIM(COALESCE(v_m->>'commercial_unit', '')), '') ELSE NULL END;

    SELECT EXISTS (
      SELECT 1 FROM public.master_materials
      WHERE organization_id = p_org_id
        AND name = v_m->>'name'
        AND is_active = true
    ) INTO v_exists;

    IF v_exists THEN
      UPDATE public.master_materials
      SET
        unit_price         = (v_m->>'unit_price')::numeric,
        commercial_format  = v_m->>'commercial_format',
        -- Solo completar los campos de conversión si siguen NULL en DB
        -- y el jsonb trae un par coherente (v_cu/v_cf ya normalizados arriba).
        commercial_unit    = COALESCE(commercial_unit,   v_cu),
        conversion_factor  = COALESCE(conversion_factor, v_cf),
        waste_percent      = COALESCE((v_m->>'waste_percent')::numeric, waste_percent),
        updated_at         = now()
      WHERE organization_id = p_org_id
        AND name = v_m->>'name'
        AND is_active = true;
      v_updated := v_updated + 1;
    ELSE
      v_id := gen_random_uuid();
      INSERT INTO public.master_materials (
        id, organization_id, name, unit, unit_price,
        category, commercial_format, commercial_unit, conversion_factor,
        waste_percent, is_active
      ) VALUES (
        v_id,
        p_org_id,
        v_m->>'name',
        v_m->>'unit',
        (v_m->>'unit_price')::numeric,
        v_m->>'category',
        v_m->>'commercial_format',
        v_cu,   -- ya normalizado: NULL si no hay conversion_factor
        v_cf,   -- ya normalizado: NULL si no vino en el jsonb
        COALESCE((v_m->>'waste_percent')::numeric, 0),
        true
      );
      v_inserted := v_inserted + 1;
    END IF;

    v_total := v_total + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'updated',  v_updated,
    'total',    v_total
  );
END;
$$;

COMMENT ON FUNCTION public.seed_extended_materials IS
  'Siembra materiales de construcción extendidos para demo/setup inicial. '
  'Idempotente: actualiza precio si el material ya existe por (organization_id, name). '
  'Escribe commercial_unit y conversion_factor sin pisar datos existentes. '
  'v023: agrega Azulejo 15×15cm y Pastina cementicia para catálogo Chandías RVE-001. '
  'v059: requiere que el caller sea owner/admin de p_org_id (guard anti cross-tenant). '
  'Los precios son orientativos para Argentina, Abril 2026.';


-- =============================================================================
-- 2. seed_extended_apu(p_org_id text)
--    Cuerpo vigente: migración 019 (sin redefiniciones posteriores).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.seed_extended_apu(
  p_org_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
  v_skipped  integer := 0;

  -- IDs de APUs
  v_task_id  uuid;

  -- IDs de materiales (resueltos por nombre)
  v_mat_por   uuid; -- porcelanato
  v_mat_adh   uuid; -- adhesivo
  v_mat_grout uuid; -- grout
  v_mat_fe8   uuid; -- hierro Ø8
  v_mat_fe10  uuid; -- hierro Ø10
  v_mat_est   uuid; -- estribos
  v_mat_tabla uuid; -- tabla pino 1×10
  v_mat_film  uuid; -- film polietileno
  v_mat_punt  uuid; -- puntal
  v_mat_lat   uuid; -- pintura látex
  v_mat_fij   uuid; -- fijador
  v_mat_end   uuid; -- enduido

  -- IDs de labor (resueltos por role)
  v_lab_ofi   uuid;
  v_lab_med   uuid;
  v_lab_ayu   uuid;

  -- IDs de tools (resueltos por nombre)
  v_tool_horm uuid; -- hormigonera
  v_tool_and  uuid; -- andamio

  -- Materiales de la función resolve
  m record;
BEGIN
  -- ── GUARD (059): solo owner/admin de la org pueden sembrar datos de esa org ──
  IF NOT public.is_org_member_with_role(p_org_id, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- ── Resolver material IDs ────────────────────────────────────────────────
  FOR m IN
    SELECT id, name FROM public.master_materials
    WHERE organization_id = p_org_id AND is_active = true
      AND name IN (
        'Porcelanato 60x60 cm', 'Adhesivo para cerámicos', 'Grout de nivelación',
        'Hierro nervado Ø8 mm', 'Hierro nervado Ø10 mm', 'Estribos prefabricados Ø6',
        'Tabla de pino 1"×10"×3m', 'Film polietileno 200 micrones', 'Puntal metálico telescópico',
        'Pintura látex interior blanco', 'Fijador de paredes', 'Enduido plástico'
      )
  LOOP
    CASE m.name
      WHEN 'Porcelanato 60x60 cm'            THEN v_mat_por   := m.id;
      WHEN 'Adhesivo para cerámicos'          THEN v_mat_adh   := m.id;
      WHEN 'Grout de nivelación'             THEN v_mat_grout := m.id;
      WHEN 'Hierro nervado Ø8 mm'            THEN v_mat_fe8   := m.id;
      WHEN 'Hierro nervado Ø10 mm'           THEN v_mat_fe10  := m.id;
      WHEN 'Estribos prefabricados Ø6'       THEN v_mat_est   := m.id;
      WHEN 'Tabla de pino 1"×10"×3m'         THEN v_mat_tabla := m.id;
      WHEN 'Film polietileno 200 micrones'   THEN v_mat_film  := m.id;
      WHEN 'Puntal metálico telescópico'     THEN v_mat_punt  := m.id;
      WHEN 'Pintura látex interior blanco'   THEN v_mat_lat   := m.id;
      WHEN 'Fijador de paredes'              THEN v_mat_fij   := m.id;
      WHEN 'Enduido plástico'               THEN v_mat_end   := m.id;
      ELSE NULL;
    END CASE;
  END LOOP;

  -- ── Resolver labor IDs ───────────────────────────────────────────────────
  SELECT id INTO v_lab_ofi FROM public.labor_categories
  WHERE organization_id = p_org_id AND role = 'Oficial albañil' LIMIT 1;

  SELECT id INTO v_lab_med FROM public.labor_categories
  WHERE organization_id = p_org_id AND role = 'Medio oficial' LIMIT 1;

  SELECT id INTO v_lab_ayu FROM public.labor_categories
  WHERE organization_id = p_org_id AND role = 'Ayudante de obra' LIMIT 1;

  -- ── Resolver tool IDs ────────────────────────────────────────────────────
  SELECT id INTO v_tool_horm FROM public.tools
  WHERE organization_id = p_org_id AND name = 'Hormigonera 300 L' LIMIT 1;

  SELECT id INTO v_tool_and FROM public.tools
  WHERE organization_id = p_org_id AND name = 'Andamio tubular (juego)' LIMIT 1;

  -- ════════════════════════════════════════════════════════════════════════
  -- APU 1: COL-001 — Colocación de porcelanato 60×60 cm
  -- ════════════════════════════════════════════════════════════════════════
  IF NOT EXISTS (
    SELECT 1 FROM public.master_tasks
    WHERE organization_id::text = p_org_id AND name = 'Colocación de porcelanato 60×60 cm'
      AND is_active = true
  ) THEN
    INSERT INTO public.master_tasks (
      id, organization_id, code, name, unit, category, daily_yield, is_active
    ) VALUES (
      gen_random_uuid(), p_org_id, 'COL-001',
      'Colocación de porcelanato 60×60 cm', 'm2', 'Pisos', 20, true
    ) RETURNING id INTO v_task_id;

    IF v_mat_por IS NOT NULL THEN
      INSERT INTO public.master_task_materials
        (id, master_task_id, material_name, unit, quantity, waste_percent,
         master_material_id, last_known_unit_price)
      SELECT gen_random_uuid(), v_task_id, 'Porcelanato 60x60 cm', 'm2',
             1.0, 10, v_mat_por, unit_price
      FROM public.master_materials WHERE id = v_mat_por;
    END IF;

    IF v_mat_adh IS NOT NULL THEN
      INSERT INTO public.master_task_materials
        (id, master_task_id, material_name, unit, quantity, waste_percent,
         master_material_id, last_known_unit_price, conversion_factor, commercial_unit)
      SELECT gen_random_uuid(), v_task_id, 'Adhesivo para cerámicos', 'kg',
             4.5, 10, v_mat_adh, unit_price, 25, 'bolsa 25 kg'
      FROM public.master_materials WHERE id = v_mat_adh;
    END IF;

    IF v_mat_grout IS NOT NULL THEN
      INSERT INTO public.master_task_materials
        (id, master_task_id, material_name, unit, quantity, waste_percent,
         master_material_id, last_known_unit_price, conversion_factor, commercial_unit)
      SELECT gen_random_uuid(), v_task_id, 'Grout de nivelación', 'kg',
             0.5, 5, v_mat_grout, unit_price, 25, 'bolsa 25 kg'
      FROM public.master_materials WHERE id = v_mat_grout;
    END IF;

    IF v_lab_ofi IS NOT NULL THEN
      INSERT INTO public.master_task_labor
        (id, master_task_id, labor_category_id, labor_category_name, quantity)
      VALUES (gen_random_uuid(), v_task_id, v_lab_ofi::text, 'Oficial albañil', 0.5);
    END IF;
    IF v_lab_ayu IS NOT NULL THEN
      INSERT INTO public.master_task_labor
        (id, master_task_id, labor_category_id, labor_category_name, quantity)
      VALUES (gen_random_uuid(), v_task_id, v_lab_ayu::text, 'Ayudante de obra', 0.3);
    END IF;

    v_inserted := v_inserted + 1;
  ELSE
    v_skipped := v_skipped + 1;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- APU 2: ARM-001 — Armadura de hierro nervado
  -- ════════════════════════════════════════════════════════════════════════
  IF NOT EXISTS (
    SELECT 1 FROM public.master_tasks
    WHERE organization_id::text = p_org_id AND name = 'Armadura de hierro nervado'
      AND is_active = true
  ) THEN
    INSERT INTO public.master_tasks (
      id, organization_id, code, name, unit, category, daily_yield, is_active
    ) VALUES (
      gen_random_uuid(), p_org_id, 'ARM-001',
      'Armadura de hierro nervado', 'kg', 'Hormigón', 200, true
    ) RETURNING id INTO v_task_id;

    IF v_mat_fe10 IS NOT NULL THEN
      INSERT INTO public.master_task_materials
        (id, master_task_id, material_name, unit, quantity, waste_percent,
         master_material_id, last_known_unit_price)
      SELECT gen_random_uuid(), v_task_id, 'Hierro nervado Ø10 mm', 'kg',
             1.0, 8, v_mat_fe10, unit_price
      FROM public.master_materials WHERE id = v_mat_fe10;
    END IF;

    IF v_lab_ofi IS NOT NULL THEN
      INSERT INTO public.master_task_labor
        (id, master_task_id, labor_category_id, labor_category_name, quantity)
      VALUES (gen_random_uuid(), v_task_id, v_lab_ofi::text, 'Oficial albañil', 0.2);
    END IF;
    IF v_lab_ayu IS NOT NULL THEN
      INSERT INTO public.master_task_labor
        (id, master_task_id, labor_category_id, labor_category_name, quantity)
      VALUES (gen_random_uuid(), v_task_id, v_lab_ayu::text, 'Ayudante de obra', 0.3);
    END IF;

    v_inserted := v_inserted + 1;
  ELSE
    v_skipped := v_skipped + 1;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- APU 3: ENC-001 — Encofrado de losa con tablas
  -- ════════════════════════════════════════════════════════════════════════
  IF NOT EXISTS (
    SELECT 1 FROM public.master_tasks
    WHERE organization_id::text = p_org_id AND name = 'Encofrado de losa con tablas'
      AND is_active = true
  ) THEN
    INSERT INTO public.master_tasks (
      id, organization_id, code, name, unit, category, daily_yield, is_active
    ) VALUES (
      gen_random_uuid(), p_org_id, 'ENC-001',
      'Encofrado de losa con tablas', 'm2', 'Encofrados', 15, true
    ) RETURNING id INTO v_task_id;

    IF v_mat_tabla IS NOT NULL THEN
      INSERT INTO public.master_task_materials
        (id, master_task_id, material_name, unit, quantity, waste_percent,
         master_material_id, last_known_unit_price)
      SELECT gen_random_uuid(), v_task_id, 'Tabla de pino 1"×10"×3m', 'u',
             0.8, 15, v_mat_tabla, unit_price
      FROM public.master_materials WHERE id = v_mat_tabla;
    END IF;

    IF v_mat_punt IS NOT NULL THEN
      INSERT INTO public.master_task_materials
        (id, master_task_id, material_name, unit, quantity, waste_percent,
         master_material_id, last_known_unit_price)
      SELECT gen_random_uuid(), v_task_id, 'Puntal metálico telescópico', 'u',
             0.15, 0, v_mat_punt, unit_price
      FROM public.master_materials WHERE id = v_mat_punt;
    END IF;

    IF v_mat_film IS NOT NULL THEN
      INSERT INTO public.master_task_materials
        (id, master_task_id, material_name, unit, quantity, waste_percent,
         master_material_id, last_known_unit_price)
      SELECT gen_random_uuid(), v_task_id, 'Film polietileno 200 micrones', 'm2',
             1.1, 5, v_mat_film, unit_price
      FROM public.master_materials WHERE id = v_mat_film;
    END IF;

    IF v_lab_ofi IS NOT NULL THEN
      INSERT INTO public.master_task_labor
        (id, master_task_id, labor_category_id, labor_category_name, quantity)
      VALUES (gen_random_uuid(), v_task_id, v_lab_ofi::text, 'Oficial albañil', 0.4);
    END IF;
    IF v_lab_ayu IS NOT NULL THEN
      INSERT INTO public.master_task_labor
        (id, master_task_id, labor_category_id, labor_category_name, quantity)
      VALUES (gen_random_uuid(), v_task_id, v_lab_ayu::text, 'Ayudante de obra', 0.5);
    END IF;

    v_inserted := v_inserted + 1;
  ELSE
    v_skipped := v_skipped + 1;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- APU 4: PIN-001 — Pintura látex interior (2 manos + fijador + enduido)
  -- ════════════════════════════════════════════════════════════════════════
  IF NOT EXISTS (
    SELECT 1 FROM public.master_tasks
    WHERE organization_id::text = p_org_id AND name = 'Pintura látex interior (2 manos)'
      AND is_active = true
  ) THEN
    INSERT INTO public.master_tasks (
      id, organization_id, code, name, unit, category, daily_yield, is_active
    ) VALUES (
      gen_random_uuid(), p_org_id, 'PIN-001',
      'Pintura látex interior (2 manos)', 'm2', 'Pinturas', 45, true
    ) RETURNING id INTO v_task_id;

    IF v_mat_fij IS NOT NULL THEN
      INSERT INTO public.master_task_materials
        (id, master_task_id, material_name, unit, quantity, waste_percent,
         master_material_id, last_known_unit_price, conversion_factor, commercial_unit)
      SELECT gen_random_uuid(), v_task_id, 'Fijador de paredes', 'lt',
             0.12, 5, v_mat_fij, unit_price, 20, 'balde 20 lt'
      FROM public.master_materials WHERE id = v_mat_fij;
    END IF;

    IF v_mat_end IS NOT NULL THEN
      INSERT INTO public.master_task_materials
        (id, master_task_id, material_name, unit, quantity, waste_percent,
         master_material_id, last_known_unit_price, conversion_factor, commercial_unit)
      SELECT gen_random_uuid(), v_task_id, 'Enduido plástico', 'kg',
             0.35, 5, v_mat_end, unit_price, 30, 'balde 30 kg'
      FROM public.master_materials WHERE id = v_mat_end;
    END IF;

    IF v_mat_lat IS NOT NULL THEN
      INSERT INTO public.master_task_materials
        (id, master_task_id, material_name, unit, quantity, waste_percent,
         master_material_id, last_known_unit_price, conversion_factor, commercial_unit)
      SELECT gen_random_uuid(), v_task_id, 'Pintura látex interior blanco', 'lt',
             0.25, 5, v_mat_lat, unit_price, 20, 'balde 20 lt'
      FROM public.master_materials WHERE id = v_mat_lat;
    END IF;

    IF v_lab_ofi IS NOT NULL THEN
      INSERT INTO public.master_task_labor
        (id, master_task_id, labor_category_id, labor_category_name, quantity)
      VALUES (gen_random_uuid(), v_task_id, v_lab_ofi::text, 'Oficial albañil', 0.15);
    END IF;
    IF v_lab_ayu IS NOT NULL THEN
      INSERT INTO public.master_task_labor
        (id, master_task_id, labor_category_id, labor_category_name, quantity)
      VALUES (gen_random_uuid(), v_task_id, v_lab_ayu::text, 'Ayudante de obra', 0.1);
    END IF;

    IF v_tool_and IS NOT NULL THEN
      INSERT INTO public.master_task_equipment
        (id, master_task_id, tool_id, tool_name, hours_per_unit)
      VALUES (gen_random_uuid(), v_task_id, v_tool_and::text, 'Andamio tubular (juego)', 0.1);
    END IF;

    v_inserted := v_inserted + 1;
  ELSE
    v_skipped := v_skipped + 1;
  END IF;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'skipped',  v_skipped,
    'total',    v_inserted + v_skipped
  );
END;
$$;

COMMENT ON FUNCTION public.seed_extended_apu IS
  'Siembra 4 APUs adicionales (COL-001, ARM-001, ENC-001, PIN-001). '
  'Prerequisito: seed_extended_materials ejecutado para la misma org. '
  'Idempotente: omite APUs que ya existen por nombre. '
  'v059: requiere que el caller sea owner/admin de p_org_id (guard anti cross-tenant).';


-- =============================================================================
-- 3. seed_material_codes(p_org_id text)
--    Cuerpo vigente: migración 020 (sin redefiniciones posteriores).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.seed_material_codes(
  p_org_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price   numeric;
  v_cat     text;
  v_aliases integer := 0;
  v_codes   integer := 0;
BEGIN
  -- ── GUARD (059): solo owner/admin de la org pueden modificar datos de esa org ──
  IF NOT public.is_org_member_with_role(p_org_id, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- ── 1. Asignar codes canónicos en master_materials ─────────────────────────

  -- Cemento Portland (normaliza también la variante sin espacio)
  UPDATE master_materials
  SET code = 'CEM-PORT',
      name = 'Cemento Portland CPN 40'   -- nombre canónico con espacio
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(REPLACE(TRIM(name), ' ', '')) LIKE 'cementoportlandcpn40%';
  GET DIAGNOSTICS v_codes = ROW_COUNT;

  -- Cal hidráulica / hidratada → mismo code 'CAL-HID'
  UPDATE master_materials
  SET code = 'CAL-HID'
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(TRIM(name)) IN ('cal hidráulica', 'cal hidratada', 'cal hidraulica', 'cal hidratada');
  GET DIAGNOSTICS v_codes = ROW_COUNT;

  -- Cal aérea en polvo / Cal hidratada en polvo
  UPDATE master_materials
  SET code = 'CAL-AER'
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(TRIM(name)) IN ('cal aérea en polvo', 'cal aerea en polvo', 'cal hidratada en polvo');

  -- Ladrillo común
  UPDATE master_materials
  SET code = 'LAD-COM'
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(TRIM(name)) LIKE 'ladrillo com%';

  -- Ladrillo hueco 8x18x33 (acepta variantes con ×, cm, espacios)
  UPDATE master_materials
  SET code = 'LAD-H8'
  WHERE organization_id = p_org_id
    AND is_active = true
    AND regexp_replace(LOWER(TRIM(name)), '[×xX]', 'x', 'g') LIKE 'ladrillo hueco 8x18x33%';

  -- Ladrillo hueco 12x18x33
  UPDATE master_materials
  SET code = 'LAD-H12'
  WHERE organization_id = p_org_id
    AND is_active = true
    AND regexp_replace(LOWER(TRIM(name)), '[×xX]', 'x', 'g') LIKE 'ladrillo hueco 12x18x33%';

  -- Ladrillo hueco/cerámico 18x18x33
  UPDATE master_materials
  SET code = 'LAD-H18'
  WHERE organization_id = p_org_id
    AND is_active = true
    AND regexp_replace(LOWER(TRIM(name)), '[×xX]', 'x', 'g') LIKE '%18x18x33%';

  -- Arena gruesa (normaliza "Arena gruesa" y "Arena gruesa limpia")
  UPDATE master_materials
  SET code = 'ARE-GRU'
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(TRIM(name)) LIKE 'arena gruesa%';

  -- Arena fina (normaliza "Arena fina cernida" y "Arena fina lavada")
  UPDATE master_materials
  SET code = 'ARE-FIN'
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(TRIM(name)) LIKE 'arena fina%';

  -- Piedra partida / triturada 6/20
  UPDATE master_materials
  SET code = 'PIE-GRU'
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(TRIM(name)) LIKE 'piedra%6/20%';

  -- ── 2. Asignar los mismos codes en public.materials ───────────────────────
  --     (para que el matching por code funcione desde ERPContext)

  UPDATE materials
  SET code = 'CEM-PORT'
  WHERE organization_id = p_org_id
    AND LOWER(REPLACE(TRIM(name), ' ', '')) LIKE 'cementoportlandcpn40%'
    AND (code IS NULL OR code NOT LIKE 'CEM-%');

  UPDATE materials
  SET code = 'CAL-HID'
  WHERE organization_id = p_org_id
    AND LOWER(TRIM(name)) IN ('cal hidráulica', 'cal hidratada', 'cal hidraulica', 'cal hidratada')
    AND (code IS NULL OR code NOT LIKE 'CAL-%');

  UPDATE materials
  SET code = 'LAD-H8'
  WHERE organization_id = p_org_id
    AND regexp_replace(LOWER(TRIM(name)), '[×xX]', 'x', 'g') LIKE 'ladrillo hueco 8x18x33%'
    AND (code IS NULL OR code NOT LIKE 'LAD-%');

  UPDATE materials
  SET code = 'LAD-H12'
  WHERE organization_id = p_org_id
    AND regexp_replace(LOWER(TRIM(name)), '[×xX]', 'x', 'g') LIKE 'ladrillo hueco 12x18x33%'
    AND (code IS NULL OR code NOT LIKE 'LAD-%');

  UPDATE materials
  SET code = 'LAD-H18'
  WHERE organization_id = p_org_id
    AND regexp_replace(LOWER(TRIM(name)), '[×xX]', 'x', 'g') LIKE '%18x18x33%'
    AND (code IS NULL OR code NOT LIKE 'LAD-%');

  UPDATE materials
  SET code = 'ARE-GRU'
  WHERE organization_id = p_org_id
    AND LOWER(TRIM(name)) LIKE 'arena gruesa%'
    AND (code IS NULL OR code NOT LIKE 'ARE-%');

  UPDATE materials
  SET code = 'ARE-FIN'
  WHERE organization_id = p_org_id
    AND LOWER(TRIM(name)) LIKE 'arena fina%'
    AND (code IS NULL OR code NOT LIKE 'ARE-%');

  UPDATE materials
  SET code = 'PIE-GRU'
  WHERE organization_id = p_org_id
    AND LOWER(TRIM(name)) LIKE 'piedra%6/20%'
    AND (code IS NULL OR code NOT LIKE 'PIE-%');

  -- ── 3. Alias "Cal hidratada" en master_materials ──────────────────────────
  --     Inserta la entrada alias SOLO si "Cal hidráulica" existe pero "Cal hidratada" no.
  --     Así el APU que usa "Cal hidratada" la encuentra por nombre.

  SELECT unit_price, category
  INTO v_price, v_cat
  FROM master_materials
  WHERE organization_id = p_org_id
    AND LOWER(TRIM(name)) IN ('cal hidráulica', 'cal hidraulica')
    AND is_active = true
  LIMIT 1;

  IF v_price IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM master_materials
    WHERE organization_id = p_org_id
      AND LOWER(TRIM(name)) = 'cal hidratada'
      AND is_active = true
  ) THEN
    INSERT INTO master_materials (
      id, organization_id, name, unit, unit_price, category, code, is_active
    ) VALUES (
      gen_random_uuid(), p_org_id,
      'Cal hidratada', 'kg', v_price, COALESCE(v_cat, 'Aglomerantes'),
      'CAL-HID', true
    );
    v_aliases := v_aliases + 1;
  END IF;

  RETURN jsonb_build_object(
    'aliases_created', v_aliases,
    'ok', true
  );
END;
$$;

COMMENT ON FUNCTION public.seed_material_codes IS
  'Asigna codes canónicos en master_materials y public.materials para materiales clave. '
  'Crea alias "Cal hidratada" si solo existe "Cal hidráulica". '
  'Idempotente: las actualizaciones son seguras de repetir. '
  'v059: requiere que el caller sea owner/admin de p_org_id (guard anti cross-tenant). '
  'Ejecutar: SELECT seed_material_codes(''<UUID-ORG>'');';


-- =============================================================================
-- 4. apply_commercial_rules(p_org_id text)
--    Cuerpo vigente: migración 022 (sin redefiniciones posteriores).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.apply_commercial_rules(
  p_org_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mm  integer := 0;   -- master_materials actualizados
  v_mat integer := 0;   -- materials actualizados
  v_n   integer;

  -- Macro para no repetir: actualiza master_materials por patrón ILIKE en name
  -- Solo donde conversion_factor IS NULL para no pisar datos existentes.
BEGIN
  -- ── GUARD (059): solo owner/admin de la org pueden modificar datos de esa org ──
  IF NOT public.is_org_member_with_role(p_org_id, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- ── CEMENTO PORTLAND ────────────────────────────────────────────────────────
  -- Cualquier variante: CPN 40, CPN40, Portland, Loma Negra
  UPDATE master_materials SET
    commercial_unit   = COALESCE(commercial_unit,   'bolsa 50 kg'),
    conversion_factor = COALESCE(conversion_factor, 50)
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(TRIM(name)) SIMILAR TO '(cemento|portland)%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mm := v_mm + v_n;

  UPDATE materials SET
    commercial_unit   = COALESCE(commercial_unit,   'bolsa 50 kg'),
    conversion_factor = COALESCE(conversion_factor, 50)
  WHERE organization_id = p_org_id
    AND LOWER(TRIM(name)) SIMILAR TO '(cemento|portland)%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mat := v_mat + v_n;


  -- ── CAL HIDRÁULICA / HIDRATADA ───────────────────────────────────────────────
  -- Cubre: Cal hidráulica, Cal hidratada, Cal hidraulica en polvo, Cal hidratada en polvo
  -- CF=25 (bolsa 25 kg)
  UPDATE master_materials SET
    commercial_unit   = COALESCE(commercial_unit,   'bolsa 25 kg'),
    conversion_factor = COALESCE(conversion_factor, 25)
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(name) SIMILAR TO 'cal hidr(á|a)(ulica|atada)%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mm := v_mm + v_n;

  UPDATE materials SET
    commercial_unit   = COALESCE(commercial_unit,   'bolsa 25 kg'),
    conversion_factor = COALESCE(conversion_factor, 25)
  WHERE organization_id = p_org_id
    AND LOWER(name) SIMILAR TO 'cal hidr(á|a)(ulica|atada)%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mat := v_mat + v_n;


  -- ── CAL AÉREA / EN POLVO ────────────────────────────────────────────────────
  -- Cubre: Cal aérea en polvo, cal aerea en polvo
  -- CF=20 (bolsa 20 kg) — distinta a cal hidráulica
  UPDATE master_materials SET
    commercial_unit   = COALESCE(commercial_unit,   'bolsa 20 kg'),
    conversion_factor = COALESCE(conversion_factor, 20)
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(name) SIMILAR TO 'cal a(é|e)rea%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mm := v_mm + v_n;

  UPDATE materials SET
    commercial_unit   = COALESCE(commercial_unit,   'bolsa 20 kg'),
    conversion_factor = COALESCE(conversion_factor, 20)
  WHERE organization_id = p_org_id
    AND LOWER(name) SIMILAR TO 'cal a(é|e)rea%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mat := v_mat + v_n;


  -- ── YESO DE CONSTRUCCIÓN ────────────────────────────────────────────────────
  UPDATE master_materials SET
    commercial_unit   = COALESCE(commercial_unit,   'bolsa 40 kg'),
    conversion_factor = COALESCE(conversion_factor, 40)
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(TRIM(name)) LIKE 'yeso%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mm := v_mm + v_n;

  UPDATE materials SET
    commercial_unit   = COALESCE(commercial_unit,   'bolsa 40 kg'),
    conversion_factor = COALESCE(conversion_factor, 40)
  WHERE organization_id = p_org_id
    AND LOWER(TRIM(name)) LIKE 'yeso%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mat := v_mat + v_n;


  -- ── ADHESIVO PARA CERÁMICOS ──────────────────────────────────────────────────
  UPDATE master_materials SET
    commercial_unit   = COALESCE(commercial_unit,   'bolsa 25 kg'),
    conversion_factor = COALESCE(conversion_factor, 25)
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(TRIM(name)) SIMILAR TO 'adhesivo%cer(á|a)mic%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mm := v_mm + v_n;

  UPDATE materials SET
    commercial_unit   = COALESCE(commercial_unit,   'bolsa 25 kg'),
    conversion_factor = COALESCE(conversion_factor, 25)
  WHERE organization_id = p_org_id
    AND LOWER(TRIM(name)) SIMILAR TO 'adhesivo%cer(á|a)mic%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mat := v_mat + v_n;


  -- ── GROUT DE NIVELACIÓN ──────────────────────────────────────────────────────
  UPDATE master_materials SET
    commercial_unit   = COALESCE(commercial_unit,   'bolsa 25 kg'),
    conversion_factor = COALESCE(conversion_factor, 25)
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(TRIM(name)) LIKE 'grout%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mm := v_mm + v_n;

  UPDATE materials SET
    commercial_unit   = COALESCE(commercial_unit,   'bolsa 25 kg'),
    conversion_factor = COALESCE(conversion_factor, 25)
  WHERE organization_id = p_org_id
    AND LOWER(TRIM(name)) LIKE 'grout%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mat := v_mat + v_n;


  -- ── PINTURA LÁTEX (interior y exterior) ──────────────────────────────────────
  UPDATE master_materials SET
    commercial_unit   = COALESCE(commercial_unit,   'balde 20 lt'),
    conversion_factor = COALESCE(conversion_factor, 20)
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(TRIM(name)) SIMILAR TO 'pintura l(á|a)tex%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mm := v_mm + v_n;

  UPDATE materials SET
    commercial_unit   = COALESCE(commercial_unit,   'balde 20 lt'),
    conversion_factor = COALESCE(conversion_factor, 20)
  WHERE organization_id = p_org_id
    AND LOWER(TRIM(name)) SIMILAR TO 'pintura l(á|a)tex%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mat := v_mat + v_n;


  -- ── FIJADOR DE PAREDES ───────────────────────────────────────────────────────
  UPDATE master_materials SET
    commercial_unit   = COALESCE(commercial_unit,   'balde 20 lt'),
    conversion_factor = COALESCE(conversion_factor, 20)
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(TRIM(name)) LIKE 'fijador%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mm := v_mm + v_n;

  UPDATE materials SET
    commercial_unit   = COALESCE(commercial_unit,   'balde 20 lt'),
    conversion_factor = COALESCE(conversion_factor, 20)
  WHERE organization_id = p_org_id
    AND LOWER(TRIM(name)) LIKE 'fijador%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mat := v_mat + v_n;


  -- ── ENDUIDO PLÁSTICO ─────────────────────────────────────────────────────────
  UPDATE master_materials SET
    commercial_unit   = COALESCE(commercial_unit,   'balde 30 kg'),
    conversion_factor = COALESCE(conversion_factor, 30)
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(TRIM(name)) LIKE 'enduido%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mm := v_mm + v_n;

  UPDATE materials SET
    commercial_unit   = COALESCE(commercial_unit,   'balde 30 kg'),
    conversion_factor = COALESCE(conversion_factor, 30)
  WHERE organization_id = p_org_id
    AND LOWER(TRIM(name)) LIKE 'enduido%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mat := v_mat + v_n;


  -- ── CAÑO PVC ─────────────────────────────────────────────────────────────────
  -- Vendido en varillas de 3 m. CF=3 (1 caño = 3 m técnicos).
  -- Cubre: Caño PVC 110 mm, Caño PVC 63 mm, Caño PVC 50 mm, etc.
  UPDATE master_materials SET
    commercial_unit   = COALESCE(commercial_unit,   'caño 3 m'),
    conversion_factor = COALESCE(conversion_factor, 3)
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(TRIM(name)) SIMILAR TO 'ca(ñ|n)o pvc%'
    AND unit = 'm'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mm := v_mm + v_n;

  UPDATE materials SET
    commercial_unit   = COALESCE(commercial_unit,   'caño 3 m'),
    conversion_factor = COALESCE(conversion_factor, 3)
  WHERE organization_id = p_org_id
    AND LOWER(TRIM(name)) SIMILAR TO 'ca(ñ|n)o pvc%'
    AND unit = 'm'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mat := v_mat + v_n;


  -- ── HIERRO / ACERO (solo commercial_unit — sin CF numérico) ─────────────────
  -- El peso por barra varía por diámetro: no hay un CF único correcto.
  -- Se registra commercial_unit como referencia informativa sin conversion_factor,
  -- así purchaseQty queda NULL y el usuario decide la cantidad de barras manualmente.
  UPDATE master_materials SET
    commercial_unit = COALESCE(commercial_unit, 'barra 12 m')
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(TRIM(name)) SIMILAR TO '(hierro|acero|barra|varilla)(.*)(nervado|liso|adn|ado|\ø|\d+\s*mm)%'
    AND unit = 'kg'
    AND commercial_unit IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mm := v_mm + v_n;

  UPDATE materials SET
    commercial_unit = COALESCE(commercial_unit, 'barra 12 m')
  WHERE organization_id = p_org_id
    AND LOWER(TRIM(name)) SIMILAR TO '(hierro|acero|barra|varilla)(.*)(nervado|liso|adn|ado|\ø|\d+\s*mm)%'
    AND unit = 'kg'
    AND commercial_unit IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mat := v_mat + v_n;


  -- ── ARENA / ÁRIDOS (m3 → sin conversión necesaria) ──────────────────────────
  -- Unidad técnica = unidad comercial = m3. No se asigna CF.
  -- Solo registrar commercial_unit='m3' para coherencia de display.
  UPDATE master_materials SET
    commercial_unit = COALESCE(commercial_unit, 'm³')
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(TRIM(name)) SIMILAR TO '(arena|árido|arido|piedra|tosca|canto rodado|pedregullo)%'
    AND unit IN ('m3', 'm³')
    AND commercial_unit IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mm := v_mm + v_n;

  UPDATE materials SET
    commercial_unit = COALESCE(commercial_unit, 'm³')
  WHERE organization_id = p_org_id
    AND LOWER(TRIM(name)) SIMILAR TO '(arena|árido|arido|piedra|tosca|canto rodado|pedregullo)%'
    AND unit IN ('m3', 'm³')
    AND commercial_unit IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mat := v_mat + v_n;


  -- ── HORMIGÓN ELABORADO (m3 → sin conversión) ─────────────────────────────────
  UPDATE master_materials SET
    commercial_unit = COALESCE(commercial_unit, 'm³')
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(TRIM(name)) SIMILAR TO 'hormig(ó|o)n%'
    AND unit IN ('m3', 'm³')
    AND commercial_unit IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mm := v_mm + v_n;

  UPDATE materials SET
    commercial_unit = COALESCE(commercial_unit, 'm³')
  WHERE organization_id = p_org_id
    AND LOWER(TRIM(name)) SIMILAR TO 'hormig(ó|o)n%'
    AND unit IN ('m3', 'm³')
    AND commercial_unit IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mat := v_mat + v_n;


  RETURN jsonb_build_object(
    'master_materials_updated', v_mm,
    'materials_updated',        v_mat,
    'total_updated',            v_mm + v_mat,
    'org_id',                   p_org_id,
    'run_at',                   now()
  );
END;
$$;

COMMENT ON FUNCTION public.apply_commercial_rules IS
  'Asigna commercial_unit y conversion_factor por patrones de nombre para materiales '
  'conocidos (cemento, cal, ladrillos, hormigón, áridos, pinturas, etc.). '
  'Idempotente: solo actualiza donde ambos campos son NULL. '
  'Nunca pisa valores ya existentes. '
  'Jerarquía: hierro/acero → solo commercial_unit sin CF (CF varía por diámetro). '
  'Áridos/hormigón → solo commercial_unit=m³ sin CF (m3 técnico = comercial). '
  'v059: requiere que el caller sea owner/admin de p_org_id (guard anti cross-tenant). '
  'Ejecución: SELECT apply_commercial_rules(''<UUID-ORG>'');';


-- =============================================================================
-- 5. seed_mortero_materials(p_org_id text)
--    Cuerpo vigente: migración 041 (sin redefiniciones posteriores).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.seed_mortero_materials(
  p_org_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
  v_updated  integer := 0;
  v_total    integer := 0;

  v_materials jsonb := jsonb_build_array(

    -- ── AGLOMERANTES ─────────────────────────────────────────────────────────

    -- Cal hidratada (hidróxido de calcio, Ca(OH)₂)
    -- Producto DISTINTO de Cal hidráulica (NHL) y Cal aérea en polvo.
    -- Alias bidireccional con cal hidráulica eliminado en chandias.ts (041).
    -- Usada en: MAM-001/002/003/004/005/006 (mortero 1:1:6), REV-001/002/004.
    -- Precio orientativo: similar a cal hidráulica en bolsa 25 kg.
    jsonb_build_object(
      'name',               'Cal hidratada',
      'unit',               'kg',
      'unit_price',         95,
      'category',           'Aglomerantes',
      'commercial_format',  'Bolsa 25 kg',
      'commercial_unit',    'bolsa 25 kg',
      'conversion_factor',  25,
      'waste_percent',      3
    ),

    -- ── MAMPOSTERÍA ──────────────────────────────────────────────────────────

    -- Ladrillo común 6x12x24
    -- Usado en: MAM-001 (70 un/m²), MAM-002 (35 un/m²).
    -- Comercializado por millar. conversion_factor = 1000.
    jsonb_build_object(
      'name',               'Ladrillo común 6x12x24',
      'unit',               'un',
      'unit_price',         200,
      'category',           'Mampostería',
      'commercial_format',  'Millar (1000 u)',
      'commercial_unit',    'millar',
      'conversion_factor',  1000,
      'waste_percent',      5
    ),

    -- Ladrillo hueco 8x18x33
    -- Usado en: MAM-005 (20 un/m², tabique e=0.08m), MAM-006 (32 un/m²).
    jsonb_build_object(
      'name',               'Ladrillo hueco 8x18x33',
      'unit',               'un',
      'unit_price',         120,
      'category',           'Mampostería',
      'commercial_format',  'Millar (1000 u)',
      'commercial_unit',    'millar',
      'conversion_factor',  1000,
      'waste_percent',      5
    ),

    -- ── ÁRIDOS ───────────────────────────────────────────────────────────────

    -- Cascote de ladrillo
    -- Usado en: PIS-001 (contrapiso cascote e=12cm, 0.12 m³/m²).
    -- A granel; sin unidad comercial fija.
    jsonb_build_object(
      'name',               'Cascote de ladrillo',
      'unit',               'm³',
      'unit_price',         2500,
      'category',           'Áridos',
      'waste_percent',      10
    ),

    -- Arena media lavada
    -- Granulometría intermedia entre arena fina lavada y arena gruesa limpia.
    -- No cubierta por aliases del motor.
    -- Usada en: REV-003 (revoque exterior hidrófugo), REV-004 (revoque grueso exterior).
    jsonb_build_object(
      'name',               'Arena media lavada',
      'unit',               'm³',
      'unit_price',         9200,
      'category',           'Áridos',
      'waste_percent',      5
    ),

    -- ── IMPERMEABILIZANTES ───────────────────────────────────────────────────

    -- Hidrófugo líquido integral
    -- Aditivo para morteros de revoque exterior — se mezcla con el agua de amasado.
    -- Unidad: 'lt' (consistente con Sellador epoxi, Pinturas, Fijador en seed 019).
    -- Categoría: 'Impermeab.' (ya usada para Membrana asfáltica y Film en 019).
    -- Usado en: REV-003 (0.20 lt/m²).
    jsonb_build_object(
      'name',               'Hidrófugo líquido integral',
      'unit',               'lt',
      'unit_price',         1800,
      'category',           'Impermeab.',
      'commercial_format',  'Bidón 5 L',
      'commercial_unit',    'bidón 5 lt',
      'conversion_factor',  5,
      'waste_percent',      5
    )

  );

  v_m      jsonb;
  v_id     uuid;
  v_exists boolean;
  v_cf     numeric;
  v_cu     text;
BEGIN
  -- ── GUARD (059): solo owner/admin de la org pueden sembrar datos de esa org ──
  IF NOT public.is_org_member_with_role(p_org_id, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  FOR v_m IN SELECT jsonb_array_elements(v_materials)
  LOOP
    -- Normalizar conversion_factor y commercial_unit de forma atómica.
    -- Respeta constraint mm_commercial_unit_requires_factor:
    -- commercial_unit solo puede ser NOT NULL si conversion_factor también lo es.
    v_cf := NULLIF(TRIM(COALESCE(v_m->>'conversion_factor', '')), '')::numeric;
    v_cu := CASE
              WHEN v_cf IS NOT NULL
              THEN NULLIF(TRIM(COALESCE(v_m->>'commercial_unit', '')), '')
              ELSE NULL
            END;

    SELECT EXISTS (
      SELECT 1 FROM public.master_materials
      WHERE organization_id = p_org_id
        AND name = v_m->>'name'
        AND is_active = true
    ) INTO v_exists;

    IF v_exists THEN
      -- Actualizar precio; no pisar campos de conversión ya seteados.
      UPDATE public.master_materials
      SET
        unit_price         = (v_m->>'unit_price')::numeric,
        commercial_format  = COALESCE(v_m->>'commercial_format', commercial_format),
        commercial_unit    = COALESCE(commercial_unit, v_cu),
        conversion_factor  = COALESCE(conversion_factor, v_cf),
        waste_percent      = COALESCE((v_m->>'waste_percent')::numeric, waste_percent),
        updated_at         = now()
      WHERE organization_id = p_org_id
        AND name = v_m->>'name'
        AND is_active = true;
      v_updated := v_updated + 1;
    ELSE
      v_id := gen_random_uuid();
      INSERT INTO public.master_materials (
        id, organization_id, name, unit, unit_price,
        category, commercial_format, commercial_unit, conversion_factor,
        waste_percent, is_active
      ) VALUES (
        v_id,
        p_org_id,
        v_m->>'name',
        v_m->>'unit',
        (v_m->>'unit_price')::numeric,
        v_m->>'category',
        v_m->>'commercial_format',
        v_cu,
        v_cf,
        COALESCE((v_m->>'waste_percent')::numeric, 0),
        true
      );
      v_inserted := v_inserted + 1;
    END IF;

    v_total := v_total + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'updated',  v_updated,
    'total',    v_total
  );
END;
$$;

COMMENT ON FUNCTION public.seed_mortero_materials IS
  'Siembra materiales canónicos para morteros, mampostería, revoques y contrapisos. '
  'Idempotente: actualiza precio si el material ya existe por (organization_id, name). '
  'Complementa seed_extended_materials (019/023) sin reemplazarla. '
  'Materiales agregados: Cal hidratada, Ladrillo común 6x12x24, Ladrillo hueco 8x18x33, '
  'Cascote de ladrillo, Arena media lavada, Hidrófugo líquido integral. '
  'NOTA: Cal hidratada (Ca(OH)₂) es producto distinto de Cal hidráulica (NHL). '
  'El alias bidireccional entre ambas fue eliminado en chandias.ts (PR 041). '
  'v059: requiere que el caller sea owner/admin de p_org_id (guard anti cross-tenant). '
  'Precios orientativos Argentina, Abril 2026.';


-- =============================================================================
-- 6. seed_apu_morteros(p_org_id text)
--    Cuerpo vigente: migración 042 (sin redefiniciones posteriores).
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
  -- ── GUARD (059): solo owner/admin de la org pueden sembrar datos de esa org ──
  IF NOT public.is_org_member_with_role(p_org_id, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

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

COMMENT ON FUNCTION public.seed_apu_morteros IS
  'Siembra 4 sub-APUs base de morteros (MOR-001 a MOR-004). '
  'Sin labor, sin sub-APU anidado. Unit = m3 de mortero puesto en obra. '
  'Idempotente: find-or-create en master_tasks, DELETE+INSERT en master_task_materials. '
  'Prerequisitos: migración 019 (Cemento, Arenas) + migración 041 (Cal hidratada, Arena media). '
  'Los APUs dependientes (MAM/REV/PIS con labor) van en migración 043. '
  'v059: requiere que el caller sea owner/admin de p_org_id (guard anti cross-tenant).';


-- =============================================================================
-- 7. seed_apu_mam_rev(p_org_id text)
--    Cuerpo vigente: migración 043a (sin redefiniciones posteriores).
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
  -- ── GUARD (059): solo owner/admin de la org pueden sembrar datos de esa org ──
  IF NOT public.is_org_member_with_role(p_org_id, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

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

COMMENT ON FUNCTION public.seed_apu_mam_rev IS
  'Siembra 7 APUs de mamposterla y revoques gruesos (043A). '
  'MAM-001/002/005/006 + REV-001/003/004. Incluye MO si labor_category_id es resolvible. '
  'Sub-APUs: MOR-001 => MAM-*, MOR-002 => REV-001/004, MOR-003 => REV-003. '
  'Idempotente: find-or-create en master_tasks, DELETE+INSERT en hijos. '
  'Prerequisitos: 019 + 041 (materiales) + 042 (MOR-*). '
  'v059: requiere que el caller sea owner/admin de p_org_id (guard anti cross-tenant).';


-- =============================================================================
-- 8. seed_exc_mam_materials(p_org_id text)
--    Cuerpo vigente: migración 044 (sin redefiniciones posteriores).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.seed_exc_mam_materials(
  p_org_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
  v_updated  integer := 0;
  v_total    integer := 0;

  v_materials jsonb := jsonb_build_array(

    -- ── ÁRIDOS — nombres exactos del catálogo Chandías ────────────────────────

    -- "Arena gruesa" — catálogo usa este nombre; 019 tiene "Arena gruesa limpia".
    -- Ambas conviven: el engine las unifica vía NAME_ALIASES; livePriceByName necesita
    -- el nombre exacto para el lookup en handleSendToPresupuesto.
    -- Usada en: EXC-005, MAM-003, MAM-004 y decenas de otros APUs.
    jsonb_build_object(
      'name',               'Arena gruesa',
      'unit',               'm3',
      'unit_price',         8800,
      'category',           'Áridos',
      'waste_percent',      5
    ),

    -- "Piedra partida 6/20" — catálogo; 019 tiene "Piedra triturada 6/20".
    -- Alias bidireccional en chandias.ts — se agrega nombre canónico del catálogo.
    -- Usada en: EXC-005, HOR-001, HOR-002, HOR-003.
    jsonb_build_object(
      'name',               'Piedra partida 6/20',
      'unit',               'm3',
      'unit_price',         11200,
      'category',           'Áridos',
      'waste_percent',      5
    ),

    -- ── AGUA ─────────────────────────────────────────────────────────────────

    -- "Agua" — EXC-005 (0.007 m³/m²), HOR-*, hormigones en general.
    -- No estaba en ningún seed anterior. Precio simbólico (servicio municipal).
    jsonb_build_object(
      'name',               'Agua',
      'unit',               'm3',
      'unit_price',         50,
      'category',           'Áridos',
      'waste_percent',      0
    ),

    -- "Agua para compactación" — EXC-003 (0.12 m³/m³).
    -- Misma categoría y precio que "Agua"; nombre distinto para trazabilidad.
    jsonb_build_object(
      'name',               'Agua para compactación',
      'unit',               'm3',
      'unit_price',         50,
      'category',           'Áridos',
      'waste_percent',      0
    ),

    -- ── MAMPOSTERÍA ──────────────────────────────────────────────────────────

    -- "Ladrillo hueco 18x18x33" — catálogo MAM-003.
    -- 019 tiene "Ladrillo cerámico 18x18x33" (sin "hueco").
    -- Alias bidireccional en chandias.ts; se agrega nombre canónico del catálogo.
    jsonb_build_object(
      'name',               'Ladrillo hueco 18x18x33',
      'unit',               'un',
      'unit_price',         260,
      'category',           'Mampostería',
      'commercial_format',  'Millar (1000 u)',
      'commercial_unit',    'millar',
      'conversion_factor',  1000,
      'waste_percent',      5
    ),

    -- ── SEGURIDAD — en caso de que 019 ó 041 no estén ejecutados ─────────────

    -- "Cemento Portland CPN 40" — 019. Se inserta solo si no existe.
    -- Usada en: EXC-005, MAM-003, MAM-004, MAM-005, HOR-*.
    jsonb_build_object(
      'name',               'Cemento Portland CPN 40',
      'unit',               'kg',
      'unit_price',         180,
      'category',           'Aglomerantes',
      'commercial_format',  'Bolsa 50 kg',
      'commercial_unit',    'bolsa 50 kg',
      'conversion_factor',  50,
      'waste_percent',      3
    ),

    -- "Cal hidratada" — 041. Se inserta solo si no existe.
    -- Ca(OH)₂ — DISTINTO de Cal hidráulica (NHL). No intercambiables.
    jsonb_build_object(
      'name',               'Cal hidratada',
      'unit',               'kg',
      'unit_price',         95,
      'category',           'Aglomerantes',
      'commercial_format',  'Bolsa 25 kg',
      'commercial_unit',    'bolsa 25 kg',
      'conversion_factor',  25,
      'waste_percent',      3
    ),

    -- "Ladrillo hueco 12x18x33" — 019. Se inserta solo si no existe.
    -- Usado en: MAM-004.
    jsonb_build_object(
      'name',               'Ladrillo hueco 12x18x33',
      'unit',               'un',
      'unit_price',         180,
      'category',           'Mampostería',
      'commercial_format',  'Millar (1000 u)',
      'commercial_unit',    'millar',
      'conversion_factor',  1000,
      'waste_percent',      5
    )

  ); -- fin v_materials

  v_m      jsonb;
  v_id     uuid;
  v_exists boolean;
  v_cf     numeric;
  v_cu     text;
BEGIN
  -- ── GUARD (059): solo owner/admin de la org pueden sembrar datos de esa org ──
  IF NOT public.is_org_member_with_role(p_org_id, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  FOR v_m IN SELECT jsonb_array_elements(v_materials)
  LOOP
    -- Respetar constraint mm_commercial_unit_requires_factor
    v_cf := NULLIF(TRIM(COALESCE(v_m->>'conversion_factor', '')), '')::numeric;
    v_cu := CASE
              WHEN v_cf IS NOT NULL
              THEN NULLIF(TRIM(COALESCE(v_m->>'commercial_unit', '')), '')
              ELSE NULL
            END;

    SELECT EXISTS (
      SELECT 1 FROM public.master_materials
      WHERE organization_id = p_org_id
        AND name = v_m->>'name'
        AND is_active = true
    ) INTO v_exists;

    IF v_exists THEN
      -- Actualizar precio; no pisar conversión ya seteada manualmente.
      UPDATE public.master_materials
      SET
        unit_price         = (v_m->>'unit_price')::numeric,
        commercial_format  = COALESCE(v_m->>'commercial_format', commercial_format),
        commercial_unit    = COALESCE(commercial_unit, v_cu),
        conversion_factor  = COALESCE(conversion_factor, v_cf),
        waste_percent      = COALESCE((v_m->>'waste_percent')::numeric, waste_percent),
        updated_at         = now()
      WHERE organization_id = p_org_id
        AND name = v_m->>'name'
        AND is_active = true;
      v_updated := v_updated + 1;
    ELSE
      v_id := gen_random_uuid();
      INSERT INTO public.master_materials (
        id, organization_id, name, unit, unit_price,
        category, commercial_format, commercial_unit, conversion_factor,
        waste_percent, is_active
      ) VALUES (
        v_id,
        p_org_id,
        v_m->>'name',
        v_m->>'unit',
        (v_m->>'unit_price')::numeric,
        v_m->>'category',
        v_m->>'commercial_format',
        v_cu,
        v_cf,
        COALESCE((v_m->>'waste_percent')::numeric, 0),
        true
      );
      v_inserted := v_inserted + 1;
    END IF;

    v_total := v_total + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'updated',  v_updated,
    'total',    v_total
  );
END;
$$;

COMMENT ON FUNCTION public.seed_exc_mam_materials IS
  'Siembra materiales canónicos con nombres exactos del catálogo Chandías para EXC-003/005 y MAM-003/004. '
  'Resuelve mismatches de nombre entre catálogo y seed 019: '
  '"Arena gruesa" (019: "Arena gruesa limpia"), '
  '"Piedra partida 6/20" (019: "Piedra triturada 6/20"), '
  '"Ladrillo hueco 18x18x33" (019: "Ladrillo cerámico 18x18x33"). '
  'Agrega ausentes: "Agua", "Agua para compactación". '
  'Incluye Cemento/Cal hidratada/Ladrillo 12x18x33 como seguridad si 019/041 no corrieron. '
  'Idempotente: actualiza precio si ya existe por (organization_id, name). '
  'v059: requiere que el caller sea owner/admin de p_org_id (guard anti cross-tenant). '
  'Precios orientativos Argentina, Abril 2026.';


-- =============================================================================
-- 9. get_org_entitlements(p_org_id uuid)
--    Cuerpo vigente: migración 039 (sin redefiniciones posteriores).
--    Solo lectura: cualquier miembro de la org (no requiere owner/admin).
--    También agrega SET search_path = public, ausente en la versión original.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_org_entitlements(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- GUARD (059): si el caller no es miembro de p_org_id, se retorna NULL
  -- (fail-closed, sin exponer entitlements de otra org). Cualquier rol vale:
  -- es una función de solo lectura.
  SELECT CASE
    WHEN NOT public.is_org_member(p_org_id) THEN
      NULL
    ELSE (
      SELECT jsonb_object_agg(
        pe.feature_key,
        CASE pe.feature_type
          WHEN 'boolean' THEN to_jsonb(COALESCE(pe.bool_value, false))
          WHEN 'numeric' THEN to_jsonb(COALESCE(pe.numeric_value, 0))
        END
      )
      FROM public.organization_subscriptions os
      JOIN public.plan_entitlements pe ON pe.plan_id = os.plan_id
      WHERE os.organization_id = p_org_id
        AND os.status IN ('trialing', 'active')
    )
  END;
$$;

COMMENT ON FUNCTION public.get_org_entitlements IS
  'Devuelve JSONB con los entitlements de la org activa. NULL si no hay subscription '
  'activa/trialing, o si el caller no es miembro de p_org_id. '
  'v059: agrega guard de membresía (is_org_member) y SET search_path = public '
  '(ausente en la versión original de 039) — guard anti cross-tenant de solo lectura.';
