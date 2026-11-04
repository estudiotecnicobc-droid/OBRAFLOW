-- ============================================================
-- Migración 005: Campos técnicos del proyecto
--               address, company_name, surface, construction_system,
--               structure_type, foundation_type
-- Tabla afectada: public.projects
-- ============================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS address             text,
  ADD COLUMN IF NOT EXISTS company_name        text,
  ADD COLUMN IF NOT EXISTS surface             numeric(14,4),
  ADD COLUMN IF NOT EXISTS construction_system text,
  ADD COLUMN IF NOT EXISTS structure_type      text,
  ADD COLUMN IF NOT EXISTS foundation_type     text;

COMMENT ON COLUMN public.projects.address             IS 'Dirección de la obra';
COMMENT ON COLUMN public.projects.company_name        IS 'Empresa constructora';
COMMENT ON COLUMN public.projects.surface             IS 'Superficie en m²';
COMMENT ON COLUMN public.projects.construction_system IS 'Sistema constructivo (Ej: Tradicional, Steel Frame)';
COMMENT ON COLUMN public.projects.structure_type      IS 'Tipo de estructura (Ej: Hormigón, Metálica)';
COMMENT ON COLUMN public.projects.foundation_type     IS 'Tipo de cimentación (Ej: Platea, Zapatas)';
