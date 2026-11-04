-- 059 · Índices de precios y versiones de presupuesto
--
-- price_indices: valores mensuales de índices que se cargan a mano (CAC e ICC INDEC,
--   general / materiales / mano de obra). Son globales: los lee cualquier usuario
--   autenticado y solo el master admin los escribe. Inflación y dólar NO se guardan
--   acá: se leen de ArgentinaDatos a través de /api/indices.
--
-- budget_versions: fotos selladas del presupuesto de una obra. La v1 es el
--   presupuesto original; las siguientes, actualizaciones por índice.

-- ─── 1. price_indices ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.price_indices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL CHECK (code IN (
                'cac_general', 'cac_materiales', 'cac_mano_obra',
                'icc_general', 'icc_materiales', 'icc_mano_obra')),
  period      date NOT NULL CHECK (EXTRACT(DAY FROM period) = 1),
  value       numeric(14, 4) NOT NULL CHECK (value > 0),
  source      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid DEFAULT auth.uid(),
  UNIQUE (code, period)
);

ALTER TABLE public.price_indices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "price_indices_select" ON public.price_indices;
DROP POLICY IF EXISTS "price_indices_insert" ON public.price_indices;
DROP POLICY IF EXISTS "price_indices_update" ON public.price_indices;
DROP POLICY IF EXISTS "price_indices_delete" ON public.price_indices;

CREATE POLICY "price_indices_select" ON public.price_indices
  FOR SELECT TO authenticated USING ( true );

CREATE POLICY "price_indices_insert" ON public.price_indices
  FOR INSERT TO authenticated WITH CHECK ( is_master_admin() );

CREATE POLICY "price_indices_update" ON public.price_indices
  FOR UPDATE TO authenticated
  USING ( is_master_admin() ) WITH CHECK ( is_master_admin() );

CREATE POLICY "price_indices_delete" ON public.price_indices
  FOR DELETE TO authenticated USING ( is_master_admin() );

-- ─── 2. budget_versions ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.budget_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version_number  integer NOT NULL CHECK (version_number >= 1),
  label           text NOT NULL,
  method          jsonb NOT NULL DEFAULT '{}'::jsonb,
  base_period     date,
  target_period   date,
  factors         jsonb NOT NULL DEFAULT '{}'::jsonb,
  totals          jsonb NOT NULL DEFAULT '{}'::jsonb,
  items           jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid DEFAULT auth.uid(),
  UNIQUE (project_id, version_number)
);

CREATE INDEX IF NOT EXISTS budget_versions_project_idx ON public.budget_versions (project_id);

ALTER TABLE public.budget_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "budget_versions_select" ON public.budget_versions;
DROP POLICY IF EXISTS "budget_versions_insert" ON public.budget_versions;
DROP POLICY IF EXISTS "budget_versions_delete" ON public.budget_versions;

CREATE POLICY "budget_versions_select" ON public.budget_versions
  FOR SELECT TO authenticated
  USING ( is_org_member(organization_id) );

CREATE POLICY "budget_versions_insert" ON public.budget_versions
  FOR INSERT TO authenticated
  WITH CHECK ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) );

CREATE POLICY "budget_versions_delete" ON public.budget_versions
  FOR DELETE TO authenticated
  USING ( is_org_member_with_role(organization_id, ARRAY['owner','admin']) );

-- Las versiones son fotos selladas: no hay política de UPDATE.
