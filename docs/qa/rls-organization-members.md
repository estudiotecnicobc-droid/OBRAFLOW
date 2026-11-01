# QA — RLS de organization_members (migración 070)

Prueba automática local: `supabase/tests/rls_organization_members_setup.sql` (políticas como estaban en producción) + `070` + `rls_organization_members_attack.sql`.
Resultado esperado después de 070: el atacante no se puede sumar a otra empresa, un viewer no se sube de rol ni borra al owner, un admin cambia roles pero no se asigna owner.

En staging / producción, con dos cuentas de prueba:
- [ ] Usuario de la empresa A: `insert` directo en `organization_members` para la empresa B (desde la consola del navegador con supabase-js) → error de RLS.
- [ ] Viewer de A: cambiar su propio rol → no cambia.
- [ ] Admin de A: Usuarios → cambiar rol de un miembro → funciona.
- [ ] Alta de usuario nuevo (registro) → se crea su empresa como owner.
- [ ] Aceptar una invitación → el invitado queda como miembro con el rol de la invitación.
