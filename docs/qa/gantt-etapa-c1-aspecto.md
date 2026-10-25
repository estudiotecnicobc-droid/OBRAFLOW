# QA manual — Gantt Etapa C1 (aspecto tipo Brikel)

**Qué se agregó:** cabecera de 4 tarjetas, barra de herramientas en dos filas, plan base dibujado
como barra punteada, banda "Plan vs Real", barra de partida con color y %, leyenda de partidas.

**Automático ya corrido:** `npx tsc --noEmit` (sin errores nuevos: los 25 que aparecen ya existen
en `main`, en otros archivos), `npx vitest run` (37 tests, 6 nuevos de `planVsReal`), `npx vite
build` OK.

## Qué probar en la vista previa (cuenta QA, un proyecto con varias partidas y avance cargado)

1. **Cabecera:** Planificación muestra 4 tarjetas: Inicio (fecha + día), Fin (fecha + día),
   Duración ("N sem" y "N hábiles · M corridos") y el anillo de Avance físico con un %.
2. **Barra de herramientas** (Tabla → "Mostrar Gantt"), en dos filas:
   - Fila 1: Colapsar todo · Estado / Partida / Ruta crítica · Avance real · Dependencias ·
     cursor de fecha · Hoy.
   - Fila 2: Día/Sem/Mes/Trim/Todo · zoom · Plan base (selector, ojo, "Fijar") · MS Project ·
     Imprimir.
3. **Colapsar todo:** colapsa todas las partidas en la tabla y en el Gantt; el botón pasa a
   "Expandir todo" y las vuelve a abrir.
4. **Partida en la tabla:** cada fila de partida tiene flecha para colapsar, punto de color y su %.
5. **Avance real apagado:** las barras se ven de un solo tono, sin tramo oscuro.
6. **Dependencias apagado:** desaparecen las líneas entre barras.
7. **Plan base:**
   - Sin línea base: la banda gris dice "Fijá o elegí una línea base…" y muestra el conteo por estado.
   - Apretar "Fijar", poner un nombre y elegirla en el selector: aparece una barra fina punteada
     gris debajo de cada tarea, y la banda pasa a verde "Fin de obra: en tiempo · 0 atrasadas…".
   - Cambiar la cantidad o las cuadrillas de una tarea (modo Editar) para que termine más tarde:
     la banda pasa a ámbar o rojo, cuenta 1 atrasada y muestra "Mayor desfase: <tarea> +N días".
   - El ojo oculta y vuelve a mostrar la barra punteada.
8. **Leyenda:** con color "Partida", aparece al pie del Gantt la lista de partidas con su color.
9. **Seguimiento y Control → Gantt:** la misma barra de herramientas y banda aparecen ahí, y la
   pestaña Tabla de Control sigue funcionando con su selector de línea base.

## Qué no hace todavía (no es un bug si lo ves)

- La barra punteada se recalcula con los rendimientos y vínculos actuales (ver spec §3).
- Las líneas base siguen guardadas en el navegador: en otra computadora no aparecen.
- No hay fila de hitos, panel de edición al hacer clic, tolerancia ni arrastre (C2 a C5).
