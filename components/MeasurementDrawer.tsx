import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ruler, Plus, Trash2, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useERP } from '../context/ERPContext';
import { useAuth } from '../context/AuthContext';
import { generateId } from '../utils/generateId';
import type { MeasurementLine, MeasurementSheet } from '../types';
import { DecimalInput } from './DecimalInput';

interface Props {
  budgetItemId: string;
  onClose: () => void;
}

const lineTotal = (l: MeasurementLine) => Number((l.length * l.width * l.height * l.count).toFixed(2));
const sumLines = (lines: MeasurementLine[]) => Number(lines.reduce((a, l) => a + (l.subtotal || 0), 0).toFixed(2));
const fmt = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 2 });

/**
 * Planilla de medición de un ítem del presupuesto, como panel lateral.
 * Cada cambio se guarda y actualiza la cantidad del ítem (sin confirmaciones).
 */
export const MeasurementDrawer: React.FC<Props> = ({ budgetItemId, onClose }) => {
  const { project, tasks, measurementSheets, saveMeasurementSheet, updateBudgetItem } = useERP();
  const { user } = useAuth();

  const item = useMemo(() => project.items.find(i => i.id === budgetItemId), [project.items, budgetItemId]);
  const task = useMemo(() => (item ? tasks.find(t => t.id === item.taskId) : undefined), [item, tasks]);

  const [sheet, setSheet] = useState<MeasurementSheet | null>(null);
  const dirty = useRef(false);

  // Inicializa solo al abrir (o cambiar de ítem): la planilla local es la fuente mientras está abierta.
  useEffect(() => {
    const existing = measurementSheets.find(s => s.budgetItemId === budgetItemId);
    setSheet(existing
      ? { ...existing, lines: existing.lines.map(l => ({ ...l })) }
      : {
          id: generateId(),
          organizationId: user?.organizationId || '',
          budgetItemId,
          lines: [],
          totalQuantity: 0,
          lastUpdated: new Date().toISOString(),
          updatedBy: user?.name || 'Usuario',
        });
    dirty.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetItemId]);

  const persist = (s: MeasurementSheet) => {
    saveMeasurementSheet({ ...s, lastUpdated: new Date().toISOString(), updatedBy: user?.name || 'Usuario' });
    if (s.lines.length > 0 && item && Math.abs(item.quantity - s.totalQuantity) > 0.005) {
      updateBudgetItem(budgetItemId, { quantity: s.totalQuantity });
    }
    dirty.current = false;
  };

  // Guardado con debounce para no escribir en Supabase en cada tecla.
  useEffect(() => {
    if (!sheet || !dirty.current) return;
    const t = setTimeout(() => persist(sheet), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet]);

  const close = () => {
    if (sheet && dirty.current) persist(sheet);
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const setLines = (lines: MeasurementLine[]) => {
    if (!sheet) return;
    dirty.current = true;
    setSheet({ ...sheet, lines, totalQuantity: sumLines(lines) });
  };

  const addLine = () => {
    if (!sheet) return;
    // Primera línea: arranca con la cantidad actual para no perderla.
    const first = sheet.lines.length === 0 && (item?.quantity ?? 0) > 0;
    const l: MeasurementLine = {
      id: generateId(),
      description: first ? 'Cantidad inicial' : '',
      length: first ? item!.quantity : 1,
      width: 1, height: 1, count: 1,
      subtotal: first ? item!.quantity : 1,
    };
    setLines([...sheet.lines, l]);
  };

  const updateLine = (id: string, field: keyof MeasurementLine, val: string | number) => {
    if (!sheet) return;
    setLines(sheet.lines.map(l => {
      if (l.id !== id) return l;
      if (field === 'description') return { ...l, description: String(val) };
      const u = { ...l, [field]: Number(val) || 0 };
      return field === 'subtotal' ? u : { ...u, subtotal: lineTotal(u) };
    }));
  };

  if (!item || !sheet) return null;

  const hasLines = sheet.lines.length > 0;
  const mismatch = hasLines && Math.abs(item.quantity - sheet.totalQuantity) > 0.005 && !dirty.current;

  const baseInput = 'w-full p-1 bg-transparent focus:bg-white border border-transparent focus:border-blue-300 rounded outline-none text-xs';
  const inputCls = `${baseInput} font-mono text-center`;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex justify-end print:hidden" role="dialog" aria-modal="true" aria-label="Planilla de medición">
      <div className="absolute inset-0 bg-slate-900/20" onClick={close} />
      <div className="relative w-full max-w-[640px] h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Encabezado */}
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-start gap-3">
          <Ruler className="text-emerald-600 mt-0.5 shrink-0" size={18} />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase font-bold text-slate-400">Planilla de medición</div>
            <h3 className="font-bold text-slate-800 text-sm truncate">{task?.name ?? 'Ítem'}</h3>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Unidad: <span className="font-semibold">{task?.unit}</span> · Largo × Ancho × Alto × Veces
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase font-bold text-slate-400">Cantidad del ítem</div>
            <div className="font-mono text-xl font-bold text-emerald-700">{fmt(hasLines ? sheet.totalQuantity : item.quantity)}</div>
          </div>
          <button onClick={close} className="p-1.5 rounded hover:bg-slate-200 text-slate-500" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        {mismatch && (
          <div className="mx-4 mt-3 p-2.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-xs flex items-center gap-2">
            <AlertTriangle size={14} className="shrink-0" />
            <span className="flex-1">
              El ítem tiene {fmt(item.quantity)} {task?.unit} y la planilla suma {fmt(sheet.totalQuantity)}.
            </span>
            <button onClick={() => persist(sheet)} className="px-2 py-1 rounded bg-amber-600 text-white font-semibold hover:bg-amber-700">
              Usar la planilla
            </button>
          </div>
        )}

        {/* Tabla */}
        <div className="flex-1 overflow-auto p-4">
          {!hasLines && (
            <div className="text-center text-slate-500 text-xs py-6">
              <p className="font-medium">Todavía no hay mediciones para este ítem.</p>
              <p className="text-slate-400 mt-1">
                Al agregar la primera línea se conserva la cantidad actual ({fmt(item.quantity)} {task?.unit}) y desde ahí la cantidad sale de esta planilla.
              </p>
            </div>
          )}
          {hasLines && (
            <table className="w-full text-left border-collapse">
              <thead className="text-[10px] uppercase text-slate-500 font-semibold">
                <tr className="border-b border-slate-200">
                  <th className="p-1.5">Descripción / ubicación</th>
                  <th className="p-1.5 text-center w-16">Largo</th>
                  <th className="p-1.5 text-center w-16">Ancho</th>
                  <th className="p-1.5 text-center w-16">Alto</th>
                  <th className="p-1.5 text-center w-14">Veces</th>
                  <th className="p-1.5 text-right w-20">Subtotal</th>
                  <th className="w-7" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sheet.lines.map(l => (
                  <tr key={l.id} className="group hover:bg-slate-50">
                    <td className="p-1">
                      <input className={`${baseInput} text-left`} placeholder="Ej: Muro eje 1-2"
                        value={l.description} onChange={e => updateLine(l.id, 'description', e.target.value)} />
                    </td>
                    {(['length', 'width', 'height', 'count'] as const).map(f => (
                      <td key={f} className="p-1">
                        <DecimalInput className={inputCls} value={l[f]} onValue={n => updateLine(l.id, f, n)} />
                      </td>
                    ))}
                    <td className="p-1 bg-slate-50">
                      <DecimalInput className={`${baseInput} font-mono text-right font-bold text-blue-700`} title="Podés escribir el subtotal directamente"
                        value={l.subtotal} onValue={n => updateLine(l.id, 'subtotal', n)} />
                    </td>
                    <td className="p-1 text-center">
                      <button onClick={() => setLines(sheet.lines.filter(x => x.id !== l.id))}
                        className="p-1 text-slate-300 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label="Quitar línea">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300">
                  <td colSpan={5} className="p-1.5 text-right text-xs font-bold text-slate-600">Total</td>
                  <td className="p-1.5 text-right font-mono text-sm font-bold text-emerald-700">{fmt(sheet.totalQuantity)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
          <button onClick={addLine}
            className="mt-3 w-full py-2 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 text-xs font-bold hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 flex items-center justify-center gap-2">
            <Plus size={14} /> Agregar línea de medición
          </button>
        </div>

        <div className="px-4 py-2.5 border-t border-slate-200 text-[11px] text-slate-500 flex items-center gap-1.5">
          <CheckCircle2 size={12} className="text-emerald-500" />
          Los cambios se guardan solos y actualizan la cantidad del ítem en el presupuesto y en la grilla.
        </div>
      </div>
    </div>,
    document.body,
  );
};
