-- approve_supplier_mapping (20261102100007): idempotencia, preservación del aprobador original,
-- conflicto de mapeo y re-decisión sin historial. Transacción revertida.
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
  -- 3a. Con historial (observaciones) y SIN filas pendientes: la RPC no llega a la guarda HISTORICAL_MAPPING_IMMUTABLE
  --     porque antes exige unidad/moneda de filas pendientes → 22023 AMBIGUOUS_SKU_UNIT_OR_CURRENCY.
  begin
    perform public.approve_supplier_mapping(v_org, s1, 'SKU-X', m2, 1);
    raise exception 'conflicto sin pendientes aceptado';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
  end;
  if v_state = '23505' and v_msg like 'HISTORICAL_MAPPING_IMMUTABLE%' then
    raise notice 'conflicto sin pendientes OK (23505 HISTORICAL_MAPPING_IMMUTABLE)';
  elsif v_state = '22023' and v_msg like 'AMBIGUOUS_SKU_UNIT_OR_CURRENCY%' then
    raise warning 'HALLAZGO: approve_supplier_mapping con SKU ya mapeado y con historial, sin filas pendientes, responde 22023 AMBIGUOUS_SKU_UNIT_OR_CURRENCY en vez de 23505 HISTORICAL_MAPPING_IMMUTABLE: el mensaje no describe el conflicto real (no hay ambigüedad, hay un mapeo histórico inmutable)';
  else
    raise exception 'conflicto sin pendientes: % %', v_state, v_msg;
  end if;
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

-- --------------------------------------------------------------------------- 4. re-decisión SIN historial (SKU-Y): el UPDATE pisa approved_by
-- SKU-Y: el owner aprueba (bolsa → Cal). Antes de que el worker homologue, el editor aprueba el mismo SKU
-- hacia Cemento sobre la fila pendiente en kg (lote 2). Sin observaciones no hay guarda: ON CONFLICT DO UPDATE.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aaaa';
set local request.jwt.claim.role = 'authenticated';
do $$ declare a record; begin
  -- quedan pendientes dos filas de SKU-Y con unidades distintas (bolsa en lote 1, kg en lote 2) → ambigua
  begin
    perform public.approve_supplier_mapping('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'SKU-Y', '30000000-0000-0000-0000-000000000002', 1);
    raise exception 'SKU-Y ambiguo aceptado';
  exception when invalid_parameter_value then
    if sqlerrm not like 'AMBIGUOUS_SKU_UNIT_OR_CURRENCY%' then raise; end if;
  end;
  raise notice 'ambigüedad OK (SKU-Y pendiente en bolsa y en kg → 22023 AMBIGUOUS_SKU_UNIT_OR_CURRENCY)';
end $$;
-- Resolver la ambigüedad: la fila en kg se marca invalid (operador) y el owner aprueba SKU-Y en bolsa → Cal
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
-- Antes de homologar llega una fila pendiente de SKU-Y en kg (lote 3) y el editor re-decide: SKU-Y → Cemento, factor 50
reset role;
select set_config('precios.b3', pg_temp.ingest_csv('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000aaaa',
  '40000000-0000-0000-0000-000000000001', 'lote3.csv',
  '[{"row_number":1,"raw_cells":["SKU-Y","Cemento a granel","20","kg","ARS"]}]'::jsonb, current_date)::text, true);
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aaa2';
set local request.jwt.claim.role = 'authenticated';
do $$ declare a record; sp record; begin
  select * into a from public.approve_supplier_mapping('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'SKU-Y', '30000000-0000-0000-0000-000000000001', 50);
  select * into sp from public.supplier_products where supplier_sku = 'SKU-Y';
  if a.mapping_id <> current_setting('precios.sku_y')::uuid or a.queued_rows <> 1 or (select count(*) from public.supplier_products where supplier_sku = 'SKU-Y') <> 1 then
    raise exception 're-decisión SKU-Y: %', a;
  end if;
  if sp.master_material_id <> '30000000-0000-0000-0000-000000000001' or sp.unit_factor <> 50 or sp.supplier_unit <> 'kg' or sp.approved_by <> '00000000-0000-0000-0000-00000000aaa2' then
    raise exception 're-decisión SKU-Y no aplicada: %', sp;
  end if;
  raise notice 're-decisión sin historial OK (mismo id, material/unidad/factor nuevos, approved_by pasa al editor — comportamiento esperado: no hay observaciones)';
end $$;
-- Consecuencia: las filas 'raw' del lote 1 (SKU-Y en bolsa, aprobadas por el owner pero aún no homologadas) se homologan contra
-- la equivalencia nueva (kg) → vuelven a pending_mapping con UNIT_OR_CURRENCY_MISMATCH. La decisión del owner se perdió sin aviso.
reset role;
do $$ declare r record; begin
  select * into r from public.homologate_raw_price_rows(current_setting('precios.b1')::uuid);
  if r.processed <> 1 then raise exception 'lote 1 debía tener una sola fila raw (SKU-Y): %', r; end if;
  if r.pending = 1 and (select validation_errors from public.price_import_rows where batch_id = current_setting('precios.b1')::uuid and row_number = 3) = array['UNIT_OR_CURRENCY_MISMATCH'] then
    raise warning 'HALLAZGO: una re-decisión de mapeo (sin historial) mientras hay filas aprobadas pero todavía no homologadas (processing_status=raw) las re-dirige a la equivalencia nueva: la fila SKU-Y/bolsa del lote 1 volvió a pending_mapping con UNIT_OR_CURRENCY_MISMATCH y la aprobación original del owner se perdió sin rastro (approved_by sobrescrito). Sugerencia para el motor: bloquear el cambio si existen filas raw del SKU, o versionar supplier_products.';
  elsif r.mapped = 1 then
    raise notice 'fila raw del lote 1 homologada (sin pérdida)';
  else
    raise exception 'lote 1 tras re-decisión: %', r;
  end if;
  select * into r from public.homologate_raw_price_rows(current_setting('precios.b3')::uuid);
  if r.mapped <> 1 or not exists (select 1 from public.price_observations where supplier_sku = 'SKU-Y' and normalized_price = 20.0 / 50) then
    raise exception 'lote 3 (kg, factor 50 → 0,4 por bolsa): %', r;
  end if;
  raise notice 'homologación final OK (SKU-Y kg → 20/50 = 0,4 por unidad técnica)';
end $$;

rollback;
