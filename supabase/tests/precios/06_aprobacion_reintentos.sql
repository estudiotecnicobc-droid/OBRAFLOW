-- approve_supplier_mapping (20261102100007 + 100010): idempotencia, preservación del aprobador original,
-- conflicto de mapeo (H1), re-decisión bloqueada con filas raw (H2) y re-decisión trazable. Transacción revertida.
-- La concurrencia real (dos sesiones) se prueba desde run.sh con 06b/06c/06d.
\set ON_ERROR_STOP 1
begin;

insert into auth.users (id) values ('00000000-0000-0000-0000-00000000aaaa'), ('00000000-0000-0000-0000-00000000aaa2');
insert into public.organizations (id, name) values ('10000000-0000-0000-0000-000000000001', 'Org A');
insert into public.organization_members (organization_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000aaaa', 'owner'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000aaa2', 'editor');
insert into public.master_materials (id, organization_id, name, unit, unit_price, currency) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Cemento', 'bolsa', 1000, 'ARS'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Cal', 'bolsa', 600, 'ARS');
insert into public.price_suppliers (id, organization_id, name, external_code) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Corralón 1', 'C1');
insert into storage.buckets (id, name) values ('price_imports', 'price_imports') on conflict do nothing;

-- Mismo helper que 05_circuito: lote CSV completo hasta la primera homologación (superusuario).
create function pg_temp.ingest_csv(p_org uuid, p_uid uuid, p_sup uuid, p_file text, p_rows jsonb, p_observed date)
returns uuid language plpgsql as $$
declare v_path text := p_org::text || '/' || p_sup::text || '/' || p_file; v_batch uuid; v_msg record; v_claimed record; v_h record;
begin
  insert into storage.objects (id, bucket_id, name, metadata)
    values (gen_random_uuid(), 'price_imports', v_path, '{"size": "100", "mimetype": "text/csv"}');
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  v_batch := public.enqueue_price_import(p_org, v_path);
  select * into v_msg from public.price_import_poll();
  select * into v_claimed from public.price_import_claim(v_batch, v_msg.msg_id);
  perform public.price_import_commit_chunk(v_batch, v_claimed.lease_token, v_msg.msg_id, p_rows, 100, true,
    '["sku","desc","precio","unidad","moneda"]'::jsonb, ',');
  perform public.configure_price_import_mapping(v_batch, p_sup,
    '{"sku":0,"description":1,"price":2,"unit":3,"currency":4}'::jsonb, p_observed);
  select * into v_h from public.homologate_raw_price_rows(v_batch);
  if v_h.invalid <> 0 then raise exception 'homologación del lote %: %', p_file, v_h; end if;
  return v_batch;
end $$;

-- Lote 1: SKU-X dos veces (dos filas, misma unidad/moneda) y SKU-Y.
reset role;
select set_config('precios.b1', pg_temp.ingest_csv('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000aaaa',
  '40000000-0000-0000-0000-000000000001', 'lote1.csv',
  '[{"row_number":1,"raw_cells":["SKU-X","Cemento","1000","bolsa","ARS"]},
    {"row_number":2,"raw_cells":["SKU-X","Cemento oferta","950","bolsa","ARS"]},
    {"row_number":3,"raw_cells":["SKU-Y","Cal","500","bolsa","ARS"]}]'::jsonb, current_date - 1)::text, true);

-- --------------------------------------------------------------------------- 1. idempotencia (mismo usuario)
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aaaa';
set local request.jwt.claim.role = 'authenticated';
do $$
declare a record; b record; v_org uuid := '10000000-0000-0000-0000-000000000001'; s1 uuid := '40000000-0000-0000-0000-000000000001';
  m1 uuid := '30000000-0000-0000-0000-000000000001'; sp1 record; sp2 record;
begin
  select * into a from public.approve_supplier_mapping(v_org, s1, 'SKU-X', m1, 1);
  if a.queued_rows <> 2 then raise exception 'primera aprobación: %', a; end if;
  select * into sp1 from public.supplier_products where id = a.mapping_id;
  -- Reintento idéntico inmediato (las filas ya volvieron a raw, no hay pendientes)
  select * into b from public.approve_supplier_mapping(v_org, s1, 'SKU-X', m1, 1);
  if b.mapping_id <> a.mapping_id or b.queued_rows <> 0 then raise exception 'reintento idéntico: %', b; end if;
  select * into sp2 from public.supplier_products where id = a.mapping_id;
  if (select count(*) from public.supplier_products where supplier_sku = 'SKU-X') <> 1 then raise exception 'más de una fila para SKU-X'; end if;
  if sp2.approved_at <> sp1.approved_at or sp2.approved_by <> sp1.approved_by or sp2.approved_by <> '00000000-0000-0000-0000-00000000aaaa' then
    raise exception 'el reintento idéntico modificó approved_at/approved_by';
  end if;
  perform set_config('precios.sku_x', a.mapping_id::text, true);
  perform set_config('precios.sku_x_at', sp1.approved_at::text, true);
  raise notice 'idempotencia OK (dos llamadas idénticas → 1 fila, mismo mapping_id, approved_at/approved_by intactos, 2 filas reencoladas una sola vez)';
end $$;

-- Worker: homologa el lote 1 → 2 observaciones de SKU-X (historial) ; SKU-Y sigue pendiente
reset role;
do $$ declare r record; begin
  select * into r from public.homologate_raw_price_rows(current_setting('precios.b1')::uuid);
  if r.mapped <> 2 or (select count(*) from public.price_observations where supplier_sku = 'SKU-X') <> 2 then raise exception 'homologación: %', r; end if;
end $$;

-- --------------------------------------------------------------------------- 2. reintento idéntico por OTRO usuario (editor) tras homologar
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aaa2';
set local request.jwt.claim.role = 'authenticated';
do $$
declare b record; sp record;
begin
  select * into b from public.approve_supplier_mapping('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'SKU-X', '30000000-0000-0000-0000-000000000001', 1);
  select * into sp from public.supplier_products where id = b.mapping_id;
  if b.mapping_id <> current_setting('precios.sku_x')::uuid or b.queued_rows <> 0 then raise exception 'reintento por editor: %', b; end if;
  if sp.approved_by <> '00000000-0000-0000-0000-00000000aaaa' or sp.approved_at <> current_setting('precios.sku_x_at')::timestamptz then
    raise exception 'el reintento idéntico de otro usuario pisó al aprobador original: % %', sp.approved_by, sp.approved_at;
  end if;
  raise notice 'reintento por otro usuario OK (conserva approved_by = owner original y approved_at)';
end $$;

-- --------------------------------------------------------------------------- 3. conflicto de mapeo (mismo SKU → otro material)
do $$
declare v_org uuid := '10000000-0000-0000-0000-000000000001'; s1 uuid := '40000000-0000-0000-0000-000000000001';
  m2 uuid := '30000000-0000-0000-0000-000000000002'; v_state text; v_msg text;
begin
  -- 3a. Con historial (observaciones) y SIN filas pendientes → 23505 HISTORICAL_MAPPING_IMMUTABLE (H1, corregido en 100010:
  --     la guarda de inmutabilidad se evalúa antes que la de ambigüedad de unidad/moneda).
  begin
    perform public.approve_supplier_mapping(v_org, s1, 'SKU-X', m2, 1);
    raise exception 'conflicto sin pendientes aceptado';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
  end;
  if v_state <> '23505' or v_msg not like 'HISTORICAL_MAPPING_IMMUTABLE%' then
    raise exception 'conflicto sin pendientes: % % (se esperaba 23505 HISTORICAL_MAPPING_IMMUTABLE)', v_state, v_msg;
  end if;
  raise notice 'conflicto sin pendientes OK (23505 HISTORICAL_MAPPING_IMMUTABLE, H1 corregido)';
  if (select master_material_id from public.supplier_products where id = current_setting('precios.sku_x')::uuid) <> '30000000-0000-0000-0000-000000000001' then
    raise exception 'el conflicto modificó el mapeo histórico';
  end if;
end $$;

-- 3b. Con filas pendientes del SKU (lote 2: SKU-X en otra unidad → UNIT_OR_CURRENCY_MISMATCH) → 23505 HISTORICAL_MAPPING_IMMUTABLE
reset role;
select set_config('precios.b2', pg_temp.ingest_csv('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000aaaa',
  '40000000-0000-0000-0000-000000000001', 'lote2.csv',
  '[{"row_number":1,"raw_cells":["SKU-X","Cemento pallet","40000","pallet","ARS"]},
    {"row_number":2,"raw_cells":["SKU-Y","Cal","520","kg","ARS"]}]'::jsonb, current_date)::text, true);
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aaa2';
set local request.jwt.claim.role = 'authenticated';
do $$
declare v_org uuid := '10000000-0000-0000-0000-000000000001'; s1 uuid := '40000000-0000-0000-0000-000000000001';
begin
  if (select validation_errors from public.price_import_rows where batch_id = current_setting('precios.b2')::uuid and row_number = 1) <> array['UNIT_OR_CURRENCY_MISMATCH'] then
    raise exception 'la fila en pallet debía quedar pending por UNIT_OR_CURRENCY_MISMATCH';
  end if;
  -- otro material
  begin
    perform public.approve_supplier_mapping(v_org, s1, 'SKU-X', '30000000-0000-0000-0000-000000000002', 40);
    raise exception 'conflicto con pendientes aceptado';
  exception when unique_violation then
    if sqlerrm not like 'HISTORICAL_MAPPING_IMMUTABLE%' then raise; end if;
  end;
  -- mismo material pero otra unidad/factor: también inmutable
  begin
    perform public.approve_supplier_mapping(v_org, s1, 'SKU-X', '30000000-0000-0000-0000-000000000001', 40);
    raise exception 'cambio de factor con historial aceptado';
  exception when unique_violation then
    if sqlerrm not like 'HISTORICAL_MAPPING_IMMUTABLE%' then raise; end if;
  end;
  if (select count(*) from public.supplier_products where supplier_sku = 'SKU-X') <> 1
     or (select approved_by from public.supplier_products where supplier_sku = 'SKU-X') <> '00000000-0000-0000-0000-00000000aaaa' then
    raise exception 'el conflicto alteró supplier_products';
  end if;
  raise notice 'conflicto con pendientes OK (otro material o otro factor con historial → 23505 HISTORICAL_MAPPING_IMMUTABLE; mapeo intacto)';
end $$;

-- --------------------------------------------------------------------------- 4. re-decisión: bloqueada con filas raw (H2), trazable sin historial
-- SKU-Y quedó pendiente en dos unidades (bolsa en lote 1, kg en lote 2) → ambigua.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aaaa';
set local request.jwt.claim.role = 'authenticated';
do $$ begin
  begin
    perform public.approve_supplier_mapping('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'SKU-Y', '30000000-0000-0000-0000-000000000002', 1);
    raise exception 'SKU-Y ambiguo aceptado';
  exception when invalid_parameter_value then
    if sqlerrm not like 'AMBIGUOUS_SKU_UNIT_OR_CURRENCY%' then raise; end if;
  end;
  raise notice 'ambigüedad OK (SKU-Y pendiente en bolsa y en kg → 22023 AMBIGUOUS_SKU_UNIT_OR_CURRENCY)';
end $$;
-- El operador descarta la fila en kg (lote 2) y el owner aprueba SKU-Y en bolsa → Cal. La fila del lote 1 queda 'raw' (aprobada, no homologada).
reset role;
update public.price_import_rows set processing_status = 'invalid', validation_errors = array['DESCARTADA_QA']
  where batch_id = current_setting('precios.b2')::uuid and row_number = 2;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aaaa';
set local request.jwt.claim.role = 'authenticated';
do $$ declare a record; begin
  select * into a from public.approve_supplier_mapping('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'SKU-Y', '30000000-0000-0000-0000-000000000002', 1);
  if a.queued_rows <> 1 then raise exception 'SKU-Y owner: %', a; end if;
  perform set_config('precios.sku_y', a.mapping_id::text, true);
end $$;
-- Lote 3: SKU-Y en kg (pendiente por UNIT_OR_CURRENCY_MISMATCH). El editor intenta re-decidir SKU-Y → Cemento, factor 50
-- con la fila del lote 1 todavía en raw → 23505 MAPPING_CHANGE_BLOCKED_PENDING_ROWS (H2, corregido en 100010).
reset role;
select set_config('precios.b3', pg_temp.ingest_csv('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000aaaa',
  '40000000-0000-0000-0000-000000000001', 'lote3.csv',
  '[{"row_number":1,"raw_cells":["SKU-Y","Cemento a granel","20","kg","ARS"]}]'::jsonb, current_date)::text, true);
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aaa2';
set local request.jwt.claim.role = 'authenticated';
do $$ declare sp record; begin
  begin
    perform public.approve_supplier_mapping('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'SKU-Y', '30000000-0000-0000-0000-000000000001', 50);
    raise exception 're-decisión con filas raw aceptada';
  exception when unique_violation then
    if sqlerrm not like 'MAPPING_CHANGE_BLOCKED_PENDING_ROWS%' then raise; end if;
  end;
  select * into sp from public.supplier_products where id = current_setting('precios.sku_y')::uuid;
  if sp.master_material_id <> '30000000-0000-0000-0000-000000000002' or sp.approved_by <> '00000000-0000-0000-0000-00000000aaaa' or sp.supplier_unit <> 'bolsa' then
    raise exception 'la re-decisión bloqueada alteró la equivalencia: %', sp;
  end if;
  if exists (select 1 from public.supplier_product_mapping_history) then raise exception 'historial escrito en una re-decisión bloqueada'; end if;
  raise notice 're-decisión con filas raw OK (23505 MAPPING_CHANGE_BLOCKED_PENDING_ROWS; approved_by del owner intacto; sin historial)';
end $$;
-- Worker homologa el lote 1: la fila raw de SKU-Y (bolsa) crea la observación con la decisión del owner. Ahora SKU-Y tiene historial → H1.
reset role;
do $$ declare r record; begin
  select * into r from public.homologate_raw_price_rows(current_setting('precios.b1')::uuid);
  if r.processed <> 1 or r.mapped <> 1 or not exists (select 1 from public.price_observations where supplier_sku = 'SKU-Y' and normalized_price = 500) then
    raise exception 'lote 1 SKU-Y: %', r;
  end if;
end $$;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aaa2';
set local request.jwt.claim.role = 'authenticated';
do $$ begin
  begin
    perform public.approve_supplier_mapping('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'SKU-Y', '30000000-0000-0000-0000-000000000001', 50);
    raise exception 're-decisión con historial aceptada';
  exception when unique_violation then
    if sqlerrm not like 'HISTORICAL_MAPPING_IMMUTABLE%' then raise; end if;
  end;
  raise notice 'SKU-Y con historial OK (la fila kg del lote 3 sigue pendiente; re-decisión → 23505 HISTORICAL_MAPPING_IMMUTABLE)';
end $$;

-- --------------------------------------------------------------------------- 5. re-decisión permitida (SKU-Z: sin historial ni filas raw) → supplier_product_mapping_history
-- Lote 4: SKU-Z en bolsa. El owner aprueba SKU-Z → Cal (fila a raw). El operador descarta esa fila antes de homologar
-- (no hay observaciones ni filas raw). Lote 5: SKU-Z en kg, pendiente. El editor re-decide SKU-Z → Cemento, factor 50:
-- permitido, misma fila en supplier_products (pisa material/unidad/factor/approved_by) y queda el estado anterior en el historial.
reset role;
select set_config('precios.b4', pg_temp.ingest_csv('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000aaaa',
  '40000000-0000-0000-0000-000000000001', 'lote4.csv',
  '[{"row_number":1,"raw_cells":["SKU-Z","Cal","480","bolsa","ARS"]}]'::jsonb, current_date)::text, true);
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aaaa';
set local request.jwt.claim.role = 'authenticated';
do $$ declare a record; begin
  select * into a from public.approve_supplier_mapping('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'SKU-Z', '30000000-0000-0000-0000-000000000002', 1);
  if a.queued_rows <> 1 then raise exception 'SKU-Z owner: %', a; end if;
  perform set_config('precios.sku_z', a.mapping_id::text, true);
  perform set_config('precios.sku_z_at', (select approved_at::text from public.supplier_products where id = a.mapping_id), true);
end $$;
reset role;
update public.price_import_rows set processing_status = 'invalid', validation_errors = array['DESCARTADA_QA']
  where batch_id = current_setting('precios.b4')::uuid and row_number = 1;
select set_config('precios.b5', pg_temp.ingest_csv('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000aaaa',
  '40000000-0000-0000-0000-000000000001', 'lote5.csv',
  '[{"row_number":1,"raw_cells":["SKU-Z","Cemento a granel","20","kg","ARS"]}]'::jsonb, current_date)::text, true);
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aaa2';
set local request.jwt.claim.role = 'authenticated';
do $$ declare a record; sp record; h record; begin
  select * into a from public.approve_supplier_mapping('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'SKU-Z', '30000000-0000-0000-0000-000000000001', 50);
  select * into sp from public.supplier_products where supplier_sku = 'SKU-Z';
  if a.mapping_id <> current_setting('precios.sku_z')::uuid or a.queued_rows <> 1 or (select count(*) from public.supplier_products where supplier_sku = 'SKU-Z') <> 1 then
    raise exception 're-decisión SKU-Z: %', a;
  end if;
  if sp.master_material_id <> '30000000-0000-0000-0000-000000000001' or sp.unit_factor <> 50 or sp.supplier_unit <> 'kg' or sp.approved_by <> '00000000-0000-0000-0000-00000000aaa2' then
    raise exception 're-decisión SKU-Z no aplicada: %', sp;
  end if;
  -- historial append-only (legible por miembros): estado anterior con el aprobador original y el nuevo estado
  if (select count(*) from public.supplier_product_mapping_history) <> 1 then raise exception 'historial: % filas', (select count(*) from public.supplier_product_mapping_history); end if;
  select * into h from public.supplier_product_mapping_history;
  if h.supplier_product_id <> sp.id or h.supplier_sku <> 'SKU-Z'
     or h.master_material_id <> '30000000-0000-0000-0000-000000000002' or h.unit_factor <> 1 or h.supplier_unit <> 'bolsa' or h.expected_currency <> 'ARS'
     or h.approved_by <> '00000000-0000-0000-0000-00000000aaaa' or h.approved_at <> current_setting('precios.sku_z_at')::timestamptz
     or h.replaced_by <> '00000000-0000-0000-0000-00000000aaa2'
     or h.new_master_material_id <> '30000000-0000-0000-0000-000000000001' or h.new_unit_factor <> 50 or h.new_supplier_unit <> 'kg' then
    raise exception 'historial incompleto: %', h;
  end if;
  -- el historial no se escribe directo
  begin
    insert into public.supplier_product_mapping_history (organization_id, supplier_product_id, supplier_id, supplier_sku, master_material_id, unit_factor, supplier_unit,
      expected_currency, status, approved_by, approved_at, replaced_by, new_master_material_id, new_unit_factor, new_supplier_unit, new_expected_currency)
    values ('10000000-0000-0000-0000-000000000001', sp.id, sp.supplier_id, 'SKU-Z', sp.master_material_id, 1, 'x', 'ARS', 'approved', auth.uid(), now(), auth.uid(), sp.master_material_id, 1, 'x', 'ARS');
    raise exception 'INSERT directo en el historial permitido';
  exception when insufficient_privilege then null;
  end;
  raise notice 're-decisión trazable OK (SKU-Z: mismo id, nuevos valores, approved_by → editor; historial con approved_by original del owner; INSERT directo 42501)';
end $$;
reset role;
do $$ declare r record; begin
  select * into r from public.homologate_raw_price_rows(current_setting('precios.b5')::uuid);
  if r.mapped <> 1 or not exists (select 1 from public.price_observations where supplier_sku = 'SKU-Z' and normalized_price = 20.0 / 50) then
    raise exception 'lote 5 (kg, factor 50 → 0,4 por bolsa): %', r;
  end if;
  raise notice 'homologación final OK (SKU-Z kg → 20/50 = 0,4 por unidad técnica)';
end $$;

rollback;
