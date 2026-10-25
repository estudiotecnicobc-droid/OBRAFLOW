# Gantt — Etapa B, tercer PR: el resto de los detalles

**Estado:** implementado, pendiente QA manual del usuario
**Alcance:** solo visual/interacción, sobre `components/Planning.tsx`. No toca el motor de
cálculo.
**Origen:** `docs/research/INFORME_FINAL_MEJORAS_OBRAFLOW_2026-10-18.md` §2, ítems B-6, B-7,
B-8, B-9, B-10 — todo lo que quedaba pendiente de la Etapa B después del primer PR (colores,
líneas, tooltip) y el segundo (Gantt como panel de la tabla).

## 1. Qué cambia

- **Columna "Estado" automática (B-10):** nueva columna en la tabla de Planificación, entre
  "Avance %" y "Precedencia". Muestra una píldora de color (mismo `STATUS_COLORS`/
  `STATUS_LABELS` que ya calculaba el Gantt desde el primer PR de la Etapa B): No iniciada,
  En curso, Atrasada, Completada.
- **Color de barra a elección (B-6):** selector "Estado | Partida | Crítica" en la barra de
  herramientas del Gantt.
  - Estado: el comportamiento por defecto desde el primer PR.
  - Partida: color determinístico por categoría/rubro (hash simple sobre el nombre, mismo
    color siempre para la misma partida en toda la obra).
  - Crítica: el binario rojo/azul que había *antes* de la Etapa B, ahora como una opción
    más, no el único comportamiento.
  - La ruta crítica se sigue marcando con el borde oscuro (`stroke`) sobre la barra,
    independientemente del modo de color elegido.
- **Duración hábiles · corridos en la cabecera (B-8):** el cartel "Duración Total" ahora
  muestra los dos números — `criticalPathStats.totalDays` (hábiles, ya existía) y los días
  de calendario entre inicio y fin (`diffDays`, nuevo).
- **Cursor de fecha (B-7):** un `<input type="date">` en la barra de herramientas del Gantt.
  Al elegir una fecha, se dibuja una línea vertical violeta en el chart y aparece
  "`XX% plan`" al lado del input — el porcentaje del costo total que *debería* estar
  ejecutado a esa fecha, interpolando linealmente el costo de cada tarea entre su inicio y
  su fin (mismo criterio que ya usa `evm.PV` en `useProjectSchedule`, pero para una fecha
  elegida por el usuario en vez de "hoy"). **Simplificación deliberada:** se eligió un
  `<input type="date">` en vez de arrastrar directamente sobre el chart — arrastrar
  requeriría convertir coordenadas de pantalla a fecha en tiempo real, con scroll y zoom de
  por medio; el selector de fecha da el mismo resultado con menos superficie de bugs.
- **Modo lectura por defecto + botón Editar (B-9):** nuevo toggle "Editar" / "Modo lectura"
  en la pestaña Tabla. Con el modo lectura (por defecto), las columnas Cómputo, Frentes,
  Avance % y Precedencia muestran texto plano en vez de inputs/select — nadie cambia un
  número sin querer. "Editar" los vuelve a mostrar como campos editables, igual que
  siempre. El botón de lápiz que abre el ajuste de rendimiento del APU (`PenTool` en la
  columna Actividad) no depende de este modo — eso ya tenía su propio control de acceso.

## 2. Qué no cambia

- El motor de cálculo — intacto, ningún cambio toca `scheduleEngine.ts` ni
  `useProjectSchedule.ts`.
- El cursor de fecha es de solo lectura (consulta), no mueve ninguna tarea ni genera una
  línea base — eso seguiría siendo "Fijar Línea Base" (Snapshot), sin relación con esto.
- La pestaña Seguimiento y Control no tiene el selector de color ni el cursor de fecha (solo
  la pestaña Tabla del Gantt-panel los expone); si hace falta ahí también, es una extensión
  chica a futuro.

## 3. Decisiones de diseño

- **Por qué un `<input type="date">` para el cursor y no arrastre:** ver §1. Si en el futuro
  se quiere arrastre real, conviene hacerlo como una mejora aparte, no mezclado con esto.
- **Por qué el cursor usa interpolación lineal simple, no CPM:** el mismo criterio que
  `evm.PV`, que ya es la fuente de verdad del "valor planificado" en el resto de la app —
  mantiene consistencia en vez de inventar un segundo modelo de "avance esperado".
- **Por qué el modo lectura no afecta el ajuste de rendimiento (ícono de lápiz):** ese botón
  abre el `APUBuilder` completo (otro componente, con su propio control de acceso) — no es
  un campo de esta tabla, es una navegación a otra pantalla.

## 4. Con esto, la Etapa B queda completa

Los 3 PRs (colores/líneas/tooltip → panel de la tabla → el resto de los detalles) cubren
todos los ítems B-1 a B-10 del informe final. Lo que sigue en el backlog es la Etapa C
(alta de proyecto) y el resto de fases del informe — ver
`docs/research/INFORME_FINAL_MEJORAS_OBRAFLOW_2026-10-18.md` §3.
