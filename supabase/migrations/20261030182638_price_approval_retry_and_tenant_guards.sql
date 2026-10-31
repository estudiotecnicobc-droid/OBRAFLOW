BEGIN;
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
 -- Require unique source unit/currency across outstanding rows.
 -- Any ambiguity is kept pending for explicit batch-specific handling.
 SELECT MIN(r.supplier_unit), MIN(r.source_currency)
 INTO v_unit,v_currency
 FROM public.price_import_rows r
 JOIN public.price_import_batches b ON b.id=r.batch_id
 WHERE r.organization_id=p_organization_id
   AND b.supplier_id=p_supplier_id
   AND b.status='raw_ready'
   AND r.processing_status='pending_mapping'
   AND r.supplier_sku=v_sku;

 -- An identical retry after requeue/homologation preserves the human decision.
 IF v_unit IS NULL AND NOT EXISTS (
      SELECT 1 FROM public.price_import_rows r
      JOIN public.price_import_batches b ON b.id=r.batch_id
      WHERE r.organization_id=p_organization_id AND b.supplier_id=p_supplier_id
        AND b.status='raw_ready' AND r.processing_status='pending_mapping'
        AND r.supplier_sku=v_sku
    ) AND v_existing.id IS NOT NULL
    AND v_existing.status='approved'
    AND v_existing.master_material_id=p_master_material_id
    AND v_existing.unit_factor=p_conversion_factor THEN
   RETURN QUERY SELECT v_existing.id,0::bigint;
   RETURN;
 END IF;
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

 IF v_existing.id IS NOT NULL AND EXISTS (
   SELECT 1 FROM public.price_observations o
   WHERE o.supplier_product_id=v_existing.id
 ) AND (
   v_existing.master_material_id<>p_master_material_id OR
   v_existing.unit_factor<>p_conversion_factor OR
   v_existing.supplier_unit<>v_unit OR v_existing.expected_currency<>v_currency
 ) THEN
   RAISE EXCEPTION 'HISTORICAL_MAPPING_IMMUTABLE' USING ERRCODE='23505';
 END IF;

 IF v_existing.id IS NOT NULL AND v_existing.status='approved'
    AND v_existing.master_material_id=p_master_material_id
    AND v_existing.unit_factor=p_conversion_factor
    AND v_existing.supplier_unit=v_unit
    AND v_existing.expected_currency=v_currency THEN
   v_id:=v_existing.id;
 ELSE
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

 -- Outbox-style durable trigger for a separate homologation poller:
 -- raw_ready batches with status raw are queryable even on worker failure.
 RETURN QUERY SELECT v_id,v_count;
END
$rpc$;
REVOKE ALL ON FUNCTION public.approve_supplier_mapping(uuid,uuid,text,uuid,numeric)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.approve_supplier_mapping(uuid,uuid,text,uuid,numeric)
 TO authenticated;
DROP POLICY IF EXISTS project_price_overrides_read ON public.project_price_overrides;
CREATE POLICY project_price_overrides_read ON public.project_price_overrides
FOR SELECT TO authenticated USING (
 public.is_org_member(project_price_overrides.organization_id)
 AND EXISTS (SELECT 1 FROM public.projects p
   WHERE p.id=project_price_overrides.project_id
     AND p.organization_id=project_price_overrides.organization_id)
);
DROP POLICY IF EXISTS project_price_overrides_insert ON public.project_price_overrides;
CREATE POLICY project_price_overrides_insert ON public.project_price_overrides
FOR INSERT TO authenticated WITH CHECK (
 project_price_overrides.created_by=(SELECT auth.uid())
 AND public.is_org_member_with_role(project_price_overrides.organization_id,
   ARRAY['owner','admin','editor']::text[])
 AND EXISTS (SELECT 1 FROM public.projects p
   WHERE p.id=project_price_overrides.project_id
     AND p.organization_id=project_price_overrides.organization_id)
 AND (
   (target_kind='MASTER_MATERIAL' AND EXISTS (
     SELECT 1 FROM public.master_materials m WHERE m.id=project_price_overrides.target_id
       AND m.is_active AND (m.organization_id IS NULL
         OR m.organization_id=project_price_overrides.organization_id::text)))
   OR (target_kind='RESOURCE' AND EXISTS (
     SELECT 1 FROM public.resources r WHERE r.id=project_price_overrides.target_id
       AND r.is_active AND (r.organization_id IS NULL
         OR r.organization_id=project_price_overrides.organization_id)))
   OR (target_kind='COMPONENT' AND EXISTS (
     SELECT 1 FROM public.master_task_materials c
     JOIN public.master_tasks mt ON mt.id=c.master_task_id
     WHERE c.id=project_price_overrides.target_id AND (mt.organization_id IS NULL
       OR mt.organization_id=project_price_overrides.organization_id)))
 )
);

-- Restrictive guards also constrain any permissive policy added elsewhere.
CREATE POLICY budget_versions_project_read_guard ON public.budget_versions
AS RESTRICTIVE FOR SELECT TO authenticated USING (
 EXISTS (SELECT 1 FROM public.projects p WHERE p.id=budget_versions.project_id
   AND p.organization_id=budget_versions.organization_id)
);
CREATE POLICY budget_versions_project_insert_guard ON public.budget_versions
AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (
 budget_versions.created_by=(SELECT auth.uid())
 AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id=budget_versions.project_id
   AND p.organization_id=budget_versions.organization_id)
);
CREATE POLICY budget_versions_project_delete_guard ON public.budget_versions
AS RESTRICTIVE FOR DELETE TO authenticated USING (
 EXISTS (SELECT 1 FROM public.projects p WHERE p.id=budget_versions.project_id
   AND p.organization_id=budget_versions.organization_id)
);
COMMIT;

