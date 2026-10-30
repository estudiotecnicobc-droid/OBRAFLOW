-- Read-only export. Run only in the confirmed environment with a role that
-- can see the global catalog; save the single JSON value as an export file.
SELECT jsonb_build_object(
  'export_version', 1,
  'scope', 'GLOBAL',
  'exported_at', now(),
  'tasks', COALESCE((
    SELECT jsonb_agg(to_jsonb(t) ORDER BY t.code, t.id)
    FROM (SELECT id, organization_id, code, name, unit, daily_yield, is_active
          FROM public.master_tasks WHERE organization_id IS NULL) t
  ), '[]'::jsonb),
  'resources', COALESCE((
    SELECT jsonb_agg(to_jsonb(r) ORDER BY r.code, r.id)
    FROM (SELECT id, organization_id, code, name, unit, type, base_cost,
                 social_charges_pct, is_active
          FROM public.resources WHERE organization_id IS NULL) r
  ), '[]'::jsonb),
  'master_materials', COALESCE((
    SELECT jsonb_agg(to_jsonb(m) ORDER BY m.code, m.id)
    FROM (SELECT id, organization_id, code, name, unit, unit_price, currency,
                 global_resource_id, is_active
          FROM public.master_materials WHERE organization_id IS NULL) m
  ), '[]'::jsonb)
) AS catalog_export;
