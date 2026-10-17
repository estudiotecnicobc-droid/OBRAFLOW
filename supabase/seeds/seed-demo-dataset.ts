/* eslint-disable no-console */
/**
 * Seeder TypeScript para catálogo base demo.
 * Fuente del dataset normalizado: archivo subido por el usuario.
 *
 * Ejecución sugerida:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-demo-dataset.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Ajustar antes de ejecutar
const ORG_UUID = '00000000-0000-0000-0000-000000000001';
const ORG_TEXT = 'org_demo';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const materials = [
  { code: 'I1000', name: 'CAL HIDRÁULICA EN POLVO', unit: 'KG', price: 0.376, category: 'AGLOMERANTES', description: 'Unidad de cómputo en KG.' },
  { code: 'I1001', name: 'CEMENTO PORTLAND', unit: 'KG', price: 0.5, category: 'AGLOMERANTES', description: 'Unidad de cómputo en KG. Planilla modelo indica unidad comercial bolsa 50kg.' },
  { code: 'I1002', name: 'ARENA x M3', unit: 'M3', price: 82.686, category: 'ARIDO', description: '' },
  { code: 'I1025', name: 'TABLA DE 1" SALIGNA BRUTO', unit: 'M2', price: 15.0, category: 'MADERAS', description: '' },
  { code: 'MAT_TMP_001', name: 'Ladrillo Hueco 27x18x33', unit: 'UN', price: 22.31, category: 'Mampostería', description: 'Código autogenerado por falta de ID en archivo origen.' },
];

const tools = [
  { code: 'I1747', name: 'RETROEXCAVADORA 150 HP', unit: 'AÑO', cost_per_hour: null, description: 'DEPRECIACION+INTERESES+REP Y REP | El costo está anualizado (95004.0), requiere conversión a hora para APU estándar.' },
  { code: 'EQ_TMP_001', name: 'desmalesadora', unit: 'UN', cost_per_hour: null, description: 'Costo extraído como monto global/diario de la tarea Limpieza de Terreno. cost_per_hour is null.' },
];

const laborCategories = [
  { code: 'I1004', name: 'OFICIAL', unit: 'H', cost_per_hour: 21.0457 },
  { code: 'I1005', name: 'AYUDANTE', unit: 'H', cost_per_hour: 17.8336 },
  { code: 'MO_TMP_001', name: 'Oficial Especializado', unit: 'H', cost_per_hour: 146.8633 },
];

const masterTasks = [
  { code: 'T1001', name: 'CASILLA HABITABLE', unit: 'M2', category: '02 TRABAJOS PRELIMINARES', description: 'por m2 de superficie cubierta. Solo se usan tablas de 1" x 4", y de 1" x 6" y tirantes de 3" x 3"... | Cálculo referencial histórico.' },
  { code: 'TAREA_TMP_001', name: 'Mampostería de ladrillo hueco cerámico 27 x 18 x 33', unit: 'M2', category: '4.1. Mampostería', description: 'Incluye dosificación de mortero. | No posee código de tarea. Se asume rubro por nombre de archivo.' },
  { code: 'TAREA_TMP_002', name: 'Azotado hidrofugo *1', unit: 'M2', category: '9. Revoques', description: 'CONTROL DE RECEPCION DE MATERIALES... CONTROL DE EJECUCION DE OBRA... | Contiene metadatos ricos de Controles de Gestión en la descripción.' },
  { code: 'TAREA_TMP_003', name: 'EXCAVACIONES - Bases de hormigón armado', unit: 'M3', category: '2. Movimiento de Suelos', description: 'Excavación para bases de hormigón armado y vigas de encadenado' },
];

const masterTaskMaterials = [
  { task_code: 'T1001', material_code: 'I1025', unit: 'M2', quantity: 7.0 },
  { task_code: 'TAREA_TMP_001', material_code: 'MAT_TMP_001', unit: 'UN', quantity: 15.0 },
  { task_code: 'TAREA_TMP_001', material_code: 'I1000', unit: 'KG', quantity: 3.175 },
  { task_code: 'TAREA_TMP_001', material_code: 'I1001', unit: 'KG', quantity: 3.6 },
  { task_code: 'TAREA_TMP_001', material_code: 'I1002', unit: 'M3', quantity: 0.021 },
];

const masterTaskLabor = [
  { task_code: 'T1001', labor_code: 'I1004', quantity: 6.5 },
  { task_code: 'T1001', labor_code: 'I1005', quantity: 3.0 },
  { task_code: 'TAREA_TMP_001', labor_code: 'I1004', quantity: 0.74 },
  { task_code: 'TAREA_TMP_001', labor_code: 'I1005', quantity: 0.5 },
  { task_code: 'TAREA_TMP_003', labor_code: 'I1004', quantity: 1.08 },
  { task_code: 'TAREA_TMP_003', labor_code: 'I1005', quantity: 2.16 },
];

async function upsertBase() {
  const { error: materialsError } = await supabase.from('materials').upsert(
    materials.map((r) => ({ organization_id: ORG_TEXT, ...r })),
    { onConflict: 'organization_id,code' },
  );
  if (materialsError) throw materialsError;

  const { error: toolsError } = await supabase.from('tools').upsert(
    tools.map((r) => ({ organization_id: ORG_TEXT, ...r })),
    { onConflict: 'organization_id,code' },
  );
  if (toolsError) throw toolsError;

  const { error: laborError } = await supabase.from('labor_categories').upsert(
    laborCategories.map((r) => ({ organization_id: ORG_TEXT, ...r })),
    { onConflict: 'organization_id,code' },
  );
  if (laborError) throw laborError;

  const { error: tasksError } = await supabase.from('master_tasks').upsert(
    masterTasks.map((r) => ({ organization_id: ORG_UUID, ...r })),
    { onConflict: 'organization_id,code' },
  );
  if (tasksError) throw tasksError;
}

async function loadIndexes() {
  const [mRes, lRes, tRes, mtRes] = await Promise.all([
    supabase.from('materials').select('id, code, name, price').eq('organization_id', ORG_TEXT),
    supabase.from('labor_categories').select('id, code, name').eq('organization_id', ORG_TEXT),
    supabase.from('tools').select('id, code, name').eq('organization_id', ORG_TEXT),
    supabase.from('master_tasks').select('id, code').eq('organization_id', ORG_UUID),
  ]);
  if (mRes.error) throw mRes.error;
  if (lRes.error) throw lRes.error;
  if (tRes.error) throw tRes.error;
  if (mtRes.error) throw mtRes.error;

  return {
    materials: new Map((mRes.data ?? []).map((r) => [r.code, r])),
    labor: new Map((lRes.data ?? []).map((r) => [r.code, r])),
    tools: new Map((tRes.data ?? []).map((r) => [r.code, r])),
    tasks: new Map((mtRes.data ?? []).map((r) => [r.code, r])),
  };
}

async function insertChildren() {
  const idx = await loadIndexes();

  for (const row of masterTaskMaterials) {
    const task = idx.tasks.get(row.task_code);
    const material = idx.materials.get(row.material_code);
    if (!task || !material) {
      console.warn('skipped master_task_materials', row);
      continue;
    }

    const { data: existing, error: existingError } = await supabase
      .from('master_task_materials')
      .select('id')
      .eq('master_task_id', task.id)
      .eq('material_name', material.name)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) continue;

    const { error } = await supabase.from('master_task_materials').insert({
      master_task_id: task.id,
      master_material_id: null,
      material_name: material.name,
      unit: row.unit,
      quantity: row.quantity,
      last_known_unit_price: material.price,
    });
    if (error) throw error;
  }

  for (const row of masterTaskLabor) {
    const task = idx.tasks.get(row.task_code);
    const labor = idx.labor.get(row.labor_code);
    if (!task || !labor) {
      console.warn('skipped master_task_labor', row);
      continue;
    }

    const { data: existing, error: existingError } = await supabase
      .from('master_task_labor')
      .select('id')
      .eq('master_task_id', task.id)
      .eq('labor_category_name', labor.name)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) continue;

    const { error } = await supabase.from('master_task_labor').insert({
      master_task_id: task.id,
      labor_category_id: labor.id,
      labor_category_name: labor.name,
      quantity: row.quantity,
    });
    if (error) throw error;
  }

  // Este dataset no inserta equipment porque el único match fuerte quedó fuera
  // por baja confianza/costo nulo en el origen.
}

async function main() {
  console.log('⏳ Seed demo: upsert base');
  await upsertBase();
  console.log('⏳ Seed demo: insert children');
  await insertChildren();
  console.log('✅ Seed demo completado');
}

main().catch((err) => {
  console.error('❌ Seed demo falló');
  console.error(err);
  process.exit(1);
});
