-- =============================================================================
-- Migration 040: Computation Schema — Sincronización Viva (Schema base)
-- Fecha: 2026-04-26
--
-- Problema que resuelve:
--   No existe ninguna entidad que vincule lo calculado en la Calculadora Chandías
--   con los ítems del presupuesto. Las cantidades se ingresan manualmente en
--   BudgetEditor, sin trazabilidad al cómputo original.
--
-- Qué agrega:
--   a) project_computations  — sesión de cómputo por proyecto
--   b) computation_items     — ítems individuales con dims, cantidad y snapshot técnico
--   c) budget_items.computation_item_id — vínculo opcional (trazabilidad, no lógica)
--
-- Reglas de negocio (enforced en app, no en DB):
--   · status controla el ciclo: draft → approved → frozen
--   · materiales_snapshot NO guarda precios — solo cantidades y metadata técnica
--   · computation_item_id en budget_items es solo trazabilidad en esta etapa
--
-- Backward compatibility TOTAL:
--   · Todas las tablas existentes permanecen sin cambios estructurales
--   · budget_items.computation_item_id es nullable → filas existentes: NULL
--   · No hay triggers ni RPCs que afecten flujos existentes
--   · No toca: tasks, master_tasks, motor de costos, ERPContext
--
-- Dependencias:
--   · set_updated_at()             — migración 008
--   · is_org_member()              — migración 007
--   · is_org_member_with_role()    — migración 007
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. project_computations
-- =============================================================================
-- Contenedor de una sesión de cómputo. Agrupa computation_items del mismo
-- contexto (etapa, zona, licitación). Un proyecto puede tener múltiples
-- sesiones en paralelo o secuenciales.

CREATE TABLE IF NOT EXISTS public.project_computations (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  project_id       uuid        NOT NULL
                     REFERENCES public.projects(id) ON DELETE CASCADE,

  -- Denormalizado para RLS y reporting sin joins adicionales
  organization_id  uuid        NOT NULL
                     REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Etiqueta libre: "Etapa Estructura", "Muros PB", "Presupuesto Licitación 1"
  name             text,

  -- Ciclo de vida:
  --   'draft'    → activo, editable. Chandías puede re-abrirlo.
  --   'approved' → enviado al presupuesto. BudgetEditor muestra badge sync.
  --                Quantity todavía puede actualizarse (con badge de desactualización).
  --   'frozen'   → cantidades congeladas. Ya no se puede re-calcular desde Chandías.
  --                Solo los COSTOS pueden re-calcularse (precios cambian).
  status           text        NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'approved', 'frozen')),

  -- Usuario que ejecutó el cómputo (audit trail)
  computed_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Momento en que se cerró / aprobó el cómputo
  computed_at      timestamptz NOT NULL DEFAULT now(),

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Listar sesiones por proyecto, más reciente primero
CREATE INDEX IF NOT EXISTS idx_pcomp_project_computed
  ON public.project_computations (project_id, created_at DESC);

-- Lookup por org (RLS + reportes)
CREATE INDEX IF NOT EXISTS idx_pcomp_organization_id
  ON public.project_computations (organization_id);

-- Filtrar sesiones por estado (útil cuando hay muchas sesiones por proyecto)
CREATE INDEX IF NOT EXISTS idx_pcomp_status
  ON public.project_computations (project_id, status);

COMMENT ON TABLE public.project_computations IS
  'Sesiones de cómputo paramétrico (Calculadora Chandías). Cada sesión agrupa '
  'computation_items del mismo contexto (etapa, zona). '
  'Ciclo de vida: draft → approved → frozen. '
  'Un proyecto puede tener múltiples sesiones concurrentes.';

COMMENT ON COLUMN public.project_computations.status IS
  'draft = editable | approved = enviado al presupuesto | frozen = cantidades bloqueadas.';

COMMENT ON COLUMN public.project_computations.computed_at IS
  'Momento en que el usuario aprobó o congeló el cómputo.';


-- =============================================================================
-- 2. computation_items
-- =============================================================================
-- Un ítem de cómputo por rubro calculado. Guarda las dimensiones (dims), la
-- cantidad resultante, y un snapshot TÉCNICO sin precios de la receta.
--
-- IMPORTANTE sobre materiales_snapshot:
--   - Shape: Array<{ nombre: string; unit: string; coef: number; cantidad: number }>
--   - Es la salida del motor Chandías al momento del cálculo
--   - NO incluye precios ni datos comerciales
--   - Los precios se resuelven en runtime desde master_materials / resource_cost_snapshots
--
-- IMPORTANTE sobre manual_materials:
--   - Shape: Array<{ id: string; nombre: string; unit: string; cantidad: number; code?: string }>
--   - Materiales agregados manualmente en el DetailPanel (no derivados del catálogo)
--   - NO incluye precios

CREATE TABLE IF NOT EXISTS public.computation_items (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),

  computation_id      uuid          NOT NULL
                        REFERENCES public.project_computations(id) ON DELETE CASCADE,

  -- Denormalizado desde project_computations para RLS simple (sin join en cada check)
  organization_id     uuid          NOT NULL
                        REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- ID del rubro en el catálogo Chandías local (ChandiasTask.id).
  -- Es un string del catálogo TypeScript, no un FK a DB (catálogo es client-side).
  -- Ejemplos: 'FUN-001', 'T1006-VIGA', 'MAM-001'
  chandias_task_id    text          NOT NULL,

  -- Vínculo opcional al APU Maestro. NULL si:
  --   a) El usuario no transformó el rubro en APU todavía
  --   b) El cómputo usa el catálogo Chandías directamente como receta
  -- ON DELETE SET NULL: si se elimina el APU, el computation_item sobrevive.
  master_task_id      uuid          REFERENCES public.master_tasks(id) ON DELETE SET NULL,

  -- Texto libre: ubicación, eje, ambiente, nivel (ej: "Eje A-B / Nivel 2")
  description         text,

  -- Dimensiones usadas en el cálculo. Record<string, number>.
  -- Ejemplo: {"largo": 5.0, "ancho": 0.40, "alto": 0.60}
  -- Permite reconstruir el cálculo sin abrir Chandías.
  dims                jsonb         NOT NULL DEFAULT '{}',

  -- Cantidad calculada = resultado de aplicar la fórmula del rubro sobre dims
  -- (incluye ajustes por config avanzada: nBeams, waste, openings, etc.)
  quantity            numeric(14,4) NOT NULL CHECK (quantity >= 0),

  -- Unidad del rubro (m², m³, ml, kg, un, gl, etc.)
  unidad              text          NOT NULL,

  -- Snapshot TÉCNICO de la receta de materiales calculada por el motor Chandías.
  -- Shape: [{ nombre: string; unit: string; coef: number; cantidad: number }]
  -- coef   = cantidad por unidad de tarea (receta)
  -- cantidad = coef × quantity (total para este ítem)
  -- Sin precios. Sin datos comerciales.
  materiales_snapshot jsonb         NOT NULL DEFAULT '[]',

  -- Materiales adicionales ingresados a mano en el DetailPanel.
  -- Shape: [{ id: string; nombre: string; unit: string; cantidad: number; code?: string }]
  -- Sin precios.
  manual_materials    jsonb         NOT NULL DEFAULT '[]',

  -- Diámetro de barra de acero seleccionado (solo familias H.A. estructurales).
  -- NULL para todos los demás rubros.
  steel_diameter_mm   numeric(6,2),

  -- Orden visual dentro de la sesión (coincide con el orden en el RightPanel)
  sort_order          integer,

  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now()
);

-- Listar ítems de una sesión en orden visual
CREATE INDEX IF NOT EXISTS idx_citems_computation_id
  ON public.computation_items (computation_id, sort_order ASC NULLS LAST, created_at ASC);

-- RLS y filtros por org
CREATE INDEX IF NOT EXISTS idx_citems_organization_id
  ON public.computation_items (organization_id);

-- Dado un APU Maestro, encontrar todos los computation_items que lo usan
-- (útil para mostrar "este APU fue usado en N cómputos")
CREATE INDEX IF NOT EXISTS idx_citems_master_task_id
  ON public.computation_items (master_task_id)
  WHERE master_task_id IS NOT NULL;

COMMENT ON TABLE public.computation_items IS
  'Ítems individuales de cómputo paramétrico (Calculadora Chandías). '
  'Cada fila es un rubro calculado con sus dimensiones, cantidad y receta técnica. '
  'materiales_snapshot y manual_materials son snapshots SIN PRECIOS. '
  'Los precios se resuelven en runtime desde master_materials.';

COMMENT ON COLUMN public.computation_items.chandias_task_id IS
  'ID del rubro en el catálogo TypeScript de Chandías (ChandiasTask.id). '
  'No es FK a DB — el catálogo es client-side. Ej: ''FUN-001'', ''T1006-VIGA''.';

COMMENT ON COLUMN public.computation_items.master_task_id IS
  'FK opcional al APU Maestro (master_tasks). NULL mientras no se cree el APU. '
  'ON DELETE SET NULL: el computation_item sobrevive si se elimina el APU.';

COMMENT ON COLUMN public.computation_items.dims IS
  'Dimensiones usadas en el cálculo. Ejemplo: {"largo": 5.0, "ancho": 0.40, "alto": 0.60}. '
  'Permite reconstruir o auditar el cálculo original.';

COMMENT ON COLUMN public.computation_items.materiales_snapshot IS
  'Snapshot técnico de la receta Chandías: [{nombre, unit, coef, cantidad}]. '
  'SIN precios. Los precios se resuelven en runtime.';

COMMENT ON COLUMN public.computation_items.manual_materials IS
  'Materiales adicionales manuales: [{id, nombre, unit, cantidad, code?}]. '
  'SIN precios.';

COMMENT ON COLUMN public.computation_items.steel_diameter_mm IS
  'Diámetro de barra (mm) para familias estructurales H.A. NULL en todos los demás rubros.';


-- =============================================================================
-- 3. Triggers: updated_at automático
-- =============================================================================
-- Reutiliza set_updated_at() creada en migración 008.

CREATE TRIGGER trg_project_computations_updated_at
  BEFORE UPDATE ON public.project_computations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_computation_items_updated_at
  BEFORE UPDATE ON public.computation_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 4. budget_items.computation_item_id
-- =============================================================================
-- Vínculo opcional de trazabilidad. NULL = ítem del presupuesto creado
-- manualmente sin origen en Chandías.
--
-- ON DELETE SET NULL: si se elimina el computation_item (ej: sesión descartada),
-- el budget_item sobrevive intacto con quantity manual.
--
-- Envuelto en DO $$ para idempotencia: si ya existe la columna, no falla.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   information_schema.columns
    WHERE  table_schema = 'public'
      AND  table_name   = 'budget_items'
      AND  column_name  = 'computation_item_id'
  ) THEN
    ALTER TABLE public.budget_items
      ADD COLUMN computation_item_id uuid
        REFERENCES public.computation_items(id) ON DELETE SET NULL;

    -- Dado un computation_item, encontrar el budget_item vinculado
    -- (máximo 1:1 en esta etapa, pero el índice no lo enforcea todavía)
    CREATE INDEX idx_bi_computation_item_id
      ON public.budget_items (computation_item_id)
      WHERE computation_item_id IS NOT NULL;

    COMMENT ON COLUMN public.budget_items.computation_item_id IS
      'Vínculo opcional al computation_item de origen (Calculadora Chandías). '
      'NULL = ítem creado manualmente en BudgetEditor. '
      'En esta etapa es solo trazabilidad: no afecta cálculos ni lógica existente. '
      'ON DELETE SET NULL: el budget_item sobrevive si se elimina el computation_item.';
  END IF;
END $$;


-- =============================================================================
-- 5. RLS: project_computations
-- =============================================================================
-- Mismo patrón multitenant que budget_items (migración 007):
--   SELECT → cualquier miembro de la org (viewer incluido)
--   INSERT/UPDATE/DELETE → owner | admin | editor (no viewer)

ALTER TABLE public.project_computations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pcomp_select" ON public.project_computations;
DROP POLICY IF EXISTS "pcomp_insert" ON public.project_computations;
DROP POLICY IF EXISTS "pcomp_update" ON public.project_computations;
DROP POLICY IF EXISTS "pcomp_delete" ON public.project_computations;

CREATE POLICY "pcomp_select" ON public.project_computations
  FOR SELECT TO authenticated
  USING ( is_org_member(organization_id) );

CREATE POLICY "pcomp_insert" ON public.project_computations
  FOR INSERT TO authenticated
  WITH CHECK ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) );

CREATE POLICY "pcomp_update" ON public.project_computations
  FOR UPDATE TO authenticated
  USING  ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) )
  WITH CHECK ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) );

CREATE POLICY "pcomp_delete" ON public.project_computations
  FOR DELETE TO authenticated
  USING ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) );


-- =============================================================================
-- 6. RLS: computation_items
-- =============================================================================
-- organization_id está denormalizado en la tabla → mismo patrón directo,
-- sin necesidad de join a project_computations para el check de membresía.

ALTER TABLE public.computation_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "citems_select" ON public.computation_items;
DROP POLICY IF EXISTS "citems_insert" ON public.computation_items;
DROP POLICY IF EXISTS "citems_update" ON public.computation_items;
DROP POLICY IF EXISTS "citems_delete" ON public.computation_items;

CREATE POLICY "citems_select" ON public.computation_items
  FOR SELECT TO authenticated
  USING ( is_org_member(organization_id) );

CREATE POLICY "citems_insert" ON public.computation_items
  FOR INSERT TO authenticated
  WITH CHECK ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) );

CREATE POLICY "citems_update" ON public.computation_items
  FOR UPDATE TO authenticated
  USING  ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) )
  WITH CHECK ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) );

CREATE POLICY "citems_delete" ON public.computation_items
  FOR DELETE TO authenticated
  USING ( is_org_member_with_role(organization_id, ARRAY['owner','admin','editor']) );


COMMIT;
