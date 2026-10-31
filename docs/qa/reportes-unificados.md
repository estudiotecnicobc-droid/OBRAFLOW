# QA — Reportes unificados

Probar con una obra que tenga tareas con materiales y mano de obra; por ejemplo, la plantilla Durlock del presupuesto rápido.

## Pantalla Reportes
- [ ] La barra lateral → Reportes muestra las tarjetas agrupadas en Presupuesto, Materiales, Mano de obra, Análisis de precios y Seguimiento.
- [ ] Con una obra sin tareas aparece el aviso amarillo, y las tarjetas de compras, cotización, mano de obra y fichas están deshabilitadas.
- [ ] Con un usuario cliente solo aparece «Reporte ejecutivo». Con un usuario worker no aparecen las tarjetas de Presupuesto.

## Presupuesto
- [ ] «Para el cliente» abre la vista de impresión del presupuesto en modo Cliente. Lo mismo con Técnico, Interno y Por rubros.

## Lista de compras
- [ ] Agrupa por categoría de material, con subtotal por categoría y total.
- [ ] La columna «A comprar» está redondeada hacia arriba. En materiales con unidad comercial (bolsa, balde) muestra esa unidad.
- [ ] «Imprimir / PDF» abre una ventana para imprimir. «Excel» descarga `lista_compras_<obra>.xlsx`.

## Pedido de cotización
- [ ] No muestra precios, nombre de obra, membrete ni datos del estudio. Tiene columnas vacías para precio y subtotal, y renglones para plazo, envío, pago y validez.
- [ ] El Excel tiene la misma estructura.

## Mano de obra
- [ ] Ejemplo de control: 48 m² de pared Durlock estándar con un rendimiento de 7,2 m²/día da 60 h de durlero y 60 h de ayudante.
- [ ] Las tablas por oficio y por rubro suman lo mismo.

## Fichas de APU
- [ ] El costo unitario de cada ficha coincide con el precio unitario del presupuesto en modo Costo Directo.

## Seguimiento
- [ ] «Plan de trabajos» abre Planificación y, al segundo, el diálogo de impresión.
- [ ] «Reporte ejecutivo» abre el Tablero con la vista previa del reporte completo.
- [ ] «Explosión de insumos», «APU de la empresa» y «Presupuesto a una fecha de costos» se ven dentro de Reportes, con el botón «← Reportes» para volver.

## Botones del Presupuesto
- [ ] Los botones del encabezado tienen la misma altura. «Actualizar presupuesto» se ve en azul cuando está activo.
- [ ] El menú «Reportes ▾» se cierra al hacer clic afuera.
- [ ] Cada opción del menú abre lo que dice.
- [ ] «Lista de compras» del menú lleva a Reportes con el reporte ya abierto.
