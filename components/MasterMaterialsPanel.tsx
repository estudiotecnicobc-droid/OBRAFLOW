import React, { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, Save, X, RefreshCcw, AlertTriangle, CheckCircle, Loader, Database, Wand2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMasterMaterials } from '../hooks/useMasterMaterials';
import { MasterMaterial } from '../types';
import { suggestMaterialCode } from '../utils/codeGenerator';

const CURRENCIES = ['ARS', 'USD'];

const EMPTY_DRAFT: Partial<MasterMaterial> = {
  code: '',
  name: '',
  description: '',
  unit: '',
  unitPrice: 0,
  currency: 'ARS',
  category: '',
  supplier: '',
  commercialFormat: '',
  wastePercent: 0,
};

export const MasterMaterialsPanel: React.FC = () => {
  const { user } = useAuth();
  const orgId = user?.organizationId ?? '';
  const { items, loading, error, reload, add, update, remove } = useMasterMaterials(orgId);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState<Partial<MasterMaterial>>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [search, setSearch] = useState('');

  // ── Autogeneración de código ────────────────────────────────────────────────
  // autoCode rastrea la última sugerencia. El ref permite comparar contra la
  // sugerencia previa dentro del efecto, sin incluirla como dependencia.
  const [autoCode, setAutoCode] = useState('');
  const autoCodeRef = useRef('');

  useEffect(() => {
    if (!isAdding) return;
    const existingCodes = items.map(m => m.code).filter((c): c is string => !!c);
    const suggested = suggestMaterialCode(draft.category ?? '', existingCodes);
    const prevAuto = autoCodeRef.current;
    autoCodeRef.current = suggested;
    setAutoCode(suggested);
    // Rellenar el campo solo si está vacío O si aún muestra la sugerencia anterior.
    // Si el usuario editó el código manualmente, no lo sobreescribimos.
    setDraft(d => ({
      ...d,
      code: (d.code === '' || d.code === prevAuto) ? suggested : d.code,
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.category, isAdding]);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const startAdd = () => {
    setDraft(EMPTY_DRAFT);
    setAutoCode('');
    autoCodeRef.current = '';
    setIsAdding(true);
    setEditingId(null);
  };

  const startEdit = (m: MasterMaterial) => {
    setDraft({ ...m });
    setAutoCode('');
    autoCodeRef.current = '';
    setEditingId(m.id);
    setIsAdding(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsAdding(false);
    setDraft(EMPTY_DRAFT);
    setAutoCode('');
    autoCodeRef.current = '';
  };

  const handleSave = async () => {
    if (!draft.name?.trim() || !draft.unit?.trim()) {
      showMsg('error', 'Nombre y unidad son obligatorios.');
      return;
    }
    setSaving(true);
    try {
      if (isAdding) {
        await add({
          name: draft.name.trim(),
          unit: draft.unit.trim(),
          unitPrice: Number(draft.unitPrice) || 0,
          currency: draft.currency || 'ARS',
          code: draft.code?.trim() || undefined,
          description: draft.description?.trim() || undefined,
          category: draft.category?.trim() || undefined,
          supplier: draft.supplier?.trim() || undefined,
          commercialFormat: draft.commercialFormat?.trim() || undefined,
          wastePercent: draft.wastePercent != null ? Number(draft.wastePercent) : undefined,
        });
        showMsg('success', 'Material agregado a la base maestra.');
      } else if (editingId) {
        await update(editingId, {
          name: draft.name.trim(),
          unit: draft.unit.trim(),
          unitPrice: Number(draft.unitPrice) || 0,
          currency: draft.currency || 'ARS',
          code: draft.code?.trim() || undefined,
          description: draft.description?.trim() || undefined,
          category: draft.category?.trim() || undefined,
          supplier: draft.supplier?.trim() || undefined,
          commercialFormat: draft.commercialFormat?.trim() || undefined,
          wastePercent: draft.wastePercent != null ? Number(draft.wastePercent) : undefined,
        });
        showMsg('success', 'Material actualizado.');
      }
      cancelEdit();
    } catch (e: any) {
      showMsg('error', e.message ?? 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (m: MasterMaterial) => {
    if (!confirm(`¿Desactivar "${m.name}"? No se borrará físicamente.`)) return;
    try {
      await remove(m.id);
      showMsg('success', `"${m.name}" desactivado.`);
    } catch (e: any) {
      showMsg('error', e.message ?? 'Error al desactivar.');
    }
  };

  const filtered = items.filter(m =>
    !search ||
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.code?.toLowerCase().includes(search.toLowerCase()) ||
    m.category?.toLowerCase().includes(search.toLowerCase())
  );

  const field = (label: string, node: React.ReactNode, required = false) => (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {node}
    </div>
  );

  const inp = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
      {...props}
      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
    />
  );

  return (
    <div className="space-y-4 animate-in fade-in">

      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-lg">
              <Database size={20} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Base Maestra de Materiales</h2>
              <p className="text-xs text-slate-500">
                Catálogo organizacional · {items.length} materiales activos
                {orgId && <span className="ml-1 text-slate-400">· org: {orgId}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={reload}
              disabled={loading}
              className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
              title="Recargar"
            >
              <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={startAdd}
              disabled={loading || isAdding}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
            >
              <Plus size={16} /> Nuevo Material
            </button>
          </div>
        </div>
      </div>

      {/* Mensaje global */}
      {message && (
        <div className={`p-3 rounded-lg flex items-center justify-between gap-2 ${
          message.type === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          <div className="flex items-center gap-2 text-sm font-medium">
            {message.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
            {message.text}
          </div>
          <button onClick={() => setMessage(null)}><X size={14} /></button>
        </div>
      )}

      {/* Error de carga */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-3">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Error al conectar con Supabase</p>
            <p className="text-xs mt-1">{error}</p>
            <p className="text-xs mt-1 text-red-500">Verificá que VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY estén configuradas en .env.local y que la tabla master_materials exista.</p>
          </div>
        </div>
      )}

      {/* Formulario de alta/edición */}
      {(isAdding || editingId) && (
        <div className="bg-white rounded-xl shadow-sm border border-emerald-200 p-6">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">
            {isAdding ? 'Nuevo Material' : 'Editar Material'}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {field('Nombre', inp({
              placeholder: 'Cemento Portland 50kg',
              value: draft.name ?? '',
              onChange: e => setDraft(d => ({ ...d, name: e.target.value })),
            }), true)}

            {field('Unidad', inp({
              placeholder: 'bolsa / kg / m3',
              value: draft.unit ?? '',
              onChange: e => setDraft(d => ({ ...d, unit: e.target.value })),
            }), true)}

            {field('Precio unitario', inp({
              type: 'number',
              min: 0,
              step: 0.01,
              placeholder: '0.00',
              value: draft.unitPrice ?? 0,
              onChange: e => setDraft(d => ({ ...d, unitPrice: parseFloat(e.target.value) || 0 })),
            }))}

            {field('Moneda',
              <select
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                value={draft.currency ?? 'ARS'}
                onChange={e => setDraft(d => ({ ...d, currency: e.target.value }))}
              >
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            )}

            {/* Código con sugerencia automática */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1.5">
                Código
                {isAdding && autoCode && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
                    <Wand2 size={8} /> auto
                  </span>
                )}
              </label>
              <div className="relative">
                <input
                  placeholder={isAdding ? autoCode || 'MAT-0001' : 'MAT-0001'}
                  value={draft.code ?? ''}
                  onChange={e => setDraft(d => ({ ...d, code: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent font-mono pr-8"
                />
                {isAdding && autoCode && draft.code !== autoCode && (
                  <button
                    type="button"
                    title={`Restaurar sugerencia: ${autoCode}`}
                    onClick={() => setDraft(d => ({ ...d, code: autoCode }))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-emerald-600 transition-colors"
                  >
                    <RefreshCcw size={12} />
                  </button>
                )}
              </div>
              {isAdding && autoCode && draft.code !== autoCode && (
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Sugerido:{' '}
                  <button
                    type="button"
                    onClick={() => setDraft(d => ({ ...d, code: autoCode }))}
                    className="font-mono text-emerald-600 underline underline-offset-2"
                  >
                    {autoCode}
                  </button>
                </p>
              )}
            </div>

            {field('Categoría', inp({
              placeholder: 'Cemento / Hierros / Sanitarios',
              value: draft.category ?? '',
              onChange: e => setDraft(d => ({ ...d, category: e.target.value })),
            }))}

            {field('Proveedor', inp({
              placeholder: 'Nombre del proveedor habitual',
              value: draft.supplier ?? '',
              onChange: e => setDraft(d => ({ ...d, supplier: e.target.value })),
            }))}

            {field('Presentación comercial', inp({
              placeholder: 'Bolsa 50kg / Barra 12m',
              value: draft.commercialFormat ?? '',
              onChange: e => setDraft(d => ({ ...d, commercialFormat: e.target.value })),
            }))}

            {field('% Desperdicio std.', inp({
              type: 'number',
              min: 0,
              max: 100,
              step: 0.5,
              placeholder: '0',
              value: draft.wastePercent ?? 0,
              onChange: e => setDraft(d => ({ ...d, wastePercent: parseFloat(e.target.value) || 0 })),
            }))}

            <div className="col-span-2 md:col-span-3 lg:col-span-4">
              {field('Descripción', inp({
                placeholder: 'Descripción adicional (opcional)',
                value: draft.description ?? '',
                onChange: e => setDraft(d => ({ ...d, description: e.target.value })),
              }))}
            </div>
          </div>

          <div className="flex gap-2 mt-5 pt-4 border-t border-slate-100">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? <Loader size={16} className="animate-spin" /> : <Save size={16} />}
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              onClick={cancelEdit}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm font-medium transition-colors"
            >
              <X size={16} /> Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Tabla principal */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/50">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            {filtered.length} de {items.length} materiales
          </span>
          <input
            type="text"
            placeholder="Buscar por nombre, código o categoría…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 w-64"
          />
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-3 p-12 text-slate-400">
            <Loader size={20} className="animate-spin" />
            <span className="text-sm">Cargando desde Supabase…</span>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="p-12 text-center text-slate-400 text-sm">
            {items.length === 0
              ? 'No hay materiales en la base maestra. Hacé clic en "Nuevo Material" para agregar el primero.'
              : 'No hay resultados para la búsqueda.'}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3">Unidad</th>
                  <th className="px-4 py-3 text-right">Precio</th>
                  <th className="px-4 py-3">Moneda</th>
                  <th className="px-4 py-3">Proveedor</th>
                  <th className="px-4 py-3 text-center">Desp.%</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m, i) => (
                  <tr
                    key={m.id}
                    className={`border-b border-slate-50 hover:bg-slate-50/80 transition-colors ${
                      editingId === m.id ? 'bg-emerald-50/50' : i % 2 === 0 ? '' : 'bg-slate-50/30'
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{m.code || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {m.name}
                      {m.organizationId === null && (
                        <span className="ml-1.5 inline-block text-[9px] font-bold uppercase bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full tracking-wide">
                          Global
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{m.category || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{m.unit}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-800">
                      {m.unitPrice.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                        m.currency === 'USD' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {m.currency}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{m.supplier || '—'}</td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500">
                      {m.wastePercent != null && m.wastePercent > 0 ? `${m.wastePercent}%` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {m.organizationId === null ? (
                          <span className="text-[10px] text-purple-400 italic px-2">Solo Admin</span>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(m)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Editar"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => handleRemove(m)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Desactivar (soft delete)"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
