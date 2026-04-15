Gemini ha dicho
Aquí tienes una propuesta completa para tu archivo REGLAS_NEGOCIO_OBRA.md, redactada específicamente a partir de la estructura de datos, cálculos y jerarquías que se desprenden de los archivos base de costos y presupuestos que subiste.

Este documento servirá como la columna vertebral de la lógica de tu aplicación de gestión de obras.

REGLAS_NEGOCIO_OBRA.md
Este documento define la lógica central, los cálculos y las restricciones para el módulo de Presupuestación y Control de Obras en el sistema.

1. Glosario y Lenguaje Ubicuo
Para garantizar la consistencia en el código y en la base de datos, se definen las siguientes entidades principales:

Insumo: La unidad mínima de costo. Puede ser un material (ej. ladrillo cerámico hueco), mano de obra (ej. Oficial, Ayudante), equipo o subcontrato.

Análisis de Costo (o Composición): La receta que define qué insumos y en qué cantidades se necesitan para ejecutar una unidad de una Tarea.

Tarea: Un ítem de trabajo cuantificable que forma parte de la obra (ej. "Excavación de zanjas", "Mampostería"). Se mide en una unidad específica (M2, M3, ML, GL).

Rubro: Agrupación lógica de tareas según la etapa de la obra (ej. "01 Demoliciones", "04 Fundaciones").

Explosión de Insumos: El cálculo consolidado de la cantidad total de cada insumo necesario para toda la obra, sumando sus apariciones a lo largo de todas las tareas presupuestadas.

Cuadro Empresario (Cierre de Presupuesto): Resumen financiero que aplica porcentajes de gastos, beneficios e impuestos al costo directo para obtener el precio final de venta.

2. Jerarquía y Categorización Estricta
El sistema debe respetar la siguiente estructura de agrupamiento para permitir reportes e incidencias correctas:

[RN-CAT-01] Familias de Insumos: Todo insumo DEBE pertenecer obligatoriamente a una de las siguientes 5 familias fijas:

MATERIAL

MANO DE OBRA

EQUIPOS

SUBCONTRATO

COSTO INDIRECTO

[RN-CAT-02] Divisiones de Insumos: Además de la familia, el insumo debe categorizarse en una "División" más específica (ej. Familia: MATERIAL -> División: AGLOMERANTES, ACERO, ARIDO). Las divisiones permiten calcular la incidencia de cada rubro en el costo total.

[RN-CAT-03] Estructura del Presupuesto: Un presupuesto válido está compuesto por Rubros. Cada Rubro contiene Tareas. Cada Tarea debe tener un Análisis de Costos asociado.

3. Reglas de Cálculo de Costos
El motor de cálculo del presupuesto debe ejecutarse en cascada de la siguiente manera:

[RN-CALC-01] Costo Unitario de Tarea:
Se calcula sumando el costo de todos los insumos de su Análisis de Costo.
Costo Unitario Tarea = Σ (Cantidad de Insumo × Costo Unitario de Insumo)

[RN-CALC-02] Subtotal de Tarea en Presupuesto:
Subtotal Tarea = Cantidad a ejecutar de la Tarea × Costo Unitario Tarea

[RN-CALC-03] Costo Directo Total de la Obra:
Es la suma de todos los subtotales de las tareas del presupuesto.

4. Reglas del "Cuadro Empresario" (Cierre Financiero)
Una vez obtenido el Costo Directo, el sistema debe calcular el Precio Final aplicando las siguientes fórmulas sobre la base imponible correspondiente:

[RN-FIN-01] Gastos Generales:
Se calcula como un porcentaje aplicado estrictamente sobre el Costo Directo. (Valor por defecto: 15%).

[RN-FIN-02] Costo Total:
Costo Total = Costo Directo + Gastos Generales

[RN-FIN-03] Beneficios (Rentabilidad):
Se calcula como un porcentaje aplicado sobre el Costo Total (no sobre el directo). (Valor paramétrico, ej: 9.81%).

[RN-FIN-04] Precio antes de Impuestos (Subtotal Venta):
Precio Base = Costo Total + Beneficios

[RN-FIN-05] Estructura Impositiva:
Los impuestos se calculan sobre el Precio antes de impuestos:

IVA = Precio Base × 21%

Ingresos Brutos = Precio Base × 3.5%

Impuesto al Cheque = Proporción calculada sobre los movimientos bancarios (ej. 1.21%).

[RN-FIN-06] Precio Final de Obra:
Es la suma del Precio Base más todos los impuestos aplicables.

5. Reglas de la Explosión de Insumos
Para el módulo de compras y control de stock, el sistema debe poder descomponer el presupuesto:

[RN-EXP-01] Cálculo Consolidado: El sistema debe multiplicar la cantidad requerida de cada tarea en el presupuesto por el rendimiento de cada insumo en su respectivo análisis de costos.

[RN-EXP-02] Agrupación Única: Si un mismo insumo (ej. Cemento Portland) se utiliza en la Tarea A (Fundaciones) y en la Tarea B (Mampostería), la "Explosión" debe consolidar ambas cantidades en una sola fila, mostrando el total a comprar para la obra.

[RN-EXP-03] Incidencia Matemática: La vista de explosión debe calcular automáticamente el porcentaje de incidencia (% TOTAL) que representa el monto de cada insumo consolidado sobre el Costo Directo Total de la obra, permitiendo identificar rápidamente los insumos críticos (Principio de Pareto / Curva ABC).

💡 Sugerencia de implementación: Te recomiendo que los porcentajes del Cuadro Empresario (15% de gastos generales, 21% de IVA, etc.) no estén "hardcodeados" en el código fuente de tu aplicación, sino que sean variables configurables en la base de datos por cada proyecto, ya que la carga impositiva o la rentabilidad esperada puede cambiar de una obra a otra.