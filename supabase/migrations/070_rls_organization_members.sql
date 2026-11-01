-- =============================================================================
-- Migración 070: cerrar el alta/edición libre de miembros de empresa (CRÍTICO)
--
-- En producción había políticas creadas fuera del repo con condición `true`:
--   organization_members_insert_authenticated  (INSERT  WITH CHECK true)
--   organization_members_update_authenticated  (UPDATE  USING true / CHECK true)
--   organization_members_delete_authenticated  (DELETE  USING true)
-- Como las políticas permisivas se suman, cualquier usuario logueado podía
-- agregarse como owner a cualquier empresa y leer o editar todos sus datos.
-- Además:
--   members_insert  dejaba a cualquier miembro (también viewer) insertar filas
--                   con cualquier rol en su empresa;
--   members_update  dejaba a cualquier miembro cambiar roles (p. ej. viewer → admin);
--   members_delete  dejaba a cualquier miembro dar de baja a otros, incluso al owner;
--   organizations_insert_authenticated permitía crear empresas sueltas por API
--                   (disparando el seed y la suscripción de prueba).
--
-- La app no los necesita: el alta de empresa y de miembros va por
-- bootstrap_organization y accept_invitation (SECURITY DEFINER), y la UI solo
-- cambia roles, lo que cubre org_members_update_role (admin, nunca el owner).
--
-- Queda:
--   SELECT  members_select, org_members_select, organization_members_select_own
--   UPDATE  org_members_update_role (admin de la empresa; no toca al owner ni asigna owner)
--   DELETE  members_delete (admin de la empresa; nunca al owner)
--   INSERT  ninguna (solo RPC SECURITY DEFINER)
--
-- Idempotente.
-- =============================================================================

DROP POLICY IF EXISTS organization_members_insert_authenticated ON public.organization_members;
DROP POLICY IF EXISTS organization_members_update_authenticated ON public.organization_members;
DROP POLICY IF EXISTS organization_members_delete_authenticated ON public.organization_members;
DROP POLICY IF EXISTS members_insert ON public.organization_members;
DROP POLICY IF EXISTS members_update ON public.organization_members;

DROP POLICY IF EXISTS members_delete ON public.organization_members;
CREATE POLICY members_delete ON public.organization_members
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id) AND role <> 'owner');

DROP POLICY IF EXISTS organizations_insert_authenticated ON public.organizations;
