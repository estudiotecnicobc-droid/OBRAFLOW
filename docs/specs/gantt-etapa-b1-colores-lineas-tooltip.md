# Gantt — Etapa B, primer PR: colores por estado, línea de inicio, "Ir a HOY" y tooltip completo

**Estado:** implementado, pendiente QA manual del usuario
**Alcance:** solo visual, sobre `components/Planning.tsx`. No toca el motor de cálculo
(`scheduleEngine.ts`/`useProjectSchedule.ts`), ya corregido en la Etapa A/A.2.
**Origen:** `docs/research/INFORME_FINAL_MEJORAS_OBRAFLOW_2026-10-18.md` §2, ítems B-2, B-4,
B-5 (primer recorte de la Etapa B, acordado con el usuario el 18/10/2026).

## 1. Qué cambia

- **Color de barra por estado automático**, calculado solo a partir de fecha y avance (sin
  CPM, sin tocar nada que el usuario cargó):
  - `no_iniciada` (gris, `#94a3b8`): hoy es anterior a la fecha de inicio.
  - `en_curso` (azul, `#3b82f6`): hoy está entre inicio y fin, avance < 100%.
  - `atrasada` (rojo, `#ef4444`): hoy es posterior al fin, avance < 100%.
  - `completada` (verde, `#22c55e`): avance ≥ 100%, cualquiera sea la fecha.
  - La **ruta crítica pasa a ser un borde** (`stroke` rojo oscuro) sobre la barra, no el
    color — así no compite con el color de estado.
- **Línea de inicio de obra**: azul punteada en `x=0`, con la fecha (`INICIO · dd/mm/aaaa`).
  No existía antes; solo estaba la línea de HOY.
- **Botón "Ir a HOY"** en la barra de herramientas del Gantt: centra el scroll horizontal en
  la línea de HOY. Deshabilitado si la obra todavía no arrancó (no hay hacia dónde ir).
- **Tooltip completo** (SVG `<title>`, aparece al pasar el mouse): código de tarea (si
  existe) + nombre + fecha de inicio + fecha de fin + duración (o "sin rendimiento cargado")
  + % de avance + aviso de ciclo de dependencias si corresponde. Antes solo mostraba nombre
  y duración.
- **De paso**, la línea de HOY (que ya existía) se corrigió para usar `toLocalDate` en vez
  de `new Date(project.startDate)` sin ancla local — mismo patrón que el resto del motor
  desde la Etapa A, consistencia más que corrección de un bug observable (el cálculo previo
  no mostraba síntomas gracias a que Argentina siempre está detrás de UTC).

## 2. Límite conocido: el ancho del SVG no siempre llega hasta HOY

El ancho del Gantt se calcula como `duración del proyecto + 45 días de margen`, no en
función de la fecha de hoy. Si un proyecto es corto y sus fechas quedaron en el pasado (caso
de datos de prueba viejos, no de una obra real en curso), la línea de HOY cae fuera del
ancho renderizado y "Ir a HOY" solo puede desplazar hasta el borde derecho existente, no
hasta la fecha real. Verificado con el proyecto de prueba `QA_E2E_Mamposteria_45m2`
(8 días de duración, fechas de mayo/junio 2026). No es un bug de este PR: es una limitación
preexistente del cálculo del ancho, que no se tocó. En un proyecto real con fechas vigentes
no debería notarse. Queda anotado para una futura iteración si hace falta extender el ancho
hasta `max(fin de obra, hoy)`.

## 3. Qué no cambia en este PR (resto de la Etapa B)

Gantt como panel de la tabla (B-1), etiqueta "Nd·X%" + tramo real/resto en la barra (B-3),
color a elección estado/partida/ruta crítica (B-6), cursor de fecha (B-7), duración
hábiles/naturales en cabecera (B-8), modo lectura + Editar (B-9), columna "Estado"
automática en la tabla (B-10) — quedan para los próximos 1-2 PRs de la Etapa B.
