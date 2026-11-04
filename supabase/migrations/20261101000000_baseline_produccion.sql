


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."index_frequency" AS ENUM (
    'MONTHLY',
    'QUARTERLY',
    'ANNUAL',
    'IRREGULAR'
);


ALTER TYPE "public"."index_frequency" OWNER TO "postgres";


CREATE TYPE "public"."pricing_rule_type" AS ENUM (
    'FIXED_MANUAL',
    'DIRECT_IMPORT',
    'INDEX_MULTIPLIER',
    'COMPOSITE_INDEX',
    'LABOR_FORMULA'
);


ALTER TYPE "public"."pricing_rule_type" OWNER TO "postgres";


CREATE TYPE "public"."snapshot_source_type" AS ENUM (
    'MANUAL',
    'IMPORT',
    'INDEX_CALCULATION',
    'LABOR_CALCULATION',
    'COMPOSITE_CALCULATION',
    'FALLBACK_BASE_COST'
);


ALTER TYPE "public"."snapshot_source_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_invitation"("p_token" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_inv invitations%rowtype; v_user_id uuid := auth.uid();
begin
  if v_user_id is null then return json_build_object('error', 'No autenticado.'); end if;
  select * into v_inv from invitations where token = p_token for update;
  if not found then return json_build_object('error', 'Invitación no encontrada.'); end if;
  if v_inv.accepted_at is not null then return json_build_object('error', 'Esta invitación ya fue utilizada.'); end if;
  if v_inv.expires_at < now() then return json_build_object('error', 'La invitación ha expirado.'); end if;
  if v_inv.role not in ('admin','editor','viewer') then return json_build_object('error', 'Rol de invitación inválido.'); end if;
  if exists (select 1 from organization_members where organization_id = v_inv.organization_id and user_id = v_user_id) then
    return json_build_object('error', 'Ya sos miembro de esta organización.');
  end if;
  insert into organization_members (user_id, organization_id, role) values (v_user_id, v_inv.organization_id, v_inv.role);
  update invitations set accepted_at = now(), accepted_by = v_user_id where id = v_inv.id;
  return json_build_object('ok', true, 'organization_id', v_inv.organization_id::text);
end; $$;


ALTER FUNCTION "public"."accept_invitation"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_commercial_rules"("p_org_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_mm  integer := 0;   -- master_materials actualizados
  v_mat integer := 0;   -- materials actualizados
  v_n   integer;

  -- Macro para no repetir: actualiza master_materials por patrón ILIKE en name
  -- Solo donde conversion_factor IS NULL para no pisar datos existentes.
BEGIN
  -- Only authorized org editors may invoke this RPC directly.
  -- The org-create trigger is an internal trusted invocation.
  IF pg_trigger_depth() = 0
     AND NOT public.is_org_member_with_role(
       p_org_id, ARRAY['owner','admin','editor']::text[]
     ) THEN
    RAISE EXCEPTION 'FORBIDDEN: no permission to update commercial rules for organization %', p_org_id
      USING ERRCODE = '42501';
  END IF;

  -- ── CEMENTO PORTLAND ────────────────────────────────────────────────────────
  -- Cualquier variante: CPN 40, CPN40, Portland, Loma Negra
  UPDATE master_materials SET
    commercial_unit   = COALESCE(commercial_unit,   'bolsa 50 kg'),
    conversion_factor = COALESCE(conversion_factor, 50)
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(TRIM(name)) SIMILAR TO '(cemento|portland)%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mm := v_mm + v_n;

  UPDATE materials SET
    commercial_unit   = COALESCE(commercial_unit,   'bolsa 50 kg'),
    conversion_factor = COALESCE(conversion_factor, 50)
  WHERE organization_id = p_org_id
    AND LOWER(TRIM(name)) SIMILAR TO '(cemento|portland)%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mat := v_mat + v_n;


  -- ── CAL HIDRÁULICA / HIDRATADA ───────────────────────────────────────────────
  -- Cubre: Cal hidráulica, Cal hidratada, Cal hidraulica en polvo, Cal hidratada en polvo
  -- CF=25 (bolsa 25 kg)
  UPDATE master_materials SET
    commercial_unit   = COALESCE(commercial_unit,   'bolsa 25 kg'),
    conversion_factor = COALESCE(conversion_factor, 25)
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(name) SIMILAR TO 'cal hidr(á|a)(ulica|atada)%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mm := v_mm + v_n;

  UPDATE materials SET
    commercial_unit   = COALESCE(commercial_unit,   'bolsa 25 kg'),
    conversion_factor = COALESCE(conversion_factor, 25)
  WHERE organization_id = p_org_id
    AND LOWER(name) SIMILAR TO 'cal hidr(á|a)(ulica|atada)%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mat := v_mat + v_n;


  -- ── CAL AÉREA / EN POLVO ────────────────────────────────────────────────────
  -- Cubre: Cal aérea en polvo, cal aerea en polvo
  -- CF=20 (bolsa 20 kg) — distinta a cal hidráulica
  UPDATE master_materials SET
    commercial_unit   = COALESCE(commercial_unit,   'bolsa 20 kg'),
    conversion_factor = COALESCE(conversion_factor, 20)
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(name) SIMILAR TO 'cal a(é|e)rea%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mm := v_mm + v_n;

  UPDATE materials SET
    commercial_unit   = COALESCE(commercial_unit,   'bolsa 20 kg'),
    conversion_factor = COALESCE(conversion_factor, 20)
  WHERE organization_id = p_org_id
    AND LOWER(name) SIMILAR TO 'cal a(é|e)rea%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mat := v_mat + v_n;


  -- ── YESO DE CONSTRUCCIÓN ────────────────────────────────────────────────────
  UPDATE master_materials SET
    commercial_unit   = COALESCE(commercial_unit,   'bolsa 40 kg'),
    conversion_factor = COALESCE(conversion_factor, 40)
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(TRIM(name)) LIKE 'yeso%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mm := v_mm + v_n;

  UPDATE materials SET
    commercial_unit   = COALESCE(commercial_unit,   'bolsa 40 kg'),
    conversion_factor = COALESCE(conversion_factor, 40)
  WHERE organization_id = p_org_id
    AND LOWER(TRIM(name)) LIKE 'yeso%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mat := v_mat + v_n;


  -- ── ADHESIVO PARA CERÁMICOS ──────────────────────────────────────────────────
  UPDATE master_materials SET
    commercial_unit   = COALESCE(commercial_unit,   'bolsa 25 kg'),
    conversion_factor = COALESCE(conversion_factor, 25)
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(TRIM(name)) SIMILAR TO 'adhesivo%cer(á|a)mic%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mm := v_mm + v_n;

  UPDATE materials SET
    commercial_unit   = COALESCE(commercial_unit,   'bolsa 25 kg'),
    conversion_factor = COALESCE(conversion_factor, 25)
  WHERE organization_id = p_org_id
    AND LOWER(TRIM(name)) SIMILAR TO 'adhesivo%cer(á|a)mic%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mat := v_mat + v_n;


  -- ── GROUT DE NIVELACIÓN ──────────────────────────────────────────────────────
  UPDATE master_materials SET
    commercial_unit   = COALESCE(commercial_unit,   'bolsa 25 kg'),
    conversion_factor = COALESCE(conversion_factor, 25)
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(TRIM(name)) LIKE 'grout%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mm := v_mm + v_n;

  UPDATE materials SET
    commercial_unit   = COALESCE(commercial_unit,   'bolsa 25 kg'),
    conversion_factor = COALESCE(conversion_factor, 25)
  WHERE organization_id = p_org_id
    AND LOWER(TRIM(name)) LIKE 'grout%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mat := v_mat + v_n;


  -- ── PINTURA LÁTEX (interior y exterior) ──────────────────────────────────────
  UPDATE master_materials SET
    commercial_unit   = COALESCE(commercial_unit,   'balde 20 lt'),
    conversion_factor = COALESCE(conversion_factor, 20)
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(TRIM(name)) SIMILAR TO 'pintura l(á|a)tex%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mm := v_mm + v_n;

  UPDATE materials SET
    commercial_unit   = COALESCE(commercial_unit,   'balde 20 lt'),
    conversion_factor = COALESCE(conversion_factor, 20)
  WHERE organization_id = p_org_id
    AND LOWER(TRIM(name)) SIMILAR TO 'pintura l(á|a)tex%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mat := v_mat + v_n;


  -- ── FIJADOR DE PAREDES ───────────────────────────────────────────────────────
  UPDATE master_materials SET
    commercial_unit   = COALESCE(commercial_unit,   'balde 20 lt'),
    conversion_factor = COALESCE(conversion_factor, 20)
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(TRIM(name)) LIKE 'fijador%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mm := v_mm + v_n;

  UPDATE materials SET
    commercial_unit   = COALESCE(commercial_unit,   'balde 20 lt'),
    conversion_factor = COALESCE(conversion_factor, 20)
  WHERE organization_id = p_org_id
    AND LOWER(TRIM(name)) LIKE 'fijador%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mat := v_mat + v_n;


  -- ── ENDUIDO PLÁSTICO ─────────────────────────────────────────────────────────
  UPDATE master_materials SET
    commercial_unit   = COALESCE(commercial_unit,   'balde 30 kg'),
    conversion_factor = COALESCE(conversion_factor, 30)
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(TRIM(name)) LIKE 'enduido%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mm := v_mm + v_n;

  UPDATE materials SET
    commercial_unit   = COALESCE(commercial_unit,   'balde 30 kg'),
    conversion_factor = COALESCE(conversion_factor, 30)
  WHERE organization_id = p_org_id
    AND LOWER(TRIM(name)) LIKE 'enduido%'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mat := v_mat + v_n;


  -- ── CAÑO PVC ─────────────────────────────────────────────────────────────────
  -- Vendido en varillas de 3 m. CF=3 (1 caño = 3 m técnicos).
  -- Cubre: Caño PVC 110 mm, Caño PVC 63 mm, Caño PVC 50 mm, etc.
  UPDATE master_materials SET
    commercial_unit   = COALESCE(commercial_unit,   'caño 3 m'),
    conversion_factor = COALESCE(conversion_factor, 3)
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(TRIM(name)) SIMILAR TO 'ca(ñ|n)o pvc%'
    AND unit = 'm'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mm := v_mm + v_n;

  UPDATE materials SET
    commercial_unit   = COALESCE(commercial_unit,   'caño 3 m'),
    conversion_factor = COALESCE(conversion_factor, 3)
  WHERE organization_id = p_org_id
    AND LOWER(TRIM(name)) SIMILAR TO 'ca(ñ|n)o pvc%'
    AND unit = 'm'
    AND (commercial_unit IS NULL OR conversion_factor IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mat := v_mat + v_n;


  -- ── HIERRO / ACERO (solo commercial_unit — sin CF numérico) ─────────────────
  -- El peso por barra varía por diámetro: no hay un CF único correcto.
  -- Se registra commercial_unit como referencia informativa sin conversion_factor,
  -- así purchaseQty queda NULL y el usuario decide la cantidad de barras manualmente.
  UPDATE master_materials SET
    commercial_unit = COALESCE(commercial_unit, 'barra 12 m')
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(TRIM(name)) SIMILAR TO '(hierro|acero|barra|varilla)(.*)(nervado|liso|adn|ado|\ø|\d+\s*mm)%'
    AND unit = 'kg'
    AND commercial_unit IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mm := v_mm + v_n;

  UPDATE materials SET
    commercial_unit = COALESCE(commercial_unit, 'barra 12 m')
  WHERE organization_id = p_org_id
    AND LOWER(TRIM(name)) SIMILAR TO '(hierro|acero|barra|varilla)(.*)(nervado|liso|adn|ado|\ø|\d+\s*mm)%'
    AND unit = 'kg'
    AND commercial_unit IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mat := v_mat + v_n;


  -- ── ARENA / ÁRIDOS (m3 → sin conversión necesaria) ──────────────────────────
  -- Unidad técnica = unidad comercial = m3. No se asigna CF.
  -- Solo registrar commercial_unit='m3' para coherencia de display.
  UPDATE master_materials SET
    commercial_unit = COALESCE(commercial_unit, 'm³')
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(TRIM(name)) SIMILAR TO '(arena|árido|arido|piedra|tosca|canto rodado|pedregullo)%'
    AND unit IN ('m3', 'm³')
    AND commercial_unit IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mm := v_mm + v_n;

  UPDATE materials SET
    commercial_unit = COALESCE(commercial_unit, 'm³')
  WHERE organization_id = p_org_id
    AND LOWER(TRIM(name)) SIMILAR TO '(arena|árido|arido|piedra|tosca|canto rodado|pedregullo)%'
    AND unit IN ('m3', 'm³')
    AND commercial_unit IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mat := v_mat + v_n;


  -- ── HORMIGÓN ELABORADO (m3 → sin conversión) ─────────────────────────────────
  UPDATE master_materials SET
    commercial_unit = COALESCE(commercial_unit, 'm³')
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(TRIM(name)) SIMILAR TO 'hormig(ó|o)n%'
    AND unit IN ('m3', 'm³')
    AND commercial_unit IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mm := v_mm + v_n;

  UPDATE materials SET
    commercial_unit = COALESCE(commercial_unit, 'm³')
  WHERE organization_id = p_org_id
    AND LOWER(TRIM(name)) SIMILAR TO 'hormig(ó|o)n%'
    AND unit IN ('m3', 'm³')
    AND commercial_unit IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_mat := v_mat + v_n;


  RETURN jsonb_build_object(
    'master_materials_updated', v_mm,
    'materials_updated',        v_mat,
    'total_updated',            v_mm + v_mat,
    'org_id',                   p_org_id,
    'run_at',                   now()
  );
END;
$$;


ALTER FUNCTION "public"."apply_commercial_rules"("p_org_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."apply_commercial_rules"("p_org_id" "text") IS 'Asigna commercial_unit y conversion_factor por patrones de nombre para materiales conocidos (cemento, cal, ladrillos, hormigón, áridos, pinturas, etc.). Idempotente: solo actualiza donde ambos campos son NULL. Nunca pisa valores ya existentes. Jerarquía: hierro/acero → solo commercial_unit sin CF (CF varía por diámetro). Áridos/hormigón → solo commercial_unit=m³ sin CF (m3 técnico = comercial). Ejecución: SELECT apply_commercial_rules(''<UUID-ORG>'');';



CREATE OR REPLACE FUNCTION "public"."audit_master_catalog"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.audit_log
    (actor_id, operation, entity, entity_id, before_data, after_data)
  VALUES (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    COALESCE((NEW.id)::text, (OLD.id)::text),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW)  ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."audit_master_catalog"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bootstrap_organization"("org_name" "text", "org_slug" "text", "user_full_name" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_org_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.organizations (name, slug)
  values (org_name, org_slug)
  returning id into v_org_id;

  insert into public.profiles (id, full_name, default_organization_id)
  values (v_user_id, user_full_name, v_org_id)
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    default_organization_id = excluded.default_organization_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org_id, v_user_id, 'owner')
  on conflict (organization_id, user_id) do update
  set role = 'owner';
end;
$$;


ALTER FUNCTION "public"."bootstrap_organization"("org_name" "text", "org_slug" "text", "user_full_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calc_index_variation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_prev numeric;
BEGIN
  SELECT value INTO v_prev
  FROM public.cost_index_values
  WHERE index_id = NEW.index_id
    AND (period_year * 12 + period_month) = (NEW.period_year * 12 + NEW.period_month) - 1;

  IF v_prev IS NOT NULL AND v_prev <> 0 THEN
    NEW.variation_pct := ROUND(((NEW.value - v_prev) / v_prev) * 100, 4);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."calc_index_variation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_consolidated_resources"("p_items" "jsonb", "p_organization_id" "text", "p_cost_date" "date" DEFAULT CURRENT_DATE) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object(
      'materials',  '[]'::jsonb,
      'labor',      '[]'::jsonb,
      'equipment',  '[]'::jsonb,
      'apuSummary', '[]'::jsonb,
      'totals',     jsonb_build_object('material',0,'labor',0,'equipment',0,'grandTotal',0),
      'computedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    );
  END IF;

  WITH
  input_items AS (
    SELECT
      elem->>'master_task_id'      AS task_id,
      (elem->>'quantity')::numeric AS qty
    FROM jsonb_array_elements(p_items) AS elem
    WHERE (elem->>'quantity')::numeric > 0
  ),

  valid_tasks AS (
    SELECT
      mt.id,
      mt.id::text   AS id_txt,
      mt.name,
      mt.daily_yield,
      ii.qty        AS req_qty
    FROM master_tasks mt
    INNER JOIN input_items ii ON ii.task_id = mt.id::text
    WHERE mt.is_active = true
      AND mt.organization_id::text = p_organization_id
  ),

  -- PATH A: master_task_materials
  leg_mat AS (
    SELECT
      vt.id_txt                                                              AS task_id,
      vt.name                                                                AS task_name,
      vt.req_qty,
      COALESCE(mtm.master_material_id::text, LOWER(TRIM(mtm.material_name))) AS agg_key,
      COALESCE(mm.code, '')                                                  AS code,
      mtm.material_name                                                      AS rname,
      mtm.unit,
      COALESCE(mtm.conversion_factor, 1.0)                                   AS conv_factor,
      mtm.commercial_unit,
      mtm.quantity * (1.0 + COALESCE(mtm.waste_percent, 0) / 100.0)        AS qty_pu,
      COALESCE(mm.unit_price, mtm.last_known_unit_price, 0)                 AS uprice
    FROM valid_tasks vt
    INNER JOIN master_task_materials mtm ON mtm.master_task_id = vt.id
    LEFT  JOIN master_materials mm
           ON mm.id = mtm.master_material_id AND mm.is_active = true
  ),

  leg_lab AS (
    SELECT
      vt.id_txt  AS task_id,
      vt.name    AS task_name,
      vt.req_qty,
      mtl.labor_category_id AS agg_key,
      COALESCE(lc.role, mtl.labor_category_name) AS rname,
      'HH'       AS unit,
      CASE WHEN vt.daily_yield > 0
           THEN (mtl.quantity * 9.0) / vt.daily_yield
           ELSE 0
      END        AS qty_pu,
      COALESCE(
        lc.basic_hourly_rate * (1.0 + (COALESCE(lc.social_charges_percent,0) + COALESCE(lc.insurance_percent,0)) / 100.0),
        mtl.snapshot_hourly_rate,
        0
      ) AS uprice
    FROM valid_tasks vt
    INNER JOIN master_task_labor mtl ON mtl.master_task_id = vt.id
    LEFT  JOIN labor_categories lc ON lc.id::text = mtl.labor_category_id
  ),

  leg_equ AS (
    SELECT
      vt.id_txt  AS task_id,
      vt.name    AS task_name,
      vt.req_qty,
      mte.tool_id AS agg_key,
      COALESCE(t.name, mte.tool_name) AS rname,
      'HM'       AS unit,
      mte.hours_per_unit AS qty_pu,
      COALESCE(t.cost_per_hour, mte.snapshot_cost_per_hour, 0) AS uprice
    FROM valid_tasks vt
    INNER JOIN master_task_equipment mte ON mte.master_task_id = vt.id
    LEFT  JOIN tools t ON t.id::text = mte.tool_id
  ),

  -- PATH B: catalog_task_yields (all conversion columns now exist after 056 + 057)
  catalog_tasks AS (
    SELECT vt.id_txt, vt.name, vt.daily_yield, vt.req_qty
    FROM valid_tasks vt
    WHERE NOT EXISTS (SELECT 1 FROM master_task_materials WHERE master_task_id = vt.id)
      AND NOT EXISTS (SELECT 1 FROM master_task_labor    WHERE master_task_id = vt.id)
      AND NOT EXISTS (SELECT 1 FROM master_task_equipment WHERE master_task_id = vt.id)
  ),

  cat_yields AS (
    SELECT
      ct.id_txt    AS task_id,
      ct.name      AS task_name,
      ct.daily_yield,
      ct.req_qty,
      cty.quantity,
      r.id::text   AS resource_id,
      r.name       AS resource_name,
      r.unit       AS resource_unit,
      COALESCE(r.base_cost, 0) AS base_cost,
      r.type       AS resource_type,
      COALESCE(cty.conversion_factor, r.conversion_factor, 1.0) AS conv_factor,
      COALESCE(cty.commercial_unit,   r.commercial_unit)         AS commercial_unit
    FROM catalog_tasks ct
    INNER JOIN catalog_task_yields cty ON cty.master_task_id = ct.id_txt::uuid
    INNER JOIN resources r ON r.id = cty.resource_id AND r.is_active = true
  ),

  cat_mat AS (
    SELECT task_id, task_name, req_qty, resource_id AS agg_key, '' AS code,
           resource_name AS rname, resource_unit AS unit,
           conv_factor, commercial_unit, quantity AS qty_pu, base_cost AS uprice
    FROM cat_yields WHERE resource_type IN ('MATERIAL', 'SUBCONTRACT')
  ),

  cat_lab AS (
    SELECT task_id, task_name, req_qty, resource_id AS agg_key,
           resource_name AS rname, 'HH' AS unit, quantity AS qty_pu, base_cost AS uprice
    FROM cat_yields WHERE resource_type = 'LABOR'
  ),

  cat_equ AS (
    SELECT task_id, task_name, req_qty, resource_id AS agg_key,
           resource_name AS rname, 'HM' AS unit, quantity AS qty_pu, base_cost AS uprice
    FROM cat_yields WHERE resource_type = 'EQUIPMENT'
  ),

  all_mat AS (
    SELECT task_id, task_name, req_qty, agg_key, code, rname, unit, conv_factor, commercial_unit, qty_pu, uprice FROM leg_mat
    UNION ALL
    SELECT task_id, task_name, req_qty, agg_key, code, rname, unit, conv_factor, commercial_unit, qty_pu, uprice FROM cat_mat
  ),

  all_lab AS (
    SELECT task_id, task_name, req_qty, agg_key, rname, unit, qty_pu, uprice FROM leg_lab
    UNION ALL
    SELECT task_id, task_name, req_qty, agg_key, rname, unit, qty_pu, uprice FROM cat_lab
  ),

  all_equ AS (
    SELECT task_id, task_name, req_qty, agg_key, rname, unit, qty_pu, uprice FROM leg_equ
    UNION ALL
    SELECT task_id, task_name, req_qty, agg_key, rname, unit, qty_pu, uprice FROM cat_equ
  ),

  agg_mat AS (
    SELECT
      agg_key,
      MAX(code)                                        AS code,
      MAX(rname)                                       AS rname,
      MAX(unit)                                        AS unit,
      MAX(conv_factor)                                 AS conv_factor,
      MAX(commercial_unit)                             AS commercial_unit,
      SUM(qty_pu * req_qty)                            AS total_qty,
      SUM(qty_pu * req_qty * uprice)                   AS total_cost,
      array_agg(DISTINCT task_name ORDER BY task_name) AS sources
    FROM all_mat
    GROUP BY agg_key
  ),

  agg_lab AS (
    SELECT
      agg_key,
      MAX(rname)                                       AS rname,
      MAX(unit)                                        AS unit,
      SUM(qty_pu * req_qty)                            AS total_qty,
      SUM(qty_pu * req_qty * uprice)                   AS total_cost,
      array_agg(DISTINCT task_name ORDER BY task_name) AS sources
    FROM all_lab
    GROUP BY agg_key
  ),

  agg_equ AS (
    SELECT
      agg_key,
      MAX(rname)                                       AS rname,
      MAX(unit)                                        AS unit,
      SUM(qty_pu * req_qty)                            AS total_qty,
      SUM(qty_pu * req_qty * uprice)                   AS total_cost,
      array_agg(DISTINCT task_name ORDER BY task_name) AS sources
    FROM all_equ
    GROUP BY agg_key
  ),

  apu_costs     AS (SELECT task_id, SUM(qty_pu * uprice) AS mat_uc FROM all_mat GROUP BY task_id),
  apu_lab_costs AS (SELECT task_id, SUM(qty_pu * uprice) AS lab_uc FROM all_lab GROUP BY task_id),
  apu_equ_costs AS (SELECT task_id, SUM(qty_pu * uprice) AS equ_uc FROM all_equ GROUP BY task_id)

  SELECT jsonb_build_object(

    'materials', COALESCE((
      SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'resourceId',       agg_key,
        'code',             NULLIF(code, ''),
        'name',             rname,
        'unit',             unit,
        'totalQuantity',    ROUND(total_qty::numeric, 4),
        'unitCost',         ROUND(CASE WHEN total_qty > 0 THEN total_cost / total_qty ELSE 0 END::numeric, 2),
        'totalCost',        ROUND(total_cost::numeric, 2),
        'conversionFactor', CASE WHEN conv_factor > 1 THEN conv_factor ELSE NULL END,
        'commercialUnit',   commercial_unit,
        'purchaseQuantity', CASE WHEN conv_factor > 1 THEN CEIL(total_qty / conv_factor)::integer ELSE NULL END,
        'sourceTaskNames',  sources
      )) ORDER BY rname)
      FROM agg_mat
    ), '[]'::jsonb),

    'labor', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'resourceId',      agg_key,
        'name',            rname,
        'unit',            unit,
        'totalQuantity',   ROUND(total_qty::numeric, 4),
        'unitCost',        ROUND(CASE WHEN total_qty > 0 THEN total_cost / total_qty ELSE 0 END::numeric, 2),
        'totalCost',       ROUND(total_cost::numeric, 2),
        'sourceTaskNames', sources
      ) ORDER BY rname)
      FROM agg_lab
    ), '[]'::jsonb),

    'equipment', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'resourceId',      agg_key,
        'name',            rname,
        'unit',            unit,
        'totalQuantity',   ROUND(total_qty::numeric, 4),
        'unitCost',        ROUND(CASE WHEN total_qty > 0 THEN total_cost / total_qty ELSE 0 END::numeric, 2),
        'totalCost',       ROUND(total_cost::numeric, 2),
        'sourceTaskNames', sources
      ) ORDER BY rname)
      FROM agg_equ
    ), '[]'::jsonb),

    'apuSummary', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'masterTaskId', vt.id_txt,
        'name',         vt.name,
        'requestedQty', vt.req_qty,
        'unitCosts', jsonb_build_object(
          'material',  ROUND(COALESCE(ac.mat_uc,  0)::numeric, 2),
          'labor',     ROUND(COALESCE(alc.lab_uc, 0)::numeric, 2),
          'equipment', ROUND(COALESCE(aec.equ_uc, 0)::numeric, 2),
          'total',     ROUND((COALESCE(ac.mat_uc,0)+COALESCE(alc.lab_uc,0)+COALESCE(aec.equ_uc,0))::numeric, 2)
        )
      ) ORDER BY vt.name)
      FROM valid_tasks vt
      LEFT JOIN apu_costs     ac  ON ac.task_id  = vt.id_txt
      LEFT JOIN apu_lab_costs alc ON alc.task_id = vt.id_txt
      LEFT JOIN apu_equ_costs aec ON aec.task_id = vt.id_txt
    ), '[]'::jsonb),

    'totals', jsonb_build_object(
      'material',   COALESCE((SELECT ROUND(SUM(total_cost)::numeric, 2) FROM agg_mat), 0),
      'labor',      COALESCE((SELECT ROUND(SUM(total_cost)::numeric, 2) FROM agg_lab), 0),
      'equipment',  COALESCE((SELECT ROUND(SUM(total_cost)::numeric, 2) FROM agg_equ), 0),
      'grandTotal',
        COALESCE((SELECT ROUND(SUM(total_cost)::numeric, 2) FROM agg_mat), 0) +
        COALESCE((SELECT ROUND(SUM(total_cost)::numeric, 2) FROM agg_lab), 0) +
        COALESCE((SELECT ROUND(SUM(total_cost)::numeric, 2) FROM agg_equ), 0)
    ),

    'computedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')

  )
  INTO v_result;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;


ALTER FUNCTION "public"."calculate_consolidated_resources"("p_items" "jsonb", "p_organization_id" "text", "p_cost_date" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."calculate_consolidated_resources"("p_items" "jsonb", "p_organization_id" "text", "p_cost_date" "date") IS 'v3 (migration 057): resources.conversion_factor + commercial_unit now exist. PATH A: master_task_materials. PATH B: catalog_task_yields + resources. All conversion columns guarded with COALESCE(..., 1.0).';



CREATE OR REPLACE FUNCTION "public"."clone_master_task_to_org"("p_master_task_id" "uuid", "p_organization_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."clone_master_task_to_org"("p_master_task_id" "uuid", "p_organization_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."clone_master_task_to_org"("p_master_task_id" "uuid", "p_organization_id" "uuid") IS 'Deep copy de un APU global (organization_id IS NULL) al entorno privado de una organización.
   Clona la master_task, sus resources globales y sus catalog_task_yields.
   Idempotente: devuelve el clon existente si ya fue clonado previamente.
   Concurrencia: usa pg_advisory_xact_lock para evitar doble clon simultáneo.
   Requiere rol owner/admin/editor en la organización destino.';



CREATE OR REPLACE FUNCTION "public"."current_tenant_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    NULLIF((auth.jwt() -> 'app_metadata' ->> 'organization_id'), '')::uuid,
    NULLIF(current_setting('app.tenant_id', true), '')::uuid
  )
$$;


ALTER FUNCTION "public"."current_tenant_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."detect_duplicate_apu_codes"("p_organization_id" "text") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
WITH
dup_by_code AS (
  SELECT
    code,
    count(*)                                           AS qty,
    array_agg(jsonb_build_object(
      'id',   id,
      'name', name,
      'code', code,
      'isActive', is_active
    ) ORDER BY name)                                   AS tasks
  FROM master_tasks
  WHERE organization_id::text = p_organization_id
    AND code IS NOT NULL
  GROUP BY code
  HAVING count(*) > 1
),
dup_by_name AS (
  SELECT
    name,
    count(*)                                           AS qty,
    array_agg(jsonb_build_object(
      'id',   id,
      'name', name,
      'code', code,
      'isActive', is_active
    ) ORDER BY code NULLS LAST)                        AS tasks
  FROM master_tasks
  WHERE organization_id::text = p_organization_id
  GROUP BY name
  HAVING count(*) > 1
)
SELECT jsonb_build_object(
  'duplicatesByCode', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'code', code, 'count', qty, 'tasks', tasks
    ) ORDER BY code)
    FROM dup_by_code
  ), '[]'::jsonb),
  'duplicatesByName', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'name', name, 'count', qty, 'tasks', tasks
    ) ORDER BY name)
    FROM dup_by_name
  ), '[]'::jsonb),
  'checkedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
);
$$;


ALTER FUNCTION "public"."detect_duplicate_apu_codes"("p_organization_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."detect_duplicate_apu_codes"("p_organization_id" "text") IS 'Detecta APUs con código o nombre duplicado en la organización. Incluye activos e inactivos para detectar conflictos de nombrado legacy/nuevo.';



CREATE OR REPLACE FUNCTION "public"."generate_monthly_snapshots"("p_tenant_id" "uuid", "p_year" smallint, "p_month" smallint, "p_overwrite" boolean DEFAULT false) RETURNS TABLE("resource_id" "uuid", "resource_code" "text", "rule_type" "public"."pricing_rule_type", "cost" numeric, "status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_eff_date         date;
  v_rule             record;
  v_base_idx_val     numeric;
  v_curr_idx_val     numeric;
  v_factor           numeric;
  v_cost             numeric;
  v_status           text;
  v_src              public.snapshot_source_type;
  -- LABOR_FORMULA
  v_base_hourly      numeric;
  v_hours            numeric;
  v_multiplier       numeric;
  v_lf_index_id      uuid;
  v_lf_base_yr       smallint;
  v_lf_base_mo       smallint;
  -- COMPOSITE_INDEX
  v_comp_row         jsonb;
  v_comp_index_id    uuid;
  v_comp_weight      numeric;
  v_comp_base_yr     smallint;
  v_comp_base_mo     smallint;
  v_comp_base_val    numeric;
  v_comp_curr_val    numeric;
  v_weighted_sum     numeric;
  v_comps            jsonb;
  v_i                int;
BEGIN
  IF NOT is_org_member_with_role(p_tenant_id, ARRAY['owner','admin','editor']) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: tenant %', p_tenant_id;
  END IF;

  v_eff_date := make_date(p_year::int, p_month::int, 1);

  -- Itera la regla de mayor prioridad activa por recurso
  FOR v_rule IN
    SELECT DISTINCT ON (rpr.resource_id)
      rpr.*,
      r.code AS res_code
    FROM public.resource_pricing_rules rpr
    JOIN public.resources r ON r.id = rpr.resource_id
    WHERE rpr.tenant_id = p_tenant_id
      AND rpr.is_active = true
    ORDER BY rpr.resource_id, rpr.priority DESC
  LOOP
    v_cost   := NULL;
    v_status := 'error';
    v_src    := NULL;

    -- Skip si ya existe snapshot para este período y no se quiere sobreescribir
    -- Se evalúa por cualquier source distinto de FALLBACK (conservador: protege todo tipo)
    IF NOT p_overwrite AND EXISTS (
      SELECT 1 FROM public.resource_cost_snapshots
      WHERE tenant_id    = p_tenant_id
        AND resource_id  = v_rule.resource_id
        AND effective_date = v_eff_date
        AND source_type   <> 'FALLBACK_BASE_COST'
    ) THEN
      resource_id   := v_rule.resource_id;
      resource_code := v_rule.res_code;
      rule_type     := v_rule.rule_type;
      cost          := NULL;
      status        := 'skipped';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- ── FIXED_MANUAL ────────────────────────────────────────────────────────
    IF v_rule.rule_type = 'FIXED_MANUAL' THEN
      v_cost   := v_rule.base_cost;
      v_src    := 'MANUAL';
      v_status := 'created';

    -- ── DIRECT_IMPORT ────────────────────────────────────────────────────────
    ELSIF v_rule.rule_type = 'DIRECT_IMPORT' THEN
      resource_id   := v_rule.resource_id;
      resource_code := v_rule.res_code;
      rule_type     := v_rule.rule_type;
      cost          := NULL;
      status        := 'skipped: requiere importación directa';
      RETURN NEXT;
      CONTINUE;

    -- ── INDEX_MULTIPLIER ─────────────────────────────────────────────────────
    ELSIF v_rule.rule_type = 'INDEX_MULTIPLIER' THEN
      SELECT value INTO v_base_idx_val
      FROM public.cost_index_values
      WHERE index_id     = v_rule.index_id
        AND period_year  = EXTRACT(YEAR  FROM v_rule.base_date)::smallint
        AND period_month = EXTRACT(MONTH FROM v_rule.base_date)::smallint;

      SELECT value INTO v_curr_idx_val
      FROM public.cost_index_values
      WHERE index_id     = v_rule.index_id
        AND period_year  = p_year
        AND period_month = p_month;

      IF v_base_idx_val IS NULL OR v_curr_idx_val IS NULL OR v_base_idx_val = 0 THEN
        resource_id := v_rule.resource_id; resource_code := v_rule.res_code;
        rule_type := v_rule.rule_type; cost := NULL;
        status := 'error: índice sin valor para el período'; RETURN NEXT; CONTINUE;
      END IF;

      v_factor := v_curr_idx_val / v_base_idx_val;
      v_cost   := ROUND(v_rule.base_cost * v_factor, 4);
      v_src    := 'INDEX_CALCULATION';
      v_status := 'created';

    -- ── LABOR_FORMULA ────────────────────────────────────────────────────────
    ELSIF v_rule.rule_type = 'LABOR_FORMULA' THEN
      v_base_hourly  := (v_rule.formula_config ->>'base_hourly_rate')::numeric;
      v_hours        := COALESCE((v_rule.formula_config ->>'hours_per_unit')::numeric, 1);
      v_multiplier   := COALESCE((v_rule.formula_config ->>'category_multiplier')::numeric, 1);
      v_lf_index_id  := (v_rule.formula_config ->>'index_id')::uuid;
      v_lf_base_yr   := (v_rule.formula_config -> 'base_period' ->>'year')::smallint;
      v_lf_base_mo   := (v_rule.formula_config -> 'base_period' ->>'month')::smallint;

      SELECT value INTO v_base_idx_val FROM public.cost_index_values
      WHERE index_id = v_lf_index_id AND period_year = v_lf_base_yr AND period_month = v_lf_base_mo;

      SELECT value INTO v_curr_idx_val FROM public.cost_index_values
      WHERE index_id = v_lf_index_id AND period_year = p_year AND period_month = p_month;

      IF v_base_idx_val IS NULL OR v_curr_idx_val IS NULL OR v_base_idx_val = 0 THEN
        resource_id := v_rule.resource_id; resource_code := v_rule.res_code;
        rule_type := v_rule.rule_type; cost := NULL;
        status := 'error: índice laboral sin valor'; RETURN NEXT; CONTINUE;
      END IF;

      v_factor := v_curr_idx_val / v_base_idx_val;
      v_cost   := ROUND(v_base_hourly * v_hours * v_multiplier * v_factor, 4);
      v_src    := 'LABOR_CALCULATION';
      v_status := 'created';

    -- ── COMPOSITE_INDEX ──────────────────────────────────────────────────────
    ELSIF v_rule.rule_type = 'COMPOSITE_INDEX' THEN
      v_comps        := v_rule.formula_config -> 'components';
      v_weighted_sum := 0;

      FOR v_i IN 0 .. jsonb_array_length(v_comps) - 1 LOOP
        v_comp_row       := v_comps -> v_i;
        v_comp_index_id  := (v_comp_row ->>'index_id')::uuid;
        v_comp_weight    := (v_comp_row ->>'weight')::numeric;
        v_comp_base_yr   := (v_comp_row -> 'base_period' ->>'year')::smallint;
        v_comp_base_mo   := (v_comp_row -> 'base_period' ->>'month')::smallint;

        SELECT value INTO v_comp_base_val FROM public.cost_index_values
        WHERE index_id = v_comp_index_id AND period_year = v_comp_base_yr AND period_month = v_comp_base_mo;

        SELECT value INTO v_comp_curr_val FROM public.cost_index_values
        WHERE index_id = v_comp_index_id AND period_year = p_year AND period_month = p_month;

        IF v_comp_base_val IS NULL OR v_comp_curr_val IS NULL OR v_comp_base_val = 0 THEN
          v_weighted_sum := NULL; EXIT;
        END IF;

        v_weighted_sum := v_weighted_sum + v_comp_weight * (v_comp_curr_val / v_comp_base_val);
      END LOOP;

      IF v_weighted_sum IS NULL THEN
        resource_id := v_rule.resource_id; resource_code := v_rule.res_code;
        rule_type := v_rule.rule_type; cost := NULL;
        status := 'error: componente compuesto sin valor'; RETURN NEXT; CONTINUE;
      END IF;

      v_cost   := ROUND(v_rule.base_cost * v_weighted_sum, 4);
      v_src    := 'COMPOSITE_CALCULATION';
      v_status := 'created';
    END IF;

    -- ── Insertar snapshot ─────────────────────────────────────────────────────
    -- FIX 2: ON CONFLICT condicional según p_overwrite
    --   p_overwrite=true  → DO UPDATE (sobreescribe el snapshot existente)
    --   p_overwrite=false → DO NOTHING (defensa en profundidad ante race conditions)
    -- El trigger sync_current_snapshot_cache actualiza resources.current_snapshot_id
    IF v_cost IS NOT NULL THEN
      IF p_overwrite THEN
        INSERT INTO public.resource_cost_snapshots (
          tenant_id, resource_id, effective_date, cost, currency,
          source_type, pricing_rule_id, index_id,
          index_base_value, index_current_value, adjustment_factor,
          metadata
        ) VALUES (
          p_tenant_id, v_rule.resource_id, v_eff_date, v_cost, 'ARS', v_src,
          v_rule.id,
          CASE WHEN v_rule.rule_type = 'INDEX_MULTIPLIER' THEN v_rule.index_id ELSE NULL END,
          CASE WHEN v_rule.rule_type = 'INDEX_MULTIPLIER' THEN v_base_idx_val  ELSE NULL END,
          CASE WHEN v_rule.rule_type = 'INDEX_MULTIPLIER' THEN v_curr_idx_val  ELSE NULL END,
          CASE WHEN v_rule.rule_type = 'INDEX_MULTIPLIER' THEN v_factor        ELSE NULL END,
          jsonb_build_object(
            'generated_by', 'generate_monthly_snapshots',
            'rule_name',    v_rule.rule_name,
            'rule_type',    v_rule.rule_type::text
          )
        )
        ON CONFLICT (tenant_id, resource_id, effective_date, source_type)
        DO UPDATE SET
          cost                = EXCLUDED.cost,
          pricing_rule_id     = EXCLUDED.pricing_rule_id,
          index_id            = EXCLUDED.index_id,
          index_base_value    = EXCLUDED.index_base_value,
          index_current_value = EXCLUDED.index_current_value,
          adjustment_factor   = EXCLUDED.adjustment_factor,
          metadata            = EXCLUDED.metadata;
      ELSE
        -- p_overwrite=false: nunca sobreescribir (defensa ante race condition)
        INSERT INTO public.resource_cost_snapshots (
          tenant_id, resource_id, effective_date, cost, currency,
          source_type, pricing_rule_id, index_id,
          index_base_value, index_current_value, adjustment_factor,
          metadata
        ) VALUES (
          p_tenant_id, v_rule.resource_id, v_eff_date, v_cost, 'ARS', v_src,
          v_rule.id,
          CASE WHEN v_rule.rule_type = 'INDEX_MULTIPLIER' THEN v_rule.index_id ELSE NULL END,
          CASE WHEN v_rule.rule_type = 'INDEX_MULTIPLIER' THEN v_base_idx_val  ELSE NULL END,
          CASE WHEN v_rule.rule_type = 'INDEX_MULTIPLIER' THEN v_curr_idx_val  ELSE NULL END,
          CASE WHEN v_rule.rule_type = 'INDEX_MULTIPLIER' THEN v_factor        ELSE NULL END,
          jsonb_build_object(
            'generated_by', 'generate_monthly_snapshots',
            'rule_name',    v_rule.rule_name,
            'rule_type',    v_rule.rule_type::text
          )
        )
        ON CONFLICT (tenant_id, resource_id, effective_date, source_type)
        DO NOTHING;
      END IF;
      -- Nota: resources.current_snapshot_id se actualiza por trigger
    END IF;

    resource_id   := v_rule.resource_id;
    resource_code := v_rule.res_code;
    rule_type     := v_rule.rule_type;
    cost          := v_cost;
    status        := v_status;
    RETURN NEXT;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."generate_monthly_snapshots"("p_tenant_id" "uuid", "p_year" smallint, "p_month" smallint, "p_overwrite" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_apu_technical_report"("p_master_task_id" "uuid", "p_organization_id" "text", "p_cost_date" "date" DEFAULT CURRENT_DATE) RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
WITH

task_hdr AS (
  SELECT
    mt.id,
    mt.code,
    mt.name,
    mt.unit,
    mt.category,
    mt.description,
    mt.specifications,
    mt.daily_yield,
    COALESCE(mt.fixed_cost, 0)             AS fixed_cost,
    mt.fixed_cost_description
  FROM master_tasks mt
  WHERE mt.id              = p_master_task_id
    AND mt.organization_id::text = p_organization_id
    AND mt.is_active       = true
),

path_flag AS (
  SELECT (
    EXISTS (SELECT 1 FROM master_task_materials WHERE master_task_id = p_master_task_id)
    OR EXISTS (SELECT 1 FROM master_task_labor    WHERE master_task_id = p_master_task_id)
    OR EXISTS (SELECT 1 FROM master_task_equipment WHERE master_task_id = p_master_task_id)
  ) AS is_path_a
),


a_mat AS (
  SELECT
    mtm.id::text                                                      AS line_id,
    'MATERIAL'::text                                                  AS rtype,
    COALESCE(mm.code, '')                                             AS rcode,
    mtm.material_name                                                 AS rname,
    mtm.unit,
    mtm.quantity,
    COALESCE(mtm.conversion_factor, 1.0)                             AS conv_factor,
    COALESCE(mtm.waste_percent, 0)                                    AS waste_pct,
    NULL::numeric                                                     AS workers,
    NULL::numeric                                                     AS hours_pu,
    COALESCE(mm.unit_price, mtm.last_known_unit_price, 0)            AS base_cost,
    NULL::numeric                                                     AS soc_pct,
    CASE
      WHEN mm.unit_price IS NOT NULL          THEN 'RESOURCE_BASE'
      WHEN mtm.last_known_unit_price IS NOT NULL THEN 'LEGACY_PRICE'
      ELSE 'LEGACY_PRICE'
    END                                                               AS cost_src,
    NULL::text                                                        AS line_note
  FROM master_task_materials mtm
  LEFT JOIN master_materials mm
         ON mm.id = mtm.master_material_id AND mm.is_active = true
  WHERE mtm.master_task_id      = p_master_task_id
    AND mtm.sub_master_task_id IS NULL
    AND (SELECT is_path_a FROM path_flag)
),

a_nested AS (
  SELECT
    mtm.id::text                                                      AS line_id,
    'SUBCONTRACT'::text                                               AS rtype,
    ''                                                                AS rcode,
    mtm.material_name                                                 AS rname,
    mtm.unit,
    mtm.quantity,
    1.0::numeric                                                      AS conv_factor,
    COALESCE(mtm.waste_percent, 0)                                    AS waste_pct,
    NULL::numeric                                                     AS workers,
    NULL::numeric                                                     AS hours_pu,
    COALESCE(mtm.last_known_unit_price, 0)                           AS base_cost,
    NULL::numeric                                                     AS soc_pct,
    'LEGACY_PRICE'::text                                              AS cost_src,
    'APU anidado — costo estimado'::text                             AS line_note
  FROM master_task_materials mtm
  WHERE mtm.master_task_id    = p_master_task_id
    AND mtm.sub_master_task_id IS NOT NULL
    AND (SELECT is_path_a FROM path_flag)
),

a_lab AS (
  SELECT
    mtl.id::text                                                                   AS line_id,
    'LABOR'::text                                                                  AS rtype,
    ''                                                                             AS rcode,
    COALESCE(lc.role, mtl.labor_category_name)                                    AS rname,
    'HH'::text                                                                     AS unit,
    mtl.quantity                                                                   AS quantity,
    1.0::numeric                                                                   AS conv_factor,
    0::numeric                                                                     AS waste_pct,
    mtl.quantity                                                                   AS workers,
    CASE WHEN th.daily_yield > 0
         THEN ROUND((mtl.quantity * 9.0) / th.daily_yield, 6)
         ELSE 0
    END                                                                            AS hours_pu,
    COALESCE(lc.basic_hourly_rate, mtl.snapshot_hourly_rate, 0)                  AS base_cost,
    CASE WHEN lc.id IS NOT NULL
         THEN COALESCE(lc.social_charges_percent, 0) + COALESCE(lc.insurance_percent, 0)
         ELSE NULL
    END                                                                            AS soc_pct,
    CASE WHEN lc.id IS NOT NULL THEN 'RESOURCE_BASE' ELSE 'LEGACY_PRICE' END      AS cost_src,
    NULL::text                                                                     AS line_note
  FROM master_task_labor mtl
  CROSS JOIN task_hdr th
  LEFT JOIN labor_categories lc ON lc.id::text = mtl.labor_category_id
  WHERE mtl.master_task_id = p_master_task_id
    AND (SELECT is_path_a FROM path_flag)
),

a_equ AS (
  SELECT
    mte.id::text                                                      AS line_id,
    'EQUIPMENT'::text                                                 AS rtype,
    ''                                                                AS rcode,
    COALESCE(t.name, mte.tool_name)                                   AS rname,
    'HM'::text                                                        AS unit,
    mte.hours_per_unit                                                AS quantity,
    1.0::numeric                                                      AS conv_factor,
    0::numeric                                                        AS waste_pct,
    NULL::numeric                                                     AS workers,
    mte.hours_per_unit                                                AS hours_pu,
    COALESCE(t.cost_per_hour, mte.snapshot_cost_per_hour, 0)         AS base_cost,
    NULL::numeric                                                     AS soc_pct,
    CASE WHEN t.id IS NOT NULL THEN 'RESOURCE_BASE' ELSE 'LEGACY_PRICE' END AS cost_src,
    NULL::text                                                        AS line_note
  FROM master_task_equipment mte
  LEFT JOIN tools t ON t.id::text = mte.tool_id
  WHERE mte.master_task_id = p_master_task_id
    AND (SELECT is_path_a FROM path_flag)
),

b_lines AS (
  SELECT
    cty.id::text                                                               AS line_id,
    r.type::text                                                               AS rtype,
    COALESCE(r.code, '')                                                       AS rcode,
    r.name                                                                     AS rname,
    r.unit,
    cty.quantity,
    1.0::numeric                                                               AS conv_factor,
    0::numeric                                                                 AS waste_pct,
    -- Para LABOR en PATH B: quantity = HH/u directas (sin workers intermedios)
    CASE WHEN r.type = 'LABOR' THEN cty.quantity ELSE NULL END                AS workers,
    CASE WHEN r.type IN ('LABOR','EQUIPMENT') THEN cty.quantity ELSE NULL END AS hours_pu,
    COALESCE(r.base_cost, 0)                                                   AS base_cost,
    CASE WHEN r.type = 'LABOR' THEN COALESCE(r.social_charges_pct, 0)
         ELSE NULL
    END                                                                        AS soc_pct,
    'RESOURCE_BASE'::text                                                      AS cost_src,
    NULL::text                                                                 AS line_note
  FROM catalog_task_yields cty
  JOIN resources r ON r.id = cty.resource_id AND r.is_active = true
  WHERE cty.master_task_id = p_master_task_id
    AND NOT (SELECT is_path_a FROM path_flag)
),

raw_lines AS (
  SELECT * FROM a_mat
  UNION ALL SELECT * FROM a_nested
  UNION ALL SELECT * FROM a_lab
  UNION ALL SELECT * FROM a_equ
  UNION ALL SELECT * FROM b_lines
),

computed AS (
  SELECT
    rl.*,
    -- Costo efectivo por unidad (después de cargas para LABOR, conversión para MAT)
    CASE rl.rtype
      WHEN 'MATERIAL'    THEN rl.base_cost * rl.conv_factor
      WHEN 'LABOR'       THEN rl.base_cost * (1.0 + COALESCE(rl.soc_pct, 0) / 100.0)
      WHEN 'EQUIPMENT'   THEN rl.base_cost
      WHEN 'SUBCONTRACT' THEN rl.base_cost
      ELSE rl.base_cost
    END                                                                AS eff_unit,
    -- Aporte al costo unitario del APU
    CASE rl.rtype
      WHEN 'MATERIAL'    THEN rl.base_cost * rl.conv_factor
                              * rl.quantity * (1.0 + rl.waste_pct / 100.0)
      WHEN 'LABOR'       THEN rl.base_cost * (1.0 + COALESCE(rl.soc_pct, 0) / 100.0)
                              * COALESCE(rl.hours_pu, 0)
      WHEN 'EQUIPMENT'   THEN rl.base_cost * COALESCE(rl.hours_pu, rl.quantity)
      WHEN 'SUBCONTRACT' THEN rl.base_cost * rl.quantity * (1.0 + rl.waste_pct / 100.0)
      ELSE rl.base_cost
    END                                                                AS contrib
  FROM raw_lines rl
),

subs AS (
  SELECT
    COALESCE(SUM(CASE WHEN rtype = 'MATERIAL'    THEN contrib ELSE 0 END), 0) AS mat,
    COALESCE(SUM(CASE WHEN rtype = 'LABOR'       THEN contrib ELSE 0 END), 0) AS lab,
    COALESCE(SUM(CASE WHEN rtype = 'EQUIPMENT'   THEN contrib ELSE 0 END), 0) AS equ,
    COALESCE(SUM(CASE WHEN rtype = 'SUBCONTRACT' THEN contrib ELSE 0 END), 0) AS sub
  FROM computed
),

lines_json AS (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'id',               c.line_id,
        'resourceType',     c.rtype,
        'resourceCode',     NULLIF(c.rcode, ''),
        'resourceName',     c.rname,
        'unit',             c.unit,
        'quantity',         c.quantity,
        'conversionFactor', c.conv_factor,
        'wastePercent',     c.waste_pct,
        'workers',          c.workers,
        'hoursPerUnit',     c.hours_pu,
        'baseCost',         ROUND(c.base_cost, 4),
        'socialChargesPct', c.soc_pct,
        'effectiveUnitCost',ROUND(c.eff_unit,  4),
        'contribution',     ROUND(c.contrib,   4),
        'costSource',       c.cost_src,
        'note',             c.line_note
      ))
      ORDER BY
        CASE c.rtype
          WHEN 'MATERIAL'    THEN 1
          WHEN 'LABOR'       THEN 2
          WHEN 'EQUIPMENT'   THEN 3
          WHEN 'SUBCONTRACT' THEN 4
          ELSE 5
        END,
        c.rname
    ),
    '[]'::jsonb
  ) AS arr
  FROM computed c
)

SELECT COALESCE(
  (
    SELECT jsonb_build_object(
      'masterTaskId',         th.id,
      'code',                 th.code,
      'name',                 th.name,
      'unit',                 th.unit,
      'category',             th.category,
      'description',          th.description,
      'specifications',       th.specifications,
      'dailyYield',           th.daily_yield,
      'workdayHours',         9,
      'fixedCost',            th.fixed_cost,
      'fixedCostDescription', th.fixed_cost_description,
      'isPathA',              (SELECT is_path_a FROM path_flag),
      'costDate',             p_cost_date,
      'lines',                (SELECT arr FROM lines_json),
      'subtotals', jsonb_build_object(
        'material',    ROUND((SELECT mat FROM subs), 4),
        'labor',       ROUND((SELECT lab FROM subs), 4),
        'equipment',   ROUND((SELECT equ FROM subs), 4),
        'subcontract', ROUND((SELECT sub FROM subs), 4),
        'fixed',       ROUND(th.fixed_cost, 4)
      ),
      'totalDirectCost', ROUND(
        (SELECT mat + lab + equ + sub FROM subs) + th.fixed_cost,
        4
      ),
      'computedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )
    FROM task_hdr th
  ),
  jsonb_build_object('error', 'APU no encontrado o sin acceso')
);
$$;


ALTER FUNCTION "public"."get_apu_technical_report"("p_master_task_id" "uuid", "p_organization_id" "text", "p_cost_date" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_apu_technical_report"("p_master_task_id" "uuid", "p_organization_id" "text", "p_cost_date" "date") IS 'Reporte técnico completo de un APU: línea por recurso con costo base, cargas sociales, costo efectivo y aporte al costo unitario. Cubre PATH A (master_task_materials/labor/equipment) y PATH B (catalog_task_yields). SECURITY INVOKER: el RLS del caller controla el acceso.';



CREATE OR REPLACE FUNCTION "public"."get_invitation_by_token"("p_token" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_inv      public.invitations%ROWTYPE;
  v_org_name text;
BEGIN
  SELECT i.*
  INTO v_inv
  FROM public.invitations i
  WHERE i.token = p_token;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Si querés, podés endurecer esto también:
  IF v_inv.accepted_at IS NOT NULL THEN
    RETURN NULL;
  END IF;

  IF v_inv.expires_at IS NOT NULL AND v_inv.expires_at < now() THEN
    RETURN NULL;
  END IF;

  SELECT name
  INTO v_org_name
  FROM public.organizations
  WHERE id = v_inv.organization_id;

  RETURN json_build_object(
    'id',                v_inv.id,
    'organization_id',   v_inv.organization_id::text,
    'organization_name', coalesce(v_org_name, ''),
    'invited_email',     v_inv.invited_email,
    'role',              v_inv.role,
    'token',             v_inv.token,
    'created_at',        v_inv.created_at,
    'expires_at',        v_inv.expires_at,
    'accepted_at',       v_inv.accepted_at
  );
END;
$$;


ALTER FUNCTION "public"."get_invitation_by_token"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_admin_organization_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT organization_id
    FROM public.organization_members
    WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
  $$;


ALTER FUNCTION "public"."get_my_admin_organization_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_org_ids_text"() RETURNS TABLE("org_id" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT organization_id::text
    FROM public.organization_members
    WHERE user_id = auth.uid();
  $$;


ALTER FUNCTION "public"."get_my_org_ids_text"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_organization_ids"() RETURNS TABLE("org_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT organization_id
    FROM public.organization_members
    WHERE user_id = auth.uid();
  $$;


ALTER FUNCTION "public"."get_my_organization_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_org_entitlements"("p_org_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT jsonb_object_agg(
    pe.feature_key,
    CASE pe.feature_type
      WHEN 'boolean' THEN to_jsonb(COALESCE(pe.bool_value, false))
      WHEN 'numeric' THEN to_jsonb(COALESCE(pe.numeric_value, 0))
    END
  )
  FROM public.organization_subscriptions os
  JOIN public.plan_entitlements pe ON pe.plan_id = os.plan_id
  WHERE os.organization_id = p_org_id
    AND os.status IN ('trialing', 'active')
    AND public.is_org_member(p_org_id);
$$;


ALTER FUNCTION "public"."get_org_entitlements"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_org_uuid"("slug" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select id from organizations where organizations.slug = get_org_uuid.slug
$$;


ALTER FUNCTION "public"."get_org_uuid"("slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_resource_cost"("p_resource_id" "uuid", "p_tenant_id" "uuid", "p_date" "date" DEFAULT CURRENT_DATE) RETURNS numeric
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_cost numeric;
BEGIN
  -- Guard 1: autorización
  IF NOT is_org_member(p_tenant_id) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: el usuario no es miembro del tenant %', p_tenant_id
      USING ERRCODE = '42501';
  END IF;

  -- Guard 2: el recurso debe pertenecer al tenant o ser global
  IF NOT EXISTS (
    SELECT 1 FROM public.resources r
    WHERE r.id = p_resource_id
      AND (r.organization_id IS NULL OR r.organization_id = p_tenant_id)
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: recurso % no accesible para tenant %', p_resource_id, p_tenant_id
      USING ERRCODE = '42501';
  END IF;

  -- Snapshot más reciente ≤ p_date; fallback a base_cost
  SELECT COALESCE(
    (
      SELECT s.cost
      FROM public.resource_cost_snapshots s
      WHERE s.tenant_id    = p_tenant_id
        AND s.resource_id  = p_resource_id
        AND s.effective_date <= p_date
      ORDER BY s.effective_date DESC, s.created_at DESC
      LIMIT 1
    ),
    (SELECT base_cost FROM public.resources WHERE id = p_resource_id)
  ) INTO v_cost;

  RETURN v_cost;
END;
$$;


ALTER FUNCTION "public"."get_resource_cost"("p_resource_id" "uuid", "p_tenant_id" "uuid", "p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_resource_snapshot"("p_resource_id" "uuid", "p_tenant_id" "uuid", "p_date" "date" DEFAULT CURRENT_DATE) RETURNS TABLE("snapshot_id" "uuid", "resource_id" "uuid", "effective_date" "date", "cost" numeric, "currency" character, "source_type" "public"."snapshot_source_type", "source_reference" "text", "pricing_rule_id" "uuid", "index_id" "uuid", "index_base_value" numeric, "index_current_value" numeric, "adjustment_factor" numeric, "metadata" "jsonb", "is_fallback" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Guard 1: autorización
  IF NOT is_org_member(p_tenant_id) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: el usuario no es miembro del tenant %', p_tenant_id
      USING ERRCODE = '42501';
  END IF;

  -- Guard 2: recurso accesible
  IF NOT EXISTS (
    SELECT 1 FROM public.resources r
    WHERE r.id = p_resource_id
      AND (r.organization_id IS NULL OR r.organization_id = p_tenant_id)
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: recurso % no accesible para tenant %', p_resource_id, p_tenant_id
      USING ERRCODE = '42501';
  END IF;

  -- Snapshot más reciente ≤ p_date
  RETURN QUERY
    SELECT
      s.id, s.resource_id, s.effective_date, s.cost, s.currency,
      s.source_type, s.source_reference, s.pricing_rule_id, s.index_id,
      s.index_base_value, s.index_current_value, s.adjustment_factor,
      s.metadata, false
    FROM public.resource_cost_snapshots s
    WHERE s.tenant_id    = p_tenant_id
      AND s.resource_id  = p_resource_id
      AND s.effective_date <= p_date
    ORDER BY s.effective_date DESC, s.created_at DESC
    LIMIT 1;

  -- Fallback si no se encontró snapshot
  IF NOT FOUND THEN
    RETURN QUERY
      SELECT
        NULL::uuid, r.id, NULL::date, r.base_cost, 'ARS'::char(3),
        'FALLBACK_BASE_COST'::public.snapshot_source_type,
        NULL::text, NULL::uuid, NULL::uuid,
        NULL::numeric, NULL::numeric, NULL::numeric,
        '{"fallback":true}'::jsonb, true
      FROM public.resources r
      WHERE r.id = p_resource_id;
  END IF;
END;
$$;


ALTER FUNCTION "public"."get_resource_snapshot"("p_resource_id" "uuid", "p_tenant_id" "uuid", "p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
  begin new.updated_at = now(); return new; end;
  $$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."import_global_catalog_to_org"("p_organization_id" "uuid", "p_mode" "text" DEFAULT 'full'::"text", "p_categories" "text"[] DEFAULT NULL::"text"[], "p_master_task_codes" "text"[] DEFAULT NULL::"text"[], "p_resource_codes" "text"[] DEFAULT NULL::"text"[], "p_price_strategy" "text" DEFAULT 'missing_only'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  DECLARE
    v_user_id           uuid    := auth.uid();
    v_member_role       text;
    v_catalog_id        uuid;         -- catálogo privado de la org
    v_global_catalog_id uuid;         -- catálogo global (org IS NULL)
    v_task              record;
    v_new_task_id       uuid;
    v_yield             record;
    v_local_res_id      uuid;
    v_row_count         int;
    v_tasks_created     int     := 0;
    v_tasks_skipped     int     := 0;
    v_resources_created int     := 0;
    v_resources_updated int     := 0;
    v_resources_skipped int     := 0;
  BEGIN

    -- ── Autenticación ─────────────────────────────────────────────────────────
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'No autenticado: auth.uid() es null';
    END IF;

    SELECT role INTO v_member_role
    FROM   organization_members
    WHERE  user_id = v_user_id AND organization_id = p_organization_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'El usuario no pertenece a la organización %', p_organization_id;
    END IF;

    IF v_member_role NOT IN ('owner', 'admin', 'editor') THEN
      RAISE EXCEPTION 'Rol insuficiente: % (requiere owner/admin/editor)', v_member_role;
    END IF;

    -- ── Validar parámetros ────────────────────────────────────────────────────
    IF p_mode NOT IN ('full', 'category', 'selection', 'prices_only') THEN
      RAISE EXCEPTION 'p_mode inválido: %', p_mode;
    END IF;

    IF p_price_strategy NOT IN ('missing_only', 'zero_only', 'overwrite_all', 'skip_prices') THEN
      RAISE EXCEPTION 'p_price_strategy inválido: %', p_price_strategy;
    END IF;

    -- ── Catálogo global ───────────────────────────────────────────────────────
    SELECT id INTO v_global_catalog_id
    FROM   catalogs
    WHERE  organization_id IS NULL AND type = 'global'
    LIMIT  1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No existe catálogo global. Ejecutar seed primero.';
    END IF;

    -- ── Catálogo privado (get or create) ──────────────────────────────────────
    SELECT id INTO v_catalog_id
    FROM   catalogs
    WHERE  organization_id = p_organization_id AND type = 'private'
    LIMIT  1;

    IF NOT FOUND THEN
      INSERT INTO catalogs (name, type, organization_id, is_active)
      VALUES ('Catálogo Privado', 'private', p_organization_id, true)
      RETURNING id INTO v_catalog_id;
    END IF;

    -- ══════════════════════════════════════════════════════════════════════════
    -- MODO prices_only: solo actualiza precios de recursos privados existentes
    -- ══════════════════════════════════════════════════════════════════════════
    IF p_mode = 'prices_only' THEN

      IF p_price_strategy = 'skip_prices' THEN
        RETURN jsonb_build_object(
          'mode', p_mode, 'price_strategy', p_price_strategy,
          'tasks_created', 0, 'tasks_skipped', 0,
          'resources_created', 0, 'resources_updated', 0, 'resources_skipped', 0
        );
      END IF;

      FOR v_yield IN
        SELECT r.code, r.base_cost
        FROM   resources r
        WHERE  r.organization_id IS NULL
          AND  r.catalog_id = v_global_catalog_id
          AND  r.is_active  = true
          AND  (p_resource_codes IS NULL OR r.code = ANY(p_resource_codes))
      LOOP
        -- En prices_only, 'missing_only' se trata igual que 'zero_only'
        -- (no hay creación, así que "solo nuevos" equivale a "solo los que tienen precio 0")
        UPDATE resources
        SET    base_cost = v_yield.base_cost
        WHERE  organization_id = p_organization_id
          AND  catalog_id      = v_catalog_id
          AND  code            = v_yield.code
          AND  CASE
                 WHEN p_price_strategy IN ('missing_only', 'zero_only') THEN base_cost = 0
                 WHEN p_price_strategy = 'overwrite_all'                THEN true
                 ELSE false
               END;

        GET DIAGNOSTICS v_row_count = ROW_COUNT;
        IF v_row_count > 0 THEN v_resources_updated := v_resources_updated + 1;
        ELSE                    v_resources_skipped := v_resources_skipped + 1;
        END IF;
      END LOOP;

      RETURN jsonb_build_object(
        'mode', p_mode, 'price_strategy', p_price_strategy,
        'tasks_created', 0, 'tasks_skipped', 0,
        'resources_created', 0,
        'resources_updated', v_resources_updated,
        'resources_skipped', v_resources_skipped
      );
    END IF;

    -- ══════════════════════════════════════════════════════════════════════════
    -- MODOS full / category / selection
    -- ══════════════════════════════════════════════════════════════════════════
    FOR v_task IN
      SELECT mt.*
      FROM   master_tasks mt
      WHERE  mt.organization_id IS NULL
        AND  mt.is_active = true
        AND  CASE
               WHEN p_mode = 'full'      THEN true
               WHEN p_mode = 'category'  THEN (p_categories         IS NOT NULL AND mt.category = ANY(p_categories))
               WHEN p_mode = 'selection' THEN (p_master_task_codes  IS NOT NULL AND mt.code     = ANY(p_master_task_codes))
               ELSE false
             END
      ORDER BY mt.name
    LOOP

      -- Idempotencia por code
      IF EXISTS (
        SELECT 1 FROM master_tasks
        WHERE  organization_id = p_organization_id AND code = v_task.code
      ) THEN
        v_tasks_skipped := v_tasks_skipped + 1;
        CONTINUE;
      END IF;

      -- Crear master_task privada
      INSERT INTO master_tasks (
        organization_id, code, name, unit, category, description,
        daily_yield, fixed_cost, fixed_cost_description,
        specifications, tags, is_active
      ) VALUES (
        p_organization_id,
        v_task.code, v_task.name, v_task.unit, v_task.category, v_task.description,
        v_task.daily_yield, v_task.fixed_cost, v_task.fixed_cost_description,
        v_task.specifications, COALESCE(v_task.tags, '[]'::jsonb), true
      ) RETURNING id INTO v_new_task_id;

      v_tasks_created := v_tasks_created + 1;

      -- Iterar composition del APU global (catalog_task_yields + resources)
      FOR v_yield IN
        SELECT cty.quantity,
               r.code, r.name, r.unit, r.base_cost,
               r.type, r.category_name, r.social_charges_pct
        FROM   catalog_task_yields cty
        JOIN   resources r ON r.id = cty.resource_id
        WHERE  cty.master_task_id = v_task.id
      LOOP

        -- Intentar crear recurso privado (idempotente por catalog_id + code)
        INSERT INTO resources (
          catalog_id, organization_id, code, name, unit,
          base_cost, type, category_name, social_charges_pct, is_active
        ) VALUES (
          v_catalog_id, p_organization_id,
          v_yield.code, v_yield.name, v_yield.unit,
          CASE WHEN p_price_strategy = 'skip_prices' THEN 0 ELSE v_yield.base_cost END,
          v_yield.type, v_yield.category_name, v_yield.social_charges_pct, true
        ) ON CONFLICT (catalog_id, code) DO NOTHING;

        GET DIAGNOSTICS v_row_count = ROW_COUNT;

        -- Obtener id (recién creado o pre-existente)
        SELECT id INTO v_local_res_id
        FROM   resources
        WHERE  catalog_id = v_catalog_id AND code = v_yield.code;

        IF v_row_count > 0 THEN
          -- Recién creado — precio ya aplicado en INSERT
          v_resources_created := v_resources_created + 1;
        ELSE
          -- Pre-existente — aplicar estrategia de actualización
          UPDATE resources
          SET    base_cost = v_yield.base_cost
          WHERE  id = v_local_res_id
            AND  CASE
                   WHEN p_price_strategy = 'zero_only'     THEN base_cost = 0
                   WHEN p_price_strategy = 'overwrite_all' THEN true
                   ELSE false   -- missing_only + skip_prices: nunca actualizar existentes
                 END;

          GET DIAGNOSTICS v_row_count = ROW_COUNT;
          IF v_row_count > 0 THEN v_resources_updated := v_resources_updated + 1;
          ELSE                    v_resources_skipped := v_resources_skipped + 1;
          END IF;
        END IF;

        -- Vincular APU privado → recurso privado
        INSERT INTO catalog_task_yields (master_task_id, resource_id, quantity)
        VALUES (v_new_task_id, v_local_res_id, v_yield.quantity)
        ON CONFLICT (master_task_id, resource_id) DO NOTHING;

      END LOOP;
    END LOOP;

    RETURN jsonb_build_object(
      'mode',               p_mode,
      'price_strategy',     p_price_strategy,
      'tasks_created',      v_tasks_created,
      'tasks_skipped',      v_tasks_skipped,
      'resources_created',  v_resources_created,
      'resources_updated',  v_resources_updated,
      'resources_skipped',  v_resources_skipped
    );

  EXCEPTION WHEN OTHERS THEN
    RAISE;
  END;
  $$;


ALTER FUNCTION "public"."import_global_catalog_to_org"("p_organization_id" "uuid", "p_mode" "text", "p_categories" "text"[], "p_master_task_codes" "text"[], "p_resource_codes" "text"[], "p_price_strategy" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."import_global_catalog_to_org"("p_organization_id" "uuid", "p_mode" "text", "p_categories" "text"[], "p_master_task_codes" "text"[], "p_resource_codes" "text"[], "p_price_strategy" "text") IS 'Importación batch del catálogo global (organization_id IS NULL) a una organización.
     Modos: full, category, selection, prices_only.
     Estrategias de precio: missing_only (solo nuevos), zero_only (nuevos+precio=0),
     overwrite_all (siempre), skip_prices (no copiar precios).
     Idempotente por code de tarea y recurso. Auth: requiere owner/admin/editor.';



CREATE OR REPLACE FUNCTION "public"."is_master_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND system_role = 'master_admin'
  );
$$;


ALTER FUNCTION "public"."is_master_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_member_of_org"("p_org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.user_id = auth.uid()
      AND om.organization_id = p_org_id
  );
$$;


ALTER FUNCTION "public"."is_member_of_org"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_admin"("p_org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  );
$$;


ALTER FUNCTION "public"."is_org_admin"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_member"("org_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT EXISTS (
      SELECT 1
      FROM public.organization_members
      WHERE user_id             = auth.uid()
        AND organization_id::text = org_id
    );
  $$;


ALTER FUNCTION "public"."is_org_member"("org_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_member"("org_uuid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT EXISTS (
      SELECT 1
      FROM public.organization_members
      WHERE user_id        = auth.uid()
        AND organization_id = org_uuid
    );
  $$;


ALTER FUNCTION "public"."is_org_member"("org_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_member_with_role"("org_id" "text", "min_roles" "text"[]) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT EXISTS (
      SELECT 1
      FROM public.organization_members
      WHERE user_id             = auth.uid()
        AND organization_id::text = org_id
        AND role                = ANY(min_roles)
    );
  $$;


ALTER FUNCTION "public"."is_org_member_with_role"("org_id" "text", "min_roles" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_member_with_role"("org_uuid" "uuid", "min_roles" "text"[]) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT EXISTS (
      SELECT 1
      FROM public.organization_members
      WHERE user_id         = auth.uid()
        AND organization_id  = org_uuid
        AND role             = ANY(min_roles)
    );
  $$;


ALTER FUNCTION "public"."is_org_member_with_role"("org_uuid" "uuid", "min_roles" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_valid_positive_number"("v" "jsonb") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT v IS NOT NULL
     AND jsonb_typeof(v) = 'number'
     AND (v::text)::numeric > 0
$$;


ALTER FUNCTION "public"."is_valid_positive_number"("v" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."repair_master_task_material_prices"("p_org_id" "text") RETURNS TABLE("estado" "text", "task_code" "text", "mat_name" "text", "fuente" "text", "match_name" "text", "precio" numeric)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_mm_ct      int := 0;
  v_mat_ct     int := 0;
  v_unres_ct   int := 0;
  -- Helper: reusable normalization expression (inline macro style via SQL)
  -- normalize(x)     = lower + sin acentos + trim
  -- normalize_alt(x) = normalize + sin guiones ni espacios
BEGIN

  -- ── PASS 1: Reparar desde master_materials ─────────────────────────────────
  -- FK completa + precio técnico (dividido por CF cuando aplica)
  -- + commercial_unit para auditoría en UI
  WITH best_match AS (
    SELECT DISTINCT ON (mtm.id)
      mtm.id                                             AS mtm_id,
      mm.id                                              AS mm_id,
      mm.name                                            AS mm_name,
      mm.commercial_unit                                 AS mm_cu,
      CASE
        WHEN (mm.conversion_factor IS NOT NULL AND mm.conversion_factor > 1)
        THEN mm.unit_price / mm.conversion_factor
        ELSE mm.unit_price
      END                                                AS technical_price
    FROM public.master_task_materials mtm
    JOIN public.master_tasks mt
      ON mt.id = mtm.master_task_id
     AND mt.organization_id = p_org_id::uuid
     AND mt.is_active = true
    JOIN public.master_materials mm
      ON mm.organization_id = p_org_id
     AND mm.is_active        = true
     AND mm.unit_price        > 0
    WHERE (mtm.last_known_unit_price IS NULL OR mtm.last_known_unit_price = 0)
      AND (
        -- 1. Código exacto
        (
          mm.code IS NOT NULL
          AND LOWER(TRIM(mm.code)) = LOWER(TRIM(mtm.material_name))
        )
        OR
        -- 2. Nombre normalizado (sin acentos, lowercase, trimmed)
        LOWER(TRANSLATE(TRIM(mm.name),
          'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï',
          'AEIOUAEIOUaeiouaeiouNnUuIi'))
        = LOWER(TRANSLATE(TRIM(mtm.material_name),
          'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï',
          'AEIOUAEIOUaeiouaeiouNnUuIi'))
        OR
        -- 3. Nombre alt: también elimina guiones y espacios (H-21 = H21, ADN 420 = ADN420)
        REGEXP_REPLACE(
          LOWER(TRANSLATE(TRIM(mm.name),
            'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï',
            'AEIOUAEIOUaeiouaeiouNnUuIi')),
          '[-\s]+', '', 'g')
        = REGEXP_REPLACE(
          LOWER(TRANSLATE(TRIM(mtm.material_name),
            'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï',
            'AEIOUAEIOUaeiouaeiouNnUuIi')),
          '[-\s]+', '', 'g')
      )
    ORDER BY
      mtm.id,
      -- Prioridad: code (1) > nombre exacto (2) > nombre alt (3)
      CASE
        WHEN mm.code IS NOT NULL
         AND LOWER(TRIM(mm.code)) = LOWER(TRIM(mtm.material_name))
        THEN 1
        WHEN LOWER(TRANSLATE(TRIM(mm.name),'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï','AEIOUAEIOUaeiouaeiouNnUuIi'))
           = LOWER(TRANSLATE(TRIM(mtm.material_name),'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï','AEIOUAEIOUaeiouaeiouNnUuIi'))
        THEN 2
        ELSE 3
      END,
      mm.unit_price DESC NULLS LAST   -- dentro del mismo nivel: más completo primero
  )
  UPDATE public.master_task_materials mtm
  SET
    master_material_id    = bm.mm_id,
    last_known_unit_price = bm.technical_price,
    commercial_unit       = bm.mm_cu
  FROM best_match bm
  WHERE mtm.id = bm.mtm_id;

  GET DIAGNOSTICS v_mm_ct = ROW_COUNT;

  -- ── PASS 2: Fallback a materials (precio snapshot, sin FK) ─────────────────
  -- Solo actualiza last_known_unit_price — no toca master_material_id (NULL legacy).
  -- Solo para líneas que PASS 1 no pudo resolver.
  WITH best_fallback AS (
    SELECT DISTINCT ON (mtm.id)
      mtm.id  AS mtm_id,
      m.cost  AS mat_cost
    FROM public.master_task_materials mtm
    JOIN public.master_tasks mt
      ON mt.id = mtm.master_task_id
     AND mt.organization_id = p_org_id::uuid
     AND mt.is_active = true
    JOIN public.materials m
      ON m.organization_id = p_org_id
     AND m.cost > 0
    WHERE (mtm.last_known_unit_price IS NULL OR mtm.last_known_unit_price = 0)
      AND (
        LOWER(TRANSLATE(TRIM(m.name),'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï','AEIOUAEIOUaeiouaeiouNnUuIi'))
        = LOWER(TRANSLATE(TRIM(mtm.material_name),'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï','AEIOUAEIOUaeiouaeiouNnUuIi'))
        OR
        REGEXP_REPLACE(
          LOWER(TRANSLATE(TRIM(m.name),'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï','AEIOUAEIOUaeiouaeiouNnUuIi')),
          '[-\s]+', '', 'g')
        = REGEXP_REPLACE(
          LOWER(TRANSLATE(TRIM(mtm.material_name),'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï','AEIOUAEIOUaeiouaeiouNnUuIi')),
          '[-\s]+', '', 'g')
      )
    ORDER BY mtm.id, m.cost DESC NULLS LAST
  )
  UPDATE public.master_task_materials mtm
  SET last_known_unit_price = bf.mat_cost
  FROM best_fallback bf
  WHERE mtm.id = bf.mtm_id;

  GET DIAGNOSTICS v_mat_ct = ROW_COUNT;

  -- ── Contar líneas que todavía quedaron sin precio ──────────────────────────
  SELECT COUNT(*) INTO v_unres_ct
  FROM public.master_task_materials mtm
  JOIN public.master_tasks mt ON mt.id = mtm.master_task_id
  WHERE mt.organization_id = p_org_id::uuid
    AND mt.is_active = true
    AND (mtm.last_known_unit_price IS NULL OR mtm.last_known_unit_price = 0);

  RAISE NOTICE 'repair_master_task_material_prices(org=%): resueltos por MM=% | por materials=% | sin resolver=%',
    p_org_id, v_mm_ct, v_mat_ct, v_unres_ct;

  -- ── Devolver estado final de TODOS los materiales activos de la org ─────────
  -- Permite auditar: qué quedó sano, qué quedó con FK, qué sigue huérfano.
  RETURN QUERY
  SELECT
    CASE
      WHEN mtm.master_material_id IS NOT NULL THEN 'MM'::text
      WHEN mtm.last_known_unit_price > 0      THEN 'materials'::text
      ELSE                                         'sin_resolver'::text
    END                           AS estado,
    mt.code                       AS task_code,
    mtm.material_name             AS mat_name,
    CASE
      WHEN mtm.master_material_id IS NOT NULL THEN 'master_materials'::text
      WHEN mtm.last_known_unit_price > 0      THEN 'materials (snapshot)'::text
      ELSE                                         '—'::text
    END                           AS fuente,
    mm.name                       AS match_name,   -- NULL si no hay FK
    mtm.last_known_unit_price     AS precio
  FROM public.master_task_materials mtm
  JOIN public.master_tasks          mt  ON mt.id  = mtm.master_task_id
  LEFT JOIN public.master_materials mm  ON mm.id  = mtm.master_material_id
  WHERE mt.organization_id = p_org_id::uuid
    AND mt.is_active = true
  ORDER BY estado DESC, mt.code, mtm.material_name;

END;
$$;


ALTER FUNCTION "public"."repair_master_task_material_prices"("p_org_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."repair_master_task_material_prices"("p_org_id" "text") IS 'Repara líneas huérfanas de master_task_materials (price=0, FK null).
PASS 1: match vs master_materials por code/nombre normalizado/alt. Setea FK + precio técnico.
PASS 2: fallback a materials (solo snapshot de precio).
Idempotente — ignora líneas que ya tienen precio > 0.
Invocar con service_role desde Supabase SQL Editor.
Uso: SELECT * FROM repair_master_task_material_prices(''<org-uuid-as-text>'');';



CREATE OR REPLACE FUNCTION "public"."resync_org_material_prices"("p_org_id" "text") RETURNS TABLE("capa" "text", "estado" "text", "task_code" "text", "mat_name" "text", "fuente" "text", "precio_final" numeric)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_c1_ct   int := 0;   -- master_materials reparados en CAPA 1
  v_c2_ct   int := 0;   -- snapshots re-sincronizados en CAPA 2
  v_c3_mm   int := 0;   -- resueltos por 030 PASS 1 (master_materials)
  v_c3_mat  int := 0;   -- resueltos por 030 PASS 2 (materials)
  v_unres   int := 0;   -- sin resolver tras las 3 capas
BEGIN

  -- ══════════════════════════════════════════════════════════════════════════
  -- CAPA 1: Actualizar master_materials.unit_price desde materials.cost
  --         Solo donde unit_price = 0 y hay match válido en materials.
  --         Match priorizado: code > nombre norm. exacto > nombre alt.
  -- ══════════════════════════════════════════════════════════════════════════
  WITH price_source AS (
    SELECT DISTINCT ON (mm.id)
      mm.id  AS mm_id,
      m.cost AS new_price,
      m.name AS source_name
    FROM public.master_materials mm
    JOIN public.materials m
      ON m.organization_id = p_org_id
     AND m.cost > 0
     AND (
       -- 1. Code exacto (case-insensitive)
       (mm.code IS NOT NULL AND LOWER(TRIM(mm.code)) = LOWER(TRIM(m.code)))
       OR
       -- 2. Nombre normalizado exacto (sin acentos, lowercase)
       LOWER(TRANSLATE(TRIM(mm.name),
         'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï',
         'AEIOUAEIOUaeiouaeiouNnUuIi'))
       = LOWER(TRANSLATE(TRIM(m.name),
         'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï',
         'AEIOUAEIOUaeiouaeiouNnUuIi'))
       OR
       -- 3. Alt: sin guiones ni espacios (H-21 ≡ H21, ADN 420 ≡ ADN420)
       REGEXP_REPLACE(
         LOWER(TRANSLATE(TRIM(mm.name),
           'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï',
           'AEIOUAEIOUaeiouaeiouNnUuIi')), '[-\s]+', '', 'g')
       = REGEXP_REPLACE(
         LOWER(TRANSLATE(TRIM(m.name),
           'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï',
           'AEIOUAEIOUaeiouaeiouNnUuIi')), '[-\s]+', '', 'g')
     )
    WHERE mm.organization_id = p_org_id
      AND mm.is_active = true
      AND (mm.unit_price IS NULL OR mm.unit_price = 0)
    ORDER BY
      mm.id,
      -- Prioridad de match
      CASE
        WHEN mm.code IS NOT NULL AND LOWER(TRIM(mm.code)) = LOWER(TRIM(m.code)) THEN 1
        WHEN LOWER(TRANSLATE(TRIM(mm.name),'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï','AEIOUAEIOUaeiouaeiouNnUuIi'))
           = LOWER(TRANSLATE(TRIM(m.name), 'ÁÉÍÓÚÀÈÌÒÙáéíóúàèìòùÑñÜüÏï','AEIOUAEIOUaeiouaeiouNnUuIi'))
        THEN 2
        ELSE 3
      END,
      m.cost DESC NULLS LAST   -- dentro del mismo nivel: preferir mayor costo (más completo)
  )
  UPDATE public.master_materials mm
  SET unit_price = ps.new_price
  FROM price_source ps
  WHERE mm.id = ps.mm_id;

  GET DIAGNOSTICS v_c1_ct = ROW_COUNT;
  RAISE NOTICE 'CAPA 1 — master_materials actualizados: %', v_c1_ct;

  -- ══════════════════════════════════════════════════════════════════════════
  -- CAPA 2: Re-sincronizar snapshots en master_task_materials
  --         Para filas con FK ya seteada (tiene_fk = true) pero precio = 0.
  --         Usa el unit_price de master_materials (ya corregido en CAPA 1 si aplica).
  --         Aplica conversión técnica: unit_price / conversion_factor si CF > 1.
  -- ══════════════════════════════════════════════════════════════════════════
  UPDATE public.master_task_materials mtm
  SET last_known_unit_price = CASE
      WHEN mm.conversion_factor IS NOT NULL AND mm.conversion_factor > 1
      THEN mm.unit_price / mm.conversion_factor
      ELSE mm.unit_price
    END
  FROM public.master_materials mm
  JOIN public.master_tasks mt ON mt.id = mtm.master_task_id
  WHERE mtm.master_material_id = mm.id             -- FK existente
    AND mt.organization_id     = p_org_id::uuid
    AND mt.is_active           = true
    AND mm.unit_price          > 0                 -- solo si hay precio en master_materials
    AND (mtm.last_known_unit_price IS NULL OR mtm.last_known_unit_price = 0);

  GET DIAGNOSTICS v_c2_ct = ROW_COUNT;
  RAISE NOTICE 'CAPA 2 — snapshots re-sincronizados: %', v_c2_ct;

  -- ══════════════════════════════════════════════════════════════════════════
  -- CAPA 3: Huérfanos sin FK — llamar a repair_master_task_material_prices
  --         (migration 030). Resuelve FK + snapshot para líneas sin FK.
  --         Solo actúa si la función 030 fue creada; si no existe, skip silencioso.
  -- ══════════════════════════════════════════════════════════════════════════
  BEGIN
    PERFORM public.repair_master_task_material_prices(p_org_id);
    -- Contar lo que 030 resolvió (proxy: filas que antes eran huérfanas y ahora tienen FK)
    SELECT COUNT(*) INTO v_c3_mm
    FROM public.master_task_materials mtm
    JOIN public.master_tasks mt ON mt.id = mtm.master_task_id
    WHERE mt.organization_id = p_org_id::uuid
      AND mt.is_active = true
      AND mtm.master_material_id IS NOT NULL
      AND mtm.last_known_unit_price > 0;
  EXCEPTION WHEN undefined_function THEN
    RAISE NOTICE 'CAPA 3 — repair_master_task_material_prices() no existe (migration 030 no aplicada). Skipping.';
  END;

  -- Contar sin resolver
  SELECT COUNT(*) INTO v_unres
  FROM public.master_task_materials mtm
  JOIN public.master_tasks mt ON mt.id = mtm.master_task_id
  WHERE mt.organization_id = p_org_id::uuid
    AND mt.is_active = true
    AND (mtm.last_known_unit_price IS NULL OR mtm.last_known_unit_price = 0);

  RAISE NOTICE 'CAPA 3 — huérfanos procesados por 030. Sin resolver final: %', v_unres;
  RAISE NOTICE '── resync_org_material_prices(org=%) COMPLETO ──', p_org_id;
  RAISE NOTICE '   CAPA 1: master_materials corregidos   = %', v_c1_ct;
  RAISE NOTICE '   CAPA 2: snapshots re-sincronizados    = %', v_c2_ct;
  RAISE NOTICE '   Sin resolver                          = %', v_unres;

  -- ══════════════════════════════════════════════════════════════════════════
  -- RETURN: estado final de todos los materiales activos de la org
  -- ══════════════════════════════════════════════════════════════════════════
  RETURN QUERY
  SELECT
    '031'::text                                               AS capa,
    CASE
      WHEN mtm.last_known_unit_price > 0 THEN 'reparado'::text
      ELSE                                    'sin_resolver'::text
    END                                                       AS estado,
    mt.code                                                   AS task_code,
    mtm.material_name                                         AS mat_name,
    CASE
      WHEN mtm.master_material_id IS NOT NULL THEN 'master_materials'::text
      ELSE                                         'materials (snap)'::text
    END                                                       AS fuente,
    COALESCE(mtm.last_known_unit_price, 0)                    AS precio_final
  FROM public.master_task_materials mtm
  JOIN public.master_tasks          mt  ON mt.id  = mtm.master_task_id
  WHERE mt.organization_id = p_org_id::uuid
    AND mt.is_active       = true
  ORDER BY estado DESC, mt.code, mtm.material_name;

END;
$$;


ALTER FUNCTION "public"."resync_org_material_prices"("p_org_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."resync_org_material_prices"("p_org_id" "text") IS 'Reparación multicapa para precios 0 en master_task_materials.
CAPA 1: corrige master_materials.unit_price desde materials.cost (solo si price=0).
CAPA 2: re-sincroniza last_known_unit_price en master_task_materials con FK existente.
CAPA 3: llama a repair_master_task_material_prices() (030) para huérfanos sin FK.
Idempotente. No toca budget_items. Solo afecta la org del argumento.
Uso: SELECT * FROM resync_org_material_prices(''<org-uuid>'');';



CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_apu_mam_rev"("p_org_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  DECLARE
    v_org_uuid      uuid;
    v_lad_com_id    uuid;  v_lad_com_price numeric;
    v_lad_h8_id     uuid;  v_lad_h8_price  numeric;
    v_lad_c18_id    uuid;  v_lad_c18_price numeric;
    v_hid_id        uuid;  v_hid_price     numeric;
    v_mor001        uuid;  v_mor002  uuid;  v_mor003  uuid;
    v_oficial_id    text;  v_oficial_name  text;
    v_ayudante_id   text;  v_ayudante_name text;
    v_mam001  uuid;  v_mam002  uuid;  v_mam005  uuid;  v_mam006  uuid;
    v_rev001  uuid;  v_rev003  uuid;  v_rev004  uuid;
    v_created integer := 0;
    v_updated integer := 0;
  BEGIN

    v_org_uuid := p_org_id::uuid;

    SELECT id, unit_price INTO v_lad_com_id, v_lad_com_price
    FROM public.master_materials
    WHERE organization_id = p_org_id AND is_active = true
      AND name = 'Ladrillo común 6x12x24' LIMIT 1;

    SELECT id, unit_price INTO v_lad_h8_id, v_lad_h8_price
    FROM public.master_materials
    WHERE organization_id = p_org_id AND is_active = true
      AND name = 'Ladrillo hueco 8x18x33' LIMIT 1;

    SELECT id, unit_price INTO v_lad_c18_id, v_lad_c18_price
    FROM public.master_materials
    WHERE organization_id = p_org_id AND is_active = true
      AND name = 'Ladrillo cerámico 18x18x33' LIMIT 1;

    SELECT id, unit_price INTO v_hid_id, v_hid_price
    FROM public.master_materials
    WHERE organization_id = p_org_id AND is_active = true
      AND name = 'Hidrófugo líquido integral' LIMIT 1;

    SELECT id INTO v_mor001 FROM public.master_tasks
    WHERE organization_id = v_org_uuid AND code = 'MOR-001' AND is_active = true LIMIT 1;

    SELECT id INTO v_mor002 FROM public.master_tasks
    WHERE organization_id = v_org_uuid AND code = 'MOR-002' AND is_active = true LIMIT 1;

    SELECT id INTO v_mor003 FROM public.master_tasks
    WHERE organization_id = v_org_uuid AND code = 'MOR-003' AND is_active = true LIMIT 1;

    SELECT id, role INTO v_oficial_id, v_oficial_name
    FROM public.labor_categories
    WHERE organization_id::text = p_org_id AND role ILIKE '%oficial%'
    ORDER BY role LIMIT 1;

    SELECT id, role INTO v_ayudante_id, v_ayudante_name
    FROM public.labor_categories
    WHERE organization_id::text = p_org_id AND role ILIKE '%ayudante%'
    ORDER BY role LIMIT 1;

    -- MAM-001
    SELECT id INTO v_mam001 FROM public.master_tasks
    WHERE organization_id = v_org_uuid AND code = 'MAM-001' LIMIT 1;
    IF v_mam001 IS NULL THEN
      INSERT INTO public.master_tasks
        (id, organization_id, code, name, unit, category, daily_yield, is_active)
      VALUES
        (gen_random_uuid(), v_org_uuid, 'MAM-001',
         'Muro ladrillo común 6x12x24 e=0.15m (1 pie)', 'm2', 'Mampostería', 7, true)
      RETURNING id INTO v_mam001;
      v_created := v_created + 1;
    ELSE
      UPDATE public.master_tasks SET
        name = 'Muro ladrillo común 6x12x24 e=0.15m (1 pie)',
        unit = 'm2', category = 'Mampostería', daily_yield = 7, is_active = true
      WHERE id = v_mam001;
      v_updated := v_updated + 1;
    END IF;
    DELETE FROM public.master_task_materials WHERE master_task_id = v_mam001;
    IF v_lad_com_id IS NOT NULL THEN
      INSERT INTO public.master_task_materials
        (id, master_task_id, master_material_id, material_name, unit, quantity, waste_percent,
  last_known_unit_price)
      VALUES
        (gen_random_uuid(), v_mam001, v_lad_com_id,
         'Ladrillo común 6x12x24', 'un', 70, 0, COALESCE(v_lad_com_price, 0));
    END IF;
    IF v_mor001 IS NOT NULL THEN
      INSERT INTO public.master_task_materials
        (id, master_task_id, master_material_id, sub_master_task_id, material_name, unit, quantity,
  waste_percent, last_known_unit_price)
      VALUES
        (gen_random_uuid(), v_mam001, NULL, v_mor001, 'MOR-001', 'm3', 0.043, 0, 0);
    END IF;
    DELETE FROM public.master_task_labor WHERE master_task_id = v_mam001;
    IF v_oficial_id IS NOT NULL AND v_ayudante_id IS NOT NULL THEN
      INSERT INTO public.master_task_labor
        (id, master_task_id, labor_category_id, labor_category_name, quantity)
      VALUES
        (gen_random_uuid(), v_mam001, v_oficial_id,  v_oficial_name,  1.143),
        (gen_random_uuid(), v_mam001, v_ayudante_id, v_ayudante_name, 1.143);
    END IF;

    -- MAM-002
    SELECT id INTO v_mam002 FROM public.master_tasks
    WHERE organization_id = v_org_uuid AND code = 'MAM-002' LIMIT 1;
    IF v_mam002 IS NULL THEN
      INSERT INTO public.master_tasks
        (id, organization_id, code, name, unit, category, daily_yield, is_active)
      VALUES
        (gen_random_uuid(), v_org_uuid, 'MAM-002',
         'Muro ladrillo común 6x12x24 e=0.30m (2 pies)', 'm2', 'Mampostería', 4, true)
      RETURNING id INTO v_mam002;
      v_created := v_created + 1;
    ELSE
      UPDATE public.master_tasks SET
        name = 'Muro ladrillo común 6x12x24 e=0.30m (2 pies)',
        unit = 'm2', category = 'Mampostería', daily_yield = 4, is_active = true
      WHERE id = v_mam002;
      v_updated := v_updated + 1;
    END IF;
    DELETE FROM public.master_task_materials WHERE master_task_id = v_mam002;
    IF v_lad_com_id IS NOT NULL THEN
      INSERT INTO public.master_task_materials
        (id, master_task_id, master_material_id, material_name, unit, quantity, waste_percent,
  last_known_unit_price)
      VALUES
        (gen_random_uuid(), v_mam002, v_lad_com_id,
         'Ladrillo común 6x12x24', 'un', 140, 0, COALESCE(v_lad_com_price, 0));
    END IF;
    IF v_mor001 IS NOT NULL THEN
      INSERT INTO public.master_task_materials
        (id, master_task_id, master_material_id, sub_master_task_id, material_name, unit, quantity,
  waste_percent, last_known_unit_price)
      VALUES
        (gen_random_uuid(), v_mam002, NULL, v_mor001, 'MOR-001', 'm3', 0.087, 0, 0);
    END IF;
    DELETE FROM public.master_task_labor WHERE master_task_id = v_mam002;
    IF v_oficial_id IS NOT NULL AND v_ayudante_id IS NOT NULL THEN
      INSERT INTO public.master_task_labor
        (id, master_task_id, labor_category_id, labor_category_name, quantity)
      VALUES
        (gen_random_uuid(), v_mam002, v_oficial_id,  v_oficial_name,  2.000),
        (gen_random_uuid(), v_mam002, v_ayudante_id, v_ayudante_name, 2.000);
    END IF;

    -- MAM-005
    SELECT id INTO v_mam005 FROM public.master_tasks
    WHERE organization_id = v_org_uuid AND code = 'MAM-005' LIMIT 1;
    IF v_mam005 IS NULL THEN
      INSERT INTO public.master_tasks
        (id, organization_id, code, name, unit, category, daily_yield, is_active)
      VALUES
        (gen_random_uuid(), v_org_uuid, 'MAM-005',
         'Tabique ladrillo hueco 8x18x33 e=0.08m', 'm2', 'Mampostería', 12, true)
      RETURNING id INTO v_mam005;
      v_created := v_created + 1;
    ELSE
      UPDATE public.master_tasks SET
        name = 'Tabique ladrillo hueco 8x18x33 e=0.08m',
        unit = 'm2', category = 'Mampostería', daily_yield = 12, is_active = true
      WHERE id = v_mam005;
      v_updated := v_updated + 1;
    END IF;
    DELETE FROM public.master_task_materials WHERE master_task_id = v_mam005;
    IF v_lad_h8_id IS NOT NULL THEN
      INSERT INTO public.master_task_materials
        (id, master_task_id, master_material_id, material_name, unit, quantity, waste_percent,
  last_known_unit_price)
      VALUES
        (gen_random_uuid(), v_mam005, v_lad_h8_id,
         'Ladrillo hueco 8x18x33', 'un', 20, 0, COALESCE(v_lad_h8_price, 0));
    END IF;
    IF v_mor001 IS NOT NULL THEN
      INSERT INTO public.master_task_materials
        (id, master_task_id, master_material_id, sub_master_task_id, material_name, unit, quantity,
  waste_percent, last_known_unit_price)
      VALUES
        (gen_random_uuid(), v_mam005, NULL, v_mor001, 'MOR-001', 'm3', 0.010, 0, 0);
    END IF;
    DELETE FROM public.master_task_labor WHERE master_task_id = v_mam005;
    IF v_oficial_id IS NOT NULL AND v_ayudante_id IS NOT NULL THEN
      INSERT INTO public.master_task_labor
        (id, master_task_id, labor_category_id, labor_category_name, quantity)
      VALUES
        (gen_random_uuid(), v_mam005, v_oficial_id,  v_oficial_name,  0.667),
        (gen_random_uuid(), v_mam005, v_ayudante_id, v_ayudante_name, 0.667);
    END IF;

    -- MAM-006
    SELECT id INTO v_mam006 FROM public.master_tasks
    WHERE organization_id = v_org_uuid AND code = 'MAM-006' LIMIT 1;
    IF v_mam006 IS NULL THEN
      INSERT INTO public.master_tasks
        (id, organization_id, code, name, unit, category, daily_yield, is_active)
      VALUES
        (gen_random_uuid(), v_org_uuid, 'MAM-006',
         'Muro ladrillo cerámico 18x18x33 e=0.18m', 'm2', 'Mampostería', 7, true)
      RETURNING id INTO v_mam006;
      v_created := v_created + 1;
    ELSE
      UPDATE public.master_tasks SET
        name = 'Muro ladrillo cerámico 18x18x33 e=0.18m',
        unit = 'm2', category = 'Mampostería', daily_yield = 7, is_active = true
      WHERE id = v_mam006;
      v_updated := v_updated + 1;
    END IF;
    DELETE FROM public.master_task_materials WHERE master_task_id = v_mam006;
    IF v_lad_c18_id IS NOT NULL THEN
      INSERT INTO public.master_task_materials
        (id, master_task_id, master_material_id, material_name, unit, quantity, waste_percent,
  last_known_unit_price)
      VALUES
        (gen_random_uuid(), v_mam006, v_lad_c18_id,
         'Ladrillo cerámico 18x18x33', 'un', 16, 0, COALESCE(v_lad_c18_price, 0));
    END IF;
    IF v_mor001 IS NOT NULL THEN
      INSERT INTO public.master_task_materials
        (id, master_task_id, master_material_id, sub_master_task_id, material_name, unit, quantity,
  waste_percent, last_known_unit_price)
      VALUES
        (gen_random_uuid(), v_mam006, NULL, v_mor001, 'MOR-001', 'm3', 0.020, 0, 0);
    END IF;
    DELETE FROM public.master_task_labor WHERE master_task_id = v_mam006;
    IF v_oficial_id IS NOT NULL AND v_ayudante_id IS NOT NULL THEN
      INSERT INTO public.master_task_labor
        (id, master_task_id, labor_category_id, labor_category_name, quantity)
      VALUES
        (gen_random_uuid(), v_mam006, v_oficial_id,  v_oficial_name,  1.143),
        (gen_random_uuid(), v_mam006, v_ayudante_id, v_ayudante_name, 1.143);
    END IF;

    -- REV-001
    SELECT id INTO v_rev001 FROM public.master_tasks
    WHERE organization_id = v_org_uuid AND code = 'REV-001' LIMIT 1;
    IF v_rev001 IS NULL THEN
      INSERT INTO public.master_tasks
        (id, organization_id, code, name, unit, category, daily_yield, is_active)
      VALUES
        (gen_random_uuid(), v_org_uuid, 'REV-001',
         'Revoque grueso interior 1:2:9 e=15mm', 'm2', 'Revoques', 15, true)
      RETURNING id INTO v_rev001;
      v_created := v_created + 1;
    ELSE
      UPDATE public.master_tasks SET
        name = 'Revoque grueso interior 1:2:9 e=15mm',
        unit = 'm2', category = 'Revoques', daily_yield = 15, is_active = true
      WHERE id = v_rev001;
      v_updated := v_updated + 1;
    END IF;
    DELETE FROM public.master_task_materials WHERE master_task_id = v_rev001;
    IF v_mor002 IS NOT NULL THEN
      INSERT INTO public.master_task_materials
        (id, master_task_id, master_material_id, sub_master_task_id, material_name, unit, quantity,
  waste_percent, last_known_unit_price)
      VALUES
        (gen_random_uuid(), v_rev001, NULL, v_mor002, 'MOR-002', 'm3', 0.020, 0, 0);
    END IF;
    DELETE FROM public.master_task_labor WHERE master_task_id = v_rev001;
    IF v_oficial_id IS NOT NULL AND v_ayudante_id IS NOT NULL THEN
      INSERT INTO public.master_task_labor
        (id, master_task_id, labor_category_id, labor_category_name, quantity)
      VALUES
        (gen_random_uuid(), v_rev001, v_oficial_id,  v_oficial_name,  0.533),
        (gen_random_uuid(), v_rev001, v_ayudante_id, v_ayudante_name, 0.533);
    END IF;

    -- REV-003
    SELECT id INTO v_rev003 FROM public.master_tasks
    WHERE organization_id = v_org_uuid AND code = 'REV-003' LIMIT 1;
    IF v_rev003 IS NULL THEN
      INSERT INTO public.master_tasks
        (id, organization_id, code, name, unit, category, daily_yield, is_active)
      VALUES
        (gen_random_uuid(), v_org_uuid, 'REV-003',
         'Revoque exterior hidrófugo e=20mm', 'm2', 'Revoques', 10, true)
      RETURNING id INTO v_rev003;
      v_created := v_created + 1;
    ELSE
      UPDATE public.master_tasks SET
        name = 'Revoque exterior hidrófugo e=20mm',
        unit = 'm2', category = 'Revoques', daily_yield = 10, is_active = true
      WHERE id = v_rev003;
      v_updated := v_updated + 1;
    END IF;
    DELETE FROM public.master_task_materials WHERE master_task_id = v_rev003;
    IF v_mor003 IS NOT NULL THEN
      INSERT INTO public.master_task_materials
        (id, master_task_id, master_material_id, sub_master_task_id, material_name, unit, quantity,
  waste_percent, last_known_unit_price)
      VALUES
        (gen_random_uuid(), v_rev003, NULL, v_mor003, 'MOR-003', 'm3', 0.010, 0, 0);
    END IF;
    IF v_hid_id IS NOT NULL THEN
      INSERT INTO public.master_task_materials
        (id, master_task_id, master_material_id, material_name, unit, quantity, waste_percent,
  last_known_unit_price)
      VALUES
        (gen_random_uuid(), v_rev003, v_hid_id,
         'Hidrófugo líquido integral', 'lt', 0.200, 0, COALESCE(v_hid_price, 0));
    END IF;
    DELETE FROM public.master_task_labor WHERE master_task_id = v_rev003;
    IF v_oficial_id IS NOT NULL AND v_ayudante_id IS NOT NULL THEN
      INSERT INTO public.master_task_labor
        (id, master_task_id, labor_category_id, labor_category_name, quantity)
      VALUES
        (gen_random_uuid(), v_rev003, v_oficial_id,  v_oficial_name,  0.800),
        (gen_random_uuid(), v_rev003, v_ayudante_id, v_ayudante_name, 0.800);
    END IF;

    -- REV-004
    SELECT id INTO v_rev004 FROM public.master_tasks
    WHERE organization_id = v_org_uuid AND code = 'REV-004' LIMIT 1;
    IF v_rev004 IS NULL THEN
      INSERT INTO public.master_tasks
        (id, organization_id, code, name, unit, category, daily_yield, is_active)
      VALUES
        (gen_random_uuid(), v_org_uuid, 'REV-004',
         'Revoque grueso exterior 1:3 e=20mm', 'm2', 'Revoques', 12, true)
      RETURNING id INTO v_rev004;
      v_created := v_created + 1;
    ELSE
      UPDATE public.master_tasks SET
        name = 'Revoque grueso exterior 1:3 e=20mm',
        unit = 'm2', category = 'Revoques', daily_yield = 12, is_active = true
      WHERE id = v_rev004;
      v_updated := v_updated + 1;
    END IF;
    DELETE FROM public.master_task_materials WHERE master_task_id = v_rev004;
    IF v_mor002 IS NOT NULL THEN
      INSERT INTO public.master_task_materials
        (id, master_task_id, master_material_id, sub_master_task_id, material_name, unit, quantity,
  waste_percent, last_known_unit_price)
      VALUES
        (gen_random_uuid(), v_rev004, NULL, v_mor002, 'MOR-002', 'm3', 0.025, 0, 0);
    END IF;
    DELETE FROM public.master_task_labor WHERE master_task_id = v_rev004;
    IF v_oficial_id IS NOT NULL AND v_ayudante_id IS NOT NULL THEN
      INSERT INTO public.master_task_labor
        (id, master_task_id, labor_category_id, labor_category_name, quantity)
      VALUES
        (gen_random_uuid(), v_rev004, v_oficial_id,  v_oficial_name,  0.667),
        (gen_random_uuid(), v_rev004, v_ayudante_id, v_ayudante_name, 0.667);
    END IF;

    RETURN jsonb_build_object('created', v_created, 'updated', v_updated, 'total', 7);
  END;
  $$;


ALTER FUNCTION "public"."seed_apu_mam_rev"("p_org_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_apu_morteros"("p_org_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  -- ── IDs de materiales (resueltos por nombre exacto) ─────────────────────
  v_cem_id    uuid;   -- Cemento Portland CPN 40
  v_cem_price numeric;

  v_cal_id    uuid;   -- Cal hidratada (Ca(OH)₂)
  v_cal_price numeric;

  v_arg_id    uuid;   -- Arena gruesa limpia
  v_arg_price numeric;

  v_arf_id    uuid;   -- Arena fina lavada
  v_arf_price numeric;

  v_arm_id    uuid;   -- Arena media lavada
  v_arm_price numeric;

  -- ── IDs de tareas ────────────────────────────────────────────────────────
  v_mor001    uuid;
  v_mor002    uuid;
  v_mor003    uuid;
  v_mor004    uuid;

  v_org_uuid  uuid;
  v_created   integer := 0;
  v_updated   integer := 0;
BEGIN

  v_org_uuid := p_org_id::uuid;

  RAISE NOTICE '════════════════════════════════════════════════';
  RAISE NOTICE 'seed_apu_morteros — org: %', p_org_id;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 0. Resolver materiales (nombres exactos de DB)
  -- ══════════════════════════════════════════════════════════════════════════

  SELECT id,
    CASE WHEN conversion_factor IS NOT NULL AND conversion_factor > 1
         THEN unit_price / conversion_factor
         ELSE unit_price END
  INTO v_cem_id, v_cem_price
  FROM public.master_materials
  WHERE organization_id = p_org_id AND is_active = true
    AND name = 'Cemento Portland CPN 40'
  LIMIT 1;

  SELECT id, unit_price
  INTO v_cal_id, v_cal_price
  FROM public.master_materials
  WHERE organization_id = p_org_id AND is_active = true
    AND name = 'Cal hidratada'
  LIMIT 1;

  SELECT id, unit_price
  INTO v_arg_id, v_arg_price
  FROM public.master_materials
  WHERE organization_id = p_org_id AND is_active = true
    AND name = 'Arena gruesa limpia'
  LIMIT 1;

  SELECT id, unit_price
  INTO v_arf_id, v_arf_price
  FROM public.master_materials
  WHERE organization_id = p_org_id AND is_active = true
    AND name = 'Arena fina lavada'
  LIMIT 1;

  SELECT id, unit_price
  INTO v_arm_id, v_arm_price
  FROM public.master_materials
  WHERE organization_id = p_org_id AND is_active = true
    AND name = 'Arena media lavada'
  LIMIT 1;

  RAISE NOTICE 'Materiales → cemento=%, cal=%, arena_g=%, arena_f=%, arena_m=%',
    v_cem_id, v_cal_id, v_arg_id, v_arf_id, v_arm_id;

  IF v_cem_id IS NULL THEN
    RAISE WARNING 'Cemento Portland CPN 40 no encontrado — prerequisito: migración 019.';
  END IF;
  IF v_cal_id IS NULL THEN
    RAISE WARNING 'Cal hidratada no encontrada — prerequisito: migración 041.';
  END IF;
  IF v_arm_id IS NULL THEN
    RAISE WARNING 'Arena media lavada no encontrada — prerequisito: migración 041.';
  END IF;


  -- ══════════════════════════════════════════════════════════════════════════
  -- MOR-001 — Mortero 1:1:6 (mampostería en general)
  --
  -- Dosaje por m³ de mortero puesto en obra:
  --   140 kg  cemento Portland
  --   130 kg  cal hidratada
  --   1.050 m³ arena gruesa (incluye ~5% de desperdicio en coef)
  --
  -- Rendimiento típico Chandías: 6 m³/día (equipo de 2 personas)
  -- Uso: MAM-001/002 (muros portantes), MAM-003/004/005/006 (huecos)
  -- ══════════════════════════════════════════════════════════════════════════

  SELECT id INTO v_mor001
  FROM public.master_tasks
  WHERE organization_id = v_org_uuid AND code = 'MOR-001'
  LIMIT 1;

  IF v_mor001 IS NULL THEN
    INSERT INTO public.master_tasks
      (id, organization_id, code, name, unit, category, daily_yield, is_active)
    VALUES
      (gen_random_uuid(), v_org_uuid, 'MOR-001',
       'Mortero 1:1:6 (mampostería)', 'm3', 'Morteros', 6, true)
    RETURNING id INTO v_mor001;
    v_created := v_created + 1;
    RAISE NOTICE 'MOR-001 → CREADO id=%', v_mor001;
  ELSE
    UPDATE public.master_tasks
    SET name = 'Mortero 1:1:6 (mampostería)', unit = 'm3',
        category = 'Morteros', daily_yield = 6, is_active = true
    WHERE id = v_mor001;
    v_updated := v_updated + 1;
    RAISE NOTICE 'MOR-001 → ACTUALIZADO id=%', v_mor001;
  END IF;

  -- Materiales: DELETE + INSERT (idempotente, igual que 035/036)
  DELETE FROM public.master_task_materials WHERE master_task_id = v_mor001;

  IF v_cem_id IS NOT NULL THEN
    INSERT INTO public.master_task_materials
      (id, master_task_id, master_material_id, material_name, unit, quantity,
       waste_percent, last_known_unit_price)
    VALUES
      (gen_random_uuid(), v_mor001, v_cem_id, 'Cemento Portland CPN 40',
       'kg', 140, 0, COALESCE(v_cem_price, 0));
  END IF;

  IF v_cal_id IS NOT NULL THEN
    INSERT INTO public.master_task_materials
      (id, master_task_id, master_material_id, material_name, unit, quantity,
       waste_percent, last_known_unit_price)
    VALUES
      (gen_random_uuid(), v_mor001, v_cal_id, 'Cal hidratada',
       'kg', 130, 0, COALESCE(v_cal_price, 0));
  END IF;

  IF v_arg_id IS NOT NULL THEN
    INSERT INTO public.master_task_materials
      (id, master_task_id, master_material_id, material_name, unit, quantity,
       waste_percent, last_known_unit_price)
    VALUES
      (gen_random_uuid(), v_mor001, v_arg_id, 'Arena gruesa limpia',
       'm3', 1.050, 0, COALESCE(v_arg_price, 0));
  END IF;


  -- ══════════════════════════════════════════════════════════════════════════
  -- MOR-002 — Mortero 1:2:9 (revoque grueso interior)
  --
  -- Dosaje por m³:
  --   80 kg   cemento Portland
  --   100 kg  cal hidratada
  --   1.050 m³ arena fina lavada
  --
  -- Rendimiento: 8 m³/día
  -- Uso: REV-001 (revoque grueso interior 1:2:9)
  -- ══════════════════════════════════════════════════════════════════════════

  SELECT id INTO v_mor002
  FROM public.master_tasks
  WHERE organization_id = v_org_uuid AND code = 'MOR-002'
  LIMIT 1;

  IF v_mor002 IS NULL THEN
    INSERT INTO public.master_tasks
      (id, organization_id, code, name, unit, category, daily_yield, is_active)
    VALUES
      (gen_random_uuid(), v_org_uuid, 'MOR-002',
       'Mortero 1:2:9 (revoque grueso interior)', 'm3', 'Morteros', 8, true)
    RETURNING id INTO v_mor002;
    v_created := v_created + 1;
    RAISE NOTICE 'MOR-002 → CREADO id=%', v_mor002;
  ELSE
    UPDATE public.master_tasks
    SET name = 'Mortero 1:2:9 (revoque grueso interior)', unit = 'm3',
        category = 'Morteros', daily_yield = 8, is_active = true
    WHERE id = v_mor002;
    v_updated := v_updated + 1;
    RAISE NOTICE 'MOR-002 → ACTUALIZADO id=%', v_mor002;
  END IF;

  DELETE FROM public.master_task_materials WHERE master_task_id = v_mor002;

  IF v_cem_id IS NOT NULL THEN
    INSERT INTO public.master_task_materials
      (id, master_task_id, master_material_id, material_name, unit, quantity,
       waste_percent, last_known_unit_price)
    VALUES
      (gen_random_uuid(), v_mor002, v_cem_id, 'Cemento Portland CPN 40',
       'kg', 80, 0, COALESCE(v_cem_price, 0));
  END IF;

  IF v_cal_id IS NOT NULL THEN
    INSERT INTO public.master_task_materials
      (id, master_task_id, master_material_id, material_name, unit, quantity,
       waste_percent, last_known_unit_price)
    VALUES
      (gen_random_uuid(), v_mor002, v_cal_id, 'Cal hidratada',
       'kg', 100, 0, COALESCE(v_cal_price, 0));
  END IF;

  IF v_arf_id IS NOT NULL THEN
    INSERT INTO public.master_task_materials
      (id, master_task_id, master_material_id, material_name, unit, quantity,
       waste_percent, last_known_unit_price)
    VALUES
      (gen_random_uuid(), v_mor002, v_arf_id, 'Arena fina lavada',
       'm3', 1.050, 0, COALESCE(v_arf_price, 0));
  END IF;


  -- ══════════════════════════════════════════════════════════════════════════
  -- MOR-003 — Mortero 1:3 cemento-arena (revoque exterior, sin cal)
  --
  -- Dosaje por m³:
  --   350 kg  cemento Portland
  --   1.050 m³ arena media lavada
  --
  -- Rendimiento: 8 m³/día
  -- Uso: REV-003 (revoque exterior hidrófugo, el hidrófugo va aparte en el APU padre)
  --      REV-004 (revoque grueso exterior 1:3)
  -- ══════════════════════════════════════════════════════════════════════════

  SELECT id INTO v_mor003
  FROM public.master_tasks
  WHERE organization_id = v_org_uuid AND code = 'MOR-003'
  LIMIT 1;

  IF v_mor003 IS NULL THEN
    INSERT INTO public.master_tasks
      (id, organization_id, code, name, unit, category, daily_yield, is_active)
    VALUES
      (gen_random_uuid(), v_org_uuid, 'MOR-003',
       'Mortero 1:3 cemento-arena (revoque exterior)', 'm3', 'Morteros', 8, true)
    RETURNING id INTO v_mor003;
    v_created := v_created + 1;
    RAISE NOTICE 'MOR-003 → CREADO id=%', v_mor003;
  ELSE
    UPDATE public.master_tasks
    SET name = 'Mortero 1:3 cemento-arena (revoque exterior)', unit = 'm3',
        category = 'Morteros', daily_yield = 8, is_active = true
    WHERE id = v_mor003;
    v_updated := v_updated + 1;
    RAISE NOTICE 'MOR-003 → ACTUALIZADO id=%', v_mor003;
  END IF;

  DELETE FROM public.master_task_materials WHERE master_task_id = v_mor003;

  IF v_cem_id IS NOT NULL THEN
    INSERT INTO public.master_task_materials
      (id, master_task_id, master_material_id, material_name, unit, quantity,
       waste_percent, last_known_unit_price)
    VALUES
      (gen_random_uuid(), v_mor003, v_cem_id, 'Cemento Portland CPN 40',
       'kg', 350, 0, COALESCE(v_cem_price, 0));
  END IF;

  -- Arena media lavada: si no existe en 041, fallback a arena gruesa limpia
  IF v_arm_id IS NOT NULL THEN
    INSERT INTO public.master_task_materials
      (id, master_task_id, master_material_id, material_name, unit, quantity,
       waste_percent, last_known_unit_price)
    VALUES
      (gen_random_uuid(), v_mor003, v_arm_id, 'Arena media lavada',
       'm3', 1.050, 0, COALESCE(v_arm_price, 0));
  ELSIF v_arg_id IS NOT NULL THEN
    RAISE WARNING 'MOR-003: Arena media lavada no encontrada — usando Arena gruesa limpia como fallback. Ejecutar migración 041.';
    INSERT INTO public.master_task_materials
      (id, master_task_id, master_material_id, material_name, unit, quantity,
       waste_percent, last_known_unit_price)
    VALUES
      (gen_random_uuid(), v_mor003, v_arg_id, 'Arena gruesa limpia',
       'm3', 1.050, 0, COALESCE(v_arg_price, 0));
  END IF;


  -- ══════════════════════════════════════════════════════════════════════════
  -- MOR-004 — Mortero 1:4 cemento-arena (contrapisos y pisos)
  --
  -- Dosaje por m³:
  --   250 kg  cemento Portland
  --   1.050 m³ arena gruesa limpia
  --
  -- Rendimiento: 10 m³/día
  -- Uso: PIS-001 (contrapiso cascote), PIS-002 (contrapiso hormigón pobre),
  --      PIS-003 (piso cemento alisado)
  -- ══════════════════════════════════════════════════════════════════════════

  SELECT id INTO v_mor004
  FROM public.master_tasks
  WHERE organization_id = v_org_uuid AND code = 'MOR-004'
  LIMIT 1;

  IF v_mor004 IS NULL THEN
    INSERT INTO public.master_tasks
      (id, organization_id, code, name, unit, category, daily_yield, is_active)
    VALUES
      (gen_random_uuid(), v_org_uuid, 'MOR-004',
       'Mortero 1:4 cemento-arena (contrapisos y pisos)', 'm3', 'Morteros', 10, true)
    RETURNING id INTO v_mor004;
    v_created := v_created + 1;
    RAISE NOTICE 'MOR-004 → CREADO id=%', v_mor004;
  ELSE
    UPDATE public.master_tasks
    SET name = 'Mortero 1:4 cemento-arena (contrapisos y pisos)', unit = 'm3',
        category = 'Morteros', daily_yield = 10, is_active = true
    WHERE id = v_mor004;
    v_updated := v_updated + 1;
    RAISE NOTICE 'MOR-004 → ACTUALIZADO id=%', v_mor004;
  END IF;

  DELETE FROM public.master_task_materials WHERE master_task_id = v_mor004;

  IF v_cem_id IS NOT NULL THEN
    INSERT INTO public.master_task_materials
      (id, master_task_id, master_material_id, material_name, unit, quantity,
       waste_percent, last_known_unit_price)
    VALUES
      (gen_random_uuid(), v_mor004, v_cem_id, 'Cemento Portland CPN 40',
       'kg', 250, 0, COALESCE(v_cem_price, 0));
  END IF;

  IF v_arg_id IS NOT NULL THEN
    INSERT INTO public.master_task_materials
      (id, master_task_id, master_material_id, material_name, unit, quantity,
       waste_percent, last_known_unit_price)
    VALUES
      (gen_random_uuid(), v_mor004, v_arg_id, 'Arena gruesa limpia',
       'm3', 1.050, 0, COALESCE(v_arg_price, 0));
  END IF;


  RAISE NOTICE 'seed_apu_morteros → creados=%, actualizados=%', v_created, v_updated;

  RETURN jsonb_build_object(
    'created', v_created,
    'updated', v_updated,
    'total',   4
  );
END;
$$;


ALTER FUNCTION "public"."seed_apu_morteros"("p_org_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."seed_apu_morteros"("p_org_id" "text") IS 'Siembra 4 sub-APUs base de morteros (MOR-001 a MOR-004). Sin labor, sin sub-APU anidado. Unit = m3 de mortero puesto en obra. Idempotente: find-or-create en master_tasks, DELETE+INSERT en master_task_materials. Prerequisitos: migración 019 (Cemento, Arenas) + migración 041 (Cal hidratada, Arena media). Los APUs dependientes (MAM/REV/PIS con labor) van en migración 043.';



CREATE OR REPLACE FUNCTION "public"."seed_exc_mam_materials"("p_org_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_inserted integer := 0;
  v_updated  integer := 0;
  v_total    integer := 0;

  v_materials jsonb := jsonb_build_array(

    -- ── ÁRIDOS — nombres exactos del catálogo Chandías ────────────────────────

    -- "Arena gruesa" — catálogo usa este nombre; 019 tiene "Arena gruesa limpia".
    -- Ambas conviven: el engine las unifica vía NAME_ALIASES; livePriceByName necesita
    -- el nombre exacto para el lookup en handleSendToPresupuesto.
    -- Usada en: EXC-005, MAM-003, MAM-004 y decenas de otros APUs.
    jsonb_build_object(
      'name',               'Arena gruesa',
      'unit',               'm3',
      'unit_price',         8800,
      'category',           'Áridos',
      'waste_percent',      5
    ),

    -- "Piedra partida 6/20" — catálogo; 019 tiene "Piedra triturada 6/20".
    -- Alias bidireccional en chandias.ts — se agrega nombre canónico del catálogo.
    -- Usada en: EXC-005, HOR-001, HOR-002, HOR-003.
    jsonb_build_object(
      'name',               'Piedra partida 6/20',
      'unit',               'm3',
      'unit_price',         11200,
      'category',           'Áridos',
      'waste_percent',      5
    ),

    -- ── AGUA ─────────────────────────────────────────────────────────────────

    -- "Agua" — EXC-005 (0.007 m³/m²), HOR-*, hormigones en general.
    -- No estaba en ningún seed anterior. Precio simbólico (servicio municipal).
    jsonb_build_object(
      'name',               'Agua',
      'unit',               'm3',
      'unit_price',         50,
      'category',           'Áridos',
      'waste_percent',      0
    ),

    -- "Agua para compactación" — EXC-003 (0.12 m³/m³).
    -- Misma categoría y precio que "Agua"; nombre distinto para trazabilidad.
    jsonb_build_object(
      'name',               'Agua para compactación',
      'unit',               'm3',
      'unit_price',         50,
      'category',           'Áridos',
      'waste_percent',      0
    ),

    -- ── MAMPOSTERÍA ──────────────────────────────────────────────────────────

    -- "Ladrillo hueco 18x18x33" — catálogo MAM-003.
    -- 019 tiene "Ladrillo cerámico 18x18x33" (sin "hueco").
    -- Alias bidireccional en chandias.ts; se agrega nombre canónico del catálogo.
    jsonb_build_object(
      'name',               'Ladrillo hueco 18x18x33',
      'unit',               'un',
      'unit_price',         260,
      'category',           'Mampostería',
      'commercial_format',  'Millar (1000 u)',
      'commercial_unit',    'millar',
      'conversion_factor',  1000,
      'waste_percent',      5
    ),

    -- ── SEGURIDAD — en caso de que 019 ó 041 no estén ejecutados ─────────────

    -- "Cemento Portland CPN 40" — 019. Se inserta solo si no existe.
    -- Usada en: EXC-005, MAM-003, MAM-004, MAM-005, HOR-*.
    jsonb_build_object(
      'name',               'Cemento Portland CPN 40',
      'unit',               'kg',
      'unit_price',         180,
      'category',           'Aglomerantes',
      'commercial_format',  'Bolsa 50 kg',
      'commercial_unit',    'bolsa 50 kg',
      'conversion_factor',  50,
      'waste_percent',      3
    ),

    -- "Cal hidratada" — 041. Se inserta solo si no existe.
    -- Ca(OH)₂ — DISTINTO de Cal hidráulica (NHL). No intercambiables.
    jsonb_build_object(
      'name',               'Cal hidratada',
      'unit',               'kg',
      'unit_price',         95,
      'category',           'Aglomerantes',
      'commercial_format',  'Bolsa 25 kg',
      'commercial_unit',    'bolsa 25 kg',
      'conversion_factor',  25,
      'waste_percent',      3
    ),

    -- "Ladrillo hueco 12x18x33" — 019. Se inserta solo si no existe.
    -- Usado en: MAM-004.
    jsonb_build_object(
      'name',               'Ladrillo hueco 12x18x33',
      'unit',               'un',
      'unit_price',         180,
      'category',           'Mampostería',
      'commercial_format',  'Millar (1000 u)',
      'commercial_unit',    'millar',
      'conversion_factor',  1000,
      'waste_percent',      5
    )

  ); -- fin v_materials

  v_m      jsonb;
  v_id     uuid;
  v_exists boolean;
  v_cf     numeric;
  v_cu     text;
BEGIN

  FOR v_m IN SELECT jsonb_array_elements(v_materials)
  LOOP
    -- Respetar constraint mm_commercial_unit_requires_factor
    v_cf := NULLIF(TRIM(COALESCE(v_m->>'conversion_factor', '')), '')::numeric;
    v_cu := CASE
              WHEN v_cf IS NOT NULL
              THEN NULLIF(TRIM(COALESCE(v_m->>'commercial_unit', '')), '')
              ELSE NULL
            END;

    SELECT EXISTS (
      SELECT 1 FROM public.master_materials
      WHERE organization_id = p_org_id
        AND name = v_m->>'name'
        AND is_active = true
    ) INTO v_exists;

    IF v_exists THEN
      -- Actualizar precio; no pisar conversión ya seteada manualmente.
      UPDATE public.master_materials
      SET
        unit_price         = (v_m->>'unit_price')::numeric,
        commercial_format  = COALESCE(v_m->>'commercial_format', commercial_format),
        commercial_unit    = COALESCE(commercial_unit, v_cu),
        conversion_factor  = COALESCE(conversion_factor, v_cf),
        waste_percent      = COALESCE((v_m->>'waste_percent')::numeric, waste_percent),
        updated_at         = now()
      WHERE organization_id = p_org_id
        AND name = v_m->>'name'
        AND is_active = true;
      v_updated := v_updated + 1;
    ELSE
      v_id := gen_random_uuid();
      INSERT INTO public.master_materials (
        id, organization_id, name, unit, unit_price,
        category, commercial_format, commercial_unit, conversion_factor,
        waste_percent, is_active
      ) VALUES (
        v_id,
        p_org_id,
        v_m->>'name',
        v_m->>'unit',
        (v_m->>'unit_price')::numeric,
        v_m->>'category',
        v_m->>'commercial_format',
        v_cu,
        v_cf,
        COALESCE((v_m->>'waste_percent')::numeric, 0),
        true
      );
      v_inserted := v_inserted + 1;
    END IF;

    v_total := v_total + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'updated',  v_updated,
    'total',    v_total
  );
END;
$$;


ALTER FUNCTION "public"."seed_exc_mam_materials"("p_org_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."seed_exc_mam_materials"("p_org_id" "text") IS 'Siembra materiales canónicos con nombres exactos del catálogo Chandías para EXC-003/005 y MAM-003/004. Resuelve mismatches de nombre entre catálogo y seed 019: "Arena gruesa" (019: "Arena gruesa limpia"), "Piedra partida 6/20" (019: "Piedra triturada 6/20"), "Ladrillo hueco 18x18x33" (019: "Ladrillo cerámico 18x18x33"). Agrega ausentes: "Agua", "Agua para compactación". Incluye Cemento/Cal hidratada/Ladrillo 12x18x33 como seguridad si 019/041 no corrieron. Idempotente: actualiza precio si ya existe por (organization_id, name). Precios orientativos Argentina, Abril 2026.';



CREATE OR REPLACE FUNCTION "public"."seed_extended_apu"("p_org_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_inserted integer := 0;
  v_skipped  integer := 0;

  -- IDs de APUs
  v_task_id  uuid;

  -- IDs de materiales (resueltos por nombre)
  v_mat_por   uuid; -- porcelanato
  v_mat_adh   uuid; -- adhesivo
  v_mat_grout uuid; -- grout
  v_mat_fe8   uuid; -- hierro Ø8
  v_mat_fe10  uuid; -- hierro Ø10
  v_mat_est   uuid; -- estribos
  v_mat_tabla uuid; -- tabla pino 1×10
  v_mat_film  uuid; -- film polietileno
  v_mat_punt  uuid; -- puntal
  v_mat_lat   uuid; -- pintura látex
  v_mat_fij   uuid; -- fijador
  v_mat_end   uuid; -- enduido

  -- IDs de labor (resueltos por role)
  v_lab_ofi   uuid;
  v_lab_med   uuid;
  v_lab_ayu   uuid;

  -- IDs de tools (resueltos por nombre)
  v_tool_horm uuid; -- hormigonera
  v_tool_and  uuid; -- andamio

  -- Materiales de la función resolve
  m record;
BEGIN

  -- ── Resolver material IDs ────────────────────────────────────────────────
  FOR m IN
    SELECT id, name FROM public.master_materials
    WHERE organization_id = p_org_id AND is_active = true
      AND name IN (
        'Porcelanato 60x60 cm', 'Adhesivo para cerámicos', 'Grout de nivelación',
        'Hierro nervado Ø8 mm', 'Hierro nervado Ø10 mm', 'Estribos prefabricados Ø6',
        'Tabla de pino 1"×10"×3m', 'Film polietileno 200 micrones', 'Puntal metálico telescópico',
        'Pintura látex interior blanco', 'Fijador de paredes', 'Enduido plástico'
      )
  LOOP
    CASE m.name
      WHEN 'Porcelanato 60x60 cm'            THEN v_mat_por   := m.id;
      WHEN 'Adhesivo para cerámicos'          THEN v_mat_adh   := m.id;
      WHEN 'Grout de nivelación'             THEN v_mat_grout := m.id;
      WHEN 'Hierro nervado Ø8 mm'            THEN v_mat_fe8   := m.id;
      WHEN 'Hierro nervado Ø10 mm'           THEN v_mat_fe10  := m.id;
      WHEN 'Estribos prefabricados Ø6'       THEN v_mat_est   := m.id;
      WHEN 'Tabla de pino 1"×10"×3m'         THEN v_mat_tabla := m.id;
      WHEN 'Film polietileno 200 micrones'   THEN v_mat_film  := m.id;
      WHEN 'Puntal metálico telescópico'     THEN v_mat_punt  := m.id;
      WHEN 'Pintura látex interior blanco'   THEN v_mat_lat   := m.id;
      WHEN 'Fijador de paredes'              THEN v_mat_fij   := m.id;
      WHEN 'Enduido plástico'               THEN v_mat_end   := m.id;
      ELSE NULL;
    END CASE;
  END LOOP;

  -- ── Resolver labor IDs ───────────────────────────────────────────────────
  SELECT id INTO v_lab_ofi FROM public.labor_categories
  WHERE organization_id = p_org_id AND role = 'Oficial albañil' LIMIT 1;

  SELECT id INTO v_lab_med FROM public.labor_categories
  WHERE organization_id = p_org_id AND role = 'Medio oficial' LIMIT 1;

  SELECT id INTO v_lab_ayu FROM public.labor_categories
  WHERE organization_id = p_org_id AND role = 'Ayudante de obra' LIMIT 1;

  -- ── Resolver tool IDs ────────────────────────────────────────────────────
  SELECT id INTO v_tool_horm FROM public.tools
  WHERE organization_id = p_org_id AND name = 'Hormigonera 300 L' LIMIT 1;

  SELECT id INTO v_tool_and FROM public.tools
  WHERE organization_id = p_org_id AND name = 'Andamio tubular (juego)' LIMIT 1;

  -- ════════════════════════════════════════════════════════════════════════
  -- APU 1: COL-001 — Colocación de porcelanato 60×60 cm
  -- ════════════════════════════════════════════════════════════════════════
  IF NOT EXISTS (
    SELECT 1 FROM public.master_tasks
    WHERE organization_id::text = p_org_id AND name = 'Colocación de porcelanato 60×60 cm'
      AND is_active = true
  ) THEN
    INSERT INTO public.master_tasks (
      id, organization_id, code, name, unit, category, daily_yield, is_active
    ) VALUES (
      gen_random_uuid(), p_org_id, 'COL-001',
      'Colocación de porcelanato 60×60 cm', 'm2', 'Pisos', 20, true
    ) RETURNING id INTO v_task_id;

    IF v_mat_por IS NOT NULL THEN
      INSERT INTO public.master_task_materials
        (id, master_task_id, material_name, unit, quantity, waste_percent,
         master_material_id, last_known_unit_price)
      SELECT gen_random_uuid(), v_task_id, 'Porcelanato 60x60 cm', 'm2',
             1.0, 10, v_mat_por, unit_price
      FROM public.master_materials WHERE id = v_mat_por;
    END IF;

    IF v_mat_adh IS NOT NULL THEN
      INSERT INTO public.master_task_materials
        (id, master_task_id, material_name, unit, quantity, waste_percent,
         master_material_id, last_known_unit_price, conversion_factor, commercial_unit)
      SELECT gen_random_uuid(), v_task_id, 'Adhesivo para cerámicos', 'kg',
             4.5, 10, v_mat_adh, unit_price, 25, 'bolsa 25 kg'
      FROM public.master_materials WHERE id = v_mat_adh;
    END IF;

    IF v_mat_grout IS NOT NULL THEN
      INSERT INTO public.master_task_materials
        (id, master_task_id, material_name, unit, quantity, waste_percent,
         master_material_id, last_known_unit_price, conversion_factor, commercial_unit)
      SELECT gen_random_uuid(), v_task_id, 'Grout de nivelación', 'kg',
             0.5, 5, v_mat_grout, unit_price, 25, 'bolsa 25 kg'
      FROM public.master_materials WHERE id = v_mat_grout;
    END IF;

    IF v_lab_ofi IS NOT NULL THEN
      INSERT INTO public.master_task_labor
        (id, master_task_id, labor_category_id, labor_category_name, quantity)
      VALUES (gen_random_uuid(), v_task_id, v_lab_ofi::text, 'Oficial albañil', 0.5);
    END IF;
    IF v_lab_ayu IS NOT NULL THEN
      INSERT INTO public.master_task_labor
        (id, master_task_id, labor_category_id, labor_category_name, quantity)
      VALUES (gen_random_uuid(), v_task_id, v_lab_ayu::text, 'Ayudante de obra', 0.3);
    END IF;

    v_inserted := v_inserted + 1;
  ELSE
    v_skipped := v_skipped + 1;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- APU 2: ARM-001 — Armadura de hierro nervado
  -- ════════════════════════════════════════════════════════════════════════
  IF NOT EXISTS (
    SELECT 1 FROM public.master_tasks
    WHERE organization_id::text = p_org_id AND name = 'Armadura de hierro nervado'
      AND is_active = true
  ) THEN
    INSERT INTO public.master_tasks (
      id, organization_id, code, name, unit, category, daily_yield, is_active
    ) VALUES (
      gen_random_uuid(), p_org_id, 'ARM-001',
      'Armadura de hierro nervado', 'kg', 'Hormigón', 200, true
    ) RETURNING id INTO v_task_id;

    IF v_mat_fe10 IS NOT NULL THEN
      INSERT INTO public.master_task_materials
        (id, master_task_id, material_name, unit, quantity, waste_percent,
         master_material_id, last_known_unit_price)
      SELECT gen_random_uuid(), v_task_id, 'Hierro nervado Ø10 mm', 'kg',
             1.0, 8, v_mat_fe10, unit_price
      FROM public.master_materials WHERE id = v_mat_fe10;
    END IF;

    IF v_lab_ofi IS NOT NULL THEN
      INSERT INTO public.master_task_labor
        (id, master_task_id, labor_category_id, labor_category_name, quantity)
      VALUES (gen_random_uuid(), v_task_id, v_lab_ofi::text, 'Oficial albañil', 0.2);
    END IF;
    IF v_lab_ayu IS NOT NULL THEN
      INSERT INTO public.master_task_labor
        (id, master_task_id, labor_category_id, labor_category_name, quantity)
      VALUES (gen_random_uuid(), v_task_id, v_lab_ayu::text, 'Ayudante de obra', 0.3);
    END IF;

    v_inserted := v_inserted + 1;
  ELSE
    v_skipped := v_skipped + 1;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- APU 3: ENC-001 — Encofrado de losa con tablas
  -- ════════════════════════════════════════════════════════════════════════
  IF NOT EXISTS (
    SELECT 1 FROM public.master_tasks
    WHERE organization_id::text = p_org_id AND name = 'Encofrado de losa con tablas'
      AND is_active = true
  ) THEN
    INSERT INTO public.master_tasks (
      id, organization_id, code, name, unit, category, daily_yield, is_active
    ) VALUES (
      gen_random_uuid(), p_org_id, 'ENC-001',
      'Encofrado de losa con tablas', 'm2', 'Encofrados', 15, true
    ) RETURNING id INTO v_task_id;

    IF v_mat_tabla IS NOT NULL THEN
      INSERT INTO public.master_task_materials
        (id, master_task_id, material_name, unit, quantity, waste_percent,
         master_material_id, last_known_unit_price)
      SELECT gen_random_uuid(), v_task_id, 'Tabla de pino 1"×10"×3m', 'u',
             0.8, 15, v_mat_tabla, unit_price
      FROM public.master_materials WHERE id = v_mat_tabla;
    END IF;

    IF v_mat_punt IS NOT NULL THEN
      INSERT INTO public.master_task_materials
        (id, master_task_id, material_name, unit, quantity, waste_percent,
         master_material_id, last_known_unit_price)
      SELECT gen_random_uuid(), v_task_id, 'Puntal metálico telescópico', 'u',
             0.15, 0, v_mat_punt, unit_price
      FROM public.master_materials WHERE id = v_mat_punt;
    END IF;

    IF v_mat_film IS NOT NULL THEN
      INSERT INTO public.master_task_materials
        (id, master_task_id, material_name, unit, quantity, waste_percent,
         master_material_id, last_known_unit_price)
      SELECT gen_random_uuid(), v_task_id, 'Film polietileno 200 micrones', 'm2',
             1.1, 5, v_mat_film, unit_price
      FROM public.master_materials WHERE id = v_mat_film;
    END IF;

    IF v_lab_ofi IS NOT NULL THEN
      INSERT INTO public.master_task_labor
        (id, master_task_id, labor_category_id, labor_category_name, quantity)
      VALUES (gen_random_uuid(), v_task_id, v_lab_ofi::text, 'Oficial albañil', 0.4);
    END IF;
    IF v_lab_ayu IS NOT NULL THEN
      INSERT INTO public.master_task_labor
        (id, master_task_id, labor_category_id, labor_category_name, quantity)
      VALUES (gen_random_uuid(), v_task_id, v_lab_ayu::text, 'Ayudante de obra', 0.5);
    END IF;

    v_inserted := v_inserted + 1;
  ELSE
    v_skipped := v_skipped + 1;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- APU 4: PIN-001 — Pintura látex interior (2 manos + fijador + enduido)
  -- ════════════════════════════════════════════════════════════════════════
  IF NOT EXISTS (
    SELECT 1 FROM public.master_tasks
    WHERE organization_id::text = p_org_id AND name = 'Pintura látex interior (2 manos)'
      AND is_active = true
  ) THEN
    INSERT INTO public.master_tasks (
      id, organization_id, code, name, unit, category, daily_yield, is_active
    ) VALUES (
      gen_random_uuid(), p_org_id, 'PIN-001',
      'Pintura látex interior (2 manos)', 'm2', 'Pinturas', 45, true
    ) RETURNING id INTO v_task_id;

    IF v_mat_fij IS NOT NULL THEN
      INSERT INTO public.master_task_materials
        (id, master_task_id, material_name, unit, quantity, waste_percent,
         master_material_id, last_known_unit_price, conversion_factor, commercial_unit)
      SELECT gen_random_uuid(), v_task_id, 'Fijador de paredes', 'lt',
             0.12, 5, v_mat_fij, unit_price, 20, 'balde 20 lt'
      FROM public.master_materials WHERE id = v_mat_fij;
    END IF;

    IF v_mat_end IS NOT NULL THEN
      INSERT INTO public.master_task_materials
        (id, master_task_id, material_name, unit, quantity, waste_percent,
         master_material_id, last_known_unit_price, conversion_factor, commercial_unit)
      SELECT gen_random_uuid(), v_task_id, 'Enduido plástico', 'kg',
             0.35, 5, v_mat_end, unit_price, 30, 'balde 30 kg'
      FROM public.master_materials WHERE id = v_mat_end;
    END IF;

    IF v_mat_lat IS NOT NULL THEN
      INSERT INTO public.master_task_materials
        (id, master_task_id, material_name, unit, quantity, waste_percent,
         master_material_id, last_known_unit_price, conversion_factor, commercial_unit)
      SELECT gen_random_uuid(), v_task_id, 'Pintura látex interior blanco', 'lt',
             0.25, 5, v_mat_lat, unit_price, 20, 'balde 20 lt'
      FROM public.master_materials WHERE id = v_mat_lat;
    END IF;

    IF v_lab_ofi IS NOT NULL THEN
      INSERT INTO public.master_task_labor
        (id, master_task_id, labor_category_id, labor_category_name, quantity)
      VALUES (gen_random_uuid(), v_task_id, v_lab_ofi::text, 'Oficial albañil', 0.15);
    END IF;
    IF v_lab_ayu IS NOT NULL THEN
      INSERT INTO public.master_task_labor
        (id, master_task_id, labor_category_id, labor_category_name, quantity)
      VALUES (gen_random_uuid(), v_task_id, v_lab_ayu::text, 'Ayudante de obra', 0.1);
    END IF;

    IF v_tool_and IS NOT NULL THEN
      INSERT INTO public.master_task_equipment
        (id, master_task_id, tool_id, tool_name, hours_per_unit)
      VALUES (gen_random_uuid(), v_task_id, v_tool_and::text, 'Andamio tubular (juego)', 0.1);
    END IF;

    v_inserted := v_inserted + 1;
  ELSE
    v_skipped := v_skipped + 1;
  END IF;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'skipped',  v_skipped,
    'total',    v_inserted + v_skipped
  );
END;
$$;


ALTER FUNCTION "public"."seed_extended_apu"("p_org_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."seed_extended_apu"("p_org_id" "text") IS 'Siembra 4 APUs adicionales (COL-001, ARM-001, ENC-001, PIN-001). Prerequisito: seed_extended_materials ejecutado para la misma org. Idempotente: omite APUs que ya existen por nombre.';



CREATE OR REPLACE FUNCTION "public"."seed_extended_materials"("p_org_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_inserted integer := 0;
  v_updated  integer := 0;
  v_total    integer := 0;

  v_materials jsonb := jsonb_build_array(

    -- ── AGLOMERANTES ─────────────────────────────────────────────────────────
    jsonb_build_object('name','Cemento Portland CPN 40',    'unit','kg',  'unit_price',180,  'category','Aglomerantes', 'commercial_format','Bolsa 50 kg',  'commercial_unit','bolsa 50 kg', 'waste_percent',3,  'conversion_factor',50),
    jsonb_build_object('name','Cal hidráulica',              'unit','kg',  'unit_price',95,   'category','Aglomerantes', 'commercial_format','Bolsa 25 kg',  'commercial_unit','bolsa 25 kg', 'waste_percent',3,  'conversion_factor',25),
    jsonb_build_object('name','Cal aérea en polvo',          'unit','kg',  'unit_price',85,   'category','Aglomerantes', 'commercial_format','Bolsa 20 kg',  'commercial_unit','bolsa 20 kg', 'waste_percent',3,  'conversion_factor',20),
    jsonb_build_object('name','Yeso de construcción',        'unit','kg',  'unit_price',70,   'category','Aglomerantes', 'commercial_format','Bolsa 40 kg',  'commercial_unit','bolsa 40 kg', 'waste_percent',5,  'conversion_factor',40),
    jsonb_build_object('name','Adhesivo para cerámicos',     'unit','kg',  'unit_price',320,  'category','Aglomerantes', 'commercial_format','Bolsa 25 kg',  'commercial_unit','bolsa 25 kg', 'waste_percent',10, 'conversion_factor',25),

    -- ── ÁRIDOS ───────────────────────────────────────────────────────────────
    jsonb_build_object('name','Arena fina lavada',           'unit','m3',  'unit_price',9500, 'category','Áridos',        'waste_percent',5),
    jsonb_build_object('name','Arena gruesa limpia',         'unit','m3',  'unit_price',8800, 'category','Áridos',        'waste_percent',5),
    jsonb_build_object('name','Piedra triturada 6/20',       'unit','m3',  'unit_price',11200,'category','Áridos',        'waste_percent',5),
    jsonb_build_object('name','Tosca compactable',           'unit','m3',  'unit_price',3200, 'category','Áridos',        'waste_percent',0),
    jsonb_build_object('name','Grout de nivelación',         'unit','kg',  'unit_price',280,  'category','Áridos',        'commercial_format','Bolsa 25 kg',  'commercial_unit','bolsa 25 kg', 'waste_percent',5, 'conversion_factor',25),

    -- ── ESTRUCTURAL ──────────────────────────────────────────────────────────
    -- NOTA: hierro nervado → commercial_unit omitido intencionalmente.
    -- La masa de 1 barra varía por diámetro (Ø6≈2.7kg, Ø8≈4.7kg, Ø10≈7.4kg, Ø12≈10.7kg),
    -- no existe un conversion_factor único correcto. La constraint
    -- mm_commercial_unit_requires_factor exige que si commercial_unit IS NOT NULL
    -- entonces conversion_factor también sea NOT NULL.
    -- Se mantiene commercial_format como texto informativo para el usuario.
    jsonb_build_object('name','Hierro nervado Ø6 mm',        'unit','kg',  'unit_price',920,  'category','Estructural',   'commercial_format','Barra 12 m',   'waste_percent',8),
    jsonb_build_object('name','Hierro nervado Ø8 mm',        'unit','kg',  'unit_price',935,  'category','Estructural',   'commercial_format','Barra 12 m',   'waste_percent',8),
    jsonb_build_object('name','Hierro nervado Ø10 mm',       'unit','kg',  'unit_price',950,  'category','Estructural',   'commercial_format','Barra 12 m',   'waste_percent',8),
    jsonb_build_object('name','Hierro nervado Ø12 mm',       'unit','kg',  'unit_price',960,  'category','Estructural',   'commercial_format','Barra 12 m',   'waste_percent',8),
    jsonb_build_object('name','Malla electrosoldada Ø5 c15', 'unit','m2',  'unit_price',1850, 'category','Estructural',   'waste_percent',10),
    jsonb_build_object('name','Estribos prefabricados Ø6',   'unit','kg',  'unit_price',980,  'category','Estructural',   'waste_percent',5),

    -- ── MAMPOSTERÍA ──────────────────────────────────────────────────────────
    jsonb_build_object('name','Ladrillo cerámico 18x18x33',  'unit','u',   'unit_price',260,  'category','Mampostería',   'waste_percent',5),
    jsonb_build_object('name','Ladrillo hueco 12x18x33',     'unit','u',   'unit_price',180,  'category','Mampostería',   'waste_percent',5),
    jsonb_build_object('name','Bloque cemento 20x20x40',     'unit','u',   'unit_price',420,  'category','Mampostería',   'waste_percent',3),
    jsonb_build_object('name','Ladrillo visto 5,5x12x25',    'unit','u',   'unit_price',310,  'category','Mampostería',   'waste_percent',5),

    -- ── PISOS Y REVESTIMIENTOS ───────────────────────────────────────────────
    jsonb_build_object('name','Porcelanato 60x60 cm',        'unit','m2',  'unit_price',8500, 'category','Pisos',         'waste_percent',10),
    jsonb_build_object('name','Cerámico 33x33 cm',           'unit','m2',  'unit_price',3200, 'category','Pisos',         'waste_percent',10),
    jsonb_build_object('name','Membrana asfáltica 4mm',      'unit','m2',  'unit_price',2800, 'category','Impermeab.',    'waste_percent',10),
    jsonb_build_object('name','Sellador epoxi para pisos',   'unit','lt',  'unit_price',1200, 'category','Pisos'),
    -- NUEVO 023: azulejo 15×15cm — unidad técnica = un (46 un por m² de pared en RVE-001)
    jsonb_build_object('name','Azulejo 15×15cm',             'unit','un',  'unit_price',90,   'category','Pisos',         'waste_percent',10),
    -- NUEVO 023: pastina cementicia — unidad técnica = kg
    jsonb_build_object('name','Pastina cementicia',          'unit','kg',  'unit_price',480,  'category','Pisos',         'waste_percent',5),

    -- ── PINTURAS ─────────────────────────────────────────────────────────────
    jsonb_build_object('name','Pintura látex interior blanco','unit','lt',  'unit_price',1450, 'category','Pinturas',     'commercial_format','Balde 20 lt',  'commercial_unit','balde 20 lt', 'waste_percent',5, 'conversion_factor',20),
    jsonb_build_object('name','Pintura látex exterior',       'unit','lt',  'unit_price',1650, 'category','Pinturas',     'commercial_format','Balde 20 lt',  'commercial_unit','balde 20 lt', 'waste_percent',5, 'conversion_factor',20),
    jsonb_build_object('name','Fijador de paredes',           'unit','lt',  'unit_price',780,  'category','Pinturas',     'commercial_format','Balde 20 lt',  'commercial_unit','balde 20 lt', 'conversion_factor',20),
    jsonb_build_object('name','Enduido plástico',             'unit','kg',  'unit_price',380,  'category','Pinturas',     'commercial_format','Balde 30 kg',  'commercial_unit','balde 30 kg', 'waste_percent',5, 'conversion_factor',30),

    -- ── MADERA Y ENCOFRADO ───────────────────────────────────────────────────
    jsonb_build_object('name','Tabla de pino 1"×10"×3m',     'unit','u',   'unit_price',3800, 'category','Madera',        'waste_percent',15),
    jsonb_build_object('name','Madera pino cepillada 3×3',   'unit','m',   'unit_price',1800, 'category','Madera'),
    jsonb_build_object('name','Puntal metálico telescópico', 'unit','u',   'unit_price',4500, 'category','Encofrado'),
    jsonb_build_object('name','Film polietileno 200 micrones','unit','m2',  'unit_price',180,  'category','Impermeab.'),

    -- ── ELECTRICIDAD ─────────────────────────────────────────────────────────
    jsonb_build_object('name','Cable NYY 2×1.5 mm²',         'unit','m',   'unit_price',850,  'category','Electricidad'),
    jsonb_build_object('name','Cable unipolar 2.5 mm² negro', 'unit','m',  'unit_price',380,  'category','Electricidad'),
    jsonb_build_object('name','Cañería PVC 20 mm (eléctrica)','unit','m',  'unit_price',180,  'category','Electricidad'),
    jsonb_build_object('name','Caja plástica 4×4"',           'unit','u',  'unit_price',120,  'category','Electricidad'),

    -- ── SANITARIA ────────────────────────────────────────────────────────────
    jsonb_build_object('name','Caño PVC 110 mm',             'unit','m',   'unit_price',1250, 'category','Sanitaria',     'commercial_format','Caño 3 m',     'commercial_unit','caño 3 m',    'conversion_factor',3),
    jsonb_build_object('name','Caño PVC 63 mm',              'unit','m',   'unit_price',680,  'category','Sanitaria',     'commercial_format','Caño 3 m',     'commercial_unit','caño 3 m',    'conversion_factor',3),
    jsonb_build_object('name','Codo PVC 110×90°',            'unit','u',   'unit_price',320,  'category','Sanitaria'),
    jsonb_build_object('name','Pegamento para PVC',          'unit','lt',  'unit_price',1100, 'category','Sanitaria',     'commercial_format','Frasco 250 cc')
  );

  v_m    jsonb;
  v_id   uuid;
  v_exists boolean;
  -- Normalización defensiva contra constraint mm_commercial_unit_requires_factor:
  -- commercial_unit solo puede ser NOT NULL cuando conversion_factor también lo es.
  v_cf   numeric;   -- conversion_factor del registro actual
  v_cu   text;      -- commercial_unit — se anula si v_cf es NULL
BEGIN
  FOR v_m IN SELECT jsonb_array_elements(v_materials)
  LOOP
    -- Resolver conversion_factor y commercial_unit de forma atómica.
    -- Si el jsonb trae commercial_unit pero no conversion_factor (ej.: hierro),
    -- ambos quedan NULL para no violar mm_commercial_unit_requires_factor.
    v_cf := NULLIF(TRIM(COALESCE(v_m->>'conversion_factor', '')), '')::numeric;
    v_cu := CASE WHEN v_cf IS NOT NULL THEN NULLIF(TRIM(COALESCE(v_m->>'commercial_unit', '')), '') ELSE NULL END;

    SELECT EXISTS (
      SELECT 1 FROM public.master_materials
      WHERE organization_id = p_org_id
        AND name = v_m->>'name'
        AND is_active = true
    ) INTO v_exists;

    IF v_exists THEN
      UPDATE public.master_materials
      SET
        unit_price         = (v_m->>'unit_price')::numeric,
        commercial_format  = v_m->>'commercial_format',
        -- Solo completar los campos de conversión si siguen NULL en DB
        -- y el jsonb trae un par coherente (v_cu/v_cf ya normalizados arriba).
        commercial_unit    = COALESCE(commercial_unit,   v_cu),
        conversion_factor  = COALESCE(conversion_factor, v_cf),
        waste_percent      = COALESCE((v_m->>'waste_percent')::numeric, waste_percent),
        updated_at         = now()
      WHERE organization_id = p_org_id
        AND name = v_m->>'name'
        AND is_active = true;
      v_updated := v_updated + 1;
    ELSE
      v_id := gen_random_uuid();
      INSERT INTO public.master_materials (
        id, organization_id, name, unit, unit_price,
        category, commercial_format, commercial_unit, conversion_factor,
        waste_percent, is_active
      ) VALUES (
        v_id,
        p_org_id,
        v_m->>'name',
        v_m->>'unit',
        (v_m->>'unit_price')::numeric,
        v_m->>'category',
        v_m->>'commercial_format',
        v_cu,   -- ya normalizado: NULL si no hay conversion_factor
        v_cf,   -- ya normalizado: NULL si no vino en el jsonb
        COALESCE((v_m->>'waste_percent')::numeric, 0),
        true
      );
      v_inserted := v_inserted + 1;
    END IF;

    v_total := v_total + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'updated',  v_updated,
    'total',    v_total
  );
END;
$$;


ALTER FUNCTION "public"."seed_extended_materials"("p_org_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."seed_extended_materials"("p_org_id" "text") IS 'Siembra materiales de construcción extendidos para demo/setup inicial. Idempotente: actualiza precio si el material ya existe por (organization_id, name). Escribe commercial_unit y conversion_factor sin pisar datos existentes. v023: agrega Azulejo 15×15cm y Pastina cementicia para catálogo Chandías RVE-001. Los precios son orientativos para Argentina, Abril 2026.';



CREATE OR REPLACE FUNCTION "public"."seed_mortero_materials"("p_org_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_inserted integer := 0;
  v_updated  integer := 0;
  v_total    integer := 0;

  v_materials jsonb := jsonb_build_array(

    -- ── AGLOMERANTES ─────────────────────────────────────────────────────────

    -- Cal hidratada (hidróxido de calcio, Ca(OH)₂)
    -- Producto DISTINTO de Cal hidráulica (NHL) y Cal aérea en polvo.
    -- Alias bidireccional con cal hidráulica eliminado en chandias.ts (041).
    -- Usada en: MAM-001/002/003/004/005/006 (mortero 1:1:6), REV-001/002/004.
    -- Precio orientativo: similar a cal hidráulica en bolsa 25 kg.
    jsonb_build_object(
      'name',               'Cal hidratada',
      'unit',               'kg',
      'unit_price',         95,
      'category',           'Aglomerantes',
      'commercial_format',  'Bolsa 25 kg',
      'commercial_unit',    'bolsa 25 kg',
      'conversion_factor',  25,
      'waste_percent',      3
    ),

    -- ── MAMPOSTERÍA ──────────────────────────────────────────────────────────

    -- Ladrillo común 6x12x24
    -- Usado en: MAM-001 (70 un/m²), MAM-002 (35 un/m²).
    -- Comercializado por millar. conversion_factor = 1000.
    jsonb_build_object(
      'name',               'Ladrillo común 6x12x24',
      'unit',               'un',
      'unit_price',         200,
      'category',           'Mampostería',
      'commercial_format',  'Millar (1000 u)',
      'commercial_unit',    'millar',
      'conversion_factor',  1000,
      'waste_percent',      5
    ),

    -- Ladrillo hueco 8x18x33
    -- Usado en: MAM-005 (20 un/m², tabique e=0.08m), MAM-006 (32 un/m²).
    jsonb_build_object(
      'name',               'Ladrillo hueco 8x18x33',
      'unit',               'un',
      'unit_price',         120,
      'category',           'Mampostería',
      'commercial_format',  'Millar (1000 u)',
      'commercial_unit',    'millar',
      'conversion_factor',  1000,
      'waste_percent',      5
    ),

    -- ── ÁRIDOS ───────────────────────────────────────────────────────────────

    -- Cascote de ladrillo
    -- Usado en: PIS-001 (contrapiso cascote e=12cm, 0.12 m³/m²).
    -- A granel; sin unidad comercial fija.
    jsonb_build_object(
      'name',               'Cascote de ladrillo',
      'unit',               'm³',
      'unit_price',         2500,
      'category',           'Áridos',
      'waste_percent',      10
    ),

    -- Arena media lavada
    -- Granulometría intermedia entre arena fina lavada y arena gruesa limpia.
    -- No cubierta por aliases del motor.
    -- Usada en: REV-003 (revoque exterior hidrófugo), REV-004 (revoque grueso exterior).
    jsonb_build_object(
      'name',               'Arena media lavada',
      'unit',               'm³',
      'unit_price',         9200,
      'category',           'Áridos',
      'waste_percent',      5
    ),

    -- ── IMPERMEABILIZANTES ───────────────────────────────────────────────────

    -- Hidrófugo líquido integral
    -- Aditivo para morteros de revoque exterior — se mezcla con el agua de amasado.
    -- Unidad: 'lt' (consistente con Sellador epoxi, Pinturas, Fijador en seed 019).
    -- Categoría: 'Impermeab.' (ya usada para Membrana asfáltica y Film en 019).
    -- Usado en: REV-003 (0.20 lt/m²).
    jsonb_build_object(
      'name',               'Hidrófugo líquido integral',
      'unit',               'lt',
      'unit_price',         1800,
      'category',           'Impermeab.',
      'commercial_format',  'Bidón 5 L',
      'commercial_unit',    'bidón 5 lt',
      'conversion_factor',  5,
      'waste_percent',      5
    )

  );

  v_m      jsonb;
  v_id     uuid;
  v_exists boolean;
  v_cf     numeric;
  v_cu     text;
BEGIN

  FOR v_m IN SELECT jsonb_array_elements(v_materials)
  LOOP
    -- Normalizar conversion_factor y commercial_unit de forma atómica.
    -- Respeta constraint mm_commercial_unit_requires_factor:
    -- commercial_unit solo puede ser NOT NULL si conversion_factor también lo es.
    v_cf := NULLIF(TRIM(COALESCE(v_m->>'conversion_factor', '')), '')::numeric;
    v_cu := CASE
              WHEN v_cf IS NOT NULL
              THEN NULLIF(TRIM(COALESCE(v_m->>'commercial_unit', '')), '')
              ELSE NULL
            END;

    SELECT EXISTS (
      SELECT 1 FROM public.master_materials
      WHERE organization_id = p_org_id
        AND name = v_m->>'name'
        AND is_active = true
    ) INTO v_exists;

    IF v_exists THEN
      -- Actualizar precio; no pisar campos de conversión ya seteados.
      UPDATE public.master_materials
      SET
        unit_price         = (v_m->>'unit_price')::numeric,
        commercial_format  = COALESCE(v_m->>'commercial_format', commercial_format),
        commercial_unit    = COALESCE(commercial_unit, v_cu),
        conversion_factor  = COALESCE(conversion_factor, v_cf),
        waste_percent      = COALESCE((v_m->>'waste_percent')::numeric, waste_percent),
        updated_at         = now()
      WHERE organization_id = p_org_id
        AND name = v_m->>'name'
        AND is_active = true;
      v_updated := v_updated + 1;
    ELSE
      v_id := gen_random_uuid();
      INSERT INTO public.master_materials (
        id, organization_id, name, unit, unit_price,
        category, commercial_format, commercial_unit, conversion_factor,
        waste_percent, is_active
      ) VALUES (
        v_id,
        p_org_id,
        v_m->>'name',
        v_m->>'unit',
        (v_m->>'unit_price')::numeric,
        v_m->>'category',
        v_m->>'commercial_format',
        v_cu,
        v_cf,
        COALESCE((v_m->>'waste_percent')::numeric, 0),
        true
      );
      v_inserted := v_inserted + 1;
    END IF;

    v_total := v_total + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'updated',  v_updated,
    'total',    v_total
  );
END;
$$;


ALTER FUNCTION "public"."seed_mortero_materials"("p_org_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."seed_mortero_materials"("p_org_id" "text") IS 'Siembra materiales canónicos para morteros, mampostería, revoques y contrapisos. Idempotente: actualiza precio si el material ya existe por (organization_id, name). Complementa seed_extended_materials (019/023) sin reemplazarla. Materiales agregados: Cal hidratada, Ladrillo común 6x12x24, Ladrillo hueco 8x18x33, Cascote de ladrillo, Arena media lavada, Hidrófugo líquido integral. NOTA: Cal hidratada (Ca(OH)₂) es producto distinto de Cal hidráulica (NHL). El alias bidireccional entre ambas fue eliminado en chandias.ts (PR 041). Precios orientativos Argentina, Abril 2026.';



CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_current_snapshot_cache"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_resource_id uuid;
  v_tenant_id   uuid;
  v_snap_id     uuid;
BEGIN
  v_resource_id := CASE TG_OP WHEN 'DELETE' THEN OLD.resource_id ELSE NEW.resource_id END;
  v_tenant_id   := CASE TG_OP WHEN 'DELETE' THEN OLD.tenant_id   ELSE NEW.tenant_id   END;

  -- Snapshot futuro en INSERT: no actualizar caché, no es vigente aún
  IF TG_OP = 'INSERT' AND NEW.effective_date > CURRENT_DATE THEN
    RETURN NEW;
  END IF;

  -- Resolver el snapshot vigente más reciente (no FALLBACK)
  SELECT id INTO v_snap_id
  FROM public.resource_cost_snapshots
  WHERE tenant_id    = v_tenant_id
    AND resource_id  = v_resource_id
    AND effective_date <= CURRENT_DATE
    AND source_type   <> 'FALLBACK_BASE_COST'
  ORDER BY effective_date DESC, created_at DESC
  LIMIT 1;

  -- Actualizar caché (NULL si no existe snapshot → vuelve a fallback)
  UPDATE public.resources
  SET current_snapshot_id = v_snap_id
  WHERE id = v_resource_id;

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;


ALTER FUNCTION "public"."sync_current_snapshot_cache"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_profile_email"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.email := (SELECT email FROM auth.users WHERE id = NEW.id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_profile_email"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_fn_create_org_subscription"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  BEGIN
    INSERT INTO public.organization_subscriptions (
      organization_id,
      plan_id,
      status,
      trial_ends_at
    ) VALUES (
      NEW.id,
      'starter',
      'trialing',
      now() + interval '14 days'
    )
    ON CONFLICT (organization_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- No fallar la creación de la org si la subscription falla
    RAISE WARNING 'trg_fn_create_org_subscription: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_fn_create_org_subscription"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_fn_new_org_seed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Sembrar materiales base para la nueva organización
  PERFORM public.seed_extended_materials(NEW.id::text);
  -- Aplicar reglas de conversión comercial
  PERFORM public.apply_commercial_rules(NEW.id::text);
  RETURN NEW;
EXCEPTION
  -- No fallar el INSERT de la org si el seed falla (ej: columnas faltantes antes de 021)
  WHEN OTHERS THEN
    RAISE WARNING '[trg_new_org_seed] Error al sembrar materiales para org %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_fn_new_org_seed"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."trg_fn_new_org_seed"() IS 'Trigger: al crear una organización, siembra materiales base y aplica reglas de conversión comercial automáticamente. Idempotente y tolerante a fallas.';



CREATE OR REPLACE FUNCTION "public"."trg_set_updated_at_org_sub"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_set_updated_at_org_sub"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_index_value"("p_index_code" "text", "p_year" smallint, "p_month" smallint, "p_value" numeric, "p_published_at" "date" DEFAULT NULL::"date", "p_source_ref" "text" DEFAULT NULL::"text", "p_tenant_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_index_id uuid;
  v_result_id uuid;
BEGIN
  -- ── FIX 5: Autorización explícita ──────────────────────────────────────────
  IF p_tenant_id IS NULL THEN
    -- Índices globales: solo service_role (auth.uid() IS NULL en Supabase para service_role)
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'FORBIDDEN: índices globales solo pueden modificarse con service_role'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    -- Índices privados: requiere owner o admin del tenant
    IF NOT is_org_member_with_role(p_tenant_id, ARRAY['owner','admin']) THEN
      RAISE EXCEPTION 'FORBIDDEN: se requiere rol owner o admin para modificar índices del tenant %', p_tenant_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Resolver index_id por code + scope
  SELECT id INTO v_index_id
  FROM public.cost_indices
  WHERE code = p_index_code
    AND (
      (p_tenant_id IS NULL AND tenant_id IS NULL)
      OR tenant_id = p_tenant_id
    )
  LIMIT 1;

  IF v_index_id IS NULL THEN
    RAISE EXCEPTION 'Índice no encontrado: code=%, tenant=%', p_index_code, p_tenant_id
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.cost_index_values
    (index_id, period_year, period_month, value, published_at, source_reference)
  VALUES
    (v_index_id, p_year, p_month, p_value, p_published_at, p_source_ref)
  ON CONFLICT (index_id, period_year, period_month)
  DO UPDATE SET
    value            = EXCLUDED.value,
    published_at     = COALESCE(EXCLUDED.published_at,     cost_index_values.published_at),
    source_reference = COALESCE(EXCLUDED.source_reference, cost_index_values.source_reference)
  RETURNING id INTO v_result_id;

  RETURN v_result_id;
END;
$$;


ALTER FUNCTION "public"."upsert_index_value"("p_index_code" "text", "p_year" smallint, "p_month" smallint, "p_value" numeric, "p_published_at" "date", "p_source_ref" "text", "p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_composite_components"("cfg" "jsonb") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT
    jsonb_typeof(cfg -> 'components') = 'array'
    AND jsonb_array_length(cfg -> 'components') >= 1
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(cfg -> 'components') c
      WHERE
        -- index_id requerido y no nulo
        (c ->> 'index_id') IS NULL
        -- weight requerido, número y positivo
        OR (c -> 'weight') IS NULL
        OR jsonb_typeof(c -> 'weight') <> 'number'
        OR (c ->> 'weight')::numeric <= 0
        -- base_period requerido con year y month
        OR (c -> 'base_period') IS NULL
        OR jsonb_typeof(c -> 'base_period') <> 'object'
        OR (c -> 'base_period' ->> 'year')  IS NULL
        OR (c -> 'base_period' ->> 'month') IS NULL
    )
$$;


ALTER FUNCTION "public"."validate_composite_components"("cfg" "jsonb") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid",
    "operation" "text" NOT NULL,
    "entity" "text" NOT NULL,
    "entity_id" "text" NOT NULL,
    "before_data" "jsonb",
    "after_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "audit_log_operation_check" CHECK (("operation" = ANY (ARRAY['INSERT'::"text", 'UPDATE'::"text", 'DELETE'::"text", 'MANUAL'::"text"])))
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."budget_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "task_id" "uuid" NOT NULL,
    "quantity" numeric(14,4) DEFAULT 0 NOT NULL,
    "start_date" "date",
    "end_date" "date",
    "status" "text",
    "progress" numeric(8,4) DEFAULT 0 NOT NULL,
    "dependencies" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "manual_duration" integer,
    "crews_assigned" integer DEFAULT 1 NOT NULL,
    "efficiency_factor" numeric(8,4),
    "allowance_percent" numeric(8,4),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sort_order" integer,
    "computation_item_id" "uuid"
);


ALTER TABLE "public"."budget_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."budget_items"."sort_order" IS 'Orden de visualización dentro del presupuesto. NULL = sin orden explícito (se usa created_at). Los valores son múltiplos de 10 para dejar espacio a inserciones futuras.';



COMMENT ON COLUMN "public"."budget_items"."computation_item_id" IS 'Vínculo opcional al computation_item de origen (Calculadora Chandías). NULL = ítem creado manualmente en BudgetEditor. En esta etapa es solo trazabilidad: no afecta cálculos ni lógica existente. ON DELETE SET NULL: el budget_item sobrevive si se elimina el computation_item.';



CREATE TABLE IF NOT EXISTS "public"."budget_template_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "budget_template_id" "uuid" NOT NULL,
    "master_task_id" "uuid" NOT NULL,
    "quantity" numeric(14,4) DEFAULT 1 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."budget_template_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."budget_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "category" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."budget_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."budget_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "version_number" integer NOT NULL,
    "label" "text" NOT NULL,
    "method" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "base_period" "date",
    "target_period" "date",
    "factors" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "totals" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    CONSTRAINT "budget_versions_version_number_check" CHECK (("version_number" >= 1))
);


ALTER TABLE "public"."budget_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."catalog_task_yields" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "master_task_id" "uuid" NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "quantity" numeric(14,6) DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "commercial_unit" "text",
    "conversion_factor" numeric(14,6),
    CONSTRAINT "cty_conversion_factor_positive" CHECK ((("conversion_factor" IS NULL) OR ("conversion_factor" > (0)::numeric)))
);


ALTER TABLE "public"."catalog_task_yields" OWNER TO "postgres";


COMMENT ON TABLE "public"."catalog_task_yields" IS 'Composición de un APU (master_task) en términos de resources del catálogo.';



COMMENT ON COLUMN "public"."catalog_task_yields"."commercial_unit" IS 'Override de unidad comercial a nivel de yield de catálogo. NULL = hereda de resources.commercial_unit del recurso asociado. Ejemplo: "bolsa 50 kg", "barra 12 m".';



COMMENT ON COLUMN "public"."catalog_task_yields"."conversion_factor" IS 'Override de factor de conversión a nivel de yield de catálogo. NULL = hereda de resources.conversion_factor del recurso asociado. Debe ser > 0 cuando está definido.';



CREATE TABLE IF NOT EXISTS "public"."catalogs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" DEFAULT 'global'::"text" NOT NULL,
    "organization_id" "uuid",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."catalogs" OWNER TO "postgres";


COMMENT ON TABLE "public"."catalogs" IS 'Catálogos de recursos: global (organization_id NULL) o por organización.';



CREATE TABLE IF NOT EXISTS "public"."computation_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "computation_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "chandias_task_id" "text" NOT NULL,
    "master_task_id" "uuid",
    "description" "text",
    "dims" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "quantity" numeric(14,4) NOT NULL,
    "unidad" "text" NOT NULL,
    "materiales_snapshot" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "manual_materials" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "steel_diameter_mm" numeric(6,2),
    "sort_order" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "computation_items_quantity_check" CHECK (("quantity" >= (0)::numeric))
);


ALTER TABLE "public"."computation_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."computation_items" IS 'Ítems individuales de cómputo paramétrico (Calculadora Chandías). Cada fila es un rubro calculado con sus dimensiones, cantidad y receta técnica. materiales_snapshot y manual_materials son snapshots SIN PRECIOS. Los precios se resuelven en runtime desde master_materials.';



COMMENT ON COLUMN "public"."computation_items"."chandias_task_id" IS 'ID del rubro en el catálogo TypeScript de Chandías (ChandiasTask.id). No es FK a DB — el catálogo es client-side. Ej: ''FUN-001'', ''T1006-VIGA''.';



COMMENT ON COLUMN "public"."computation_items"."master_task_id" IS 'FK opcional al APU Maestro (master_tasks). NULL mientras no se cree el APU. ON DELETE SET NULL: el computation_item sobrevive si se elimina el APU.';



COMMENT ON COLUMN "public"."computation_items"."dims" IS 'Dimensiones usadas en el cálculo. Ejemplo: {"largo": 5.0, "ancho": 0.40, "alto": 0.60}. Permite reconstruir o auditar el cálculo original.';



COMMENT ON COLUMN "public"."computation_items"."materiales_snapshot" IS 'Snapshot técnico de la receta Chandías: [{nombre, unit, coef, cantidad}]. SIN precios. Los precios se resuelven en runtime.';



COMMENT ON COLUMN "public"."computation_items"."manual_materials" IS 'Materiales adicionales manuales: [{id, nombre, unit, cantidad, code?}]. SIN precios.';



COMMENT ON COLUMN "public"."computation_items"."steel_diameter_mm" IS 'Diámetro de barra (mm) para familias estructurales H.A. NULL en todos los demás rubros.';



CREATE TABLE IF NOT EXISTS "public"."cost_index_values" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "index_id" "uuid" NOT NULL,
    "period_year" smallint NOT NULL,
    "period_month" smallint NOT NULL,
    "value" numeric(18,6) NOT NULL,
    "variation_pct" numeric(8,4),
    "published_at" "date",
    "source_reference" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cost_index_values_period_month_check" CHECK ((("period_month" >= 1) AND ("period_month" <= 12))),
    CONSTRAINT "cost_index_values_period_year_check" CHECK ((("period_year" >= 2000) AND ("period_year" <= 2100))),
    CONSTRAINT "cost_index_values_value_check" CHECK (("value" > (0)::numeric))
);


ALTER TABLE "public"."cost_index_values" OWNER TO "postgres";


COMMENT ON TABLE "public"."cost_index_values" IS 'Valores mensuales históricos por índice. No modificar una vez publicados.';



CREATE TABLE IF NOT EXISTS "public"."cost_indices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text",
    "provider" "text",
    "frequency" "public"."index_frequency" DEFAULT 'MONTHLY'::"public"."index_frequency" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cost_indices" OWNER TO "postgres";


COMMENT ON TABLE "public"."cost_indices" IS 'Índices de costo (CAC, IPC, ICC…). tenant_id NULL = oficial global.';



CREATE TABLE IF NOT EXISTS "public"."crews" (
    "id" "text" NOT NULL,
    "organization_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "composition" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."crews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "invited_email" "text",
    "role" "text" DEFAULT 'editor'::"text" NOT NULL,
    "token" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
    "accepted_at" timestamp with time zone,
    "accepted_by" "uuid",
    CONSTRAINT "invitations_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'editor'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."labor_categories" (
    "id" "text" NOT NULL,
    "organization_id" "text" NOT NULL,
    "role" "text" NOT NULL,
    "basic_hourly_rate" numeric DEFAULT 0 NOT NULL,
    "social_charges_percent" numeric DEFAULT 0 NOT NULL,
    "insurance_percent" numeric DEFAULT 0 NOT NULL,
    "description" "text",
    "family" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "code" "text"
);


ALTER TABLE "public"."labor_categories" OWNER TO "postgres";


COMMENT ON COLUMN "public"."labor_categories"."code" IS 'Código de categoría de mano de obra (ej: I1004). Único por organización cuando no es NULL.';



CREATE TABLE IF NOT EXISTS "public"."master_materials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "text",
    "code" "text",
    "name" "text" NOT NULL,
    "description" "text",
    "unit" "text" NOT NULL,
    "unit_price" numeric(12,4) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'ARS'::"text" NOT NULL,
    "category" "text",
    "supplier" "text",
    "commercial_format" "text",
    "waste_percent" numeric(5,2) DEFAULT 0,
    "is_active" boolean DEFAULT true NOT NULL,
    "last_price_update" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "commercial_unit" "text",
    "conversion_factor" numeric,
    "global_source_id" "uuid",
    "imported_at" timestamp with time zone,
    "last_synced_at" timestamp with time zone,
    "local_override" boolean DEFAULT false NOT NULL,
    "global_source_updated_at_at_import" timestamp with time zone,
    "global_resource_id" "uuid",
    "technical_yield" numeric,
    "technical_yield_unit" "text",
    "technical_notes" "text",
    CONSTRAINT "master_materials_conversion_factor_check" CHECK (("conversion_factor" > (0)::numeric)),
    CONSTRAINT "mm_commercial_unit_requires_factor" CHECK ((("commercial_unit" IS NULL) OR ("conversion_factor" IS NOT NULL)))
);


ALTER TABLE "public"."master_materials" OWNER TO "postgres";


COMMENT ON COLUMN "public"."master_materials"."commercial_unit" IS 'Etiqueta de la unidad de compra. Ej: "bolsa 50 kg", "barra 12 m".';



COMMENT ON COLUMN "public"."master_materials"."conversion_factor" IS 'Cuántas unidades técnicas hay en 1 unidad comercial. Ej: bolsa 50 kg → conversion_factor = 50. Fórmula: qty_compra = CEIL(qty_tecnica / conversion_factor).';



COMMENT ON COLUMN "public"."master_materials"."global_source_id" IS 'FK al material global (IS NULL) del que fue importado. NULL si es local puro.';



COMMENT ON COLUMN "public"."master_materials"."imported_at" IS 'Timestamp de la primera importación desde el catálogo global.';



COMMENT ON COLUMN "public"."master_materials"."last_synced_at" IS 'Timestamp de la última sincronización con el catálogo global (re-import o sync).';



COMMENT ON COLUMN "public"."master_materials"."local_override" IS 'true si el usuario editó el material importado → diverge del original global.';



COMMENT ON COLUMN "public"."master_materials"."global_source_updated_at_at_import" IS 'updated_at del material global en el momento de la importación (sirve para detectar si el global fue actualizado después).';



COMMENT ON COLUMN "public"."master_materials"."global_resource_id" IS 'FK al recurso global (resources IS NULL) del que fue importado. NULL si es local puro o importado vía master_materials global (ver global_source_id).';



COMMENT ON COLUMN "public"."master_materials"."technical_yield" IS 'Rendimiento técnico del material. Cantidad de unidad producida por unidad del material. Ejemplo: pintura con technical_yield=12, technical_yield_unit="m²/l" → 1 litro cubre 12 m².';



COMMENT ON COLUMN "public"."master_materials"."technical_yield_unit" IS 'Unidad del rendimiento técnico. Ejemplos: "m²/l", "kg/m²", "ml/un", "m²/rollo", "un/m²".';



COMMENT ON COLUMN "public"."master_materials"."technical_notes" IS 'Observación técnica libre. Notas de aplicación, condiciones de uso, referencias normativas, etc.';



CREATE TABLE IF NOT EXISTS "public"."master_task_equipment" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "master_task_id" "uuid" NOT NULL,
    "tool_id" "text" NOT NULL,
    "tool_name" "text" NOT NULL,
    "hours_per_unit" numeric(14,4) DEFAULT 0 NOT NULL,
    "resource_id" "uuid",
    "snapshot_cost_per_hour" numeric(18,4)
);


ALTER TABLE "public"."master_task_equipment" OWNER TO "postgres";


COMMENT ON COLUMN "public"."master_task_equipment"."resource_id" IS 'FK al recurso de tipo EQUIPMENT. Si está presente, el motor usa get_resource_cost() para obtener el costo/hora actualizado.';



COMMENT ON COLUMN "public"."master_task_equipment"."snapshot_cost_per_hour" IS 'Costo por hora capturado al momento de importar el APU desde el catálogo. Fallback cuando resource_id no está disponible.';



CREATE TABLE IF NOT EXISTS "public"."master_task_labor" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "master_task_id" "uuid" NOT NULL,
    "labor_category_id" "text" NOT NULL,
    "labor_category_name" "text" NOT NULL,
    "quantity" numeric(14,4) DEFAULT 1 NOT NULL,
    "resource_id" "uuid",
    "snapshot_hourly_rate" numeric(18,4)
);


ALTER TABLE "public"."master_task_labor" OWNER TO "postgres";


COMMENT ON COLUMN "public"."master_task_labor"."resource_id" IS 'FK al recurso de tipo LABOR. Si está presente, el motor usa get_resource_cost() para obtener la tarifa horaria actualizada según índices.';



COMMENT ON COLUMN "public"."master_task_labor"."snapshot_hourly_rate" IS 'Tarifa horaria capturada al momento de importar el APU desde el catálogo. Fallback cuando resource_id no está disponible.';



CREATE TABLE IF NOT EXISTS "public"."master_task_materials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "master_task_id" "uuid" NOT NULL,
    "master_material_id" "uuid",
    "material_name" "text" NOT NULL,
    "unit" "text" NOT NULL,
    "quantity" numeric(14,4) DEFAULT 0 NOT NULL,
    "waste_percent" numeric(8,4) DEFAULT 0 NOT NULL,
    "last_known_unit_price" numeric(14,4) DEFAULT 0 NOT NULL,
    "resource_id" "uuid",
    "sub_master_task_id" "uuid",
    "conversion_factor" numeric(10,6),
    "commercial_unit" "text",
    CONSTRAINT "mtm_commercial_unit_requires_factor" CHECK ((("commercial_unit" IS NULL) OR ("conversion_factor" IS NOT NULL)))
);


ALTER TABLE "public"."master_task_materials" OWNER TO "postgres";


COMMENT ON COLUMN "public"."master_task_materials"."resource_id" IS 'FK opcional al recurso en el catálogo. Si está presente, el motor usa get_resource_cost() en lugar de last_known_unit_price como fuente de costo.';



COMMENT ON COLUMN "public"."master_task_materials"."sub_master_task_id" IS 'FK opcional a otro MasterTask (APU anidado). Si está presente, el motor calcula el costo total del sub-APU recursivamente en lugar de leer un precio unitario.';



COMMENT ON COLUMN "public"."master_task_materials"."conversion_factor" IS 'Factor de conversión entre la unidad de rendimiento (ej: "50kg") y la unidad base del recurso (ej: "KG"). Si es NULL, el motor lo infiere por parsing de la unidad. Ejemplo: bolsa 50kg de cemento → conversion_factor=50, unit="KG".';



COMMENT ON COLUMN "public"."master_task_materials"."commercial_unit" IS 'Etiqueta de la unidad comercial de compra. Ejemplo: "bolsa 50 kg", "barra 12 m", "caja x 10 unid". NULL = sin presentación comercial especial; se usa la unidad técnica (unit). Fórmula de conversión: qty_compra = CEIL(total_qty / conversion_factor). Correlación: commercial_unit IS NOT NULL implica conversion_factor IS NOT NULL.';



CREATE TABLE IF NOT EXISTS "public"."master_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "code" "text",
    "name" "text" NOT NULL,
    "description" "text",
    "unit" "text" NOT NULL,
    "category" "text",
    "daily_yield" numeric(14,4) DEFAULT 1 NOT NULL,
    "fixed_cost" numeric(14,4) DEFAULT 0 NOT NULL,
    "fixed_cost_description" "text",
    "specifications" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tags" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "source_metadata" "jsonb",
    "technical_sheet" "jsonb"
);


ALTER TABLE "public"."master_tasks" OWNER TO "postgres";


COMMENT ON COLUMN "public"."master_tasks"."source_metadata" IS 'Trazabilidad al cómputo origen. Campo: { source, catalogTaskId, catalogTaskName, catalogTaskUnit, totalQuantity, itemCount, inputItems[], steelDiameterMm?, snapshotDate }. Presente solo en APUs generados desde la calculadora Chandías.';



COMMENT ON COLUMN "public"."master_tasks"."technical_sheet" IS 'Ficha técnica: { version, ficha, gremio, titulo, esquemaSvg, pie, descripcion, datosTecnicos[{label,value}], notas[], fuente, relacionadas[{codigo,nombre}] }. Migración 068.';



CREATE TABLE IF NOT EXISTS "public"."materials" (
    "id" "text" NOT NULL,
    "organization_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "unit" "text" DEFAULT ''::"text" NOT NULL,
    "cost" numeric DEFAULT 0 NOT NULL,
    "category" "text",
    "min_stock" numeric,
    "provider" "text",
    "family" "text",
    "description" "text",
    "commercial_format" "text",
    "waste_percent" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "code" "text",
    "commercial_unit" "text",
    "conversion_factor" numeric,
    CONSTRAINT "mat_commercial_unit_requires_factor" CHECK ((("commercial_unit" IS NULL) OR ("conversion_factor" IS NOT NULL))),
    CONSTRAINT "materials_conversion_factor_check" CHECK (("conversion_factor" > (0)::numeric))
);


ALTER TABLE "public"."materials" OWNER TO "postgres";


COMMENT ON COLUMN "public"."materials"."code" IS 'Código de catálogo (ej: I1001). Único por organización cuando no es NULL.';



COMMENT ON COLUMN "public"."materials"."commercial_unit" IS 'Etiqueta de la unidad de compra. Ej: "bolsa 50 kg", "barra 12 m".';



COMMENT ON COLUMN "public"."materials"."conversion_factor" IS 'Cuántas unidades técnicas hay en 1 unidad comercial. Ej: bolsa 50 kg → conversion_factor = 50. Fórmula: qty_compra = CEIL(qty_tecnica / conversion_factor).';



CREATE TABLE IF NOT EXISTS "public"."organization_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "organization_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."organization_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "plan_id" "text" DEFAULT 'starter'::"text" NOT NULL,
    "status" "text" DEFAULT 'trialing'::"text" NOT NULL,
    "trial_ends_at" timestamp with time zone,
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "cancel_at_period_end" boolean DEFAULT false NOT NULL,
    "canceled_at" timestamp with time zone,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "stripe_price_id" "text",
    "billing_email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "organization_subscriptions_status_check" CHECK (("status" = ANY (ARRAY['trialing'::"text", 'active'::"text", 'past_due'::"text", 'canceled'::"text", 'unpaid'::"text", 'paused'::"text"])))
);


ALTER TABLE "public"."organization_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plan_entitlements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_id" "text" NOT NULL,
    "feature_key" "text" NOT NULL,
    "feature_type" "text" NOT NULL,
    "bool_value" boolean,
    "numeric_value" integer,
    CONSTRAINT "plan_entitlements_feature_type_check" CHECK (("feature_type" = ANY (ARRAY['boolean'::"text", 'numeric'::"text"])))
);


ALTER TABLE "public"."plan_entitlements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."price_index_sync_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ran_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ok" boolean NOT NULL,
    "trigger" "text" NOT NULL,
    "message" "text",
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "price_index_sync_runs_trigger_check" CHECK (("trigger" = ANY (ARRAY['cron'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."price_index_sync_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."price_indices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "period" "date" NOT NULL,
    "value" numeric(14,4) NOT NULL,
    "source" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    CONSTRAINT "price_indices_code_check" CHECK (("code" = ANY (ARRAY['cac_general'::"text", 'cac_materiales'::"text", 'cac_mano_obra'::"text", 'icc_general'::"text", 'icc_materiales'::"text", 'icc_mano_obra'::"text"]))),
    CONSTRAINT "price_indices_period_check" CHECK ((EXTRACT(day FROM "period") = (1)::numeric)),
    CONSTRAINT "price_indices_value_check" CHECK (("value" > (0)::numeric))
);


ALTER TABLE "public"."price_indices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "default_organization_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email" "text",
    "system_role" "text" DEFAULT 'user'::"text" NOT NULL,
    CONSTRAINT "profiles_system_role_check" CHECK (("system_role" = ANY (ARRAY['master_admin'::"text", 'tester'::"text", 'user'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_computations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "computed_by" "uuid",
    "computed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_computations_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'approved'::"text", 'frozen'::"text"])))
);


ALTER TABLE "public"."project_computations" OWNER TO "postgres";


COMMENT ON TABLE "public"."project_computations" IS 'Sesiones de cómputo paramétrico (Calculadora Chandías). Cada sesión agrupa computation_items del mismo contexto (etapa, zona). Ciclo de vida: draft → approved → frozen. Un proyecto puede tener múltiples sesiones concurrentes.';



COMMENT ON COLUMN "public"."project_computations"."status" IS 'draft = editable | approved = enviado al presupuesto | frozen = cantidades bloqueadas.';



COMMENT ON COLUMN "public"."project_computations"."computed_at" IS 'Momento en que el usuario aprobó o congeló el cómputo.';



CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "client" "text",
    "client_id" "text",
    "currency" "text" DEFAULT 'ARS'::"text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date",
    "status" "text" DEFAULT 'planning'::"text" NOT NULL,
    "working_days" "jsonb" DEFAULT '[1, 2, 3, 4, 5]'::"jsonb" NOT NULL,
    "non_working_dates" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "workday_hours" numeric(8,2) DEFAULT 9 NOT NULL,
    "pricing_config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "address" "text",
    "ggd_pct" numeric(8,6),
    "ggi_pct" numeric(8,6),
    "profit_pct" numeric(8,6),
    "tax_pct" numeric(8,6),
    "company_name" "text",
    "surface" numeric(14,4),
    "construction_system" "text",
    "structure_type" "text",
    "foundation_type" "text",
    "cost_base" "date",
    "workday_start_time" "text",
    "workday_end_time" "text",
    "lunch_break_duration" integer,
    "labor_force" "jsonb",
    "assigned_crews" "jsonb",
    "pricing" "jsonb",
    "dependencies" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "cover_image" "text"
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


COMMENT ON COLUMN "public"."projects"."working_days" IS 'Array JSON de días laborables: [1,2,3,4,5] = Lun-Vie.';



COMMENT ON COLUMN "public"."projects"."non_working_dates" IS 'Array JSON de feriados: [{date:"YYYY-MM-DD", description:"..."}].';



COMMENT ON COLUMN "public"."projects"."workday_hours" IS 'Horas de jornada laboral (ej: 8, 9). NULL = usa default del frontend.';



COMMENT ON COLUMN "public"."projects"."cost_base" IS 'Fecha base para el recálculo del presupuesto. Convención: último día del mes. Ejemplo: 2026-03-31 = "Base Marzo 2026". El motor busca snapshots con effective_date <= cost_base (i.e., primero del mes correspondiente). NULL = no hay base de costos configurada → el presupuesto usa last_known_unit_price.';



COMMENT ON COLUMN "public"."projects"."workday_start_time" IS 'Hora inicio jornada "HH:MM" (ej: "08:00").';



COMMENT ON COLUMN "public"."projects"."workday_end_time" IS 'Hora fin jornada "HH:MM" (ej: "17:00").';



COMMENT ON COLUMN "public"."projects"."lunch_break_duration" IS 'Duración del almuerzo en minutos (ej: 60).';



COMMENT ON COLUMN "public"."projects"."labor_force" IS 'Array JSON de PersonalLaboral asignado al proyecto.';



COMMENT ON COLUMN "public"."projects"."assigned_crews" IS 'Array JSON de cuadrillas asignadas al proyecto.';



COMMENT ON COLUMN "public"."projects"."pricing" IS 'PricingConfig legacy (gastos generales, utilidad, IVA). NULL = frontend usa DEFAULT_PRICING_CONFIG. Preferir businessConfig (ggd_pct, etc.) para nuevos desarrollos.';



COMMENT ON COLUMN "public"."projects"."dependencies" IS 'Array de ProjectDependency: { id, fromTaskId, toTaskId, type, lag, note? }';



CREATE TABLE IF NOT EXISTS "public"."resource_cost_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "effective_date" "date" NOT NULL,
    "cost" numeric(18,4) NOT NULL,
    "currency" character(3) DEFAULT 'ARS'::"bpchar" NOT NULL,
    "source_type" "public"."snapshot_source_type" NOT NULL,
    "source_reference" "text",
    "pricing_rule_id" "uuid",
    "index_id" "uuid",
    "index_base_value" numeric(18,6),
    "index_current_value" numeric(18,6),
    "adjustment_factor" numeric(12,6),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "resource_cost_snapshots_cost_check" CHECK (("cost" >= (0)::numeric))
);


ALTER TABLE "public"."resource_cost_snapshots" OWNER TO "postgres";


COMMENT ON TABLE "public"."resource_cost_snapshots" IS 'Histórico inmutable de costos por recurso. Nunca modificar: crear nuevo snapshot para correcciones.';



CREATE TABLE IF NOT EXISTS "public"."resource_pricing_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "rule_name" "text" NOT NULL,
    "rule_type" "public"."pricing_rule_type" NOT NULL,
    "index_id" "uuid",
    "base_date" "date",
    "base_cost" numeric(18,4),
    "formula_config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "priority" smallint DEFAULT 0 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "resource_pricing_rules_type_check" CHECK (((("rule_type" = 'FIXED_MANUAL'::"public"."pricing_rule_type") AND ("base_cost" IS NOT NULL)) OR ("rule_type" = 'DIRECT_IMPORT'::"public"."pricing_rule_type") OR (("rule_type" = 'INDEX_MULTIPLIER'::"public"."pricing_rule_type") AND ("index_id" IS NOT NULL) AND ("base_date" IS NOT NULL) AND ("base_cost" IS NOT NULL)) OR (("rule_type" = 'COMPOSITE_INDEX'::"public"."pricing_rule_type") AND ("base_cost" IS NOT NULL) AND "public"."validate_composite_components"("formula_config")) OR (("rule_type" = 'LABOR_FORMULA'::"public"."pricing_rule_type") AND ("base_cost" IS NOT NULL) AND "public"."is_valid_positive_number"(("formula_config" -> 'base_hourly_rate'::"text")) AND (("formula_config" ->> 'index_id'::"text") IS NOT NULL) AND ("jsonb_typeof"(("formula_config" -> 'base_period'::"text")) = 'object'::"text") AND ((("formula_config" -> 'base_period'::"text") ->> 'year'::"text") IS NOT NULL) AND ((("formula_config" -> 'base_period'::"text") ->> 'month'::"text") IS NOT NULL))))
);


ALTER TABLE "public"."resource_pricing_rules" OWNER TO "postgres";


COMMENT ON TABLE "public"."resource_pricing_rules" IS 'Regla de pricing por recurso. Define estrategia de cálculo al generar snapshots.';



CREATE TABLE IF NOT EXISTS "public"."resources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "catalog_id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "unit" "text" NOT NULL,
    "base_cost" numeric(14,4) DEFAULT 0 NOT NULL,
    "type" "text" NOT NULL,
    "category_name" "text",
    "social_charges_pct" numeric(8,4),
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "current_snapshot_id" "uuid",
    "pricing_notes" "text",
    "commercial_unit" "text",
    "conversion_factor" numeric(14,6),
    CONSTRAINT "resources_conversion_factor_positive" CHECK ((("conversion_factor" IS NULL) OR ("conversion_factor" > (0)::numeric))),
    CONSTRAINT "resources_type_check" CHECK (("type" = ANY (ARRAY['MATERIAL'::"text", 'LABOR'::"text", 'EQUIPMENT'::"text", 'SUBCONTRACT'::"text"])))
);


ALTER TABLE "public"."resources" OWNER TO "postgres";


COMMENT ON TABLE "public"."resources" IS 'Recursos unificados (material/labor/equipo/subcontrato) de un catálogo.';



COMMENT ON COLUMN "public"."resources"."base_cost" IS 'Fallback si no existe snapshot vigente para la fecha solicitada.';



COMMENT ON COLUMN "public"."resources"."current_snapshot_id" IS 'Caché del snapshot vigente HOY (effective_date <= CURRENT_DATE). Mantenido automáticamente por trigger sync_current_snapshot_cache. NO usar para consultas históricas: usar get_resource_cost(id, tenant, date) o get_resource_snapshot().';



COMMENT ON COLUMN "public"."resources"."commercial_unit" IS 'Unidad comercial de compra o referencia. Si es NULL, usar unit.';



COMMENT ON COLUMN "public"."resources"."conversion_factor" IS 'Factor de conversión entre unidad comercial y unidad técnica. Default 1.';



CREATE TABLE IF NOT EXISTS "public"."stripe_webhook_events" (
    "id" "text" NOT NULL,
    "type" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "error" "text"
);


ALTER TABLE "public"."stripe_webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscription_plans" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "stripe_price_id_monthly" "text",
    "stripe_price_id_yearly" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."subscription_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_crew_yields" (
    "task_id" "text" NOT NULL,
    "crew_id" "text" NOT NULL,
    "quantity" numeric DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."task_crew_yields" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_labor_yields" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "labor_category_id" "text" NOT NULL,
    "quantity" numeric(14,4) DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."task_labor_yields" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_tool_yields" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "tool_id" "text" NOT NULL,
    "hours_per_unit" numeric(14,4) DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."task_tool_yields" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_yields" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "material_id" "text" NOT NULL,
    "quantity" numeric(14,4) DEFAULT 0 NOT NULL,
    "waste_percent" numeric(8,4) DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."task_yields" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "master_task_id" "uuid",
    "code" "text",
    "name" "text" NOT NULL,
    "unit" "text" NOT NULL,
    "category" "text",
    "labor_cost" numeric(14,4) DEFAULT 0 NOT NULL,
    "daily_yield" numeric(14,4) DEFAULT 1 NOT NULL,
    "fixed_cost" numeric(14,4) DEFAULT 0 NOT NULL,
    "fixed_cost_description" "text",
    "specifications" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tools" (
    "id" "text" NOT NULL,
    "organization_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" DEFAULT ''::"text" NOT NULL,
    "cost_per_hour" numeric DEFAULT 0 NOT NULL,
    "family" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "code" "text"
);


ALTER TABLE "public"."tools" OWNER TO "postgres";


COMMENT ON COLUMN "public"."tools"."code" IS 'Código de catálogo (ej: I1747). Único por organización cuando no es NULL.';



CREATE TABLE IF NOT EXISTS "public"."v_org_uuid" (
    "organization_id" "uuid"
);


ALTER TABLE "public"."v_org_uuid" OWNER TO "postgres";


ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."budget_items"
    ADD CONSTRAINT "budget_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."budget_template_items"
    ADD CONSTRAINT "budget_template_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."budget_templates"
    ADD CONSTRAINT "budget_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."budget_versions"
    ADD CONSTRAINT "budget_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."budget_versions"
    ADD CONSTRAINT "budget_versions_project_id_version_number_key" UNIQUE ("project_id", "version_number");



ALTER TABLE ONLY "public"."catalog_task_yields"
    ADD CONSTRAINT "catalog_task_yields_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."catalog_task_yields"
    ADD CONSTRAINT "catalog_task_yields_unique" UNIQUE ("master_task_id", "resource_id");



ALTER TABLE ONLY "public"."catalogs"
    ADD CONSTRAINT "catalogs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."computation_items"
    ADD CONSTRAINT "computation_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cost_index_values"
    ADD CONSTRAINT "cost_index_values_period_unique" UNIQUE ("index_id", "period_year", "period_month");



ALTER TABLE ONLY "public"."cost_index_values"
    ADD CONSTRAINT "cost_index_values_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cost_indices"
    ADD CONSTRAINT "cost_indices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crews"
    ADD CONSTRAINT "crews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."labor_categories"
    ADD CONSTRAINT "labor_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."master_materials"
    ADD CONSTRAINT "master_materials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."master_task_equipment"
    ADD CONSTRAINT "master_task_equipment_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."master_task_labor"
    ADD CONSTRAINT "master_task_labor_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."master_task_materials"
    ADD CONSTRAINT "master_task_materials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."master_tasks"
    ADD CONSTRAINT "master_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."materials"
    ADD CONSTRAINT "materials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_organization_id_user_id_key" UNIQUE ("organization_id", "user_id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_subscriptions"
    ADD CONSTRAINT "organization_subscriptions_organization_id_key" UNIQUE ("organization_id");



ALTER TABLE ONLY "public"."organization_subscriptions"
    ADD CONSTRAINT "organization_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_subscriptions"
    ADD CONSTRAINT "organization_subscriptions_stripe_customer_id_key" UNIQUE ("stripe_customer_id");



ALTER TABLE ONLY "public"."organization_subscriptions"
    ADD CONSTRAINT "organization_subscriptions_stripe_subscription_id_key" UNIQUE ("stripe_subscription_id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."plan_entitlements"
    ADD CONSTRAINT "plan_entitlements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plan_entitlements"
    ADD CONSTRAINT "plan_entitlements_plan_id_feature_key_key" UNIQUE ("plan_id", "feature_key");



ALTER TABLE ONLY "public"."price_index_sync_runs"
    ADD CONSTRAINT "price_index_sync_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."price_indices"
    ADD CONSTRAINT "price_indices_code_period_key" UNIQUE ("code", "period");



ALTER TABLE ONLY "public"."price_indices"
    ADD CONSTRAINT "price_indices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_computations"
    ADD CONSTRAINT "project_computations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resource_cost_snapshots"
    ADD CONSTRAINT "resource_cost_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resource_cost_snapshots"
    ADD CONSTRAINT "resource_cost_snapshots_unique" UNIQUE ("tenant_id", "resource_id", "effective_date", "source_type");



ALTER TABLE ONLY "public"."resource_pricing_rules"
    ADD CONSTRAINT "resource_pricing_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resources"
    ADD CONSTRAINT "resources_catalog_code_unique" UNIQUE ("catalog_id", "code");



ALTER TABLE ONLY "public"."resources"
    ADD CONSTRAINT "resources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stripe_webhook_events"
    ADD CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_plans"
    ADD CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_crew_yields"
    ADD CONSTRAINT "task_crew_yields_pkey" PRIMARY KEY ("task_id", "crew_id");



ALTER TABLE ONLY "public"."task_labor_yields"
    ADD CONSTRAINT "task_labor_yields_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_labor_yields"
    ADD CONSTRAINT "task_labor_yields_task_labor_unique" UNIQUE ("task_id", "labor_category_id");



COMMENT ON CONSTRAINT "task_labor_yields_task_labor_unique" ON "public"."task_labor_yields" IS 'Garantiza unicidad de categoría de mano de obra por tarea. Requerido por tasksService.upsertLaborYield (ON CONFLICT DO UPDATE).';



ALTER TABLE ONLY "public"."task_tool_yields"
    ADD CONSTRAINT "task_tool_yields_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_tool_yields"
    ADD CONSTRAINT "task_tool_yields_task_tool_unique" UNIQUE ("task_id", "tool_id");



COMMENT ON CONSTRAINT "task_tool_yields_task_tool_unique" ON "public"."task_tool_yields" IS 'Garantiza unicidad de herramienta/equipo por tarea. Requerido por tasksService.upsertToolYield (ON CONFLICT DO UPDATE).';



ALTER TABLE ONLY "public"."task_yields"
    ADD CONSTRAINT "task_yields_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_yields"
    ADD CONSTRAINT "task_yields_task_material_unique" UNIQUE ("task_id", "material_id");



COMMENT ON CONSTRAINT "task_yields_task_material_unique" ON "public"."task_yields" IS 'Garantiza que un mismo material no se repita en los rendimientos de una tarea. Requerido por tasksService.upsertYield (ON CONFLICT DO UPDATE).';



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tools"
    ADD CONSTRAINT "tools_pkey" PRIMARY KEY ("id");



CREATE INDEX "budget_versions_project_idx" ON "public"."budget_versions" USING "btree" ("project_id");



CREATE UNIQUE INDEX "catalogs_global_name_uidx" ON "public"."catalogs" USING "btree" ("name") WHERE ("organization_id" IS NULL);



CREATE UNIQUE INDEX "catalogs_org_name_uidx" ON "public"."catalogs" USING "btree" ("name", "organization_id") WHERE ("organization_id" IS NOT NULL);



CREATE INDEX "cost_index_values_index_period_idx" ON "public"."cost_index_values" USING "btree" ("index_id", "period_year" DESC, "period_month" DESC);



CREATE UNIQUE INDEX "cost_indices_global_code_uidx" ON "public"."cost_indices" USING "btree" ("code") WHERE ("tenant_id" IS NULL);



CREATE INDEX "cost_indices_tenant_active_idx" ON "public"."cost_indices" USING "btree" ("tenant_id", "is_active");



CREATE UNIQUE INDEX "cost_indices_tenant_code_uidx" ON "public"."cost_indices" USING "btree" ("tenant_id", "code") WHERE ("tenant_id" IS NOT NULL);



CREATE INDEX "idx_bi_computation_item_id" ON "public"."budget_items" USING "btree" ("computation_item_id") WHERE ("computation_item_id" IS NOT NULL);



CREATE INDEX "idx_budget_items_org" ON "public"."budget_items" USING "btree" ("organization_id");



CREATE INDEX "idx_budget_items_project" ON "public"."budget_items" USING "btree" ("project_id");



CREATE INDEX "idx_budget_items_task" ON "public"."budget_items" USING "btree" ("task_id");



CREATE INDEX "idx_budget_template_items_master_task" ON "public"."budget_template_items" USING "btree" ("master_task_id");



CREATE INDEX "idx_budget_template_items_template" ON "public"."budget_template_items" USING "btree" ("budget_template_id");



CREATE INDEX "idx_budget_templates_name" ON "public"."budget_templates" USING "btree" ("name");



CREATE INDEX "idx_budget_templates_org" ON "public"."budget_templates" USING "btree" ("organization_id");



CREATE INDEX "idx_catalog_task_yields_task_id" ON "public"."catalog_task_yields" USING "btree" ("master_task_id");



CREATE INDEX "idx_citems_computation_id" ON "public"."computation_items" USING "btree" ("computation_id", "sort_order", "created_at");



CREATE INDEX "idx_citems_master_task_id" ON "public"."computation_items" USING "btree" ("master_task_id") WHERE ("master_task_id" IS NOT NULL);



CREATE INDEX "idx_citems_organization_id" ON "public"."computation_items" USING "btree" ("organization_id");



CREATE INDEX "idx_master_materials_global_resource" ON "public"."master_materials" USING "btree" ("global_resource_id") WHERE ("global_resource_id" IS NOT NULL);



CREATE INDEX "idx_master_materials_global_source" ON "public"."master_materials" USING "btree" ("global_source_id") WHERE ("global_source_id" IS NOT NULL);



CREATE INDEX "idx_master_task_equipment_task" ON "public"."master_task_equipment" USING "btree" ("master_task_id");



CREATE INDEX "idx_master_task_labor_task" ON "public"."master_task_labor" USING "btree" ("master_task_id");



CREATE INDEX "idx_master_task_materials_material" ON "public"."master_task_materials" USING "btree" ("master_material_id");



CREATE INDEX "idx_master_task_materials_task" ON "public"."master_task_materials" USING "btree" ("master_task_id");



CREATE INDEX "idx_master_tasks_category" ON "public"."master_tasks" USING "btree" ("category");



CREATE INDEX "idx_master_tasks_name" ON "public"."master_tasks" USING "btree" ("name");



CREATE INDEX "idx_master_tasks_org" ON "public"."master_tasks" USING "btree" ("organization_id");



CREATE INDEX "idx_master_tasks_org_code_name" ON "public"."master_tasks" USING "btree" ("organization_id", "code", "name") WHERE ("organization_id" IS NOT NULL);



CREATE INDEX "idx_org_members_user_org" ON "public"."organization_members" USING "btree" ("user_id", "organization_id");



CREATE INDEX "idx_org_subs_org_id" ON "public"."organization_subscriptions" USING "btree" ("organization_id");



CREATE INDEX "idx_org_subs_stripe_cust" ON "public"."organization_subscriptions" USING "btree" ("stripe_customer_id") WHERE ("stripe_customer_id" IS NOT NULL);



CREATE INDEX "idx_org_subs_stripe_sub" ON "public"."organization_subscriptions" USING "btree" ("stripe_subscription_id") WHERE ("stripe_subscription_id" IS NOT NULL);



CREATE INDEX "idx_organization_members_org" ON "public"."organization_members" USING "btree" ("organization_id");



CREATE INDEX "idx_organization_members_user" ON "public"."organization_members" USING "btree" ("user_id");



CREATE INDEX "idx_pcomp_organization_id" ON "public"."project_computations" USING "btree" ("organization_id");



CREATE INDEX "idx_pcomp_project_computed" ON "public"."project_computations" USING "btree" ("project_id", "created_at" DESC);



CREATE INDEX "idx_pcomp_status" ON "public"."project_computations" USING "btree" ("project_id", "status");



CREATE INDEX "idx_plan_entitlements_plan" ON "public"."plan_entitlements" USING "btree" ("plan_id");



CREATE INDEX "idx_projects_name" ON "public"."projects" USING "btree" ("name");



CREATE INDEX "idx_projects_org" ON "public"."projects" USING "btree" ("organization_id");



CREATE INDEX "idx_resources_org_code" ON "public"."resources" USING "btree" ("organization_id", "code") WHERE ("organization_id" IS NOT NULL);



CREATE INDEX "idx_task_labor_yields_org" ON "public"."task_labor_yields" USING "btree" ("organization_id");



CREATE INDEX "idx_task_labor_yields_task" ON "public"."task_labor_yields" USING "btree" ("task_id");



CREATE INDEX "idx_task_tool_yields_org" ON "public"."task_tool_yields" USING "btree" ("organization_id");



CREATE INDEX "idx_task_tool_yields_task" ON "public"."task_tool_yields" USING "btree" ("task_id");



CREATE INDEX "idx_task_yields_org" ON "public"."task_yields" USING "btree" ("organization_id");



CREATE INDEX "idx_task_yields_task" ON "public"."task_yields" USING "btree" ("task_id");



CREATE INDEX "idx_tasks_category" ON "public"."tasks" USING "btree" ("category");



CREATE INDEX "idx_tasks_name" ON "public"."tasks" USING "btree" ("name");



CREATE INDEX "idx_tasks_org" ON "public"."tasks" USING "btree" ("organization_id");



CREATE INDEX "idx_webhook_events_type" ON "public"."stripe_webhook_events" USING "btree" ("type");



CREATE UNIQUE INDEX "labor_categories_org_code_uidx" ON "public"."labor_categories" USING "btree" ("organization_id", "code") WHERE ("code" IS NOT NULL);



CREATE UNIQUE INDEX "master_materials_org_name_uidx" ON "public"."master_materials" USING "btree" ("organization_id", "name") WHERE ("is_active" = true);



CREATE INDEX "master_materials_organization_id_is_active_idx" ON "public"."master_materials" USING "btree" ("organization_id", "is_active");



CREATE INDEX "master_task_equipment_resource_id_idx" ON "public"."master_task_equipment" USING "btree" ("resource_id") WHERE ("resource_id" IS NOT NULL);



CREATE INDEX "master_task_labor_resource_id_idx" ON "public"."master_task_labor" USING "btree" ("resource_id") WHERE ("resource_id" IS NOT NULL);



CREATE INDEX "master_task_materials_resource_id_idx" ON "public"."master_task_materials" USING "btree" ("resource_id") WHERE ("resource_id" IS NOT NULL);



CREATE INDEX "master_task_materials_sub_task_idx" ON "public"."master_task_materials" USING "btree" ("sub_master_task_id") WHERE ("sub_master_task_id" IS NOT NULL);



CREATE UNIQUE INDEX "master_tasks_global_code_active_uidx" ON "public"."master_tasks" USING "btree" ("lower"("code")) WHERE (("organization_id" IS NULL) AND ("code" IS NOT NULL) AND ("is_active" = true));



COMMENT ON INDEX "public"."master_tasks_global_code_active_uidx" IS 'Garantiza que no existan dos APUs activos del catálogo global con el mismo código (case-insensitive). Parcial: solo aplica a organization_id IS NULL AND code IS NOT NULL AND is_active = true.';



CREATE UNIQUE INDEX "master_tasks_global_name_active_uidx" ON "public"."master_tasks" USING "btree" ("lower"("name")) WHERE (("organization_id" IS NULL) AND ("is_active" = true));



COMMENT ON INDEX "public"."master_tasks_global_name_active_uidx" IS 'Garantiza que no existan dos APUs activos del catálogo global con el mismo nombre (case-insensitive). Parcial: solo aplica a organization_id IS NULL AND is_active = true.';



CREATE UNIQUE INDEX "master_tasks_org_code_active_uidx" ON "public"."master_tasks" USING "btree" ("organization_id", "code") WHERE (("code" IS NOT NULL) AND ("is_active" = true));



COMMENT ON INDEX "public"."master_tasks_org_code_active_uidx" IS 'Garantiza que dos APUs activos de la misma organización no compartan código. Parcial (WHERE code IS NOT NULL AND is_active = true): · Permite codes NULL (APUs sin código asignado). · Permite reusar un código después de soft-delete (is_active = false).';



CREATE UNIQUE INDEX "materials_org_code_uidx" ON "public"."materials" USING "btree" ("organization_id", "code") WHERE ("code" IS NOT NULL);



CREATE INDEX "price_index_sync_runs_ran_at_idx" ON "public"."price_index_sync_runs" USING "btree" ("ran_at" DESC);



CREATE INDEX "projects_cost_base_idx" ON "public"."projects" USING "btree" ("organization_id", "cost_base") WHERE ("cost_base" IS NOT NULL);



CREATE INDEX "resource_cost_snapshots_lookup_idx" ON "public"."resource_cost_snapshots" USING "btree" ("tenant_id", "resource_id", "effective_date" DESC, "created_at" DESC);



CREATE INDEX "resource_cost_snapshots_period_idx" ON "public"."resource_cost_snapshots" USING "btree" ("tenant_id", "effective_date");



CREATE INDEX "resource_cost_snapshots_rule_idx" ON "public"."resource_cost_snapshots" USING "btree" ("pricing_rule_id") WHERE ("pricing_rule_id" IS NOT NULL);



CREATE INDEX "resource_pricing_rules_index_fk_idx" ON "public"."resource_pricing_rules" USING "btree" ("index_id") WHERE ("index_id" IS NOT NULL);



CREATE INDEX "resource_pricing_rules_lookup_idx" ON "public"."resource_pricing_rules" USING "btree" ("tenant_id", "resource_id", "is_active", "priority" DESC);



CREATE UNIQUE INDEX "tools_org_code_uidx" ON "public"."tools" USING "btree" ("organization_id", "code") WHERE ("code" IS NOT NULL);



CREATE UNIQUE INDEX "uq_budget_templates_org_name" ON "public"."budget_templates" USING "btree" ("organization_id", "name");



CREATE UNIQUE INDEX "uq_master_materials_org_global_resource" ON "public"."master_materials" USING "btree" ("organization_id", "global_resource_id") WHERE (("organization_id" IS NOT NULL) AND ("global_resource_id" IS NOT NULL));



CREATE UNIQUE INDEX "uq_master_materials_org_global_source" ON "public"."master_materials" USING "btree" ("organization_id", "global_source_id") WHERE (("organization_id" IS NOT NULL) AND ("global_source_id" IS NOT NULL));



CREATE UNIQUE INDEX "uq_master_tasks_org_code" ON "public"."master_tasks" USING "btree" ("organization_id", "code") WHERE ("code" IS NOT NULL);



CREATE OR REPLACE TRIGGER "audit_master_materials_catalog" AFTER INSERT OR DELETE OR UPDATE ON "public"."master_materials" FOR EACH ROW EXECUTE FUNCTION "public"."audit_master_catalog"();



CREATE OR REPLACE TRIGGER "audit_master_tasks_catalog" AFTER INSERT OR DELETE OR UPDATE ON "public"."master_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."audit_master_catalog"();



CREATE OR REPLACE TRIGGER "cost_index_values_calc_variation" BEFORE INSERT ON "public"."cost_index_values" FOR EACH ROW EXECUTE FUNCTION "public"."calc_index_variation"();



CREATE OR REPLACE TRIGGER "cost_indices_updated_at" BEFORE UPDATE ON "public"."cost_indices" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "master_materials_updated_at" BEFORE UPDATE ON "public"."master_materials" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "resource_cost_snapshots_sync_cache" AFTER INSERT OR DELETE ON "public"."resource_cost_snapshots" FOR EACH ROW EXECUTE FUNCTION "public"."sync_current_snapshot_cache"();



CREATE OR REPLACE TRIGGER "resource_pricing_rules_updated_at" BEFORE UPDATE ON "public"."resource_pricing_rules" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_computation_items_updated_at" BEFORE UPDATE ON "public"."computation_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_new_org_seed" AFTER INSERT ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_new_org_seed"();



CREATE OR REPLACE TRIGGER "trg_new_org_subscription" AFTER INSERT ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fn_create_org_subscription"();



CREATE OR REPLACE TRIGGER "trg_org_sub_updated_at" BEFORE UPDATE ON "public"."organization_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_updated_at_org_sub"();



CREATE OR REPLACE TRIGGER "trg_project_computations_updated_at" BEFORE UPDATE ON "public"."project_computations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_sync_profile_email" BEFORE INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."sync_profile_email"();



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."budget_items"
    ADD CONSTRAINT "budget_items_computation_item_id_fkey" FOREIGN KEY ("computation_item_id") REFERENCES "public"."computation_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."budget_items"
    ADD CONSTRAINT "budget_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budget_items"
    ADD CONSTRAINT "budget_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budget_items"
    ADD CONSTRAINT "budget_items_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."budget_template_items"
    ADD CONSTRAINT "budget_template_items_budget_template_id_fkey" FOREIGN KEY ("budget_template_id") REFERENCES "public"."budget_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budget_template_items"
    ADD CONSTRAINT "budget_template_items_master_task_id_fkey" FOREIGN KEY ("master_task_id") REFERENCES "public"."master_tasks"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."budget_templates"
    ADD CONSTRAINT "budget_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budget_versions"
    ADD CONSTRAINT "budget_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."catalog_task_yields"
    ADD CONSTRAINT "catalog_task_yields_master_task_id_fkey" FOREIGN KEY ("master_task_id") REFERENCES "public"."master_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."catalog_task_yields"
    ADD CONSTRAINT "catalog_task_yields_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."catalogs"
    ADD CONSTRAINT "catalogs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."computation_items"
    ADD CONSTRAINT "computation_items_computation_id_fkey" FOREIGN KEY ("computation_id") REFERENCES "public"."project_computations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."computation_items"
    ADD CONSTRAINT "computation_items_master_task_id_fkey" FOREIGN KEY ("master_task_id") REFERENCES "public"."master_tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."computation_items"
    ADD CONSTRAINT "computation_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cost_index_values"
    ADD CONSTRAINT "cost_index_values_index_id_fkey" FOREIGN KEY ("index_id") REFERENCES "public"."cost_indices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cost_indices"
    ADD CONSTRAINT "cost_indices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."master_task_materials"
    ADD CONSTRAINT "fk_master_task_materials_master_material" FOREIGN KEY ("master_material_id") REFERENCES "public"."master_materials"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "fk_tasks_master_task" FOREIGN KEY ("master_task_id") REFERENCES "public"."master_tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."master_materials"
    ADD CONSTRAINT "master_materials_global_resource_id_fkey" FOREIGN KEY ("global_resource_id") REFERENCES "public"."resources"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."master_materials"
    ADD CONSTRAINT "master_materials_global_source_id_fkey" FOREIGN KEY ("global_source_id") REFERENCES "public"."master_materials"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."master_task_equipment"
    ADD CONSTRAINT "master_task_equipment_master_task_id_fkey" FOREIGN KEY ("master_task_id") REFERENCES "public"."master_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."master_task_equipment"
    ADD CONSTRAINT "master_task_equipment_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."master_task_labor"
    ADD CONSTRAINT "master_task_labor_master_task_id_fkey" FOREIGN KEY ("master_task_id") REFERENCES "public"."master_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."master_task_labor"
    ADD CONSTRAINT "master_task_labor_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."master_task_materials"
    ADD CONSTRAINT "master_task_materials_master_task_id_fkey" FOREIGN KEY ("master_task_id") REFERENCES "public"."master_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."master_task_materials"
    ADD CONSTRAINT "master_task_materials_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."master_task_materials"
    ADD CONSTRAINT "master_task_materials_sub_master_task_id_fkey" FOREIGN KEY ("sub_master_task_id") REFERENCES "public"."master_tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."master_tasks"
    ADD CONSTRAINT "master_tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_subscriptions"
    ADD CONSTRAINT "organization_subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_subscriptions"
    ADD CONSTRAINT "organization_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id");



ALTER TABLE ONLY "public"."plan_entitlements"
    ADD CONSTRAINT "plan_entitlements_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_default_organization_id_fkey" FOREIGN KEY ("default_organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_computations"
    ADD CONSTRAINT "project_computations_computed_by_fkey" FOREIGN KEY ("computed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."project_computations"
    ADD CONSTRAINT "project_computations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_computations"
    ADD CONSTRAINT "project_computations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."resource_cost_snapshots"
    ADD CONSTRAINT "resource_cost_snapshots_index_id_fkey" FOREIGN KEY ("index_id") REFERENCES "public"."cost_indices"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."resource_cost_snapshots"
    ADD CONSTRAINT "resource_cost_snapshots_pricing_rule_id_fkey" FOREIGN KEY ("pricing_rule_id") REFERENCES "public"."resource_pricing_rules"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."resource_cost_snapshots"
    ADD CONSTRAINT "resource_cost_snapshots_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."resource_cost_snapshots"
    ADD CONSTRAINT "resource_cost_snapshots_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."resource_pricing_rules"
    ADD CONSTRAINT "resource_pricing_rules_index_id_fkey" FOREIGN KEY ("index_id") REFERENCES "public"."cost_indices"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."resource_pricing_rules"
    ADD CONSTRAINT "resource_pricing_rules_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."resource_pricing_rules"
    ADD CONSTRAINT "resource_pricing_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."resources"
    ADD CONSTRAINT "resources_catalog_id_fkey" FOREIGN KEY ("catalog_id") REFERENCES "public"."catalogs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."resources"
    ADD CONSTRAINT "resources_current_snapshot_id_fkey" FOREIGN KEY ("current_snapshot_id") REFERENCES "public"."resource_cost_snapshots"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."resources"
    ADD CONSTRAINT "resources_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_labor_yields"
    ADD CONSTRAINT "task_labor_yields_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_labor_yields"
    ADD CONSTRAINT "task_labor_yields_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_tool_yields"
    ADD CONSTRAINT "task_tool_yields_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_tool_yields"
    ADD CONSTRAINT "task_tool_yields_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_yields"
    ADD CONSTRAINT "task_yields_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_yields"
    ADD CONSTRAINT "task_yields_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_log_insert_own" ON "public"."audit_log" FOR INSERT TO "authenticated" WITH CHECK (("actor_id" = "auth"."uid"()));



CREATE POLICY "audit_log_select_master_admin" ON "public"."audit_log" FOR SELECT TO "authenticated" USING ("public"."is_master_admin"());



CREATE POLICY "billing_entitlements_select_all" ON "public"."plan_entitlements" FOR SELECT USING (true);



CREATE POLICY "billing_plans_select_all" ON "public"."subscription_plans" FOR SELECT USING (true);



ALTER TABLE "public"."budget_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "budget_items_delete_member" ON "public"."budget_items" FOR DELETE TO "authenticated" USING ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]));



CREATE POLICY "budget_items_insert_member" ON "public"."budget_items" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]));



CREATE POLICY "budget_items_select" ON "public"."budget_items" FOR SELECT USING (("project_id" IN ( SELECT "p"."id"
   FROM ("public"."projects" "p"
     JOIN "public"."organization_members" "om" ON (("om"."organization_id" = "p"."organization_id")))
  WHERE ("om"."user_id" = "auth"."uid"()))));



CREATE POLICY "budget_items_select_member" ON "public"."budget_items" FOR SELECT USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "budget_items_update_member" ON "public"."budget_items" FOR UPDATE TO "authenticated" USING ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])) WITH CHECK ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]));



ALTER TABLE "public"."budget_template_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "budget_template_items_delete_member" ON "public"."budget_template_items" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."budget_templates" "bt"
  WHERE (("bt"."id" = "budget_template_items"."budget_template_id") AND "public"."is_org_member_with_role"("bt"."organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])))));



CREATE POLICY "budget_template_items_insert_member" ON "public"."budget_template_items" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."budget_templates" "bt"
  WHERE (("bt"."id" = "budget_template_items"."budget_template_id") AND "public"."is_org_member_with_role"("bt"."organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])))));



CREATE POLICY "budget_template_items_select_member" ON "public"."budget_template_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."budget_templates" "bt"
  WHERE (("bt"."id" = "budget_template_items"."budget_template_id") AND "public"."is_org_member"("bt"."organization_id")))));



CREATE POLICY "budget_template_items_update_member" ON "public"."budget_template_items" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."budget_templates" "bt"
  WHERE (("bt"."id" = "budget_template_items"."budget_template_id") AND "public"."is_org_member_with_role"("bt"."organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."budget_templates" "bt"
  WHERE (("bt"."id" = "budget_template_items"."budget_template_id") AND "public"."is_org_member_with_role"("bt"."organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])))));



ALTER TABLE "public"."budget_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "budget_templates_delete_member" ON "public"."budget_templates" FOR DELETE TO "authenticated" USING ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]));



CREATE POLICY "budget_templates_insert_member" ON "public"."budget_templates" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]));



CREATE POLICY "budget_templates_select_member" ON "public"."budget_templates" FOR SELECT USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "budget_templates_update_member" ON "public"."budget_templates" FOR UPDATE TO "authenticated" USING ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])) WITH CHECK ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]));



ALTER TABLE "public"."budget_versions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "budget_versions_delete" ON "public"."budget_versions" FOR DELETE TO "authenticated" USING ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text"]));



CREATE POLICY "budget_versions_insert" ON "public"."budget_versions" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]));



CREATE POLICY "budget_versions_select" ON "public"."budget_versions" FOR SELECT TO "authenticated" USING ("public"."is_org_member"("organization_id"));



ALTER TABLE "public"."catalog_task_yields" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "catalog_task_yields_select" ON "public"."catalog_task_yields" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."master_tasks" "mt"
  WHERE (("mt"."id" = "catalog_task_yields"."master_task_id") AND (("mt"."organization_id" IS NULL) OR "public"."is_org_member"("mt"."organization_id"))))));



ALTER TABLE "public"."catalogs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "catalogs_select" ON "public"."catalogs" FOR SELECT TO "authenticated" USING ((("organization_id" IS NULL) OR "public"."is_org_member"("organization_id")));



CREATE POLICY "citems_delete" ON "public"."computation_items" FOR DELETE TO "authenticated" USING ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]));



CREATE POLICY "citems_insert" ON "public"."computation_items" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]));



CREATE POLICY "citems_select" ON "public"."computation_items" FOR SELECT TO "authenticated" USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "citems_update" ON "public"."computation_items" FOR UPDATE TO "authenticated" USING ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])) WITH CHECK ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]));



ALTER TABLE "public"."computation_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cost_index_values" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cost_index_values_delete" ON "public"."cost_index_values" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."cost_indices" "ci"
  WHERE (("ci"."id" = "cost_index_values"."index_id") AND ("ci"."tenant_id" IS NOT NULL) AND "public"."is_org_member_with_role"("ci"."tenant_id", ARRAY['owner'::"text", 'admin'::"text"])))));



CREATE POLICY "cost_index_values_insert" ON "public"."cost_index_values" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."cost_indices" "ci"
  WHERE (("ci"."id" = "cost_index_values"."index_id") AND ("ci"."tenant_id" IS NOT NULL) AND "public"."is_org_member_with_role"("ci"."tenant_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])))));



CREATE POLICY "cost_index_values_select" ON "public"."cost_index_values" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."cost_indices" "ci"
  WHERE (("ci"."id" = "cost_index_values"."index_id") AND (("ci"."tenant_id" IS NULL) OR "public"."is_org_member"("ci"."tenant_id"))))));



CREATE POLICY "cost_index_values_update" ON "public"."cost_index_values" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."cost_indices" "ci"
  WHERE (("ci"."id" = "cost_index_values"."index_id") AND ("ci"."tenant_id" IS NOT NULL) AND "public"."is_org_member_with_role"("ci"."tenant_id", ARRAY['owner'::"text", 'admin'::"text"]))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."cost_indices" "ci"
  WHERE (("ci"."id" = "cost_index_values"."index_id") AND ("ci"."tenant_id" IS NOT NULL) AND "public"."is_org_member_with_role"("ci"."tenant_id", ARRAY['owner'::"text", 'admin'::"text"])))));



ALTER TABLE "public"."cost_indices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cost_indices_delete" ON "public"."cost_indices" FOR DELETE TO "authenticated" USING ((("tenant_id" IS NOT NULL) AND "public"."is_org_member_with_role"("tenant_id", ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "cost_indices_insert" ON "public"."cost_indices" FOR INSERT TO "authenticated" WITH CHECK ((("tenant_id" IS NOT NULL) AND "public"."is_org_member_with_role"("tenant_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])));



CREATE POLICY "cost_indices_select_global" ON "public"."cost_indices" FOR SELECT TO "authenticated" USING (("tenant_id" IS NULL));



CREATE POLICY "cost_indices_select_private" ON "public"."cost_indices" FOR SELECT TO "authenticated" USING ((("tenant_id" IS NOT NULL) AND "public"."is_org_member"("tenant_id")));



CREATE POLICY "cost_indices_update" ON "public"."cost_indices" FOR UPDATE TO "authenticated" USING ((("tenant_id" IS NOT NULL) AND "public"."is_org_member_with_role"("tenant_id", ARRAY['owner'::"text", 'admin'::"text"]))) WITH CHECK ((("tenant_id" IS NOT NULL) AND "public"."is_org_member_with_role"("tenant_id", ARRAY['owner'::"text", 'admin'::"text"])));



ALTER TABLE "public"."crews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "crews_delete" ON "public"."crews" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND (("organization_members"."organization_id")::"text" = "crews"."organization_id") AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]))))));



CREATE POLICY "crews_insert" ON "public"."crews" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND (("organization_members"."organization_id")::"text" = "crews"."organization_id") AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]))))));



CREATE POLICY "crews_select" ON "public"."crews" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND (("organization_members"."organization_id")::"text" = "crews"."organization_id")))));



CREATE POLICY "crews_update" ON "public"."crews" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND (("organization_members"."organization_id")::"text" = "crews"."organization_id") AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND (("organization_members"."organization_id")::"text" = "crews"."organization_id") AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]))))));



ALTER TABLE "public"."invitations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invitations_delete" ON "public"."invitations" FOR DELETE TO "authenticated" USING ("public"."is_org_admin"("organization_id"));



CREATE POLICY "invitations_insert" ON "public"."invitations" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_org_admin"("organization_id"));



CREATE POLICY "invitations_select" ON "public"."invitations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "invitations"."organization_id") AND ("om"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."labor_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "labor_categories_delete" ON "public"."labor_categories" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND (("organization_members"."organization_id")::"text" = "labor_categories"."organization_id") AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]))))));



CREATE POLICY "labor_categories_insert" ON "public"."labor_categories" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND (("organization_members"."organization_id")::"text" = "labor_categories"."organization_id") AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]))))));



CREATE POLICY "labor_categories_select" ON "public"."labor_categories" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND (("organization_members"."organization_id")::"text" = "labor_categories"."organization_id")))));



CREATE POLICY "labor_categories_update" ON "public"."labor_categories" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND (("organization_members"."organization_id")::"text" = "labor_categories"."organization_id") AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND (("organization_members"."organization_id")::"text" = "labor_categories"."organization_id") AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]))))));



ALTER TABLE "public"."master_materials" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "master_materials_delete" ON "public"."master_materials" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND (("organization_members"."organization_id")::"text" = "master_materials"."organization_id") AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]))))));



CREATE POLICY "master_materials_delete_global_admin" ON "public"."master_materials" FOR DELETE TO "authenticated" USING ((("organization_id" IS NULL) AND "public"."is_master_admin"()));



CREATE POLICY "master_materials_insert" ON "public"."master_materials" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND (("organization_members"."organization_id")::"text" = "master_materials"."organization_id") AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]))))));



CREATE POLICY "master_materials_insert_global_admin" ON "public"."master_materials" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" IS NULL) AND "public"."is_master_admin"()));



CREATE POLICY "master_materials_select" ON "public"."master_materials" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND (("organization_members"."organization_id")::"text" = "master_materials"."organization_id")))));



CREATE POLICY "master_materials_select_global" ON "public"."master_materials" FOR SELECT TO "authenticated" USING ((("organization_id" IS NULL) AND ("is_active" = true)));



COMMENT ON POLICY "master_materials_select_global" ON "public"."master_materials" IS 'Permite que cualquier usuario autenticado lea materiales del catálogo global (organization_id IS NULL). Escritura sigue restringida a master_admin (migration 049).';



CREATE POLICY "master_materials_select_master_admin" ON "public"."master_materials" FOR SELECT TO "authenticated" USING ("public"."is_master_admin"());



CREATE POLICY "master_materials_update" ON "public"."master_materials" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND (("organization_members"."organization_id")::"text" = "master_materials"."organization_id") AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND (("organization_members"."organization_id")::"text" = "master_materials"."organization_id") AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]))))));



CREATE POLICY "master_materials_update_global_admin" ON "public"."master_materials" FOR UPDATE TO "authenticated" USING ((("organization_id" IS NULL) AND "public"."is_master_admin"())) WITH CHECK ((("organization_id" IS NULL) AND "public"."is_master_admin"()));



ALTER TABLE "public"."master_task_equipment" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "master_task_equipment_delete_global_admin" ON "public"."master_task_equipment" FOR DELETE TO "authenticated" USING (("public"."is_master_admin"() AND (EXISTS ( SELECT 1
   FROM "public"."master_tasks" "mt"
  WHERE (("mt"."id" = "master_task_equipment"."master_task_id") AND ("mt"."organization_id" IS NULL))))));



CREATE POLICY "master_task_equipment_delete_member" ON "public"."master_task_equipment" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."master_tasks" "mt"
  WHERE (("mt"."id" = "master_task_equipment"."master_task_id") AND "public"."is_org_member_with_role"("mt"."organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])))));



CREATE POLICY "master_task_equipment_insert_global_admin" ON "public"."master_task_equipment" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_master_admin"() AND (EXISTS ( SELECT 1
   FROM "public"."master_tasks" "mt"
  WHERE (("mt"."id" = "master_task_equipment"."master_task_id") AND ("mt"."organization_id" IS NULL))))));



CREATE POLICY "master_task_equipment_insert_member" ON "public"."master_task_equipment" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."master_tasks" "mt"
  WHERE (("mt"."id" = "master_task_equipment"."master_task_id") AND "public"."is_org_member_with_role"("mt"."organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])))));



CREATE POLICY "master_task_equipment_select_member" ON "public"."master_task_equipment" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."master_tasks" "mt"
  WHERE (("mt"."id" = "master_task_equipment"."master_task_id") AND "public"."is_org_member"("mt"."organization_id")))));



CREATE POLICY "master_task_equipment_update_global_admin" ON "public"."master_task_equipment" FOR UPDATE TO "authenticated" USING (("public"."is_master_admin"() AND (EXISTS ( SELECT 1
   FROM "public"."master_tasks" "mt"
  WHERE (("mt"."id" = "master_task_equipment"."master_task_id") AND ("mt"."organization_id" IS NULL)))))) WITH CHECK (("public"."is_master_admin"() AND (EXISTS ( SELECT 1
   FROM "public"."master_tasks" "mt"
  WHERE (("mt"."id" = "master_task_equipment"."master_task_id") AND ("mt"."organization_id" IS NULL))))));



CREATE POLICY "master_task_equipment_update_member" ON "public"."master_task_equipment" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."master_tasks" "mt"
  WHERE (("mt"."id" = "master_task_equipment"."master_task_id") AND "public"."is_org_member_with_role"("mt"."organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."master_tasks" "mt"
  WHERE (("mt"."id" = "master_task_equipment"."master_task_id") AND "public"."is_org_member_with_role"("mt"."organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])))));



ALTER TABLE "public"."master_task_labor" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "master_task_labor_delete_global_admin" ON "public"."master_task_labor" FOR DELETE TO "authenticated" USING (("public"."is_master_admin"() AND (EXISTS ( SELECT 1
   FROM "public"."master_tasks" "mt"
  WHERE (("mt"."id" = "master_task_labor"."master_task_id") AND ("mt"."organization_id" IS NULL))))));



CREATE POLICY "master_task_labor_delete_member" ON "public"."master_task_labor" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."master_tasks" "mt"
  WHERE (("mt"."id" = "master_task_labor"."master_task_id") AND "public"."is_org_member_with_role"("mt"."organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])))));



CREATE POLICY "master_task_labor_insert_global_admin" ON "public"."master_task_labor" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_master_admin"() AND (EXISTS ( SELECT 1
   FROM "public"."master_tasks" "mt"
  WHERE (("mt"."id" = "master_task_labor"."master_task_id") AND ("mt"."organization_id" IS NULL))))));



CREATE POLICY "master_task_labor_insert_member" ON "public"."master_task_labor" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."master_tasks" "mt"
  WHERE (("mt"."id" = "master_task_labor"."master_task_id") AND "public"."is_org_member_with_role"("mt"."organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])))));



CREATE POLICY "master_task_labor_select_member" ON "public"."master_task_labor" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."master_tasks" "mt"
  WHERE (("mt"."id" = "master_task_labor"."master_task_id") AND "public"."is_org_member"("mt"."organization_id")))));



CREATE POLICY "master_task_labor_update_global_admin" ON "public"."master_task_labor" FOR UPDATE TO "authenticated" USING (("public"."is_master_admin"() AND (EXISTS ( SELECT 1
   FROM "public"."master_tasks" "mt"
  WHERE (("mt"."id" = "master_task_labor"."master_task_id") AND ("mt"."organization_id" IS NULL)))))) WITH CHECK (("public"."is_master_admin"() AND (EXISTS ( SELECT 1
   FROM "public"."master_tasks" "mt"
  WHERE (("mt"."id" = "master_task_labor"."master_task_id") AND ("mt"."organization_id" IS NULL))))));



CREATE POLICY "master_task_labor_update_member" ON "public"."master_task_labor" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."master_tasks" "mt"
  WHERE (("mt"."id" = "master_task_labor"."master_task_id") AND "public"."is_org_member_with_role"("mt"."organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."master_tasks" "mt"
  WHERE (("mt"."id" = "master_task_labor"."master_task_id") AND "public"."is_org_member_with_role"("mt"."organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])))));



ALTER TABLE "public"."master_task_materials" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "master_task_materials_delete_global_admin" ON "public"."master_task_materials" FOR DELETE TO "authenticated" USING (("public"."is_master_admin"() AND (EXISTS ( SELECT 1
   FROM "public"."master_tasks" "mt"
  WHERE (("mt"."id" = "master_task_materials"."master_task_id") AND ("mt"."organization_id" IS NULL))))));



CREATE POLICY "master_task_materials_delete_member" ON "public"."master_task_materials" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."master_tasks" "mt"
  WHERE (("mt"."id" = "master_task_materials"."master_task_id") AND "public"."is_org_member_with_role"("mt"."organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])))));



CREATE POLICY "master_task_materials_insert_global_admin" ON "public"."master_task_materials" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_master_admin"() AND (EXISTS ( SELECT 1
   FROM "public"."master_tasks" "mt"
  WHERE (("mt"."id" = "master_task_materials"."master_task_id") AND ("mt"."organization_id" IS NULL))))));



CREATE POLICY "master_task_materials_insert_member" ON "public"."master_task_materials" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."master_tasks" "mt"
  WHERE (("mt"."id" = "master_task_materials"."master_task_id") AND "public"."is_org_member_with_role"("mt"."organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])))));



CREATE POLICY "master_task_materials_select_member" ON "public"."master_task_materials" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."master_tasks" "mt"
  WHERE (("mt"."id" = "master_task_materials"."master_task_id") AND "public"."is_org_member"("mt"."organization_id")))));



CREATE POLICY "master_task_materials_update_global_admin" ON "public"."master_task_materials" FOR UPDATE TO "authenticated" USING (("public"."is_master_admin"() AND (EXISTS ( SELECT 1
   FROM "public"."master_tasks" "mt"
  WHERE (("mt"."id" = "master_task_materials"."master_task_id") AND ("mt"."organization_id" IS NULL)))))) WITH CHECK (("public"."is_master_admin"() AND (EXISTS ( SELECT 1
   FROM "public"."master_tasks" "mt"
  WHERE (("mt"."id" = "master_task_materials"."master_task_id") AND ("mt"."organization_id" IS NULL))))));



CREATE POLICY "master_task_materials_update_member" ON "public"."master_task_materials" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."master_tasks" "mt"
  WHERE (("mt"."id" = "master_task_materials"."master_task_id") AND "public"."is_org_member_with_role"("mt"."organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."master_tasks" "mt"
  WHERE (("mt"."id" = "master_task_materials"."master_task_id") AND "public"."is_org_member_with_role"("mt"."organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])))));



ALTER TABLE "public"."master_tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "master_tasks_delete_global_admin" ON "public"."master_tasks" FOR DELETE TO "authenticated" USING ((("organization_id" IS NULL) AND "public"."is_master_admin"()));



CREATE POLICY "master_tasks_delete_member" ON "public"."master_tasks" FOR DELETE TO "authenticated" USING ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]));



CREATE POLICY "master_tasks_insert_global_admin" ON "public"."master_tasks" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" IS NULL) AND "public"."is_master_admin"()));



CREATE POLICY "master_tasks_insert_member" ON "public"."master_tasks" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]));



CREATE POLICY "master_tasks_select_global" ON "public"."master_tasks" FOR SELECT TO "authenticated" USING (("organization_id" IS NULL));



CREATE POLICY "master_tasks_select_member" ON "public"."master_tasks" FOR SELECT USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "master_tasks_update_global_admin" ON "public"."master_tasks" FOR UPDATE TO "authenticated" USING ((("organization_id" IS NULL) AND "public"."is_master_admin"())) WITH CHECK ((("organization_id" IS NULL) AND "public"."is_master_admin"()));



CREATE POLICY "master_tasks_update_member" ON "public"."master_tasks" FOR UPDATE TO "authenticated" USING ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])) WITH CHECK ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]));



ALTER TABLE "public"."materials" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "materials_delete" ON "public"."materials" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND (("organization_members"."organization_id")::"text" = "materials"."organization_id") AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]))))));



CREATE POLICY "materials_insert" ON "public"."materials" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND (("organization_members"."organization_id")::"text" = "materials"."organization_id") AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]))))));



CREATE POLICY "materials_select" ON "public"."materials" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND (("organization_members"."organization_id")::"text" = "materials"."organization_id")))));



CREATE POLICY "materials_update" ON "public"."materials" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND (("organization_members"."organization_id")::"text" = "materials"."organization_id") AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND (("organization_members"."organization_id")::"text" = "materials"."organization_id") AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]))))));



CREATE POLICY "members_delete" ON "public"."organization_members" FOR DELETE TO "authenticated" USING (("public"."is_org_admin"("organization_id") AND ("role" <> 'owner'::"text")));



CREATE POLICY "members_select" ON "public"."organization_members" FOR SELECT TO "authenticated" USING (("organization_id" IN ( SELECT "get_my_organization_ids"."org_id"
   FROM "public"."get_my_organization_ids"() "get_my_organization_ids"("org_id"))));



CREATE POLICY "org_members_select" ON "public"."organization_members" FOR SELECT USING ("public"."is_member_of_org"("organization_id"));



CREATE POLICY "org_members_update_role" ON "public"."organization_members" FOR UPDATE USING (("public"."is_org_admin"("organization_id") AND ("role" <> 'owner'::"text"))) WITH CHECK (("public"."is_org_admin"("organization_id") AND ("role" = ANY (ARRAY['admin'::"text", 'editor'::"text", 'viewer'::"text"]))));



CREATE POLICY "org_sub_select_own" ON "public"."organization_subscriptions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "om"
  WHERE (("om"."organization_id" = "organization_subscriptions"."organization_id") AND ("om"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_sub_service_all" ON "public"."organization_subscriptions" USING (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."organization_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organization_members_select_own" ON "public"."organization_members" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."organization_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organizations_select_member" ON "public"."organizations" FOR SELECT USING ("public"."is_org_member"("id"));



CREATE POLICY "organizations_update_member" ON "public"."organizations" FOR UPDATE TO "authenticated" USING ("public"."is_org_admin"("id")) WITH CHECK ("public"."is_org_admin"("id"));



CREATE POLICY "pcomp_delete" ON "public"."project_computations" FOR DELETE TO "authenticated" USING ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]));



CREATE POLICY "pcomp_insert" ON "public"."project_computations" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]));



CREATE POLICY "pcomp_select" ON "public"."project_computations" FOR SELECT TO "authenticated" USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "pcomp_update" ON "public"."project_computations" FOR UPDATE TO "authenticated" USING ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])) WITH CHECK ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]));



ALTER TABLE "public"."plan_entitlements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."price_index_sync_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "price_index_sync_runs_select" ON "public"."price_index_sync_runs" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."price_indices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "price_indices_delete" ON "public"."price_indices" FOR DELETE TO "authenticated" USING ("public"."is_master_admin"());



CREATE POLICY "price_indices_insert" ON "public"."price_indices" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_master_admin"());



CREATE POLICY "price_indices_select" ON "public"."price_indices" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "price_indices_update" ON "public"."price_indices" FOR UPDATE TO "authenticated" USING ("public"."is_master_admin"()) WITH CHECK ("public"."is_master_admin"());



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_own" ON "public"."profiles" FOR INSERT WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "profiles_select" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR ("id" IN ( SELECT "om"."user_id"
   FROM "public"."organization_members" "om"
  WHERE ("om"."organization_id" IN ( SELECT "get_my_organization_ids"."org_id"
           FROM "public"."get_my_organization_ids"() "get_my_organization_ids"("org_id")))))));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



ALTER TABLE "public"."project_computations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "projects_delete_member" ON "public"."projects" FOR DELETE TO "authenticated" USING ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]));



CREATE POLICY "projects_insert_member" ON "public"."projects" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]));



CREATE POLICY "projects_select_member" ON "public"."projects" FOR SELECT USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "projects_update_member" ON "public"."projects" FOR UPDATE TO "authenticated" USING ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])) WITH CHECK ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]));



ALTER TABLE "public"."resource_cost_snapshots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "resource_cost_snapshots_delete" ON "public"."resource_cost_snapshots" FOR DELETE TO "authenticated" USING ("public"."is_org_member_with_role"("tenant_id", ARRAY['owner'::"text", 'admin'::"text"]));



CREATE POLICY "resource_cost_snapshots_insert" ON "public"."resource_cost_snapshots" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_org_member_with_role"("tenant_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]));



CREATE POLICY "resource_cost_snapshots_select" ON "public"."resource_cost_snapshots" FOR SELECT TO "authenticated" USING ("public"."is_org_member"("tenant_id"));



ALTER TABLE "public"."resource_pricing_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "resource_pricing_rules_delete" ON "public"."resource_pricing_rules" FOR DELETE TO "authenticated" USING ("public"."is_org_member_with_role"("tenant_id", ARRAY['owner'::"text", 'admin'::"text"]));



CREATE POLICY "resource_pricing_rules_insert" ON "public"."resource_pricing_rules" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_org_member_with_role"("tenant_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]));



CREATE POLICY "resource_pricing_rules_select" ON "public"."resource_pricing_rules" FOR SELECT TO "authenticated" USING ("public"."is_org_member"("tenant_id"));



CREATE POLICY "resource_pricing_rules_update" ON "public"."resource_pricing_rules" FOR UPDATE TO "authenticated" USING ("public"."is_org_member_with_role"("tenant_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])) WITH CHECK ("public"."is_org_member_with_role"("tenant_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]));



ALTER TABLE "public"."resources" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "resources_select" ON "public"."resources" FOR SELECT TO "authenticated" USING ((("organization_id" IS NULL) OR "public"."is_org_member"("organization_id")));



ALTER TABLE "public"."stripe_webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_crew_yields" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_crew_yields_delete_member" ON "public"."task_crew_yields" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tasks" "t"
  WHERE ((("t"."id")::"text" = "task_crew_yields"."task_id") AND "public"."is_org_member_with_role"("t"."organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])))));



CREATE POLICY "task_crew_yields_insert_member" ON "public"."task_crew_yields" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."tasks" "t"
     JOIN "public"."crews" "c" ON (("c"."organization_id" = ("t"."organization_id")::"text")))
  WHERE ((("t"."id")::"text" = "task_crew_yields"."task_id") AND ("c"."id" = "task_crew_yields"."crew_id") AND "public"."is_org_member_with_role"("t"."organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])))));



CREATE POLICY "task_crew_yields_select_member" ON "public"."task_crew_yields" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tasks" "t"
  WHERE ((("t"."id")::"text" = "task_crew_yields"."task_id") AND "public"."is_org_member"("t"."organization_id")))));



CREATE POLICY "task_crew_yields_update_member" ON "public"."task_crew_yields" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tasks" "t"
  WHERE ((("t"."id")::"text" = "task_crew_yields"."task_id") AND "public"."is_org_member_with_role"("t"."organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."tasks" "t"
     JOIN "public"."crews" "c" ON (("c"."organization_id" = ("t"."organization_id")::"text")))
  WHERE ((("t"."id")::"text" = "task_crew_yields"."task_id") AND ("c"."id" = "task_crew_yields"."crew_id") AND "public"."is_org_member_with_role"("t"."organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])))));



ALTER TABLE "public"."task_labor_yields" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_labor_yields_delete_member" ON "public"."task_labor_yields" FOR DELETE TO "authenticated" USING ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]));



CREATE POLICY "task_labor_yields_insert_member" ON "public"."task_labor_yields" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]));



CREATE POLICY "task_labor_yields_select" ON "public"."task_labor_yields" FOR SELECT USING (("task_id" IN ( SELECT "t"."id"
   FROM ("public"."tasks" "t"
     JOIN "public"."organization_members" "om" ON (("om"."organization_id" = "t"."organization_id")))
  WHERE ("om"."user_id" = "auth"."uid"()))));



CREATE POLICY "task_labor_yields_select_member" ON "public"."task_labor_yields" FOR SELECT USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "task_labor_yields_update_member" ON "public"."task_labor_yields" FOR UPDATE TO "authenticated" USING ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])) WITH CHECK ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]));



ALTER TABLE "public"."task_tool_yields" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_tool_yields_delete_member" ON "public"."task_tool_yields" FOR DELETE TO "authenticated" USING ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]));



CREATE POLICY "task_tool_yields_insert_member" ON "public"."task_tool_yields" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]));



CREATE POLICY "task_tool_yields_select" ON "public"."task_tool_yields" FOR SELECT USING (("task_id" IN ( SELECT "t"."id"
   FROM ("public"."tasks" "t"
     JOIN "public"."organization_members" "om" ON (("om"."organization_id" = "t"."organization_id")))
  WHERE ("om"."user_id" = "auth"."uid"()))));



CREATE POLICY "task_tool_yields_select_member" ON "public"."task_tool_yields" FOR SELECT USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "task_tool_yields_update_member" ON "public"."task_tool_yields" FOR UPDATE TO "authenticated" USING ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])) WITH CHECK ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]));



ALTER TABLE "public"."task_yields" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_yields_delete_member" ON "public"."task_yields" FOR DELETE TO "authenticated" USING ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]));



CREATE POLICY "task_yields_insert_member" ON "public"."task_yields" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]));



CREATE POLICY "task_yields_select" ON "public"."task_yields" FOR SELECT USING (("task_id" IN ( SELECT "t"."id"
   FROM ("public"."tasks" "t"
     JOIN "public"."organization_members" "om" ON (("om"."organization_id" = "t"."organization_id")))
  WHERE ("om"."user_id" = "auth"."uid"()))));



CREATE POLICY "task_yields_select_member" ON "public"."task_yields" FOR SELECT USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "task_yields_update_member" ON "public"."task_yields" FOR UPDATE TO "authenticated" USING ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])) WITH CHECK ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]));



ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tasks_delete_member" ON "public"."tasks" FOR DELETE TO "authenticated" USING ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]));



CREATE POLICY "tasks_insert_member" ON "public"."tasks" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]));



CREATE POLICY "tasks_select" ON "public"."tasks" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "tasks_select_member" ON "public"."tasks" FOR SELECT USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "tasks_update_member" ON "public"."tasks" FOR UPDATE TO "authenticated" USING ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])) WITH CHECK ("public"."is_org_member_with_role"("organization_id", ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]));



ALTER TABLE "public"."tools" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tools_delete" ON "public"."tools" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND (("organization_members"."organization_id")::"text" = "tools"."organization_id") AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]))))));



CREATE POLICY "tools_insert" ON "public"."tools" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND (("organization_members"."organization_id")::"text" = "tools"."organization_id") AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]))))));



CREATE POLICY "tools_select" ON "public"."tools" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND (("organization_members"."organization_id")::"text" = "tools"."organization_id")))));



CREATE POLICY "tools_update" ON "public"."tools" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND (("organization_members"."organization_id")::"text" = "tools"."organization_id") AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND (("organization_members"."organization_id")::"text" = "tools"."organization_id") AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'editor'::"text"]))))));



ALTER TABLE "public"."v_org_uuid" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "webhook_events_service" ON "public"."stripe_webhook_events" USING (("auth"."role"() = 'service_role'::"text"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."accept_invitation"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_invitation"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_invitation"("p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_commercial_rules"("p_org_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_commercial_rules"("p_org_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_commercial_rules"("p_org_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."audit_master_catalog"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."audit_master_catalog"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."bootstrap_organization"("org_name" "text", "org_slug" "text", "user_full_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bootstrap_organization"("org_name" "text", "org_slug" "text", "user_full_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bootstrap_organization"("org_name" "text", "org_slug" "text", "user_full_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."calc_index_variation"() TO "anon";
GRANT ALL ON FUNCTION "public"."calc_index_variation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."calc_index_variation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_consolidated_resources"("p_items" "jsonb", "p_organization_id" "text", "p_cost_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_consolidated_resources"("p_items" "jsonb", "p_organization_id" "text", "p_cost_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_consolidated_resources"("p_items" "jsonb", "p_organization_id" "text", "p_cost_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."clone_master_task_to_org"("p_master_task_id" "uuid", "p_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clone_master_task_to_org"("p_master_task_id" "uuid", "p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."clone_master_task_to_org"("p_master_task_id" "uuid", "p_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_tenant_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_tenant_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_tenant_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."detect_duplicate_apu_codes"("p_organization_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."detect_duplicate_apu_codes"("p_organization_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."detect_duplicate_apu_codes"("p_organization_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."generate_monthly_snapshots"("p_tenant_id" "uuid", "p_year" smallint, "p_month" smallint, "p_overwrite" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_monthly_snapshots"("p_tenant_id" "uuid", "p_year" smallint, "p_month" smallint, "p_overwrite" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_monthly_snapshots"("p_tenant_id" "uuid", "p_year" smallint, "p_month" smallint, "p_overwrite" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_apu_technical_report"("p_master_task_id" "uuid", "p_organization_id" "text", "p_cost_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_apu_technical_report"("p_master_task_id" "uuid", "p_organization_id" "text", "p_cost_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_apu_technical_report"("p_master_task_id" "uuid", "p_organization_id" "text", "p_cost_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_invitation_by_token"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_invitation_by_token"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_invitation_by_token"("p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_admin_organization_ids"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_admin_organization_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_admin_organization_ids"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_org_ids_text"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_org_ids_text"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_org_ids_text"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_organization_ids"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_organization_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_organization_ids"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_org_entitlements"("p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_org_entitlements"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_org_entitlements"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_org_uuid"("slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_org_uuid"("slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_org_uuid"("slug" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_resource_cost"("p_resource_id" "uuid", "p_tenant_id" "uuid", "p_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_resource_cost"("p_resource_id" "uuid", "p_tenant_id" "uuid", "p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_resource_cost"("p_resource_id" "uuid", "p_tenant_id" "uuid", "p_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_resource_snapshot"("p_resource_id" "uuid", "p_tenant_id" "uuid", "p_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_resource_snapshot"("p_resource_id" "uuid", "p_tenant_id" "uuid", "p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_resource_snapshot"("p_resource_id" "uuid", "p_tenant_id" "uuid", "p_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."import_global_catalog_to_org"("p_organization_id" "uuid", "p_mode" "text", "p_categories" "text"[], "p_master_task_codes" "text"[], "p_resource_codes" "text"[], "p_price_strategy" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."import_global_catalog_to_org"("p_organization_id" "uuid", "p_mode" "text", "p_categories" "text"[], "p_master_task_codes" "text"[], "p_resource_codes" "text"[], "p_price_strategy" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."import_global_catalog_to_org"("p_organization_id" "uuid", "p_mode" "text", "p_categories" "text"[], "p_master_task_codes" "text"[], "p_resource_codes" "text"[], "p_price_strategy" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_master_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_master_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_master_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_member_of_org"("p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_member_of_org"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_member_of_org"("p_org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_org_admin"("p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_org_admin"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_admin"("p_org_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_org_member"("org_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_org_member"("org_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_member"("org_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_org_member"("org_uuid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_org_member"("org_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_member"("org_uuid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_org_member_with_role"("org_id" "text", "min_roles" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_org_member_with_role"("org_id" "text", "min_roles" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_member_with_role"("org_id" "text", "min_roles" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_org_member_with_role"("org_uuid" "uuid", "min_roles" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_org_member_with_role"("org_uuid" "uuid", "min_roles" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_member_with_role"("org_uuid" "uuid", "min_roles" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_valid_positive_number"("v" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."is_valid_positive_number"("v" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_valid_positive_number"("v" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."repair_master_task_material_prices"("p_org_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."repair_master_task_material_prices"("p_org_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."repair_master_task_material_prices"("p_org_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."resync_org_material_prices"("p_org_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resync_org_material_prices"("p_org_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resync_org_material_prices"("p_org_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."seed_apu_mam_rev"("p_org_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."seed_apu_mam_rev"("p_org_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."seed_apu_morteros"("p_org_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."seed_apu_morteros"("p_org_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."seed_exc_mam_materials"("p_org_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."seed_exc_mam_materials"("p_org_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."seed_extended_apu"("p_org_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."seed_extended_apu"("p_org_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."seed_extended_materials"("p_org_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."seed_extended_materials"("p_org_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."seed_mortero_materials"("p_org_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."seed_mortero_materials"("p_org_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_current_snapshot_cache"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_current_snapshot_cache"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_current_snapshot_cache"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_profile_email"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_profile_email"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trg_fn_create_org_subscription"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_fn_create_org_subscription"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trg_fn_new_org_seed"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trg_fn_new_org_seed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_set_updated_at_org_sub"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_set_updated_at_org_sub"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_set_updated_at_org_sub"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_index_value"("p_index_code" "text", "p_year" smallint, "p_month" smallint, "p_value" numeric, "p_published_at" "date", "p_source_ref" "text", "p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_index_value"("p_index_code" "text", "p_year" smallint, "p_month" smallint, "p_value" numeric, "p_published_at" "date", "p_source_ref" "text", "p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_index_value"("p_index_code" "text", "p_year" smallint, "p_month" smallint, "p_value" numeric, "p_published_at" "date", "p_source_ref" "text", "p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_composite_components"("cfg" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_composite_components"("cfg" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_composite_components"("cfg" "jsonb") TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."budget_items" TO "anon";
GRANT ALL ON TABLE "public"."budget_items" TO "authenticated";
GRANT ALL ON TABLE "public"."budget_items" TO "service_role";



GRANT ALL ON TABLE "public"."budget_template_items" TO "anon";
GRANT ALL ON TABLE "public"."budget_template_items" TO "authenticated";
GRANT ALL ON TABLE "public"."budget_template_items" TO "service_role";



GRANT ALL ON TABLE "public"."budget_templates" TO "anon";
GRANT ALL ON TABLE "public"."budget_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."budget_templates" TO "service_role";



GRANT ALL ON TABLE "public"."budget_versions" TO "anon";
GRANT ALL ON TABLE "public"."budget_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."budget_versions" TO "service_role";



GRANT ALL ON TABLE "public"."catalog_task_yields" TO "anon";
GRANT ALL ON TABLE "public"."catalog_task_yields" TO "authenticated";
GRANT ALL ON TABLE "public"."catalog_task_yields" TO "service_role";



GRANT ALL ON TABLE "public"."catalogs" TO "anon";
GRANT ALL ON TABLE "public"."catalogs" TO "authenticated";
GRANT ALL ON TABLE "public"."catalogs" TO "service_role";



GRANT ALL ON TABLE "public"."computation_items" TO "anon";
GRANT ALL ON TABLE "public"."computation_items" TO "authenticated";
GRANT ALL ON TABLE "public"."computation_items" TO "service_role";



GRANT ALL ON TABLE "public"."cost_index_values" TO "anon";
GRANT ALL ON TABLE "public"."cost_index_values" TO "authenticated";
GRANT ALL ON TABLE "public"."cost_index_values" TO "service_role";



GRANT ALL ON TABLE "public"."cost_indices" TO "anon";
GRANT ALL ON TABLE "public"."cost_indices" TO "authenticated";
GRANT ALL ON TABLE "public"."cost_indices" TO "service_role";



GRANT ALL ON TABLE "public"."crews" TO "anon";
GRANT ALL ON TABLE "public"."crews" TO "authenticated";
GRANT ALL ON TABLE "public"."crews" TO "service_role";



GRANT ALL ON TABLE "public"."invitations" TO "anon";
GRANT ALL ON TABLE "public"."invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."invitations" TO "service_role";



GRANT ALL ON TABLE "public"."labor_categories" TO "anon";
GRANT ALL ON TABLE "public"."labor_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."labor_categories" TO "service_role";



GRANT ALL ON TABLE "public"."master_materials" TO "authenticated";
GRANT ALL ON TABLE "public"."master_materials" TO "service_role";



GRANT ALL ON TABLE "public"."master_task_equipment" TO "anon";
GRANT ALL ON TABLE "public"."master_task_equipment" TO "authenticated";
GRANT ALL ON TABLE "public"."master_task_equipment" TO "service_role";



GRANT ALL ON TABLE "public"."master_task_labor" TO "anon";
GRANT ALL ON TABLE "public"."master_task_labor" TO "authenticated";
GRANT ALL ON TABLE "public"."master_task_labor" TO "service_role";



GRANT ALL ON TABLE "public"."master_task_materials" TO "anon";
GRANT ALL ON TABLE "public"."master_task_materials" TO "authenticated";
GRANT ALL ON TABLE "public"."master_task_materials" TO "service_role";



GRANT ALL ON TABLE "public"."master_tasks" TO "anon";
GRANT ALL ON TABLE "public"."master_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."master_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."materials" TO "anon";
GRANT ALL ON TABLE "public"."materials" TO "authenticated";
GRANT ALL ON TABLE "public"."materials" TO "service_role";



GRANT ALL ON TABLE "public"."organization_members" TO "anon";
GRANT ALL ON TABLE "public"."organization_members" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_members" TO "service_role";



GRANT ALL ON TABLE "public"."organization_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."organization_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."plan_entitlements" TO "anon";
GRANT ALL ON TABLE "public"."plan_entitlements" TO "authenticated";
GRANT ALL ON TABLE "public"."plan_entitlements" TO "service_role";



GRANT ALL ON TABLE "public"."price_index_sync_runs" TO "anon";
GRANT ALL ON TABLE "public"."price_index_sync_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."price_index_sync_runs" TO "service_role";



GRANT ALL ON TABLE "public"."price_indices" TO "anon";
GRANT ALL ON TABLE "public"."price_indices" TO "authenticated";
GRANT ALL ON TABLE "public"."price_indices" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."project_computations" TO "anon";
GRANT ALL ON TABLE "public"."project_computations" TO "authenticated";
GRANT ALL ON TABLE "public"."project_computations" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON TABLE "public"."resource_cost_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."resource_cost_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."resource_cost_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."resource_pricing_rules" TO "anon";
GRANT ALL ON TABLE "public"."resource_pricing_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."resource_pricing_rules" TO "service_role";



GRANT ALL ON TABLE "public"."resources" TO "anon";
GRANT ALL ON TABLE "public"."resources" TO "authenticated";
GRANT ALL ON TABLE "public"."resources" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."stripe_webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_plans" TO "anon";
GRANT ALL ON TABLE "public"."subscription_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_plans" TO "service_role";



GRANT ALL ON TABLE "public"."task_crew_yields" TO "anon";
GRANT ALL ON TABLE "public"."task_crew_yields" TO "authenticated";
GRANT ALL ON TABLE "public"."task_crew_yields" TO "service_role";



GRANT ALL ON TABLE "public"."task_labor_yields" TO "anon";
GRANT ALL ON TABLE "public"."task_labor_yields" TO "authenticated";
GRANT ALL ON TABLE "public"."task_labor_yields" TO "service_role";



GRANT ALL ON TABLE "public"."task_tool_yields" TO "anon";
GRANT ALL ON TABLE "public"."task_tool_yields" TO "authenticated";
GRANT ALL ON TABLE "public"."task_tool_yields" TO "service_role";



GRANT ALL ON TABLE "public"."task_yields" TO "anon";
GRANT ALL ON TABLE "public"."task_yields" TO "authenticated";
GRANT ALL ON TABLE "public"."task_yields" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."tools" TO "anon";
GRANT ALL ON TABLE "public"."tools" TO "authenticated";
GRANT ALL ON TABLE "public"."tools" TO "service_role";



GRANT ALL ON TABLE "public"."v_org_uuid" TO "anon";
GRANT ALL ON TABLE "public"."v_org_uuid" TO "authenticated";
GRANT ALL ON TABLE "public"."v_org_uuid" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";









-- ============================================================================
-- Objetos fuera de public (agregados a mano al baseline)
-- ----------------------------------------------------------------------------
-- Estos objetos viven en otros schemas (storage). No vienen en `supabase db
-- dump --schema public`, pero son parte del estado vivo de producción.
-- Se escriben acá para que `supabase db reset` deje la base igual a prod.
--
-- Fuente: inspección de solo lectura al proyecto gbewodztwewgrhsoavmg el
-- 2026-11-03 (pg_policies + storage.buckets).
-- Funciones que referencian (is_org_member, is_org_member_with_role) ya están
-- definidas más arriba, en el dump del esquema public.
-- ============================================================================

-- Bucket privado para portadas de proyectos (migración 064 original).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('project-covers', 'project-covers', false, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Policies de project-covers sobre storage.objects.
DROP POLICY IF EXISTS "project_covers_select" ON storage.objects;
CREATE POLICY "project_covers_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-covers'
    AND public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "project_covers_insert" ON storage.objects;
CREATE POLICY "project_covers_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-covers'
    AND public.is_org_member_with_role(((storage.foldername(name))[1])::uuid, ARRAY['owner','admin','editor'])
  );

DROP POLICY IF EXISTS "project_covers_update" ON storage.objects;
CREATE POLICY "project_covers_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'project-covers'
    AND public.is_org_member_with_role(((storage.foldername(name))[1])::uuid, ARRAY['owner','admin','editor'])
  );

DROP POLICY IF EXISTS "project_covers_delete" ON storage.objects;
CREATE POLICY "project_covers_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-covers'
    AND public.is_org_member_with_role(((storage.foldername(name))[1])::uuid, ARRAY['owner','admin','editor'])
  );
