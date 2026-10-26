# Actualización de presupuesto por índice

## Objetivo
Actualizar un presupuesto que todavía no fue aprobado (obra en etapa de presupuesto) cuando pasó tiempo
desde su creación, con un índice elegido por el usuario, y generar un reporte con el cálculo.

## Dónde
Presupuesto → Ítems y presupuesto → **Comparar costos** → pestaña "Actualizar por índice".
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
- `price_indices` (migración 059): CAC e ICC, carga manual mensual del master admin en Configuración → Índices. Lectura para todos.
- Inflación y dólar: función `api/indices.ts` (Vercel) que lee ArgentinaDatos, con caché de 3 h.
- `budget_versions` (migración 059): fotos selladas. Al guardar la primera actualización se crea la v1 con el presupuesto original y la v2 actualizada.

## Reglas
- Con la obra en ejecución se puede consultar pero no guardar versiones.
- Guardar requiere rol admin o project_manager.
- El presupuesto vivo no se modifica: las versiones guardan los importes actualizados y el reporte.
