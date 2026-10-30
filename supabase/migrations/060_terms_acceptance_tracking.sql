-- =============================================================================
-- Migración: registro de aceptación de Términos y Condiciones / Privacidad
-- Ver docs/legal/checklist-implementacion.md, punto 3 "Registro de la aceptación".
-- =============================================================================

alter table public.profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version      text,
  add column if not exists privacy_version    text;

comment on column public.profiles.terms_accepted_at is 'Momento en que el usuario aceptó los Términos y Condiciones vigentes al registrarse.';
comment on column public.profiles.terms_version is 'Versión de los Términos y Condiciones aceptada (ver docs/legal/terminos-y-condiciones.md).';
comment on column public.profiles.privacy_version is 'Versión de la Política de Privacidad aceptada (ver docs/legal/politica-de-privacidad.md).';
