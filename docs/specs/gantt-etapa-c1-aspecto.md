# Spec — Gantt Etapa C1: aspecto tipo Brikel

**Rama:** `feat/gantt-etapa-c1-aspecto` (sale de `main` una vez mergeados #18, #19 y #20).
**Alcance:** solo `components/Planning.tsx`, más un servicio puro nuevo con sus tests.
**No toca:** base de datos, migraciones, `ERPContext.tsx` ni el motor de scheduling.
**Referencia:** `docs/research/brikel/cronograma-brikel-2026-10-25.md` (local, no versionado).

## 1. Cabecera de 4 tarjetas
Reemplaza el bloque "Fin de Obra Estimado / Duración Total" de la cabecera actual.

| Tarjeta | Dato | De dónde sale |
|---|---|---|
| Inicio | fecha + día de la semana | `project.startDate` |
| Fin | fecha + día de la semana | `criticalPathStats.finishDate` |
| Duración | semanas, y debajo "N hábiles · M corridos" | `criticalPathStats.totalDays`, `naturalDays` (ya existen) |
| Avance físico | anillo con el % | promedio de `item.progress` ponderado por `totalCost` (= `evm.EV / evm.BAC`) |

El botón "Fijar Línea Base" pasa a la barra de herramientas (punto 2).

## 2. Barra de herramientas en dos filas
Aparece cuando el Gantt está visible (Tabla con panel abierto, o Control → Gantt).

- **Fila 1:** Colapsar todo / Expandir todo · Color por [Estado | Partida | Crítica] ·
  Avance real (prende/apaga el tramo sólido) · Dependencias (prende/apaga las líneas) ·
  Cursor de fecha · Ir a HOY.
- **Fila 2:** Escala [Día | Sem | Mes | Trim | Todo] · Zoom − / + · **Plan base**
  [selector de línea base · ojo mostrar/ocultar · "Fijar línea base"] · Imprimir / MS Project
  (los que ya existen).

"Avance real" y "Dependencias" arrancan prendidos. Ningún botón nuevo escribe datos.

## 3. Plan base dibujado en el Gantt
- Con una línea base elegida y el ojo prendido, cada tarea muestra **debajo de su barra una
  barra fina punteada gris** con las fechas que tenía en esa línea base.
- **Cómo se obtienen esas fechas:** se recalcula con `computeSchedule` (el mismo motor puro de
  `services/scheduleEngine.ts`) usando los ítems guardados en la línea base (cantidad,
  cuadrillas, fecha de inicio, duración manual) y el calendario del proyecto.
- **Limitación a aceptar:** el recálculo usa los rendimientos y los vínculos **actuales**. Si
  después de fijar la línea base cambió un rendimiento o un vínculo, la barra punteada se mueve
  con ese cambio. Guardar las fechas congeladas dentro de la línea base requiere tocar
  `ERPContext.createSnapshot`, y eso queda fuera de C1.
- **Otra limitación ya existente:** las líneas base se guardan en el navegador (localStorage),
  no en Supabase. En otra computadora no aparecen. Pasarlas a Supabase es una migración aparte.

## 4. Banda "Plan vs Real"
Encima de la grilla del Gantt.

- **Con línea base elegida:** compara el fin actual de cada tarea con su fin en la línea base.
  - "Fin de obra: **en tiempo**" o "**atrasado N días**" (fin del proyecto actual vs. base).
  - "N atrasadas · N adelantadas · N en tiempo".
  - "Mayor desfase: *tarea* +N días".
  - Verde si el fin de obra está en tiempo; ámbar si hay tareas atrasadas pero el fin no se
    movió; rojo si el fin de obra se atrasó.
- **Sin línea base:** banda gris: "Fijá una línea base para comparar el plan contra lo real",
  más el conteo por estado automático (atrasadas / en curso / completadas / sin iniciar).
- Desfases en **días corridos** en C1. La tolerancia % llega en C3.
- El cálculo va en un servicio puro nuevo, `services/planVsReal.ts`, con tests en
  `services/__tests__/planVsReal.test.ts`.

## 5. Grilla y leyenda
- Barra resumen de partida: fina, con el color de la partida y su % de avance ponderado al
  costado (hoy es gris oscuro sin %).
- **Leyenda de partidas al pie del Gantt** (color + nombre) cuando el color es "Partida".
- La primera fila del Gantt queda reservada visualmente para **HITOS** (vacía en C1; se llena
  en C4). Si complica la alineación con la tabla, se posterga a C4.

## 6. Fuera de C1
Panel de edición al hacer clic (C2) · días hábiles/tolerancia/feriados en el cronograma (C3) ·
hitos (C4) · arrastrar barras (C5, opción C: solo mover) · rol del personal, asignado,
compartir con cliente (fuera de la beta).

## 7. Verificación
`npx tsc --noEmit` sin errores nuevos en los archivos tocados · `npx vitest run` con los tests
nuevos verdes · `npx vite build` · QA manual en `docs/qa/gantt-etapa-c1-aspecto.md` sobre la
vista previa de Vercel.
