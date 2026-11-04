-- =============================================================================
-- Migración 041: Materiales Canónicos — Morteros, Mampostería, Revoques, Contrapisos
-- Fecha: 2026-04-27
--
-- Materiales nuevos (6):
--   1. Cal hidratada          — Ca(OH)₂, morteros MAM/REV. DISTINTO de Cal hidráulica.
--   2. Ladrillo común 6x12x24 — MAM-001/002.
--   3. Ladrillo hueco 8x18x33 — MAM-005/006.
--   4. Cascote de ladrillo    — PIS-001.
--   5. Arena media lavada     — REV-003/004.
--   6. Hidrófugo líquido integral — REV-003.
--
-- Aliases corregidos en chandias.ts (mismo PR):
--   · Alias bidireccional cal hidratada ↔ cal hidráulica ELIMINADO.
--     Son productos distintos; no se deben intercambiar precios.
--   · Cal hidratada ahora requiere entrada explícita en DB (este seed).
--   · Ladrillo hueco 18x18x33 → alias ampliado para cubrir "Ladrillo cerámico 18x18x33" (019).
--
-- Materiales YA cubiertos (no tocados):
--   · Cal hidráulica, Cal aérea en polvo — 019, precios intactos
--   · Arena gruesa / Arena fina cernida  — aliases en engine a 019
--   · Yeso común para construcción       — alias a "Yeso de construcción" (019)
--   · Ladrillo hueco 12x18x33            — nombre exacto en 019
--   · Pastina                            — alias a "Pastina cementicia" (023)
--
-- Convenciones de unidad:
--   · Líquidos: 'lt' (consistente con Sellador epoxi, Pintura, Fijador, Pegamento PVC en 019)
--   · Categoría para impermeabilizantes: 'Impermeab.' (ya usada en 019)
--
-- Estrategia:
--   · Función nueva seed_mortero_materials(p_org_id text) — standalone.
--     No reemplaza seed_extended_materials: funciones aditivas.
--   · SELECT-EXISTS → INSERT o UPDATE — idempotente.
--   · Precios orientativos Argentina, Abril 2026. Actualizables sin consecuencias.
--
-- Prerrequisito: migración 019 ejecutada (índice master_materials_org_name_uidx).
-- =============================================================================

-- =============================================================================
-- FUNCIÓN: seed_mortero_materials
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

GRANT EXECUTE ON FUNCTION public.seed_mortero_materials(text)
  TO authenticated;

COMMENT ON FUNCTION public.seed_mortero_materials IS
  'Siembra materiales canónicos para morteros, mampostería, revoques y contrapisos. '
  'Idempotente: actualiza precio si el material ya existe por (organization_id, name). '
  'Complementa seed_extended_materials (019/023) sin reemplazarla. '
  'Materiales agregados: Cal hidratada, Ladrillo común 6x12x24, Ladrillo hueco 8x18x33, '
  'Cascote de ladrillo, Arena media lavada, Hidrófugo líquido integral. '
  'NOTA: Cal hidratada (Ca(OH)₂) es producto distinto de Cal hidráulica (NHL). '
  'El alias bidireccional entre ambas fue eliminado en chandias.ts (PR 041). '
  'Precios orientativos Argentina, Abril 2026.';


-- =============================================================================
-- BACKFILL — ejecutar para cada org activa con master_materials existentes
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
    v_result := public.seed_mortero_materials(v_org_id);
    v_count  := v_count + 1;
    RAISE NOTICE 'seed_mortero_materials org %: %', v_org_id, v_result;
  END LOOP;

  IF v_count = 0 THEN
    RAISE NOTICE 'No hay organizaciones con master_materials activos — backfill omitido.';
  ELSE
    RAISE NOTICE 'Backfill 041 completado para % organización(es).', v_count;
  END IF;
END;
$$;


-- =============================================================================
-- RESUMEN: materiales del catálogo Chandías aún sin cobertura tras 041
-- (quedan como "sin precio" en Calculadora — para migración 044+ posterior)
-- =============================================================================
--
-- Pisos / terminaciones (fuera del alcance de PR-1 / PR-2):
--   PIS-004: "Mosaico calcáreo 20×20cm"
--   PIS-005/006: Cerámicos 30×30cm, 45×45cm (019 tiene 33×33 solamente)
--   PIS-007: "Porcelanato 30×60cm" (019 tiene 60×60 solamente)
--
-- Cielorrasos:
--   CIE-002: "Placa de yeso 1.20×2.40m", "Perfil omega 38mm", "Perfil solera 38mm"
--
-- → Crear migración 044_canonical_materials_pisos_terminaciones.sql cuando corresponda.
-- =============================================================================
