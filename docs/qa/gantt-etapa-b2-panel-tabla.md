# QA manual — Gantt Etapa B, segundo PR (panel de la tabla)

**Qué se agregó:** el Gantt ya no es una pestaña aparte. En Planificación → Tabla hay un
botón "Mostrar Gantt" que lo abre como panel al costado de la tabla, con el mismo scroll
vertical — cada fila cae al lado de su barra.

**Automático ya corrido:** `npm run test` (58 tests, sin regresiones), `npx tsc --noEmit` y
`npm run build` sin errores nuevos. Probado visualmente en local con la cuenta QA.

## Qué probar en la app

1. **Abrir un proyecto con varias tareas** (ideal: más de una categoría/rubro, para ver
   varias filas resumen) → Planificación → pestaña Tabla.
2. **"Mostrar Gantt":** confirmar que aparece el panel al costado con las barras, y que la
   barra de herramientas del Gantt (Día/Sem/Mes/Trim/Todo, zoom, Ir a HOY, exportar,
   imprimir) aparece junto al botón.
3. **Alineación:** hacer scroll vertical en la tabla (o en el Gantt) y confirmar que cada
   fila sigue cayendo al lado de su barra — probar con un proyecto con bastantes tareas,
   que obligue a scrollear.
4. **Resize:** arrastrar el divisor entre la tabla y el Gantt — debería poder agrandar o
   achicar cada panel.
5. **"Ocultar Gantt":** vuelve a la tabla completa de siempre (dos líneas por tarea,
   columnas de Precedencia/Fechas visibles sin compartir espacio con el Gantt).
6. **Categoría y medición:** con el panel abierto, la categoría de la tarea aparece junto
   al nombre (separada por "·"), no en una segunda línea — y si hay una planilla de
   medición cargada, el "(Med: X%)" aparece al pasar el mouse sobre la columna Avance, no
   como texto visible. Con el panel cerrado, vuelve a verse como antes (dos líneas, badge
   visible).
7. **Seguimiento y Control → Gantt:** confirmar que esa pestaña sigue funcionando igual que
   antes (no debería haber cambiado para el usuario, aunque por dentro comparte el mismo
   código de renderizado).

## Qué no hace todavía (no es un bug si lo ves)

- Las filas de la tabla miden siempre lo mismo (44px) cuando el panel está abierto. Si el
  nombre de una tarea es muy largo, se trunca (con "..." y tooltip) en vez de hacer la fila
  más alta — es la decisión de diseño documentada en la spec.
- El resto de la Etapa B (etiqueta de avance en la barra, color por partida, cursor de
  fecha, duración hábiles/naturales, modo lectura, columna Estado) sigue pendiente.
