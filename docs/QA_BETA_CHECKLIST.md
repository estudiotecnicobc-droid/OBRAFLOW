# Obraflow — Checklist QA Beta
**Fecha:** 2026-05-26
**Entorno:** obraflow.net (producción)

Ejecutar este checklist antes de cada deploy relevante y antes de invitar colegas a beta.
Marcar ✅ si pasa, ❌ si falla (anotar detalles), ⏭ si no aplica.

---

## MÓDULO 1 — Auth y Acceso

| # | Caso | Resultado |
|---|------|-----------|
| 1.1 | Login con email/password → entra al proyecto | |
| 1.2 | Login con credenciales incorrectas → mensaje de error visible | |
| 1.3 | Solicitar recuperación de contraseña → recibe email | |
| 1.4 | Hacer click en el link del email → llega a pantalla de nueva contraseña | |
| 1.5 | Ingresar nueva contraseña → login exitoso con nueva clave | |
| 1.6 | Logout → no puede volver a entrar sin credenciales | |
| 1.7 | Usuario sin `master_admin` → AdminPanel no aparece en nav | |

---

## MÓDULO 2 — Admin del Sistema (master_admin)

| # | Caso | Resultado |
|---|------|-----------|
| 2.1 | Login como master_admin → "Admin del Sistema" aparece en nav | |
| 2.2 | Tab Auditoría → muestra log de eventos | |
| 2.3 | Tab Materiales Globales → lista materiales con org IS NULL | |
| 2.4 | Crear nuevo material global → aparece en lista | |
| 2.5 | Editar material global → cambios persisten | |
| 2.6 | Desactivar material global → queda opaco, estado "Inactivo" | |
| 2.7 | Activar material desactivado → estado "Activo" | |
| 2.8 | Material con technicalYield → badge "Ficha técnica" visible | |
| 2.9 | Tab APUs Globales → lista APUs con org IS NULL | |
| 2.10 | Crear/editar APU global → persiste | |

---

## MÓDULO 3 — Campos Técnicos Globales

| # | Caso | Resultado |
|---|------|-----------|
| 3.1 | Crear material global sin datos técnicos → guarda sin error | |
| 3.2 | Editar material global → sección "Datos técnicos opcionales" visible | |
| 3.3 | Cargar rendimiento = 10, unidad = m²/l → guarda | |
| 3.4 | Reabrir el material → rendimiento y unidad se muestran correctamente | |
| 3.5 | Badge "Ficha técnica" aparece en la tabla del admin | |
| 3.6 | Tooltip del badge muestra: "Rendimiento: 10 m²/l — [nota]" | |
| 3.7 | Cargar observación técnica → persiste al reabrir | |
| 3.8 | Borrar rendimiento dejando vacío → guarda sin error (campo opcional) | |

---

## MÓDULO 4 — Catálogo de Empresa (MasterMaterialsPanel)

| # | Caso | Resultado |
|---|------|-----------|
| 4.1 | Entrar a DataAdmin → Materiales de Empresa → lista carga | |
| 4.2 | Materiales globales (IS NULL) visibles con badge "Global" (púrpura) | |
| 4.3 | Materiales importados muestran badge "Importado" (teal) | |
| 4.4 | Materiales con precio editado localmente muestran "Editado localmente" | |
| 4.5 | Click en lápiz de material propio → drawer se abre a la derecha | |
| 4.6 | Drawer aparece fijo, no hace scroll con la lista al bajar | |
| 4.7 | Scroll hasta el último material → lápiz → drawer aparece visible | |
| 4.8 | Con drawer abierto, scroll en lista → drawer no se mueve | |
| 4.9 | paddingRight de la lista se ajusta cuando el drawer está abierto | |
| 4.10 | Cerrar drawer → paddingRight desaparece sin layout shift visible | |
| 4.11 | Editar precio de material importado → badge "Editado localmente" aparece | |
| 4.12 | Sección "Datos técnicos opcionales" visible en el drawer | |
| 4.13 | Cargar technical_yield + unit + notes → guardar → reabrir → persisten | |
| 4.14 | Badge "Ficha técnica" aparece en la lista para materiales con rendimiento | |
| 4.15 | Material global → botón "Solo Admin" en columna acciones (no lápiz) | |

---

## MÓDULO 5 — Importación con Datos Técnicos

| # | Caso | Resultado |
|---|------|-----------|
| 5.1 | Crear material global con rendimiento = 8, unidad = m²/kg, nota = "prueba" | |
| 5.2 | Como usuario org → ir a Materiales de Empresa → botón "Importar desde Global" | |
| 5.3 | Buscar y seleccionar el material creado en 5.1 → importar | |
| 5.4 | El material importado aparece en lista con badge "Importado" | |
| 5.5 | Abrir el drawer del material importado → campos técnicos visibles | |
| 5.6 | Verificar: technical_yield = 8, unit = m²/kg, notes = "prueba" ← **crítico** | |
| 5.7 | Importar segundo material sin datos técnicos → drawer sin datos técnicos | |
| 5.8 | Intentar importar mismo material 2 veces → error "ya fue importado" | |

---

## MÓDULO 6 — Consumos del Proyecto / Explosión de Insumos

| # | Caso | Resultado |
|---|------|-----------|
| 6.1 | Ir a Reportes → card "Explosión de Insumos" visible | |
| 6.2 | Badge "Base presupuesto" visible en la parte superior | |
| 6.3 | Badge "Precios congelados" visible | |
| 6.4 | Subtítulo "Desglose técnico y costos base..." visible | |
| 6.5 | Nota sobre diferencia con Lista de Materiales visible (itálica) | |
| 6.6 | Seleccionar proyecto con presupuesto → Calcular → carga sin error | |
| 6.7 | Cards de totales: Costo Total / Materiales / MO / Equipos | |
| 6.8 | Tab Materiales → filas con código, nombre, cant. técnica, cant. compra | |
| 6.9 | Tab Mano de Obra → filas correctas | |
| 6.10 | Tab Equipos → filas correctas (o "Sin datos" si no hay) | |
| 6.11 | Ordenar por columna → cambia orden correctamente | |
| 6.12 | Exportar Excel → descarga `explosion_insumos_*.xlsx` | |
| 6.13 | Abrir Excel → título "OBRAFLOW — EXPLOSIÓN DE INSUMOS — BASE PRESUPUESTO" | |
| 6.14 | Excel → fila "Fuente: precios base del presupuesto al [fecha]" visible | |
| 6.15 | Excel → dark header, zebra rows, columnas con formato numérico | |
| 6.16 | Exportar CSV → descarga `explosion_insumos_*.csv` | |
| 6.17 | Abrir CSV en Excel → tildes y ñ correctas (no corruptas) | |
| 6.18 | Imprimir → documento con header "Explosión de Insumos" + tablas | |
| 6.19 | Proyecto sin ítems de presupuesto → mensaje de error claro | |
| 6.20 | Proyecto con ítems sin APU maestra → error "Ningún ítem tiene APU vinculada" | |

---

## MÓDULO 7 — Dashboard / Lista de Materiales

| # | Caso | Resultado |
|---|------|-----------|
| 7.1 | Dashboard → widget "Lista de Materiales" visible | |
| 7.2 | Badge "Precios actuales" visible en el encabezado del widget | |
| 7.3 | Subtítulo "Cantidades del proyecto valorizadas con precios actuales..." | |
| 7.4 | Nota footer sobre diferencia con Explosión de Insumos visible | |
| 7.5 | Columna "Costo total" = cantidad × precio unitario (NO suma de unit prices) | |
| 7.6 | Total en tfoot coincide con suma de la columna "Costo total" | |
| 7.7 | Exportar Excel → descarga `.xlsx` con columnas Cant. Total / Precio unit. / Costo total | |
| 7.8 | Abrir Excel → título "OBRAFLOW — LISTA DE MATERIALES — PRECIOS ACTUALES" | |
| 7.9 | Excel → fila "Fuente: precios actuales del Catálogo de Empresa" visible | |
| 7.10 | Exportar CSV → columnas correctas, tildes OK | |

---

## MÓDULO 8 — Reporte Completo (Dashboard)

| # | Caso | Resultado |
|---|------|-----------|
| 8.1 | Dashboard → botón "Imprimir / Exportar" | |
| 8.2 | Selector de secciones funciona (seleccionar/deseleccionar) | |
| 8.3 | Preview de impresión muestra múltiples páginas | |
| 8.4 | Logo del proyecto visible si fue cargado | |
| 8.5 | Sección Insumos Consolidados → cantidades correctas | |
| 8.6 | APUSummaryReport → exportar → funciona | |
| 8.7 | BudgetBreakdownReport → seleccionar fecha base → calcular → funciona | |

---

## MÓDULO 9 — Smoke test de base de datos

Ejecutar en Supabase Dashboard → SQL Editor para confirmar migraciones:

```sql
-- Verificar columnas técnicas en master_materials
SELECT column_name FROM information_schema.columns
WHERE table_name = 'master_materials'
  AND column_name IN ('technical_yield', 'technical_yield_unit', 'technical_notes',
                      'global_source_id', 'local_override', 'imported_at');

-- Verificar columnas comerciales en resources
SELECT column_name FROM information_schema.columns
WHERE table_name = 'resources'
  AND column_name IN ('conversion_factor', 'commercial_unit');

-- Verificar columnas en catalog_task_yields
SELECT column_name FROM information_schema.columns
WHERE table_name = 'catalog_task_yields'
  AND column_name IN ('conversion_factor', 'commercial_unit');

-- Verificar system_role existe en profiles
SELECT column_name FROM information_schema.columns
WHERE table_name = 'profiles'
  AND column_name = 'system_role';
```

Resultado esperado: 6 filas para master_materials, 2 para resources, 2 para catalog_task_yields, 1 para profiles.

---

## MÓDULO 10 — Regresiones rápidas

| # | Caso | Resultado |
|---|------|-----------|
| 10.1 | Crear nuevo proyecto → aparece en selector | |
| 10.2 | Agregar ítem al presupuesto con APU → costo se calcula | |
| 10.3 | Crear APU maestra → guardar → reabre correctamente | |
| 10.4 | Calculadora Chandías → seleccionar tarea → dimensiones → cálculo | |
| 10.5 | Enviar desde Chandías al presupuesto → ítem aparece en BudgetGrid | |
| 10.6 | Borrador Chandías persiste al recargar página | |
| 10.7 | Cambiar de proyecto → borrador no se mezcla entre proyectos | |

---

*Generado: 2026-05-26*
