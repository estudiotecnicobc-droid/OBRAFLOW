-- Migración 054: campo global_resource_id en master_materials
-- Permite rastrear materiales de empresa importados desde Recursos Globales (tabla resources).
-- Separado de global_source_id (migration 053) que referencia master_materials IS NULL.

ALTER TABLE public.master_materials
  ADD COLUMN IF NOT EXISTS global_resource_id
    uuid NULL REFERENCES public.resources(id) ON DELETE SET NULL;

-- Índice: búsqueda inversa — ¿qué materiales de empresa vienen de cada recurso global?
CREATE INDEX IF NOT EXISTS idx_master_materials_global_resource
  ON public.master_materials (global_resource_id)
  WHERE global_resource_id IS NOT NULL;

-- Restricción: un org no puede importar el mismo recurso global dos veces
CREATE UNIQUE INDEX IF NOT EXISTS uq_master_materials_org_global_resource
  ON public.master_materials (organization_id, global_resource_id)
  WHERE organization_id IS NOT NULL AND global_resource_id IS NOT NULL;

COMMENT ON COLUMN public.master_materials.global_resource_id IS
  'FK al recurso global (resources IS NULL) del que fue importado. NULL si es local puro o importado vía master_materials global (ver global_source_id).';
