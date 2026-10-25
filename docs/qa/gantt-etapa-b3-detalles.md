# QA manual — Gantt Etapa B, tercer PR (el resto de los detalles)

**Qué se agregó:** columna "Estado" en la tabla, selector de color del Gantt (Estado /
Partida / Crítica), duración en días hábiles y corridos, cursor de fecha ("¿cuánto debería
estar hecho a esta fecha?"), y modo lectura por defecto con botón "Editar".

**Automático ya corrido:** `npm run test` (58 tests, sin regresiones), `npx tsc --noEmit` y
`npm run build` sin errores nuevos. Probado visualmente en local con la cuenta QA: columna
Estado, los tres modos de color, "43% plan" calculado correctamente para una fecha de
prueba, toggle Editar/Modo lectura funcionando en ambas direcciones.

## Qué probar en la app

1. **Columna Estado:** en Planificación → Tabla, confirmar que aparece una píldora de color
   junto a cada tarea (No iniciada / En curso / Atrasada / Completada) y que coincide con
   el color de su barra en el Gantt (en modo "Estado").
2. **Color por partida:** con el Gantt abierto, cambiar el selector a "Partida" — las
   barras deberían agruparse por color según su rubro/categoría, y una tarea de la misma
   partida en otra parte de la obra debería tener el mismo color.
3. **Color crítica:** cambiar a "Crítica" — vuelve al rojo/azul binario de antes.
4. **Ruta crítica:** en cualquier modo de color, la tarea crítica debería verse con un borde
   oscuro alrededor de la barra.
5. **Duración hábiles/corridos:** confirmar que el cartel "Duración Total" muestra los dos
   números (ej. "45 días hábiles · 63 corridos").
6. **Cursor de fecha:** elegir una fecha intermedia del proyecto — debería aparecer una
   línea violeta en el Gantt y un "% plan" al lado del selector. Probar con una fecha antes
   del inicio (debería dar 0%) y después del fin (debería dar 100%).
7. **Modo lectura / Editar:** por defecto, Cómputo, Frentes, Avance % y Precedencia se ven
   como texto, no como campos — confirmar que no se pueden tocar sin antes apretar
   "Editar". Con "Editar" activado, deberían volver a verse como siempre (inputs y select).
8. **El lápiz de ajustar rendimiento** (ícono junto al nombre de la tarea) debería seguir
   funcionando igual en los dos modos — no depende de "Editar".

## Qué no hace todavía (no es un bug si lo ves)

- El cursor de fecha se elige con un selector, no arrastrando sobre el Gantt — ver la nota
  de diseño en la spec.
- El selector de color y el cursor de fecha solo están en la pestaña Tabla (con el panel de
  Gantt abierto), no en Seguimiento y Control → Gantt.
- Con esto se termina la Etapa B completa (los 3 PRs). Lo que sigue es la Etapa C (alta de
  proyecto) — ver el informe final.
