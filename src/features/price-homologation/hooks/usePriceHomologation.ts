import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../../../services/supabaseClient";

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
  organizationId: string;
  supplierId: string;
  rawSku: string;
  masterMaterialId: string;
  conversionFactor: number;
};
export type ApprovalResult = { mapping_id: string; queued_rows: number };
// Read-only listing. DB RLS must additionally enforce organization.
export function usePendingMappings(organizationId: string, batchId: string) {
  const [rows,setRows]=useState<PendingRow[]>([]);
  const [page,setPage]=useState(0);
  const [error,setError]=useState<string|null>(null);
  const [loading,setLoading]=useState(false);
  const [hiddenSkus,setHiddenSkus]=useState<string[]>([]);
  const [revision,setRevision]=useState(0);
  const reload=useCallback(async()=>{
    if(!organizationId||!batchId)return;
    const requestedOrg=organizationId,requestedBatch=batchId;
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
  },[organizationId,batchId,page,revision]);
  const dismissSku=useCallback((sku:string,skuColumn:number)=>{
    setHiddenSkus(current=>current.includes(sku)?current:[...current,sku]);
    setRows(current=>current.filter(r=>String(r.raw_cells[skuColumn]??"").trim()!==sku));
  },[]);
  const refresh=useCallback(()=>setRevision(v=>v+1),[]);
  useEffect(()=>{setHiddenSkus([]);setPage(0);},[organizationId,batchId]);
  useEffect(()=>{void reload();},[reload]);
  return {rows,page,setPage,loading,error,reload:refresh,dismissSku,hiddenSkus};
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
export function useApproveMapping() {
  const [isLoading,setIsLoading] = useState(false);
  const [error,setError] = useState<string|null>(null);
  const approve = useCallback(async (input:ApprovalInput):Promise<ApprovalResult> => {
    if (!input.organizationId || !input.supplierId ||
        !input.masterMaterialId || !input.rawSku.trim() ||
        !Number.isFinite(input.conversionFactor) ||
        input.conversionFactor <= 0) {
      throw Error("Datos de homologación incompletos o factor inválido");
    }
    setIsLoading(true); setError(null);
    try {
      const result = await supabase.rpc("approve_supplier_mapping", {
        p_organization_id: input.organizationId,
        p_supplier_id: input.supplierId,
        p_raw_sku: input.rawSku.trim(),
        p_master_material_id: input.masterMaterialId,
        p_conversion_factor: input.conversionFactor
      });
      if (result.error) throw result.error;
      const outcome = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!outcome?.mapping_id || !Number.isFinite(Number(outcome.queued_rows))) {
        throw Error("Respuesta inesperada de homologación");
      }
      return {mapping_id:outcome.mapping_id,queued_rows:Number(outcome.queued_rows)};
    } catch(e) {
      const message=e instanceof Error?e.message:String(e);
      setError(message); throw e;
    } finally {setIsLoading(false);}
  },[]);
  return {approve,isLoading,error};
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
