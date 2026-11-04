-- =============================================================================
-- Migration 020: Material Code Aliases
-- Fecha: 2026-04-14
--
-- Problema: el catálogo Chandías y los APUs usan nombres de materiales que
-- difieren del nombre canónico en la DB:
--   · "Cal hidratada"            ↔  "Cal hidráulica"
--   · "Cemento Portland CPN40"   ↔  "Cemento Portland CPN 40"  (espacio)
--   · "Ladrillo hueco 8×18×33cm" ↔  "Ladrillo hueco 8x18x33"  (× vs x, cm suffix)
--   · etc.
--
-- Estrategia:
--   1. Asignar codes canónicos en master_materials para los materiales clave.
--   2. Crear entradas alias en master_materials cuando el nombre difiere
--      (ej: "Cal hidratada" como alias de "Cal hidráulica").
--   3. Asignar los mismos codes en public.materials por nombre normalizado.
--
-- Función: seed_material_codes(p_org_id text) — idempotente.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.seed_material_codes(
  p_org_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price   numeric;
  v_cat     text;
  v_aliases integer := 0;
  v_codes   integer := 0;
BEGIN

  -- ── 1. Asignar codes canónicos en master_materials ─────────────────────────

  -- Cemento Portland (normaliza también la variante sin espacio)
  UPDATE master_materials
  SET code = 'CEM-PORT',
      name = 'Cemento Portland CPN 40'   -- nombre canónico con espacio
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(REPLACE(TRIM(name), ' ', '')) LIKE 'cementoportlandcpn40%';
  GET DIAGNOSTICS v_codes = ROW_COUNT;

  -- Cal hidráulica / hidratada → mismo code 'CAL-HID'
  UPDATE master_materials
  SET code = 'CAL-HID'
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(TRIM(name)) IN ('cal hidráulica', 'cal hidratada', 'cal hidraulica', 'cal hidratada');
  GET DIAGNOSTICS v_codes = ROW_COUNT;

  -- Cal aérea en polvo / Cal hidratada en polvo
  UPDATE master_materials
  SET code = 'CAL-AER'
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(TRIM(name)) IN ('cal aérea en polvo', 'cal aerea en polvo', 'cal hidratada en polvo');

  -- Ladrillo común
  UPDATE master_materials
  SET code = 'LAD-COM'
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(TRIM(name)) LIKE 'ladrillo com%';

  -- Ladrillo hueco 8x18x33 (acepta variantes con ×, cm, espacios)
  UPDATE master_materials
  SET code = 'LAD-H8'
  WHERE organization_id = p_org_id
    AND is_active = true
    AND regexp_replace(LOWER(TRIM(name)), '[×xX]', 'x', 'g') LIKE 'ladrillo hueco 8x18x33%';

  -- Ladrillo hueco 12x18x33
  UPDATE master_materials
  SET code = 'LAD-H12'
  WHERE organization_id = p_org_id
    AND is_active = true
    AND regexp_replace(LOWER(TRIM(name)), '[×xX]', 'x', 'g') LIKE 'ladrillo hueco 12x18x33%';

  -- Ladrillo hueco/cerámico 18x18x33
  UPDATE master_materials
  SET code = 'LAD-H18'
  WHERE organization_id = p_org_id
    AND is_active = true
    AND regexp_replace(LOWER(TRIM(name)), '[×xX]', 'x', 'g') LIKE '%18x18x33%';

  -- Arena gruesa (normaliza "Arena gruesa" y "Arena gruesa limpia")
  UPDATE master_materials
  SET code = 'ARE-GRU'
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(TRIM(name)) LIKE 'arena gruesa%';

  -- Arena fina (normaliza "Arena fina cernida" y "Arena fina lavada")
  UPDATE master_materials
  SET code = 'ARE-FIN'
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(TRIM(name)) LIKE 'arena fina%';

  -- Piedra partida / triturada 6/20
  UPDATE master_materials
  SET code = 'PIE-GRU'
  WHERE organization_id = p_org_id
    AND is_active = true
    AND LOWER(TRIM(name)) LIKE 'piedra%6/20%';

  -- ── 2. Asignar los mismos codes en public.materials ───────────────────────
  --     (para que el matching por code funcione desde ERPContext)

  UPDATE materials
  SET code = 'CEM-PORT'
  WHERE organization_id = p_org_id
    AND LOWER(REPLACE(TRIM(name), ' ', '')) LIKE 'cementoportlandcpn40%'
    AND (code IS NULL OR code NOT LIKE 'CEM-%');

  UPDATE materials
  SET code = 'CAL-HID'
  WHERE organization_id = p_org_id
    AND LOWER(TRIM(name)) IN ('cal hidráulica', 'cal hidratada', 'cal hidraulica', 'cal hidratada')
    AND (code IS NULL OR code NOT LIKE 'CAL-%');

  UPDATE materials
  SET code = 'LAD-H8'
  WHERE organization_id = p_org_id
    AND regexp_replace(LOWER(TRIM(name)), '[×xX]', 'x', 'g') LIKE 'ladrillo hueco 8x18x33%'
    AND (code IS NULL OR code NOT LIKE 'LAD-%');

  UPDATE materials
  SET code = 'LAD-H12'
  WHERE organization_id = p_org_id
    AND regexp_replace(LOWER(TRIM(name)), '[×xX]', 'x', 'g') LIKE 'ladrillo hueco 12x18x33%'
    AND (code IS NULL OR code NOT LIKE 'LAD-%');

  UPDATE materials
  SET code = 'LAD-H18'
  WHERE organization_id = p_org_id
    AND regexp_replace(LOWER(TRIM(name)), '[×xX]', 'x', 'g') LIKE '%18x18x33%'
    AND (code IS NULL OR code NOT LIKE 'LAD-%');

  UPDATE materials
  SET code = 'ARE-GRU'
  WHERE organization_id = p_org_id
    AND LOWER(TRIM(name)) LIKE 'arena gruesa%'
    AND (code IS NULL OR code NOT LIKE 'ARE-%');

  UPDATE materials
  SET code = 'ARE-FIN'
  WHERE organization_id = p_org_id
    AND LOWER(TRIM(name)) LIKE 'arena fina%'
    AND (code IS NULL OR code NOT LIKE 'ARE-%');

  UPDATE materials
  SET code = 'PIE-GRU'
  WHERE organization_id = p_org_id
    AND LOWER(TRIM(name)) LIKE 'piedra%6/20%'
    AND (code IS NULL OR code NOT LIKE 'PIE-%');

  -- ── 3. Alias "Cal hidratada" en master_materials ──────────────────────────
  --     Inserta la entrada alias SOLO si "Cal hidráulica" existe pero "Cal hidratada" no.
  --     Así el APU que usa "Cal hidratada" la encuentra por nombre.

  SELECT unit_price, category
  INTO v_price, v_cat
  FROM master_materials
  WHERE organization_id = p_org_id
    AND LOWER(TRIM(name)) IN ('cal hidráulica', 'cal hidraulica')
    AND is_active = true
  LIMIT 1;

  IF v_price IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM master_materials
    WHERE organization_id = p_org_id
      AND LOWER(TRIM(name)) = 'cal hidratada'
      AND is_active = true
  ) THEN
    INSERT INTO master_materials (
      id, organization_id, name, unit, unit_price, category, code, is_active
    ) VALUES (
      gen_random_uuid(), p_org_id,
      'Cal hidratada', 'kg', v_price, COALESCE(v_cat, 'Aglomerantes'),
      'CAL-HID', true
    );
    v_aliases := v_aliases + 1;
  END IF;

  RETURN jsonb_build_object(
    'aliases_created', v_aliases,
    'ok', true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_material_codes(text)
  TO authenticated;

COMMENT ON FUNCTION public.seed_material_codes IS
  'Asigna codes canónicos en master_materials y public.materials para materiales clave. '
  'Crea alias "Cal hidratada" si solo existe "Cal hidráulica". '
  'Idempotente: las actualizaciones son seguras de repetir. '
  'Ejecutar: SELECT seed_material_codes(''<UUID-ORG>'');';
