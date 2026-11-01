# QA · T2 aislamiento RLS

- [ ] En el PR, el job **Aislamiento RLS** de CI pasa (verde) con 203/210 ok y 7 fugas conocidas.
- [ ] Local (opcional): `PGHOST=… PGUSER=postgres supabase/tests/rls/run.sh` termina sin error.

## Al aplicar la 072 (requiere OK)
- [ ] Backup / ventana acordada.
- [ ] Aplicar `supabase/migrations/072_rls_fugas_lectura_cruzada.sql`.
- [ ] En la app: Personal y cuadrillas → asignar cuadrilla a una tarea y guardar (debe funcionar).
- [ ] Catálogo maestro: recursos globales y propios se siguen viendo; APU con rendimientos del catálogo nuevo se siguen viendo.
- [ ] Regenerar el snapshot con `scripts/db/snapshot_rls.sql`, vaciar `_t.conocidos` y verificar CI verde (210/210).
