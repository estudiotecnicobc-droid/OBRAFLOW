# 02 — Revisión de Dominio y Modelo de Datos: Cotización → Proyecto

**Fecha:** 2026-07-11  
**Rama:** `audit/quotation-to-project-compatibility`  
**Tipo:** Diagnóstico — sin cambios en código productivo ni migraciones  
**Prerequisito:** `01_REPO_COMPATIBILITY_AUDIT.md` (hechos verificados del modelo actual)

---

## 0. Propósito

Este documento traduce las decisiones de producto (ver `05_DECISION_LOG.md`) a entidades, atributos, relaciones, restricciones e invariantes concretos. No es un DDL definitivo; es el modelo lógico que debe guiar el diseño de las migraciones de implementación.

---

## 1. Entidades del dominio nuevo

### 1.1 `Quotation` (Cotización)

Cabecera de una oportunidad comercial. Una cotización agrupa todas sus versiones.

| Atributo | Tipo | Constraint | Notas |
|---|---|---|---|
| `id` | uuid | PK, gen_random_uuid() | |
| `organization_id` | uuid | NOT NULL, FK → organizations | Tenant root. RLS ancla aquí. |
| `name` | text | NOT NULL | Nombre interno de la oportunidad (ej: "Casa Rodríguez — PB") |
| `client_name` | text | NOT NULL | Nombre o razón social del cliente |
| `client_contact` | jsonb | NULL | Mínimo: email o teléfono. Ver §1.1.1. |
| `address` | text | NULL | Dirección de la obra |
| `currency` | text | NOT NULL, DEFAULT 'ARS' | Moneda. Multimoneda: fuera del MVP (D-16 pendiente) |
| `status` | text | NOT NULL, CHECK IN ('active','archived') | Estado de la oportunidad, no de versiones |
| `created_by` | uuid | NOT NULL, FK → auth.users | |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() | Trigger set_updated_at |
| `is_active` | boolean | NOT NULL, DEFAULT true | Soft-delete. Reemplaza DELETE físico (D-06 seguridad, R6) |

#### 1.1.1 Campos de cliente (`client_contact` JSONB — datos mínimos)

```json
{
  "email": "string (opcional si hay teléfono)",
  "phone": "string (opcional si hay email)",
  "fiscal_id": "CUIT/CUIL — solo si la cotización es documento fiscal"
}
```

No incluir DNI, datos financieros, ni notas libres con PII. Ver `04_SECURITY_AND_RLS_REVIEW.md §2.1-2.2`.

---

### 1.2 `QuotationVersion` (Versión)

Cada revisión editable de una cotización. Solo una versión puede estar en estado `approved` por cotización (constraint parcial). Una versión en `draft` puede tener su estructura modificada. Las versiones `sent`, `approved` y `rejected` son inmutables.

| Atributo | Tipo | Constraint | Notas |
|---|---|---|---|
| `id` | uuid | PK | |
| `quotation_id` | uuid | NOT NULL, FK → quotations ON DELETE RESTRICT | RESTRICT: no borrar cabecera con versiones |
| `organization_id` | uuid | NOT NULL, FK → organizations | Denormalizado para RLS sin JOIN |
| `version_no` | integer | NOT NULL | Secuencial por cotización (1, 2, 3…). Solo dentro de la cotización, no global (D-22 seguridad R22) |
| `status` | text | NOT NULL, CHECK IN ('draft','sent','approved','rejected','superseded') | Ver §2 (máquina de estados) |
| `business_config` | jsonb | NOT NULL, DEFAULT '{}' | Coeficiente K: ggd_pct, ggi_pct, profit_pct, tax_pct. Solo visible owner/admin/editor (R10) |
| `validity_days` | integer | NULL | Días de vigencia desde la emisión |
| `notes` | text | NULL | Notas internas o para el cliente |
| `sent_at` | timestamptz | NULL | Momento de emisión |
| `approved_by` | uuid | NULL, FK → auth.users | |
| `approved_at` | timestamptz | NULL | |
| `rejected_at` | timestamptz | NULL | |
| `rejection_reason` | text | NULL | |
| `created_by` | uuid | NOT NULL, FK → auth.users | |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

**Constraint de unicidad parcial:**
```sql
CREATE UNIQUE INDEX uq_quotation_one_approved
  ON quotation_versions (quotation_id)
  WHERE status = 'approved';
```

**Trigger de inmutabilidad (R5):**
```sql
-- BEFORE UPDATE/DELETE en quotation_versions:
-- rechazar si OLD.status IN ('sent','approved','rejected','superseded')
-- EXCEPCIÓN: transición controlada 'approved' → 'superseded' (cuando una nueva versión es aprobada)
```

---

### 1.3 `QuotationItem` (Ítem de versión)

Cada línea del presupuesto de la cotización. Referencia directamente a `master_tasks` (sin capa de `tasks` de proyecto intermediaria).

| Atributo | Tipo | Constraint | Notas |
|---|---|---|---|
| `id` | uuid | PK | |
| `quotation_version_id` | uuid | NOT NULL, FK → quotation_versions ON DELETE RESTRICT | |
| `organization_id` | uuid | NOT NULL, FK → organizations | Denormalizado para RLS |
| `master_task_id` | uuid | NULL, FK → master_tasks | NULL si ítem libre (pendiente D-17) |
| `name_snapshot` | text | NOT NULL | Snapshot del nombre al momento de agregar |
| `unit_snapshot` | text | NOT NULL | Snapshot de la unidad |
| `quantity` | numeric | NOT NULL, CHECK > 0 | |
| `unit_cost_snapshot` | numeric | NULL | Costo unitario calculado (interno). NULL = no calculado aún. Solo visible owner/admin/editor |
| `unit_price_snapshot` | numeric | NULL | Precio unitario de venta (post-K). Solo visible owner/admin/editor y proyección cliente |
| `sort_order` | integer | NOT NULL, DEFAULT 0 | |
| `category` | text | NULL | Rubro/agrupador libre (UI agrupa por este campo) |
| `notes` | text | NULL | |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

**Notas sobre `unit_cost_snapshot` y `unit_price_snapshot`:**
- Solo se populan al disparar el cálculo explícito (análogo al `snapshot_budget_costs` actual)
- En versiones `sent/approved` son inmutables — el trigger de la versión los cubre indirectamente
- Si `master_task_id` es NULL (ítem libre), el costo debe ser ingresado manualmente

**RLS de `quotation_items`:** necesita policy propia. Opción A: `organization_id` denormalizado + `is_org_member`. Opción B (más limpia): `EXISTS (SELECT 1 FROM quotation_versions qv WHERE qv.id = quotation_version_id AND is_org_member(qv.organization_id))`. Se recomendada Opción A por eficiencia y alineamiento con el patrón del repo.

---

### 1.4 `QuotationSnapshot` (Snapshot inmutable)

Foto congelada del resultado del cálculo al momento de emitir o calcular explícitamente. Análogo a `budget_cost_snapshots`. Insert-only — sin UPDATE ni DELETE para `authenticated`.

| Atributo | Tipo | Constraint | Notas |
|---|---|---|---|
| `id` | uuid | PK | |
| `quotation_version_id` | uuid | NOT NULL, FK → quotation_versions ON DELETE RESTRICT | RESTRICT: el snapshot sobrevive a soft-deletes de la versión (R24) |
| `organization_id` | uuid | NOT NULL, FK → organizations ON DELETE RESTRICT | |
| `cost_date` | date | NOT NULL | Fecha base usada para resolver precios |
| `input_items` | jsonb | NOT NULL, DEFAULT '[]' | `[{master_task_id, quantity}]` — input del motor |
| `result` | jsonb | NOT NULL, DEFAULT '{}' | Salida de `calculate_consolidated_resources` |
| `is_contractual` | boolean | NOT NULL, DEFAULT false | true = snapshot de la versión aprobada (fuente de verdad contractual) |
| `computed_at` | timestamptz | NOT NULL, DEFAULT now() | Inmutable |
| `created_by` | uuid | FK → auth.users ON DELETE SET NULL | |

**RLS:**
```sql
-- SELECT: is_org_member(organization_id)
-- INSERT: is_org_member(organization_id)
-- UPDATE: ninguna policy → rechazado
-- DELETE: ninguna policy → rechazado
```

**Invariante verificable:** toda versión con `status = 'approved'` debe tener exactamente un `quotation_snapshot` con `is_contractual = true`.

---

### 1.5 `QuotationConversion` (Registro de conversión)

Evento único e idempotente que relaciona una versión aprobada con el proyecto resultante. Inmutable.

| Atributo | Tipo | Constraint | Notas |
|---|---|---|---|
| `id` | uuid | PK | |
| `quotation_version_id` | uuid | NOT NULL, FK → quotation_versions, **UNIQUE** | Una versión → máximo un proyecto (R4) |
| `project_id` | uuid | NOT NULL, FK → projects ON DELETE RESTRICT | RESTRICT: no borrar proyecto sin disociar la conversión |
| `organization_id` | uuid | NOT NULL, FK → organizations | |
| `converted_by` | uuid | NOT NULL, FK → auth.users | Solo owner/admin (D-14) |
| `converted_at` | timestamptz | NOT NULL, DEFAULT now() | |

**RLS:**
```sql
-- SELECT: is_org_member(organization_id)
-- INSERT: gestionado solo por la RPC (SECURITY DEFINER) — no policy directa para authenticated
-- UPDATE: ninguna
-- DELETE: ninguna
```

---

## 2. Máquina de estados

### 2.1 `quotation_versions.status`

```
               ┌─────────────────────────────────────────┐
               │                                         │
           DRAFT ──[Emitir]──► SENT ──[Aprobar]──► APPROVED ──[Convertir]──► (crea proyecto)
               │                  │                   │
               │            [Rechazar]          [Nueva versión]
               │                  │                   │
               └──[clonar]        ▼                   ▼
                              REJECTED           SUPERSEDED
```

| Transición | Actor mínimo | Condición | Efecto |
|---|---|---|---|
| `draft → sent` | editor | versión tiene ≥1 ítem | congela precios, crea snapshot, `sent_at = now()` |
| `sent → approved` | editor (pendiente D-19) | versión en `sent` | marca `approved_at`, snapshot `is_contractual = true`, versión anterior `→ superseded` |
| `sent → rejected` | editor | versión en `sent` | registra `rejection_reason`, `rejected_at` |
| `approved → superseded` | owner/admin | al aprobar otra versión | |
| cualquier → nueva draft | cualquier editor | clonar | crea versión nueva con `version_no + 1` |

**Transiciones prohibidas:** editar líneas de cualquier versión que no sea `draft`; borrar versiones; pasar de `approved` o `rejected` a `draft`.

### 2.2 `quotations.status`

| Estado | Significado |
|---|---|
| `active` | La oportunidad sigue abierta (tiene versiones en cualquier estado) |
| `archived` | Soft-delete: la cotización fue cerrada (ganada o perdida o abandonada) |

El estado de la cotización no implica el estado de sus versiones; son ortogonales.

---

## 3. Relaciones entre entidades nuevas y existentes

```
organizations
├── quotations (organization_id FK)
│   └── quotation_versions (quotation_id FK, organization_id FK denorm)
│       ├── quotation_items (quotation_version_id FK, organization_id FK denorm)
│       ├── quotation_snapshots (quotation_version_id FK, organization_id FK)
│       └── quotation_conversions (quotation_version_id FK UNIQUE, organization_id FK)
│           └── projects (ya existente)
│               └── budget_items (ya existente, project_id FK — sin cambios)
│
└── master_tasks (ya existente, referenciado desde quotation_items.master_task_id)
```

**Regla de FK crítica:** `quotation_versions.quotation_id` usa `ON DELETE RESTRICT`, no CASCADE. Borrar la cabecera falla si hay versiones. Mismo principio en `quotation_snapshots` y `quotation_conversions`.

---

## 4. Modelo de precios: cuándo usar precio vivo vs snapshot

| Contexto | Precio usado | Justificación |
|---|---|---|
| Versión `draft` — vista de edición | Precio vivo (`master_materials.unit_price`) | El borrador puede actualizarse libremente |
| Emitir versión (`draft → sent`) | **Snapshot al momento de emisión** | Se congela `unit_cost_snapshot` y `unit_price_snapshot` en `quotation_items`; se crea `quotation_snapshot` |
| Versión `sent/approved` — vista interna | Precio congelado del snapshot | El total enviado al cliente no puede cambiar |
| "Actualizar precios" (acción explícita) | Precio vivo → **crea nueva versión draft** | Nunca actualiza silenciosamente (D-16) |
| Explosión de Insumos de la cotización | Snapshot de la versión | Igual que en proyectos |
| Conversión a proyecto | Snapshot aprobado → se copia a `budget_items` | Presupuesto contractual = lo cotizado |

---

## 5. Motor de cálculo compartido

**Hecho verificado:** `calculate_consolidated_resources(p_items jsonb, p_organization_id text, p_cost_date date)` recibe un array genérico `[{master_task_id, quantity}]` — sin referencia a `project_id`.

**Implicación:** el motor no necesita cambios para cotizaciones. Solo se necesita:

1. Una nueva RPC `get_quotation_for_calculator(p_version_id uuid)` que extraiga los ítems de `quotation_items` en el mismo formato que `get_budget_for_calculator` produce para `budget_items`.
2. Llamar al mismo `calculate_consolidated_resources` con ese output.
3. Guardar el resultado en `quotation_snapshots` en lugar de `budget_cost_snapshots`.

**No duplicar el motor de cálculo.**

---

## 6. Conversión a proyecto: qué se copia

La RPC `convert_quotation_to_project(p_version_id uuid)` debe copiar en una transacción:

| Origen (cotización) | Destino (proyecto) | Modo |
|---|---|---|
| `quotations.name` | `projects.name` | Copia (editable después) |
| `quotations.client_name` | `projects.client` | Copia |
| `quotations.address` | `projects.address` | Copia |
| `quotations.currency` | `projects.currency` | Copia |
| `quotation_versions.business_config` | `projects.ggd_pct / ggi_pct / profit_pct / tax_pct` | Copia (presupuesto contractual congelado — no editable sin decisión explícita) |
| `quotation_items[].master_task_id` | `tasks.master_task_id` (nuevo task por ítem) | Copia + crea task |
| `quotation_items[].quantity` | `budget_items.quantity` | Copia |
| `quotation_items[].sort_order` | `budget_items.sort_order` | Copia |
| `quotation_items[].category` | `tasks.category` | Copia |
| `quotation_conversions.quotation_version_id` | `projects.source_quotation_version_id` (nueva col nullable) | Referencia |
| `quotation_snapshot (is_contractual=true)` | referenciado desde el proyecto | Referencia (no copia del JSONB) |

**Columna nueva en `projects`:** `source_quotation_version_id uuid NULL FK → quotation_versions` — permite trazabilidad inversa. Nullable para compatibilidad con proyectos existentes (D-12).

---

## 7. Presupuesto contractual vs presupuesto operativo

| Concepto | Definición | Cómo se implementa |
|---|---|---|
| **Presupuesto contractual** | El acuerdo original aprobado por el cliente. Inmutable. | `quotation_snapshot` con `is_contractual=true` + `quotation_versions.business_config` congelado |
| **Presupuesto operativo** | La versión de trabajo del equipo, que puede actualizarse con precios nuevos o ajustes. | `budget_items` del proyecto — editable, recalculable con `snapshot_budget_costs` |
| **Divergencia** | El operativo puede alejarse del contractual. La diferencia es seguimiento de gestión. | Se puede comparar el snapshot contractual vs el snapshot operativo más reciente usando los mismos totales JSONB |

El proyecto nace con el operativo = contractual. Conforme avanza la obra, el operativo puede cambiar; el contractual no.

---

## 8. Invariantes de negocio

| ID | Invariante | Verificación |
|---|---|---|
| INV-01 | Una versión `approved` tiene exactamente un `quotation_snapshot` con `is_contractual = true` | Query de auditoría en `05_DECISION_LOG` § Gate B |
| INV-02 | Solo una versión de una cotización puede estar `approved` simultáneamente | Constraint parcial UNIQUE en `quotation_versions` |
| INV-03 | Una versión convertida tiene exactamente un `quotation_conversion` | Constraint UNIQUE en `quotation_conversions.quotation_version_id` |
| INV-04 | Los precios en versiones no-`draft` no cambian | Trigger BEFORE UPDATE en `quotation_versions` y `quotation_items` |
| INV-05 | El total del presupuesto del proyecto ≤ total del snapshot ± tolerancia | Validación en la RPC de conversión (assertion post-INSERT) |
| INV-06 | `quotation_items.organization_id = quotation_versions.organization_id` | Constraint o trigger al INSERT |
| INV-07 | El snapshot contractual no se puede borrar ni modificar | Sin policy UPDATE/DELETE para `authenticated` en `quotation_snapshots` |
| INV-08 | `quotation_conversions` no se puede borrar | Sin policy DELETE para `authenticated` |

---

## 9. Campos que NO pertenecen al modelo MVP

Los siguientes campos/entidades quedan fuera del alcance hasta decisión explícita (ver `05_DECISION_LOG.md`):

- `quotation_attachments` — adjuntos en Storage (R14 bloqueante hasta tener política de bucket privado)
- Portal de cliente externo / login del cliente
- Firma electrónica / DocuSign
- Adendas / modificaciones contractuales post-aprobación
- Historial de contraoferta del cliente
- Billing / Stripe (módulo separado, migraciones 038/039 pendientes)
- Múltiples monedas en la misma versión

---

## 10. Validación pendiente contra Supabase real

Este modelo asume que la DB de producción coincide con las migraciones del repositorio. Eso no ha sido verificado. Antes de diseñar las migraciones de implementación, ejecutar el archivo `supabase/diagnostics/quotation_to_project_audit.sql` y confirmar:

- Que `budget_items.project_id` es efectivamente `NOT NULL` en producción (query #7)
- Que no existen ya tablas `quotation*` (query #8)
- Que los volúmenes de datos son los esperados (query #9)
- Que las RPCs del motor tienen `GRANT EXECUTE TO authenticated` (query #15)
- Que el historial de migraciones aplicadas coincide con los archivos del repo

**No asumir que repo y producción coinciden hasta recibir esos resultados.**
