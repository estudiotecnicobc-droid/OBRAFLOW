/**
 * seedDemoData.ts
 * ───────────────
 * Carga masiva de datos de prueba: materiales, herramientas, categorías MO
 * y tareas maestras (APU). Ejecutable desde el navegador; idempotente
 * (omite entidades que ya existen por nombre).
 *
 * Uso:
 *   import { seedDemoData } from '../services/seedDemoData';
 *   const result = await seedDemoData(organizationId);
 */

import { materialsService }     from './materialsService';
import { toolsService }          from './toolsService';
import { laborCategoriesService } from './laborCategoriesService';
import { masterTasksService }    from './masterTasksSupabaseService';
import type { MasterTaskInput }  from './masterTasksSupabaseService';
import type { Material, Tool, LaborCategory } from '../types';

// ── Resultado ─────────────────────────────────────────────────────────────────

export interface SeedResult {
  materials:       { created: number; skipped: number };
  tools:           { created: number; skipped: number };
  laborCategories: { created: number; skipped: number };
  masterTasks:     { created: number; skipped: number };
  errors:          string[];
}

// ── Dataset ───────────────────────────────────────────────────────────────────

const DEMO_MATERIALS: Omit<Material, 'id' | 'organizationId'>[] = [
  { name: 'Cemento Portland CPN 40',  unit: 'kg',   cost: 180,   category: 'Aglomerantes',  commercialFormat: 'Bolsa 50 kg',   wastePercent: 3 },
  { name: 'Arena fina lavada',         unit: 'm3',   cost: 9500,  category: 'Áridos',        wastePercent: 5 },
  { name: 'Piedra triturada 6/20',     unit: 'm3',   cost: 11200, category: 'Áridos',        wastePercent: 5 },
  { name: 'Hierro nervado Ø10 mm',     unit: 'kg',   cost: 950,   category: 'Estructural',   commercialFormat: 'Barra 12 m', wastePercent: 8 },
  { name: 'Ladrillo cerámico 18x18x33',unit: 'u',    cost: 260,   category: 'Mampostería',   wastePercent: 5 },
  { name: 'Cal hidráulica',            unit: 'kg',   cost: 95,    category: 'Aglomerantes',  commercialFormat: 'Bolsa 25 kg', wastePercent: 3 },
  { name: 'Madera pino cepillada 3×3', unit: 'm',    cost: 1800,  category: 'Madera' },
  { name: 'Cable NYY 2×1.5 mm²',       unit: 'm',    cost: 850,   category: 'Electricidad' },
];

const DEMO_TOOLS: Omit<Tool, 'id' | 'organizationId'>[] = [
  { name: 'Retroexcavadora 0.3 m³',  category: 'Movimiento de tierra', costPerHour: 8500 },
  { name: 'Hormigonera 300 L',        category: 'Hormigón',             costPerHour: 950  },
  { name: 'Compactador pata de cabra',category: 'Compactación',         costPerHour: 1200 },
  { name: 'Andamio tubular (juego)',   category: 'Auxiliares',           costPerHour: 250  },
];

const DEMO_LABOR: Omit<LaborCategory, 'id' | 'organizationId'>[] = [
  { role: 'Oficial albañil',   basicHourlyRate: 1850, socialChargesPercent: 70, insurancePercent: 5, description: 'Cat. VII CCT 76/75' },
  { role: 'Medio oficial',     basicHourlyRate: 1480, socialChargesPercent: 70, insurancePercent: 5 },
  { role: 'Ayudante de obra',  basicHourlyRate: 1150, socialChargesPercent: 70, insurancePercent: 5 },
];

// ── Definición de APU (referencias por nombre; resuelto en runtime) ───────────

interface TaskDef {
  code:       string;
  name:       string;
  unit:       string;
  category:   string;
  dailyYield: number;
  materials:  { name: string; unit: string; qty: number; waste?: number }[];
  labor:      { role: string; qty: number }[];
  equipment:  { name: string; hoursPerUnit: number }[];
}

const DEMO_TASKS: TaskDef[] = [
  {
    code: 'MOV-001', name: 'Excavación de pozos y zanjas', unit: 'm3',
    category: 'Movimiento de tierra', dailyYield: 30,
    materials:  [],
    labor:      [{ role: 'Oficial albañil', qty: 0.2 }, { role: 'Ayudante de obra', qty: 0.5 }],
    equipment:  [{ name: 'Retroexcavadora 0.3 m³', hoursPerUnit: 0.4 }],
  },
  {
    code: 'HOR-001', name: 'Hormigón H-21 en losa y vigas', unit: 'm3',
    category: 'Hormigón', dailyYield: 8,
    materials: [
      { name: 'Cemento Portland CPN 40',  unit: 'kg',  qty: 350, waste: 3 },
      { name: 'Arena fina lavada',         unit: 'm3',  qty: 0.80, waste: 5 },
      { name: 'Piedra triturada 6/20',     unit: 'm3',  qty: 0.70, waste: 5 },
    ],
    labor:     [{ role: 'Oficial albañil', qty: 0.4 }, { role: 'Medio oficial', qty: 0.3 }, { role: 'Ayudante de obra', qty: 1.0 }],
    equipment: [{ name: 'Hormigonera 300 L', hoursPerUnit: 1.5 }],
  },
  {
    code: 'MAM-001', name: 'Mampostería ladrillo cerámico 18×18×33', unit: 'm2',
    category: 'Mampostería', dailyYield: 12,
    materials: [
      { name: 'Ladrillo cerámico 18x18x33', unit: 'u',  qty: 70, waste: 5 },
      { name: 'Cemento Portland CPN 40',     unit: 'kg', qty: 8,  waste: 3 },
      { name: 'Arena fina lavada',            unit: 'm3', qty: 0.025, waste: 5 },
      { name: 'Cal hidráulica',               unit: 'kg', qty: 4,  waste: 3 },
    ],
    labor:     [{ role: 'Oficial albañil', qty: 0.3 }, { role: 'Ayudante de obra', qty: 0.3 }],
    equipment: [],
  },
  {
    code: 'PIS-001', name: 'Contrapiso hormigón pobre e = 0.08 m', unit: 'm2',
    category: 'Pisos', dailyYield: 40,
    materials: [
      { name: 'Cemento Portland CPN 40', unit: 'kg',  qty: 80,   waste: 3 },
      { name: 'Arena fina lavada',        unit: 'm3',  qty: 0.10, waste: 5 },
      { name: 'Piedra triturada 6/20',    unit: 'm3',  qty: 0.08, waste: 5 },
    ],
    labor:     [{ role: 'Oficial albañil', qty: 0.15 }, { role: 'Ayudante de obra', qty: 0.20 }],
    equipment: [{ name: 'Compactador pata de cabra', hoursPerUnit: 0.1 }],
  },
  {
    code: 'REV-001', name: 'Revoque grueso interior', unit: 'm2',
    category: 'Revoques', dailyYield: 18,
    materials: [
      { name: 'Cemento Portland CPN 40', unit: 'kg',  qty: 8,     waste: 3 },
      { name: 'Arena fina lavada',        unit: 'm3',  qty: 0.025, waste: 5 },
      { name: 'Cal hidráulica',           unit: 'kg',  qty: 4,     waste: 3 },
    ],
    labor:     [{ role: 'Oficial albañil', qty: 0.25 }, { role: 'Ayudante de obra', qty: 0.15 }],
    equipment: [{ name: 'Andamio tubular (juego)', hoursPerUnit: 0.15 }],
  },
  {
    code: 'ELE-001', name: 'Canalización eléctrica en PVC con cable', unit: 'm',
    category: 'Instalaciones', dailyYield: 25,
    materials: [
      { name: 'Cable NYY 2×1.5 mm²',       unit: 'm', qty: 1.1 },
      { name: 'Madera pino cepillada 3×3',  unit: 'm', qty: 0.1 },
    ],
    labor:     [{ role: 'Oficial albañil', qty: 0.15 }, { role: 'Ayudante de obra', qty: 0.05 }],
    equipment: [],
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function newId(): string {
  return crypto.randomUUID();
}

// ── Función principal ──────────────────────────────────────────────────────────

export async function seedDemoData(
  organizationId: string,
): Promise<SeedResult> {
  const result: SeedResult = {
    materials:       { created: 0, skipped: 0 },
    tools:           { created: 0, skipped: 0 },
    laborCategories: { created: 0, skipped: 0 },
    masterTasks:     { created: 0, skipped: 0 },
    errors:          [],
  };

  // ── Phase 1: resources en paralelo ────────────────────────────────────────

  const [existingMats, existingTools, existingLabor] = await Promise.all([
    materialsService.listForOrg(organizationId),
    toolsService.listForOrg(organizationId),
    laborCategoriesService.listForOrg(organizationId),
  ]);

  const existingMatNames  = new Set(existingMats.map(m => m.name));
  const existingToolNames = new Set(existingTools.map(t => t.name));
  const existingLaborRoles = new Set(existingLabor.map(l => l.role));

  // Mapas nombre→ID para cross-reference en APU
  const matIdByName:   Record<string, string> = {};
  const toolIdByName:  Record<string, string> = {};
  const laborIdByRole: Record<string, string> = {};

  // Inicializar mapas con existentes
  for (const m of existingMats)  matIdByName[m.name]   = m.id;
  for (const t of existingTools) toolIdByName[t.name]  = t.id;
  for (const l of existingLabor) laborIdByRole[l.role] = l.id;

  // Crear materiales
  for (const def of DEMO_MATERIALS) {
    if (existingMatNames.has(def.name)) {
      result.materials.skipped++;
      continue;
    }
    try {
      const id = newId();
      await materialsService.create({ id, organizationId, ...def });
      matIdByName[def.name] = id;
      result.materials.created++;
    } catch (e) {
      result.errors.push(`Material "${def.name}": ${(e as Error).message}`);
    }
  }

  // Crear herramientas
  for (const def of DEMO_TOOLS) {
    if (existingToolNames.has(def.name)) {
      result.tools.skipped++;
      continue;
    }
    try {
      const id = newId();
      await toolsService.create({ id, organizationId, ...def });
      toolIdByName[def.name] = id;
      result.tools.created++;
    } catch (e) {
      result.errors.push(`Herramienta "${def.name}": ${(e as Error).message}`);
    }
  }

  // Crear categorías MO
  for (const def of DEMO_LABOR) {
    if (existingLaborRoles.has(def.role)) {
      result.laborCategories.skipped++;
      continue;
    }
    try {
      const id = newId();
      await laborCategoriesService.create({ id, organizationId, ...def });
      laborIdByRole[def.role] = id;
      result.laborCategories.created++;
    } catch (e) {
      result.errors.push(`Cat. MO "${def.role}": ${(e as Error).message}`);
    }
  }

  // ── Phase 2: Master tasks ──────────────────────────────────────────────────

  const existingMasterTasks = await masterTasksService.list(organizationId);
  const existingTaskNames   = new Set(existingMasterTasks.map(t => t.name));

  for (const def of DEMO_TASKS) {
    if (existingTaskNames.has(def.name)) {
      result.masterTasks.skipped++;
      continue;
    }

    // Construir hijas resolviendo nombres → IDs
    const materials = def.materials
      .filter(m => matIdByName[m.name])
      .map(m => ({
        id:           newId(),
        materialName: m.name,
        unit:         m.unit,
        quantity:     m.qty,
        wastePercent: m.waste,
      }));

    const labor = def.labor
      .filter(l => laborIdByRole[l.role])
      .map(l => ({
        id:                newId(),
        laborCategoryId:   laborIdByRole[l.role],
        laborCategoryName: l.role,
        quantity:          l.qty,
      }));

    const equipment = def.equipment
      .filter(e => toolIdByName[e.name])
      .map(e => ({
        id:           newId(),
        toolId:       toolIdByName[e.name],
        toolName:     e.name,
        hoursPerUnit: e.hoursPerUnit,
      }));

    const input: MasterTaskInput = {
      code:        def.code,
      name:        def.name,
      unit:        def.unit,
      category:    def.category,
      dailyYield:  def.dailyYield,
      tags:        [],
      materials,
      labor,
      equipment,
    };

    try {
      await masterTasksService.create(organizationId, input);
      result.masterTasks.created++;
    } catch (e) {
      result.errors.push(`APU "${def.name}": ${(e as Error).message}`);
    }
  }

  return result;
}
