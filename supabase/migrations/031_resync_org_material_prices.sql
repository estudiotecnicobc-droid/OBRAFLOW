-- ============================================================
-- MIGRATION 031 — resync_org_material_prices(p_org_id text)
--
-- Reparación genérica multicapa para cualquier organización.
-- Complementa migration 030 (repair_master_task_material_prices).
--
-- CAPAS (secuenciales, cada una usa el resultado de la anterior):
--
-- CAPA 1 — Precio fuente: actualizar master_materials.unit_price
--   Condición: unit_price = 0 (o null), is_active = true
--   Fuente:    materials.cost de la misma org
--   Match:     code > nombre normalizado > nombre alt (sin guiones/espacios)
--   No toca:   materiales con unit_price > 0 ya correctos
--
-- CAPA 2 — Snapshot: re-sincronizar master_task_materials.last_known_unit_price
--   Condición: master_material_id IS NOT NULL (FK set)
--              AND last_known_unit_price = 0
--              AND master_materials.unit_price > 0 (ya corregido en CAPA 1)
--   Cálculo:   si conversion_factor > 1 → precio técnico = unit_price / cf
--   No toca:   filas con last_known_unit_price > 0
--
-- CAPA 3 — Huérfanos restantes (sin FK):
--   Llama a repair_master_task_material_prices() de migration 030
--   que resuelve FK + snapshot para líneas sin master_material_id
--
-- IDEMPOTENTE: re-ejecutar produce el mismo resultado sin efectos adicionales.
-- SCOPE: afecta SOLO a la org pasada como argumento.
-- SECURITY INVOKER: ejecutar con service_role desde Supabase SQL Editor.
-- NO toca budget_items, no cambia estructura DB.
--
-- Uso:
--   SELECT * FROM public.resync_org_material_prices('<org-uuid-as-text>');
-- ============================================================

-- ── Macro de normalización inline (constante de texto para TRANSLATE) ─────────
-- FROM: ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï  (26 chars)
-- TO:   AEIOUAEIOUaeiouaeiouNnUuIi    (26 chars)
-- Luego REGEXP_REPLACE(..., '[-\s]+', '', 'g') para variante "alt" (H-21≡H21)

CREATE OR REPLACE FUNCTION public.resync_org_material_prices(p_org_id text)
RETURNS TABLE(
  capa          text,
  estado        text,    -- 'reparado' | 'sin_resolver'
  task_code     text,
  mat_name      text,
  fuente        text,
  precio_final  numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_c1_ct   int := 0;   -- master_materials reparados en CAPA 1
  v_c2_ct   int := 0;   -- snapshots re-sincronizados en CAPA 2
  v_c3_mm   int := 0;   -- resueltos por 030 PASS 1 (master_materials)
  v_c3_mat  int := 0;   -- resueltos por 030 PASS 2 (materials)
  v_unres   int := 0;   -- sin resolver tras las 3 capas
BEGIN

  -- ══════════════════════════════════════════════════════════════════════════
  -- CAPA 1: Actualizar master_materials.unit_price desde materials.cost
  --         Solo donde unit_price = 0 y hay match válido en materials.
  --         Match priorizado: code > nombre norm. exacto > nombre alt.
  -- ══════════════════════════════════════════════════════════════════════════
  WITH price_source AS (
    SELECT DISTINCT ON (mm.id)
      mm.id  AS mm_id,
      m.cost AS new_price,
      m.name AS source_name
    FROM public.master_materials mm
    JOIN public.materials m
      ON m.organization_id = p_org_id
     AND m.cost > 0
     AND (
       -- 1. Code exacto (case-insensitive)
       (mm.code IS NOT NULL AND LOWER(TRIM(mm.code)) = LOWER(TRIM(m.code)))
       OR
       -- 2. Nombre normalizado exacto (sin acentos, lowercase)
       LOWER(TRANSLATE(TRIM(mm.name),
         'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï',
         'AEIOUAEIOUaeiouaeiouNnUuIi'))
       = LOWER(TRANSLATE(TRIM(m.name),
         'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï',
         'AEIOUAEIOUaeiouaeiouNnUuIi'))
       OR
       -- 3. Alt: sin guiones ni espacios (H-21 ≡ H21, ADN 420 ≡ ADN420)
       REGEXP_REPLACE(
         LOWER(TRANSLATE(TRIM(mm.name),
           'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï',
           'AEIOUAEIOUaeiouaeiouNnUuIi')), '[-\s]+', '', 'g')
       = REGEXP_REPLACE(
         LOWER(TRANSLATE(TRIM(m.name),
           'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï',
           'AEIOUAEIOUaeiouaeiouNnUuIi')), '[-\s]+', '', 'g')
     )
    WHERE mm.organization_id = p_org_id
      AND mm.is_active = true
      AND (mm.unit_price IS NULL OR mm.unit_price = 0)
    ORDER BY
      mm.id,
      -- Prioridad de match
      CASE
        WHEN mm.code IS NOT NULL AND LOWER(TRIM(mm.code)) = LOWER(TRIM(m.code)) THEN 1
        WHEN LOWER(TRANSLATE(TRIM(mm.name),'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï','AEIOUAEIOUaeiouaeiouNnUuIi'))
           = LOWER(TRANSLATE(TRIM(m.name), 'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï','AEIOUAEIOUaeiouaeiouNnUuIi'))
        THEN 2
        ELSE 3
      END,
      m.cost DESC NULLS LAST   -- dentro del mismo nivel: preferir mayor costo (más completo)
  )
  UPDATE public.master_materials mm
  SET unit_price = ps.new_price
  FROM price_source ps
  WHERE mm.id = ps.mm_id;

  GET DIAGNOSTICS v_c1_ct = ROW_COUNT;
  RAISE NOTICE 'CAPA 1 — master_materials actualizados: %', v_c1_ct;

  -- ══════════════════════════════════════════════════════════════════════════
  -- CAPA 2: Re-sincronizar snapshots en master_task_materials
  --         Para filas con FK ya seteada (tiene_fk = true) pero precio = 0.
  --         Usa el unit_price de master_materials (ya corregido en CAPA 1 si aplica).
  --         Aplica conversión técnica: unit_price / conversion_factor si CF > 1.
  -- ══════════════════════════════════════════════════════════════════════════
  UPDATE public.master_task_materials mtm
  SET last_known_unit_price = CASE
      WHEN mm.conversion_factor IS NOT NULL AND mm.conversion_factor > 1
      THEN mm.unit_price / mm.conversion_factor
      ELSE mm.unit_price
    END
  FROM public.master_materials mm
  JOIN public.master_tasks mt ON mt.id = mtm.master_task_id
  WHERE mtm.master_material_id = mm.id             -- FK existente
    AND mt.organization_id     = p_org_id::uuid
    AND mt.is_active           = true
    AND mm.unit_price          > 0                 -- solo si hay precio en master_materials
    AND (mtm.last_known_unit_price IS NULL OR mtm.last_known_unit_price = 0);

  GET DIAGNOSTICS v_c2_ct = ROW_COUNT;
  RAISE NOTICE 'CAPA 2 — snapshots re-sincronizados: %', v_c2_ct;

  -- ══════════════════════════════════════════════════════════════════════════
  -- CAPA 3: Huérfanos sin FK — llamar a repair_master_task_material_prices
  --         (migration 030). Resuelve FK + snapshot para líneas sin FK.
  --         Solo actúa si la función 030 fue creada; si no existe, skip silencioso.
  -- ══════════════════════════════════════════════════════════════════════════
  BEGIN
    PERFORM public.repair_master_task_material_prices(p_org_id);
    -- Contar lo que 030 resolvió (proxy: filas que antes eran huérfanas y ahora tienen FK)
    SELECT COUNT(*) INTO v_c3_mm
    FROM public.master_task_materials mtm
    JOIN public.master_tasks mt ON mt.id = mtm.master_task_id
    WHERE mt.organization_id = p_org_id::uuid
      AND mt.is_active = true
      AND mtm.master_material_id IS NOT NULL
      AND mtm.last_known_unit_price > 0;
  EXCEPTION WHEN undefined_function THEN
    RAISE NOTICE 'CAPA 3 — repair_master_task_material_prices() no existe (migration 030 no aplicada). Skipping.';
  END;

  -- Contar sin resolver
  SELECT COUNT(*) INTO v_unres
  FROM public.master_task_materials mtm
  JOIN public.master_tasks mt ON mt.id = mtm.master_task_id
  WHERE mt.organization_id = p_org_id::uuid
    AND mt.is_active = true
    AND (mtm.last_known_unit_price IS NULL OR mtm.last_known_unit_price = 0);

  RAISE NOTICE 'CAPA 3 — huérfanos procesados por 030. Sin resolver final: %', v_unres;
  RAISE NOTICE '── resync_org_material_prices(org=%) COMPLETO ──', p_org_id;
  RAISE NOTICE '   CAPA 1: master_materials corregidos   = %', v_c1_ct;
  RAISE NOTICE '   CAPA 2: snapshots re-sincronizados    = %', v_c2_ct;
  RAISE NOTICE '   Sin resolver                          = %', v_unres;

  -- ══════════════════════════════════════════════════════════════════════════
  -- RETURN: estado final de todos los materiales activos de la org
  -- ══════════════════════════════════════════════════════════════════════════
  RETURN QUERY
  SELECT
    '031'::text                                               AS capa,
    CASE
      WHEN mtm.last_known_unit_price > 0 THEN 'reparado'::text
      ELSE                                    'sin_resolver'::text
    END                                                       AS estado,
    mt.code                                                   AS task_code,
    mtm.material_name                                         AS mat_name,
    CASE
      WHEN mtm.master_material_id IS NOT NULL THEN 'master_materials'::text
      ELSE                                         'materials (snap)'::text
    END                                                       AS fuente,
    COALESCE(mtm.last_known_unit_price, 0)                    AS precio_final
  FROM public.master_task_materials mtm
  JOIN public.master_tasks          mt  ON mt.id  = mtm.master_task_id
  WHERE mt.organization_id = p_org_id::uuid
    AND mt.is_active       = true
  ORDER BY estado DESC, mt.code, mtm.material_name;

END;
$$;

COMMENT ON FUNCTION public.resync_org_material_prices(text) IS
'Reparación multicapa para precios 0 en master_task_materials.
CAPA 1: corrige master_materials.unit_price desde materials.cost (solo si price=0).
CAPA 2: re-sincroniza last_known_unit_price en master_task_materials con FK existente.
CAPA 3: llama a repair_master_task_material_prices() (030) para huérfanos sin FK.
Idempotente. No toca budget_items. Solo afecta la org del argumento.
Uso: SELECT * FROM resync_org_material_prices(''<org-uuid>'');';
