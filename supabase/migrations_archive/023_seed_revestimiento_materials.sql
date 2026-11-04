-- =============================================================================
-- Migración 023: Seed — Materiales de Revestimiento Faltantes
-- Fecha: 2026-04-15
--
-- Problema:
--   El catálogo paramétrico Chandías usa materiales que no estaban en el seed:
--     · "Azulejo 15×15cm"    → usado en RVE-001 (revestimiento azulejos, coef 46 un/m²)
--     · "Pastina cementicia" → usado en RVE-001 (juntas, coef variable)
--   Sin estos materiales, la calculadora "Por Dimensiones" muestra "sin precio"
--   para RVE-001 aunque existan aliases en el motor (chandias.ts NAME_ALIASES).
--
-- Estrategia:
--   1. CREATE OR REPLACE seed_extended_materials — agrega los dos materiales al
--      jsonb array. Idempotente: INSERT nuevo o actualiza precio si ya existe.
--   2. DO block de backfill — llama seed_extended_materials para cada org activa.
--      No corre seed_extended_apu (no hay nuevos APUs en esta migración).
--
-- Precios orientativos Argentina, Abril 2026:
--   · Azulejo 15×15cm : $90/un  (azulejo estándar; el catálogo usa 46 un por m² de pared)
--   · Pastina cementicia: $480/kg (bolsas 1-5 kg; sin formato comercial fijo)
--
-- Relación con aliases del motor (engine/chandias.ts):
--   "Pastina blanca fina"           → aliases → "pastina cementicia"    ✓
--   "Azulejo 15×15cm (c/4% desp.)"  → aliases → "azulejo 15×15cm"      ✓
-- =============================================================================

-- =============================================================================
-- FUNCIÓN ACTUALIZADA: seed_extended_materials
-- Agrega Azulejo 15×15cm y Pastina cementicia al catálogo base.
-- Todo lo demás igual a migración 022.
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

GRANT EXECUTE ON FUNCTION public.seed_extended_materials(text)
  TO authenticated;

COMMENT ON FUNCTION public.seed_extended_materials IS
  'Siembra materiales de construcción extendidos para demo/setup inicial. '
  'Idempotente: actualiza precio si el material ya existe por (organization_id, name). '
  'Escribe commercial_unit y conversion_factor sin pisar datos existentes. '
  'v023: agrega Azulejo 15×15cm y Pastina cementicia para catálogo Chandías RVE-001. '
  'Los precios son orientativos para Argentina, Abril 2026.';


-- =============================================================================
-- BACKFILL — insertar los dos materiales nuevos en organizaciones existentes
-- =============================================================================
-- Llama seed_extended_materials para cada org, lo que inserta los materiales
-- nuevos (Azulejo 15×15cm y Pastina cementicia) sin tocar los existentes.
-- Idempotente: si ya existen, solo actualiza el precio.
-- =============================================================================

DO $$
DECLARE
  v_org_id text;
  v_result jsonb;
  v_count  integer := 0;
BEGIN
  FOR v_org_id IN
    SELECT DISTINCT organization_id
    FROM public.master_materials
    WHERE is_active = true
  LOOP
    v_result := public.seed_extended_materials(v_org_id);
    v_count  := v_count + 1;
    RAISE NOTICE 'seed org %: %', v_org_id, v_result;
  END LOOP;

  IF v_count = 0 THEN
    RAISE NOTICE 'No hay organizaciones con master_materials activos — backfill omitido.';
  ELSE
    RAISE NOTICE 'Backfill completado para % organización(es).', v_count;
  END IF;
END;
$$;


-- =============================================================================
-- RESUMEN DE MATERIALES TODAVÍA FALTANTES EN EL CATÁLOGO
-- (materiales del motor Chandías sin equivalente en seed — dejados como "sin precio")
-- =============================================================================
--
-- Estos materiales son válidos en el catálogo pero NO tienen match en master_materials
-- ni aliases suficientes para resolver a un material existente:
--
--   RVE-002 / RVE-003 / RVE-004:
--     · Cerámica 30×30cm, 45×45cm  (seed solo tiene Cerámico 33×33cm)
--     · Porcelanato 30×60cm        (seed tiene 60×60 pero no 30×60)
--     · Hidrófugo líquido integral
--     · Arena media lavada         (seed tiene arena fina y arena gruesa, no "media lavada")
--
--   CIE-002 (Cielorrasos con estructura):
--     · Placa de yeso 1.20×2.40m
--     · Perfil omega 38 mm
--     · Perfil solera 38 mm
--     · Masilla para juntas de yeso
--
--   PIN-004 (Pintura sobre metal):
--     · Esmalte sintético brillante
--     · Fondo anticorrosivo
--
-- Para agregar estos materiales, crear una migración 024 con el mismo patrón.
-- =============================================================================
