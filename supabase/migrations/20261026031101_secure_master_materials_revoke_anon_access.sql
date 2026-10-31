BEGIN;
DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE oid='public.master_materials'::regclass AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Aborted: RLS is not enabled on master_materials';
  END IF;
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname='public' AND tablename='master_materials'
      AND policyname IN ('master_materials_select','master_materials_select_global',
                         'master_materials_insert','master_materials_update',
                         'master_materials_delete',
                         'master_materials_insert_global_admin',
                         'master_materials_update_global_admin')) <> 7
  THEN RAISE EXCEPTION 'Aborted: expected authenticated policies are missing'; END IF;
END;
$guard$;
DROP POLICY IF EXISTS "allow_all_anon" ON public.master_materials;
REVOKE ALL PRIVILEGES ON TABLE public.master_materials FROM anon;
COMMIT;