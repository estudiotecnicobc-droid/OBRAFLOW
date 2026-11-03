# Runbook — Aplicación de la migración `20261103100100` en producción

Convierte `master_materials.unit_price` a unidad técnica para los 80 materiales con `conversion_factor > 1` (actualmente guardados en unidad comercial). Backup inmutable + marca idempotente. El código del PR ya soporta ambos estados ("antes" y "después") sin romper nada, así que el mergeo de Vercel puede ocurrir antes de correr la migración acá.

**Quién la corre**: Gonzalo, manualmente desde Supabase Dashboard → SQL Editor del proyecto `gbewodztwewgrhsoavmg`.
**NO** la aplica Vercel ni la CLI de Supabase. Esta migración no está pensada para `supabase db push`.

## 0. Pre-chequeo (SELECT, antes de correr nada)

Confirmá que el estado de la base coincide con lo esperado al momento del PR:

```sql
-- 0.1 Conteo total de filas con factor > 1 (esperado: 80 activas, 0 inactivas)
SELECT
  COUNT(*)                                             AS total,
  COUNT(*) FILTER (WHERE is_active)                    AS activas,
  COUNT(*) FILTER (WHERE NOT is_active)                AS inactivas
FROM public.master_materials
WHERE conversion_factor IS NOT NULL AND conversion_factor > 1;

-- 0.2 ¿Alguna ya está marcada 'technical'? (esperado: 0, porque esta es la primera corrida)
SELECT COUNT(*) FROM public.master_materials WHERE price_unit_basis = 'technical';

-- 0.3 Filas con factor en (0, 1) o = 0 (esperado: 0 — están excluidas por diseño)
SELECT id, name, unit, conversion_factor, unit_price
FROM public.master_materials
WHERE conversion_factor IS NOT NULL AND conversion_factor > 0 AND conversion_factor < 1
   OR conversion_factor = 0;

-- 0.4 Filas con unit comercial (barra, Bolsa, …) fuera de los 5 ids previstos (esperado: 0)
SELECT id, name, unit FROM public.master_materials
WHERE conversion_factor > 1
  AND LOWER(TRIM(unit)) ~ '^(bolsa|barra|balde|bid[oó]n|millar|ca[nñ]o|rollo|pack|caja|cajon)'
  AND id NOT IN (
    '47007849-ac1b-43f8-8c61-f237f19e6516',  -- Hierro Ø10
    '7fa33df3-1823-4a45-b126-30e20bad516a',  -- Hierro Ø12
    '814e64a6-67fe-4074-ae35-e32d39925a3d',  -- Hierro Ø6
    '998cd42b-0929-409b-a8ab-536ef8d07504',  -- Hierro Ø8
    '464f38f3-b62b-4684-a784-084523ae9bde'   -- Cemento Avellaneda (Bolsa → kg)
  );
```

Si alguna fila nueva apareció con factor < 1 o `unit` comercial que no esté en los 5 ids, **frená y avisá** antes de correr la migración principal.

## 1. Lista de pre-chequeo: los 80 materiales que se van a dividir

Precio actual vs precio técnico resultante. Si ves alguna fila que **ya estaba en técnico** (por ejemplo si un hotfix la convirtió antes), sacala por id — podés hacerlo pre-populando `price_unit_basis = 'technical'` en esa fila (el UPDATE la excluirá automáticamente).

| org | categoría | nombre | unit | commercial_unit | factor | precio actual | precio técnico resultante |
|---|---|---|---|---|---:|---:|---:|
| 3e5c…ea8f | Aglomerantes | Adhesivo para cerámicos | kg | bolsa 25 kg | 25 | 320.00 | 12.80 |
| 3e5c…ea8f | Aglomerantes | Cal aérea en polvo | kg | bolsa 20 kg | 20 | 85.00 | 4.25 |
| 3e5c…ea8f | Aglomerantes | Cal hidratada | kg | bolsa 25 kg | 25 | 95.00 | 3.80 |
| 3e5c…ea8f | Aglomerantes | Cal hidráulica | kg | bolsa 25 kg | 25 | 95.00 | 3.80 |
| 3e5c…ea8f | Aglomerantes | Cemento Portland CPN 40 | kg | bolsa 50 kg | 50 | 180.00 | 3.60 |
| 3e5c…ea8f | Aglomerantes | Yeso de construcción | kg | bolsa 40 kg | 40 | 70.00 | 1.75 |
| 3e5c…ea8f | Áridos | Grout de nivelación | kg | bolsa 25 kg | 25 | 280.00 | 11.20 |
| 3e5c…ea8f | Cemento | Cemento Loma Negra | Kg | bolsa 50 kg | 50 | 13 500.00 | 270.00 |
| 3e5c…ea8f | Estructural | Hierro nervado Ø10 mm | **barra → kg** | barra ∅10mm · 12m | 7.44 | 8 500.00 | 1 142.47 |
| 3e5c…ea8f | Estructural | Hierro nervado Ø12 mm | **barra → kg** | barra ∅12mm · 12m | 10.68 | 10 253.00 | 960.02 |
| 3e5c…ea8f | Estructural | Hierro nervado Ø6 mm | **barra → kg** | barra ∅6mm · 12m | 2.64 | 2 429.00 | 920.08 |
| 3e5c…ea8f | Estructural | Hierro nervado Ø8 mm | **barra → kg** | barra ∅8mm · 12m | 4.80 | 4 488.00 | 935.00 |
| org_a | Cemento | Cemento Avellaneda | **Bolsa → kg** | bolsa 50 kg | 50 | 12 000.00 | 240.00 |
| 3e5c…ea8f | Impermeab. | Hidrófugo líquido integral | lt | bidón 5 lt | 5 | 1 800.00 | 360.00 |
| 3e5c…ea8f | Mampostería | Ladrillo común 6x12x24 | un | millar | 1 000 | 200.00 | 0.20 |
| 3e5c…ea8f | Mampostería | Ladrillo hueco 12x18x33 | u | millar | 1 000 | 180.00 | 0.18 |
| 3e5c…ea8f | Mampostería | Ladrillo hueco 18x18x33 | un | millar | 1 000 | 260.00 | 0.26 |
| 3e5c…ea8f | Mampostería | Ladrillo hueco 8x18x33 | un | millar | 1 000 | 120.00 | 0.12 |
| 3e5c…ea8f | Pinturas | Enduido plástico | kg | balde 30 kg | 30 | 380.00 | 12.67 |
| 3e5c…ea8f | Pinturas | Fijador de paredes | lt | balde 20 lt | 20 | 780.00 | 39.00 |
| 3e5c…ea8f | Pinturas | Pintura látex exterior | lt | balde 20 lt | 20 | 1 650.00 | 82.50 |
| 3e5c…ea8f | Pinturas | Pintura látex interior blanco | lt | balde 20 lt | 20 | 2 850.00 | 142.50 |
| 3e5c…ea8f | Sanitaria | Caño PVC 110 mm | m | caño 3 m | 3 | 1 250.00 | 416.67 |
| 3e5c…ea8f | Sanitaria | Caño PVC 63 mm | m | caño 3 m | 3 | 680.00 | 226.67 |

Las orgs de seed (`org_a`, `org_b`, `org_demo`) replican el mismo catálogo con los mismos precios. Lista completa (80 filas) disponible en `supabase/tests/precios/fixture_master_materials.sql` o volvé a correr la query de A4 del plan.

## 2. Correr la migración

Desde el SQL Editor:

```sql
-- Pegar íntegro supabase/migrations/20261103100100_master_materials_precio_tecnico_unico.sql
```

Esperado: `NOTICE  Migración OK: marcadas=80 backup=80`.

Si la migración aborta con `Hay N filas con conversion_factor en (0,1]` o `Quedan N filas … sin convertir`, **no corras nada más** — la base no quedó en estado inconsistente (la transacción hace rollback) y hay que investigar la fila nueva.

## 3. Verificación post

```sql
-- 3.1 Backup contiene las 80 filas convertidas
SELECT COUNT(*) FROM public.master_materials_precio_comercial_backup;   -- esperado: 80

-- 3.2 Todas las filas con factor > 1 están marcadas 'technical'
SELECT COUNT(*) FROM public.master_materials
WHERE conversion_factor > 1 AND price_unit_basis = 'technical';         -- esperado: 80

-- 3.3 Spot checks (3 muestras verificables contra precios de mercado actuales)
SELECT name, unit, unit_price FROM public.master_materials
WHERE id IN (
  '81b2191d-275f-43e0-80ed-608744322162',  -- Cemento Portland (org_demo): 310/kg
  '7fa33df3-1823-4a45-b126-30e20bad516a',  -- Hierro Ø12 (3e5c): 960.02/kg
  '74e8a96e-d412-4c1f-b11f-57a55807f4b2'   -- Cal hidráulica (3e5c): 3.80/kg (precio desactualizado)
);

-- 3.4 last_known_unit_price de los componentes de APU resincronizados
SELECT material_name, last_known_unit_price
FROM public.master_task_materials
WHERE master_material_id IN (SELECT id FROM public.master_materials_precio_comercial_backup)
ORDER BY material_name
LIMIT 20;

-- 3.5 Cemento Avellaneda ahora en 'kg' con precio técnico 240
SELECT id, unit, unit_price FROM public.master_materials
WHERE id = '464f38f3-b62b-4684-a784-084523ae9bde';   -- esperado: unit=kg, 240.00
```

## 5. Reversión (solo si algo salió mal, antes de que haya tráfico de carga de precios)

Si tras aplicar la migración ves valores incorrectos o el flujo de UI empieza a mostrar números raros, podés revertir **antes de que los usuarios empiecen a actualizar precios desde la UI nueva** (que ya guarda técnico y marcaría otra vez `price_unit_basis = 'technical'`).

Pegar íntegro:
```sql
-- supabase/rollback/20261103100100_revertir_precio_tecnico.sql
```

Esperado: `NOTICE  Reversión OK: todas las filas vuelven a commercial_legacy`.

Después contactame así reviso qué pasó y proponemos la próxima iteración.

## 6. Comunicación post-migración

A partir del momento en que corre esta migración:
- La UI de carga de materiales (`MasterMaterialsPanel`, `GlobalMaterialsAdmin`) muestra un selector "Cargo por: {comercial} / {técnico}" cuando el material tiene `conversion_factor > 1`. Default = comercial (como vienen las listas de corralón). Lo que se escribe se divide una sola vez antes de guardar.
- Las listas de materiales muestran siempre los dos valores: `$ técnico / unit` y debajo `$ comercial / commercial_unit`.
- El motor de costos y el SQL 057 (`calculate_consolidated_resources`) devuelven los mismos números para los 47 componentes de APU afectados.
- El Catálogo Global, al importarse a una empresa (`importFromGlobal`), siempre copia precio técnico y marca `price_unit_basis = 'technical'`.
