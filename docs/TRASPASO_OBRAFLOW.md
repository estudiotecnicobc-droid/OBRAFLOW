# Traspaso ObraFlow · actualizado 25/10/2026

> **Leer primero en cada conversación nueva.** Reemplaza a los traspasos anteriores
> (`TRASPASO_SESION_2026-10-20.md`, `HANDOFF_CURRENT.md` y la copia local del 16/10).
> Se actualiza al cerrar cada sesión.

## 0. Cómo arrancar una conversación nueva (claude.ai, sin Claude Code ni Vercel)

Gonzalo pega o adjunta este archivo y dice qué quiere hacer. Claude:

1. **Agrega el repo a la sesión** con `add_repo` (owner `estudiotecnicobc-droid`, repo `OBRAFLOW`,
   acceso `push`) y lo clona: `git clone --depth 1 https://github.com/estudiotecnicobc-droid/obraflow`.
2. **GitHub:** el CLI `gh` funciona solo por REST, porque GraphQL está bloqueado. Ver los comandos en
   `.claude/commands/05-release-manager.md`.
3. **Publicar:** merge a `main` → Vercel despliega solo → `obraflow.net` y `www` se actualizan solos.
   No usar `vercel alias` ni deploy manual.
4. **Probar en la plataforma:** navegador integrado de la app de escritorio, con la vista previa del PR
   o `obraflow.net`. **Gonzalo inicia sesión:** Claude no ingresa contraseñas.
5. **Build y tests:** `npm ci`, `npx tsc --noEmit`, `npx vitest run`, `npx vite build` en el clon
   de la nube (la VM de la PC de Gonzalo no llega a npm).

**Forma de trabajo:**
- Gonzalo pide, Claude propone un plan corto y espera "dale".
- Rama + PR → link de vista previa → Gonzalo prueba y da "ok" → merge → verificación en obraflow.net.
- Sin migraciones ni SQL destructivo sin su "dale".
- No tocar `ERPContext.tsx` sin discutirlo.
- Una conversación por tema.

## 1. Qué está en producción (obraflow.net, `main` al 25/10)

- **Gantt Etapa B** (#17 a #20):
  - Gantt como panel al lado de la tabla;
  - color por Estado / Partida / Ruta crítica;
  - etiqueta "Nd · X%" y tramo real oscuro con el resto claro;
  - cursor de fecha, Ir a HOY;
  - modo lectura con botón Editar;
  - columna Estado.
- **Gantt Etapa C1, aspecto tipo Brikel** (#22):
  - cabecera de 4 tarjetas (Inicio, Fin, Duración en hábiles · corridos, anillo de avance físico);
  - barra de herramientas en 2 filas;
  - Colapsar todo;
  - capas Avance real y Dependencias;
  - plan base como barra punteada;
  - banda "Plan vs Real" (`services/planVsReal.ts`, 6 tests);
  - partida con color y %, y leyenda.
  - Correcciones incluidas: filas alineadas con las barras y conteo real de días hábiles.
- **Abierto sin mergear:** #21, test E2E del golden path (cantidades persistidas y subtotal =
  unitario × 45). Hay que correrlo contra el usuario QA antes de mergear.

## 2. Dónde se guarda cada dato de Planificación

| Dato | Dónde |
|---|---|
| Dependencias | `projects.dependencies` (JSON, Supabase) |
| Avance, frentes, cómputo, inicio y duración manual | `budget_items` (Supabase) |
| Partida | `tasks.category` (Supabase) |
| Días hábiles y feriados | `projects.working_days` y `projects.non_working_dates` (Supabase) |
| Ruta crítica, fechas, duración, Plan vs Real | Se calculan; no se guardan |
| **Plan base (línea base)** | **Solo `localStorage` del navegador** (`erp_snapshots`). ⚠️ Falta pasarlo a Supabase. |

## 3. Proyecto de prueba "Vivienda unifamiliar 70 m² (PRUEBA)" · planificación completa

- **Red de precedencias:**
  - 84 vínculos FC sin desfasaje;
  - todas las tareas tienen predecesora y sucesora, salvo el arranque (35 Estudio de suelos) y
    el cierre (59 Limpieza final);
  - sin ciclos.
- **Feriados cargados:** 23/11, 7/12, 8/12 y 25/12/2026; 1/1, 8/2, 9/2, 24/3, 26/3 y 2/4/2027.
  Días laborables de lunes a viernes.
- **Ajustes aplicados el 25/10:**
  - relleno (27) y tosca (31) de 150 y 195 m³ a 21 m³ cada uno (70 m² × 0,30 m, criterio a confirmar);
  - nivelación (9) con 3 frentes (lote de 10 × 50 = 500 m²);
  - avance de prueba de Bases, Zanjas y Viga de fundación a 0%.
- **Resultado:** obra del 16/10/2026 al 29/3/2027, 24 semanas, 108 días hábiles y 165 corridos.

## 4. Errores conocidos (anotar en el informe y priorizar)

1. **Cambiar la predecesora desde la columna "Precedencia" de la tabla no borra la anterior.**
   `handleSetPredecessor` llama a `removeDependency` y `addDependency` en el mismo render, con
   estado viejo, y deja vínculos duplicados. Para cambiar una predecesora, primero poner
   "-- Inicio --" y después la nueva. Mejor todavía: usar la ficha → Relaciones. Arreglo
   sugerido: una sola actualización con la lista final.
2. **Dependencias como JSON en `projects`:** cada cambio reescribe la lista entera, y dos ediciones
   simultáneas se pisan. A futuro conviene una tabla `project_dependencies`.
3. **Mano de obra y materiales incompletos:**
   - 47 de 73 tareas sin ningún material (casi todas las "(PRUEBA)", y además 9, 10, 11, 15, 17, 18 y 22);
   - el Obrador tiene la cuadrilla cargada pero 0 horas-hombre por unidad;
   - morteros que figuran como "MOR-001" o "MOR-002" en vez de su nombre;
   - completarlos toca el análisis de la empresa, así que se decide con Gonzalo, tarea por tarea.
4. **Rubros duplicados:** "04 FUNDACIONES" y "Fundaciones", "08 REVOQUES" y "Revoques", etc.
5. **"Configurar proyecto"** (encabezado del Dashboard) abre el selector de proyectos, no la
   configuración. La configuración está en el menú lateral, en "Configuración" → Calendario.
6. **Pendientes del 16/10, siguen vigentes:**
   - limpiar el catálogo global `master_tasks` y revisar sus permisos (RLS);
   - BUG-1 a BUG-48 de `docs/PRUEBA_PRESUPUESTO_MURO_2026-10-11.md` (archivo local).

## 5. Próximos pasos propuestos

| # | Tema | Estado |
|---|---|---|
| 1 | **Plan base en Supabase:** tabla `project_baselines` con las fechas congeladas por tarea (migración) | Propuesto, falta "dale" |
| 2 | **C2:** panel de edición al hacer clic en la tarea (inicio, duración, fin, desfasaje, predecesora, avance) + arreglo del error 1 | Pendiente |
| 3 | **C3:** días hábiles, tolerancia % y feriados dentro del cronograma (la tolerancia pide migración) | Pendiente |
| 4 | **C4:** hitos con fila propia y tipo (Colado, Compra, Entrega, Inspección, Pago, Otro) (migración) | Pendiente |
| 5 | **C5:** arrastrar barras, opción C (solo mover). El motor ya admite `manualDuration` para la opción B. | Pendiente |
| 6 | Mano de obra y materiales faltantes (error 3) | Decidir con Gonzalo |
| 7 | Menú o barra de "Vercel" visible: probablemente la barra de herramientas de Vercel, que solo ven los miembros del equipo. Confirmar. | Postergado por Gonzalo |
| 8 | #21: correr el E2E con QA y mergear | Pendiente |

## 6. Referencias

- Relevamiento de Brikel (local, no versionado):
  - `docs/research/brikel/recorrido-brikel-2026-10-18.md`;
  - `docs/research/brikel/cronograma-brikel-2026-10-25.md`.
- Specs y QA de C1: `docs/specs/gantt-etapa-c1-aspecto.md`, `docs/qa/gantt-etapa-c1-aspecto.md`.
- Publicación: `.claude/commands/05-release-manager.md`.
