-- Verifica el resultado de las dos aprobaciones paralelas (06c): una sola equivalencia, 3 filas reencoladas
-- en total, el aprobador es uno de los dos usuarios y no hubo violación de unique (lo revisa run.sh en la salida).
\set ON_ERROR_STOP 1
do $$
declare n int; q int; sp record;
begin
  select count(*) into n from public.supplier_products where supplier_sku = 'SKU-C';
  if n <> 1 then raise exception 'concurrencia: % filas en supplier_products para SKU-C', n; end if;
  select * into sp from public.supplier_products where supplier_sku = 'SKU-C';
  if sp.approved_by not in ('0c000000-0000-0000-0000-00000000aaaa', '0c000000-0000-0000-0000-00000000aaa2') or sp.status <> 'approved' then
    raise exception 'concurrencia: aprobador inesperado %', sp.approved_by;
  end if;
  select count(*) into q from public.price_import_rows where batch_id = '0c000000-0000-0000-0000-000000000006' and processing_status = 'raw';
  if q <> 3 or exists (select 1 from public.price_import_rows where batch_id = '0c000000-0000-0000-0000-000000000006' and processing_status <> 'raw') then
    raise exception 'concurrencia: las 3 filas debían quedar en raw, hay % raw', q;
  end if;
  raise notice 'concurrencia OK (2 sesiones paralelas → 1 supplier_products, 3 filas reencoladas, aprobador = %)',
    case sp.approved_by when '0c000000-0000-0000-0000-00000000aaaa' then 'owner' else 'editor' end;
end $$;
