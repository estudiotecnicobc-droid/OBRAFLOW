import React, { useEffect, useMemo, useState } from 'react';
import { Lock, Printer, Save, AlertTriangle, RefreshCw } from 'lucide-react';
import { useERP } from '../../../../context/ERPContext';
import { useAuth } from '../../../../context/AuthContext';
import { useProjectSchedule, ItemCost } from '../../../../hooks/useProjectSchedule';
import { useBudgetKStore, selectBusinessConfig, computeBudgetKSummary } from '../../../../store/useBudgetKStore';
import type { BusinessConfig } from '../../../../types';
import { getProjectStage } from '../../../../components/ProjectStage';
import {
  INDEX_SERIES, IndexCode, IndexPoint, priceIndicesService,
  monthOf, latestAtOrBefore, valueAt, formatPeriod,
} from '../../../../services/priceIndicesService';
import {
  budgetVersionsService, BudgetVersion, BudgetVersionFactors, BudgetVersionItem, BudgetVersionTotals,
} from '../../../../services/budgetVersionsService';
import { openBudgetVersionReport } from './budgetVersionReport';
import { IndexSyncStatus } from '../../../../components/IndexSyncStatus';

type Mode = 'cac' | 'icc' | 'ipc' | 'usd' | 'mix_cac' | 'mix_icc' | 'custom';
type Component = keyof BudgetVersionFactors;

const MODES: { id: Mode; name: string; desc: string }[] = [
  { id: 'cac', name: 'Índice CAC', desc: 'Cámara Argentina de la Construcción, índice general. Un coeficiente para todo.' },
  { id: 'icc', name: 'ICC INDEC', desc: 'Índice del costo de la construcción del INDEC, nivel general.' },
  { id: 'ipc', name: 'Inflación (IPC)', desc: 'Variación de precios al consumidor, mes a mes.' },
  { id: 'usd', name: 'Variación del dólar', desc: 'Oficial, MEP o blue: último valor de venta de cada mes.' },
  { id: 'mix_cac', name: 'Por componente (CAC)', desc: 'Materiales y mano de obra con su índice CAC; equipos con el dólar oficial.' },
  { id: 'mix_icc', name: 'Por componente (ICC)', desc: 'Materiales y mano de obra con su índice ICC; equipos con el dólar oficial.' },
  { id: 'custom', name: 'Porcentaje fijo', desc: 'Un porcentaje que definís vos, por ejemplo el acordado con el cliente.' },
];

const COMPONENT_LABEL: Record<Component, string> = {
  materials: 'Materiales',
  labor: 'Mano de obra',
  equipment: 'Equipos',
  fixed: 'Otros (precio fijo)',
};

function seriesFor(mode: Mode, usd: IndexCode): Record<Component, IndexCode> | null {
  switch (mode) {
    case 'cac': return { materials: 'cac_general', labor: 'cac_general', equipment: 'cac_general', fixed: 'cac_general' };
    case 'icc': return { materials: 'icc_general', labor: 'icc_general', equipment: 'icc_general', fixed: 'icc_general' };
    case 'ipc': return { materials: 'ipc', labor: 'ipc', equipment: 'ipc', fixed: 'ipc' };
    case 'usd': return { materials: usd, labor: usd, equipment: usd, fixed: usd };
    case 'mix_cac': return { materials: 'cac_materiales', labor: 'cac_mano_obra', equipment: 'usd_oficial', fixed: 'cac_general' };
    case 'mix_icc': return { materials: 'icc_materiales', labor: 'icc_mano_obra', equipment: 'usd_oficial', fixed: 'icc_general' };
    default: return null;
  }
}

const money = (v: number) => '$ ' + Math.round(v).toLocaleString('es-AR');
const coef = (v: number) => v.toLocaleString('es-AR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const pct = (v: number) => (v >= 0 ? '+' : '') + (v * 100).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %';

function toVersionItems(itemCosts: ItemCost[], f: BudgetVersionFactors): BudgetVersionItem[] {
  return itemCosts.map(ic => {
    const materialUnit = ic.materialUnitCost * f.materials;
    const laborUnit = ic.laborUnitCost * f.labor;
    const equipmentUnit = ic.toolUnitCost * f.equipment;
    const fixedUnit = ic.fixedUnitCost * f.fixed;
    return {
      budgetItemId: ic.id,
      taskId: ic.taskId,
      name: ic.taskName,
      category: ic.category,
      unit: ic.unit,
      quantity: ic.quantity,
      materialUnit, laborUnit, equipmentUnit, fixedUnit,
      total: (materialUnit + laborUnit + equipmentUnit + fixedUnit) * ic.quantity,
    };
  });
}

function totalsOf(items: BudgetVersionItem[], kFactor: number): BudgetVersionTotals {
  const t = { direct: 0, materials: 0, labor: 0, equipment: 0, fixed: 0, sale: 0 };
  for (const i of items) {
    t.materials += i.materialUnit * i.quantity;
    t.labor += i.laborUnit * i.quantity;
    t.equipment += i.equipmentUnit * i.quantity;
    t.fixed += i.fixedUnit * i.quantity;
    t.direct += i.total;
  }
  t.sale = t.direct * kFactor;
  return t;
}

function byCategory(items: BudgetVersionItem[]) {
  const map = new Map<string, { materials: number; labor: number; other: number; total: number }>();
  for (const i of items) {
    const r = map.get(i.category) ?? { materials: 0, labor: 0, other: 0, total: 0 };
    r.materials += i.materialUnit * i.quantity;
    r.labor += i.laborUnit * i.quantity;
    r.other += (i.equipmentUnit + i.fixedUnit) * i.quantity;
    r.total += i.total;
    map.set(i.category, r);
  }
  return map;
}

export const BudgetIndexUpdatePanel: React.FC = () => {
  const { project } = useERP();
  const { hasPermission } = useAuth();
  const { itemCosts } = useProjectSchedule();
  const businessConfig = useBudgetKStore(useMemo(() => selectBusinessConfig(project.id), [project.id])) as BusinessConfig;
  const kFactor = computeBudgetKSummary(1, businessConfig).kFactor;

  const stage = getProjectStage(project.status);
  const canSave = hasPermission(['admin', 'project_manager']) && stage === 'budget';

  const [mode, setMode] = useState<Mode>('cac');
  const [usd, setUsd] = useState<IndexCode>('usd_oficial');
  const [customPct, setCustomPct] = useState(10);
  const [series, setSeries] = useState<Partial<Record<IndexCode, IndexPoint[]>>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [basePeriod, setBasePeriod] = useState<string>('');
  const [targetPeriod, setTargetPeriod] = useState<string>('');
  const [versions, setVersions] = useState<BudgetVersion[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const componentSeries = seriesFor(mode, usd);
  const codes = useMemo(() => componentSeries ? [...new Set(Object.values(componentSeries))] : [], [mode, usd]);
  const createdMonth = monthOf(project.createdAt ?? project.startDate ?? new Date());

  useEffect(() => {
    budgetVersionsService.list(project.id).then(setVersions).catch(err => setMessage({ ok: false, text: `No se pudieron leer las versiones: ${err.message}` }));
  }, [project.id]);

  useEffect(() => {
    if (codes.length === 0) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    Promise.all(codes.map(c => priceIndicesService.getSeries(c).then(points => [c, points] as const)))
      .then(entries => { if (!cancelled) setSeries(prev => ({ ...prev, ...Object.fromEntries(entries) })); })
      .catch(err => { if (!cancelled) setLoadError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [codes.join(','), reloadKey]);

  // Períodos en los que todas las series del método tienen valor
  const commonPeriods = useMemo(() => {
    if (codes.length === 0) return [] as string[];
    const lists = codes.map(c => series[c]);
    if (lists.some(l => !l)) return [];
    const [first, ...rest] = lists as IndexPoint[][];
    return first.map(p => p.period).filter(per => rest.every(l => l.some(p => p.period === per)));
  }, [codes, series]);

  useEffect(() => {
    if (commonPeriods.length === 0) return;
    const pts = commonPeriods.map(p => ({ period: p, value: 1 }));
    const base = latestAtOrBefore(pts, createdMonth)?.period ?? commonPeriods[0];
    setBasePeriod(base);
    setTargetPeriod(commonPeriods[commonPeriods.length - 1]);
  }, [commonPeriods.join(','), createdMonth]);

  useEffect(() => {
    if (basePeriod && targetPeriod && targetPeriod <= basePeriod && commonPeriods.length > 0) {
      setTargetPeriod(commonPeriods[commonPeriods.length - 1]);
    }
  }, [basePeriod]);

  const factors: BudgetVersionFactors | null = useMemo(() => {
    if (mode === 'custom') {
      const f = 1 + (Number(customPct) || 0) / 100;
      return { materials: f, labor: f, equipment: f, fixed: f };
    }
    if (!componentSeries || !basePeriod || !targetPeriod) return null;
    const out = {} as BudgetVersionFactors;
    for (const comp of Object.keys(componentSeries) as Component[]) {
      const pts = series[componentSeries[comp]];
      const b = pts && valueAt(pts, basePeriod);
      const t = pts && valueAt(pts, targetPeriod);
      if (!b || !t) return null;
      out[comp] = t / b;
    }
    return out;
  }, [mode, customPct, componentSeries, series, basePeriod, targetPeriod]);

  const one: BudgetVersionFactors = { materials: 1, labor: 1, equipment: 1, fixed: 1 };
  const originalItems = useMemo(() => toVersionItems(itemCosts, one), [itemCosts]);
  const updatedItems = useMemo(() => factors ? toVersionItems(itemCosts, factors) : null, [itemCosts, factors]);
  const originalTotals = totalsOf(originalItems, kFactor);
  const updatedTotals = updatedItems ? totalsOf(updatedItems, kFactor) : null;
  const origByCat = byCategory(originalItems);
  const updByCat = updatedItems ? byCategory(updatedItems) : null;

  const methodLabel = mode === 'custom'
    ? `Porcentaje fijo ${customPct} %`
    : mode === 'usd' ? INDEX_SERIES[usd].label : MODES.find(m => m.id === mode)!.name;

  const formulaRows = useMemo(() => {
    if (!factors) return [];
    if (mode === 'custom') return [{ comp: 'Todo el presupuesto', text: `1 + ${customPct} % =`, f: factors.materials }];
    const groups = new Map<IndexCode, Component[]>();
    for (const comp of Object.keys(componentSeries!) as Component[]) {
      const code = componentSeries![comp];
      groups.set(code, [...(groups.get(code) ?? []), comp]);
    }
    return [...groups.entries()].map(([code, comps]) => {
      const pts = series[code]!;
      const b = valueAt(pts, basePeriod)!;
      const t = valueAt(pts, targetPeriod)!;
      const fmtV = (v: number) => v.toLocaleString('es-AR', { maximumFractionDigits: 2 });
      return {
        comp: comps.length === 4 ? 'Todo el presupuesto' : comps.map(c => COMPONENT_LABEL[c]).join(' y '),
        text: `${INDEX_SERIES[code].label}: ${fmtV(t)} (${formatPeriod(targetPeriod)}) ÷ ${fmtV(b)} (${formatPeriod(basePeriod)}) =`,
        f: t / b,
      };
    });
  }, [factors, mode, customPct, componentSeries, series, basePeriod, targetPeriod]);

  const save = async () => {
    if (!factors || !updatedItems || !updatedTotals) return;
    setSaving(true);
    setMessage(null);
    try {
      const created: BudgetVersion[] = [];
      let next = versions.length > 0 ? Math.max(...versions.map(v => v.versionNumber)) + 1 : 1;
      if (versions.length === 0) {
        created.push(await budgetVersionsService.create({
          organizationId: project.organizationId, projectId: project.id, versionNumber: 1,
          label: 'Versión 1 · original', method: { mode: 'original', label: 'Presupuesto original', series: {} },
          basePeriod: createdMonth, factors: one, totals: originalTotals, items: originalItems,
        }));
        next = 2;
      }
      created.push(await budgetVersionsService.create({
        organizationId: project.organizationId, projectId: project.id, versionNumber: next,
        label: `Versión ${next} · ${methodLabel}${mode === 'custom' ? '' : ` a ${formatPeriod(targetPeriod)}`}`,
        method: { mode, label: methodLabel, series: componentSeries ?? {} },
        basePeriod: mode === 'custom' ? undefined : basePeriod,
        targetPeriod: mode === 'custom' ? undefined : targetPeriod,
        factors, totals: updatedTotals, items: updatedItems,
      }));
      setVersions(prev => [...prev, ...created]);
      setMessage({ ok: true, text: `Se guardó la versión ${next}. Las anteriores quedan guardadas para comparar.` });
    } catch (err: any) {
      setMessage({ ok: false, text: `No se pudo guardar: ${err.message}` });
    } finally {
      setSaving(false);
    }
  };

  const printCurrent = () => {
    if (!factors || !updatedItems || !updatedTotals) return;
    openBudgetVersionReport({
      projectName: project.name,
      title: 'Actualización de presupuesto',
      methodLabel,
      basePeriod: mode === 'custom' ? undefined : basePeriod,
      targetPeriod: mode === 'custom' ? undefined : targetPeriod,
      formulas: formulaRows.map(r => ({ comp: r.comp, text: `${r.text} ${coef(r.f)}` })),
      original: { items: originalItems, totals: originalTotals },
      updated: { items: updatedItems, totals: updatedTotals },
      kFactor,
    });
  };

  const printVersion = (v: BudgetVersion) => {
    const base = versions.find(x => x.versionNumber === 1) ?? v;
    const f = v.factors as BudgetVersionFactors;
    openBudgetVersionReport({
      projectName: project.name,
      title: v.label,
      methodLabel: (v.method as any)?.label ?? '',
      basePeriod: v.basePeriod,
      targetPeriod: v.targetPeriod,
      formulas: f && f.materials ? (Object.keys(COMPONENT_LABEL) as Component[]).map(c => ({ comp: COMPONENT_LABEL[c], text: `coeficiente ${coef(f[c])}` })) : [],
      original: { items: base.items, totals: base.totals },
      updated: { items: v.items, totals: v.totals },
      kFactor: v.totals.direct > 0 ? v.totals.sale / v.totals.direct : kFactor,
    });
  };

  const monthsSince = (() => {
    const [cy, cm] = createdMonth.split('-').map(Number);
    const now = new Date();
    return (now.getFullYear() - cy) * 12 + (now.getMonth() + 1 - cm);
  })();

  const needsManual = componentSeries && Object.values(componentSeries).some(c => INDEX_SERIES[c].source === 'manual');
  const missingData = !loading && !loadError && mode !== 'custom' && commonPeriods.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Actualizar presupuesto por índice</h2>
          <p className="text-sm text-slate-500">Mes base: {formatPeriod(createdMonth)} (creación de la obra){monthsSince > 0 ? ` · pasaron ${monthsSince} ${monthsSince === 1 ? 'mes' : 'meses'}` : ''}</p>
        </div>
      </div>

      {stage === 'works' && (
        <div className="flex items-start gap-3 bg-slate-100 border border-slate-200 rounded-xl p-4 text-sm text-slate-700">
          <Lock size={18} className="shrink-0 mt-0.5" />
          <span>La obra ya pasó a ejecución con el presupuesto aprobado. Podés consultar el cálculo y las versiones guardadas, pero no guardar una nueva.</span>
        </div>
      )}

      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h3 className="font-bold text-slate-800">1 · ¿Con qué querés actualizar?</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              aria-pressed={mode === m.id}
              className={`text-left p-4 rounded-xl border-2 transition-colors ${mode === m.id ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:border-blue-300 bg-white'}`}
            >
              <div className="font-semibold text-slate-800 text-sm">{m.name}</div>
              <div className="text-xs text-slate-500 mt-1 leading-relaxed">{m.desc}</div>
            </button>
          ))}
        </div>
        {mode === 'usd' && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-700">Cotización:</span>
            {(['usd_oficial', 'usd_mep', 'usd_blue'] as IndexCode[]).map(c => (
              <button key={c} onClick={() => setUsd(c)} aria-pressed={usd === c}
                className={`px-3 py-1.5 rounded-full border text-sm font-medium ${usd === c ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                {INDEX_SERIES[c].label}
              </button>
            ))}
          </div>
        )}
        {mode === 'custom' && (
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            Porcentaje a aplicar
            <input type="number" step="0.1" value={customPct} onChange={e => setCustomPct(Number(e.target.value))}
              className="w-24 border border-slate-300 rounded-lg px-2 py-1.5 text-right font-normal" />
            %
          </label>
        )}
      </section>

      {mode !== 'custom' && (
        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h3 className="font-bold text-slate-800">2 · Período y coeficiente</h3>
          {needsManual && <IndexSyncStatus onSynced={() => setReloadKey(k => k + 1)} />}
          {loading && <p className="text-sm text-slate-500 flex items-center gap-2"><RefreshCw size={14} className="animate-spin" /> Leyendo índices…</p>}
          {loadError && <p className="text-sm text-red-700 flex items-center gap-2"><AlertTriangle size={14} /> No se pudieron leer los índices: {loadError}</p>}
          {missingData && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              {needsManual
                ? 'Todavía no hay valores para este índice. Probá «Buscar actualización ahora» o cargalos en Configuración → Índices.'
                : 'La serie no tiene valores disponibles en este momento.'}
            </p>
          )}
          {commonPeriods.length > 0 && (
            <div className="flex flex-wrap gap-4">
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                Mes base (publicado al crear la obra)
                <select value={basePeriod} onChange={e => setBasePeriod(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-normal text-slate-800">
                  {commonPeriods.slice().reverse().map(p => <option key={p} value={p}>{formatPeriod(p)}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
                Actualizar a
                <select value={targetPeriod} onChange={e => setTargetPeriod(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm font-normal text-slate-800">
                  {commonPeriods.filter(p => p > basePeriod).reverse().map(p => <option key={p} value={p}>{formatPeriod(p)}</option>)}
                </select>
              </label>
            </div>
          )}
          {factors && (
            <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm text-slate-700">
              {formulaRows.map(r => (
                <div key={r.comp} className="flex flex-wrap gap-x-3 gap-y-1">
                  <span className="font-semibold min-w-[160px]">{r.comp}</span>
                  <span>{r.text}</span>
                  <strong className="tabular-nums">{coef(r.f)}</strong>
                </div>
              ))}
              {mode === 'ipc' || mode === 'usd' || mode.startsWith('mix') ? (
                <p className="text-xs text-slate-500 pt-1">Inflación y dólar: datos de ArgentinaDatos (argentinadatos.com).</p>
              ) : null}
              {needsManual && <p className="text-xs text-slate-500">CAC e ICC INDEC: planillas públicas de IERIC (ieric.org.ar).</p>}
            </div>
          )}
        </section>
      )}

      {factors && updatedTotals && updByCat && (
        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h3 className="font-bold text-slate-800">{mode === 'custom' ? '2' : '3'} · Resultado por rubro</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500 text-right">
                  <th className="p-2 text-left font-semibold">RUBRO</th>
                  <th className="p-2 font-semibold">MATERIALES</th>
                  <th className="p-2 font-semibold">MANO DE OBRA</th>
                  <th className="p-2 font-semibold">ORIGINAL</th>
                  <th className="p-2 font-semibold">ACTUALIZADO</th>
                  <th className="p-2 font-semibold">DIFERENCIA</th>
                  <th className="p-2 font-semibold">VAR.</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {[...origByCat.entries()].map(([cat, o]) => {
                  const u = updByCat.get(cat)!;
                  return (
                    <tr key={cat} className="border-t border-slate-100 text-right">
                      <td className="p-2 text-left font-medium text-slate-800">{cat}</td>
                      <td className="p-2 text-slate-500">{money(o.materials)}</td>
                      <td className="p-2 text-slate-500">{money(o.labor)}</td>
                      <td className="p-2">{money(o.total)}</td>
                      <td className="p-2 font-semibold">{money(u.total)}</td>
                      <td className="p-2 text-amber-700">{money(u.total - o.total)}</td>
                      <td className="p-2 text-amber-700">{o.total > 0 ? pct(u.total / o.total - 1) : '—'}</td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-slate-200 text-right font-bold">
                  <td className="p-2 text-left">Costo directo</td>
                  <td className="p-2">{money(originalTotals.materials)}</td>
                  <td className="p-2">{money(originalTotals.labor)}</td>
                  <td className="p-2">{money(originalTotals.direct)}</td>
                  <td className="p-2">{money(updatedTotals.direct)}</td>
                  <td className="p-2 text-amber-700">{money(updatedTotals.direct - originalTotals.direct)}</td>
                  <td className="p-2 text-amber-700">{originalTotals.direct > 0 ? pct(updatedTotals.direct / originalTotals.direct - 1) : '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-slate-50 rounded-lg p-4"><div className="text-xs font-semibold text-slate-500">PRECIO DE VENTA ORIGINAL (K {kFactor.toLocaleString('es-AR', { maximumFractionDigits: 4 })})</div><div className="text-xl font-bold mt-1">{money(originalTotals.sale)}</div></div>
            <div className="bg-slate-50 rounded-lg p-4"><div className="text-xs font-semibold text-slate-500">PRECIO DE VENTA ACTUALIZADO</div><div className="text-xl font-bold mt-1">{money(updatedTotals.sale)}</div></div>
            <div className="bg-amber-50 rounded-lg p-4"><div className="text-xs font-semibold text-amber-800">AUMENTO PARA EL CLIENTE</div><div className="text-xl font-bold mt-1 text-amber-700">{money(updatedTotals.sale - originalTotals.sale)}</div></div>
          </div>
          {message && (
            <div className={`text-sm rounded-lg p-3 border ${message.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>{message.text}</div>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <button onClick={printCurrent} className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Printer size={16} /> Reporte (imprimir o PDF)
            </button>
            {canSave && (
              <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50">
                <Save size={16} /> {saving ? 'Guardando…' : `Guardar como versión ${versions.length === 0 ? 2 : Math.max(...versions.map(v => v.versionNumber)) + 1}`}
              </button>
            )}
          </div>
        </section>
      )}

      {versions.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h3 className="font-bold text-slate-800">Versiones guardadas</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500 text-right">
                  <th className="p-2 text-left font-semibold">VERSIÓN</th>
                  <th className="p-2 text-left font-semibold">FECHA</th>
                  <th className="p-2 font-semibold">COSTO DIRECTO</th>
                  <th className="p-2 font-semibold">PRECIO DE VENTA</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {versions.map(v => (
                  <tr key={v.id} className="border-t border-slate-100 text-right">
                    <td className="p-2 text-left font-medium text-slate-800">{v.label}</td>
                    <td className="p-2 text-left text-slate-500">{new Date(v.createdAt).toLocaleDateString('es-AR')}</td>
                    <td className="p-2">{money(v.totals.direct)}</td>
                    <td className="p-2">{money(v.totals.sale)}</td>
                    <td className="p-2"><button onClick={() => printVersion(v)} className="text-blue-700 text-xs font-semibold hover:underline">Ver reporte</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};
