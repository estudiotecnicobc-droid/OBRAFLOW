# Gantt — Etapa B, segundo PR: el Gantt como panel de la tabla

**Estado:** implementado, pendiente QA manual del usuario
**Alcance:** solo visual/estructural, sobre `components/Planning.tsx`. No toca el motor de
cálculo.
**Origen:** `docs/research/INFORME_FINAL_MEJORAS_OBRAFLOW_2026-10-18.md` §2, ítem B-1 — el
más grande de la Etapa B, por eso va en su propio PR.

## 1. Qué cambia

- **El Gantt deja de ser una pestaña aparte.** Antes había 3 pestañas (Tabla / Gantt /
  Seguimiento y Control). Ahora son 2 (Tabla / Seguimiento y Control) y, dentro de "Tabla",
  un botón **"Mostrar Gantt" / "Ocultar Gantt"** que abre el Gantt como panel al costado,
  con `ResizableSplitPane` (igual componente que ya se usaba para el sidebar simplificado).
- **Scroll vertical compartido de verdad:** la tabla y el Gantt usan la misma constante
  `ROW_HEIGHT` (44px) para cada fila/barra y la misma `HEADER_HEIGHT` (40px) para el
  encabezado. Cuando el panel está abierto, el encabezado de la tabla deja de ser "sticky"
  (igual que el encabezado del SVG, que nunca lo fue) — así ambos paneles usan `scrollTop`
  "plano" y quedan alineados sin necesitar reconciliar un encabezado fijo con uno que no lo
  es. Confirmado visualmente: la fila "Muro Exterior Cerámico 18 cm" cae exactamente al lado
  de su barra roja.
- **Filas de una sola línea cuando el panel está abierto:** la categoría de la tarea (antes
  una segunda línea bajo el nombre) pasa a mostrarse inline (`nombre · categoría`,
  truncado) y el badge "(Med: X%)" de la columna Avance pasa a un tooltip. Es necesario para
  que cada fila mida exactamente `ROW_HEIGHT` sin recortar contenido. **Con el panel
  cerrado, la tabla vuelve a verse como antes** (dos líneas, badge visible) — nada cambió
  ahí.
- **Motor de renderizado del SVG unificado:** se extrajo `renderGanttChart()` (una función
  dentro del componente, no un archivo nuevo) para que la comparten el panel de Tabla y la
  pestaña Gantt de Seguimiento y Control — antes había una sola instancia de este bloque, y
  seguía habiéndolo, pero ahora el panel de Tabla la reutiliza en vez de duplicarla.
- **Se eliminó el toggle "ocultar sidebar"** del Gantt (el botón del ícono de sidebar): ya
  no tenía sentido — el "sidebar" ahora es la tabla completa, y ocultarla es exactamente lo
  que hace "Ocultar Gantt" (apaga el panel entero, vuelve a la tabla sola).

## 2. Qué no cambia

- El motor de cálculo (`scheduleEngine.ts`, `useProjectSchedule.ts`) — intacto.
- La pestaña "Seguimiento y Control" → Gantt sigue funcionando igual que antes (lista
  simplificada + chart), solo que ahora reutiliza `renderGanttChart()` y sus filas pasaron
  de `h-10` (40px) a `ROW_HEIGHT` (44px) para quedar consistentes con el resto.
- Todas las columnas e inputs de la tabla de Planificación (cómputo, frentes, avance,
  precedencia, fechas, costo) — sin cambios funcionales, solo el layout de una celda cuando
  el panel está abierto.

## 3. Decisión de diseño: por qué 44px de alto por fila

El contenido más alto de una fila (nombre + categoría en dos líneas, o el input de avance +
el badge de medición) necesita aproximadamente 36-40px con el padding actual. 44px da margen
sin recortar nada, y es un valor cómodo de reproducir igual en una fila de tabla HTML
(`<tr style={{ height: 44 }}>`) y en el paso vertical de las barras del SVG
(`y = index * 44 + 40`). No se midió el DOM en tiempo real (hubiera requerido
`ResizeObserver` por fila) — en cambio, se simplificó el contenido a una sola línea para que
la altura real sea siempre menor a 44px, y el `height` del `<tr>` la redondea hacia arriba
sin cortar nada. Si en el futuro una fila necesita más contenido del que entra en una línea,
hay que agrandar `ROW_HEIGHT` en vez de confiar en que el contenido entre solo.

## 4. Qué no hace todavía (resto de la Etapa B, próximo PR)

Etiqueta "Nd·X%" + tramo real/resto en la barra (B-3), color por partida/ruta crítica a
elección (B-6), cursor de fecha (B-7), duración hábiles/naturales en la cabecera (B-8),
modo lectura + botón Editar (B-9), columna "Estado" automática en la tabla (B-10).
