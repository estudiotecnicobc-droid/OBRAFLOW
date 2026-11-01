# Presupuesto — índice de rubros (panel izquierdo)

## Problema
El panel «Etapas de obra» listaba los 44 rubros (incluidos los auxiliares 90–95), todos tildados. Destildar un rubro con ítems no lo ocultaba en pantalla pero sí en la impresión; la numeración era la posición en la lista y no el código oficial; no mostraba montos; la selección no se guardaba.

## Solución
- El panel pasa a ser un índice: solo rubros en uso, con código oficial, subtotal (costo directo o precio de venta según la vista), incidencia y cantidad de ítems. Clic → salta al rubro en la tabla y lo expande.
- «Agregar rubro»: buscador con 6 grupos (Estructura 01–05, Albañilería 06–10 + 15–16, Terminaciones 11–14 + 32 + 34, Carpinterías 17–21 + 33, Instalaciones 22–29 + 36–37, Equipamiento y exteriores 30–31 + 35 + 38) y «Otros rubros» para categorías sin código. Auxiliares 90–95 excluidos. Al agregar se abre el panel «Agregar tarea» de ese rubro.
- Un rubro con ítems queda fijado; un rubro vacío se puede quitar (×).
- Tabla, índice e impresión usan la misma lista (`visibleRubros`), ordenada por código.
- Persistencia: `localStorage` por proyecto (`obraflow:budget-rubros:<projectId>`). Sin migración ni cambios en ERPContext.

## Iteración 2
- El índice queda fijo (sticky) al desplazarse por la tabla.
- Barra superior: vistas «Código», «Etapas» (agrupado con subtotal y % por etapa) e «Incidencia» (mayor a menor monto); modo «Compacta»; expandir/contraer todos los rubros de la tabla. Preferencia de vista en localStorage (`obraflow:budget-index-view`).

## Iteración 3
- La tabla sigue la vista del índice (`arrangeRubros`, compartido): por código, por incidencia o agrupada por etapa con una fila de encabezado (subtotal y %). La impresión sigue por código.

## Archivos
- `src/features/budgets/rubroGroups.ts` (grupos, orden, persistencia)
- `src/features/budgets/components/BudgetRubroIndex.tsx`
- `components/BudgetEditor.tsx`
