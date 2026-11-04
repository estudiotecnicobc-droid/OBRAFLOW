-- =============================================================================
-- Migración 063: Pintura ampliada (rubro 34) en la base maestra ObraFlow
--
-- Crea o actualiza en el catálogo general (organization_id IS NULL):
--   · 45 recursos (mano de obra UOCRA y gremios, materiales, equipos y subcontratos)
--   · 57 APU con su composición, rendimiento y rubro oficial
-- Precios de referencia AMBA, octubre 2026, ARS con IVA. La fuente de cada precio
-- queda en resources.pricing_notes; los marcados "Estimado" deben verificarse.
-- Mano de obra UOCRA con 95 % de cargas sociales; gremios por cuenta propia con 0 %.
--
-- Idempotente: se puede ejecutar más de una vez. Recursos por (catálogo, código),
-- APU por código; la composición se reemplaza entera. No toca APU de empresas
-- ni presupuestos existentes.
-- =============================================================================

BEGIN;

INSERT INTO public.catalogs (name, type, organization_id, is_active)
SELECT 'Catálogo ObraFlow', 'global', NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.catalogs WHERE name = 'Catálogo ObraFlow' AND organization_id IS NULL);

CREATE TEMP TABLE _of_res (code text, name text, unit text, type text, cost numeric, social numeric, notes text) ON COMMIT DROP;
INSERT INTO _of_res VALUES
  ('OF-GR-AYU', 'Ayudante de gremio', 'h', 'LABOR', 7500, 0, 'Estimado ObraFlow octubre 2026: valor hora final del gremio calibrado con precios por tarea de appmaestro.com.ar; verificar'),
  ('OF-GR-PIN', 'Pintor', 'h', 'LABOR', 11000, 0, 'Estimado ObraFlow octubre 2026: valor hora final del gremio calibrado con precios por tarea de appmaestro.com.ar; verificar'),
  ('OF-M-ACI', 'Ácido muriático', 'l', 'MATERIAL', 2500, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-M-AGR', 'Protector antigrafiti', 'l', 'MATERIAL', 30000, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-M-ANT', 'Antióxido / convertidor', 'l', 'MATERIAL', 15000, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-M-APA', 'Adhesivo para papel de pared', 'kg', 'MATERIAL', 6000, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-M-BAR2', 'Barniz o protector para madera', 'l', 'MATERIAL', 18000, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-M-CAL3', 'Cal para pintar con fijador', 'kg', 'MATERIAL', 400, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-M-CIP', 'Cinta de embalar', 'u', 'MATERIAL', 3500, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-M-DEM', 'Pintura para demarcación', 'l', 'MATERIAL', 15000, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-M-EAN', 'Epoxi autonivelante para pisos', 'kg', 'MATERIAL', 12000, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-M-ELA', 'Látex elastomérico impermeabilizante para frentes', 'l', 'MATERIAL', 15000, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-M-ENF', 'Enduido plástico para exterior', 'l', 'MATERIAL', 6500, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-M-ENP', 'Enduido plástico interior', 'l', 'MATERIAL', 4731, NULL, 'appmaestro.com.ar, mediana minorista con IVA, octubre 2026'),
  ('OF-M-EPX', 'Pintura epoxi bicomponente', 'l', 'MATERIAL', 30000, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-M-ESM', 'Esmalte sintético', 'l', 'MATERIAL', 19767, NULL, 'appmaestro.com.ar, mediana minorista con IVA, octubre 2026'),
  ('OF-M-ESR', 'Esmalte para altas temperaturas', 'l', 'MATERIAL', 28000, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-M-EST', 'Estuco veneciano o efecto decorativo', 'kg', 'MATERIAL', 9000, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-M-FGA', 'Fondo para galvanizado', 'l', 'MATERIAL', 22000, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-M-FIX', 'Fijador sellador', 'l', 'MATERIAL', 4241, NULL, 'appmaestro.com.ar, mediana minorista con IVA, octubre 2026'),
  ('OF-M-FUN', 'Fungicida para paredes', 'l', 'MATERIAL', 8000, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-M-HRP', 'Hidrorrepelente siliconado', 'l', 'MATERIAL', 9500, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-M-IMG', 'Impregnante para madera', 'l', 'MATERIAL', 14000, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-M-INT', 'Pintura intumescente', 'kg', 'MATERIAL', 40000, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-M-LAC', 'Laca poliuretánica', 'l', 'MATERIAL', 25000, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-M-LAH', 'Látex interior antihongo', 'l', 'MATERIAL', 9500, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-M-LIJ', 'Lija', 'u', 'MATERIAL', 900, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-M-LSA', 'Látex interior satinado lavable', 'l', 'MATERIAL', 12000, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-M-LXC', 'Látex para cielorrasos antihongo', 'l', 'MATERIAL', 7500, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-M-LXE', 'Látex exterior', 'l', 'MATERIAL', 18893, NULL, 'appmaestro.com.ar, mediana minorista con IVA, octubre 2026'),
  ('OF-M-LXI', 'Látex interior', 'l', 'MATERIAL', 7125, NULL, 'appmaestro.com.ar, mediana minorista con IVA, octubre 2026'),
  ('OF-M-MFV', 'Malla de fibra de vidrio', 'm²', 'MATERIAL', 2500, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-M-NYL', 'Nylon de protección', 'm²', 'MATERIAL', 500, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-M-PAP', 'Papel o revestimiento vinílico de pared', 'm²', 'MATERIAL', 15000, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-M-PCA', 'Pintura acrílica para techos de chapa', 'l', 'MATERIAL', 14000, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-M-PHV', 'Protector siliconado para hormigón visto', 'l', 'MATERIAL', 16000, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-M-PPI', 'Pintura poliuretánica para pisos', 'l', 'MATERIAL', 22000, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-M-PPL', 'Pintura para piletas (clorocaucho)', 'l', 'MATERIAL', 25000, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-M-RAC', 'Revestimiento acrílico texturado', 'kg', 'MATERIAL', 5500, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-M-REM', 'Removedor de pintura', 'l', 'MATERIAL', 12000, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-M-SFI', 'Sellador elástico para fisuras', 'kg', 'MATERIAL', 9000, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-M-TRP', 'Trapo y elementos de limpieza', 'u', 'MATERIAL', 3000, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-MO-OF', 'Oficial', 'h', 'LABOR', 6585, 95, 'UOCRA CCT 76/75 Zona A, valor hora básico desde 01/10/2026; cargas sociales 95 %'),
  ('OF-S-HID', 'Alquiler de hidrolavadora (por día)', 'u', 'SUBCONTRACT', 45000, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'),
  ('OF-S-SIL', 'Alquiler de silleta o balancín con arnés (por día)', 'u', 'SUBCONTRACT', 60000, NULL, 'Estimado ObraFlow octubre 2026; verificar con tu proveedor');

INSERT INTO public.resources (catalog_id, organization_id, code, name, unit, base_cost, type, social_charges_pct, pricing_notes, is_active)
SELECT c.id, NULL, r.code, r.name, r.unit, r.cost, r.type, r.social, r.notes, true
FROM _of_res r CROSS JOIN (SELECT id FROM public.catalogs WHERE name = 'Catálogo ObraFlow' AND organization_id IS NULL LIMIT 1) c
ON CONFLICT (catalog_id, code) DO UPDATE SET
  name = EXCLUDED.name, unit = EXCLUDED.unit, base_cost = EXCLUDED.base_cost, type = EXCLUDED.type,
  social_charges_pct = EXCLUDED.social_charges_pct, pricing_notes = EXCLUDED.pricing_notes, is_active = true;

CREATE TEMP TABLE _of_tasks (code text, name text, unit text, category text, description text, specifications text, daily_yield numeric) ON COMMIT DROP;
INSERT INTO _of_tasks VALUES
  ('OF-PIN-005', 'Lijado y limpieza de paredes', 'm²', '34 PINTURA', 'Sacar la pintura floja y el polvo antes de pintar.', 'Pintura existente sana', 80),
  ('OF-PIN-006', 'Tratamiento de fisuras', 'ml', '34 PINTURA', 'Abrir la fisura, rellenar con sellador elástico y reforzar con malla para que no vuelva a aparecer.', 'Abrir, sellar y enmallar', 25),
  ('OF-PIN-007', 'Enduido parcial', 'm²', '34 PINTURA', 'Masilla en los sectores con imperfecciones, lijada para que quede lisa.', 'Imperfecciones puntuales', 40),
  ('OF-PIN-008', 'Fijador sellador', 'm²', '34 PINTURA', 'Una mano de fijador antes del látex para que la pintura se adhiera y rinda.', 'Una mano sobre superficie nueva', 80),
  ('OF-PIN-012', 'Esmalte sintético en puertas y marcos', 'u', '34 PINTURA', 'Lijar, dar fondo y dos manos de esmalte en cada puerta con su marco.', 'Lijado, fondo y dos manos', 2),
  ('OF-PIN-013', 'Esmalte sintético en rejas y herrería', 'm²', '34 PINTURA', 'Cepillar el óxido, dar antióxido y dos manos de esmalte.', 'Cepillado, antióxido y dos manos', 12),
  ('OF-PIN-014', 'Hidrolavado de fachada', 'm²', '34 PINTURA', 'Lavado a presión de la fachada antes de pintar.', 'Antes de pintar', 80),
  ('OF-PIN-101', 'Remoción de pintura floja', 'm²', '34 PINTURA', 'Rasqueteo y removedor donde la pintura está descascarada, hasta base firme.', 'Solo sectores dañados', 25.7143),
  ('OF-PIN-102', 'Tratamiento antihongo', 'm²', '34 PINTURA', 'Limpieza con fungicida en paredes con hongos antes de pintar.', 'Baños, cocinas, muros fríos', 90.0),
  ('OF-PIN-103', 'Enduido total', 'm²', '34 PINTURA', 'Dos manos de enduido en toda la pared con lijado, para una terminación lisa.', 'Revoques nuevos o con imperfecciones', 25.7143),
  ('OF-PIN-104', 'Látex interior dos manos', 'm²', '34 PINTURA', 'Fijador y dos manos de látex interior mate.', 'Paredes en buen estado', 26.4706),
  ('OF-PIN-105', 'Látex interior tres manos', 'm²', '34 PINTURA', 'Fijador y tres manos de látex, para cambios de color o paredes nuevas.', 'Cambio de oscuro a claro', 19.1489),
  ('OF-PIN-106', 'Látex satinado lavable', 'm²', '34 PINTURA', 'Fijador y dos manos de látex satinado lavable, para pasillos y cuartos de chicos.', NULL, 26.4706),
  ('OF-PIN-107', 'Látex antihongo en locales húmedos', 'm²', '34 PINTURA', 'Fijador y dos manos de látex antihongo en baños, cocinas y lavaderos.', NULL, 26.4706),
  ('OF-PIN-108', 'Esmalte sintético en paredes', 'm²', '34 PINTURA', 'Fondo y dos manos de esmalte sintético satinado, lavable, para zócalos sanitarios o locales de servicio.', NULL, 20.0),
  ('OF-PIN-109', 'Pintura epoxi en paredes', 'm²', '34 PINTURA', 'Dos manos de epoxi bicomponente, para cocinas industriales o locales que exigen superficie lavable.', 'Locales gastronómicos o sanitarios', 18.0),
  ('OF-PIN-110', 'Pintura sobre placa de yeso', 'm²', '34 PINTURA', 'Fijador y dos manos de látex sobre placa masillada.', 'Después del masillado', 26.4706),
  ('OF-PIN-111', 'Estuco o efecto decorativo', 'm²', '34 PINTURA', 'Estuco veneciano o pintura de efecto aplicado a llana en paredes destacadas.', NULL, 7.5),
  ('OF-PIN-112', 'Colocación de papel de pared', 'm²', '34 PINTURA', 'Papel o vinílico de pared pegado, con empalmes a tope.', 'Sobre pared enduida', 18.0),
  ('OF-PIN-113', 'Remoción de papel de pared', 'm²', '34 PINTURA', 'Retiro de papel existente con vapor o humectante y limpieza de la pared.', NULL, 22.5),
  ('OF-PIN-114', 'Látex para cielorrasos dos manos', 'm²', '34 PINTURA', 'Fijador y dos manos de látex para cielorrasos, antihongo en baños y cocina.', 'Trabajo sobre andamio o escalera', 22.5),
  ('OF-PIN-115', 'Látex exterior dos manos', 'm²', '34 PINTURA', 'Fijador y dos manos de látex acrílico exterior.', 'Paredes sanas', 23.0769),
  ('OF-PIN-116', 'Látex elastomérico impermeabilizante', 'm²', '34 PINTURA', 'Tres manos de látex elastomérico que puentea microfisuras e impermeabiliza el frente.', 'Frentes y medianeras con microfisuras', 20.0),
  ('OF-PIN-117', 'Enduido exterior', 'm²', '34 PINTURA', 'Enduido acrílico para exterior en sectores con imperfecciones.', NULL, 25.7143),
  ('OF-PIN-118', 'Pintura a la cal', 'm²', '34 PINTURA', 'Tres manos de pintura a la cal con fijador, en muros de ladrillo o casas antiguas.', NULL, 30.0),
  ('OF-PIN-119', 'Hidrorrepelente en ladrillo visto', 'm²', '34 PINTURA', 'Hidrorrepelente siliconado incoloro que protege el ladrillo sin cambiar su aspecto.', 'Ladrillo limpio y seco', 60.0),
  ('OF-PIN-120', 'Barniz en carpintería de madera', 'm²', '34 PINTURA', 'Lijado y tres manos de barniz o protector en puertas, ventanas y revestimientos de madera.', 'Por m² de superficie, ambas caras', 15.0),
  ('OF-PIN-121', 'Laca poliuretánica en muebles', 'm²', '34 PINTURA', 'Fondo y laca poliuretánica a soplete en muebles o puertas.', NULL, 10.0),
  ('OF-PIN-122', 'Pintura de techos de chapa', 'm²', '34 PINTURA', 'Antióxido en puntos de óxido y dos manos de pintura acrílica para chapa.', NULL, 25.7143),
  ('OF-PIN-123', 'Pintura de cañerías a la vista', 'ml', '34 PINTURA', 'Esmalte en caños con el color reglamentario: gas amarillo, incendio rojo.', NULL, 112.5),
  ('OF-PIN-124', 'Pintura intumescente en estructura metálica', 'm²', '34 PINTURA', 'Pintura que se expande con el fuego y protege la estructura metálica.', 'Espesor según resistencia exigida', 18.0),
  ('OF-PIN-125', 'Pintura poliuretánica de pisos', 'm²', '34 PINTURA', 'Dos manos de pintura poliuretánica en pisos de cemento de garajes o depósitos.', 'Piso limpio y seco', 25.7143),
  ('OF-PIN-126', 'Demarcación de pisos', 'ml', '34 PINTURA', 'Líneas de demarcación de 10 cm en garajes o estacionamientos.', NULL, 180.0),
  ('OF-PIN-127', 'Pintura de pileta', 'm²', '34 PINTURA', 'Lavado ácido y dos manos de pintura para piletas.', 'Pileta vacía y seca', 22.5),
  ('OF-PIN-128', 'Movimiento y cubrimiento de muebles', 'm²', '34 PINTURA', 'Correr los muebles al centro del ambiente, cubrirlos con nylon y volverlos a su lugar al terminar.', 'Por m² de piso', 112.5),
  ('OF-PIN-129', 'Retiro y recolocación de tapas y artefactos', 'u', '34 PINTURA', 'Desmontar tapas de llaves y tomas, apliques, cortineros y cuadros, y volver a colocarlos después de pintar.', 'Por elemento', 60.0),
  ('OF-PIN-130', 'Decapado total con removedor', 'm²', '34 PINTURA', 'Sacar todas las capas de pintura vieja con removedor y espátula hasta el revoque o la madera, y lavar.', 'Pintura muy cargada o incompatible', 11.25),
  ('OF-PIN-131', 'Repintado de mantenimiento una mano', 'm²', '34 PINTURA', 'Lijado suave y una mano de látex del mismo color sobre pintura sana. No sirve para cambiar de color.', 'Mismo color, pintura en buen estado', 52.9412),
  ('OF-PIN-132', 'Textura con rodillo', 'm²', '34 PINTURA', 'Fijador y pasta acrílica aplicada con rodillo de textura, para disimular imperfecciones de la pared.', NULL, 18.0),
  ('OF-PIN-133', 'Repintado de cielorraso una mano', 'm²', '34 PINTURA', 'Una mano de látex para cielorrasos del mismo color sobre pintura sana.', 'Mismo color', 36.0),
  ('OF-PIN-134', 'Barniz en machimbre de techo', 'm²', '34 PINTURA', 'Lijado y tres manos de barniz o protector en machimbre y tirantes vistos, trabajando sobre la cabeza.', NULL, 12.8571),
  ('OF-PIN-135', 'Limpieza de ladrillo visto con ácido', 'm²', '34 PINTURA', 'Cepillado con ácido muriático diluido para sacar eflorescencias y restos de mezcla, y enjuague abundante.', 'Antes del hidrorrepelente', 36.0),
  ('OF-PIN-136', 'Repintado de revestimiento texturado', 'm²', '34 PINTURA', 'Lavado, fijador y dos manos de látex exterior sobre un revestimiento plástico existente. Consume más pintura por la textura.', 'Revestimiento sano', 25.7143),
  ('OF-PIN-137', 'Protector para hormigón visto', 'm²', '34 PINTURA', 'Dos manos de protector siliconado incoloro sobre hormigón visto limpio, contra humedad y manchas.', NULL, 60.0),
  ('OF-PIN-138', 'Protector antigrafiti', 'm²', '34 PINTURA', 'Barrera transparente que permite quitar pintadas con hidrolavado sin dañar la pintura de abajo.', 'Planta baja sobre la calle', 60.0),
  ('OF-PIN-139', 'Trabajo con silleta o balancín', 'm²', '34 PINTURA', 'Recargo por pintar colgado en silleta o balancín con arnés y línea de vida, en medianeras o frentes altos sin andamio.', 'Se suma a la pintura de esa superficie', 60.0),
  ('OF-PIN-140', 'Esmalte en ventana o postigo de madera', 'u', '34 PINTURA', 'Lijado, masillado de juntas, fondo y dos manos de esmalte en una ventana o postigo de madera de hasta 1,5 m², ambas caras.', 'Por unidad', 6.0),
  ('OF-PIN-141', 'Esmalte en zócalos de madera', 'ml', '34 PINTURA', 'Lijado y dos manos de esmalte en zócalos de madera, encintando el piso.', NULL, 150.0),
  ('OF-PIN-142', 'Impregnante en madera exterior', 'm²', '34 PINTURA', 'Lijado y tres manos de impregnante con filtro solar en deck, pérgolas, cercos o revestimientos de madera exterior.', NULL, 22.5),
  ('OF-PIN-143', 'Tratamiento de óxido con convertidor', 'm²', '34 PINTURA', 'Cepillado con cepillo de acero y convertidor de óxido en herrería muy oxidada, antes de pintar.', 'Óxido avanzado', 25.7143),
  ('OF-PIN-144', 'Esmalte en barandas', 'ml', '34 PINTURA', 'Lijado, antióxido y dos manos de esmalte en barandas de escalera o balcón de hasta 1 m de alto.', NULL, 22.5),
  ('OF-PIN-145', 'Esmalte sobre chapa galvanizada', 'm²', '34 PINTURA', 'Desengrasado, fondo para galvanizado y dos manos de esmalte. Sin el fondo, la pintura se descascara.', 'Portones, cenefas, conductos', 20.0),
  ('OF-PIN-146', 'Pintura de radiadores', 'u', '34 PINTURA', 'Lijado y dos manos de esmalte para altas temperaturas en un radiador, con la calefacción apagada.', 'Por radiador', 9.0),
  ('OF-PIN-147', 'Piso epoxi autonivelante', 'm²', '34 PINTURA', 'Lijado del piso, imprimación epoxi y capa autonivelante de unos 2 mm, para locales comerciales o industriales.', 'Piso firme y seco', 18.0),
  ('OF-PIN-148', 'Recargo por obra habitada', 'm²', '34 PINTURA', 'Tiempo extra por trabajar con la casa ocupada: cortes de tarea, orden diario y más cuidado. Se aplica a paredes y cielorrasos.', 'Alrededor de un 20 % más de mano de obra', 128.5714),
  ('OF-PIN-149', 'Recargo por trabajo en altura', 'm²', '34 PINTURA', 'Tiempo extra para pintar paredes o techos de más de 3 m: armado y movimiento de andamio de caballetes o escalera doble.', 'Dobles alturas y cajas de escalera', 75.0),
  ('OF-PIN-150', 'Limpieza final de pintura', 'm²', '34 PINTURA', 'Retiro de cintas y nylon, limpieza de salpicaduras en vidrios, pisos y herrajes, y retiro de residuos.', 'Por m² de piso', 225.0);

CREATE TEMP TABLE _of_yields (task_code text, res_code text, qty numeric) ON COMMIT DROP;
INSERT INTO _of_yields VALUES
  ('OF-PIN-005', 'OF-MO-OF', 1),
  ('OF-PIN-005', 'OF-M-LIJ', 0.1),
  ('OF-PIN-006', 'OF-MO-OF', 1),
  ('OF-PIN-006', 'OF-M-SFI', 0.15),
  ('OF-PIN-006', 'OF-M-MFV', 0.15),
  ('OF-PIN-007', 'OF-MO-OF', 1),
  ('OF-PIN-007', 'OF-M-ENP', 0.3),
  ('OF-PIN-007', 'OF-M-LIJ', 0.1),
  ('OF-PIN-008', 'OF-MO-OF', 1),
  ('OF-PIN-008', 'OF-M-FIX', 0.1),
  ('OF-PIN-012', 'OF-MO-OF', 1),
  ('OF-PIN-012', 'OF-M-ESM', 0.8),
  ('OF-PIN-012', 'OF-M-LIJ', 2),
  ('OF-PIN-013', 'OF-MO-OF', 1),
  ('OF-PIN-013', 'OF-M-ANT', 0.12),
  ('OF-PIN-013', 'OF-M-ESM', 0.2),
  ('OF-PIN-013', 'OF-M-LIJ', 0.2),
  ('OF-PIN-014', 'OF-MO-OF', 1),
  ('OF-PIN-014', 'OF-S-HID', 0.0125),
  ('OF-PIN-101', 'OF-GR-PIN', 1.0),
  ('OF-PIN-101', 'OF-M-REM', 0.15),
  ('OF-PIN-101', 'OF-M-LIJ', 0.2),
  ('OF-PIN-102', 'OF-GR-PIN', 1.0),
  ('OF-PIN-102', 'OF-M-FUN', 0.15),
  ('OF-PIN-103', 'OF-GR-PIN', 1.0),
  ('OF-PIN-103', 'OF-M-ENP', 0.6),
  ('OF-PIN-103', 'OF-M-LIJ', 0.15),
  ('OF-PIN-104', 'OF-GR-PIN', 1.0),
  ('OF-PIN-104', 'OF-M-FIX', 0.1),
  ('OF-PIN-104', 'OF-M-LXI', 0.24),
  ('OF-PIN-104', 'OF-M-LIJ', 0.05),
  ('OF-PIN-105', 'OF-GR-PIN', 1.0),
  ('OF-PIN-105', 'OF-M-FIX', 0.1),
  ('OF-PIN-105', 'OF-M-LXI', 0.36),
  ('OF-PIN-105', 'OF-M-LIJ', 0.05),
  ('OF-PIN-106', 'OF-GR-PIN', 1.0),
  ('OF-PIN-106', 'OF-M-FIX', 0.1),
  ('OF-PIN-106', 'OF-M-LSA', 0.24),
  ('OF-PIN-106', 'OF-M-LIJ', 0.05),
  ('OF-PIN-107', 'OF-GR-PIN', 1.0),
  ('OF-PIN-107', 'OF-M-FIX', 0.1),
  ('OF-PIN-107', 'OF-M-LAH', 0.24),
  ('OF-PIN-107', 'OF-M-LIJ', 0.05),
  ('OF-PIN-108', 'OF-GR-PIN', 1.0),
  ('OF-PIN-108', 'OF-M-FIX', 0.1),
  ('OF-PIN-108', 'OF-M-ESM', 0.2),
  ('OF-PIN-108', 'OF-M-LIJ', 0.1),
  ('OF-PIN-109', 'OF-GR-PIN', 1.0),
  ('OF-PIN-109', 'OF-M-EPX', 0.25),
  ('OF-PIN-109', 'OF-M-LIJ', 0.1),
  ('OF-PIN-110', 'OF-GR-PIN', 1.0),
  ('OF-PIN-110', 'OF-M-FIX', 0.1),
  ('OF-PIN-110', 'OF-M-LXI', 0.24),
  ('OF-PIN-110', 'OF-M-LIJ', 0.05),
  ('OF-PIN-111', 'OF-GR-PIN', 1.0),
  ('OF-PIN-111', 'OF-M-EST', 1.2),
  ('OF-PIN-111', 'OF-M-LIJ', 0.2),
  ('OF-PIN-112', 'OF-GR-PIN', 1.0),
  ('OF-PIN-112', 'OF-M-PAP', 1.1),
  ('OF-PIN-112', 'OF-M-APA', 0.2),
  ('OF-PIN-113', 'OF-GR-PIN', 1.0),
  ('OF-PIN-113', 'OF-M-LIJ', 0.1),
  ('OF-PIN-114', 'OF-GR-PIN', 1.0),
  ('OF-PIN-114', 'OF-M-FIX', 0.1),
  ('OF-PIN-114', 'OF-M-LXC', 0.25),
  ('OF-PIN-114', 'OF-M-LIJ', 0.05),
  ('OF-PIN-115', 'OF-GR-PIN', 1.0),
  ('OF-PIN-115', 'OF-M-FIX', 0.1),
  ('OF-PIN-115', 'OF-M-LXE', 0.24),
  ('OF-PIN-115', 'OF-M-LIJ', 0.05),
  ('OF-PIN-116', 'OF-GR-PIN', 1.0),
  ('OF-PIN-116', 'OF-M-FIX', 0.1),
  ('OF-PIN-116', 'OF-M-ELA', 0.45),
  ('OF-PIN-116', 'OF-M-LIJ', 0.05),
  ('OF-PIN-117', 'OF-GR-PIN', 1.0),
  ('OF-PIN-117', 'OF-M-ENF', 0.5),
  ('OF-PIN-117', 'OF-M-LIJ', 0.15),
  ('OF-PIN-118', 'OF-GR-PIN', 1.0),
  ('OF-PIN-118', 'OF-M-CAL3', 0.5),
  ('OF-PIN-119', 'OF-GR-PIN', 1.0),
  ('OF-PIN-119', 'OF-M-HRP', 0.3),
  ('OF-PIN-120', 'OF-GR-PIN', 1.0),
  ('OF-PIN-120', 'OF-M-BAR2', 0.25),
  ('OF-PIN-120', 'OF-M-LIJ', 0.3),
  ('OF-PIN-121', 'OF-GR-PIN', 1.0),
  ('OF-PIN-121', 'OF-M-LAC', 0.3),
  ('OF-PIN-121', 'OF-M-LIJ', 0.4),
  ('OF-PIN-122', 'OF-GR-PIN', 1.0),
  ('OF-PIN-122', 'OF-M-ANT', 0.08),
  ('OF-PIN-122', 'OF-M-PCA', 0.3),
  ('OF-PIN-123', 'OF-GR-PIN', 1.0),
  ('OF-PIN-123', 'OF-M-ESM', 0.02),
  ('OF-PIN-124', 'OF-GR-PIN', 1.0),
  ('OF-PIN-124', 'OF-M-INT', 1.0),
  ('OF-PIN-125', 'OF-GR-PIN', 1.0),
  ('OF-PIN-125', 'OF-M-PPI', 0.3),
  ('OF-PIN-126', 'OF-GR-PIN', 1.0),
  ('OF-PIN-126', 'OF-M-DEM', 0.02),
  ('OF-PIN-126', 'OF-M-CIP', 0.01),
  ('OF-PIN-127', 'OF-GR-PIN', 1.0),
  ('OF-PIN-127', 'OF-M-PPL', 0.35),
  ('OF-PIN-128', 'OF-GR-AYU', 1.0),
  ('OF-PIN-128', 'OF-M-NYL', 0.5),
  ('OF-PIN-129', 'OF-GR-PIN', 1.0),
  ('OF-PIN-130', 'OF-GR-PIN', 1.0),
  ('OF-PIN-130', 'OF-M-REM', 0.4),
  ('OF-PIN-130', 'OF-M-LIJ', 0.5),
  ('OF-PIN-131', 'OF-GR-PIN', 1.0),
  ('OF-PIN-131', 'OF-M-LXI', 0.12),
  ('OF-PIN-131', 'OF-M-LIJ', 0.05),
  ('OF-PIN-132', 'OF-GR-PIN', 1.0),
  ('OF-PIN-132', 'OF-M-FIX', 0.1),
  ('OF-PIN-132', 'OF-M-RAC', 1.2),
  ('OF-PIN-133', 'OF-GR-PIN', 1.0),
  ('OF-PIN-133', 'OF-M-LXC', 0.13),
  ('OF-PIN-133', 'OF-M-LIJ', 0.03),
  ('OF-PIN-134', 'OF-GR-PIN', 1.0),
  ('OF-PIN-134', 'OF-M-BAR2', 0.3),
  ('OF-PIN-134', 'OF-M-LIJ', 0.3),
  ('OF-PIN-135', 'OF-GR-PIN', 1.0),
  ('OF-PIN-135', 'OF-M-ACI', 0.1),
  ('OF-PIN-135', 'OF-M-LIJ', 0.05),
  ('OF-PIN-136', 'OF-GR-PIN', 1.0),
  ('OF-PIN-136', 'OF-M-FIX', 0.1),
  ('OF-PIN-136', 'OF-M-LXE', 0.3),
  ('OF-PIN-136', 'OF-M-LIJ', 0.02),
  ('OF-PIN-137', 'OF-GR-PIN', 1.0),
  ('OF-PIN-137', 'OF-M-PHV', 0.25),
  ('OF-PIN-138', 'OF-GR-PIN', 1.0),
  ('OF-PIN-138', 'OF-M-AGR', 0.2),
  ('OF-PIN-139', 'OF-GR-PIN', 1.0),
  ('OF-PIN-139', 'OF-S-SIL', 0.02),
  ('OF-PIN-140', 'OF-GR-PIN', 1.0),
  ('OF-PIN-140', 'OF-M-ENP', 0.1),
  ('OF-PIN-140', 'OF-M-ESM', 0.35),
  ('OF-PIN-140', 'OF-M-LIJ', 1.5),
  ('OF-PIN-141', 'OF-GR-PIN', 1.0),
  ('OF-PIN-141', 'OF-M-ESM', 0.02),
  ('OF-PIN-141', 'OF-M-LIJ', 0.02),
  ('OF-PIN-142', 'OF-GR-PIN', 1.0),
  ('OF-PIN-142', 'OF-M-IMG', 0.25),
  ('OF-PIN-142', 'OF-M-LIJ', 0.2),
  ('OF-PIN-143', 'OF-GR-PIN', 1.0),
  ('OF-PIN-143', 'OF-M-ANT', 0.12),
  ('OF-PIN-143', 'OF-M-LIJ', 0.3),
  ('OF-PIN-144', 'OF-GR-PIN', 1.0),
  ('OF-PIN-144', 'OF-M-ANT', 0.05),
  ('OF-PIN-144', 'OF-M-ESM', 0.1),
  ('OF-PIN-144', 'OF-M-LIJ', 0.1),
  ('OF-PIN-145', 'OF-GR-PIN', 1.0),
  ('OF-PIN-145', 'OF-M-FGA', 0.1),
  ('OF-PIN-145', 'OF-M-ESM', 0.2),
  ('OF-PIN-145', 'OF-M-LIJ', 0.05),
  ('OF-PIN-146', 'OF-GR-PIN', 1.0),
  ('OF-PIN-146', 'OF-M-ESR', 0.3),
  ('OF-PIN-146', 'OF-M-LIJ', 0.5),
  ('OF-PIN-147', 'OF-GR-PIN', 1.0),
  ('OF-PIN-147', 'OF-GR-AYU', 1.0),
  ('OF-PIN-147', 'OF-M-EPX', 0.15),
  ('OF-PIN-147', 'OF-M-EAN', 2.5),
  ('OF-PIN-147', 'OF-M-LIJ', 0.2),
  ('OF-PIN-148', 'OF-GR-PIN', 1.0),
  ('OF-PIN-149', 'OF-GR-PIN', 1.0),
  ('OF-PIN-150', 'OF-GR-PIN', 1.0),
  ('OF-PIN-150', 'OF-M-TRP', 0.02);

DO $$
DECLARE
  v_cat  uuid;
  t      record;
  v_id   uuid;
  n_new  integer := 0;
  n_upd  integer := 0;
BEGIN
  SELECT id INTO v_cat FROM public.catalogs WHERE name = 'Catálogo ObraFlow' AND organization_id IS NULL LIMIT 1;

  FOR t IN SELECT * FROM _of_tasks LOOP
    SELECT id INTO v_id FROM public.master_tasks
     WHERE organization_id IS NULL AND code = t.code
     ORDER BY is_active DESC, created_at LIMIT 1;

    IF v_id IS NULL THEN
      INSERT INTO public.master_tasks (organization_id, code, name, unit, category, description, specifications,
                                       daily_yield, fixed_cost, tags, source_metadata, is_active)
      VALUES (NULL, t.code, t.name, t.unit, t.category, t.description, t.specifications,
              t.daily_yield, 0, '["presupuesto-rapido","base-maestra"]'::jsonb,
              jsonb_build_object('source', 'catalogo-obraflow', 'version', '2026-10-pintura'), true)
      RETURNING id INTO v_id;
      n_new := n_new + 1;
    ELSE
      UPDATE public.master_tasks SET
        name = t.name, unit = t.unit, category = t.category, description = t.description,
        specifications = t.specifications, daily_yield = t.daily_yield, is_active = true,
        tags = '["presupuesto-rapido","base-maestra"]'::jsonb,
        source_metadata = jsonb_build_object('source', 'catalogo-obraflow', 'version', '2026-10-pintura'),
        updated_at = now()
      WHERE id = v_id;
      n_upd := n_upd + 1;
    END IF;

    DELETE FROM public.catalog_task_yields WHERE master_task_id = v_id;
    INSERT INTO public.catalog_task_yields (master_task_id, resource_id, quantity)
    SELECT v_id, r.id, y.qty
    FROM _of_yields y
    JOIN public.resources r ON r.catalog_id = v_cat AND r.code = y.res_code
    WHERE y.task_code = t.code;
  END LOOP;

  RAISE NOTICE 'Pintura ObraFlow: % APU nuevos, % actualizados', n_new, n_upd;
END $$;

COMMIT;
