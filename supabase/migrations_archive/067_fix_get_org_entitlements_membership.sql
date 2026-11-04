-- get_org_entitlements: SECURITY DEFINER sin chequeo de membresía permitía
-- leer el plan de cualquier organización. Mismo contrato (jsonb o NULL);
-- para un no miembro devuelve NULL, que el cliente ya trata como {}.
CREATE OR REPLACE FUNCTION public.get_org_entitlements(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

REVOKE EXECUTE ON FUNCTION public.get_org_entitlements(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_org_entitlements(uuid) TO authenticated;
