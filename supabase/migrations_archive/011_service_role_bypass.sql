-- =============================================================================
-- Migration 011: Service Role Bypass para RPCs operativas
-- =============================================================================
-- Permite que scripts de automatización (seeds, generación de snapshots)
-- llamen RPCs SECURITY DEFINER usando la service_role key sin fallar en
-- los guards de membresía.
--
-- PATRÓN: auth.uid() IS NULL = llamada desde service_role.
-- Este patrón ya está en upsert_index_value (FIX 5, migration 009).
-- Se extiende a generate_monthly_snapshots.
-- =============================================================================

BEGIN;

-- Parchea generate_monthly_snapshots para permitir service_role bypass.
-- Solo cambia el guard de autorización — resto de la lógica idéntico a 009.
CREATE OR REPLACE FUNCTION public.generate_monthly_snapshots(
  p_tenant_id uuid,
  p_year      smallint,
  p_month     smallint,
  p_overwrite boolean DEFAULT false
)
RETURNS TABLE (
  resource_id   uuid,
  resource_code text,
  rule_type     public.pricing_rule_type,
  cost          numeric,
  status        text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_base_hourly      numeric;
  v_hours            numeric;
  v_multiplier       numeric;
  v_lf_index_id      uuid;
  v_lf_base_yr       smallint;
  v_lf_base_mo       smallint;
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
  -- ── Autorización ───────────────────────────────────────────────────────────
  -- auth.uid() IS NULL = service_role (bypass permitido para automatización)
  -- auth.uid() IS NOT NULL = usuario autenticado (requiere membresía editor+)
  IF auth.uid() IS NOT NULL
     AND NOT is_org_member_with_role(p_tenant_id, ARRAY['owner','admin','editor'])
  THEN
    RAISE EXCEPTION 'UNAUTHORIZED: tenant %', p_tenant_id;
  END IF;

  v_eff_date := make_date(p_year::int, p_month::int, 1);

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

    IF v_rule.rule_type = 'FIXED_MANUAL' THEN
      v_cost   := v_rule.base_cost;
      v_src    := 'MANUAL';
      v_status := 'created';

    ELSIF v_rule.rule_type = 'DIRECT_IMPORT' THEN
      resource_id := v_rule.resource_id; resource_code := v_rule.res_code;
      rule_type := v_rule.rule_type; cost := NULL;
      status := 'skipped: requiere importación directa'; RETURN NEXT; CONTINUE;

    ELSIF v_rule.rule_type = 'INDEX_MULTIPLIER' THEN
      SELECT value INTO v_base_idx_val FROM public.cost_index_values
      WHERE index_id = v_rule.index_id
        AND period_year  = EXTRACT(YEAR  FROM v_rule.base_date)::smallint
        AND period_month = EXTRACT(MONTH FROM v_rule.base_date)::smallint;
      SELECT value INTO v_curr_idx_val FROM public.cost_index_values
      WHERE index_id = v_rule.index_id AND period_year = p_year AND period_month = p_month;
      IF v_base_idx_val IS NULL OR v_curr_idx_val IS NULL OR v_base_idx_val = 0 THEN
        resource_id := v_rule.resource_id; resource_code := v_rule.res_code;
        rule_type := v_rule.rule_type; cost := NULL;
        status := 'error: índice sin valor para el período'; RETURN NEXT; CONTINUE;
      END IF;
      v_factor := v_curr_idx_val / v_base_idx_val;
      v_cost   := ROUND(v_rule.base_cost * v_factor, 4);
      v_src    := 'INDEX_CALCULATION';
      v_status := 'created';

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

    ELSIF v_rule.rule_type = 'COMPOSITE_INDEX' THEN
      v_comps := v_rule.formula_config -> 'components';
      v_weighted_sum := 0;
      FOR v_i IN 0 .. jsonb_array_length(v_comps) - 1 LOOP
        v_comp_row      := v_comps -> v_i;
        v_comp_index_id := (v_comp_row ->>'index_id')::uuid;
        v_comp_weight   := (v_comp_row ->>'weight')::numeric;
        v_comp_base_yr  := (v_comp_row -> 'base_period' ->>'year')::smallint;
        v_comp_base_mo  := (v_comp_row -> 'base_period' ->>'month')::smallint;
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

    IF v_cost IS NOT NULL THEN
      IF p_overwrite THEN
        INSERT INTO public.resource_cost_snapshots (
          tenant_id, resource_id, effective_date, cost, currency,
          source_type, pricing_rule_id, index_id,
          index_base_value, index_current_value, adjustment_factor, metadata
        ) VALUES (
          p_tenant_id, v_rule.resource_id, v_eff_date, v_cost, 'ARS', v_src, v_rule.id,
          CASE WHEN v_rule.rule_type = 'INDEX_MULTIPLIER' THEN v_rule.index_id ELSE NULL END,
          CASE WHEN v_rule.rule_type = 'INDEX_MULTIPLIER' THEN v_base_idx_val  ELSE NULL END,
          CASE WHEN v_rule.rule_type = 'INDEX_MULTIPLIER' THEN v_curr_idx_val  ELSE NULL END,
          CASE WHEN v_rule.rule_type = 'INDEX_MULTIPLIER' THEN v_factor        ELSE NULL END,
          jsonb_build_object('generated_by','generate_monthly_snapshots',
            'rule_name', v_rule.rule_name, 'rule_type', v_rule.rule_type::text)
        )
        ON CONFLICT (tenant_id, resource_id, effective_date, source_type)
        DO UPDATE SET
          cost = EXCLUDED.cost, pricing_rule_id = EXCLUDED.pricing_rule_id,
          index_id = EXCLUDED.index_id, index_base_value = EXCLUDED.index_base_value,
          index_current_value = EXCLUDED.index_current_value,
          adjustment_factor = EXCLUDED.adjustment_factor, metadata = EXCLUDED.metadata;
      ELSE
        INSERT INTO public.resource_cost_snapshots (
          tenant_id, resource_id, effective_date, cost, currency,
          source_type, pricing_rule_id, index_id,
          index_base_value, index_current_value, adjustment_factor, metadata
        ) VALUES (
          p_tenant_id, v_rule.resource_id, v_eff_date, v_cost, 'ARS', v_src, v_rule.id,
          CASE WHEN v_rule.rule_type = 'INDEX_MULTIPLIER' THEN v_rule.index_id ELSE NULL END,
          CASE WHEN v_rule.rule_type = 'INDEX_MULTIPLIER' THEN v_base_idx_val  ELSE NULL END,
          CASE WHEN v_rule.rule_type = 'INDEX_MULTIPLIER' THEN v_curr_idx_val  ELSE NULL END,
          CASE WHEN v_rule.rule_type = 'INDEX_MULTIPLIER' THEN v_factor        ELSE NULL END,
          jsonb_build_object('generated_by','generate_monthly_snapshots',
            'rule_name', v_rule.rule_name, 'rule_type', v_rule.rule_type::text)
        )
        ON CONFLICT (tenant_id, resource_id, effective_date, source_type)
        DO NOTHING;
      END IF;
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

COMMIT;
