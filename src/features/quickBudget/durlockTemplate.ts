import type { QuickInput, QuickTask, QuickTemplate, V } from './types';
import { DURLOCK_ADDONS, DURLOCK_SYSTEMS, type DurlockGroup, type DurlockSystem } from './durlockSystems';

const BY_REF = new Map(DURLOCK_SYSTEMS.map(s => [s.ref, s]));
const DEFAULTS: Record<DurlockGroup, number> = { pared: 4, revestimiento: 49, cielorraso: 22 };

export const durlockSystem = (ref: number): DurlockSystem | undefined => BY_REF.get(ref);

const systemInput = (key: string, label: string, group: DurlockGroup, note: string): QuickInput => ({
  key,
  label,
  kind: 'option',
  default: DEFAULTS[group],
  unit: '—',
  note,
  options: DURLOCK_SYSTEMS.filter(s => s.group === group).map(s => ({ value: s.ref, label: s.label })),
});

const systemTask = (key: string, area: string, fallback: string): QuickTask => ({
  name: fallback,
  includes: 'Sistema Durlock elegido, con estructura, placas, fijaciones y juntas.',
  scope: '',
  unit: 'm²',
  qty: (v: V) => v[area],
  include: (v: V) => v[area] > 0 && BY_REF.has(v[key]),
  pick: (v: V) => {
    const s = BY_REF.get(v[key]);
    return s ? { name: s.name, code: s.code, includes: s.includes, scope: s.scope } : {};
  },
});

const paints = (key: string, v: V) => BY_REF.get(v[key])?.paint ?? false;

export const DURLOCK_TEMPLATE: QuickTemplate = {
  id: 'durlock',
  name: 'Construcción en seco Durlock',
  description: 'Tabiques, revestimientos y cielorrasos con los sistemas y las cantidades de materiales del calculador de Durlock.',
  inputs: [
    { key: 'lt', label: 'Largo de tabique', kind: 'number', default: 4.0, unit: 'm', note: 'Poner 0 si no hay tabique' },
    { key: 'ht', label: 'Altura de tabique', kind: 'number', default: 2.6, unit: 'm' },
    systemInput('sist_t', 'Sistema de tabique', 'pared', 'Según el uso: sin prestación especial, acústico, contra fuego o para locales húmedos'),
    { key: 'ais', label: '¿Agregar lana de vidrio?', kind: 'bool', default: 0, unit: '—', note: 'Solo si el sistema elegido no la trae' },
    { key: 'banda', label: '¿Banda acústica perimetral?', kind: 'bool', default: 0, unit: '—', note: 'Recomendada en tabiques acústicos' },
    { key: 'pue', label: 'Vanos de puerta', kind: 'number', default: 1, unit: 'u' },
    { key: 'ref', label: 'Refuerzos para colgar muebles o TV', kind: 'number', default: 0, unit: 'ml' },
    { key: 'bt', label: 'Bocas eléctricas en el tabique', kind: 'number', default: 2, unit: 'u' },
    { key: 'sr', label: 'Superficie de revestimiento sobre muro existente', kind: 'number', default: 0, unit: 'm²', note: 'Poner 0 si no hay revestimiento' },
    systemInput('sist_r', 'Sistema de revestimiento', 'revestimiento', 'Interior o exterior'),
    { key: 'sc', label: 'Superficie de cielorraso', kind: 'number', default: 12, unit: 'm²', note: 'Poner 0 si no hay cielorraso' },
    systemInput('sist_c', 'Sistema de cielorraso', 'cielorraso', 'Interior o exterior'),
    { key: 'pc', label: 'Perímetro del cielorraso', kind: 'number', default: 14, unit: 'ml' },
    { key: 'tap', label: 'Tapas de inspección', kind: 'number', default: 1, unit: 'u' },
  ],
  calcs: [
    { key: 'st', label: 'Superficie de tabique', unit: 'm²', fn: (v: V) => Math.max(0, v.lt * v.ht - v.pue * 0.8 * 2) },
    {
      key: 'sp', label: 'Superficie a pintar', unit: 'm²',
      fn: (v: V) => (paints('sist_t', v) ? v.st * 2 : 0) + (paints('sist_r', v) ? v.sr : 0) + (paints('sist_c', v) ? v.sc : 0),
    },
  ],
  rubros: [
    { rubro: '02 TRABAJOS PRELIMINARES', tasks: [
      { name: 'Replanteo', includes: 'Marcar en obra dónde va cada elemento y sus niveles.', scope: 'Trazado en piso y techo', unit: 'gl', qty: 1, include: true, code: 'OF-PRE-012' },
    ] },
    { rubro: '06 MAMPOSTERÍA, Y OTROS CERRAMIENTOS', tasks: [
      systemTask('sist_t', 'st', 'Tabique Durlock'),
      { name: 'Aislación de lana de vidrio', includes: 'Relleno de lana de vidrio dentro del tabique para aislar sonido y temperatura.', scope: 'Entre montantes', unit: 'm²', qty: (v: V) => v.st, include: (v: V) => v.st > 0 && v.ais === 1 && !BY_REF.get(v.sist_t)?.lana, code: 'OF-TAB-003' },
      { name: 'Banda acústica perimetral (Durlock)', includes: 'Banda acústica bajo soleras y montantes perimetrales para cortar la transmisión de ruido y vibraciones.', scope: 'Perímetro del tabique', unit: 'ml', qty: (v: V) => 2 * (v.lt + v.ht), include: (v: V) => v.st > 0 && v.banda === 1, code: DURLOCK_ADDONS.banda },
      { name: 'Sellado de juntas y pasos con Promaseal-A (Durlock)', includes: 'Sellador intumescente en juntas perimetrales y pasos de instalaciones para mantener la resistencia al fuego del tabique.', scope: 'Solo en tabiques resistentes al fuego', unit: 'm²', qty: (v: V) => v.st, include: (v: V) => v.st > 0 && v.sist_t === 6, code: DURLOCK_ADDONS.promaseal },
      { name: 'Vano de puerta con refuerzos', includes: 'Armar el hueco de la puerta en el tabique con refuerzos. La puerta va aparte.', scope: 'Dintel y montantes dobles', unit: 'u', qty: (v: V) => v.pue, include: (v: V) => v.st > 0, code: 'OF-TAB-004' },
      { name: 'Refuerzos para colgar', includes: 'Maderas o perfiles dentro del tabique para poder colgar muebles o un televisor.', scope: 'Madera o perfil dentro del tabique', unit: 'ml', qty: (v: V) => v.ref, include: (v: V) => v.st > 0 && v.ref > 0, code: 'OF-TAB-005' },
    ] },
    { rubro: '14 REVESTIMIENTOS', tasks: [
      systemTask('sist_r', 'sr', 'Revestimiento Durlock'),
      { name: 'Barrera de agua y viento (Durlock)', includes: 'Membrana hidrófuga y respirable detrás del revestimiento exterior para proteger la estructura del agua y el viento.', scope: 'En revestimientos exteriores', unit: 'm²', qty: (v: V) => v.sr, include: (v: V) => v.sr > 0 && (BY_REF.get(v.sist_r)?.exterior ?? false), code: DURLOCK_ADDONS.barrera },
    ] },
    { rubro: '13 CIELORRASOS', tasks: [
      systemTask('sist_c', 'sc', 'Cielorraso Durlock'),
      { name: 'Buña perimetral', includes: 'Perfil en el encuentro del cielorraso con la pared para una terminación prolija.', scope: 'Perfil buña', unit: 'ml', qty: (v: V) => v.pc, include: (v: V) => v.sc > 0 && paints('sist_c', v), code: 'OF-CIE-004' },
      { name: 'Tapas de inspección', includes: 'Tapa con marco en el cielorraso para acceder a cañerías o cables.', scope: 'Con marco', unit: 'u', qty: (v: V) => v.tap, include: (v: V) => v.sc > 0 && v.tap > 0, code: 'OF-CIE-005' },
    ] },
    { rubro: '15 YESERIA', tasks: [
      { name: 'Cantoneras', includes: 'Perfil metálico en las esquinas del tabique para que no se golpeen.', scope: 'En aristas', unit: 'ml', qty: (v: V) => v.ht * 2, include: (v: V) => v.st > 0 && paints('sist_t', v), code: 'OF-YES-002' },
    ] },
    { rubro: '26 INSTALACIÓN ELÉCTRICA', tasks: [
      { name: 'Bocas eléctricas en tabique', includes: 'Caja, caño corrugado y cable para cada punto dentro del tabique.', scope: 'Caja, caño corrugado y cableado', unit: 'u', qty: (v: V) => v.bt, include: (v: V) => v.st > 0 && v.bt > 0, code: 'OF-ELE-008' },
    ] },
    { rubro: '34 PINTURA', tasks: [
      { name: 'Pintura látex', includes: 'Fijador y dos manos de látex.', scope: 'Fijador y dos manos', unit: 'm²', qty: (v: V) => v.sp, include: (v: V) => v.sp > 0, code: 'OF-PIN-004' },
    ] },
    { rubro: '90 AUXILIARES', tasks: [
      { name: 'Limpieza final de obra', includes: 'Limpieza de la obra al terminar y retiro de protecciones y sobrantes.', scope: '', unit: 'gl', qty: 1, include: true, code: 'OF-AUX-003' },
    ] },
  ],
};
