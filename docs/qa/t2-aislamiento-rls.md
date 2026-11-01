# QA · T2 aislamiento RLS

- [ ] En el PR, el job **Aislamiento RLS** de CI pasa (verde) con 210/210 ok.
- [ ] Local (opcional): `PGHOST=… PGUSER=postgres supabase/tests/rls/run.sh` termina sin error.

## Al aplicar la 072 (requiere OK)
- [x] Aplicada en producción 31/10/2026 (rollback en docs/db/rollback-072.sql).
- [x] Registrada en schema_migrations (20261031231000).
- [ ] En la app: Personal y cuadrillas → asignar cuadrilla a una tarea y guardar (debe funcionar).
- [ ] Catálogo maestro: recursos globales y propios se siguen viendo; APU con rendimientos del catálogo nuevo se siguen viendo.
- [x] Snapshot actualizado, `_t.conocidos` vacía, 210/210.
