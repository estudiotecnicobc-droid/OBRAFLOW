# Fase 5 — diseño de Staging (React + Vite)

## Componentes
- `PriceHomologationPage.tsx`: organización activa, filtros, paginación, badges y estados de operaciones.
- `PendingRowsTable.tsx`: SKU, texto original, proveedor, precio, unidad, moneda, warning, selección de fila.
- `MaterialMappingDrawer.tsx`: buscador de master_materials, muestra unidad técnica; factor > 0, moneda y confirmación explícita.
- `AiSuggestionsPanel.tsx`: top 3, justificación, incertidumbre, sin autocambios.

## Hooks y contratos
```ts
type PendingRow = { batch_id: string; row_number: number; raw_cells: string[] };
type MappingInput = {
  batchId: string; rowNumber: number; masterMaterialId: string;
  supplierUnit: string; conversionFactor: number; currency: 'ARS'|'USD';
};
function usePendingRows(organizationId: string, batchId: string) {
  // RLS: .from('price_import_rows').select('batch_id,row_number,raw_cells,validation_errors')
  // .eq('organization_id',organizationId).eq('batch_id',batchId)
  // .eq('processing_status','pending_mapping').order('row_number')
  // .range(page*25,(page+1)*25-1)
  // useEffect, abort/ignore stale responses, refresh after approve.
}
async function approveMapping(input: MappingInput) {
  // Supabase RPC: approve_supplier_product_mapping.
  // DB MUST validate auth/tenant and row and create mapping + reset row atomically.
  // Follow by background homologation worker; no mass requeue.
}
async function getSuggestions(batchId: string, rowNumbers: number[]) {
  // functions.invoke('price-mapping-suggest', {body:{batchId,rowNumbers}});
  // Never send arbitrary master_materials catalog or org IDs from browser.
}
```

## Human-in-the-loop
1. Row pending_mapping -> user selects material after reviewing original description and factor.
2. SQL RPC runs transaction under lock; checks member role, supplier and row, allowed master material.
3. Exact unique (org,supplier,sku) mapping, no overwrite on conflict with different mapping.
4. Resets **only approved row** to raw, rest stays pending; background worker homologates after approval.
5. UI displays success only after RPC confirms; suggestions aren't persisted until approval.

## Safety gates
- Ensure comparison of raw row unit + currency against mapping; no implicit conversions.
- Different rows with identical SKU cannot silently inherit mapping when different size or package. Treat ambiguous SKU as pending review.
- RLS does not substitute server membership checks; no service_role in browser.
- LLM suggestions only allow-listed candidates read from caller's tenant/global catalog; model cannot invent IDs.
- No automatic mutation to master_materials, unit_price, resource prices or APUs.
- This is a design doc, not an integrated UI or deployed SQL migration.
