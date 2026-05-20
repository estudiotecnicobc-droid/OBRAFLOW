import React, { useEffect, useState } from 'react';
import { Plus, Search, Edit2, CheckCircle2, XCircle, Loader2, AlertTriangle, Save, X } from 'lucide-react';
import { MasterTask } from '../types';
import { masterTasksService } from '../services/masterTasksSupabaseService';

type FormData = {
  name: string;
  code: string;
  unit: string;
  category: string;
  dailyYield: string;
  fixedCost: string;
  fixedCostDescription: string;
  specifications: string;
};

const EMPTY_FORM: FormData = {
  name: '', code: '', unit: '', category: '',
  dailyYield: '1', fixedCost: '0', fixedCostDescription: '', specifications: '',
};

function toForm(t: MasterTask): FormData {
  return {
    name: t.name,
    code: t.code ?? '',
    unit: t.unit,
    category: t.category ?? '',
    dailyYield: String(t.dailyYield),
    fixedCost: String(t.fixedCost ?? 0),
    fixedCostDescription: t.fixedCostDescription ?? '',
    specifications: t.specifications ?? '',
  };
}

export const GlobalTasksAdmin: React.FC = () => {
  const [tasks, setTasks] = useState<MasterTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<MasterTask | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await masterTasksService.listGlobalAll();
      setTasks(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditing(null);
    setCreating(true);
    setError(null);
  };

  const openEdit = (t: MasterTask) => {
    setForm(toForm(t));
    setEditing(t);
    setCreating(false);
    setError(null);
  };

  const closeForm = () => { setCreating(false); setEditing(null); setError(null); };

  const handleSave = async () => {
    if (!form.name.trim() || !form.unit.trim()) {
      setError('Nombre y unidad son obligatorios.');
      return;
    }
    const dailyYield = parseFloat(form.dailyYield) || 1;
    if (dailyYield <= 0) { setError('El rendimiento diario debe ser mayor a 0.'); return; }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim() || undefined,
        unit: form.unit.trim(),
        category: form.category.trim() || undefined,
        dailyYield,
        fixedCost: parseFloat(form.fixedCost) || 0,
        fixedCostDescription: form.fixedCostDescription.trim() || undefined,
        specifications: form.specifications.trim() || undefined,
        tags: [],
        description: undefined,
        sourceMetadata: undefined,
      };
      if (editing) {
        await masterTasksService.updateGlobal(editing.id, payload);
      } else {
        await masterTasksService.createGlobal(payload);
      }
      await load();
      closeForm();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (t: MasterTask) => {
    setToggling(t.id);
    try {
      if (t.isActive) {
        await masterTasksService.deactivate(t.id);
      } else {
        await masterTasksService.activate(t.id);
      }
      setTasks(prev => prev.map(x => x.id === t.id ? { ...x, isActive: !x.isActive } : x));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setToggling(null);
    }
  };

  const filtered = tasks.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.code ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (t.category ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  const F = (field: keyof FormData, label: string, type: string = 'text', extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div>
      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{label}</label>
      <input
        type={type}
        value={form[field]}
        onChange={e => setForm(prev => ({ ...prev, [field]: e.target.value }))}
        className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
        {...extra}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, código o rubro…"
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Plus size={14} /> Nuevo APU global
        </button>
        <span className="text-xs text-slate-400 ml-auto">{tasks.length} registros</span>
      </div>

      {/* Inline form */}
      {(creating || editing) && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-slate-700 text-sm">
              {creating ? 'Nueva tarea maestra global' : `Editar: ${editing!.name}`}
            </h3>
            <button onClick={closeForm} className="text-slate-400 hover:text-slate-600"><X size={15} /></button>
          </div>
          <p className="text-[10px] text-slate-500">
            Se crea el encabezado del APU. La composición (materiales, MO, equipos) se gestiona desde la sección <em>APU</em> de la Base de Datos de empresa del cliente.
          </p>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
              <AlertTriangle size={12} /> {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {F('name', 'Nombre *')}
            {F('code', 'Código')}
            {F('unit', 'Unidad *')}
            {F('category', 'Rubro / Categoría')}
            {F('dailyYield', 'Rendimiento diario (u/día) *', 'number', { min: '0.01', step: '0.01' })}
            {F('fixedCost', 'Costo fijo por unidad', 'number', { min: '0', step: '0.01' })}
            {F('fixedCostDescription', 'Descripción costo fijo')}
          </div>
          <div>{F('specifications', 'Especificaciones técnicas')}</div>

          <div className="flex gap-2 justify-end pt-1">
            <button onClick={closeForm} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded transition-colors">
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="py-12 text-center text-slate-400 text-sm">Cargando…</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-slate-400 text-sm">
          {search ? 'Sin resultados para esa búsqueda.' : 'El catálogo global de APUs está vacío.'}
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase text-slate-400 tracking-wide">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Código</th>
                <th className="px-4 py-2.5 text-left font-medium">Nombre</th>
                <th className="px-4 py-2.5 text-left font-medium">Unidad</th>
                <th className="px-4 py-2.5 text-left font-medium">Rubro</th>
                <th className="px-4 py-2.5 text-right font-medium">Rend./día</th>
                <th className="px-4 py-2.5 text-center font-medium">Estado</th>
                <th className="px-4 py-2.5 text-center font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(t => (
                <tr key={t.id} className={`hover:bg-slate-50 transition-colors ${!t.isActive ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-2 font-mono text-slate-400">{t.code ?? '—'}</td>
                  <td className="px-4 py-2 font-medium text-slate-700">{t.name}</td>
                  <td className="px-4 py-2 text-slate-500">{t.unit}</td>
                  <td className="px-4 py-2 text-slate-500">{t.category ?? '—'}</td>
                  <td className="px-4 py-2 text-right font-mono text-slate-600">{t.dailyYield}</td>
                  <td className="px-4 py-2 text-center">
                    {t.isActive
                      ? <span className="inline-flex items-center gap-1 text-emerald-600 text-[10px] font-semibold"><CheckCircle2 size={11} /> Activo</span>
                      : <span className="inline-flex items-center gap-1 text-slate-400 text-[10px]"><XCircle size={11} /> Inactivo</span>
                    }
                  </td>
                  <td className="px-4 py-2 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => openEdit(t)}
                        className="text-blue-500 hover:text-blue-700 p-1 rounded hover:bg-blue-50 transition-colors"
                        title="Editar"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={() => handleToggle(t)}
                        disabled={toggling === t.id}
                        className={`p-1 rounded transition-colors text-[10px] font-semibold ${
                          t.isActive
                            ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50'
                            : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                        }`}
                        title={t.isActive ? 'Desactivar' : 'Activar'}
                      >
                        {toggling === t.id ? <Loader2 size={12} className="animate-spin" /> : (t.isActive ? 'Desactivar' : 'Activar')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
