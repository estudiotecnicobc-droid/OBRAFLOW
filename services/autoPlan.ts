// ---------------------------------------------------------------------------
// autoPlan — arma los vínculos del plan de trabajos a partir del presupuesto.
//
// Dentro de cada rubro las tareas se encadenan Fin-Comienzo en el orden del
// presupuesto (una cuadrilla por rubro). Entre rubros se usa una secuencia
// constructiva típica: el primer ítem de un rubro empieza cuando terminan los
// rubros que lo preceden. Las instalaciones se parten en dos etapas: la gruesa
// (cañerías, cableado, conductos) antes de los revoques y la de terminación
// (artefactos, griferías, tableros, equipos, pruebas) después de pisos y
// revestimientos.
// ---------------------------------------------------------------------------
import { LinkType, ProjectDependency } from '../types';

export interface AutoPlanItem {
  id: string;
  /** Rubro oficial, por ejemplo "23 INSTALACIÓN SANITARIA". */
  rubro: string;
  name: string;
}

type Pred = string | [string, LinkType, number];

const INST = ['22', '23', '24', '25', '26', '27', '28', '29', '36', '37'];
const INST_A = INST.map(r => r + 'a');

/** Rubros (o etapas de instalación) que deben terminar antes de empezar cada rubro. */
const PREDECESSORS: Record<string, Pred[]> = {
  '02': ['01'],
  '03': ['02'],
  '04': ['03'],
  '05': ['04'],
  '06': ['05'],
  '07': [['06', LinkType.SS, 1]],
  '16': ['05', '06'],
  '19': ['06'],
  ...Object.fromEntries(INST_A.map(r => [r, ['06']])),
  '08': ['06', '07', ...INST_A],
  '15': ['06', '26a'],
  '13': ['16', '22a', '23a', '26a', '28a', '29a'],
  '09': ['08'],
  '10': ['09'],
  '17': ['08'],
  '18': ['08'],
  '20': ['17'],
  '21': ['18'],
  '14': ['10'],
  '11': ['10'],
  '12': ['11'],
  '32': ['11'],
  '33': ['17', '18'],
  '34': ['11', '13', '14', '15'],
  ...Object.fromEntries(INST.map(r => [r + 'b', [r + 'a', '11', '14']])),
  '30': ['14', '23b'],
  '31': ['14'],
  '35': ['16'],
  '38': ['34', '35', ...INST.map(r => r + 'b')],
};

/** Orden en que se listan los rubros en la vista previa. */
export const PLAN_ORDER = [
  '01', '02', '03', '04', '05', '06', '07', '16', '19', ...INST_A, '08', '15', '13', '09', '10', '17', '18', '20',
  '21', '14', '11', '12', '32', '33', '34', ...INST.map(r => r + 'b'), '30', '31', '35', '38', '90', '91', '92', '93', '94', '95',
];

const STAGE_B = /coloc|artefact|grifer|tablero|luminar|aplique|timbre|ventilador|equipo|prueba|termotanque|calef[oó]n|caldera|calefactor|estufa|termostato|split|radiador|bomba|motor|grupo electr|panel|ascensor|puesta en marcha|portero|c[aá]maras? de seguridad|sensor|central|rack|punto de acceso|grabador|dom[oó]tica|control de acceso|ensayo|habilitaci|inodoro|bidet|lavatorio|plato de ducha|ba[ñn]era|pileta de lavar|mampara|canilla|accesorios|matafuego|luz de emergencia|cartel|detector|rejilla/i;
/** Lo que se hace con la obra gruesa aunque el nombre parezca de terminación. */
const STAGE_A = /preinstalaci|conducto|ca[ñn]er[ií]a|desag[uü]e|distribuci|boca|c[aá]mara de inspecci|c[aá]mara s[eé]ptica|pozo/i;

/** Gastos que duran toda la obra: no se encadenan y se estiran a todo el plazo. */
const OVERHEAD = /seguro|seguridad e higiene|ba[ñn]o qu[ií]mico|alquiler|vigilancia|sereno|limpieza peri[oó]dica|agua y energ[ií]a|direcci[oó]n de obra|conducci[oó]n|jefe de obra|cartel de obra|obrador/i;
export const OVERHEAD_NODE = 'gen';

/** Nodo del plan al que pertenece una tarea: "23a", "23b", "gen" o el número de rubro. */
export function planNode(item: AutoPlanItem): string {
  const num = item.rubro.trim().slice(0, 2);
  if (OVERHEAD.test(item.name) || ['90', '91', '92', '93', '94', '95'].includes(num)) return OVERHEAD_NODE;
  if (!/^\d\d$/.test(num)) return 'otros';
  if (INST.includes(num)) return num + (STAGE_B.test(item.name) && !STAGE_A.test(item.name) ? 'b' : 'a');
  return num;
}

export function buildAutoPlan(items: AutoPlanItem[], newId: () => string): ProjectDependency[] {
  const groups = new Map<string, AutoPlanItem[]>();
  for (const it of items) {
    const n = planNode(it);
    if (!groups.has(n)) groups.set(n, []);
    groups.get(n)!.push(it);
  }

  const deps: ProjectDependency[] = [];
  const link = (from: string, to: string, type: LinkType = LinkType.FS, lag = 0) =>
    deps.push({ id: newId(), fromTaskId: from, toTaskId: to, type, lag });

  groups.delete(OVERHEAD_NODE);

  // 1. Dentro de cada rubro, en serie.
  groups.forEach(list => {
    for (let i = 1; i < list.length; i++) link(list[i - 1].id, list[i].id);
  });

  // 2. Entre rubros. Si un rubro predecesor no está en el presupuesto, se usan sus propios predecesores.
  const resolve = (pred: Pred, seen: Set<string>): [string, LinkType, number][] => {
    const [node, type, lag] = typeof pred === 'string' ? [pred, LinkType.FS, 0] : pred;
    if (groups.has(node)) return [[node, type, lag]];
    if (seen.has(node)) return [];
    seen.add(node);
    return (PREDECESSORS[node] ?? []).flatMap(p => resolve(p, seen));
  };

  groups.forEach((list, node) => {
    const first = list[0];
    const done = new Set<string>();
    for (const pred of PREDECESSORS[node] ?? []) {
      for (const [p, type, lag] of resolve(pred, new Set([node]))) {
        if (p === node || done.has(p)) continue;
        done.add(p);
        const plist = groups.get(p)!;
        const from = type === LinkType.SS ? plist[0] : plist[plist.length - 1];
        link(from.id, first.id, type, lag);
      }
    }
  });

  return deps;
}
