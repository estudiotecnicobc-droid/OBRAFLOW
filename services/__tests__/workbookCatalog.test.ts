import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { buildWorkbookCatalog, readCatalogWorkbook, reconcileGlobalCatalog } from '../../scripts/pricing/workbookCatalog.mjs';
import { csvText } from '../../scripts/pricing/prepare-workbook-catalog.mjs';

function workbook({ file='Tareas_01_Demoliciones.xlsx',task='OF-TST-001',material='OF-M-TEST',materialName='Material de prueba',materialUnit='kg' } = {}) {
  const header=['Código','Tarea','Unidad','Qué incluye','Rendimiento diario de la cuadrilla','HH por unidad','Cuadrilla (personas)',
    'Mano de obra','Materiales','Equipos y subcontratos','Total por unidad','Gremio'];
  return { file,sha256:file,sheets:[
    { name:'APU',rows:[['APU'],['','','','','','','','','','Horas por jornada',9],[],header,
      [task,'Tarea de prueba','m²','Alcance',18,0.5,1,5601,200,450,6251,'Albañilería']] },
    { name:'Recursos',rows:[['Recursos y precios de referencia (AMBA, octubre 2026, ARS con IVA)'],[],[],
      ['Código','Recurso','Unidad','Tipo','Precio','Cargas y seguro %','Fuente'],
      ['OF-MO-AY','Ayudante','h','Mano de obra',5601,100,'UOCRA, fuente declarada'],
      [material,materialName,materialUnit,'Material',100,0,'Estimación'],
      ['OF-E-TST','Alquiler de equipo (por día)','u','Equipo o subcontrato',900,0,'Estimación']] },
    { name:'Composición',rows:[['Código APU','Recurso','Nombre','Unidad','Cantidad','Precio','Costo por unidad de APU','HH por unidad'],
      [task,'OF-MO-AY','Ayudante','personas',1,11202,5601,0.5],
      [task,material,materialName,materialUnit,2,100,200,null],
      [task,'OF-E-TST','Alquiler de equipo','u',0.5,900,450,null]] },
  ] };
}
const globalExport = (changes = {}) => ({ export_version:1,scope:'GLOBAL',tasks:[],resources:[],master_materials:[],...changes });

describe('workbook price catalog preparation', () => {
  it('separates people from HH and preserves the loaded rate without charging twice', () => {
    const catalog=buildWorkbookCatalog([workbook()]);
    const labor=catalog.components.find(p=>p.resource_kind==='LABOR');
    expect(labor).toMatchObject({ source_quantity:1,source_quantity_unit:'personas',crew_people:1,
      quantity_per_unit:0.5,hh_per_unit:0.5,reference_loaded_unit_price:11202,reference_line_cost:5601 });
    expect(catalog.reference_prices.find(p=>p.resource_code==='OF-MO-AY')).toMatchObject({
      price:5601,labor_charges_pct:100,loaded_price:11202,observed_on:null,declared_period:'2026-10',
      source_kind:'WORKBOOK_REFERENCE',verification:'UNVERIFIED_DOCUMENT',activate_automatically:false,
    });
    expect(catalog.resources.find(r=>r.resource_code==='OF-E-TST')).toMatchObject({ unit:'un',billing_basis:'DAY',classification_required:true });
  });
  it('deduplicates shared tasks and resources and retains all source evidence', () => {
    const catalog=buildWorkbookCatalog([workbook(),workbook({file:'Tareas_02_Trabajos_preliminares.xlsx'})]);
    expect(catalog.counts).toMatchObject({files:2,tasks:1,resources:3,components:3,reference_prices:3});
    expect(catalog.tasks[0].source_keys).toHaveLength(2);
    expect(catalog.source_evidence.filter(s=>s.entity==='COMPONENT')).toHaveLength(6);
  });
  it('creates deterministic packages regardless of input order', () => {
    const a=workbook(),b=workbook({file:'Tareas_02_Trabajos_preliminares.xlsx'});
    expect(buildWorkbookCatalog([a,b])).toEqual(buildWorkbookCatalog([b,a]));
  });
  it('rejects a reused resource code with a different identity without a scoped alias', () => {
    expect(()=>buildWorkbookCatalog([workbook(),workbook({file:'Tareas_02_Trabajos_preliminares.xlsx',materialName:'Otro producto'})]))
      .toThrow('conflicting definitions');
  });
  it('rewrites only the painting resource and its components for the PPL collision', () => {
    const catalog=buildWorkbookCatalog([
      workbook({file:'Tareas_18_Carpinteria_de_madera.xlsx',material:'OF-M-PPL',materialName:'Puerta placa',materialUnit:'u'}),
      workbook({file:'Tareas_34_Pintura.xlsx',task:'OF-TST-002',material:'OF-M-PPL',materialName:'Pintura para piletas',materialUnit:'l'}),
    ]);
    expect(catalog.resources.map(r=>r.resource_code)).toContain('OF-M-PPL-PINTURA');
    expect(catalog.components.find(p=>p.task_code==='OF-TST-002'&&p.resource_kind==='MATERIAL')?.resource_code).toBe('OF-M-PPL-PINTURA');
    expect(catalog.components.find(p=>p.task_code==='OF-TST-001'&&p.resource_kind==='MATERIAL')?.resource_code).toBe('OF-M-PPL');
    expect(catalog.source_aliases).toHaveLength(1);
    expect(catalog.resources.filter(r=>r.resource_code.startsWith('OF-M-PPL')).every(r=>r.identity_review_required)).toBe(true);
  });
  it('rejects an incorrect saved line total and undefined references', () => {
    const bad=workbook();
    bad.sheets[2].rows[2][6]=0;
    expect(()=>buildWorkbookCatalog([bad])).toThrow('line cost');
    const missing=workbook();
    missing.sheets[2].rows[2][1]='OF-M-MISSING';
    expect(()=>buildWorkbookCatalog([missing])).toThrow('undefined resource');
  });
  it('keeps lawn separate from an electrical box when CPA is reused', () => {
    const catalog=buildWorkbookCatalog([
      workbook({file:'Tareas_26_Instalacion_electrica.xlsx',material:'OF-M-CPA',materialName:'Caja de pase',materialUnit:'u'}),
      workbook({file:'Tareas_35_Obras_exteriores.xlsx',task:'OF-TST-002',material:'OF-M-CPA',materialName:'Césped en panes',materialUnit:'m²'}),
    ]);
    expect(catalog.components.find(p=>p.task_code==='OF-TST-002'&&p.resource_kind==='MATERIAL')?.resource_code).toBe('OF-M-CPA-CESPED');
    expect(catalog.components.find(p=>p.task_code==='OF-TST-001'&&p.resource_kind==='MATERIAL')?.resource_code).toBe('OF-M-CPA');
  });
  it('rejects Excel error cells and formulas without saved values', () => {
    for(const cell of [{ t:'e',v:23,w:'#REF!' },{ t:'n',f:'1+1' }]) {
      const wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb,{ A1:cell,'!ref':'A1' },'APU');
      expect(()=>readCatalogWorkbook('bad.xlsx',XLSX.write(wb,{type:'buffer',bookType:'xlsx'}))).toThrow();
    }
  });
  it('escapes CSV text formulas, quotes and newlines and keeps numeric values numeric', () => {
    const output=csvText([{name:'=HYPERLINK("x")',note:'a,"b"\nc',quantity:-2,tab:'\t=SUM(1)'}]);
    expect(output).toContain('"\'=HYPERLINK(""x"")"');
    expect(output).toContain('"a,""b""\nc"');
    expect(output).toContain('"-2"');
    expect(output).toContain('"\'\t=SUM(1)"');
  });
  it('does not silently interpret an hours-based labor row as people', () => {
    const bad=workbook();
    bad.sheets[2].rows[1][3]='h';
    expect(()=>buildWorkbookCatalog([bad])).toThrow('expected labor quantity in people');
  });
});

describe('read-only reconciliation with already loaded global catalog', () => {
  const catalog=buildWorkbookCatalog([workbook()]);
  it('does not assume missing records without an export', () => {
    expect(reconcileGlobalCatalog(catalog,null)).toMatchObject({status:'AWAITING_GLOBAL_EXPORT',database_writes:false,tasks:[]});
  });
  it('reuses the task ID and never proposes replacing components or prices', () => {
    const result=reconcileGlobalCatalog(catalog,globalExport({tasks:[{
      id:'existing-task',organization_id:null,code:'OF-TST-001',name:'Tarea de prueba',unit:'m2',is_active:true,
    }]}));
    expect(result.tasks[0]).toMatchObject({existing_ids:['existing-task'],status:'REUSE_EXISTING_ID_REVIEW_PRICE',
      composition_compared:false,action:'PRESERVE_EXISTING_TASK_UNTIL_COMPONENT_RECONCILIATION'});
    expect(result.database_writes).toBe(false);
  });
  it('rejects incomplete exports and tenant data masquerading as global', () => {
    expect(()=>reconcileGlobalCatalog(catalog,{scope:'GLOBAL',export_version:1})).toThrow('Missing export collection');
    expect(()=>reconcileGlobalCatalog(catalog,globalExport({tasks:[{id:'x',organization_id:'tenant'}]}))).toThrow('non-global');
  });
  it('flags duplicate IDs per code rather than arbitrarily selecting one', () => {
    const task={organization_id:null,code:'OF-TST-001',name:'Tarea de prueba',unit:'m2'};
    const result=reconcileGlobalCatalog(catalog,globalExport({tasks:[{...task,id:'a'},{...task,id:'b'}]}));
    expect(result.tasks[0]).toMatchObject({status:'REVIEW_MULTIPLE_IDS',existing_ids:['a','b']});
  });
  it('flags a likely name match with a different code rather than creating another task', () => {
    const result=reconcileGlobalCatalog(catalog,globalExport({tasks:[{
      id:'legacy',organization_id:null,code:'LEGACY',name:'Tarea de prueba',unit:'m²',
    }]}));
    expect(result.tasks[0]).toMatchObject({status:'REVIEW_NAME_MATCH_DIFFERENT_CODE',existing_ids:['legacy']});
  });
  it('does not reuse a material resource that has a different type', () => {
    const result=reconcileGlobalCatalog(catalog,globalExport({resources:[{
      id:'wrong-type',organization_id:null,code:'OF-M-TEST',name:'Material de prueba',unit:'kg',type:'LABOR',
    }]}));
    expect(result.resources.find(r=>r.resource_code==='OF-M-TEST'&&r.table==='resources')?.status).toBe('REVIEW_RESOURCE_TYPE');
  });
  it('flags inactive IDs instead of reactivating them implicitly', () => {
    const result=reconcileGlobalCatalog(catalog,globalExport({tasks:[{
      id:'inactive',organization_id:null,code:'OF-TST-001',name:'Tarea de prueba',unit:'m2',is_active:false,
    }]}));
    expect(result.tasks[0]).toMatchObject({status:'REVIEW_INACTIVE_ID',existing_ids:['inactive']});
  });
  it('prefers a canonical alias ID over the unrelated original code', () => {
    const aliased=buildWorkbookCatalog([workbook({file:'Tareas_34_Pintura.xlsx',material:'OF-M-PPL',materialName:'Pintura',materialUnit:'l'})]);
    const result=reconcileGlobalCatalog(aliased,globalExport({resources:[
      {id:'door',organization_id:null,code:'OF-M-PPL',name:'Puerta placa',unit:'u',type:'MATERIAL'},
      {id:'paint',organization_id:null,code:'OF-M-PPL-PINTURA',name:'Pintura',unit:'lt',type:'MATERIAL'},
    ]}));
    expect(result.resources.find(r=>r.resource_code==='OF-M-PPL-PINTURA'&&r.table==='resources')).toMatchObject({
      status:'REUSE_EXISTING_ID_REVIEW_PRICE',existing_ids:['paint'],identity_review_required:true,
    });
  });
});
