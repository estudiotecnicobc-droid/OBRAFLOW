import React, { useMemo, useState, Fragment, useRef } from 'react';
import { useERP } from '../context/ERPContext';
import { calculateUnitPrice } from '../services/calculationService';
import { 
  useReactTable, 
  getCoreRowModel, 
  getExpandedRowModel, 
  ColumnDef, 
  flexRender,
  Row
} from '@tanstack/react-table';
import { 
  ChevronRight, ChevronDown, Package, Hammer, Wrench, 
  Save, Camera, History, ArrowUpRight, ArrowDownRight,
  TrendingUp, CircleDollarSign, Table as TableIcon, Printer, X, ZoomIn, ZoomOut
} from 'lucide-react';

// --- Helper Types for the Grid ---
type GridItemType = 'rubro' | 'task';

interface GridRow {
  id: string;
  type: GridItemType;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  originalItem?: any; // Reference to original BudgetItem or Task
  subRows?: GridRow[]; // For hierarchical structure
}

// --- Component ---
export const BudgetGrid: React.FC = () => {
  const { 
    project, tasks, materials, rubros,
    updateBudgetItem, addTaskYield, updateMaterial, snapshots, createSnapshot,
    addTaskToolYield, updateTool, updateTask,
    // Indexes
    yieldsIndex, materialsMap, toolYieldsIndex, toolsMap,
    laborCategoriesMap, taskCrewYieldsIndex, crewsMap, taskLaborYieldsIndex
  } = useERP();

  const [expanded, setExpanded] = useState({});
  
  // PDF Preview State
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [printScale, setPrintScale] = useState(1);

  // 1. Data Transformation: Flat List -> Hierarchical (Rubro -> Task)
  const data = useMemo(() => {
    const groups: Record<string, GridRow[]> = {};
    
    // Initialize groups for all rubros to ensure order
    rubros.forEach(r => groups[r] = []);
    groups['Sin Categoría'] = [];

    project.items.forEach(item => {
      const task = tasks.find(t => t.id === item.taskId);
      if (!task) return;

      const analysis = calculateUnitPrice(task, yieldsIndex, materialsMap, toolYieldsIndex, toolsMap, taskCrewYieldsIndex, crewsMap, laborCategoriesMap, 9, taskLaborYieldsIndex);
      const category = task.category && rubros.includes(task.category) ? task.category : 'Sin Categoría';
      
      const gridRow: GridRow = {
        id: item.id,
        type: 'task',
        name: task.name,
        unit: task.unit,
        quantity: item.quantity,
        unitPrice: analysis.totalUnitCost,
        totalPrice: analysis.totalUnitCost * item.quantity,
        originalItem: { ...item, taskData: task },
      };

      if (!groups[category]) groups[category] = [];
      groups[category].push(gridRow);
    });

    // Flatten to: Rubro Header -> Task Rows
    // In TanStack Table, we can use subRows for true tree structure.
    const result: GridRow[] = [];
    Object.keys(groups).forEach(rubro => {
      if (groups[rubro].length > 0) {
        const rubroTotal = groups[rubro].reduce((sum, row) => sum + row.totalPrice, 0);
        result.push({
          id: `RUBRO_${rubro}`,
          type: 'rubro',
          name: rubro,
          unit: '-',
          quantity: 0,
          unitPrice: 0,
          totalPrice: rubroTotal,
          subRows: groups[rubro]
        });
      }
    });

    return result;
  }, [project.items, tasks, yieldsIndex, materialsMap, toolYieldsIndex, toolsMap, rubros, taskCrewYieldsIndex, crewsMap, laborCategoriesMap]);

  // 2. Total Project Cost Calculation
  const totalProjectCost = useMemo(() => 
    data.reduce((acc, curr) => acc + curr.totalPrice, 0), 
  [data]);

  // 3. Columns Definition
  const columns = useMemo<ColumnDef<GridRow>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Descripción / Ítem',
      cell: ({ row, getValue }) => {
        const isRubro = row.original.type === 'rubro';
        return (
          <div 
            className={`flex items-center gap-2 ${isRubro ? 'pl-2' : 'pl-8'}`}
            style={{ paddingLeft: `${row.depth * 20}px` }}
          >
            {row.getCanExpand() && (
              <button
                onClick={row.getToggleExpandedHandler()}
                className="p-1 rounded hover:bg-slate-200 text-slate-500 transition-colors"
              >
                {row.getIsExpanded() ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
            )}
            <span className={isRubro ? 'font-bold text-slate-800 uppercase text-xs tracking-wider' : 'font-medium text-slate-700 text-sm'}>
              {getValue() as string}
            </span>
            {!isRubro && row.original.type === 'task' && (
                <span className="text-[10px] bg-slate-100 text-slate-400 px-1.5 rounded border border-slate-200">
                    {row.original.originalItem.taskData.code || row.original.originalItem.taskData.id.substring(0,4)}
                </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'unit',
      header: 'Unidad',
      cell: ({ row, getValue }) => (
        <span className="text-xs text-slate-500 font-medium">
            {row.original.type === 'rubro' ? '' : getValue() as string}
        </span>
      ),
      size: 80,
    },
    {
      accessorKey: 'quantity',
      header: 'Cantidad',
      cell: ({ row, getValue }) => {
        if (row.original.type === 'rubro') return null;
        
        // Inline Editing for Quantity
        return (
          <input
            type="number"
            className="w-20 text-right p-1.5 border border-slate-200 rounded bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm font-medium transition-all hover:border-slate-300"
            value={getValue() as number}
            onChange={(e) => {
               const val = parseFloat(e.target.value);
               if (!isNaN(val)) updateBudgetItem(row.original.id, { quantity: val });
            }}
          />
        );
      },
      size: 100,
    },
    {
      accessorKey: 'unitPrice',
      header: 'Precio Unitario',
      cell: ({ row, getValue }) => {
         if (row.original.type === 'rubro') return null;
         return (
             <span className="font-mono text-slate-600 text-sm">
                 ${(getValue() as number).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
             </span>
         );
      },
      size: 120,
    },
    {
      accessorKey: 'totalPrice',
      header: 'Subtotal',
      cell: ({ row, getValue }) => (
        <span className={`font-mono font-bold text-sm ${row.original.type === 'rubro' ? 'text-slate-800' : 'text-blue-600'}`}>
          ${(getValue() as number).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      ),
      size: 120,
    },
    {
      id: 'incidence',
      header: '% Inc.',
      cell: ({ row }) => {
        const val = row.original.totalPrice;
        const percent = totalProjectCost > 0 ? (val / totalProjectCost) * 100 : 0;
        return (
            <span className="text-xs text-slate-500 font-medium">
                {percent.toFixed(2)}%
            </span>
        );
      },
      size: 80,
    },
  ], [updateBudgetItem, totalProjectCost]);

  const table = useReactTable<GridRow>({
    data,
    columns,
    state: { expanded },
    onExpandedChange: setExpanded,
    getSubRows: (row) => row.subRows,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  // --- Snapshot Logic ---
  const handleSnapshot = () => {
      const name = prompt("Nombre para la línea base (Snapshot):", `Linea Base ${snapshots.length + 1}`);
      if (name) {
          createSnapshot(name, totalProjectCost);
      }
  };

  const lastSnapshot = snapshots.length > 0 ? snapshots[0] : null;
  const deviation = lastSnapshot ? totalProjectCost - lastSnapshot.totalCost : 0;

  // --- Sub-Component: Resource Editor (The "Details" View) ---
  const renderResourceEditor = (row: Row<GridRow>) => {
      if (row.original.type !== 'task') return null;

      const task = row.original.originalItem.taskData;
      const taskId = task.id;

      // Get current resources linked to this task
      const taskMats = (yieldsIndex[taskId] || []).map(y => ({ ...y, detail: materialsMap[y.materialId] }));
      const taskTools = (toolYieldsIndex[taskId] || []).map(y => ({ ...y, detail: toolsMap[y.toolId] }));

      return (
          <div className="bg-slate-50 p-6 border-b border-slate-200 animate-in slide-in-from-top-2 duration-200 shadow-inner">
             <div className="flex items-center gap-2 mb-4">
                <Wrench size={16} className="text-slate-400" />
                <h4 className="text-xs font-bold uppercase text-slate-500 tracking-widest">Análisis de Recursos (APU) - {task.name}</h4>
             </div>
             
             <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto shadow-sm max-w-4xl">
                 <table className="w-full text-sm text-left">
                     <thead className="bg-slate-100 text-xs text-slate-500 font-semibold uppercase">
                         <tr>
                             <th className="p-3 pl-4">Recurso</th>
                             <th className="p-3">Categoría</th>
                             <th className="p-3 text-right">Rendimiento (Consumo)</th>
                             <th className="p-3 text-right">Costo Unit. (Base)</th>
                             <th className="p-3 text-right">Incidencia</th>
                         </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100">
                         {/* Mano de Obra (Native Task prop) */}
                         <tr className="hover:bg-slate-50 group">
                             <td className="p-3 pl-4 flex items-center gap-2">
                                 <div className="p-1 bg-emerald-100 text-emerald-600 rounded"><Hammer size={14}/></div>
                                 <span className="font-medium text-slate-700">Mano de Obra Directa</span>
                             </td>
                             <td className="p-3 text-slate-500 text-xs">Labor</td>
                             <td className="p-3 text-right">
                                 {/* Yield Editing (Update Task) */}
                                 <div className="flex items-center justify-end gap-1">
                                    <input 
                                        type="number" 
                                        className="w-16 text-right p-1 border border-transparent hover:border-slate-300 focus:border-blue-500 rounded bg-transparent focus:bg-white focus:ring-0 transition-all font-medium text-slate-700"
                                        value={task.dailyYield}
                                        onChange={(e) => updateTask(taskId, { dailyYield: parseFloat(e.target.value) })}
                                    />
                                    <span className="text-xs text-slate-400">u/día</span>
                                 </div>
                             </td>
                             <td className="p-3 text-right">
                                  {/* Cost Editing (Update Task) */}
                                  <div className="flex items-center justify-end gap-1">
                                    <span className="text-xs text-slate-400">$</span>
                                    <input 
                                        type="number" 
                                        className="w-20 text-right p-1 border border-transparent hover:border-slate-300 focus:border-blue-500 rounded bg-transparent focus:bg-white focus:ring-0 transition-all font-mono text-slate-600"
                                        value={task.laborCost}
                                        onChange={(e) => updateTask(taskId, { laborCost: parseFloat(e.target.value) })}
                                    />
                                 </div>
                             </td>
                             <td className="p-3 text-right font-mono font-bold text-slate-800">
                                 ${(task.laborCost || 0).toFixed(2)}
                             </td>
                         </tr>

                         {/* Materials */}
                         {taskMats.map((m) => (
                             <tr key={m.materialId} className="hover:bg-slate-50 group">
                                 <td className="p-3 pl-4 flex items-center gap-2">
                                     <div className="p-1 bg-blue-100 text-blue-600 rounded"><Package size={14}/></div>
                                     <span className="font-medium text-slate-700">{m.detail?.name}</span>
                                 </td>
                                 <td className="p-3 text-slate-500 text-xs">Material</td>
                                 <td className="p-3 text-right">
                                    {/* Yield Editing */}
                                    <div className="flex items-center justify-end gap-1">
                                        <input 
                                            type="number" 
                                            className="w-16 text-right p-1 border border-transparent hover:border-slate-300 focus:border-blue-500 rounded bg-transparent focus:bg-white focus:ring-0 transition-all font-medium text-slate-700"
                                            value={m.quantity}
                                            onChange={(e) => addTaskYield({ taskId, materialId: m.materialId, quantity: parseFloat(e.target.value) })}
                                        />
                                        <span className="text-xs text-slate-400">{m.detail?.unit}</span>
                                    </div>
                                 </td>
                                 <td className="p-3 text-right">
                                    {/* Price Editing (Updates MASTER material price) */}
                                    <div className="flex items-center justify-end gap-1">
                                        <span className="text-xs text-slate-400">$</span>
                                        <input 
                                            type="number" 
                                            className="w-20 text-right p-1 border border-transparent hover:border-slate-300 focus:border-blue-500 rounded bg-transparent focus:bg-white focus:ring-0 transition-all font-mono text-slate-600"
                                            value={m.detail?.cost}
                                            onChange={(e) => m.detail && updateMaterial(m.detail.id, { cost: parseFloat(e.target.value) })}
                                        />
                                    </div>
                                 </td>
                                 <td className="p-3 text-right font-mono font-bold text-slate-800">
                                     ${((m.detail?.cost || 0) * m.quantity).toFixed(2)}
                                 </td>
                             </tr>
                         ))}

                         {/* Tools */}
                         {taskTools.map((t) => (
                             <tr key={t.toolId} className="hover:bg-slate-50 group">
                                 <td className="p-3 pl-4 flex items-center gap-2">
                                     <div className="p-1 bg-purple-100 text-purple-600 rounded"><Wrench size={14}/></div>
                                     <span className="font-medium text-slate-700">{t.detail?.name}</span>
                                 </td>
                                 <td className="p-3 text-slate-500 text-xs">Equipo</td>
                                 <td className="p-3 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                        <input 
                                            type="number" 
                                            className="w-16 text-right p-1 border border-transparent hover:border-slate-300 focus:border-blue-500 rounded bg-transparent focus:bg-white focus:ring-0 transition-all font-medium text-slate-700"
                                            value={t.hoursPerUnit}
                                            onChange={(e) => addTaskToolYield({ taskId, toolId: t.toolId, hoursPerUnit: parseFloat(e.target.value) })}
                                        />
                                        <span className="text-xs text-slate-400">hs/u</span>
                                    </div>
                                 </td>
                                 <td className="p-3 text-right">
                                     <div className="flex items-center justify-end gap-1">
                                        <span className="text-xs text-slate-400">$</span>
                                        <input 
                                            type="number" 
                                            className="w-20 text-right p-1 border border-transparent hover:border-slate-300 focus:border-blue-500 rounded bg-transparent focus:bg-white focus:ring-0 transition-all font-mono text-slate-600"
                                            value={t.detail?.costPerHour}
                                            onChange={(e) => t.detail && updateTool(t.detail.id, { costPerHour: parseFloat(e.target.value) })}
                                        />
                                    </div>
                                 </td>
                                 <td className="p-3 text-right font-mono font-bold text-slate-800">
                                     ${((t.detail?.costPerHour || 0) * t.hoursPerUnit).toFixed(2)}
                                 </td>
                             </tr>
                         ))}
                     </tbody>
                 </table>
                 <div className="bg-slate-50 p-2 text-center border-t border-slate-200">
                     <p className="text-[10px] text-slate-400 italic">
                         Nota: La edición de precios base actualiza el catálogo global. La edición de consumo solo afecta a esta tarea.
                     </p>
                 </div>
             </div>
          </div>
      );
  };

  return (
    <div className="space-y-6">
      
      {/* CSS Injection for PDF Print */}
      <style>{`
        @media print {
          @page { margin: 0.5cm; size: A4 landscape; }
          body > *:not(#pdf-portal) { display: none !important; }
          #pdf-portal { display: block !important; position: absolute; top: 0; left: 0; width: 100%; z-index: 9999; }
          #pdf-content { width: 100% !important; transform: none !important; box-shadow: none !important; border: none !important; margin: 0 !important; padding: 0 !important; }
          .no-print { display: none !important; }
          .print-break-inside-avoid { break-inside: avoid; }
        }
      `}</style>

      {/* Header Panel */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
         <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <TableIcon className="text-blue-600" /> Presupuesto Jerárquico
            </h2>
            <p className="text-sm text-slate-500">Edición en grilla con desglose de recursos y análisis de desvíos.</p>
         </div>
         
         {/* KPI & Actions */}
         <div className="flex items-center gap-2">
             <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-lg border border-slate-200 mr-2">
                 <div className="px-4 border-r border-slate-200">
                     <p className="text-[10px] uppercase font-bold text-slate-400">Total Presupuesto</p>
                     <p className="text-xl font-mono font-bold text-slate-800">${totalProjectCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                 </div>
                 
                 {lastSnapshot && (
                     <div className="px-4">
                        <p className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">Vs. {lastSnapshot.name}</p>
                        <div className={`flex items-center gap-1 font-bold font-mono text-sm ${deviation > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                            {deviation > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                            ${Math.abs(deviation).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                     </div>
                 )}
             </div>

             <button 
                onClick={handleSnapshot}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white hover:bg-black rounded-lg text-sm font-bold transition-all shadow-md"
                title="Guardar estado actual como Línea Base"
             >
                 <Camera size={16} /> Snapshot
             </button>
             
             <button 
                onClick={() => setShowPdfPreview(true)}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg text-sm font-bold transition-all shadow-md"
                title="Exportar PDF Detallado"
             >
                 <Printer size={16} /> Exportar PDF
             </button>
         </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-x-auto">
         <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-semibold">
               {table.getHeaderGroups().map(headerGroup => (
                  <tr key={headerGroup.id}>
                     {headerGroup.headers.map(header => (
                        <th key={header.id} className="p-4 border-b border-slate-200">
                           {flexRender(header.column.columnDef.header, header.getContext())}
                        </th>
                     ))}
                  </tr>
               ))}
            </thead>
            <tbody className="divide-y divide-slate-100">
               {table.getRowModel().rows.map(row => (
                  <Fragment key={row.id}>
                      <tr className={`hover:bg-blue-50/50 transition-colors ${row.original.type === 'rubro' ? 'bg-slate-50/50' : ''}`}>
                         {row.getVisibleCells().map(cell => (
                            <td key={cell.id} className="p-2 border-r border-transparent last:border-0">
                               {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                         ))}
                      </tr>
                      {/* Expanded Row Content */}
                      {row.getIsExpanded() && row.original.type === 'task' && (
                          <tr>
                              <td colSpan={columns.length} className="p-0">
                                  {renderResourceEditor(row)}
                              </td>
                          </tr>
                      )}
                  </Fragment>
               ))}
            </tbody>
            {/* Footer Summary */}
            <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                <tr>
                    <td className="p-4 font-bold text-slate-800 uppercase text-xs" colSpan={4}>Total General</td>
                    <td className="p-4 font-mono font-bold text-blue-600 text-lg">
                        ${totalProjectCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                </tr>
            </tfoot>
         </table>
      </div>

      {/* Snapshot History (Optional) */}
      {snapshots.length > 0 && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
             <h3 className="text-sm font-bold text-slate-500 uppercase flex items-center gap-2 mb-4">
                 <History size={16} /> Historial de Líneas Base
             </h3>
             <div className="flex gap-4 overflow-x-auto pb-2">
                 {snapshots.map(snap => (
                     <div key={snap.id} className="min-w-[200px] p-4 bg-slate-50 rounded-lg border border-slate-200 text-sm">
                         <div className="font-bold text-slate-800">{snap.name}</div>
                         <div className="text-xs text-slate-500 mb-2">{new Date(snap.date).toLocaleDateString()}</div>
                         <div className="font-mono font-bold text-slate-600">${snap.totalCost.toLocaleString()}</div>
                     </div>
                 ))}
             </div>
          </div>
      )}

      {/* --- PDF PREVIEW MODAL --- */}
      {showPdfPreview && (
          <div id="bg-print-modal" className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex flex-col animate-in fade-in duration-200">
             <style>{`@media print{@page{size:A4 landscape;margin:0;}#bg-print-modal{background-color:white!important;backdrop-filter:none!important;display:block!important;}#bg-print-toolbar{display:none!important;}#bg-print-scroll{display:block!important;overflow:visible!important;background-color:transparent!important;padding:0!important;}#pdf-portal{transform:none!important;box-shadow:none!important;width:297mm!important;min-height:auto!important;padding:10mm!important;margin:0 auto!important;}}`}</style>

             {/* Toolbar */}
             <div id="bg-print-toolbar" className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0">
                <div className="flex items-center gap-4">
                   <h3 className="font-bold text-slate-800 flex items-center gap-2"><Printer size={20} className="text-red-600" /> Exportar Presupuesto</h3>
                   <div className="h-6 w-px bg-slate-200 mx-2"></div>
                   
                   <div className="flex bg-slate-100 rounded-lg p-1 gap-1">
                      <button onClick={() => setPrintScale(s => Math.max(0.5, s - 0.1))} className="p-1.5 hover:bg-white rounded shadow-sm text-slate-600"><ZoomOut size={16}/></button>
                      <span className="text-xs font-mono font-bold w-12 flex items-center justify-center text-slate-500">{Math.round(printScale * 100)}%</span>
                      <button onClick={() => setPrintScale(s => Math.min(2, s + 0.1))} className="p-1.5 hover:bg-white rounded shadow-sm text-slate-600"><ZoomIn size={16}/></button>
                   </div>
                </div>

                <div className="flex items-center gap-4">
                    <button 
                       onClick={() => window.print()}
                       className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all"
                    >
                       <Printer size={18} /> Imprimir / Guardar PDF
                    </button>
                    <button onClick={() => setShowPdfPreview(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500"><X size={24}/></button>
                </div>
             </div>

             {/* Preview Area (Simulating the PDF Layout) */}
             <div id="bg-print-scroll" className="flex-1 overflow-auto bg-slate-500/10 p-8 flex justify-center items-start">
                <div 
                   id="pdf-portal"
                   className="bg-white shadow-2xl transition-transform origin-top duration-200"
                   style={{ 
                      width: '297mm', // A4 Landscape
                      minHeight: '210mm', 
                      padding: '10mm',
                      transform: `scale(${printScale})`
                   }}
                >
                    <div id="pdf-content" className="font-sans text-slate-900 text-xs">
                        
                        {/* Title */}
                        <div className="mb-4 border-b-2 border-black pb-2 flex justify-between items-end">
                            <div>
                                <h1 className="text-2xl font-black uppercase tracking-tight">Presupuesto de Obra</h1>
                                <p className="font-bold text-sm uppercase">{project.name}</p>
                            </div>
                            <div className="text-right">
                                <p>Fecha: {new Date().toLocaleDateString()}</p>
                                <p className="text-[10px]">{project.companyName}</p>
                            </div>
                        </div>

                        {/* TABLE STRUCTURE MATCHING THE PDF IMAGE */}
                        <table className="w-full border-collapse border border-black text-[10px]">
                            <thead>
                                <tr className="bg-gray-100 text-center font-bold">
                                    <th className="border border-black p-1 w-10">Rubro</th>
                                    <th className="border border-black p-1 w-10">Item</th>
                                    <th className="border border-black p-1 text-left">Descripción</th>
                                    <th className="border border-black p-1 w-8">Und</th>
                                    <th className="border border-black p-1 w-12">Cant.</th>
                                    
                                    {/* Materiales Header */}
                                    <th className="border border-black p-1 w-20">
                                        Precio<br/>Unitario
                                    </th>
                                    <th className="border border-black p-1 w-24">
                                        Precio<br/>Item
                                    </th>
                                    
                                    {/* Mano de Obra Header */}
                                    <th className="border border-black p-1 w-20">
                                        Mano de Obra<br/>Unitario
                                    </th>
                                    <th className="border border-black p-1 w-24">
                                        Mano de Obra<br/>Item
                                    </th>
                                    
                                    <th className="border border-black p-1 w-24">TOTAL</th>
                                    <th className="border border-black p-1 w-8">%</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(() => {
                                    // Logic to render rows similar to the PDF logic
                                    const rows = [];
                                    
                                    // Iterate groups from data logic (reusing useMemo logic but flat)
                                    let globalTotal = 0;
                                    let globalLabor = 0;
                                    let globalMat = 0;

                                    data.forEach((group) => {
                                        if (group.type === 'rubro') {
                                            // Render Header Row
                                            rows.push(
                                                <tr key={group.id} className="bg-gray-50 break-inside-avoid">
                                                    <td className="border border-black p-1 font-bold" colSpan={11}>
                                                        {group.name}
                                                    </td>
                                                </tr>
                                            );

                                            // Render Children
                                            if (group.subRows) {
                                                group.subRows.forEach((item, idx) => {
                                                    const taskData = item.originalItem.taskData;
                                                    const analysis = calculateUnitPrice(taskData, yieldsIndex, materialsMap, toolYieldsIndex, toolsMap, taskCrewYieldsIndex, crewsMap, laborCategoriesMap);
                                                    
                                                    const laborUnit = analysis.laborCost;
                                                    const nonLaborUnit = analysis.materialCost + analysis.toolCost + analysis.fixedCost;
                                                    
                                                    const laborTotal = laborUnit * item.quantity;
                                                    const nonLaborTotal = nonLaborUnit * item.quantity;
                                                    const itemTotal = laborTotal + nonLaborTotal;

                                                    globalTotal += itemTotal;
                                                    globalLabor += laborTotal;
                                                    globalMat += nonLaborTotal;

                                                    // Calculate % (of rubro or total? usually of total project or rubro. Let's use % of Project Total if available, or just placeholder)
                                                    const percent = totalProjectCost > 0 ? (itemTotal / totalProjectCost) * 100 : 0;

                                                    rows.push(
                                                        <tr key={item.id} className="break-inside-avoid">
                                                            <td className="border border-black p-1 text-center"></td>
                                                            <td className="border border-black p-1 text-center font-mono text-[9px]">
                                                                {taskData.code || idx + 1}
                                                            </td>
                                                            <td className="border border-black p-1">{item.name}</td>
                                                            <td className="border border-black p-1 text-center">{item.unit}</td>
                                                            <td className="border border-black p-1 text-right">{item.quantity}</td>
                                                            
                                                            {/* Mat/Eq */}
                                                            <td className="border border-black p-1 text-right">{nonLaborUnit.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                                            <td className="border border-black p-1 text-right">{nonLaborTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                                            
                                                            {/* Labor */}
                                                            <td className="border border-black p-1 text-right">{laborUnit.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                                            <td className="border border-black p-1 text-right">{laborTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                                            
                                                            <td className="border border-black p-1 text-right font-bold">{itemTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                                            <td className="border border-black p-1 text-right text-[9px]">{percent.toFixed(2)}</td>
                                                        </tr>
                                                    );
                                                });
                                                
                                                // Rubro Subtotal
                                                rows.push(
                                                    <tr key={`${group.id}_subtotal`} className="bg-gray-100 font-bold break-inside-avoid">
                                                        <td className="border border-black p-1 text-right" colSpan={5}>Subtotal {group.name}</td>
                                                        <td className="border border-black p-1 bg-gray-200"></td>
                                                        <td className="border border-black p-1 text-right">
                                                            {group.subRows.reduce((acc, r) => {
                                                                const t = r.originalItem.taskData;
                                                                const a = calculateUnitPrice(t, yieldsIndex, materialsMap, toolYieldsIndex, toolsMap, taskCrewYieldsIndex, crewsMap, laborCategoriesMap);
                                                                return acc + ((a.materialCost + a.toolCost + a.fixedCost) * r.quantity);
                                                            }, 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
                                                        </td>
                                                        <td className="border border-black p-1 bg-gray-200"></td>
                                                        <td className="border border-black p-1 text-right">
                                                            {group.subRows.reduce((acc, r) => {
                                                                const t = r.originalItem.taskData;
                                                                const a = calculateUnitPrice(t, yieldsIndex, materialsMap, toolYieldsIndex, toolsMap, taskCrewYieldsIndex, crewsMap, laborCategoriesMap);
                                                                return acc + (a.laborCost * r.quantity);
                                                            }, 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
                                                        </td>
                                                        <td className="border border-black p-1 text-right">{group.totalPrice.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                                        <td className="border border-black p-1"></td>
                                                    </tr>
                                                )
                                            }
                                        }
                                    });

                                    // Grand Total Row
                                    rows.push(
                                        <tr key="GRAND_TOTAL" className="bg-slate-800 text-white font-bold text-xs break-inside-avoid">
                                            <td className="border border-black p-2 text-right uppercase" colSpan={6}>Totales Generales</td>
                                            <td className="border border-black p-2 text-right">{globalMat.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                            <td className="border border-black p-2 text-right"></td>
                                            <td className="border border-black p-2 text-right">{globalLabor.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                            <td className="border border-black p-2 text-right">{globalTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                            <td className="border border-black p-2">100%</td>
                                        </tr>
                                    );

                                    return rows;
                                })()}
                            </tbody>
                        </table>

                        <div className="mt-4 text-[10px] text-gray-500">
                            * Valores expresados en {project.currency}. Precios incluyen Costos Directos e Indirectos prorrateados en los precios unitarios si aplica.
                        </div>
                    </div>
                </div>
             </div>
          </div>
      )}

    </div>
  );
};