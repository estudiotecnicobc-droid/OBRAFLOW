-- FILE FOR CODE REVIEW. Do not apply to production before staging tests.
-- REVIEW DRAFT ONLY — Fase 2 ObraFlow. NO ejecutar en producción.
-- Basado en el esquema observado el 2026-10-26.
-- No modifica master_materials, resources, resource_cost_snapshots ni presupuestos.

BEGIN;

-- Overrides explícitos del proyecto, append-only y aislados por organización.
-- No es la futura tabla de precios regionales.
CREATE TABLE IF NOT EXISTS public.project_price_overrides (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id),
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    target_kind text NOT NULL CHECK (target_kind IN
        ('COMPONENT', 'MASTER_MATERIAL', 'RESOURCE')),
    target_id uuid NOT NULL,
    price numeric(20,6) NOT NULL CHECK (price > 0),
    unit text NOT NULL CHECK (length(btrim(unit)) > 0),
    currency text NOT NULL CHECK (currency IN ('ARS', 'USD')),
    effective_date date NOT NULL DEFAULT current_date,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL DEFAULT auth.uid()
);
CREATE INDEX IF NOT EXISTS project_price_overrides_lookup_idx
ON public.project_price_overrides (
    organization_id, project_id, target_kind, target_id,
    effective_date DESC, created_at DESC
);
ALTER TABLE public.project_price_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_price_overrides FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.project_price_overrides TO authenticated;

DROP POLICY IF EXISTS project_price_overrides_read ON public.project_price_overrides;
CREATE POLICY project_price_overrides_read
ON public.project_price_overrides FOR SELECT TO authenticated
USING (
    public.is_org_member(organization_id)
    AND EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = project_id AND p.organization_id = organization_id
    )
);

DROP POLICY IF EXISTS project_price_overrides_insert ON public.project_price_overrides;
CREATE POLICY project_price_overrides_insert
ON public.project_price_overrides FOR INSERT TO authenticated
WITH CHECK (
    created_by = (SELECT auth.uid())
    AND public.is_org_member_with_role(
        organization_id, ARRAY['owner','admin','editor']::text[]
    )
    AND EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = project_id AND p.organization_id = organization_id
    )
    AND (
        (target_kind = 'MASTER_MATERIAL' AND EXISTS (
            SELECT 1 FROM public.master_materials m
            WHERE m.id = target_id AND m.is_active
              AND (m.organization_id = organization_id::text
                   OR m.organization_id IS NULL)
        ))
        OR (target_kind = 'RESOURCE' AND EXISTS (
            SELECT 1 FROM public.resources r
            WHERE r.id = target_id AND r.is_active
              AND (r.organization_id = organization_id
                   OR r.organization_id IS NULL)
        ))
        OR (target_kind = 'COMPONENT' AND EXISTS (
            SELECT 1
            FROM public.master_task_materials c
            JOIN public.master_tasks mt ON mt.id = c.master_task_id
            WHERE c.id = target_id
              AND (mt.organization_id = organization_id
                   OR mt.organization_id IS NULL)
        ))
    )
);
-- No se conceden UPDATE/DELETE: cada corrección se agrega como observación
-- nueva. El resolvedor selecciona la última del mismo día.

DO $create_type$
BEGIN
    CREATE TYPE public.resolved_reference_price AS (
        price numeric,
        unit text,
        currency text,
        source text,
        warnings text[],
        effective_date date,
        reference_id uuid,
        is_usable boolean
    );
EXCEPTION WHEN duplicate_object THEN
    NULL;
END;
$create_type$;

CREATE OR REPLACE FUNCTION public.resolve_reference_price(
    p_organization_id uuid,
    p_master_material_id uuid DEFAULT NULL,
    p_resource_id uuid DEFAULT NULL,
    p_component_id uuid DEFAULT NULL,
    p_project_id uuid DEFAULT NULL,
    p_effective_date date DEFAULT CURRENT_DATE,
    p_mode text DEFAULT 'CURRENT',
    p_required_unit text DEFAULT NULL,
    p_expected_currency text DEFAULT 'ARS'
)
RETURNS public.resolved_reference_price
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
    v_result public.resolved_reference_price;
    v_mat_id uuid := p_master_material_id;
    v_res_id uuid := p_resource_id;
    v_component_mat uuid;
    v_component_res uuid;
    v_sub_task_id uuid;
    v_linked_res uuid;
    v_global_source uuid;
    v_legacy_price numeric;
    v_component_unit text;
    v_material_org text;
    v_resource_org uuid;
    v_project_currency text;
    v_currency text;
    v_required_unit text;
    v_date date := COALESCE(p_effective_date, CURRENT_DATE);
BEGIN
    -- Autorización explícita: no fiarse del ID suministrado por el navegador.
    IF (SELECT auth.uid()) IS NULL
       OR NOT public.is_org_member(p_organization_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: organization not accessible'
            USING ERRCODE = '42501';
    END IF;

    IF p_mode NOT IN ('CURRENT', 'AS_OF', 'FROZEN') OR p_mode IS NULL THEN
        RAISE EXCEPTION 'Invalid pricing mode' USING ERRCODE = '22023';
    END IF;
    IF p_mode = 'FROZEN' THEN
        RAISE EXCEPTION
            'FROZEN requires a persisted budget-version price snapshot'
            USING ERRCODE = '0A000';
    END IF;
    IF p_mode = 'CURRENT' AND v_date <> CURRENT_DATE THEN
        RAISE EXCEPTION
            'Use AS_OF for dates other than today'
            USING ERRCODE = '22023';
    END IF;

    IF p_project_id IS NOT NULL THEN
        SELECT p.currency INTO v_project_currency
        FROM public.projects p
        WHERE p.id = p_project_id
          AND p.organization_id = p_organization_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'FORBIDDEN: project not accessible'
                USING ERRCODE = '42501';
        END IF;
    END IF;
    v_currency := upper(btrim(COALESCE(
        NULLIF(v_project_currency, ''),
        NULLIF(p_expected_currency, ''), 'ARS'
    )));

    IF p_component_id IS NOT NULL THEN
        SELECT c.master_material_id, c.resource_id, c.last_known_unit_price,
               c.unit, c.sub_master_task_id
          INTO v_component_mat, v_component_res, v_legacy_price,
               v_component_unit, v_sub_task_id
        FROM public.master_task_materials c
        JOIN public.master_tasks mt ON mt.id = c.master_task_id
        WHERE c.id = p_component_id
          AND (mt.organization_id = p_organization_id
               OR mt.organization_id IS NULL);
        IF NOT FOUND THEN
            RAISE EXCEPTION 'FORBIDDEN: APU component not accessible'
                USING ERRCODE = '42501';
        END IF;
        IF v_sub_task_id IS NOT NULL THEN
            RAISE EXCEPTION 'Nested APU must be calculated recursively'
                USING ERRCODE = '22023';
        END IF;
        IF p_master_material_id IS NOT NULL
           AND v_component_mat IS DISTINCT FROM p_master_material_id THEN
            RAISE EXCEPTION 'Material/component ID mismatch'
                USING ERRCODE = '22023';
        END IF;
        IF p_resource_id IS NOT NULL
           AND v_component_res IS DISTINCT FROM p_resource_id THEN
            RAISE EXCEPTION 'Resource/component ID mismatch'
                USING ERRCODE = '22023';
        END IF;
        v_mat_id := COALESCE(v_mat_id, v_component_mat);
        v_res_id := COALESCE(v_res_id, v_component_res);
    END IF;
    v_required_unit := NULLIF(btrim(
        COALESCE(p_required_unit, v_component_unit, '')
    ), '');

    IF v_mat_id IS NOT NULL THEN
        SELECT m.organization_id, m.global_resource_id, m.global_source_id
          INTO v_material_org, v_linked_res, v_global_source
        FROM public.master_materials m
        WHERE m.id = v_mat_id AND m.is_active;
        IF NOT FOUND
           OR (v_material_org IS NOT NULL
               AND v_material_org <> p_organization_id::text) THEN
            RAISE EXCEPTION 'FORBIDDEN: material not accessible'
                USING ERRCODE = '42501';
        END IF;
        -- Nunca combinar dos IDs cuyo vínculo técnico no esté acreditado.
        IF v_res_id IS NOT NULL
           AND v_linked_res IS DISTINCT FROM v_res_id THEN
            RAISE EXCEPTION 'Material/resource link not verified'
                USING ERRCODE = '22023';
        END IF;
        v_res_id := COALESCE(v_res_id, v_linked_res);
    END IF;

    IF v_res_id IS NOT NULL THEN
        SELECT r.organization_id INTO v_resource_org
        FROM public.resources r
        WHERE r.id = v_res_id AND r.is_active;
        IF NOT FOUND OR (
            v_resource_org IS NOT NULL
            AND v_resource_org <> p_organization_id
        ) THEN
            RAISE EXCEPTION 'FORBIDDEN: resource not accessible'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Una sola consulta PostgreSQL para las seis fuentes de prioridad.
    -- AS_OF excluye valores "actuales" sin historial verificable.
    WITH candidates AS (
        -- 1. Override explícito del proyecto, primero el del componente.
        SELECT o.price, o.unit, o.currency,
               'PROJECT_OVERRIDE'::text AS source,
               o.effective_date, o.id AS reference_id, 1 AS priority
        FROM (
            SELECT x.*
            FROM public.project_price_overrides x
            WHERE p_project_id IS NOT NULL
              AND x.project_id = p_project_id
              AND x.organization_id = p_organization_id
              AND x.effective_date <= v_date
              AND (p_mode = 'CURRENT' OR x.created_at::date <= v_date)
              AND (
                  (x.target_kind='COMPONENT'
                   AND x.target_id = p_component_id)
                  OR (x.target_kind='MASTER_MATERIAL'
                      AND x.target_id = v_mat_id)
                  OR (x.target_kind='RESOURCE'
                      AND x.target_id = v_res_id)
              )
            ORDER BY CASE x.target_kind
                         WHEN 'COMPONENT' THEN 1
                         WHEN 'MASTER_MATERIAL' THEN 2 ELSE 3 END,
                     x.effective_date DESC, x.created_at DESC, x.id DESC
            LIMIT 1
        ) o

        UNION ALL
        -- 2. Material propio, incluyendo copia del global o vínculo al recurso.
        SELECT m.unit_price, m.unit, m.currency,
               'ORG_MASTER'::text, m.last_price_update::date, m.id, 2
        FROM public.master_materials m
        WHERE p_mode = 'CURRENT'
          AND m.is_active AND m.unit_price > 0
          AND m.organization_id = p_organization_id::text
          AND (m.id = v_mat_id
               OR (v_mat_id IS NOT NULL AND m.global_source_id = v_mat_id)
               OR (v_res_id IS NOT NULL AND m.global_resource_id = v_res_id))

        UNION ALL
        -- 3. Material global, solo mediante identidad existente.
        SELECT m.unit_price, m.unit, m.currency,
               'GLOBAL_MASTER'::text, m.last_price_update::date, m.id, 3
        FROM public.master_materials m
        WHERE p_mode = 'CURRENT'
          AND m.is_active AND m.unit_price > 0
          AND m.organization_id IS NULL
          AND (m.id = v_mat_id
               OR (v_global_source IS NOT NULL AND m.id = v_global_source))

        UNION ALL
        -- 4. Snapshot fechado del recurso de esta organización.
        SELECT s.cost, r.unit, btrim(s.currency::text),
               'RESOURCE_SNAPSHOT'::text, s.effective_date, s.id, 4
        FROM public.resources r
        JOIN LATERAL (
            SELECT s.*
            FROM public.resource_cost_snapshots s
            WHERE s.tenant_id = p_organization_id
              AND s.resource_id = r.id
              AND s.effective_date <= v_date
              AND s.cost > 0
            ORDER BY s.effective_date DESC, s.created_at DESC, s.id DESC
            LIMIT 1
        ) s ON true
        WHERE r.id = v_res_id
          AND r.is_active
          AND (r.organization_id = p_organization_id
               OR r.organization_id IS NULL)

        UNION ALL
        -- 5. Costo base legacy sin historial: CURRENT solamente.
        SELECT r.base_cost, r.unit, 'ARS'::text,
               'RESOURCE_BASE'::text, NULL::date, r.id, 5
        FROM public.resources r
        WHERE p_mode = 'CURRENT'
          AND r.id = v_res_id AND r.is_active AND r.base_cost > 0
          AND (r.organization_id = p_organization_id
               OR r.organization_id IS NULL)

        UNION ALL
        -- 6. Último precio guardado en APU: siempre provisional.
        SELECT v_legacy_price, v_component_unit, NULL::text,
               'LEGACY_FALLBACK'::text, NULL::date, p_component_id, 6
        WHERE p_mode = 'CURRENT'
          AND p_component_id IS NOT NULL AND v_legacy_price > 0
    ),
    chosen AS (
        SELECT *
        FROM candidates
        ORDER BY priority ASC, effective_date DESC NULLS LAST,
                 reference_id ASC
        LIMIT 1
    )
    SELECT c.price, c.unit, c.currency,
           COALESCE(c.source, 'NO_PRICE'),
           array_remove(ARRAY[
               CASE WHEN c.price IS NULL THEN
                   CASE WHEN p_mode = 'AS_OF'
                     THEN 'HISTORICAL_PRICE_UNAVAILABLE'
                     ELSE 'PRICE_NOT_FOUND' END
               END,
               CASE WHEN c.source = 'LEGACY_FALLBACK'
                    THEN 'LEGACY_PRICE_UNVERIFIED' END,
               CASE WHEN c.source = 'RESOURCE_BASE'
                    THEN 'BASE_COST_ASSUMED_ARS' END,
               CASE WHEN c.source IN ('ORG_MASTER','GLOBAL_MASTER')
                    THEN 'MASTER_PRICE_NOT_MARKET_VERIFIED' END,
               CASE WHEN c.price IS NOT NULL
                     AND v_required_unit IS NOT NULL
                     AND lower(btrim(c.unit)) <> lower(v_required_unit)
                    THEN 'UNIT_MISMATCH' END,
               CASE WHEN c.price IS NOT NULL
                     AND (c.currency IS NULL
                          OR upper(btrim(c.currency)) <> v_currency)
                    THEN 'CURRENCY_UNKNOWN_OR_MISMATCH' END
           ]::text[], NULL),
           c.effective_date, c.reference_id,
           (c.price > 0
            AND c.source <> 'LEGACY_FALLBACK'
            AND (v_required_unit IS NULL
                 OR lower(btrim(c.unit)) = lower(v_required_unit))
            AND upper(btrim(c.currency)) = v_currency)
      INTO v_result
    FROM (SELECT 1) anchor
    LEFT JOIN chosen c ON true;

    RETURN v_result;
END;
$fn$;

-- No publicar la función para visitantes sin sesión.
REVOKE ALL ON FUNCTION public.resolve_reference_price(
    uuid,uuid,uuid,uuid,uuid,date,text,text,text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_reference_price(
    uuid,uuid,uuid,uuid,uuid,date,text,text,text
) TO authenticated;

COMMIT;
