-- =============================================================================
-- 008b — Cost Versioning: RLS (Row Level Security)
-- =============================================================================
-- QUÉ HACE: activa RLS y crea todas las políticas para las 4 tablas de cost versioning.
-- PREREQUISITOS: 008a ejecutado (tablas deben existir).
-- IDEMPOTENTE: sí (DROP POLICY IF EXISTS antes de cada CREATE POLICY).
-- VERIFICAR DESPUÉS:
--   SELECT tablename, policyname
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename IN ('cost_indices','cost_index_values',
--                       'resource_pricing_rules','resource_cost_snapshots')
--   ORDER BY tablename, policyname;
--   -- Debe devolver 14 filas (5 + 4 + 4 + 3).
-- =============================================================================

BEGIN;

-- =============================================================================
-- cost_indices — 5 políticas
-- Globales (tenant_id IS NULL): solo service_role puede escribir.
-- Privados (tenant_id NOT NULL): miembros de la org según rol.
-- =============================================================================

ALTER TABLE public.cost_indices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cost_indices_select_global"  ON public.cost_indices;
DROP POLICY IF EXISTS "cost_indices_select_private" ON public.cost_indices;
DROP POLICY IF EXISTS "cost_indices_insert"          ON public.cost_indices;
DROP POLICY IF EXISTS "cost_indices_update"          ON public.cost_indices;
DROP POLICY IF EXISTS "cost_indices_delete"          ON public.cost_indices;

CREATE POLICY "cost_indices_select_global" ON public.cost_indices
  FOR SELECT TO authenticated
  USING (tenant_id IS NULL);

CREATE POLICY "cost_indices_select_private" ON public.cost_indices
  FOR SELECT TO authenticated
  USING (tenant_id IS NOT NULL AND is_org_member(tenant_id));

CREATE POLICY "cost_indices_insert" ON public.cost_indices
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id IS NOT NULL
    AND is_org_member_with_role(tenant_id, ARRAY['owner','admin','editor'])
  );

CREATE POLICY "cost_indices_update" ON public.cost_indices
  FOR UPDATE TO authenticated
  USING  (tenant_id IS NOT NULL AND is_org_member_with_role(tenant_id, ARRAY['owner','admin']))
  WITH CHECK (tenant_id IS NOT NULL AND is_org_member_with_role(tenant_id, ARRAY['owner','admin']));

CREATE POLICY "cost_indices_delete" ON public.cost_indices
  FOR DELETE TO authenticated
  USING (tenant_id IS NOT NULL AND is_org_member_with_role(tenant_id, ARRAY['owner','admin']));

-- =============================================================================
-- cost_index_values — 4 políticas
-- Lectura: si el índice padre es global o del tenant del usuario.
-- Escritura: solo en índices privados del tenant (globales = service_role).
-- =============================================================================

ALTER TABLE public.cost_index_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cost_index_values_select" ON public.cost_index_values;
DROP POLICY IF EXISTS "cost_index_values_insert" ON public.cost_index_values;
DROP POLICY IF EXISTS "cost_index_values_update" ON public.cost_index_values;
DROP POLICY IF EXISTS "cost_index_values_delete" ON public.cost_index_values;

CREATE POLICY "cost_index_values_select" ON public.cost_index_values
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cost_indices ci
      WHERE ci.id = index_id
        AND (ci.tenant_id IS NULL OR is_org_member(ci.tenant_id))
    )
  );

CREATE POLICY "cost_index_values_insert" ON public.cost_index_values
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cost_indices ci
      WHERE ci.id = index_id
        AND ci.tenant_id IS NOT NULL
        AND is_org_member_with_role(ci.tenant_id, ARRAY['owner','admin','editor'])
    )
  );

CREATE POLICY "cost_index_values_update" ON public.cost_index_values
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cost_indices ci
      WHERE ci.id = index_id
        AND ci.tenant_id IS NOT NULL
        AND is_org_member_with_role(ci.tenant_id, ARRAY['owner','admin'])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cost_indices ci
      WHERE ci.id = index_id
        AND ci.tenant_id IS NOT NULL
        AND is_org_member_with_role(ci.tenant_id, ARRAY['owner','admin'])
    )
  );

CREATE POLICY "cost_index_values_delete" ON public.cost_index_values
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cost_indices ci
      WHERE ci.id = index_id
        AND ci.tenant_id IS NOT NULL
        AND is_org_member_with_role(ci.tenant_id, ARRAY['owner','admin'])
    )
  );

-- =============================================================================
-- resource_pricing_rules — 4 políticas
-- =============================================================================

ALTER TABLE public.resource_pricing_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "resource_pricing_rules_select" ON public.resource_pricing_rules;
DROP POLICY IF EXISTS "resource_pricing_rules_insert" ON public.resource_pricing_rules;
DROP POLICY IF EXISTS "resource_pricing_rules_update" ON public.resource_pricing_rules;
DROP POLICY IF EXISTS "resource_pricing_rules_delete" ON public.resource_pricing_rules;

CREATE POLICY "resource_pricing_rules_select" ON public.resource_pricing_rules
  FOR SELECT TO authenticated
  USING (is_org_member(tenant_id));

CREATE POLICY "resource_pricing_rules_insert" ON public.resource_pricing_rules
  FOR INSERT TO authenticated
  WITH CHECK (is_org_member_with_role(tenant_id, ARRAY['owner','admin','editor']));

CREATE POLICY "resource_pricing_rules_update" ON public.resource_pricing_rules
  FOR UPDATE TO authenticated
  USING  (is_org_member_with_role(tenant_id, ARRAY['owner','admin','editor']))
  WITH CHECK (is_org_member_with_role(tenant_id, ARRAY['owner','admin','editor']));

CREATE POLICY "resource_pricing_rules_delete" ON public.resource_pricing_rules
  FOR DELETE TO authenticated
  USING (is_org_member_with_role(tenant_id, ARRAY['owner','admin']));

-- =============================================================================
-- resource_cost_snapshots — 3 políticas (sin UPDATE: snapshots son inmutables)
-- =============================================================================

ALTER TABLE public.resource_cost_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "resource_cost_snapshots_select" ON public.resource_cost_snapshots;
DROP POLICY IF EXISTS "resource_cost_snapshots_insert" ON public.resource_cost_snapshots;
DROP POLICY IF EXISTS "resource_cost_snapshots_delete" ON public.resource_cost_snapshots;

CREATE POLICY "resource_cost_snapshots_select" ON public.resource_cost_snapshots
  FOR SELECT TO authenticated
  USING (is_org_member(tenant_id));

CREATE POLICY "resource_cost_snapshots_insert" ON public.resource_cost_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (is_org_member_with_role(tenant_id, ARRAY['owner','admin','editor']));

CREATE POLICY "resource_cost_snapshots_delete" ON public.resource_cost_snapshots
  FOR DELETE TO authenticated
  USING (is_org_member_with_role(tenant_id, ARRAY['owner','admin']));

COMMIT;
