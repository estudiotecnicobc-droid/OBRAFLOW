# 05 — Decision Log: Cotización → Proyecto

**Rama:** `audit/quotation-to-project-compatibility`  
**Fecha:** 2026-07-11  
**Responsable final:** Arq. Gonzalo  
**Formato:** ID · Estado · Contexto · Decisión · Alternativas · Consecuencias · Evidencia · Fecha

---

## Convención de estados

| Estado | Significado |
|---|---|
| **aprobada** | Decisión tomada y aceptada — no revisar salvo nueva información crítica |
| **propuesta** | Propuesta por la auditoría, pendiente confirmación de Gonzalo |
| **pendiente** | Pregunta abierta sin respuesta suficiente para decidir |

---

## Decisiones aprobadas

---

### D-01 — UX unificada bajo "Mis Obras"

**Estado:** aprobada  
**Contexto:** La alternativa era una sección "Cotizaciones" completamente separada de Proyectos, con su propia navegación. Eso fragmenta el flujo de trabajo: un arquitecto maneja oportunidades comerciales y proyectos como parte del mismo ciclo de negocio.  
**Decisión:** Cotizaciones y Proyectos viven en la misma sección "Mis Obras" de la navegación. Son entidades distintas en la base de datos, pero el punto de entrada para el usuario es unificado.  
**Alternativas descartadas:** Sección "Cotizaciones" separada en la barra lateral; módulo completamente independiente.  
**Consecuencias:** `ProjectHub` deberá evolucionar a un hub de dos entidades. La navegación por proyecto activo del `ERPContext` coexiste con la selección de cotización activa (contexto separado).  
**Evidencia:** Decisión de producto — no documentada en código.  
**Responsable:** Arq. Gonzalo  
**Fecha:** 2026-07-11

---

### D-02 — Cotización y Proyecto son entidades separadas

**Estado:** aprobada  
**Contexto:** La auditoría evaluó tres opciones: (A) `quotation_id` opcional en estructuras actuales, (B) tablas separadas con copia al convertir, (C) entidad genérica `economic_document`. La opción A requería hacer `budget_items.project_id` nullable (migración destructiva). La opción C era un refactor arquitectural con riesgo inaceptable previo a la beta.  
**Decisión:** Opción B — tablas separadas (`quotations`, `quotation_versions`, `quotation_items`, `quotation_snapshots`, `quotation_conversions`). Las tablas existentes no se modifican.  
**Alternativas descartadas:** Opción A (project_id nullable — riesgo de migración en datos de producción); Opción C (refactor total — prematuro).  
**Consecuencias:** Nuevo dominio completo. Motor de cálculo reutilizado sin cambios. Proyectos existentes no afectados. Mayor superficie de código a mantener que la Opción A, menor que la Opción C.  
**Evidencia:** `01_REPO_COMPATIBILITY_AUDIT.md §D — Opciones de arquitectura`; hechos verificados en `services/budgetItemsService.ts:73-80` y migración 018.  
**Responsable:** Arq. Gonzalo  
**Fecha:** 2026-07-11

---

### D-03 — No hacer `budget_items.project_id` nullable

**Estado:** aprobada  
**Contexto:** `budget_items.project_id` es FK NOT NULL con ON DELETE CASCADE. Hacerlo nullable requeriría una migración en la tabla más crítica del dominio económico, con backfill y actualización de todas las RPCs y servicios que filtran por ese campo.  
**Decisión:** No se modifica `budget_items`. Las cotizaciones usan `quotation_items` como tabla separada.  
**Alternativas descartadas:** Hacer `project_id` nullable con constraint `CHECK (project_id IS NOT NULL OR quotation_id IS NOT NULL)`.  
**Consecuencias:** Duplicación de la entidad de ítem. `quotation_items` tiene estructura similar pero más delgada (sin campos de planificación). La lógica de cálculo es idéntica — mismo motor.  
**Evidencia:** Verificado en `services/budgetItemsService.ts` y migración 018 (`budget_items.project_id NOT NULL REFERENCES projects ON DELETE CASCADE`).  
**Responsable:** Arq. Gonzalo  
**Fecha:** 2026-07-11

---

### D-04 — Reutilizar `calculate_consolidated_resources` sin cambios

**Estado:** aprobada  
**Contexto:** El motor de cálculo (`calculate_consolidated_resources`) recibe `[{master_task_id, quantity}]` como parámetro, sin referencia a `project_id`. Es agnóstico al origen de los datos.  
**Decisión:** No duplicar ni modificar el motor. Agregar una RPC `get_quotation_for_calculator(version_id)` que extraiga los ítems de `quotation_items` en el mismo formato que `get_budget_for_calculator` usa para `budget_items`. Llamar al mismo motor.  
**Alternativas descartadas:** Motor separado para cotizaciones; inline del cálculo en la RPC de conversión.  
**Consecuencias:** El cálculo de cotizaciones y proyectos produce resultados comparables. Cambios futuros al motor aplican a ambos. Hay que mantener `get_quotation_for_calculator` sincronizado con cambios de formato en `quotation_items`.  
**Evidencia:** Verificado en `supabase/migrations/015_consolidated_calculator_rpc.sql` y `045_consolidated_rpc_v2.sql`. La firma del motor usa `p_items jsonb` sin FK a ninguna entidad.  
**Responsable:** Arq. Gonzalo  
**Fecha:** 2026-07-11

---

### D-05 — Borrador editable; versión congelada al Emitir

**Estado:** aprobada  
**Contexto:** Necesitamos que el usuario pueda iterar libremente en una cotización antes de enviarla al cliente, pero que una vez enviada, el documento sea estable.  
**Decisión:** Solo versiones en estado `draft` son editables. Al emitir (`draft → sent`), los precios se congelan en `quotation_items.unit_cost_snapshot` y `unit_price_snapshot`, y se crea un `quotation_snapshot`. Después de emitir, editar = crear nueva versión.  
**Alternativas descartadas:** Congelar al aprobar (deja un gap entre "enviado" y "aprobado" donde el total enviado puede diferir del "real"); nunca congelar (imposible rastrear qué se cotizó).  
**Consecuencias:** El usuario que quiera ajustar después de emitir debe crear v2. Esto puede ser percibido como fricción. La ventaja es trazabilidad clara del documento enviado.  
**Evidencia:** Patrón análogo a `budget_cost_snapshots` (migración 018). Verificado en `04_SECURITY_AND_RLS_REVIEW.md R8`.  
**Responsable:** Arq. Gonzalo  
**Fecha:** 2026-07-11

---

### D-06 — Snapshot inmutable al Emitir

**Estado:** aprobada  
**Contexto:** La auditoría de seguridad identificó que snapshots mutables son una vulnerabilidad contractual (R7). El mismo principio ya existe en `budget_cost_snapshots` (migración 018).  
**Decisión:** `quotation_snapshots` es una tabla insert-only. Sin policy UPDATE ni DELETE para `authenticated`. El snapshot se crea al emitir y no puede modificarse. Una nueva emisión crea un nuevo snapshot en la tabla siguiente de versiones.  
**Alternativas descartadas:** Snapshots actualizables (mutan la historia); un solo campo JSONB por versión (no permite historial de cálculos dentro de la misma versión).  
**Consecuencias:** La tabla crece con cada cálculo. El borrado físico de snapshots solo es posible via `service_role` fuera del frontend (operación de administración). El snapshot de la versión aprobada tiene el flag `is_contractual = true`.  
**Evidencia:** `04_SECURITY_AND_RLS_REVIEW.md R7`; patrón de `budget_cost_snapshots` en migración 018.  
**Responsable:** Arq. Gonzalo  
**Fecha:** 2026-07-11

---

### D-07 — Aprobar una versión ya emitida

**Estado:** aprobada  
**Contexto:** El flujo es cotización → versión enviada al cliente → el cliente acepta → versión aprobada internamente. La aprobación marca la versión como aceptada y habilita la conversión.  
**Decisión:** La aprobación (`sent → approved`) es una transición de estado separada del envío. No se puede aprobar un borrador directamente (debe enviarse primero). Al aprobar: el snapshot de la versión se marca `is_contractual = true`, cualquier versión anterior en `approved` pasa a `superseded`.  
**Alternativas descartadas:** Aprobar directamente desde draft (pierde el registro del "documento enviado"); aprobar automáticamente al emitir (colapsa dos eventos en uno, pierdes la distinción cliente-aceptó/enviamos).  
**Consecuencias:** El flujo mínimo para convertir es: crear draft → emitir → aprobar → convertir. Cuatro pasos. Es posible simplificar en UI combinando "Emitir + Aprobar" pero la distinción existe en la base de datos.  
**Evidencia:** `02_DOMAIN_AND_DATA_REVIEW.md §2.1` (máquina de estados).  
**Responsable:** Arq. Gonzalo  
**Fecha:** 2026-07-11

---

### D-08 — La conversión es una relación/evento, no el estado contractual principal

**Estado:** aprobada  
**Contexto:** La conversión podría haberse modelado como el estado final de la cotización ("convertida"). Pero el estado contractual ya está capturado en el snapshot aprobado. La conversión es una acción administrativa que crea el proyecto de trabajo.  
**Decisión:** La conversión se registra en `quotation_conversions` (tabla separada) como un evento inmutable. El estado de la versión queda en `approved` (no cambia a "convertida"). El campo `projects.source_quotation_version_id` permite trazabilidad inversa.  
**Alternativas descartadas:** Estado `converted` en `quotation_versions`; columna `project_id` directamente en `quotation_versions`.  
**Consecuencias:** Un proyecto puede existir sin cotización. Una cotización aprobada puede existir sin proyecto (si el dueño decide no convertirla todavía). La relación muchos-a-muchos queda imposible por el UNIQUE en `quotation_conversions.quotation_version_id` (una versión → un proyecto).  
**Evidencia:** `02_DOMAIN_AND_DATA_REVIEW.md §1.5`.  
**Responsable:** Arq. Gonzalo  
**Fecha:** 2026-07-11

---

### D-09 — Conversión transaccional e idempotente

**Estado:** aprobada  
**Contexto:** La auditoría de seguridad identificó doble conversión (R4) y estado inconsistente ante error parcial (R25) como riesgos altos.  
**Decisión:** La RPC `convert_quotation_to_project` ejecuta en una única transacción de base de datos. Si falla cualquier paso, todo hace rollback. La idempotencia se garantiza con el UNIQUE sobre `quotation_conversions.quotation_version_id`: si la versión ya fue convertida, la RPC devuelve el proyecto existente con `{created: false, project_id: "..."}` en lugar de fallar con error.  
**Alternativas descartadas:** Conversión en pasos separados desde el frontend (riesgo de estado intermedio visible); sin idempotencia (el retry duplica el proyecto).  
**Consecuencias:** El frontend puede reintentar la conversión de forma segura. La UI muestra el mismo resultado tanto en el primer intento como en retries.  
**Evidencia:** `04_SECURITY_AND_RLS_REVIEW.md R4, R17, R25`; patrón de `clone_master_task_to_org` (migración 002) — usa `pg_advisory_xact_lock` e idempotencia.  
**Responsable:** Arq. Gonzalo  
**Fecha:** 2026-07-11

---

### D-10 — Snapshot aprobado como fuente contractual original

**Estado:** aprobada  
**Contexto:** Hay dos opciones para la fuente de verdad del acuerdo: (A) el proyecto referencia directamente el snapshot aprobado, (B) el proyecto genera una copia materializada adicional de los datos de la cotización.  
**Decisión:** El snapshot aprobado (`quotation_snapshots` con `is_contractual = true`) es la fuente contractual. El proyecto referencia ese snapshot a través de `source_quotation_version_id`. No se crea una copia materializada separada a menos que los reportes lo requieran técnicamente. Ver D-10b (pendiente) para la decisión de copia materializada.  
**Alternativas:** Ver sección de pendientes, D-10b.  
**Consecuencias:** El snapshot contractual nunca se borra ni modifica. Si el proyecto es borrado, el snapshot y la cotización sobreviven (FK RESTRICT, no CASCADE). El "presupuesto contractual" en la UI del proyecto es una lectura del snapshot, no datos editables.  
**Evidencia:** `01_REPO_COMPATIBILITY_AUDIT.md §C.7`; `04_SECURITY_AND_RLS_REVIEW.md R7`.  
**Responsable:** Arq. Gonzalo  
**Fecha:** 2026-07-11

---

### D-11 — Presupuesto operativo inicializado desde la versión aprobada

**Estado:** aprobada  
**Contexto:** Al convertir, el proyecto necesita un presupuesto de trabajo editable. Los `budget_items` del proyecto son ese presupuesto operativo.  
**Decisión:** La conversión copia los ítems de `quotation_items` a `tasks` + `budget_items` del proyecto. El presupuesto operativo nace igual al contractual. Luego puede divergir (precios actualizados, alcance ajustado) sin modificar el contractual.  
**Alternativas descartadas:** Presupuesto operativo = presupuesto contractual (sin distinción — imposible rastrear cambios de alcance).  
**Consecuencias:** Desde el primer día, el proyecto tiene un presupuesto base real. La divergencia entre contractual y operativo es seguimiento de gestión.  
**Evidencia:** `02_DOMAIN_AND_DATA_REVIEW.md §7`.  
**Responsable:** Arq. Gonzalo  
**Fecha:** 2026-07-11

---

### D-12 — Proyectos directos sin cotización siguen siendo válidos

**Estado:** aprobada  
**Contexto:** Si se obligara a crear una cotización antes de todo proyecto, se rompería el flujo existente de todos los usuarios actuales y se agregan pasos innecesarios para proyectos internos sin oferta comercial.  
**Decisión:** `projects.source_quotation_version_id` es nullable. El `ProjectWizard` existente sigue funcionando sin cambios. Las cotizaciones son una ruta opcional, no obligatoria.  
**Alternativas descartadas:** Forzar cotización como prerequisito de todo proyecto.  
**Consecuencias:** La base de datos tiene proyectos con y sin origen en cotización. Los reportes deben manejar ambos casos. La columna `source_quotation_version_id` es NULL para todos los proyectos existentes — retrocompatibilidad total.  
**Evidencia:** `01_REPO_COMPATIBILITY_AUDIT.md §C.9`.  
**Responsable:** Arq. Gonzalo  
**Fecha:** 2026-07-11

---

### D-13 — Sin portal de cliente, adjuntos, firma, adendas ni billing en el MVP

**Estado:** aprobada  
**Contexto:** Estas funcionalidades son deseables pero cada una representa un bloque de complejidad independiente. El portal de cliente requiere autenticación externa. Los adjuntos requieren Supabase Storage con políticas de bucket privado (R14 — riesgo bloqueante). La firma requiere integración con terceros. El billing está en migraciones 038/039 pendientes. Las adendas requieren versionado contractual adicional.  
**Decisión:** El MVP de cotizaciones cubre: crear, editar, versionar, emitir, aprobar, exportar (PDF/Excel) y convertir. El cliente recibe el documento por fuera de la app (email). Sin ninguna de las funcionalidades listadas en el alcance inicial.  
**Alternativas descartadas:** Incluir adjuntos en MVP (R14 no está resuelto); portal de cliente (superficie de ataque nueva sin precedente en el repo).  
**Consecuencias:** El flujo de cotización del MVP es completo para el caso más común (profesional emite cotización, cliente acepta por canales externos, profesional registra la aprobación). Las funcionalidades excluidas pueden agregarse en sprints posteriores sin cambiar el modelo core.  
**Evidencia:** `04_SECURITY_AND_RLS_REVIEW.md §3.5 (recomendación de alcance para primera beta)`.  
**Responsable:** Arq. Gonzalo  
**Fecha:** 2026-07-11

---

### D-14 — Solo owner/admin pueden convertir

**Estado:** aprobada  
**Contexto:** La conversión crea entidades de proyecto, que es una operación de alto impacto (afecta el alcance de trabajo, el presupuesto, la planificación). Permitir que un editor convierta sin supervisión puede generar proyectos no autorizados.  
**Decisión:** La RPC `convert_quotation_to_project` valida internamente que `auth.uid()` tenga rol `owner` o `admin` en la organización. La UI oculta el botón "Convertir" a roles menores. La RPC hace la validación server-side (no solo la UI).  
**Alternativas descartadas:** Permitir que editor convierta (aumenta el riesgo de proyectos no autorizados); requerir doble aprobación (sobrecomplejo para el MVP).  
**Consecuencias:** El editor puede crear y aprobar cotizaciones pero no puede disparar la creación del proyecto. Hay que asegurarse de que el admin sepa que debe completar la conversión después de que el editor aprueba.  
**Evidencia:** `04_SECURITY_AND_RLS_REVIEW.md §2.3 y §3.3`; `03_UX_FLOW_REVIEW.md §2.8`.  
**Responsable:** Arq. Gonzalo  
**Fecha:** 2026-07-11

---

### D-15 — El cliente no accede a costo, margen ni tarifas

**Estado:** aprobada  
**Contexto:** Hoy RLS SELECT = `is_org_member(org)` sin discriminar rol. Un viewer (que puede ser el cliente si se le da acceso) puede leer `projects.ggd_pct` y todas las tarifas de labor. En cotizaciones, exponer costo interno o margen al cliente destruye la posición de negociación.  
**Decisión:** Las vistas y documentos del cliente nunca incluyen costo unitario, desglose de APU, business_config, ni tarifas de mano de obra. Hay dos plantillas de exportación: interna (con todo) y cliente (solo descripción comercial, cantidad, precio de venta, total). En la UI, viewer/client solo accede a una vista proyectada sin costo. La restricción vive en RLS (no solo en la UI).  
**Alternativas descartadas:** Dejar la separación solo en la UI (bypaseable con acceso directo a la API).  
**Consecuencias:** Se necesita definir políticas RLS específicas por rol (no solo `is_org_member`) para las tablas de cotizaciones, o bien una vista `quotation_client_view` sin columnas de costo. Esto va más allá del patrón actual donde la UI hace todo el filtrado.  
**Evidencia:** `04_SECURITY_AND_RLS_REVIEW.md R2, R9, R10, §2.3`.  
**Responsable:** Arq. Gonzalo  
**Fecha:** 2026-07-11

---

### D-16 — Actualización de precios siempre explícita

**Estado:** aprobada  
**Contexto:** Si los precios del catálogo cambian después de que una cotización fue emitida y el sistema recalculara automáticamente, el total enviado al cliente cambiaría sin que nadie lo decidiera. Esto genera disputa comercial.  
**Decisión:** Los precios de versiones no-`draft` son inmutables. Una cotización `sent` o `approved` siempre muestra el total que fue enviado/aprobado. Para actualizar precios, el usuario debe crear explícitamente una nueva versión (nueva cotización v2). No hay recálculo automático.  
**Alternativas descartadas:** Recálculo automático al abrir (rompe trazabilidad); recálculo silencioso en background (el usuario nunca se entera del cambio).  
**Consecuencias:** El "staleness" de precios en cotizaciones draft puede detectarse con el mismo patrón de `BudgetStalenessAlert` pero la actualización requiere acción explícita del usuario: clonar versión + recalcular.  
**Evidencia:** `04_SECURITY_AND_RLS_REVIEW.md R8`; patrón existente de `get_budget_cost_staleness` (migración 018).  
**Responsable:** Arq. Gonzalo  
**Fecha:** 2026-07-11

---

## Decisiones pendientes

---

### D-17 — ¿Permitir ítems libres sin APU?

**Estado:** pendiente  
**Contexto:** En el modelo actual, cada `budget_item` necesita un `task.master_task_id` para participar del motor de cálculo. Un ítem sin APU no tiene costo calculado. En cotizaciones, puede haber ítems que no tienen APU en el catálogo (trabajos especiales, gastos, servicios externos).  
**Pregunta:** ¿Se permite `quotation_items.master_task_id = NULL` con costo ingresado manualmente (`unit_cost_snapshot` manual)?  
**Opciones:**
- A: Solo ítems con APU (obliga a crear el APU antes — más consistente, más fricción)
- B: Ítems libres con costo manual permitidos (más flexible, más difícil de auditar)
- C: Ítems libres en una categoría separada "Gastos adicionales" con costo global
**Consecuencia de la decisión:** Impacta el diseño del formulario de agregar ítem, la validación del snapshot y el motor de cálculo.

---

### D-18 — ¿Cuál es la profundidad de la jerarquía WBS?

**Estado:** pendiente  
**Contexto:** El modelo actual de `budget_items` es una lista plana agrupada por `task.category` en la UI. Para cotizaciones formales puede necesitarse una estructura de capítulos / subcapítulos / ítems (WBS de 2 o 3 niveles).  
**Pregunta:** ¿`quotation_items` puede tener `parent_id` para sub-ítems, o sigue siendo plana con agrupación por `category`?  
**Opciones:**
- A: Lista plana con `category` como agrupador (igual al modelo actual — menor trabajo)
- B: Jerarquía de 2 niveles (capítulo → ítem) con `parent_id`
- C: WBS completa con N niveles (mayor complejidad, postergable)
**Consecuencia:** Impacta el schema, el motor de render en el editor, y los reportes.

---

### D-19 — ¿Editor puede aprobar o solo owner/admin?

**Estado:** pendiente  
**Contexto:** D-14 establece que solo owner/admin puede convertir. Pero la aprobación (confirmar que el cliente aceptó) puede ser una acción que el editor también deba poder realizar si es quien gestiona la relación con el cliente.  
**Pregunta:** ¿`sent → approved` es permitida para editor o solo para owner/admin?  
**Opciones:**
- A: Solo owner/admin aprueba (consistente con el peso de la decisión — es el contrato)
- B: Editor puede aprobar pero no convertir (separa "confirmar acuerdo" de "crear proyecto")
**Evidencia pendiente:** Entender cómo trabaja Gonzalo en la práctica — ¿él mismo aprueba o delega?

---

### D-20 — Referencia contractual: directa o copia materializada

**Estado:** pendiente  
**Contexto:** D-10 decide que el snapshot aprobado es la fuente contractual. Pero los reportes del proyecto (Desglose de Presupuesto, Explosión de Insumos) hoy requieren `project_id` para funcionar. Si el "presupuesto contractual" vive en `quotation_snapshots` (referenciado desde el proyecto), los reportes necesitan adaptarse para aceptar el ID de snapshot además de `project_id`.  
**Pregunta:** ¿Se adaptan los reportes para leer desde `quotation_snapshots` (referencia directa), o se genera una copia materializada del snapshot en una tabla del proyecto?  
**Opciones:**
- A: Referencia directa — los reportes se adaptan para aceptar `quotation_version_id` como fuente alternativa (más limpio, menos duplicación)
- B: Copia materializada — al convertir, se crea una fila en `budget_cost_snapshots` con `project_id` copiando el resultado del snapshot aprobado (retrocompatibilidad total con reportes actuales)
- C: Híbrido — referencia para mostrar, copia para cálculos diferidos
**Consecuencia:** Impacta el PR de reportes y la complejidad de la RPC de conversión.

---

### D-21 — ¿Moneda única o multimoneda en cotizaciones?

**Estado:** pendiente  
**Contexto:** `quotations.currency` está definida como campo de la cotización, pero el motor de cálculo no maneja conversión de monedas. En Argentina es común cotizar en USD y ejecutar en ARS, o tener ítems en ambas monedas.  
**Pregunta:** ¿El MVP soporta solo una moneda por cotización (ARS o USD), o ya se diseña con conversión?  
**Opciones:**
- A: Una sola moneda por cotización (MVP — igual que hoy en proyectos)
- B: Moneda base + tipo de cambio aplicado al calcular (mayor complejidad)
**Recomendación provisional:** una sola moneda por cotización en el MVP, campo preparado para multimoneda futura.

---

## Restricciones de seguridad que condicionan todas las decisiones anteriores

Las siguientes restricciones son no negociables y se aplican a toda implementación de las decisiones de este log:

| ID | Restricción | Fuente |
|---|---|---|
| SEC-01 | Ninguna RPC `SECURITY DEFINER` toma `organization_id` como parámetro sin validarlo internamente contra `auth.uid()` | `04_SECURITY_AND_RLS_REVIEW.md` §0.3, R3, R21 |
| SEC-02 | Todas las tablas de cotizaciones tienen `ENABLE ROW LEVEL SECURITY` y `organization_id NOT NULL` | R1, R23 |
| SEC-03 | `quotation_snapshots` y `quotation_conversions` no tienen policy `UPDATE` ni `DELETE` para `authenticated` | R7, D-06 |
| SEC-04 | Aprobación, emisión y conversión usan `await` + confirmación visible, no fire-and-forget | R19 |
| SEC-05 | `service_role` nunca en frontend ni en el bundle de Vite | R20 |
| SEC-06 | Viewer/client no puede leer costo, margen, business_config ni tarifas de MO | R2, R9, R10, D-15 |
| SEC-07 | La conversión es idempotente y transaccional — un solo proyecto por versión | R4, R25, D-09 |
| SEC-08 | `ON DELETE CASCADE` no se aplica sobre snapshots ni sobre `quotation_conversions` | R24, D-10 |
