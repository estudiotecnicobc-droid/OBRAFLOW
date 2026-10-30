-- Minimal host schema for executing the real pricing migrations in PostgreSQL.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;
CREATE TABLE organizations(id uuid PRIMARY KEY);
CREATE TABLE organization_members(organization_id uuid,user_id uuid,role text);
CREATE TABLE projects(id uuid PRIMARY KEY,organization_id uuid,currency text);
CREATE TABLE master_materials(id uuid PRIMARY KEY,organization_id text,is_active boolean DEFAULT true,
 global_resource_id uuid,global_source_id uuid,unit_price numeric DEFAULT 0,unit text,currency text,last_price_update timestamptz);
CREATE TABLE resources(id uuid PRIMARY KEY,organization_id uuid,is_active boolean DEFAULT true,unit text,base_cost numeric);
CREATE TABLE master_tasks(id uuid PRIMARY KEY,organization_id uuid);
CREATE TABLE master_task_materials(id uuid PRIMARY KEY,master_task_id uuid,master_material_id uuid,
 resource_id uuid,last_known_unit_price numeric,unit text,sub_master_task_id uuid);
CREATE TABLE resource_cost_snapshots(id uuid PRIMARY KEY,tenant_id uuid,resource_id uuid,
 effective_date date,cost numeric,currency text,created_at timestamptz DEFAULT now());
CREATE TABLE price_import_batches(id uuid PRIMARY KEY,organization_id uuid,status text,
 header_cells jsonb,updated_at timestamptz,UNIQUE(organization_id,id));
CREATE TABLE price_import_rows(batch_id uuid,organization_id uuid,row_number bigint,
 raw_cells jsonb,processing_status text DEFAULT 'raw',validation_errors text[] DEFAULT '{}',
 PRIMARY KEY(batch_id,row_number));

INSERT INTO organizations VALUES ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
INSERT INTO auth.users VALUES ('20000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002'),('20000000-0000-4000-8000-000000000003');
INSERT INTO organization_members VALUES
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','editor'),
 ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','editor'),
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','viewer'),
 ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003','editor');
INSERT INTO projects VALUES
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','ARS'),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','ARS');
INSERT INTO master_materials(id,organization_id,unit,currency) VALUES
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','kg','ARS'),
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','kg','ARS');
