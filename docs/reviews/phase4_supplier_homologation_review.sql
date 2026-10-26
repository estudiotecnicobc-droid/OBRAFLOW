-- ObraFlow Fase 4 — staging y homologacion (REVIEW ONLY)
-- Dependencia: tablas price_import_batches/price_import_rows de fase 3,
-- con procesamiento_status aceptando pending_mapping, mapped e invalid.
-- La migracion de Fase 3 debe normalizarse a bucket price_imports/CSV.
BEGIN;

-- El registro de proveedor es por organizacion, NO global.
CREATE TABLE IF NOT EXISTS public.price_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 200),
  external_code text NOT NULL CHECK (length(trim(external_code)) BETWEEN 1 AND 100),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,external_code),
  UNIQUE (organization_id,id)
);

-- Alias homologado a un material de la misma organizacion o global.
-- La decision humana se valida en la BD, no solo en la UI.
CREATE TABLE IF NOT EXISTS public.supplier_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  supplier_sku text NOT NULL CHECK (length(trim(supplier_sku)) BETWEEN 1 AND 200),
  supplier_description text,
  master_material_id uuid NOT NULL REFERENCES public.master_materials(id),
  -- 1 unidad comercial = unit_factor unidades tecnicas de master_materials.unit
  unit_factor numeric(20,8) NOT NULL CHECK (unit_factor > 0),
  supplier_unit text NOT NULL CHECK (length(trim(supplier_unit)) > 0),
  expected_currency text NOT NULL CHECK (expected_currency IN ('ARS','USD')),
  status text NOT NULL DEFAULT 'approved'
    CHECK (status IN ('approved','disabled')),
  approved_by uuid NOT NULL REFERENCES auth.users(id),
  approved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,supplier_id,supplier_sku),
  UNIQUE (organization_id,id),
  FOREIGN KEY (organization_id,supplier_id)
    REFERENCES public.price_suppliers(organization_id,id)
);

CREATE TABLE IF NOT EXISTS public.price_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  supplier_product_id uuid NOT NULL,
  master_material_id uuid NOT NULL REFERENCES public.master_materials(id),
  batch_id uuid NOT NULL,
  row_number bigint NOT NULL,
  supplier_sku text NOT NULL,
  original_price numeric(20,6) NOT NULL CHECK (original_price > 0),
  original_unit text NOT NULL,
  unit_factor numeric(20,8) NOT NULL CHECK (unit_factor > 0),
  normalized_price numeric(24,8) NOT NULL CHECK (normalized_price > 0),
  currency text NOT NULL CHECK (currency IN ('ARS','USD')),
  observed_on date NOT NULL,
  raw_cells jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- un mismo lote/fila se ingiere una sola vez por reintento.
  UNIQUE (batch_id,row_number),
  FOREIGN KEY (organization_id,supplier_id)
    REFERENCES public.price_suppliers(organization_id,id),
  FOREIGN KEY (organization_id,supplier_product_id)
    REFERENCES public.supplier_products(organization_id,id),
  FOREIGN KEY (batch_id,row_number)
    REFERENCES public.price_import_rows(batch_id,row_number),
  FOREIGN KEY (organization_id,batch_id)
    REFERENCES public.price_import_batches(organization_id,id)
);
CREATE INDEX IF NOT EXISTS price_obs_master_latest_idx
 ON public.price_observations(organization_id,master_material_id,observed_on DESC,created_at DESC);
CREATE INDEX IF NOT EXISTS price_obs_supplier_idx
 ON public.price_observations(organization_id,supplier_id,observed_on DESC);

-- Columnas de contexto y mapeo de CSV aprobado por un operador.
ALTER TABLE public.price_import_batches
  ADD COLUMN IF NOT EXISTS supplier_id uuid,
  ADD COLUMN IF NOT EXISTS column_mapping jsonb,
  ADD COLUMN IF NOT EXISTS observation_date date;
ALTER TABLE public.price_import_batches
  ADD CONSTRAINT price_batches_supplier_tenant_fk
  FOREIGN KEY (organization_id,supplier_id)
  REFERENCES public.price_suppliers(organization_id,id);

ALTER TABLE public.price_import_rows
  DROP CONSTRAINT IF EXISTS price_import_rows_processing_status_check;
ALTER TABLE public.price_import_rows
  ADD CONSTRAINT price_import_rows_processing_status_check
  CHECK (processing_status IN ('raw','pending_mapping','mapped','invalid'));

CREATE INDEX IF NOT EXISTS price_import_rows_pending_mapping_idx
 ON public.price_import_rows(organization_id,batch_id,row_number)
 WHERE processing_status='pending_mapping';

-- Un mismo master material puede ser global o del tenant, nunca otro tenant.
CREATE OR REPLACE FUNCTION public.price_check_supplier_mapping()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM public.master_materials m
   WHERE m.id=NEW.master_material_id AND m.is_active
     AND (m.organization_id IS NULL
       OR m.organization_id = NEW.organization_id::text)
 ) THEN
   RAISE EXCEPTION 'Unapproved cross-organization material mapping'
     USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS supplier_product_validate_material
 ON public.supplier_products;
CREATE TRIGGER supplier_product_validate_material
 BEFORE INSERT OR UPDATE OF master_material_id,organization_id
 ON public.supplier_products
 FOR EACH ROW EXECUTE FUNCTION public.price_check_supplier_mapping();

ALTER TABLE public.price_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.price_suppliers,public.supplier_products,
 public.price_observations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.price_suppliers,public.supplier_products,
 public.price_observations TO authenticated;
GRANT INSERT,UPDATE ON public.price_suppliers,public.supplier_products
 TO authenticated;

DROP POLICY IF EXISTS price_suppliers_read ON public.price_suppliers;
CREATE POLICY price_suppliers_read ON public.price_suppliers
 FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS price_suppliers_write ON public.price_suppliers;
CREATE POLICY price_suppliers_write ON public.price_suppliers
 FOR ALL TO authenticated
 USING (public.is_org_member_with_role(organization_id,ARRAY['owner','admin','editor']::text[]))
 WITH CHECK (public.is_org_member_with_role(organization_id,ARRAY['owner','admin','editor']::text[]));

DROP POLICY IF EXISTS supplier_products_read ON public.supplier_products;
CREATE POLICY supplier_products_read ON public.supplier_products
 FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
DROP POLICY IF EXISTS supplier_products_insert ON public.supplier_products;
CREATE POLICY supplier_products_insert ON public.supplier_products
 FOR INSERT TO authenticated WITH CHECK (
   approved_by=(SELECT auth.uid())
   AND public.is_org_member_with_role(organization_id,ARRAY['owner','admin','editor']::text[])
 );
DROP POLICY IF EXISTS supplier_products_update ON public.supplier_products;
CREATE POLICY supplier_products_update ON public.supplier_products
 FOR UPDATE TO authenticated
 USING (public.is_org_member_with_role(organization_id,ARRAY['owner','admin','editor']::text[]))
 WITH CHECK (public.is_org_member_with_role(organization_id,ARRAY['owner','admin','editor']::text[]));

DROP POLICY IF EXISTS price_observations_read ON public.price_observations;
CREATE POLICY price_observations_read ON public.price_observations
 FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
-- Escribir observaciones exclusivamente desde el worker autorizado.

-- Worker-only: procesa en lotes tras raw_ready, con mapping explicito:
-- {"sku":0,"description":1,"price":2,"unit":3,"currency":4}
-- Indices son cero-based, validados. No se invoca desde el navegador.
CREATE OR REPLACE FUNCTION public.homologate_raw_price_rows(
  p_batch_id uuid,p_limit integer DEFAULT 250
)
RETURNS TABLE(processed integer,mapped integer,pending integer,invalid integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public
AS $fn$
DECLARE
 b public.price_import_batches%ROWTYPE;
 r record;
 sku text; unit_text text; curr text; price_text text;
 parsed_price numeric;
 mapping public.supplier_products%ROWTYPE;
 n_processed integer:=0; n_mapped integer:=0;
 n_pending integer:=0; n_invalid integer:=0;
 cols jsonb;
 BEGIN
 SELECT * INTO b FROM public.price_import_batches
 WHERE id=p_batch_id FOR UPDATE;
 IF NOT FOUND OR b.status <> 'raw_ready'
   OR b.supplier_id IS NULL OR b.column_mapping IS NULL
   OR b.observation_date IS NULL THEN
   RAISE EXCEPTION 'Batch not ready or mapping configuration missing'
     USING ERRCODE='22023';
 END IF;
 cols := b.column_mapping;
 IF NOT (cols ?& ARRAY['sku','price','unit','currency'])
   OR EXISTS (
      SELECT 1 FROM jsonb_each_text(cols) c
      WHERE c.key IN ('sku','price','unit','currency')
        AND (c.value !~ '^[0-9]{1,2}$'
          OR c.value::integer >= jsonb_array_length(b.header_cells))
   ) THEN
   RAISE EXCEPTION 'Invalid CSV column mapping' USING ERRCODE='22023';
 END IF;
 IF p_limit NOT BETWEEN 1 AND 500 THEN
   RAISE EXCEPTION 'Invalid processing limit' USING ERRCODE='22023';
 END IF;

 FOR r IN SELECT ir.row_number,ir.raw_cells
   FROM public.price_import_rows ir
   WHERE ir.batch_id=p_batch_id
     AND ir.organization_id=b.organization_id
     AND ir.processing_status='raw'
   ORDER BY ir.row_number FOR UPDATE SKIP LOCKED LIMIT p_limit
 LOOP
   n_processed:=n_processed+1;
   sku:=nullif(btrim(r.raw_cells->>(cols->>'sku')::integer),'');
   unit_text:=nullif(btrim(r.raw_cells->>(cols->>'unit')::integer),'');
   curr:=upper(btrim(coalesce(r.raw_cells->>(cols->>'currency')::integer,'')));
   price_text:=btrim(coalesce(r.raw_cells->>(cols->>'price')::integer,''));
   -- Decimal canónico: punto decimal, sin separadores de millares.
   IF sku IS NULL OR unit_text IS NULL
      OR curr NOT IN ('ARS','USD')
      OR price_text !~ '^[0-9]{1,12}([.][0-9]{1,6})?$'
      OR length(sku)>200 THEN
     UPDATE public.price_import_rows
       SET processing_status='invalid',
           validation_errors=ARRAY['INVALID_RAW_PRICE_FIELDS']
       WHERE batch_id=p_batch_id AND row_number=r.row_number;
     n_invalid:=n_invalid+1;
     CONTINUE;
   END IF;
   parsed_price:=price_text::numeric;
   IF parsed_price<=0 THEN
     UPDATE public.price_import_rows SET processing_status='invalid',
       validation_errors=ARRAY['NON_POSITIVE_PRICE']
     WHERE batch_id=p_batch_id AND row_number=r.row_number;
     n_invalid:=n_invalid+1;
     CONTINUE;
   END IF;

   SELECT * INTO mapping FROM public.supplier_products sp
   WHERE sp.organization_id=b.organization_id
     AND sp.supplier_id=b.supplier_id
     AND sp.supplier_sku=sku
     AND sp.status='approved';
   IF NOT FOUND THEN
     UPDATE public.price_import_rows SET processing_status='pending_mapping',
       validation_errors=ARRAY['SKU_MAPPING_REQUIRED']
     WHERE batch_id=p_batch_id AND row_number=r.row_number;
     n_pending:=n_pending+1;
     CONTINUE;
   END IF;
   IF mapping.supplier_unit<>unit_text
      OR mapping.expected_currency<>curr THEN
     UPDATE public.price_import_rows SET processing_status='pending_mapping',
       validation_errors=ARRAY['UNIT_OR_CURRENCY_MISMATCH']
     WHERE batch_id=p_batch_id AND row_number=r.row_number;
     n_pending:=n_pending+1;
     CONTINUE;
   END IF;

   INSERT INTO public.price_observations(
     organization_id,supplier_id,supplier_product_id,master_material_id,
     batch_id,row_number,supplier_sku,original_price,original_unit,
     unit_factor,normalized_price,currency,observed_on,raw_cells
   ) VALUES (
     b.organization_id,b.supplier_id,mapping.id,mapping.master_material_id,
     b.id,r.row_number,sku,parsed_price,unit_text,
     mapping.unit_factor,parsed_price/mapping.unit_factor,
     curr,b.observation_date,r.raw_cells
   ) ON CONFLICT(batch_id,row_number) DO NOTHING;
   UPDATE public.price_import_rows SET processing_status='mapped',
     validation_errors=ARRAY[]::text[]
   WHERE batch_id=p_batch_id AND row_number=r.row_number;
   n_mapped:=n_mapped+1;
 END LOOP;
 RETURN QUERY SELECT n_processed,n_mapped,n_pending,n_invalid;
END
$fn$;
REVOKE ALL ON FUNCTION public.homologate_raw_price_rows(uuid,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.homologate_raw_price_rows(uuid,integer)
 TO service_role;


-- Operador configura columnas y proveedor tras terminar la ingesta cruda.
CREATE OR REPLACE FUNCTION public.configure_price_import_mapping(
 p_batch_id uuid, p_supplier_id uuid, p_columns jsonb, p_observed_on date
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $cfg$
DECLARE v_batch public.price_import_batches%ROWTYPE;
BEGIN
 SELECT * INTO v_batch FROM public.price_import_batches
 WHERE id=p_batch_id FOR UPDATE;
 IF NOT FOUND OR v_batch.status<>'raw_ready'
    OR NOT public.is_org_member_with_role(
      v_batch.organization_id,ARRAY['owner','admin','editor']::text[])
    OR NOT EXISTS(
      SELECT 1 FROM public.price_suppliers s
      WHERE s.id=p_supplier_id
        AND s.organization_id=v_batch.organization_id AND s.is_active
    ) THEN
    RAISE EXCEPTION 'FORBIDDEN or batch not ready' USING ERRCODE='42501';
 END IF;
 IF p_observed_on IS NULL OR p_observed_on > current_date
    OR jsonb_typeof(p_columns)<>'object'
    OR NOT p_columns ?& ARRAY['sku','price','unit','currency'] THEN
   RAISE EXCEPTION 'Invalid mapping configuration' USING ERRCODE='22023';
 END IF;
 UPDATE public.price_import_batches
 SET supplier_id=p_supplier_id,column_mapping=p_columns,
     observation_date=p_observed_on,updated_at=now()
 WHERE id=p_batch_id;
END $cfg$;
REVOKE ALL ON FUNCTION public.configure_price_import_mapping(
 uuid,uuid,jsonb,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.configure_price_import_mapping(
 uuid,uuid,jsonb,date) TO authenticated;

-- Tras aprobar nuevos SKU, reintentar solo filas pendientes sin
-- reprocesar todos los registros ya homologados.
CREATE OR REPLACE FUNCTION public.requeue_pending_price_mappings(
 p_batch_id uuid
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $retry$
DECLARE v_org uuid; v_count integer;
BEGIN
 SELECT organization_id INTO v_org
 FROM public.price_import_batches WHERE id=p_batch_id AND status='raw_ready';
 IF v_org IS NULL OR NOT public.is_org_member_with_role(
    v_org,ARRAY['owner','admin','editor']::text[]) THEN
   RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 UPDATE public.price_import_rows
 SET processing_status='raw',validation_errors=ARRAY[]::text[]
 WHERE batch_id=p_batch_id AND processing_status='pending_mapping';
 GET DIAGNOSTICS v_count=ROW_COUNT;
 RETURN v_count;
END $retry$;
REVOKE ALL ON FUNCTION public.requeue_pending_price_mappings(uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.requeue_pending_price_mappings(uuid)
 TO authenticated;

COMMIT;
