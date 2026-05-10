-- =============================================================================
-- Migración 044: Materiales canónicos EXC / MAM — nombres exactos del catálogo
-- Fecha: 2026-04-29
--
-- PROBLEMA QUE RESUELVE
-- ---------------------
-- El engine chandias.ts tiene NAME_ALIASES que resuelve variantes de nombre
-- (ej: "Arena gruesa" → "Arena gruesa limpia") al calcular el cómputo.
-- Pero el lookup en handleSendToPresupuesto (livePriceByName) compara nombres
-- directamente sin aliases → materiales con nombre distinto al de master_materials
-- llegan con cost=0 al presupuesto.
--
-- Materiales con MISMATCH (nombre catálogo ≠ nombre en 019):
--   · "Arena gruesa"           → 019 tiene "Arena gruesa limpia"
--   · "Piedra partida 6/20"    → 019 tiene "Piedra triturada 6/20"
--   · "Ladrillo hueco 18x18x33"→ 019 tiene "Ladrillo cerámico 18x18x33"
--
-- Materiales AUSENTES (no en ningún seed anterior):
--   · "Agua"                   — EXC-005
--   · "Agua para compactación" — EXC-003
--
-- Materiales de SEGURIDAD (en caso de que 019 ó 041 no estén ejecutados):
--   · "Cemento Portland CPN 40"  — 019
--   · "Cal hidratada"            — 041
--   · "Ladrillo hueco 12x18x33"  — 019
--
-- ESTRATEGIA
-- ----------
-- · Función nueva seed_exc_mam_materials(p_org_id text) — standalone.
-- · SELECT-EXISTS → INSERT o UPDATE — idempotente por (organization_id, name).
-- · No modifica entradas ya existentes con otro nombre (ej: "Arena gruesa limpia"
--   sigue intacta en 019; "Arena gruesa" se agrega como entrada adicional).
-- · Precios orientativos Argentina, Abril 2026. Actualizables sin consecuencias.
--
-- Tareas afectadas que quedan funcionales tras esta migración:
--   EXC-002, EXC-003, EXC-005, MAM-003, MAM-004
--
-- Prerrequisito: migración 019 ejecutada (índice master_materials_org_name_uidx).
-- =============================================================================


-- =============================================================================
-- FUNCIÓN: seed_exc_mam_materials
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

GRANT EXECUTE ON FUNCTION public.seed_exc_mam_materials(text)
  TO authenticated;

COMMENT ON FUNCTION public.seed_exc_mam_materials IS
  'Siembra materiales canónicos con nombres exactos del catálogo Chandías para EXC-003/005 y MAM-003/004. '
  'Resuelve mismatches de nombre entre catálogo y seed 019: '
  '"Arena gruesa" (019: "Arena gruesa limpia"), '
  '"Piedra partida 6/20" (019: "Piedra triturada 6/20"), '
  '"Ladrillo hueco 18x18x33" (019: "Ladrillo cerámico 18x18x33"). '
  'Agrega ausentes: "Agua", "Agua para compactación". '
  'Incluye Cemento/Cal hidratada/Ladrillo 12x18x33 como seguridad si 019/041 no corrieron. '
  'Idempotente: actualiza precio si ya existe por (organization_id, name). '
  'Precios orientativos Argentina, Abril 2026.';


-- =============================================================================
-- BACKFILL — aplica a todas las orgs con master_materials activos
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
    v_result := public.seed_exc_mam_materials(v_org_id);
    v_count  := v_count + 1;
    RAISE NOTICE 'seed_exc_mam_materials org %: %', v_org_id, v_result;
  END LOOP;

  IF v_count = 0 THEN
    RAISE NOTICE 'No hay organizaciones con master_materials activos — backfill omitido.';
  ELSE
    RAISE NOTICE 'Backfill 044 completado para % organización(es).', v_count;
  END IF;
END;
$$;
