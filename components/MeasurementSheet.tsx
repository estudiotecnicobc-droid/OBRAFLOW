import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useERP } from '../context/ERPContext';
import { useSave } from '../context/SaveContext';
import { generateId } from '../utils/generateId';
import { useAuth } from '../context/AuthContext';
import { 
  Ruler, Plus, Save, Trash2, CheckCircle2, RotateCcw, 
  ArrowUpRight, Calculator, FileText, Settings, X 
} from 'lucide-react';
import { MeasurementSheet, MeasurementLine, BudgetItem } from '../types';
import { useIsMobile } from '../hooks/useMediaQuery';

export const MeasurementSheetComponent: React.FC = () => {
  const { project, tasks, measurementSheets, saveMeasurementSheet, syncMeasurementToBudget, updateBudgetItem } = useERP();
  const { user } = useAuth();
  const { registerSave, unregisterSave } = useSave();

  const [selectedBudgetItemId, setSelectedBudgetItemId] = useState<string>('');
  const isMobile = useIsMobile();
  const [currentSheet, setCurrentSheet] = useState<MeasurementSheet | null>(null);
  
  // Find task associated with the selected budget item
  const selectedItem = useMemo(() => project.items.find(i => i.id === selectedBudgetItemId), [selectedBudgetItemId, project.items]);
  const selectedTask = useMemo(() => selectedItem ? tasks.find(t => t.id === selectedItem.taskId) : null, [selectedItem, tasks]);

  useEffect(() => {
      if (selectedBudgetItemId) {
          const existingSheet = measurementSheets.find(s => s.budgetItemId === selectedBudgetItemId);
          if (existingSheet) {
              setCurrentSheet(JSON.parse(JSON.stringify(existingSheet))); // Deep copy for editing
          } else {
              // Create new draft
              setCurrentSheet({
                  id: generateId(),
                  organizationId: user?.organizationId || 'org_a',
                  budgetItemId: selectedBudgetItemId,
                  lines: [],
                  totalQuantity: 0,
                  lastUpdated: new Date().toISOString(),
                  updatedBy: user?.name || 'User'
              });
          }
      } else {
          setCurrentSheet(null);
      }
  }, [selectedBudgetItemId, measurementSheets, user]);

  const calculateLineTotal = (line: MeasurementLine) => {
      // Formula: L x W x H x Count
      return Number((line.length * line.width * line.height * line.count).toFixed(2));
  };

  const handleAddLine = () => {
      if (!currentSheet) return;
      const newLine: MeasurementLine = {
          id: generateId(),
          description: '',
          length: 1,
          width: 1,
          height: 1,
          count: 1,
          subtotal: 1
      };
      setCurrentSheet({
          ...currentSheet,
          lines: [...currentSheet.lines, newLine]
      });
  };

  const updateLine = (id: string, field: keyof MeasurementLine, value: any) => {
      if (!currentSheet) return;
      const updatedLines = currentSheet.lines.map(l => {
          if (l.id === id) {
              const updated = { ...l, [field]: value };
              // Recalculate subtotal if dimensions changed, BUT NOT if editing subtotal directly
              if (field !== 'description' && field !== 'subtotal') {
                  updated.subtotal = calculateLineTotal(updated);
              }
              return updated;
          }
          return l;
      });
      
      const newTotal = updatedLines.reduce((acc, curr) => acc + curr.subtotal, 0);
      setCurrentSheet({ ...currentSheet, lines: updatedLines, totalQuantity: newTotal });
  };

  const removeLine = (id: string) => {
      if (!currentSheet) return;
      const updatedLines = currentSheet.lines.filter(l => l.id !== id);
      const newTotal = updatedLines.reduce((acc, curr) => acc + curr.subtotal, 0);
      setCurrentSheet({ ...currentSheet, lines: updatedLines, totalQuantity: newTotal });
  };

  const handleSave = () => {
      if (currentSheet) {
          const sheetToSave = {
              ...currentSheet,
              lastUpdated: new Date().toISOString(),
              updatedBy: user?.name || 'User'
          };
          saveMeasurementSheet(sheetToSave);

          // Optionally auto-sync to budget
          if (window.confirm(`¿Sincronizar el total (${sheetToSave.totalQuantity.toFixed(2)}) con el ítem del presupuesto?`)) {
              syncMeasurementToBudget(sheetToSave.id);
          }
      }
  };

  // Save sin confirm — para el botón global de Layout
  const saveCurrentSheet = useCallback(async () => {
      if (!currentSheet) return;
      saveMeasurementSheet({
          ...currentSheet,
          lastUpdated: new Date().toISOString(),
          updatedBy: user?.name || 'User',
      });
  }, [currentSheet, saveMeasurementSheet, user?.name]);

  useEffect(() => {
      if (currentSheet) {
          registerSave(saveCurrentSheet);
      } else {
          unregisterSave();
      }
      return () => unregisterSave();
  }, [currentSheet, saveCurrentSheet, registerSave, unregisterSave]);

  return (
    <div className="flex md:h-full gap-6 animate-in fade-in duration-500">
      
      {/* Sidebar: Item Selector */}
      <div className={`w-full md:w-80 flex-shrink-0 bg-white ${isMobile && selectedBudgetItemId ? 'hidden' : ''} border border-slate-200 rounded-xl flex flex-col overflow-hidden shadow-sm`}>
          <div className="p-4 bg-slate-50 border-b border-slate-200">
              <h3 className="font-bold text-slate-700 flex items-center gap-2">
                  <Ruler className="text-blue-600" size={18}/> Ítems de Obra
              </h3>
              <p className="text-xs text-slate-500 mt-1">Seleccione una tarea para computar</p>
          </div>
          <div className="flex-1 overflow-y-auto">
              {project.items.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full px-5 py-10 text-center">
                  <Ruler size={36} className="text-slate-200 mb-3" />
                  <p className="text-sm font-medium text-slate-500">Sin ítems en el presupuesto</p>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                    Usá el <span className="font-semibold text-blue-600">Calculador Chandías</span> para medir y generar ítems automáticamente.
                  </p>
                </div>
              )}
              {project.items.map((item) => {
                  const task = tasks.find(t => t.id === item.taskId);
                  const hasSheet = measurementSheets.some(s => s.budgetItemId === item.id);
                  const isActive = selectedBudgetItemId === item.id;

                  return (
                      <div 
                        key={item.id} 
                        onClick={() => setSelectedBudgetItemId(item.id)}
                        className={`p-3 border-b border-slate-100 cursor-pointer transition-colors hover:bg-slate-50 ${isActive ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}
                      >
                          <div className="text-sm font-medium text-slate-800">{task?.name}</div>
                          <div className="flex justify-between items-center mt-1">
                              <span className="text-xs text-slate-500 bg-slate-100 px-1.5 rounded">{task?.unit}</span>
                              {hasSheet && <FileText size={14} className="text-emerald-500" />}
                          </div>
                          {isActive && (
                              <div className="mt-2 text-xs font-mono text-blue-700 font-bold">
                                  Cant. Presupuesto: {item.quantity}
                              </div>
                          )}
                      </div>
                  );
              })}
          </div>
      </div>

      {/* Main Editor */}
      <div className={`flex-1 min-w-0 bg-white border border-slate-200 rounded-xl flex-col overflow-hidden shadow-sm ${isMobile && !selectedBudgetItemId ? 'hidden' : 'flex'}`}>
          {!selectedBudgetItemId ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                  <Calculator size={48} className="mb-4 opacity-50" />
                  <p>Seleccione un ítem para abrir su hoja de mediciones.</p>
              </div>
          ) : (
              <>
                  <div className="p-3 md:p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:justify-between md:items-center gap-3">
                      <div className="min-w-0">
                          {isMobile && (
                              <button onClick={() => setSelectedBudgetItemId('')} className="mb-2 text-xs font-bold text-blue-600 flex items-center gap-1">
                                  ← Ítems de obra
                              </button>
                          )}
                          <h2 className="font-bold text-base md:text-lg text-slate-800 flex items-center gap-2">
                              {selectedTask?.name} 
                              <span className="text-xs bg-white border px-2 py-0.5 rounded text-slate-500 font-normal">{selectedTask?.unit}</span>
                          </h2>
                          <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                              <span>ID: {selectedBudgetItemId.substring(0,8)}</span>
                              <span>Última mod: {currentSheet?.lastUpdated ? new Date(currentSheet.lastUpdated).toLocaleString() : 'N/A'} por {currentSheet?.updatedBy}</span>
                          </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                          <div className="bg-white px-3 py-1.5 rounded border border-slate-200 text-right md:mr-4">
                              <div className="text-[10px] uppercase font-bold text-slate-400">Total Cómputo</div>
                              <div className={`font-mono text-lg font-bold ${currentSheet && selectedItem && Math.abs(currentSheet.totalQuantity - selectedItem.quantity) > 0.01 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                  {currentSheet?.totalQuantity.toFixed(2)}
                              </div>
                          </div>
                          <button 
                            onClick={handleSave}
                            className="bg-slate-900 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-black flex items-center gap-2 shadow-md transition-transform active:scale-95"
                          >
                              <Save size={16} /> Guardar & Sincronizar
                          </button>
                      </div>
                  </div>

                  <div className="flex-1 overflow-auto p-0">
                      <table className="w-full text-left border-collapse">
                          <thead className="bg-slate-100 text-slate-500 text-xs uppercase font-semibold sticky top-0 z-10 shadow-sm">
                              <tr>
                                  <th className="p-3 pl-4 border-r border-slate-200">Descripción / Ubicación</th>
                                  <th className="p-3 text-center border-r border-slate-200 w-24">Largo (m)</th>
                                  <th className="p-3 text-center border-r border-slate-200 w-24">Ancho (m)</th>
                                  <th className="p-3 text-center border-r border-slate-200 w-24">Alto (m)</th>
                                  <th className="p-3 text-center border-r border-slate-200 w-20">Veces</th>
                                  <th className="p-3 text-right border-r border-slate-200 w-32 bg-slate-200/50">Subtotal</th>
                                  <th className="p-3 text-center w-12"></th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                              {currentSheet?.lines.map((line) => (
                                  <tr key={line.id} className="hover:bg-slate-50 group">
                                      <td className="p-2 border-r border-slate-100">
                                          <input 
                                            className="w-full p-1.5 bg-transparent focus:bg-white border border-transparent focus:border-blue-300 rounded outline-none text-sm font-medium"
                                            placeholder="Ej: Muro Eje 1-2"
                                            value={line.description}
                                            onChange={e => updateLine(line.id, 'description', e.target.value)}
                                          />
                                      </td>
                                      <td className="p-2 border-r border-slate-100">
                                          <input 
                                            type="number" 
                                            className="w-full text-center p-1.5 bg-transparent focus:bg-white border border-transparent focus:border-blue-300 rounded outline-none text-sm font-mono text-slate-600"
                                            value={line.length}
                                            onChange={e => updateLine(line.id, 'length', parseFloat(e.target.value))}
                                          />
                                      </td>
                                      <td className="p-2 border-r border-slate-100">
                                          <input 
                                            type="number" 
                                            className="w-full text-center p-1.5 bg-transparent focus:bg-white border border-transparent focus:border-blue-300 rounded outline-none text-sm font-mono text-slate-600"
                                            value={line.width}
                                            onChange={e => updateLine(line.id, 'width', parseFloat(e.target.value))}
                                          />
                                      </td>
                                      <td className="p-2 border-r border-slate-100">
                                          <input 
                                            type="number" 
                                            className="w-full text-center p-1.5 bg-transparent focus:bg-white border border-transparent focus:border-blue-300 rounded outline-none text-sm font-mono text-slate-600"
                                            value={line.height}
                                            onChange={e => updateLine(line.id, 'height', parseFloat(e.target.value))}
                                          />
                                      </td>
                                      <td className="p-2 border-r border-slate-100">
                                          <input 
                                            type="number" 
                                            className="w-full text-center p-1.5 bg-transparent focus:bg-white border border-transparent focus:border-blue-300 rounded outline-none text-sm font-bold text-slate-700"
                                            value={line.count}
                                            onChange={e => updateLine(line.id, 'count', parseFloat(e.target.value))}
                                          />
                                      </td>
                                      <td className="p-2 text-right border-r border-slate-100 bg-slate-50">
                                          <input 
                                            type="number"
                                            className="w-full text-right p-1.5 bg-transparent focus:bg-white border border-transparent focus:border-blue-300 rounded outline-none text-sm font-mono font-bold text-blue-700"
                                            value={line.subtotal}
                                            onChange={e => updateLine(line.id, 'subtotal', parseFloat(e.target.value))}
                                          />
                                      </td>
                                      <td className="p-2 text-center">
                                          <button 
                                            onClick={() => removeLine(line.id)}
                                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                                          >
                                              <Trash2 size={14} />
                                          </button>
                                      </td>
                                  </tr>
                              ))}
                              <tr>
                                  <td colSpan={7} className="p-2 bg-slate-50 border-t border-slate-200">
                                      <button 
                                        onClick={handleAddLine}
                                        className="w-full py-2 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 text-sm font-bold hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center gap-2"
                                      >
                                          <Plus size={16} /> Agregar Línea de Medición
                                      </button>
                                  </td>
                              </tr>
                          </tbody>
                      </table>
                  </div>
              </>
          )}
      </div>
    </div>
  );
};