import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';

const digest = value => createHash('sha256').update(value).digest('hex');
const codePattern = /^OF-[A-Z0-9-]+$/;
const validNumber = value => typeof value === 'number' && Number.isFinite(value);
const text = value => String(value ?? '').trim();
const identityText = value => text(value).normalize('NFC').toLocaleLowerCase('es');
export function normalizeCatalogUnit(value) {
  const key = identityText(value);
  return ({ 'm²':'m2', 'm³':'m3', u:'un', und:'un', unidad:'un', l:'lt', litro:'lt',
    hs:'h', hora:'h', horas:'h', dia:'día', dias:'día', días:'día' })[key] ?? key;
}

// These scoped aliases correct collisions in the supplied workbooks only.
export const workbookAliases = [
  { file:'Tareas_34_Pintura.xlsx', source_code:'OF-M-PPL', resource_code:'OF-M-PPL-PINTURA',
    reason:'Pintura para piletas; OF-M-PPL also identifies a door in rubro 18' },
  { file:'Tareas_35_Obras_exteriores.xlsx', source_code:'OF-M-CPA', resource_code:'OF-M-CPA-CESPED',
    reason:'Césped en panes; OF-M-CPA also identifies an electrical box in rubro 26' },
];

export function readCatalogWorkbook(file, buffer) {
  const book = XLSX.read(buffer, { type:'buffer', cellFormula:true, sheetStubs:true });
  const sheets = book.SheetNames.map(name => {
    const sheet = book.Sheets[name];
    for (const [address, cell] of Object.entries(sheet)) {
      if (address.startsWith('!')) continue;
      if (cell.t === 'e' || cell.f?.includes('#REF!')) throw Error(`${file}/${name}!${address}: Excel error`);
      if (cell.f && (cell.t === 'z' || cell.v === undefined || cell.v === null)) throw Error(`${file}/${name}!${address}: formula has no saved value`);
    }
    return { name, rows:XLSX.utils.sheet_to_json(sheet, { header:1, raw:true, defval:null, blankrows:true }) };
  });
  return { file, sha256:digest(buffer), sheets };
}

function records(book, sheetName, headerRow, requiredHeaders) {
  const sheet = book.sheets.find(s => s.name === sheetName);
  if (!sheet) throw Error(`${book.file}: missing sheet ${sheetName}`);
  const headers = sheet.rows[headerRow - 1]?.map(text) ?? [];
  if (!requiredHeaders.every(h => headers.includes(h))) throw Error(`${book.file}/${sheetName}: incompatible headers`);
  return sheet.rows.slice(headerRow).flatMap((cells, index) => {
    if (!text(cells[0])) return [];
    if (!codePattern.test(text(cells[0]))) throw Error(`${book.file}/${sheetName}:${index + headerRow + 1}: invalid code ${cells[0]}`);
    return [{ row:index + headerRow + 1, ...Object.fromEntries(headers.map((h, i) => [h,cells[i] ?? null])) }];
  });
}
function assertNumber(value, label, minimum = 0) {
  if (!validNumber(value) || value < minimum) throw Error(`${label}: invalid number ${value}`);
  return value;
}
function close(actual, expected, label, tolerance = 0.05) {
  if (!validNumber(actual) || !validNumber(expected) || Math.abs(actual - expected) > tolerance) {
    throw Error(`${label}: expected ${expected}, found ${actual}`);
  }
}
function sourceMetadata(book) {
  const title = text(book.sheets.find(s => s.name === 'Recursos')?.rows[0]?.[0]);
  // Do not invent a day of observation from a monthly reference label.
  const match = title.match(/\(([^,]+),\s*octubre\s+(\d{4}),\s*(ARS)\s+con IVA\)/i);
  if (!match) throw Error(`${book.file}: unrecognized price metadata; provide an explicit period/currency/region mapping`);
  return { declared_period:`${match[2]}-10`, currency:match[3].toUpperCase(),
    declared_region:match[1], declared_tax_basis:'VAT_INCLUDED_AS_DECLARED', declared_header:title };
}
function billingBasis(name, unit) {
  if (/por mes|mensual/i.test(name)) return 'MONTH';
  if (/por d[ií]a|diario/i.test(name)) return 'DAY';
  if (/por hora/i.test(name) || unit === 'h') return 'HOUR';
  return 'SOURCE_UNIT';
}
function sameDefinition(left, right, label) {
  if (JSON.stringify(left) !== JSON.stringify(right)) throw Error(`${label}: conflicting definitions; explicit mapping is required`);
}
const sortedParts = parts => [...parts].sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

export function buildWorkbookCatalog(books, aliases = workbookAliases) {
  if (!books.length) throw Error('No workbooks supplied');
  const files = new Set();
  const resources = new Map(), tasks = new Map(), taskParts = new Map(), sourceKeys = new Set();
  const sources = [], templates = [], appliedAliases = [], manifests = [];
  const collisionCodes = new Set(aliases.map(a => a.source_code));
  const canonicalCode = (book, raw) => aliases.find(a => a.file === book.file && a.source_code === raw)?.resource_code ?? raw;
  const addSource = (book, sheet, row, entity, sourceCode, canonical, taskCode = null) => {
    const key = digest(JSON.stringify([book.file,book.sha256,sheet,row,entity,canonical]));
    if (!sourceKeys.has(key)) {
      sources.push({ source_key:key, file:book.file, file_sha256:book.sha256, sheet, row,
        entity, source_code:sourceCode, canonical_code:canonical, task_code:taskCode });
      sourceKeys.add(key);
    }
    return key;
  };
  for (const book of [...books].sort((a,b) => a.file.localeCompare(b.file))) {
    if (files.has(book.file)) throw Error(`Duplicate source file ${book.file}`);
    files.add(book.file);
    const metadata = sourceMetadata(book);
    const rawResources = records(book,'Recursos',4,['Código','Recurso','Unidad','Tipo','Precio','Cargas y seguro %','Fuente']);
    const rawTasks = records(book,'APU',4,['Código','Tarea','Unidad','Qué incluye','Rendimiento diario de la cuadrilla',
      'HH por unidad','Cuadrilla (personas)','Mano de obra','Materiales','Equipos y subcontratos','Total por unidad','Gremio']);
    const rawParts = records(book,'Composición',1,['Código APU','Recurso','Nombre','Unidad','Cantidad','Precio','Costo por unidad de APU','HH por unidad']);
    const localResources = new Map(), localTasks = new Map(), rubros = new Map();
    const config = book.sheets.find(s => s.name === 'APU').rows[1];
    const workday = assertNumber(config[config.findIndex(c => c === 'Horas por jornada') + 1], `${book.file}: workday`,0.01);
    for (const row of rawResources) {
      const rawCode = text(row.Código), canonical = canonicalCode(book,rawCode);
      if (localResources.has(rawCode)) throw Error(`${book.file}: duplicate resource ${rawCode}`);
      const kind = ({ Material:'MATERIAL', 'Mano de obra':'LABOR', 'Equipo o subcontrato':'EQUIPMENT_OR_SUBCONTRACT' })[row.Tipo];
      if (!kind) throw Error(`${book.file}: unknown resource type ${row.Tipo}`);
      const unit = normalizeCatalogUnit(row.Unidad);
      if (!unit) throw Error(`${book.file}/${rawCode}: missing unit`);
      const price = assertNumber(row.Precio,`${book.file}/${rawCode}: price`,0.00000001);
      const charges = assertNumber(row['Cargas y seguro %'],`${book.file}/${rawCode}: charges`);
      const loaded = kind === 'LABOR' ? price * (1 + charges / 100) : price;
      const definition = { resource_code:canonical, resource_name:text(row.Recurso), resource_kind:kind, unit,
        billing_basis:billingBasis(text(row.Recurso),unit), reference_price:price, labor_charges_pct:charges,
        loaded_reference_price:loaded, ...metadata };
      if (resources.has(canonical)) sameDefinition(resources.get(canonical).definition,definition,canonical);
      else resources.set(canonical,{ definition, source_codes:new Set(), source_texts:new Set(), source_keys:[],
        identity_review_required:collisionCodes.has(rawCode) });
      const target = resources.get(canonical);
      target.source_codes.add(rawCode);
      target.source_texts.add(text(row.Fuente));
      target.source_keys.push(addSource(book,'Recursos',row.row,'RESOURCE',rawCode,canonical));
      localResources.set(rawCode,{ ...definition, source_unit:text(row.Unidad) });
      if (canonical !== rawCode) appliedAliases.push({ file:book.file, source_code:rawCode, resource_code:canonical,
        reason:aliases.find(a => a.file === book.file && a.source_code === rawCode).reason });
    }
    for (const sheet of book.sheets.filter(s => s.name.startsWith('Tareas'))) {
      const headers = sheet.rows[3]?.map(text) ?? [];
      for (const [i,cells] of sheet.rows.entries()) {
        if (i < 4 || !text(cells[headers.indexOf('Código APU')])) continue;
        const value = name => cells[headers.indexOf(name)];
        const taskCode = text(value('Código APU'));
        if (!codePattern.test(taskCode)) throw Error(`${book.file}/${sheet.name}:${i+1}: invalid task code`);
        const rubro = text(value('Rubro ObraFlow'));
        if (!rubros.has(taskCode)) rubros.set(taskCode,new Set());
        rubros.get(taskCode).add(rubro);
        if (!['Sí','No'].includes(value('¿Incluir?'))) throw Error(`${taskCode}: invalid inclusion flag`);
        const quantity = assertNumber(value('Cantidad'),`${taskCode}: example quantity`);
        const unitPrice = assertNumber(value('Costo unitario'),`${taskCode}: example unit price`);
        close(value('Subtotal'),value('¿Incluir?') === 'Sí' ? quantity * unitPrice : 0,`${taskCode}: example subtotal`);
        templates.push({ file:book.file, sheet:sheet.name, row:i+1, task_code:taskCode, rubro,
          example_quantity:quantity, default_included:value('¿Incluir?') === 'Sí',
          scope:text(value('Alcance / criterio')), note:text(value('Observación')) });
      }
    }
    for (const row of rawTasks) {
      const taskCode = text(row.Código);
      if (localTasks.has(taskCode)) throw Error(`${book.file}: duplicate APU ${taskCode}`);
      const parts = rawParts.filter(p => p['Código APU'] === taskCode).map((p,index) => {
        const resource = localResources.get(text(p.Recurso));
        if (!resource) throw Error(`${book.file}:${p.row}: undefined resource ${p.Recurso}`);
        const quantity = assertNumber(p.Cantidad,`${taskCode}/${p.Recurso}: quantity`);
        if (resource.resource_kind === 'LABOR' && !['persona','personas'].includes(identityText(p.Unidad))) {
          throw Error(`${taskCode}/${p.Recurso}: expected labor quantity in people; do not infer hours`);
        }
        const hh = resource.resource_kind === 'LABOR' ? assertNumber(p['HH por unidad'],`${taskCode}: labor HH`) : null;
        close(p.Precio,resource.loaded_reference_price,`${taskCode}/${p.Recurso}: loaded price`);
        if (resource.resource_kind !== 'LABOR' && normalizeCatalogUnit(p.Unidad) !== resource.unit) {
          throw Error(`${taskCode}/${p.Recurso}: unit mismatch`);
        }
        close(p['Costo por unidad de APU'],(hh ?? quantity)*p.Precio,`${taskCode}/${p.Recurso}: line cost`);
        return { task_code:taskCode, line_number:index+1, resource_code:resource.resource_code,
          resource_kind:resource.resource_kind, unit:resource.unit,
          source_quantity:quantity, source_quantity_unit:text(p.Unidad),
          quantity_per_unit:hh ?? quantity, quantity_basis:hh === null ? 'RESOURCE_UNIT_PER_TASK_UNIT' : 'HOURS_PER_TASK_UNIT',
          crew_people:hh === null ? null : quantity, hh_per_unit:hh,
          reference_loaded_unit_price:p.Precio, reference_line_cost:p['Costo por unidad de APU'],
          source_key:addSource(book,'Composición',p.row,'COMPONENT',text(p.Recurso),resource.resource_code,taskCode) };
      });
      if (!parts.length) throw Error(`${book.file}/${taskCode}: missing composition`);
      for (const [kind,column] of [['MATERIAL','Materiales'],['LABOR','Mano de obra'],['EQUIPMENT_OR_SUBCONTRACT','Equipos y subcontratos']]) {
        close(row[column],parts.filter(p => p.resource_kind === kind).reduce((n,p) => n+p.reference_line_cost,0),`${taskCode}: ${column}`);
      }
      close(row['Total por unidad'],parts.reduce((n,p) => n+p.reference_line_cost,0),`${taskCode}: APU total`);
      close(row['HH por unidad'],parts.reduce((n,p) => n+(p.hh_per_unit ?? 0),0),`${taskCode}: total HH`,0.00001);
      const dailyYield = validNumber(row['Rendimiento diario de la cuadrilla']) ? assertNumber(row['Rendimiento diario de la cuadrilla'],`${taskCode}: daily yield`,0.00000001) : null;
      if (dailyYield === null && row['HH por unidad'] !== 0) throw Error(`${taskCode}: missing daily yield for labor`);
      if (dailyYield !== null) close(row['HH por unidad'],row['Cuadrilla (personas)']*workday/dailyYield,`${taskCode}: HH/yield`,0.00001);
      const definition = { task_code:taskCode, task_name:text(row.Tarea), unit:normalizeCatalogUnit(row.Unidad),
        description:text(row['Qué incluye']), trade:text(row.Gremio), daily_yield:dailyYield, workday_hours:workday,
        hh_per_unit:row['HH por unidad'], crew_size:row['Cuadrilla (personas)'],
        reference_material_cost:row.Materiales, reference_labor_cost:row['Mano de obra'],
        reference_equipment_subcontract_cost:row['Equipos y subcontratos'], reference_total_cost:row['Total por unidad'] };
      const partDefinition = sortedParts(parts.map(({ source_key,line_number,...part }) => part));
      if (tasks.has(taskCode)) {
        sameDefinition(tasks.get(taskCode).definition,definition,taskCode);
        sameDefinition(tasks.get(taskCode).part_definition,partDefinition,`${taskCode} composition`);
      } else {
        tasks.set(taskCode,{ definition, part_definition:partDefinition, rubros:new Set(), source_keys:[] });
        taskParts.set(taskCode,parts);
      }
      const target = tasks.get(taskCode);
      for (const rubro of rubros.get(taskCode) ?? []) target.rubros.add(rubro);
      target.source_keys.push(addSource(book,'APU',row.row,'TASK',taskCode,taskCode));
      localTasks.set(taskCode,definition);
    }
    for (const p of rawParts) if (!localTasks.has(text(p['Código APU']))) throw Error(`${book.file}: orphan component ${p['Código APU']}`);
    for (const t of templates.filter(t => t.file === book.file)) {
      if (!localTasks.has(t.task_code)) throw Error(`${book.file}: example has undefined task ${t.task_code}`);
      const cells = book.sheets.find(s => s.name === t.sheet).rows[t.row-1];
      const headers = book.sheets.find(s => s.name === t.sheet).rows[3];
      close(cells[headers.indexOf('Costo unitario')],localTasks.get(t.task_code).reference_total_cost,`${t.task_code}: example price`);
    }
    manifests.push({ file:book.file, sha256:book.sha256, sheets:book.sheets.length,
      apu_rows:rawTasks.length, resource_rows:rawResources.length, component_rows:rawParts.length });
  }
  const resourceRows = [...resources.values()].map(r => {
    const { reference_price,loaded_reference_price,labor_charges_pct,...definition } = r.definition;
    return { ...definition, source_codes:[...r.source_codes].sort(), identity_review_required:r.identity_review_required,
      classification_required:definition.resource_kind === 'EQUIPMENT_OR_SUBCONTRACT', source_keys:r.source_keys };
  }).sort((a,b) => a.resource_code.localeCompare(b.resource_code));
  const prices = [...resources.values()].map(r => ({ reference_key:`WORKBOOK:${r.definition.resource_code}:${r.definition.declared_period}`,
    resource_code:r.definition.resource_code, price:r.definition.reference_price, labor_charges_pct:r.definition.labor_charges_pct,
    loaded_price:r.definition.loaded_reference_price, currency:r.definition.currency, unit:r.definition.unit,
    declared_period:r.definition.declared_period, observed_on:null, declared_region:r.definition.declared_region,
    declared_tax_basis:r.definition.declared_tax_basis, source_kind:'WORKBOOK_REFERENCE', verification:'UNVERIFIED_DOCUMENT',
    activate_automatically:false, source_texts:[...r.source_texts].sort(), source_keys:r.source_keys,
  })).sort((a,b) => a.resource_code.localeCompare(b.resource_code));
  const taskRows = [...tasks.values()].map(t => ({ ...t.definition, rubros:[...t.rubros].sort(),
    auxiliary_only:t.rubros.size > 0 && [...t.rubros].every(r => Number(r.slice(0,2)) >= 90), source_keys:t.source_keys,
  })).sort((a,b) => a.task_code.localeCompare(b.task_code));
  const components = [...taskParts.values()].flat().sort((a,b) => a.task_code.localeCompare(b.task_code) || a.line_number-b.line_number);
  return { schema_version:1, transform_version:'workbook-pricing-v1', purpose:'GLOBAL_CATALOG_RECONCILIATION',
    dataset_id:digest(JSON.stringify(manifests.map(m => [m.file,m.sha256]))),
    formula_policy:'SAVED_VALUES_CHECKED_NOT_RECALCULATED', database_writes:false,
    counts:{ files:books.length, tasks:taskRows.length, resources:resourceRows.length, components:components.length,
      reference_prices:prices.length, example_items:templates.length, aliases:appliedAliases.length },
    files:manifests, resources:resourceRows, tasks:taskRows, components, reference_prices:prices,
    source_evidence:sources, source_aliases:appliedAliases, example_templates:templates };
}

export function reconcileGlobalCatalog(catalog, snapshot) {
  if (!snapshot) return { status:'AWAITING_GLOBAL_EXPORT', database_writes:false, tasks:[], resources:[],
    reason:'Existing IDs have not been verified. Do not insert tasks from this package blindly.' };
  if (snapshot.scope !== 'GLOBAL' || snapshot.export_version !== 1) throw Error('Expected version 1 GLOBAL export');
  for (const key of ['tasks','resources','master_materials']) {
    if (!Array.isArray(snapshot[key])) throw Error(`Missing export collection ${key}`);
    if (snapshot[key].some(row => !row.id || !Object.hasOwn(row,'organization_id') || row.organization_id !== null)) {
      throw Error(`Invalid or non-global rows in ${key}`);
    }
  }
  const match = (code,name,unit,rows,sourceCodes = [],expectedKind = null) => {
    const exact = rows.filter(r => r.code === code);
    const candidates = exact.length ? exact : rows.filter(r => sourceCodes.includes(r.code));
    if (candidates.length > 1) return { status:'REVIEW_MULTIPLE_IDS', existing_ids:candidates.map(r => r.id) };
    if (candidates.length === 1) {
      const found = candidates[0];
      if (found.is_active === false) return { status:'REVIEW_INACTIVE_ID', existing_ids:[found.id] };
      if (expectedKind && expectedKind !== 'EQUIPMENT_OR_SUBCONTRACT' && found.type !== expectedKind) {
        return { status:'REVIEW_RESOURCE_TYPE', existing_ids:[found.id] };
      }
      return { status:identityText(found.name) === identityText(name) && normalizeCatalogUnit(found.unit) === unit
        ? (found.code === code ? 'REUSE_EXISTING_ID_REVIEW_PRICE' : 'REVIEW_SCOPED_ALIAS') : 'REVIEW_IDENTITY_CONFLICT',
        existing_ids:[found.id], existing_name:found.name, existing_unit:found.unit };
    }
    const byName = rows.filter(r => identityText(r.name) === identityText(name) && normalizeCatalogUnit(r.unit) === unit);
    return byName.length ? { status:'REVIEW_NAME_MATCH_DIFFERENT_CODE', existing_ids:byName.map(r => r.id) }
      : { status:'MISSING_CANDIDATE', existing_ids:[] };
  };
  return { status:'RECONCILIATION_ONLY', database_writes:false,
    tasks:catalog.tasks.map(t => ({ task_code:t.task_code,...match(t.task_code,t.task_name,t.unit,snapshot.tasks),
      composition_compared:false, action:'PRESERVE_EXISTING_TASK_UNTIL_COMPONENT_RECONCILIATION' })),
    resources:catalog.resources.flatMap(r => ['resources',...(r.resource_kind === 'MATERIAL' ? ['master_materials'] : [])].map(table => ({
      resource_code:r.resource_code, table,...match(r.resource_code,r.resource_name,r.unit,
        table === 'master_materials' ? snapshot[table].map(m => ({ ...m,type:'MATERIAL' })) : snapshot[table],r.source_codes,r.resource_kind),
      identity_review_required:r.identity_review_required, classification_required:r.classification_required,
      action:'REVIEW_ONLY_NO_PRICE_OVERWRITE',
    }))),
  };
}
