-- Comprobaciones mínimas tras aplicar 20261102100001..7: existen los objetos y la RLS está activa.
\set ON_ERROR_STOP 1
do $$
declare
  t text; f text; missing text[] := '{}';
begin
  foreach t in array array['project_price_overrides','price_import_batches','price_import_rows',
                           'price_suppliers','supplier_products','price_observations'] loop
    if to_regclass('public.' || t) is null then missing := missing || ('tabla ' || t); end if;
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public' and c.relname = t and c.relrowsecurity) then
      missing := missing || ('rls ' || t);
    end if;
  end loop;
  foreach f in array array[
    'public.resolve_reference_price(uuid,uuid,uuid,uuid,uuid,date,text,text,text)',
    'public.enqueue_price_import(uuid,text)',
    'public.price_import_poll()',
    'public.price_import_claim(uuid,bigint)',
    'public.price_import_commit_chunk(uuid,uuid,bigint,jsonb,bigint,boolean,jsonb,text)',
    'public.price_import_handle_failure(uuid,uuid,bigint,text,boolean,integer)',
    'public.price_import_defer(bigint,integer)',
    'public.price_import_archive(bigint)',
    'public.homologate_raw_price_rows(uuid,integer)',
    'public.configure_price_import_mapping(uuid,uuid,jsonb,date)',
    'public.requeue_pending_price_mappings(uuid)',
    'public.approve_supplier_mapping(uuid,uuid,text,uuid,numeric)'] loop
    if to_regprocedure(f) is null then missing := missing || ('función ' || f); end if;
  end loop;
  if to_regprocedure('public.price_import_claim(uuid)') is not null then
    missing := missing || 'price_import_claim(uuid) debería haber sido eliminada por 20261102100004';
  end if;
  if to_regtype('public.resolved_reference_price') is null then missing := missing || 'tipo resolved_reference_price'; end if;
  if not exists (select 1 from pgmq.meta where queue_name = 'price_imports') then missing := missing || 'cola pgmq price_imports'; end if;
  if not exists (select 1 from storage.buckets where id = 'price_imports' and not public) then missing := missing || 'bucket price_imports'; end if;
  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'price_imports_%') <> 6 then
    missing := missing || 'políticas storage.objects price_imports_* (se esperan 6)';
  end if;
  if (select count(*) from pg_policies where tablename = 'budget_versions' and policyname like 'budget_versions_project_%_guard') <> 3 then
    missing := missing || 'guardas RESTRICTIVE budget_versions (se esperan 3)';
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'price_import_batches' and column_name = 'active_msg_id') then
    missing := missing || 'columna price_import_batches.active_msg_id';
  end if;
  if coalesce(array_length(missing, 1), 0) > 0 then
    raise exception 'Faltan objetos: %', array_to_string(missing, '; ');
  end if;
  raise notice 'Verificación OK: tablas, funciones, tipo, cola, bucket y políticas presentes';
end $$;
