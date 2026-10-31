BEGIN;
CREATE OR REPLACE FUNCTION public.apply_commercial_rules(p_org_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
REVOKE EXECUTE ON FUNCTION public.accept_invitation(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.apply_commercial_rules(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bootstrap_organization(text,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.clone_master_task_to_org(uuid,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generate_monthly_snapshots(uuid,smallint,smallint,boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.import_global_catalog_to_org(uuid,text,text[],text[],text[],text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.upsert_index_value(text,smallint,smallint,numeric,date,text,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.seed_extended_materials(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.seed_extended_apu(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.seed_apu_mam_rev(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.seed_apu_morteros(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.seed_exc_mam_materials(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.seed_mortero_materials(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_commercial_rules(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_organization(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clone_master_task_to_org(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_monthly_snapshots(uuid,smallint,smallint,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_global_catalog_to_org(uuid,text,text[],text[],text[],text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_index_value(text,smallint,smallint,numeric,date,text,uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_extended_materials(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_extended_apu(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_apu_mam_rev(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_apu_morteros(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_exc_mam_materials(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_mortero_materials(text) FROM authenticated;
COMMIT;