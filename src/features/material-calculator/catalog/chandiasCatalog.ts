// ╔══════════════════════════════════════════════════════════════════╗
// ║  Catálogo Chandías — 50 rubros de construcción                 ║
// ║  Para agregar nuevos rubros: copiar una entrada y ajustar      ║
// ║  los campos id, nombre, categoria, unidad, dims, formula       ║
// ║  y materiales[].                                               ║
// ╚══════════════════════════════════════════════════════════════════╝

export interface ChandiasTaskDim {
  id: string;      // nombre de variable usada en la fórmula
  label: string;   // texto visible en el input
  unit: string;    // unidad del campo (m, m², etc.)
}

export interface ChandiasTaskMaterial {
  nombre: string;
  unit: string;
  coef: number;    // cantidad por unidad del rubro
  code?: string;   // código de material en la base org (opcional, mejora el matching)
}

/**
 * Salida derivada calculada paramétricamente (no es un material del APU).
 * Se usa para mostrar valores como superficie de encofrado que dependen de las
 * dimensiones pero NO tienen coeficiente fijo por unidad de obra.
 *
 * Cuando `asMaterial` está presente, la línea se inyecta también en la
 * composición de materiales del cálculo como "derivado por geometría"
 * (visible y costeado, pero marcado con badge Σ para distinguirlo del APU base).
 */
export interface ChandiasTaskDerivedOutput {
  id: string;      // identificador único dentro de la tarea, ej: 'encofrado'
  label: string;   // texto visible en la UI
  formula: string; // expresión JS que usa los ids de dims[], ej: 'largo*(ancho+2*alto)'
  unit: string;    // unidad del resultado, ej: 'm²'
  nota?: string;   // supuesto o aclaración (se muestra como leyenda)
  /** Si presente, inyecta esta salida como línea en la composición de materiales. */
  asMaterial?: {
    nombre?: string;  // nombre en la tabla (si omitido, usa `label`)
    code?: string;    // código para matching en base de materiales de la org
  };
}

/**
 * Configuración de familia estructural volumétrica (H.A.).
 * Activa la UI avanzada con parámetros de cómputo, encofrado y acero.
 * Si ausente, la tarea usa el flujo genérico (sin panel avanzado).
 *
 * EXTENSIBILIDAD: para agregar una nueva familia estructural H.A. basta con
 * agregar structuralConfig a la entrada del catálogo — sin tocar código.
 */
export interface StructuralFamilyConfig {
  /** Activa la UI avanzada de H.A. */
  enabled: true;
  /** Cuantía de acero por defecto [kg/m³] */
  defaultSteelRatio: number;
  /** Desperdicio de hormigón por defecto [%] (ej: 5 = 5%) */
  defaultWastePercent: number;
  /** Estado inicial de las caras de encofrado */
  defaultFormwork: {
    fondo: boolean;  // cara inferior
    lat1:  boolean;  // lateral largo 1
    lat2:  boolean;  // lateral largo 2
    lat3:  boolean;  // 4ª cara (perpendicular) — true para columnas
  };
  /** Variante de sketch — si ausente, usa 'box3d' */
  sketchVariant?: 'box3d' | 'column3d' | 'floor';
  /** Si true, el panel "Parámetros de cómputo" arranca expandido al seleccionar la tarea */
  defaultPanelOpen?: boolean;
  /** Etiquetas contextuales para los botones de caras de encofrado */
  faceLabels?: { fondo: string; lat1: string; lat2: string; lat3: string };
}

export interface ChandiasTask {
  id: string;
  nombre: string;
  categoria: string;
  unidad: string;       // unidad de medida del resultado (m², m³, ml, un)
  descripcion: string;
  dims: ChandiasTaskDim[];
  formula: string;      // expresión JS que usa los ids de dims[]
  materiales: ChandiasTaskMaterial[];
  derivedOutputs?: ChandiasTaskDerivedOutput[];  // cómputos derivados para mostrar en UI
  /** Si presente, activa la UI avanzada de H.A. (beam family) */
  structuralConfig?: StructuralFamilyConfig;
}

export const CHANDIAS_CATALOG: ChandiasTask[] = [

  // ── MOVIMIENTO DE SUELOS ─────────────────────────────────────────────────
  {
    id: 'EXC-001', nombre: 'Excavación a cielo abierto', categoria: 'Movimiento de Suelos',
    unidad: 'm³', descripcion: 'Excavación en tierra sin clasificar, manual o mecánica',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'ancho', label: 'Ancho', unit: 'm' }, { id: 'profundidad', label: 'Profundidad', unit: 'm' }],
    formula: 'largo*ancho*profundidad',
    materiales: [{ nombre: 'Puntas y barretas (amortiz.)', unit: 'kg', coef: 0.05 }],
  },
  {
    id: 'EXC-002', nombre: 'Excavación de zanjas para fundaciones', categoria: 'Movimiento de Suelos',
    unidad: 'm³', descripcion: 'Zanja a mano, profundidad hasta 1.50m',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'ancho', label: 'Ancho', unit: 'm' }, { id: 'profundidad', label: 'Profundidad', unit: 'm' }],
    formula: 'largo*ancho*profundidad',
    materiales: [{ nombre: 'Puntas y barretas (amortiz.)', unit: 'kg', coef: 0.05 }],
  },
  {
    id: 'EXC-003', nombre: 'Relleno y compactación con material propio', categoria: 'Movimiento de Suelos',
    unidad: 'm³', descripcion: 'Relleno en capas de 20cm con compactación manual',
    dims: [{ id: 'volumen', label: 'Volumen', unit: 'm³' }],
    formula: 'volumen',
    materiales: [{ nombre: 'Agua para compactación', unit: 'm³', coef: 0.12 }],
  },
  {
    id: 'EXC-004', nombre: 'Nivelación y emparejamiento de terreno', categoria: 'Movimiento de Suelos',
    unidad: 'm²', descripcion: 'Limpieza y emparejamiento superficial',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'ancho', label: 'Ancho', unit: 'm' }],
    formula: 'largo*ancho',
    materiales: [],
  },
  {
    id: 'EXC-005', nombre: 'Hormigón de limpieza H-4 (e=5cm)', categoria: 'Movimiento de Suelos',
    unidad: 'm²', descripcion: 'Capa de regularización bajo fundaciones, e=5cm',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'ancho', label: 'Ancho', unit: 'm' }],
    formula: 'largo*ancho',
    materiales: [
      { nombre: 'Cemento Portland CPN 40', code: 'CEM-PORT', unit: 'kg', coef: 7.5 },
      { nombre: 'Arena gruesa', unit: 'm³', coef: 0.025 },
      { nombre: 'Piedra partida 6/20', unit: 'm³', coef: 0.037 },
      { nombre: 'Agua', unit: 'm³', coef: 0.007 },
    ],
  },

  // ── HORMIGONES ───────────────────────────────────────────────────────────
  {
    id: 'HOR-001', nombre: 'Hormigón en masa H-8', categoria: 'Hormigones',
    unidad: 'm³', descripcion: 'Para fundaciones corridas y mampostería en masa',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'ancho', label: 'Sección ancho', unit: 'm' }, { id: 'alto', label: 'Sección alto', unit: 'm' }],
    formula: 'largo*ancho*alto',
    materiales: [
      { nombre: 'Cemento Portland CPN 40', code: 'CEM-PORT', unit: 'kg', coef: 150 },
      { nombre: 'Arena gruesa', unit: 'm³', coef: 0.55 },
      { nombre: 'Piedra partida 6/20', unit: 'm³', coef: 0.85 },
      { nombre: 'Agua', unit: 'm³', coef: 0.18 },
    ],
  },
  {
    id: 'HOR-002', nombre: 'Hormigón H-13 (dosaje 1:2:4)', categoria: 'Hormigones',
    unidad: 'm³', descripcion: 'Bases y zapatas, resistencia 13 MPa',
    dims: [{ id: 'volumen', label: 'Volumen', unit: 'm³' }],
    formula: 'volumen',
    materiales: [
      { nombre: 'Cemento Portland CPN 40', code: 'CEM-PORT', unit: 'kg', coef: 200 },
      { nombre: 'Arena gruesa', unit: 'm³', coef: 0.55 },
      { nombre: 'Piedra partida 6/20', unit: 'm³', coef: 0.85 },
      { nombre: 'Agua', unit: 'm³', coef: 0.18 },
    ],
  },
  {
    id: 'HOR-003', nombre: 'Hormigón H-17 (dosaje 1:2:3)', categoria: 'Hormigones',
    unidad: 'm³', descripcion: 'Losas, vigas y columnas, resistencia 17 MPa',
    dims: [{ id: 'volumen', label: 'Volumen', unit: 'm³' }],
    formula: 'volumen',
    materiales: [
      { nombre: 'Cemento Portland CPN 40', code: 'CEM-PORT', unit: 'kg', coef: 250 },
      { nombre: 'Arena gruesa', unit: 'm³', coef: 0.55 },
      { nombre: 'Piedra partida 6/20', unit: 'm³', coef: 0.85 },
      { nombre: 'Agua', unit: 'm³', coef: 0.18 },
    ],
  },
  {
    id: 'HOR-004', nombre: 'Hormigón H-21 (dosaje 1:1.5:3)', categoria: 'Hormigones',
    unidad: 'm³', descripcion: 'Estructura principal, resistencia 21 MPa',
    dims: [{ id: 'volumen', label: 'Volumen', unit: 'm³' }],
    formula: 'volumen',
    materiales: [
      { nombre: 'Cemento Portland CPN 40', code: 'CEM-PORT', unit: 'kg', coef: 300 },
      { nombre: 'Arena gruesa', unit: 'm³', coef: 0.55 },
      { nombre: 'Piedra partida 6/20', unit: 'm³', coef: 0.85 },
      { nombre: 'Agua', unit: 'm³', coef: 0.18 },
      { nombre: 'Acero ADN 420 ø10mm', unit: 'kg', coef: 50 },
    ],
  },
  {
    id: 'HOR-005', nombre: 'Losa de hormigón armado e=12cm', categoria: 'Hormigones',
    unidad: 'm²', descripcion: 'Losa maciza, armadura simple, e=12cm',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'ancho', label: 'Ancho', unit: 'm' }],
    formula: 'largo*ancho',
    materiales: [
      { nombre: 'Cemento Portland CPN 40', code: 'CEM-PORT', unit: 'kg', coef: 36 },
      { nombre: 'Arena gruesa', unit: 'm³', coef: 0.079 },
      { nombre: 'Piedra partida 6/20', unit: 'm³', coef: 0.12 },
      { nombre: 'Acero ADN 420 ø8mm', unit: 'kg', coef: 8 },
      { nombre: 'Agua', unit: 'm³', coef: 0.022 },
    ],
  },
  {
    id: 'HOR-006', nombre: 'Viga de hormigón armado 20×30cm', categoria: 'Hormigones',
    unidad: 'ml', descripcion: 'Viga principal 20×30cm con armadura',
    dims: [{ id: 'largo', label: 'Longitud total', unit: 'm' }],
    formula: 'largo',
    materiales: [
      { nombre: 'Cemento Portland CPN 40', code: 'CEM-PORT', unit: 'kg', coef: 15 },
      { nombre: 'Arena gruesa', unit: 'm³', coef: 0.033 },
      { nombre: 'Piedra partida 6/20', unit: 'm³', coef: 0.05 },
      { nombre: 'Acero ADN 420 ø12mm', unit: 'kg', coef: 3.6 },
      { nombre: 'Alambre de atar N°18', unit: 'kg', coef: 0.07 },
    ],
  },
  {
    id: 'HOR-007', nombre: 'Columna de hormigón armado 25×25cm', categoria: 'Hormigones',
    unidad: 'ml', descripcion: 'Columna estructural 25×25cm con armadura',
    dims: [{ id: 'largo', label: 'Altura total', unit: 'm' }],
    formula: 'largo',
    materiales: [
      { nombre: 'Cemento Portland CPN 40', code: 'CEM-PORT', unit: 'kg', coef: 15.6 },
      { nombre: 'Arena gruesa', unit: 'm³', coef: 0.034 },
      { nombre: 'Piedra partida 6/20', unit: 'm³', coef: 0.052 },
      { nombre: 'Acero ADN 420 ø12mm', unit: 'kg', coef: 5.2 },
      { nombre: 'Alambre de atar N°18', unit: 'kg', coef: 0.10 },
    ],
  },

  // ── MAMPOSTERÍA ──────────────────────────────────────────────────────────
  {
    id: 'MAM-001', nombre: 'Muro ladrillo común 6x12x24 e=0.15m (1 pie)', categoria: 'Mampostería',
    unidad: 'm²', descripcion: 'Muro portante de 1 pie, junta normal 1.5cm, mortero 1:1:6',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'alto', label: 'Alto', unit: 'm' }],
    formula: 'largo*alto',
    materiales: [
      { nombre: 'Ladrillo común 6x12x24', code: 'LAD-COM', unit: 'un', coef: 70 },
      { nombre: 'Cemento Portland CPN 40', code: 'CEM-PORT', unit: 'kg', coef: 12 },
      { nombre: 'Cal hidratada', code: 'CAL-HID', unit: 'kg', coef: 8 },
      { nombre: 'Arena gruesa', unit: 'm³', coef: 0.040 },
    ],
  },
  {
    id: 'MAM-002', nombre: 'Muro ladrillo común 6x12x24 e=0.30m (2 pies)', categoria: 'Mampostería',
    unidad: 'm²', descripcion: 'Muro de cerramiento doble, junta normal',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'alto', label: 'Alto', unit: 'm' }],
    formula: 'largo*alto',
    materiales: [
      { nombre: 'Ladrillo común 6x12x24', code: 'LAD-COM', unit: 'un', coef: 35 },
      { nombre: 'Cemento Portland CPN 40', code: 'CEM-PORT', unit: 'kg', coef: 6 },
      { nombre: 'Cal hidratada', code: 'CAL-HID', unit: 'kg', coef: 4 },
      { nombre: 'Arena gruesa', unit: 'm³', coef: 0.020 },
    ],
  },
  {
    id: 'MAM-003', nombre: 'Muro ladrillo hueco e=0.20m', categoria: 'Mampostería',
    unidad: 'm²', descripcion: 'Cerramiento con ladrillo hueco 18×18×33cm',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'alto', label: 'Alto', unit: 'm' }],
    formula: 'largo*alto',
    materiales: [
      { nombre: 'Ladrillo hueco 18x18x33', code: 'LAD-H18', unit: 'un', coef: 13 },
      { nombre: 'Cemento Portland CPN 40', code: 'CEM-PORT', unit: 'kg', coef: 5 },
      { nombre: 'Cal hidratada', code: 'CAL-HID', unit: 'kg', coef: 3 },
      { nombre: 'Arena gruesa', unit: 'm³', coef: 0.020 },
    ],
  },
  {
    id: 'MAM-004', nombre: 'Muro ladrillo hueco e=0.15m', categoria: 'Mampostería',
    unidad: 'm²', descripcion: 'Muro intermedio con ladrillo hueco 12×18×33cm',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'alto', label: 'Alto', unit: 'm' }],
    formula: 'largo*alto',
    materiales: [
      { nombre: 'Ladrillo hueco 12x18x33', code: 'LAD-H12', unit: 'un', coef: 18 },
      { nombre: 'Cemento Portland CPN 40', code: 'CEM-PORT', unit: 'kg', coef: 4 },
      { nombre: 'Cal hidratada', code: 'CAL-HID', unit: 'kg', coef: 2.5 },
      { nombre: 'Arena gruesa', unit: 'm³', coef: 0.015 },
    ],
  },
  {
    id: 'MAM-005', nombre: 'Tabique ladrillo cerámico 8x18x33 e=0.08m', categoria: 'Mampostería',
    unidad: 'm²', descripcion: 'Tabique divisorio ceramico simple, e=8cm, 1 hoja',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'alto', label: 'Alto', unit: 'm' }],
    formula: 'largo*alto',
    materiales: [
      { nombre: 'Ladrillo hueco 8x18x33', code: 'LAD-H8', unit: 'un', coef: 20 },
      { nombre: 'Cemento Portland CPN 40', code: 'CEM-PORT', unit: 'kg', coef: 3 },
      { nombre: 'Cal hidratada', code: 'CAL-HID', unit: 'kg', coef: 2 },
      { nombre: 'Arena gruesa', unit: 'm³', coef: 0.012 },
    ],
  },
  {
    id: 'MAM-006', nombre: 'Muro ladrillo ceramico 18x18x33 e=0.18m', categoria: 'Mampostería',
    unidad: 'm²', descripcion: 'Muro exterior ceramico, e=18cm, mortero 1:1:6',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'alto', label: 'Alto', unit: 'm' }],
    formula: 'largo*alto',
    materiales: [
      { nombre: 'Ladrillo ceramico 18x18x33', code: 'LAD-C18', unit: 'un', coef: 16 },
      { nombre: 'Cemento Portland CPN 40', code: 'CEM-PORT', unit: 'kg', coef: 4 },
      { nombre: 'Cal hidratada', code: 'CAL-HID', unit: 'kg', coef: 3 },
      { nombre: 'Arena gruesa', unit: 'm³', coef: 0.018 },
    ],
  },

  // ── REVOQUES ─────────────────────────────────────────────────────────────
  {
    id: 'REV-001', nombre: 'Revoque grueso interior (1:2:9)', categoria: 'Revoques',
    unidad: 'm²', descripcion: 'Mortero cemento-cal-arena, e≈15mm, base para fino',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'alto', label: 'Alto', unit: 'm' }],
    formula: 'largo*alto',
    materiales: [
      { nombre: 'Cemento Portland CPN 40', code: 'CEM-PORT', unit: 'kg', coef: 4.5 },
      { nombre: 'Cal hidratada', code: 'CAL-HID', unit: 'kg', coef: 5 },
      { nombre: 'Arena fina cernida', unit: 'm³', coef: 0.030 },
    ],
  },
  {
    id: 'REV-002', nombre: 'Revoque fino a la cal (enlucido)', categoria: 'Revoques',
    unidad: 'm²', descripcion: 'Yeso o pasta cal, acabado liso, e≈5mm',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'alto', label: 'Alto', unit: 'm' }],
    formula: 'largo*alto',
    materiales: [
      { nombre: 'Yeso común para construcción', unit: 'kg', coef: 8 },
      { nombre: 'Cal hidratada', code: 'CAL-HID', unit: 'kg', coef: 2 },
    ],
  },
  {
    id: 'REV-003', nombre: 'Revoque exterior hidrófugo', categoria: 'Revoques',
    unidad: 'm²', descripcion: 'Mortero con hidrófugo de fraguado, e≈20mm',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'alto', label: 'Alto', unit: 'm' }],
    formula: 'largo*alto',
    materiales: [
      { nombre: 'Cemento Portland CPN 40', code: 'CEM-PORT', unit: 'kg', coef: 7 },
      { nombre: 'Arena media lavada', unit: 'm³', coef: 0.030 },
      { nombre: 'Hidrófugo líquido integral', unit: 'l', coef: 0.20 },
    ],
  },
  {
    id: 'REV-004', nombre: 'Revoque grueso exterior (1:3)', categoria: 'Revoques',
    unidad: 'm²', descripcion: 'Mezcla cemento-arena, para exteriores no hidrófugos',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'alto', label: 'Alto', unit: 'm' }],
    formula: 'largo*alto',
    materiales: [
      { nombre: 'Cemento Portland CPN 40', code: 'CEM-PORT', unit: 'kg', coef: 6 },
      { nombre: 'Cal hidratada', code: 'CAL-HID', unit: 'kg', coef: 3 },
      { nombre: 'Arena media lavada', unit: 'm³', coef: 0.030 },
    ],
  },
  {
    id: 'REV-005', nombre: 'Enlucido bajo azulejo / porcelanato (1:4)', categoria: 'Revoques',
    unidad: 'm²', descripcion: 'Base cementosa para aplicación de revestimiento',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'alto', label: 'Alto', unit: 'm' }],
    formula: 'largo*alto',
    materiales: [
      { nombre: 'Cemento Portland CPN 40', code: 'CEM-PORT', unit: 'kg', coef: 8 },
      { nombre: 'Arena fina cernida', unit: 'm³', coef: 0.025 },
    ],
  },

  // ── CONTRAPISOS Y PISOS ──────────────────────────────────────────────────
  {
    id: 'PIS-001', nombre: 'Contrapiso de cascote s/terreno natural (e=12cm)', categoria: 'Contrapisos y Pisos',
    unidad: 'm²', descripcion: 'Base con cascote de ladrillo triturado, e=12cm',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'ancho', label: 'Ancho', unit: 'm' }],
    formula: 'largo*ancho',
    materiales: [
      { nombre: 'Cascote de ladrillo', unit: 'm³', coef: 0.12 },
      { nombre: 'Cemento Portland CPN 40', code: 'CEM-PORT', unit: 'kg', coef: 6 },
      { nombre: 'Arena gruesa', unit: 'm³', coef: 0.025 },
    ],
  },
  {
    id: 'PIS-002', nombre: 'Contrapiso hormigón pobre (e=10cm)', categoria: 'Contrapisos y Pisos',
    unidad: 'm²', descripcion: 'Contrapiso hormigón 1:4:8, e=10cm',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'ancho', label: 'Ancho', unit: 'm' }],
    formula: 'largo*ancho',
    materiales: [
      { nombre: 'Cemento Portland CPN 40', code: 'CEM-PORT', unit: 'kg', coef: 22 },
      { nombre: 'Arena gruesa', unit: 'm³', coef: 0.050 },
      { nombre: 'Piedra partida 6/20', unit: 'm³', coef: 0.075 },
    ],
  },
  {
    id: 'PIS-003', nombre: 'Piso de cemento alisado (e=3cm)', categoria: 'Contrapisos y Pisos',
    unidad: 'm²', descripcion: 'Mortero 1:3 cemento-arena, alisado con paleta',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'ancho', label: 'Ancho', unit: 'm' }],
    formula: 'largo*ancho',
    materiales: [
      { nombre: 'Cemento Portland CPN 40', code: 'CEM-PORT', unit: 'kg', coef: 9 },
      { nombre: 'Arena fina cernida', unit: 'm³', coef: 0.030 },
    ],
  },
  {
    id: 'PIS-004', nombre: 'Piso mosaico calcáreo 20×20cm', categoria: 'Contrapisos y Pisos',
    unidad: 'm²', descripcion: 'Mosaico sobre cama de mortero 1:4',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'ancho', label: 'Ancho', unit: 'm' }],
    formula: 'largo*ancho',
    materiales: [
      { nombre: 'Mosaico calcáreo 20×20cm', unit: 'un', coef: 25 },
      { nombre: 'Cemento Portland CPN 40', code: 'CEM-PORT', unit: 'kg', coef: 5 },
      { nombre: 'Arena fina cernida', unit: 'm³', coef: 0.015 },
      { nombre: 'Pastina cementicia', unit: 'kg', coef: 0.3 },
    ],
  },
  {
    id: 'PIS-005', nombre: 'Piso cerámico 30×30cm', categoria: 'Contrapisos y Pisos',
    unidad: 'm²', descripcion: 'Cerámica esmaltada, pegado con cemento cola',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'ancho', label: 'Ancho', unit: 'm' }],
    formula: 'largo*ancho',
    materiales: [
      { nombre: 'Cerámica 30×30cm (c/5% desp.)', unit: 'un', coef: 11.7 },
      { nombre: 'Cemento cola (bolsa 25kg)', unit: 'kg', coef: 5 },
      { nombre: 'Pastina cementicia', unit: 'kg', coef: 0.5 },
    ],
  },
  {
    id: 'PIS-006', nombre: 'Piso cerámico 45×45cm', categoria: 'Contrapisos y Pisos',
    unidad: 'm²', descripcion: 'Cerámica de alto tránsito, adhesivo gris',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'ancho', label: 'Ancho', unit: 'm' }],
    formula: 'largo*ancho',
    materiales: [
      { nombre: 'Cerámica 45×45cm (c/5% desp.)', unit: 'un', coef: 5.5 },
      { nombre: 'Cemento cola (bolsa 25kg)', unit: 'kg', coef: 4.5 },
      { nombre: 'Pastina cementicia', unit: 'kg', coef: 0.4 },
    ],
  },
  {
    id: 'PIS-007', nombre: 'Piso porcelanato 60×60cm', categoria: 'Contrapisos y Pisos',
    unidad: 'm²', descripcion: 'Porcelanato rectificado, adhesivo flexible',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'ancho', label: 'Ancho', unit: 'm' }],
    formula: 'largo*ancho',
    materiales: [
      { nombre: 'Porcelanato 60×60cm (c/5% desp.)', unit: 'un', coef: 2.94 },
      { nombre: 'Cemento cola flexible', unit: 'kg', coef: 4 },
      { nombre: 'Pastina epoxi / cementicia', unit: 'kg', coef: 0.3 },
    ],
  },
  {
    id: 'PIS-008', nombre: 'Solado de hormigón visto (e=8cm)', categoria: 'Contrapisos y Pisos',
    unidad: 'm²', descripcion: 'Hormigón 1:2:4 para solados exteriores, e=8cm',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'ancho', label: 'Ancho', unit: 'm' }],
    formula: 'largo*ancho',
    materiales: [
      { nombre: 'Cemento Portland CPN 40', code: 'CEM-PORT', unit: 'kg', coef: 18 },
      { nombre: 'Arena gruesa', unit: 'm³', coef: 0.040 },
      { nombre: 'Piedra partida 6/20', unit: 'm³', coef: 0.065 },
    ],
  },

  // ── REVESTIMIENTOS ───────────────────────────────────────────────────────
  {
    id: 'RVE-001', nombre: 'Revestimiento azulejo 15×15cm', categoria: 'Revestimientos',
    unidad: 'm²', descripcion: 'Azulejo cerámico para baños y cocinas',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'alto', label: 'Alto', unit: 'm' }],
    formula: 'largo*alto',
    materiales: [
      { nombre: 'Azulejo 15×15cm (c/4% desp.)', unit: 'un', coef: 46 },
      { nombre: 'Cemento cola blanca', unit: 'kg', coef: 4 },
      { nombre: 'Pastina blanca fina', unit: 'kg', coef: 0.4 },
    ],
  },
  {
    id: 'RVE-002', nombre: 'Revestimiento porcelanato 30×60cm', categoria: 'Revestimientos',
    unidad: 'm²', descripcion: 'Porcelanato pared, adhesivo blanco flexible',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'alto', label: 'Alto', unit: 'm' }],
    formula: 'largo*alto',
    materiales: [
      { nombre: 'Porcelanato 30×60cm (c/5% desp.)', unit: 'un', coef: 5.9 },
      { nombre: 'Cemento cola blanca flexible', unit: 'kg', coef: 5 },
      { nombre: 'Pastina cementicia blanca', unit: 'kg', coef: 0.5 },
    ],
  },
  {
    id: 'RVE-003', nombre: 'Zócalo cerámico h=10cm', categoria: 'Revestimientos',
    unidad: 'ml', descripcion: 'Cenefa / rodapié cerámico',
    dims: [{ id: 'largo', label: 'Longitud', unit: 'm' }],
    formula: 'largo',
    materiales: [
      { nombre: 'Zócalo cerámico 10×30cm (c/5%)', unit: 'un', coef: 3.5 },
      { nombre: 'Cemento cola', unit: 'kg', coef: 0.5 },
      { nombre: 'Pastina', unit: 'kg', coef: 0.05 },
    ],
  },
  {
    id: 'RVE-004', nombre: 'Revestimiento laja de piedra natural', categoria: 'Revestimientos',
    unidad: 'm²', descripcion: 'Laja de piedra sobre mortero 1:4',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'alto', label: 'Alto', unit: 'm' }],
    formula: 'largo*alto',
    materiales: [
      { nombre: 'Laja de piedra (prov.)', unit: 'm³', coef: 0.12 },
      { nombre: 'Cemento Portland CPN 40', code: 'CEM-PORT', unit: 'kg', coef: 8 },
      { nombre: 'Arena gruesa', unit: 'm³', coef: 0.025 },
    ],
  },

  // ── CUBIERTAS ────────────────────────────────────────────────────────────
  {
    id: 'CUB-001', nombre: 'Cubierta de chapa sinusoidal C25', categoria: 'Cubiertas',
    unidad: 'm²', descripcion: 'Chapa galvanizada C25, solape lateral y longitudinal',
    dims: [{ id: 'largo', label: 'Largo (proyección)', unit: 'm' }, { id: 'ancho', label: 'Ancho (proyección)', unit: 'm' }],
    formula: 'largo*ancho',
    materiales: [
      { nombre: 'Chapa sinusoidal galv. C25', unit: 'm²', coef: 1.15 },
      { nombre: 'Tornillos autoperforantes ø6×75mm', unit: 'un', coef: 7 },
      { nombre: 'Burlete cierre de caballete', unit: 'ml', coef: 0.5 },
      { nombre: 'Sellador siliconado neutro', unit: 'l', coef: 0.03 },
    ],
  },
  {
    id: 'CUB-002', nombre: 'Cubierta de teja cerámica s/torta de barro', categoria: 'Cubiertas',
    unidad: 'm²', descripcion: 'Teja francesa o española sobre torta de barro+cal',
    dims: [{ id: 'largo', label: 'Largo (proyección)', unit: 'm' }, { id: 'ancho', label: 'Ancho (proyección)', unit: 'm' }],
    formula: 'largo*ancho',
    materiales: [
      { nombre: 'Teja cerámica curva', unit: 'un', coef: 16 },
      { nombre: 'Barro negro amasado', unit: 'm³', coef: 0.030 },
      { nombre: 'Cal viva', unit: 'kg', coef: 2 },
    ],
  },
  {
    id: 'CUB-003', nombre: 'Membrana asfáltica 4mm APP', categoria: 'Cubiertas',
    unidad: 'm²', descripcion: 'Membrana impermeabilizante termofusible, 2 capas',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'ancho', label: 'Ancho', unit: 'm' }],
    formula: 'largo*ancho',
    materiales: [
      { nombre: 'Membrana asfáltica APP 4mm', unit: 'm²', coef: 1.10 },
      { nombre: 'Imprimación asfáltica (fondo)', unit: 'l', coef: 0.35 },
      { nombre: 'Sikaflex / sellador juntas', unit: 'l', coef: 0.05 },
    ],
  },
  {
    id: 'CUB-004', nombre: 'Losa con viguetas pretensadas y bloques', categoria: 'Cubiertas',
    unidad: 'm²', descripcion: 'Sistema de losa alivianada 20+5cm de capa',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'ancho', label: 'Ancho', unit: 'm' }],
    formula: 'largo*ancho',
    materiales: [
      { nombre: 'Vigueta pretensada 20cm', unit: 'ml', coef: 1.4 },
      { nombre: 'Bloque cerámico 20×20×25cm', unit: 'un', coef: 4 },
      { nombre: 'Cemento Portland CPN 40', code: 'CEM-PORT', unit: 'kg', coef: 18 },
      { nombre: 'Arena gruesa', unit: 'm³', coef: 0.040 },
      { nombre: 'Acero ADN ø6mm (malla)', unit: 'kg', coef: 1.5 },
    ],
  },

  // ── AISLACIONES ──────────────────────────────────────────────────────────
  {
    id: 'AIS-001', nombre: 'Aislación hidrófuga horizontal bajo contrapiso', categoria: 'Aislaciones',
    unidad: 'm²', descripcion: 'Pintura asfáltica sobre tierra, 2 manos',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'ancho', label: 'Ancho', unit: 'm' }],
    formula: 'largo*ancho',
    materiales: [
      { nombre: 'Pintura asfáltica al solvente', unit: 'l', coef: 0.50 },
      { nombre: 'Aguarrás mineral', unit: 'l', coef: 0.08 },
    ],
  },
  {
    id: 'AIS-002', nombre: 'Aislación térmica lana de vidrio e=50mm', categoria: 'Aislaciones',
    unidad: 'm²', descripcion: 'Panel de lana de vidrio 50mm con papel kraft',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'ancho', label: 'Ancho', unit: 'm' }],
    formula: 'largo*ancho',
    materiales: [
      { nombre: 'Lana de vidrio 50mm c/kraft', unit: 'm²', coef: 1.05 },
      { nombre: 'Cinta de sellado papel kraft', unit: 'ml', coef: 0.20 },
      { nombre: 'Grampas / fijadores', unit: 'un', coef: 4 },
    ],
  },
  {
    id: 'AIS-003', nombre: 'Barrera de vapor film polietileno 200µ', categoria: 'Aislaciones',
    unidad: 'm²', descripcion: 'Film polietileno negro bajo losa o entre capas',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'ancho', label: 'Ancho', unit: 'm' }],
    formula: 'largo*ancho',
    materiales: [
      { nombre: 'Film polietileno 200µ', unit: 'm²', coef: 1.10 },
      { nombre: 'Cinta adhesiva doble faz', unit: 'ml', coef: 0.20 },
    ],
  },

  // ── CIELORRASOS ──────────────────────────────────────────────────────────
  {
    id: 'CIE-001', nombre: 'Cielorraso revoque sobre losa', categoria: 'Cielorrasos',
    unidad: 'm²', descripcion: 'Enlucido yeso + cal sobre cara inferior de losa',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'ancho', label: 'Ancho', unit: 'm' }],
    formula: 'largo*ancho',
    materiales: [
      { nombre: 'Yeso común para cielorraso', unit: 'kg', coef: 8 },
      { nombre: 'Cal hidratada', code: 'CAL-HID', unit: 'kg', coef: 2 },
      { nombre: 'Arena fina cernida', unit: 'm³', coef: 0.015 },
    ],
  },
  {
    id: 'CIE-002', nombre: 'Cielorraso suspendido en seco (Durlock)', categoria: 'Cielorrasos',
    unidad: 'm²', descripcion: 'Placa de yeso 12.5mm sobre estructura de perfiles',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'ancho', label: 'Ancho', unit: 'm' }],
    formula: 'largo*ancho',
    materiales: [
      { nombre: 'Placa de yeso 12.5mm', unit: 'm²', coef: 1.10 },
      { nombre: 'Perfil montante 70mm (par)', unit: 'ml', coef: 1.2 },
      { nombre: 'Perfil solera 70mm', unit: 'ml', coef: 0.8 },
      { nombre: 'Tornillos autoperforantes 3.5×25mm', unit: 'un', coef: 12 },
      { nombre: 'Masilla para juntas (bolsa 20kg)', unit: 'kg', coef: 0.35 },
      { nombre: 'Cinta de papel microperforada', unit: 'ml', coef: 0.8 },
    ],
  },
  {
    id: 'CIE-003', nombre: 'Cielorraso madera machimbrada', categoria: 'Cielorrasos',
    unidad: 'm²', descripcion: 'Tablones machimbrados de pino 1a clavados a viguería',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'ancho', label: 'Ancho', unit: 'm' }],
    formula: 'largo*ancho',
    materiales: [
      { nombre: 'Machimbre pino (c/10% desp.)', unit: 'm²', coef: 1.15 },
      { nombre: 'Clavos de acero 2½" (tipo cielorraso)', unit: 'kg', coef: 0.02 },
    ],
  },

  // ── PINTURAS ─────────────────────────────────────────────────────────────
  {
    id: 'PIN-001', nombre: 'Pintura látex interior (2 manos)', categoria: 'Pinturas',
    unidad: 'm²', descripcion: 'Previo enduído y sellador, 2 manos de látex vinílico',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'alto', label: 'Alto', unit: 'm' }],
    formula: 'largo*alto',
    materiales: [
      { nombre: 'Pintura látex vinílico interior', unit: 'l', coef: 0.30 },
      { nombre: 'Sellador acrílico fijador', unit: 'l', coef: 0.08 },
      { nombre: 'Enduído plástico interior', unit: 'kg', coef: 0.15 },
      { nombre: 'Lija al agua N°150', unit: 'un', coef: 0.10 },
    ],
  },
  {
    id: 'PIN-002', nombre: 'Pintura látex exterior (2 manos)', categoria: 'Pinturas',
    unidad: 'm²', descripcion: 'Látex exterior acrílico con base fijadora',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'alto', label: 'Alto', unit: 'm' }],
    formula: 'largo*alto',
    materiales: [
      { nombre: 'Pintura látex acrílico exterior', unit: 'l', coef: 0.35 },
      { nombre: 'Fijador acrílico para exteriores', unit: 'l', coef: 0.10 },
    ],
  },
  {
    id: 'PIN-003', nombre: 'Pintura al cal (2 manos)', categoria: 'Pinturas',
    unidad: 'm²', descripcion: 'Lechada de cal para paredes de obra gruesa',
    dims: [{ id: 'largo', label: 'Largo', unit: 'm' }, { id: 'alto', label: 'Alto', unit: 'm' }],
    formula: 'largo*alto',
    materiales: [
      { nombre: 'Cal hidratada en polvo', code: 'CAL-AER', unit: 'kg', coef: 0.15 },
    ],
  },
  {
    id: 'PIN-004', nombre: 'Esmalte sintético s/carpintería de madera (2 manos)', categoria: 'Pinturas',
    unidad: 'm²', descripcion: 'Preparación + fondo + 2 manos de esmalte',
    dims: [{ id: 'largo', label: 'Largo (desarrollo)', unit: 'm' }, { id: 'ancho', label: 'Ancho', unit: 'm' }],
    formula: 'largo*ancho',
    materiales: [
      { nombre: 'Esmalte sintético brillante', unit: 'l', coef: 0.20 },
      { nombre: 'Fondo anticorrosivo / sellador madera', unit: 'l', coef: 0.08 },
      { nombre: 'Aguarrás mineral', unit: 'l', coef: 0.05 },
      { nombre: 'Lija al agua N°180', unit: 'un', coef: 0.20 },
    ],
  },

  // ── FUNDACIONES ──────────────────────────────────────────────────────────
  // APU base volumétrico (m³). Encofrado calculado paramétricamente (derivedOutputs).
  {
    id: 'FUN-001', nombre: 'Bases de Hormigón Armado H-21', categoria: 'Fundaciones',
    unidad: 'm³', descripcion: 'Base aislada o corrida de H.A. H-21. 50 kg/m³ de acero ADN 420.',
    dims: [
      { id: 'largo',  label: 'Largo',  unit: 'm' },
      { id: 'ancho',  label: 'Ancho',  unit: 'm' },
      { id: 'alto',   label: 'Alto',   unit: 'm' },
    ],
    formula: 'largo*ancho*alto',
    materiales: [
      { nombre: 'Hormigón Elaborado H-21', unit: 'm³', coef: 1.05 },
      { nombre: 'Acero ADN 420',           unit: 'kg', coef: 50   },
    ],
    structuralConfig: {
      enabled: true,
      defaultSteelRatio: 50,
      defaultWastePercent: 5,
      defaultFormwork: { fondo: true, lat1: true, lat2: true, lat3: false },
      sketchVariant: 'box3d',
      faceLabels: { fondo: 'Fondo', lat1: 'Lateral 1', lat2: 'Lateral 2', lat3: 'Extremo' },
    },
  },
  {
    id: 'FUN-002', nombre: 'Viga de Fundación de H.A.', categoria: 'Fundaciones',
    unidad: 'm³', descripcion: 'Viga de fundación de H.A. H-21. 130 kg/m³ de acero ADN 420. Encofrado paramétrico (fondo + laterales).',
    dims: [
      { id: 'largo',  label: 'Largo',  unit: 'm' },
      { id: 'ancho',  label: 'Ancho',  unit: 'm' },
      { id: 'alto',   label: 'Alto',   unit: 'm' },
    ],
    formula: 'largo*ancho*alto',
    materiales: [
      { nombre: 'Hormigón Elaborado H-21', unit: 'm³', coef: 1.05 },
      { nombre: 'Acero ADN 420',           unit: 'kg', coef: 130  },
    ],
    derivedOutputs: [
      {
        id: 'encofrado',
        label: 'Sup. de encofrado',
        formula: 'largo*(ancho+2*alto)',
        unit: 'm²',
        nota: 'Fondo + 2 laterales. Sin tapa superior (viga apoyada en suelo).',
        asMaterial: {
          nombre: 'Encofrado de viga (tablas y puntales)',
          code: 'ENC-VIGA',
        },
      },
    ],
    structuralConfig: {
      enabled: true,
      defaultSteelRatio: 130,
      defaultWastePercent: 5,
      defaultFormwork: { fondo: true, lat1: true, lat2: true, lat3: false },
      sketchVariant: 'box3d',
      faceLabels: { fondo: 'Fondo', lat1: 'Lateral 1', lat2: 'Lateral 2', lat3: 'Extremo' },
    },
  },
  {
    id: 'FUN-003', nombre: 'Columna de Hormigón Armado H-21', categoria: 'Fundaciones',
    unidad: 'm³', descripcion: 'Columna estructural de H.A. H-21. 200 kg/m³ de acero ADN 420. Encofrado de 4 caras laterales.',
    dims: [
      { id: 'largo',  label: 'Altura (largo)',   unit: 'm' },
      { id: 'ancho',  label: 'Ancho de sección', unit: 'm' },
      { id: 'alto',   label: 'Alto de sección',  unit: 'm' },
    ],
    formula: 'largo*ancho*alto',
    materiales: [
      { nombre: 'Hormigón Elaborado H-21', unit: 'm³', coef: 1.05 },
      { nombre: 'Acero ADN 420',           unit: 'kg', coef: 200  },
    ],
    derivedOutputs: [
      {
        id: 'encofrado',
        label: 'Sup. de encofrado',
        formula: '2*(ancho+alto)*largo',
        unit: 'm²',
        nota: '4 caras laterales. Ajustable en parámetros de cómputo.',
        asMaterial: {
          nombre: 'Encofrado de columna (tablas y puntales)',
          code: 'ENC-COL',
        },
      },
    ],
    structuralConfig: {
      enabled: true,
      defaultSteelRatio: 200,
      defaultWastePercent: 5,
      defaultFormwork: { fondo: false, lat1: true, lat2: true, lat3: true },
      sketchVariant: 'column3d',
      faceLabels: { fondo: 'Base', lat1: 'Cara A1', lat2: 'Cara A2', lat3: 'Cara B' },
    },
  },

  // ── ESTRUCTURA H.A. ────────────────────────────────────────────────────────
  // Elementos volumétricos de hormigón armado para estructura aérea.
  // Familia reutilizable: cualquier tarea con structuralConfig.enabled activa
  // la UI avanzada (cómputo, encofrado, acero) sin cambiar código.
  {
    id: 'FUN-004', nombre: 'Columna de H.A.', categoria: 'Estructura H.A.',
    unidad: 'm³', descripcion: 'Columna estructural de H.A. H-21. 95 kg/m³ de acero ADN 420. Encofrado de 4 caras laterales.',
    dims: [
      { id: 'largo',  label: 'Altura libre',  unit: 'm' },
      { id: 'ancho',  label: 'Ancho sección', unit: 'm' },
      { id: 'alto',   label: 'Alto sección',  unit: 'm' },
    ],
    formula: 'largo*ancho*alto',
    materiales: [
      { nombre: 'Hormigón Elaborado H-21', unit: 'm³', coef: 1.05 },
      { nombre: 'Acero ADN 420',           unit: 'kg', coef: 95   },
    ],
    derivedOutputs: [
      {
        id: 'encofrado',
        label: 'Sup. de encofrado',
        formula: '2*(ancho+alto)*largo',
        unit: 'm²',
        nota: '4 caras laterales. Sin base (columna sobre fundación).',
        asMaterial: {
          nombre: 'Encofrado de columna (tablas y puntales)',
          code: 'ENC-COL',
        },
      },
    ],
    structuralConfig: {
      enabled: true,
      defaultSteelRatio: 95,
      defaultWastePercent: 5,
      defaultFormwork: { fondo: false, lat1: true, lat2: true, lat3: true },
      sketchVariant: 'column3d',
      faceLabels: { fondo: 'Base', lat1: 'Cara A1', lat2: 'Cara A2', lat3: 'Cara B' },
    },
  },
  {
    id: 'FUN-005', nombre: 'Viga de H.A. Aérea', categoria: 'Estructura H.A.',
    unidad: 'm³', descripcion: 'Viga aérea de H.A. H-21. 120 kg/m³ de acero ADN 420. Encofrado fondo + 2 laterales.',
    dims: [
      { id: 'largo',  label: 'Largo',       unit: 'm' },
      { id: 'ancho',  label: 'Ancho (base)', unit: 'm' },
      { id: 'alto',   label: 'Alto (canto)', unit: 'm' },
    ],
    formula: 'largo*ancho*alto',
    materiales: [
      { nombre: 'Hormigón Elaborado H-21', unit: 'm³', coef: 1.05 },
      { nombre: 'Acero ADN 420',           unit: 'kg', coef: 120  },
    ],
    derivedOutputs: [
      {
        id: 'encofrado',
        label: 'Sup. de encofrado',
        formula: 'largo*(ancho+2*alto)',
        unit: 'm²',
        nota: 'Fondo + 2 laterales. Viga aérea sobre encofrado.',
        asMaterial: {
          nombre: 'Encofrado de viga (tablas y puntales)',
          code: 'ENC-VIGA',
        },
      },
    ],
    structuralConfig: {
      enabled: true,
      defaultSteelRatio: 120,
      defaultWastePercent: 5,
      defaultFormwork: { fondo: true, lat1: true, lat2: true, lat3: false },
      sketchVariant: 'box3d',
      faceLabels: { fondo: 'Fondo', lat1: 'Lateral 1', lat2: 'Lateral 2', lat3: 'Extremo' },
    },
  },
  {
    id: 'FUN-006', nombre: 'Losa Maciza de H.A.', categoria: 'Estructura H.A.',
    unidad: 'm³', descripcion: 'Losa maciza de H.A. H-21. 55 kg/m³ de acero ADN 420. Cimbra en cara inferior.',
    dims: [
      { id: 'largo',  label: 'Largo',   unit: 'm' },
      { id: 'ancho',  label: 'Ancho',   unit: 'm' },
      { id: 'alto',   label: 'Espesor', unit: 'm' },
    ],
    formula: 'largo*ancho*alto',
    materiales: [
      { nombre: 'Hormigón Elaborado H-21', unit: 'm³', coef: 1.05 },
      { nombre: 'Acero ADN 420',           unit: 'kg', coef: 55   },
    ],
    derivedOutputs: [
      {
        id: 'encofrado',
        label: 'Sup. de cimbra (cara inf.)',
        formula: 'largo*ancho',
        unit: 'm²',
        nota: 'Cara inferior de la losa (cimbra). Para incluir bordes perimetrales, activar las caras laterales.',
        asMaterial: {
          nombre: 'Encofrado de losa (cimbra)',
          code: 'ENC-LOSA',
        },
      },
    ],
    structuralConfig: {
      enabled: true,
      defaultSteelRatio: 55,
      defaultWastePercent: 5,
      defaultFormwork: { fondo: true, lat1: false, lat2: false, lat3: false },
      sketchVariant: 'floor',
      defaultPanelOpen: true,
      faceLabels: { fondo: 'Cimbra (inf.)', lat1: 'Borde L1', lat2: 'Borde L2', lat3: 'Borde T' },
    },
  },

  // ── INSTALACIONES ────────────────────────────────────────────────────────
  {
    id: 'INS-001', nombre: 'Cañería agua fría PVC 3/4" (20mm)', categoria: 'Instalaciones',
    unidad: 'ml', descripcion: 'Caño PVC clase 6 con accesorios y sellado',
    dims: [{ id: 'largo', label: 'Longitud', unit: 'm' }],
    formula: 'largo',
    materiales: [
      { nombre: 'Caño PVC clase 6 DN20mm (3/4")', unit: 'ml', coef: 1.05 },
      { nombre: 'Pegamento PVC / sellador teflon', unit: 'l', coef: 0.012 },
      { nombre: 'Accesorios PVC (codos, uniones) — estimado', unit: 'un', coef: 0.3 },
    ],
  },
  {
    id: 'INS-002', nombre: 'Cañería cloacal PVC 110mm', categoria: 'Instalaciones',
    unidad: 'ml', descripcion: 'Caño PVC serie sanitaria DN110, sellado con adhesivo',
    dims: [{ id: 'largo', label: 'Longitud', unit: 'm' }],
    formula: 'largo',
    materiales: [
      { nombre: 'Caño PVC sanitario DN110mm', unit: 'ml', coef: 1.05 },
      { nombre: 'Adhesivo PVC / sellador cloacal', unit: 'l', coef: 0.020 },
      { nombre: 'Accesorios PVC 110mm (codos, reduc.) — estim.', unit: 'un', coef: 0.25 },
    ],
  },
];
