# Base Maestra de Costos y Rendimientos — Documento de Diseño

## 1. Contexto y Objetivo

### Problema actual
Cada proyecto maneja sus propios materiales, mano de obra y equipos desde cero. No hay una fuente centralizada de precios y rendimientos que se pueda reutilizar entre proyectos.

### Objetivo
Crear una **base maestra organizacional** separada de los datos de cada proyecto, que permita:
- Mantener un catálogo actualizado de materiales, mano de obra, equipos y tareas/APU
- Crear presupuestos nuevos importando ítems desde la base maestra
- Actualizar precios centralmente sin afectar presupuestos ya cerrados
- Construir APUs (Análisis de Precios Unitarios) reutilizables

---

## 2. Principio Arquitectónico: Snapshot vs. Referencia Viva

### Recomendación: **Snapshot al vincular + referencia al origen**

| Estrategia | Ventaja | Riesgo |
|---|---|---|
| Referencia viva | Siempre actualizado | Un cambio de precio rompe presupuestos aprobados |
| Snapshot puro | Presupuestos inmutables | Pierde conexión con la fuente, no se puede "actualizar" |
| **Snapshot + referencia (recomendado)** | **Lo mejor de ambos mundos** | Complejidad moderada |

**Cómo funciona:**
1. Al agregar un ítem de la base maestra a un proyecto, se **copia** precio, rendimiento y unidad al proyecto (snapshot)
2. Se guarda un `masterMaterialId` (o equivalente) como referencia al origen
3. El usuario puede en cualquier momento hacer "Actualizar desde base maestra" para traer precios nuevos
4. Los presupuestos aprobados/cerrados **nunca** se actualizan automáticamente

---

## 3. Modelo de Datos Propuesto

### 3.1 Tablas Maestras (Nivel Organización)

```
┌─────────────────────────┐
│   master_materials      │
├─────────────────────────┤
│ id            UUID PK   │
│ code          String UK │  ← código interno (ej: "MAT-0001")
│ name          String    │  ← "Cemento Portland 50kg"
│ description   String?   │
│ unit          String    │  ← "bolsa", "m³", "kg", "ml"
│ unitPrice     Decimal   │  ← precio unitario actual
│ currency      String    │  ← "ARS", "USD"
│ category      String?   │  ← "Cemento", "Hierro", "Sanitarios"
│ supplier      String?   │  ← proveedor habitual
│ isActive      Boolean   │  ← soft delete
│ lastPriceUpdate DateTime│
│ createdAt     DateTime  │
│ updatedAt     DateTime  │
└─────────────────────────┘

┌─────────────────────────┐
│ master_labor_categories  │
├─────────────────────────┤
│ id            UUID PK   │
│ code          String UK │  ← "MO-0001"
│ name          String    │  ← "Oficial albañil"
│ description   String?   │
│ unit          String    │  ← "hs", "jornada"
│ costPerUnit   Decimal   │  ← costo por hora/jornada
│ currency      String    │
│ category      String?   │  ← "Albañilería", "Electricidad", "Plomería"
│ includes      String?   │  ← "Incluye cargas sociales" / notas
│ isActive      Boolean   │
│ lastPriceUpdate DateTime│
│ createdAt     DateTime  │
│ updatedAt     DateTime  │
└─────────────────────────┘

┌─────────────────────────┐
│   master_equipment      │
├─────────────────────────┤
│ id            UUID PK   │
│ code          String UK │  ← "EQ-0001"
│ name          String    │  ← "Hormigonera 150L"
│ description   String?   │
│ unit          String    │  ← "hs", "día", "m³"
│ costPerUnit   Decimal   │  ← costo de uso por unidad
│ currency      String    │
│ category      String?   │  ← "Mezclado", "Transporte", "Elevación"
│ ownership     String?   │  ← "propio" | "alquiler"
│ isActive      Boolean   │
│ lastPriceUpdate DateTime│
│ createdAt     DateTime  │
│ updatedAt     DateTime  │
└─────────────────────────┘
```

### 3.2 Tareas Maestras y APU (Análisis de Precio Unitario)

```
┌──────────────────────────┐
│   master_tasks           │
├──────────────────────────┤
│ id             UUID PK   │
│ code           String UK │  ← "TAREA-0001"
│ name           String    │  ← "Contrapiso de H° e=10cm"
│ description    String?   │
│ unit           String    │  ← "m²"
│ category       String?   │  ← "Pisos", "Estructura", "Instalaciones"
│ calculatedCost Decimal   │  ← costo total calculado del APU
│ isActive       Boolean   │
│ createdAt      DateTime  │
│ updatedAt      DateTime  │
└──────────────────────────┘

┌──────────────────────────────────────┐
│   master_task_materials              │  ← APU: componente materiales
├──────────────────────────────────────┤
│ id              UUID PK              │
│ masterTaskId    UUID FK → master_tasks│
│ masterMaterialId UUID FK → master_materials│
│ quantity        Decimal              │  ← cantidad por unidad de tarea
│ waste           Decimal default 0    │  ← % de desperdicio (ej: 0.05 = 5%)
│ notes           String?              │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│   master_task_labor                  │  ← APU: componente mano de obra
├──────────────────────────────────────┤
│ id              UUID PK              │
│ masterTaskId    UUID FK → master_tasks│
│ masterLaborId   UUID FK → master_labor_categories│
│ hoursPerUnit    Decimal              │  ← rendimiento: hs por unidad de tarea
│ crewSize        Int default 1        │  ← cantidad de operarios
│ notes           String?              │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│   master_task_equipment              │  ← APU: componente equipos
├──────────────────────────────────────┤
│ id              UUID PK              │
│ masterTaskId    UUID FK → master_tasks│
│ masterEquipmentId UUID FK → master_equipment│
│ hoursPerUnit    Decimal              │  ← hs de equipo por unidad de tarea
│ notes           String?              │
└──────────────────────────────────────┘
```

### 3.3 Datos del Proyecto (Nivel Proyecto) — Snapshots

```
┌───────────────────────────────────────────┐
│   project_budget_items                     │  ← un ítem del presupuesto
├───────────────────────────────────────────┤
│ id               UUID PK                  │
│ projectId        UUID FK → projects       │
│ masterTaskId     UUID? FK → master_tasks  │  ← referencia al origen (nullable)
│ code             String                   │
│ name             String                   │  ← snapshot del nombre
│ description      String?                  │
│ unit             String                   │  ← snapshot
│ quantity         Decimal                  │  ← cantidad en ESTE proyecto
│ unitCost         Decimal                  │  ← costo unitario (snapshot o manual)
│ totalCost        Decimal                  │  ← quantity × unitCost (calculado)
│ category         String?                  │
│ status           String default "draft"   │  ← "draft" | "approved" | "locked"
│ snapshotDate     DateTime                 │  ← cuándo se tomó el snapshot
│ createdAt        DateTime                 │
│ updatedAt        DateTime                 │
└───────────────────────────────────────────┘

┌───────────────────────────────────────────┐
│  project_budget_item_materials            │  ← desglose de materiales del ítem
├───────────────────────────────────────────┤
│ id                UUID PK                 │
│ budgetItemId      UUID FK → project_budget_items│
│ masterMaterialId  UUID? FK               │  ← referencia al origen
│ name              String                  │  ← snapshot
│ unit              String                  │  ← snapshot
│ unitPrice         Decimal                 │  ← snapshot del precio
│ quantity          Decimal                 │  ← cantidad por unidad de tarea
│ waste             Decimal                 │
│ subtotal          Decimal                 │  ← calculado
└───────────────────────────────────────────┘

┌───────────────────────────────────────────┐
│  project_budget_item_labor                │
├───────────────────────────────────────────┤
│ id                UUID PK                 │
│ budgetItemId      UUID FK → project_budget_items│
│ masterLaborId     UUID? FK               │
│ name              String                  │  ← snapshot
│ costPerUnit       Decimal                 │  ← snapshot
│ hoursPerUnit      Decimal                 │
│ crewSize          Int                     │
│ subtotal          Decimal                 │
└───────────────────────────────────────────┘

┌───────────────────────────────────────────┐
│  project_budget_item_equipment            │
├───────────────────────────────────────────┤
│ id                UUID PK                 │
│ budgetItemId      UUID FK → project_budget_items│
│ masterEquipmentId UUID? FK               │
│ name              String                  │  ← snapshot
│ costPerUnit       Decimal                 │  ← snapshot
│ hoursPerUnit      Decimal                 │
│ subtotal          Decimal                 │
└───────────────────────────────────────────┘
```

### 3.4 Diagrama de Relaciones

```
                    ┌─────────────────┐
                    │    ORGANIZACIÓN  │
                    │   (Base Maestra) │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                     │
        ▼                    ▼                     ▼
┌───────────────┐  ┌─────────────────┐  ┌──────────────────┐
│master_materials│  │master_labor_cat │  │master_equipment  │
└───────┬───────┘  └────────┬────────┘  └────────┬─────────┘
        │                   │                     │
        └───────────┬───────┴─────────┬───────────┘
                    │   APU           │
                    ▼                 ▼
             ┌──────────────┐  ┌──────────────┐
             │ master_tasks │──│ task_materials│
             │              │──│ task_labor    │
             │              │──│ task_equipment│
             └──────┬───────┘  └──────────────┘
                    │
          ══════════╪══════════  (snapshot boundary)
                    │
                    ▼
        ┌──────────────────────┐
        │      PROYECTO        │
        └──────────┬───────────┘
                   │
                   ▼
        ┌──────────────────────┐
        │ project_budget_items │  ← snapshot de master_task
        │                      │
        │  ├─ item_materials   │  ← snapshot de composición
        │  ├─ item_labor       │
        │  └─ item_equipment   │
        └──────────────────────┘
```

---

## 4. Cómo se conecta con BudgetItem existente

### Escenario A: BudgetItem ya existe como tabla plana
Si tu `BudgetItem` actual es algo como:
```
BudgetItem { id, projectId, name, unit, quantity, unitCost, totalCost }
```

**La migración sería:**
1. Renombrar `BudgetItem` → `project_budget_items`
2. Agregar columnas: `masterTaskId`, `snapshotDate`, `status`
3. Crear las tablas de desglose (`_materials`, `_labor`, `_equipment`)
4. Los datos existentes quedan con `masterTaskId = null` (fueron cargados manualmente)

### Escenario B: BudgetItem no existe todavía
Se crea directamente con el schema propuesto.

> **IMPORTANTE**: Necesito ver tu schema actual para confirmar cuál es el caso y diseñar la migración exacta.

---

## 5. Flujo UX Propuesto

### 5.1 Gestión de la Base Maestra (independiente de proyectos)

```
Menú principal → "Base Maestra" → [Materiales | Mano de Obra | Equipos | Tareas/APU]

Cada sección:
┌──────────────────────────────────────────────────┐
│  📦 Materiales — Base Maestra                     │
│                                                   │
│  [+ Nuevo Material]  [Importar CSV]  🔍 Buscar   │
│                                                   │
│  ┌──────┬───────────────┬──────┬─────────┬──────┐ │
│  │Código│ Nombre        │Unidad│ Precio  │ Cat. │ │
│  ├──────┼───────────────┼──────┼─────────┼──────┤ │
│  │MAT-01│Cemento 50kg   │bolsa │$12.500  │Cemen.│ │
│  │MAT-02│Arena gruesa   │m³    │$45.000  │Árido │ │
│  │MAT-03│Hierro ø8mm    │kg    │$2.800   │Hierro│ │
│  └──────┴───────────────┴──────┴─────────┴──────┘ │
│                                                   │
│  Última actualización: 15/02/2026                 │
└──────────────────────────────────────────────────┘
```

### 5.2 Editor de APU (Tarea Maestra)

```
┌──────────────────────────────────────────────────┐
│  🔧 APU: Contrapiso H° e=10cm  [TAREA-0015]      │
│  Unidad: m²                                       │
│                                                   │
│  ── MATERIALES ──────────────────────────────────  │
│  │ Cemento 50kg  │ 0.25 bolsa │ 5% desp │$3.281│ │
│  │ Arena gruesa  │ 0.04 m³    │ 3% desp │$1.854│ │
│  │ Piedra 6-20   │ 0.08 m³    │ 3% desp │$4.944│ │
│  [+ Agregar material desde base maestra]          │
│                                                   │
│  ── MANO DE OBRA ────────────────────────────────  │
│  │ Oficial albañil │ 0.5 hs │ x1 │ $2.500      │ │
│  │ Ayudante        │ 0.5 hs │ x1 │ $1.800      │ │
│  [+ Agregar categoría]                            │
│                                                   │
│  ── EQUIPOS ─────────────────────────────────────  │
│  │ Hormigonera 150L │ 0.3 hs │ $900            │ │
│  [+ Agregar equipo]                               │
│                                                   │
│  ══════════════════════════════════════════════    │
│  COSTO TOTAL POR m²:               $15.279        │
│                                                   │
│  [Guardar]  [Duplicar tarea]  [Exportar]          │
└──────────────────────────────────────────────────┘
```

### 5.3 Crear Proyecto → Importar desde Base Maestra

```
Paso 1: Crear proyecto (nombre, cliente, ubicación, etc.)
        ↓
Paso 2: Armar presupuesto
        ↓
┌──────────────────────────────────────────────────┐
│  📋 Presupuesto — Proyecto "Casa Rodríguez"       │
│                                                   │
│  [+ Agregar ítem manual]                          │
│  [📦 Importar desde Base Maestra]  ← MODAL       │
│                                                   │
│  Al hacer click en "Importar":                    │
│  ┌─────────────────────────────────────────────┐  │
│  │ Seleccionar tareas de la base maestra       │  │
│  │                                             │  │
│  │ 🔍 Buscar: [____________]                   │  │
│  │ Filtrar por: [Todas las categorías ▾]       │  │
│  │                                             │  │
│  │ ☑ TAREA-0015 Contrapiso H° e=10cm  $15.279 │  │
│  │ ☑ TAREA-0022 Mampostería 15cm      $18.450 │  │
│  │ ☐ TAREA-0030 Revoque grueso int.   $12.100 │  │
│  │ ☐ TAREA-0031 Revoque fino int.     $9.800  │  │
│  │                                             │  │
│  │ [Importar 2 seleccionados]                  │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  Resultado: se crean budget_items con snapshot    │
│  de precios al momento de importar.               │
│  El usuario solo completa la CANTIDAD.            │
└──────────────────────────────────────────────────┘
```

### 5.4 Actualizar Precios en un Proyecto

```
┌──────────────────────────────────────────────────┐
│  🔄 Actualizar precios desde Base Maestra         │
│                                                   │
│  ⚠️  Solo ítems en estado "borrador" se actualizan│
│  Los ítems aprobados/bloqueados NO se modifican.  │
│                                                   │
│  Ítems con precios desactualizados:               │
│  ┌─────────────────┬──────────┬──────────┬─────┐  │
│  │ Ítem            │ Actual   │ Nuevo    │ Dif │  │
│  ├─────────────────┼──────────┼──────────┼─────┤  │
│  │ Contrapiso H°   │ $15.279  │ $16.100  │ +5% │  │
│  │ Mampostería 15  │ $18.450  │ $19.200  │ +4% │  │
│  └─────────────────┴──────────┴──────────┴─────┘  │
│                                                   │
│  [Actualizar seleccionados]  [Cancelar]           │
└──────────────────────────────────────────────────┘
```

---

## 6. Plan de Implementación Incremental

### PR 1 — Base Maestra: Materiales (el más seguro para empezar)

**Por qué empezar acá:**
- Es la tabla más simple (sin relaciones complejas)
- No toca ningún dato existente de proyectos
- Permite validar el patrón CRUD antes de escalar
- Es 100% aditivo (solo agrega, no modifica nada existente)

**Archivos a crear/tocar:**

```
prisma/schema.prisma          ← agregar modelo MasterMaterial
  (o el equivalente si usás otro ORM)

src/
├── lib/
│   └── db/
│       └── master-materials.ts    ← queries/mutations
├── app/
│   └── master/
│       └── materials/
│           ├── page.tsx           ← listado con búsqueda
│           ├── [id]/
│           │   └── page.tsx       ← detalle/edición
│           └── new/
│               └── page.tsx       ← formulario de creación
├── components/
│   └── master/
│       ├── MaterialForm.tsx       ← formulario reutilizable
│       └── MaterialsTable.tsx     ← tabla con filtros
└── app/api/                       ← (si usás API routes)
    └── master/
        └── materials/
            └── route.ts
```

**Migración de base de datos:**
```sql
CREATE TABLE master_materials (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(50) UNIQUE NOT NULL,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  unit        VARCHAR(50) NOT NULL,
  unit_price  DECIMAL(12,2) NOT NULL,
  currency    VARCHAR(3) DEFAULT 'ARS',
  category    VARCHAR(100),
  supplier    VARCHAR(255),
  is_active   BOOLEAN DEFAULT true,
  last_price_update TIMESTAMP DEFAULT NOW(),
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_master_materials_code ON master_materials(code);
CREATE INDEX idx_master_materials_category ON master_materials(category);
CREATE INDEX idx_master_materials_active ON master_materials(is_active);
```

### PR 2 — Master Labor + Master Equipment
Mismo patrón que PR 1, tablas independientes.

### PR 3 — Master Tasks + tablas APU
Acá se conectan las 3 bases anteriores. Se crean las tablas de relación (`master_task_materials`, etc.) y el editor de APU.

### PR 4 — Snapshot: conectar con presupuesto del proyecto
Se crean las tablas `project_budget_item_*` y el flujo de "Importar desde base maestra". Este es el PR que conecta los dos mundos.

### PR 5 — Actualización de precios
Flujo de "comparar y actualizar" precios en proyectos borrador.

---

## 7. Qué NO conviene tocar todavía

| No tocar | Por qué |
|---|---|
| **BudgetItem existente** | Hasta no tener la base maestra funcionando, no refactorizar lo que ya funciona |
| **Modelos de proyecto/obra** | Primero construir la base maestra aislada, después conectar |
| **Autenticación/permisos** | Agregar roles (quién edita la base maestra vs. quién usa) en una etapa posterior |
| **Historial de precios** | Es deseable (tabla `price_history`) pero no es crítico para el MVP |
| **Importación masiva CSV** | Es útil pero puede ir en un PR separado después del CRUD básico |
| **Multi-moneda / conversión** | Guardar el campo `currency` pero no implementar conversión automática todavía |
| **Versionado de APUs** | Más adelante se puede agregar versiones de tareas, por ahora con el snapshot alcanza |

---

## 8. Decisiones Técnicas Pendientes (necesito ver tu código)

1. **¿Qué ORM usás?** Prisma, Drizzle, TypeORM, SQL directo?
2. **¿Base de datos?** PostgreSQL, SQLite, MySQL?
3. **¿Estructura de rutas?** App Router vs Pages Router de Next.js?
4. **¿Cómo está modelado `BudgetItem` hoy?** Campos, relaciones
5. **¿Hay algún modelo de `Project`?** Campos, estados
6. **¿Usás algún state manager?** Zustand, Redux, React Query?
7. **¿El proyecto tiene tests?** Para saber si agregar tests al PR

---

## 9. Resumen Ejecutivo

```
┌─────────────────────────────────────────────────────────┐
│                    ARQUITECTURA                          │
│                                                          │
│  ┌──────────────────────┐    ┌────────────────────────┐  │
│  │   BASE MAESTRA       │    │     PROYECTO           │  │
│  │   (Organización)     │    │  (Instancia)           │  │
│  │                      │    │                        │  │
│  │  • Materiales        │───▶│  • Budget Items        │  │
│  │  • Mano de Obra      │snap│    (con snapshot)      │  │
│  │  • Equipos           │shot│  • Desglose APU        │  │
│  │  • Tareas/APU        │───▶│    copiado             │  │
│  │                      │    │                        │  │
│  │  Precio VIVO         │    │  Precio CONGELADO      │  │
│  │  Se actualiza        │    │  Solo se actualiza     │  │
│  │  libremente          │    │  si el usuario lo pide │  │
│  │                      │    │  y el ítem es borrador │  │
│  └──────────────────────┘    └────────────────────────┘  │
│                                                          │
│  PR1: Materiales → PR2: MO+Eq → PR3: APU → PR4: Link   │
└─────────────────────────────────────────────────────────┘
```

**Empezar por:** PR 1 (Master Materials) — es 100% aditivo, no rompe nada, y valida el patrón completo.
