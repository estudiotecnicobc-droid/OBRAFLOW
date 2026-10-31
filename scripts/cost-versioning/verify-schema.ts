/**
 * verify-schema.ts
 * ─────────────────
 * Valida que el schema de cost versioning esté correctamente aplicado en Supabase.
 * Comprueba tablas, columnas clave, funciones y seeds.
 *
 * Uso:
 *   npm run db:verify
 *
 * Sale con código 0 si todo OK.
 * Sale con código 1 si hay algún check obligatorio fallando.
 *
 * Env vars requeridas: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */

import { sb } from './shared/client.js';

// ── Framework mínimo ──────────────────────────────────────────────────────────

interface Check {
  name:    string;
  group:   string;
  passed:  boolean;
  detail:  string;
}

const checks: Check[] = [];

async function check(
  group: string,
  name: string,
  fn: () => Promise<{ passed: boolean; detail: string }>,
): Promise<void> {
  try {
    const { passed, detail } = await fn();
    checks.push({ name, group, passed, detail });
    const icon = passed ? '✓' : '✗';
    console.log(`  ${icon}  ${name}: ${detail}`);
  } catch (err: any) {
    checks.push({ name, group, passed: false, detail: err.message });
    console.error(`  ✗  ${name}: ${err.message}`);
  }
}

// ── Helpers de información del schema ────────────────────────────────────────

async function tableExists(tableName: string): Promise<boolean> {
  const { data } = await sb
    .from('information_schema.tables' as any)
    .select('table_name')
    .eq('table_schema', 'public')
    .eq('table_name', tableName)
    .maybeSingle();
  return data != null;
}

async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const { data } = await sb
    .from('information_schema.columns' as any)
    .select('column_name')
    .eq('table_schema', 'public')
    .eq('table_name', tableName)
    .eq('column_name', columnName)
    .maybeSingle();
  return data != null;
}

async function functionExists(funcName: string): Promise<boolean> {
  const { data } = await sb
    .from('information_schema.routines' as any)
    .select('routine_name')
    .eq('routine_schema', 'public')
    .eq('routine_name', funcName)
    .maybeSingle();
  return data != null;
}

async function triggerExists(triggerName: string, tableName: string): Promise<boolean> {
  const { data } = await sb
    .from('information_schema.triggers' as any)
    .select('trigger_name')
    .eq('trigger_schema', 'public')
    .eq('trigger_name', triggerName)
    .eq('event_object_table', tableName)
    .maybeSingle();
  return data != null;
}

async function enumExists(enumName: string): Promise<boolean> {
  const { data } = await sb.rpc('query' as any, {
    sql: `SELECT 1 FROM pg_type WHERE typname = '${enumName}' AND typtype = 'e'`,
  }).maybeSingle().then(r => r, () => ({ data: null }));
  // Fallback: intentar castear un valor válido
  return data != null;
}

// ── Checks ────────────────────────────────────────────────────────────────────

async function checkTables() {
  console.log('\n── Tablas (008a) ────────────────────────────────────────');

  for (const t of ['cost_indices', 'cost_index_values', 'resource_pricing_rules', 'resource_cost_snapshots']) {
    await check('tables', t, async () => {
      const { count, error } = await sb.from(t as any).select('id', { count: 'exact', head: true });
      if (error) return { passed: false, detail: error.message };
      return { passed: true, detail: `OK (${count ?? 0} filas)` };
    });
  }
}

async function checkColumnsResources() {
  console.log('\n── Columnas resources (008a) ────────────────────────────');

  await check('columns', 'resources.current_snapshot_id', async () => {
    const { error } = await sb.from('resources').select('current_snapshot_id').limit(1);
    if (error) return { passed: false, detail: `columna faltante — ejecutar 008a: ${error.message}` };
    return { passed: true, detail: 'OK' };
  });

  await check('columns', 'resources.pricing_notes', async () => {
    const { error } = await sb.from('resources').select('pricing_notes').limit(1);
    if (error) return { passed: false, detail: `columna faltante — ejecutar 008a: ${error.message}` };
    return { passed: true, detail: 'OK' };
  });
}

async function checkColumns010() {
  console.log('\n── Columnas migration 010 ───────────────────────────────');

  const cols: [string, string][] = [
    ['master_task_materials',  'resource_id'],
    ['master_task_materials',  'sub_master_task_id'],
    ['master_task_materials',  'conversion_factor'],
    ['master_task_labor',      'resource_id'],
    ['master_task_labor',      'snapshot_hourly_rate'],
    ['master_task_equipment',  'resource_id'],
    ['master_task_equipment',  'snapshot_cost_per_hour'],
    ['projects',               'cost_base'],
  ];

  for (const [table, col] of cols) {
    await check('columns-010', `${table}.${col}`, async () => {
      const { error } = await sb.from(table as any).select(col).limit(1);
      if (error) return { passed: false, detail: `columna faltante — ejecutar 010: ${error.message}` };
      return { passed: true, detail: 'OK' };
    });
  }
}

async function checkFunctions() {
  console.log('\n── Funciones (008c) ─────────────────────────────────────');

  const rpcs = [
    { name: 'get_resource_cost',          params: { p_resource_id: '00000000-0000-0000-0000-000000000000', p_tenant_id: '00000000-0000-0000-0000-000000000000', p_date: '2026-01-01' } },
    { name: 'get_resource_snapshot',      params: { p_resource_id: '00000000-0000-0000-0000-000000000000', p_tenant_id: '00000000-0000-0000-0000-000000000000', p_date: '2026-01-01' } },
    { name: 'generate_monthly_snapshots', params: { p_tenant_id: '00000000-0000-0000-0000-000000000000', p_year: 2026, p_month: 1 } },
    { name: 'upsert_index_value',         params: { p_index_code: '__verify_test__', p_year: 2099, p_month: 1, p_value: 1, p_tenant_id: null } },
  ];

  for (const rpc of rpcs) {
    await check('functions', rpc.name, async () => {
      const { error } = await sb.rpc(rpc.name as any, rpc.params);
      // La función existe si el error NO es "function does not exist" (SQLSTATE 42883)
      if (error) {
        const notFound = error.message.includes('does not exist')
                      || error.message.includes('Could not find');
        if (notFound) return { passed: false, detail: `función faltante — ejecutar 008c: ${error.message}` };
        // Otros errores (UNAUTHORIZED, FORBIDDEN, index not found) = función existe
        return { passed: true, detail: `OK (error esperado: ${error.message.slice(0, 60)})` };
      }
      return { passed: true, detail: 'OK' };
    });
  }
}

async function checkTriggers() {
  console.log('\n── Triggers (008a + 008c) ───────────────────────────────');

  const triggerChecks = [
    { trigger: 'cost_indices_updated_at',            table: 'cost_indices' },
    { trigger: 'cost_index_values_calc_variation',   table: 'cost_index_values' },
    { trigger: 'resource_pricing_rules_updated_at',  table: 'resource_pricing_rules' },
    { trigger: 'resource_cost_snapshots_sync_cache', table: 'resource_cost_snapshots' },
  ];

  for (const { trigger, table } of triggerChecks) {
    await check('triggers', `${trigger} on ${table}`, async () => {
      // Consultar pg_trigger via information_schema
      const { data, error } = await sb
        .from('information_schema.triggers' as any)
        .select('trigger_name')
        .eq('trigger_schema', 'public')
        .eq('trigger_name', trigger)
        .eq('event_object_table', table)
        .maybeSingle();

      if (error) return { passed: false, detail: error.message };
      if (!data)  return { passed: false, detail: `trigger no encontrado — ejecutar ${table === 'resource_cost_snapshots' ? '008c' : '008a'}` };
      return { passed: true, detail: 'OK' };
    });
  }
}

async function checkSeeds() {
  console.log('\n── Seeds: índices globales (008c) ───────────────────────');

  await check('seeds', '≥8 índices globales (CAC, ICC, IPC, UOCRA, etc.)', async () => {
    const { count, error } = await sb
      .from('cost_indices')
      .select('id', { count: 'exact', head: true })
      .is('tenant_id', null);
    if (error) return { passed: false, detail: error.message };
    const n = count ?? 0;
    return {
      passed: n >= 8,
      detail: `${n} índices globales${n < 8 ? ' — ejecutar seeds en 008c' : ''}`,
    };
  });

  const expectedCodes = ['CAC', 'ICC', 'IPC', 'UOCRA', 'UOCRA-AYU', 'CAC-MAT', 'CAC-MO', 'CAC-EQ'];
  await check('seeds', `códigos: ${expectedCodes.join(', ')}`, async () => {
    const { data, error } = await sb
      .from('cost_indices')
      .select('code')
      .is('tenant_id', null)
      .in('code', expectedCodes);

    if (error) return { passed: false, detail: error.message };
    const found = (data ?? []).map((r: any) => r.code);
    const missing = expectedCodes.filter(c => !found.includes(c));
    if (missing.length > 0) {
      return { passed: false, detail: `faltantes: ${missing.join(', ')} — ejecutar seeds en 008c` };
    }
    return { passed: true, detail: 'todos presentes' };
  });
}

async function checkRLS() {
  console.log('\n── RLS activo (008b) ────────────────────────────────────');

  for (const t of ['cost_indices', 'cost_index_values', 'resource_pricing_rules', 'resource_cost_snapshots']) {
    await check('rls', `RLS en ${t}`, async () => {
      const { data, error } = await sb
        .from('pg_tables' as any)
        .select('rowsecurity')
        .eq('schemaname', 'public')
        .eq('tablename', t)
        .maybeSingle();

      if (error || !data) return { passed: false, detail: error?.message ?? 'tabla no encontrada' };
      const enabled = (data as any).rowsecurity === true;
      return {
        passed: enabled,
        detail: enabled ? 'RLS ON' : 'RLS OFF — ejecutar 008b',
      };
    });
  }
}

// ── Runner ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔍  Verify Schema: Cost Versioning');
  console.log(`   Fecha: ${new Date().toISOString()}`);

  await checkTables();
  await checkColumnsResources();
  await checkColumns010();
  await checkFunctions();
  await checkTriggers();
  await checkSeeds();
  await checkRLS();

  // ── Resumen ──────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════');

  const failed  = checks.filter(c => !c.passed);
  const passed  = checks.filter(c =>  c.passed);

  console.log(`   Total: ${passed.length}/${checks.length} OK`);

  if (failed.length > 0) {
    console.log('\n❌  Checks fallando:');
    for (const c of failed) console.log(`   · [${c.group}] ${c.name}: ${c.detail}`);
    console.log('');
    process.exit(1);
  }

  console.log('\n✅  Schema verificado correctamente\n');
}

main().catch((err) => {
  console.error('\n❌  Error inesperado:', err);
  process.exit(1);
});
