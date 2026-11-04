-- Migración aplicada desde el panel web de Supabase (SQL Editor).
-- Version: 20261031160514
-- Name:    065_catalogo_durlock_3_apu_revestimientos_adicionales
-- Origen:  supabase_migrations.schema_migrations (snapshot 2026-11-03)
-- Nota:    Ya aplicada en producción. Reproducida aquí sólo como historia.
-- Nunca re-ejecutar: está absorbida por el baseline 20261101000000.

CREATE TEMP TABLE _of_tasks (code text, name text, unit text, category text, description text, specifications text, daily_yield numeric) ON COMMIT DROP;
INSERT INTO _of_tasks VALUES
('OF-DUR-198', 'Revestimiento Extra Resistente (perfil 35) (Durlock)', 'm²', '14 REVESTIMIENTOS', 'Revestimiento interior en seco, sistema Durlock. Incluye estructura, placas, fijaciones, cinta y masillado de juntas, con las cantidades del calculador de Durlock. La pintura va aparte.', 'Opcionales aparte: Banda acústica, Enduido, Sellador Promaseal-A', 11),
('OF-DUR-050', 'Revestimiento RH sobre perfil Omega (Durlock)', 'm²', '14 REVESTIMIENTOS', 'Revestimiento interior en seco, sistema Durlock. Incluye estructura, placas, fijaciones, cinta y masillado de juntas, con las cantidades del calculador de Durlock. La pintura va aparte.', 'Opcionales aparte: Enduido, Sellador Promaseal-A', 12.4),
('OF-DUR-199', 'Revestimiento 4D (perfil 35) (Durlock)', 'm²', '14 REVESTIMIENTOS', 'Revestimiento interior en seco, sistema Durlock. Incluye estructura, placas, fijaciones, cinta y masillado de juntas, con las cantidades del calculador de Durlock. La pintura va aparte.', 'Opcionales aparte: Banda acústica, Enduido, Sellador Promaseal-A', 11),
('OF-DUR-187', 'Revestimiento Antihumedad (Durlock)', 'm²', '14 REVESTIMIENTOS', 'Revestimiento interior en seco, sistema Durlock. Incluye estructura, placas, fijaciones, cinta y masillado de juntas, con las cantidades del calculador de Durlock. La pintura va aparte.', 'Sistema completo según Durlock', 11),
('OF-DUR-091', 'Superboard Premium doble emplacado — revestimiento interior (Durlock)', 'm²', '14 REVESTIMIENTOS', 'Revestimiento interior en seco, sistema Durlock. Incluye estructura, placas, fijaciones, con las cantidades del calculador de Durlock.', 'Sistema completo según Durlock', 7),
('OF-DUR-103', 'Superboard Premium 10 mm (Durlock)', 'm²', '14 REVESTIMIENTOS', 'Revestimiento interior en seco, sistema Durlock. Incluye estructura, placas, fijaciones, cinta y masillado de juntas, con las cantidades del calculador de Durlock. La pintura va aparte.', 'Sistema completo según Durlock', 10),
('OF-DUR-099', 'Superboard ST 8 mm (símil cemento) (Durlock)', 'm²', '14 REVESTIMIENTOS', 'Revestimiento interior en seco, sistema Durlock. Incluye estructura, placas, fijaciones, cinta y masillado de juntas, con las cantidades del calculador de Durlock. La pintura va aparte.', 'Sistema completo según Durlock', 10),
('OF-DUR-059', 'Cedral 20 cm junta vista — revestimiento interior (Durlock)', 'm²', '14 REVESTIMIENTOS', 'Revestimiento interior en seco, sistema Durlock. Incluye estructura, placas, fijaciones, con las cantidades del calculador de Durlock.', 'Opcionales aparte: Enduido', 9),
('OF-DUR-254', 'Cedral Smart 10 cm junta vista (Durlock)', 'm²', '14 REVESTIMIENTOS', 'Revestimiento int/ext en seco, sistema Durlock. Incluye estructura, placas, fijaciones, cinta y masillado de juntas, con las cantidades del calculador de Durlock. La pintura va aparte.', 'Opcionales aparte: Barrera de agua y viento', 9),
('OF-DUR-255', 'Cedral Panel texturado (Durlock)', 'm²', '14 REVESTIMIENTOS', 'Revestimiento int/ext en seco, sistema Durlock. Incluye estructura, placas, fijaciones, cinta y masillado de juntas, con las cantidades del calculador de Durlock. La pintura va aparte.', 'Opcionales aparte: Barrera de agua y viento', 10),
('OF-DUR-057', 'Cedral junta a tope — revestimiento interior (Durlock)', 'm²', '14 REVESTIMIENTOS', 'Revestimiento interior en seco, sistema Durlock. Incluye estructura, placas, fijaciones, con las cantidades del calculador de Durlock.', 'Opcionales aparte: Enduido', 9),
('OF-DUR-340', 'Cedral pre-pintado junta a tope — revestimiento interior (Durlock)', 'm²', '14 REVESTIMIENTOS', 'Revestimiento interior en seco, sistema Durlock. Incluye estructura, placas, fijaciones, con las cantidades del calculador de Durlock.', 'Opcionales aparte: Enduido', 10),
('OF-DUR-064', 'Aquaboard exterior (base coat + malla) (Durlock)', 'm²', '14 REVESTIMIENTOS', 'Revestimiento exterior en seco, sistema Durlock. Incluye estructura, placas, fijaciones, con las cantidades del calculador de Durlock. La pintura va aparte.', 'Opcionales aparte: Barrera de agua y viento', 6),
('OF-DUR-090', 'Superboard con aislación térmica (EIFS) (Durlock)', 'm²', '14 REVESTIMIENTOS', 'Revestimiento exterior en seco, sistema Durlock. Incluye estructura, placas, fijaciones, con las cantidades del calculador de Durlock. La pintura va aparte.', 'Opcionales aparte: Barrera de agua y viento', 5),
('OF-DUR-063', 'Cedral 20 cm junta vista — revestimiento exterior (Durlock)', 'm²', '14 REVESTIMIENTOS', 'Revestimiento exterior en seco, sistema Durlock. Incluye estructura, placas, fijaciones, cinta y masillado de juntas, con las cantidades del calculador de Durlock. La pintura va aparte.', 'Opcionales aparte: Barrera de agua y viento', 8),
('OF-DUR-065', 'Superboard exterior (junta vista) (Durlock)', 'm²', '14 REVESTIMIENTOS', 'Revestimiento exterior en seco, sistema Durlock. Incluye estructura, placas, fijaciones, cinta y masillado de juntas, con las cantidades del calculador de Durlock. La pintura va aparte.', 'Opcionales aparte: Barrera de agua y viento', 8),
('OF-DUR-066', 'Superboard Premium doble emplacado — revestimiento exterior (Durlock)', 'm²', '14 REVESTIMIENTOS', 'Revestimiento exterior en seco, sistema Durlock. Incluye estructura, placas, fijaciones, cinta y masillado de juntas, con las cantidades del calculador de Durlock. La pintura va aparte.', 'Opcionales aparte: Barrera de agua y viento, Sellador poliuretánico 600 ml', 6),
('OF-DUR-062', 'Cedral solapado horizontal (Durlock)', 'm²', '14 REVESTIMIENTOS', 'Revestimiento exterior en seco, sistema Durlock. Incluye estructura, placas, fijaciones, con las cantidades del calculador de Durlock.', 'Opcionales aparte: Barrera de agua y viento', 8),
('OF-DUR-061', 'Cedral junta a tope — revestimiento exterior (Durlock)', 'm²', '14 REVESTIMIENTOS', 'Revestimiento exterior en seco, sistema Durlock. Incluye estructura, placas, fijaciones, cinta y masillado de juntas, con las cantidades del calculador de Durlock. La pintura va aparte.', 'Opcionales aparte: Barrera de agua y viento, Placa Superboard ST 6 mm 1,20x2,40, Sellador poliuretánico 600 ml', 8),
('OF-DUR-341', 'Cedral pre-pintado junta a tope — revestimiento exterior (Durlock)', 'm²', '14 REVESTIMIENTOS', 'Revestimiento exterior en seco, sistema Durlock. Incluye estructura, placas, fijaciones, cinta y masillado de juntas, con las cantidades del calculador de Durlock. La pintura va aparte.', 'Opcionales aparte: Barrera de agua y viento, Placa Superboard ST 6 mm 1,20x2,40, Sellador poliuretánico 600 ml', 9),
('OF-DUR-901', 'Banda acústica perimetral (Durlock)', 'ml', '06 MAMPOSTERÍA, Y OTROS CERRAMIENTOS', 'Banda acústica bajo soleras y montantes perimetrales para cortar la transmisión de ruido y vibraciones.', 'Perímetro del tabique', 80),
('OF-DUR-902', 'Sellado de juntas y pasos con Promaseal-A (Durlock)', 'm²', '06 MAMPOSTERÍA, Y OTROS CERRAMIENTOS', 'Sellador intumescente en juntas perimetrales y pasos de instalaciones para mantener la resistencia al fuego del tabique.', 'Coeficiente del calculador de Durlock: 0,55 u/m²', 60),
('OF-DUR-903', 'Barrera de agua y viento (Durlock)', 'm²', '14 REVESTIMIENTOS', 'Membrana hidrófuga y respirable detrás del revestimiento exterior para proteger la estructura del agua y el viento.', 'Coeficiente del calculador de Durlock: 1,05 m²/m²', 60);

CREATE TEMP TABLE _of_yields (task_code text, res_code text, qty numeric) ON COMMIT DROP;
INSERT INTO _of_yields VALUES
('OF-DUR-198', 'OF-GR-DUR', 1.0),
('OF-DUR-198', 'OF-GR-AYU', 1.0),
('OF-DUR-198', 'OF-DUR-M37', 0.37),
('OF-DUR-198', 'OF-DUR-M49', 0.39),
('OF-DUR-198', 'OF-DUR-M20', 1.16),
('OF-DUR-198', 'OF-DUR-M55', 10),
('OF-DUR-198', 'OF-DUR-M58', 15),
('OF-DUR-198', 'OF-DUR-M12', 1.65),
('OF-DUR-198', 'OF-DUR-M17', 0.9),
('OF-DUR-198', 'OF-DUR-M03', 1.05),
('OF-DUR-198', 'OF-DUR-M51', 3.5),
('OF-DUR-050', 'OF-GR-DUR', 1.0),
('OF-DUR-050', 'OF-GR-AYU', 1.0),
('OF-DUR-050', 'OF-DUR-M40', 0.37),
('OF-DUR-050', 'OF-DUR-M22', 1.16),
('OF-DUR-050', 'OF-DUR-M58', 15),
('OF-DUR-050', 'OF-DUR-M12', 1.65),
('OF-DUR-050', 'OF-DUR-M17', 0.9),
('OF-DUR-050', 'OF-DUR-M51', 8),
('OF-DUR-199', 'OF-GR-DUR', 1.0),
('OF-DUR-199', 'OF-GR-AYU', 1.0),
('OF-DUR-199', 'OF-DUR-M27', 0.37),
('OF-DUR-199', 'OF-DUR-M49', 0.39),
('OF-DUR-199', 'OF-DUR-M20', 1.16),
('OF-DUR-199', 'OF-DUR-M55', 10),
('OF-DUR-199', 'OF-DUR-M58', 15),
('OF-DUR-199', 'OF-DUR-M12', 1.65),
('OF-DUR-199', 'OF-DUR-M17', 0.9),
('OF-DUR-199', 'OF-DUR-M03', 1.05),
('OF-DUR-199', 'OF-DUR-M51', 3.5),
('OF-DUR-187', 'OF-GR-DUR', 1.0),
('OF-DUR-187', 'OF-GR-AYU', 1.0),
('OF-DUR-187', 'OF-DUR-M29', 0.34),
('OF-DUR-187', 'OF-DUR-M22', 1.16),
('OF-DUR-187', 'OF-DUR-M58', 15),
('OF-DUR-187', 'OF-DUR-M16', 0.11),
('OF-DUR-187', 'OF-DUR-M12', 1.65),
('OF-DUR-187', 'OF-DUR-M51', 8),
('OF-DUR-091', 'OF-GR-DUR', 1.0),
('OF-DUR-091', 'OF-GR-AYU', 1.0),
('OF-DUR-091', 'OF-DUR-M42', 0.37),
('OF-DUR-091', 'OF-DUR-M44', 0.37),
('OF-DUR-091', 'OF-DUR-M53', 14),
('OF-DUR-091', 'OF-DUR-M52', 14),
('OF-DUR-091', 'OF-DUR-M24', 1.07),
('OF-DUR-091', 'OF-DUR-M51', 8),
('OF-DUR-103', 'OF-GR-DUR', 1.0),
('OF-DUR-103', 'OF-GR-AYU', 1.0),
('OF-DUR-103', 'OF-DUR-M42', 0.37),
('OF-DUR-103', 'OF-DUR-M54', 14),
('OF-DUR-103', 'OF-DUR-M19', 0.15),
('OF-DUR-103', 'OF-DUR-M45', 1.6),
('OF-DUR-103', 'OF-DUR-M13', 1),
('OF-DUR-103', 'OF-DUR-M24', 1),
('OF-DUR-103', 'OF-DUR-M51', 8),
('OF-DUR-099', 'OF-GR-DUR', 1.0),
('OF-DUR-099', 'OF-GR-AYU', 1.0),
('OF-DUR-099', 'OF-DUR-M44', 0.37),
('OF-DUR-099', 'OF-DUR-M54', 14),
('OF-DUR-099', 'OF-DUR-M19', 0.15),
('OF-DUR-099', 'OF-DUR-M45', 1.6),
('OF-DUR-099', 'OF-DUR-M13', 1),
('OF-DUR-099', 'OF-DUR-M24', 1),
('OF-DUR-099', 'OF-DUR-M51', 8),
('OF-DUR-059', 'OF-GR-DUR', 1.0),
('OF-DUR-059', 'OF-GR-AYU', 1.0),
('OF-DUR-059', 'OF-DUR-M47', 1.39),
('OF-DUR-059', 'OF-DUR-M43', 0.37),
('OF-DUR-059', 'OF-DUR-M53', 30),
('OF-DUR-059', 'OF-DUR-M24', 1),
('OF-DUR-059', 'OF-DUR-M51', 8),
('OF-DUR-254', 'OF-GR-DUR', 1.0),
('OF-DUR-254', 'OF-GR-AYU', 1.0),
('OF-DUR-254', 'OF-DUR-M10', 3.29),
('OF-DUR-254', 'OF-DUR-M43', 0.37),
('OF-DUR-254', 'OF-DUR-M53', 7),
('OF-DUR-254', 'OF-DUR-M52', 30),
('OF-DUR-254', 'OF-DUR-M24', 1),
('OF-DUR-254', 'OF-DUR-M51', 8),
('OF-DUR-254', 'OF-DUR-M45', 0.2),
('OF-DUR-254', 'OF-DUR-M19', 0.3),
('OF-DUR-255', 'OF-GR-DUR', 1.0),
('OF-DUR-255', 'OF-GR-AYU', 1.0),
('OF-DUR-255', 'OF-DUR-M09', 0.36),
('OF-DUR-255', 'OF-DUR-M53', 15),
('OF-DUR-255', 'OF-DUR-M24', 1),
('OF-DUR-255', 'OF-DUR-M51', 8),
('OF-DUR-255', 'OF-DUR-M45', 0.32),
('OF-DUR-255', 'OF-DUR-M19', 0.3),
('OF-DUR-057', 'OF-GR-DUR', 1.0),
('OF-DUR-057', 'OF-GR-AYU', 1.0),
('OF-DUR-057', 'OF-DUR-M47', 1.46),
('OF-DUR-057', 'OF-DUR-M24', 1),
('OF-DUR-057', 'OF-DUR-M53', 14),
('OF-DUR-057', 'OF-DUR-M51', 8),
('OF-DUR-340', 'OF-GR-DUR', 1.0),
('OF-DUR-340', 'OF-GR-AYU', 1.0),
('OF-DUR-340', 'OF-DUR-M48', 1.5),
('OF-DUR-340', 'OF-DUR-M24', 1),
('OF-DUR-340', 'OF-DUR-M53', 14),
('OF-DUR-340', 'OF-DUR-M51', 8),
('OF-DUR-064', 'OF-GR-DUR', 1.0),
('OF-DUR-064', 'OF-GR-AYU', 1.0),
('OF-DUR-064', 'OF-DUR-M30', 0.37),
('OF-DUR-064', 'OF-DUR-M53', 20),
('OF-DUR-064', 'OF-DUR-M08', 0.2),
('OF-DUR-064', 'OF-DUR-M11', 0.03),
('OF-DUR-064', 'OF-DUR-M15', 0.03),
('OF-DUR-064', 'OF-DUR-M24', 1),
('OF-DUR-064', 'OF-DUR-M51', 8),
('OF-DUR-090', 'OF-GR-DUR', 1.0),
('OF-DUR-090', 'OF-GR-AYU', 1.0),
('OF-DUR-090', 'OF-DUR-M44', 0.37),
('OF-DUR-090', 'OF-DUR-M53', 14),
('OF-DUR-090', 'OF-DUR-M08', 0.2),
('OF-DUR-090', 'OF-DUR-M02', 1.05),
('OF-DUR-090', 'OF-DUR-M15', 0.03),
('OF-DUR-090', 'OF-DUR-M24', 1),
('OF-DUR-090', 'OF-DUR-M51', 8),
('OF-DUR-063', 'OF-GR-DUR', 1.0),
('OF-DUR-063', 'OF-GR-AYU', 1.0),
('OF-DUR-063', 'OF-DUR-M47', 1.39),
('OF-DUR-063', 'OF-DUR-M43', 0.37),
('OF-DUR-063', 'OF-DUR-M52', 30),
('OF-DUR-063', 'OF-DUR-M53', 14),
('OF-DUR-063', 'OF-DUR-M24', 1),
('OF-DUR-063', 'OF-DUR-M51', 8),
('OF-DUR-063', 'OF-DUR-M45', 0.32),
('OF-DUR-063', 'OF-DUR-M19', 0.29),
('OF-DUR-065', 'OF-GR-DUR', 1.0),
('OF-DUR-065', 'OF-GR-AYU', 1.0),
('OF-DUR-065', 'OF-DUR-M44', 0.37),
('OF-DUR-065', 'OF-DUR-M54', 14),
('OF-DUR-065', 'OF-DUR-M19', 0.15),
('OF-DUR-065', 'OF-DUR-M45', 1.6),
('OF-DUR-065', 'OF-DUR-M13', 1),
('OF-DUR-065', 'OF-DUR-M24', 1),
('OF-DUR-065', 'OF-DUR-M51', 8),
('OF-DUR-066', 'OF-GR-DUR', 1.0),
('OF-DUR-066', 'OF-GR-AYU', 1.0),
('OF-DUR-066', 'OF-DUR-M42', 0.37),
('OF-DUR-066', 'OF-DUR-M44', 0.37),
('OF-DUR-066', 'OF-DUR-M53', 14),
('OF-DUR-066', 'OF-DUR-M52', 14),
('OF-DUR-066', 'OF-DUR-M19', 0.15),
('OF-DUR-066', 'OF-DUR-M24', 1),
('OF-DUR-066', 'OF-DUR-M51', 8),
('OF-DUR-062', 'OF-GR-DUR', 1.0),
('OF-DUR-062', 'OF-GR-AYU', 1.0),
('OF-DUR-062', 'OF-DUR-M47', 1.57),
('OF-DUR-062', 'OF-DUR-M24', 1),
('OF-DUR-062', 'OF-DUR-M53', 14),
('OF-DUR-062', 'OF-DUR-M51', 8),
('OF-DUR-062', 'OF-DUR-M45', 0.32),
('OF-DUR-061', 'OF-GR-DUR', 1.0),
('OF-DUR-061', 'OF-GR-AYU', 1.0),
('OF-DUR-061', 'OF-DUR-M47', 1.46),
('OF-DUR-061', 'OF-DUR-M53', 30),
('OF-DUR-061', 'OF-DUR-M24', 1),
('OF-DUR-061', 'OF-DUR-M51', 8),
('OF-DUR-061', 'OF-DUR-M19', 0.29),
('OF-DUR-341', 'OF-GR-DUR', 1.0),
('OF-DUR-341', 'OF-GR-AYU', 1.0),
('OF-DUR-341', 'OF-DUR-M48', 1.5),
('OF-DUR-341', 'OF-DUR-M53', 30),
('OF-DUR-341', 'OF-DUR-M24', 1),
('OF-DUR-341', 'OF-DUR-M51', 8),
('OF-DUR-341', 'OF-DUR-M19', 0.29),
('OF-DUR-901', 'OF-GR-DUR', 1.0),
('OF-DUR-901', 'OF-DUR-M06', 1),
('OF-DUR-902', 'OF-GR-DUR', 1.0),
('OF-DUR-902', 'OF-DUR-M46', 0.55),
('OF-DUR-903', 'OF-GR-DUR', 1.0),
('OF-DUR-903', 'OF-DUR-M07', 1.05);

DO $$
DECLARE
  v_cat  uuid;
  t      record;
  v_id   uuid;
  n_new  integer := 0;
  n_upd  integer := 0;
  n_miss integer;
BEGIN
  SELECT id INTO v_cat FROM public.catalogs WHERE name = 'Catálogo ObraFlow' AND organization_id IS NULL LIMIT 1;

  SELECT count(*) INTO n_miss FROM (SELECT DISTINCT res_code FROM _of_yields) y
   WHERE NOT EXISTS (SELECT 1 FROM public.resources r WHERE r.catalog_id = v_cat AND r.code = y.res_code);
  IF n_miss > 0 THEN
    RAISE EXCEPTION 'Durlock: faltan % recursos en el Catálogo ObraFlow (¿se corrieron las migraciones 061 a 063?)', n_miss;
  END IF;

  FOR t IN SELECT * FROM _of_tasks LOOP
    SELECT id INTO v_id FROM public.master_tasks
     WHERE organization_id IS NULL AND code = t.code
     ORDER BY is_active DESC, created_at LIMIT 1;

    IF v_id IS NULL THEN
      INSERT INTO public.master_tasks (organization_id, code, name, unit, category, description, specifications,
                                       daily_yield, fixed_cost, tags, source_metadata, is_active)
      VALUES (NULL, t.code, t.name, t.unit, t.category, t.description, t.specifications,
              t.daily_yield, 0, '["presupuesto-rapido","base-maestra","durlock"]'::jsonb,
              jsonb_build_object('source', 'catalogo-obraflow', 'version', '2026-10-durlock'), true)
      RETURNING id INTO v_id;
      n_new := n_new + 1;
    ELSE
      UPDATE public.master_tasks SET
        name = t.name, unit = t.unit, category = t.category, description = t.description,
        specifications = t.specifications, daily_yield = t.daily_yield, is_active = true,
        tags = '["presupuesto-rapido","base-maestra","durlock"]'::jsonb,
        source_metadata = jsonb_build_object('source', 'catalogo-obraflow', 'version', '2026-10-durlock'),
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

  RAISE NOTICE 'Durlock ObraFlow: % APU nuevos, % actualizados', n_new, n_upd;
END $$;
