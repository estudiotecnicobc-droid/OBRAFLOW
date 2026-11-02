-- Motor de precios (20261102100008/9): observaciones publicadas, mediana por proveedor,
-- DESACTUALIZADO, CATALOG_UNVERIFIED, AS_OF histórico, congelado por componente y FROZEN.
-- Corre dentro de una transacción que se revierte.
\set ON_ERROR_STOP 1
begin;

-- --------------------------------------------------------------------------- datos base
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000aaaa'), ('00000000-0000-0000-0000-00000000bbbb'), ('00000000-0000-0000-0000-00000000cccc');
insert into public.organizations (id, name) values ('10000000-0000-0000-0000-000000000001', 'Org A'), ('10000000-0000-0000-0000-000000000002', 'Org B');
insert into public.organization_members (organization_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000aaaa', 'owner'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000bbbb', 'owner'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000cccc', 'editor');
insert into public.projects (id, organization_id, name, start_date, currency) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Obra', current_date, 'ARS'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Obra 2', current_date, 'ARS');
-- M1: tres proveedores; M2: observación vieja; M3: solo pendiente; M4: publicada e invalidada después
insert into public.master_materials (id, organization_id, name, unit, unit_price, currency) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Cemento', 'bolsa', 1000, 'ARS'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Cal', 'bolsa', 600, 'ARS'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Arena', 'm3', 700, 'ARS'),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Hierro', 'kg', 800, 'ARS');
insert into public.price_suppliers (id, organization_id, name, external_code) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Corralón 1', 'C1'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Corralón 2', 'C2'),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Corralón 3', 'C3');
-- Un supplier_product por (proveedor, material); INSERT directo revocado → como superusuario.
insert into public.supplier_products (id, organization_id, supplier_id, supplier_sku, master_material_id, unit_factor, supplier_unit, expected_currency, approved_by)
select ('5000000' || s.n || '-0000-0000-0000-00000000000' || m.n)::uuid, '10000000-0000-0000-0000-000000000001',
       ('40000000-0000-0000-0000-00000000000' || s.n)::uuid, 'SKU-' || s.n || '-' || m.n,
       ('30000000-0000-0000-0000-00000000000' || m.n)::uuid, 1, 'bolsa', 'ARS', '00000000-0000-0000-0000-00000000aaaa'
from generate_series(1, 3) s(n) cross join generate_series(1, 4) m(n);
insert into storage.buckets (id, name) values ('price_imports', 'price_imports') on conflict do nothing;
insert into public.price_import_batches (id, organization_id, created_by, storage_path, storage_object_id, source_format, size_bytes, status)
  values ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000aaaa',
          '10000000-0000-0000-0000-000000000001/lote.csv', '60000000-0000-0000-0000-00000000f001', 'csv', 10, 'raw_ready');

create function pg_temp.add_obs(p_id uuid, p_sup int, p_mat int, p_price numeric, p_observed date) returns void
language plpgsql as $$
declare v_row bigint;
begin
  select coalesce(max(row_number), 0) + 1 into v_row from public.price_import_rows where batch_id = '60000000-0000-0000-0000-000000000001';
  insert into public.price_import_rows (batch_id, organization_id, row_number, raw_cells, processing_status)
    values ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', v_row, '[]'::jsonb, 'mapped');
  insert into public.price_observations (id, organization_id, supplier_id, supplier_product_id, master_material_id, batch_id, row_number,
    supplier_sku, original_price, original_unit, unit_factor, normalized_price, currency, observed_on, raw_cells)
  values (p_id, '10000000-0000-0000-0000-000000000001', ('40000000-0000-0000-0000-00000000000' || p_sup)::uuid,
    ('5000000' || p_sup || '-0000-0000-0000-00000000000' || p_mat)::uuid, ('30000000-0000-0000-0000-00000000000' || p_mat)::uuid,
    '60000000-0000-0000-0000-000000000001', v_row, 'SKU-' || p_sup || '-' || p_mat, p_price, 'bolsa', 1, p_price, 'ARS', p_observed, '[]'::jsonb);
end $$;

-- M1: S1 900 (hace 20 días, superada) y 1000 (hace 2); S2 1100 (hace 5); S3 1300 (ayer) → mediana 1100
select pg_temp.add_obs('70000000-0000-0000-0000-000000000011', 1, 1, 900,  current_date - 20);
select pg_temp.add_obs('70000000-0000-0000-0000-000000000012', 1, 1, 1000, current_date - 2);
select pg_temp.add_obs('70000000-0000-0000-0000-000000000021', 2, 1, 1100, current_date - 5);
select pg_temp.add_obs('70000000-0000-0000-0000-000000000031', 3, 1, 1300, current_date - 1);
-- M2: una sola observación de 45 días
select pg_temp.add_obs('70000000-0000-0000-0000-000000000201', 1, 2, 650, current_date - 45);
-- M3: queda pendiente (no se publica)
select pg_temp.add_obs('70000000-0000-0000-0000-000000000301', 1, 3, 999, current_date - 1);
-- M4: publicada el día D = hoy-20, invalidada el día D+10
select pg_temp.add_obs('70000000-0000-0000-0000-000000000401', 1, 4, 500, current_date - 20);

-- APU T con dos componentes (M1 ×2 +10 % desperdicio; M3 ×1) usado por dos ítems del presupuesto
insert into public.master_tasks (id, organization_id, name, unit) values
  ('80000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Mampostería', 'm2'),
  ('80000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Otra tarea', 'm2');
insert into public.master_task_materials (id, master_task_id, master_material_id, material_name, unit, quantity, waste_percent) values
  ('90000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Cemento', 'bolsa', 2, 10),
  ('90000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'Arena', 'm3', 1, 0),
  ('90000000-0000-0000-0000-000000000003', '80000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'Cal', 'bolsa', 1, 0);
-- APU T2 (Obra 2): Cal (M2, bolsa) pedida en 'kg' → UNIT_MISMATCH; más un componente anidado
insert into public.master_task_materials (id, master_task_id, master_material_id, material_name, unit, quantity, waste_percent, sub_master_task_id) values
  ('90000000-0000-0000-0000-000000000004', '80000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'Cal', 'kg', 1, 0, null),
  ('90000000-0000-0000-0000-000000000005', '80000000-0000-0000-0000-000000000002', null, 'Sub APU', 'm2', 1, 0, '80000000-0000-0000-0000-000000000001');
delete from public.master_task_materials where id = '90000000-0000-0000-0000-000000000003';
insert into public.tasks (id, organization_id, master_task_id, name, unit) values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'Mampostería', 'm2'),
  ('a0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000002', 'Otra tarea', 'm2');
insert into public.budget_items (id, project_id, organization_id, task_id, quantity) values
  ('b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 10),
  ('b0000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 5),
  ('b0000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 2);

-- --------------------------------------------------------------------------- publicación (usuario A)
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aaaa';
set local request.jwt.claim.role = 'authenticated';
do $$
declare n int; r public.resolved_reference_price;
begin
  -- sin publicar: catálogo con CATALOG_UNVERIFIED
  r := public.resolve_reference_price('10000000-0000-0000-0000-000000000001',
        p_master_material_id => '30000000-0000-0000-0000-000000000001', p_project_id => '20000000-0000-0000-0000-000000000001');
  if r.source <> 'ORG_MASTER' or r.price <> 1000 or r.price_status <> 'CATALOG_UNVERIFIED'
     or not ('CATALOG_UNVERIFIED' = any(r.warnings)) or ('MASTER_PRICE_NOT_MARKET_VERIFIED' = any(r.warnings)) then
    raise exception 'sin observaciones publicadas: % % %', r.source, r.price_status, r.warnings;
  end if;
  -- publicar exige atributos declarados
  begin
    perform public.publish_price_observations('10000000-0000-0000-0000-000000000001',
      array['70000000-0000-0000-0000-000000000011']::uuid[], 'DESCONOCIDA', false, 'LISTA');
    raise exception 'publish aceptó region DESCONOCIDA';
  exception when invalid_parameter_value then null;
  end;
  n := public.publish_price_observations('10000000-0000-0000-0000-000000000001', array[
    '70000000-0000-0000-0000-000000000011','70000000-0000-0000-0000-000000000012','70000000-0000-0000-0000-000000000021',
    '70000000-0000-0000-0000-000000000031','70000000-0000-0000-0000-000000000201','70000000-0000-0000-0000-000000000401']::uuid[],
    'AMBA', false, 'LISTA');
  if n <> 6 then raise exception 'publish devolvió %', n; end if;
  -- id de otra org / inexistente → 42501
  begin
    perform public.publish_price_observations('10000000-0000-0000-0000-000000000001',
      array['70000000-0000-0000-0000-00000000ffff']::uuid[], 'AMBA', false, 'LISTA');
    raise exception 'publish aceptó un id ajeno';
  exception when insufficient_privilege then null;
  end;
  -- publicar una ya publicada → 22023 (nada se publica a medias)
  begin
    perform public.publish_price_observations('10000000-0000-0000-0000-000000000001',
      array['70000000-0000-0000-0000-000000000011','70000000-0000-0000-0000-000000000301']::uuid[], 'AMBA', false, 'LISTA');
    raise exception 'publish aceptó una observación ya publicada';
  exception when invalid_parameter_value then null;
  end;
  if (select publication_status from public.price_observations where id = '70000000-0000-0000-0000-000000000301') <> 'pending' then
    raise exception 'publish parcial: la pendiente del lote rechazado cambió de estado';
  end if;
  -- UPDATE directo (editor/owner) sin pasar por la RPC: sin privilegio UPDATE → 42501
  begin
    update public.price_observations set publication_status = 'published'
      where id = '70000000-0000-0000-0000-000000000301';
    raise exception 'UPDATE directo sobre price_observations no falló';
  exception when insufficient_privilege then null;
  end;
  if (select publication_status from public.price_observations where id = '70000000-0000-0000-0000-000000000301') <> 'pending' then
    raise exception 'UPDATE directo cambió la observación';
  end if;
  -- invalidar M4 (hoy; después se retrodata a D+10)
  perform public.invalidate_price_observation('10000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000401', 'Lista errónea');
  raise notice 'publicación OK (6 publicadas, republicar 22023 sin efecto parcial, UPDATE directo 42501, DESCONOCIDA rechazada, id ajeno 42501, invalidación)';
end $$;

-- Retrodatar publicación e invalidación para los casos históricos (solo el harness puede: superusuario)
reset role;
update public.price_observations set published_at = observed_on::timestamptz where publication_status = 'published';
update public.price_observations set invalidated_at = (current_date - 10)::timestamptz where id = '70000000-0000-0000-0000-000000000401';

-- --------------------------------------------------------------------------- resolución (usuario A)
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aaaa';
set local request.jwt.claim.role = 'authenticated';
do $$
declare r public.resolved_reference_price; o record;
begin
  -- CURRENT: mediana por proveedor (1000, 1100, 1300) = 1100; la 900 de S1 queda superada
  r := public.resolve_reference_price('10000000-0000-0000-0000-000000000001',
        p_master_material_id => '30000000-0000-0000-0000-000000000001', p_project_id => '20000000-0000-0000-0000-000000000001');
  if r.source <> 'SUPPLIER_OBSERVED' or r.price <> 1100 or r.price_status <> 'RELEVADO' or not r.is_usable
     or r.observation_count <> 4 or r.reference_id <> '70000000-0000-0000-0000-000000000031'
     or r.effective_date <> current_date - 1 then
    raise exception 'CURRENT SUPPLIER_OBSERVED: % % % % % %', r.source, r.price, r.price_status, r.observation_count, r.reference_id, r.effective_date;
  end if;
  if r.resolution->>'method' <> 'median_by_supplier' or (r.resolution->>'supplier_count')::int <> 3
     or jsonb_array_length(r.resolution->'observation_ids') <> 3
     or not (r.resolution->'observation_ids') ? '70000000-0000-0000-0000-000000000012'
     or (r.resolution->'observation_ids') ? '70000000-0000-0000-0000-000000000011'
     or r.resolution->'filters'->>'region' <> 'AMBA' or r.resolution->'filters'->>'currency' <> 'ARS' then
    raise exception 'resolution: %', r.resolution;
  end if;
  -- mediana par en numeric: (1000+1100)/2 = 1050 con dos proveedores
  select * into o from public.resolve_observed_price('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
    current_date - 2, 'AMBA', 'ARS', false, 'LISTA', 90);
  if o.price <> 1050 or o.supplier_count <> 2 or o.price_status <> 'RELEVADO' then
    raise exception 'mediana par: % % %', o.price, o.supplier_count, o.price_status;
  end if;
  -- unidad incompatible → no usable, pero sigue informando el precio
  r := public.resolve_reference_price('10000000-0000-0000-0000-000000000001',
        p_master_material_id => '30000000-0000-0000-0000-000000000001', p_required_unit => 'kg');
  if r.is_usable or not ('UNIT_MISMATCH' = any(r.warnings)) then raise exception 'UNIT_MISMATCH no marcó is_usable=false'; end if;
  -- 45 días: DESACTUALIZADO + OBSERVATION_STALE
  r := public.resolve_reference_price('10000000-0000-0000-0000-000000000001',
        p_master_material_id => '30000000-0000-0000-0000-000000000002');
  if r.source <> 'SUPPLIER_OBSERVED' or r.price <> 650 or r.price_status <> 'DESACTUALIZADO'
     or not ('OBSERVATION_STALE' = any(r.warnings)) or not r.is_usable then
    raise exception 'DESACTUALIZADO: % % % %', r.source, r.price, r.price_status, r.warnings;
  end if;
  -- solo pendiente → catálogo
  r := public.resolve_reference_price('10000000-0000-0000-0000-000000000001',
        p_master_material_id => '30000000-0000-0000-0000-000000000003');
  if r.source <> 'ORG_MASTER' or r.price <> 700 or r.price_status <> 'CATALOG_UNVERIFIED' then
    raise exception 'pendiente no debe alimentar la mediana: % %', r.source, r.price;
  end if;
  -- AS_OF hace 10 días: solo S1 900 (hace 20) estaba publicada → reproduce el histórico
  r := public.resolve_reference_price('10000000-0000-0000-0000-000000000001',
        p_master_material_id => '30000000-0000-0000-0000-000000000001', p_project_id => '20000000-0000-0000-0000-000000000001',
        p_effective_date => current_date - 10, p_mode => 'AS_OF');
  if r.source <> 'SUPPLIER_OBSERVED' or r.price <> 900 or r.reference_id <> '70000000-0000-0000-0000-000000000011'
     or r.effective_date <> current_date - 20 then
    raise exception 'AS_OF histórico: % % %', r.source, r.price, r.reference_id;
  end if;
  -- M4: publicada en D=hoy-20, invalidada en D+10. AS_OF D+5 la usa; CURRENT no.
  r := public.resolve_reference_price('10000000-0000-0000-0000-000000000001',
        p_master_material_id => '30000000-0000-0000-0000-000000000004',
        p_effective_date => current_date - 15, p_mode => 'AS_OF');
  if r.source <> 'SUPPLIER_OBSERVED' or r.price <> 500 then raise exception 'AS_OF antes de invalidar: % %', r.source, r.price; end if;
  r := public.resolve_reference_price('10000000-0000-0000-0000-000000000001',
        p_master_material_id => '30000000-0000-0000-0000-000000000004',
        p_effective_date => current_date - 5, p_mode => 'AS_OF');
  if r.source = 'SUPPLIER_OBSERVED' then raise exception 'AS_OF después de invalidar usó la observación'; end if;
  r := public.resolve_reference_price('10000000-0000-0000-0000-000000000001',
        p_master_material_id => '30000000-0000-0000-0000-000000000004');
  if r.source <> 'ORG_MASTER' or r.price <> 800 or r.price_status <> 'CATALOG_UNVERIFIED' then
    raise exception 'CURRENT tras invalidar: % %', r.source, r.price;
  end if;
  -- FROZEN sin snapshot → 22023; firma vieja de 9 args eliminada
  begin
    perform public.resolve_reference_price('10000000-0000-0000-0000-000000000001',
      p_component_id => '90000000-0000-0000-0000-000000000001', p_mode => 'FROZEN');
    raise exception 'FROZEN sin snapshot no falló';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'resolución OK (mediana impar/par, superada por proveedor, UNIT_MISMATCH, DESACTUALIZADO, pendiente, AS_OF, invalidación histórica)';
end $$;

-- --------------------------------------------------------------------------- congelado (usuario A)
do $$
declare f jsonb; r public.resolved_reference_price; v_snap uuid; n int; v_status text;
begin
  f := public.freeze_budget_prices('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001');
  v_snap := (f->>'snapshotId')::uuid;
  perform set_config('precios.snapshot_id', v_snap::text, true);
  -- 2 ítems × 2 componentes; C1 (M1) con mediana 1100: 2×1,1×(10+5)×1100 = 36.300; C2 (M3) 700×15 = 10.500 → 46.800
  -- legacy usa master_materials.unit_price 1000 → 33.000 + 10.500 = 43.500 → diverge 3.300
  if (f->>'itemCount')::int <> 2 or (f->>'componentCount')::int <> 4 or (f->>'unusableCount')::int <> 0
     or (f->>'materialsTotal')::numeric <> 46800 or (f->>'legacyMaterialsTotal')::numeric <> 43500
     or (f->>'divergence')::numeric <> 3300 or f->>'status' <> 'pending_reconciliation'
     or not (f->>'legacyDivergence')::boolean or (f->>'incomplete')::boolean or (f->>'unusableAmount')::numeric <> 0
     or not (f->'warnings') ? 'TOTALS_DIVERGE_FROM_LEGACY_ENGINE' or f->>'scope' <> 'materials_only' then
    raise exception 'freeze_budget_prices: %', f;
  end if;
  select count(*), min(reference_pricing_status) into n, v_status from public.budget_cost_snapshots where id = v_snap;
  if n <> 1 or v_status <> 'pending_reconciliation' then raise exception 'cabecera: % %', n, v_status; end if;
  if (select (result->'reference_pricing'->>'scope') from public.budget_cost_snapshots where id = v_snap) <> 'materials_only'
     or (select (result->'reference_pricing'->>'status') from public.budget_cost_snapshots where id = v_snap) <> 'pending_reconciliation'
     or (select (result->'totals'->>'material')::numeric from public.budget_cost_snapshots where id = v_snap) <> 43500 then
    raise exception 'result.reference_pricing / result.totals inconsistentes';
  end if;
  -- componente repetido en dos ítems: dos filas con el mismo component_id y distinto budget_item_id
  select count(*) into n from public.get_frozen_budget_prices(v_snap) where component_id = '90000000-0000-0000-0000-000000000001';
  if n <> 2 then raise exception 'componente repetido: % filas', n; end if;
  select count(distinct budget_item_id) into n from public.get_frozen_budget_prices(v_snap) where component_id = '90000000-0000-0000-0000-000000000001';
  if n <> 2 then raise exception 'componente repetido sin distintos budget_item_id'; end if;
  if (select count(*) from public.get_frozen_budget_prices(v_snap)) <> 4 then raise exception 'detalle incompleto'; end if;
  if exists (select 1 from public.get_frozen_budget_prices(v_snap) p where p.component_id = '90000000-0000-0000-0000-000000000001'
             and (p.unit_price <> 1100 or p.source <> 'SUPPLIER_OBSERVED' or p.resolution->>'method' <> 'median_by_supplier'
                  or p.quantity not in (22, 11) or p.supplier_unit_factor <> 1 or p.apu_conversion_factor <> 1)) then
    raise exception 'detalle congelado de C1 incorrecto';
  end if;
  if exists (select 1 from public.get_frozen_budget_prices(v_snap) p where p.component_id = '90000000-0000-0000-0000-000000000002'
             and (p.source <> 'ORG_MASTER' or p.supplier_unit_factor is not null)) then
    raise exception 'supplier_unit_factor debe ser NULL fuera de SUPPLIER_OBSERVED';
  end if;
  -- Obra 2: UNIT_MISMATCH (no usable, no suma) + anidado → partial, incomplete y además divergencia
  f := public.freeze_budget_prices('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001');
  -- Cal: 2 × 650 (observación) no usable → unusableAmount 1300, materialsTotal 0; legacy 2 × 600 = 1200
  if (f->>'componentCount')::int <> 1 or (f->>'unusableCount')::int <> 1 or (f->>'nestedSkippedCount')::int <> 1
     or (f->>'materialsTotal')::numeric <> 0 or (f->>'unusableAmount')::numeric <> 1300
     or (f->>'legacyMaterialsTotal')::numeric <> 1200 or f->>'status' <> 'partial'
     or not (f->>'incomplete')::boolean or not (f->>'legacyDivergence')::boolean
     or not (f->'warnings') ? 'UNUSABLE_COMPONENT_PRICES' or not (f->'warnings') ? 'NESTED_APU_SKIPPED'
     or not (f->'warnings') ? 'TOTALS_DIVERGE_FROM_LEGACY_ENGINE' then
    raise exception 'freeze Obra 2: %', f;
  end if;
  if (select reference_pricing_status from public.budget_cost_snapshots where id = (f->>'snapshotId')::uuid) <> 'partial'
     or (select result->'reference_pricing'->>'unusableAmount' from public.budget_cost_snapshots where id = (f->>'snapshotId')::uuid)::numeric <> 1300 then
    raise exception 'cabecera Obra 2 inconsistente';
  end if;
  if not exists (select 1 from public.get_frozen_budget_prices((f->>'snapshotId')::uuid) p
                 where p.component_id = '90000000-0000-0000-0000-000000000004' and not p.is_usable
                   and 'UNIT_MISMATCH' = any(p.warnings) and p.unit_price = 650) then
    raise exception 'detalle Obra 2: falta la fila UNIT_MISMATCH';
  end if;
  raise notice 'freeze_budget_prices OK (cabecera + 4 filas, componente repetido, factores, pending_reconciliation; Obra 2 partial con UNIT_MISMATCH, anidado y divergencia)';
end $$;

-- Nueva observación más cara de S2 (hoy): CURRENT cambia (1000, 1300, 5000 → 1300); FROZEN no.
reset role;
select pg_temp.add_obs('70000000-0000-0000-0000-000000000022', 2, 1, 5000, current_date);
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aaaa';
set local request.jwt.claim.role = 'authenticated';
do $$
declare r public.resolved_reference_price; v_snap uuid := current_setting('precios.snapshot_id')::uuid; n int;
begin
  n := public.publish_price_observations('10000000-0000-0000-0000-000000000001',
    array['70000000-0000-0000-0000-000000000022']::uuid[], 'AMBA', false, 'LISTA');
  if n <> 1 then raise exception 'publicación nueva: %', n; end if;
  r := public.resolve_reference_price('10000000-0000-0000-0000-000000000001',
        p_component_id => '90000000-0000-0000-0000-000000000001', p_project_id => '20000000-0000-0000-0000-000000000001');
  if r.source <> 'SUPPLIER_OBSERVED' or r.price <> 1300 then raise exception 'CURRENT tras nueva observación: % %', r.source, r.price; end if;
  r := public.resolve_reference_price('10000000-0000-0000-0000-000000000001',
        p_component_id => '90000000-0000-0000-0000-000000000001', p_project_id => '20000000-0000-0000-0000-000000000001',
        p_mode => 'FROZEN', p_snapshot_id => v_snap);
  if r.source <> 'FROZEN_SNAPSHOT' or r.price <> 1100 or r.price_status <> 'FROZEN' or not r.is_usable
     or r.resolution->>'original_source' <> 'SUPPLIER_OBSERVED'
     or jsonb_array_length(r.resolution->'frozen_price_ids') <> 2 then
    raise exception 'FROZEN: % % % %', r.source, r.price, r.price_status, r.resolution;
  end if;
  -- con cada budget_item_id devuelve su fila
  r := public.resolve_reference_price('10000000-0000-0000-0000-000000000001',
        p_component_id => '90000000-0000-0000-0000-000000000001', p_project_id => '20000000-0000-0000-0000-000000000001',
        p_mode => 'FROZEN', p_snapshot_id => v_snap, p_budget_item_id => 'b0000000-0000-0000-0000-000000000002');
  if r.price <> 1100 or (r.resolution->>'budget_item_id')::uuid <> 'b0000000-0000-0000-0000-000000000002'
     or jsonb_array_length(r.resolution->'frozen_price_ids') <> 1 then
    raise exception 'FROZEN por ítem: %', r.resolution;
  end if;
  r := public.resolve_reference_price('10000000-0000-0000-0000-000000000001',
        p_component_id => '90000000-0000-0000-0000-000000000001', p_mode => 'FROZEN', p_snapshot_id => v_snap,
        p_budget_item_id => gen_random_uuid());
  if r.source <> 'NO_PRICE' or not ('FROZEN_PRICE_MISSING' = any(r.warnings)) then raise exception 'FROZEN ítem inexistente'; end if;
  -- componente que no está en el snapshot → NO_PRICE + FROZEN_PRICE_MISSING, nunca precio actual
  r := public.resolve_reference_price('10000000-0000-0000-0000-000000000001',
        p_component_id => '90000000-0000-0000-0000-000000000004', p_mode => 'FROZEN', p_snapshot_id => v_snap);
  if r.source <> 'NO_PRICE' or r.price is not null or not ('FROZEN_PRICE_MISSING' = any(r.warnings)) or r.price_status <> 'SIN_PRECIO' then
    raise exception 'FROZEN faltante: % % %', r.source, r.price, r.warnings;
  end if;
  -- snapshot de otro proyecto/org → 42501
  begin
    perform public.resolve_reference_price('10000000-0000-0000-0000-000000000001',
      p_component_id => '90000000-0000-0000-0000-000000000001', p_mode => 'FROZEN', p_snapshot_id => gen_random_uuid());
    raise exception 'FROZEN con snapshot inexistente no falló';
  exception when insufficient_privilege then null;
  end;
  -- borrar el snapshot congelado (owner) falla
  begin
    delete from public.budget_cost_snapshots where id = v_snap;
    raise exception 'DELETE del snapshot congelado no falló';
  exception when object_in_use then null;
  end;
  raise notice 'FROZEN OK (no cambia con observación nueva, CURRENT sí, por ítem, faltante → FROZEN_PRICE_MISSING, DELETE bloqueado)';
end $$;

-- Filas del mismo componente con precios distintos (simulado como superusuario): sin budget_item_id → 22023
reset role;
update public.budget_cost_snapshot_prices set unit_price = 1150
  where snapshot_id = current_setting('precios.snapshot_id')::uuid and component_id = '90000000-0000-0000-0000-000000000001'
    and budget_item_id = 'b0000000-0000-0000-0000-000000000002';
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aaaa';
set local request.jwt.claim.role = 'authenticated';
do $$
declare r public.resolved_reference_price; v_snap uuid := current_setting('precios.snapshot_id')::uuid;
begin
  begin
    perform public.resolve_reference_price('10000000-0000-0000-0000-000000000001',
      p_component_id => '90000000-0000-0000-0000-000000000001', p_mode => 'FROZEN', p_snapshot_id => v_snap);
    raise exception 'FROZEN ambiguo no falló';
  exception when invalid_parameter_value then
    if sqlerrm not like 'FROZEN_AMBIGUOUS_COMPONENT%' then raise; end if;
  end;
  r := public.resolve_reference_price('10000000-0000-0000-0000-000000000001',
        p_component_id => '90000000-0000-0000-0000-000000000001', p_mode => 'FROZEN', p_snapshot_id => v_snap,
        p_budget_item_id => 'b0000000-0000-0000-0000-000000000002');
  if r.price <> 1150 then raise exception 'FROZEN por ítem tras divergencia: %', r.price; end if;
  raise notice 'FROZEN ambiguo OK (22023 sin budget_item_id; por ítem resuelve)';
end $$;

-- Editor de Org A: sin INSERT directo en cabecera ni detalle; get_frozen_budget_prices (INVOKER) sí lee
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000cccc';
set local request.jwt.claim.role = 'authenticated';
do $$
declare v_snap uuid := current_setting('precios.snapshot_id')::uuid;
begin
  begin
    insert into public.budget_cost_snapshots (project_id, organization_id, cost_date)
      values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', current_date);
    raise exception 'INSERT directo en budget_cost_snapshots no falló';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.budget_cost_snapshot_prices (snapshot_id, organization_id, project_id, budget_item_id, master_task_id, component_id,
      quantity, unit, unit_price, currency, source, price_status, created_by)
      values (v_snap, '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', gen_random_uuid(),
      '80000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 1, 'bolsa', 1, 'ARS', 'X', 'FROZEN', auth.uid());
    raise exception 'INSERT directo en budget_cost_snapshot_prices no falló';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.get_frozen_budget_prices(v_snap)) <> 4 then raise exception 'editor no lee el detalle congelado'; end if;
  if (select count(*) from public.budget_cost_snapshot_prices where snapshot_id = v_snap) <> 4 then raise exception 'RLS SELECT editor'; end if;
  raise notice 'editor OK (INSERT directo 42501 en cabecera y detalle; lectura por RPC y RLS)';
end $$;

-- Componente con material de otra org: el resolvedor lanza 42501 y el congelado se aborta sin dejar snapshot
reset role;
insert into public.master_materials (id, organization_id, name, unit, unit_price) values
  ('30000000-0000-0000-0000-000000000099', '10000000-0000-0000-0000-000000000002', 'Ajeno', 'kg', 10);
insert into public.master_tasks (id, organization_id, name, unit) values ('80000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Con ajeno', 'm2');
insert into public.master_task_materials (id, master_task_id, master_material_id, material_name, unit, quantity) values
  ('90000000-0000-0000-0000-000000000099', '80000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000099', 'Ajeno', 'kg', 1);
insert into public.tasks (id, organization_id, master_task_id, name, unit)
  values ('a0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000003', 'Con ajeno', 'm2');
insert into public.budget_items (project_id, organization_id, task_id, quantity) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 1);
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000aaaa';
set local request.jwt.claim.role = 'authenticated';
do $$
declare n int;
begin
  select count(*) into n from public.budget_cost_snapshots;
  begin
    perform public.freeze_budget_prices('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001');
    raise exception 'freeze con material ajeno no falló';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.budget_cost_snapshots) <> n then raise exception 'freeze abortado dejó snapshot'; end if;
  raise notice 'freeze abortado OK (42501 del resolvedor, sin snapshot)';
end $$;
reset role;
delete from public.budget_items where task_id = 'a0000000-0000-0000-0000-000000000003';

-- --------------------------------------------------------------------------- otra org (usuario B)
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000bbbb';
set local request.jwt.claim.role = 'authenticated';
do $$
declare v_snap uuid := current_setting('precios.snapshot_id')::uuid;
begin
  begin
    perform public.get_frozen_budget_prices(v_snap);
    raise exception 'get_frozen_budget_prices permitió cross-org';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.freeze_budget_prices('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001');
    raise exception 'freeze_budget_prices permitió cross-org';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.publish_price_observations('10000000-0000-0000-0000-000000000001',
      array['70000000-0000-0000-0000-000000000011']::uuid[], 'AMBA', false, 'LISTA');
    raise exception 'publish permitió cross-org';
  exception when insufficient_privilege then null;
  end;
  if exists (select 1 from public.budget_cost_snapshot_prices) then raise exception 'RLS: Org B ve detalle congelado de Org A'; end if;
  raise notice 'cross-org OK (get_frozen 42501, freeze 42501, publish 42501, RLS)';
end $$;

-- DELETE como superusuario también bloqueado (trigger, no RLS)
reset role;
do $$
begin
  begin
    delete from public.budget_cost_snapshots where id = current_setting('precios.snapshot_id')::uuid;
    raise exception 'DELETE del snapshot congelado (superusuario) no falló';
  exception when object_in_use then null;
  end;
end $$;

rollback;
