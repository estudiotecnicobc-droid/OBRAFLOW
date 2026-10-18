# QA manual — Gantt Etapa A.2 (tipos de vínculo y lag)

**Qué se agregó:** el motor del Gantt ahora respeta el tipo de vínculo (Fin-Comienzo,
Comienzo-Comienzo, Fin-Fin, Comienzo-Fin) y los días de desfase (lag) que ya se podían
elegir en el panel de relaciones de la tarea, pero que antes no tenían ningún efecto.

**Automático ya corrido:** `npm run test` (17 tests en `scheduleEngine.test.ts`, todos
verdes), `npx tsc --noEmit` y `npm run build` sin errores nuevos.

## Qué probar en la app

1. **Abrir el panel de relaciones de una tarea** (donde se editan predecesoras/sucesoras
   con tipo y lag — `TaskRelations.tsx`).
2. **Comienzo-Comienzo (SS):** crear un vínculo SS entre A y B, lag 0. Esperado: B arranca
   el mismo día que A (antes, con SS no pasaba nada).
3. **Lag positivo:** al mismo vínculo SS, poner lag = 3. Esperado: B arranca 3 días
   (de calendario) después del inicio de A.
4. **Fin-Fin (FF):** crear un vínculo FF entre A y B, lag 0. Esperado: B termina el mismo
   día que A (puede arrancar antes o después según su propia duración).
5. **Comienzo-Fin (SF):** menos común, pero si se prueba: B debería terminar cuando A
   arranca. Si A arranca muy cerca del inicio del proyecto, puede no verse efecto — es
   esperado (ver "Qué no hace todavía" abajo).
6. **Fin-Comienzo (FS) con lag:** confirmar que sigue funcionando como antes de la Etapa A.2
   cuando el lag es 0, y que con lag > 0 el sucesor arranca ese número de días después del
   fin de la predecesora (en vez del día siguiente).
7. **No romper nada:** un proyecto con vínculos FS simples (como se usaban antes de este
   cambio) tiene que dar exactamente las mismas fechas que daba con la Etapa A sola.

## Qué no hace todavía (no es un bug si lo ves)

- Si un vínculo Fin-Fin o Comienzo-Fin pediría que la tarea arranque **antes** de su propia
  fecha de inicio (o antes del inicio del proyecto), el motor no la corre hacia el pasado:
  la tarea se programa como si esa dependencia no existiera. Para que el efecto se note,
  tiene que haber margen — por ejemplo, que la predecesora empiece bien entrado el
  cronograma.
- El camino crítico (marcado en rojo) sigue siendo una aproximación: con vínculos SS/FF/SF
  puede no ser exacto. Es sabido, no hace falta reportarlo.
- Arrastrar barras e importar el plan desde Excel siguen sin implementarse.
