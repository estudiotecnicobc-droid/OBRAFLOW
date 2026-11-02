-- Concurrencia de approve_supplier_mapping: datos COMMITTED (la base es descartable) para que dos
-- sesiones psql paralelas (06c) aprueben el mismo SKU a la vez. 06d verifica. Prefijo de ids: 0c.
\set ON_ERROR_STOP 1
begin;
insert into auth.users (id) values ('0c000000-0000-0000-0000-00000000aaaa'), ('0c000000-0000-0000-0000-00000000aaa2');
insert into public.organizations (id, name) values ('0c000000-0000-0000-0000-000000000001', 'Org C');
insert into public.organization_members (organization_id, user_id, role) values
  ('0c000000-0000-0000-0000-000000000001', '0c000000-0000-0000-0000-00000000aaaa', 'owner'),
  ('0c000000-0000-0000-0000-000000000001', '0c000000-0000-0000-0000-00000000aaa2', 'editor');
insert into public.master_materials (id, organization_id, name, unit, unit_price, currency)
  values ('0c000000-0000-0000-0000-000000000003', '0c000000-0000-0000-0000-000000000001', 'Cemento', 'bolsa', 1000, 'ARS');
insert into public.price_suppliers (id, organization_id, name, external_code)
  values ('0c000000-0000-0000-0000-000000000004', '0c000000-0000-0000-0000-000000000001', 'Corralón', 'C1');
insert into storage.buckets (id, name) values ('price_imports', 'price_imports') on conflict do nothing;
-- Lote con 3 filas del mismo SKU en pending_mapping (sin pasar por la cola: INSERT directo como superusuario).
insert into public.price_import_batches (id, organization_id, created_by, storage_path, storage_object_id, source_format, size_bytes, status,
    supplier_id, column_mapping, observation_date, header_cells)
  values ('0c000000-0000-0000-0000-000000000006', '0c000000-0000-0000-0000-000000000001', '0c000000-0000-0000-0000-00000000aaaa',
    '0c000000-0000-0000-0000-000000000001/0c000000-0000-0000-0000-000000000004/conc.csv', '0c000000-0000-0000-0000-00000000f006', 'csv', 100, 'raw_ready',
    '0c000000-0000-0000-0000-000000000004', '{"sku":0,"description":1,"price":2,"unit":3,"currency":4}', current_date,
    '["sku","desc","precio","unidad","moneda"]');
insert into public.price_import_rows (batch_id, organization_id, row_number, raw_cells, processing_status, supplier_sku, supplier_unit, source_currency, validation_errors)
select '0c000000-0000-0000-0000-000000000006', '0c000000-0000-0000-0000-000000000001', n,
       jsonb_build_array('SKU-C', 'Cemento', (1000 + n)::text, 'bolsa', 'ARS'), 'pending_mapping', 'SKU-C', 'bolsa', 'ARS', array['SKU_MAPPING_REQUIRED']
from generate_series(1, 3) n;
commit;
