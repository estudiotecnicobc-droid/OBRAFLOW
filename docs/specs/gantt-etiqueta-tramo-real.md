# Gantt — etiqueta "Nd · X%" + tramo real / resto en la barra

**Estado:** implementado, pendiente QA manual del usuario
**Alcance:** solo visual, sobre `components/Planning.tsx` (`renderGanttChart`). No toca el
motor de cálculo ni ningún otro archivo.
**Origen:** `docs/research/MEJORAS_VISUALIZACION_DIAGRAMAS_MENUS_2026-10-18.md` §1, ítem B-3
(toma de Brikel) — el único punto del Gantt relevado en la investigación FAENA/Brikel que no
había entrado en ninguno de los 3 PRs previos de la Etapa B.

> Nota de nomenclatura: este ítem se llama "B-3" en el documento de origen, pero no tiene
> relación con la rama/PR `feat/gantt-etapa-b3-detalles` (que cubre B-6 a B-10 — selector de
> color, cursor de fecha, etc., ver `docs/specs/gantt-etapa-b3-detalles.md`). Coincidencia de
> numeración entre dos documentos distintos, no el mismo trabajo.

## 1. Qué cambia

- **Etiqueta de la barra:** antes mostraba el nombre de la tarea + `(X%)` si tenía avance.
  Ahora muestra `"Nd · X%"` (duración en días hábiles + avance), o `"s/r"` si la tarea no
  tiene rendimiento cargado (`!item.hasYield`). El nombre de la tarea ya se ve en la tabla al
  lado (Etapa B-2, Gantt-como-panel), así que repetirlo dentro de la barra era redundante.
- **Tramo real / resto:** antes había una barra de un solo color con un overlay oscuro
  semitransparente (`#1e293b` al 40%) sobre la porción de avance. Ahora son dos rects del
  **mismo color** (el que corresponda según `barColorMode`: estado/partida/crítica) a
  distinta opacidad — 0.55 para el resto (todo el ancho), 0.95 para el tramo real
  (`progressWidth`, recortado con `clipPath`). El resultado es el patrón de Brikel: un tramo
  sólido y uno más claro, sin un gris genérico que tape el color de la barra.

## 2. Qué no cambia

- El cálculo de `progress`/`progressWidth` — mismo criterio que antes (`item.progress`).
- El borde de ruta crítica (`stroke`) — se sigue dibujando sobre el rect de "resto", igual
  que antes.
- `barColorMode` (estado/partida/crítica, de la Etapa B-3 "detalles") — el color de origen es
  el mismo, solo cambia cómo se reparte la opacidad entre tramo real y resto.

## 3. Decisiones de diseño

- **Por qué el mismo color en vez de un oscuro fijo para el tramo real:** un overlay fijo
  (`#1e293b`) rompía el código de colores cuando `barColorMode` era "partida" — una barra
  verde con progreso se veía con un parche gris que no decía nada. Usar el mismo `barColor` a
  mayor opacidad mantiene la lectura de color en los tres modos.
- **Por qué `"s/r"` en vez de omitir la duración:** una tarea sin rendimiento cargado no tiene
  `duration` confiable (es `0` o `NaN` según el cálculo); mostrar `"6d"` ahí sería engañoso,
  y dejar la etiqueta vacía perdía la referencia de que la tarea existe pero le falta dato.

## 4. Verificación

- `npx tsc --noEmit` — sin errores nuevos (se eliminó además `barOpacity`, que quedó sin uso
  tras este cambio).
- `npx vitest run` — 58 tests, sin regresiones (las 3 fallas del run son
  `tests/e2e/beta-golden-path.spec.ts`, un spec de Playwright que vitest no debería ejecutar;
  problema de configuración preexistente, no relacionado con este cambio).
- `npx vite build` — build OK.
- Probado visualmente en local (`npm run dev`, cuenta QA, proyecto
  `QA_E2E_Mamposteria_45m2_DELETE_ME`): con Avance % en 40, la etiqueta mostró `"6d · 40%"` y
  la barra se vio con un tramo oscuro (~40% del ancho) a la izquierda y el resto más claro a
  la derecha.
