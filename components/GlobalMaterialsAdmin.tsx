import React, { useEffect, useState } from 'react';
import { Plus, Search, Edit2, CheckCircle2, XCircle, Loader2, AlertTriangle, Save, X, FlaskConical } from 'lucide-react';
import { MasterMaterial } from '../types';
import { masterMaterialsService } from '../services/masterMaterialsService';

const YIELD_UNIT_OPTIONS = [
  'm²/l', 'm²/kg', 'kg/m²', 'ml/un', 'm²/rollo',
  'un/m²', 'l/m²', 'm/rollo', 'un/caja', 'ml/m²',
];

type FormData = {
  name: string;
  code: string;
  unit: string;
  unitPrice: string;
  currency: string;
  category: string;
  supplier: string;
  commercialFormat: string;
  wastePercent: string;
  description: string;
  technicalYield: string;
  technicalYieldUnit: string;
  technicalNotes: string;
};

const EMPTY_FORM: FormData = {
  name: '', code: '', unit: '', unitPrice: '0', currency: 'ARS',
  category: '', supplier: '', commercialFormat: '', wastePercent: '', description: '',
  technicalYield: '', technicalYieldUnit: '', technicalNotes: '',
};

function toForm(m: MasterMaterial): FormData {
  return {
    name: m.name,
    code: m.code ?? '',
    unit: m.unit,
    unitPrice: String(m.unitPrice),
    currency: m.currency,
    category: m.category ?? '',
    supplier: m.supplier ?? '',
    commercialFormat: m.commercialFormat ?? '',
    wastePercent: m.wastePercent != null ? String(m.wastePercent) : '',
    description: m.description ?? '',
    technicalYield: m.technicalYield != null ? String(m.technicalYield) : '',
    technicalYieldUnit: m.technicalYieldUnit ?? '',
    technicalNotes: m.technicalNotes ?? '',
  };
}

export const GlobalMaterialsAdmin: React.FC = () => {
  const [materials, setMaterials] = useState<MasterMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<MasterMaterial | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await masterMaterialsService.listGlobalAll();
      setMaterials(data);
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

  const openEdit = (m: MasterMaterial) => {
    setForm(toForm(m));
    setEditing(m);
    setCreating(false);
    setError(null);
  };

  const closeForm = () => { setCreating(false); setEditing(null); setError(null); };

  const handleSave = async () => {
    if (!form.name.trim() || !form.unit.trim()) {
      setError('Nombre y unidad son obligatorios.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim() || undefined,
        unit: form.unit.trim(),
        unitPrice: parseFloat(form.unitPrice) || 0,
        currency: form.currency,
        category: form.category.trim() || undefined,
        supplier: form.supplier.trim() || undefined,
        commercialFormat: form.commercialFormat.trim() || undefined,
        wastePercent: form.wastePercent ? parseFloat(form.wastePercent) : undefined,
        description: form.description.trim() || undefined,
        technicalYield: form.technicalYield ? parseFloat(form.technicalYield) : undefined,
        technicalYieldUnit: form.technicalYieldUnit.trim() || undefined,
        technicalNotes: form.technicalNotes.trim() || undefined,
      };
      if (editing) {
        await masterMaterialsService.updateGlobal(editing.id, payload);
      } else {
        await masterMaterialsService.createGlobal(payload);
      }
      await load();
      closeForm();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (m: MasterMaterial) => {
    setToggling(m.id);
    try {
      await masterMaterialsService.toggleActiveGlobal(m.id, !m.isActive);
      setMaterials(prev => prev.map(x => x.id === m.id ? { ...x, isActive: !x.isActive } : x));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setToggling(null);
    }
  };

  const filtered = materials.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    (m.code ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (m.category ?? '').toLowerCase().includes(search.toLowerCase()),
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
          <Plus size={14} /> Nuevo material
        </button>
        <span className="text-xs text-slate-400 ml-auto">{materials.length} registros</span>
      </div>

      {/* Inline form */}
      {(creating || editing) && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-slate-700 text-sm">
              {creating ? 'Nuevo material global' : `Editar: ${editing!.name}`}
            </h3>
            <button onClick={closeForm} className="text-slate-400 hover:text-slate-600"><X size={15} /></button>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
              <AlertTriangle size={12} /> {error}
            </div>
          )}

          {/* Datos principales */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {F('name', 'Nombre *')}
            {F('code', 'Código')}
            {F('unit', 'Unidad *')}
            {F('unitPrice', 'Precio unitario', 'number', { min: '0', step: '0.01' })}
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Moneda</label>
              <select
                value={form.currency}
                onChange={e => setForm(p => ({ ...p, currency: e.target.value }))}
                className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option>ARS</option>
                <option>USD</option>
              </select>
            </div>
            {F('category', 'Categoría')}
            {F('supplier', 'Proveedor')}
            {F('commercialFormat', 'Formato comercial')}
            {F('wastePercent', 'Desperdicio %', 'number', { min: '0', max: '100', step: '0.1' })}
          </div>
          <div>{F('description', 'Descripción')}</div>

          {/* Datos técnicos opcionales */}
          <div className="border-t border-blue-200 pt-3 space-y-3">
            <div className="flex items-center gap-2">
              <FlaskConical size={13} className="text-sky-500 shrink-0" />
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Datos técnicos opcionales</p>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed -mt-1">
              Usá estos campos solo cuando el material tenga un rendimiento técnico propio, por ejemplo pinturas, adhesivos, impermeabilizantes o membranas.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {F('technicalYield', 'Rendimiento', 'number', { min: '0', step: '0.01', placeholder: 'Ej: 10' })}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Unidad de rendimiento</label>
                <select
                  value={form.technicalYieldUnit}
                  onChange={e => setForm(p => ({ ...p, technicalYieldUnit: e.target.value }))}
                  className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">— seleccionar —</option>
                  {YIELD_UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Observación técnica</label>
              <textarea
                value={form.technicalNotes}
                onChange={e => setForm(p => ({ ...p, technicalNotes: e.target.value }))}
                placeholder="Rendimiento promedio, condiciones de aplicación, referencias normativas…"
                rows={2}
                className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              />
            </div>
          </div>

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
          {search ? 'Sin resultados para esa búsqueda.' : 'El catálogo global de materiales está vacío.'}
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase text-slate-400 tracking-wide">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Código</th>
                <th className="px-4 py-2.5 text-left font-medium">Nombre</th>
                <th className="px-4 py-2.5 text-left font-medium">Unidad</th>
                <th className="px-4 py-2.5 text-right font-medium">Precio</th>
                <th className="px-4 py-2.5 text-left font-medium">Moneda</th>
                <th className="px-4 py-2.5 text-left font-medium">Categoría</th>
                <th className="px-4 py-2.5 text-center font-medium">Estado</th>
                <th className="px-4 py-2.5 text-center font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(m => (
                <tr key={m.id} className={`hover:bg-slate-50 transition-colors ${!m.isActive ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-2 font-mono text-slate-400">{m.code ?? '—'}</td>
                  <td className="px-4 py-2 font-medium text-slate-700">
                    {m.name}
                    {m.technicalYield != null && (
                      <span
                        title={`Rendimiento: ${m.technicalYield}${m.technicalYieldUnit ? ' ' + m.technicalYieldUnit : ''}${m.technicalNotes ? ' — ' + m.technicalNotes : ''}`}
                        className="ml-1.5 inline-flex items-center gap-0.5 text-[9px] font-bold bg-sky-100 text-sky-600 px-1.5 py-0.5 rounded-full"
                      >
                        <FlaskConical size={8} /> Ficha técnica
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-500">{m.unit}</td>
                  <td className="px-4 py-2 text-right text-slate-700 font-mono">
                    {m.unitPrice.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-2 text-slate-400">{m.currency}</td>
                  <td className="px-4 py-2 text-slate-500">{m.category ?? '—'}</td>
                  <td className="px-4 py-2 text-center">
                    {m.isActive
                      ? <span className="inline-flex items-center gap-1 text-emerald-600 text-[10px] font-semibold"><CheckCircle2 size={11} /> Activo</span>
                      : <span className="inline-flex items-center gap-1 text-slate-400 text-[10px]"><XCircle size={11} /> Inactivo</span>
                    }
                  </td>
                  <td className="px-4 py-2 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => openEdit(m)}
                        className="text-blue-500 hover:text-blue-700 p-1 rounded hover:bg-blue-50 transition-colors"
                        title="Editar"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={() => handleToggle(m)}
                        disabled={toggling === m.id}
                        className={`p-1 rounded transition-colors text-[10px] font-semibold ${
                          m.isActive
                            ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50'
                            : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                        }`}
                        title={m.isActive ? 'Desactivar' : 'Activar'}
                      >
                        {toggling === m.id ? <Loader2 size={12} className="animate-spin" /> : (m.isActive ? 'Desactivar' : 'Activar')}
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
