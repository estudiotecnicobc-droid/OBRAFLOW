-- =============================================================================
-- Migration 019: Extended Seed — Materiales Demo Extendidos
-- Fecha: 2026-04-12
--
-- Problema: el seed demo tiene 8 materiales. Para mostrar la calculadora
-- funcionando con APUs completos se necesitan al menos 25-30 materiales.
--
-- Estrategia:
--   · INSERT ... ON CONFLICT (organization_id, name) DO UPDATE — idempotente
--   · Solo para la tabla master_materials (catálogo privado de org)
--   · El organizaiton_id es un parámetro: esta migración crea una función
--     de seed que puede llamarse para cualquier org.
--   · Los precios son orientativos (Argentina, Abril 2026).
--
-- La función seed_extended_materials(p_org_id text) es idempotente:
--   · Usa INSERT ... ON CONFLICT DO UPDATE para actualizar precios si cambiaron.
--   · No duplica registros.
--   · Retorna un resumen { inserted, updated }.
--
-- También crea la función seed_extended_apu(p_org_id text) para 4 APUs extra:
--   COL-001: Colocación de porcelanato
--   ARM-001: Armadura de hierro
--   ENC-001: Encofrado de losa
--   PIN-001: Pintura látex interior
-- =============================================================================

-- =============================================================================
-- NOTA DE COMPATIBILIDAD:
-- master_materials.organization_id es TEXT en el sistema actual
-- (compatible con IDs legacy 'org_a' y UUIDs reales).
-- Esta función acepta text para mantener compatibilidad.
-- La unicidad por (organization_id, name) asume que existe un índice UNIQUE.
-- Si no existe, agregar:
--   CREATE UNIQUE INDEX IF NOT EXISTS master_materials_org_name_uidx
--     ON public.master_materials (organization_id, name)
--     WHERE is_active = true;
-- =============================================================================

-- Crear índice UNIQUE si no existe (idempotente)
CREATE UNIQUE INDEX IF NOT EXISTS master_materials_org_name_uidx
  ON public.master_materials (organization_id, name)
  WHERE is_active = true;


-- =============================================================================
-- Función: seed_extended_materials
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

  -- Tipo para los datos del seed
  v_materials jsonb := jsonb_build_array(

    -- ── AGLOMERANTES ─────────────────────────────────────────────────────────
    jsonb_build_object('name','Cemento Portland CPN 40',   'unit','kg',  'unit_price',180,  'category','Aglomerantes', 'commercial_format','Bolsa 50 kg',   'waste_percent',3,  'conversion_factor',50),
    jsonb_build_object('name','Cal hidráulica',             'unit','kg',  'unit_price',95,   'category','Aglomerantes', 'commercial_format','Bolsa 25 kg',   'waste_percent',3,  'conversion_factor',25),
    jsonb_build_object('name','Cal aérea en polvo',         'unit','kg',  'unit_price',85,   'category','Aglomerantes', 'commercial_format','Bolsa 20 kg',   'waste_percent',3,  'conversion_factor',20),
    jsonb_build_object('name','Yeso de construcción',       'unit','kg',  'unit_price',70,   'category','Aglomerantes', 'commercial_format','Bolsa 40 kg',   'waste_percent',5,  'conversion_factor',40),
    jsonb_build_object('name','Adhesivo para cerámicos',    'unit','kg',  'unit_price',320,  'category','Aglomerantes', 'commercial_format','Bolsa 25 kg',   'waste_percent',10, 'conversion_factor',25),

    -- ── ÁRIDOS ───────────────────────────────────────────────────────────────
    jsonb_build_object('name','Arena fina lavada',          'unit','m3',  'unit_price',9500, 'category','Áridos',        'waste_percent',5),
    jsonb_build_object('name','Arena gruesa limpia',        'unit','m3',  'unit_price',8800, 'category','Áridos',        'waste_percent',5),
    jsonb_build_object('name','Piedra triturada 6/20',      'unit','m3',  'unit_price',11200,'category','Áridos',        'waste_percent',5),
    jsonb_build_object('name','Tosca compactable',          'unit','m3',  'unit_price',3200, 'category','Áridos',        'waste_percent',0),
    jsonb_build_object('name','Grout de nivelación',        'unit','kg',  'unit_price',280,  'category','Áridos',        'commercial_format','Bolsa 25 kg',   'waste_percent',5,  'conversion_factor',25),

    -- ── ESTRUCTURAL ──────────────────────────────────────────────────────────
    jsonb_build_object('name','Hierro nervado Ø6 mm',       'unit','kg',  'unit_price',920,  'category','Estructural',   'commercial_format','Barra 12 m',    'waste_percent',8),
    jsonb_build_object('name','Hierro nervado Ø8 mm',       'unit','kg',  'unit_price',935,  'category','Estructural',   'commercial_format','Barra 12 m',    'waste_percent',8),
    jsonb_build_object('name','Hierro nervado Ø10 mm',      'unit','kg',  'unit_price',950,  'category','Estructural',   'commercial_format','Barra 12 m',    'waste_percent',8),
    jsonb_build_object('name','Hierro nervado Ø12 mm',      'unit','kg',  'unit_price',960,  'category','Estructural',   'commercial_format','Barra 12 m',    'waste_percent',8),
    jsonb_build_object('name','Malla electrosoldada Ø5 c15','unit','m2',  'unit_price',1850, 'category','Estructural',   'waste_percent',10),
    jsonb_build_object('name','Estribos prefabricados Ø6',  'unit','kg',  'unit_price',980,  'category','Estructural',   'waste_percent',5),

    -- ── MAMPOSTERÍA ──────────────────────────────────────────────────────────
    jsonb_build_object('name','Ladrillo cerámico 18x18x33', 'unit','u',   'unit_price',260,  'category','Mampostería',   'waste_percent',5),
    jsonb_build_object('name','Ladrillo hueco 12x18x33',    'unit','u',   'unit_price',180,  'category','Mampostería',   'waste_percent',5),
    jsonb_build_object('name','Bloque cemento 20x20x40',    'unit','u',   'unit_price',420,  'category','Mampostería',   'waste_percent',3),
    jsonb_build_object('name','Ladrillo visto 5,5x12x25',   'unit','u',   'unit_price',310,  'category','Mampostería',   'waste_percent',5),

    -- ── PISOS Y REVESTIMIENTOS ───────────────────────────────────────────────
    jsonb_build_object('name','Porcelanato 60x60 cm',       'unit','m2',  'unit_price',8500, 'category','Pisos',         'waste_percent',10),
    jsonb_build_object('name','Cerámico 33x33 cm',          'unit','m2',  'unit_price',3200, 'category','Pisos',         'waste_percent',10),
    jsonb_build_object('name','Membrana asfáltica 4mm',     'unit','m2',  'unit_price',2800, 'category','Impermeab.',    'waste_percent',10),
    jsonb_build_object('name','Sellador epoxi para pisos',  'unit','lt',  'unit_price',1200, 'category','Pisos'),

    -- ── PINTURAS ─────────────────────────────────────────────────────────────
    jsonb_build_object('name','Pintura látex interior blanco','unit','lt', 'unit_price',1450, 'category','Pinturas',      'commercial_format','Balde 20 lt',  'waste_percent',5,  'conversion_factor',20),
    jsonb_build_object('name','Pintura látex exterior',     'unit','lt',  'unit_price',1650, 'category','Pinturas',      'commercial_format','Balde 20 lt',  'waste_percent',5,  'conversion_factor',20),
    jsonb_build_object('name','Fijador de paredes',         'unit','lt',  'unit_price',780,  'category','Pinturas',      'commercial_format','Balde 20 lt',  'conversion_factor',20),
    jsonb_build_object('name','Enduido plástico',           'unit','kg',  'unit_price',380,  'category','Pinturas',      'commercial_format','Balde 30 kg',  'waste_percent',5,  'conversion_factor',30),

    -- ── MADERA Y ENCOFRADO ───────────────────────────────────────────────────
    jsonb_build_object('name','Tabla de pino 1"×10"×3m',    'unit','u',   'unit_price',3800, 'category','Madera',        'waste_percent',15),
    jsonb_build_object('name','Madera pino cepillada 3×3',  'unit','m',   'unit_price',1800, 'category','Madera'),
    jsonb_build_object('name','Puntal metálico telescópico','unit','u',   'unit_price',4500, 'category','Encofrado'),
    jsonb_build_object('name','Film polietileno 200 micrones','unit','m2', 'unit_price',180,  'category','Impermeab.'),

    -- ── ELECTRICIDAD ─────────────────────────────────────────────────────────
    jsonb_build_object('name','Cable NYY 2×1.5 mm²',        'unit','m',   'unit_price',850,  'category','Electricidad'),
    jsonb_build_object('name','Cable unipolar 2.5 mm² negro','unit','m',  'unit_price',380,  'category','Electricidad'),
    jsonb_build_object('name','Cañería PVC 20 mm (eléctrica)','unit','m', 'unit_price',180,  'category','Electricidad'),
    jsonb_build_object('name','Caja plástica 4×4"',         'unit','u',   'unit_price',120,  'category','Electricidad'),

    -- ── SANITARIA ────────────────────────────────────────────────────────────
    jsonb_build_object('name','Caño PVC 110 mm',            'unit','m',   'unit_price',1250, 'category','Sanitaria',     'commercial_format','Caño 3 m',      'conversion_factor',3),
    jsonb_build_object('name','Caño PVC 63 mm',             'unit','m',   'unit_price',680,  'category','Sanitaria',     'commercial_format','Caño 3 m',      'conversion_factor',3),
    jsonb_build_object('name','Codo PVC 110×90°',           'unit','u',   'unit_price',320,  'category','Sanitaria'),
    jsonb_build_object('name','Pegamento para PVC',         'unit','lt',  'unit_price',1100, 'category','Sanitaria',     'commercial_format','Frasco 250 cc')
  );

  v_m jsonb;
  v_id uuid;
  v_exists boolean;
BEGIN
  FOR v_m IN SELECT jsonb_array_elements(v_materials)
  LOOP
    -- Verificar existencia
    SELECT EXISTS (
      SELECT 1 FROM public.master_materials
      WHERE organization_id = p_org_id
        AND name = v_m->>'name'
        AND is_active = true
    ) INTO v_exists;

    IF v_exists THEN
      -- Actualizar precio y formato comercial
      UPDATE public.master_materials
      SET
        unit_price         = (v_m->>'unit_price')::numeric,
        commercial_format  = v_m->>'commercial_format',
        waste_percent      = COALESCE((v_m->>'waste_percent')::numeric, waste_percent),
        updated_at         = now()
      WHERE organization_id = p_org_id
        AND name = v_m->>'name'
        AND is_active = true;
      v_updated := v_updated + 1;
    ELSE
      -- Insertar nuevo
      v_id := gen_random_uuid();
      INSERT INTO public.master_materials (
        id, organization_id, name, unit, unit_price,
        category, commercial_format, waste_percent, is_active
      ) VALUES (
        v_id,
        p_org_id,
        v_m->>'name',
        v_m->>'unit',
        (v_m->>'unit_price')::numeric,
        v_m->>'category',
        v_m->>'commercial_format',
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

GRANT EXECUTE ON FUNCTION public.seed_extended_materials(text)
  TO authenticated;

COMMENT ON FUNCTION public.seed_extended_materials IS
  'Siembra materiales de construcción extendidos para demo/setup inicial. '
  'Idempotente: actualiza precio si el material ya existe por (organization_id, name). '
  'Los precios son orientativos para Argentina, Abril 2026.';


-- =============================================================================
-- Función: seed_extended_apu
-- Siembra 4 APUs adicionales que requieren los materiales extendidos.
-- Prerequisito: seed_extended_materials ya ejecutado para la misma org.
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

GRANT EXECUTE ON FUNCTION public.seed_extended_apu(text)
  TO authenticated;

COMMENT ON FUNCTION public.seed_extended_apu IS
  'Siembra 4 APUs adicionales (COL-001, ARM-001, ENC-001, PIN-001). '
  'Prerequisito: seed_extended_materials ejecutado para la misma org. '
  'Idempotente: omite APUs que ya existen por nombre.';
