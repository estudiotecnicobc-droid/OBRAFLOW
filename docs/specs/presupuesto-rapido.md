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

## Base maestra por rubro (migración 062)
- `062_base_maestra_obraflow_rubros.sql` (idempotente) carga en el "Catálogo ObraFlow" los APU de las 40 planillas de `docs/Rubros`:
  - 489 APU (366 nuevos y 123 actualizados de la 061), cada uno con su rubro oficial en `category`, "Qué incluye", alcance y rendimiento;
  - 442 recursos; los gremios por cuenta propia tienen 0 % de cargas sociales y la mano de obra UOCRA, 95 %.
- El asistente suma la sección "Por rubro": 41 plantillas (`rubroTemplates.ts`, generadas desde las planillas) que se pueden combinar. Cada rubro trae todas sus tareas con las opciones de la planilla (tipo de piso, pintura, mesada…) y las cantidades de la vivienda de referencia de 70 m².
- Al crear un oficio que falta, el asistente usa las cargas sociales del recurso del catálogo (0 % para gremios).

## Rubros del presupuesto
- La lista base son los rubros 01 a 38 y 90 a 95, sin "Mampostería" ni "Revoques" sueltos.
- Las categorías de APU que no son rubros (Mampostería, Pinturas, Morteros, Obra gruesa, Instalaciones…) se muestran en su rubro oficial (`src/features/budgets/rubroMap.ts`). Las que agrupan varios rubros se ubican por el nombre de la tarea. El editor ya no crea rubros nuevos con esas categorías y quita los que se habían agregado.

## Fuera de alcance
- Actualización periódica de precios del catálogo.
- Plantillas del sistema editables por el usuario.
- La plantilla de baño.
