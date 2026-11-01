\set ON_ERROR_STOP 0
set role authenticated;
-- 1) atacante A se agrega como owner de la víctima
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000aa';
insert into public.organization_members(organization_id,user_id,role) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000aa','owner');
select 'A ve empresa víctima: ' || count(*) from public.organizations;
-- 2) viewer W se sube a admin
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000f';
update public.organization_members set role='admin' where user_id='00000000-0000-0000-0000-00000000000f';
-- 3) viewer W borra al owner
delete from public.organization_members where role='owner' and user_id='00000000-0000-0000-0000-00000000000e';
-- 4) admin B cambia a W a editor (permitido)
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
update public.organization_members set role='editor' where user_id='00000000-0000-0000-0000-00000000000f';
-- 5) admin B intenta asignarse owner (no permitido)
update public.organization_members set role='owner' where user_id='00000000-0000-0000-0000-00000000000b';
reset role;
select user_id, role from public.organization_members order by role, user_id;
