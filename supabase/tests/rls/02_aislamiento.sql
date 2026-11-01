-- T2 · Aislamiento entre empresas (RLS).
-- Siembra datos solo de la empresa B y comprueba, tabla por tabla, que:
--   · un usuario de la empresa A no pueda leer / modificar / borrar / insertar datos de B,
--   · un usuario anónimo no pueda leer nada de B,
--   · el dueño de B sí vea sus propios datos (control positivo, evita un test "vacío").
-- Falla (exit != 0) ante cualquier fuga nueva. Las fugas ya conocidas se listan en _t.conocidos:
-- si alguna se corrige, el test también falla para que se la saque de la lista.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

create schema _t;
grant usage on schema _t to public;

-- Inserta una fila completando columnas obligatorias sin default con valores de relleno.
create function _t.seed(p_table text, p_vals jsonb) returns void language plpgsql as $$
declare v_cols text; v_vals text;
begin
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum),
         string_agg(case
           when p_vals ? a.attname then format('%L::%s', p_vals->>a.attname, format_type(a.atttypid, a.atttypmod))
           when t.typtype = 'e' then format('(enum_range(null::%s))[1]', format_type(a.atttypid, null))
           when t.typname = 'uuid' then 'gen_random_uuid()'
           when t.typname in ('text', 'varchar', 'bpchar') then 'md5(random()::text)'
           when t.typname in ('numeric', 'int2', 'int4', 'int8') then '1'
           when t.typname = 'date' then 'current_date'
           when t.typname in ('timestamptz', 'timestamp') then 'now()'
           when t.typname = 'jsonb' then '''{}''::jsonb'
           when t.typname = 'bool' then 'true'
         end, ', ' order by a.attnum)
    into v_cols, v_vals
  from pg_attribute a
  join pg_type t on t.oid = a.atttypid
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = ('public.' || p_table)::regclass and a.attnum > 0 and not a.attisdropped
    and (p_vals ? a.attname or (a.attnotnull and d.adbin is null));
  execute format('insert into public.%I (%s) values (%s)', p_table, v_cols, v_vals);
end $$;
grant execute on function _t.seed(text, jsonb) to public;

-- Actores
--   empresa A ...a, empresa B ...b; ua = dueño de A, ub = dueño de B
create table _t.ids (k text primary key, v uuid);
insert into _t.ids values
  ('A',  '00000000-0000-0000-0000-00000000000a'), ('B',  '00000000-0000-0000-0000-00000000000b'),
  ('ua', '00000000-0000-0000-0000-0000000000a1'), ('ub', '00000000-0000-0000-0000-0000000000b1'),
  ('pB', '00000000-0000-0000-0000-0000000000b2'), ('tB', '00000000-0000-0000-0000-0000000000b3'),
  ('mtB','00000000-0000-0000-0000-0000000000b4'), ('btB','00000000-0000-0000-0000-0000000000b5'),
  ('ciB','00000000-0000-0000-0000-0000000000b6'), ('catB','00000000-0000-0000-0000-0000000000b7'),
  ('rB', '00000000-0000-0000-0000-0000000000b8'), ('pcB','00000000-0000-0000-0000-0000000000b9'),
  ('crB','00000000-0000-0000-0000-0000000000ba'), ('crB2','00000000-0000-0000-0000-0000000000bb');

-- Casos: tabla, valores de B, predicado que identifica filas de B, columna para el UPDATE inocuo,
-- valores del intento de inserción (null = no se prueba) y si el dueño de B debe ver la fila.
create table _t.casos (orden serial, tabla text, vals jsonb, pred text default 'true', col text default 'id',
                       ataque jsonb, control boolean default true);

insert into _t.casos (tabla, vals, pred, col, ataque, control) values
 ('organizations',          '{"id":"B","name":"Empresa B"}',                             'id = ''00000000-0000-0000-0000-00000000000b''', 'id', '{"name":"Intrusa"}', true),
 ('organization_members',   '{"organization_id":"B","user_id":"ub","role":"owner"}',      'organization_id = ''00000000-0000-0000-0000-00000000000b''', 'id', '{"organization_id":"B","user_id":"ua","role":"owner"}', true),
 ('profiles',               '{"id":"ub","full_name":"Dueño B","email":"b@b.test"}',       'id = ''00000000-0000-0000-0000-0000000000b1''', 'id', null, true),
 ('organization_subscriptions','{"organization_id":"B"}',                                 'true', 'id', '{"organization_id":"B"}', true),
 ('projects',               '{"id":"pB","organization_id":"B","name":"Obra B","start_date":"2026-01-01"}', 'true', 'id', '{"organization_id":"B","name":"x","start_date":"2026-01-01"}', true),
 ('tasks',                  '{"id":"tB","organization_id":"B","name":"Tarea B","unit":"m2"}', 'true', 'id', '{"organization_id":"B","name":"x","unit":"m2"}', true),
 ('master_tasks',           '{"id":"mtB","organization_id":"B","name":"APU B","unit":"m2"}', 'true', 'id', '{"organization_id":"B","name":"x","unit":"m2"}', true),
 ('budget_templates',       '{"id":"btB","organization_id":"B","name":"Plantilla B"}',    'true', 'id', '{"organization_id":"B","name":"x"}', true),
 ('cost_indices',           '{"id":"ciB","tenant_id":"B","code":"IB","name":"Indice B"}', 'true', 'id', '{"tenant_id":"B","code":"X","name":"x"}', true),
 ('catalogs',               '{"id":"catB","organization_id":"B","name":"Catalogo B","type":"organization"}', 'true', 'id', '{"organization_id":"B","name":"x"}', true),
 ('resources',              '{"id":"rB","catalog_id":"catB","organization_id":"B","code":"RB","name":"Recurso B","unit":"u","type":"MATERIAL","base_cost":"1234"}', 'true', 'id', '{"catalog_id":"catB","organization_id":"B","code":"RX","name":"x","unit":"u","type":"MATERIAL"}', true),
 ('project_computations',   '{"id":"pcB","project_id":"pB","organization_id":"B"}',      'true', 'id', '{"project_id":"pB","organization_id":"B"}', true),
 ('budget_items',           '{"project_id":"pB","organization_id":"B","task_id":"tB"}',   'true', 'id', '{"project_id":"pB","organization_id":"B","task_id":"tB"}', true),
 ('budget_template_items',  '{"budget_template_id":"btB","master_task_id":"mtB"}',        'true', 'id', '{"budget_template_id":"btB","master_task_id":"mtB"}', true),
 ('budget_versions',        '{"organization_id":"B","project_id":"pB","version_number":"1","label":"v1"}', 'true', 'id', '{"organization_id":"B","project_id":"pB","version_number":"2","label":"x"}', true),
 ('catalog_task_yields',    '{"master_task_id":"mtB","resource_id":"rB"}',               'true', 'id', null, true),
 ('computation_items',      '{"computation_id":"pcB","organization_id":"B","quantity":"1","unidad":"m2"}', 'true', 'id', '{"computation_id":"pcB","organization_id":"B","quantity":"1","unidad":"m2"}', true),
 ('cost_index_values',      '{"index_id":"ciB","period_year":"2026","period_month":"1","value":"100"}', 'true', 'id', '{"index_id":"ciB","period_year":"2026","period_month":"2","value":"1"}', true),
 ('crews',                  '{"id":"crB","organization_id":"B","name":"Cuadrilla B"}',              'true', 'id', '{"organization_id":"B","name":"x"}', true),
 ('invitations',            '{"organization_id":"B","created_by":"ub","invited_email":"x@b.test"}', 'true', 'id', '{"organization_id":"B","created_by":"ua"}', true),
 ('labor_categories',       '{"organization_id":"B","role":"Oficial"}',                  'true', 'id', '{"organization_id":"B","role":"x"}', true),
 ('master_materials',       '{"organization_id":"B","name":"Material B","unit":"kg"}',   'true', 'id', '{"organization_id":"B","name":"x","unit":"kg"}', true),
 ('master_task_equipment',  '{"master_task_id":"mtB"}',                                  'true', 'id', '{"master_task_id":"mtB"}', true),
 ('master_task_labor',      '{"master_task_id":"mtB"}',                                  'true', 'id', '{"master_task_id":"mtB"}', true),
 ('master_task_materials',  '{"master_task_id":"mtB"}',                                  'true', 'id', '{"master_task_id":"mtB"}', true),
 ('materials',              '{"organization_id":"B","name":"Material B"}',               'true', 'id', '{"organization_id":"B","name":"x"}', true),
 ('resource_cost_snapshots','{"tenant_id":"B","resource_id":"rB","cost":"1"}',           'true', 'id', '{"tenant_id":"B","resource_id":"rB","cost":"2","effective_date":"2020-01-01"}', true),
 ('resource_pricing_rules', '{"tenant_id":"B","resource_id":"rB"}',                      'true', 'id', '{"tenant_id":"B","resource_id":"rB"}', true),
 ('task_crew_yields',       '{"task_id":"tB","crew_id":"crB","quantity":"3"}',           'true', 'task_id', '{"task_id":"tB","crew_id":"crB2"}', true),
 ('task_labor_yields',      '{"task_id":"tB","organization_id":"B"}',                    'true', 'id', '{"task_id":"tB","organization_id":"B","labor_category_id":"zz"}', true),
 ('task_tool_yields',       '{"task_id":"tB","organization_id":"B"}',                    'true', 'id', '{"task_id":"tB","organization_id":"B","tool_id":"zz"}', true),
 ('task_yields',            '{"task_id":"tB","organization_id":"B"}',                    'true', 'id', '{"task_id":"tB","organization_id":"B","material_id":"zz"}', true),
 ('tools',                  '{"organization_id":"B","name":"Equipo B"}',                 'true', 'id', '{"organization_id":"B","name":"x"}', true),
 -- tablas sin dueño-empresa: nadie salvo master admin / service role debe verlas
 ('audit_log',              '{"actor_id":"ub","operation":"x","entity":"x","entity_id":"x"}', 'true', 'id', null, false),
 ('stripe_webhook_events',  '{"type":"x","payload":"{}"}',                               'true', 'id', '{"type":"x","payload":"{}"}', false),
 ('v_org_uuid',             '{"organization_id":"B"}',                                   'true', 'organization_id', '{"organization_id":"B"}', false);

-- Fugas conocidas pendientes de corrección (vacía desde la 072).
create table _t.conocidos (tabla text, accion text, nota text, primary key (tabla, accion));

-- Reemplaza las claves simbólicas (B, ub, pB, …) por los UUID reales.
create function _t.resolve(p jsonb) returns jsonb language sql as $$
  select coalesce(jsonb_object_agg(k, coalesce((select to_jsonb(i.v::text) from _t.ids i where i.k = e.value #>> '{}'), e.value)), '{}'::jsonb)
  from jsonb_each(p) e(k, value)
$$;

-- Siembra (superusuario)
insert into public.organizations (id, name) values ('00000000-0000-0000-0000-00000000000a', 'Empresa A');
insert into public.organization_members (organization_id, user_id, role) values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'owner');
insert into public.profiles (id, full_name) values ('00000000-0000-0000-0000-0000000000a1', 'Dueño A');
do $$ declare c record; begin
  for c in select * from _t.casos order by orden loop
    perform _t.seed(c.tabla, _t.resolve(c.vals));
  end loop;
  -- segunda cuadrilla de B, para probar inserciones válidas en task_crew_yields
  perform _t.seed('crews', _t.resolve('{"id":"crB2","organization_id":"B","name":"Cuadrilla B2"}'));
end $$;

create table _t.res (tabla text, accion text, actor text, filas int, estado text);
grant all on _t.res to public;

create function _t.actuar(p_actor text) returns void language plpgsql as $$
begin
  if p_actor = 'anon' then
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claim.role', 'anon', true);
    execute 'set local role anon';
  else
    perform set_config('request.jwt.claim.sub', (select v::text from _t.ids where k = p_actor), true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    execute 'set local role authenticated';
  end if;
end $$;

-- Ejecuta una sentencia como el actor y devuelve filas afectadas; siempre deshace los cambios.
-- -1 = bloqueada por permisos/RLS; -2 = otro error (resultado no concluyente).
create function _t.probar(p_actor text, p_sql text, out filas int, out err text) language plpgsql as $$
begin
  begin
    perform _t.actuar(p_actor);
    execute p_sql;
    get diagnostics filas = row_count;
    raise exception using errcode = 'P0099', message = filas::text;
  exception
    when sqlstate 'P0099' then filas := sqlerrm::int;
    when insufficient_privilege then filas := -1;
    when others then filas := -2; err := sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
end $$;

do $$
declare c record; r record; n int; v_sql text;
begin
  for c in select * from _t.casos order by orden loop
    -- lectura cruzada (empresa A) y anónima
    for r in select * from (values ('ua'), ('anon')) x(actor) loop
      select * into n from _t.probar(r.actor, format('select 1 from public.%I where %s', c.tabla, c.pred));
      insert into _t.res values (c.tabla, 'select', r.actor, n, case when n <= 0 and n <> -2 then 'ok' else 'fuga' end);
    end loop;
    -- modificación y borrado cruzados
    select * into n from _t.probar('ua', format('update public.%I set %I = %I where %s', c.tabla, c.col, c.col, c.pred));
    insert into _t.res values (c.tabla, 'update', 'ua', n, case when n <= 0 and n <> -2 then 'ok' else 'fuga' end);
    select * into n from _t.probar('ua', format('delete from public.%I where %s', c.tabla, c.pred));
    insert into _t.res values (c.tabla, 'delete', 'ua', n, case when n <= 0 and n <> -2 then 'ok' else 'fuga' end);
    -- inserción en nombre de B
    if c.ataque is not null then
      declare e text; begin
        select p.filas, p.err into n, e from _t.probar('ua', format('select _t.seed(%L, %L::jsonb)', c.tabla, _t.resolve(c.ataque)::text)) p;
        insert into _t.res values (c.tabla, 'insert', 'ua', n,
          case when n = -1 then 'ok' when n = -2 then 'error: ' || e else 'fuga' end);
      end;
    end if;
    -- control positivo: el dueño de B ve sus datos
    if c.control then
      select * into n from _t.probar('ub', format('select 1 from public.%I where %s', c.tabla, c.pred));
      insert into _t.res values (c.tabla, 'control', 'ub', n, case when n > 0 then 'ok' else 'control vacío' end);
    end if;
  end loop;
end $$;

-- Informe
\echo
\echo '== Resultado por tabla (solo lo que no está ok) =='
select r.tabla, r.accion, r.actor, r.filas,
       case when r.estado = 'fuga' and k.tabla is not null then 'fuga conocida'
            when r.estado = 'ok' and k.tabla is not null then 'CORREGIDA: quitar de _t.conocidos'
            else r.estado end as estado
from _t.res r left join _t.conocidos k on k.tabla = r.tabla and k.accion = r.accion and r.actor = 'ua'
where r.estado <> 'ok' or k.tabla is not null
order by r.tabla, r.accion, r.actor;

select count(*) filter (where estado = 'ok') as ok, count(*) as total from _t.res \gset
\echo 'Comprobaciones ok:' :ok 'de' :total

do $$
declare v_fallas text;
begin
  select string_agg(format('%s/%s/%s → %s', r.tabla, r.accion, r.actor, r.estado), E'\n')
    into v_fallas
  from _t.res r left join _t.conocidos k on k.tabla = r.tabla and k.accion = r.accion and r.actor = 'ua'
  where (r.estado <> 'ok' and k.tabla is null)
     or (r.estado = 'ok' and k.tabla is not null);
  if (select count(*) from public.organizations) <> 2 then
    v_fallas := coalesce(v_fallas || E'\n', '') || 'la siembra no quedó intacta';
  end if;
  if v_fallas is not null then
    raise exception E'Aislamiento RLS: fallas nuevas o fugas conocidas ya corregidas\n%', v_fallas;
  end if;
  raise notice 'Aislamiento RLS: sin fugas nuevas';
end $$;
