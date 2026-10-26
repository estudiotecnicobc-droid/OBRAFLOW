# Fase 2 — Integración del resolvedor de precios en PostgreSQL

**Estado:** diseño para revisión. No ejecutar en producción ni conectar todavía a la UI.

## Entrega SQL
Archivo: `docs/reviews/phase2_resolve_reference_price_draft.sql`. Crea únicamente `project_price_overrides` (con RLS), el tipo compuesto `resolved_reference_price` y la función `resolve_reference_price`. No modifica precios ni presupuestos actuales.

## Autorización
- `resolve_reference_price` es `SECURITY INVOKER`, solo `authenticated`.
- Valida `auth.uid()`, membresía de organización, pertenencia del proyecto, propiedad de material/recurso/componente.
- Los atributos de fecha y moneda de las fuentes se conservan; no realiza conversión tácita.
- `FROZEN` falla explícitamente hasta disponer de un snapshot del presupuesto.
- `AS_OF` utiliza únicamente snapshots fechados y overrides históricos verificables; no simula historia con el precio de hoy.
- `LEGACY_FALLBACK` es provisional (`is_usable=false`).
- Unidad incompatible: advertencia `UNIT_MISMATCH`, `is_usable=false`. Convenciones como `m3`/ `m³` deben normalizarse en una capa validada futura; no adivinar conversiones.

## Integración mínima propuesta (siguiente PR, tras pruebas)
No reescribir la RPC `calculate_consolidated_resources` completa. Conservar la firma actual y el JSON de respuesta para evitar romper el frontend.

### 1. Autorización al inicio de la RPC existente

```sql
IF (SELECT auth.uid()) IS NULL
   OR NOT public.is_org_member(p_organization_id) THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
END IF;
```

La versión inicial del SQL del resolvedor requiere `p_organization_id uuid`; la RPC existente recibe `text`. Antes de llamar el resolvedor, validar el `text` y convertir a UUID (evitar casts de valores arbitrarios en distintas partes de la consulta).

### 2. Obtener el precio **junto al componente**, no por una RPC remota

En CTE `leg_mat`:

```sql
LEFT JOIN LATERAL public.resolve_reference_price(
  p_organization_id::uuid,
  mtm.master_material_id,
  mtm.resource_id,
  mtm.id,
  NULL::uuid, -- Los overrides por proyecto requieren p_project_id explícito.
  p_cost_date,
  'CURRENT',
  mtm.unit,
  'ARS'
) AS priced ON true
```

Sustituir `COALESCE(mm.unit_price, mtm.last_known_unit_price, 0)` por `priced.price` solo cuando `priced.is_usable = true`; en otros casos, reportar la advertencia y conservar el ítem como no calculable. **No convertir NULL a cero dentro del motor económico.**

En CTE `cat_yields`:

```sql
LEFT JOIN LATERAL public.resolve_reference_price(
  p_organization_id::uuid,
  NULL::uuid,
  r.id,
  NULL::uuid,
  NULL::uuid,
  p_cost_date,
  'CURRENT',
  r.unit,
  'ARS'
) AS priced ON true
```

Reemplazar `COALESCE(r.base_cost,0)` por resultado tipado, mismo tratamiento de nulos y advertencias.

### 3. Guardar un resultado parcial seguro durante la transición
- Antes de cambiar la RPC pública, copiar su definición como versión de comparación solo en entorno de pruebas.
- Agregar un campo JSON opcional `priceWarnings` y `priceResolutionStatus` sin quitar `materials`, `labor`, `equipment`, `apuSummary` ni `totals`.
- En caso de precio faltante, el total afectado no debe publicarse como completo: establecer estado `INCOMPLETE`. Decidir si abortar (recomendado para emisión final) o devolver un presupuesto parcial para edición.
- La función existente todavía calcula MO y equipos por otras fuentes; no declarar unificación completa hasta aplicar una política compatible a esas ramas.
- El modelo actual no acepta `project_id` o `mode`: no activar overrides de proyecto a través de esa RPC hasta publicar una versión v2 con parámetros explícitos. **No inferir proyecto desde JSON del cliente**.

### 4. Rendimiento: 1 ida por presupuesto, no garantía automática de milisegundos
- El uso de `LATERAL` elimina roundtrips navegador→DB por componente, pero el resolvedor aún puede ejecutar subconsultas por fila.
- Seleccionar `DISTINCT (master_material_id, resource_id, component_id, date, unit)` primero; resolver cada combinación una vez, y luego unir precios a los rendimientos. En catálogos sin overrides, evaluar clave solo por material/recurso para mayor deduplicación.
- En casos de carga grandes, implementar variante set-based (CTEs por prioridad + `row_number()` por clave) que sustituya el `LATERAL` por fila.
- Reutilizar índices existentes: `resource_cost_snapshots_lookup_idx`, `idx_master_task_materials_material`, `master_materials_organization_id_is_active_idx`. No crear duplicados.
- Medir `EXPLAIN (ANALYZE, BUFFERS)` en staging para 50, 500 y 2.000 componentes, incluyendo costos cold/warm, antes de prometer SLA.

### 5. Tests críticos antes del merge
1. Rol `anon`: permiso denegado. Miembro de otra organización: `42501`.
2. `master_materials` ajeno: `42501`, aun enviando su UUID.
3. Override de proyecto ajeno: prohibido; proyecto de la organización: prioridad 1.
4. Material propio válido: prioridad 2, global propio: 3.
5. Snapshot con fecha <= p_cost_date: prioridad 4. Nunca usar snapshot posterior.
6. Sin snapshot: costo base `CURRENT` prioridad 5; `AS_OF` no lo usa.
7. Sin datos actuales: fallback legacy con `is_usable=false` y advertencia.
8. Unidades y monedas incompatibles: no calcular costo silencioso.
9. APUs anidados: el resolvedor rechaza componente anidado; motor recursivo mantiene semántica.
10. Sin alterar `master_materials.unit_price`, `resources.base_cost`, presupuestos ni `budget_versions`.
11. Probar 500+ ítems y detectar N+1 a nivel SQL con mediciones.
12. Si existe conflicto entre varios materiales con un mismo recurso, inspeccionarlo antes de habilitar resultados; está prohibido seleccionar precio accidentalmente.

## Observaciones de auditoría
- Producción tiene `calculate_consolidated_resources(p_items jsonb,p_organization_id text,p_cost_date date)`, `SECURITY INVOKER` y permite EXECUTE al rol `anon`; **el chequeo de membresía debe aplicarse en la siguiente migración, junto a la integración**, no después.
- Hay dos rutas de componentes: `master_task_materials` y `catalog_task_yields`, pero en la RPC actual los APU de catálogo se eligen solo si el APU no tiene componentes legacy.
- La tabla `budget_cost_snapshots` no existe en el proyecto desplegado al momento de este diseño.
- Los snapshots de recursos están indexados y no requieren un índice nuevo.
- `project_price_overrides` solo registra excepciones, sin fuentes comerciales/regionales.
- La regla `ORG_MASTER` tiene coincidencias por `global_source_id` y `global_resource_id`; debe cubrirse con pruebas de ambigüedad y prioridad local antes de activar la consolidación.
