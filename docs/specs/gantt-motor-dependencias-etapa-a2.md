# Gantt — Etapa A.2: honrar tipos de vínculo (SS/FF/SF) y lag

**Estado:** implementado, pendiente QA manual del usuario
**Alcance:** `services/scheduleEngine.ts` + `services/calculationService.ts`. Sigue sin tocar
`TaskRelations.tsx` (ya exponía estos campos en la UI) ni el CPM backward real (sigue diferido).
**Origen:** habilitado el 2026-10-18 al relajar la restricción de "Gantt avanzado" de
`docs/HANDOFF_MAESTRO_OBRAFLOW_2026-08-20.md` solo para esta pieza — ver
`docs/specs/gantt-motor-dependencias-etapa-a.md` §4 para el contexto completo.

## 1. Qué faltaba

Después de la Etapa A, `project.dependencies` ya era la fuente real de las fechas, pero
`computeSchedule` trataba **todo** vínculo como Fin-Comienzo sin desfase, ignorando los
campos `type` (FS/SS/FF/SF) y `lag` que `TaskRelations.tsx` ya dejaba elegir en la UI sin
ningún efecto sobre el cronograma.

## 2. Semántica implementada

| Tipo | Qué restringe | Fórmula |
|---|---|---|
| FS (Fin-Comienzo) | inicio del sucesor | `addDays(pred.end, 1 + lag)` |
| SS (Comienzo-Comienzo) | inicio del sucesor | `addDays(pred.start, lag)` |
| FF (Fin-Fin) | fin del sucesor | `subtractWorkingDays(addDays(pred.end, lag), duration)` |
| SF (Comienzo-Fin) | fin del sucesor | `subtractWorkingDays(addDays(pred.start, lag), duration)` |

FF y SF restringen el **fin**, no el inicio. Como la duración de la tarea ya se conoce antes
de resolver dependencias (sale de cantidad/rendimiento o de `manualDuration`, nunca de los
vínculos), se traduce la fecha de fin deseada a una fecha de inicio con la nueva función
`subtractWorkingDays` (`calculationService.ts`), inversa de `addWorkingDays`: dada una fecha
de fin y una duración en días hábiles, devuelve el inicio, saltando fines de semana y
feriados hacia atrás igual que `addWorkingDays` los salta hacia adelante.

### Política: ningún vínculo retrocede el inicio antes del baseline

Con varios predecesores (fan-in) o vínculos mixtos, el motor sigue tomando el **máximo**
entre todas las fechas candidatas y el baseline del ítem (`item.startDate` o el inicio del
proyecto). Para FS/SS esto es el comportamiento natural (más restricciones solo empujan
más tarde). Para FF/SF, que piden "terminar antes de tal fecha", esto significa que si
cumplir esa restricción exigiría arrancar **antes** del baseline, la restricción
simplemente no tiene efecto — la tarea nunca se programa en el pasado respecto de su propio
inicio. Es una limitación deliberada, no un bug: implementar lo contrario (dejar que una
tarea se corra antes del inicio del proyecto) requeriría una pasada de optimización
hacia atrás que cae en el CPM completo, explícitamente diferido.

## 3. Cambios

- **`services/calculationService.ts`:** nueva función `subtractWorkingDays(endDate,
  duration, workingDays, nonWorkingDates)`.
- **`services/scheduleEngine.ts`:** nueva función `resolveConstraintStart(dep, pred,
  duration, workingDays, nonWorkingDates)` que aplica la tabla de arriba; `computeSchedule`
  la usa en vez de la fórmula fija de FS.
- **Sin cambios en `Planning.tsx` ni `TaskRelations.tsx`**: ya escribían `type`/`lag`
  correctamente a `project.dependencies`; solo faltaba que el motor los leyera.
- **6 tests nuevos** en `scheduleEngine.test.ts`: lag en FS, SS (con y sin lag), FF (con y
  sin lag), SF (con hueco para que la restricción pese, y el caso límite donde no tiene
  efecto por la política del §2).

## 4. Qué sigue sin esto (diferido)

- El camino crítico (`cpmItems` en `useProjectSchedule.ts`) sigue siendo una aproximación
  sobre el forward pass; no modela lag ni tipo de vínculo en su holgura. Con vínculos
  SS/FF/SF el campo "crítica" puede no ser exacto.
- Arrastrar barras, importar plan desde Excel, CPM backward completo.
