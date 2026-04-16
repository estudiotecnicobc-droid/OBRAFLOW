-- ============================================================
-- Migración 020: Agrega columna `code` a materials, tools y
--                labor_categories + índices únicos parciales
-- Fecha: 2026-04-12
-- Seguro: ADD COLUMN IF NOT EXISTS; índices parciales (code IS NOT NULL)
-- Propósito: permitir lookup por código en seeds y RPCs de APU
-- ============================================================

-- ── materials ──────────────────────────────────────────────────────────────
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS code TEXT;

COMMENT ON COLUMN public.materials.code
  IS 'Código de catálogo (ej: I1001). Único por organización cuando no es NULL.';

-- Índice único parcial: permite múltiples NULL, impide códigos duplicados por org
CREATE UNIQUE INDEX IF NOT EXISTS materials_org_code_uidx
  ON public.materials (organization_id, code)
  WHERE code IS NOT NULL;

-- ── tools ──────────────────────────────────────────────────────────────────
ALTER TABLE public.tools
  ADD COLUMN IF NOT EXISTS code TEXT;

COMMENT ON COLUMN public.tools.code
  IS 'Código de catálogo (ej: I1747). Único por organización cuando no es NULL.';

CREATE UNIQUE INDEX IF NOT EXISTS tools_org_code_uidx
  ON public.tools (organization_id, code)
  WHERE code IS NOT NULL;

-- ── labor_categories ───────────────────────────────────────────────────────
ALTER TABLE public.labor_categories
  ADD COLUMN IF NOT EXISTS code TEXT;

COMMENT ON COLUMN public.labor_categories.code
  IS 'Código de categoría de mano de obra (ej: I1004). Único por organización cuando no es NULL.';

CREATE UNIQUE INDEX IF NOT EXISTS labor_categories_org_code_uidx
  ON public.labor_categories (organization_id, code)
  WHERE code IS NOT NULL;
