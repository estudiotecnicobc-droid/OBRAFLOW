-- ============================================================
-- VALIDACIÓN POST-MIGRACIÓN 003
-- Archivo: 003_validate_and_test.sql
-- Propósito: confirmar columnas, constraints e índice; insertar
--            datos de prueba aislados; rollback de esos datos.
--
-- INSTRUCCIONES DE USO
--   Ejecutar en Supabase SQL Editor en este orden:
--     1. Bloques 1, 2 y 3 → solo lectura, sin efectos.
--     2. Bloque 4          → inserta datos de prueba.
--     3. Bloque 5          → elimina los datos de prueba.
--   Los bloques 1-3 son idempotentes y pueden repetirse.
--   El bloque 4 es idempotente gracias a ON CONFLICT DO NOTHING.
--   El bloque 5 no toca la migración ni datos de producción.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- BLOQUE 1 · Validar columnas nuevas
-- Fuente: information_schema.columns (estándar ANSI, segura).
-- Resultado esperado: 5 filas, una por columna nueva.
-- ════════════════════════════════════════════════════════════

SELECT
  table_schema,
  table_name,
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    -- tasks
    (table_name = 'tasks'       AND column_name = 'quality_controls')
    -- resources
 OR (table_name = 'resources'   AND column_name IN ('commercial_unit', 'conversion_factor'))
    -- task_yields
 OR (table_name = 'task_yields' AND column_name IN ('commercial_unit', 'conversion_factor'))
  )
ORDER BY table_name, column_name;

/*
  RESULTADO ESPERADO (5 filas):

  table_name   | column_name        | data_type | is_nullable
  -------------+--------------------+-----------+------------
  resources    | commercial_unit    | text      | YES
  resources    | conversion_factor  | numeric   | YES
  task_yields  | commercial_unit    | text      | YES
  task_yields  | conversion_factor  | numeric   | YES
  tasks        | quality_controls   | jsonb     | NO
*/


-- ════════════════════════════════════════════════════════════
-- BLOQUE 2 · Inspeccionar constraints creados por la migración
-- pg_constraint es el catálogo nativo de PG; contype = 'c' → check.
-- Resultado esperado: 3 filas (una por tabla).
-- ════════════════════════════════════════════════════════════

SELECT
  n.nspname                          AS schema_name,
  t.relname                          AS table_name,
  c.conname                          AS constraint_name,
  pg_get_constraintdef(c.oid, true)  AS definition
FROM pg_constraint c
JOIN pg_class     t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND c.contype = 'c'
  AND c.conname IN (
    'tasks_quality_controls_is_object',
    'resources_conversion_factor_positive',
    'task_yields_conversion_factor_positive'
  )
ORDER BY table_name;

/*
  RESULTADO ESPERADO (3 filas):

  table_name   | constraint_name                         | definition
  -------------+-----------------------------------------+--------------------------------------------
  resources    | resources_conversion_factor_positive    | CHECK (conversion_factor IS NULL OR conversion_factor > 0)
  task_yields  | task_yields_conversion_factor_positive  | CHECK (conversion_factor IS NULL OR conversion_factor > 0)
  tasks        | tasks_quality_controls_is_object        | CHECK (jsonb_typeof(quality_controls) = 'object')
*/


-- ════════════════════════════════════════════════════════════
-- BLOQUE 3 · Inspeccionar índice GIN sobre tasks.quality_controls
-- Resultado esperado: 1 fila con el índice GIN.
-- ════════════════════════════════════════════════════════════

SELECT
  n.nspname                   AS schema_name,
  t.relname                   AS table_name,
  i.relname                   AS index_name,
  am.amname                   AS index_type,
  pg_get_indexdef(ix.indexrelid) AS definition
FROM pg_index     ix
JOIN pg_class     t  ON t.oid  = ix.indrelid
JOIN pg_class     i  ON i.oid  = ix.indexrelid
JOIN pg_am        am ON am.oid = i.relam
JOIN pg_namespace n  ON n.oid  = t.relnamespace
WHERE n.nspname  = 'public'
  AND t.relname  = 'tasks'
  AND i.relname  = 'idx_tasks_quality_controls_gin';

/*
  RESULTADO ESPERADO (1 fila):

  table_name | index_name                       | index_type | definition
  -----------+----------------------------------+------------+----------------------------------------------
  tasks      | idx_tasks_quality_controls_gin   | gin        | CREATE INDEX idx_tasks_quality_controls_gin
             |                                  |            | ON public.tasks USING gin (quality_controls)
*/


-- ════════════════════════════════════════════════════════════
-- BLOQUE 4 · Datos de prueba
--
-- Estrategia de aislamiento:
--   · Todos los registros de prueba llevan el código o nombre
--     '__TEST_003__' como marcador inequívoco.
--   · Se usa ON CONFLICT DO NOTHING para idempotencia.
--   · El bloque 5 los elimina con WHERE sobre ese marcador.
--
-- ADVERTENCIA: si no existe ningún catalog en public.catalogs,
--   la prueba de resources emitirá un NOTICE y no insertará.
--   Lo mismo para tasks si no hay ninguna organización.
-- ════════════════════════════════════════════════════════════

-- ── 4a. resources: recurso de prueba con unidad comercial ──

DO $$
DECLARE
  v_catalog_id uuid;
BEGIN
  -- Tomar el primer catálogo disponible (global o de org)
  SELECT id INTO v_catalog_id
  FROM public.catalogs
  WHERE is_active = true
  ORDER BY created_at
  LIMIT 1;

  IF v_catalog_id IS NULL THEN
    RAISE NOTICE '[TEST 4a] OMITIDA: no existe ningún catálogo en public.catalogs.';
    RETURN;
  END IF;

  INSERT INTO public.resources (
    catalog_id,
    code,
    name,
    unit,
    base_cost,
    type,
    commercial_unit,
    conversion_factor
  ) VALUES (
    v_catalog_id,
    '__TEST_003__',             -- marcador de prueba
    'Cemento Portland (TEST)',
    'kg',
    0.85,                       -- base_cost ficticio
    'MATERIAL',
    'bolsa_50kg',
    50                          -- 1 bolsa_50kg = 50 kg
  )
  ON CONFLICT (catalog_id, code) DO NOTHING;  -- idempotente

  RAISE NOTICE '[TEST 4a] OK: recurso __TEST_003__ insertado (o ya existía).';
END;
$$;

-- Verificar el recurso insertado
SELECT
  code,
  name,
  unit               AS "unidad_base",
  commercial_unit    AS "unidad_comercial",
  conversion_factor  AS "factor_conversion",
  base_cost
FROM public.resources
WHERE code = '__TEST_003__';


-- ── 4b. tasks: tarea de prueba con quality_controls ────────

DO $$
DECLARE
  v_org_id uuid;
BEGIN
  -- Tomar la primera organización disponible
  SELECT id INTO v_org_id
  FROM public.organizations
  ORDER BY created_at
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE NOTICE '[TEST 4b] OMITIDA: no existe ninguna organización.';
    RETURN;
  END IF;

  -- Insertar tarea de prueba si no existe ya por el código centinela
  IF NOT EXISTS (
    SELECT 1 FROM public.tasks
    WHERE organization_id = v_org_id
      AND code = '__TEST_003__'
  ) THEN
    INSERT INTO public.tasks (
      id,
      organization_id,
      name,
      unit,
      labor_cost,
      daily_yield,
      code,
      quality_controls
    ) VALUES (
      gen_random_uuid(),
      v_org_id,
      'Colocación de revoque fino (TEST)',
      'm2',
      0,
      10,
      '__TEST_003__',           -- marcador de prueba
      '{
        "reception": [
          "Verificar consistencia del mortero",
          "Controlar fecha de elaboración"
        ],
        "execution": [
          "Espesor uniforme entre 8-12mm",
          "Sin fisuras al secado"
        ],
        "notes": "Prueba de migración 003 — eliminar con bloque 5"
      }'::jsonb
    );
    RAISE NOTICE '[TEST 4b] OK: tarea __TEST_003__ insertada.';
  ELSE
    RAISE NOTICE '[TEST 4b] OMITIDA: la tarea __TEST_003__ ya existía.';
  END IF;
END;
$$;

-- Verificar la tarea y la estructura del jsonb
SELECT
  code,
  name,
  unit,
  quality_controls,
  jsonb_typeof(quality_controls)                         AS "tipo_json",
  jsonb_array_length(quality_controls -> 'reception')   AS "controles_recepcion",
  jsonb_array_length(quality_controls -> 'execution')   AS "controles_ejecucion",
  quality_controls ->> 'notes'                          AS "notas"
FROM public.tasks
WHERE code = '__TEST_003__';


-- ── 4c. task_yields: yield de prueba con override comercial ─

DO $$
DECLARE
  v_task_id     uuid;
  v_material_id uuid;
BEGIN
  -- Tomar la tarea de prueba recién creada
  SELECT id INTO v_task_id
  FROM public.tasks
  WHERE code = '__TEST_003__'
  LIMIT 1;

  IF v_task_id IS NULL THEN
    RAISE NOTICE '[TEST 4c] OMITIDA: la tarea __TEST_003__ no existe (ejecutar 4b primero).';
    RETURN;
  END IF;

  -- Tomar cualquier material existente como ancla para el yield
  -- (master_materials es la tabla de materiales del módulo de proyectos)
  SELECT id INTO v_material_id
  FROM public.master_materials
  WHERE is_active = true
  ORDER BY created_at
  LIMIT 1;

  IF v_material_id IS NULL THEN
    RAISE NOTICE '[TEST 4c] OMITIDA: no existe ningún material en public.master_materials.';
    RETURN;
  END IF;

  INSERT INTO public.task_yields (
    task_id,
    material_id,
    quantity,
    waste_percent,
    commercial_unit,
    conversion_factor
  ) VALUES (
    v_task_id,
    v_material_id,
    300,          -- 300 kg por unidad de tarea (m2 de revoque)
    0.05,         -- 5 % de desperdicio
    'bolsa_50kg', -- override: comprar en bolsas aunque la base sea kg
    50            -- 1 bolsa = 50 kg
  )
  ON CONFLICT (task_id, material_id) DO NOTHING;

  RAISE NOTICE '[TEST 4c] OK: task_yield de prueba insertado (o ya existía).';
END;
$$;

-- Verificar el yield con override comercial
SELECT
  ty.task_id,
  ty.material_id,
  ty.quantity                                   AS "cantidad_base",
  ty.waste_percent                              AS "desperdicio",
  ty.commercial_unit                            AS "unidad_comercial",
  ty.conversion_factor                          AS "factor_conversion",
  -- Cálculo informativo: cuántas unidades comerciales se necesitan
  ROUND(
    ty.quantity * (1 + COALESCE(ty.waste_percent, 0))
    / ty.conversion_factor,
    2
  )                                             AS "bolsas_necesarias"
FROM public.task_yields ty
JOIN public.tasks t ON t.id = ty.task_id
WHERE t.code = '__TEST_003__';


-- ── 4d. Verificar que el check constraint rechaza valores inválidos ──
-- Estas sentencias DEBEN fallar. Descomentarlas para probar
-- manualmente una a la vez en el SQL Editor.

/*
-- DEBE FALLAR: conversion_factor = 0 (no > 0)
UPDATE public.resources
SET conversion_factor = 0
WHERE code = '__TEST_003__';

-- DEBE FALLAR: conversion_factor negativo
UPDATE public.task_yields ty
SET conversion_factor = -1
FROM public.tasks t
WHERE t.id = ty.task_id AND t.code = '__TEST_003__';

-- DEBE FALLAR: quality_controls como array en vez de objeto
UPDATE public.tasks
SET quality_controls = '[]'::jsonb
WHERE code = '__TEST_003__';
*/


-- ════════════════════════════════════════════════════════════
-- BLOQUE 5 · Rollback de datos de prueba
--
-- Elimina ÚNICAMENTE los registros marcados con '__TEST_003__'.
-- No toca la migración ni columnas ni constraints.
-- Seguro para ejecutar en cualquier momento después del bloque 4.
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_task_id        uuid;
  v_rows_yields    int := 0;
  v_rows_tasks     int := 0;
  v_rows_resources int := 0;
BEGIN
  -- 1. Obtener el id de la tarea de prueba para borrar sus yields
  SELECT id INTO v_task_id
  FROM public.tasks
  WHERE code = '__TEST_003__'
  LIMIT 1;

  -- 2. Borrar task_yields vinculados a la tarea de prueba
  IF v_task_id IS NOT NULL THEN
    DELETE FROM public.task_yields
    WHERE task_id = v_task_id;
    GET DIAGNOSTICS v_rows_yields = ROW_COUNT;
  END IF;

  -- 3. Borrar la tarea de prueba
  DELETE FROM public.tasks
  WHERE code = '__TEST_003__';
  GET DIAGNOSTICS v_rows_tasks = ROW_COUNT;

  -- 4. Borrar el recurso de prueba
  DELETE FROM public.resources
  WHERE code = '__TEST_003__';
  GET DIAGNOSTICS v_rows_resources = ROW_COUNT;

  RAISE NOTICE '[ROLLBACK 003] task_yields eliminados : %', v_rows_yields;
  RAISE NOTICE '[ROLLBACK 003] tasks eliminadas       : %', v_rows_tasks;
  RAISE NOTICE '[ROLLBACK 003] resources eliminados   : %', v_rows_resources;
  RAISE NOTICE '[ROLLBACK 003] Rollback completado. Migración intacta.';
END;
$$;
