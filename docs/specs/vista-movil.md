# Vista móvil — tanda 1

## Problema
En celulares (≈360–430 px) el menú lateral ocupaba 256 px fijos, quedaba poco ancho útil y los botones del pie (Guardar / Cerrar sesión) quedaban tapados por la barra del navegador (`h-screen` = 100vh). Las tablas dentro de contenedores `overflow-hidden` se cortaban sin poder desplazarse, los paneles laterales de 450–550 px desbordaban y algunos modales sin alto máximo dejaban los botones fuera de pantalla.

## Cambios
- `hooks/useMediaQuery.ts`: `useMediaQuery` / `useIsMobile` (< 768 px).
- `Layout.tsx`: en móvil el menú pasa a cajón (drawer) superpuesto con fondo oscurecido; barra superior con botón ☰, nombre de obra y Guardar; navegar cierra el cajón. Alto `100dvh` + `safe-area-inset-bottom`. Escritorio sin cambios (mismo colapso persistido).
- Tablas: contenedores `overflow-hidden` → `overflow-x-auto` (14 lugares) y envoltura con scroll horizontal en APUBuilder.
- Paneles laterales de DataAdmin (450/480/550 px): pantalla completa en móvil (`max-md:fixed inset-0`). Panel de configuración de BudgetEditor: `max-w-full`.
- Modales sin alto máximo: `max-h-[90dvh] overflow-y-auto` (8 lugares).

## Fuera de alcance
Rediseño de Planificación/Gantt y de la grilla de presupuesto para móvil (requieren vista específica); ERPContext no se toca.

# Tanda 2 — Presupuesto y Planificación

Relevado en producción a 390 px (CASA CIRO, solo lectura).

- **Ítems y presupuesto** (`BudgetEditor`): el panel "Etapas de Obra" (288 px fijos) dejaba la grilla en una franja de ~40 px. En móvil pasa arriba como desplegable ("N rubros activos · tocar para elegir"), cerrado por defecto; encabezado y botones con wrap; menú Reportes limitado al ancho de pantalla; paddings menores.
- **Pestañas del módulo** (`BudgetModule`): una sola fila con scroll horizontal en vez de tres filas.
- **Cómputos** (`MeasurementSheet`): lista + detalle lado a lado → en móvil, lista a pantalla completa; al elegir un ítem se abre el detalle con "← Ítems de obra".
- **Grilla de costos** (`BudgetGrid`): la tarjeta de encabezado desbordaba (total y "Exportar PDF" cortados) → wrap.
- **Planificación** (`Planning`): la tarjeta de tabla/Gantt quedaba con una franja mínima → alto 80dvh en móvil; botones con wrap; el Gantt arranca oculto en móvil y, si se abre, la tabla no ocupa más del 55 % del ancho.
