-- Consultas de SOLO LECTURA para regenerar supabase/tests/rls/01_schema_snapshot.sql desde producción.
-- Correr en el SQL editor de Supabase (o vía MCP execute_sql) y pegar cada resultado en la sección correspondiente.

-- 1) Tipos enum
select string_agg(format('create type public.%I as enum (%s);', ty.typname,
  (select string_agg(quote_literal(e.enumlabel), ',' order by e.enumsortorder) from pg_enum e where e.enumtypid = ty.oid)), E'\n')
from pg_type ty join pg_namespace n on n.oid = ty.typnamespace where n.nspname = 'public' and ty.typtype = 'e';

-- 2) Tablas (columnas + PK/UNIQUE)
select string_agg(format('create table public.%I (%s%s);', c.relname,
  (select string_agg(format('%I %s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
     case when a.attnotnull then ' not null' else '' end, coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), '')), ', ' order by a.attnum)
   from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped),
  coalesce((select ', ' || string_agg(pg_get_constraintdef(co.oid), ', ') from pg_constraint co where co.conrelid = c.oid and co.contype in ('p', 'u')), '')
), E'\n' order by c.relname)
from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r';

-- 3) Funciones usadas por las políticas
select string_agg(pg_get_functiondef(p.oid), E';\n' order by p.proname)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('is_org_member', 'is_org_member_with_role', 'is_org_admin', 'is_member_of_org', 'is_master_admin', 'get_my_organization_ids');

-- 4) Políticas
select string_agg(format('create policy %I on public.%I as %s for %s to %s%s%s;', policyname, tablename, permissive, cmd,
  array_to_string(roles, ', '), coalesce(' using (' || qual || ')', ''), coalesce(' with check (' || with_check || ')', '')), E'\n' order by tablename, policyname)
from pg_policies where schemaname = 'public';
