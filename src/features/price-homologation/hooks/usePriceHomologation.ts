import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../../services/supabaseClient";

export type PendingRow = {
  batch_id: string;
  row_number: number;
  raw_cells: string[];
  validation_errors: string[];
};
export type MaterialCandidate = {
  id: string; name: string; code: string | null; unit: string;
};
export type ApprovalInput = {
  batchId: string;
  rowNumber: number;
  masterMaterialId: string;
  supplierUnit: string;
  conversionFactor: number;
  currency: "ARS" | "USD";
};

// Read-only listing. DB RLS must additionally enforce organization.
export function usePendingMappings(organizationId: string, batchId: string) {
  const [rows,setRows]=useState<PendingRow[]>([]);
  const [page,setPage]=useState(0);
  const [error,setError]=useState<string|null>(null);
  const [loading,setLoading]=useState(false);
  const reload=useCallback(async()=>{
    if(!organizationId||!batchId)return;
    setLoading(true);
    const result=await supabase.from("price_import_rows")
      .select("batch_id,row_number,raw_cells,validation_errors")
      .eq("organization_id",organizationId)
      .eq("batch_id",batchId)
      .eq("processing_status","pending_mapping")
      .order("row_number",{ascending:true}).range(page*25,page*25+24);
    if(result.error)setError(result.error.message);
    else{setRows((result.data??[]) as PendingRow[]);setError(null);}
    setLoading(false);
  },[organizationId,batchId,page]);
  useEffect(()=>{void reload();},[reload]);
  return {rows,page,setPage,loading,error,reload};
}
export async function searchMasterMaterials(
  organizationId:string,query:string
):Promise<MaterialCandidate[]>{
  if(query.trim().length<2)return [];
  const result=await supabase.from("master_materials")
    .select("id,name,code,unit").eq("is_active",true)
    .or("organization_id.is.null,organization_id.eq."+organizationId)
    .ilike("name","%"+query.replaceAll("%","\\%").replaceAll("_","\\_")+"%")
    .limit(20);
  if(result.error)throw result.error;
  return result.data as MaterialCandidate[];
}
export async function approveMapping(input:ApprovalInput){
  if(!Number.isFinite(input.conversionFactor) || input.conversionFactor<=0)
    throw Error("Factor de conversión inválido");
  // This RPC is a Phase 5 dependency, not deployed. See design doc.
  // Do not send direct UPDATE to supplier_products or import rows.
  const result=await supabase.rpc("approve_supplier_product_mapping",{
    p_batch_id:input.batchId,p_row_number:input.rowNumber,
    p_master_material_id:input.masterMaterialId,
    p_supplier_unit:input.supplierUnit,
    p_conversion_factor:input.conversionFactor,
    p_currency:input.currency
  });
  if(result.error)throw result.error;
  return result.data;
}
export async function suggestMappings(batchId:string,rowNumbers:number[]){
  const result=await supabase.functions.invoke("price-mapping-suggest",{
    body:{batchId,rowNumbers}
  });
  if(result.error)throw result.error;
  return result.data as {suggestions:Array<{
    rowNumber:number;masterMaterialId:string;conversionFactor:number|null;
    confidence:number;reason:string;approvalRequired:true
  }>};
}
