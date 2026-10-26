// Generado desde las plantillas Excel de docs/ (export_ts.py). No editar a mano.
import type { QuickTemplate, V } from './types';

const n = (b: boolean): number => (b ? 1 : 0);
const roundUp = (x: number, d: number): number => { const f = 10 ** d; return Math.ceil(x * f - 1e-9) / f; };

export const QUICK_TEMPLATES: QuickTemplate[] = [
  {
    id: "cocina",
    name: "Remodelación de cocina",
    description: "Demolición, instalaciones de agua, gas y electricidad, revestimientos, muebles, mesada y pintura de una cocina completa.",
    inputs: [
      { key: "m5", label: "Largo de la cocina", kind: "number", default: 3.0, unit: "m", note: "Supuesto: cocina tipo de 3,00 x 2,50; reemplazar por la medida real" },
      { key: "m6", label: "Ancho de la cocina", kind: "number", default: 2.5, unit: "m", note: "Supuesto" },
      { key: "m7", label: "Altura de losa (piso a losa)", kind: "number", default: 2.6, unit: "m", note: "Supuesto: altura habitual; verificar en obra" },
      { key: "m8", label: "Altura de cielorraso", kind: "number", default: 2.5, unit: "m", note: "Supuesto: placa de yeso a 2,50 para pasar el conducto de campana" },
      { key: "m9", label: "Mesada · tramo 1", kind: "number", default: 2.4, unit: "ml", note: "Supuesto: mesada en L" },
      { key: "m10", label: "Mesada · tramo 2", kind: "number", default: 1.2, unit: "ml", note: "Poner 0 si la mesada es lineal" },
      { key: "m11", label: "Largo de alacena", kind: "number", default: 2.4, unit: "ml", note: "Supuesto" },
      { key: "m12", label: "Altura de revestimiento entre mesada y alacena", kind: "number", default: 0.6, unit: "m", note: "Supuesto: franja de 0,60 entre mesada (0,90) y alacena (1,50)" },
      { key: "m13", label: "Ancho de puerta", kind: "number", default: 0.8, unit: "m", note: "Supuesto" },
      { key: "m14", label: "Alto de puerta", kind: "number", default: 2.0, unit: "m", note: "Supuesto" },
      { key: "m15", label: "Ancho de ventana", kind: "number", default: 1.0, unit: "m", note: "Supuesto; poner 0 si no hay ventana" },
      { key: "m16", label: "Alto de ventana", kind: "number", default: 1.1, unit: "m", note: "Supuesto" },
      { key: "m17", label: "Espesor revestimiento + mezcla a picar", kind: "number", default: 0.04, unit: "m", note: "Supuesto para estimar escombros" },
      { key: "m18", label: "Espesor piso + contrapiso a picar", kind: "number", default: 0.12, unit: "m", note: "Supuesto para estimar escombros" },
      { key: "m19", label: "Esponjamiento de escombros", kind: "number", default: 1.4, unit: "coef.", note: "Supuesto usual 1,3 a 1,5" },
      { key: "m20", label: "Largo de canaletas para cañerías", kind: "number", default: 18, unit: "ml", note: "Estimado: agua fría y caliente, desagüe, gas y cableado" },
      { key: "m21", label: "Cantidad de tomacorrientes", kind: "number", default: 6, unit: "u", note: "Supuesto: 4 sobre mesada, heladera y microondas" },
      { key: "m22", label: "Cantidad de bocas de iluminación", kind: "number", default: 2, unit: "u", note: "Supuesto: central y sobre mesada" },
      { key: "m23", label: "Recorrido de cañería de gas", kind: "number", default: 6, unit: "ml", note: "Estimado desde la llave existente hasta anafe y horno" },
    ],
    calcs: [
      { key: "c26", label: "Superficie de piso", unit: "m²", fn: (v: V) => v.m5 * v.m6 },
      { key: "c27", label: "Perímetro", unit: "ml", fn: (v: V) => 2 * (v.m5 + v.m6) },
      { key: "c28", label: "Largo total de mesada", unit: "ml", fn: (v: V) => v.m9 + v.m10 },
      { key: "c29", label: "Superficie de revestimiento entre muebles", unit: "m²", fn: (v: V) => v.c28 * v.m12 },
      { key: "c30", label: "Superficie de paredes a pintar", unit: "m²", fn: (v: V) => Math.max(0, v.c27 * v.m8 - v.m13 * v.m14 - v.m15 * v.m16 - v.c29) },
      { key: "c31", label: "Volumen de escombros (esponjado)", unit: "m³", fn: (v: V) => (v.c29 * v.m17 + v.c26 * v.m18) * v.m19 },
    ],
    rubros: [
      { rubro: "02 TRABAJOS PRELIMINARES", tasks: [
        { name: "Protección de circulaciones y locales lindantes", includes: "Cubrir con nylon y cartón los pisos y marcos por donde se saca el escombro. No incluye la limpieza final.", scope: "Nylon, cartón corrugado y cinta en pisos y marcos del recorrido de escombros", unit: "gl", qty: 1, include: true, code: "OF-PRE-001" },
        { name: "Corte y anulación provisoria de gas", includes: "El gasista matriculado corta el gas y tapona las bocas del anafe y el horno mientras dura la obra.", scope: "Cierre de llave, tapones en bocas de anafe y horno; lo hace gasista matriculado", unit: "gl", qty: 1, include: true, code: "OF-PRE-005" },
        { name: "Corte de agua y desconexión eléctrica del local", includes: "Cerrar el agua y cortar la electricidad del ambiente, con tapones provisorios.", scope: "Cierre de llaves, tapones provisorios y corte del circuito de cocina", unit: "gl", qty: 1, include: true, code: "OF-PRE-006" },
      ] },
      { rubro: "01 DEMOLICIONES", tasks: [
        { name: "Retiro de muebles bajo mesada", includes: "Desarmar y sacar los muebles bajo mesada existentes.", scope: "Desarme y retiro de módulos existentes", unit: "ml", qty: (v: V) => v.c28, include: true, code: "OF-DEM-001" },
        { name: "Retiro de alacenas", includes: "Desarmar y sacar las alacenas existentes.", scope: "Desarme y retiro", unit: "ml", qty: (v: V) => v.m11, include: true, code: "OF-DEM-002" },
        { name: "Retiro de mesada y bacha", includes: "Sacar la mesada de granito o mármol y la bacha.", scope: "Mesada de granito o mármol y bacha", unit: "ml", qty: (v: V) => v.c28, include: true, code: "OF-DEM-003" },
        { name: "Retiro de artefactos", includes: "Desconectar y sacar anafe, horno y campana existentes.", scope: "Anafe, horno y campana existentes", unit: "u", qty: 3, include: true, code: "OF-DEM-004" },
        { name: "Picado de revestimiento de paredes", includes: "Sacar los azulejos o cerámicos con su mezcla hasta el revoque.", scope: "Franja entre mesada y alacena", unit: "m²", qty: (v: V) => v.c29, include: true, code: "OF-DEM-005", note: "Si el revestimiento llega al techo, cambiar la cantidad" },
        { name: "Picado de piso y contrapiso", includes: "Romper y sacar el piso y el contrapiso del ambiente.", scope: "Todo el local", unit: "m²", qty: (v: V) => v.c26, include: true, code: "OF-DEM-006" },
        { name: "Apertura de canaletas para cañerías nuevas", includes: "Abrir surcos en paredes y piso para pasar agua, desagüe, gas y cables.", scope: "Agua, desagüe, gas y cableado", unit: "ml", qty: (v: V) => v.m20, include: true, code: "OF-DEM-010" },
        { name: "Retiro de cañerías en desuso", includes: "Sacar los caños de agua, gas y desagüe que quedan sin uso.", scope: "Agua, gas y desagüe que quedan sin uso", unit: "gl", qty: 1, include: true, code: "OF-DEM-012" },
        { name: "Retiro de escombros", includes: "Embolsar, bajar y llevar el escombro en volquete hasta su disposición final.", scope: "Carga, volquete y disposición", unit: "m³", qty: (v: V) => v.c31, include: true, code: "OF-DEM-013" },
      ] },
      { rubro: "25 INSTALACIÓN DE GAS", tasks: [
        { name: "Cañería de gas a anafe y horno", includes: "Caño de gas aprobado desde la llave existente hasta anafe y horno, hecho por gasista matriculado.", scope: "Epoxi o termofusión aprobada, desde la llave existente", unit: "ml", qty: (v: V) => v.m23, include: true, code: "OF-GAS-001" },
        { name: "Llaves de paso de artefactos", includes: "Una llave de gas para cada artefacto.", scope: "Una por artefacto", unit: "u", qty: 2, include: true, code: "OF-GAS-002" },
        { name: "Prueba de hermeticidad y documentación", includes: "El gasista prueba que no haya pérdidas y presenta la documentación.", scope: "Prueba con manómetro y presentación del gasista matriculado", unit: "gl", qty: 1, include: true, code: "OF-GAS-003" },
        { name: "Rejillas de ventilación reglamentarias", includes: "Rejillas en la pared que exige la normativa de gas.", scope: "Superior e inferior", unit: "u", qty: 2, include: true, code: "OF-GAS-004" },
      ] },
      { rubro: "23 INSTALACIÓN SANITARIA", tasks: [
        { name: "Distribución de agua fría", includes: "Caños de agua fría nuevos desde la llave del local hasta cada artefacto.", scope: "Termofusión desde la llave del local hasta bacha y lavarropas", unit: "ml", qty: 4, include: true, code: "OF-SAN-001" },
        { name: "Distribución de agua caliente", includes: "Caños de agua caliente nuevos desde el termotanque o calefón hasta cada artefacto.", scope: "Termofusión desde el termotanque o calefón", unit: "ml", qty: 4, include: true, code: "OF-SAN-002" },
        { name: "Llaves de paso", includes: "Llaves para cortar el agua fría y caliente del local.", scope: "Agua fría y caliente", unit: "u", qty: 2, include: true, code: "OF-SAN-003" },
        { name: "Desagüe de pileta de cocina", includes: "Caño de desagüe desde la pileta hasta la cámara o pileta de patio.", scope: "PVC 40/50 hasta la pileta de patio o cámara", unit: "ml", qty: 3, include: true, code: "OF-SAN-004" },
        { name: "Conexión para lavarropas o lavavajillas", includes: "Toma de agua y desagüe con sifón para conectar el equipo. Opcional.", scope: "Toma de agua y desagüe con sifón", unit: "u", qty: 1, include: false, code: "OF-SAN-005", note: "Opcional" },
        { name: "Prueba hidráulica", includes: "Probar las cañerías con presión antes de tapar las canaletas.", scope: "Con presión antes de cerrar canaletas", unit: "gl", qty: 1, include: true, code: "OF-SAN-006" },
      ] },
      { rubro: "26 INSTALACIÓN ELÉCTRICA", tasks: [
        { name: "Circuito de tomacorrientes de cocina", includes: "Línea nueva desde el tablero con su térmica y disyuntor, solo para la cocina.", scope: "Línea nueva desde el tablero con térmica y disyuntor", unit: "gl", qty: 1, include: true, code: "OF-ELE-001" },
        { name: "Bocas de tomacorriente", includes: "Caja, caño, cable y tomacorriente en cada punto.", scope: "Cañería, cableado y módulo", unit: "u", qty: (v: V) => v.m21, include: true, code: "OF-ELE-005" },
        { name: "Bocas de iluminación", includes: "Caja, caño, cable, llave y florón para cada luz.", scope: "Cañería, cableado, llave y florón", unit: "u", qty: (v: V) => v.m22, include: true, code: "OF-ELE-006" },
        { name: "Toma especial para horno o anafe eléctrico", includes: "Línea propia de 20 A para horno o anafe eléctrico. Opcional.", scope: "Línea propia de 20 A", unit: "u", qty: 1, include: false, code: "OF-ELE-009", note: "Solo si el horno o anafe es eléctrico" },
        { name: "Iluminación LED bajo alacena", includes: "Perfil de aluminio con tira LED y fuente bajo las alacenas.", scope: "Perfil, tira LED y fuente", unit: "ml", qty: (v: V) => v.m11, include: true, code: "OF-ELE-011" },
      ] },
      { rubro: "22 CONDUCTOS Y VENTILACIONES", tasks: [
        { name: "Campana con conducto a exterior", includes: "Colocar la campana con su conducto de chapa hasta el exterior y sombrerete.", scope: "Conducto de chapa galvanizada y sombrerete", unit: "u", qty: 1, include: true, code: "OF-VEN-001" },
      ] },
      { rubro: "08 REVOQUES", tasks: [
        { name: "Reparación de revoque grueso", includes: "Rehacer el revoque grueso donde se picó el revestimiento.", scope: "Sobre las paredes picadas", unit: "m²", qty: (v: V) => v.c29, include: true, code: "OF-REV-001" },
        { name: "Cierre de canaletas", includes: "Tapar con mezcla los surcos de las cañerías, a ras de la pared.", scope: "Con mortero, a ras del revoque", unit: "ml", qty: (v: V) => v.m20, include: true, code: "OF-REV-002" },
        { name: "Revoque fino en paredes sin revestir", includes: "Revoque fino en paredes dañadas. Si están sanas, no hace falta.", scope: "Solo donde se dañó; si las paredes están sanas, poner No", unit: "m²", qty: (v: V) => v.c30, include: false, code: "OF-REV-003", note: "Por defecto no se incluye" },
      ] },
      { rubro: "09 CONTRAPISOS", tasks: [
        { name: "Reparación de contrapiso", includes: "Rehacer el contrapiso donde se picó, a nivel.", scope: "Donde se picó, a nivel", unit: "m²", qty: (v: V) => v.c26, include: true, code: "OF-CON-001" },
      ] },
      { rubro: "10 CARPETAS", tasks: [
        { name: "Carpeta de nivelación", includes: "Capa de mezcla lisa y nivelada donde se pega el piso.", scope: "Bajo piso nuevo", unit: "m²", qty: (v: V) => v.c26, include: true, code: "OF-CAR-001" },
      ] },
      { rubro: "11 PISOS", tasks: [
        { name: "Colocación de piso cerámico o porcelanato", includes: "Colocación con pegamento y pastina. El material se cotiza aparte.", scope: "Solo colocación; el material va aparte", unit: "m²", qty: (v: V) => v.c26, include: true, code: "OF-PIS-001" },
      ] },
      { rubro: "12 ZÓCALOS", tasks: [
        { name: "Zócalo", includes: "Zócalo a lo largo de las paredes, sin puertas ni muebles.", scope: "Perímetro libre, sin puerta ni mesada", unit: "ml", qty: (v: V) => Math.max(0, v.c27 - v.m13 - v.c28), include: true, code: "OF-ZOC-001" },
      ] },
      { rubro: "14 REVESTIMIENTOS", tasks: [
        { name: "Revestimiento entre mesada y alacena", includes: "Colocación del revestimiento en la franja de pared sobre la mesada.", scope: "Cerámico, porcelanato o venecita", unit: "m²", qty: (v: V) => v.c29, include: true, code: "OF-RVE-001" },
        { name: "Guardacantos o terminación de revestimiento", includes: "Perfil metálico o de PVC que remata el borde del revestimiento.", scope: "Perfil de aluminio o PVC", unit: "ml", qty: (v: V) => v.c28, include: true, code: "OF-RVE-002" },
      ] },
      { rubro: "13 CIELORRASOS", tasks: [
        { name: "Cielorraso de placa de yeso", includes: "Cielorraso suspendido con estructura metálica y placa. Incluye el masillado; la pintura va aparte.", scope: "Suspendido, con perfilería", unit: "m²", qty: (v: V) => v.c26, include: true, code: "OF-CIE-001" },
        { name: "Buña perimetral", includes: "Perfil en el encuentro del cielorraso con la pared para una terminación prolija.", scope: "Perfil buña o cornisa", unit: "ml", qty: (v: V) => v.c27, include: true, code: "OF-CIE-004" },
      ] },
      { rubro: "31 AMOBLAMIENTO", tasks: [
        { name: "Bajo mesada", includes: "Muebles bajo mesada de melamina con cajones, herrajes y zócalo.", scope: "Módulos de melamina 18 mm con herrajes, cajones y zócalo", unit: "ml", qty: (v: V) => v.c28, include: true, code: "OF-AMO-001" },
        { name: "Alacena", includes: "Muebles altos de melamina con puertas.", scope: "Módulos de melamina 18 mm con puertas", unit: "ml", qty: (v: V) => v.m11, include: true, code: "OF-AMO-002" },
        { name: "Columna para horno o heladera", includes: "Mueble alto para empotrar horno o heladera. Opcional.", scope: "Módulo alto", unit: "u", qty: 1, include: false, code: "OF-AMO-003", note: "Opcional" },
        { name: "Mesada de granito o cuarzo", includes: "Mesada con zócalo y frentín, provista y colocada.", scope: "Con zócalo de mesada y frentín", unit: "ml", qty: (v: V) => v.c28, include: true, code: "OF-AMO-004" },
        { name: "Calado de bacha y anafe en mesada", includes: "Cortar y pulir en la mesada los huecos de la bacha y el anafe.", scope: "Cortes y pulido", unit: "u", qty: 2, include: true, code: "OF-AMO-005" },
      ] },
      { rubro: "30 EQUIPAMIENTO", tasks: [
        { name: "Colocación de bacha", includes: "Colocar y conectar la bacha con su sifón.", scope: "Bacha de acero inoxidable con sifón", unit: "u", qty: 1, include: true, code: "OF-EQU-001" },
        { name: "Grifería monocomando de cocina", includes: "Colocar y conectar la grifería. La grifería se cotiza aparte.", scope: "Colocación y conexión", unit: "u", qty: 1, include: true, code: "OF-EQU-002" },
        { name: "Colocación de anafe", includes: "Colocar y conectar el anafe a gas o a electricidad.", scope: "Conexión a gas o eléctrica", unit: "u", qty: 1, include: true, code: "OF-EQU-003" },
        { name: "Colocación de horno", includes: "Empotrar y conectar el horno.", scope: "Empotrado", unit: "u", qty: 1, include: true, code: "OF-EQU-004" },
        { name: "Conexión de lavavajillas", includes: "Conectar agua, desagüe y electricidad del lavavajillas. Opcional.", scope: "Agua, desagüe y toma", unit: "u", qty: 1, include: false, code: "OF-EQU-005", note: "Opcional" },
      ] },
      { rubro: "34 PINTURA", tasks: [
        { name: "Pintura de cielorraso", includes: "Látex para cielorrasos en dos manos.", scope: "Látex para cielorrasos, 2 manos", unit: "m²", qty: (v: V) => v.c26, include: true, code: "OF-PIN-001" },
        { name: "Pintura de paredes", includes: "Látex antihongo en dos manos.", scope: "Látex antihongo, 2 manos", unit: "m²", qty: (v: V) => v.c30, include: true, code: "OF-PIN-002" },
        { name: "Pintura de puerta y marco", includes: "Esmalte sintético en la puerta y su marco.", scope: "Esmalte sintético", unit: "gl", qty: 1, include: true, code: "OF-PIN-003" },
      ] },
      { rubro: "17 CARPINTERÍA METÁLICA Y DE PVC", tasks: [
        { name: "Ajuste o recambio de ventana", includes: "Ajustar o cambiar la ventana según su estado. Opcional.", scope: "Según estado", unit: "u", qty: 1, include: false, code: "OF-ABE-001", note: "Opcional" },
      ] },
      { rubro: "94 SELLADORES Y JUNTAS", tasks: [
        { name: "Sellado de mesada, bacha y revestimiento", includes: "Silicona sanitaria en las juntas de la mesada, la bacha y el revestimiento.", scope: "Silicona sanitaria", unit: "ml", qty: (v: V) => v.c28 * 2, include: true, code: "OF-SEL-001" },
      ] },
      { rubro: "90 AUXILIARES", tasks: [
        { name: "Limpieza final de obra", includes: "Limpieza de la obra al terminar y retiro de protecciones y sobrantes.", scope: "Local y circulaciones", unit: "m²", qty: (v: V) => v.c26, include: true, code: "OF-AUX-002" },
      ] },
    ],
  },
  {
    id: "muro",
    name: "Muro de mampostería",
    description: "Pared de ladrillo hueco con columnas y encadenado, con cimiento nuevo o apoyada sobre una base existente, con revoques y pintura.",
    inputs: [
      { key: "m5", label: "Largo del muro", kind: "number", default: 6.0, unit: "m", note: "Supuesto; reemplazar por la medida real" },
      { key: "m6", label: "Altura del muro", kind: "number", default: 2.6, unit: "m", note: "Supuesto" },
      { key: "m7", label: "Espesor del muro", kind: "number", default: 0.18, unit: "m", note: "Ladrillo cerámico hueco 18 x 18 x 33" },
      { key: "m8", label: "¿Con cimiento?", kind: "bool", default: 1, unit: "—", note: "Cambia qué tareas se incluyen" },
      { key: "m9", label: "Ancho de zanja", kind: "number", default: 0.4, unit: "m", note: "Supuesto para suelo firme; lo define el cálculo" },
      { key: "m10", label: "Profundidad de zanja", kind: "number", default: 0.6, unit: "m", note: "Supuesto" },
      { key: "m11", label: "Alto de zapata corrida", kind: "number", default: 0.3, unit: "m", note: "Supuesto: zapata de H° ciclópeo + viga de fundación de 0,30" },
      { key: "m12", label: "Separación máxima entre columnas", kind: "number", default: 3.0, unit: "m", note: "Supuesto usual; incluye las de los extremos" },
      { key: "m13", label: "Altura de viga de encadenado", kind: "number", default: 0.2, unit: "m", note: "Supuesto" },
      { key: "m14", label: "Caras a revocar", kind: "number", default: 2, unit: "u", note: "2 = ambas caras; 1 = una sola (por ejemplo medianera)" },
      { key: "m15", label: "¿Muro exterior?", kind: "bool", default: 1, unit: "—", note: "Agrega azotado hidrófugo en una cara" },
      { key: "m16", label: "Esponjamiento de tierra", kind: "number", default: 1.3, unit: "coef.", note: "Supuesto usual" },
    ],
    calcs: [
      { key: "c19", label: "Superficie de muro", unit: "m²", fn: (v: V) => v.m5 * v.m6 },
      { key: "c20", label: "Cantidad de columnas", unit: "u", fn: (v: V) => roundUp(v.m5 / v.m12, 0) + 1 },
      { key: "c21", label: "Volumen de excavación", unit: "m³", fn: (v: V) => v.m8 * v.m5 * v.m9 * v.m10 },
      { key: "c22", label: "Volumen de zapata corrida", unit: "m³", fn: (v: V) => v.m8 * v.m5 * v.m9 * v.m11 },
      { key: "c23", label: "Volumen de viga de fundación", unit: "m³", fn: (v: V) => v.m8 * v.m5 * v.m7 * (v.m10 - v.m11) },
      { key: "c24", label: "Volumen de columnas", unit: "m³", fn: (v: V) => v.c20 * v.m7 * 0.2 * v.m6 },
      { key: "c25", label: "Volumen de viga de encadenado", unit: "m³", fn: (v: V) => v.m5 * v.m7 * v.m13 },
      { key: "c26", label: "Superficie a revocar", unit: "m²", fn: (v: V) => v.c19 * v.m14 },
      { key: "c27", label: "Superficie con hidrófugo", unit: "m²", fn: (v: V) => v.c19 * v.m15 },
      { key: "c28", label: "Volumen de relleno", unit: "m³", fn: (v: V) => Math.max(0, v.c21 - v.c22 - v.c23) },
      { key: "c29", label: "Tierra sobrante (esponjada)", unit: "m³", fn: (v: V) => (v.c21 - v.c28) * v.m16 },
    ],
    rubros: [
      { rubro: "02 TRABAJOS PRELIMINARES", tasks: [
        { name: "Limpieza y preparación del sector", includes: "Despejar y nivelar el lugar donde va el muro.", scope: "Retiro de obstáculos y nivelación del área de trabajo", unit: "gl", qty: 1, include: true, code: "OF-PRE-008" },
        { name: "Replanteo y nivelación", includes: "Marcar en el terreno el eje del muro, los niveles y dónde van las columnas.", scope: "Marcado del eje, niveles y ubicación de columnas", unit: "gl", qty: 1, include: true, code: "OF-PRE-011" },
      ] },
      { rubro: "03 MOVIMIENTO DE SUELOS", tasks: [
        { name: "Excavación de zanja", includes: "Cavar a mano la zanja donde va el cimiento del muro.", scope: "Manual, a la profundidad de fundación", unit: "m³", qty: (v: V) => v.c21, include: (v: V) => (v.m8 === 1), code: "OF-EXC-001", note: "Solo con cimiento" },
        { name: "Relleno y compactación", includes: "Rellenar con la tierra de la excavación y apisonar a los costados del cimiento.", scope: "Con material propio a los lados de la viga", unit: "m³", qty: (v: V) => v.c28, include: (v: V) => (v.m8 === 1), code: "OF-EXC-004", note: "Solo con cimiento" },
        { name: "Retiro de tierra sobrante", includes: "Cargar y llevar en volquete la tierra que sobra de la excavación.", scope: "Carga y volquete", unit: "m³", qty: (v: V) => v.c29, include: (v: V) => (v.m8 === 1), code: "OF-DEM-015" },
      ] },
      { rubro: "04 FUNDACIONES", tasks: [
        { name: "Hormigón de limpieza", includes: "Capa fina de hormigón pobre en el fondo de la excavación para apoyar el cimiento limpio.", scope: "H-4 de 5 cm en el fondo de zanja", unit: "m²", qty: (v: V) => v.m5 * v.m9, include: (v: V) => (v.m8 === 1), code: "OF-FUN-001", note: "Solo con cimiento" },
        { name: "Zapata corrida de hormigón ciclópeo", includes: "Cimiento continuo de hormigón con piedra bola a lo largo del muro.", scope: "H° pobre con piedra bola", unit: "m³", qty: (v: V) => v.c22, include: (v: V) => (v.m8 === 1), code: "OF-FUN-002", note: "Solo con cimiento" },
        { name: "Viga de fundación de H°A°", includes: "Viga de hormigón armado bajo el muro, con los arranques de las columnas.", scope: "H-21 con armadura, arranque de columnas incluido", unit: "m³", qty: (v: V) => v.c23, include: (v: V) => (v.m8 === 1), code: "OF-FUN-003", note: "Solo con cimiento" },
        { name: "Verificación del apoyo existente", includes: "Un ingeniero confirma que la losa o el contrapiso existente aguanta el muro. Sin esto no conviene seguir.", scope: "Losa o contrapiso: el estructuralista confirma que soporta el muro", unit: "gl", qty: 1, include: (v: V) => (v.m8 === 0), code: "OF-FUN-007", note: "Solo sin cimiento" },
        { name: "Anclaje químico de hierros a la base existente", includes: "Perforar la base existente y fijar con resina los hierros que arrancan las columnas.", scope: "4 hierros por columna con resina epoxi", unit: "u", qty: (v: V) => v.c20 * 4, include: (v: V) => (v.m8 === 0), code: "OF-FUN-008", note: "Solo sin cimiento" },
        { name: "Viga de apoyo de H°A°", includes: "Viga de hormigón armado sobre la base existente para repartir el peso del muro.", scope: "Sobre la base existente, espesor del muro x 0,15", unit: "m³", qty: (v: V) => v.m5 * v.m7 * 0.15, include: (v: V) => (v.m8 === 0), code: "OF-FUN-009", note: "Solo sin cimiento" },
      ] },
      { rubro: "07 AISLACIONES EN MUROS", tasks: [
        { name: "Capa aisladora horizontal doble", includes: "Barrera contra la humedad del suelo en la base del muro, para que no suba por la pared.", scope: "Concreto hidrófugo con pintura asfáltica y babetas", unit: "ml", qty: (v: V) => v.m5, include: true, code: "OF-AIS-001" },
      ] },
      { rubro: "05 ESTRUCTURA HA", tasks: [
        { name: "Columnas de H°A°", includes: "Columnas de hormigón armado con su encofrado, hierro y hormigón.", scope: "H-21, sección espesor x 0,20", unit: "m³", qty: (v: V) => v.c24, include: true, code: "OF-EST-001" },
        { name: "Viga de encadenado superior", includes: "Viga de hormigón armado arriba del muro que lo ata y recibe el techo.", scope: "H-21 con armadura", unit: "m³", qty: (v: V) => v.c25, include: true, code: "OF-EST-002" },
      ] },
      { rubro: "06 MAMPOSTERÍA, Y OTROS CERRAMIENTOS", tasks: [
        { name: "Muro de ladrillo cerámico hueco", includes: "Levantar la pared de ladrillo hueco con su mezcla. No incluye revoques.", scope: "18 x 18 x 33, con mortero; descuenta las columnas", unit: "m²", qty: (v: V) => v.c19 - v.c20 * 0.2 * v.m6, include: true, code: "OF-MAM-001" },
      ] },
      { rubro: "08 REVOQUES", tasks: [
        { name: "Azotado hidrófugo", includes: "Capa de mezcla con hidrófugo en la cara exterior que impide que entre la humedad.", scope: "En la cara exterior", unit: "m²", qty: (v: V) => v.c27, include: (v: V) => (v.m15 === 1), code: "OF-REV-004", note: "Solo si es muro exterior" },
        { name: "Revoque grueso", includes: "Primera capa de revoque que endereza la pared.", scope: "Las caras indicadas en Medidas", unit: "m²", qty: (v: V) => v.c26, include: true, code: "OF-REV-006" },
        { name: "Revoque fino", includes: "Capa final de revoque, lisa y lista para pintar.", scope: "A la cal", unit: "m²", qty: (v: V) => v.c26, include: true, code: "OF-REV-010" },
      ] },
      { rubro: "34 PINTURA", tasks: [
        { name: "Pintura látex", includes: "Fijador y dos manos de látex.", scope: "Fijador y 2 manos", unit: "m²", qty: (v: V) => v.c26, include: true, code: "OF-PIN-004" },
      ] },
      { rubro: "90 AUXILIARES", tasks: [
        { name: "Limpieza final de obra", includes: "Limpieza de la obra al terminar y retiro de protecciones y sobrantes.", scope: "Retiro de sobrantes", unit: "m²", qty: (v: V) => v.c19, include: true, code: "OF-AUX-002" },
      ] },
    ],
  },
  {
    id: "pintura",
    name: "Pintura de vivienda",
    description: "Preparación, enduido y pintura de paredes, cielorrasos, puertas y rejas de una vivienda.",
    inputs: [
      { key: "sup", label: "Superficie cubierta a pintar", kind: "number", default: 70, unit: "m²", note: "Supuesto: la vivienda de 70 m²" },
      { key: "h", label: "Altura de paredes", kind: "number", default: 2.6, unit: "m", note: "Supuesto" },
      { key: "fper", label: "Metros de pared por m² de planta", kind: "number", default: 1.6, unit: "ml/m²", note: "Supuesto: 1,4 a 1,8 en viviendas con tabiques; medir si hace falta precisión" },
      { key: "vanos", label: "Superficie de aberturas a descontar", kind: "number", default: 14, unit: "m²", note: "Supuesto: puertas y ventanas" },
      { key: "rep", label: "Porcentaje de paredes a reparar", kind: "number", default: 0.15, unit: "%", note: "Supuesto: enduido y fisuras puntuales" },
      { key: "fis", label: "Fisuras a tratar", kind: "number", default: 10, unit: "ml", note: "Estimado en la visita" },
      { key: "pue", label: "Puertas a esmaltar (con marco)", kind: "number", default: 8, unit: "u", note: "Supuesto" },
      { key: "rej", label: "Rejas o herrería a esmaltar", kind: "number", default: 7, unit: "m²", note: "Supuesto; poner 0 si no hay" },
      { key: "ext", label: "¿Incluye exterior?", kind: "bool", default: 1, unit: "—", note: "Agrega hidrolavado, andamio y pintura exterior" },
      { key: "fach", label: "Superficie de fachada y muros exteriores", kind: "number", default: 85, unit: "m²", note: "Supuesto: perímetro exterior x altura" },
      { key: "sil", label: "¿Andamio o silleta? (1 = andamio, 0 = no hace falta)", kind: "number", default: 1, unit: "—", note: "Planta baja alta o más de 3 m: andamio" },
    ],
    calcs: [
      { key: "par", label: "Superficie de paredes interiores", unit: "m²", fn: (v: V) => Math.max(0, v.sup * v.fper * v.h - v.vanos) },
      { key: "cie", label: "Superficie de cielorrasos", unit: "m²", fn: (v: V) => v.sup },
      { key: "enl", label: "Superficie a enduir", unit: "m²", fn: (v: V) => v.par * v.rep },
    ],
    rubros: [
      { rubro: "02 TRABAJOS PRELIMINARES", tasks: [
        { name: "Protección de pisos, muebles y aberturas", includes: "Cubrir pisos, muebles y carpinterías antes de pintar y retirar todo al terminar.", scope: "Nylon, cartón y cinta", unit: "m²", qty: (v: V) => v.sup, include: true, code: "OF-PRE-004" },
        { name: "Retiro y recolocación de accesorios", includes: "Sacar tapas de luz, cuadros y cortineros antes de pintar y volver a ponerlos.", scope: "Tapas de luz, cuadros, cortineros", unit: "gl", qty: 1, include: true, code: "OF-PRE-014" },
      ] },
      { rubro: "34 PINTURA", tasks: [
        { name: "Lijado y limpieza de paredes", includes: "Sacar la pintura floja y el polvo antes de pintar.", scope: "Eliminación de pintura floja y polvo", unit: "m²", qty: (v: V) => v.par, include: true, code: "OF-PIN-005" },
        { name: "Tratamiento de fisuras", includes: "Abrir la fisura, rellenar con sellador elástico y reforzar con malla para que no vuelva a aparecer.", scope: "Apertura, sellador elástico y malla", unit: "ml", qty: (v: V) => v.fis, include: true, code: "OF-PIN-006" },
        { name: "Enduido parcial", includes: "Masilla en los sectores con imperfecciones, lijada para que quede lisa.", scope: "Enduido plástico y lijado", unit: "m²", qty: (v: V) => v.enl, include: true, code: "OF-PIN-007" },
        { name: "Fijador sellador", includes: "Una mano de fijador antes del látex para que la pintura se adhiera y rinda.", scope: "Una mano", unit: "m²", qty: (v: V) => v.par + v.cie, include: true, code: "OF-PIN-008" },
        { name: "Látex interior en paredes", includes: "Fijador y dos manos de látex en las paredes.", scope: "Dos manos", unit: "m²", qty: (v: V) => v.par, include: true, code: "OF-PIN-009" },
        { name: "Látex para cielorrasos", includes: "Dos manos de látex para cielorraso, antihongo en baño y cocina.", scope: "Dos manos, antihongo en baño y cocina", unit: "m²", qty: (v: V) => v.cie, include: true, code: "OF-PIN-010" },
        { name: "Esmalte sintético en puertas y marcos", includes: "Lijar, dar fondo y dos manos de esmalte en cada puerta con su marco.", scope: "Lijado, fondo y dos manos", unit: "u", qty: (v: V) => v.pue, include: true, code: "OF-PIN-012" },
        { name: "Esmalte sintético en rejas y herrería", includes: "Cepillar el óxido, dar antióxido y dos manos de esmalte.", scope: "Cepillado, antióxido y dos manos", unit: "m²", qty: (v: V) => v.rej, include: true, code: "OF-PIN-013" },
        { name: "Hidrolavado de fachada", includes: "Lavado a presión de la fachada antes de pintar.", scope: "Limpieza a presión", unit: "m²", qty: (v: V) => v.fach, include: (v: V) => (v.ext === 1), code: "OF-PIN-014", note: "Solo exterior" },
        { name: "Fijador y látex exterior o revestimiento acrílico", includes: "Fijador y dos manos de látex exterior o revestimiento acrílico.", scope: "Fijador y dos manos", unit: "m²", qty: (v: V) => v.fach, include: (v: V) => (v.ext === 1), code: "OF-PIN-015", note: "Solo exterior" },
      ] },
      { rubro: "90 AUXILIARES", tasks: [
        { name: "Andamio tubular", includes: "Armado, alquiler y desarme del andamio para trabajar en altura.", scope: "Armado, alquiler y desarme", unit: "m²", qty: (v: V) => v.fach * v.sil, include: (v: V) => (v.ext === 1), code: "OF-AUX-001", note: "Solo exterior" },
        { name: "Limpieza final de obra", includes: "Limpieza de la obra al terminar y retiro de protecciones y sobrantes.", scope: "Retiro de protecciones", unit: "m²", qty: (v: V) => v.sup, include: true, code: "OF-AUX-002" },
      ] },
    ],
  },
  {
    id: "piso",
    name: "Cambio de piso de un ambiente",
    description: "Retiro del piso existente y colocación del nuevo (cerámico, flotante, madera o alisado), con zócalos y ajuste de puertas.",
    inputs: [
      { key: "l", label: "Largo del ambiente", kind: "number", default: 4.0, unit: "m", note: "Supuesto" },
      { key: "a", label: "Ancho del ambiente", kind: "number", default: 3.5, unit: "m", note: "Supuesto" },
      { key: "con", label: "¿Se rehace el contrapiso?", kind: "bool", default: 0, unit: "—", note: "Si el contrapiso está sano, se coloca sobre carpeta nueva" },
      { key: "ep", label: "Espesor de piso + mezcla a picar", kind: "number", default: 0.04, unit: "m", note: "Supuesto" },
      { key: "ec", label: "Espesor de contrapiso a picar", kind: "number", default: 0.1, unit: "m", note: "Supuesto" },
      { key: "esp", label: "Esponjamiento de escombros", kind: "number", default: 1.4, unit: "coef.", note: "Supuesto usual" },
      { key: "pue", label: "Puertas a rebajar", kind: "number", default: 1, unit: "u", note: "Por la diferencia de nivel" },
      { key: "umb", label: "Umbrales o perfiles de transición", kind: "number", default: 0.8, unit: "ml", note: "Ancho de puerta" },
    ],
    calcs: [
      { key: "sp", label: "Superficie de piso", unit: "m²", fn: (v: V) => v.l * v.a },
      { key: "per", label: "Perímetro para zócalos", unit: "ml", fn: (v: V) => 2 * (v.l + v.a) - v.umb },
      { key: "esc", label: "Volumen de escombros (esponjado)", unit: "m³", fn: (v: V) => v.sp * (v.ep + v.ec * v.con) * v.esp },
    ],
    rubros: [
      { rubro: "02 TRABAJOS PRELIMINARES", tasks: [
        { name: "Retiro y reubicación de muebles", includes: "Vaciar el ambiente y volver a ubicar los muebles al terminar.", scope: "Vaciado del ambiente", unit: "gl", qty: 1, include: true, code: "OF-PRE-013" },
        { name: "Protección de locales lindantes", includes: "Cubrir pisos y marcos de los ambientes vecinos con nylon y cinta.", scope: "Nylon y cinta en circulaciones", unit: "gl", qty: 1, include: true, code: "OF-PRE-002" },
      ] },
      { rubro: "01 DEMOLICIONES", tasks: [
        { name: "Retiro de zócalos", includes: "Sacar los zócalos existentes, con cuidado si se van a reutilizar.", scope: "Con cuidado si se reutilizan", unit: "ml", qty: (v: V) => v.per, include: true, code: "OF-DEM-016" },
        { name: "Picado de piso existente", includes: "Romper y sacar el piso con su mezcla de asiento, dejando el contrapiso.", scope: "Con su mezcla de asiento", unit: "m²", qty: (v: V) => v.sp, include: true, code: "OF-DEM-007" },
        { name: "Picado de contrapiso", includes: "Romper y sacar el contrapiso hasta la base, para hacerlo nuevo.", scope: "Hasta la base", unit: "m²", qty: (v: V) => v.sp, include: (v: V) => (v.con === 1), code: "OF-DEM-008", note: "Solo si se rehace" },
        { name: "Retiro de escombros", includes: "Embolsar, bajar y llevar el escombro en volquete hasta su disposición final.", scope: "Carga, volquete y disposición", unit: "m³", qty: (v: V) => v.esc, include: true, code: "OF-DEM-013" },
      ] },
      { rubro: "09 CONTRAPISOS", tasks: [
        { name: "Contrapiso de cascote", includes: "Contrapiso nuevo de 10 a 12 cm, nivelado.", scope: "Nivelado, espesor 10 a 12 cm", unit: "m²", qty: (v: V) => v.sp, include: (v: V) => (v.con === 1), code: "OF-CON-002", note: "Solo si se rehace" },
      ] },
      { rubro: "10 CARPETAS", tasks: [
        { name: "Carpeta de nivelación", includes: "Capa de mezcla lisa y nivelada donde se pega el piso.", scope: "Cementicia, bajo piso", unit: "m²", qty: (v: V) => v.sp, include: true, code: "OF-CAR-001" },
      ] },
      { rubro: "11 PISOS", tasks: [
        { name: "Colocación de piso cerámico o porcelanato", includes: "Colocación con pegamento y pastina. El material se cotiza aparte.", scope: "Con adhesivo y pastina; material aparte", unit: "m²", qty: (v: V) => v.sp, include: true, code: "OF-PIS-001" },
      ] },
      { rubro: "12 ZOCALOS", tasks: [
        { name: "Colocación de zócalos", includes: "Zócalos nuevos del mismo material del piso o de madera.", scope: "Del mismo material o madera", unit: "ml", qty: (v: V) => v.per, include: true, code: "OF-ZOC-002" },
      ] },
      { rubro: "32 TERMINACIONES ESPECIALES", tasks: [
        { name: "Umbrales o perfiles de transición", includes: "Perfil o umbral en la puerta para resolver el cambio de nivel o de piso.", scope: "Aluminio o piedra", unit: "ml", qty: (v: V) => v.umb, include: true, code: "OF-TER-001" },
      ] },
      { rubro: "18 CARPINTERÍA DE MADERA", tasks: [
        { name: "Rebaje y ajuste de puertas", includes: "Recortar la puerta para que abra bien con el piso nuevo.", scope: "Por el cambio de nivel", unit: "u", qty: (v: V) => v.pue, include: true, code: "OF-ABE-005" },
      ] },
      { rubro: "90 AUXILIARES", tasks: [
        { name: "Limpieza final de obra", includes: "Limpieza de la obra al terminar y retiro de protecciones y sobrantes.", scope: "Incluye limpieza de pastina", unit: "m²", qty: (v: V) => v.sp, include: true, code: "OF-AUX-002" },
      ] },
    ],
  },
  {
    id: "terraza",
    name: "Impermeabilización de terraza",
    description: "Retiro de membrana vieja, pendientes, carpeta, membrana asfáltica nueva, embudos y prueba de agua.",
    inputs: [
      { key: "l", label: "Largo de la terraza", kind: "number", default: 8.0, unit: "m", note: "Supuesto" },
      { key: "a", label: "Ancho de la terraza", kind: "number", default: 8.75, unit: "m", note: "Supuesto: 70 m²" },
      { key: "ret", label: "¿Retirar membrana existente?", kind: "bool", default: 1, unit: "—", note: "Si la existente está adherida y sana se puede colocar encima" },
      { key: "pen", label: "¿Rehacer contrapiso con pendiente?", kind: "bool", default: 0, unit: "—", note: "Solo si hay agua estancada" },
      { key: "bab", label: "Altura de babeta perimetral", kind: "number", default: 0.2, unit: "m", note: "Supuesto: mínimo 20 cm sobre el piso terminado" },
      { key: "emb", label: "Embudos a reemplazar", kind: "number", default: 2, unit: "u", note: "Supuesto" },
      { key: "fis", label: "Fisuras a tratar", kind: "number", default: 15, unit: "ml", note: "Estimado en la visita" },
      { key: "tra", label: "¿Terraza transitable?", kind: "bool", default: 0, unit: "—", note: "Transitable: membrana con piso cerámico encima; no transitable: membrana con aluminio" },
    ],
    calcs: [
      { key: "sp", label: "Superficie de terraza", unit: "m²", fn: (v: V) => v.l * v.a },
      { key: "per", label: "Perímetro", unit: "ml", fn: (v: V) => 2 * (v.l + v.a) },
      { key: "sm", label: "Superficie de membrana (con babeta y solapes)", unit: "m²", fn: (v: V) => (v.sp + v.per * v.bab) * 1.1 },
    ],
    rubros: [
      { rubro: "02 TRABAJOS PRELIMINARES", tasks: [
        { name: "Limpieza de la cubierta", includes: "Barrer la terraza y retirar macetas, objetos y suciedad.", scope: "Barrido, retiro de macetas y objetos", unit: "m²", qty: (v: V) => v.sp, include: true, code: "OF-PRE-010" },
      ] },
      { rubro: "01 DEMOLICIONES", tasks: [
        { name: "Retiro de membrana existente", includes: "Sacar la membrana vieja y su pintura hasta dejar la carpeta limpia.", scope: "Con su pintura de protección", unit: "m²", qty: (v: V) => v.sp, include: (v: V) => (v.ret === 1), code: "OF-DEM-017" },
        { name: "Picado de contrapiso existente", includes: "Romper el contrapiso de la terraza para rehacer la pendiente.", scope: "Para rehacer la pendiente", unit: "m²", qty: (v: V) => v.sp, include: (v: V) => (v.pen === 1), code: "OF-DEM-009" },
        { name: "Retiro de escombros", includes: "Embolsar, bajar y llevar el escombro en volquete hasta su disposición final.", scope: "Bajada en bolsas y volquete", unit: "m³", qty: (v: V) => v.sp * (0.01 * v.ret + 0.08 * v.pen) * 1.4, include: true, code: "OF-DEM-013" },
      ] },
      { rubro: "09 CONTRAPISOS", tasks: [
        { name: "Contrapiso con pendiente", includes: "Contrapiso liviano con la inclinación necesaria para que el agua vaya a los embudos.", scope: "H° alivianado con pendiente a embudos", unit: "m²", qty: (v: V) => v.sp, include: (v: V) => (v.pen === 1), code: "OF-CON-004" },
      ] },
      { rubro: "10 CARPETAS", tasks: [
        { name: "Carpeta de azotea", includes: "Capa de mezcla alisada que deja la superficie lista para la membrana.", scope: "Cementicia, alisada", unit: "m²", qty: (v: V) => v.sp, include: (v: V) => (v.pen === 1), code: "OF-CAR-002" },
        { name: "Reparación de carpeta y fisuras", includes: "Sellar fisuras y emparchar la carpeta antes de impermeabilizar.", scope: "Sellado de fisuras y bacheo", unit: "ml", qty: (v: V) => v.fis, include: true, code: "OF-CAR-003" },
      ] },
      { rubro: "16 CUBIERTAS", tasks: [
        { name: "Imprimación asfáltica", includes: "Pintura asfáltica de base para que la membrana se adhiera.", scope: "Una mano", unit: "m²", qty: (v: V) => v.sm, include: true, code: "OF-CUB-001" },
        { name: "Membrana asfáltica 4 mm", includes: "Membrana asfáltica soldada con soplete y con solapes, que impermeabiliza el techo.", scope: "Soldada, con solapes", unit: "m²", qty: (v: V) => v.sm, include: true, code: "OF-CUB-002" },
        { name: "Babeta y zócalo perimetral", includes: "Subida de la membrana en las paredes del perímetro para que el agua no entre por los bordes.", scope: "Membrana en cuña y terminación en canaleta", unit: "ml", qty: (v: V) => v.per, include: true, code: "OF-CUB-003" },
        { name: "Recambio de embudos", includes: "Cambiar los embudos por nuevos con rejilla, sellados a la membrana.", scope: "Embudo con rejilla y sellado a la membrana", unit: "u", qty: (v: V) => v.emb, include: true, code: "OF-CUB-004" },
        { name: "Protección de membrana con pintura reflectiva", includes: "Dos manos de pintura de aluminio o acrílica que protege la membrana del sol.", scope: "Dos manos de pintura de aluminio o acrílica", unit: "m²", qty: (v: V) => v.sm, include: (v: V) => (v.tra === 0), code: "OF-CUB-005", note: "Solo no transitable" },
        { name: "Piso cerámico sobre membrana", includes: "Carpeta de protección y piso cerámico sobre la membrana, para terraza transitable.", scope: "Con carpeta de protección", unit: "m²", qty: (v: V) => v.sp, include: (v: V) => (v.tra === 1), code: "OF-CUB-006", note: "Solo transitable" },
        { name: "Prueba de estanqueidad", includes: "Se inunda la terraza 24 horas para comprobar que no haya filtraciones.", scope: "Inundación 24 h", unit: "gl", qty: 1, include: true, code: "OF-CUB-007" },
      ] },
      { rubro: "90 AUXILIARES", tasks: [
        { name: "Limpieza final de obra", includes: "Limpieza de la obra al terminar y retiro de protecciones y sobrantes.", scope: "", unit: "m²", qty: (v: V) => v.sp, include: true, code: "OF-AUX-002" },
      ] },
    ],
  },
  {
    id: "durlock",
    name: "Tabique y cielorraso de placa de yeso",
    description: "Tabiques y cielorrasos en seco con estructura metálica, aislación, masillado y pintura.",
    inputs: [
      { key: "lt", label: "Largo de tabique", kind: "number", default: 4.0, unit: "m", note: "Supuesto; poner 0 si solo hay cielorraso" },
      { key: "ht", label: "Altura de tabique", kind: "number", default: 2.6, unit: "m", note: "Supuesto" },
      { key: "caras", label: "Placas por cara (1 = simple, 2 = doble)", kind: "number", default: 1, unit: "u", note: "Doble placa para mejor aislación acústica" },
      { key: "ais", label: "¿Aislación de lana de vidrio?", kind: "bool", default: 1, unit: "—" },
      { key: "hum", label: "¿Placa resistente a la humedad?", kind: "bool", default: 0, unit: "—", note: "Baños y cocinas" },
      { key: "pue", label: "Vanos de puerta", kind: "number", default: 1, unit: "u", note: "Supuesto" },
      { key: "ref", label: "Refuerzos para colgar muebles o TV", kind: "number", default: 2, unit: "ml", note: "Supuesto" },
      { key: "bt", label: "Bocas eléctricas en el tabique", kind: "number", default: 2, unit: "u", note: "Supuesto" },
      { key: "sc", label: "Superficie de cielorraso", kind: "number", default: 12, unit: "m²", note: "Supuesto; poner 0 si solo hay tabique" },
      { key: "pc", label: "Perímetro del cielorraso", kind: "number", default: 14, unit: "ml", note: "Supuesto" },
      { key: "tap", label: "Tapas de inspección", kind: "number", default: 1, unit: "u", note: "Supuesto" },
    ],
    calcs: [
      { key: "st", label: "Superficie de tabique", unit: "m²", fn: (v: V) => Math.max(0, v.lt * v.ht - v.pue * 0.8 * 2) },
      { key: "sma", label: "Superficie a masillar", unit: "m²", fn: (v: V) => v.st * 2 + v.sc },
    ],
    rubros: [
      { rubro: "02 TRABAJOS PRELIMINARES", tasks: [
        { name: "Replanteo", includes: "Marcar en obra dónde va cada elemento y sus niveles.", scope: "Trazado en piso y techo", unit: "gl", qty: 1, include: true, code: "OF-PRE-012" },
      ] },
      { rubro: "06 MAMPOSTERÍA, Y OTROS CERRAMIENTOS", tasks: [
        { name: "Tabique de placa de yeso 70 mm", includes: "Estructura metálica con placa de yeso en ambas caras. El masillado va aparte.", scope: "Estructura de soleras y montantes, placa en ambas caras", unit: "m²", qty: (v: V) => v.st, include: true, code: "OF-TAB-001" },
        { name: "Segunda placa por cara", includes: "Agregar otra placa en cada cara para que aísle más el sonido.", scope: "Solo si se eligió doble placa", unit: "m²", qty: (v: V) => v.st * 2 * (v.caras - 1), include: (v: V) => (v.caras === 2), code: "OF-TAB-002" },
        { name: "Aislación de lana de vidrio", includes: "Relleno de lana de vidrio dentro del tabique para aislar sonido y temperatura.", scope: "Entre montantes", unit: "m²", qty: (v: V) => v.st, include: (v: V) => (v.ais === 1), code: "OF-TAB-003" },
        { name: "Vano de puerta con refuerzos", includes: "Armar el hueco de la puerta en el tabique con refuerzos. La puerta va aparte.", scope: "Dintel y montantes dobles", unit: "u", qty: (v: V) => v.pue, include: true, code: "OF-TAB-004" },
        { name: "Refuerzos para colgar", includes: "Maderas o perfiles dentro del tabique para poder colgar muebles o un televisor.", scope: "Madera o perfil dentro del tabique", unit: "ml", qty: (v: V) => v.ref, include: true, code: "OF-TAB-005" },
      ] },
      { rubro: "13 CIELORRASOS", tasks: [
        { name: "Cielorraso suspendido de placa de yeso", includes: "Cielorraso colgado del techo con estructura metálica y placa de yeso. La pintura va aparte.", scope: "Estructura y placa estándar o verde", unit: "m²", qty: (v: V) => v.sc, include: (v: V) => (v.sc > 0), code: "OF-CIE-002" },
        { name: "Buña perimetral", includes: "Perfil en el encuentro del cielorraso con la pared para una terminación prolija.", scope: "Perfil buña", unit: "ml", qty: (v: V) => v.pc, include: (v: V) => (v.sc > 0), code: "OF-CIE-004" },
        { name: "Tapas de inspección", includes: "Tapa con marco en el cielorraso para acceder a cañerías o cables.", scope: "Con marco", unit: "u", qty: (v: V) => v.tap, include: (v: V) => (v.sc > 0), code: "OF-CIE-005" },
      ] },
      { rubro: "15 YESERIA", tasks: [
        { name: "Masillado y encintado", includes: "Cinta y masilla en juntas y tornillos para que la placa quede lisa y lista para pintar.", scope: "Juntas y tornillos, tres manos", unit: "m²", qty: (v: V) => v.sma, include: true, code: "OF-YES-001" },
        { name: "Cantoneras", includes: "Perfil metálico en las esquinas del tabique para que no se golpeen.", scope: "En aristas", unit: "ml", qty: (v: V) => v.ht * 2, include: true, code: "OF-YES-002" },
      ] },
      { rubro: "26 INSTALACIÓN ELÉCTRICA", tasks: [
        { name: "Bocas eléctricas en tabique", includes: "Caja, caño corrugado y cable para cada punto dentro del tabique.", scope: "Caja, caño corrugado y cableado", unit: "u", qty: (v: V) => v.bt, include: true, code: "OF-ELE-008" },
      ] },
      { rubro: "34 PINTURA", tasks: [
        { name: "Pintura látex", includes: "Fijador y dos manos de látex.", scope: "Fijador y dos manos", unit: "m²", qty: (v: V) => v.sma, include: true, code: "OF-PIN-004" },
      ] },
      { rubro: "90 AUXILIARES", tasks: [
        { name: "Limpieza final de obra", includes: "Limpieza de la obra al terminar y retiro de protecciones y sobrantes.", scope: "", unit: "gl", qty: 1, include: true, code: "OF-AUX-003" },
      ] },
    ],
  },
  {
    id: "frente",
    name: "Frente y medianera (Ley 6116)",
    description: "Relevamiento, protecciones, reparación de revoques, fisuras y hierros, impermeabilización y pintura de fachada y medianera.",
    inputs: [
      { key: "af", label: "Ancho de frente", kind: "number", default: 8.66, unit: "m", note: "Supuesto: lote de 8,66" },
      { key: "hf", label: "Altura de fachada", kind: "number", default: 25, unit: "m", note: "Supuesto: PB + 7 pisos" },
      { key: "vanos", label: "Porcentaje de aberturas en fachada", kind: "number", default: 0.3, unit: "%", note: "Supuesto" },
      { key: "rf", label: "Porcentaje de revoque flojo a picar", kind: "number", default: 0.15, unit: "%", note: "Lo define el relevamiento con martillo" },
      { key: "fis", label: "Fisuras a tratar", kind: "number", default: 40, unit: "ml", note: "Estimado en el relevamiento" },
      { key: "arm", label: "Armaduras expuestas a tratar", kind: "number", default: 12, unit: "ml", note: "Frentes de losa de balcón, vigas" },
      { key: "bal", label: "Balcones", kind: "number", default: 7, unit: "u", note: "Supuesto: uno por piso" },
      { key: "cor", label: "Cornisas y molduras a reparar", kind: "number", default: 20, unit: "ml", note: "Supuesto" },
      { key: "med", label: "¿Incluye medianera?", kind: "bool", default: 1, unit: "—" },
      { key: "am", label: "Ancho de medianera expuesta", kind: "number", default: 15, unit: "m", note: "Supuesto" },
      { key: "hm", label: "Altura de medianera expuesta", kind: "number", default: 12, unit: "m", note: "Supuesto" },
      { key: "and", label: "Medio de acceso (1 = andamio, 0 = silleta)", kind: "number", default: 0, unit: "—", note: "Silleta con trabajos en altura; andamio si hay mucha reparación" },
    ],
    calcs: [
      { key: "sf", label: "Superficie de fachada (neta)", unit: "m²", fn: (v: V) => v.af * v.hf * (1 - v.vanos) },
      { key: "sm", label: "Superficie de medianera", unit: "m²", fn: (v: V) => v.am * v.hm * v.med },
      { key: "st", label: "Superficie total a tratar", unit: "m²", fn: (v: V) => v.sf + v.sm },
      { key: "sr", label: "Superficie de revoque a rehacer", unit: "m²", fn: (v: V) => v.st * v.rf },
    ],
    rubros: [
      { rubro: "02 TRABAJOS PRELIMINARES", tasks: [
        { name: "Relevamiento e informe técnico", includes: "Inspección del frente y la medianera, informe profesional y documentación que exige la Ley 6116. Es honorario profesional.", scope: "Inspección, informe y documentación para el Registro (Ley 6116)", unit: "gl", qty: 1, include: true, code: "OF-PRE-016", note: "Honorario profesional" },
        { name: "Protección peatonal y bandeja", includes: "Pantalla y bandeja sobre la vereda para proteger a los peatones mientras se trabaja en altura.", scope: "Pantalla y bandeja de protección sobre vereda", unit: "ml", qty: (v: V) => v.af, include: true, code: "OF-PRE-019" },
        { name: "Andamio tubular", includes: "Armado, alquiler y desarme del andamio para trabajar en altura.", scope: "Armado, alquiler y desarme", unit: "m²", qty: (v: V) => v.st, include: (v: V) => (v.and === 1), code: "OF-AUX-001" },
        { name: "Trabajos con silleta y anclajes", includes: "Puntos de anclaje, líneas de vida y equipo para trabajar con silleta, sin andamio.", scope: "Puntos de anclaje, líneas de vida y equipo", unit: "gl", qty: 1, include: (v: V) => (v.and === 0), code: "OF-PRE-021" },
      ] },
      { rubro: "01 DEMOLICIONES", tasks: [
        { name: "Picado de revoque flojo", includes: "Sacar el revoque suelto o hueco hasta llegar a material sano.", scope: "Hasta material sano", unit: "m²", qty: (v: V) => v.sr, include: true, code: "OF-DEM-019" },
        { name: "Retiro de escombros", includes: "Embolsar, bajar y llevar el escombro en volquete hasta su disposición final.", scope: "Bajada controlada y volquete", unit: "m³", qty: (v: V) => v.sr * 0.03 * 1.4, include: true, code: "OF-DEM-013" },
      ] },
      { rubro: "08 REVOQUES", tasks: [
        { name: "Hidrolavado", includes: "Lavado a presión de toda la superficie para sacar suciedad y pintura suelta.", scope: "Limpieza a presión de toda la superficie", unit: "m²", qty: (v: V) => v.st, include: true, code: "OF-REV-013" },
        { name: "Tratamiento de fisuras", includes: "Abrir la fisura, rellenar con sellador elástico y reforzar con malla para que no vuelva a aparecer.", scope: "Apertura, sellador elástico y malla", unit: "ml", qty: (v: V) => v.fis, include: true, code: "OF-PIN-006" },
        { name: "Tratamiento de armaduras expuestas", includes: "Picar el hormigón flojo, limpiar y proteger el hierro oxidado y reconstruir con mortero especial.", scope: "Picado, pasivado y mortero de reparación", unit: "ml", qty: (v: V) => v.arm, include: true, code: "OF-REV-014" },
        { name: "Revoque grueso hidrófugo", includes: "Revoque grueso con hidrófugo en los sectores donde se picó.", scope: "En sectores picados", unit: "m²", qty: (v: V) => v.sr, include: true, code: "OF-REV-009" },
        { name: "Revoque fino", includes: "Capa final de revoque, lisa y lista para pintar.", scope: "En sectores picados", unit: "m²", qty: (v: V) => v.sr, include: true, code: "OF-REV-010" },
        { name: "Reparación de cornisas y molduras", includes: "Reconstruir con mortero las cornisas y molduras rotas.", scope: "Reconstrucción con mortero", unit: "ml", qty: (v: V) => v.cor, include: true, code: "OF-REV-015" },
      ] },
      { rubro: "93 AISLACIONES Y MEMBRANAS", tasks: [
        { name: "Impermeabilización de balcones", includes: "Membrana líquida y babeta en el piso de cada balcón para que no filtre.", scope: "Membrana líquida y babeta", unit: "u", qty: (v: V) => v.bal, include: true, code: "OF-IMP-001" },
        { name: "Impermeabilizante para medianera", includes: "Producto hidrorrepelente o membrana líquida sobre la medianera para cortar filtraciones.", scope: "Hidrorrepelente o membrana líquida", unit: "m²", qty: (v: V) => v.sm, include: (v: V) => (v.med === 1), code: "OF-IMP-002" },
      ] },
      { rubro: "34 PINTURA", tasks: [
        { name: "Fijador y revestimiento o látex acrílico exterior", includes: "Fijador y dos manos de látex o revestimiento acrílico en todo el frente.", scope: "Fijador y dos manos", unit: "m²", qty: (v: V) => v.sf, include: true, code: "OF-PIN-016" },
      ] },
      { rubro: "94 SELLADORES Y JUNTAS", tasks: [
        { name: "Sellado perimetral de carpinterías", includes: "Sellador elástico alrededor de ventanas y puertas para que no entre agua.", scope: "Sellador poliuretánico", unit: "ml", qty: (v: V) => v.af * v.hf * v.vanos * 1.2, include: true, code: "OF-SEL-002", note: "Estimado por superficie de aberturas" },
      ] },
      { rubro: "90 AUXILIARES", tasks: [
        { name: "Limpieza final de obra", includes: "Limpieza de la obra al terminar y retiro de protecciones y sobrantes.", scope: "Vereda y patios", unit: "gl", qty: 1, include: true, code: "OF-AUX-003" },
      ] },
    ],
  },
  {
    id: "vereda",
    name: "Vereda municipal",
    description: "Demolición y construcción de vereda reglamentaria con baldosa, juntas, rampa y nivelación de tapas.",
    inputs: [
      { key: "l", label: "Largo de frente", kind: "number", default: 10.0, unit: "m", note: "Supuesto: lote de 10 m" },
      { key: "a", label: "Ancho de vereda", kind: "number", default: 2.5, unit: "m", note: "Supuesto; descontar cazuelas si son grandes" },
      { key: "ret", label: "¿Retirar vereda existente?", kind: "bool", default: 1, unit: "—" },
      { key: "ramp", label: "Rampas de acceso vehicular o accesibles", kind: "number", default: 1, unit: "u", note: "Supuesto" },
      { key: "caz", label: "Cazuelas de árboles", kind: "number", default: 1, unit: "u", note: "Supuesto" },
      { key: "tap", label: "Tapas de servicios a nivelar", kind: "number", default: 2, unit: "u", note: "Supuesto" },
    ],
    calcs: [
      { key: "sv", label: "Superficie de vereda", unit: "m²", fn: (v: V) => v.l * v.a },
      { key: "esc", label: "Volumen de escombros (esponjado)", unit: "m³", fn: (v: V) => v.sv * 0.12 * 1.4 * v.ret },
    ],
    rubros: [
      { rubro: "02 TRABAJOS PRELIMINARES", tasks: [
        { name: "Aviso de obra y gestión de permiso", includes: "Trámite municipal para hacer la vereda.", scope: "Según normativa municipal", unit: "gl", qty: 1, include: true, code: "OF-PRE-018" },
        { name: "Protección y paso peatonal", includes: "Vallado del sector y pasarela para que los vecinos puedan pasar.", scope: "Vallado y pasarela", unit: "ml", qty: (v: V) => v.l, include: true, code: "OF-PRE-020" },
      ] },
      { rubro: "01 DEMOLICIONES", tasks: [
        { name: "Demolición de vereda existente", includes: "Romper y sacar las baldosas y el contrapiso de la vereda vieja.", scope: "Baldosas y contrapiso", unit: "m²", qty: (v: V) => v.sv, include: (v: V) => (v.ret === 1), code: "OF-DEM-018" },
        { name: "Retiro de escombros", includes: "Embolsar, bajar y llevar el escombro en volquete hasta su disposición final.", scope: "Carga y volquete", unit: "m³", qty: (v: V) => v.esc, include: (v: V) => (v.ret === 1), code: "OF-DEM-013" },
      ] },
      { rubro: "35 OBRAS EXTERIORES", tasks: [
        { name: "Compactación del suelo", includes: "Apisonar la tierra con pisón o placa vibrante antes del contrapiso.", scope: "Con pisón o placa vibrante", unit: "m²", qty: (v: V) => v.sv, include: true, code: "OF-EXC-006" },
        { name: "Vereda de hormigón con baldosa", includes: "Contrapiso de hormigón y baldosa reglamentaria colocada.", scope: "Contrapiso de H° y baldosa reglamentaria", unit: "m²", qty: (v: V) => v.sv, include: true, code: "OF-EXT-001" },
        { name: "Juntas de dilatación", includes: "Cortes que evitan que la vereda se raje con los cambios de temperatura.", scope: "Cada 3 a 4 m y contra la línea municipal", unit: "ml", qty: (v: V) => roundUp(v.l / 3, 0) * v.a + v.l, include: true, code: "OF-EXT-002" },
        { name: "Rampa", includes: "Rampa para autos o rampa accesible, según la normativa.", scope: "Vehicular o accesible, según normativa", unit: "u", qty: (v: V) => v.ramp, include: true, code: "OF-EXT-003" },
        { name: "Cazuela de árbol", includes: "Borde y terminación alrededor del árbol.", scope: "Borde y terminación", unit: "u", qty: (v: V) => v.caz, include: true, code: "OF-EXT-004" },
        { name: "Nivelación de tapas de servicios", includes: "Llevar al nivel de la vereda nueva las tapas de agua, gas y electricidad.", scope: "Agua, gas, electricidad", unit: "u", qty: (v: V) => v.tap, include: true, code: "OF-EXT-005" },
      ] },
      { rubro: "90 AUXILIARES", tasks: [
        { name: "Limpieza final de obra", includes: "Limpieza de la obra al terminar y retiro de protecciones y sobrantes.", scope: "", unit: "m²", qty: (v: V) => v.sv, include: true, code: "OF-AUX-002" },
      ] },
    ],
  },
  {
    id: "electrica",
    name: "Instalación eléctrica de un ambiente",
    description: "Circuito nuevo desde el tablero, bocas, tomas especiales, luminarias y medición final.",
    inputs: [
      { key: "tom", label: "Tomacorrientes", kind: "number", default: 6, unit: "u", note: "Supuesto" },
      { key: "luz", label: "Bocas de iluminación", kind: "number", default: 2, unit: "u", note: "Supuesto" },
      { key: "lla", label: "Llaves de efecto", kind: "number", default: 2, unit: "u", note: "Supuesto" },
      { key: "esp", label: "Tomas especiales (aire acondicionado, horno)", kind: "number", default: 1, unit: "u", note: "Línea propia" },
      { key: "can", label: "Largo de canaletas", kind: "number", default: 25, unit: "ml", note: "Estimado: 3 a 4 ml por boca" },
      { key: "cir", label: "¿Circuito nuevo desde el tablero?", kind: "bool", default: 1, unit: "—" },
      { key: "tab", label: "¿Tablero seccional nuevo?", kind: "bool", default: 0, unit: "—", note: "Con térmicas y disyuntor" },
      { key: "lum", label: "Luminarias a colocar", kind: "number", default: 2, unit: "u", note: "Supuesto" },
      { key: "pin", label: "Superficie de pared a retocar", kind: "number", default: 10, unit: "m²", note: "Sobre canaletas cerradas" },
    ],
    calcs: [
      { key: "bocas", label: "Total de bocas", unit: "u", fn: (v: V) => v.tom + v.luz + v.lla },
    ],
    rubros: [
      { rubro: "02 TRABAJOS PRELIMINARES", tasks: [
        { name: "Relevamiento de la instalación existente", includes: "Revisar el tablero, la puesta a tierra y los circuitos antes de empezar.", scope: "Estado del tablero, puesta a tierra y circuitos", unit: "gl", qty: 1, include: true, code: "OF-PRE-017" },
        { name: "Corte de energía y protección", includes: "Cortar la luz del sector a intervenir y proteger muebles y pisos.", scope: "", unit: "gl", qty: 1, include: true, code: "OF-PRE-007" },
      ] },
      { rubro: "01 DEMOLICIONES", tasks: [
        { name: "Apertura de canaletas", includes: "Abrir surcos en paredes y techo para pasar los caños eléctricos.", scope: "En muros y cielorraso", unit: "ml", qty: (v: V) => v.can, include: true, code: "OF-DEM-011" },
      ] },
      { rubro: "26 INSTALACIÓN ELÉCTRICA", tasks: [
        { name: "Circuito nuevo desde el tablero", includes: "Línea nueva desde el tablero con su protección.", scope: "Cañería, cable y protección", unit: "gl", qty: 1, include: (v: V) => (v.cir === 1), code: "OF-ELE-002" },
        { name: "Tablero seccional", includes: "Tablero nuevo con térmicas y disyuntor para el sector.", scope: "Gabinete, térmicas y disyuntor", unit: "u", qty: 1, include: (v: V) => (v.tab === 1), code: "OF-ELE-004" },
        { name: "Bocas de tomacorriente, iluminación y llaves", includes: "Caja, caño, cable y módulo en cada punto eléctrico.", scope: "Cañería, cableado y módulo", unit: "u", qty: (v: V) => v.bocas, include: true, code: "OF-ELE-007" },
        { name: "Tomas especiales con línea propia", includes: "Línea propia de 20 A para aire acondicionado u horno.", scope: "20 A", unit: "u", qty: (v: V) => v.esp, include: true, code: "OF-ELE-010" },
        { name: "Verificación de puesta a tierra", includes: "Medir la puesta a tierra y corregirla si no cumple.", scope: "Medición y adecuación", unit: "gl", qty: 1, include: true, code: "OF-ELE-012" },
        { name: "Colocación de luminarias", includes: "Instalar y conectar las luminarias. Las luminarias se cotizan aparte.", scope: "", unit: "u", qty: (v: V) => v.lum, include: true, code: "OF-ELE-013" },
        { name: "Prueba y medición de aislación", includes: "El electricista matriculado mide la instalación y entrega su informe.", scope: "Con informe del electricista matriculado", unit: "gl", qty: 1, include: true, code: "OF-ELE-014" },
      ] },
      { rubro: "08 REVOQUES", tasks: [
        { name: "Cierre de canaletas", includes: "Tapar con mezcla los surcos de las cañerías, a ras de la pared.", scope: "Con mortero, a ras", unit: "ml", qty: (v: V) => v.can, include: true, code: "OF-REV-002" },
      ] },
      { rubro: "34 PINTURA", tasks: [
        { name: "Retoque de pintura", includes: "Fijador y dos manos en los paños donde se cerraron canaletas.", scope: "Fijador y dos manos en paños afectados", unit: "m²", qty: (v: V) => v.pin, include: true, code: "OF-PIN-018" },
      ] },
      { rubro: "90 AUXILIARES", tasks: [
        { name: "Limpieza final de obra", includes: "Limpieza de la obra al terminar y retiro de protecciones y sobrantes.", scope: "", unit: "gl", qty: 1, include: true, code: "OF-AUX-003" },
      ] },
    ],
  },
  {
    id: "ampliacion",
    name: "Ampliación: dormitorio",
    description: "Ambiente nuevo completo: fundaciones, estructura, muros, cubierta a elección, pisos a elección, instalaciones, aberturas y pintura.",
    inputs: [
      { key: "l", label: "Largo del dormitorio (interior)", kind: "number", default: 3.5, unit: "m", note: "Supuesto; reemplazar por la medida real" },
      { key: "a", label: "Ancho del dormitorio (interior)", kind: "number", default: 3.0, unit: "m", note: "Supuesto" },
      { key: "h", label: "Altura de muros", kind: "number", default: 2.6, unit: "m", note: "Supuesto" },
      { key: "e", label: "Espesor de muro exterior", kind: "number", default: 0.18, unit: "m", note: "Ladrillo cerámico hueco 18 x 18 x 33" },
      { key: "apoyo", label: "Largo de lado que linda con la casa existente", kind: "number", default: 3.5, unit: "m", note: "Ese lado no lleva muro nuevo; poner 0 si la ampliación está separada" },
      { key: "cub", label: "Tipo de cubierta", kind: "option", default: 1, unit: "opción", options: [{ value: 1, label: "Chapa sobre estructura metálica liviana (steel frame)" }, { value: 2, label: "Chapa o teja sobre estructura de madera" }, { value: 3, label: "Losa de viguetas pretensadas" }, { value: 4, label: "Losa maciza de H°A°" }] },
      { key: "piso", label: "Tipo de piso", kind: "option", default: 1, unit: "opción", options: [{ value: 1, label: "Cerámico o porcelanato" }, { value: 2, label: "Piso flotante o vinílico" }, { value: 3, label: "Madera (entablonado o parquet)" }, { value: 4, label: "Cemento alisado o microcemento" }] },
      { key: "pend", label: "Pendiente de cubierta liviana", kind: "number", default: 0.15, unit: "m/m", note: "Supuesto 15 %; solo opciones 1 y 2" },
      { key: "alero", label: "Alero perimetral", kind: "number", default: 0.4, unit: "m", note: "Supuesto; solo opciones 1 y 2" },
      { key: "zap", label: "Lado de zapata aislada", kind: "number", default: 0.8, unit: "m", note: "Lo define el cálculo estructural" },
      { key: "prof", label: "Profundidad de fundación", kind: "number", default: 1.0, unit: "m", note: "Supuesto; depende del estudio de suelos" },
      { key: "vent", label: "Cantidad de ventanas", kind: "number", default: 1, unit: "u", note: "Supuesto" },
      { key: "va", label: "Ancho de ventana", kind: "number", default: 1.5, unit: "m", note: "Supuesto" },
      { key: "vh", label: "Alto de ventana", kind: "number", default: 1.1, unit: "m", note: "Supuesto" },
      { key: "rell", label: "Altura de relleno interior", kind: "number", default: 0.2, unit: "m", note: "Para llegar al nivel del piso existente" },
      { key: "bocas", label: "Bocas eléctricas (tomas, luces y llaves)", kind: "number", default: 6, unit: "u", note: "Supuesto" },
      { key: "aa", label: "¿Preinstalación de aire acondicionado?", kind: "bool", default: 1, unit: "—" },
      { key: "rej", label: "¿Rejas en ventanas?", kind: "bool", default: 0, unit: "—" },
      { key: "esp", label: "Esponjamiento de tierra y escombros", kind: "number", default: 1.3, unit: "coef.", note: "Supuesto usual" },
    ],
    calcs: [
      { key: "sp", label: "Superficie interior", unit: "m²", fn: (v: V) => v.l * v.a },
      { key: "per", label: "Perímetro interior", unit: "ml", fn: (v: V) => 2 * (v.l + v.a) },
      { key: "pn", label: "Largo de muros nuevos", unit: "ml", fn: (v: V) => Math.max(0, 2 * (v.l + v.a) + 4 * v.e - v.apoyo) },
      { key: "ncol", label: "Cantidad de columnas", unit: "u", fn: (v: V) => (roundUp((v.l + v.e) / 3.5, 0) + 1) * (roundUp((v.a + v.e) / 3.5, 0) + 1) },
      { key: "pvf", label: "Largo de vigas de fundación y encadenado", unit: "ml", fn: (v: V) => 2 * (v.l + v.a) + 4 * v.e },
      { key: "sv", label: "Superficie de ventanas", unit: "m²", fn: (v: V) => v.vent * v.va * v.vh },
      { key: "smuro", label: "Superficie de mampostería", unit: "m²", fn: (v: V) => Math.max(0, v.pn * v.h - v.sv - v.ncol * 0.2 * v.h) },
      { key: "sre", label: "Superficie de revoque exterior", unit: "m²", fn: (v: V) => Math.max(0, v.pn * (v.h + 0.3) - v.sv) },
      { key: "sri", label: "Superficie de revoque interior", unit: "m²", fn: (v: V) => Math.max(0, v.per * v.h - v.sv - 0.8 * 2) },
      { key: "scl", label: "Superficie de cubierta liviana (inclinada)", unit: "m²", fn: (v: V) => (v.l + 2 * v.e + 2 * v.alero) * (v.a + 2 * v.e + 2 * v.alero) * Math.sqrt(1 + v.pend ** 2) },
      { key: "sls", label: "Superficie de losa", unit: "m²", fn: (v: V) => (v.l + 2 * v.e) * (v.a + 2 * v.e) },
      { key: "pcub", label: "Perímetro de cubierta", unit: "ml", fn: (v: V) => 2 * (v.l + v.a) + 8 * v.e + 8 * v.alero * n((v.cub <= 2)) },
      { key: "esc", label: "Tierra de excavación (esponjada)", unit: "m³", fn: (v: V) => (v.ncol * v.zap ** 2 * v.prof + v.pvf * 0.25 * 0.4) * v.esp },
      { key: "elegido", label: "Cubierta elegida", unit: "", fn: (v: V) => ["Metálica liviana (steel frame)", "Estructura de madera", "Losa de viguetas", "Losa maciza"][v.cub - 1] },
      { key: "pelegido", label: "Piso elegido", unit: "", fn: (v: V) => ["Cerámico o porcelanato", "Flotante o vinílico", "Madera", "Cemento alisado o microcemento"][v.piso - 1] },
    ],
    rubros: [
      { rubro: "02 TRABAJOS PRELIMINARES", tasks: [
        { name: "Estudio de suelos", includes: "Ensayo de laboratorio que define cómo y a qué profundidad fundar. Opcional pero recomendado.", scope: "Para definir el tipo de fundación", unit: "gl", qty: 1, include: false, code: "OF-PRE-015", note: "Recomendado si no hay datos del terreno" },
        { name: "Protección de la vivienda existente", includes: "Cuidar los ambientes de la casa del lado de la obra: pisos, muebles y aberturas.", scope: "Pisos, muebles y aberturas del lado de la obra", unit: "gl", qty: 1, include: true, code: "OF-PRE-003", note: "Obra habitada" },
        { name: "Limpieza y nivelación del terreno", includes: "Desmalezar y emparejar el terreno donde se construye, más un metro alrededor.", scope: "Superficie de la ampliación más 1 m alrededor", unit: "m²", qty: (v: V) => (v.l + 2) * (v.a + 2), include: true, code: "OF-PRE-009" },
        { name: "Replanteo", includes: "Marcar en obra dónde va cada elemento y sus niveles.", scope: "Ejes, niveles y vinculación con la casa existente", unit: "gl", qty: 1, include: true, code: "OF-PRE-012" },
      ] },
      { rubro: "01 DEMOLICIONES", tasks: [
        { name: "Apertura de vano en muro existente", includes: "Abrir el hueco en la pared de la casa para la puerta al nuevo dormitorio. El dintel va aparte.", scope: "Para la puerta de comunicación", unit: "u", qty: 1, include: true, code: "OF-DEM-020" },
        { name: "Retiro de escombros y tierra sobrante", includes: "Cargar y llevar en volquete el escombro y la tierra que sobra.", scope: "Carga y volquete", unit: "m³", qty: (v: V) => v.esc + 0.5, include: true, code: "OF-DEM-014" },
      ] },
      { rubro: "03 MOVIMIENTO DE SUELOS", tasks: [
        { name: "Excavación para zapatas", includes: "Cavar los pozos para las bases de cada columna.", scope: "Pozos a la profundidad de fundación", unit: "m³", qty: (v: V) => v.ncol * v.zap ** 2 * v.prof, include: true, code: "OF-EXC-002" },
        { name: "Excavación de zanja para vigas de fundación", includes: "Cavar la zanja que une las bases, donde van las vigas de fundación.", scope: "0,25 x 0,40", unit: "m³", qty: (v: V) => v.pvf * 0.25 * 0.4, include: true, code: "OF-EXC-003" },
        { name: "Relleno y compactación interior", includes: "Rellenar y apisonar el interior hasta llegar al nivel del piso de la casa.", scope: "Hasta el nivel de la casa existente", unit: "m³", qty: (v: V) => v.sp * v.rell, include: true, code: "OF-EXC-005" },
      ] },
      { rubro: "04 FUNDACIONES", tasks: [
        { name: "Hormigón de limpieza", includes: "Capa fina de hormigón pobre en el fondo de la excavación para apoyar el cimiento limpio.", scope: "H-4 de 5 cm bajo zapatas", unit: "m²", qty: (v: V) => v.ncol * v.zap ** 2, include: true, code: "OF-FUN-001" },
        { name: "Zapatas aisladas de H°A°", includes: "Bases de hormigón armado bajo cada columna.", scope: "H-21, alto 0,30", unit: "m³", qty: (v: V) => v.ncol * v.zap ** 2 * 0.3, include: true, code: "OF-FUN-005" },
        { name: "Troncos de columna", includes: "Tramo de columna de hormigón entre la base y la viga de fundación.", scope: "Desde la zapata hasta la viga de fundación", unit: "m³", qty: (v: V) => v.ncol * 0.2 * 0.2 * (v.prof - 0.3), include: true, code: "OF-FUN-006" },
        { name: "Vigas de fundación de H°A°", includes: "Vigas de hormigón armado que unen las bases y sostienen los muros.", scope: "0,20 x 0,30 en todo el perímetro", unit: "m³", qty: (v: V) => v.pvf * 0.2 * 0.3, include: true, code: "OF-FUN-004" },
      ] },
      { rubro: "07 AISLACIONES EN MUROS", tasks: [
        { name: "Capa aisladora horizontal doble", includes: "Barrera contra la humedad del suelo en la base del muro, para que no suba por la pared.", scope: "Concreto hidrófugo y pintura asfáltica", unit: "ml", qty: (v: V) => v.pn, include: true, code: "OF-AIS-001" },
        { name: "Aislación hidrófuga bajo contrapiso", includes: "Film de polietileno bajo el contrapiso que corta la humedad del terreno.", scope: "Film de polietileno 200 µm", unit: "m²", qty: (v: V) => v.sp, include: true, code: "OF-AIS-002" },
      ] },
      { rubro: "05 ESTRUCTURA HA", tasks: [
        { name: "Columnas de H°A°", includes: "Columnas de hormigón armado con su encofrado, hierro y hormigón.", scope: "0,20 x espesor de muro", unit: "m³", qty: (v: V) => v.ncol * 0.2 * v.e * v.h, include: true, code: "OF-EST-001" },
        { name: "Viga de encadenado superior", includes: "Viga de hormigón armado arriba del muro que lo ata y recibe el techo.", scope: "H-21, 0,20 de alto; recibe la cubierta", unit: "m³", qty: (v: V) => v.pvf * v.e * 0.2, include: true, code: "OF-EST-002" },
        { name: "Dinteles de ventanas", includes: "Refuerzo sobre cada ventana para sostener la pared de arriba.", scope: "Armados u hormigón premoldeado", unit: "u", qty: (v: V) => v.vent, include: true, code: "OF-EST-003" },
        { name: "Dintel en vano de puerta existente", includes: "Refuerzo que se coloca antes de abrir la pared de la casa, para que no se dañe.", scope: "Antes de abrir el vano", unit: "u", qty: 1, include: true, code: "OF-EST-004" },
      ] },
      { rubro: "06 MAMPOSTERÍA, Y OTROS CERRAMIENTOS", tasks: [
        { name: "Muro de ladrillo cerámico hueco 18", includes: "Levantar las paredes nuevas de ladrillo hueco de 18 cm. No incluye revoques.", scope: "Muros nuevos, descontando columnas y ventanas", unit: "m²", qty: (v: V) => v.smuro, include: true, code: "OF-MAM-002" },
      ] },
      { rubro: "16 CUBIERTAS · OPCIÓN 1: METÁLICA LIVIANA (STEEL FRAME)", tasks: [
        { name: "Estructura de perfiles galvanizados", includes: "Estructura del techo con perfiles de acero galvanizado fijados al encadenado.", scope: "PGC y PGU, cabriadas o vigas con anclajes al encadenado", unit: "m²", qty: (v: V) => v.scl, include: (v: V) => (v.cub === 1), code: "OF-CUB-008" },
        { name: "Barrera de vapor y aislación térmica", includes: "Lana de vidrio o aislante con foil bajo el techo para el frío, el calor y la condensación.", scope: "Lana de vidrio 50 mm con foil de aluminio", unit: "m²", qty: (v: V) => v.scl, include: (v: V) => (v.cub === 1), code: "OF-CUB-009" },
        { name: "Chapa prepintada trapezoidal o sinusoidal", includes: "Chapa prepintada atornillada a la estructura. Es la terminación del techo.", scope: "Con tornillos autoperforantes", unit: "m²", qty: (v: V) => v.scl, include: (v: V) => (v.cub === 1), code: "OF-CUB-010" },
      ] },
      { rubro: "16 CUBIERTAS · OPCIÓN 2: ESTRUCTURA DE MADERA", tasks: [
        { name: "Estructura de tirantes de madera", includes: "Estructura del techo con tirantes de madera tratada, anclados al encadenado.", scope: "Pino o eucalipto tratado, con anclajes al encadenado", unit: "m²", qty: (v: V) => v.scl, include: (v: V) => (v.cub === 2), code: "OF-CUB-011" },
        { name: "Entablonado o machimbre", includes: "Machimbre de pino sobre los tirantes; queda a la vista como cielorraso.", scope: "Machimbre de pino a la vista", unit: "m²", qty: (v: V) => v.scl, include: (v: V) => (v.cub === 2), code: "OF-CUB-012", note: "Queda como cielorraso" },
        { name: "Barrera de vapor y aislación térmica", includes: "Lana de vidrio o aislante con foil bajo el techo para el frío, el calor y la condensación.", scope: "Film y poliestireno o lana de vidrio", unit: "m²", qty: (v: V) => v.scl, include: (v: V) => (v.cub === 2), code: "OF-CUB-009" },
        { name: "Chapa o teja", includes: "Terminación del techo con chapa o tejas sobre clavaderas.", scope: "Sobre clavaderas", unit: "m²", qty: (v: V) => v.scl, include: (v: V) => (v.cub === 2), code: "OF-CUB-013" },
        { name: "Protección de la madera", includes: "Impregnante o barniz en tirantes y machimbre contra insectos y humedad.", scope: "Impregnante o barniz, dos manos", unit: "m²", qty: (v: V) => v.scl * 1.3, include: (v: V) => (v.cub === 2), code: "OF-CUB-014", note: "Incluye tirantes" },
      ] },
      { rubro: "16 CUBIERTAS · OPCIONES 1 Y 2: ZINGUERÍA", tasks: [
        { name: "Cumbreras, cenefas y babetas de chapa", includes: "Piezas de chapa que cierran bordes y encuentros del techo, incluida la unión con la casa.", scope: "Incluye babeta contra la casa existente", unit: "ml", qty: (v: V) => v.pcub, include: (v: V) => (v.cub <= 2), code: "OF-CUB-015" },
        { name: "Canaleta y bajada pluvial", includes: "Canaleta en el borde del techo y caño de bajada para el agua de lluvia.", scope: "Chapa galvanizada o PVC", unit: "ml", qty: (v: V) => v.l + 2 * v.alero + v.h, include: (v: V) => (v.cub <= 2), code: "OF-CUB-016" },
      ] },
      { rubro: "16 CUBIERTAS · OPCIÓN 3: LOSA DE VIGUETAS", tasks: [
        { name: "Losa de viguetas pretensadas y ladrillo", includes: "Techo de viguetas y ladrillos cerámicos con su apuntalamiento.", scope: "Con apuntalamiento", unit: "m²", qty: (v: V) => v.sls, include: (v: V) => (v.cub === 3), code: "OF-CUB-017" },
        { name: "Capa de compresión de H° con malla", includes: "Capa de 5 cm de hormigón con malla sobre las viguetas que las hace trabajar juntas.", scope: "5 cm", unit: "m²", qty: (v: V) => v.sls, include: (v: V) => (v.cub === 3), code: "OF-CUB-018" },
      ] },
      { rubro: "16 CUBIERTAS · OPCIÓN 4: LOSA MACIZA", tasks: [
        { name: "Losa maciza de H°A°", includes: "Techo de hormigón armado de 12 cm con encofrado y apuntalamiento.", scope: "Espesor 12 cm, con encofrado y apuntalamiento", unit: "m³", qty: (v: V) => v.sls * 0.12, include: (v: V) => (v.cub === 4), code: "OF-CUB-019" },
      ] },
      { rubro: "16 CUBIERTAS · OPCIONES 3 Y 4: AZOTEA", tasks: [
        { name: "Aislación térmica sobre losa", includes: "Placas de telgopor sobre la losa para que el ambiente no se caliente ni se enfríe tanto.", scope: "Poliestireno expandido 3 cm", unit: "m²", qty: (v: V) => v.sls, include: (v: V) => (v.cub >= 3), code: "OF-CUB-020" },
        { name: "Contrapiso con pendiente", includes: "Contrapiso liviano con la inclinación necesaria para que el agua vaya a los embudos.", scope: "H° alivianado", unit: "m²", qty: (v: V) => v.sls, include: (v: V) => (v.cub >= 3), code: "OF-CON-004" },
        { name: "Carpeta de azotea", includes: "Capa de mezcla alisada que deja la superficie lista para la membrana.", scope: "Bajo membrana", unit: "m²", qty: (v: V) => v.sls, include: (v: V) => (v.cub >= 3), code: "OF-CAR-002" },
        { name: "Membrana asfáltica 4 mm", includes: "Membrana asfáltica soldada con soplete y con solapes, que impermeabiliza el techo.", scope: "Con babeta perimetral", unit: "m²", qty: (v: V) => (v.sls + v.pcub * 0.2) * 1.1, include: (v: V) => (v.cub >= 3), code: "OF-CUB-002" },
        { name: "Embudo y bajada pluvial", includes: "Embudo en la losa y caño de bajada para el agua de lluvia.", scope: "", unit: "u", qty: 1, include: (v: V) => (v.cub >= 3), code: "OF-CUB-021" },
        { name: "Babeta de encuentro con la casa existente", includes: "Sellado de la junta entre el techo nuevo y la pared de la casa para que no filtre.", scope: "Sellado de la junta", unit: "ml", qty: (v: V) => v.apoyo, include: (v: V) => (v.cub >= 3), code: "OF-CUB-022" },
      ] },
      { rubro: "13 CIELORRASOS", tasks: [
        { name: "Cielorraso suspendido de placa de yeso", includes: "Cielorraso colgado del techo con estructura metálica y placa de yeso. La pintura va aparte.", scope: "Bajo cubierta metálica", unit: "m²", qty: (v: V) => v.sp, include: (v: V) => (v.cub === 1), code: "OF-CIE-002" },
        { name: "Cielorraso aplicado bajo losa", includes: "Revoque o yeso aplicado directamente debajo de la losa.", scope: "Revoque o enlucido de yeso", unit: "m²", qty: (v: V) => v.sp, include: (v: V) => (v.cub >= 3), code: "OF-CIE-003" },
      ] },
      { rubro: "08 REVOQUES", tasks: [
        { name: "Azotado hidrófugo exterior", includes: "Capa de mezcla con hidrófugo en la cara exterior que impide que entre la humedad.", scope: "", unit: "m²", qty: (v: V) => v.sre, include: true, code: "OF-REV-005" },
        { name: "Revoque grueso exterior", includes: "Primera capa de revoque en la cara exterior.", scope: "", unit: "m²", qty: (v: V) => v.sre, include: true, code: "OF-REV-007" },
        { name: "Revoque fino exterior o revestimiento acrílico", includes: "Terminación exterior con revoque fino o revestimiento plástico texturado.", scope: "", unit: "m²", qty: (v: V) => v.sre, include: true, code: "OF-REV-012" },
        { name: "Revoque grueso interior", includes: "Primera capa de revoque en las paredes interiores, incluida la de la casa existente.", scope: "Incluye la cara del muro existente", unit: "m²", qty: (v: V) => v.sri, include: true, code: "OF-REV-008" },
        { name: "Revoque fino interior", includes: "Capa final de revoque en las paredes interiores, lista para pintar.", scope: "A la cal", unit: "m²", qty: (v: V) => v.sri, include: true, code: "OF-REV-011" },
      ] },
      { rubro: "09 CONTRAPISOS", tasks: [
        { name: "Contrapiso de cascote sobre terreno", includes: "Base de 12 cm de cascote y mezcla sobre el terreno compactado.", scope: "12 cm", unit: "m²", qty: (v: V) => v.sp, include: true, code: "OF-CON-003" },
      ] },
      { rubro: "10 CARPETAS", tasks: [
        { name: "Carpeta de nivelación", includes: "Capa de mezcla lisa y nivelada donde se pega el piso.", scope: "Para cerámico, flotante o madera", unit: "m²", qty: (v: V) => v.sp, include: (v: V) => (v.piso !== 4), code: "OF-CAR-001" },
        { name: "Carpeta alisada o microcemento como piso terminado", includes: "El piso final es la carpeta alisada o el microcemento, con endurecedor y sellador.", scope: "Con endurecedor y sellador", unit: "m²", qty: (v: V) => v.sp, include: (v: V) => (v.piso === 4), code: "OF-CAR-004", note: "Es el piso final" },
      ] },
      { rubro: "11 PISOS", tasks: [
        { name: "Piso cerámico o porcelanato", includes: "Colocación de cerámico o porcelanato con pegamento y pastina. El material se cotiza aparte.", scope: "Colocación; material aparte", unit: "m²", qty: (v: V) => v.sp, include: (v: V) => (v.piso === 1), code: "OF-PIS-002" },
        { name: "Piso flotante o vinílico", includes: "Piso flotante o vinílico sobre manta niveladora.", scope: "Con manta niveladora", unit: "m²", qty: (v: V) => v.sp, include: (v: V) => (v.piso === 2), code: "OF-PIS-003" },
        { name: "Barrera de humedad y piso de madera", includes: "Barrera contra la humedad y piso de madera colocado, pulido y plastificado.", scope: "Entablonado o parquet, pulido y plastificado", unit: "m²", qty: (v: V) => v.sp, include: (v: V) => (v.piso === 3), code: "OF-PIS-004" },
      ] },
      { rubro: "12 ZOCALOS", tasks: [
        { name: "Zócalo", includes: "Zócalo a lo largo de las paredes, sin puertas ni muebles.", scope: "Cerámico, de madera o MDF según el piso", unit: "ml", qty: (v: V) => v.per - 0.8, include: (v: V) => (v.piso !== 4), code: "OF-ZOC-001" },
        { name: "Zócalo cementicio", includes: "Zócalo de cemento que combina con el piso alisado.", scope: "Para piso de cemento alisado", unit: "ml", qty: (v: V) => v.per - 0.8, include: (v: V) => (v.piso === 4), code: "OF-ZOC-003" },
      ] },
      { rubro: "17 CARPINTERÍA METÁLICA Y DE PVC", tasks: [
        { name: "Ventana de aluminio o PVC con vidrio", includes: "Ventana provista y colocada con premarco y vidrio.", scope: "Provisión y colocación con premarco", unit: "u", qty: (v: V) => v.vent, include: true, code: "OF-ABE-002" },
        { name: "Cortina de enrollar", includes: "Cortina de PVC con su cajón. Opcional.", scope: "De PVC con cajón", unit: "u", qty: (v: V) => v.vent, include: false, code: "OF-ABE-003", note: "Opcional" },
      ] },
      { rubro: "18 CARPINTERÍA DE MADERA", tasks: [
        { name: "Puerta placa con marco", includes: "Puerta placa con marco colocada en el vano nuevo, con sus herrajes.", scope: "En el vano abierto en la casa existente", unit: "u", qty: 1, include: true, code: "OF-ABE-004" },
      ] },
      { rubro: "19 HERRERÍA", tasks: [
        { name: "Rejas de seguridad", includes: "Rejas de hierro en las ventanas. Opcional.", scope: "", unit: "m²", qty: (v: V) => v.sv, include: (v: V) => (v.rej === 1), code: "OF-ABE-006" },
      ] },
      { rubro: "32 TERMINACIONES ESPECIALES", tasks: [
        { name: "Antepechos y umbral", includes: "Antepecho bajo la ventana y umbral en la puerta, de piedra o cementicio.", scope: "Piedra o cementicio", unit: "ml", qty: (v: V) => v.vent * v.va + 0.8, include: true, code: "OF-TER-002" },
      ] },
      { rubro: "26 INSTALACIÓN ELÉCTRICA", tasks: [
        { name: "Extensión de circuito desde el tablero", includes: "Llevar un circuito con su protección desde el tablero hasta el dormitorio.", scope: "Con protección propia", unit: "gl", qty: 1, include: true, code: "OF-ELE-003" },
        { name: "Bocas de tomacorriente, iluminación y llaves", includes: "Caja, caño, cable y módulo en cada punto eléctrico.", scope: "Cañería, cableado y módulo", unit: "u", qty: (v: V) => v.bocas, include: true, code: "OF-ELE-007" },
      ] },
      { rubro: "29 AIRE ACONDICIONADO", tasks: [
        { name: "Preinstalación de aire acondicionado split", includes: "Cañería de cobre, desagüe y toma para colocar un split más adelante. No incluye el equipo.", scope: "Cañería, desagüe y toma", unit: "u", qty: 1, include: (v: V) => (v.aa === 1), code: "OF-VEN-002" },
      ] },
      { rubro: "34 PINTURA", tasks: [
        { name: "Látex interior en paredes", includes: "Fijador y dos manos de látex en las paredes.", scope: "Fijador y dos manos", unit: "m²", qty: (v: V) => v.sri, include: true, code: "OF-PIN-009" },
        { name: "Látex para cielorraso", includes: "Fijador y dos manos de látex en el cielorraso.", scope: "Fijador y dos manos", unit: "m²", qty: (v: V) => v.sp, include: (v: V) => (v.cub !== 2), code: "OF-PIN-011", note: "Con madera, el cielorraso es el machimbre barnizado" },
        { name: "Látex exterior", includes: "Látex exterior en dos manos, si no se usa revestimiento acrílico. Opcional.", scope: "Si el exterior no lleva revestimiento acrílico", unit: "m²", qty: (v: V) => v.sre, include: false, code: "OF-PIN-017", note: "Opcional" },
      ] },
      { rubro: "90 AUXILIARES", tasks: [
        { name: "Limpieza final de obra", includes: "Limpieza de la obra al terminar y retiro de protecciones y sobrantes.", scope: "", unit: "m²", qty: (v: V) => v.sp, include: true, code: "OF-AUX-002" },
      ] },
    ],
  },
];
