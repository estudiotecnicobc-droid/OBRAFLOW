import React, { useEffect, useState } from "react";
import {
 usePendingMappings, searchMasterMaterials, approveMapping, suggestMappings,
 type MaterialCandidate
} from "./hooks/usePriceHomologation";

export function PriceHomologationPage(props: {
 organizationId: string; batchId: string; supplierName: string;
 columnMapping: {sku:number;description:number;price:number;unit:number;currency:number};
}) {
 const {rows,page,setPage,loading,error,reload}=
   usePendingMappings(props.organizationId,props.batchId);
 const [selected,setSelected]=useState<number|null>(null);
 const [search,setSearch]=useState("");
 const [materials,setMaterials]=useState<MaterialCandidate[]>([]);
 const [materialId,setMaterialId]=useState("");
 const [factor,setFactor]=useState("1");
 const [suggestions,setSuggestions]=useState<Array<{
   rowNumber:number;masterMaterialId:string;conversionFactor:number|null;
   confidence:number;reason:string;approvalRequired:true;
 }>>([]);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 useEffect(()=>{
   let live=true;
   void searchMasterMaterials(props.organizationId,search).then(x=>{
     if(live)setMaterials(x);
   }).catch(e=>{if(live)setNotice(String(e));});
   return ()=>{live=false;};
 },[props.organizationId,search]);
 const row=rows.find(x=>x.row_number===selected);
 const cells=row?.raw_cells??[];
 const col=props.columnMapping;
 const sku=String(cells[col.sku]??"");
 const unit=String(cells[col.unit]??"");
 const currency=String(cells[col.currency]??"");
 const approve=async()=>{
   if(selected===null||!row||!materialId||busy)return;
   setBusy(true);
   try{
     await approveMapping({
       batchId:props.batchId,rowNumber:selected,masterMaterialId:materialId,
       supplierUnit:unit,conversionFactor:Number(factor),
       currency:currency==="USD"?"USD":"ARS"
     });
     setNotice("Equivalencia guardada. Pendiente de reprocesamiento por el Worker.");
     setSelected(null); await reload();
   }catch(e){setNotice(e instanceof Error?e.message:String(e));}
   finally{setBusy(false);}
 };
 const suggest=async()=>{
   if(selected===null)return;
   setBusy(true);
   try{
     const res=await suggestMappings(props.batchId,[selected]);
     setSuggestions(res.suggestions);
   }catch(e){setNotice(e instanceof Error?e.message:String(e));}
   finally{setBusy(false);}
 };
 return (
  <section aria-label="Homologación de materiales">
   <h2>Homologación de precios — {props.supplierName}</h2>
   <p>Las sugerencias automáticas requieren confirmación humana.</p>
   {notice&&<p role="status">{notice}</p>}
   {error&&<p role="alert">{error}</p>}
   <table>
    <thead><tr><th>Fila</th><th>SKU</th><th>Descripción</th>
     <th>Proveedor</th><th>Precio original</th><th>Unidad</th>
     <th>Estado</th><th>Acción</th></tr></thead>
    <tbody>
     {rows.map(r=><tr key={r.row_number}>
       <td>{r.row_number}</td>
       <td>{r.raw_cells[col.sku]}</td>
       <td>{r.raw_cells[col.description]}</td>
       <td>{props.supplierName}</td>
       <td>{r.raw_cells[col.price]} {r.raw_cells[col.currency]}</td>
       <td>{r.raw_cells[col.unit]}</td>
       <td>pending_mapping</td>
       <td><button onClick={()=>{setSelected(r.row_number);setSuggestions([]);}}>
         Homologar</button></td>
     </tr>)}
    </tbody>
   </table>
   <button disabled={loading||page===0} onClick={()=>setPage(page-1)}>Anterior</button>
   <button disabled={loading||rows.length<25} onClick={()=>setPage(page+1)}>Siguiente</button>
   {row&&<aside aria-label="Vinculación de material">
    <h3>SKU {sku}</h3>
    <p>Descripción: {cells[col.description]} · Unidad proveedor: {unit}</p>
    <label>Buscar material maestro
     <input value={search} onChange={e=>setSearch(e.target.value)}
       placeholder="Nombre del material" /></label>
    <label>Material homologado
     <select value={materialId} onChange={e=>setMaterialId(e.target.value)}>
      <option value="">Seleccionar…</option>
      {materials.map(m=><option key={m.id} value={m.id}>
       {m.code||"Sin código"} · {m.name} ({m.unit})
      </option>)}
     </select>
    </label>
    <label>Factor: unidades técnicas por unidad comercial
     <input type="number" min="0.000001" step="any" value={factor}
      onChange={e=>setFactor(e.target.value)}/></label>
    <button disabled={busy} onClick={()=>void suggest()}>Sugerencias automáticas</button>
    {suggestions.map(s=><div key={s.rowNumber+"-"+s.masterMaterialId}>
      <p>Material propuesto: {s.masterMaterialId} ({Math.round(s.confidence*100)}%)</p>
      <p>{s.reason}</p>
      <button onClick={()=>{
        setMaterialId(s.masterMaterialId);
        if(s.conversionFactor!==null)setFactor(String(s.conversionFactor));
      }}>Usar en formulario (sin guardar)</button>
    </div>)}
    <button disabled={busy||!materialId||Number(factor)<=0}
      onClick={()=>void approve()}>Aprobar equivalencia</button>
   </aside>}
  </section>
 );
}
