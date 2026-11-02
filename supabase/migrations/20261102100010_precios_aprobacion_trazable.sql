-- Motor de precios — aprobación de equivalencias SKU → material trazable (revisión PR #76, H1/H2).
-- Redefine approve_supplier_mapping (misma firma que 20261102100006/100007, SECURITY DEFINER):
--   H1. SKU ya mapeado CON historial (observaciones) y solicitud distinta → 23505
--       HISTORICAL_MAPPING_IMMUTABLE, evaluado ANTES de la guarda de ambigüedad.
--   H2. SKU ya mapeado SIN historial pero con filas del SKU en processing_status='raw'
--       (aprobadas y todavía no homologadas) y solicitud distinta → 23505
--       MAPPING_CHANGE_BLOCKED_PENDING_ROWS: no se pisa approved_by con filas en vuelo.
--   Sin historial ni filas raw, la re-decisión sigue permitida pero deja rastro en
--   supplier_product_mapping_history (append-only) con el estado anterior y su aprobador.
-- No modifica 20261102100006 ni 20261102100007.
BEGIN;

CREATE TABLE IF NOT EXISTS public.supplier_product_mapping_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  supplier_product_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  supplier_sku text NOT NULL,
  -- Estado anterior (el que se reemplaza)
  master_material_id uuid NOT NULL,
  unit_factor numeric(20,8) NOT NULL,
  supplier_unit text NOT NULL,
  expected_currency text NOT NULL,
  status text NOT NULL,
  approved_by uuid NOT NULL,
  approved_at timestamptz NOT NULL,
  -- Quién y cuándo lo reemplazó, y con qué
  replaced_by uuid NOT NULL,
  replaced_at timestamptz NOT NULL DEFAULT now(),
  new_master_material_id uuid NOT NULL,
  new_unit_factor numeric(20,8) NOT NULL,
  new_supplier_unit text NOT NULL,
  new_expected_currency text NOT NULL,
  FOREIGN KEY (organization_id, supplier_product_id)
    REFERENCES public.supplier_products(organization_id, id)
);
CREATE INDEX IF NOT EXISTS spm_history_product_idx
  ON public.supplier_product_mapping_history (organization_id, supplier_product_id, replaced_at DESC);

ALTER TABLE public.supplier_product_mapping_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supplier_product_mapping_history FROM PUBLIC, anon, authenticated;
-- Solo lectura para miembros; escribe únicamente approve_supplier_mapping (SECURITY DEFINER).
GRANT SELECT ON public.supplier_product_mapping_history TO authenticated;
DROP POLICY IF EXISTS spm_history_read ON public.supplier_product_mapping_history;
CREATE POLICY spm_history_read ON public.supplier_product_mapping_history
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

CREATE OR REPLACE FUNCTION public.approve_supplier_mapping(
 p_organization_id uuid,
 p_supplier_id uuid,
 p_raw_sku text,
 p_master_material_id uuid,
 p_conversion_factor numeric
)
RETURNS TABLE(mapping_id uuid, queued_rows bigint)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public
AS $rpc$
DECLARE
 v_uid uuid := auth.uid();
 v_sku text := nullif(btrim(p_raw_sku),'');
 v_unit text; v_currency text; v_id uuid;
 v_existing public.supplier_products%ROWTYPE;
 v_has_pending boolean;
 v_has_history boolean := false;
 v_has_raw boolean := false;
 v_differs boolean;
 v_count bigint;
BEGIN
 IF v_uid IS NULL OR NOT EXISTS (
   SELECT 1 FROM public.organization_members om
   WHERE om.organization_id=p_organization_id
     AND om.user_id=v_uid
     AND om.role IN ('owner','admin','editor')
 ) THEN
   RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE='42501';
 END IF;
 IF v_sku IS NULL OR length(v_sku)>200 OR
    p_conversion_factor IS NULL OR p_conversion_factor<=0 OR
    p_conversion_factor>100000000 THEN
   RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM public.price_suppliers s
   WHERE s.id=p_supplier_id AND s.organization_id=p_organization_id
     AND s.is_active
 ) OR NOT EXISTS (
   SELECT 1 FROM public.master_materials m
   WHERE m.id=p_master_material_id AND m.is_active
     AND (m.organization_id=p_organization_id::text OR m.organization_id IS NULL)
 ) THEN
   RAISE EXCEPTION 'SUPPLIER_OR_MATERIAL_NOT_ACCESSIBLE' USING ERRCODE='42501';
 END IF;

 -- Serialize approvals for the same supplier SKU (not a global batch lock).
 PERFORM pg_advisory_xact_lock(
   hashtextextended(p_organization_id::text||'/'||p_supplier_id::text||'/'||v_sku,0)
 );

 SELECT * INTO v_existing FROM public.supplier_products sp
 WHERE sp.organization_id=p_organization_id AND sp.supplier_id=p_supplier_id
   AND sp.supplier_sku=v_sku FOR UPDATE;

 -- Unidad/moneda de origen de las filas pendientes de mapeo (debe ser única).
 SELECT MIN(r.supplier_unit), MIN(r.source_currency), count(*)>0
 INTO v_unit,v_currency,v_has_pending
 FROM public.price_import_rows r
 JOIN public.price_import_batches b ON b.id=r.batch_id
 WHERE r.organization_id=p_organization_id
   AND b.supplier_id=p_supplier_id
   AND b.status='raw_ready'
   AND r.processing_status='pending_mapping'
   AND r.supplier_sku=v_sku;

 IF v_existing.id IS NOT NULL THEN
   v_has_history := EXISTS (
     SELECT 1 FROM public.price_observations o WHERE o.supplier_product_id=v_existing.id);
   v_has_raw := EXISTS (
     SELECT 1 FROM public.price_import_rows r
     JOIN public.price_import_batches b ON b.id=r.batch_id
     WHERE r.organization_id=p_organization_id AND b.supplier_id=p_supplier_id
       AND b.status='raw_ready' AND r.processing_status='raw' AND r.supplier_sku=v_sku);
   -- Sin filas pendientes, la unidad/moneda de referencia es la de la equivalencia vigente.
   IF NOT v_has_pending THEN
     v_unit := v_existing.supplier_unit;
     v_currency := v_existing.expected_currency;
   END IF;
   v_differs := v_existing.master_material_id<>p_master_material_id
             OR v_existing.unit_factor<>p_conversion_factor
             OR v_existing.supplier_unit IS DISTINCT FROM v_unit
             OR v_existing.expected_currency IS DISTINCT FROM v_currency
             OR v_existing.status<>'approved';

   -- H1: con historial de observaciones la equivalencia es inmutable (antes de la ambigüedad).
   IF v_has_history AND v_differs THEN
     RAISE EXCEPTION 'HISTORICAL_MAPPING_IMMUTABLE' USING ERRCODE='23505';
   END IF;
   -- H2: sin historial pero con filas aprobadas en vuelo (raw) no se cambia la decisión.
   IF v_differs AND v_has_raw THEN
     RAISE EXCEPTION 'MAPPING_CHANGE_BLOCKED_PENDING_ROWS' USING ERRCODE='23505';
   END IF;
   -- Reintento idéntico sin filas pendientes: devuelve la equivalencia existente sin tocarla.
   IF NOT v_differs AND NOT v_has_pending THEN
     RETURN QUERY SELECT v_existing.id,0::bigint;
     RETURN;
   END IF;
 END IF;

 -- Require unique source unit/currency across outstanding rows.
 -- Any ambiguity is kept pending for explicit batch-specific handling.
 IF v_unit IS NULL OR v_currency IS NULL OR v_currency NOT IN ('ARS','USD') OR
   EXISTS (
     SELECT 1 FROM public.price_import_rows r
     JOIN public.price_import_batches b ON b.id=r.batch_id
     WHERE r.organization_id=p_organization_id AND b.supplier_id=p_supplier_id
       AND b.status='raw_ready' AND r.processing_status='pending_mapping'
       AND r.supplier_sku=v_sku
       AND (r.supplier_unit IS DISTINCT FROM v_unit OR
            r.source_currency IS DISTINCT FROM v_currency)
   ) THEN
   RAISE EXCEPTION 'AMBIGUOUS_SKU_UNIT_OR_CURRENCY' USING ERRCODE='22023';
 END IF;

 IF v_existing.id IS NOT NULL AND NOT v_differs THEN
   v_id:=v_existing.id;
 ELSE
   IF v_existing.id IS NOT NULL THEN
     -- Re-decisión permitida (sin historial ni filas raw): conservar rastro del estado anterior.
     INSERT INTO public.supplier_product_mapping_history (
       organization_id, supplier_product_id, supplier_id, supplier_sku,
       master_material_id, unit_factor, supplier_unit, expected_currency, status,
       approved_by, approved_at, replaced_by, replaced_at,
       new_master_material_id, new_unit_factor, new_supplier_unit, new_expected_currency
     ) VALUES (
       p_organization_id, v_existing.id, p_supplier_id, v_sku,
       v_existing.master_material_id, v_existing.unit_factor, v_existing.supplier_unit,
       v_existing.expected_currency, v_existing.status,
       v_existing.approved_by, v_existing.approved_at, v_uid, now(),
       p_master_material_id, p_conversion_factor, v_unit, v_currency
     );
   END IF;
   INSERT INTO public.supplier_products (
     organization_id,supplier_id,supplier_sku,master_material_id,
     unit_factor,supplier_unit,expected_currency,status,approved_by,approved_at
   ) VALUES (
     p_organization_id,p_supplier_id,v_sku,p_master_material_id,
     p_conversion_factor,v_unit,v_currency,'approved',v_uid,now()
   )
   ON CONFLICT(organization_id,supplier_id,supplier_sku)
   DO UPDATE SET
     master_material_id=EXCLUDED.master_material_id,
     unit_factor=EXCLUDED.unit_factor,
     supplier_unit=EXCLUDED.supplier_unit,
     expected_currency=EXCLUDED.expected_currency,
     status='approved',approved_by=EXCLUDED.approved_by,
     approved_at=EXCLUDED.approved_at
   RETURNING id INTO v_id;
 END IF;

 -- DO NOT claim 'mapped': observation does not exist yet.
 -- Rows return to 'raw' for the existing homologation worker.
 WITH changed AS (
  UPDATE public.price_import_rows r
  SET processing_status='raw',validation_errors=ARRAY[]::text[]
  FROM public.price_import_batches b
  WHERE b.id=r.batch_id AND b.organization_id=p_organization_id
    AND b.supplier_id=p_supplier_id AND b.status='raw_ready'
    AND r.organization_id=p_organization_id
    AND r.processing_status='pending_mapping' AND r.supplier_sku=v_sku
    AND r.supplier_unit=v_unit AND r.source_currency=v_currency
  RETURNING r.batch_id
 )
 SELECT count(*) INTO v_count FROM changed;

 RETURN QUERY SELECT v_id,v_count;
END
$rpc$;
REVOKE ALL ON FUNCTION public.approve_supplier_mapping(uuid,uuid,text,uuid,numeric)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.approve_supplier_mapping(uuid,uuid,text,uuid,numeric)
 TO authenticated;
COMMIT;
