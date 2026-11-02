-- Prueba de humo: ejecuta las RPCs principales con datos sintéticos para detectar
-- errores de ejecución (no solo de compilación). Corre dentro de una transacción que se revierte.
\set ON_ERROR_STOP 1
begin;

insert into auth.users (id) values ('00000000-0000-0000-0000-00000000aaaa'), ('00000000-0000-0000-0000-00000000bbbb');
insert into public.organizations (id, name) values ('10000000-0000-0000-0000-000000000001', 'Org A'), ('10000000-0000-0000-0000-000000000002', 'Org B');
insert into public.organization_members (organization_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000aaaa', 'owner'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000bbbb', 'owner');
insert into public.projects (id, organization_id, name, start_date, currency)
  values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Obra', current_date, 'ARS');
insert into public.master_materials (id, organization_id, name, unit, unit_price, currency)
  values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Cemento', 'bolsa', 1000, 'ARS');
insert into public.price_suppliers (id, organization_id, name, external_code)
  values ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Corralón', 'C1');

-- Sesión del usuario A (owner de Org A)
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aaaa';
set local request.jwt.claim.role = 'authenticated';

do $$
declare r public.resolved_reference_price;
begin
  r := public.resolve_reference_price('10000000-0000-0000-0000-000000000001',
        p_master_material_id => '30000000-0000-0000-0000-000000000001',
        p_project_id => '20000000-0000-0000-0000-000000000001');
  if r.source <> 'ORG_MASTER' or r.price <> 1000 then
    raise exception 'resolve_reference_price devolvió % / %', r.source, r.price;
  end if;
  insert into public.project_price_overrides (organization_id, project_id, target_kind, target_id, price, unit, currency)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
            'MASTER_MATERIAL', '30000000-0000-0000-0000-000000000001', 1200, 'bolsa', 'ARS');
  r := public.resolve_reference_price('10000000-0000-0000-0000-000000000001',
        p_master_material_id => '30000000-0000-0000-0000-000000000001',
        p_project_id => '20000000-0000-0000-0000-000000000001');
  if r.source <> 'PROJECT_OVERRIDE' or r.price <> 1200 or not r.is_usable then
    raise exception 'override no prioriza: % / %', r.source, r.price;
  end if;
  -- Org B no debe poder consultar Org A
  begin
    perform public.resolve_reference_price('10000000-0000-0000-0000-000000000002');
    raise exception 'resolve_reference_price permitió cross-org';
  exception when insufficient_privilege then null;
  end;
  raise notice 'resolve_reference_price OK (ORG_MASTER, PROJECT_OVERRIDE, cross-org denegado)';
end $$;

-- Ingesta: objeto en storage + enqueue + claim + commit_chunk con los stubs de pgmq
reset role;
insert into storage.objects (id, bucket_id, name, metadata) values
  ('50000000-0000-0000-0000-000000000001', 'price_imports',
   '10000000-0000-0000-0000-000000000001/60000000-0000-0000-0000-000000000001/lista.csv',
   '{"size": "120", "mimetype": "text/csv"}');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aaaa';
set local request.jwt.claim.role = 'authenticated';
select set_config('precios.batch_id', public.enqueue_price_import('10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001/60000000-0000-0000-0000-000000000001/lista.csv')::text, true);
-- idempotente: misma ruta devuelve el mismo batch
select set_config('precios.batch_id2', public.enqueue_price_import('10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001/60000000-0000-0000-0000-000000000001/lista.csv')::text, true);

reset role;
set local role service_role;
do $$
declare
  v_batch uuid := current_setting('precios.batch_id')::uuid;
  v_msg record; v_claimed record; v_lease uuid; v_status text; v_rows bigint;
begin
  if current_setting('precios.batch_id') <> current_setting('precios.batch_id2') then raise exception 'enqueue no fue idempotente'; end if;
  select * into v_msg from public.price_import_poll();
  if v_msg.batch_id is distinct from v_batch then raise exception 'poll no devolvió el batch encolado'; end if;
  select * into v_claimed from public.price_import_claim(v_batch, v_msg.msg_id);
  if v_claimed.id is null then raise exception 'claim no devolvió el batch'; end if;
  perform public.price_import_commit_chunk(v_batch, v_claimed.lease_token, v_msg.msg_id,
    '[{"row_number":1,"raw_cells":["SKU1","Cemento","1000","bolsa","ARS"]},
      {"row_number":2,"raw_cells":["SKU2","Cal","500","bolsa","ARS"]}]'::jsonb,
    120, true, '["sku","desc","precio","unidad","moneda"]'::jsonb, ',');
  select status, raw_rows into v_status, v_rows from public.price_import_batches where id = v_batch;
  if v_status <> 'raw_ready' or v_rows <> 2 then raise exception 'commit_chunk dejó % / %', v_status, v_rows; end if;
  raise notice 'ingesta OK (enqueue idempotente, poll, claim, commit_chunk)';
end $$;
reset role;
do $$ begin
  if exists (select 1 from pgmq.q_price_imports) then raise exception 'mensaje no archivado'; end if;
  if (select count(*) from pgmq.a_price_imports) <> 1 then raise exception 'ACK no archivó el mensaje'; end if;
  raise notice 'ACK OK (mensaje archivado)';
end $$;

-- Homologación: configurar mapeo (usuario), homologar (worker), aprobar SKU pendiente (usuario), reintento idéntico
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aaaa';
set local request.jwt.claim.role = 'authenticated';
select public.configure_price_import_mapping(current_setting('precios.batch_id')::uuid, '40000000-0000-0000-0000-000000000001',
  '{"sku":0,"description":1,"price":2,"unit":3,"currency":4}'::jsonb, current_date);
reset role;
set local role service_role;
do $$
declare r record;
begin
  select * into r from public.homologate_raw_price_rows(current_setting('precios.batch_id')::uuid);
  if r.processed <> 2 or r.pending <> 2 then raise exception 'homologación inicial: %', r; end if;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aaaa';
set local request.jwt.claim.role = 'authenticated';
do $$
declare a record; b record;
begin
  select * into a from public.approve_supplier_mapping('10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001', 'SKU1', '30000000-0000-0000-0000-000000000001', 1);
  if a.queued_rows <> 1 then raise exception 'approve no reencoló la fila: %', a; end if;
  -- reintento idéntico sin filas pendientes: devuelve la misma equivalencia y 0 filas
  select * into b from public.approve_supplier_mapping('10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001', 'SKU1', '30000000-0000-0000-0000-000000000001', 1);
  if b.mapping_id <> a.mapping_id or b.queued_rows <> 0 then raise exception 'reintento no idempotente: %', b; end if;
  raise notice 'aprobación OK (approve_supplier_mapping + reintento idéntico idempotente)';
end $$;
reset role;
set local role service_role;
do $$
declare r record;
begin
  select * into r from public.homologate_raw_price_rows(current_setting('precios.batch_id')::uuid);
  if r.mapped <> 1 then raise exception 'homologación tras aprobar: %', r; end if;
  if (select count(*) from public.price_observations) <> 1 then raise exception 'sin observación de precio'; end if;
  raise notice 'homologación OK (1 observación creada, 1 fila sigue pendiente)';
end $$;

rollback;
