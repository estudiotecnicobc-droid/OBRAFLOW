# Gantt — Etapa A: fix del motor de dependencias

**Estado:** implementado, pendiente QA manual del usuario
**Alcance:** bug fix sobre `Planning.tsx` / `useProjectSchedule.ts`. Sin funciones nuevas de planificación (SS/FF/SF, lag, arrastrar barras, CPM backward real quedan diferidos).
**Origen:** `docs/research/TRASPASO_SESION_2026-10-18.md` §4 Etapa A, confirmado en código antes de tocar nada.

## 1. Bug original

`Planning.tsx` escribe las dependencias que crea el usuario en el modelo centralizado
`project.dependencies: ProjectDependency[]` (`{ fromTaskId, toTaskId, type, lag }`), vía
`addDependency`/`updateDependency`/`removeDependency` de `ERPContext.tsx` (que ya incluía
detección de ciclos al agregar). Pero `useProjectSchedule.ts` calculaba las fechas leyendo
`item.dependencies[].predecessorId` — un campo legacy por-ítem que nada en la UI actual
escribe. Resultado: los vínculos se dibujaban en el Gantt pero nunca movían ninguna fecha.

## 2. Bug adicional encontrado al escribir los tests

Al escribir el test de "cadena" (A → B → C) se detectó que, además del bug de arriba, el
snap a día hábil tenía un off-by-one:

```ts
// antes
startDate = addWorkingDays(addDays(startDate, -1), 1, workingDays, nonWorkingDates);
```

Esto retrocede un día cuando `startDate - 1` ya es hábil (el caso común, martes a viernes),
haciendo que una tarea arranque un día antes de lo que le corresponde — incluso después de
unificar el modelo de dependencias. Se reemplazó por:

```ts
// después
startDate = addWorkingDays(startDate, 1, workingDays, nonWorkingDates);
```

que es la operación correcta: "si `startDate` ya es hábil, queda igual; si no, avanza al
próximo hábil".

## 3. Cambios

- **`services/scheduleEngine.ts` (nuevo):** motor puro, sin React, extraído de
  `useProjectSchedule.ts` para poder testearlo:
  - `resolveDependencies`: normaliza `project.dependencies` (modelo centralizado) con
    fallback a `item.dependencies` legacy, igual que ya hacían `Planning.tsx` y
    `TaskRelations.tsx` para la UI — así no se pierden datos de proyectos no migrados.
  - `topologicalOrder`: orden topológico (Kahn) en vez del loop de reintentos con tope de
    100 iteraciones. Los ítems que forman un ciclo se devuelven aparte (`cyclic`) en lugar
    de desaparecer silenciosamente del resultado.
  - `computeSchedule`: forward pass. Resuelve Fin-Comienzo (único tipo soportado hoy; SS/FF/SF
    y lag quedan diferidos — ver §4), encaja en días hábiles/feriados, y marca cada ítem con
    `hasYield` (false si la tarea maestra no tiene rendimiento cargado) y `hasCycleError`
    (true si el ítem forma parte de un ciclo — se programó ignorando sus vínculos).
- **`hooks/useProjectSchedule.ts`:** `scheduledItems` y `cpmItems` (sucesores del backward
  pass) ahora usan `project.dependencies` a través de `scheduleEngine`, no el campo legacy.
- **`services/calculationService.ts`:** nuevo helper `toLocalDate(dateStr)` — ancla un string
  `"YYYY-MM-DD"` a medianoche LOCAL. `new Date(dateString)` sin esto ancla a medianoche UTC,
  que en Argentina (UTC-3) se muestra un día antes al formatear con `toLocaleDateString()`.
- **`components/Planning.tsx`:**
  - usa `toLocalDate` para mostrar `project.startDate` (encabezado del Gantt) e
    `item.start`/`item.end` (tabla, sidebar) — corrige el desfase de un día.
  - cuando `!item.hasYield`, la columna Duración muestra "Sin rend." (tabla) / "s/r"
    (sidebar) en vez de la duración inventada de 1 día; el tooltip del Gantt dice "sin
    rendimiento cargado".
  - ícono de alerta (ámbar) + tooltip cuando `item.hasCycleError`.
- **`services/__tests__/scheduleEngine.test.ts` (nuevo):** cadena, abanico (fan-in), ciclo,
  feriados, sin rendimiento, duración manual, fallback de `resolveDependencies`.

## 4. Diferido (no entra en esta etapa)

- Tipos de vínculo SS/FF/SF y `lag` ya son editables en `TaskRelations.tsx` (UI existente,
  no tocada en esta etapa) pero el motor los trata todos como Fin-Comienzo sin desfase. Hace
  falta un cálculo de "fecha de fin deseada → fecha de inicio" (CPM backward real) para
  honrarlos, que es justamente el "Gantt avanzado" que `CLAUDE.md` pide diferir. Queda como
  decisión explícita para una etapa futura: implementarlo, u ocultar esos controles en
  `TaskRelations.tsx` hasta que el motor los soporte.
- Arrastrar barras, múltiples tipos de vínculo con desfase, importar plan desde Excel.

## 5. Riesgo de regresión

- Proyectos con `item.dependencies` legacy y sin `project.dependencies`: siguen funcionando
  igual que antes (mismo fallback que ya usaba la UI).
- Proyectos con `project.dependencies` ya pobladas desde `TaskRelations.tsx`/Planning: antes
  no afectaban el cronograma, ahora sí — es el comportamiento esperado, pero es el cambio con
  más superficie: cualquier obra con vínculos ya creados va a ver fechas distintas (las
  correctas) la primera vez que abra Planificación después de este fix.
