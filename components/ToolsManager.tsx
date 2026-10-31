import React, { useState } from 'react';
import { useERP } from '../context/ERPContext';
import { generateId } from '../utils/generateId';
import { Wrench, Plus, Save } from 'lucide-react';
import { Tool } from '../types';

export const ToolsManager: React.FC = () => {
  const { tools, addTool } = useERP();
  const [newTool, setNewTool] = useState<Partial<Tool>>({
    name: '',
    category: '',
    costPerHour: 0
  });

  const handleAdd = () => {
    if (!newTool.name || !newTool.costPerHour) return;
    
    addTool({
      id: generateId(),
      organizationId: 'org_a',
      name: newTool.name,
      category: newTool.category || 'General',
      costPerHour: Number(newTool.costPerHour)
    });
    
    setNewTool({ name: '', category: '', costPerHour: 0 });
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
                <Wrench size={24} />
            </div>
            <div>
                <h2 className="text-xl font-bold text-slate-800">Gestión de Equipos y Herramientas</h2>
                <p className="text-sm text-slate-500">Administre el costo horario y amortización de sus activos.</p>
            </div>
        </div>

        {/* Inline Form */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <input 
                type="text" 
                placeholder="Nombre del Equipo" 
                className="p-2 border border-slate-300 rounded focus:outline-blue-500"
                value={newTool.name}
                onChange={e => setNewTool({...newTool, name: e.target.value})}
            />
            <input 
                type="text" 
                placeholder="Categoría" 
                className="p-2 border border-slate-300 rounded focus:outline-blue-500"
                value={newTool.category}
                onChange={e => setNewTool({...newTool, category: e.target.value})}
            />
            <input 
                type="number" 
                placeholder="Costo/Hora ($)" 
                className="p-2 border border-slate-300 rounded focus:outline-blue-500"
                value={newTool.costPerHour || ''}
                onChange={e => setNewTool({...newTool, costPerHour: parseFloat(e.target.value)})}
            />
            <button 
                onClick={handleAdd}
                className="bg-purple-600 text-white rounded hover:bg-purple-700 flex items-center justify-center gap-2 font-medium"
            >
                <Plus size={18} /> Agregar
            </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-x-auto">
        <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                    <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Equipo / Herramienta</th>
                    <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Categoría</th>
                    <th className="p-4 text-xs font-semibold text-slate-500 uppercase text-right">Costo x Hora</th>
                    <th className="p-4 text-xs font-semibold text-slate-500 uppercase text-center">ID</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {tools.map(tool => (
                    <tr key={tool.id} className="hover:bg-slate-50">
                        <td className="p-4 font-medium text-slate-800">{tool.name}</td>
                        <td className="p-4 text-slate-600">
                            <span className="px-2 py-1 bg-slate-100 rounded-full text-xs text-slate-600 border border-slate-200">
                                {tool.category}
                            </span>
                        </td>
                        <td className="p-4 text-right font-mono text-purple-700 font-bold">
                            ${tool.costPerHour.toFixed(2)}
                        </td>
                        <td className="p-4 text-center text-xs text-slate-400 font-mono">
                            {tool.id.substring(0,8)}...
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>
    </div>
  );
};