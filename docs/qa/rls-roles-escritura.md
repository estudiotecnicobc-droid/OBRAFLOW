# QA · 073 permisos por rol

- [ ] CI verde: Aislamiento RLS 210/210 y roles 53/94 + 41 conocidas (antes de aplicar).
- [ ] Aplicar 073 (con OK). Rollback: `docs/db/rollback-073.sql`.
- [ ] Owner/admin/editor: crear obra, editar presupuesto, editar APU del catálogo, asignar cuadrilla → funciona.
- [ ] Invitar usuario como admin/editor/viewer → funciona; aceptar invitación → funciona.
- [ ] (Si hay cuenta viewer de prueba) ve la obra pero no puede guardar cambios.
- [ ] Regenerar snapshot, vaciar `_t.conocidos_roles`, CI 94/94.
