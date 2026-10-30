# Plan de trabajos automático

## Objetivo
Armar el plan de trabajos a partir del presupuesto con un clic, usando el rendimiento de cada tarea, y dejarlo listo para ajustar a mano.

## Alcance
- Botón "Generar plan de trabajos" en Planificación (vista Tabla). Abre una vista previa con fecha de inicio editable, fin estimado, plazo y barras por rubro.
- Vínculos (`services/autoPlan.ts`):
  - dentro de cada rubro, las tareas se encadenan Fin-Comienzo en el orden del presupuesto (una cuadrilla por rubro);
  - entre rubros, la secuencia de obra típica: preliminares, suelos, fundaciones, estructura, mampostería (aislaciones en paralelo), cubierta, instalación gruesa, revoques, cielorrasos, contrapisos, carpetas, carpinterías, pisos y revestimientos, terminación de instalaciones, pintura, exteriores y conforme a obra;
  - las instalaciones (22 a 29, 36 y 37) se parten en gruesa (cañerías, cableado, conductos, bocas) y terminación (artefactos, griferías, tableros, equipos, pruebas);
  - si un rubro predecesor no está en el presupuesto, se usan sus propios predecesores;
  - los gastos generales (seguro, baño químico, seguridad e higiene, obrador y rubros 90 a 95) no se encadenan y se estiran a todo el plazo con duración manual.
- Al aplicar: reemplaza `project.dependencies`, guarda la fecha de inicio en el proyecto y en cada ítem, y la duración de los gastos generales. No cambia cantidades ni precios. Respeta frentes de ataque y duraciones manuales cargadas.

## Fuera de alcance
- Nivelación de recursos entre rubros que comparten gremio.
- Superposiciones parciales (lag negativo) entre tareas del mismo rubro.
