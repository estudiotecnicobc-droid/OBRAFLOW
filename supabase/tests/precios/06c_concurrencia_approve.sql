-- Una sesión: aprueba SKU-C como el usuario :uid (variable psql). Se lanza dos veces en paralelo desde run.sh.
-- pg_sleep alinea el arranque de ambas sesiones para que compitan por el advisory lock.
\set ON_ERROR_STOP 1
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'uid', true);
set local request.jwt.claim.role = 'authenticated';
select pg_sleep(0.3);
select mapping_id, queued_rows from public.approve_supplier_mapping('0c000000-0000-0000-0000-000000000001',
  '0c000000-0000-0000-0000-000000000004', 'SKU-C', '0c000000-0000-0000-0000-000000000003', 1);
commit;
