-- Stubs mínimos de lo que Supabase provee y un Postgres pelado no tiene,
-- para aplicar las migraciones del motor de precios (20261102100001..7) en local.
-- Solo imitan la forma (firmas y columnas) que usan las migraciones; no son
-- implementaciones fieles. Nunca aplicar en Supabase cloud.
\set ON_ERROR_STOP 1

-- Supabase concede por defecto todos los privilegios sobre objetos nuevos de public a los
-- roles de API; el snapshot RLS solo cubre las tablas ya existentes. Sin esto, los REVOKE
-- de las migraciones no tendrían nada que revocar y service_role no vería las tablas nuevas.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- auth.users: referenciada por FKs (price_import_batches.created_by, supplier_products.approved_by).
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz not null default now()
);
grant select on auth.users to anon, authenticated, service_role;

-- pgmq (Supabase Queues): meta, create, send, read, archive, set_vt, delete.
-- Las colas se materializan como pgmq.q_<nombre> y pgmq.a_<nombre>, igual que la extensión real.
create schema if not exists pgmq;
create table if not exists pgmq.meta (
  queue_name text primary key,
  is_partitioned boolean not null default false,
  is_unlogged boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function pgmq.create(queue_name text) returns void
language plpgsql as $$
begin
  execute format($q$
    create table if not exists pgmq.%I (
      msg_id bigint generated always as identity primary key,
      read_ct integer not null default 0,
      enqueued_at timestamptz not null default now(),
      vt timestamptz not null default now(),
      message jsonb
    )$q$, 'q_' || queue_name);
  execute format($q$
    create table if not exists pgmq.%I (
      msg_id bigint primary key,
      read_ct integer not null default 0,
      enqueued_at timestamptz not null default now(),
      archived_at timestamptz not null default now(),
      vt timestamptz not null,
      message jsonb
    )$q$, 'a_' || queue_name);
  insert into pgmq.meta (queue_name) values (queue_name) on conflict do nothing;
end $$;

create or replace function pgmq.send(queue_name text, msg jsonb, delay integer default 0)
returns bigint language plpgsql as $$
declare v_id bigint;
begin
  execute format('insert into pgmq.%I (vt, message) values (now() + make_interval(secs => $1), $2) returning msg_id',
                 'q_' || queue_name) into v_id using delay, msg;
  return v_id;
end $$;

create or replace function pgmq.read(queue_name text, vt_seconds integer, qty integer)
returns table (msg_id bigint, read_ct integer, enqueued_at timestamptz, vt timestamptz, message jsonb)
language plpgsql as $$
begin
  return query execute format($q$
    with cte as (
      select msg_id from pgmq.%1$I where vt <= now()
      order by msg_id limit $1 for update skip locked
    )
    update pgmq.%1$I q
       set vt = now() + make_interval(secs => $2), read_ct = q.read_ct + 1
      from cte where q.msg_id = cte.msg_id
    returning q.msg_id, q.read_ct, q.enqueued_at, q.vt, q.message$q$, 'q_' || queue_name)
  using qty, vt_seconds;
end $$;

create or replace function pgmq.archive(queue_name text, msg_id bigint)
returns boolean language plpgsql as $$
declare v_found boolean;
begin
  execute format($q$
    with del as (delete from pgmq.%1$I where msg_id = $1 returning *)
    insert into pgmq.%2$I (msg_id, read_ct, enqueued_at, vt, message)
    select msg_id, read_ct, enqueued_at, vt, message from del
    returning true$q$, 'q_' || queue_name, 'a_' || queue_name)
  into v_found using msg_id;
  return coalesce(v_found, false);
end $$;

create or replace function pgmq.set_vt(queue_name text, p_msg_id bigint, vt_seconds integer)
returns table (msg_id bigint, read_ct integer, enqueued_at timestamptz, vt timestamptz, message jsonb)
language plpgsql as $$
begin
  return query execute format($q$
    update pgmq.%1$I q set vt = now() + make_interval(secs => $2) where q.msg_id = $1
    returning q.msg_id, q.read_ct, q.enqueued_at, q.vt, q.message$q$, 'q_' || queue_name)
  using p_msg_id, vt_seconds;
end $$;

create or replace function pgmq.delete(queue_name text, msg_id bigint)
returns boolean language plpgsql as $$
declare v_found boolean;
begin
  execute format('with del as (delete from pgmq.%I where msg_id = $1 returning true) select bool_or(true) from del',
                 'q_' || queue_name) into v_found using msg_id;
  return coalesce(v_found, false);
end $$;

-- pg_cron: cron.schedule no-op (las migraciones todavía no programan nada).
create schema if not exists cron;
create table if not exists cron.job (
  jobid bigint generated always as identity primary key,
  schedule text not null,
  command text not null,
  jobname text
);
create or replace function cron.schedule(job_name text, schedule text, command text)
returns bigint language sql as $$
  insert into cron.job (schedule, command, jobname) values (schedule, command, job_name) returning jobid
$$;
create or replace function cron.schedule(schedule text, command text)
returns bigint language sql as $$
  insert into cron.job (schedule, command) values (schedule, command) returning jobid
$$;
create or replace function cron.unschedule(job_name text) returns boolean
language sql as $$ delete from cron.job where jobname = job_name returning true $$;

-- pg_net: net.http_post no-op.
create schema if not exists net;
create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
                                         headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000)
returns bigint language sql as $$ select 0::bigint $$;

-- Storage: buckets y objects con las columnas que usan las políticas y enqueue_price_import.
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  owner uuid,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  metadata jsonb,
  path_tokens text[] generated always as (string_to_array(name, '/')) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
grant usage on schema storage, pgmq, cron, net to anon, authenticated, service_role;
grant all on all tables in schema storage to anon, authenticated, service_role;
grant all on all tables in schema pgmq to service_role;
grant execute on all functions in schema storage, pgmq to service_role;
