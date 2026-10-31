import React, { useState, useMemo, useRef } from 'react';
import { useERP } from '../context/ERPContext';
import { generateId } from '../utils/generateId';
import { 
  Truck, Camera, Search, Plus, CheckCircle, AlertTriangle, 
  Package, ChevronRight, X, Image as ImageIcon, ClipboardList, 
  ArrowLeft, LayoutGrid, List, Eye, Trash2, Calendar, User,
  FileText
} from 'lucide-react';
import { Reception, ReceptionItem, Material } from '../types';
import { FilePreviewModal } from './FilePreviewModal';

export const MaterialReception: React.FC = () => {
  const { project, getProjectStockStatus, addReception, receptions, materials } = useERP();
  
  // View State
  const [mode, setMode] = useState<'browse' | 'create'>('browse');
  const [viewType, setViewType] = useState<'grid' | 'list'>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Form State
  const [remitoNumber, setRemitoNumber] = useState('');
  const [provider, setProvider] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<ReceptionItem[]>([]);
  const [stockStatus, setStockStatus] = useState<any[]>([]);
  
  // Material Picker State
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update stock status when entering create mode
  const handleStartCreate = () => {
      setStockStatus(getProjectStockStatus());
      setMode('create');
  };

  const handleCapturePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
            setPhoto(reader.result as string);
        };
        reader.readAsDataURL(file);
    }
  };

  const handleAddItem = (material: Material, quantity: number) => {
     if (selectedItems.find(i => i.materialId === material.id)) return;
     
     setSelectedItems(prev => [...prev, {
         materialId: material.id,
         quantityDeclared: quantity,
         quantityReceived: quantity
     }]);
     setIsPickerOpen(false);
  };

  const updateItemQty = (idx: number, field: 'quantityDeclared' | 'quantityReceived', val: number) => {
      const newItems = [...selectedItems];
      newItems[idx] = { ...newItems[idx], [field]: val };
      setSelectedItems(newItems);
  };

  const removeItem = (idx: number) => {
      setSelectedItems(prev => prev.filter((_, i) => i !== idx));
  };

  const confirmReception = () => {
      if (!remitoNumber || selectedItems.length === 0) {
          alert("Debe ingresar número de remito y al menos un material.");
          return;
      }

      const newReception: Reception = {
          id: generateId(),
          organizationId: 'org_a',
          date: new Date().toISOString(),
          projectId: project.id,
          remitoNumber,
          provider,
          photoUrl: photo || undefined,
          items: selectedItems,
          status: 'confirmed'
      };

      addReception(newReception);
      
      // Reset & Exit
      setRemitoNumber('');
      setProvider('');
      setPhoto(null);
      setSelectedItems([]);
      setMode('browse');
  };

  // Filtered Receptions
  const filteredReceptions = receptions.filter(r => 
      r.remitoNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.provider && r.provider.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // --- Sub-Components ---
  
  const MaterialPicker = () => {
      const filteredMaterials = stockStatus.filter(s => 
          s.material.name.toLowerCase().includes(pickerSearch.toLowerCase())
      );

      return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
                  <div className="p-4 border-b border-slate-200 flex items-center gap-3">
                      <input 
                        autoFocus
                        placeholder="Buscar material..." 
                        className="flex-1 text-lg outline-none"
                        value={pickerSearch}
                        onChange={e => setPickerSearch(e.target.value)}
                      />
                      <button onClick={() => setIsPickerOpen(false)}><X size={24} className="text-slate-500 hover:text-slate-800"/></button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2">
                      <h4 className="text-xs font-bold text-slate-400 uppercase m-2">Materiales Pendientes</h4>
                      {filteredMaterials.filter(s => s.pending > 0).map(s => (
                          <div key={s.material.id} onClick={() => handleAddItem(s.material, s.pending)} 
                               className="p-4 border-b border-slate-100 hover:bg-slate-50 flex justify-between items-center cursor-pointer transition-colors">
                              <div>
                                  <div className="font-bold text-slate-800">{s.material.name}</div>
                                  <div className="text-xs text-slate-500">Pendiente: {s.pending.toFixed(2)} {s.material.unit}</div>
                              </div>
                              <Plus className="text-blue-600" />
                          </div>
                      ))}
                      
                      <h4 className="text-xs font-bold text-slate-400 uppercase m-2 mt-6">Todos los Materiales</h4>
                      {filteredMaterials.filter(s => s.pending <= 0).map(s => (
                          <div key={s.material.id} onClick={() => handleAddItem(s.material, 1)} 
                               className="p-4 border-b border-slate-100 hover:bg-slate-50 flex justify-between items-center cursor-pointer transition-colors">
                              <div>
                                  <div className="font-bold text-slate-800">{s.material.name}</div>
                                  <div className="text-xs text-slate-500">{s.material.unit}</div>
                              </div>
                              <Plus className="text-slate-300" />
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      )
  };

  if (mode === 'create') {
      return (
          <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-in slide-in-from-right">
              {/* Header */}
              <div className="p-4 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
                  <button onClick={() => setMode('browse')} className="p-2 -ml-2 text-slate-500 hover:bg-slate-200 rounded-full transition-colors"><ArrowLeft /></button>
                  <h2 className="font-bold text-lg text-slate-800">Nuevo Ingreso de Materiales</h2>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                  <div className="max-w-3xl mx-auto space-y-8">
                      {/* General Info */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nro. de Remito</label>
                              <input 
                                  type="text" 
                                  className="w-full text-lg p-3 border border-slate-300 rounded-lg focus:border-blue-500 outline-none transition-all"
                                  placeholder="0001-00001234"
                                  value={remitoNumber}
                                  onChange={e => setRemitoNumber(e.target.value)}
                              />
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Proveedor (Opcional)</label>
                              <input 
                                  type="text" 
                                  className="w-full p-3 border border-slate-300 rounded-lg focus:border-blue-500 outline-none transition-all"
                                  placeholder="Corralón..."
                                  value={provider}
                                  onChange={e => setProvider(e.target.value)}
                              />
                          </div>
                      </div>

                      {/* Photo Upload */}
                      <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Foto del Comprobante</label>
                          <div 
                              onClick={() => fileInputRef.current?.click()}
                              className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${photo ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'}`}
                          >
                              {photo ? (
                                  <>
                                      <img src={photo} className="max-h-64 rounded-lg shadow-sm" />
                                      <span className="text-xs font-bold text-emerald-600 flex items-center gap-1"><CheckCircle size={12}/> Foto Cargada</span>
                                  </>
                              ) : (
                                  <>
                                      <div className="bg-slate-100 p-4 rounded-full text-slate-400">
                                          <Camera size={32} />
                                      </div>
                                      <span className="text-sm font-medium text-slate-500">Haga clic para tomar una foto o subir archivo</span>
                                  </>
                              )}
                              <input 
                                  type="file" 
                                  accept="image/*" 
                                  capture="environment" 
                                  className="hidden" 
                                  ref={fileInputRef}
                                  onChange={handleCapturePhoto}
                              />
                          </div>
                      </div>

                      {/* Items List */}
                      <div>
                          <div className="flex justify-between items-center mb-4">
                               <label className="block text-xs font-bold text-slate-500 uppercase">Materiales Recibidos</label>
                               <button onClick={() => setIsPickerOpen(true)} className="text-sm font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"><Plus size={16}/> Agregar Ítem</button>
                          </div>
                          
                          <div className="space-y-3">
                              {selectedItems.length === 0 && (
                                  <div className="p-8 bg-slate-50 border border-slate-100 rounded-xl text-center text-slate-400 italic">
                                      No hay materiales seleccionados. Agregue los ítems que figuran en el remito.
                                  </div>
                              )}
                              {selectedItems.map((item, idx) => {
                                  const matInfo = materials.find(m => m.id === item.materialId);
                                  const stockInfo = stockStatus.find(s => s.material.id === item.materialId);
                                  const isDiscrepancy = item.quantityReceived > (stockInfo?.pending || 0) + (stockInfo?.budgeted ? stockInfo.budgeted * 0.1 : 9999);

                                  return (
                                      <div key={idx} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm relative hover:shadow-md transition-shadow">
                                          <button onClick={() => removeItem(idx)} className="absolute top-3 right-3 text-slate-300 hover:text-red-500 transition-colors"><X size={18}/></button>
                                          
                                          <div className="flex items-start gap-4">
                                              <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                                                  <Package size={20} />
                                              </div>
                                              <div className="flex-1">
                                                  <div className="font-bold text-slate-800 text-lg mb-1">{matInfo?.name}</div>
                                                  <div className="text-xs text-slate-500 mb-4 flex gap-2">
                                                      <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">Pendiente: {stockInfo?.pending.toFixed(2)} {matInfo?.unit}</span>
                                                  </div>

                                                  <div className="flex items-center gap-4">
                                                      <div className="w-32">
                                                          <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Cant. Recibida</label>
                                                          <div className="relative">
                                                              <input 
                                                                  type="number" 
                                                                  className={`w-full p-2 pr-8 border rounded font-bold text-lg outline-none transition-colors ${isDiscrepancy ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-300 focus:border-blue-500'}`}
                                                                  value={item.quantityReceived}
                                                                  onChange={e => updateItemQty(idx, 'quantityReceived', parseFloat(e.target.value))}
                                                              />
                                                              <span className="absolute right-2 top-3 text-xs text-slate-400 font-bold">{matInfo?.unit}</span>
                                                          </div>
                                                      </div>
                                                  </div>
                                                  {isDiscrepancy && (
                                                      <div className="mt-3 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 p-2 rounded border border-amber-100">
                                                          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                                                          <span>Atención: La cantidad ingresada supera lo pendiente estimado para este material.</span>
                                                      </div>
                                                  )}
                                              </div>
                                          </div>
                                      </div>
                                  );
                              })}
                          </div>
                      </div>
                  </div>
              </div>

              <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
                  <button 
                      onClick={() => setMode('browse')}
                      className="px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors"
                  >
                      Cancelar
                  </button>
                  <button 
                      onClick={confirmReception}
                      disabled={selectedItems.length === 0 || !remitoNumber}
                      className="px-8 py-3 bg-slate-900 text-white rounded-xl font-bold shadow-lg hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                  >
                      <CheckCircle size={18} /> Confirmar Ingreso
                  </button>
              </div>

              {isPickerOpen && <MaterialPicker />}
          </div>
      );
  }

  return (
    <div className="space-y-6">
        {/* Header */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex justify-between items-center">
            <div>
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <Truck className="text-blue-600" /> Recepción de Materiales
                </h2>
                <p className="text-sm text-slate-500">Gestión de remitos, ingresos y control de stock en obra.</p>
            </div>
            <button 
                onClick={handleStartCreate}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold shadow-lg flex items-center gap-2 transition-transform active:scale-95"
            >
                <Plus size={18} /> Nuevo Ingreso
            </button>
        </div>

        {/* Filters & View Toggle */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-200">
            <div className="relative flex-1 w-full md:max-w-md">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                <input 
                    type="text" 
                    placeholder="Buscar por remito o proveedor..." 
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:outline-blue-500 transition-all"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="flex bg-white p-1 rounded-lg border border-slate-200">
                <button 
                    onClick={() => setViewType('grid')} 
                    className={`p-2 rounded transition-colors ${viewType === 'grid' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    title="Vista Cuadrícula"
                >
                    <LayoutGrid size={18}/>
                </button>
                <button 
                    onClick={() => setViewType('list')} 
                    className={`p-2 rounded transition-colors ${viewType === 'list' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    title="Vista Lista"
                >
                    <List size={18}/>
                </button>
            </div>
        </div>

        {/* Content Area */}
        {filteredReceptions.length === 0 ? (
            <div className="py-16 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <ClipboardList size={48} className="mx-auto mb-4 opacity-20" />
                <p className="font-medium">No se encontraron remitos.</p>
                <p className="text-sm opacity-70">Utilice el botón "Nuevo Ingreso" para cargar una recepción.</p>
            </div>
        ) : (
            <>
                {/* GRID VIEW */}
                {viewType === 'grid' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {filteredReceptions.map(rec => (
                            <div key={rec.id} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all group overflow-hidden flex flex-col">
                                {/* Thumbnail */}
                                <div 
                                    className="h-40 bg-slate-100 relative cursor-pointer group-hover:opacity-90 transition-opacity"
                                    onClick={() => rec.photoUrl && setPreviewUrl(rec.photoUrl)}
                                >
                                    {rec.photoUrl ? (
                                        <img src={rec.photoUrl} alt={`Remito ${rec.remitoNumber}`} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                                            <ImageIcon size={48} />
                                            <span className="text-xs font-medium mt-2">Sin Foto</span>
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                        {rec.photoUrl && <Eye className="text-white drop-shadow-md" size={32} />}
                                    </div>
                                </div>

                                {/* Content */}
                                <div className="p-4 flex-1 flex flex-col">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <h4 className="font-bold text-slate-800 text-lg">#{rec.remitoNumber}</h4>
                                            <p className="text-xs text-slate-500 font-medium">{rec.provider || 'Proveedor Desconocido'}</p>
                                        </div>
                                        <span className="bg-emerald-50 text-emerald-600 text-[10px] font-bold px-2 py-1 rounded-full uppercase border border-emerald-100">
                                            Confirmado
                                        </span>
                                    </div>

                                    <div className="space-y-2 mb-4 flex-1">
                                        <div className="flex items-center gap-2 text-xs text-slate-500">
                                            <Calendar size={14} />
                                            {new Date(rec.date).toLocaleDateString()}
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-slate-500">
                                            <Package size={14} />
                                            {rec.items.length} ítems recibidos
                                        </div>
                                    </div>

                                    <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                                        <span className="text-[10px] text-slate-400 uppercase font-bold">Acciones</span>
                                        <div className="flex gap-1">
                                            {rec.photoUrl && (
                                                <button onClick={() => setPreviewUrl(rec.photoUrl)} className="p-1.5 hover:bg-blue-50 text-blue-600 rounded transition-colors" title="Ver Comprobante">
                                                    <Eye size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* LIST VIEW */}
                {viewType === 'list' && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-bold">
                                <tr>
                                    <th className="p-4 w-16">Foto</th>
                                    <th className="p-4">Nro. Remito</th>
                                    <th className="p-4">Proveedor</th>
                                    <th className="p-4">Fecha</th>
                                    <th className="p-4 text-center">Ítems</th>
                                    <th className="p-4 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredReceptions.map(rec => (
                                    <tr key={rec.id} className="hover:bg-slate-50 group transition-colors">
                                        <td className="p-3">
                                            <div 
                                                className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden cursor-pointer border border-slate-200"
                                                onClick={() => rec.photoUrl && setPreviewUrl(rec.photoUrl)}
                                            >
                                                {rec.photoUrl ? (
                                                    <img src={rec.photoUrl} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon size={16}/></div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-4 font-bold text-slate-800">
                                            {rec.remitoNumber}
                                        </td>
                                        <td className="p-4 text-slate-600">
                                            {rec.provider || '-'}
                                        </td>
                                        <td className="p-4 text-slate-500 font-mono text-xs">
                                            {new Date(rec.date).toLocaleDateString()}
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold">
                                                {rec.items.length}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right">
                                            {rec.photoUrl && (
                                                <button onClick={() => setPreviewUrl(rec.photoUrl)} className="p-2 hover:bg-blue-50 text-blue-600 rounded transition-colors inline-flex" title="Ver Comprobante">
                                                    <Eye size={16} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </>
        )}

        {/* Preview Modal */}
        {previewUrl && (
            <FilePreviewModal 
                file={{
                    name: 'Comprobante de Remito',
                    url: previewUrl,
                    type: 'JPG' // Assuming photos are images
                }} 
                onClose={() => setPreviewUrl(null)} 
            />
        )}
    </div>
  );
};