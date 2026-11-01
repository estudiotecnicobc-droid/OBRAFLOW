-- T2b · Permisos por rol dentro de una misma empresa. Corre después de 02_aislamiento.sql (reusa _t y la siembra de B).
--   · viewer (en la app: "cliente") no puede insertar / modificar / borrar datos de su empresa.
--   · editor sí puede (control positivo).
--   · admin no puede crear invitaciones con rol owner ni ascender a owner.
\set ON_ERROR_STOP 1
set client_min_messages = warning;

insert into _t.ids values
  ('ubv', '00000000-0000-0000-0000-0000000000c1'),  -- viewer de B
  ('ube', '00000000-0000-0000-0000-0000000000c2'),  -- editor de B
  ('uba', '00000000-0000-0000-0000-0000000000c3');  -- admin de B
insert into public.organization_members (organization_id, user_id, role) values
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000c1', 'viewer'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000c2', 'editor'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000c3', 'admin');

-- Tablas de trabajo que solo owner/admin/editor deben poder escribir
create table _t.escritura (tabla text primary key);
insert into _t.escritura values
  ('projects'), ('tasks'), ('budget_items'), ('budget_templates'), ('budget_template_items'), ('budget_versions'),
  ('master_tasks'), ('master_task_materials'), ('master_task_labor'), ('master_task_equipment'),
  ('task_yields'), ('task_labor_yields'), ('task_tool_yields'), ('task_crew_yields'),
  ('materials'), ('tools'), ('labor_categories'), ('crews'), ('master_materials'),
  ('project_computations'), ('computation_items'), ('cost_indices'), ('resource_pricing_rules'),
  ('organizations');

create table _t.res_roles (tabla text, accion text, actor text, filas int, estado text);
grant all on _t.res_roles to public;

do $$
declare c record; n int; e text; v_ins jsonb;
begin
  for c in select k.* from _t.casos k join _t.escritura w using (tabla) order by k.orden loop
    -- viewer: no debe poder escribir
    select * into n from _t.probar('ubv', format('update public.%I set %I = %I where %s', c.tabla, c.col, c.col, c.pred));
    insert into _t.res_roles values (c.tabla, 'update', 'viewer', n, case when n <= 0 and n <> -2 then 'ok' else 'fuga' end);
    select * into n from _t.probar('ubv', format('delete from public.%I where %s', c.tabla, c.pred));
    insert into _t.res_roles values (c.tabla, 'delete', 'viewer', n, case when n <= 0 and n <> -2 then 'ok' else 'fuga' end);
    if c.ataque is not null and c.tabla <> 'organizations' then
      v_ins := _t.resolve(c.ataque);
      select p.filas, p.err into n, e from _t.probar('ubv', format('select _t.seed(%L, %L::jsonb)', c.tabla, v_ins::text)) p;
      insert into _t.res_roles values (c.tabla, 'insert', 'viewer', n,
        case when n = -1 then 'ok' when n = -2 then 'error: ' || e else 'fuga' end);
    end if;
    -- editor: sí debe poder modificar (control positivo); organizations es solo owner/admin
    -- (budget_versions no admite UPDATE por diseño; cost_indices solo owner/admin)
    if c.tabla not in ('organizations', 'budget_versions', 'cost_indices') then
      select * into n from _t.probar('ube', format('update public.%I set %I = %I where %s', c.tabla, c.col, c.col, c.pred));
      insert into _t.res_roles values (c.tabla, 'control update', 'editor', n, case when n > 0 then 'ok' else 'control vacío' end);
    end if;
  end loop;
end $$;

-- Escalada a owner
do $$ declare n int; e text; begin
  select p.filas, p.err into n, e from _t.probar('uba', format('select _t.seed(%L, %L::jsonb)', 'invitations',
    _t.resolve('{"organization_id":"B","created_by":"uba","role":"owner"}')::text)) p;
  insert into _t.res_roles values ('invitations', 'invitar owner', 'admin', n,
    case when n < 0 and (n = -1 or e like '23514%') then 'ok' else 'fuga' end);
  select * into n from _t.probar('uba', $q$update public.organization_members set role = 'owner'
    where user_id = '00000000-0000-0000-0000-0000000000c2'$q$);
  insert into _t.res_roles values ('organization_members', 'ascender a owner', 'admin', n, case when n <= 0 and n <> -2 then 'ok' else 'fuga' end);
end $$;

-- Fugas de rol conocidas pendientes de corrección (vacía desde la 073).
create table _t.conocidos_roles (tabla text, accion text, primary key (tabla, accion));

\echo
\echo '== Permisos por rol (solo lo que no está ok) =='
select r.tabla, r.accion, r.actor, r.filas,
       case when r.estado = 'fuga' and k.tabla is not null then 'fuga conocida'
            when r.estado = 'ok' and k.tabla is not null then 'CORREGIDA: quitar de _t.conocidos_roles'
            else r.estado end as estado
from _t.res_roles r left join _t.conocidos_roles k on k.tabla = r.tabla and k.accion = r.accion and r.actor in ('viewer', 'admin')
where r.estado <> 'ok' or k.tabla is not null
order by r.tabla, r.accion;

select count(*) filter (where estado = 'ok') as ok, count(*) as total from _t.res_roles \gset
\echo 'Comprobaciones de rol ok:' :ok 'de' :total

do $$
declare v_fallas text;
begin
  select string_agg(format('%s/%s/%s → %s', r.tabla, r.accion, r.actor, r.estado), E'\n') into v_fallas
  from _t.res_roles r left join _t.conocidos_roles k on k.tabla = r.tabla and k.accion = r.accion and r.actor in ('viewer', 'admin')
  where (r.estado <> 'ok' and k.tabla is null) or (r.estado = 'ok' and k.tabla is not null);
  if v_fallas is not null then
    raise exception E'Permisos por rol: fallas nuevas o fugas conocidas ya corregidas\n%', v_fallas;
  end if;
  raise notice 'Permisos por rol: sin fallas nuevas';
end $$;
