# QA · 073 permisos por rol

- [x] CI verde antes de aplicar.
- [x] 073 aplicada en producción 31/10/2026. Rollback: `docs/db/rollback-073.sql`.
- [ ] Owner/admin/editor: crear obra, editar presupuesto, editar APU del catálogo, asignar cuadrilla → funciona.
- [ ] Invitar usuario como admin/editor/viewer → funciona; aceptar invitación → funciona.
- [ ] (Si hay cuenta viewer de prueba) ve la obra pero no puede guardar cambios.
- [x] Snapshot regenerado (150 políticas), `_t.conocidos_roles` vacía, 94/94.
