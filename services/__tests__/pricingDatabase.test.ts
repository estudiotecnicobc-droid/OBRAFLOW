import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8').replace(/^\uFEFF/, '');
const org = '10000000-0000-4000-8000-000000000001';
const user = '20000000-0000-4000-8000-000000000001';
const material = '40000000-0000-4000-8000-000000000001';
const supplier = '50000000-0000-4000-8000-000000000001';
const batch = '60000000-0000-4000-8000-000000000001';
let db: PGlite;
async function login(id = user, role = 'authenticated') {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec(`SET ROLE ${role}`);
}
async function approve(factor = 25, target = material) {
  return (await db.query<{ mapping_id: string; queued_rows: number }>(
    'SELECT * FROM approve_supplier_mapping($1,$2,$3,$4,$5)',
    [org, supplier, 'SKU_TEST', target, factor],
  )).rows[0];
}
async function worker() {
  await login('', 'service_role');
  return (await db.query('SELECT * FROM homologate_raw_price_rows($1,10)', [batch])).rows[0];
}

describe('pricing migrations on ephemeral PostgreSQL', () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(read('services/__tests__/fixtures/pricing.sql'));
    const helpers = read('supabase/migrations/007_rls_policies.sql');
    await db.exec(helpers.slice(0, helpers.indexOf('-- 1. organizations')));
    const versions = read('supabase/migrations/059_price_indices_and_budget_versions.sql');
    await db.exec(versions.slice(versions.indexOf('CREATE TABLE IF NOT EXISTS public.budget_versions')));
    for (const file of [
      '20261026120601_price_reference_resolver.sql',
      '20261026120605_price_supplier_homologation.sql',
      '20261026120606_price_human_approval.sql',
      '20261030182638_price_approval_retry_and_tenant_guards.sql',
    ]) await db.exec(read(`supabase/migrations/${file}`));
    await db.exec(`
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
      GRANT INSERT,DELETE ON budget_versions TO authenticated;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
      ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
      CREATE POLICY project_read ON projects FOR SELECT TO authenticated
        USING (is_org_member(organization_id));
      ALTER TABLE master_materials ENABLE ROW LEVEL SECURITY;
      CREATE POLICY material_read ON master_materials FOR SELECT TO authenticated
        USING (organization_id IS NULL OR is_org_member(organization_id));
      INSERT INTO price_suppliers(id,organization_id,name,external_code)
        VALUES ('${supplier}','${org}','Test supplier','test');
      INSERT INTO price_import_batches(id,organization_id,status,header_cells,supplier_id,column_mapping,observation_date)
        VALUES ('${batch}','${org}','raw_ready','["sku","description","price","currency","unit"]',
        '${supplier}','{"sku":0,"description":1,"price":2,"currency":3,"unit":4}',current_date);
      INSERT INTO price_import_rows(batch_id,organization_id,row_number,raw_cells)
        VALUES ('${batch}','${org}',1,'["SKU_TEST","Cemento","2500.00","ARS","bolsa"]');
    `);
  }, 30000);
  beforeEach(async () => { await db.exec('BEGIN'); });
  afterEach(async () => { await db.exec('ROLLBACK; RESET ROLE'); });
  afterAll(async () => { await db?.close(); });

  it('approves, retries and homologates without duplicating or replacing the approver', async () => {
    expect(await worker()).toMatchObject({ processed: 1, pending: 1 });
    await login();
    const first = await approve();
    expect(Number(first.queued_rows)).toBe(1);
    const evidence = (await db.query('SELECT approved_by,approved_at FROM supplier_products')).rows[0];
    expect(await approve()).toMatchObject({ mapping_id: first.mapping_id, queued_rows: 0 });
    expect(await worker()).toMatchObject({ processed: 1, mapped: 1 });
    expect(await worker()).toMatchObject({ processed: 0, mapped: 0 });
    await login();
    expect(await approve()).toMatchObject({ mapping_id: first.mapping_id, queued_rows: 0 });
    expect((await db.query('SELECT approved_by,approved_at FROM supplier_products')).rows[0]).toEqual(evidence);
    const observations = (await db.query<{ normalized_price: string; unit_factor: string; batch_id: string; row_number: number }>(
      'SELECT normalized_price,unit_factor,batch_id,row_number FROM price_observations',
    )).rows;
    expect(observations).toHaveLength(1);
    expect(Number(observations[0].normalized_price)).toBe(100);
    expect(observations[0].batch_id).toBe(batch);
  });

  it.each(['20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003'])(
    'rejects approval by viewer or another tenant: %s', async id => {
      await worker();
      await login(id);
      await expect(approve()).rejects.toThrow('NOT_AUTHORIZED');
    },
  );
  it('rejects a material belonging to another tenant even for a member of both', async () => {
    await worker();
    await login();
    await expect(approve(1, '40000000-0000-4000-8000-000000000002')).rejects.toThrow('NOT_ACCESSIBLE');
  });
  it('does not grant the browser observation writes or worker execution', async () => {
    await login();
    expect((await db.query<{ allowed: boolean }>(
      "SELECT has_table_privilege(current_user,'price_observations','INSERT') AS allowed",
    )).rows[0].allowed).toBe(false);
    await expect(db.query('SELECT * FROM homologate_raw_price_rows($1,1)', [batch])).rejects.toThrow('permission denied');
  });
  it('preserves approval evidence when new matching pending rows arrive', async () => {
    await worker();
    await login();
    const first = await approve();
    const evidence = (await db.query('SELECT approved_by,approved_at FROM supplier_products')).rows[0];
    await worker();
    await db.exec(`RESET ROLE;
      INSERT INTO auth.users VALUES ('20000000-0000-4000-8000-000000000004');
      INSERT INTO organization_members VALUES ('${org}','20000000-0000-4000-8000-000000000004','editor');
      INSERT INTO price_import_rows(batch_id,organization_id,row_number,raw_cells,processing_status,supplier_sku,supplier_unit,source_currency)
      VALUES ('${batch}','${org}',2,'["SKU_TEST","Cemento","2750","ARS","bolsa"]',
        'pending_mapping','SKU_TEST','bolsa','ARS');`);
    await login('20000000-0000-4000-8000-000000000004');
    const retry = await approve();
    expect(retry.mapping_id).toBe(first.mapping_id);
    expect(Number(retry.queued_rows)).toBe(1);
    expect((await db.query('SELECT approved_by,approved_at FROM supplier_products')).rows[0]).toEqual(evidence);
  });
  it('rejects changing a conversion with historical observations', async () => {
    await worker();
    await login();
    await approve();
    await worker();
    await db.exec(`RESET ROLE;
      INSERT INTO price_import_rows(batch_id,organization_id,row_number,raw_cells,processing_status,supplier_sku,supplier_unit,source_currency)
      VALUES ('${batch}','${org}',2,'["SKU_TEST","Cemento","2750","ARS","bolsa"]',
        'pending_mapping','SKU_TEST','bolsa','ARS');`);
    await login();
    await expect(approve(50)).rejects.toThrow('HISTORICAL_MAPPING_IMMUTABLE');
  });
  it('does not treat incompatible pending units as a successful retry', async () => {
    await worker();
    await login();
    await approve();
    await db.exec(`RESET ROLE;
      INSERT INTO price_import_rows(batch_id,organization_id,row_number,raw_cells,processing_status,supplier_sku,supplier_unit,source_currency)
      VALUES ('${batch}','${org}',2,'["SKU_TEST","Cemento","2750","ARS","kg"]',
        'pending_mapping','SKU_TEST',NULL,'ARS');`);
    await login();
    await expect(approve()).rejects.toThrow('AMBIGUOUS_SKU_UNIT_OR_CURRENCY');
  });
  it('hides supplier evidence from other tenants', async () => {
    await worker();
    await login();
    await approve();
    await worker();
    await login('20000000-0000-4000-8000-000000000003');
    expect((await db.query('SELECT * FROM price_observations')).rows).toHaveLength(0);
    expect((await db.query('SELECT * FROM supplier_products')).rows).toHaveLength(0);
  });
  it('denies approval execution to anon', async () => {
    await login('', 'anon');
    await expect(approve()).rejects.toThrow('permission denied');
  });
  it('rejects an override with a project from another tenant for a member of both', async () => {
    await login();
    await expect(db.query(`INSERT INTO project_price_overrides
      (organization_id,project_id,target_kind,target_id,price,unit,currency)
      VALUES ($1,'30000000-0000-4000-8000-000000000002','MASTER_MATERIAL',$2,100,'kg','ARS')`,
    [org, material])).rejects.toThrow('row-level security');
  });
  it('rejects an override targeting a material from another tenant', async () => {
    await login();
    await expect(db.query(`INSERT INTO project_price_overrides
      (organization_id,project_id,target_kind,target_id,price,unit,currency)
      VALUES ($1,'30000000-0000-4000-8000-000000000001','MASTER_MATERIAL',
      '40000000-0000-4000-8000-000000000002',100,'kg','ARS')`, [org])).rejects.toThrow('row-level security');
  });
  it('rejects a budget version with a project from another tenant', async () => {
    await login();
    await expect(db.query(`INSERT INTO budget_versions
      (organization_id,project_id,version_number,label)
      VALUES ($1,'30000000-0000-4000-8000-000000000002',1,'test')`, [org])).rejects.toThrow('row-level security');
  });
  it('permits correctly scoped overrides and budget versions', async () => {
    await login();
    await db.query(`INSERT INTO project_price_overrides
      (organization_id,project_id,target_kind,target_id,price,unit,currency)
      VALUES ($1,'30000000-0000-4000-8000-000000000001','MASTER_MATERIAL',$2,100,'kg','ARS')`, [org, material]);
    await db.query(`INSERT INTO budget_versions (organization_id,project_id,version_number,label)
      VALUES ($1,'30000000-0000-4000-8000-000000000001',1,'test')`, [org]);
    expect((await db.query('SELECT * FROM budget_versions')).rows).toHaveLength(1);
  });
});
