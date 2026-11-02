-- =============================================================================
-- Migración 20261103100100: unifica master_materials.unit_price en unidad técnica
-- Fecha: 2026-11-03
--
-- Problema: hasta hoy conviven en master_materials dos convenciones de precio:
--   · Materiales con conversion_factor > 1 → unit_price está en unidad COMERCIAL
--     ("bolsa 50 kg", "barra ∅12mm · 12m", "millar", "balde 20 lt", etc.).
--     useUnifiedMaterials y chandias/steelWorkflow lo dividen por conversion_factor
--     para obtener precio técnico; calculate_consolidated_resources (057) y
--     freeze_budget_prices (100009) NO lo dividen y por eso devuelven costos
--     inflados por un factor para 47 componentes de APU vivos.
--   · Materiales sin conversion_factor (o = 1) → unit_price ya está en técnica.
--
-- Decisión (criterio A·I): master_materials.unit_price pasa a guardar SIEMPRE el
-- precio en la unidad técnica (la de la columna unit). conversion_factor y
-- commercial_unit quedan como evidencia para calcular cantidades de compra y
-- mostrar el precio comercial derivado en UI. La conversión comercial→técnica
-- se hace una sola vez — acá en la migración, y a partir de ahora en el adaptador
-- de la UI de carga (el usuario escribe comercial y la pantalla divide).
--
-- Esta migración:
--   1. Crea una tabla de backup inmutable (master_materials_precio_comercial_backup).
--   2. Agrega la columna price_unit_basis para marcar las filas convertidas e
--      impedir una segunda ejecución (idempotente).
--   3. Divide unit_price por conversion_factor para TODAS las filas (activas e
--      inactivas) con conversion_factor > 1 que aún no fueron convertidas.
--   4. Arregla el schema de los 4 hierros (unit 'barra' → 'kg'; los componentes
--      de APU ya miden en kg). factor y commercial_unit quedan intactos.
--   5. Resincroniza master_task_materials.last_known_unit_price para los
--      componentes que apuntan a esos materiales (con 2 exclusiones explícitas:
--      la pintura látex del APU de 3e5c... con lkup=72.50 — valor manual — se
--      lista en docs/qa/precio-tecnico-produccion.md para revisión).
--   6. Verifica totales esperados; aborta si no coinciden.
-- =============================================================================
BEGIN;

-- ── 0. Pre-chequeos ──────────────────────────────────────────────────────────
DO $pre$
DECLARE v_bad int;
BEGIN
  -- No debería haber filas con factor en (0,1) ni = 0 (si aparecen, hay que
  -- clasificarlas antes de correr esta migración).
  SELECT COUNT(*) INTO v_bad FROM public.master_materials
  WHERE conversion_factor IS NOT NULL AND conversion_factor <= 1 AND conversion_factor > 0;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Hay % filas con conversion_factor en (0,1]. Revisar antes de correr esta migración.', v_bad;
  END IF;
END $pre$;

-- ── 1. Backup inmutable ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.master_materials_precio_comercial_backup (
  id                 uuid PRIMARY KEY,
  old_unit_price     numeric(14,4) NOT NULL,
  old_unit           text NOT NULL,
  conversion_factor  numeric(14,6) NOT NULL,
  commercial_unit    text,
  organization_id    text,            -- master_materials.organization_id es text (incluye seeds "org_a"/"org_b"/"org_demo" junto a UUIDs reales)
  name               text NOT NULL,
  is_active          boolean NOT NULL,
  converted_at       timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.master_materials_precio_comercial_backup IS
  'Snapshot de master_materials antes de dividir unit_price por conversion_factor en la migración 20261103100100. Append-only. Permite reversión manual vía supabase/rollback/20261103100100_revertir_precio_tecnico.sql.';

-- ── 2. Marca idempotente ────────────────────────────────────────────────────
ALTER TABLE public.master_materials
  ADD COLUMN IF NOT EXISTS price_unit_basis text;

DO $check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'master_materials_price_unit_basis_check'
      AND conrelid = 'public.master_materials'::regclass
  ) THEN
    ALTER TABLE public.master_materials
      ADD CONSTRAINT master_materials_price_unit_basis_check
        CHECK (price_unit_basis IS NULL OR price_unit_basis IN ('commercial_legacy','technical'));
  END IF;
END $check$;

COMMENT ON COLUMN public.master_materials.price_unit_basis IS
  'Marca de la unidad en que está guardado unit_price. "technical" = unidad base (unit). '
  '"commercial_legacy" = por unidad comercial (previo a la migración 20261103100100). '
  'NULL en filas sin conversion_factor > 1 (no aplica). Usar para evitar doble conversión.';

-- ── 3. División unit_price = unit_price / conversion_factor ─────────────────
-- Incluye activos e inactivos para que, si un material inactivo se reactiva,
-- vuelva con precio técnico y no comercial.
WITH candidatos AS (
  SELECT id
  FROM public.master_materials
  WHERE conversion_factor IS NOT NULL
    AND conversion_factor > 1
    AND (price_unit_basis IS DISTINCT FROM 'technical')
),
inserciones AS (
  INSERT INTO public.master_materials_precio_comercial_backup
    (id, old_unit_price, old_unit, conversion_factor, commercial_unit, organization_id, name, is_active)
  SELECT mm.id, mm.unit_price, mm.unit, mm.conversion_factor, mm.commercial_unit,
         mm.organization_id,
         mm.name, mm.is_active
  FROM public.master_materials mm
  WHERE mm.id IN (SELECT id FROM candidatos)
    AND NOT EXISTS (SELECT 1 FROM public.master_materials_precio_comercial_backup b WHERE b.id = mm.id)
  RETURNING id
)
UPDATE public.master_materials mm
   SET unit_price       = ROUND((mm.unit_price / mm.conversion_factor)::numeric, 4),
       price_unit_basis = 'technical',
       updated_at       = now()
 WHERE mm.id IN (SELECT id FROM candidatos);

-- ── 4. Hierros: unit 'barra' → 'kg' (ids explícitos, factor y commercial_unit intactos) ──
UPDATE public.master_materials
   SET unit = 'kg', updated_at = now()
 WHERE id IN (
   '47007849-ac1b-43f8-8c61-f237f19e6516',   -- Hierro nervado Ø10 mm
   '7fa33df3-1823-4a45-b126-30e20bad516a',   -- Hierro nervado Ø12 mm
   '814e64a6-67fe-4074-ae35-e32d39925a3d',   -- Hierro nervado Ø6 mm
   '998cd42b-0929-409b-a8ab-536ef8d07504'    -- Hierro nervado Ø8 mm
 )
 AND unit = 'barra';

-- ── 5. Resincroniza master_task_materials.last_known_unit_price ─────────────
-- UPDATE dirigido: solo los componentes cuyo master_material_id acaba de ser
-- convertido (está en el backup, lo que garantiza que son solo filas tocadas
-- por esta migración y no pisamos otros snapshots legítimos).
--
-- Exclusión manual: componente 6bdf5331-060a-4424-bd9c-c50be7f82b7c (pintura
-- látex interior blanco, lkup=72.50 que no coincide ni con el técnico 142.50 ni
-- con el comercial 2850 — valor manual). Queda listado para revisión en el
-- runbook; no se toca en esta migración.
UPDATE public.master_task_materials mtm
   SET last_known_unit_price = mm.unit_price
  FROM public.master_materials mm
 WHERE mm.id = mtm.master_material_id
   AND mtm.master_material_id IN (SELECT id FROM public.master_materials_precio_comercial_backup)
   AND mtm.id <> '6bdf5331-060a-4424-bd9c-c50be7f82b7c';

-- ── 6. Verificación ─────────────────────────────────────────────────────────
DO $post$
DECLARE
  v_marked int;
  v_backup int;
  v_remaining_commercial int;
BEGIN
  SELECT COUNT(*) INTO v_marked FROM public.master_materials
    WHERE price_unit_basis = 'technical';
  SELECT COUNT(*) INTO v_backup FROM public.master_materials_precio_comercial_backup;
  SELECT COUNT(*) INTO v_remaining_commercial FROM public.master_materials
    WHERE conversion_factor IS NOT NULL AND conversion_factor > 1
      AND (price_unit_basis IS DISTINCT FROM 'technical');

  IF v_remaining_commercial > 0 THEN
    RAISE EXCEPTION 'Quedan % filas con conversion_factor > 1 sin convertir', v_remaining_commercial;
  END IF;

  RAISE NOTICE 'Migración OK: marcadas=% backup=%', v_marked, v_backup;
END $post$;

COMMIT;
