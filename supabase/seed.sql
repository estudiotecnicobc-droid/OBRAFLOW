-- EXCLUSIVO LOCAL: supabase db reset. Nunca usar para producir datos reales.
-- Usuario se crea con Auth Admin local por scripts/pricing/setup_local_test_user.mjs.
INSERT INTO public.organizations (id,name,slug)
VALUES ('11111111-1111-4111-8111-111111111111','ObraFlow Laboratorio Local','obraflow-test-local')
ON CONFLICT(id) DO NOTHING;

INSERT INTO public.master_materials
(id,organization_id,code,name,unit,unit_price,currency,category,is_active)
VALUES
('22222222-2222-4222-8222-222222222221','11111111-1111-4111-8111-111111111111',
'TEST-CEM-KG','Cemento Portland (test)','kg',300,'ARS','Materiales',true),
('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',
'TEST-LCH-U','Ladrillo cerámico hueco 18x19x33 (test)','u',920,'ARS','Mampostería',true)
ON CONFLICT(id) DO NOTHING;

INSERT INTO public.price_suppliers (id,organization_id,name,external_code,is_active)
VALUES ('33333333-3333-4333-8333-333333333333',
'11111111-1111-4111-8111-111111111111','Loma Negra (SIMULADO)','LOMA-TEST',true)
ON CONFLICT(id) DO NOTHING;
