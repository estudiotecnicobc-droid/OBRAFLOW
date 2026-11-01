\set ON_ERROR_STOP 1
create role authenticated nologin; create role anon nologin;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
grant usage on schema auth to authenticated, anon;
create table public.organizations (id uuid primary key default gen_random_uuid(), name text, slug text);
create table public.organization_members (id uuid primary key default gen_random_uuid(), organization_id uuid, user_id uuid, role text);
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
grant all on public.organizations, public.organization_members to authenticated, anon;
create function public.get_my_organization_ids() returns table(org_id uuid) language sql stable security definer set search_path=public as $$ select organization_id from public.organization_members where user_id = auth.uid() $$;
create function public.is_org_admin(p_org_id uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.organization_members where organization_id=p_org_id and user_id=auth.uid() and role in ('owner','admin')) $$;
create function public.is_member_of_org(p_org_id uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.organization_members where organization_id=p_org_id and user_id=auth.uid()) $$;
create function public.is_org_member(org_uuid uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.organization_members where organization_id=org_uuid and user_id=auth.uid()) $$;
-- políticas como en producción (31/10/2026)
create policy members_delete on public.organization_members for delete to authenticated using (organization_id in (select org_id from get_my_organization_ids()));
create policy organization_members_delete_authenticated on public.organization_members for delete to authenticated using (true);
create policy members_insert on public.organization_members for insert to authenticated with check (organization_id in (select org_id from get_my_organization_ids()));
create policy organization_members_insert_authenticated on public.organization_members for insert to authenticated with check (true);
create policy members_select on public.organization_members for select to authenticated using (organization_id in (select org_id from get_my_organization_ids()));
create policy org_members_select on public.organization_members for select to public using (is_member_of_org(organization_id));
create policy organization_members_select_own on public.organization_members for select to public using (user_id = auth.uid());
create policy members_update on public.organization_members for update to authenticated using (organization_id in (select org_id from get_my_organization_ids())) with check (role <> 'owner');
create policy org_members_update_role on public.organization_members for update to public using (is_org_admin(organization_id) and role <> 'owner') with check (is_org_admin(organization_id) and role = any(array['admin','editor','viewer']));
create policy organization_members_update_authenticated on public.organization_members for update to authenticated using (true) with check (true);
create policy organizations_insert_authenticated on public.organizations for insert to authenticated with check (true);
create policy organizations_select_member on public.organizations for select to public using (is_org_member(id));
-- datos: empresa víctima (owner V, viewer W) y atacante A sin empresa; admin B en víctima
insert into public.organizations(id,name) values ('00000000-0000-0000-0000-0000000000a1','Victima');
insert into public.organization_members(organization_id,user_id,role) values
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000000e','owner'),
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000000b','admin'),
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000000f','viewer');
