// Fichas técnicas del catálogo (esquemas propios en public/catalogo/fichas y
// datos en fichas.json). Se asocian por número de rubro y palabras clave del
// nombre de la tarea; no dependen de la base de datos.
import fichasData from './fichas.json';

export interface FichaSection { title: string; rows?: string[][]; items?: string[] }
export interface Ficha {
  code: string; slug: string; title: string; gremio: string; unit: string;
  caption: string; description: string; sections: FichaSection[];
}
export interface TaskLike { code?: string | null; name?: string | null; category?: string | null }

const FICHAS = fichasData as Ficha[];
const BY_SLUG = new Map(FICHAS.map(f => [f.slug, f]));

export const norm = (s?: string | null) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function rubroNumber(category?: string | null): string | null {
  const m = category?.trim().match(/^(\d{2})\b/);
  return m ? m[1] : null;
}

const SECO = /durlock|placa de yeso|\bplaca\b|superboard|aquaboard|cedral|construccion en seco/;

// Orden: de lo más específico a lo más general.
const RULES: { slug: string; rubros: string[]; re: RegExp; seco?: boolean }[] = [
  { slug: 'cs-cie-jt-12', rubros: ['13', '06', '14'], re: /cielorraso/, seco: true },
  { slug: 'cs-rev-om-12', rubros: ['14', '06'], re: /revestimiento|revoque seco|omega/, seco: true },
  { slug: 'cs-tab-70-1x12', rubros: ['06', '14'], re: /pared|tabique|placa/, seco: true },
  { slug: 'dem-mam', rubros: ['01'], re: /mamposter|muro|ladrillo|tabique/ },
  { slug: 'ms-exc', rubros: ['03', '04'], re: /excav|zanja/ },
  { slug: 'ha-zap', rubros: ['04'], re: /zapata|cimiento|fundaci|base/ },
  { slug: 'ha-los', rubros: ['05'], re: /vigueta|pretensad/ },
  { slug: 'ha-enc', rubros: ['05', '04'], re: /encadenad|viga/ },
  { slug: 'ha-col', rubros: ['05'], re: /columna/ },
  { slug: 'ha-lma', rubros: ['05'], re: /losa/ },
  { slug: 'mam-cap', rubros: ['06', '07', '93'], re: /capa aisladora|cajon hidrofugo|cajon/ },
  { slug: 'mam-com15', rubros: ['06'], re: /ladrillo comun|ladrillos comunes|\bcomun\b/ },
  { slug: 'mam-hue12', rubros: ['06'], re: /hueco|ceramico/ },
  { slug: 'rev-ext', rubros: ['08'], re: /exterior|azotado/ },
  { slug: 'rev-int', rubros: ['08'], re: /revoque|grueso|fino/ },
  { slug: 'yes-cie', rubros: ['13', '15'], re: /cielorraso.*(yeso|aplicado)|aplicado/ },
  { slug: 'yes-enl', rubros: ['15'], re: /yeso|jaharro|enlucido/ },
  { slug: 'pis-con', rubros: ['09'], re: /contrapiso/ },
  { slug: 'pis-car', rubros: ['10'], re: /carpeta/ },
  { slug: 'pis-zoc', rubros: ['12'], re: /zocalo/ },
  { slug: 'pis-cer', rubros: ['11'], re: /ceramic|porcel/ },
  { slug: 'rev-cer', rubros: ['14'], re: /ceramic|porcel|azulej/ },
  { slug: 'imp-ban', rubros: ['07', '16', '93'], re: /impermeab.*(bano|cementici)|cementici/ },
  { slug: 'cub-mem', rubros: ['16', '93'], re: /membrana|azotea/ },
  { slug: 'cub-tej', rubros: ['16'], re: /teja/ },
  { slug: 'cub-cha', rubros: ['16'], re: /chapa/ },
  { slug: 'san-clo', rubros: ['23'], re: /cloaca/ },
  { slug: 'san-plu', rubros: ['23'], re: /pluvial/ },
  { slug: 'san-tan', rubros: ['23'], re: /tanque/ },
  { slug: 'san-ino', rubros: ['23'], re: /inodoro/ },
  { slug: 'san-lav', rubros: ['23'], re: /lavatorio|vanitory/ },
  { slug: 'san-agu', rubros: ['23'], re: /agua|termofusion/ },
  { slug: 'gas-can', rubros: ['25'], re: /gas|caneria/ },
  { slug: 'ele-tab', rubros: ['26'], re: /tablero/ },
  { slug: 'ele-pat', rubros: ['26'], re: /jabalina|puesta a tierra/ },
  { slug: 'ele-boc', rubros: ['26'], re: /boca|toma|punto/ },
  { slug: 'car-alu', rubros: ['17'], re: /ventana|aluminio/ },
  { slug: 'car-mar', rubros: ['17', '18'], re: /marco/ },
  { slug: 'car-pue', rubros: ['18'], re: /puerta/ },
  { slug: 'equ-mes', rubros: ['30', '31'], re: /mesada/ },
  { slug: 'pin-esm', rubros: ['34'], re: /esmalte|sintetic/ },
  { slug: 'pin-ext', rubros: ['34'], re: /exterior|acrilic/ },
  { slug: 'pin-lat', rubros: ['34'], re: /latex/ },
  { slug: 'ext-ver', rubros: ['35'], re: /vereda|baldosa/ },
];

// Imagen representativa de cada rubro.
const RUBRO_FICHA: Record<string, string> = {
  '01': 'dem-mam', '03': 'ms-exc', '04': 'ha-zap', '05': 'ha-col', '06': 'mam-hue12', '07': 'mam-cap',
  '08': 'rev-int', '09': 'pis-con', '10': 'pis-car', '11': 'pis-cer', '12': 'pis-zoc', '13': 'cs-cie-jt-12',
  '14': 'rev-cer', '15': 'yes-enl', '16': 'cub-cha', '17': 'car-alu', '18': 'car-pue', '23': 'san-ino',
  '25': 'gas-can', '26': 'ele-boc', '30': 'equ-mes', '34': 'pin-lat', '35': 'ext-ver',
};

export const fichaImage = (f: Ficha) => `/catalogo/fichas/${f.slug}.svg`;

/** Ficha técnica que corresponde a la tarea; null si no hay una específica. */
export function findFicha(task: TaskLike): Ficha | null {
  const name = norm(task.name);
  const rubro = rubroNumber(task.category);
  const seco = SECO.test(name);
  for (const r of RULES) {
    if (r.seco !== undefined && r.seco !== seco) continue;
    if (rubro && !r.rubros.includes(rubro)) continue;
    if (r.re.test(name)) return BY_SLUG.get(r.slug) ?? null;
  }
  return null;
}

export function rubroFicha(category?: string | null): Ficha | null {
  const n = rubroNumber(category);
  const slug = n ? RUBRO_FICHA[n] : undefined;
  return slug ? BY_SLUG.get(slug) ?? null : null;
}
