-- Fixture: 80 master_materials reales con conversion_factor > 1 (snapshot de producción, catálogo).
-- Datos de catálogo (nombres, unidades, factores, precios), no personales.
-- Usado por 09_master_materials_tecnico.sql para validar la migración 20261103100100.

BEGIN;

TRUNCATE public.master_materials RESTART IDENTITY CASCADE;
TRUNCATE public.master_task_materials RESTART IDENTITY CASCADE;
TRUNCATE public.master_tasks RESTART IDENTITY CASCADE;

-- Una tarea stub para que master_task_materials.master_task_id tenga a dónde apuntar.
INSERT INTO public.master_tasks (id, name, unit, daily_yield, is_active)
VALUES ('11111111-1111-1111-1111-111111111111', 'Tarea stub', 'UN', 1, true);

-- ── master_materials (80 filas reales, catálogo multi-org) ─────────────────
INSERT INTO public.master_materials (id, organization_id, code, name, unit, commercial_unit, conversion_factor, unit_price, category, is_active) VALUES
-- org 3e5c473d (real)
('bef649cd-366d-42db-96ea-59e74759c6e2', '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f', NULL, 'Adhesivo para cerámicos',    'kg',   'bolsa 25 kg',         25,    320.0000, 'Aglomerantes', true),
('350a2932-c5b1-4553-9b8b-805d67c45006', '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f', NULL, 'Cal aérea en polvo',         'kg',   'bolsa 20 kg',         20,     85.0000, 'Aglomerantes', true),
('ca9daf24-0127-4f2c-bc72-1d19e49bb653', '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f', NULL, 'Cal hidratada',              'kg',   'bolsa 25 kg',         25,     95.0000, 'Aglomerantes', true),
('74e8a96e-d412-4c1f-b11f-57a55807f4b2', '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f', NULL, 'Cal hidráulica',             'kg',   'bolsa 25 kg',         25,     95.0000, 'Aglomerantes', true),
('493dd579-c38b-45ef-a104-6065b3ed93d1', '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f', NULL, 'Cemento Portland CPN 40',    'kg',   'bolsa 50 kg',         50,    180.0000, 'Aglomerantes', true),
('f709ae24-6401-47ec-9dd7-51b8c29c49f1', '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f', NULL, 'Yeso de construcción',       'kg',   'bolsa 40 kg',         40,     70.0000, 'Aglomerantes', true),
('0b9406cd-e895-48d3-88c8-5552da3c4303', '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f', NULL, 'Grout de nivelación',        'kg',   'bolsa 25 kg',         25,    280.0000, 'Áridos',        true),
('4c766817-880c-4ad1-8a42-9a025912f6bc', '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f', NULL, 'Cemento Loma Negra',         'Kg',   'bolsa 50 kg',         50,  13500.0000, 'Cemento',       true),
('47007849-ac1b-43f8-8c61-f237f19e6516', '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f', NULL, 'Hierro nervado Ø10 mm',      'barra','barra ∅10mm · 12m',    7.44, 8500.0000, 'Estructural',   true),
('7fa33df3-1823-4a45-b126-30e20bad516a', '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f', NULL, 'Hierro nervado Ø12 mm',      'barra','barra ∅12mm · 12m',   10.68,10253.0000, 'Estructural',   true),
('814e64a6-67fe-4074-ae35-e32d39925a3d', '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f', NULL, 'Hierro nervado Ø6 mm',       'barra','barra ∅6mm · 12m',     2.64, 2429.0000, 'Estructural',   true),
('998cd42b-0929-409b-a8ab-536ef8d07504', '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f', NULL, 'Hierro nervado Ø8 mm',       'barra','barra ∅8mm · 12m',     4.80, 4488.0000, 'Estructural',   true),
('46ea21b5-bd01-41a9-b25c-f8b4124df5e8', '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f', NULL, 'Hidrófugo líquido integral', 'lt',   'bidón 5 lt',            5,   1800.0000, 'Impermeab.',    true),
('3bf19b8f-e059-43c8-9030-a611509cfc68', '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f', NULL, 'Ladrillo común 6x12x24',     'un',   'millar',            1000,    200.0000, 'Mampostería',   true),
('048622cb-f267-428c-8e3f-dde1edf03db2', '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f', NULL, 'Ladrillo hueco 12x18x33',    'u',    'millar',            1000,    180.0000, 'Mampostería',   true),
('95874228-c3f9-4a51-a391-c82c8f10e396', '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f', NULL, 'Ladrillo hueco 18x18x33',    'un',   'millar',            1000,    260.0000, 'Mampostería',   true),
('05fbcaf2-381b-48f5-bb42-e1c85245d9e2', '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f', NULL, 'Ladrillo hueco 8x18x33',     'un',   'millar',            1000,    120.0000, 'Mampostería',   true),
('c3b568aa-e486-49f7-95c9-4152cbfa1b53', '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f', NULL, 'Enduido plástico',           'kg',   'balde 30 kg',         30,    380.0000, 'Pinturas',      true),
('d1dfd7e5-3630-49c6-ac03-f2b5f4ef941d', '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f', NULL, 'Fijador de paredes',         'lt',   'balde 20 lt',         20,    780.0000, 'Pinturas',      true),
('6a89ac1e-58e0-4500-b565-c2f87c97c2a9', '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f', NULL, 'Pintura látex exterior',     'lt',   'balde 20 lt',         20,   1650.0000, 'Pinturas',      true),
('51f95a6c-e68d-4d1b-bc67-2f3b7489741d', '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f', 'PINTURAS-001', 'Pintura látex interior blanco', 'lt','balde 20 lt', 20, 2850.0000, 'Pinturas', true),
('9b2701e2-82bf-4529-89c9-f2ddcbadfdc4', '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f', NULL, 'Caño PVC 110 mm',            'm',    'caño 3 m',             3,   1250.0000, 'Sanitaria',     true),
('b85b8734-8916-47f1-a766-633848ae4183', '3e5c473d-c7fd-43ea-9cc4-00d2ec73ea8f', NULL, 'Caño PVC 63 mm',             'm',    'caño 3 m',             3,    680.0000, 'Sanitaria',     true),
-- org_a (seed)
('f1e179ed-94d6-4033-8619-3219db01d5e9', 'org_a', NULL, 'Adhesivo para cerámicos',    'kg',   'bolsa 25 kg',         25,    320.0000, 'Aglomerantes', true),
('60ec6f82-9c2c-4858-a614-d7817b7bfc22', 'org_a', NULL, 'Cal aérea en polvo',         'kg',   'bolsa 20 kg',         20,     85.0000, 'Aglomerantes', true),
('fa951b00-bd03-43d5-8115-a83f4404d521', 'org_a', NULL, 'Cal hidratada',              'kg',   'bolsa 25 kg',         25,     95.0000, 'Aglomerantes', true),
('4d827fa9-faa7-41e6-8393-0641d0f7c123', 'org_a', NULL, 'Cal hidráulica',             'kg',   'bolsa 25 kg',         25,     95.0000, 'Aglomerantes', true),
('16b2bf54-18b3-4cdc-b43f-869ed15ebb23', 'org_a', NULL, 'Cemento Portland CPN 40',    'kg',   'bolsa 50 kg',         50,    180.0000, 'Aglomerantes', true),
('42e4f692-81f5-4260-bc81-ac38bb05a704', 'org_a', NULL, 'Yeso de construcción',       'kg',   'bolsa 40 kg',         40,     70.0000, 'Aglomerantes', true),
('a5afbafe-e1e8-42cb-a1c4-c2e686c65e07', 'org_a', NULL, 'Grout de nivelación',        'kg',   'bolsa 25 kg',         25,    280.0000, 'Áridos',        true),
('464f38f3-b62b-4684-a784-084523ae9bde', 'org_a', 'MAT-0006', 'Cemento Avellaneda',  'Bolsa','bolsa 50 kg',         50,  12000.0000, 'Cemento',       true),
('c63a88ad-29ea-4f37-9a77-6c023ccb54d6', 'org_a', NULL, 'Hidrófugo líquido integral', 'lt',   'bidón 5 lt',            5,   1800.0000, 'Impermeab.',    true),
('16d51c41-dac6-42e2-90e8-54d19cfd6fb3', 'org_a', NULL, 'Ladrillo común 6x12x24',     'un',   'millar',            1000,    200.0000, 'Mampostería',   true),
('88c3f572-8d87-4f7b-af2b-65cf22e22d24', 'org_a', NULL, 'Ladrillo hueco 12x18x33',    'u',    'millar',            1000,    180.0000, 'Mampostería',   true),
('3de71ac7-29af-4541-b5ef-375eca200416', 'org_a', NULL, 'Ladrillo hueco 18x18x33',    'un',   'millar',            1000,    260.0000, 'Mampostería',   true),
('60295e1f-7afa-45a7-b907-79be06b7e4a0', 'org_a', NULL, 'Ladrillo hueco 8x18x33',     'un',   'millar',            1000,    120.0000, 'Mampostería',   true),
('2da35bf3-8103-43e6-933f-33d45de4c506', 'org_a', NULL, 'Enduido plástico',           'kg',   'balde 30 kg',         30,    380.0000, 'Pinturas',      true),
('e395006f-5c36-46a1-8b75-4e1da78ed01b', 'org_a', NULL, 'Fijador de paredes',         'lt',   'balde 20 lt',         20,    780.0000, 'Pinturas',      true),
('e38524d2-ea0b-40b2-80e1-d09a36e91d7c', 'org_a', NULL, 'Pintura látex exterior',     'lt',   'balde 20 lt',         20,   1650.0000, 'Pinturas',      true),
('f9c09159-0320-4ce0-b85d-1916d0a8c13d', 'org_a', NULL, 'Pintura látex interior blanco','lt', 'balde 20 lt',         20,   1450.0000, 'Pinturas',      true),
('24f62749-f1d9-4a93-bacf-7d73088d15d3', 'org_a', NULL, 'Caño PVC 110 mm',            'm',    'caño 3 m',             3,   1250.0000, 'Sanitaria',     true),
('3349b071-c011-48a9-b101-c1815e4bb4bd', 'org_a', NULL, 'Caño PVC 63 mm',             'm',    'caño 3 m',             3,    680.0000, 'Sanitaria',     true),
-- org_b (seed)
('67aafb9e-d22d-4227-8bf6-b10de98583b1', 'org_b', NULL, 'Adhesivo para cerámicos',    'kg',   'bolsa 25 kg',         25,    320.0000, 'Aglomerantes', true),
('4dca71f0-9e27-45fc-a914-556930d764d2', 'org_b', NULL, 'Cal aérea en polvo',         'kg',   'bolsa 20 kg',         20,     85.0000, 'Aglomerantes', true),
('3625ed3a-9729-4b78-a7e8-1ab631c00914', 'org_b', NULL, 'Cal hidratada',              'kg',   'bolsa 25 kg',         25,     95.0000, 'Aglomerantes', true),
('40dc99d7-7110-46e8-b947-6c8d3abe9ec7', 'org_b', NULL, 'Cal hidráulica',             'kg',   'bolsa 25 kg',         25,     95.0000, 'Aglomerantes', true),
('00cf9e8a-50ea-4dc2-91f5-a4b76e2d6f05', 'org_b', NULL, 'Cemento Portland CPN 40',    'kg',   'bolsa 50 kg',         50,    180.0000, 'Aglomerantes', true),
('b22d7e25-e9a6-43e5-bf69-143a95a9855f', 'org_b', NULL, 'Yeso de construcción',       'kg',   'bolsa 40 kg',         40,     70.0000, 'Aglomerantes', true),
('c898dfdc-740c-4594-92cc-815c8d3f5b96', 'org_b', NULL, 'Grout de nivelación',        'kg',   'bolsa 25 kg',         25,    280.0000, 'Áridos',        true),
('34144bff-0504-403f-842d-520f6edd3665', 'org_b', NULL, 'Cemento Holcim x50Kg',       'kg',   'bolsa 50 kg',         50,  13607.3700, 'Cemento',       true),
('04a7256d-07d9-4343-8011-c8764fda5d9a', 'org_b', 'MAT-0001', 'Cemento Loma Negra x50Kg','Kg','bolsa 50 kg',         50,  14743.8800, 'Cemento',       true),
('9a4c8575-78d1-4949-850a-98195a6a1163', 'org_b', NULL, 'Hidrófugo líquido integral', 'lt',   'bidón 5 lt',            5,   1800.0000, 'Impermeab.',    true),
('eb6f3161-0687-4f85-8950-b78f143bcfb0', 'org_b', NULL, 'Ladrillo común 6x12x24',     'un',   'millar',            1000,    200.0000, 'Mampostería',   true),
('049a8fc0-f8eb-4040-a5b9-3b1eea455b14', 'org_b', NULL, 'Ladrillo hueco 12x18x33',    'u',    'millar',            1000,    180.0000, 'Mampostería',   true),
('b1fdc7f0-ad5d-4fd2-86d9-6b04319be21d', 'org_b', NULL, 'Ladrillo hueco 18x18x33',    'un',   'millar',            1000,    260.0000, 'Mampostería',   true),
('a9683c73-2874-47de-849a-7604644046e5', 'org_b', NULL, 'Ladrillo hueco 8x18x33',     'un',   'millar',            1000,    120.0000, 'Mampostería',   true),
('46c8db53-1055-4112-a97f-adace99879d7', 'org_b', NULL, 'Enduido plástico',           'kg',   'balde 30 kg',         30,    380.0000, 'Pinturas',      true),
('0e46ae5a-73b6-483d-be57-7f9be84d8b45', 'org_b', NULL, 'Fijador de paredes',         'lt',   'balde 20 lt',         20,    780.0000, 'Pinturas',      true),
('5631d171-c7e5-4c0e-ad03-720d44255ebc', 'org_b', NULL, 'Pintura látex exterior',     'lt',   'balde 20 lt',         20,   1650.0000, 'Pinturas',      true),
('b6576f97-df2c-4670-96c0-e06e85b5c532', 'org_b', NULL, 'Pintura látex interior blanco','lt', 'balde 20 lt',         20,   1450.0000, 'Pinturas',      true),
('76597cdf-7d3a-4b9c-b7f4-329eb41d5731', 'org_b', NULL, 'Caño PVC 110 mm',            'm',    'caño 3 m',             3,   1250.0000, 'Sanitaria',     true),
('bd59c04e-07f2-42a8-9f87-17fb946390f9', 'org_b', NULL, 'Caño PVC 63 mm',             'm',    'caño 3 m',             3,    680.0000, 'Sanitaria',     true),
-- org_demo (seed)
('c26abc07-6c74-4bee-baf5-57bba5149f6a', 'org_demo', NULL, 'Adhesivo para cerámicos', 'kg',   'bolsa 25 kg',         25,    320.0000, 'Aglomerantes', true),
('5af6273f-3979-4923-bdac-f97c273cb939', 'org_demo', NULL, 'Cal aérea en polvo',      'kg',   'bolsa 20 kg',         20,     85.0000, 'Aglomerantes', true),
('df17f94e-3633-4b30-ab85-76749d128e04', 'org_demo', NULL, 'Cal hidratada',           'kg',   'bolsa 25 kg',         25,     95.0000, 'Aglomerantes', true),
('33ead104-f095-4a73-ba84-154d6e76d555', 'org_demo', NULL, 'Cemento Portland CPN 40', 'kg',   'bolsa 50 kg',         50,    180.0000, 'Aglomerantes', true),
('954c00a5-6191-4270-a03f-0a0bc1aae519', 'org_demo', NULL, 'Yeso de construcción',    'kg',   'bolsa 40 kg',         40,     70.0000, 'Aglomerantes', true),
('59618e06-c441-4156-b4b7-d4d932baeb50', 'org_demo', 'MAT_CAL', 'Cal hidráulica',     'KG',   'bolsa 25 kg',         25,     95.0000, 'AGLOMERANTES',  true),
('81b2191d-275f-43e0-80ed-608744322162', 'org_demo', 'MAT_CEM', 'Cemento Portland',   'KG',   'bolsa 50 kg',         50,  15500.0000, 'AGLOMERANTES',  true),
('22d7705c-c1e0-4230-9cbc-0ba2448b2948', 'org_demo', NULL, 'Grout de nivelación',     'kg',   'bolsa 25 kg',         25,    280.0000, 'Áridos',        true),
('cf615d88-9b68-4b05-bbc0-b2fcc0514609', 'org_demo', NULL, 'Hidrófugo líquido integral','lt', 'bidón 5 lt',            5,   1800.0000, 'Impermeab.',    true),
('cdc009a7-1124-4089-8c74-8f7c354adb29', 'org_demo', NULL, 'Ladrillo común 6x12x24',  'un',   'millar',            1000,    200.0000, 'Mampostería',   true),
('40ffb369-7708-4a86-af93-fcb99045b022', 'org_demo', NULL, 'Ladrillo hueco 12x18x33', 'u',    'millar',            1000,    180.0000, 'Mampostería',   true),
('887635af-aaaf-41b8-8067-21341476a1b1', 'org_demo', NULL, 'Ladrillo hueco 18x18x33', 'un',   'millar',            1000,    260.0000, 'Mampostería',   true),
('6906f2da-dd0d-4b10-a4fa-5223d960a663', 'org_demo', NULL, 'Enduido plástico',        'kg',   'balde 30 kg',         30,    380.0000, 'Pinturas',      true),
('31deadac-15e7-460f-b1d7-cdfc447a4d62', 'org_demo', NULL, 'Fijador de paredes',      'lt',   'balde 20 lt',         20,    780.0000, 'Pinturas',      true),
('dac7ba02-fde7-47ab-a601-3d8627522361', 'org_demo', NULL, 'Pintura látex exterior',  'lt',   'balde 20 lt',         20,   1650.0000, 'Pinturas',      true),
('022e6aa4-52d2-4a52-ae9b-ec57a3fb6c44', 'org_demo', NULL, 'Pintura látex interior blanco','lt','balde 20 lt',       20,   1450.0000, 'Pinturas',      true),
('29640e03-6faf-461d-8f86-07e67f8179de', 'org_demo', NULL, 'Caño PVC 110 mm',         'm',    'caño 3 m',             3,   1250.0000, 'Sanitaria',     true),
('93062224-4701-45e3-83bd-9d79263ad980', 'org_demo', NULL, 'Caño PVC 63 mm',          'm',    'caño 3 m',             3,    680.0000, 'Sanitaria',     true);

-- ── master_task_materials: muestra de los que apuntan a materiales con factor ──
-- Incluye específicamente al componente de pintura látex con lkup=72.50 (valor manual) para
-- validar que la migración NO lo toca.
INSERT INTO public.master_task_materials (id, master_task_id, master_material_id, material_name, unit, quantity, last_known_unit_price) VALUES
  -- cemento Loma Negra (3e5c): último conocido ya técnico (270)
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000001', '11111111-1111-1111-1111-111111111111', '4c766817-880c-4ad1-8a42-9a025912f6bc', 'Cemento Loma Negra', 'kg', 50, 270.0000),
  -- cemento Portland org_demo: último conocido en comercial (15500) — debería pasar a 310
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000002', '11111111-1111-1111-1111-111111111111', '81b2191d-275f-43e0-80ed-608744322162', 'Cemento Portland', 'kg', 10, 15500.0000),
  -- hierro Ø12 (3e5c): último conocido técnico (960.02)
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000003', '11111111-1111-1111-1111-111111111111', '7fa33df3-1823-4a45-b126-30e20bad516a', 'Hierro nervado Ø12 mm', 'kg', 95, 960.0187),
  -- Pintura látex interior blanco (3e5c, UUID 51f95a6c): componente con lkup=72.50 (manual, NO tocar)
  ('6bdf5331-060a-4424-bd9c-c50be7f82b7c', '11111111-1111-1111-1111-111111111111', '51f95a6c-e68d-4d1b-bc67-2f3b7489741d', 'Pintura látex interior blanco', 'lt', 1, 72.5000),
  -- Cal hidráulica (3e5c, factor 25, vacío) — debería pasar a 3.80
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000005', '11111111-1111-1111-1111-111111111111', '74e8a96e-d412-4c1f-b11f-57a55807f4b2', 'Cal hidráulica', 'kg', 1, 0.0000);

COMMIT;
