-- ============================================================
-- Migración 002: RPC clone_master_task_to_org
-- Fecha: 2026-03-13
-- Descripción:
--   1. Índices de soporte para la operación de clonado.
--   2. Función clone_master_task_to_org: copia profunda de un APU
--      global (organization_id IS NULL) al entorno privado de una
--      organización, incluyendo clonado de resources y yields.
-- No modifica tablas existentes.
-- ============================================================


-- ── 1. Índices de soporte ────────────────────────────────────
-- Crearlos solo si no existen; inocuos si ya existen.

-- Lookup de membresía del usuario (usado en validación auth)
CREATE INDEX IF NOT EXISTS idx_org_members_user_org
  ON public.organization_members (user_id, organization_id);

-- Lookup de resource local por org + code (idempotencia de resources)
CREATE INDEX IF NOT EXISTS idx_resources_org_code
  ON public.resources (organization_id, code)
  WHERE organization_id IS NOT NULL;

-- Lookup de yields por APU (core del deep copy)
CREATE INDEX IF NOT EXISTS idx_catalog_task_yields_task_id
  ON public.catalog_task_yields (master_task_id);

-- Idempotencia de master_tasks clonadas
CREATE INDEX IF NOT EXISTS idx_master_tasks_org_code_name
  ON public.master_tasks (organization_id, code, name)
  WHERE organization_id IS NOT NULL;


-- ── 2. RPC: clone_master_task_to_org ────────────────────────

CREATE OR REPLACE FUNCTION public.clone_master_task_to_org(
  p_master_task_id  uuid,
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Auth
  v_user_id        uuid := auth.uid();
  v_member_role    text;

  -- Task origen
  v_source_task    master_tasks%ROWTYPE;

  -- Resultado
  v_new_task_id    uuid;

  -- Catálogo privado
  v_catalog_id     uuid;

  -- Loop de yields
  v_yield          record;
  v_local_res_id   uuid;

  -- Advisory lock keys (hashtext devuelve int4, compatible con la firma (int4, int4))
  v_lock_key1      int4;
  v_lock_key2      int4;

BEGIN

  -- ── Paso 1: Validar sesión activa ─────────────────────────
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado: auth.uid() es null';
  END IF;

  -- ── Paso 2: Validar membresía y rol ───────────────────────
  SELECT role
  INTO   v_member_role
  FROM   organization_members
  WHERE  user_id         = v_user_id
    AND  organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El usuario no pertenece a la organización %', p_organization_id;
  END IF;

  IF v_member_role NOT IN ('owner', 'admin', 'editor') THEN
    RAISE EXCEPTION 'Rol insuficiente: % no puede clonar APUs (requiere owner/admin/editor)', v_member_role;
  END IF;

  -- ── Paso 3: Validar APU origen ────────────────────────────
  SELECT *
  INTO   v_source_task
  FROM   master_tasks
  WHERE  id              = p_master_task_id
    AND  organization_id IS NULL;   -- debe ser global

  IF NOT FOUND THEN
    RAISE EXCEPTION 'APU no encontrado o no es global: %', p_master_task_id;
  END IF;

  -- ── Paso 4: Advisory lock transaccional ───────────────────
  -- Evita que dos sesiones creen el mismo clon en paralelo.
  -- pg_advisory_xact_lock(int4, int4) se libera al terminar la transacción.
  -- hashtext mapea cada UUID a int4 con distribución uniforme.
  v_lock_key1 := hashtext(p_organization_id::text);
  v_lock_key2 := hashtext(p_master_task_id::text);
  PERFORM pg_advisory_xact_lock(v_lock_key1, v_lock_key2);

  -- ── Paso 5: Idempotencia — buscar clon existente ──────────
  -- Criterio: misma org + code + name (sin catalog_id en master_tasks)
  SELECT id
  INTO   v_new_task_id
  FROM   master_tasks
  WHERE  organization_id = p_organization_id
    AND  code            = v_source_task.code
    AND  name            = v_source_task.name
  LIMIT  1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'task_id', v_new_task_id,
      'created', false,
      'message', 'APU ya clonado en esta organización — se devuelve el existente'
    );
  END IF;

  -- ── Paso 6: Obtener o crear catálogo privado ──────────────
  SELECT id
  INTO   v_catalog_id
  FROM   catalogs
  WHERE  organization_id = p_organization_id
    AND  type            = 'private'
  LIMIT  1;

  IF NOT FOUND THEN
    INSERT INTO catalogs (name, type, organization_id, is_active)
    VALUES ('Catálogo Privado', 'private', p_organization_id, true)
    RETURNING id INTO v_catalog_id;
  END IF;

  -- ── Paso 7: Clonar la master_task ─────────────────────────
  INSERT INTO master_tasks (
    organization_id,
    code,
    name,
    unit,
    category,
    description,
    daily_yield,
    fixed_cost,
    fixed_cost_description,
    specifications,
    tags,
    is_active
  )
  VALUES (
    p_organization_id,
    v_source_task.code,
    v_source_task.name,
    v_source_task.unit,
    v_source_task.category,
    v_source_task.description,
    v_source_task.daily_yield,
    v_source_task.fixed_cost,
    v_source_task.fixed_cost_description,
    v_source_task.specifications,
    coalesce(v_source_task.tags, '[]'::jsonb),
    true
  )
  RETURNING id INTO v_new_task_id;

  -- ── Paso 8: Clonar resources + yields ─────────────────────
  -- Itera sobre cada recurso que compone el APU global.
  FOR v_yield IN
    SELECT
      cty.quantity,
      r.code,
      r.name,
      r.unit,
      r.base_cost,
      r.type,
      r.category_name,
      r.social_charges_pct
    FROM catalog_task_yields cty
    JOIN resources r ON r.id = cty.resource_id
    WHERE cty.master_task_id = p_master_task_id
  LOOP

    -- ¿Ya existe una copia local de este resource para la org?
    SELECT id
    INTO   v_local_res_id
    FROM   resources
    WHERE  organization_id = p_organization_id
      AND  code            = v_yield.code
    LIMIT  1;

    IF NOT FOUND THEN
      -- Crear copia local del resource en el catálogo privado
      INSERT INTO resources (
        catalog_id,
        organization_id,
        code,
        name,
        unit,
        base_cost,
        type,
        category_name,
        social_charges_pct,
        is_active
      )
      VALUES (
        v_catalog_id,
        p_organization_id,
        v_yield.code,
        v_yield.name,
        v_yield.unit,
        v_yield.base_cost,
        v_yield.type,
        v_yield.category_name,
        v_yield.social_charges_pct,
        true
      )
      RETURNING id INTO v_local_res_id;
    END IF;

    -- Insertar yield del APU clonado
    INSERT INTO catalog_task_yields (master_task_id, resource_id, quantity)
    VALUES (v_new_task_id, v_local_res_id, v_yield.quantity);

  END LOOP;

  -- ── Resultado ─────────────────────────────────────────────
  RETURN jsonb_build_object(
    'task_id', v_new_task_id,
    'created', true,
    'message', 'APU clonado exitosamente'
  );

END;
$$;

COMMENT ON FUNCTION public.clone_master_task_to_org(uuid, uuid) IS
  'Deep copy de un APU global (organization_id IS NULL) al entorno privado de una organización.
   Clona la master_task, sus resources globales y sus catalog_task_yields.
   Idempotente: devuelve el clon existente si ya fue clonado previamente.
   Concurrencia: usa pg_advisory_xact_lock para evitar doble clon simultáneo.
   Requiere rol owner/admin/editor en la organización destino.';
