-- ============================================================
-- Migración 001: Catálogo Global de Recursos + Yields de APU
-- Fecha: 2026-03-12
-- Descripción: Crea las tablas catalogs, resources y
--   catalog_task_yields para el catálogo global premium.
--   No modifica tablas existentes.
-- ============================================================


-- ── 1. catalogs ─────────────────────────────────────────────
-- Registro de catálogos (global o por organización).
-- organization_id NULL = catálogo global (no pertenece a ninguna org).

CREATE TABLE IF NOT EXISTS public.catalogs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  type            text        NOT NULL DEFAULT 'global',
  organization_id uuid        REFERENCES public.organizations(id) ON DELETE CASCADE,
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Unicidad: mismo nombre no puede repetirse dentro del mismo scope
-- (global = org NULL, por-org = org específica)
CREATE UNIQUE INDEX IF NOT EXISTS catalogs_global_name_uidx
  ON public.catalogs (name)
  WHERE organization_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS catalogs_org_name_uidx
  ON public.catalogs (name, organization_id)
  WHERE organization_id IS NOT NULL;

ALTER TABLE public.catalogs ENABLE ROW LEVEL SECURITY;

-- Catálogos globales son de solo lectura para todos los autenticados
CREATE POLICY "catalogs_select" ON public.catalogs
  FOR SELECT TO authenticated
  USING (true);


-- ── 2. resources ─────────────────────────────────────────────
-- Catálogo unificado de recursos: materiales, mano de obra,
-- equipos y subcontratos. Reemplaza la vista fragmentada de
-- master_materials / labor_categories / tools en el contexto global.

CREATE TABLE IF NOT EXISTS public.resources (
  id                 uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id         uuid         NOT NULL REFERENCES public.catalogs(id) ON DELETE CASCADE,
  organization_id    uuid         REFERENCES public.organizations(id) ON DELETE CASCADE,
  code               text         NOT NULL,
  name               text         NOT NULL,
  unit               text         NOT NULL,
  base_cost          numeric(14,4) NOT NULL DEFAULT 0,
  type               text         NOT NULL
                       CHECK (type IN ('MATERIAL','LABOR','EQUIPMENT','SUBCONTRACT')),
  category_name      text,
  social_charges_pct numeric(8,4),
  is_active          boolean      NOT NULL DEFAULT true,
  created_at         timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT resources_catalog_code_unique UNIQUE (catalog_id, code)
);

ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "resources_select" ON public.resources
  FOR SELECT TO authenticated
  USING (true);


-- ── 3. catalog_task_yields ───────────────────────────────────
-- Vincula una master_task (APU) del catálogo global
-- a los resources que la componen, con su cantidad por unidad.
-- Nombre: catalog_task_yields (≠ task_yields existente de proyecto).

CREATE TABLE IF NOT EXISTS public.catalog_task_yields (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  master_task_id uuid          NOT NULL REFERENCES public.master_tasks(id) ON DELETE CASCADE,
  resource_id    uuid          NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  quantity       numeric(14,6) NOT NULL DEFAULT 1,
  created_at     timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT catalog_task_yields_unique UNIQUE (master_task_id, resource_id)
);

ALTER TABLE public.catalog_task_yields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalog_task_yields_select" ON public.catalog_task_yields
  FOR SELECT TO authenticated
  USING (true);


-- ── Comentarios de tablas ────────────────────────────────────
COMMENT ON TABLE public.catalogs
  IS 'Catálogos de recursos: global (organization_id NULL) o por organización.';
COMMENT ON TABLE public.resources
  IS 'Recursos unificados (material/labor/equipo/subcontrato) de un catálogo.';
COMMENT ON TABLE public.catalog_task_yields
  IS 'Composición de un APU (master_task) en términos de resources del catálogo.';
