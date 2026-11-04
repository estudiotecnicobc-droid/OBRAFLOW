-- ============================================================
-- MIGRATION 030 — repair_master_task_material_prices()
-- Función genérica y reutilizable para completar FKs y precios
-- en master_task_materials huérfanos (price=0, master_material_id=NULL).
--
-- Normalización de nombres:
--   · Minúsculas
--   · Acentos eliminados via TRANSLATE (ÁÉÍÓÚáéíóú... → AEIOUaeiou...)
--   · Variante "alt": también elimina guiones y espacios → H-21 ≡ H21
--
-- Prioridad de match:
--   1. code exacto (case-insensitive)
--   2. nombre normalizado exacto
--   3. nombre alt (sin guiones/espacios)
--   Dentro de cada nivel: prefer mayor unit_price (registro más completo)
--
-- PASS 1 → master_materials (FK + precio técnico + commercial_unit)
-- PASS 2 → materials legacy  (solo snapshot de precio, sin FK)
--
-- Idempotente: no toca líneas con last_known_unit_price > 0.
-- SECURITY INVOKER: requiere SELECT+UPDATE sobre las tablas afectadas.
-- Llamar con service_role desde Supabase SQL Editor.
-- ============================================================

CREATE OR REPLACE FUNCTION public.repair_master_task_material_prices(
  p_org_id text
)
RETURNS TABLE(
  estado     text,   -- 'MM' | 'materials' | 'sin_resolver'
  task_code  text,
  mat_name   text,
  fuente     text,
  match_name text,
  precio     numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_mm_ct      int := 0;
  v_mat_ct     int := 0;
  v_unres_ct   int := 0;
  -- Helper: reusable normalization expression (inline macro style via SQL)
  -- normalize(x)     = lower + sin acentos + trim
  -- normalize_alt(x) = normalize + sin guiones ni espacios
BEGIN

  -- ── PASS 1: Reparar desde master_materials ─────────────────────────────────
  -- FK completa + precio técnico (dividido por CF cuando aplica)
  -- + commercial_unit para auditoría en UI
  WITH best_match AS (
    SELECT DISTINCT ON (mtm.id)
      mtm.id                                             AS mtm_id,
      mm.id                                              AS mm_id,
      mm.name                                            AS mm_name,
      mm.commercial_unit                                 AS mm_cu,
      CASE
        WHEN (mm.conversion_factor IS NOT NULL AND mm.conversion_factor > 1)
        THEN mm.unit_price / mm.conversion_factor
        ELSE mm.unit_price
      END                                                AS technical_price
    FROM public.master_task_materials mtm
    JOIN public.master_tasks mt
      ON mt.id = mtm.master_task_id
     AND mt.organization_id = p_org_id::uuid
     AND mt.is_active = true
    JOIN public.master_materials mm
      ON mm.organization_id = p_org_id
     AND mm.is_active        = true
     AND mm.unit_price        > 0
    WHERE (mtm.last_known_unit_price IS NULL OR mtm.last_known_unit_price = 0)
      AND (
        -- 1. Código exacto
        (
          mm.code IS NOT NULL
          AND LOWER(TRIM(mm.code)) = LOWER(TRIM(mtm.material_name))
        )
        OR
        -- 2. Nombre normalizado (sin acentos, lowercase, trimmed)
        LOWER(TRANSLATE(TRIM(mm.name),
          'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï',
          'AEIOUAEIOUaeiouaeiouNnUuIi'))
        = LOWER(TRANSLATE(TRIM(mtm.material_name),
          'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï',
          'AEIOUAEIOUaeiouaeiouNnUuIi'))
        OR
        -- 3. Nombre alt: también elimina guiones y espacios (H-21 = H21, ADN 420 = ADN420)
        REGEXP_REPLACE(
          LOWER(TRANSLATE(TRIM(mm.name),
            'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï',
            'AEIOUAEIOUaeiouaeiouNnUuIi')),
          '[-\s]+', '', 'g')
        = REGEXP_REPLACE(
          LOWER(TRANSLATE(TRIM(mtm.material_name),
            'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï',
            'AEIOUAEIOUaeiouaeiouNnUuIi')),
          '[-\s]+', '', 'g')
      )
    ORDER BY
      mtm.id,
      -- Prioridad: code (1) > nombre exacto (2) > nombre alt (3)
      CASE
        WHEN mm.code IS NOT NULL
         AND LOWER(TRIM(mm.code)) = LOWER(TRIM(mtm.material_name))
        THEN 1
        WHEN LOWER(TRANSLATE(TRIM(mm.name),'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï','AEIOUAEIOUaeiouaeiouNnUuIi'))
           = LOWER(TRANSLATE(TRIM(mtm.material_name),'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï','AEIOUAEIOUaeiouaeiouNnUuIi'))
        THEN 2
        ELSE 3
      END,
      mm.unit_price DESC NULLS LAST   -- dentro del mismo nivel: más completo primero
  )
  UPDATE public.master_task_materials mtm
  SET
    master_material_id    = bm.mm_id,
    last_known_unit_price = bm.technical_price,
    commercial_unit       = bm.mm_cu
  FROM best_match bm
  WHERE mtm.id = bm.mtm_id;

  GET DIAGNOSTICS v_mm_ct = ROW_COUNT;

  -- ── PASS 2: Fallback a materials (precio snapshot, sin FK) ─────────────────
  -- Solo actualiza last_known_unit_price — no toca master_material_id (NULL legacy).
  -- Solo para líneas que PASS 1 no pudo resolver.
  WITH best_fallback AS (
    SELECT DISTINCT ON (mtm.id)
      mtm.id  AS mtm_id,
      m.cost  AS mat_cost
    FROM public.master_task_materials mtm
    JOIN public.master_tasks mt
      ON mt.id = mtm.master_task_id
     AND mt.organization_id = p_org_id::uuid
     AND mt.is_active = true
    JOIN public.materials m
      ON m.organization_id = p_org_id
     AND m.cost > 0
    WHERE (mtm.last_known_unit_price IS NULL OR mtm.last_known_unit_price = 0)
      AND (
        LOWER(TRANSLATE(TRIM(m.name),'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï','AEIOUAEIOUaeiouaeiouNnUuIi'))
        = LOWER(TRANSLATE(TRIM(mtm.material_name),'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï','AEIOUAEIOUaeiouaeiouNnUuIi'))
        OR
        REGEXP_REPLACE(
          LOWER(TRANSLATE(TRIM(m.name),'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï','AEIOUAEIOUaeiouaeiouNnUuIi')),
          '[-\s]+', '', 'g')
        = REGEXP_REPLACE(
          LOWER(TRANSLATE(TRIM(mtm.material_name),'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï','AEIOUAEIOUaeiouaeiouNnUuIi')),
          '[-\s]+', '', 'g')
      )
    ORDER BY mtm.id, m.cost DESC NULLS LAST
  )
  UPDATE public.master_task_materials mtm
  SET last_known_unit_price = bf.mat_cost
  FROM best_fallback bf
  WHERE mtm.id = bf.mtm_id;

  GET DIAGNOSTICS v_mat_ct = ROW_COUNT;

  -- ── Contar líneas que todavía quedaron sin precio ──────────────────────────
  SELECT COUNT(*) INTO v_unres_ct
  FROM public.master_task_materials mtm
  JOIN public.master_tasks mt ON mt.id = mtm.master_task_id
  WHERE mt.organization_id = p_org_id::uuid
    AND mt.is_active = true
    AND (mtm.last_known_unit_price IS NULL OR mtm.last_known_unit_price = 0);

  RAISE NOTICE 'repair_master_task_material_prices(org=%): resueltos por MM=% | por materials=% | sin resolver=%',
    p_org_id, v_mm_ct, v_mat_ct, v_unres_ct;

  -- ── Devolver estado final de TODOS los materiales activos de la org ─────────
  -- Permite auditar: qué quedó sano, qué quedó con FK, qué sigue huérfano.
  RETURN QUERY
  SELECT
    CASE
      WHEN mtm.master_material_id IS NOT NULL THEN 'MM'::text
      WHEN mtm.last_known_unit_price > 0      THEN 'materials'::text
      ELSE                                         'sin_resolver'::text
    END                           AS estado,
    mt.code                       AS task_code,
    mtm.material_name             AS mat_name,
    CASE
      WHEN mtm.master_material_id IS NOT NULL THEN 'master_materials'::text
      WHEN mtm.last_known_unit_price > 0      THEN 'materials (snapshot)'::text
      ELSE                                         '—'::text
    END                           AS fuente,
    mm.name                       AS match_name,   -- NULL si no hay FK
    mtm.last_known_unit_price     AS precio
  FROM public.master_task_materials mtm
  JOIN public.master_tasks          mt  ON mt.id  = mtm.master_task_id
  LEFT JOIN public.master_materials mm  ON mm.id  = mtm.master_material_id
  WHERE mt.organization_id = p_org_id::uuid
    AND mt.is_active = true
  ORDER BY estado DESC, mt.code, mtm.material_name;

END;
$$;

COMMENT ON FUNCTION public.repair_master_task_material_prices(text) IS
'Repara líneas huérfanas de master_task_materials (price=0, FK null).
PASS 1: match vs master_materials por code/nombre normalizado/alt. Setea FK + precio técnico.
PASS 2: fallback a materials (solo snapshot de precio).
Idempotente — ignora líneas que ya tienen precio > 0.
Invocar con service_role desde Supabase SQL Editor.
Uso: SELECT * FROM repair_master_task_material_prices(''<org-uuid-as-text>'');';
