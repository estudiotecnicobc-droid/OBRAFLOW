# P0 — Runbook: Ejecución del Diagnóstico SQL

**Archivo SQL:** `supabase/diagnostics/p0_masonry_apu_math_audit.sql`  
**Rama:** `audit/p0-masonry-apu-math`  
**Propósito:** Confirmar en producción el bug 45/45/45 y obtener los datos reales para el fix E2E  
**Restricción crítica:** Solo ejecutar SELECT. Nunca DELETE, UPDATE, INSERT ni migraciones.

---

## Antes de empezar

1. Abrir **Supabase Dashboard → SQL Editor** del proyecto de producción
2. Tener a mano `supabase/diagnostics/p0_masonry_apu_math_audit.sql`
3. No ejecutar ningún otro archivo SQL mientras se corre este diagnóstico

---

## Paso 1 — Abrir el archivo SQL

Abrir `supabase/diagnostics/p0_masonry_apu_math_audit.sql` en cualquier editor de texto.

El archivo tiene 10 bloques numerados. Ejecutarlos uno por uno en el orden indicado.

---

## Paso 2 — Ejecutar bloques 1 a 9 (en orden)

Copiar cada bloque al SQL Editor y hacer clic en **Run**.

### Bloque 1 — Proyectos QA_E2E

```sql
SELECT p.id, p.name, p.organization_id, p.created_at
FROM projects p
WHERE p.name ILIKE 'QA_E2E%'
ORDER BY p.created_at DESC LIMIT 20;
```

**Qué buscar:** uno o más proyectos `QA_E2E_...`. Si no aparece ninguno, el E2E no corrió en este entorno.

---

### Bloque 2 — Tasks (APUs) del proyecto QA

Ejecutar el bloque 2 completo.

**Qué buscar:** una fila con `task_name` que incluya "muro" o "ladrillo". Anotar el valor de `task_id` — se necesita para el bloque 10.

---

### Bloque 3 — Task yields (rendimientos por material)

Ejecutar el bloque 3 completo.

**Qué esperar si el bug está presente:**
- `yield_qty = 1` para ladrillo, arena y cemento
- Columna `qty_flag` muestra `⚠️ SOSPECHOSO: qty=1`

**Qué esperar si el bug está corregido:**
- `yield_qty = 6` para ladrillo
- `yield_qty = 0.01` para arena
- `yield_qty = 0.5` para cemento

---

### Bloque 4 — Labor yields (mano de obra)

Ejecutar el bloque 4 completo.

**Qué esperar:** sin filas (el fixture QA actual no carga MO). Si aparece alguna fila, el test fue actualizado.

---

### Bloque 5 — Budget items

Ejecutar el bloque 5 completo.

**Qué buscar:**
- `presupuesto_qty = 45` (los 45 m² ingresados en el test)
- `task_labor_cost_snapshot = 0`

---

### Bloque 6 — Computation items (Chandías)

Ejecutar el bloque 6 completo.

**Qué esperar:** puede estar vacío si el E2E no pasó por la calculadora Chandías. No es bloqueante.

---

### Bloque 7 — Master task en catálogo

Ejecutar el bloque 7 completo.

**Qué buscar:** el APU fuente en `master_tasks`. Confirmar `scope = 🏢 ORG` (no global).

---

### Bloque 8 — Master task materials (catálogo de empresa)

Ejecutar el bloque 8 completo.

**Qué esperar si el bug está presente:**
- `yield_qty = 1` para todos los materiales
- Columna `qty_flag` muestra `⚠️ qty=1 (posible sin editar)`

Esta tabla confirma que el dato corrupto viene del APU guardado, no del motor de cálculo.

---

### Bloque 9 — Detección global de yields = 1 sospechosos

Ejecutar el bloque 9 completo.

**Qué buscar:** columnas `table_name`, `task_name`, `material_name`, `quantity`.  
Si hay muchas filas con `quantity = 1` en `master_task_materials`, puede haber contaminación del catálogo fuera del scope QA.

---

## Paso 3 — Ejecutar bloque 10 (solo con task_id real)

El bloque 10 está comentado con `/* ... */`. Solo ejecutarlo después de completar el paso 2.

1. Copiar el UUID obtenido en el bloque 2 (columna `task_id`)
2. Abrir el bloque 10 en el archivo SQL
3. Reemplazar las **dos** ocurrencias de `'<TASK_ID>'` con el UUID real (con comillas simples)  
   Ejemplo: `'3f8a1b2c-4d5e-6789-abcd-ef0123456789'`
4. Descomentar el bloque (borrar `/*` del inicio y `*/` del final)
5. Ejecutar

**Resultado esperado:** una fila con `unit_cost_per_m2` y `total_cost_45m2`.  
Verificar que `total_cost_45m2` refleje el impacto del bug (valor inflado si `quantity = 1`).

---

## Paso 4 — Qué resultados pegar para revisión

Una vez ejecutados los bloques 1-10, copiar y pegar los resultados de:

| Bloque | Tabla / columnas clave |
|--------|------------------------|
| **2** | `task_id`, `task_name`, `unit`, `category`, `daily_yield`, `labor_cost` |
| **3** | todas las columnas — especialmente `yield_qty` y `qty_flag` |
| **4** | todas las columnas (o confirmar "0 filas") |
| **8** | `material_name`, `yield_qty`, `qty_flag`, `price_flag` |
| **10** | `unit_cost_per_m2`, `total_cost_45m2`, `effective_labor_cost` |

Formato sugerido: copiar como tabla de texto plano o exportar CSV desde el SQL Editor.

---

## Restricciones — qué NO ejecutar

- No ejecutar ningún `DELETE`, `UPDATE`, `INSERT` o `TRUNCATE`
- No ejecutar las migraciones pendientes (038, 039, 040, 044)
- No ejecutar el bloque 10 sin reemplazar `<TASK_ID>` — produce error de sintaxis
- No compartir el output con servicios externos sin revisar que no incluya UUIDs de usuarios reales

---

## Resultado esperado post-diagnóstico

Con los resultados del bloque 3 y 8 en mano, se puede confirmar:

- Si `yield_qty = 1` → bug confirmado en datos persistidos → fix requerido en el selector E2E
- Si `yield_qty = 6 / 0.01 / 0.5` → datos correctos → revisar si el motor de cálculo tiene otro problema

El fix está en `tests/e2e/beta-golden-path.spec.ts` únicamente.  
Ver `docs/P0_MASONRY_APU_MATH_DIAGNOSIS.md` §6 para el detalle del fix.

---

*Generado: 2026-05-30 — rama audit/p0-masonry-apu-math*
