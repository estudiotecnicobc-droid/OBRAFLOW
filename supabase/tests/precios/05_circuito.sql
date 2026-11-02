-- Circuito completo del motor de precios (aceptación, QA): CSV → pending_mapping →
-- approve_supplier_mapping → homologación → publicación → mediana por proveedor →
-- APU + presupuesto → freeze_budget_prices → FROZEN / CURRENT / AS_OF → RLS y 42501
-- para otra org, usuario sin membresía y viewer → UNIT_MISMATCH / USD → APU anidado.
-- Todo dentro de una transacción que se revierte.
--
-- Convención del harness: bloques DO con RAISE EXCEPTION si falla una aserción y NOTICE al pasar.
-- Un bug real del motor se marca con RAISE WARNING 'HALLAZGO: …' (el harness sigue en verde).
\set ON_ERROR_STOP 1
begin;

-- --------------------------------------------------------------------------- identidades
-- Org A: owner aaaa, editor aaa2, viewer aaa3. Org B: owner bbbb. cccc: sin ninguna membresía.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000aaaa'), ('00000000-0000-0000-0000-00000000aaa2'),
  ('00000000-0000-0000-0000-00000000aaa3'), ('00000000-0000-0000-0000-00000000bbbb'),
  ('00000000-0000-0000-0000-00000000cccc');
insert into public.organizations (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Org A'), ('10000000-0000-0000-0000-000000000002', 'Org B');
insert into public.organization_members (organization_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000aaaa', 'owner'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000aaa2', 'editor'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000aaa3', 'viewer'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000bbbb', 'owner');
-- P1: presupuesto principal (APU plano). P2: presupuesto con APU anidado.
insert into public.projects (id, organization_id, name, start_date, currency) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Obra P1', current_date, 'ARS'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Obra P2', current_date, 'ARS'),
  ('20000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000002', 'Obra B', current_date, 'ARS');
-- Catálogo Org A. unit_price es lo que usa el motor legacy (057) → sirve para medir la divergencia.
insert into public.master_materials (id, organization_id, name, unit, unit_price, currency) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Cemento', 'bolsa', 1000, 'ARS'),  -- M1: 3 proveedores
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Arena',   'm3',    700, 'ARS'),  -- M2: 1 proveedor
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Cal',     'bolsa', 600, 'ARS'),  -- M3: 4 proveedores
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Hierro',  'kg',    800, 'ARS'),  -- M4: sin observaciones
  ('30000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000002', 'Cemento B', 'bolsa', 999, 'ARS');
insert into public.price_suppliers (id, organization_id, name, external_code) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Corralón 1', 'C1'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Corralón 2', 'C2'),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Corralón 3', 'C3'),
  ('40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Corralón 4', 'C4');
insert into storage.buckets (id, name) values ('price_imports', 'price_imports') on conflict do nothing;

-- APU T1 (m2): C1 = M1 × 2 bolsas, 5 % desperdicio, conversion_factor 50 (≠ 1); C2 = M2 × 0,5 m3 sin desperdicio.
-- APU T2 (m2): Cn = sub-APU T1 (anidado) ; C3 = M4 × 3 kg.
insert into public.master_tasks (id, organization_id, name, unit) values
  ('80000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Mampostería', 'm2'),
  ('80000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Tabique compuesto', 'm2');
insert into public.master_task_materials (id, master_task_id, master_material_id, material_name, unit, quantity, waste_percent, conversion_factor, commercial_unit, sub_master_task_id, last_known_unit_price) values
  ('90000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Cemento', 'bolsa', 2,   5, 50, 'pallet', null, 0),
  ('90000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'Arena',   'm3',    0.5, 0, null, null,    null, 0),
  ('90000000-0000-0000-0000-000000000003', '80000000-0000-0000-0000-000000000002', null,                                   'Sub APU Mampostería', 'm2', 1, 0, null, null, '80000000-0000-0000-0000-000000000001', 0),
  ('90000000-0000-0000-0000-000000000004', '80000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000004', 'Hierro',  'kg',    3,   0, null, null,    null, 0);
insert into public.tasks (id, organization_id, master_task_id, name, unit) values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'Mampostería', 'm2'),
  ('a0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000002', 'Tabique compuesto', 'm2');
-- P1: dos ítems del mismo APU (10 m2 y 3,5 m2). P2: un ítem del APU anidado (2 m2).
insert into public.budget_items (id, project_id, organization_id, task_id, quantity, sort_order) values
  ('b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 10,  1),
  ('b0000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 3.5, 2),
  ('b0000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 2,   1);

-- --------------------------------------------------------------------------- helper de ingesta CSV
-- Reproduce el circuito real de un lote: objeto en Storage → enqueue (usuario) → poll/claim/commit_chunk
-- (worker) → configure_price_import_mapping (usuario) → homologate_raw_price_rows (worker).
-- Se ejecuta como superusuario (los stubs de pgmq no distinguen roles); auth.uid() se fija con set_config.
create function pg_temp.ingest_csv(p_org uuid, p_uid uuid, p_sup uuid, p_file text, p_rows jsonb, p_observed date)
returns uuid language plpgsql as $$
declare v_path text := p_org::text || '/' || p_sup::text || '/' || p_file; v_batch uuid; v_msg record; v_claimed record; v_h record;
begin
  insert into storage.objects (id, bucket_id, name, metadata)
    values (gen_random_uuid(), 'price_imports', v_path, '{"size": "100", "mimetype": "text/csv"}');
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  v_batch := public.enqueue_price_import(p_org, v_path);
  select * into v_msg from public.price_import_poll();
  if v_msg.batch_id is distinct from v_batch then raise exception 'poll devolvió % y no %', v_msg.batch_id, v_batch; end if;
  select * into v_claimed from public.price_import_claim(v_batch, v_msg.msg_id);
  perform public.price_import_commit_chunk(v_batch, v_claimed.lease_token, v_msg.msg_id, p_rows, 100, true,
    '["sku","desc","precio","unidad","moneda"]'::jsonb, ',');
  perform public.configure_price_import_mapping(v_batch, p_sup,
    '{"sku":0,"description":1,"price":2,"unit":3,"currency":4}'::jsonb, p_observed);
  select * into v_h from public.homologate_raw_price_rows(v_batch);
  if v_h.processed <> jsonb_array_length(p_rows) or v_h.invalid <> 0 then raise exception 'homologación del lote %: %', p_file, v_h; end if;
  return v_batch;
end $$;

-- Lotes de 4 proveedores, observados hace 3 días (así el congelado de "ayer" los ve en AS_OF).
--   M1 Cemento: C1 1000 | C2 1100 | C3 52000 por pallet de 40 bolsas (→ 1300 normalizado)   → mediana 1100
--   M3 Cal:     C1 500  | C2 600  | C3 700 | C4 900                                            → mediana (600+700)/2 = 650
--   M2 Arena:   C1 750                                                                          → 750
reset role;
select set_config('precios.b1', pg_temp.ingest_csv('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000aaaa',
  '40000000-0000-0000-0000-000000000001', 'lista.csv',
  '[{"row_number":1,"raw_cells":["CEM-1","Cemento x50","1000","bolsa","ARS"]},
    {"row_number":2,"raw_cells":["CAL-1","Cal hidratada","500","bolsa","ARS"]},
    {"row_number":3,"raw_cells":["ARE-1","Arena gruesa","750","m3","ARS"]}]'::jsonb, current_date - 3)::text, true);
select set_config('precios.b2', pg_temp.ingest_csv('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000aaaa',
  '40000000-0000-0000-0000-000000000002', 'lista.csv',
  '[{"row_number":1,"raw_cells":["CEM-2","Cemento","1100","bolsa","ARS"]},
    {"row_number":2,"raw_cells":["CAL-2","Cal","600","bolsa","ARS"]}]'::jsonb, current_date - 3)::text, true);
select set_config('precios.b3', pg_temp.ingest_csv('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000aaaa',
  '40000000-0000-0000-0000-000000000003', 'lista.csv',
  '[{"row_number":1,"raw_cells":["CEM-3","Cemento pallet 40 bolsas","52000","pallet","ARS"]},
    {"row_number":2,"raw_cells":["CAL-3","Cal","700","bolsa","ARS"]}]'::jsonb, current_date - 3)::text, true);
select set_config('precios.b4', pg_temp.ingest_csv('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000aaaa',
  '40000000-0000-0000-0000-000000000004', 'lista.csv',
  '[{"row_number":1,"raw_cells":["CAL-4","Cal","900","bolsa","ARS"]}]'::jsonb, current_date - 3)::text, true);

do $$ begin
  if (select count(*) from public.price_import_rows where processing_status = 'pending_mapping') <> 8
     or exists (select 1 from public.price_import_rows where processing_status <> 'pending_mapping')
     or exists (select 1 from public.price_observations) then
    raise exception 'tras la primera homologación todas las filas deben estar pending_mapping y sin observaciones';
  end if;
  raise notice 'ingesta OK (4 lotes CSV, 8 filas pending_mapping, 0 observaciones)';
end $$;

-- --------------------------------------------------------------------------- aprobación humana (editor de Org A)
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aaa2';
set local request.jwt.claim.role = 'authenticated';
do $$
declare a record; v_org uuid := '10000000-0000-0000-0000-000000000001';
  s1 uuid := '40000000-0000-0000-0000-000000000001'; s2 uuid := '40000000-0000-0000-0000-000000000002';
  s3 uuid := '40000000-0000-0000-0000-000000000003'; s4 uuid := '40000000-0000-0000-0000-000000000004';
  m1 uuid := '30000000-0000-0000-0000-000000000001'; m2 uuid := '30000000-0000-0000-0000-000000000002'; m3 uuid := '30000000-0000-0000-0000-000000000003';
begin
  select * into a from public.approve_supplier_mapping(v_org, s1, 'CEM-1', m1, 1);  if a.queued_rows <> 1 then raise exception 'CEM-1: %', a; end if;
  select * into a from public.approve_supplier_mapping(v_org, s1, 'CAL-1', m3, 1);  if a.queued_rows <> 1 then raise exception 'CAL-1: %', a; end if;
  select * into a from public.approve_supplier_mapping(v_org, s1, 'ARE-1', m2, 1);  if a.queued_rows <> 1 then raise exception 'ARE-1: %', a; end if;
  select * into a from public.approve_supplier_mapping(v_org, s2, 'CEM-2', m1, 1);  if a.queued_rows <> 1 then raise exception 'CEM-2: %', a; end if;
  select * into a from public.approve_supplier_mapping(v_org, s2, 'CAL-2', m3, 1);  if a.queued_rows <> 1 then raise exception 'CAL-2: %', a; end if;
  -- 1 pallet = 40 bolsas: unit_factor 40 → normalized_price = 52000 / 40 = 1300 por bolsa
  select * into a from public.approve_supplier_mapping(v_org, s3, 'CEM-3', m1, 40); if a.queued_rows <> 1 then raise exception 'CEM-3: %', a; end if;
  select * into a from public.approve_supplier_mapping(v_org, s3, 'CAL-3', m3, 1);  if a.queued_rows <> 1 then raise exception 'CAL-3: %', a; end if;
  select * into a from public.approve_supplier_mapping(v_org, s4, 'CAL-4', m3, 1);  if a.queued_rows <> 1 then raise exception 'CAL-4: %', a; end if;
  -- Un SKU de otra org o un material de otra org se rechazan
  begin
    perform public.approve_supplier_mapping(v_org, s1, 'CEM-1', '30000000-0000-0000-0000-000000000009', 1);
    raise exception 'approve aceptó material de Org B';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.supplier_products where approved_by = '00000000-0000-0000-0000-00000000aaa2' and status = 'approved') <> 8 then
    raise exception 'supplier_products: se esperaban 8 equivalencias aprobadas por el editor';
  end if;
  raise notice 'aprobación OK (8 SKU aprobados por el editor, 8 filas reencoladas, material de Org B rechazado)';
end $$;

-- Segunda pasada del worker: ahora sí crea observaciones
reset role;
do $$
declare r record; n int := 0; v_b text;
begin
  foreach v_b in array array[current_setting('precios.b1'), current_setting('precios.b2'), current_setting('precios.b3'), current_setting('precios.b4')] loop
    select * into r from public.homologate_raw_price_rows(v_b::uuid);
    n := n + r.mapped;
    if r.pending <> 0 or r.invalid <> 0 then raise exception 'segunda homologación del lote %: %', v_b, r; end if;
  end loop;
  if n <> 8 or (select count(*) from public.price_observations) <> 8 then raise exception 'se esperaban 8 observaciones, hay % (mapped %)', (select count(*) from public.price_observations), n; end if;
  if not exists (select 1 from public.price_observations where supplier_sku = 'CEM-3' and original_price = 52000 and original_unit = 'pallet'
                 and unit_factor = 40 and normalized_price = 1300) then
    raise exception 'CEM-3 no quedó normalizada a 1300 por bolsa';
  end if;
  if exists (select 1 from public.price_observations where publication_status <> 'pending' or region <> 'DESCONOCIDA' or includes_vat is not null) then
    raise exception 'las observaciones nuevas deben nacer pending y sin atributos de comparabilidad';
  end if;
  raise notice 'homologación OK (8 observaciones pending; unit_factor 40 → 52000/40 = 1300)';
end $$;

-- --------------------------------------------------------------------------- viewer: lee pero no publica/congela
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aaa3';
set local request.jwt.claim.role = 'authenticated';
do $$
declare r public.resolved_reference_price; ids uuid[];
begin
  if (select count(*) from public.price_observations) <> 8 then raise exception 'viewer: RLS debería dejar leer las 8 observaciones'; end if;
  if (select count(*) from public.supplier_products) <> 8 then raise exception 'viewer: RLS debería dejar leer supplier_products'; end if;
  select array_agg(id) into ids from public.price_observations;
  begin
    perform public.publish_price_observations('10000000-0000-0000-0000-000000000001', ids, 'AMBA', false, 'LISTA');
    raise exception 'viewer pudo publicar';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.freeze_budget_prices('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001');
    raise exception 'viewer pudo congelar';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.approve_supplier_mapping('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'CEM-1', '30000000-0000-0000-0000-000000000001', 1);
    raise exception 'viewer pudo aprobar un mapeo';
  exception when insufficient_privilege then null;
  end;
  -- Lectura del resolvedor sí (membresía): sin publicadas todavía → catálogo
  r := public.resolve_reference_price('10000000-0000-0000-0000-000000000001', p_master_material_id => '30000000-0000-0000-0000-000000000001');
  if r.source <> 'ORG_MASTER' or r.price <> 1000 or r.price_status <> 'CATALOG_UNVERIFIED' then raise exception 'viewer resolve: % %', r.source, r.price; end if;
  raise notice 'viewer OK (SELECT permitido; publish/freeze/approve → 42501; resolve → ORG_MASTER 1000 CATALOG_UNVERIFIED)';
end $$;

-- --------------------------------------------------------------------------- publicación (owner de Org A)
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aaaa';
set local request.jwt.claim.role = 'authenticated';
do $$
declare ids uuid[]; n int;
begin
  select array_agg(id) into ids from public.price_observations;
  n := public.publish_price_observations('10000000-0000-0000-0000-000000000001', ids, 'AMBA', false, 'LISTA');
  if n <> 8 then raise exception 'publish devolvió %', n; end if;
  raise notice 'publicación OK (8 observaciones publicadas: AMBA / sin IVA / LISTA)';
end $$;
-- Retrodatar la publicación a la fecha observada (solo el harness, como superusuario): así AS_OF de ayer las ve.
reset role;
update public.price_observations set published_at = observed_on::timestamptz where publication_status = 'published';

-- --------------------------------------------------------------------------- resolución CURRENT (owner)
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aaaa';
set local request.jwt.claim.role = 'authenticated';
do $$
declare r public.resolved_reference_price; v_ids uuid[]; v_expected uuid[]; v_org uuid := '10000000-0000-0000-0000-000000000001';
begin
  -- M1: 3 proveedores 1000 / 1100 / 1300 → elemento central = 1100 (impar: sin promedio)
  r := public.resolve_reference_price(v_org, p_master_material_id => '30000000-0000-0000-0000-000000000001', p_project_id => '20000000-0000-0000-0000-000000000001');
  if r.source <> 'SUPPLIER_OBSERVED' or r.price <> 1100 or r.price_status <> 'RELEVADO' or not r.is_usable or r.unit <> 'bolsa' or r.currency <> 'ARS'
     or r.observation_count <> 3 or (r.resolution->>'supplier_count')::int <> 3 or r.effective_date <> current_date - 3 then
    raise exception 'M1 CURRENT: % % % % %', r.source, r.price, r.price_status, r.observation_count, r.resolution;
  end if;
  -- resolution.observation_ids = exactamente las 3 observaciones de Cemento (una por proveedor)
  select array_agg(x::uuid order by x::uuid) into v_ids from jsonb_array_elements_text(r.resolution->'observation_ids') x;
  select array_agg(id order by id) into v_expected from public.price_observations where master_material_id = '30000000-0000-0000-0000-000000000001';
  if v_ids <> v_expected then raise exception 'observation_ids % ≠ esperadas %', v_ids, v_expected; end if;
  if r.reference_id <> all(v_expected) then raise exception 'reference_id % no es una de las observaciones', r.reference_id; end if;
  if r.resolution->>'method' <> 'median_by_supplier' or (r.resolution->>'window_days')::int <> 90
     or r.resolution->'filters'->>'region' <> 'AMBA' or (r.resolution->'filters'->>'includes_vat')::boolean <> false
     or r.resolution->'filters'->>'commercial_condition' <> 'LISTA' then
    raise exception 'resolution M1: %', r.resolution;
  end if;
  -- M3: 4 proveedores 500 / 600 / 700 / 900 → promedio de los dos centrales = (600 + 700) / 2 = 650
  r := public.resolve_reference_price(v_org, p_master_material_id => '30000000-0000-0000-0000-000000000003');
  if r.source <> 'SUPPLIER_OBSERVED' or r.price <> 650 or r.observation_count <> 4 or (r.resolution->>'supplier_count')::int <> 4 then
    raise exception 'M3 mediana par: % % %', r.source, r.price, r.resolution;
  end if;
  -- M2: 1 proveedor → ese valor
  r := public.resolve_reference_price(v_org, p_master_material_id => '30000000-0000-0000-0000-000000000002');
  if r.source <> 'SUPPLIER_OBSERVED' or r.price <> 750 or r.observation_count <> 1 then raise exception 'M2 un proveedor: % %', r.source, r.price; end if;
  -- M4: sin observaciones → catálogo marcado
  r := public.resolve_reference_price(v_org, p_master_material_id => '30000000-0000-0000-0000-000000000004');
  if r.source <> 'ORG_MASTER' or r.price <> 800 or r.price_status <> 'CATALOG_UNVERIFIED' or not r.is_usable then raise exception 'M4 catálogo: % %', r.source, r.price; end if;
  -- UNIT_MISMATCH: la unidad requerida (kg) no es la del material (bolsa) → precio informado pero no usable
  r := public.resolve_reference_price(v_org, p_master_material_id => '30000000-0000-0000-0000-000000000001', p_required_unit => 'kg');
  if r.is_usable or not ('UNIT_MISMATCH' = any(r.warnings)) or r.price <> 1100 then raise exception 'UNIT_MISMATCH: % % %', r.is_usable, r.warnings, r.price; end if;
  -- Moneda USD sin proyecto: las observaciones (ARS) no son comparables → cae a catálogo ARS y no es usable
  r := public.resolve_reference_price(v_org, p_master_material_id => '30000000-0000-0000-0000-000000000001', p_expected_currency => 'USD');
  if r.is_usable or r.source = 'SUPPLIER_OBSERVED' or not ('CURRENCY_UNKNOWN_OR_MISMATCH' = any(r.warnings)) then
    raise exception 'USD: % % % %', r.source, r.price, r.is_usable, r.warnings;
  end if;
  -- APU anidado directo → 22023
  begin
    perform public.resolve_reference_price(v_org, p_component_id => '90000000-0000-0000-0000-000000000003');
    raise exception 'componente anidado no falló';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'resolución OK (M1 1100 impar, M3 650 par, M2 750 único, M4 catálogo, UNIT_MISMATCH, USD no usable, anidado 22023)';
end $$;

-- --------------------------------------------------------------------------- congelado P1 (editor), fecha de costo = ayer → modo AS_OF
-- Fórmula (misma que calculate_consolidated_resources, 057, PATH A leg_mat/agg_mat):
--   qty_pu = mtm.quantity × (1 + COALESCE(mtm.waste_percent, 0) / 100)     -- por unidad de APU
--   total_qty = Σ qty_pu × budget_item.quantity ; total_cost = Σ qty_pu × item.quantity × uprice
--   conversion_factor NO interviene en el costo (solo en purchaseQuantity); ambos motores lo ignoran.
--   legacy: uprice = COALESCE(master_materials.unit_price, mtm.last_known_unit_price, 0)
--   motor nuevo: uprice = resolve_reference_price(componente).price
-- P1 = 2 ítems de T1: 10 m2 y 3,5 m2.
--   C1 (Cemento, 2 bolsas +5 %): qty I1 = 2 × 1,05 × 10 = 21 ; qty I2 = 2 × 1,05 × 3,5 = 7,35 ; precio nuevo 1100 → 23.100 + 8.085 = 31.185
--   C2 (Arena, 0,5 m3):          qty I1 = 0,5 × 10 = 5      ; qty I2 = 0,5 × 3,5 = 1,75    ; precio nuevo 750  →  3.750 + 1.312,50 = 5.062,50
--   materialsTotal = 36.247,50
--   legacy: Cemento 28,35 × 1000 = 28.350 ; Arena 6,75 × 700 = 4.725 → legacyMaterialsTotal = 33.075
--   divergence = 36.247,50 − 33.075 = 3.172,50  (> 0,01 → TOTALS_DIVERGE_FROM_LEGACY_ENGINE, pending_reconciliation)
-- Difieren porque el legacy valúa con master_materials.unit_price (catálogo, 1000 y 700) y el motor nuevo con la mediana
-- publicada de proveedores (1100 y 750). Es la divergencia esperada mientras el catálogo no se reconcilie con el mercado.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aaa2';
set local request.jwt.claim.role = 'authenticated';
do $$
declare f jsonb; v_snap uuid; n int; v_bad int; v_sum numeric;
begin
  f := public.freeze_budget_prices('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', current_date - 1);
  v_snap := (f->>'snapshotId')::uuid;
  perform set_config('precios.snapshot_id', v_snap::text, true);
  raise notice 'freeze P1 → motor nuevo % | legacy % | divergencia % | status %',
    f->>'materialsTotal', f->>'legacyMaterialsTotal', f->>'divergence', f->>'status';
  if (f->>'itemCount')::int <> 2 or (f->>'componentCount')::int <> 4 or (f->>'unusableCount')::int <> 0 or (f->>'nestedSkippedCount')::int <> 0
     or (f->>'materialsTotal')::numeric <> 36247.50 or (f->>'legacyMaterialsTotal')::numeric <> 33075
     or (f->>'divergence')::numeric <> 3172.50 or f->>'status' <> 'pending_reconciliation' or f->>'mode' <> 'AS_OF'
     or not (f->'warnings') ? 'TOTALS_DIVERGE_FROM_LEGACY_ENGINE' or (f->'warnings') ? 'UNUSABLE_COMPONENT_PRICES' then
    raise exception 'freeze_budget_prices P1: %', f;
  end if;
  -- cabecera
  if (select count(*) from public.budget_cost_snapshots s where s.id = v_snap and s.cost_date = current_date - 1
        and s.reference_pricing_status = 'pending_reconciliation' and (s.result->'totals'->>'material')::numeric = 33075
        and s.result->'reference_pricing'->>'engine' = 'reference_price_v1' and (s.result->'reference_pricing'->>'materialsTotal')::numeric = 36247.50) <> 1 then
    raise exception 'cabecera del snapshot inconsistente';
  end if;
  -- detalle: 4 filas (2 ítems × 2 componentes), todas usables, SUPPLIER_OBSERVED, con trazabilidad
  select count(*) into n from public.get_frozen_budget_prices(v_snap);
  if n <> 4 then raise exception 'detalle: % filas', n; end if;
  if exists (select 1 from public.get_frozen_budget_prices(v_snap) p where not p.is_usable or p.source <> 'SUPPLIER_OBSERVED'
             or p.price_status <> 'RELEVADO' or p.resolution->>'method' <> 'median_by_supplier' or p.reference_id is null or p.currency <> 'ARS'
             or p.effective_date <> current_date - 3) then
    raise exception 'detalle congelado con filas sin trazabilidad o no usables';
  end if;
  -- cada fila congelada contra el cálculo manual: quantity = mtm.quantity × (1 + waste/100) × item.quantity ; unit_price = mediana esperada
  select count(*) into v_bad
  from public.get_frozen_budget_prices(v_snap) p
  join public.master_task_materials c on c.id = p.component_id
  join public.budget_items bi on bi.id = p.budget_item_id
  where p.quantity <> c.quantity * (1 + c.waste_percent / 100) * bi.quantity
     or p.unit <> c.unit
     or p.unit_price <> case c.master_material_id when '30000000-0000-0000-0000-000000000001' then 1100 when '30000000-0000-0000-0000-000000000002' then 750 end;
  if v_bad <> 0 then raise exception '% filas congeladas no coinciden con el cálculo manual', v_bad; end if;
  -- valores puntuales: 21 / 7,35 (Cemento) y 5 / 1,75 (Arena)
  if (select array_agg(p.quantity order by p.quantity) from public.get_frozen_budget_prices(v_snap) p where p.component_id = '90000000-0000-0000-0000-000000000001') <> array[7.35, 21]::numeric[]
     or (select array_agg(p.quantity order by p.quantity) from public.get_frozen_budget_prices(v_snap) p where p.component_id = '90000000-0000-0000-0000-000000000002') <> array[1.75, 5]::numeric[] then
    raise exception 'cantidades congeladas distintas de 21/7,35 y 5/1,75';
  end if;
  -- materialsTotal = Σ quantity × unit_price (2 decimales)
  select round(sum(p.quantity * p.unit_price), 2) into v_sum from public.get_frozen_budget_prices(v_snap) p;
  if v_sum <> 36247.50 or v_sum <> (f->>'materialsTotal')::numeric then raise exception 'Σ detalle % ≠ materialsTotal %', v_sum, f->>'materialsTotal'; end if;
  -- unit_factor del detalle siempre 1: el conversion_factor del componente (50) no altera el costo (igual que en la 057)
  if exists (select 1 from public.get_frozen_budget_prices(v_snap) p where p.unit_factor <> 1) then raise exception 'unit_factor ≠ 1 en el detalle'; end if;
  raise notice 'freeze P1 OK (4 filas = cálculo manual; 36.247,50 vs legacy 33.075; divergencia 3.172,50; pending_reconciliation; AS_OF ayer)';
end $$;

-- --------------------------------------------------------------------------- nueva observación más cara (C2 Cemento 5000, hoy)
reset role;
select set_config('precios.b5', pg_temp.ingest_csv('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000aaaa',
  '40000000-0000-0000-0000-000000000002', 'lista2.csv',
  '[{"row_number":1,"raw_cells":["CEM-2","Cemento","5000","bolsa","ARS"]}]'::jsonb, current_date)::text, true);
do $$ begin
  -- el SKU ya tiene equivalencia aprobada: la homologación mapea directo, sin pasar por pending_mapping
  if (select count(*) from public.price_observations where supplier_sku = 'CEM-2' and normalized_price = 5000 and publication_status = 'pending') <> 1 then
    raise exception 'la observación nueva de CEM-2 no se creó directamente';
  end if;
end $$;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aaaa';
set local request.jwt.claim.role = 'authenticated';
do $$
declare r public.resolved_reference_price; v_snap uuid := current_setting('precios.snapshot_id')::uuid; n int; v_new uuid;
  v_org uuid := '10000000-0000-0000-0000-000000000001'; v_p1 uuid := '20000000-0000-0000-0000-000000000001'; c1 uuid := '90000000-0000-0000-0000-000000000001';
begin
  select id into v_new from public.price_observations where supplier_sku = 'CEM-2' and normalized_price = 5000;
  n := public.publish_price_observations(v_org, array[v_new], 'AMBA', false, 'LISTA');
  if n <> 1 then raise exception 'publicación de la nueva: %', n; end if;
  -- CURRENT: C2 pasa de 1100 a 5000 (la más nueva por proveedor) → 1000 / 1300 / 5000 → mediana 1300
  r := public.resolve_reference_price(v_org, p_component_id => c1, p_project_id => v_p1);
  if r.source <> 'SUPPLIER_OBSERVED' or r.price <> 1300 or r.reference_id <> v_new or not (r.resolution->'observation_ids') ? v_new::text then
    raise exception 'CURRENT tras nueva observación: % % %', r.source, r.price, r.reference_id;
  end if;
  -- FROZEN: sigue 1100
  r := public.resolve_reference_price(v_org, p_component_id => c1, p_project_id => v_p1, p_mode => 'FROZEN', p_snapshot_id => v_snap);
  if r.source <> 'FROZEN_SNAPSHOT' or r.price <> 1100 or r.price_status <> 'FROZEN' or not r.is_usable
     or r.resolution->>'original_source' <> 'SUPPLIER_OBSERVED' or (r.resolution->>'snapshot_id')::uuid <> v_snap then
    raise exception 'FROZEN: % % %', r.source, r.price, r.resolution;
  end if;
  -- AS_OF a la fecha del congelado (ayer): reproduce 1100 sin la observación nueva
  r := public.resolve_reference_price(v_org, p_component_id => c1, p_project_id => v_p1, p_effective_date => current_date - 1, p_mode => 'AS_OF');
  if r.source <> 'SUPPLIER_OBSERVED' or r.price <> 1100 or (r.resolution->'observation_ids') ? v_new::text or (r.resolution->>'supplier_count')::int <> 3 then
    raise exception 'AS_OF ayer: % % %', r.source, r.price, r.resolution;
  end if;
  -- get_frozen_budget_prices tampoco cambió
  if exists (select 1 from public.get_frozen_budget_prices(v_snap) p where p.component_id = c1 and p.unit_price <> 1100) then raise exception 'detalle congelado mutó'; end if;
  raise notice 'nueva observación OK (CURRENT 1300, FROZEN 1100, AS_OF ayer 1100)';
end $$;

-- --------------------------------------------------------------------------- APU anidado: P2 (owner) → fila omitida en skipped y status partial
-- P2: 1 ítem de T2 × 2 m2. Cn (sub-APU) se omite; C3 Hierro 3 kg × 2 = 6 kg × 800 (ORG_MASTER) = 4.800.
-- Legacy: Hierro 6 × 800 = 4.800 y la fila anidada aporta 0 (sin material, last_known_unit_price 0) → sin divergencia → 'partial'.
do $$
declare f jsonb; v_snap uuid; v_sk jsonb;
begin
  f := public.freeze_budget_prices('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001');
  v_snap := (f->>'snapshotId')::uuid;
  if f->>'status' <> 'partial' or (f->>'nestedSkippedCount')::int <> 1 or (f->>'componentCount')::int <> 1 or (f->>'itemCount')::int <> 1
     or (f->>'materialsTotal')::numeric <> 4800 or (f->>'legacyMaterialsTotal')::numeric <> 4800 or (f->>'divergence')::numeric <> 0
     or not (f->'warnings') ? 'NESTED_APU_SKIPPED' or (f->'warnings') ? 'TOTALS_DIVERGE_FROM_LEGACY_ENGINE' or f->>'mode' <> 'CURRENT' then
    raise exception 'freeze P2 anidado: %', f;
  end if;
  select s.result->'reference_pricing'->'skipped' into v_sk from public.budget_cost_snapshots s where s.id = v_snap;
  if jsonb_array_length(v_sk) <> 1 or v_sk->0->>'kind' <> 'NESTED_APU' or v_sk->0->>'reason' <> 'NESTED_APU_NOT_FROZEN'
     or (v_sk->0->>'componentId')::uuid <> '90000000-0000-0000-0000-000000000003'
     or (v_sk->0->>'subMasterTaskId')::uuid <> '80000000-0000-0000-0000-000000000001' then
    raise exception 'skipped: %', v_sk;
  end if;
  if (select count(*) from public.get_frozen_budget_prices(v_snap)) <> 1
     or exists (select 1 from public.get_frozen_budget_prices(v_snap) p where p.component_id <> '90000000-0000-0000-0000-000000000004'
                or p.quantity <> 6 or p.unit_price <> 800 or p.source <> 'ORG_MASTER' or p.price_status <> 'CATALOG_UNVERIFIED' or not p.is_usable) then
    raise exception 'detalle P2 incorrecto';
  end if;
  if (select reference_pricing_status from public.budget_cost_snapshots where id = v_snap) <> 'partial' then raise exception 'cabecera P2 no es partial'; end if;
  raise notice 'APU anidado OK (componente omitido en skipped, status partial, Hierro 6 kg × 800 reconciliado con legacy)';
end $$;

-- --------------------------------------------------------------------------- Org B (owner bbbb): nada de Org A
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000bbbb';
set local request.jwt.claim.role = 'authenticated';
do $$
declare v_snap uuid := current_setting('precios.snapshot_id')::uuid; v_org uuid := '10000000-0000-0000-0000-000000000001';
begin
  if exists (select 1 from public.price_observations) then raise exception 'Org B ve price_observations de Org A'; end if;
  if exists (select 1 from public.supplier_products) then raise exception 'Org B ve supplier_products de Org A'; end if;
  if exists (select 1 from public.price_suppliers) then raise exception 'Org B ve price_suppliers de Org A'; end if;
  if exists (select 1 from public.budget_cost_snapshot_prices) then raise exception 'Org B ve budget_cost_snapshot_prices de Org A'; end if;
  if exists (select 1 from public.budget_cost_snapshots) then raise exception 'Org B ve budget_cost_snapshots de Org A'; end if;
  if exists (select 1 from public.price_import_rows) or exists (select 1 from public.price_import_batches) then raise exception 'Org B ve lotes de Org A'; end if;
  begin perform public.resolve_reference_price(v_org, p_master_material_id => '30000000-0000-0000-0000-000000000001'); raise exception 'Org B: resolve permitido';
  exception when insufficient_privilege then null; end;
  begin perform public.get_frozen_budget_prices(v_snap); raise exception 'Org B: get_frozen permitido';
  exception when insufficient_privilege then null; end;
  begin perform public.freeze_budget_prices('20000000-0000-0000-0000-000000000001', v_org); raise exception 'Org B: freeze permitido';
  exception when insufficient_privilege then null; end;
  begin perform public.publish_price_observations(v_org, array[gen_random_uuid()], 'AMBA', false, 'LISTA'); raise exception 'Org B: publish permitido';
  exception when insufficient_privilege then null; end;
  -- FROZEN de Org B apuntando al snapshot de Org A, con su propia org válida → 42501 (snapshot no accesible)
  begin perform public.resolve_reference_price('10000000-0000-0000-0000-000000000002', p_component_id => '90000000-0000-0000-0000-000000000001', p_mode => 'FROZEN', p_snapshot_id => v_snap);
    raise exception 'Org B: FROZEN sobre snapshot ajeno permitido';
  exception when insufficient_privilege then null; end;
  raise notice 'Org B OK (RLS vacía en 7 tablas; resolve/get_frozen/freeze/publish/FROZEN → 42501)';
end $$;

-- --------------------------------------------------------------------------- usuario sin membresía (cccc)
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000cccc';
set local request.jwt.claim.role = 'authenticated';
do $$
declare v_snap uuid := current_setting('precios.snapshot_id')::uuid; v_org uuid := '10000000-0000-0000-0000-000000000001';
begin
  if exists (select 1 from public.price_observations) or exists (select 1 from public.supplier_products)
     or exists (select 1 from public.budget_cost_snapshot_prices) or exists (select 1 from public.budget_cost_snapshots) then
    raise exception 'usuario sin membresía ve datos';
  end if;
  begin perform public.resolve_reference_price(v_org, p_master_material_id => '30000000-0000-0000-0000-000000000001'); raise exception 'sin membresía: resolve permitido';
  exception when insufficient_privilege then null; end;
  begin perform public.get_frozen_budget_prices(v_snap); raise exception 'sin membresía: get_frozen permitido';
  exception when insufficient_privilege then null; end;
  begin perform public.freeze_budget_prices('20000000-0000-0000-0000-000000000001', v_org); raise exception 'sin membresía: freeze permitido';
  exception when insufficient_privilege then null; end;
  begin perform public.publish_price_observations(v_org, array[gen_random_uuid()], 'AMBA', false, 'LISTA'); raise exception 'sin membresía: publish permitido';
  exception when insufficient_privilege then null; end;
  begin perform public.approve_supplier_mapping(v_org, '40000000-0000-0000-0000-000000000001', 'CEM-1', '30000000-0000-0000-0000-000000000001', 1); raise exception 'sin membresía: approve permitido';
  exception when insufficient_privilege then null; end;
  raise notice 'sin membresía OK (RLS vacía; resolve/get_frozen/freeze/publish/approve → 42501)';
end $$;

-- --------------------------------------------------------------------------- viewer de Org A: lee el congelado, no puede congelar ni publicar
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aaa3';
set local request.jwt.claim.role = 'authenticated';
do $$
declare v_snap uuid := current_setting('precios.snapshot_id')::uuid; r public.resolved_reference_price;
begin
  if (select count(*) from public.budget_cost_snapshot_prices where snapshot_id = v_snap) <> 4 then raise exception 'viewer no lee el detalle congelado'; end if;
  if (select count(*) from public.get_frozen_budget_prices(v_snap)) <> 4 then raise exception 'viewer: get_frozen_budget_prices falló'; end if;
  if (select count(*) from public.price_observations where publication_status = 'published') <> 9 then raise exception 'viewer no lee las 9 publicadas'; end if;
  r := public.resolve_reference_price('10000000-0000-0000-0000-000000000001', p_component_id => '90000000-0000-0000-0000-000000000001', p_mode => 'FROZEN', p_snapshot_id => v_snap);
  if r.price <> 1100 then raise exception 'viewer FROZEN: %', r.price; end if;
  begin perform public.publish_price_observations('10000000-0000-0000-0000-000000000001', array[gen_random_uuid()], 'AMBA', false, 'LISTA'); raise exception 'viewer publicó';
  exception when insufficient_privilege then null; end;
  begin perform public.freeze_budget_prices('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'); raise exception 'viewer congeló';
  exception when insufficient_privilege then null; end;
  begin perform public.invalidate_price_observation('10000000-0000-0000-0000-000000000001', (select id from public.price_observations order by id limit 1), 'x'); raise exception 'viewer invalidó';
  exception when insufficient_privilege then null; end;
  raise notice 'viewer OK (lee detalle congelado y FROZEN; publish/freeze/invalidate → 42501)';
end $$;

rollback;
