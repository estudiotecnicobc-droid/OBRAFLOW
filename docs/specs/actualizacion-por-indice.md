# Actualización de presupuesto por índice

## Objetivo
Actualizar un presupuesto que todavía no fue aprobado (obra en etapa de presupuesto) cuando pasó tiempo
desde su creación, con un índice elegido por el usuario, y generar un reporte con el cálculo.

## Dónde
Presupuesto → Ítems y presupuesto → **Actualizar presupuesto** → pestaña "Actualizar por índice".
La pestaña "Comparar precios de la base entre dos fechas" es la comparación que ya existía.

## Métodos
| Método | Series |
|---|---|
| Índice CAC | `cac_general` para todo |
| ICC INDEC | `icc_general` para todo |
| Inflación (IPC) | `ipc` (ArgentinaDatos, encadenado base 100) |
| Variación del dólar | `usd_oficial`, `usd_mep` (casa `bolsa`) o `usd_blue`: último valor de venta del mes |
| Por componente (CAC) | materiales `cac_materiales`, mano de obra `cac_mano_obra`, equipos `usd_oficial`, otros `cac_general` |
| Por componente (ICC) | igual con `icc_*` |
| Porcentaje fijo | 1 + % para todo |

## Cálculo
- Mes base por defecto: último período publicado igual o anterior al mes de creación de la obra (`projects.created_at`). Se puede cambiar.
- Mes destino: elegible entre los publicados posteriores al base (por defecto el último).
- Coeficiente por componente = índice destino ÷ índice base. Cada componente del precio unitario
  (materiales, mano de obra, equipos, precio fijo) se multiplica por su coeficiente.
- Precio de venta = costo directo × K del Cuadro Empresario del proyecto.

## Datos
- `price_indices` (migración 059): CAC e ICC. Se actualizan solos todos los días con `api/sync-indices.ts`
  (cron de Vercel, 08:15 hora argentina), que lee las planillas públicas de IERIC:
  - `ICC-CAC.xls`: CAC nivel general, materiales y mano de obra (base dic-2014 = 100). IERIC publica con unos 3 meses de atraso respecto de la Cámara.
  - `ICC-INDEC.xls`: variaciones mensuales del ICC INDEC desde nov-2015, encadenadas con base oct-2015 = 100.
  Cada corrida reemplaza la serie completa de cada código (misma base) y deja registro en `price_index_sync_runs` (migración 060).
  Cualquier usuario con sesión puede forzarla con "Buscar actualización ahora". La carga manual del master admin sigue disponible.
  Variables de entorno en Vercel: `SUPABASE_SERVICE_ROLE_KEY` y `CRON_SECRET`.
- Inflación y dólar: función `api/indices.ts` (Vercel) que lee ArgentinaDatos, con caché de 3 h.
- `budget_versions` (migración 059): fotos selladas. Al guardar la primera actualización se crea la v1 con el presupuesto original y la v2 actualizada.

## Reglas
- Con la obra en ejecución se puede consultar pero no guardar versiones.
- Guardar requiere rol admin o project_manager.
- El presupuesto vivo no se modifica: las versiones guardan los importes actualizados y el reporte.
