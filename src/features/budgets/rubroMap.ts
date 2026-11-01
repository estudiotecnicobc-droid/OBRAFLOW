import { INITIAL_RUBROS } from '../../../constants';

const OFFICIAL = new Set(INITIAL_RUBROS);
const byNumber = new Map(INITIAL_RUBROS.map(r => [r.slice(0, 2), r]));
const R = (n: string) => byNumber.get(n) ?? n;

const strip = (s: string) =>
  s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^\d+\s*[.-]?\s*/, '');

/** Categorías de APU (familias) que no son rubros y su rubro oficial. */
const FAMILY: Record<string, string> = {
  'cielorrasos': '13', 'cubiertas': '16', 'estructura de hormigon armado': '05', 'estructura ha': '05',
  'estructura h.a.': '05', 'estructura h°a°': '05',
  'fundaciones': '04', 'hormigones': '92', 'mamposteria': '06', 'morteros': '91', 'mezclas': '91',
  'movimiento de suelos': '03', 'pinturas': '34', 'pintura': '34', 'revestimientos': '14', 'revoques': '08',
  'demoliciones': '01', 'zocalos': '12', 'carpetas': '10', 'contrapisos': '09', 'pisos': '11',
};

/** Familias que agrupan varios rubros: se decide por el nombre de la tarea. */
const BY_NAME: [RegExp, string][] = [
  [/pintur|latex|esmalte|barniz/, '34'],
  [/revoque|azotad|grueso|fino a la cal/, '08'],
  [/contrapiso/, '09'],
  [/carpeta/, '10'],
  [/zocalo/, '12'],
  [/cielorraso/, '13'],
  [/revestim|azulejo/, '14'],
  [/piso|porcelanato|ceramic|parquet|baldosa/, '11'],
  [/membrana|cubierta|teja|chapa|zingu|canaleta pluvial/, '16'],
  [/capa aisladora|hidrofug|aislaci|barrera/, '07'],
  [/gas/, '25'],
  [/electric|boca|tomacorriente|tablero|cable|iluminaci/, '26'],
  [/agua|desague|cloaca|sanitari|inodoro|bacha|griferia|termotanque/, '23'],
  [/aire acondicionado|split/, '29'],
  [/calefacci|radiador|losa radiante/, '28'],
  [/excavaci|terraplen|relleno|nivelaci|desmonte/, '03'],
  [/zapata|pilote|platea|fundaci|base aislada|viga de fundaci/, '04'],
  [/viga|losa|columna|encadenad|tronco|h°a°|hormigon armado/, '05'],
  [/mamposter|ladrillo|bloque|tabique/, '06'],
  [/mortero|mezcla/, '91'],
  [/hormigon/, '92'],
  [/sellad|junta/, '94'],
  [/demolic|picado|retiro/, '01'],
];
const MIXED: Record<string, string> = {
  'obra gruesa': '06', 'instalaciones': '26', 'terminaciones': '32', 'contrapisos y pisos': '11', 'aislaciones': '07',
};

/** Rubro oficial del presupuesto para la categoría de una tarea. */
export function officialRubro(category?: string, taskName?: string): string {
  const cat = (category ?? '').trim();
  if (!cat) return 'Otros';
  if (OFFICIAL.has(cat)) return cat;
  const num = cat.match(/^(\d{2})\s/)?.[1];
  if (num && byNumber.has(num) && strip(byNumber.get(num)!) === strip(cat)) return byNumber.get(num)!;
  const key = strip(cat);
  if (FAMILY[key]) return R(FAMILY[key]);
  if (MIXED[key] !== undefined) {
    const name = strip(taskName ?? '');
    const hit = BY_NAME.find(([re]) => re.test(name));
    return R(hit ? hit[1] : MIXED[key]);
  }
  return cat;
}

/** true si el nombre es una familia de APU que no debería figurar como rubro. */
export function isLegacyRubro(rubro: string): boolean {
  if (OFFICIAL.has(rubro)) return false;
  const key = strip(rubro);
  return !!FAMILY[key] || MIXED[key] !== undefined;
}
