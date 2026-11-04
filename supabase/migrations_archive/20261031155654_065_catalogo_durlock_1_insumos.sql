-- Migración aplicada desde el panel web de Supabase (SQL Editor).
-- Version: 20261031155654
-- Name:    065_catalogo_durlock_1_insumos
-- Origen:  supabase_migrations.schema_migrations (snapshot 2026-11-03)
-- Nota:    Ya aplicada en producción. Reproducida aquí sólo como historia.
-- Nunca re-ejecutar: está absorbida por el baseline 20261101000000.

INSERT INTO public.catalogs (name, type, organization_id, is_active)
SELECT 'Catálogo ObraFlow', 'global', NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.catalogs WHERE name = 'Catálogo ObraFlow' AND organization_id IS NULL);

CREATE TEMP TABLE _of_res (code text, name text, unit text, type text, cost numeric, social numeric, notes text) ON COMMIT DROP;
INSERT INTO _of_res VALUES
  ('OF-DUR-M01', 'Adhesivo Revoque Seco 25 kg', 'bolsa', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M02', 'Aislante EPS para EIFS', 'm²', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M03', 'Aislante para muros (lana)', 'm²', 'MATERIAL', 6500, NULL, 'Derivado de OF-M-LV (lana de vidrio 50 mm); verificar'),
  ('OF-DUR-M04', 'Aislante para techos (lana)', 'm²', 'MATERIAL', 8500, NULL, 'Derivado de OF-M-LVF (lana de vidrio 50 mm con foil); verificar'),
  ('OF-DUR-M05', 'Alambre N°14', 'ml', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M06', 'Banda acústica', 'ml', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M07', 'Barrera de agua y viento', 'm²', 'MATERIAL', 2500, NULL, 'Derivado de OF-M-TYV (estimado); verificar'),
  ('OF-DUR-M08', 'Base Coat bicomponente 25 kg', 'u', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M09', 'Cedral Panel 6 mm 1,218x2,40', 'u', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M10', 'Cedral Smart 10 mm 0,10x3,20', 'u', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M11', 'Cinta malla FV 5x5 50 m x 5 cm', 'rollo', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M12', 'Cinta papel microperforada', 'ml', 'MATERIAL', 98.76, NULL, 'appmaestro.com.ar, mediana minorista con IVA, octubre 2026'),
  ('OF-DUR-M13', 'Fleje metálico 50 mm', 'ml', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M14', 'Larguero 15/16" x 3,66 m', 'u', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M15', 'Malla FV 5x5 160 g 50 m x 1 m', 'rollo', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M16', 'Masilla Antihumedad 13 kg', 'balde', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M17', 'Masilla interior', 'kg', 'MATERIAL', 2894, NULL, 'appmaestro.com.ar, mediana minorista con IVA, octubre 2026'),
  ('OF-DUR-M18', 'Masilla Semicubiertos', 'kg', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M19', 'Masilla/enduido exterior', 'kg', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M20', 'Montante 34 mm x 2,60 m', 'u', 'MATERIAL', 3957.2, NULL, 'Derivado de OF-M-M35 (appmaestro.com.ar, mediana minorista con IVA, octubre 2026) × 2,60 m; verificar'),
  ('OF-DUR-M21', 'Montante 69 mm x 2,60 m', 'u', 'MATERIAL', 3957.2, NULL, 'Derivado de OF-M-M70 (appmaestro.com.ar, mediana minorista con IVA, octubre 2026) × 2,60 m; verificar'),
  ('OF-DUR-M22', 'Perfil Omega x 2,60 m', 'u', 'MATERIAL', 3577.6, NULL, 'Derivado de OF-M-OME (appmaestro.com.ar, mediana minorista con IVA, octubre 2026) × 2,60 m; verificar'),
  ('OF-DUR-M23', 'Perfil perimetral 15/16" x 3,05 m', 'u', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M24', 'Perfil PGO 22 x 3,00 m', 'u', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M25', 'PGC 70x40x15 esp 0,90 x 6 m', 'u', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M26', 'PGU 70x35 esp 0,90 x 6 m', 'u', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M27', 'Placa 4D 12,5 mm 1,20x2,40', 'u', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M28', 'Placa ACU60 12,5 mm 1,20x2,40', 'u', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M29', 'Placa Antihumedad 12,5 mm 1,20x2,60', 'u', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M30', 'Placa Aquaboard 12,5 mm 1,20x2,40', 'u', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M31', 'Placa CIEL 7 mm 1,20x2,40', 'u', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M32', 'Placa Deco Clásica 6,4 mm 0,606x0,606', 'u', 'MATERIAL', 8885, NULL, 'Derivado de OF-M-PDE (appmaestro.com.ar, mediana minorista con IVA, octubre 2026), placa 61 x 61; verificar'),
  ('OF-DUR-M33', 'Placa Deco Clásica 6,4 mm 0,606x1,216', 'u', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M34', 'Placa Deco Vinyl 7 mm 0,605x0,605', 'u', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M35', 'Placa Estándar 12,5 mm 1,20x2,40', 'u', 'MATERIAL', 36990.72, NULL, 'Derivado de OF-M-PY (appmaestro.com.ar, mediana minorista con IVA, octubre 2026) × 2,88 m² por placa; verificar'),
  ('OF-DUR-M36', 'Placa Estándar 9,5 mm 1,20x2,40', 'u', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M37', 'Placa Extra Resistente 12,5 mm 1,20x2,40', 'u', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M38', 'Placa Revoque Seco 12,5 mm 1,20x2,60', 'u', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M39', 'Placa RF 12,5 mm 1,20x2,40', 'u', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M40', 'Placa RH 12,5 mm 1,20x2,40', 'u', 'MATERIAL', 50400, NULL, 'Derivado de OF-M-PYV (estimado) × 2,88 m² por placa; verificar'),
  ('OF-DUR-M41', 'Placa Semicubiertos 12,5 mm 1,20x2,40', 'u', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M42', 'Placa Superboard Premium 10 mm 1,20x2,40', 'u', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M43', 'Placa Superboard ST 6 mm 1,20x2,40', 'u', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M44', 'Placa Superboard ST 8 mm 1,20x2,40', 'u', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M45', 'Sellador poliuretánico 600 ml', 'u', 'MATERIAL', 14000, NULL, 'Derivado de OF-M-SEL (estimado); verificar'),
  ('OF-DUR-M46', 'Sellador Promaseal-A', 'u', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M47', 'Siding Cedral 8 mm 0,20x3,60', 'u', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M48', 'Siding Cedral pre-pintado 8 mm 0,19x3,66', 'u', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M49', 'Solera 35 mm x 2,60 m', 'u', 'MATERIAL', 3640, NULL, 'Derivado de OF-M-S35 (estimado) × 2,60 m; verificar'),
  ('OF-DUR-M50', 'Solera 70 mm x 2,60 m', 'u', 'MATERIAL', 3957.2, NULL, 'Derivado de OF-M-S70 (estimado) × 2,60 m; verificar'),
  ('OF-DUR-M51', 'Tarugo N°8 c/tope + tornillo', 'u', 'MATERIAL', 178, NULL, 'appmaestro.com.ar, mediana minorista con IVA, octubre 2026'),
  ('OF-DUR-M52', 'Tornillo alas 10x1½"', 'u', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M53', 'Tornillo alas 8x1¼"', 'u', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M54', 'Tornillo alas con estrías 8x1¼"', 'u', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M55', 'Tornillo T1 punta aguja 8x9/16"', 'u', 'MATERIAL', 24.73, NULL, 'appmaestro.com.ar, mediana minorista con IVA, octubre 2026'),
  ('OF-DUR-M56', 'Tornillo T1 punta mecha', 'u', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M57', 'Tornillo T2 6x1" 25 mm', 'u', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M58', 'Tornillo T2 punta aguja 6x1"', 'u', 'MATERIAL', 19.77, NULL, 'appmaestro.com.ar, mediana minorista con IVA, octubre 2026'),
  ('OF-DUR-M59', 'Tornillo T3 6x1½" 38 mm', 'u', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'),
  ('OF-DUR-M60', 'Travesaño 15/16" x 0,61 m', 'u', 'MATERIAL', 0, NULL, 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)');

INSERT INTO public.resources (catalog_id, organization_id, code, name, unit, base_cost, type, social_charges_pct,
                              pricing_notes, commercial_unit, conversion_factor, is_active)
SELECT c.id, NULL, r.code, r.name, r.unit, r.cost, r.type, r.social, r.notes, r.unit, 1, true
FROM _of_res r CROSS JOIN (SELECT id FROM public.catalogs WHERE name = 'Catálogo ObraFlow' AND organization_id IS NULL LIMIT 1) c
ON CONFLICT (catalog_id, code) DO UPDATE SET
  name = EXCLUDED.name, unit = EXCLUDED.unit, base_cost = EXCLUDED.base_cost, type = EXCLUDED.type,
  social_charges_pct = EXCLUDED.social_charges_pct, pricing_notes = EXCLUDED.pricing_notes,
  commercial_unit = EXCLUDED.commercial_unit, conversion_factor = EXCLUDED.conversion_factor, is_active = true;
