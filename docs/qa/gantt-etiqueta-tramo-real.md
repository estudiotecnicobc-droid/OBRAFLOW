# QA manual — etiqueta "Nd · X%" + tramo real/resto en la barra del Gantt

**Qué se agregó:** la etiqueta dentro de la barra del Gantt ahora muestra duración + avance
juntos (`"6d · 40%"`) en vez del nombre de la tarea, y la barra separa visualmente lo
ejecutado (sólido) de lo que falta (claro), ambos con el color del modo elegido
(estado/partida/crítica).

**Automático ya corrido:** `npx tsc --noEmit`, `npx vitest run` (58 tests, sin regresiones) y
`npx vite build`, todos sin errores nuevos. Probado visualmente en local con la cuenta QA.

## Qué probar en la app

1. **Etiqueta:** en Planificación → Tabla, con el panel de Gantt abierto, confirmar que cada
   barra muestra `"Nd · X%"` (ej. `"6d · 40%"`) en vez del nombre de la tarea. Una tarea sin
   avance cargado debería mostrar solo `"Nd"` (sin el `· X%`).
2. **Tarea sin rendimiento:** si hay alguna tarea sin rendimiento asignado, su etiqueta debe
   decir `"s/r"` en vez de un número de días inventado.
3. **Tramo real / resto:** con una tarea que tenga Avance % > 0, confirmar que la barra se ve
   en dos tonos del mismo color — una porción más sólida/oscura (proporcional al % de avance)
   a la izquierda, y el resto más claro/traslúcido a la derecha. No debe aparecer un gris
   genérico superpuesto como antes.
4. **Coherencia con el modo de color:** cambiar el selector Estado/Partida/Crítica (Etapa
   B-3-detalles) y confirmar que el tramo real y el resto siguen usando el mismo color base
   en los tres modos (solo cambia la opacidad entre ambos segmentos).
5. **Ruta crítica:** una tarea crítica debe seguir mostrando el borde oscuro alrededor de toda
   la barra, sin importar el tramo real/resto.
6. **Etiqueta fuera de la barra:** si la barra es muy angosta para el texto, la etiqueta debe
   seguir apareciendo afuera (a la derecha), como ya pasaba antes — ahora con el texto nuevo.

## Qué no hace todavía (no es un bug si lo ves)

- El ancho del tramo real es proporcional a `item.progress`, no a una fecha — si una tarea
  está atrasada, el tramo real no "sabe" que falta, solo refleja el % cargado a mano.
- Este cambio es solo visual; no toca cómo se calcula el avance ni el estado de la tarea.
