import React, { useState, useMemo } from 'react';
import {
  Plus, Trash2, Download, RefreshCcw, Loader2, Calculator,
  AlertCircle, FileText, Layers, Search, X,
} from 'lucide-react';
import { useMaterialsCalculator } from '../hooks/useMaterialsCalculator';
import { useERP } from '../context/ERPContext';
import type { MasterTask, AggregatedResourceLine, APUCalcResult } from '../types';
import { piecePurchase } from '../services/consolidatedCalculatorService';

const fmt = (n: number) =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Sub-componentes ─────────────────────────────────────────────────────────

const AggTable: React.FC<{ rows: AggregatedResourceLine[]; label: string; showPurchase?: boolean }> = ({ rows, label, showPurchase }) => (
  <div className="overflow-x-auto">
    {rows.length === 0 ? (
      <p className="text-slate-400 text-sm text-center py-8">Sin {label} calculados</p>
    ) : (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase tracking-wide">
            <th className="pb-2 pr-3">Nombre</th>
            <th className="pb-2 pr-3 text-center">Und</th>
            <th className="pb-2 pr-3 text-right">Cant. Total</th>
            {showPurchase && <th className="pb-2 pr-3 text-right text-emerald-600">A comprar</th>}
            <th className="pb-2 pr-3 text-right">P. Unit.</th>
            <th className="pb-2 pr-3 text-right">Subtotal</th>
            <th className="pb-2 text-center">Fuentes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const cf = r.conversionFactor ?? 1;
            // Fórmula correcta: qty_compra = CEIL(qty_técnica / factor_conversión)
            // Ejemplo: 1200 kg / 50 (bolsa 50kg) = 24 bolsas
            const purchaseQty = cf > 1 ? Math.ceil(r.totalQuantity / cf) : piecePurchase(r.unit, r.totalQuantity) ?? null;
            const purchaseLabel = r.commercialUnit ?? null;
            return (
              <tr key={r.key} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2 pr-3 font-medium text-slate-800">{r.name}</td>
                <td className="py-2 pr-3 text-center text-slate-500">{r.unit}</td>
                <td className="py-2 pr-3 text-right text-slate-700">{fmt(r.totalQuantity)}</td>
                {showPurchase && (
                  <td className="py-2 pr-3 text-right">
                    {purchaseQty !== null ? (
                      <span className="font-bold text-emerald-700" title={`${fmt(r.totalQuantity)} ${r.unit} ÷ ${cf}`}>
                        {purchaseQty} {purchaseLabel ?? r.unit}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                )}
                <td className="py-2 pr-3 text-right text-slate-500">
                  {r.unitPrice > 0 ? `$${fmt(r.unitPrice)}` : (
                    <span className="text-amber-500 flex items-center justify-end gap-1">
                      <AlertCircle size={11} /> Sin precio
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3 text-right font-semibold text-slate-800">
                  ${fmt(r.totalCost)}
                </td>
                <td className="py-2 text-center">
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full"
                    title={r.sources.join(', ')}>
                    {r.sources.length} APU
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    )}
  </div>
);

const RendimientosCard: React.FC<{ apu: APUCalcResult }> = ({ apu }) => (
  <div className="rounded-lg border border-slate-200 overflow-hidden">
    {/* Cabecera APU */}
    <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-start">
      <div>
        <p className="font-bold text-slate-800">{apu.name}</p>
        <p className="text-xs text-slate-500 mt-0.5">
          {fmt(apu.quantity)} {apu.unit} solicitados
        </p>
      </div>
      <div className="text-right">
        <p className="text-xs text-slate-400">Costo unitario</p>
        <p className="font-bold text-slate-800">${fmt(apu.unitCosts.total)}/{apu.unit}</p>
      </div>
    </div>

    {/* Breakdown de costos unitarios */}
    <div className="px-4 py-2 grid grid-cols-4 gap-2 text-xs bg-white border-b border-slate-100">
      {[
        { label: 'Materiales', value: apu.unitCosts.material, color: 'text-blue-600' },
        { label: 'Mano de Obra', value: apu.unitCosts.labor, color: 'text-green-600' },
        { label: 'Equipos', value: apu.unitCosts.equipment, color: 'text-orange-500' },
        { label: 'Fijo', value: apu.unitCosts.fixed, color: 'text-purple-600' },
      ].map(({ label, value, color }) => (
        <div key={label} className="text-center">
          <p className="text-slate-400">{label}</p>
          <p className={`font-semibold ${color}`}>${fmt(value)}</p>
        </div>
      ))}
    </div>

    {/* Tabla de rendimientos por tipo */}
    <div className="px-4 py-3 space-y-3">
      {apu.resources.materials.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">
            Materiales — rendimiento por {apu.unit}
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 text-left">
                <th className="pb-1 pr-3">Nombre</th>
                <th className="pb-1 pr-3 text-center">Und</th>
                <th className="pb-1 pr-3 text-right">Cant/Und</th>
                <th className="pb-1 pr-3 text-right">Desperd.</th>
                <th className="pb-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {apu.resources.materials.map(r => (
                <tr key={r.key} className="border-t border-slate-100">
                  <td className="py-1 pr-3 text-slate-700">{r.name}</td>
                  <td className="py-1 pr-3 text-center text-slate-500">{r.unit}</td>
                  <td className="py-1 pr-3 text-right text-slate-600">{fmt(r.quantityPerUnit)}</td>
                  <td className="py-1 pr-3 text-right text-amber-500">
                    {r.wastePercent > 0 ? `${r.wastePercent}%` : '—'}
                  </td>
                  <td className="py-1 text-right font-medium text-slate-800">{fmt(r.totalQuantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {apu.resources.labor.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-1">
            Mano de Obra — HH por {apu.unit}
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 text-left">
                <th className="pb-1 pr-3">Categoría</th>
                <th className="pb-1 pr-3 text-right">HH/Und</th>
                <th className="pb-1 pr-3 text-right">Tarifa/HH</th>
                <th className="pb-1 text-right">HH Totales</th>
              </tr>
            </thead>
            <tbody>
              {apu.resources.labor.map(r => (
                <tr key={r.key} className="border-t border-slate-100">
                  <td className="py-1 pr-3 text-slate-700">{r.name}</td>
                  <td className="py-1 pr-3 text-right text-slate-600">{fmt(r.quantityPerUnit)}</td>
                  <td className="py-1 pr-3 text-right text-slate-500">
                    {r.unitPrice > 0 ? `$${fmt(r.unitPrice)}` : '—'}
                  </td>
                  <td className="py-1 text-right font-medium text-slate-800">{fmt(r.totalQuantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {apu.resources.equipment.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-orange-500 uppercase tracking-wide mb-1">
            Equipos — HM por {apu.unit}
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 text-left">
                <th className="pb-1 pr-3">Equipo</th>
                <th className="pb-1 pr-3 text-right">HM/Und</th>
                <th className="pb-1 pr-3 text-right">Costo/HM</th>
                <th className="pb-1 text-right">HM Totales</th>
              </tr>
            </thead>
            <tbody>
              {apu.resources.equipment.map(r => (
                <tr key={r.key} className="border-t border-slate-100">
                  <td className="py-1 pr-3 text-slate-700">{r.name}</td>
                  <td className="py-1 pr-3 text-right text-slate-600">{fmt(r.quantityPerUnit)}</td>
                  <td className="py-1 pr-3 text-right text-slate-500">
                    {r.unitPrice > 0 ? `$${fmt(r.unitPrice)}` : '—'}
                  </td>
                  <td className="py-1 text-right font-medium text-slate-800">{fmt(r.totalQuantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {apu.resources.materials.length === 0 &&
       apu.resources.labor.length === 0 &&
       apu.resources.equipment.length === 0 && (
        <p className="text-slate-400 text-xs text-center py-2">
          Este APU no tiene recursos cargados
        </p>
      )}
    </div>
  </div>
);

// ─── Componente principal ────────────────────────────────────────────────────

interface Props { organizationId: string }
type ActiveTab = 'materials' | 'labor' | 'equipment' | 'por-apu';

export const MaterialsCalculator: React.FC<Props> = ({ organizationId }) => {
  const {
    items, result, loading, error, masterTasks,
    addItem, updateItem, removeItem, clear,
  } = useMaterialsCalculator(organizationId);

  // Para importar desde el presupuesto activo
  const { tasks: projectTasks, project } = useERP();
  const budgetItems = project?.items ?? [];

  const [selectedMasterTaskId, setSelectedMasterTaskId] = useState('');
  const [quantityInput, setQuantityInput]               = useState('1');
  const [activeTab, setActiveTab]                       = useState<ActiveTab>('materials');
  const [apuFilter, setApuFilter]                       = useState('');

  // Filtrar y agrupar APUs por categoría
  const filteredTasks = useMemo(() => {
    if (!apuFilter.trim()) return masterTasks;
    const q = apuFilter.toLowerCase();
    return masterTasks.filter(t =>
      t.name.toLowerCase().includes(q) ||
      (t.code ?? '').toLowerCase().includes(q) ||
      (t.category ?? '').toLowerCase().includes(q),
    );
  }, [masterTasks, apuFilter]);

  const tasksByCategory: Record<string, MasterTask[]> = {};
  for (const t of filteredTasks) {
    const cat = t.category ?? 'Sin categoría';
    if (!tasksByCategory[cat]) tasksByCategory[cat] = [];
    tasksByCategory[cat].push(t);
  }

  const handleAdd = () => {
    const qty = parseFloat(quantityInput);
    if (!selectedMasterTaskId || isNaN(qty) || qty <= 0) return;
    addItem(selectedMasterTaskId, qty);
    setQuantityInput('1');
  };

  // Importar APUs desde el presupuesto activo del proyecto
  const handleImportFromBudget = () => {
    if (!project || budgetItems.length === 0) return;
    clear();
    const accumulated = new Map<string, number>();
    for (const bi of budgetItems) {
      const task = projectTasks.find(t => t.id === bi.taskId);
      if (!task?.masterTaskId) continue;
      accumulated.set(task.masterTaskId, (accumulated.get(task.masterTaskId) ?? 0) + bi.quantity);
    }
    for (const [masterTaskId, quantity] of accumulated) {
      addItem(masterTaskId, quantity);
    }
  };

  const budgetImportCount = (() => {
    const ids = new Set<string>();
    for (const bi of budgetItems) {
      const task = projectTasks.find(t => t.id === bi.taskId);
      if (task?.masterTaskId) ids.add(task.masterTaskId);
    }
    return ids.size;
  })();

  const handleExportCSV = () => {
    if (!result) return;
    const rows: string[] = ['CALCULADORA DE MATERIALES Y RENDIMIENTOS', ''];

    const section = (title: string, lines: AggregatedResourceLine[], includePurchase = false) => {
      rows.push(title);
      rows.push(includePurchase
        ? 'Nombre,Unidad,Cantidad Total,A comprar,Precio Unit.,Subtotal,Fuentes'
        : 'Nombre,Unidad,Cantidad Total,Precio Unit.,Subtotal,Fuentes',
      );
      for (const r of lines) {
        const cf = r.conversionFactor ?? 1;
        const purchase = includePurchase
          ? (cf > 1 ? `${Math.ceil(r.totalQuantity / cf)} ${r.commercialUnit ?? r.unit}` : `${piecePurchase(r.unit, r.totalQuantity) ?? ''}`)
          : undefined;
        const base = `"${r.name}","${r.unit}",${r.totalQuantity.toFixed(4)},`;
        const mid  = includePurchase ? `${purchase ?? ''},` : '';
        rows.push(base + mid +
          `${r.unitPrice.toFixed(2)},${r.totalCost.toFixed(2)},"${r.sources.join(' | ')}"`,
        );
      }
      rows.push('');
    };

    section('MATERIALES', result.aggregated.materials, true);
    section('MANO DE OBRA', result.aggregated.labor);
    section('EQUIPOS', result.aggregated.equipment);

    rows.push('RENDIMIENTOS POR APU');
    rows.push('APU,Unidad,Cantidad,C.Mat/Und,C.MO/Und,C.Equ/Und,C.Fijo/Und,C.Total/Und');
    for (const a of result.apuResults) {
      rows.push(
        `"${a.name}","${a.unit}",${a.quantity},` +
        `${a.unitCosts.material},${a.unitCosts.labor},${a.unitCosts.equipment},` +
        `${a.unitCosts.fixed},${a.unitCosts.total}`,
      );
    }
    rows.push('');
    rows.push('RESUMEN');
    rows.push('Concepto,Total');
    rows.push(`Materiales,${result.totals.material.toFixed(2)}`);
    rows.push(`Mano de Obra,${result.totals.labor.toFixed(2)}`);
    rows.push(`Equipos,${result.totals.equipment.toFixed(2)}`);
    rows.push(`Costo Fijo,${result.totals.fixed.toFixed(2)}`);
    rows.push(`TOTAL,${result.totals.total.toFixed(2)}`);

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `calculadora_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const noPriceCount = result?.aggregated.materials.filter(r => r.unitPrice === 0).length ?? 0;

  const tabClass = (tab: ActiveTab) =>
    `px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
      activeTab === tab
        ? 'bg-amber-500 text-white shadow-sm'
        : 'text-slate-500 hover:bg-slate-100'
    }`;

  // Cuántos ítems del presupuesto tienen tarea pero sin masterTaskId (no importables)
  const budgetItemsWithoutMaster = (() => {
    if (budgetImportCount > 0) return 0;
    return budgetItems.filter(bi => projectTasks.find(t => t.id === bi.taskId && !t.masterTaskId)).length;
  })();

  return (
    <div className="space-y-6">

      {/* Banner de error de carga */}
      {error && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
          <AlertCircle size={16} className="shrink-0" />
          <span>No se pudieron cargar los APUs: {error}</span>
        </div>
      )}

      {/* Panel: selector + items */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Calculator size={20} className="text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Calculadora de Materiales</h2>
              <p className="text-sm text-slate-500">
                El cálculo se actualiza automáticamente al agregar APUs
              </p>
            </div>
          </div>

          {/* Botón importar del presupuesto */}
          {budgetImportCount > 0 ? (
            <button
              onClick={handleImportFromBudget}
              className="flex items-center gap-2 px-4 py-2 border border-amber-300 text-amber-700
                         rounded-lg text-sm font-semibold hover:bg-amber-50 transition-colors"
              title={`Cargar los ${budgetImportCount} APU del presupuesto activo`}
            >
              <Layers size={15} />
              Importar del presupuesto ({budgetImportCount} APU)
            </button>
          ) : budgetItemsWithoutMaster > 0 ? (
            <span
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-400
                         rounded-lg text-sm cursor-default"
              title="Los ítems del presupuesto no tienen APU maestro asignado. Importalos desde DataAdmin → APUs Maestras."
            >
              <Layers size={15} />
              Sin APU maestro en presupuesto
            </span>
          ) : null}
        </div>

        {/* Selector de APU */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              APU / Análisis de Precio
            </label>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-slate-400 h-10">
                <Loader2 size={16} className="animate-spin" /> Cargando APUs…
              </div>
            ) : (
              <div className="space-y-1.5">
                {/* Búsqueda */}
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder={`Buscar en ${masterTasks.length} APUs…`}
                    value={apuFilter}
                    onChange={e => setApuFilter(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg pl-8 pr-8 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  {apuFilter && (
                    <button
                      onClick={() => setApuFilter('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                {/* Select filtrado */}
                <select
                  value={selectedMasterTaskId}
                  onChange={e => setSelectedMasterTaskId(e.target.value)}
                  size={apuFilter ? Math.min(filteredTasks.length + 1, 6) : 1}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <option value="">
                    {apuFilter && filteredTasks.length === 0
                      ? 'Sin resultados'
                      : 'Seleccionar APU…'}
                  </option>
                  {Object.entries(tasksByCategory).map(([cat, tasks]) => (
                    <optgroup key={cat} label={cat}>
                      {tasks.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.code ? `[${t.code}] ` : ''}{t.name} ({t.unit})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="w-32">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Cantidad</label>
            <input
              type="number"
              min="0.001"
              step="any"
              value={quantityInput}
              onChange={e => setQuantityInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          <button
            onClick={handleAdd}
            disabled={!selectedMasterTaskId || loading}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg
                       text-sm font-semibold hover:bg-amber-600
                       disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Plus size={16} /> Agregar
          </button>
        </div>

        {/* Tabla de items agregados */}
        {items.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400">{items.length} {items.length === 1 ? 'partida' : 'partidas'}</span>
              <button
                onClick={clear}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-red-500
                           hover:bg-red-50 rounded-lg transition-colors border border-transparent
                           hover:border-red-200"
              >
                <RefreshCcw size={12} /> Limpiar todo
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="pb-2 pr-3">APU</th>
                  <th className="pb-2 pr-3 text-center">Und</th>
                  <th className="pb-2 pr-3 text-right">Cantidad</th>
                  <th className="pb-2 pr-3 text-right">C. Unit.</th>
                  <th className="pb-2 pr-3 text-right">C. Total</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const task = masterTasks.find(t => t.id === item.masterTaskId);
                  const apu  = result?.apuResults.find(a => a.masterTaskId === item.masterTaskId);
                  return (
                    <tr key={item.id} className="border-b border-slate-100 hover:bg-amber-50/40">
                      <td className="py-2 pr-3 font-medium text-slate-800">
                        {task?.code && <span className="text-slate-400 mr-1">[{task.code}]</span>}
                        {task?.name ?? item.masterTaskId}
                      </td>
                      <td className="py-2 pr-3 text-center text-slate-500">{task?.unit}</td>
                      <td className="py-2 pr-3 text-right">
                        <input
                          type="number"
                          min="0.001"
                          step="any"
                          value={item.quantity}
                          onChange={e => {
                            const v = parseFloat(e.target.value);
                            if (!isNaN(v) && v > 0) updateItem(item.id, v);
                          }}
                          className="w-24 border border-slate-200 rounded px-2 py-1 text-right
                                     text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
                        />
                      </td>
                      <td className="py-2 pr-3 text-right text-slate-500 text-xs">
                        {apu ? `$${fmt(apu.unitCosts.total)}` : '—'}
                      </td>
                      <td className="py-2 pr-3 text-right font-semibold text-slate-800">
                        {apu ? `$${fmt(apu.unitCosts.total * item.quantity)}` : '—'}
                      </td>
                      <td className="py-2">
                        <button
                          onClick={() => removeItem(item.id)}
                          className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {result && (
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50">
                    <td colSpan={4} className="py-2 pr-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Total estimado
                    </td>
                    <td className="py-2 pr-3 text-right font-bold text-amber-700 text-base">
                      ${fmt(result.totals.total)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* Resultados */}
      {result && (
        <>
          {/* Tarjetas de resumen */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            {[
              { label: 'Materiales',   value: result.totals.material,   cls: 'bg-white border-slate-100' },
              { label: 'Mano de Obra', value: result.totals.labor,      cls: 'bg-white border-slate-100' },
              { label: 'Equipos',      value: result.totals.equipment,  cls: 'bg-white border-slate-100' },
              { label: 'Costo Fijo',   value: result.totals.fixed,      cls: 'bg-white border-slate-100' },
              { label: 'TOTAL',        value: result.totals.total,      cls: 'bg-amber-50 border-amber-200' },
            ].map(({ label, value, cls }) => (
              <div key={label} className={`rounded-xl shadow-sm border p-4 ${cls}`}>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  {label}
                </p>
                <p className={`text-lg font-bold ${label === 'TOTAL' ? 'text-amber-700' : 'text-slate-800'}`}>
                  ${fmt(value)}
                </p>
              </div>
            ))}
          </div>

          {/* Panel con tabs */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
            <div className="flex flex-wrap gap-2 mb-5">
              <button className={tabClass('materials')} onClick={() => setActiveTab('materials')}>
                Materiales ({result.aggregated.materials.length})
                {noPriceCount > 0 && (
                  <span className="ml-1.5 bg-amber-200 text-amber-800 text-xs px-1.5 py-0.5 rounded-full">
                    {noPriceCount} sin precio
                  </span>
                )}
              </button>
              <button className={tabClass('labor')} onClick={() => setActiveTab('labor')}>
                Mano de Obra ({result.aggregated.labor.length})
              </button>
              <button className={tabClass('equipment')} onClick={() => setActiveTab('equipment')}>
                Equipos ({result.aggregated.equipment.length})
              </button>
              <button className={tabClass('por-apu')} onClick={() => setActiveTab('por-apu')}>
                Por APU ({result.apuResults.length})
              </button>

              <div className="ml-auto">
                <button
                  onClick={handleExportCSV}
                  className="flex items-center gap-2 px-3 py-2 border border-slate-200
                             rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <Download size={15} /> Exportar CSV
                </button>
              </div>
            </div>

            {activeTab === 'materials' && (
              <AggTable rows={result.aggregated.materials} label="materiales" showPurchase />
            )}
            {activeTab === 'labor' && (
              <AggTable rows={result.aggregated.labor} label="recursos de mano de obra" />
            )}
            {activeTab === 'equipment' && (
              <AggTable rows={result.aggregated.equipment} label="equipos" />
            )}
            {activeTab === 'por-apu' && (
              <div className="space-y-4">
                <p className="text-xs text-slate-400 mb-2">
                  Consumo de recursos <strong>por unidad</strong> de cada APU,
                  y totales para la cantidad solicitada.
                </p>
                {result.apuResults.map(apu => (
                  <RendimientosCard key={apu.masterTaskId} apu={apu} />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Estado vacío */}
      {items.length === 0 && !loading && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-12 text-center">
          <Calculator size={40} className="mx-auto text-slate-200 mb-3" />
          <p className="text-slate-500 font-medium">Agregá APUs y cantidades para comenzar</p>
          <p className="text-slate-400 text-sm mt-1">
            Los resultados se calculan automáticamente — sin necesidad de ejecutar nada
          </p>
          {budgetImportCount > 0 && (
            <button
              onClick={handleImportFromBudget}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-amber-500 text-white
                         rounded-lg text-sm font-semibold hover:bg-amber-600 mx-auto transition-colors"
            >
              <FileText size={15} />
              Importar {budgetImportCount} APU del presupuesto activo
            </button>
          )}
        </div>
      )}
    </div>
  );
};
