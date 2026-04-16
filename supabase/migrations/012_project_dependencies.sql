-- 012_project_dependencies.sql
-- Agrega columna JSONB para almacenar dependencias entre ítems de presupuesto (Gantt).
-- Ejecutar en Supabase Dashboard > SQL Editor.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS dependencies jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN projects.dependencies IS
  'Array de ProjectDependency: { id, fromTaskId, toTaskId, type, lag, note? }';
