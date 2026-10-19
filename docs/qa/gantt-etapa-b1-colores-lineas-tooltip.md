# QA manual — Gantt Etapa B, primer PR (colores, líneas, tooltip)

**Qué se agregó:** en la pestaña Gantt de Planificación, las barras ahora se pintan solas
según su estado (no iniciada / en curso / atrasada / completada), hay una línea de inicio
de obra, un botón "Ir a HOY", y el tooltip al pasar el mouse muestra toda la info de la
tarea (antes solo nombre y duración).

**Automático ya corrido:** `npm run test` (58 tests, todos verdes, sin regresiones),
`npx tsc --noEmit` y `npm run build` sin errores nuevos. Probado visualmente en local
(`npm run dev`) con la cuenta QA del proyecto.

## Qué probar en la app

1. **Abrir un proyecto real** (con fechas vigentes, no de prueba) → Planificación → Gantt.
2. **Colores de barra:** una tarea cuya fecha de fin ya pasó y no está al 100% debería verse
   roja (atrasada); una en curso hoy, azul; una completada (100%), verde; una que todavía no
   arrancó, gris.
3. **Ruta crítica:** las tareas críticas ahora se ven con un borde rojo oscuro alrededor de
   la barra, no con el color entero — confirmar que se distingue bien del color de estado.
4. **Línea de inicio:** línea azul punteada al principio del Gantt con la fecha de inicio de
   la obra.
5. **Botón "Ir a HOY":** hace scroll horizontal hasta centrar la línea de HOY. Si la obra
   todavía no arrancó, el botón aparece deshabilitado (gris, sin click).
6. **Tooltip:** pasar el mouse sobre una barra — debería mostrar código (si la tarea lo
   tiene), nombre, fecha de inicio → fecha de fin, duración o "sin rendimiento cargado", y
   % de avance.

## Qué no hace todavía (no es un bug si lo ves)

- Si el proyecto es muy corto y sus fechas quedaron lejos en el pasado, "Ir a HOY" puede no
  llegar hasta la fecha real — es un límite conocido del ancho del Gantt, documentado en la
  spec. No debería pasar en una obra real con fechas vigentes.
- El resto de la Etapa B (Gantt como panel de la tabla, color por partida, cursor de fecha,
  columna Estado en la tabla, modo lectura) sigue pendiente en próximos PRs.
