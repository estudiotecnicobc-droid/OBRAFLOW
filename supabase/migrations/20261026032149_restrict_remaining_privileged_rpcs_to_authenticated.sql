BEGIN;
DO $guard$
DECLARE fn record; n integer;
BEGIN
 SELECT count(*) INTO n FROM pg_proc p
 WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
 AND has_function_privilege('anon',p.oid,'EXECUTE');
 IF n <> 20 THEN
   RAISE EXCEPTION 'Expected 20 remaining exposed SECURITY DEFINER functions, found %; review before modifying',n;
 END IF;
 FOR fn IN
   SELECT format('%I.%I(%s)',nsp.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) AS sig,
          p.prorettype::regtype::text AS result_type
   FROM pg_proc p JOIN pg_namespace nsp ON nsp.oid=p.pronamespace
   WHERE nsp.nspname='public' AND p.prosecdef AND has_function_privilege('anon',p.oid,'EXECUTE')
 LOOP
   EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon',fn.sig);
   IF fn.result_type NOT IN ('trigger','event_trigger') THEN
     EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',fn.sig);
   END IF;
 END LOOP;
END
$guard$;
COMMIT;