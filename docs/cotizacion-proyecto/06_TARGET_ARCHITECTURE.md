# 06 — Arquitectura Objetivo: Cotización → Proyecto

**Fecha:** 2026-07-11  
**Rama:** `audit/quotation-to-project-compatibility`  
**Tipo:** Propuesta de diseño — sin implementación  
**Prerequisitos:** `01` (hechos del repo), `02` (modelo de datos), `03` (flujo UX), `04` (seguridad), `05` (decisiones)

---

## 1. Visión UX

El usuario gestiona oportunidades comerciales y proyectos en una misma sección "Mis Obras". Puede iniciar una obra directamente como proyecto (flujo actual, sin cambios) o comenzar por una cotización que, una vez aprobada por el cliente, se convierte en proyecto con un presupuesto ya definido.

La cotización existe de forma independiente: tiene su propio ciclo de vida comercial, versiones, precios congelados y snapshot contractual. El proyecto hereda ese punto de partida pero luego evoluciona de forma autónoma.

---

## 2. Arquitectura lógica

```
[Usuario]
    │
    ├── Ruta A: Proyecto directo (sin cotización)
    │       ProjectWizard → projects + budget_items (flujo actual sin cambios)
    │
    └── Ruta B: Cotización → Proyecto
            QuotationEditor
                → quotations
                → quotation_versions (draft)
                → quotation_items
                        │
                        ├── [Calcular] → calculate_consolidated_resources (RPC existente)
                        │                       ↓
                        │               quotation_snapshots
                        │
                        ├── [Emitir] → congela precios → status: sent
                        │
                        ├── [Aprobar] → is_contractual=true → status: approved
                        │
                        └── [Convertir] (owner/admin)
                                → convert_quotation_to_project (RPC nueva, SECURITY DEFINER)
                                        ↓
                                quotation_conversions (UNIQUE)
                                        ↓
                                projects + tasks + budget_items (copia desde versión aprobada)
```

---

## 3. Entidades conceptuales y responsabilidades

| Entidad | Responsabilidad | Mutabilidad |
|---|---|---|
| `quotations` | Cabecera de la oportunidad comercial. Agrupa versiones. | Solo `status` y `is_active` cambian |
| `quotation_versions` | Una revisión editable (draft) o congelada (sent/approved). | Solo en estado `draft` |
| `quotation_items` | Líneas de presupuesto de una versión. Referencian `master_tasks`. | Solo en versión `draft` |
| `quotation_snapshots` | Foto inmutable del cálculo de costos. Fuente contractual al aprobar. | Insert-only, nunca mutable |
| `quotation_conversions` | Registro del evento de conversión. Idempotencia. | Insert-only, never delete |
| `projects` | Proyecto de trabajo. Editable. `source_quotation_version_id` nullable. | Editable |
| `tasks` / `budget_items` | Presupuesto operativo. Copia de los items al convertir. Editable. | Editable |

---

## 4. Estados de cotización (`quotations.status`)

| Estado | Significado | Transición |
|---|---|---|
| `active` | Oportunidad abierta — puede tener versiones en cualquier estado | Siempre salvo archivado |
| `archived` | Cerrada (ganada, perdida o abandonada) | Soft-delete via `is_active = false` |

El estado de la cotización no implica el de sus versiones; son independientes.

---

## 5. Estados de versión (`quotation_versions.status`)

| Estado | Editable | Descripción |
|---|---|---|
| `draft` | Sí — ítems, cantidades, business_config | Borrador de trabajo |
| `sent` | No — precios congelados | Versión emitida al cliente |
| `approved` | No — inmutable | Cliente aceptó; snapshot `is_contractual = true` |
| `rejected` | No | Cliente rechazó |
| `superseded` | No | Reemplazada por otra versión aprobada |

**Invariante DB:** máximo una versión `approved` por cotización (UNIQUE parcial sobre `quotation_id WHERE status='approved'`).

---

## 6. Evento Emitir (`draft → sent`)

**Actor mínimo:** editor  
**Precondición:** versión en `draft` con al menos un ítem  
**Acción (en una transacción):**
1. Calcular costos: `get_quotation_for_calculator(version_id)` → `calculate_consolidated_resources`
2. Escribir `unit_cost_snapshot` y `unit_price_snapshot` en cada `quotation_item`
3. Crear `quotation_snapshot` con `is_contractual = false`
4. Actualizar `quotation_versions.status = 'sent'`, `sent_at = now()`

**Errores esperados (visibles en UI):**
- Ningún ítem con `master_task_id` → no se puede calcular
- Fallo de RPC → rollback total, mensaje accionable

**No usar fire-and-forget.** `await` + confirmación visible.

---

## 7. Evento Aprobar (`sent → approved`)

**Actor mínimo:** editor (pendiente D-19 — puede ser solo owner/admin)  
**Precondición:** versión en `sent`  
**Acción (en una transacción):**
1. Actualizar `quotation_versions.status = 'approved'`, `approved_by = auth.uid()`, `approved_at = now()`
2. Marcar el snapshot más reciente de esta versión como `is_contractual = true`
3. Si hay otra versión `approved` de la misma cotización → transicionarla a `superseded`

**Invariante:** al salir, existe exactamente una versión `approved` y exactamente un snapshot `is_contractual = true` para esa versión.

**Errores esperados:**
- Race condition: otra versión ya fue aprobada → mensaje con referencia a la versión ganadora

---

## 8. Evento Rechazar (`sent → rejected`)

**Actor mínimo:** editor  
**Precondición:** versión en `sent`  
**Acción:** `status = 'rejected'`, `rejected_at = now()`, `rejection_reason` (opcional)  
**Consecuencia:** La cotización sigue activa. Se puede crear nueva versión.

---

## 9. Evento Convertir (`approved → proyecto`)

**Actor:** solo owner/admin (D-14)  
**Precondición:** versión en `approved`, sin conversión previa  

**RPC: `convert_quotation_to_project(p_version_id uuid) RETURNS jsonb`**

```sql
SECURITY DEFINER
SET search_path = public
```

**Pasos internos (una sola transacción):**

```
1. Validar auth.uid() NOT NULL
2. Resolver organization_id desde quotation_versions (no de parámetro)
3. Validar is_org_member_with_role(org_id, ['owner','admin'])
4. Adquirir advisory lock: pg_advisory_xact_lock(hashtext(p_version_id::text))
5. Verificar idempotencia: ¿existe quotation_conversions WHERE quotation_version_id = p_version_id?
   → SÍ: devolver {created: false, project_id: <existente>}
   → NO: continuar
6. Verificar que la versión está en 'approved'
7. INSERT projects (name, client, currency, org_id, source_quotation_version_id, ggd/ggi/profit/tax)
8. Para cada quotation_item:
   a. INSERT tasks (org_id, name_snapshot, unit_snapshot, master_task_id, category)
   b. INSERT budget_items (project_id, task_id, quantity, sort_order, org_id)
9. INSERT quotation_conversions (version_id, project_id, org_id, converted_by=auth.uid())
10. Validar invariante: total del presupuesto ≈ total del snapshot aprobado (±1%)
    → Si diverge: RAISE EXCEPTION (rollback)
11. Devolver {created: true, project_id: <nuevo>}
```

**Errores esperados y su comportamiento:**
| Error | Comportamiento | UI |
|---|---|---|
| Sin autenticación | RAISE EXCEPTION 'not authenticated' | "Sesión expirada — iniciá sesión nuevamente" |
| Sin permiso (no owner/admin) | RAISE EXCEPTION 'insufficient role' | "No tenés permiso para convertir cotizaciones" |
| Versión ya convertida | `{created: false, project_id: ...}` | "Esta versión ya tiene un proyecto asociado" + link |
| Versión no aprobada | RAISE EXCEPTION 'version not approved' | "Solo se pueden convertir versiones aprobadas" |
| Divergencia de totales | RAISE EXCEPTION → rollback | "La conversión detectó una inconsistencia de precios — reintentá" |
| Error de DB | RAISE EXCEPTION → rollback | "La conversión falló. Los datos no fueron creados. Reintentá." |

---

## 10. Snapshot

Cada snapshot es una foto inmutable del cálculo de costos en un momento dado.

**Cuándo se crea:**
- Al emitir: snapshot con `is_contractual = false`
- Al aprobar: el último snapshot de la versión pasa a `is_contractual = true`
- Al recalcular explícitamente (acción en draft): nuevo snapshot, los anteriores permanecen

**Lo que contiene (`quotation_snapshots.result` JSONB):**
```json
{
  "materials": [{
    "code": "...", "name": "...", "unit": "kg",
    "quantity": 50, "unitPrice": 100, "totalCost": 5000
  }],
  "labor": [...],
  "equipment": [...],
  "totals": {
    "material": 5000, "labor": 800, "equipment": 200, "grandTotal": 6000
  },
  "computedAt": "2026-07-11T..."
}
```

**Garantías:**
- Sin policy UPDATE ni DELETE para `authenticated`
- `ON DELETE RESTRICT` desde `quotation_versions` — el snapshot sobrevive al soft-delete de la versión
- Si la versión se borra físicamente (solo via `service_role`), el snapshot queda huérfano — aceptable como registro histórico

---

## 11. Fuente contractual

La fuente de verdad del acuerdo comercial es:

```
quotation_snapshots WHERE is_contractual = true
  → vinculado via quotation_version_id
  → referenciado desde projects.source_quotation_version_id
```

El presupuesto contractual **no es editable** desde la UI del proyecto. Es solo lectura.

Para mostrar el presupuesto contractual en el proyecto, se lee el snapshot de la versión aprobada usando `source_quotation_version_id`.

**Pendiente D-20:** si los reportes actuales requieren una copia materializada en `budget_cost_snapshots`, se evaluará generar esa copia en la RPC de conversión, pero marcada como derivada y vinculada al snapshot original para verificación.

---

## 12. Presupuesto operativo

Los `budget_items` del proyecto son el presupuesto operativo. Nacen como copia de `quotation_items` al convertir, con los mismos APUs y cantidades. Luego pueden divergir:

- Precios actualizados (`snapshot_budget_costs` existente)
- Alcance ajustado (agregar/quitar ítems)
- Eficiencias reales

La divergencia entre contractual y operativo es información de gestión, no un error. Se puede comparar el `result` del snapshot contractual con el más reciente `budget_cost_snapshot` del proyecto.

---

## 13. Motor de cálculo compartido

El motor `calculate_consolidated_resources` no cambia. Solo se agrega:

```sql
-- Nueva RPC (análoga a get_budget_for_calculator)
FUNCTION public.get_quotation_for_calculator(
  p_version_id uuid
) RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'master_task_id', qi.master_task_id,
        'quantity',       qi.quantity,
        'taskName',       qi.name_snapshot,
        'itemCount',      1
      ))
      FROM quotation_items qi
      WHERE qi.quotation_version_id = p_version_id
        AND qi.master_task_id IS NOT NULL
        AND qi.quantity > 0
    ), '[]'),
    'versionId', p_version_id
  )
$$;
```

Luego se llama al mismo `calculate_consolidated_resources(items, org_id, cost_date)`.

---

## 14. Roles y capacidades

| Capacidad | owner/admin | editor | viewer/client | worker |
|---|:---:|:---:|:---:|:---:|
| Ver lista de cotizaciones | ✅ | ✅ | ❌ | ❌ |
| Crear cotización | ✅ | ✅ | ❌ | ❌ |
| Editar borrador | ✅ | ✅ | ❌ | ❌ |
| Ver costo interno / margen | ✅ | ✅ | ❌ | ❌ |
| Ver precio de venta | ✅ | ✅ | ✅ (vista cliente) | ❌ |
| Calcular precios | ✅ | ✅ | ❌ | ❌ |
| Emitir versión | ✅ | ✅ | ❌ | ❌ |
| Aprobar versión | ✅ | pendiente D-19 | ❌ | ❌ |
| Rechazar versión | ✅ | ✅ | ❌ | ❌ |
| Crear nueva versión | ✅ | ✅ | ❌ | ❌ |
| Convertir a proyecto | ✅ | ❌ | ❌ | ❌ |
| Exportar (plantilla interna) | ✅ | ✅ | ❌ | ❌ |
| Exportar (plantilla cliente) | ✅ | ✅ | ✅ | ❌ |
| Archivar cotización | ✅ | ❌ | ❌ | ❌ |

---

## 15. RLS — Políticas objetivo por tabla

> **Nota:** Los nombres de función y el patrón son los mismos que el repo ya usa en `007_rls_policies.sql`. No es texto teórico — es la extensión directa del patrón existente.

### `quotations`
```sql
-- SELECT: miembro de la org
USING (is_org_member(organization_id))

-- INSERT: editor o superior
WITH CHECK (is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']))

-- UPDATE (solo is_active y status — soft-delete/archivo):
USING (is_org_member_with_role(organization_id, ARRAY['owner','admin']))
WITH CHECK (is_org_member_with_role(organization_id, ARRAY['owner','admin']))

-- DELETE: prohibido para authenticated (soft-delete únicamente)
```

### `quotation_versions`
```sql
-- SELECT: miembro de la org
USING (is_org_member(organization_id))

-- INSERT: editor o superior
WITH CHECK (is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']))

-- UPDATE: solo si status='draft' (inmutabilidad enforced por trigger también)
USING (is_org_member_with_role(organization_id, ARRAY['owner','admin','editor'])
       AND status = 'draft')

-- DELETE: prohibido
```

### `quotation_items`
```sql
-- SELECT: miembro de la org (organization_id denormalizado)
USING (is_org_member(organization_id))

-- INSERT/UPDATE: editor, solo en versión draft (verificado por trigger)
WITH CHECK (is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']))

-- DELETE: idem
```

### `quotation_snapshots` — insert-only
```sql
-- SELECT: miembro de la org
USING (is_org_member(organization_id))

-- INSERT: miembro de la org (RPC usa SECURITY INVOKER → hereda)
WITH CHECK (is_org_member(organization_id))

-- UPDATE/DELETE: ninguna policy → rechazado automáticamente
```

### `quotation_conversions` — insert-only
```sql
-- SELECT: miembro de la org
USING (is_org_member(organization_id))

-- INSERT: gestionado solo por RPC SECURITY DEFINER
-- No policy directa para authenticated (la RPC hace la validación)

-- UPDATE/DELETE: ninguna policy
```

**RLS adicional para proteger costo/margen de viewer (D-15):**  
Opción A: Vista `quotation_client_view` que excluye columnas de costo; viewer solo accede a esa vista.  
Opción B: Policy SELECT sobre `quotation_items` con columna `unit_cost_snapshot` = NULL para viewer (requiere PG column-level security o vista).  
La decisión de implementación queda para el PR de RLS.

---

## 16. Audit log

Los siguientes eventos deben registrarse en `audit_log` (tabla existente en migración 048):

| Evento | Trigger/RPC | Campos |
|---|---|---|
| `QUOTATION_CREATE` | INSERT en `quotations` | actor_id, quotation_id, org_id |
| `VERSION_EMIT` | Transición `draft→sent` | actor_id, version_id, totals_snapshot |
| `VERSION_APPROVE` | Transición `sent→approved` | actor_id, version_id, approved_at |
| `VERSION_REJECT` | Transición `sent→rejected` | actor_id, version_id, reason |
| `QUOTATION_CONVERT` | RPC de conversión | actor_id, version_id, project_id, org_id |
| `EXPORT_CLIENT` | Generación de PDF/Excel cliente | actor_id, version_id, format |
| `EXPORT_INTERNAL` | Generación de PDF/Excel interno | actor_id, version_id, format |
| `QUOTATION_ARCHIVE` | Soft-delete | actor_id, quotation_id |

Mínimo para el MVP: `VERSION_APPROVE` y `QUOTATION_CONVERT`.

---

## 17. Idempotencia

| Operación | Mecanismo |
|---|---|
| Doble conversión | `UNIQUE (quotation_version_id)` en `quotation_conversions` + `pg_advisory_xact_lock` + respuesta `{created: false}` |
| Doble aprobación | Constraint parcial `UNIQUE (quotation_id) WHERE status='approved'` + compare-and-set en UPDATE |
| Doble snapshot | No hay constraint — el sistema acepta múltiples snapshots (historial). Solo uno tiene `is_contractual = true`. |
| Doble emisión | Status machine: solo se puede emitir desde `draft`. El trigger rechaza la transición desde `sent`. |

---

## 18. Manejo de errores

### 18.1 Principios

- Las operaciones críticas (emitir, aprobar, convertir) siempre usan `await` explícito con `try/catch`
- En caso de error, el estado local de la UI se revierte al estado previo
- El mensaje al usuario es accionable: indica qué falló y qué puede hacer
- No usar `.catch(console.error)` para estas operaciones

### 18.2 Tabla de errores por operación

| Operación | Error técnico | Mensaje al usuario |
|---|---|---|
| Emitir | Versión sin ítems calculables | "Agregá al menos un APU con precio para emitir" |
| Emitir | Fallo de RPC / red | "No se pudo emitir — reintentá" |
| Aprobar | Race condition: otra versión aprobada | "Otra versión fue aprobada mientras tanto — recargá" |
| Aprobar | Sin permisos | "Solo editores y admins pueden aprobar" |
| Convertir | Sin permisos | "Solo admins pueden convertir cotizaciones a proyectos" |
| Convertir | Ya convertida | "Esta versión ya tiene un proyecto — [Ver proyecto]" |
| Convertir | Divergencia de totales | "La conversión detectó una inconsistencia — reintentá" |
| Convertir | Error de DB | "La conversión falló. Los datos no fueron creados. Reintentá." |

### 18.3 Lo que nunca debe ocurrir

- Un proyecto parcialmente creado sin `budget_items`
- Un snapshot `is_contractual = true` sin versión `approved` correspondiente
- Una `quotation_conversion` sin `project_id` válido
- La UI mostrando "aprobado" cuando la DB no confirmó

---

## 19. Compatibilidad histórica

Las siguientes garantías se mantienen para datos y código existentes:

| Garantía | Implementación |
|---|---|
| Proyectos sin cotización siguen funcionando | `projects.source_quotation_version_id` es nullable (D-12) |
| `budget_items.project_id` no cambia | Tablas separadas (D-02, D-03) |
| ERPContext no cambia | Las cotizaciones tienen su propio contexto/store |
| RPCs existentes no cambian | Motor reutilizado sin modificaciones (D-04) |
| Migraciones 001–058 no se alteran | Solo se agregan nuevas migraciones |
| `ProjectWizard` no cambia | La Ruta A sigue igual (D-12) |

---

## 20. Alcance MVP

**Incluido:**
- Crear, editar y versionar cotizaciones (Ruta B)
- Calcular precios con motor existente
- Emitir (congelar precios) → snapshot
- Aprobar versión → snapshot contractual
- Rechazar versión
- Exportar PDF y Excel en plantilla cliente (sin costo)
- Exportar PDF y Excel en plantilla interna (con costo)
- Convertir versión aprobada a proyecto (solo owner/admin)
- Idempotencia y transaccionalidad de la conversión
- RLS completa en todas las tablas nuevas
- Audit log para APPROVE y CONVERT

**Incluido como prerequisito (no de cotizaciones):**
- Corrección de 29 errores de typecheck actuales (PR A)

---

## 21. Fuera de alcance

- Portal o login para el cliente externo
- Adjuntos (planos, PDF firmados) en Supabase Storage
- Firma electrónica
- Adendas post-aprobación
- Comparador de versiones lado a lado
- Historial de contraoferta del cliente
- Notificaciones automáticas (email, webhook)
- Billing / Stripe
- Múltiples monedas en la misma versión
- WBS con más de 1 nivel de jerarquía (dependiente de D-18)
- Métricas de conversión comercial

---

## 22. Diagrama textual

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           DOMINIO ACTUAL                                │
│                                                                         │
│  organizations ──► projects ──► tasks ──► budget_items                  │
│                         │                      │                        │
│                         │               (project_id FK NOT NULL)        │
│                         │                                               │
│                    budget_cost_snapshots (project_id FK)                │
│                                                                         │
│  master_tasks (org) ◄───────────────────────────────────────────────────┤
│  master_materials   ◄───────────────────────────────────────────────────┤
│  resources          ◄───────────────────────────────────────────────────┤
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                         DOMINIO NUEVO (AGREGA)                          │
│                                                                         │
│  organizations                                                          │
│      │                                                                  │
│      └──► quotations (org_id FK)                                        │
│               │                                                         │
│               └──► quotation_versions (quotation_id FK, org_id FK)     │
│                         │                                               │
│                         ├──► quotation_items (version_id FK, org_id FK)│
│                         │         └── master_task_id FK ───► master_tasks│
│                         │                                               │
│                         ├──► quotation_snapshots (version_id FK) [R/O] │
│                         │         └── is_contractual: bool              │
│                         │                                               │
│                         └──► quotation_conversions (version_id UNIQUE)  │
│                                   └── project_id FK ──► projects        │
│                                                              │           │
│                                             source_quotation_version_id │
│                                             (nullable — compatibilidad) │
└─────────────────────────────────────────────────────────────────────────┘

Motor compartido (sin cambios):
calculate_consolidated_resources([{master_task_id, quantity}], org_id, cost_date)
         ▲                              ▲
         │                              │
get_budget_for_calculator(project_id)   get_quotation_for_calculator(version_id)
(existente)                             (nueva RPC)
```

---

## 23. Plan de PRs

| PR | Título | Contenido | Prerequisito | Rama sugerida |
|---|---|---|---|---|
| **PR A** | fix: corregir 29 errores de typecheck | Resolver errores en billingService, usePlan, BudgetEditor, etc. | — | `fix/typecheck-errors` |
| **PR B** | feat: tipos TypeScript para cotizaciones | Interfaces `Quotation`, `QuotationVersion`, `QuotationItem`, `QuotationSnapshot`, `QuotationConversion` en `types.ts` | PR A | `feat/quotation-types` |
| **PR C** | feat: migraciones de schema de cotizaciones | Migración `059_quotations_schema.sql`: tablas, índices, RLS, constraints | — | `feat/quotation-schema` |
| **PR D** | feat: servicios de cotización | `quotationsService.ts`, `quotationVersionsService.ts`, `quotationItemsService.ts` | PR B + PR C | `feat/quotation-services` |
| **PR E** | feat: RPCs de cálculo y snapshot de cotización | `get_quotation_for_calculator`, `snapshot_quotation_costs` | PR C | `feat/quotation-rpcs` |
| **PR F** | feat: RPC de conversión (transaccional + idempotente) | `convert_quotation_to_project` — SECURITY DEFINER, validación de membresía/rol, advisory lock, UNIQUE | PR C + PR D + PR E | `feat/quotation-conversion-rpc` |
| **PR G** | feat: UI de lista y editor de cotizaciones | `QuotationList`, `QuotationDetail`, `QuotationVersionEditor` — bajo feature flag | PR D + PR E | `feat/quotation-ui` |
| **PR H** | feat: UI de emisión, aprobación y rechazo | Modales con `await` + feedback explícito — no fire-and-forget | PR G | `feat/quotation-lifecycle-ui` |
| **PR I** | feat: UI de conversión a proyecto | `ConvertToProjectModal` — solo owner/admin | PR F + PR H | `feat/quotation-to-project-ui` |
| **PR J** | feat: exports de cotización (cliente e interno) | Plantillas PDF/Excel separadas para cliente e interno | PR G | `feat/quotation-exports` |
| **PR K** | feat: audit log para cotizaciones | Eventos APPROVE y CONVERT en audit_log | PR F + PR H | `feat/quotation-audit` |
| **PR L** | test: E2E del flujo completo de cotización | Draft → Emitir → Aprobar → Convertir → Verificar proyecto | PR I | `test/quotation-e2e` |

**Secuencia mínima para un primer end-to-end funcional:** PR A → PR C → PR B → PR D + PR E (paralelo) → PR F → PR G → PR H → PR I.

---

## Validación pendiente contra Supabase real

Este documento describe la arquitectura objetivo basada en el código del repositorio. Antes de diseñar las migraciones definitivas, ejecutar `supabase/diagnostics/quotation_to_project_audit.sql` en el proyecto Supabase de producción y verificar:

1. `budget_items.project_id` es `NOT NULL` en producción (query #7)
2. No existen tablas `quotation*` previas (query #8)
3. Los volúmenes de datos son los esperados (query #9)
4. La función `calculate_consolidated_resources` tiene `GRANT EXECUTE TO authenticated` (query #15)
5. El historial de migraciones aplicadas en producción coincide con los archivos del repo

**No asumir que repo y producción coinciden hasta recibir esos resultados.**
