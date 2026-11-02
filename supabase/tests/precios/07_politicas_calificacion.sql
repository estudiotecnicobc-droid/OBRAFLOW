-- Auditoría automática de políticas RLS de las tablas de precios: patrón "columna sin calificar
-- dentro de EXISTS" (bug clásico: `p.organization_id = organization_id` dentro del subquery se
-- resuelve contra la tabla interna y la condición se vuelve tautológica).
--
-- Cómo se ve el bug en pg_policies: el deparser de Postgres califica TODAS las columnas dentro de un
-- subquery correlacionado, así que la forma literal "organization_id sin prefijo dentro de EXISTS" casi
-- no aparece; el bug se manifiesta como una comparación consigo misma: `p.organization_id = p.organization_id`.
-- Por eso se aplican dos detectores sobre qual / with_check:
--   D1 (literal):   `organization_id` sin prefijo de tabla/alias dentro del texto que sigue al primer EXISTS.
--   D2 (semántico): autocomparación `<alias>.<col> = <alias>.<col>` (mismo alias y misma columna) en cualquier parte.
-- Falsos positivos conocidos de D1: ninguno en las tablas auditadas (un `organization_id` sin prefijo fuera de
-- EXISTS, p. ej. `is_org_member(organization_id)` al inicio de la expresión, es legítimo y queda fuera del corte).
\set ON_ERROR_STOP 1
do $$
declare
  v_tables text[] := array['project_price_overrides','price_suppliers','supplier_products','price_observations',
                           'price_import_batches','price_import_rows','budget_cost_snapshots','budget_cost_snapshot_prices','budget_versions',
                           'supplier_product_mapping_history'];
  p record; v_expr text; v_tail text; v_bad text[] := '{}'; v_checked int := 0; v_exists int := 0;
  -- D1: organization_id precedido de algo que no sea "." ni carácter de identificador
  c_unqualified constant text := '(^|[^.[:alnum:]_])organization_id([^[:alnum:]_]|$)';
  -- D2: alias.col = alias.col (misma referencia a ambos lados)
  c_tautology  constant text := '([[:alnum:]_]+)\.([[:alnum:]_]+)\s*=\s*\1\.\2([^[:alnum:]_]|$)';
begin
  for p in
    select pol.tablename, pol.policyname, pol.cmd, pol.qual, pol.with_check
    from pg_policies pol
    where pol.schemaname = 'public' and pol.tablename = any(v_tables)
    order by pol.tablename, pol.policyname
  loop
    v_checked := v_checked + 1;
    foreach v_expr in array array[coalesce(p.qual, ''), coalesce(p.with_check, '')] loop
      if v_expr = '' then continue; end if;
      if v_expr ~* '\mEXISTS\M' then
        v_exists := v_exists + 1;
        v_tail := substr(v_expr, position('EXISTS' in upper(v_expr)));
        if v_tail ~ c_unqualified then
          v_bad := v_bad || format('%s.%s [%s] D1 organization_id sin calificar dentro de EXISTS: %s',
                                   p.tablename, p.policyname, p.cmd, regexp_replace(v_tail, '\s+', ' ', 'g'));
        end if;
      end if;
      if v_expr ~ c_tautology then
        v_bad := v_bad || format('%s.%s [%s] D2 autocomparación tautológica: %s',
                                 p.tablename, p.policyname, p.cmd, regexp_replace(v_expr, '\s+', ' ', 'g'));
      end if;
    end loop;
  end loop;
  if v_checked = 0 then raise exception 'no se encontraron políticas en las tablas auditadas'; end if;
  if cardinality(v_bad) > 0 then
    raise exception E'políticas RLS con columnas sin calificar / tautologías:\n%', array_to_string(v_bad, E'\n');
  end if;
  raise notice 'auditoría de políticas OK (% políticas en % tablas; % expresiones con EXISTS; sin organization_id sin calificar ni autocomparaciones)',
    v_checked, cardinality(v_tables), v_exists;
end $$;

-- Autoverificación de los detectores: una política deliberadamente defectuosa debe ser detectada (se revierte).
begin;
create table public.zz_qa_audit (id uuid, organization_id uuid, project_id uuid);
alter table public.zz_qa_audit enable row level security;
create policy zz_bug on public.zz_qa_audit for select to authenticated
  using (exists (select 1 from public.projects p where p.id = zz_qa_audit.project_id and p.organization_id = organization_id));
create policy zz_ok on public.zz_qa_audit for select to authenticated
  using (is_org_member(organization_id) and exists (select 1 from public.projects p where p.id = zz_qa_audit.project_id and p.organization_id = zz_qa_audit.organization_id));
do $$
declare v_bug text; v_ok text;
  c_tautology constant text := '([[:alnum:]_]+)\.([[:alnum:]_]+)\s*=\s*\1\.\2([^[:alnum:]_]|$)';
  c_unqualified constant text := '(^|[^.[:alnum:]_])organization_id([^[:alnum:]_]|$)';
begin
  select qual into v_bug from pg_policies where tablename = 'zz_qa_audit' and policyname = 'zz_bug';
  select qual into v_ok  from pg_policies where tablename = 'zz_qa_audit' and policyname = 'zz_ok';
  if v_bug !~ c_tautology then raise exception 'D2 no detectó la política defectuosa: %', v_bug; end if;
  if v_ok ~ c_tautology then raise exception 'D2 marcó una política correcta: %', v_ok; end if;
  if substr(v_ok, position('EXISTS' in upper(v_ok))) ~ c_unqualified then raise exception 'D1 marcó una política correcta: %', v_ok; end if;
  raise notice 'autoverificación OK (D2 detecta `p.organization_id = p.organization_id`; D1/D2 no marcan la política correcta)';
end $$;
rollback;
