"""Genera la migración 065 y los datos del presupuesto rápido a partir de
scripts/durlock/durlock_sistemas_coeficientes.json (relevado del calculador de durlock.com).

Uso:  python3 scripts/durlock/build_durlock.py
Salidas:
  supabase/migrations/065_catalogo_durlock.sql
  src/features/quickBudget/durlockSystems.ts
"""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'scripts/durlock/durlock_sistemas_coeficientes.json'
OUT_SQL = ROOT / 'supabase/migrations/065_catalogo_durlock.sql'
OUT_TS = ROOT / 'src/features/quickBudget/durlockSystems.ts'

data = json.loads(SRC.read_text(encoding='utf-8'))

# ── Insumos: nombre normalizado, unidad y precio de referencia ──────────────
MERGE = {
    'Tornillo T1 punta aguja': 'Tornillo T1 punta aguja 8x9/16"',
    'Tornillo T2 punta aguja': 'Tornillo T2 punta aguja 6x1"',
    'Sellador poliuretánico 600 ml (según proyecto)': 'Sellador poliuretánico 600 ml',
}
UNITS = {'un': 'u', 'm2': 'm²'}

APPM = 'appmaestro.com.ar, mediana minorista con IVA, octubre 2026'
EST = 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'

def derived(base_code, base_note, factor_txt):
    return f'Derivado de {base_code} ({base_note}){factor_txt}; verificar'

# nombre normalizado -> (precio con IVA, nota). Relevamiento del 31/10/2026.
RM = 'Red Materiales (redmateriales.com.ar), promedio de corralones, octubre 2026'
RMD = 'Red Materiales (redmateriales.com.ar), precio desde, octubre 2026'
ACQ = 'Corralón Aconquija, precio web con IVA, octubre 2026'
MLB = 'Mercado Libre, mediana de publicaciones, octubre 2026'
EST = 'Estimado ObraFlow octubre 2026; verificar con tu proveedor'
PRICES = {
    # Placas de yeso (por placa)
    'Placa Estándar 12,5 mm 1,20x2,40': (21769, RM),
    'Placa Estándar 9,5 mm 1,20x2,40': (21214, RM),
    'Placa RH 12,5 mm 1,20x2,40': (29924.65, ACQ),
    'Placa RF 12,5 mm 1,20x2,40': (26434, RM),
    'Placa Extra Resistente 12,5 mm 1,20x2,40': (28820.51, ACQ),
    'Placa 4D 12,5 mm 1,20x2,40': (33741.71, ACQ),
    'Placa Antihumedad 12,5 mm 1,20x2,60': (31994.88, ACQ),
    'Placa CIEL 7 mm 1,20x2,40': (15089.95, ACQ),
    'Placa Revoque Seco 12,5 mm 1,20x2,60': (22232.63, 'Mukdise, precio contado con IVA, octubre 2026'),
    'Placa ACU60 12,5 mm 1,20x2,40': (34000, EST + ' (referencia: placa 4D)'),
    'Placa Semicubiertos 12,5 mm 1,20x2,40': (33000, EST + ' (referencia: placa RH)'),
    'Placa Aquaboard 12,5 mm 1,20x2,40': (45000, EST),
    # Placas desmontables
    'Placa Deco Clásica 6,4 mm 0,606x0,606': (8885, derived('OF-M-PDE', APPM, ', placa 61 x 61')),
    'Placa Deco Clásica 6,4 mm 0,606x1,216': (17770, 'Derivado de la Deco Clásica 60 x 60 × 2; verificar'),
    'Placa Deco Vinyl 7 mm 0,605x0,605': (12000, EST),
    # Placas cementicias y Cedral
    'Placa Superboard ST 6 mm 1,20x2,40': (53249, RMD),
    'Placa Superboard ST 8 mm 1,20x2,40': (70958, RMD),
    'Placa Superboard Premium 10 mm 1,20x2,40': (106000, EST + ' (referencia: Superboard 8 mm × 1,5)'),
    'Siding Cedral 8 mm 0,20x3,60': (17800, MLB),
    'Siding Cedral pre-pintado 8 mm 0,19x3,66': (25583, MLB + ' (Cedral color)'),
    'Cedral Smart 10 mm 0,10x3,20': (15724, MLB),
    'Cedral Panel 6 mm 1,218x2,40': (75202, MLB),
    # Perfiles
    'Montante 69 mm x 2,60 m': (6089, RM),
    'Solera 70 mm x 2,60 m': (5457, RM),
    'Montante 34 mm x 2,60 m': (4588, RM),
    'Solera 35 mm x 2,60 m': (3972, RM),
    'Perfil Omega x 2,60 m': (3575, RMD),
    'Larguero 15/16" x 3,66 m': (8000, RMD),
    'Travesaño 15/16" x 0,61 m': (1394, RMD),
    'Perfil perimetral 15/16" x 3,05 m': (5348, RMD),
    'Perfil PGO 22 x 3,00 m': (8113, MLB),
    'PGC 70x40x15 esp 0,90 x 6 m': (30000, EST),
    'PGU 70x35 esp 0,90 x 6 m': (24000, EST),
    'Fleje metálico 50 mm': (1300, EST),
    'Alambre N°14': (150, EST),
    # Tornillos y fijaciones (por unidad)
    'Tornillo T1 punta aguja 8x9/16"': (24.73, APPM),
    'Tornillo T2 punta aguja 6x1"': (19.77, APPM),
    'Tornillo T1 punta mecha': (20.72, RM + ', caja x 100'),
    'Tornillo T2 6x1" 25 mm': (27.14, ACQ + ', caja x 100'),
    'Tornillo T3 6x1½" 38 mm': (52.20, ACQ + ', caja x 100'),
    'Tornillo alas 8x1¼"': (60, EST),
    'Tornillo alas con estrías 8x1¼"': (70, EST),
    'Tornillo alas 10x1½"': (90, EST),
    'Tarugo N°8 c/tope + tornillo': (178, APPM),
    # Masillas, adhesivos y tratamiento de juntas
    'Cinta papel microperforada': (98.76, APPM),
    'Masilla interior': (1714, 'Red Materiales (redmateriales.com.ar), Masilla Durlock balde 18 kg, octubre 2026'),
    'Masilla Antihumedad 13 kg': (45348.86, ACQ),
    'Masilla Semicubiertos': (1762, RMD + ', balde 32 kg'),
    'Masilla/enduido exterior': (2600, EST + ' (referencia: enduido Durlock 25 kg)'),
    'Base Coat bicomponente 25 kg': (96225, 'Promedio de Pinturería España, Punto Hogar y Bourlot, octubre 2026'),
    'Adhesivo Revoque Seco 25 kg': (25000, EST),
    'Cinta malla FV 5x5 50 m x 5 cm': (2535, 'Derivado de Red Materiales (cinta tramada 90 m), octubre 2026'),
    'Malla FV 5x5 160 g 50 m x 1 m': (125000, derived('OF-M-MFV', 'estimado', ' × 50 m²')),
    # Aislaciones, selladores y barreras
    'Aislante para muros (lana)': (6500, derived('OF-M-LV', 'lana de vidrio 50 mm', '')),
    'Aislante para techos (lana)': (8500, derived('OF-M-LVF', 'lana de vidrio 50 mm con foil', '')),
    'Aislante EPS para EIFS': (7000, EST),
    'Banda acústica': (600, EST),
    'Barrera de agua y viento': (2500, derived('OF-M-TYV', 'estimado', '')),
    'Sellador poliuretánico 600 ml': (14000, derived('OF-M-SEL', 'estimado', '')),
    'Sellador Promaseal-A': (35000, EST),
}
NO_PRICE = 'Sin precio de referencia: completar con tu proveedor (durlock.com, octubre 2026)'


def norm_name(n: str) -> str:
    n = MERGE.get(n, n)
    return n.replace(' Placa 1,20x2,40', ' 1,20x2,40')


# ── Mano de obra: m² por jornada de durlero + ayudante (estimado) ───────────
# Base: APU del catálogo (OF-TAB-001 13,85 m²/día, OF-TAB-102 22,5, OF-CIE-002 16,36,
# OF-CIE-103 25,71) más el encintado y masillado de juntas (OF-YES-001, 30 m²/día por cara).
YIELD = {
    4: 7.2, 11: 6.9, 6: 6.9, 206: 6.5, 5: 6.5, 9: 4.9,
    48: 15, 49: 12.9, 50: 12.4, 198: 11, 199: 11, 187: 11,
    99: 10, 103: 10, 91: 7, 59: 9, 57: 9, 340: 10, 254: 9, 255: 10,
    64: 6, 65: 8, 66: 6, 90: 5, 63: 8, 61: 8, 62: 8, 341: 9,
    21: 11, 22: 10.6, 23: 10.6, 24: 9.5, 251: 9.5, 42: 8,
    26: 25.7, 27: 25.7, 337: 25.7, 39: 9, 190: 9, 41: 8,
    47: 9, 97: 8, 44: 8, 46: 7,
}

GROUP = {
    'Pared interior': 'pared',
    'Revestimiento interior': 'revestimiento',
    'Revestimiento exterior': 'revestimiento',
    'Revestimiento int/ext': 'revestimiento',
    'Cielorraso interior': 'cielorraso',
    'Cielorraso exterior': 'cielorraso',
}
RUBRO = {
    'pared': '06 MAMPOSTERÍA, Y OTROS CERRAMIENTOS',
    'revestimiento': '14 REVESTIMIENTOS',
    'cielorraso': '13 CIELORRASOS',
}

# ── Selector: etiquetas por rama del árbol de Durlock ───────────────────────
tails: dict[int, list[str]] = {}
order: list[int] = []
for path, refs in data['arbol_selector'].items():
    parts = [p.strip() for p in path.split('/')]
    tail = ' · '.join(parts[1:]) or parts[0]
    ambito = 'exterior' if 'exterior' in parts[0].lower() else 'interior'
    for r in refs:
        tails.setdefault(r, [])
        if r not in order:
            order.append(r)
        t = f'{ambito}, {tail}' if parts[0].startswith(('Revest', 'Cielorraso')) else tail
        if t not in tails[r]:
            tails[r].append(t)

systems = []
skipped = []
for s in data['sistemas']:
    ref = s['ref_durlock']
    if not s['insumos']:
        skipped.append((ref, s['nombre'], s.get('nota', '')))
        continue
    group = GROUP[s['categoria']]
    ins = {}
    for i in s['insumos']:
        name = norm_name(i['insumo'])
        unit = UNITS.get(i['unidad'], i['unidad'])
        ins[name] = (unit, ins.get(name, (unit, 0))[1] + float(i['coef_m2']))
    names = list(ins)
    has_masilla = any(n.startswith('Masilla') for n in names)
    has_lana = any(n.startswith('Aislante para muros') for n in names)
    paint = has_masilla or any(n.startswith('Base Coat') for n in names)
    junta = 'Incluye estructura, placas, fijaciones' + (', cinta y masillado de juntas' if has_masilla else '')
    systems.append({
        'ref': ref,
        'code': f'OF-DUR-{ref:03d}',
        'group': group,
        'categoria': s['categoria'],
        'nombre': s['nombre'],
        'name': f"{s['nombre']} (Durlock)",
        'includes': f"{s['categoria']} en seco, sistema Durlock. {junta}, con las cantidades del calculador de Durlock."
                    + (' La pintura va aparte.' if paint else ''),
        'scope': 'Opcionales aparte: ' + ', '.join(sorted({norm_name(o['insumo']) for o in s.get('opcionales', [])})) if s.get('opcionales') else 'Sistema completo según Durlock',
        'insumos': ins,
        'yield': YIELD[ref],
        'paint': paint,
        'lana': has_lana,
        'label': f"{s['nombre']} — {'; '.join(tails.get(ref, [s['categoria'].lower()]))}",
        'order': order.index(ref) if ref in order else 999,
    })

systems.sort(key=lambda x: (x['group'], x['order']))

# master_tasks tiene nombre único entre los APU globales activos: los nombres repetidos
# (por ejemplo, el mismo Cedral en interior y exterior) llevan la categoría.
_seen = {}
for s in systems:
    _seen.setdefault(s['nombre'].lower(), []).append(s)
for group in _seen.values():
    if len(group) > 1:
        for s in group:
            s['name'] = f"{s['nombre']} — {s['categoria'].lower()} (Durlock)"

all_ins: dict[str, str] = {}
for s in systems:
    for n, (u, _) in s['insumos'].items():
        all_ins.setdefault(n, u)
ADDON_INS = {'Banda acústica': 'ml', 'Sellador Promaseal-A': 'u', 'Barrera de agua y viento': 'm²'}
for n, u in ADDON_INS.items():
    all_ins.setdefault(n, u)
res_code = {n: f'OF-DUR-M{i + 1:02d}' for i, n in enumerate(sorted(all_ins, key=str.lower))}

# Adicionales que en Durlock son opcionales y se cotizan aparte
ADDONS = [
    ('OF-DUR-901', 'Banda acústica perimetral (Durlock)', 'ml', RUBRO['pared'],
     'Banda acústica bajo soleras y montantes perimetrales para cortar la transmisión de ruido y vibraciones.',
     'Perímetro del tabique', 80, [('Banda acústica', 1.0)]),
    ('OF-DUR-902', 'Sellado de juntas y pasos con Promaseal-A (Durlock)', 'm²', RUBRO['pared'],
     'Sellador intumescente en juntas perimetrales y pasos de instalaciones para mantener la resistencia al fuego del tabique.',
     'Coeficiente del calculador de Durlock: 0,55 u/m²', 60, [('Sellador Promaseal-A', 0.55)]),
    ('OF-DUR-903', 'Barrera de agua y viento (Durlock)', 'm²', RUBRO['revestimiento'],
     'Membrana hidrófuga y respirable detrás del revestimiento exterior para proteger la estructura del agua y el viento.',
     'Coeficiente del calculador de Durlock: 1,05 m²/m²', 60, [('Barrera de agua y viento', 1.05)]),
]


def q(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def num(x: float) -> str:
    return f'{x:.4f}'.rstrip('0').rstrip('.')


# ── SQL ─────────────────────────────────────────────────────────────────────
lines = []
lines.append(f"""-- =============================================================================
-- Migración 065: Sistemas Durlock en la base maestra ObraFlow
--
-- Generada con scripts/durlock/build_durlock.py desde el relevamiento del calculador
-- de durlock.com (31/10/2026, superficie de prueba 100 m²). No editar a mano.
--
-- Crea o actualiza en el catálogo general (organization_id IS NULL):
--   · {len(all_ins)} insumos Durlock (OF-DUR-M..), con conversion_factor = 1 para que la
--     lista de compras redondee hacia arriba;
--   · {len(systems)} APU, uno por sistema (OF-DUR-<ref Durlock>), con los coeficientes por m²;
--   · {len(ADDONS)} APU adicionales para los opcionales que se cotizan aparte (OF-DUR-9..).
-- Mano de obra: durlero + ayudante de gremio (OF-GR-DUR y OF-GR-AYU, ya existentes),
-- con rendimientos estimados por tipo de sistema que incluyen el encintado y masillado.
-- Precios con IVA relevados el 31/10/2026 en corralones y comercios del AMBA (la fuente
-- de cada uno queda en resources.pricing_notes); los marcados "Estimado" deben verificarse.
-- Sistemas sin relevar completos y no incluidos: {', '.join(str(r) for r, *_ in skipped) or 'ninguno'}.
--
-- Idempotente: se puede ejecutar más de una vez. No toca APU de empresas ni presupuestos.
-- =============================================================================

BEGIN;

INSERT INTO public.catalogs (name, type, organization_id, is_active)
SELECT 'Catálogo ObraFlow', 'global', NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.catalogs WHERE name = 'Catálogo ObraFlow' AND organization_id IS NULL);

CREATE TEMP TABLE _of_res (code text, name text, unit text, type text, cost numeric, social numeric, notes text) ON COMMIT DROP;
INSERT INTO _of_res VALUES""")
rows = []
for n in sorted(all_ins, key=str.lower):
    cost, note = PRICES.get(n, (0, NO_PRICE))
    rows.append(f"  ({q(res_code[n])}, {q(n)}, {q(all_ins[n])}, 'MATERIAL', {num(cost) if cost else '0'}, NULL, {q(note)})")
lines.append(',\n'.join(rows) + ';')
lines.append("""
INSERT INTO public.resources (catalog_id, organization_id, code, name, unit, base_cost, type, social_charges_pct,
                              pricing_notes, commercial_unit, conversion_factor, is_active)
SELECT c.id, NULL, r.code, r.name, r.unit, r.cost, r.type, r.social, r.notes, r.unit, 1, true
FROM _of_res r CROSS JOIN (SELECT id FROM public.catalogs WHERE name = 'Catálogo ObraFlow' AND organization_id IS NULL LIMIT 1) c
ON CONFLICT (catalog_id, code) DO UPDATE SET
  name = EXCLUDED.name, unit = EXCLUDED.unit, base_cost = EXCLUDED.base_cost, type = EXCLUDED.type,
  social_charges_pct = EXCLUDED.social_charges_pct, pricing_notes = EXCLUDED.pricing_notes,
  commercial_unit = EXCLUDED.commercial_unit, conversion_factor = EXCLUDED.conversion_factor, is_active = true;

CREATE TEMP TABLE _of_tasks (code text, name text, unit text, category text, description text, specifications text, daily_yield numeric) ON COMMIT DROP;
INSERT INTO _of_tasks VALUES""")
rows = []
for s in systems:
    rows.append(f"  ({q(s['code'])}, {q(s['name'])}, 'm²', {q(RUBRO[s['group']])}, {q(s['includes'])}, {q(s['scope'])}, {num(s['yield'])})")
for code, name, unit, cat, desc, spec, y, _ in ADDONS:
    rows.append(f"  ({q(code)}, {q(name)}, {q(unit)}, {q(cat)}, {q(desc)}, {q(spec)}, {num(y)})")
lines.append(',\n'.join(rows) + ';')
lines.append("""
CREATE TEMP TABLE _of_yields (task_code text, res_code text, qty numeric) ON COMMIT DROP;
INSERT INTO _of_yields VALUES""")
rows = []
for s in systems:
    rows.append(f"  ({q(s['code'])}, 'OF-GR-DUR', 1.0)")
    rows.append(f"  ({q(s['code'])}, 'OF-GR-AYU', 1.0)")
    for n, (u, c) in s['insumos'].items():
        rows.append(f"  ({q(s['code'])}, {q(res_code[n])}, {num(c)})")
for code, *_, ins in ADDONS:
    rows.append(f"  ({q(code)}, 'OF-GR-DUR', 1.0)")
    for n, c in ins:
        rows.append(f"  ({q(code)}, {q(res_code[n])}, {num(c)})")
lines.append(',\n'.join(rows) + ';')
lines.append("""
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

COMMIT;
""")
OUT_SQL.write_text('\n'.join(lines), encoding='utf-8')

# ── TypeScript ──────────────────────────────────────────────────────────────
def js(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)

ts = ['// Generado con scripts/durlock/build_durlock.py desde el calculador de durlock.com. No editar a mano.',
      '',
      "export type DurlockGroup = 'pared' | 'revestimiento' | 'cielorraso';",
      '',
      'export interface DurlockSystem {',
      '  ref: number;',
      '  code: string;',
      '  group: DurlockGroup;',
      '  /** Exterior: lleva barrera de agua y viento. */',
      '  exterior: boolean;',
      '  name: string;',
      '  label: string;',
      '  includes: string;',
      '  scope: string;',
      '  /** Lleva masilla o base coat: se pinta. */',
      '  paint: boolean;',
      '  /** Ya trae lana de vidrio. */',
      '  lana: boolean;',
      '}',
      '',
      'export const DURLOCK_SYSTEMS: DurlockSystem[] = [']
for s in systems:
    ext = 'exterior' in s['categoria'].lower() or 'int/ext' in s['categoria'].lower()
    ts.append(f"  {{ ref: {s['ref']}, code: {js(s['code'])}, group: {js(s['group'])}, exterior: {str(ext).lower()}, "
              f"name: {js(s['name'])}, label: {js(s['label'])}, includes: {js(s['includes'])}, scope: {js(s['scope'])}, "
              f"paint: {str(s['paint']).lower()}, lana: {str(s['lana']).lower()} }},")
ts.append('];')
ts.append('')
ts.append('export const DURLOCK_ADDONS = {')
ts.append("  banda: 'OF-DUR-901',")
ts.append("  promaseal: 'OF-DUR-902',")
ts.append("  barrera: 'OF-DUR-903',")
ts.append('} as const;')
ts.append('')
OUT_TS.write_text('\n'.join(ts), encoding='utf-8')

print(f'{len(systems)} sistemas, {len(all_ins)} insumos, {len(ADDONS)} adicionales; omitidos: {skipped}')
print('con precio:', sum(1 for n in all_ins if n in PRICES), '/', len(all_ins))
missing_price_keys = [k for k in PRICES if k not in all_ins]
print('claves de precio sin insumo:', missing_price_keys)
print('sin precio:', [n for n in all_ins if n not in PRICES])
