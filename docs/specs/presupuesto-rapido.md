# Presupuesto rápido y Catálogo ObraFlow

## Objetivo
Que un usuario nuevo arme un presupuesto en minutos a partir de plantillas del sistema, sin cargar APU a mano.

## Alcance
- 10 plantillas del sistema (`src/features/quickBudget/templates.ts`, generadas desde las planillas Excel de `docs/`): cocina, muro, pintura, cambio de piso, terraza, placa de yeso, frente y medianera (Ley 6116), vereda, instalación eléctrica y ampliación de dormitorio.
- Cada plantilla define medidas editables (número, sí/no u opción), valores calculados y tareas con cantidad e inclusión calculadas. El motor (`engine.ts`) reproduce exactamente las fórmulas de las planillas (test `engine.test.ts`).
- Asistente `components/QuickBudgetWizard.tsx` en la pestaña Presupuesto (botón "Presupuesto rápido" y primera opción con el presupuesto vacío). Tiene 4 pasos: plantilla, medidas, revisión de tareas con "Qué incluye" y confirmación.
- Cada tarea se resuelve en este orden:
  1. APU de la empresa, por código o por nombre.
  2. APU del catálogo general: se copia a la empresa con `clone_master_task_to_org`.
  3. Sin APU: se agrega la tarea con la cantidad y precio a completar.
- La mano de obra de los APU copiados se vincula por nombre de oficio. Si la empresa no lo tiene, se crea con el valor hora de referencia y 95 % de cargas sociales.
- Migración `061_catalogo_obraflow_presupuesto_rapido.sql` (idempotente) crea el catálogo general "Catálogo ObraFlow":
  - 153 recursos y 204 APU con códigos `OF-…`;
  - mano de obra UOCRA Zona A de octubre 2026;
  - precios de referencia AMBA de octubre 2026, con la fuente en `resources.pricing_notes`.

## Fuera de alcance
- Actualización periódica de precios del catálogo.
- Plantillas del sistema editables por el usuario.
- La plantilla de baño.
