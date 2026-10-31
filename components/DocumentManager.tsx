import React, { useState, useRef } from 'react';
import { useERP } from '../context/ERPContext';
import { generateId } from '../utils/generateId';
import { useAuth } from '../context/AuthContext';
import { 
  File, FileText, Image as ImageIcon, Box, MoreVertical, 
  Upload, Search, Filter, Download, Trash2, Eye,
  LayoutGrid, List, Grid
} from 'lucide-react';
import { ProjectDocument } from '../types';
import { FilePreviewModal } from './FilePreviewModal';
import { PdfThumbnail } from './PdfThumbnail';

export const DocumentManager: React.FC = () => {
  const { documents, addDocument, removeDocument, project } = useERP();
  const { user } = useAuth();
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [previewFile, setPreviewFile] = useState<ProjectDocument | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'icons'>('grid');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Determine Type and Format
      const typeMap: Record<string, any> = {
          'application/pdf': 'PDF',
          'image/jpeg': 'JPG',
          'image/png': 'JPG',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
          'image/vnd.dwg': 'DWG',
          'image/x-dwg': 'DWG',
          'application/acad': 'DWG'
      };

      const docTypeMap: Record<string, any> = {
          'pdf': 'PLAN',
          'dwg': 'PLAN',
          'xlsx': 'OTHER',
          'docx': 'SPEC',
          'doc': 'SPEC',
          'jpg': 'OTHER',
          'png': 'OTHER'
      };

      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const format = typeMap[file.type] || ext.toUpperCase();
      const type = docTypeMap[ext] || 'OTHER';

      // Convert to Base64 for persistence (Limit to 5MB to avoid crashing localStorage)
      let url = '';
      if (file.size < 5 * 1024 * 1024) {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          await new Promise<void>((resolve) => {
              reader.onload = () => {
                  url = reader.result as string;
                  resolve();
              };
          });
      } else {
          // Fallback to ObjectURL (Session only)
          url = URL.createObjectURL(file);
          alert("El archivo es muy grande (>5MB) y no se guardará permanentemente en esta demo. Solo estará disponible durante esta sesión.");
      }

      const newDoc: ProjectDocument = {
          id: generateId(),
          organizationId: user?.organizationId || 'org_a',
          projectId: project.id,
          name: file.name,
          type: type,
          format: format as any,
          uploadDate: new Date().toISOString(),
          uploadedBy: user?.name || 'User',
          url: url
      };

      addDocument(newDoc);
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const filteredDocs = documents.filter(d => {
      const matchesSearch = d.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = filterType === 'ALL' || d.type === filterType;
      return matchesSearch && matchesType;
  });

  const getIcon = (format: string, size: number = 24) => {
      switch(format) {
          case 'PDF': return <FileText size={size} className="text-red-500" />;
          case 'XLSX': return <FileText size={size} className="text-green-600" />;
          case 'DOCX': return <FileText size={size} className="text-blue-500" />;
          case 'DWG': return <Box size={size} className="text-blue-600" />;
          case 'JPG': return <ImageIcon size={size} className="text-purple-500" />;
          default: return <File size={size} className="text-slate-400" />;
      }
  };

  const renderThumbnail = (doc: ProjectDocument) => {
      if (['JPG', 'PNG', 'JPEG', 'WEBP'].includes(doc.format) && doc.url) {
          return (
              <div 
                  className="w-full h-32 bg-slate-100 rounded-lg mb-3 overflow-hidden border border-slate-200 group-hover:border-blue-200 transition-colors cursor-pointer"
                  onClick={() => setPreviewFile(doc)}
              >
                  <img src={doc.url} alt={doc.name} className="w-full h-full object-cover" />
              </div>
          );
      }
      if (doc.format === 'PDF' && doc.url) {
          return (
              <div 
                  className="w-full h-32 bg-slate-100 rounded-lg mb-3 overflow-hidden border border-slate-200 group-hover:border-blue-200 transition-colors cursor-pointer"
                  onClick={() => setPreviewFile(doc)}
              >
                  <PdfThumbnail url={doc.url} />
              </div>
          );
      }
      return (
          <div 
              className="w-full h-32 bg-slate-50 rounded-lg mb-3 flex items-center justify-center border border-slate-100 group-hover:border-blue-100 transition-colors cursor-pointer"
              onClick={() => setPreviewFile(doc)}
          >
              <div className="transform scale-150 opacity-70 group-hover:opacity-100 group-hover:scale-175 transition-all duration-300">
                  {getIcon(doc.format, 32)}
              </div>
          </div>
      );
  };

  return (
    <div className="space-y-6">
        {/* Header */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex justify-between items-center">
            <div>
                <h2 className="text-xl font-bold text-slate-800">Gestión Documental</h2>
                <p className="text-sm text-slate-500">Repositorio centralizado de planos, contratos y especificaciones.</p>
            </div>
            <div className="flex gap-2">
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    onChange={handleUpload} 
                    accept=".pdf,.jpg,.png,.xlsx,.docx,.dwg,.dwf"
                />
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold shadow-lg flex items-center gap-2"
                >
                    <Upload size={18} /> Subir Documento
                </button>
            </div>
        </div>

        {/* Filters & View Toggle */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-200">
            <div className="flex gap-4 items-center flex-1 w-full">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                    <input 
                        type="text" 
                        placeholder="Buscar archivo..." 
                        className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:outline-blue-500"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                <select 
                    className="p-2 border border-slate-300 rounded-md bg-white text-sm font-medium"
                    value={filterType}
                    onChange={e => setFilterType(e.target.value)}
                >
                    <option value="ALL">Todos los Tipos</option>
                    <option value="PLAN">Planos (DWG/PDF)</option>
                    <option value="CONTRACT">Contratos</option>
                    <option value="INVOICE">Facturas</option>
                    <option value="SPEC">Especificaciones</option>
                </select>
            </div>

            <div className="flex bg-white p-1 rounded-lg border border-slate-200">
                <button 
                    onClick={() => setViewMode('grid')} 
                    className={`p-2 rounded transition-colors ${viewMode === 'grid' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    title="Vista Cuadrícula"
                >
                    <LayoutGrid size={18}/>
                </button>
                <button 
                    onClick={() => setViewMode('list')} 
                    className={`p-2 rounded transition-colors ${viewMode === 'list' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    title="Vista Lista"
                >
                    <List size={18}/>
                </button>
                <button 
                    onClick={() => setViewMode('icons')} 
                    className={`p-2 rounded transition-colors ${viewMode === 'icons' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    title="Vista Iconos"
                >
                    <Grid size={18}/>
                </button>
            </div>
        </div>

        {/* Content Area */}
        {filteredDocs.length === 0 ? (
            <div className="py-12 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                <p>No se encontraron documentos.</p>
            </div>
        ) : (
            <>
                {/* GRID VIEW */}
                {viewMode === 'grid' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {filteredDocs.map(doc => (
                            <div key={doc.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all group relative">
                                {renderThumbnail(doc)}
                                
                                <div className="flex justify-between items-start mb-1">
                                    <h4 className="font-bold text-slate-800 text-sm truncate flex-1 pr-2" title={doc.name}>{doc.name}</h4>
                                    <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded">{doc.format}</span>
                                </div>
                                <p className="text-xs text-slate-500 mb-4">Subido el {new Date(doc.uploadDate).toLocaleDateString()}</p>
                                
                                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                                    <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                        <div className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                                            {doc.uploadedBy.charAt(0)}
                                        </div>
                                        {doc.uploadedBy}
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => setPreviewFile(doc)} className="p-1.5 hover:bg-blue-50 text-blue-600 rounded" title="Ver"><Eye size={14} /></button>
                                        <a href={doc.url} download={doc.name} className="p-1.5 hover:bg-slate-100 text-slate-600 rounded" title="Descargar"><Download size={14} /></a>
                                        <button onClick={() => removeDocument(doc.id)} className="p-1.5 hover:bg-red-50 text-red-500 rounded" title="Eliminar"><Trash2 size={14} /></button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* LIST VIEW */}
                {viewMode === 'list' && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-bold">
                                <tr>
                                    <th className="p-4 w-10"></th>
                                    <th className="p-4">Nombre</th>
                                    <th className="p-4">Tipo</th>
                                    <th className="p-4">Fecha</th>
                                    <th className="p-4">Usuario</th>
                                    <th className="p-4 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredDocs.map(doc => (
                                    <tr key={doc.id} className="hover:bg-slate-50 group">
                                        <td className="p-4 text-center">
                                            {getIcon(doc.format, 18)}
                                        </td>
                                        <td className="p-4 font-medium text-slate-800">
                                            {doc.name}
                                        </td>
                                        <td className="p-4">
                                            <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded">{doc.type}</span>
                                        </td>
                                        <td className="p-4 text-slate-500">
                                            {new Date(doc.uploadDate).toLocaleDateString()}
                                        </td>
                                        <td className="p-4 text-slate-500">
                                            {doc.uploadedBy}
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => setPreviewFile(doc)} className="p-1.5 hover:bg-blue-50 text-blue-600 rounded" title="Ver"><Eye size={16} /></button>
                                                <a href={doc.url} download={doc.name} className="p-1.5 hover:bg-slate-100 text-slate-600 rounded" title="Descargar"><Download size={16} /></a>
                                                <button onClick={() => removeDocument(doc.id)} className="p-1.5 hover:bg-red-50 text-red-500 rounded" title="Eliminar"><Trash2 size={16} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* ICONS VIEW */}
                {viewMode === 'icons' && (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {filteredDocs.map(doc => (
                            <div key={doc.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all group flex flex-col items-center text-center relative">
                                <div 
                                    className="w-20 h-20 mb-3 flex items-center justify-center bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors overflow-hidden"
                                    onClick={() => setPreviewFile(doc)}
                                >
                                    {['JPG', 'PNG', 'JPEG', 'WEBP'].includes(doc.format) && doc.url ? (
                                        <img src={doc.url} alt={doc.name} className="w-full h-full object-cover" />
                                    ) : doc.format === 'PDF' && doc.url ? (
                                        <PdfThumbnail url={doc.url} />
                                    ) : (
                                        getIcon(doc.format, 40)
                                    )}
                                </div>
                                <h4 className="font-medium text-slate-800 text-xs line-clamp-2 mb-1 w-full" title={doc.name}>{doc.name}</h4>
                                <span className="text-[10px] text-slate-400">{doc.format}</span>

                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1 bg-white/90 p-1 rounded shadow-sm">
                                    <a href={doc.url} download={doc.name} className="p-1 hover:bg-slate-100 text-slate-600 rounded"><Download size={12} /></a>
                                    <button onClick={() => removeDocument(doc.id)} className="p-1 hover:bg-red-50 text-red-500 rounded"><Trash2 size={12} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </>
        )}

        {/* Preview Modal */}
        {previewFile && (
            <FilePreviewModal 
                file={{
                    name: previewFile.name,
                    url: previewFile.url || '',
                    type: previewFile.format
                }} 
                onClose={() => setPreviewFile(null)} 
            />
        )}
    </div>
  );
};