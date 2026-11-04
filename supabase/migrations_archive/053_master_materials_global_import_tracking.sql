-- Migración 053: campos de trazabilidad para importación de catálogo global
-- Permite rastrear qué materiales de empresa fueron importados desde el catálogo global
-- y si fueron modificados localmente (local_override).

ALTER TABLE public.master_materials
  ADD COLUMN IF NOT EXISTS global_source_id
    uuid NULL REFERENCES public.master_materials(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS imported_at
    timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_synced_at
    timestamptz NULL,
  ADD COLUMN IF NOT EXISTS local_override
    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS global_source_updated_at_at_import
    timestamptz NULL;

-- Índice: búsqueda inversa — ¿qué orgs importaron este global?
CREATE INDEX IF NOT EXISTS idx_master_materials_global_source
  ON public.master_materials (global_source_id)
  WHERE global_source_id IS NOT NULL;

-- Restricción: un org no puede importar el mismo material global dos veces
CREATE UNIQUE INDEX IF NOT EXISTS uq_master_materials_org_global_source
  ON public.master_materials (organization_id, global_source_id)
  WHERE organization_id IS NOT NULL AND global_source_id IS NOT NULL;

COMMENT ON COLUMN public.master_materials.global_source_id IS
  'FK al material global (IS NULL) del que fue importado. NULL si es local puro.';
COMMENT ON COLUMN public.master_materials.imported_at IS
  'Timestamp de la primera importación desde el catálogo global.';
COMMENT ON COLUMN public.master_materials.last_synced_at IS
  'Timestamp de la última sincronización con el catálogo global (re-import o sync).';
COMMENT ON COLUMN public.master_materials.local_override IS
  'true si el usuario editó el material importado → diverge del original global.';
COMMENT ON COLUMN public.master_materials.global_source_updated_at_at_import IS
  'updated_at del material global en el momento de la importación (sirve para detectar si el global fue actualizado después).';
