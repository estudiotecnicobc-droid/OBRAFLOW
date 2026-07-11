# 03 — Revisión de Flujo UX: Cotización → Proyecto

**Fecha:** 2026-07-11  
**Rama:** `audit/quotation-to-project-compatibility`  
**Tipo:** Diagnóstico — sin cambios en código productivo  
**Prerequisito:** `02_DOMAIN_AND_DATA_REVIEW.md` (modelo de entidades)

---

## 0. Principios de diseño de UX acordados

1. **UX unificada bajo "Mis Obras"** (D-01): no hay una sección "Cotizaciones" desconectada del resto. Las cotizaciones viven en la misma navegación principal.
2. **Proyectos directos siguen siendo válidos** (D-12): el flujo existente de "Crear Proyecto" no se rompe. Las cotizaciones son una ruta opcional, no obligatoria.
3. **El cliente nunca ve costo, margen ni tarifas** (D-15): hay dos vistas/documentos diferenciados: interna (con desglose) y cliente (solo precio final).
4. **La actualización de precios siempre es explícita** (D-16): nunca recálculo silencioso al reabrir una versión enviada.
5. **Sin portal de cliente en el MVP** (D-13): el cliente recibe un PDF/Excel, no accede a la app.

---

## 1. Navegación general

### 1.1 Estructura actual (verificada en código)

```
Layout.tsx → navItems por rol:
  Proyectos (ProjectHub) → selección de proyecto activo
  Dashboard
  Cómputo (Chandías)
  Presupuesto (BudgetEditor)
  Explosión de Insumos / Lista de Materiales
  Reportes
  Base Maestra / Mis Insumos / APUs
  [Módulos ocultos o en localStorage: Calidad, Recepción, Subcontratistas, etc.]
```

### 1.2 Navegación objetivo con cotizaciones (MVP)

```
ProjectHub → renombrado o expandido a "Mis Obras":
  ├── Cotizaciones  [nuevo]
  │   ├── Lista de cotizaciones
  │   └── Detalle de cotización → versiones → editor
  └── Proyectos    [existente sin cambios]
      └── (flujo actual)
```

La entrada "Mis Obras" se convierte en el hub que unifica ambas entidades. Desde el detalle de una cotización aprobada aparece el botón "Convertir a Proyecto".

---

## 2. Flujos principales

### 2.1 Flujo A: Crear cotización nueva

```
[Mis Obras] → [+ Nueva Cotización]
  → Paso 1: Datos del cliente
      nombre, dirección, moneda, vigencia (días)
      [Continuar]
  → Paso 2: Ítems del presupuesto
      selector de APU (master_tasks) + cantidad + categoría
      precios calculados en tiempo real (precios vivos, versión draft)
      [Guardar borrador]
  → Estado: draft

Equivalente al actual ProjectWizard pero para cotizaciones.
No crea un proyecto todavía.
```

**Actor:** editor, admin, owner

**Datos mínimos para guardar:** nombre de cotización + al menos un dato de contacto del cliente.

**Validaciones de UI:**
- Nombre de cotización: obligatorio
- Al menos un canal de contacto del cliente: email o teléfono
- APU seleccionado: master_task_id válido (o ítem libre si se decide — D-17 pendiente)
- Cantidad > 0

---

### 2.2 Flujo B: Editar borrador

```
[Mis Obras] → [Cotizaciones] → [seleccionar cotización]
  → Lista de versiones → [Versión N — Draft]
  → Editor de ítems:
      agregar/editar/eliminar ítems
      reordenar (sort_order)
      calcular precios (botón "Calcular" → llama motor)
      ajustar coeficiente K (business_config)
  → [Guardar] — guardado optimista con confirmación visible (no fire-and-forget)
```

**Actor:** editor, admin, owner

**Restricción:** solo versiones `draft` son editables. Si el usuario intenta editar una versión `sent`, la UI muestra mensaje y ofrece "Crear nueva versión".

---

### 2.3 Flujo C: Emitir versión (draft → sent)

```
[Editor de ítems — versión draft]
  → [Emitir] (acción principal visible)
  → Modal de confirmación:
      "¿Emitir versión 1? Los precios quedarán congelados en este momento."
      Resumen: N ítems, total estimado $X
      [Cancelar] / [Emitir]
  → Acción: snapshot de precios + transición estado
  → Feedback: "Versión 1 emitida — precios congelados al [fecha]"
  → Opciones disponibles: [Exportar PDF cliente] [Exportar Excel cliente] [Aprobar] [Rechazar] [Nueva versión]
```

**Actor:** editor, admin, owner

**Lo que ocurre internamente (sin que el usuario lo vea):**
1. `quotation_items.unit_cost_snapshot` y `unit_price_snapshot` se graban con los precios actuales
2. Se crea un `quotation_snapshot` con `is_contractual = false`
3. El status de la versión cambia a `sent`
4. `sent_at = now()`

**Errores esperados y visibles:**
- "La versión no tiene ítems con APU asignado" → no se puede calcular el costo
- "No se pudo congelar los precios — reintentá" → error de RPC

---

### 2.4 Flujo D: Exportar para el cliente

```
[Versión — cualquier estado no-draft]
  → [Exportar para cliente]
  → Selección de formato: [PDF] [Excel]
  → Genera documento con plantilla cliente:
      Membrete de la organización
      Datos del cliente
      Ítems: código, descripción, unidad, cantidad, precio unitario, subtotal
      Total con impuestos
      Vigencia
      Sin: costo interno, margen, tarifas de MO, desglose de APU
```

**Actor:** editor, admin, owner (el cliente recibe el archivo, no tiene acceso a la app)

**Separación de plantillas (R9, R12):**
- **Plantilla interna:** incluye costo, margen, desglose
- **Plantilla cliente:** solo precio final, descripción comercial

El tipo de plantilla se selecciona en la UI; el servidor/función de exportación valida que el rol del usuario coincida con la plantilla solicitada.

---

### 2.5 Flujo E: Aprobar versión (sent → approved)

```
[Versión — estado sent]
  → [Aprobar]
  → Modal de confirmación:
      "¿Aprobar versión 1? Esta versión quedará como la oferta aceptada."
      Total: $X
      [Cancelar] / [Aprobar]
  → Acción:
      - status → 'approved'
      - approved_by = auth.uid()
      - snapshot existente → is_contractual = true
      - versión anterior 'approved' (si existe) → 'superseded'
  → Feedback: "Versión 1 aprobada — lista para convertir a proyecto"
  → Aparece: [Convertir a Proyecto]
```

**Actor (pendiente D-19):** editor o admin/owner — ver Decision Log

**Errores esperados:**
- "Ya hay una versión aprobada activa" (si el constraint parcial falla — caso de race condition)
- Manejo explícito, no `.catch(console.error)`

---

### 2.6 Flujo F: Rechazar versión (sent → rejected)

```
[Versión — estado sent]
  → [Rechazar]
  → Modal con campo de motivo (opcional)
  → Acción: status → 'rejected', rejected_at, rejection_reason
  → La cotización sigue activa; se puede crear nueva versión
```

**Actor:** editor, admin, owner

---

### 2.7 Flujo G: Crear nueva versión desde existente

```
[Versión — cualquier estado]
  → [Nueva versión]
  → Crea versión N+1 en estado 'draft', clonando ítems y business_config
  → El usuario puede editar libremente
  → La versión anterior no cambia
```

**Actor:** editor, admin, owner

**Caso de uso típico:** el cliente solicitó cambios → se crea v2 con ajustes → se emite v2.

---

### 2.8 Flujo H: Convertir a proyecto (aprobado → proyecto)

```
[Versión — estado approved]
  → [Convertir a Proyecto]
  → Modal de confirmación:
      "¿Crear un proyecto a partir de esta cotización?"
      Nombre propuesto: [nombre de cotización] (editable)
      Fecha de inicio: [selector]
      [Cancelar] / [Crear Proyecto]
  → Acción: RPC convert_quotation_to_project(version_id)
      - Crea project con business_config de la versión
      - Crea tasks + budget_items desde quotation_items
      - Registra en quotation_conversions
  → Feedback: "Proyecto creado: [nombre]" + link al proyecto
  → Idempotente: si se intenta de nuevo, retorna el proyecto existente con mensaje "ya convertida"
```

**Actor:** owner/admin exclusivamente (D-14, R3)

**Errores esperados y visibles:**
- "No tenés permiso para convertir" → solo admin/owner
- "Esta versión ya fue convertida" → link al proyecto existente
- "La conversión falló — los datos no fueron creados. Reintentá." → rollback, sin proyecto parcial (R25)

---

### 2.9 Flujo I: Ver proyecto originado en cotización

```
[Proyecto]
  → Header o sección de info: "Originado en Cotización: [nombre] v[N]"
  → Link a la versión aprobada
  → Presupuesto contractual: snapshot de la versión aprobada
  → Presupuesto operativo: budget_items editables (flujo existente)
```

El proyecto no "sabe" que nació de una cotización más allá del campo `source_quotation_version_id`. El flujo de trabajo diario del proyecto es idéntico al actual.

---

### 2.10 Flujo J: Crear proyecto directamente (sin cotización)

**Este flujo no cambia.** El `ProjectWizard` actual sigue funcionando igual. No se fuerza ninguna cotización previa (D-12).

---

## 3. Lista de vistas necesarias (MVP)

| Vista | Componente sugerido | Datos | Actor |
|---|---|---|---|
| Lista de cotizaciones | `QuotationList` | quotations de la org, con versión más reciente y su status | editor+ |
| Detalle de cotización | `QuotationDetail` | cabecera + lista de versiones | editor+ |
| Editor de versión | `QuotationVersionEditor` | ítems, precios, K, totales | editor+ |
| Modal de emisión | `EmitVersionModal` | confirmación + resumen de totales | editor+ |
| Modal de aprobación | `ApproveVersionModal` | confirmación | editor+ (pendiente D-19) |
| Modal de conversión | `ConvertToProjectModal` | nombre del proyecto, fecha inicio | admin/owner |
| Export cliente | `QuotationClientExport` | plantilla sin costo | editor+ |
| Export interno | `QuotationInternalExport` | plantilla con desglose | editor+ |
| Comparador versiones | fuera del MVP | diff entre versiones | — |

---

## 4. Estados visibles en UI por actor

### 4.1 Editor de versión (draft)

| Elemento | owner/admin | editor | viewer/client |
|---|---|---|---|
| Lista de ítems | ✅ editable | ✅ editable | ❌ no accede |
| Precios vivos por ítem | ✅ | ✅ | ❌ |
| Costo unitario interno | ✅ | ✅ | ❌ |
| Precio de venta unitario | ✅ | ✅ | ❌ |
| Business config (K) | ✅ editable | ✅ editable | ❌ |
| Botón Emitir | ✅ | ✅ | ❌ |

### 4.2 Versión enviada (sent)

| Elemento | owner/admin | editor | viewer/client |
|---|---|---|---|
| Ítems (solo lectura) | ✅ | ✅ | ❌ (solo vista cliente) |
| Precios congelados visibles | ✅ | ✅ | ❌ (solo precio final) |
| Botón Aprobar | ✅ | ✅ (pendiente D-19) | ❌ |
| Botón Rechazar | ✅ | ✅ | ❌ |
| Botón Nueva versión | ✅ | ✅ | ❌ |
| Export cliente | ✅ | ✅ | ✅ |
| Export interno | ✅ | ✅ | ❌ |

### 4.3 Versión aprobada (approved)

| Elemento | owner/admin | editor | viewer/client |
|---|---|---|---|
| Ítems + precios (solo lectura) | ✅ | ✅ | ❌ |
| Badge "Versión aprobada" | ✅ | ✅ | ✅ |
| Botón Convertir a Proyecto | ✅ | ❌ | ❌ |
| Botón Nueva versión | ✅ | ✅ | ❌ |
| Export cliente | ✅ | ✅ | ✅ |

---

## 5. Componentes existentes reutilizables

| Componente actual | Reutilización en cotizaciones |
|---|---|
| `APUBuilder` | Para agregar APUs a ítems de cotización — mismo catálogo `master_tasks` |
| `BudgetBusinessPanel` | Para editar el coeficiente K de la versión |
| `BudgetStalenessAlert` | Para alertar de precios desactualizados en draft |
| `BudgetCostComparisonPanel` | Para comparar snapshot contractual vs operativo en el proyecto |
| Motor `calculate_consolidated_resources` | Sin cambios — ver `02_DOMAIN_AND_DATA_REVIEW.md §5` |
| `BudgetBreakdownReport` | Adaptable para recibir `quotation_version_id` además de `project_id` |
| `ConsolidatedProjectReport` | Ídem |

---

## 6. Patrones de interacción críticos (correcciones de seguridad UX)

### 6.1 Guardado visible — no fire-and-forget

El patrón actual (`ERPContext` fire-and-forget con `.catch(console.error)`) **no puede usarse** para las siguientes acciones de cotización:

| Acción | Patrón requerido |
|---|---|
| Emitir versión | await + feedback success/error + revertir si falla |
| Aprobar versión | await + feedback + revertir si falla |
| Rechazar versión | await + feedback + revertir si falla |
| Convertir a proyecto | await + feedback + no retry automático (idempotente) |
| Calcular precios | await + spinner + mostrar resultado o error |

Para edición normal de ítems draft, se puede usar optimistic update con rollback visible.

### 6.2 Confirmación antes de operaciones irreversibles

Las siguientes acciones abren modal de confirmación con resumen antes de ejecutar:

- Emitir (congela precios)
- Aprobar (marca versión como contractual)
- Convertir a proyecto (crea entidades de proyecto)

No usar confirmaciones tipo `window.confirm()` — usar modales de componente.

### 6.3 Badge de estado visible

Cada versión muestra claramente su estado con color:

| Estado | Color sugerido | Texto |
|---|---|---|
| `draft` | gris | Borrador |
| `sent` | azul | Emitida |
| `approved` | verde | Aprobada |
| `rejected` | rojo | Rechazada |
| `superseded` | gris claro | Superada |

---

## 7. Lo que NO entra en el MVP de UX

- Comparador lado a lado de versiones
- Vista de cotización para el cliente (portal externo)
- Firma electrónica o flujo de aprobación del cliente en la app
- Chat o comentarios en la cotización
- Historial de revisiones del cliente (contraoferta)
- Timeline de la oportunidad
- Métricas de conversión (tasa de cierre)
- Recordatorios de vencimiento de vigencia
- Adjuntos (planos, fotos) — pospuesto por R14 de seguridad

---

## 8. Preguntas abiertas de UX

1. ¿La lista de cotizaciones y proyectos viven en tabs dentro de un mismo hub, o en entradas separadas de la navegación?
2. ¿Cómo se navega de un proyecto al detalle de la cotización que lo originó?
3. ¿El editor de versión muestra costo Y precio en columnas separadas, o solo precio?
4. ¿Qué tan visible es el "Presupuesto contractual" en la vista del proyecto?
5. ¿El borrador se auto-guarda o requiere botón "Guardar"?
6. ¿Se muestra el número de versión al cliente en el PDF (v1, v2)?
