# QA manual — Gantt Etapa A (motor de dependencias)

**Qué se arregló:** los vínculos entre tareas (columna "Precedencia" en Planificación) ahora
sí corren la fecha de la tarea sucesora. Antes no hacían nada. También se corrigió que las
fechas mostradas en la tabla/sidebar del Gantt aparecían un día antes de la fecha real.

**Automático ya corrido:** `npm run test` (11 tests nuevos en `scheduleEngine.test.ts`, todos
verdes), `npx tsc --noEmit` (sin errores nuevos) y `npm run build` (sin errores nuevos).

## Qué probar en la app (necesita tu sesión, no se puede automatizar)

1. **Abrir un proyecto con al menos 3 tareas** en Planificación → pestaña Tabla.
2. **Crear una dependencia:** en la columna "Precedencia" de la Tarea B, elegir la Tarea A.
   - Esperado: la Fecha Inicio de B pasa a ser el día hábil siguiente al Fin de A.
   - Antes de este fix: no pasaba nada, B seguía con su fecha original.
3. **Cadena:** encadenar A → B → C. Verificar que C arranca después del fin de B (no todas el
   mismo día).
4. **Abanico:** que C dependa de A y de B a la vez (dos predecesoras). Verificar que C arranca
   después del fin de la que termina más tarde de las dos.
5. **Pestaña Gantt:** confirmar que las fechas de la tabla y las barras del Gantt coinciden
   (antes podían verse corridas un día).
6. **Tarea sin rendimiento cargado** (una tarea maestra sin rendimiento diario definido):
   verificar que la columna Duración muestra "Sin rend." (tabla) / "s/r" (sidebar del Gantt)
   en vez de un número inventado.
7. **Feriados:** si el proyecto tiene feriados cargados en Ajustes, verificar que una tarea
   que cruza un feriado termina un día hábil más tarde de lo que terminaría sin el feriado.
8. **No romper nada existente:** abrir un proyecto que ya tenía dependencias creadas antes de
   este fix y confirmar que las fechas siguen siendo razonables (van a correrse si antes
   estaban "sueltas" — es el comportamiento esperado, pero avisar si algo se ve claramente mal,
   por ejemplo fechas en el pasado o tareas que desaparecen de la tabla).
9. **Camino crítico:** confirmar que las tareas marcadas en rojo (crítica) siguen siendo
   coherentes con la cadena más larga del proyecto.

## Qué no se tocó (no hace falta probarlo en esta etapa)

- Tipos de vínculo Comienzo-Comienzo / Fin-Fin / Comienzo-Fin y el campo "lag" (días de
  desfase): siguen visibles en el panel de relaciones de la tarea, pero el motor los sigue
  tratando como Fin-Comienzo sin desfase. Es una decisión pendiente, no un bug de esta etapa.
- Arrastrar barras, importar plan desde Excel, línea base — fuera de alcance.
