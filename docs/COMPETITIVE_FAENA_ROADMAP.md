# Análisis Competitivo FAENA → Roadmap Técnico Obraflow
**Fecha:** 2026-05-31  
**Propósito:** Traducir los hallazgos del análisis de FAENA a decisiones técnicas accionables para Obraflow.  
**Alcance:** Solo decisiones y documentación. Sin implementación.

---

## 1. PERFIL DE FAENA

FAENA es un software de gestión de obras con perfil constructivo-operativo. Sus fortalezas observadas:

| Módulo FAENA | Descripción |
|---|---|
| Plan de obra tipo Excel | Grilla editable de actividades con cronograma integrado |
| Gantt + dependencias | Diagrama Gantt con vínculos FS/SS/FF entre tareas |
| Jerarquía de tareas | Partida → Subpartida → Tarea → Subtarea (4 niveles) |
| Recálculo explícito | El usuario dispara el recálculo; no es automático |
| Matrices de estado | Tablas con estados (Pendiente / En ejecución / Completado) |
| Matriz referida reutilizable | Plantilla de análisis que se vincula a múltiples ítems |
| Informe diario | Registro de avance diario por partida |
| Informes semanales/mensuales | Resúmenes periódicos con comparativo avance/plan |
| Compras: Req → Orden → Bodega | Ciclo completo de aprovisionamiento |
| RBAC por módulo y acción | Control de acceso granular: quién puede hacer qué en cada módulo |
| Perfiles de empresa | Estudio / Constructora / Desarrollador — onboarding diferenciado |

---

## 2. DIFERENCIADORES DE OBRAFLOW

Obraflow NO compite en la capa operativa (ejecución, bodega, diario de obra). Compite en la capa de **ingeniería de costos** — un segmento que FAENA cubre superficialmente.

| Dimensión | FAENA | Obraflow |
|---|---|---|
| **APU canónico** | Entrada manual sin contrato matemático | Contrato matemático explícito: materiales + MO + equipos + rendimiento |
| **Catálogo de insumos** | Lista plana sin jerarquía de fuentes | Catálogo Global → Catálogo de Empresa → APU (trazabilidad por origen) |
| **Conversión de unidades** | No documentada | `conversion_factor` en todas las tablas de insumos (kg/barra, m²/m³, etc.) |
| **Explosión de insumos** | Básica o ausente | RPC `calculate_consolidated_resources` v3 con consolidación por PATH A y B |
| **Base de precios** | Precio ingresado manualmente | Precio con fuente: global / importado / editado localmente (badges de trazabilidad) |
| **Metadata técnica** | Ausente | `technical_yield`, `technical_yield_unit`, `technical_notes` por material |
| **Calculadora Chandías** | Ausente | Motor paramétrico de cómputo de materiales integrado |
| **Multitenancy SaaS** | Instalación/licencia | Cloud-native, organización como tenant, RLS por `organization_id` |

**Conclusión:** El diferenciador de Obraflow es la **precisión matemática del modelo de costos**. FAENA maneja mejor la ejecución; Obraflow debe ganar en la estimación y presupuestación.

---

## 3. ANÁLISIS DE BRECHAS

### 3.1 Lo que FAENA tiene y Obraflow debería eventualmente tener

| Feature FAENA | Prioridad para Obraflow | Justificación |
|---|---|---|
| Estados workflow APU (borrador/aprobado/publicado) | **P1** | Necesario para que el APU sea "reutilizable" de forma segura |
| Recálculo explícito con botón | **P1** | Obraflow ya lo tiene implícitamente; documentar el contrato de cuándo se recalcula |
| Jerarquía de rubros (4 niveles) | **P2** | Actual: Rubro → APU. Ampliar a Capítulo → Rubro → APU → Ítem si el cliente lo pide |
| Informe diario de avance | **P3** | Capa operativa; fuera del scope de ingeniería de costos |
| Ciclo de compras (Req→Orden→Bodega) | **P3** | Módulo independiente; alta complejidad; no en beta |
| RBAC granular por módulo | **P2** | Actual: owner/admin/editor/viewer por org. FAENA tiene permisos por módulo |
| Perfiles de empresa diferenciados | **P2** | Onboarding diferente para Estudio vs Constructora vs Desarrollador |
| Gantt con dependencias | **P3** | Capa de planificación; requiere módulo dedicado |

### 3.2 Lo que FAENA NO tiene y Obraflow sí debe profundizar

| Feature Obraflow | Por qué es ventaja | Acción recomendada |
|---|---|---|
| Contrato matemático APU | Trazabilidad completa materiales + MO + rendimiento | Formalizar en spec P0 |
| Catálogo Global con metadata técnica | Fuente de verdad mantenida por experto | Completar campos técnicos en GlobalMaterialsAdmin |
| Explosión de insumos automática | Resultado directo del APU; no requiere ingreso manual | Estabilizar RPC v3; agregar filtros |
| Badges de trazabilidad (origen del precio) | Auditabilidad; el arquitecto sabe de dónde viene cada precio | Documentar y extender a APU |
| Calculadora Chandías paramétrica | Diferenciador único en el mercado local | Completar sincronización viva con presupuesto |

---

## 4. ROADMAP PRIORIZADO

### P0 — Contrato Matemático del APU (ahora)

**Objetivo:** El APU de mampostería 18 cm debe ser matemáticamente correcto y verificable con un test E2E.

| Tarea | Descripción | Archivo(s) |
|---|---|---|
| P0.1 — Contrato de rendimiento | `dailyYield` debe ser la fuente única de costo de MO por unidad. Fórmula: `costo_MO = (tarifa_horaria × MASTER_WORKDAY_HOURS × labor_yield) / dailyYield`. Documentar en spec. | `MasterTasksPanel.tsx`, `calculationService.ts` |
| P0.2 — Rubro correcto | El APU de mampostería debe clasificarse bajo el rubro canónico (ej: "4. Mampostería"). El test E2E debe verificar que el rubro está asignado. | `MasterTasksPanel.tsx` |
| P0.3 — Assert matemático E2E | Step 06 del golden path debe verificar: subtotal del APU = Σ(material.qty × material.unitPrice) + costo_MO calculado. No solo `> $0`. | `tests/e2e/beta-golden-path.spec.ts` |
| P0.4 — Hardening test | RUN_ID único por corrida, unit fill incondicional, `test.describe.configure({ mode: 'serial' })`. | tests/e2e/ |

**Criterios de cierre P0:**
- APU mampostería 18 cm con 3 materiales + MO tiene subtotal calculado correctamente
- El precio del APU coincide con el cálculo manual en ±1%
- E2E 12/12 passing con assert matemático en step 07

### P1 — APU Reutilizable y Sincronización Explícita

**Objetivo:** El APU creado en una obra puede reutilizarse en otra. El flujo "Mis Insumos → APU → Presupuesto" es explícito, auditable y sin costo-$0 silencioso.

| Tarea | Descripción | Dependencia |
|---|---|---|
| P1.1 — Estados APU | `status: 'draft' | 'approved' | 'published'`. Solo APUs `published` son importables al presupuesto. | Nueva migración (059 sugerido) |
| P1.2 — APU reutilizable entre orgs | Master admin puede "publicar" un APU global. Las orgs lo importan como plantilla. | P1.1 + GlobalTasksAdmin |
| P1.3 — Sincronización explícita | Botón "Sincronizar precios" en BudgetEditor que recalcula todos los items usando precios actuales del catálogo. Con banner de confirmación y comparativo antes/después. | ERPContext (discutir antes) |
| P1.4 — Persistencia de cómputos | Migración 040 (`project_computations`). Cuando se retome Sincronización Viva. | No bloquea P1.1/P1.2 |

**ADR P1-01: Estados de APU**
- **Decisión:** Agregar columna `status` a `master_tasks`.
- **Opciones:** (a) enum en DB (`draft|approved|published`), (b) columna boolean `is_published`.
- **Recomendación:** Enum en DB — más expresivo y extensible. La UI puede filtrar por estado sin cambiar el schema.
- **Riesgo:** Todas las APUs existentes pasan a `draft` por default. Los imports al presupuesto deben ser actualizados para filtrar `status = 'published'` antes de mostrar en el selector.
- **Impacto en archivos:** `master_tasks` schema, `MasterTasksPanel.tsx`, `masterTasksSupabaseService.ts`, `types.ts`.

**ADR P1-02: Sincronización explícita vs automática**
- **Decisión:** La sincronización de precios es SIEMPRE explícita (botón del usuario), nunca automática.
- **Justificación:** En presupuestación de obras, cambiar un precio de forma silenciosa puede generar versiones incorrectas de un contrato. El usuario debe saber cuándo cambian los precios del presupuesto.
- **Impacto:** El botón "Sincronizar precios" debe mostrar un diff antes de aplicar.

### P2 — Capa Organizacional y RBAC Extendido

**Objetivo:** Soportar perfiles de empresa diferenciados y control de acceso granular.

| Tarea | Descripción |
|---|---|
| P2.1 — Perfil de empresa | `organization_profile: 'estudio' | 'constructora' | 'desarrolladora'`. Onboarding y UI diferenciados. |
| P2.2 — RBAC por módulo | Extender `organization_members.role` con permisos por módulo (solo lectura en Presupuesto, sin acceso a Catálogo, etc.). |
| P2.3 — Jerarquía de rubros | Capítulo → Rubro → APU → Ítem. Actualmente: Rubro → APU. Requiere schema change en `budget_items`. |
| P2.4 — Plantillas por perfil | El ProjectWizard sugiere plantillas de APU y rubros según `organization_profile`. |

**Nota P2:** No implementar hasta que P0 y P1 estén cerrados y validados con usuarios reales.

### P3 — Capa Operativa (documentar, no implementar)

**Objetivo:** Preparar el terreno conceptual para cuando Obraflow expanda a operaciones.

| Módulo | Descripción | Dependencias previas |
|---|---|---|
| P3.1 — Cronograma / Gantt | Diagrama de barras por APU/rubro con dependencias. Requiere `task_schedule` table. | P2.3 (jerarquía rubros) |
| P3.2 — Avance diario | Registro de avance por partida. Campo `advance_pct` por `budget_item`. | P1.3 (sync explícita) |
| P3.3 — Ciclo de compras | `purchase_requests → purchase_orders → warehouse_entries`. Módulo independiente. | P2.2 (RBAC) |
| P3.4 — Informes periódicos | Informe semanal/mensual con curva S. Requiere snapshots temporales. | P3.1 + P3.2 |
| P3.5 — Informe diario de obra | Registro fotográfico + notas + avance. | P3.2 |

**Decisión:** P3 no se diseña como schema hasta que existan usuarios Constructora/Desarrolladora activos. El riesgo de diseñar P3 ahora es implementar abstracciones que no matcheen el flujo real de obra.

---

## 5. QUÉ COPIAR DE FAENA

| Feature | Cómo adaptarlo a Obraflow |
|---|---|
| Recálculo explícito con feedback | Botón "Recalcular" en BudgetEditor que muestra diff antes/después (P1.3) |
| Estados de ítem (Pendiente/En ejecución/Completado) | Aplica a APUs en P1.1, no a ítems del presupuesto |
| Matriz referida reutilizable | Análogo a APU global publicado (P1.2) — ya en la arquitectura de Obraflow |
| Perfiles de empresa | Onboarding diferenciado en P2.1 |
| Jerarquía de tareas (4 niveles) | Simplificar a 3: Capítulo → Rubro → APU. No 4 niveles por ahora. |

---

## 6. QUÉ NO IMPLEMENTAR TODAVÍA

| Feature FAENA | Razón para no implementar |
|---|---|
| Gantt con dependencias | Alta complejidad. No es el diferenciador de Obraflow. Hacerlo bien requiere un módulo dedicado con librerías de scheduling. |
| Ciclo de compras (Req→Orden→Bodega) | Módulo operativo independiente. Fuera del alcance de ingeniería de costos. |
| Informe diario de avance | Requiere definir primero el modelo de avance (P3.2). Primero completar P1. |
| Informes semanales/mensuales automáticos | Requiere snapshots temporales (migración adicional). Backlog P3.4. |
| RBAC granular por acción | Complejidad de UI alta. Cubrir con roles de org (owner/admin/editor/viewer) hasta P2.2. |

---

## 7. ADRS RECOMENDADOS (sin implementar)

### ADR-001: APU como contrato inmutable
**Contexto:** Cuando un APU se "usa" en un presupuesto, sus precios deben quedar congelados al momento de uso.  
**Decisión pendiente:** ¿El presupuesto guarda snapshot de precios (congelado) o referencia viva al APU (dinámico)?  
**Recomendación:** Snapshot al momento de importar. Los `task_yields` y `budget_items` actuales ya actúan como snapshot implícito. Documentar esto en código.  
**Impacto futuro:** Si se implementa sincronización viva (migración 040), el contrato cambia a "referencia viva con diff explícito".

### ADR-002: Rendimiento como parámetro configurado, no derivado
**Contexto:** `dailyYield` en `master_tasks` es el rendimiento diario del equipo. Es un dato de ingeniería, no calculado por el sistema.  
**Decisión:** El rendimiento lo ingresa el profesional. El sistema solo usa `dailyYield` como divisor en el costo de MO.  
**Impacto:** Nunca inferir ni modificar `dailyYield` automáticamente. Si el usuario quiere variantes, debe crear APUs separados.

### ADR-003: Catálogo Global como fuente de verdad, no como plantilla
**Contexto:** El catálogo global (`organization_id IS NULL`) es mantenido por el master_admin de Obraflow.  
**Decisión:** Las orgs importan desde el catálogo global pero no lo modifican. Sus cambios locales quedan marcados con `local_override = true`.  
**Impacto:** En ningún caso el catálogo global se actualiza con datos de una org. El flujo es siempre descendente: Global → Empresa.

### ADR-004: Sincronización de precios es siempre opt-in
**Contexto:** Los precios del catálogo global pueden actualizarse (nuevos valores de referencia del mercado).  
**Decisión:** Las actualizaciones del global NUNCA se propagan automáticamente al catálogo de empresa. El usuario elige "sincronizar" manualmente.  
**Excepción:** Si `local_override = false` y el usuario no modificó el precio, una futura función de "sync masivo" podría actualizar sin confirmación. Pero esto es P2, no ahora.

### ADR-005: E2E como especificación ejecutable del contrato matemático
**Contexto:** El test E2E golden path es el único lugar donde se verifica el comportamiento de extremo a extremo.  
**Decisión:** Los steps 06 y 07 del E2E deben incluir asserts matemáticos, no solo "subtotal > 0".  
**Impacto:** Antes de cada release, si el E2E falla en step 07, hay un bug de costo. No es solo un test de navegación.

---

## 8. DEPENDENCIAS ENTRE MÓDULOS

```
Catálogo Global (master_admin)
    │
    ▼  importFromGlobal()
Catálogo de Empresa (MasterMaterialsPanel)
    │
    ├──▶ APU (MasterTasksPanel)
    │        │  useUnifiedMaterials()
    │        ▼
    │    Costo unitario del APU
    │        │  import to project
    │        ▼
    │    Presupuesto (BudgetEditor / BudgetGrid)
    │        │
    │        ▼
    │    Explosión de Insumos (RPC v3)
    │        │
    │        ▼
    │    Lista de Materiales (Dashboard)
    │
    └──▶ Calculadora Chandías (ChandiasCalculator)
             │  buildComputationImportPayloads()
             ▼
         Presupuesto (BudgetEditor)  ←── mismo destino
```

### Dependencias de P0 a P3

```
P0 (APU canónico)
  └─ requiere: catálogo de empresa con precios reales
  └─ bloquea: nada (es base de todo lo demás)

P1 (APU reutilizable + sync)
  └─ requiere: P0 cerrado (APU matemáticamente correcto)
  └─ bloquea: P2.4 (plantillas por perfil dependen de APUs publicados)

P2 (RBAC + perfiles + jerarquía)
  └─ requiere: P1 cerrado (APUs con estados)
  └─ bloquea: P3 (operaciones requieren perfiles de empresa definidos)

P3 (capa operativa)
  └─ requiere: P2 cerrado + usuarios Constructora/Desarrolladora activos
  └─ bloquea: nada (extensión natural, no prerequisito de nada en la hoja de ruta actual)
```

---

## 9. RESUMEN EJECUTIVO

**¿Qué tiene FAENA que Obraflow no?**  
La capa operativa: Gantt, avance diario, ciclo de compras, informes periódicos. También tiene perfiles de empresa diferenciados y RBAC granular.

**¿Qué tiene Obraflow que FAENA no?**  
El contrato matemático del APU: trazabilidad del precio por origen (Global/Importado/Editado localmente), conversión de unidades incorporada, calculadora paramétrica Chandías, explosión de insumos con RPC consolidada, catálogo global administrado como fuente de verdad.

**¿Cuál es la jugada estratégica?**  
Ganar primero en el segmento de estudios de arquitectura (presupuestación) antes de entrar en el segmento constructora (operaciones). FAENA sirve a constructoras; Obraflow puede servir a estudios que todavía usan Excel para presupuestar.

**¿Cuál es el próximo paso técnico?**  
Completar P0: formalizar el contrato matemático del APU canónico de mampostería y verificarlo con el test E2E (assert matemático, no solo navegación). Una vez P0 está cerrado y validado con usuarios reales, P1 fluye naturalmente.

---

*Generado: 2026-05-31 — basado en análisis de FAENA, docs/HANDOFF_CURRENT.md y docs/beta-closing-audit.md*
