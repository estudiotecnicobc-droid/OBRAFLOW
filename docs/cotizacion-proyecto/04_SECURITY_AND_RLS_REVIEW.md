# 04 — Revisión de Seguridad, Privacidad y RLS: Cotización → Proyecto

**Fecha:** 2026-07-11
**Auditor:** Seguridad / Privacidad / RLS / Confiabilidad (revisión de diseño)
**Alcance:** Diseño propuesto del flujo `Cotización → versiones → aprobación → conversión → Proyecto`
**Estado del feature:** No implementado. Rama `audit/quotation-to-project-compatibility` a la par de `main` (0 commits). No existen tablas `quotation*`, ni RPC de conversión, ni UI. **Esta es una revisión de diseño previa a implementar.**

> **Regla de la revisión:** No se implementa nada. No se asume que las políticas RLS existentes son correctas. No se recomienda exponer `service_role` en el frontend. No se recomienda saltar RLS.

---

## 0. Modelo asumido bajo revisión

El diseño no está escrito, así que fijo un **modelo mínimo concreto** para poder atar la revisión de RLS a algo verificable. Si el diseño real difiere, los hallazgos deben remapearse.

### 0.1 Tablas propuestas

```
quotations                 -- cabecera de la cotización (una por "oportunidad")
  id, organization_id (uuid, NOT NULL), project_target_id (uuid nullable),
  client_name, client_contact (jsonb), status, created_by, created_at

quotation_versions         -- cada versión editable/aprobable
  id, quotation_id (FK), organization_id (uuid, NOT NULL, denormalizado),
  version_no (int), status ('draft'|'sent'|'approved'|'rejected'|'superseded'),
  business_config (jsonb: ggd/ggi/profit/tax),  -- MARGEN
  approved_by, approved_at, created_by, created_at

quotation_line_items       -- ítems de la versión (hija)
  id, quotation_version_id (FK), master_task_id (uuid nullable),
  quantity, unit_cost_snapshot, unit_price_snapshot, ...   -- COSTO INTERNO

quotation_snapshots        -- foto inmutable al aprobar/enviar (precios congelados)
  id, quotation_version_id (FK), organization_id, frozen_payload (jsonb),
  computed_at, created_by

quotation_attachments      -- adjuntos (planos, PDF cliente)
  id, quotation_id (FK), organization_id, storage_path, mime, size, created_by

quotation_conversions      -- registro de conversión → proyecto (idempotencia)
  id, quotation_version_id (FK, UNIQUE), project_id (FK), organization_id,
  converted_by, converted_at
```

### 0.2 RPC propuesta

`convert_quotation_to_project(p_version_id uuid) RETURNS jsonb` — `SECURITY DEFINER`, que crea el `project` + `budget_items` a partir de una versión **approved**, de forma idempotente.

### 0.3 Hechos del sistema actual que condicionan el diseño (confirmados por código)

- **RLS SELECT = cualquier miembro.** En `007_rls_policies.sql`, las policies `*_select` usan `is_org_member(organization_id)`, que **no discrimina rol**. Un `viewer` (rol de app `client`) puede `SELECT` sobre `projects`, `budget_items`, `tasks`, etc. vía la anon key. La UI oculta el menú "Presupuesto" al rol client (`Layout.tsx` navItems) pero **RLS no lo oculta** — el aislamiento por rol hoy vive solo en la UI.
- **`projects` ya carga el margen.** `projectsService` mapea `ggd_pct, ggi_pct, profit_pct, tax_pct` (BusinessConfig). Cualquier miembro, incluido `viewer`, puede leerlos.
- **Patrón bueno existente:** `clone_master_task_to_org` (migración 002) — `SECURITY DEFINER` + `SET search_path=public` + valida `auth.uid()` + valida membresía + valida rol + `pg_advisory_xact_lock` para idempotencia. **Este es el molde que debe seguir la RPC de conversión.**
- **Antipatrón existente (SEC-01):** varias RPCs `SECURITY DEFINER` (`apply_commercial_rules`, `repair_master_task_material_prices`, `resync_org_material_prices`, seeds) reciben `p_org_id` como **parámetro** y **no validan** que `auth.uid()` sea miembro de esa org, con `GRANT EXECUTE ... TO authenticated`. **La RPC de conversión NO debe copiar este patrón.**
- **Snapshot inmutable existente:** `budget_cost_snapshots` (migración 018) — insert-only, `created_by = auth.uid()`. Molde válido para `quotation_snapshots`.
- **Escrituras optimistas fire-and-forget:** `ERPContext.tsx` hace `service.write(...).catch(console.error)` en ~30 sitios. Un fallo de RLS/red no se ve.
- **Storage aún no se usa:** `DocumentManager` guarda con `URL.createObjectURL` en memoria/localStorage. Los adjuntos de cotización serían el **primer uso real de Supabase Storage** → sus policies son terreno nuevo.
- **Roles:** owner/admin → `admin` · editor → `project_manager` · viewer → `client` · sin membresía → `worker`.

---

## 1. Análisis de los 25 riesgos

Convención — **Prob**: Baja/Media/Alta · **Sev**: 🔴 Crítica / 🟠 Alta / 🟡 Media / ⚪ Baja · **Gate**: condición objetiva que debe cumplirse antes de exponer el feature en beta.

---

### R1 — Fuga de cotizaciones entre organizaciones
- **Escenario:** Un usuario de la org A hace `SELECT` sobre `quotation_versions` de la org B por ID, o una tabla hija (`quotation_line_items`) queda sin RLS y filtra por JOIN.
- **Impacto:** Fuga de precios, márgenes y clientes de un competidor-tenant. Es el peor caso de un SaaS multiempresa.
- **Prob:** Media (si se replica bien el patrón) / Alta (si se omite RLS en hijas). **Sev:** 🔴
- **Control preventivo:** `organization_id NOT NULL` en TODAS las tablas (incl. hijas, denormalizado); RLS `ENABLE` + policy SELECT `is_org_member(organization_id)` en cada tabla; hijas sin `organization_id` propio gatean por `EXISTS (JOIN al padre AND is_org_member(padre.organization_id))`.
- **Control detectivo:** Query de auditoría periódica: `SELECT tablename FROM pg_tables WHERE ... AND NOT rowsecurity` sobre el esquema `quotation*`; alerta si alguna aparece.
- **Test:** Usuario A intenta `select().eq('id', <version_de_B>)` → debe devolver 0 filas (no error).
- **Gate:** ✅ Obligatorio. 0 filas cruzadas en el set de pruebas RLS (§4).

### R2 — Acceso indebido de usuarios invitados
- **Escenario:** Un invitado con rol `viewer` (client) lee la cotización con costo interno y margen porque RLS SELECT no discrimina rol; o un invitado a *un proyecto* accede a *todas* las cotizaciones de la org.
- **Impacto:** Exposición de costo/margen al cliente final si el cliente es miembro viewer. Violación del "need to know".
- **Prob:** Alta (RLS SELECT hoy = cualquier miembro). **Sev:** 🔴
- **Control preventivo:** Definir explícitamente si `viewer/client` puede leer `quotation_line_items` y `business_config`. Recomendación: **NO**. Crear policy SELECT que excluya `viewer` de las columnas/tablas con costo y margen (o una vista `quotation_client_view` sin costo/margen y RLS que dé a viewer solo esa vista). No confiar en que la UI oculte el menú.
- **Control detectivo:** `audit_log` de cada lectura de cotización por rol viewer (si se decide permitirla).
- **Test:** Viewer de la org hace `select` sobre `quotation_line_items` → debe fallar/vacío; sobre la vista cliente → solo precio final, sin costo.
- **Gate:** ✅ Obligatorio. Definición escrita de qué ve el viewer + test que lo prueba.

### R3 — Conversión de cotizaciones ajenas
- **Escenario:** `convert_quotation_to_project(p_version_id)` de la org B ejecutada por un usuario de A, porque la RPC `SECURITY DEFINER` no valida membresía (antipatrón SEC-01).
- **Impacto:** Creación de un proyecto en B, o lectura de datos de B durante la conversión.
- **Prob:** Alta si se copia el patrón de `apply_commercial_rules`. **Sev:** 🔴
- **Control preventivo:** La RPC debe: (1) `auth.uid()` no nulo; (2) resolver `organization_id` **desde la versión**, no de un parámetro; (3) `is_org_member_with_role(org, ['owner','admin'])`; (4) `SET search_path=public`. Molde: `clone_master_task_to_org`.
- **Control detectivo:** `audit_log` INSERT en cada conversión con `actor_id`, `version_id`, `org_id`.
- **Test:** Usuario de A llama la RPC con `version_id` de B → `RAISE EXCEPTION`.
- **Gate:** ✅ Obligatorio. La RPC valida membresía+rol y hay test negativo cross-tenant.

### R4 — Doble conversión
- **Escenario:** Doble click / doble request convierte la misma versión dos veces → dos proyectos, o budget_items duplicados.
- **Impacto:** Datos inconsistentes, presupuestos duplicados, pérdida de confianza.
- **Prob:** Media. **Sev:** 🟠
- **Control preventivo:** `quotation_conversions.quotation_version_id UNIQUE` + `pg_advisory_xact_lock(hashtext(version_id))` dentro de la RPC + chequeo "ya convertida → devolver el proyecto existente" (idempotencia, como hace `clone_master_task_to_org`).
- **Control detectivo:** Constraint viola → error capturado + métrica de intentos de doble conversión.
- **Test:** Dos llamadas concurrentes a la RPC con el mismo `version_id` → un solo `project_id`, la segunda devuelve `created:false`.
- **Gate:** ✅ Obligatorio. Constraint UNIQUE + test de concurrencia.

### R5 — Modificación de una versión aprobada
- **Escenario:** Un editor cambia ítems/precios de una versión `approved` después de aprobada → el documento firmado deja de coincidir con lo aprobado.
- **Impacto:** Repudio: el cliente aprobó X, el sistema dice Y. Riesgo contractual.
- **Prob:** Media. **Sev:** 🔴
- **Control preventivo:** Inmutabilidad a nivel DB. Trigger `BEFORE UPDATE/DELETE` en `quotation_versions` y `quotation_line_items` que rechace si `status='approved'` (salvo transición controlada a `superseded`). Editar = crear **nueva versión**. WITH CHECK en la policy UPDATE que impida cambiar filas approved.
- **Control detectivo:** `audit_log` de cualquier UPDATE sobre versión approved; comparar snapshot vs versión.
- **Test:** Editor intenta `update` de una línea de versión approved → rechazado por trigger.
- **Gate:** ✅ Obligatorio. Trigger de inmutabilidad + test.

### R6 — Borrado accidental
- **Escenario:** DELETE de una cotización aprobada/convertida, o de una versión que respalda un proyecto.
- **Impacto:** Pérdida del respaldo del proyecto; el proyecto queda sin origen auditable.
- **Prob:** Media. **Sev:** 🟠
- **Control preventivo:** Soft-delete (`is_active=false` / `deleted_at`) en vez de DELETE físico; policy DELETE solo `owner/admin`; prohibir borrar versiones `approved` o con conversión asociada (FK `RESTRICT`).
- **Control detectivo:** `audit_log` de DELETE/soft-delete con actor.
- **Test:** Editor intenta borrar cotización approved → rechazado; owner soft-deletea → fila marcada, no desaparece.
- **Gate:** ✅ Obligatorio para versiones approved/convertidas.

### R7 — Pérdida de snapshots
- **Escenario:** Al aprobar/enviar no se congela el precio; o el snapshot se puede editar; o el snapshot cascadea al borrar la versión.
- **Impacto:** No se puede reconstruir "qué se cotizó y a qué precio en tal fecha".
- **Prob:** Media. **Sev:** 🟠
- **Control preventivo:** `quotation_snapshots` insert-only (sin policy UPDATE/DELETE para authenticated), `frozen_payload jsonb` con todo el detalle, `created_by`, `computed_at`. La aprobación **debe** generar el snapshot en la misma transacción. FK con `ON DELETE RESTRICT` respecto de la versión, o snapshot desacoplado que sobreviva al soft-delete.
- **Control detectivo:** Chequeo de invariante: toda versión `approved` tiene ≥1 snapshot.
- **Test:** Aprobar versión → existe snapshot; intentar UPDATE del snapshot → rechazado.
- **Gate:** ✅ Obligatorio. Snapshot inmutable creado en la aprobación.

### R8 — Actualización silenciosa de precios
- **Escenario:** La cotización referencia precios vivos del catálogo; el catálogo cambia y una cotización "enviada" muestra otro total al reabrirse. (ADR-004 del roadmap FAENA: sync siempre opt-in.)
- **Impacto:** El total mostrado ≠ total enviado al cliente. Disputa comercial.
- **Prob:** Alta si se usan precios vivos. **Sev:** 🟠
- **Control preventivo:** Congelar precios en `quotation_line_items` (snapshot al enviar/aprobar). El precio vivo solo aplica a `draft`. Recalcular es **explícito** (botón "actualizar precios" que crea nueva versión con diff visible), nunca automático.
- **Control detectivo:** Comparar `unit_price_snapshot` de la versión vs precio vivo actual; badge "precios congelados" (ya existe el patrón en reportes).
- **Test:** Enviar versión → cambiar precio de catálogo → reabrir versión → total idéntico al enviado.
- **Gate:** ✅ Obligatorio. Precios congelados en versiones no-draft.

### R9 — Exposición del costo interno al cliente
- **Escenario:** El PDF/Excel de cotización, o la vista del rol `client`, incluye `unit_cost` / costo interno además del precio de venta.
- **Impacto:** El cliente ve el costo y negocia contra el margen. Daño comercial directo.
- **Prob:** Alta (hoy no hay separación costo/precio en la capa de exportación). **Sev:** 🔴
- **Control preventivo:** Separar `cost` (interno) de `price` (cliente) en el modelo y en el generador de documentos. La plantilla "cliente" nunca incluye columnas de costo. Vista/policy que no exponga `unit_cost_snapshot` a `viewer`.
- **Control detectivo:** Test de contenido del export: el buffer del PDF/Excel cliente no contiene los valores de costo.
- **Test:** Generar PDF cliente de una cotización con costo conocido → asserts de que el costo NO aparece en el binario.
- **Gate:** ✅ Obligatorio. Export cliente probado sin costo.

### R10 — Exposición de utilidad, margen o salarios
- **Escenario:** `business_config` (ggd/ggi/profit/tax) o tarifas de mano de obra (`labor_categories.basic_hourly_rate`, cargas sociales) viajan al cliente en el documento o son legibles por `viewer`.
- **Impacto:** Fuga de estructura de costos, márgenes y remuneraciones. Sensible (datos salariales) y comercialmente crítico.
- **Prob:** Alta (projects.business_config ya es legible por cualquier miembro). **Sev:** 🔴
- **Control preventivo:** Marcar margen y tarifas MO como "solo owner/admin/editor". Nunca en la vista/documento cliente. Considerar que el desglose de MO por categoría con tarifa es **dato salarial** → mínimo privilegio estricto.
- **Control detectivo:** `audit_log` de accesos a `business_config`/tarifas; test de export.
- **Test:** Viewer hace `select business_config` → vacío; export cliente no contiene ni margen ni tarifas.
- **Gate:** ✅ Obligatorio. Margen y tarifas fuera de la vista/documento cliente.

### R11 — Datos personales del cliente
- **Escenario:** `quotation.client_contact` acumula más datos de los necesarios (DNI/CUIT, dirección, teléfono, email) sin base ni retención, y son legibles por toda la org.
- **Impacto:** Exposición de datos personales; incumplimiento de protección de datos (Ley 25.326 AR / GDPR si aplica).
- **Prob:** Media. **Sev:** 🟠
- **Control preventivo:** Minimización — ver §2.1 (datos mínimos). Solo lo necesario para emitir la cotización. Sin datos sensibles. Retención definida. Acceso restringido a roles que emiten (owner/admin/editor).
- **Control detectivo:** Inventario de campos PII documentado; `audit_log` de exportaciones con PII.
- **Test:** Revisión de esquema: ningún campo PII innecesario; viewer no lee `client_contact`.
- **Gate:** 🟠 Recomendable-Obligatorio. Lista de datos mínimos aprobada por Gonzalo antes de recolectar.

### R12 — Exportaciones PDF o Excel
- **Escenario:** El export corre client-side con todos los datos de la versión (costo, margen, MO) y se filtra el rol/plantilla incorrecta; o el archivo generado queda accesible por URL pública.
- **Impacto:** Combinación de R9+R10 materializada en un archivo que sale de la app.
- **Prob:** Alta. **Sev:** 🔴
- **Control preventivo:** Dos plantillas explícitas: **interna** (con costo/margen) y **cliente** (solo precio). El tipo de plantilla se decide server-side según el destino, no por un flag de UI. Si se genera server-side, no dejar el archivo en bucket público (ver R14).
- **Control detectivo:** Test de contenido por plantilla; revisión de que no hay `getPublicUrl` sobre exports.
- **Test:** Export interno vs cliente sobre la misma versión → el interno tiene costo, el cliente no; ambos coinciden en el precio final.
- **Gate:** ✅ Obligatorio. Dos plantillas separadas y probadas.

### R13 — Logs y auditoría
- **Escenario:** No queda registro de quién aprobó, envió, convirtió o exportó una cotización.
- **Impacto:** Sin trazabilidad ante disputa (¿quién aprobó este precio?). No repudio imposible de sostener.
- **Prob:** Alta (hoy `audit_log` solo cubre master_tasks/master_materials). **Sev:** 🟠
- **Control preventivo:** Extender `audit_log` (o triggers análogos a `audit_master_catalog`) a eventos de cotización: `APPROVE`, `SEND`, `CONVERT`, `EXPORT`, `DELETE`, `PRICE_UPDATE`. `actor_id=auth.uid()`, `before/after`. SELECT del log solo owner/admin (o master_admin).
- **Control detectivo:** El propio audit_log; alerta si una conversión no tiene evento de aprobación previo.
- **Test:** Aprobar+convertir → dos entradas en audit_log con actor correcto.
- **Gate:** 🟠 Recomendable. Al menos APPROVE y CONVERT auditados antes de beta.

### R14 — Archivos adjuntos
- **Escenario:** Adjuntos (planos, PDF firmado) en Supabase Storage con bucket público, sin RLS de storage, o con paths adivinables → acceso cross-tenant o público.
- **Impacto:** Fuga de documentos del cliente/obra. Primer uso de Storage = sin patrón previo probado.
- **Prob:** Alta (área nueva, sin precedente en el repo). **Sev:** 🔴
- **Control preventivo:** Bucket **privado**; policies de Storage por `organization_id` en el path (`{org_id}/{quotation_id}/...`) validadas contra `is_org_member`; servir vía **signed URLs** de expiración corta, nunca `getPublicUrl`; validar mime/size en subida; no confiar en el nombre de archivo.
- **Control detectivo:** Auditar que ningún bucket de cotizaciones es público; log de generación de signed URLs.
- **Test:** Usuario A pide signed URL de adjunto de B → denegado; acceso directo al path público → 403.
- **Gate:** ✅ Obligatorio si hay adjuntos en beta. Si no están listos, **posponer adjuntos**, no lanzarlos inseguros.

### R15 — Políticas de retención
- **Escenario:** Cotizaciones rechazadas/abandonadas con PII del cliente se guardan indefinidamente.
- **Impacto:** Acumulación de PII sin base; superficie de fuga creciente.
- **Prob:** Media. **Sev:** 🟡
- **Control preventivo:** Política de retención escrita (p. ej. purga/anonimización de cotizaciones `rejected` a los N meses; conservar solo las `converted` como respaldo de proyecto). Anonimizar `client_contact` al purgar.
- **Control detectivo:** Job de retención con reporte; conteo de cotizaciones más viejas que el umbral.
- **Test:** Simular cotización vencida → job la anonimiza/purga según política.
- **Gate:** ⚪ Puede esperar a post-beta **si** el volumen es bajo y la política está escrita (no ejecutada).

### R16 — Backups
- **Escenario:** Las nuevas tablas no entran en el plan de backup, o un restore no las contempla; snapshots perdidos en un incidente.
- **Impacto:** Pérdida irreversible del respaldo de cotizaciones aprobadas.
- **Prob:** Baja (Supabase respalda el esquema completo) / Media (sin restore probado). **Sev:** 🟡
- **Control preventivo:** Confirmar PITR/backup del proyecto Supabase incluye el esquema `quotation*`; documentar RPO/RTO.
- **Control detectivo:** Restore de prueba en staging que incluya una cotización aprobada.
- **Test:** Restaurar backup en staging → cotización approved + snapshot presentes.
- **Gate:** 🟠 Recomendable. Confirmar cobertura de backup antes de datos reales.

### R17 — Integridad entre cotización y proyecto
- **Escenario:** La conversión copia parcialmente (ítems sí, business_config no; o cantidades sin master_task_id) → el proyecto no refleja la cotización aprobada.
- **Impacto:** El proyecto factura distinto a lo cotizado. (Es el bug clase "costo-$0 silencioso" ya visto en la sync Chandías.)
- **Prob:** Media. **Sev:** 🟠
- **Control preventivo:** Conversión transaccional todo-o-nada (una transacción DB en la RPC); mapear explícitamente business_config + line items + cantidades; validar invariante `total_proyecto == total_snapshot ± ε` al cierre de la RPC.
- **Control detectivo:** Guardar `quotation_conversions.project_id` y comparar totales cotización vs proyecto; alerta si divergen.
- **Test:** Convertir cotización de total conocido → total del presupuesto del proyecto = total del snapshot (±1%).
- **Gate:** ✅ Obligatorio. Test de igualdad de totales cotización↔proyecto.

### R18 — Race conditions
- **Escenario:** Aprobar y editar en paralelo; o dos usuarios aprueban versiones distintas de la misma cotización a la vez; o convertir mientras se re-aprueba.
- **Impacto:** Dos versiones "approved" activas; snapshot inconsistente; doble proyecto.
- **Prob:** Media. **Sev:** 🟠
- **Control preventivo:** Transiciones de estado atómicas con `UPDATE ... WHERE status='sent'` (compare-and-set); constraint parcial `UNIQUE (quotation_id) WHERE status='approved'` para permitir una sola versión aprobada; advisory locks en aprobar/convertir.
- **Control detectivo:** Invariante: máximo una versión `approved` por cotización.
- **Test:** Dos aprobaciones concurrentes de versiones distintas → una gana, la otra falla.
- **Gate:** 🟠 Recomendable. Constraint de una sola versión approved + test.

### R19 — Operaciones optimistas que fallen en silencio
- **Escenario:** El frontend hace `quotationService.approve(...).catch(console.error)` (patrón actual de ERPContext). RLS rechaza, la UI muestra "aprobado", la DB no cambió.
- **Impacto:** El usuario cree que aprobó/convirtió y no ocurrió; el cliente recibe un estado falso.
- **Prob:** Alta (es el patrón dominante del código). **Sev:** 🟠
- **Control preventivo:** Para aprobación/conversión/envío **no usar** optimistic fire-and-forget: `await` + verificar respuesta + toast de error + revertir estado local si falla. Estas son operaciones críticas, no cosméticas.
- **Control detectivo:** Sentry/monitor de errores en estas RPCs; reconciliación estado UI vs DB.
- **Test:** Forzar rechazo RLS en approve → la UI muestra error y no marca aprobado.
- **Gate:** ✅ Obligatorio para approve/convert/send. Manejo de error explícito, no `.catch(console.error)`.

### R20 — Uso de service_role
- **Escenario:** Tentación de usar `service_role` para "resolver" la conversión cross-tabla saltando RLS, exponiéndola en frontend o en una Edge Function mal protegida.
- **Impacto:** Bypass total de RLS; una fuga de esa key compromete todos los tenants.
- **Prob:** Baja (si se sigue la guía) / catastrófica si ocurre. **Sev:** 🔴
- **Control preventivo:** **Nunca** `service_role` en el frontend ni en el bundle. La conversión corre como RPC `SECURITY DEFINER` con validación de membresía (que da los permisos necesarios sin exponer la key). Si hace falta backend, Edge Function con la key en secret server-side y verificación de JWT del caller.
- **Control detectivo:** Grep de bundle/env del frontend por `service_role`; el anon key es el único que llega al cliente.
- **Test:** Inspección del bundle de producción: no contiene `service_role`.
- **Gate:** ✅ Obligatorio. Cero `service_role` fuera del backend.

### R21 — RPCs SECURITY DEFINER
- **Escenario:** `convert_quotation_to_project` sin `SET search_path` (hijack) o sin validar membresía (SEC-01), corriendo con privilegios del owner de la función.
- **Impacto:** Escalamiento de privilegios / conversión cross-tenant.
- **Prob:** Media. **Sev:** 🔴
- **Control preventivo:** Toda RPC nueva: `SECURITY DEFINER` + `SET search_path = public` + primera línea valida `auth.uid()` + `is_org_member_with_role(org_derivada_de_la_fila, ['owner','admin'])`. Resolver `organization_id` **desde la versión**, no de parámetro. `REVOKE ALL ... FROM public; GRANT EXECUTE ... TO authenticated`.
- **Control detectivo:** Revisión de que toda función `SECURITY DEFINER` tenga `search_path` fijo (auditoría de esquema).
- **Test:** Test negativo cross-tenant (R3) + verificar `search_path` seteado.
- **Gate:** ✅ Obligatorio. Checklist de RPC segura firmado en el PR.

### R22 — Enumeración de IDs
- **Escenario:** IDs secuenciales o predecibles permiten iterar cotizaciones; aunque RLS bloquee, el patrón de errores/tiempos filtra existencia; o `version_no` secuencial revela volumen de negocio.
- **Impacto:** Enumeración/side-channel; inferencia de cuántas cotizaciones tiene un competidor-tenant.
- **Prob:** Baja (con UUID + RLS) / Media si se usan seriales expuestos. **Sev:** 🟡
- **Control preventivo:** `uuid` (gen_random_uuid) como PK expuesta; `version_no` secuencial solo **dentro** de la cotización, nunca global; respuestas uniformes (0 filas, no 404 vs 403 distinguibles).
- **Control detectivo:** Rate-limiting / alerta de muchos SELECT fallidos por RLS de un mismo actor.
- **Test:** Enumerar IDs ajenos → siempre 0 filas, sin diferencia observable entre "no existe" y "no autorizado".
- **Gate:** 🟡 Recomendable. UUIDs como identificador público.

### R23 — RLS en tablas hijas
- **Escenario:** `quotation_line_items`, `quotation_snapshots`, `quotation_attachments` sin `organization_id` propio y sin RLS, accesibles por JOIN o directamente.
- **Impacto:** Fuga de líneas (costo/precio) aunque la cabecera esté protegida. Es exactamente el vector de R1 en las hijas.
- **Prob:** Alta (error clásico). **Sev:** 🔴
- **Control preventivo:** Cada hija: o bien `organization_id` denormalizado + RLS propia, o RLS por `EXISTS (JOIN al padre AND is_org_member(padre.organization_id))` — patrón ya usado en `budget_template_items`, `master_task_materials`. **Ninguna** hija sin `ENABLE ROW LEVEL SECURITY`.
- **Control detectivo:** Auditoría `pg_tables.rowsecurity=false` sobre el esquema de cotizaciones.
- **Test:** Usuario A selecciona `quotation_line_items` de B por `quotation_version_id` → 0 filas.
- **Gate:** ✅ Obligatorio. RLS probada en cada tabla hija.

### R24 — Eliminación en cascada
- **Escenario:** `ON DELETE CASCADE` desde `quotations` borra versiones, snapshots y la conversión → un DELETE de cabecera destruye el respaldo de un proyecto convertido.
- **Impacto:** Pérdida silenciosa de snapshots y trazabilidad al borrar la cabecera.
- **Prob:** Media. **Sev:** 🟠
- **Control preventivo:** No cascadear desde entidades que respaldan un proyecto. `quotation_conversions.project_id` y `quotation_snapshots` con `ON DELETE RESTRICT`. Preferir soft-delete de cabecera (R6). El proyecto **no** debe depender por FK cascada de la cotización.
- **Control detectivo:** Revisión del grafo de FKs; invariante "proyecto convertido conserva su snapshot aunque la cotización se archive".
- **Test:** Soft-delete/archivar cotización convertida → snapshot y proyecto intactos.
- **Gate:** ✅ Obligatorio. Sin CASCADE destructivo sobre snapshots/conversión.

### R25 — Recuperación ante errores
- **Escenario:** La conversión falla a mitad (proyecto creado, budget_items no) y deja estado inconsistente sin rollback; o el retry crea duplicados.
- **Impacto:** Proyecto huérfano/parcial; el usuario no sabe si reintentar.
- **Prob:** Media. **Sev:** 🟠
- **Control preventivo:** Toda la conversión en **una** transacción (rollback automático si algo falla). Idempotencia (R4) hace seguro el retry. Mensaje de error accionable, no `console.error`.
- **Control detectivo:** Monitor de conversiones fallidas; reconciliación de proyectos sin budget_items originados en conversión.
- **Test:** Inyectar fallo a mitad de la RPC → rollback total, sin proyecto parcial; reintentar → éxito, sin duplicado.
- **Gate:** ✅ Obligatorio. Conversión transaccional + retry idempotente probados.

---

## 2. Revisión de datos y visibilidad

### 2.1 Datos mínimos necesarios del cliente
Suficiente para emitir y respaldar una cotización:
- **Nombre / razón social** (obligatorio).
- **Identificador fiscal** (CUIT/CUIL) — solo si la cotización es un documento fiscal; si no, **omitir**.
- **Un canal de contacto** (email **o** teléfono, no ambos por defecto).
- **Dirección de la obra** (si es necesaria para el alcance técnico).

### 2.2 Qué datos NO deberían incluirse
- Documento de identidad personal (DNI) del contacto salvo requisito fiscal explícito.
- Datos financieros del cliente (cuentas, tarjetas) — **nunca**.
- Notas libres con datos sensibles (salud, opiniones) — evitar campo de texto sin control.
- Cualquier PII que no se use para emitir/entregar la cotización (minimización).

### 2.3 Qué puede ver cada actor (visibilidad objetivo del diseño)

| Actor | Precio final | Costo interno | Margen (business_config) | Tarifas MO | PII cliente | Adjuntos | Aprobar | Convertir |
|---|---|---|---|---|---|---|---|---|
| **owner/admin** (`admin`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **editor** (`project_manager`) | ✅ | ✅ | ✅ | ✅ (según decisión) | ✅ | ✅ | ✅ | ❌ (solo admin) |
| **viewer** (`client`) | ✅ (vista cliente) | ❌ | ❌ | ❌ | limitado | según decisión | ❌ | ❌ |
| **worker** (sin membresía) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Cliente externo (no usuario)** | ✅ solo PDF/Excel plantilla cliente | ❌ | ❌ | ❌ | sus propios | los que se le envían | ❌ | ❌ |

> **Hallazgo central:** hoy RLS SELECT = `is_org_member` (cualquier rol). Para que esta matriz sea real hay que **restringir por rol en RLS**, no solo en la UI. Si no se puede, la alternativa es una **vista cliente** sin costo/margen y negar a `viewer` el SELECT sobre las tablas crudas.

### 2.4 Eventos que requieren `audit_log`
`APPROVE`, `REJECT`, `SEND`, `CONVERT`, `EXPORT` (interno/cliente), `PRICE_UPDATE`, `DELETE/ARCHIVE`, `ATTACHMENT_DOWNLOAD`. Cada uno con `actor_id`, `entity_id`, `before/after`, timestamp.

### 2.5 Qué debería eliminarse o anonimizarse
- Cotizaciones `rejected`/abandonadas: anonimizar `client_contact` tras el período de retención, conservando cifras agregadas si se quieren métricas.
- Al dar de baja una organización: purga/anonimización de todas sus cotizaciones y adjuntos.
- Nunca anonimizar snapshots de cotizaciones **convertidas** mientras el proyecto exista (respaldo legal).

---

## 3. Cierre

### 3.1 P0 de seguridad (bloqueantes — sin esto, no hay feature)
1. **RLS + `organization_id` NOT NULL en todas las tablas, incluidas hijas** (R1, R23). Ninguna tabla `quotation*` sin `ENABLE ROW LEVEL SECURITY`.
2. **RPC de conversión segura** — `SECURITY DEFINER` + `search_path` + valida `auth.uid()`+membresía+rol, org derivada de la fila, no de parámetro (R3, R21). Molde: `clone_master_task_to_org`; antimolde: SEC-01.
3. **Idempotencia + transaccionalidad de la conversión** — UNIQUE en `quotation_version_id`, advisory lock, todo-o-nada (R4, R17, R25).
4. **Inmutabilidad de versiones approved y snapshots** (R5, R7) vía trigger + tablas insert-only.
5. **Separación costo/precio y margen fuera de la vista/documento cliente** (R9, R10, R12).
6. **Cero `service_role` en frontend** (R20).
7. **Aprobación/conversión con manejo de error explícito**, no fire-and-forget (R19).

### 3.2 P1 de seguridad (antes de abrir la beta a usuarios reales)
1. Restricción por **rol** en RLS/vistas para que `viewer` no lea costo/margen (R2).
2. **Precios congelados** en versiones no-draft; recálculo explícito con diff (R8).
3. **Adjuntos** en bucket privado con signed URLs — o **posponer adjuntos** si no están listos (R14).
4. **audit_log** de al menos APPROVE y CONVERT (R13).
5. **Una sola versión approved** por cotización (constraint) (R18).
6. Sin **CASCADE destructivo** sobre snapshots/conversión; soft-delete de cabecera (R6, R24).
7. **Datos mínimos del cliente** aprobados y PII restringida (R11).

### 3.3 Matriz de roles (resumen accionable)

| Capacidad | owner/admin | editor | viewer/client | worker |
|---|:---:|:---:|:---:|:---:|
| Crear/editar cotización draft | ✅ | ✅ | ❌ | ❌ |
| Ver costo interno / margen / MO | ✅ | ✅ | ❌ | ❌ |
| Ver precio final (vista cliente) | ✅ | ✅ | ✅ | ❌ |
| Aprobar versión | ✅ | ✅ | ❌ | ❌ |
| Convertir a proyecto | ✅ | ❌ | ❌ | ❌ |
| Borrar/archivar cotización | ✅ | ❌ | ❌ | ❌ |
| Descargar adjuntos | ✅ | ✅ | según decisión | ❌ |
| Exportar plantilla interna (con costo) | ✅ | ✅ | ❌ | ❌ |
| Exportar plantilla cliente (sin costo) | ✅ | ✅ | ✅ | ❌ |

> `editor` puede aprobar pero **no** convertir (la conversión crea entidades de proyecto → solo admin). Decisión de Gonzalo si editor puede convertir.

### 3.4 Casos de prueba RLS (mínimo para el gate)
Con dos orgs de prueba (A, B) y un usuario por rol en A:

1. **Cross-tenant SELECT:** usuario A `select` cotización/versión/línea/snapshot/adjunto de B → **0 filas** en cada tabla.
2. **Cross-tenant CONVERT:** usuario A llama `convert_quotation_to_project(version_de_B)` → **excepción**.
3. **Viewer sin costo:** viewer de A `select` `quotation_line_items`/`business_config` → vacío; vista cliente → solo precio.
4. **Inmutabilidad:** editor `update` de línea de versión `approved` → rechazado por trigger.
5. **Doble conversión:** dos llamadas concurrentes con el mismo `version_id` → un solo proyecto, segunda `created:false`.
6. **Precio congelado:** enviar versión → cambiar catálogo → reabrir → total idéntico.
7. **Integridad:** total del proyecto convertido = total del snapshot (±1%).
8. **Snapshot inmutable:** `update`/`delete` de `quotation_snapshots` por authenticated → rechazado.
9. **Export cliente sin costo:** el binario del PDF/Excel cliente no contiene los valores de costo/margen.
10. **Adjunto cross-tenant:** A pide signed URL de adjunto de B → denegado; path público → 403.
11. **Optimista que falla:** forzar rechazo RLS en approve → UI muestra error, DB sin cambio.
12. **service_role:** el bundle de producción no contiene `service_role`.

### 3.5 Criterio de go / no-go para beta

**GO** solo si se cumplen **todos**:
- ✅ Los 7 P0 implementados y verificados.
- ✅ Casos RLS 1–8 y 11–12 en verde (los P0/estructurales).
- ✅ RPC de conversión revisada contra el checklist de RPC segura (R21) y con test negativo cross-tenant.
- ✅ Export cliente probado sin costo/margen (caso 9).
- ✅ Cero `service_role` fuera del backend.
- ✅ Manejo de error explícito en approve/convert/send.

**NO-GO** si cualquiera de estos está abierto:
- ❌ Alguna tabla `quotation*` sin RLS o sin `organization_id`.
- ❌ La RPC de conversión toma `org_id` de parámetro sin validar membresía (patrón SEC-01).
- ❌ Versiones approved editables o snapshots mutables.
- ❌ El documento/vista cliente puede incluir costo, margen o tarifas.
- ❌ Adjuntos en bucket público (si hay adjuntos en beta → posponerlos, no lanzarlos inseguros).

**Recomendación de alcance para la primera beta:** lanzar el flujo `Cotización → versión → aprobación → conversión` **sin adjuntos y sin login de cliente externo** (el cliente recibe PDF/Excel, no es usuario). Eso elimina R14 y buena parte de R2 de la ruta crítica, y deja el núcleo de aislamiento (R1/R3/R23) como el foco único a verificar.

---

## 4. Dependencia con hallazgos previos

Este feature **hereda** los P0 de la Auditoría de Seguridad general:
- **SEC-01 (RPCs cross-tenant)** debe estar cerrado **antes** de agregar la RPC de conversión, o se repite el patrón.
- **Cabeceras de seguridad** y **cero secretos en bundle** aplican también a las nuevas superficies (exports, signed URLs).
- El **manejo de error optimista** (H-04) es precondición de R19/R25.

No avanzar la implementación de cotizaciones antes de que la FASE 0 del Plan Maestro (aislamiento multiempresa + gate de build) esté cerrada.

---

*Revisión de diseño — no se implementó código, no se crearon migraciones, no se modificó RLS. Los nombres de tablas/RPC son el modelo asumido para anclar la revisión; ajustar si el diseño real difiere.*
