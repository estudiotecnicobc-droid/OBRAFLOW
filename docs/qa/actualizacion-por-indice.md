# QA · Actualización de presupuesto por índice

Previo: aplicar `supabase/migrations/059_price_indices_and_budget_versions.sql` en Supabase.

1. Configuración → Índices (master admin): cargar `2026-03;100` y `2026-09;112,4` en CAC general. Aparecen en la tabla.
2. Con usuario no master admin: la pestaña Índices muestra la tabla sin formulario de carga.
3. Presupuesto → Actualizar presupuesto → Actualizar por índice → Índice CAC: mes base = el de creación de la obra o el anterior publicado; destino septiembre 2026; coeficiente 1,1240.
4. Inflación (IPC) y dólar oficial/MEP/blue: cargan solos; el coeficiente coincide con la cuenta mostrada.
5. Por componente (CAC) sin valores de materiales cargados: aviso "Todavía no hay valores cargados".
6. Porcentaje fijo 10 %: costo directo actualizado = original × 1,10.
7. Precio de venta original y actualizado usan el K del Cuadro Empresario.
8. Guardar: se crean v1 (original) y v2; un segundo guardado crea v3.
9. "Reporte": abre ventana con cálculo, resumen, rubros y detalle por ítem; imprime en A4.
10. Obra en ejecución: se ve el cálculo, no aparece el botón Guardar.

## Actualización automática (CAC e ICC)
Previo: migración 060 aplicada y `SUPABASE_SERVICE_ROLE_KEY` y `CRON_SECRET` cargadas en Vercel (Production).
11. Configuración → Índices → "Buscar actualización ahora": aparece "actualización manual del …" con el último CAC y el último ICC publicados.
12. La tabla de CAC general muestra la serie desde 2002 con fuente "IERIC · ICC-CAC (automático …)".
13. Al día siguiente, el estado dice "actualización automática" (corrió el cron).
14. Sin sesión, `POST /api/sync-indices` responde 401.
