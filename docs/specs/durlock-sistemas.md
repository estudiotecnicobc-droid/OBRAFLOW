# Sistemas Durlock en el catálogo y el presupuesto rápido

## Objetivo
Presupuestar construcción en seco con los sistemas y las cantidades de materiales del calculador de durlock.com.

## Fuente
`scripts/durlock/durlock_sistemas_coeficientes.json`, relevado del calculador de durlock.com el 31/10/2026 con superficie de prueba de 100 m². Regla de Durlock: cantidad = redondeo hacia arriba de (m² × coeficiente).

## Generación
`python3 scripts/durlock/build_durlock.py` genera:
- `supabase/migrations/065_catalogo_durlock.sql`;
- `src/features/quickBudget/durlockSystems.ts`.

Ninguno de los dos se edita a mano.

## Catálogo (migración 065, idempotente)
- 60 insumos `OF-DUR-M01…M60` con la unidad de Durlock (placa, perfil, tornillo, rollo, bolsa…), `commercial_unit` = unidad y `conversion_factor` = 1.
- Precios: 17 insumos toman el precio de un recurso que ya existía, convertido a la unidad de Durlock (por ejemplo, placa estándar = OF-M-PY × 2,88 m²). Los 43 restantes quedan en $0 con la nota "Sin precio de referencia".
- 44 APU `OF-DUR-<ref Durlock>`, uno por sistema:
  - paredes en 06;
  - revestimientos en 14;
  - cielorrasos en 13.
- Cada APU tiene los insumos por m² del calculador y la mano de obra de durlero y ayudante de gremio (OF-GR-DUR y OF-GR-AYU). El rendimiento estimado por tipo incluye el encintado y el masillado de juntas.
- 3 APU adicionales para opcionales de Durlock que se cotizan aparte:
  - OF-DUR-901: banda acústica, por ml;
  - OF-DUR-902: Promaseal-A, por m²;
  - OF-DUR-903: barrera de agua y viento, por m².

## Presupuesto rápido
- La plantilla "Tabique y cielorraso de placa de yeso" se reemplaza por "Construcción en seco Durlock" (`durlockTemplate.ts`, mismo id `durlock`). La plantilla generada desde Excel queda igual para sus tests.
- Se elige un sistema para el tabique (6), otro para el revestimiento (22) y otro para el cielorraso (16). Cada opción lleva la rama del selector de Durlock.
- Una sola tarea por elemento cambia de APU según el sistema elegido (`QuickTask.pick`), así la cantidad de filas no cambia.
- Adicionales que se incluyen solos:
  - Promaseal-A en tabiques resistentes al fuego;
  - barrera en revestimientos exteriores;
  - lana de vidrio solo si el sistema no la trae;
  - buña, cantoneras y pintura solo en sistemas con masilla o base coat.
- El masillado ya no va como tarea aparte: está dentro de cada APU.

## Lista de compras
Los insumos por pieza (u, rollo, bolsa, balde…) sin unidad comercial muestran como cantidad a comprar la cantidad técnica redondeada hacia arriba. Aplica a la explosión de insumos del proyecto y a la calculadora de materiales.

## Pendientes de datos
- Sistema 344 (Cedral pre-pintado solapado): no se incluye porque el relevamiento está incompleto.
- Sistemas 254 y 255: Durlock carga la barrera opcional en 0,04 m²/m². Se usa el adicional OF-DUR-903 con 1,05.
- La banda acústica (≈ 0,77 × m² + 6 ml) y el Promaseal (no lineal) se aproximan con coeficientes lineales.
- Los rendimientos de mano de obra son estimados y hay que verificarlos.
