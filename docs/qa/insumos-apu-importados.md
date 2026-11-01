# QA — Insumos de APU importados

## Causa
`task_yields.waste_percent` es NOT NULL (default 0). Al importar un APU cuyo material no traía desperdicio, la app enviaba `null`, el insert fallaba en silencio y la tarea quedaba sin materiales al recargar. Pasaba lo mismo al guardar un APU desde el editor (`replaceAllYields`).

## Corrección
- `services/tasksService.ts`: `upsertYield` y `replaceAllYields` envían 0 cuando no hay desperdicio.
- Migración 066: recupera los materiales de las tareas de presupuesto sin ningún material, copiándolos de su APU de origen y vinculándolos al material de la empresa del mismo nombre.

## Probar
- [ ] Antes de aplicar la 066: en una obra afectada, Reportes → Lista de compras sale vacía o incompleta.
- [ ] Después de aplicar la 066 y recargar: la lista de compras muestra los materiales y el presupuesto suma el costo de materiales de esas tareas.
- [ ] Presupuesto rápido → Durlock en una obra nueva → recargar la página: las tareas conservan sus materiales.
- [ ] Editar un APU, agregar un material sin desperdicio, guardar y recargar: el material sigue ahí.
