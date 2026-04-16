-- ============================================================
-- Migración 013: Campos de calendario, configuración laboral
--               y pricing legacy en tabla public.projects
-- Fecha: 2026-04-01
-- Tabla afectada: public.projects
--
-- Contexto:
--   ProjectSettings.tsx persiste workdayHours, workingDays,
--   nonWorkingDates, laborForce, assignedCrews y pricing vía
--   projectsService.update(), pero la tabla no tenía las columnas
--   correspondientes. buildUpdateRow ignoraba silenciosamente esos
--   campos → "Guardado!" aparecía aunque nada se escribía en DB.
--
-- Estrategia:
--   · ADD COLUMN IF NOT EXISTS — idempotente.
--   · Nullable sin DEFAULT: filas existentes quedan con NULL.
--     El frontend ya aplica || [] / || DEFAULT_PRICING_CONFIG
--     cuando el valor de DB es NULL.
--   · working_days como jsonb (array de int) para simplificar
--     la serialización desde supabase-js.
--   · pricing como jsonb: modelo PricingConfig legacy. Se persiste
--     aquí para que el tab Financial de ProjectSettings funcione.
--     A largo plazo, migrar a businessConfig (columnas ggd_pct etc.).
-- ============================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS workday_hours        integer,
  ADD COLUMN IF NOT EXISTS workday_start_time   text,
  ADD COLUMN IF NOT EXISTS workday_end_time     text,
  ADD COLUMN IF NOT EXISTS lunch_break_duration integer,
  ADD COLUMN IF NOT EXISTS working_days         jsonb,
  ADD COLUMN IF NOT EXISTS non_working_dates    jsonb,
  ADD COLUMN IF NOT EXISTS labor_force          jsonb,
  ADD COLUMN IF NOT EXISTS assigned_crews       jsonb,
  ADD COLUMN IF NOT EXISTS pricing              jsonb;

COMMENT ON COLUMN public.projects.workday_hours        IS 'Horas de jornada laboral (ej: 8, 9). NULL = usa default del frontend.';
COMMENT ON COLUMN public.projects.workday_start_time   IS 'Hora inicio jornada "HH:MM" (ej: "08:00").';
COMMENT ON COLUMN public.projects.workday_end_time     IS 'Hora fin jornada "HH:MM" (ej: "17:00").';
COMMENT ON COLUMN public.projects.lunch_break_duration IS 'Duración del almuerzo en minutos (ej: 60).';
COMMENT ON COLUMN public.projects.working_days         IS 'Array JSON de días laborables: [1,2,3,4,5] = Lun-Vie.';
COMMENT ON COLUMN public.projects.non_working_dates    IS 'Array JSON de feriados: [{date:"YYYY-MM-DD", description:"..."}].';
COMMENT ON COLUMN public.projects.labor_force          IS 'Array JSON de PersonalLaboral asignado al proyecto.';
COMMENT ON COLUMN public.projects.assigned_crews       IS 'Array JSON de cuadrillas asignadas al proyecto.';
COMMENT ON COLUMN public.projects.pricing              IS 'PricingConfig legacy (gastos generales, utilidad, IVA). '
                                                          'NULL = frontend usa DEFAULT_PRICING_CONFIG. '
                                                          'Preferir businessConfig (ggd_pct, etc.) para nuevos desarrollos.';
