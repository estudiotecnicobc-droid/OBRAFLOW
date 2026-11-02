-- approve_supplier_mapping trazable (20261102100010): H1 inmutable con historial, H2 bloqueado con
-- filas raw, re-decisión sin historial ni raw deja rastro en supplier_product_mapping_history.
-- Transacción revertida.
\set ON_ERROR_STOP 1
begin;

insert into auth.users (id) values ('00000000-0000-0000-0000-00000000aaaa'), ('00000000-0000-0000-0000-00000000cccc');
insert into public.organizations (id, name) values ('10000000-0000-0000-0000-000000000001', 'Org A');
insert into public.organization_members (organization_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000aaaa', 'owner'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000cccc', 'editor');
insert into public.master_materials (id, organization_id, name, unit, unit_price) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Cemento', 'bolsa', 1000),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Cal', 'bolsa', 600);
insert into public.price_suppliers (id, organization_id, name, external_code)
  values ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Corralón', 'C1');
insert into storage.buckets (id, name) values ('price_imports', 'price_imports') on conflict do nothing;
insert into public.price_import_batches (id, organization_id, created_by, storage_path, storage_object_id, source_format, size_bytes, status, supplier_id)
  values ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000aaaa',
          '10000000-0000-0000-0000-000000000001/lote.csv', '60000000-0000-0000-0000-00000000f001', 'csv', 10, 'raw_ready',
          '40000000-0000-0000-0000-000000000001');
insert into public.price_import_rows (batch_id, organization_id, row_number, raw_cells, processing_status, supplier_sku, supplier_unit, source_currency) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1, '[]', 'pending_mapping', 'X', 'bolsa', 'ARS'),
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 3, '[]', 'pending_mapping', 'Y', 'bolsa', 'ARS');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aaaa';
set local request.jwt.claim.role = 'authenticated';
do $$
declare a record; b record;
begin
  select * into a from public.approve_supplier_mapping('10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001', 'X', '30000000-0000-0000-0000-000000000001', 1);
  if a.queued_rows <> 1 then raise exception 'aprobación inicial: %', a; end if;
  perform set_config('precios.map_x', a.mapping_id::text, true);
  -- H2: fila X en 'raw' (aprobada, no homologada) → no se cambia la decisión
  begin
    perform public.approve_supplier_mapping('10000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001', 'X', '30000000-0000-0000-0000-000000000002', 1);
    raise exception 'H2 no bloqueó';
  exception when unique_violation then
    if sqlerrm <> 'MAPPING_CHANGE_BLOCKED_PENDING_ROWS' then raise; end if;
  end;
  if (select master_material_id from public.supplier_products where id = a.mapping_id) <> '30000000-0000-0000-0000-000000000001' then
    raise exception 'H2 pisó la equivalencia';
  end if;
  -- reintento idéntico con fila raw: devuelve la misma equivalencia
  select * into b from public.approve_supplier_mapping('10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001', 'X', '30000000-0000-0000-0000-000000000001', 1);
  if b.mapping_id <> a.mapping_id or b.queued_rows <> 0 then raise exception 'reintento idéntico: %', b; end if;
  raise notice 'H2 OK (MAPPING_CHANGE_BLOCKED_PENDING_ROWS, reintento idéntico idempotente)';
end $$;

-- Homologación simulada: la fila X pasa a mapped con una observación (historial)
reset role;
update public.price_import_rows set processing_status = 'mapped' where batch_id = '60000000-0000-0000-0000-000000000001' and row_number = 1;
insert into public.price_observations (organization_id, supplier_id, supplier_product_id, master_material_id, batch_id, row_number,
  supplier_sku, original_price, original_unit, unit_factor, normalized_price, currency, observed_on, raw_cells)
values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', current_setting('precios.map_x')::uuid,
  '30000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 1, 'X', 1000, 'bolsa', 1, 1000, 'ARS', current_date, '[]');
-- Nueva fila pendiente de X con otra unidad: antes la guarda de ambigüedad tapaba el motivo real
insert into public.price_import_rows (batch_id, organization_id, row_number, raw_cells, processing_status, supplier_sku, supplier_unit, source_currency)
  values ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 2, '[]', 'pending_mapping', 'X', 'kg', 'ARS');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aaaa';
set local request.jwt.claim.role = 'authenticated';
do $$
begin
  -- H1: con historial, cualquier cambio (material, factor o unidad de las filas) es inmutable
  begin
    perform public.approve_supplier_mapping('10000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001', 'X', '30000000-0000-0000-0000-000000000002', 1);
    raise exception 'H1 no bloqueó';
  exception when unique_violation then
    if sqlerrm <> 'HISTORICAL_MAPPING_IMMUTABLE' then raise; end if;
  end;
  begin
    perform public.approve_supplier_mapping('10000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001', 'X', '30000000-0000-0000-0000-000000000001', 1);
    raise exception 'H1 (unidad distinta en filas pendientes) no bloqueó';
  exception when unique_violation then
    if sqlerrm <> 'HISTORICAL_MAPPING_IMMUTABLE' then raise; end if;
  end;
  if (select count(*) from public.supplier_product_mapping_history) <> 0 then raise exception 'H1 dejó historia'; end if;
  raise notice 'H1 OK (HISTORICAL_MAPPING_IMMUTABLE antes que la guarda de ambigüedad)';
end $$;

-- Re-decisión permitida: Y aprobada por A, sin historial y sin filas raw; C (editor) la cambia
do $$
declare a record;
begin
  select * into a from public.approve_supplier_mapping('10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001', 'Y', '30000000-0000-0000-0000-000000000001', 1);
  if a.queued_rows <> 1 then raise exception 'aprobación Y: %', a; end if;
  perform set_config('precios.map_y', a.mapping_id::text, true);
end $$;
reset role;
update public.price_import_rows set processing_status = 'invalid' where batch_id = '60000000-0000-0000-0000-000000000001' and row_number = 3;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000cccc';
set local request.jwt.claim.role = 'authenticated';
do $$
declare a record; b record; h record; v_map uuid := current_setting('precios.map_y')::uuid;
begin
  select * into a from public.approve_supplier_mapping('10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001', 'Y', '30000000-0000-0000-0000-000000000002', 2);
  if a.mapping_id <> v_map or a.queued_rows <> 0 then raise exception 're-decisión: %', a; end if;
  select * into b from public.supplier_products where id = v_map;
  if b.master_material_id <> '30000000-0000-0000-0000-000000000002' or b.unit_factor <> 2
     or b.approved_by <> '00000000-0000-0000-0000-00000000cccc' or b.supplier_unit <> 'bolsa' then
    raise exception 're-decisión no aplicada: % % %', b.master_material_id, b.unit_factor, b.approved_by;
  end if;
  select * into h from public.supplier_product_mapping_history where supplier_product_id = v_map;
  if h.id is null or h.master_material_id <> '30000000-0000-0000-0000-000000000001' or h.unit_factor <> 1
     or h.approved_by <> '00000000-0000-0000-0000-00000000aaaa' or h.replaced_by <> '00000000-0000-0000-0000-00000000cccc'
     or h.new_master_material_id <> '30000000-0000-0000-0000-000000000002' or h.new_unit_factor <> 2 then
    raise exception 'historia incorrecta: %', h;
  end if;
  -- reintento idéntico de la nueva decisión: sin nueva historia
  select * into a from public.approve_supplier_mapping('10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001', 'Y', '30000000-0000-0000-0000-000000000002', 2);
  if a.mapping_id <> v_map or (select count(*) from public.supplier_product_mapping_history) <> 1 then
    raise exception 'reintento generó historia';
  end if;
  -- la historia no se escribe a mano
  begin
    insert into public.supplier_product_mapping_history (organization_id, supplier_product_id, supplier_id, supplier_sku, master_material_id,
      unit_factor, supplier_unit, expected_currency, status, approved_by, approved_at, replaced_by, new_master_material_id, new_unit_factor,
      new_supplier_unit, new_expected_currency)
    values ('10000000-0000-0000-0000-000000000001', v_map, '40000000-0000-0000-0000-000000000001', 'Y', '30000000-0000-0000-0000-000000000001',
      1, 'bolsa', 'ARS', 'approved', auth.uid(), now(), auth.uid(), '30000000-0000-0000-0000-000000000002', 2, 'bolsa', 'ARS');
    raise exception 'INSERT directo en la historia no falló';
  exception when insufficient_privilege then null;
  end;
  raise notice 're-decisión OK (sin historial ni raw: permitida, aprobador original en supplier_product_mapping_history, INSERT directo 42501)';
end $$;

rollback;
