# Reportes unificados

## Objetivo
Que el usuario encuentre todos los reportes de la obra en un solo lugar, con el mismo criterio para verlos, imprimirlos y descargarlos.

## Pantalla Reportes (`src/features/reports/ReportsHub.tsx`)
La entrada «Reportes» de la barra lateral (`reports_view`) abre un catálogo por categorías. Cada tarjeta indica qué incluye y en qué formatos sale.

| Categoría | Reporte | Cómo se abre | Formatos | Roles |
|---|---|---|---|---|
| Presupuesto | Para el cliente, Técnico, Interno, Por rubros | Vista de impresión del presupuesto, con el modo ya elegido | PDF | admin, PM |
| Materiales | Lista de compras **(nuevo)** | Visor | PDF, Excel | admin, PM, worker |
| Materiales | Pedido de cotización **(nuevo)**: sin precios, sin membrete ni datos del estudio | Visor | PDF, Excel | admin, PM, worker |
| Materiales | Explosión de insumos (existente, RPC) | Visor | PDF, Excel, CSV | admin, PM |
| Mano de obra | Por oficio y por rubro **(nuevo)** | Visor | PDF, Excel | admin, PM, worker |
| Análisis de precios | Fichas de APU de la obra **(nuevo)** | Visor | PDF, Excel | admin, PM |
| Análisis de precios | APU de la empresa (existente) | Visor | Excel, CSV | admin, PM |
| Seguimiento | Plan de trabajos | Planificación, con la impresión ya abierta | PDF | admin, PM, worker |
| Seguimiento | Reporte ejecutivo | Tablero, con la vista previa ya abierta | PDF | todos |
| Seguimiento | Presupuesto a una fecha de costos (existente) | Visor | Excel, CSV | admin, PM |

- Los reportes nuevos se arman con los datos de la obra cargados en pantalla (`reportData.ts`) y usan el mismo motor de precios unitarios que el presupuesto (`calculateUnitPrice`, jornada de 9 h).
  - **Lista de compras:** suma los materiales de todos los APU con su desperdicio. La cantidad a comprar va redondeada hacia arriba en la unidad comercial del material (`conversionFactor`), o por pieza si la unidad es u, rollo, bolsa, balde, etc. Agrupa por la categoría del material.
  - **Mano de obra:** horas = 9 h ÷ rendimiento diario × cantidad de operarios × cantidad del ítem, por oficio y por rubro, con costo hora con cargas sociales y seguros. Incluye las cuadrillas. Los APU con mano de obra global, sin oficios, se suman aparte.
  - **Fichas de APU:** una ficha por tarea del presupuesto, con materiales, mano de obra y equipos. Los subtotales coinciden con el motor de precios.
- **Impresión:** se abre en una ventana aparte (`printDocument`), con Times New Roman y estilos en línea.
- **Excel:** usa el estilo común de `exportXlsx.ts`.
- **Navegación entre pantallas:** se resuelve con `reportIntents.ts`. La pantalla de Reportes deja un pedido y navega. La pantalla destino (Presupuesto, Tablero, Planificación o Reportes) lo toma una sola vez al montarse.

## Botones del Presupuesto
- Todos los botones del encabezado tienen la misma altura y el mismo estilo:
  - «Presupuesto rápido» y «Comparar costos» como secundarios, y el segundo marca cuándo está activo;
  - «Reportes ▾» como principal.
- «Imprimir» pasa a ser el menú «Reportes ▾». Incluye:
  - los cuatro modos de impresión;
  - «Personalizar columnas y formato…», que abre la vista de impresión con el modo actual;
  - accesos a Lista de compras, Pedido de cotización y Mano de obra;
  - «Ver todos los reportes».

## Otros cambios
- La tarjeta «Centro de Reportes» del Tablero lleva a la pantalla nueva.
- `piecePurchase` pasa a `utils/purchase.ts`, sin dependencia de Supabase, para poder usarlo en cálculos puros.

## Fuera de alcance
- Las vistas «Reportes e Ingeniería» del Tablero y el «Centro de Reportes» de Base de empresa siguen existiendo sin cambios.
- Agrupar la lista de compras por proveedor.
