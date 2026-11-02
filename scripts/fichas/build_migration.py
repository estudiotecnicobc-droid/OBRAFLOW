"""Genera supabase/migrations/068_fichas_tecnicas_apu.sql desde las fichas de scripts/fichas.

Uso: python3 scripts/fichas/build_migration.py
"""
import json, os, re, sys
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)

import build  # noqa: E402  (arma la lista T de fichas)
from svgkit import DEFS  # noqa: E402

OUT = os.path.join(ROOT, "supabase", "migrations", "068_fichas_tecnicas_apu.sql")

# ── Ficha → APU de la base maestra (organization_id IS NULL) ─────────────────
MAPEO = {
    "DEM-MAM": ["OF-DMT-017"],
    "MS-EXC": ["OF-EXC-001", "OF-EXC-003"],
    "HA-ZAP": ["OF-FUN-104"],                      # nuevo
    "HA-LOS": ["OF-CUB-017"],
    "HA-ENC": ["OF-MAM-111", "OF-MAM-112", "OF-EST-002"],
    "HA-COL": ["OF-EST-001"],
    "HA-LMA": ["OF-CUB-019"],
    "MAM-CAP": ["OF-AIS-001"],
    "MAM-COM15": ["OF-MAM-101"],
    "MAM-HUE12": ["OF-MAM-105"],
    "REV-INT": ["OF-REV-008", "OF-REV-011"],
    "REV-EXT": ["OF-REV-005", "OF-REV-007", "OF-REV-012"],
    "YES-ENL": ["OF-YES-104"],                     # nuevo
    "YES-CIE": ["OF-CIE-003"],
    "PIS-CON": ["OF-CON-003"],
    "PIS-CAR": ["OF-CAR-001", "OF-CAR-101"],
    "PIS-CER": ["OF-PIS-001", "OF-PIS-101", "OF-PIS-102"],
    "REV-CER": ["OF-RVE-101", "OF-RVE-102"],
    "PIS-ZOC": ["OF-ZOC-101"],
    "CS-TAB-70-1x12": ["OF-TAB-001", "OF-TAB-101", "OF-DUR-004", "OF-DUR-011"],
    "CS-CIE-JT-12": ["OF-CIE-002", "OF-CIE-102", "OF-DUR-023"],
    "CS-REV-OM-12": ["OF-TAB-102", "OF-DUR-049", "OF-DUR-050"],
    "CUB-CHA": ["OF-CUB-008", "OF-CUB-009", "OF-CUB-010"],
    "CUB-MEM": ["OF-CUB-001", "OF-CUB-002"],
    "IMP-BAÑ": ["OF-IMP-003"],                     # nuevo
    "CUB-TEJ": ["OF-CUB-104", "OF-CUB-011", "OF-CUB-012"],
    "SAN-CLO": ["OF-SAN-107"],
    "SAN-AGU": ["OF-SAN-128"],                     # nuevo
    "SAN-PLU": ["OF-SAN-112"],
    "SAN-TAN": ["OF-SAN-105"],
    "SAN-INO": ["OF-SAN-117"],
    "SAN-LAV": ["OF-SAN-119"],
    "GAS-CAÑ": ["OF-GAS-104", "OF-GAS-105"],
    "ELE-BOC": ["OF-ELE-005", "OF-ELE-006"],
    "ELE-TAB": ["OF-ELE-004"],
    "ELE-PAT": ["OF-ELE-105"],
    "CAR-MAR": ["OF-ABE-110"],
    "CAR-ALU": ["OF-ABE-002", "OF-ABE-101"],
    "CAR-PUE": ["OF-CMA-101", "OF-ABE-004"],
    "EQU-MES": ["OF-AMO-004"],
    "PIN-LAT": ["OF-PIN-104", "OF-PIN-105"],
    "PIN-EXT": ["OF-PIN-115"],
    "PIN-ESM": ["OF-PIN-013"],
    "EXT-VER": ["OF-EXT-001"],
}

# ── APU nuevos (solo los que no tenían equivalente) ──────────────────────────
# (code, name, unit, category, description, specifications, daily_yield)
NUEVOS = [
    ("OF-FUN-104", "Zapata corrida de hormigón armado", "m³", "04 FUNDACIONES",
     "Cimiento corrido de hormigón armado H-21 bajo muros portantes. A diferencia de OF-FUN-002 "
     "(zapata de hormigón ciclópeo, sin armar) lleva armadura; a diferencia de OF-FUN-004 (viga de "
     "fundación) trabaja como base ancha y baja. El hormigón de limpieza va aparte (OF-FUN-001).",
     "Dimensiones y armadura según cálculo; cuantía orientativa 40–70 kg/m³", 1.75),
    ("OF-YES-104", "Jaharro y enlucido de yeso sobre mampostería", "m²", "15 YESERIA",
     "Terminación interior de paredes con jaharro de yeso y enlucido a la llana, lista para pintar. "
     "Reemplaza al revoque grueso + fino a la cal en locales secos. Para cielorrasos usar OF-CIE-003.",
     "Espesor ≈ 1,2 cm; solo interiores secos", 17.5),
    ("OF-IMP-003", "Impermeabilización cementicia de piso de baño", "m²", "93 AISLACIONES Y MEMBRANAS",
     "Impermeabilizante cementicio bicomponente en dos manos sobre la carpeta, con subida en muros y "
     "banda de refuerzo en encuentros. Distinto de OF-IMP-001 (balcones, por unidad) y de OF-CAR-103 "
     "(carpeta hidrófuga): se pueden usar juntos.",
     "Subida ≥ 20 cm (en ducha ≥ 1,80 m); medir la superficie desarrollada", 27.5),
    ("OF-SAN-128", "Boca de agua fría y caliente (termofusión)", "u", "23 INSTALACIÓN SANITARIA",
     "Alimentación completa de un artefacto con agua fría y caliente en termofusión, desde el ramal "
     "hasta la conexión de la grifería. Alternativa por boca a OF-SAN-001 y OF-SAN-002 (por ml): "
     "usar una forma de cómputo u otra, no ambas.",
     "PPR 20 mm embutido; prueba de presión antes de tapar", 3.5),
]

# (task_code, res_code, qty) — mano de obra: cantidad = operarios
YIELDS = [
    ("OF-FUN-104", "OF-M-H21", 1.05), ("OF-FUN-104", "OF-M-ACE", 55), ("OF-FUN-104", "OF-M-ALA", 1),
    ("OF-FUN-104", "OF-M-SEP", 8), ("OF-FUN-104", "OF-MO-OF", 1.0), ("OF-FUN-104", "OF-MO-AY", 1.0),
    ("OF-YES-104", "OF-M-YES", 11), ("OF-YES-104", "OF-MO-OE", 1.0), ("OF-YES-104", "OF-MO-AY", 1.0),
    ("OF-IMP-003", "OF-M-ICB", 2), ("OF-IMP-003", "OF-M-MFV", 0.3), ("OF-IMP-003", "OF-GR-TEC", 1.0),
    ("OF-SAN-128", "OF-M-TF20", 6), ("OF-SAN-128", "OF-M-ATF", 6), ("OF-SAN-128", "OF-M-LLP", 0.5),
    ("OF-SAN-128", "OF-GR-SAN", 1.0), ("OF-SAN-128", "OF-GR-AYU", 1.0),
]

# Insumos nuevos: (code, name, unit, type, cost, notes)
RECURSOS = [
    ("OF-M-ICB", "Impermeabilizante cementicio bicomponente", "kg", "MATERIAL", 3200,
     "Estimado ObraFlow octubre 2026 (kit 25 kg); verificar con tu proveedor"),
]

# Ajustes de texto para fichas que se comparten entre varios APU
AJUSTES = {
    "HA-ENC": {"titulo": "Encadenado / viga de hormigón armado",
               "datos": {"Sección habitual": "0,15 × 0,15 o 0,20 × 0,20 m (según muro)"}},
}

COLORES = {"--placa": "#f3efe6", "--placa-s": "#8a8170", "--acero": "#7b8794", "--lana": "#f2d7a6",
           "--muro": "#c9c4bb", "--hormigon": "#bfc3c7"}
STYLE = ('<style>.lbl{font:11px Arial,Helvetica,sans-serif;fill:#333}'
         '.dim{font:10.5px Arial,Helvetica,sans-serif;fill:#555}</style>')
PATTERNS = re.search(r"<defs>(.*)</defs>", DEFS, re.S).group(1)


def svg_standalone(svg: str) -> str:
    for k, v in COLORES.items():
        svg = svg.replace(f"var({k})", v)
    svg = svg.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ', 1)
    head_end = svg.index(">") + 1
    usados = "".join(pt for pt in re.findall(r"<pattern .*?</pattern>", PATTERNS, re.S)
                     if f'url(#{re.search(r'id="([^"]+)"', pt).group(1)})' in svg)
    svg = svg[:head_end] + (f"<defs>{usados}</defs>" if usados else "") + STYLE + svg[head_end:]
    ET.fromstring(svg)  # valida XML
    return svg


def nombres_existentes() -> dict:
    names = {}
    mig = os.path.join(ROOT, "supabase", "migrations")
    for f in sorted(os.listdir(mig)):
        if not re.match(r"06[1-5]_", f):
            continue
        s = open(os.path.join(mig, f), encoding="utf-8").read()
        i = s.find("_of_tasks VALUES")
        if i < 0:
            continue
        for m in re.finditer(r"\('(OF-[A-Z0-9-]+)', '((?:[^']|'')*)'", s[i:s.find(";\n", i)]):
            names[m.group(1)] = m.group(2).replace("''", "'")
    for n in NUEVOS:
        names[n[0]] = n[1]
    return names


def q(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def main():
    names = nombres_existentes()
    fichas = {x["codigo"]: x for x in build.T}
    assert set(fichas) == set(MAPEO), set(fichas) ^ set(MAPEO)
    faltan = [c for cs in MAPEO.values() for c in cs if c not in names]
    assert not faltan, f"Códigos inexistentes: {faltan}"

    fichas_json, mapa = [], []
    for cod, codes in MAPEO.items():
        f = fichas[cod]
        aj = AJUSTES.get(cod, {})
        datos = [{"label": a, "value": aj.get("datos", {}).get(a, b)} for a, b in f["datos_tecnicos"]]
        base = {
            "version": 1,
            "ficha": cod,
            "gremio": f["gremio"],
            "titulo": aj.get("titulo", f["titulo"]),
            "esquemaSvg": svg_standalone(f["svg"]),
            "pie": f["pie"],
            "descripcion": f["descripcion"],
            "datosTecnicos": datos,
            "notas": f["notas"],
            "fuente": f["fuente"],
        }
        fichas_json.append((cod, json.dumps(base, ensure_ascii=False)))
        for code in codes:
            rel = [{"codigo": c, "nombre": names[c]} for c in codes if c != code]
            mapa.append((code, cod, json.dumps(rel, ensure_ascii=False)))
    sheets = mapa

    L = []
    L.append("""-- =============================================================================
-- Migración 068: Fichas técnicas de tareas en la base maestra ObraFlow
--
-- Generada con scripts/fichas/build_migration.py desde scripts/fichas (44 fichas,
-- 31/10/2026). No editar a mano.
--
--   · Agrega master_tasks.technical_sheet (jsonb, nullable): esquema SVG propio,
--     descripción, datos técnicos, notas de ejecución, fuente y tareas relacionadas.
--     Los consumos y la mano de obra siguen saliendo del APU.
--   · Crea 4 APU que no tenían equivalente: OF-FUN-104, OF-YES-104, OF-IMP-003,
--     OF-SAN-128 (con aclaración de en qué se distinguen de los parecidos) y el
--     insumo OF-M-ICB (precio estimado, verificar).
--   · Carga la ficha en %d APU del catálogo general (organization_id IS NULL).
--     Las copias de empresa la toman por código desde el catálogo general.
--
-- Idempotente. No toca APU de empresas ni presupuestos.
-- =============================================================================

BEGIN;

ALTER TABLE public.master_tasks
  ADD COLUMN IF NOT EXISTS technical_sheet jsonb;

COMMENT ON COLUMN public.master_tasks.technical_sheet IS
  'Ficha técnica: { version, ficha, gremio, titulo, esquemaSvg, pie, descripcion, '
  'datosTecnicos[{label,value}], notas[], fuente, relacionadas[{codigo,nombre}] }. '
  'Migración 068.';
""" % len(sheets))

    L.append("CREATE TEMP TABLE _of_res (code text, name text, unit text, type text, cost numeric, notes text) ON COMMIT DROP;")
    L.append("INSERT INTO _of_res VALUES\n" + ",\n".join(
        f"  ({q(c)}, {q(n)}, {q(u)}, {q(t)}, {cost}, {q(no)})" for c, n, u, t, cost, no in RECURSOS) + ";")
    L.append("""
INSERT INTO public.resources (catalog_id, organization_id, code, name, unit, base_cost, type, pricing_notes, is_active)
SELECT c.id, NULL, r.code, r.name, r.unit, r.cost, r.type, r.notes, true
FROM _of_res r CROSS JOIN (SELECT id FROM public.catalogs WHERE name = 'Catálogo ObraFlow' AND organization_id IS NULL LIMIT 1) c
ON CONFLICT (catalog_id, code) DO UPDATE SET
  name = EXCLUDED.name, unit = EXCLUDED.unit, base_cost = EXCLUDED.base_cost, type = EXCLUDED.type,
  pricing_notes = EXCLUDED.pricing_notes, is_active = true;
""")
    L.append("CREATE TEMP TABLE _of_tasks (code text, name text, unit text, category text, description text, specifications text, daily_yield numeric) ON COMMIT DROP;")
    L.append("INSERT INTO _of_tasks VALUES\n" + ",\n".join(
        f"  ({q(c)}, {q(n)}, {q(u)}, {q(cat)}, {q(d)}, {q(s)}, {dy})" for c, n, u, cat, d, s, dy in NUEVOS) + ";")
    L.append("\nCREATE TEMP TABLE _of_yields (task_code text, res_code text, qty numeric) ON COMMIT DROP;")
    L.append("INSERT INTO _of_yields VALUES\n" + ",\n".join(
        f"  ({q(t)}, {q(r)}, {qty})" for t, r, qty in YIELDS) + ";")
    L.append("""
DO $$
DECLARE
  v_cat  uuid;
  t      record;
  v_id   uuid;
  n_new  integer := 0;
  n_upd  integer := 0;
  n_res  integer;
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
              t.daily_yield, 0, '["base-maestra","ficha-tecnica"]'::jsonb,
              jsonb_build_object('source', 'catalogo-obraflow', 'version', '2026-10-fichas'), true)
      RETURNING id INTO v_id;
      n_new := n_new + 1;
    ELSE
      UPDATE public.master_tasks SET
        name = t.name, unit = t.unit, category = t.category, description = t.description,
        specifications = t.specifications, daily_yield = t.daily_yield, is_active = true,
        tags = '["base-maestra","ficha-tecnica"]'::jsonb,
        source_metadata = jsonb_build_object('source', 'catalogo-obraflow', 'version', '2026-10-fichas'),
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

    SELECT count(*) INTO n_res FROM _of_yields WHERE task_code = t.code;
    IF n_res <> (SELECT count(*) FROM public.catalog_task_yields WHERE master_task_id = v_id) THEN
      RAISE WARNING 'Fichas: % quedó con insumos faltantes (revisar códigos de recursos)', t.code;
    END IF;
  END LOOP;

  RAISE NOTICE 'Fichas técnicas: % APU nuevos, % actualizados', n_new, n_upd;
END $$;
""")
    L.append("CREATE TEMP TABLE _of_fichas (ficha text, sheet jsonb) ON COMMIT DROP;")
    L.append("INSERT INTO _of_fichas VALUES\n" + ",\n".join(
        f"  ({q(c)}, $sheet${s}$sheet$::jsonb)" for c, s in fichas_json) + ";")
    L.append("\nCREATE TEMP TABLE _of_sheets (code text, ficha text, relacionadas jsonb) ON COMMIT DROP;")
    L.append("INSERT INTO _of_sheets VALUES\n" + ",\n".join(
        f"  ({q(c)}, {q(fi)}, {q(rel)}::jsonb)" for c, fi, rel in mapa) + ";")
    L.append("""
DO $$
DECLARE
  n_upd  integer;
  v_miss text;
BEGIN
  UPDATE public.master_tasks mt
     SET technical_sheet = f.sheet || jsonb_build_object('relacionadas', s.relacionadas), updated_at = now()
  FROM _of_sheets s
  JOIN _of_fichas f ON f.ficha = s.ficha
  WHERE mt.organization_id IS NULL AND mt.code = s.code;
  GET DIAGNOSTICS n_upd = ROW_COUNT;

  SELECT string_agg(s.code, ', ') INTO v_miss
  FROM _of_sheets s
  WHERE NOT EXISTS (SELECT 1 FROM public.master_tasks mt WHERE mt.organization_id IS NULL AND mt.code = s.code);

  RAISE NOTICE 'Fichas técnicas: ficha cargada en % APU', n_upd;
  IF v_miss IS NOT NULL THEN
    RAISE WARNING 'Fichas técnicas: no se encontraron en el catálogo general: %', v_miss;
  END IF;
END $$;

COMMIT;
""")
    open(OUT, "w", encoding="utf-8").write("\n".join(L))

    # Partes para aplicar con el MCP de Supabase (tamaño acotado por llamada)
    parts_dir = os.path.join(HERE, "partes")
    os.makedirs(parts_dir, exist_ok=True)
    full = "\n".join(L)
    p1 = full[:full.index("CREATE TEMP TABLE _of_fichas")] + "COMMIT;\n"
    partes = [p1]
    cur, size = [], 0
    by_ficha = {}
    for code, fi, rel in mapa:
        by_ficha.setdefault(fi, []).append((code, rel))
    for fi, sh in fichas_json:
        vals = ", ".join(f"({q(c)}, {q(r)}::jsonb)" for c, r in by_ficha[fi])
        stmt = (f"UPDATE public.master_tasks mt SET technical_sheet = $sheet${sh}$sheet$::jsonb || "
                f"jsonb_build_object('relacionadas', v.rel), updated_at = now()\n"
                f"FROM (VALUES {vals}) AS v(code, rel)\n"
                f"WHERE mt.organization_id IS NULL AND mt.code = v.code;\n")
        if size + len(stmt) > 40000 and cur:
            partes.append("".join(cur)); cur, size = [], 0
        cur.append(stmt); size += len(stmt)
    partes.append("".join(cur))
    for i, ptxt in enumerate(partes, 1):
        open(os.path.join(parts_dir, f"parte_{i}.sql"), "w", encoding="utf-8").write(ptxt)
    print("partes:", [len(x) for x in partes])
    print(f"{OUT}: {len(sheets)} fichas asignadas, {len(NUEVOS)} APU nuevos")


if __name__ == "__main__":
    main()
