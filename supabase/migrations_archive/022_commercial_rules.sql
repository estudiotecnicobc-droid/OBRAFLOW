-- =============================================================================
-- Migración 022: Reglas de Unidad Comercial y Factor de Conversión
-- Fecha: 2026-04-14
--
-- Problema:
--   La migración 019 define conversion_factor en el JSONB de seed pero el
--   INSERT/UPDATE nunca lo escribe (columna no existía cuando se escribió 019).
--   La migración 021 agregó las columnas commercial_unit y conversion_factor a
--   master_materials y materials, pero los datos siguen en NULL.
--
-- Solución (tres piezas):
--   1. Función apply_commercial_rules(p_org_id) — idempotente, por patrones de
--      nombre/código, llena commercial_unit + conversion_factor solo donde NULL.
--   2. Función seed_extended_materials actualizada para escribir esas columnas.
--   3. Reglas para resources NO aplican: base_cost ya es técnico y la tabla
--      no tiene columnas de conversión comercial.
--
-- Ejecución para org existente:
--   SELECT apply_commercial_rules('<UUID-ORG>');
--
-- Grupos cubiertos y decisiones de diseño:
--   · Cemento           → kg → bolsa 50 kg (CF = 50)
--   · Cal hidráulica    → kg → bolsa 25 kg (CF = 25)
--   · Cal aérea/en polvo→ kg → bolsa 20 kg (CF = 20)
--   · Yeso              → kg → bolsa 40 kg (CF = 40)
--   · Adhesivo cerámico → kg → bolsa 25 kg (CF = 25)
--   · Grout             → kg → bolsa 25 kg (CF = 25)
--   · Pintura látex     → lt → balde 20 lt (CF = 20)
--   · Fijador de paredes→ lt → balde 20 lt (CF = 20)
--   · Enduido plástico  → kg → balde 30 kg (CF = 30)
--   · Caño PVC          → m  → caño 3 m   (CF = 3)
--   · Arena / áridos    → m3 → m3 (sin CF: unidad técnica = comercial)
--   · Ladrillos / bloques → u → u (sin CF: 1:1)
--   · Hormigón elaborado  → m3 → m3 (sin CF)
--   · Hierro / acero    → kg → barra 12 m (sin CF numérico: varía por diámetro)
--     NOTA EXPLÍCITA: la masa de 1 barra varía (Ø6≈2.7kg, Ø8≈4.7kg, Ø10≈7.4kg,
--     Ø12≈10.7kg). No existe un CF único y correcto para "hierro en kg".
--     Se registra commercial_unit='barra 12 m' como referencia pero conversion_factor
--     queda NULL para no introducir error de cálculo. Si se desea, el usuario
--     puede setear el CF específico por diámetro desde el panel de materiales.
-- =============================================================================

-- =============================================================================
-- FUNCIÓN PRINCIPAL: apply_commercial_rules
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

GRANT EXECUTE ON FUNCTION public.apply_commercial_rules(text)
  TO authenticated;

COMMENT ON FUNCTION public.apply_commercial_rules IS
  'Asigna commercial_unit y conversion_factor por patrones de nombre para materiales '
  'conocidos (cemento, cal, ladrillos, hormigón, áridos, pinturas, etc.). '
  'Idempotente: solo actualiza donde ambos campos son NULL. '
  'Nunca pisa valores ya existentes. '
  'Jerarquía: hierro/acero → solo commercial_unit sin CF (CF varía por diámetro). '
  'Áridos/hormigón → solo commercial_unit=m³ sin CF (m3 técnico = comercial). '
  'Ejecución: SELECT apply_commercial_rules(''<UUID-ORG>'');';


-- =============================================================================
-- FUNCIÓN ACTUALIZADA: seed_extended_materials
-- Ahora escribe conversion_factor y commercial_unit en INSERT y UPDATE.
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
    -- NOTA: hierro nervado → CF no aplica (varía por diámetro). Solo commercial_unit.
    jsonb_build_object('name','Hierro nervado Ø6 mm',        'unit','kg',  'unit_price',920,  'category','Estructural',   'commercial_format','Barra 12 m',   'commercial_unit','barra 12 m',  'waste_percent',8),
    jsonb_build_object('name','Hierro nervado Ø8 mm',        'unit','kg',  'unit_price',935,  'category','Estructural',   'commercial_format','Barra 12 m',   'commercial_unit','barra 12 m',  'waste_percent',8),
    jsonb_build_object('name','Hierro nervado Ø10 mm',       'unit','kg',  'unit_price',950,  'category','Estructural',   'commercial_format','Barra 12 m',   'commercial_unit','barra 12 m',  'waste_percent',8),
    jsonb_build_object('name','Hierro nervado Ø12 mm',       'unit','kg',  'unit_price',960,  'category','Estructural',   'commercial_format','Barra 12 m',   'commercial_unit','barra 12 m',  'waste_percent',8),
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

  v_m jsonb;
  v_id uuid;
  v_exists boolean;
BEGIN
  FOR v_m IN SELECT jsonb_array_elements(v_materials)
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.master_materials
      WHERE organization_id = p_org_id
        AND name = v_m->>'name'
        AND is_active = true
    ) INTO v_exists;

    IF v_exists THEN
      -- Actualizar precio, formato comercial, conversion_factor y commercial_unit
      UPDATE public.master_materials
      SET
        unit_price         = (v_m->>'unit_price')::numeric,
        commercial_format  = v_m->>'commercial_format',
        -- Solo completar campos de conversión si siguen NULL (no pisar datos del usuario)
        commercial_unit    = COALESCE(commercial_unit,   v_m->>'commercial_unit'),
        conversion_factor  = COALESCE(conversion_factor, (v_m->>'conversion_factor')::numeric),
        waste_percent      = COALESCE((v_m->>'waste_percent')::numeric, waste_percent),
        updated_at         = now()
      WHERE organization_id = p_org_id
        AND name = v_m->>'name'
        AND is_active = true;
      v_updated := v_updated + 1;
    ELSE
      -- Insertar nuevo con todos los campos
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
        v_m->>'commercial_unit',
        (v_m->>'conversion_factor')::numeric,
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
  'Ahora también escribe commercial_unit y conversion_factor (sin pisar datos del usuario). '
  'Los precios son orientativos para Argentina, Abril 2026.';


-- =============================================================================
-- TRIGGER: auto-seed materiales al crear organización nueva
-- =============================================================================
-- Propósito: garantizar que toda organización nueva arranque con materiales
-- base y reglas comerciales aplicadas, sin intervención manual.
--
-- Jerarquía de llamadas al crear una org:
--   INSERT INTO organizations → trigger → seed_extended_materials + apply_commercial_rules
--
-- NOTA: si ya existe una función bootstrap_organization en Supabase que maneja
-- la creación de org, el trigger es complementario y no interfiere.
-- apply_commercial_rules es idempotente, no produce daño si corre dos veces.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.trg_fn_new_org_seed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sembrar materiales base para la nueva organización
  PERFORM public.seed_extended_materials(NEW.id::text);
  -- Aplicar reglas de conversión comercial
  PERFORM public.apply_commercial_rules(NEW.id::text);
  RETURN NEW;
EXCEPTION
  -- No fallar el INSERT de la org si el seed falla (ej: columnas faltantes antes de 021)
  WHEN OTHERS THEN
    RAISE WARNING '[trg_new_org_seed] Error al sembrar materiales para org %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Crear trigger solo si no existe (idempotente vía DROP IF EXISTS + CREATE)
DROP TRIGGER IF EXISTS trg_new_org_seed ON public.organizations;

CREATE TRIGGER trg_new_org_seed
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_new_org_seed();

COMMENT ON FUNCTION public.trg_fn_new_org_seed IS
  'Trigger: al crear una organización, siembra materiales base y aplica '
  'reglas de conversión comercial automáticamente. Idempotente y tolerante a fallas.';


-- =============================================================================
-- APLICAR REGLAS A ORGANIZACIONES EXISTENTES
-- =============================================================================
-- Instrucción de ejecución manual (no es automática para no afectar producción):
--
--   -- Para una org específica:
--   SELECT seed_extended_materials('<UUID-ORG>');
--   SELECT apply_commercial_rules('<UUID-ORG>');
--
--   -- Para TODAS las orgs activas (ejecutar solo en dev/staging o con revisión previa):
--   SELECT
--     id,
--     name,
--     seed_extended_materials(id::text)  AS seed_result,
--     apply_commercial_rules(id::text)   AS rules_result
--   FROM public.organizations
--   WHERE is_active = true
--   ORDER BY name;
-- =============================================================================
