import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import * as XLSX from 'xlsx';
import { buildWorkbookCatalog, readCatalogWorkbook, reconcileGlobalCatalog } from './workbookCatalog.mjs';

export function csvText(rows) {
  if (!rows.length) return '\uFEFF';
  const headers = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const value = item => {
    const raw = item === null || item === undefined ? '' : typeof item === 'object' ? JSON.stringify(item) : String(item);
    const safe = typeof item === 'string' && /^\s*[=+@-]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replaceAll('"','""')}"`;
  };
  return '\uFEFF' + [headers.map(value).join(','),...rows.map(row => headers.map(h => value(row[h])).join(','))].join('\r\n') + '\r\n';
}

export function writeCatalogPackage(catalog, outputDir, reconciliation) {
  if (fs.existsSync(outputDir) && fs.readdirSync(outputDir).length) throw Error('Output directory must be new or empty');
  fs.mkdirSync(outputDir,{ recursive:true });
  const tables = {
    '01_materiales':catalog.resources.filter(r => r.resource_kind === 'MATERIAL'),
    '02_mano_obra':catalog.resources.filter(r => r.resource_kind === 'LABOR'),
    '03_equipos_subcontratos':catalog.resources.filter(r => r.resource_kind === 'EQUIPMENT_OR_SUBCONTRACT'),
    '04_tareas':catalog.tasks,
    '05_composiciones':catalog.components,
    '06_precios_referencia':catalog.reference_prices,
    '07_procedencia':catalog.source_evidence,
    '08_aliases':catalog.source_aliases,
    '09_plantillas_ejemplo':catalog.example_templates,
  };
  const wb = XLSX.utils.book_new();
  const resourceIndex = new Map(catalog.resources.map(r => [r.resource_code,r]));
  const priceView = catalog.reference_prices.map(p => {
    const r = resourceIndex.get(p.resource_code);
    return { Código:r.resource_code, Recurso:r.resource_name, Tipo:r.resource_kind, Unidad:r.unit,
      'Precio de referencia':p.price, 'Cargas y seguro %':p.labor_charges_pct,
      'Precio con cargas':p.loaded_price, Moneda:p.currency, Período:p.declared_period,
      Región:p.declared_region, 'IVA declarado':p.declared_tax_basis, 'Base de cobro':r.billing_basis,
      Fuente:p.source_texts.join(' | '), 'Revisar identidad':r.identity_review_required,
      'Clasificar equipo/subcontrato':r.classification_required, Verificación:p.verification };
  });
  const statusRows = [{ estado:'PAQUETE_NORMALIZADO_PARA_CONCILIAR', ...catalog.counts,
    conciliacion:reconciliation.status, escrituras_en_base:false,
    observaciones:'Valores guardados del Excel. Precios documentales sin activar. Se necesita exportación global para cruzar IDs existentes.' }];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(statusRows),'00_resumen');
  const priceSheet = XLSX.utils.json_to_sheet(priceView);
  priceSheet['!autofilter'] = { ref:priceSheet['!ref'] };
  priceSheet['!cols'] = Object.keys(priceView[0]).map(k => ({ wch:k === 'Recurso' || k === 'Fuente' ? 65 : 25 }));
  XLSX.utils.book_append_sheet(wb,priceSheet,'00_base_precios');
  fs.writeFileSync(path.join(outputDir,'00_base_precios.csv'),csvText(priceView),'utf8');
  for (const [name,rows] of Object.entries(tables)) {
    fs.writeFileSync(path.join(outputDir,`${name}.csv`),csvText(rows),'utf8');
    const flat = rows.map(row => Object.fromEntries(Object.entries(row).map(([key,value]) => [key,
      value && typeof value === 'object' ? JSON.stringify(value) : value])));
    const ws = XLSX.utils.json_to_sheet(flat);
    if (flat.length) {
      ws['!autofilter'] = { ref:ws['!ref'] };
      ws['!cols'] = Object.keys(flat[0]).map(key => ({ wch:/name|description|source_text|scope|note/.test(key)?55:24 }));
    }
    XLSX.utils.book_append_sheet(wb,ws,name);
  }
  fs.writeFileSync(path.join(outputDir,'ObraFlow_catalogo_precios.xlsx'),XLSX.write(wb,{ type:'buffer', bookType:'xlsx' }));
  fs.writeFileSync(path.join(outputDir,'catalogo.json'),JSON.stringify(catalog,null,2),'utf8');
  fs.writeFileSync(path.join(outputDir,'conciliacion.json'),JSON.stringify(reconciliation,null,2),'utf8');
  fs.writeFileSync(path.join(outputDir,'manifest.json'),JSON.stringify({ schema_version:catalog.schema_version,
    transform_version:catalog.transform_version,dataset_id:catalog.dataset_id,counts:catalog.counts,files:catalog.files,formula_policy:catalog.formula_policy,
    intended_scope:'GLOBAL', database_writes:false, reconciliation_status:reconciliation.status,
  },null,2),'utf8');
  fs.copyFileSync(new URL('./export-global-catalog.sql',import.meta.url),path.join(outputDir,'exportar_catalogo_global.sql'));
  const guide = `# Paquete de base de precios ObraFlow\n\n` +
    `Formato: catalogo.json, schema_version=1; Excel y CSV son vistas del mismo contenido. La hoja 00_base_precios reúne nombre, unidad, precio, cargas y fuente para revisar. Las claves son códigos, no UUID de la plataforma.\n\n` +
    `Procesados: ${catalog.counts.files} archivos, ${catalog.counts.tasks} tareas, ${catalog.counts.resources} recursos, ${catalog.counts.components} componentes únicos y ${catalog.counts.reference_prices} precios de referencia.\n\n` +
    `Estado de conciliación: ${reconciliation.status}. No se ejecutó ninguna escritura en bases de datos.\n\n` +
    `## Orden de incorporación\n\n` +
    `1. Confirmar el entorno donde Claude cargó las tareas y obtener una exportación completa del catálogo global con exportar_catalogo_global.sql (solo SELECT). Una exportación limitada por permisos no demuestra que falten registros.\n` +
    `2. Repetir el preparador con --existing-export archivo.json. Conserva los IDs y marca coincidencias, colisiones o posibles duplicados. No ejecuta altas ni actualizaciones. La composición existente todavía debe cruzarse antes de reemplazar hijos de tareas.\n` +
    `3. Revisar alias OF-M-PPL-PINTURA y OF-M-CPA-CESPED: separan códigos reutilizados para productos diferentes. Se conservaron los códigos originales y su procedencia; no se corrigieron registros de la plataforma.\n` +
    `4. Incorporar primero referencias de precio a las identidades ya conciliadas. Los precios son WORKBOOK_REFERENCE / UNVERIFIED_DOCUMENT; observed_on es null porque el origen declara un mes, no una observación fechada. No usar price_observations de proveedor ni un proveedor ficticio para estos precios.\n` +
    `5. Enlazar componentes por código conciliado. quantity_per_unit es HH para mano de obra y unidades de recurso para el resto. crew_people conserva personas. No aplicar otra vez las cargas sobre loaded_price ni sumar merma/IVA sin verificar la base.\n` +
    `6. Clasificar equipos/subcontratos. Se conserva la unidad del origen; billing_basis solo refleja día/mes/hora cuando es explícito en el nombre. No convertir automáticamente alquileres diarios o mensuales a cost_per_hour.\n` +
    `7. Probar un APU y un presupuesto local trazables antes de una carga amplia. Las tareas ya cargadas se conservan. Las cantidades de plantillas son ejemplos y no forman parte del catálogo de precios.\n\n` +
    `## Alcance\n\n` +
    `Se comprobaron sumas, precios de componentes, HH, referencias y duplicados por código usando valores guardados. No se recalcularon fórmulas ni verificaron cotizaciones externas. Los precios preservan fuente, región, mes, moneda y declaración de IVA; no se inventó alícuota ni fecha exacta.\n\n` +
    `Este paquete no es un CSV del importador de proveedores ni una migración SQL de inserción. Es la entrada normalizada para la conciliación de catálogo y la siguiente etapa de carga controlada.\n`;
  fs.writeFileSync(path.join(outputDir,'LEER_PRIMERO.md'),guide,'utf8');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options:{ 'input-dir':{ type:'string' }, 'output-dir':{ type:'string' }, 'existing-export':{ type:'string' } } });
  if (!values['input-dir'] || !values['output-dir']) throw Error('Usage: --input-dir folder --output-dir new-folder [--existing-export export.json]');
  const inputDir = path.resolve(values['input-dir']);
  const files = fs.readdirSync(inputDir).filter(f => /^Tareas_\d{2}(?:-\d{2})?_.+\.xlsx$/.test(f)).sort();
  const catalog = buildWorkbookCatalog(files.map(file => readCatalogWorkbook(file,fs.readFileSync(path.join(inputDir,file)))));
  const snapshot = values['existing-export'] ? JSON.parse(fs.readFileSync(values['existing-export'],'utf8')) : null;
  const reconciliation = reconcileGlobalCatalog(catalog,snapshot);
  writeCatalogPackage(catalog,path.resolve(values['output-dir']),reconciliation);
  console.log(JSON.stringify({ dataset_id:catalog.dataset_id,...catalog.counts,reconciliation:reconciliation.status }));
}
