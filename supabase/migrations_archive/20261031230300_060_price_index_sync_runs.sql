-- Migración aplicada desde el panel web de Supabase (SQL Editor).
-- Version: 20261031230300
-- Name:    060_price_index_sync_runs
-- Origen:  supabase_migrations.schema_migrations (snapshot 2026-11-03)
-- Nota:    Ya aplicada en producción. Reproducida aquí sólo como historia.
-- Nunca re-ejecutar: está absorbida por el baseline 20261101000000.

-- 060 · Registro de la actualización automática de índices (CAC e ICC INDEC)
-- Lo escribe la función api/sync-indices con la clave de servicio (que no pasa por RLS).
-- Los usuarios autenticados solo lo leen, para ver la fecha de la última actualización.

CREATE TABLE IF NOT EXISTS public.price_index_sync_runs (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at   timestamptz NOT NULL DEFAULT now(),
  ok       boolean NOT NULL,
  trigger  text NOT NULL CHECK (trigger IN ('cron', 'manual')),
  message  text,
  details  jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS price_index_sync_runs_ran_at_idx ON public.price_index_sync_runs (ran_at DESC);

ALTER TABLE public.price_index_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "price_index_sync_runs_select" ON public.price_index_sync_runs;
CREATE POLICY "price_index_sync_runs_select" ON public.price_index_sync_runs
  FOR SELECT TO authenticated USING ( true );
