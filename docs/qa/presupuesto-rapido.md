# QA · Presupuesto rápido

## Antes de probar
- [ ] Migración 061 ejecutada en Supabase (NOTICE: "Catálogo ObraFlow: 204 APU nuevos").
- [ ] En el catálogo general aparecen los APU `OF-…` con su composición.

## Asistente
- [ ] Presupuesto vacío: la primera opción es "Presupuesto rápido".
- [ ] Presupuesto con ítems: el botón naranja "Presupuesto rápido" abre el asistente.
- [ ] Paso 1 muestra las 10 plantillas con descripción.
- [ ] Paso 2: al cambiar medidas se recalculan los valores de la derecha. En la ampliación, cambiar cubierta y piso modifica las tareas incluidas.
- [ ] Paso 3: cada tarea muestra "Qué incluye", cantidad editable y etiqueta de origen. Destildar una tarea la excluye.
- [ ] Paso 4 informa cuántas tareas se agregaron, cuántas con análisis de precio y si faltó algún oficio.

## Resultado en el presupuesto
- [ ] Las tareas aparecen en sus rubros con la cantidad elegida (también cantidades menores a 1).
- [ ] Las tareas copiadas del catálogo general tienen materiales y mano de obra con precio.
- [ ] Empresa sin el oficio "Oficial Especializado": se crea solo y la tarea queda con mano de obra.
- [ ] Las tareas sin APU quedan con la cantidad y precio en cero, listas para completar.
- [ ] Repetir la misma plantilla no duplica APU en el catálogo de la empresa.

## Base maestra por rubro (062)
- [ ] Migración 062 ejecutada (NOTICE: "Base maestra ObraFlow: 366 APU nuevos, 123 actualizados"; una segunda corrida da 0 nuevos).
- [ ] Paso 1 muestra "Obras completas" y "Por rubro" con 41 rubros; el buscador filtra por rubro o tarea (por ejemplo, "látex").
- [ ] Elegir 34 Pintura y 31 Amoblamiento: el paso 2 muestra los datos de cada rubro por separado; cambiar la pintura de paredes a "Satinado lavable" cambia la tarea incluida.
- [ ] Las tareas de pintura se copian con el oficio "Pintor" con 0 % de cargas sociales.
- [ ] Las tareas quedan en su rubro oficial (por ejemplo, "34 PINTURA"), sin crear rubros nuevos.

## Rubros
- [ ] En un presupuesto que tenía "Mampostería", "Pinturas" u "Obra gruesa" como rubros, esas tareas aparecen dentro de 06, 34 y el rubro que corresponda, y los rubros sueltos desaparecen de la lista.
- [ ] Imprimir el presupuesto: los subtotales por rubro coinciden con la pantalla.
