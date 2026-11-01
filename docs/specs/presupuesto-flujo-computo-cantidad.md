# Presupuesto — flujo Cómputo → Ítems → Análisis de costos (una sola cantidad)

## Problema
La cantidad de un ítem se podía cargar en tres lugares que no se conocían entre sí:
- «Ítems y presupuesto»: edición manual.
- «Cómputos» (planilla L×A×H×veces): pisaba la cantidad solo si se aceptaba un `confirm()`. Era una pestaña aparte.
- «Grilla de costos»: segunda edición manual de la misma cantidad.

Además, el «Calculador de cómputo» creaba ítems nuevos y **salteaba** los que ya existían, sin actualizar su cantidad. Ninguna vista mostraba de dónde venía el número.

## Solución (etapa 1, solo interfaz)
- **Origen visible de la cantidad** (`utils/quantitySource.ts`, `components/QuantitySourceBadge.tsx`): *Manual* / *Medido* / *Calculador*. Si hay planilla con líneas y la cantidad no coincide → *Medido ≠* en ámbar. Prioridad: planilla > calculador (`computationItemId`) > manual.
- **La planilla de medición es un panel lateral del ítem** (`components/MeasurementDrawer.tsx`). Se abre desde el badge en «Ítems y presupuesto» (o con doble clic en la cantidad si el ítem es *Medido*) y desde la cantidad en «Análisis de costos». Guarda solo, con debounce de 500 ms, y actualiza la cantidad del ítem sin confirmación. La primera línea arranca con la cantidad actual («Cantidad inicial»), así que no se pierde nada al empezar a medir. Se quita la pestaña «Cómputos» (el id `measurements` queda como alias de `budget`).
- **Edición manual** de un ítem del calculador: limpia `computationItemId`, porque la cantidad deja de venir del calculador.
- **Calculador**: los ítems que ya están en el presupuesto **actualizan su cantidad** (suma de las líneas del cómputo de esa tarea) en vez de omitirse. El banner de resultado ofrece «Ver en presupuesto →», que navega y resalta los ítems nuevos o actualizados por 5 s (`sessionStorage`).
- **«Análisis de costos»** (ex «Grilla de costos»): cantidad de solo lectura con badge; clic → panel de medición. Los rendimientos del APU siguen editables.
- Pestañas numeradas según el flujo: ① Cómputo ② Ítems y presupuesto ③ Análisis de costos.

## Fuera de alcance (etapa 2, requiere migración y cambios en ERPContext)
- Las planillas de medición siguen en `localStorage` (`erp_measurements`): no se comparten entre equipos ni usuarios. Hay que migrarlas a Supabase.

## Archivos
- `utils/quantitySource.ts`, `components/QuantitySourceBadge.tsx`, `components/MeasurementDrawer.tsx` (nuevos)
- `components/BudgetModule.tsx`, `components/BudgetEditor.tsx`, `components/BudgetGrid.tsx`, `components/ProjectStage.tsx`
- `services/importComputationItems.ts` (`existingUpdates`), `src/features/material-calculator/ChandiasCalculator.tsx`, `src/features/parametric-calculator/ParametricCalculator.tsx`
- `types.ts` (`computationItemId?: string | null`)
- Se elimina `components/MeasurementSheet.tsx`
- Tests: `services/__tests__/quantitySource.test.ts`
