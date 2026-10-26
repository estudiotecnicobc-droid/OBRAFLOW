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
