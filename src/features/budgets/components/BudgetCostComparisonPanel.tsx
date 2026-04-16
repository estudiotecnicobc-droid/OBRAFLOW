/**
 * BudgetCostComparisonPanel.tsx
 * ──────────────────────────────
 * QUÉ HACE:
 *   Panel React que permite elegir dos fechas base de costos,
 *   recalcular el presupuesto y comparar resultados lado a lado.
 *   Muestra: totales, diferencia, tabla por ítem, top variaciones.
 *
 * QUÉ TENÉS QUE HACER VOS:
 *   Importarlo en tu pantalla de presupuesto y pasarle projectId y organizationId.
 *   Ejemplo mínimo:
 *
 *     import { BudgetCostComparisonPanel } from
 *       'src/features/budgets/components/BudgetCostComparisonPanel';
 *
 *     <BudgetCostComparisonPanel
 *       projectId={project.id}
 *       organizationId={user.organizationId}
 *     />
 *
 *   IMPORTANTE: organizationId debe ser UUID real (organizations.id),
 *   no el ID legacy 'org_a'. Si estás en AuthContext, usá activeOrganizationId.
 */

import React from 'react';
import { useBudgetCostComparison } from '../hooks/useBudgetCostComparison';
import type { ComparisonItem, ComparisonResult } from '../hooks/useBudgetCostComparison';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function varColor(pct: number | null): string {
  if (pct === null) return 'text-gray-400';
  if (pct > 0)  return 'text-red-600';
  if (pct < 0)  return 'text-green-600';
  return 'text-gray-500';
}

function varLabel(pct: number | null): string {
  if (pct === null) return '—';
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

const DOMINANT_LABEL: Record<NonNullable<ComparisonItem['dominant']>, string> = {
  material:  'Materiales',
  labor:     'Mano de obra',
  equipment: 'Equipos',
  fixed:     'Costo fijo',
};

const QUALITY_BADGE: Record<ComparisonItem['costQuality'], { text: string; cls: string }> = {
  snapshot:   { text: 'Con snapshot', cls: 'bg-green-100 text-green-700' },
  static:     { text: 'Tarifa fija',  cls: 'bg-gray-100 text-gray-500'  },
  incomplete: { text: 'Sin tarifa',   cls: 'bg-amber-100 text-amber-700' },
};

/** Determina qué componente impulsó más la variación absoluta del presupuesto */
function dominantBudgetDriver(items: ComparisonItem[]): string | null {
  let matDiff = 0, labDiff = 0, eqDiff = 0;
  for (const i of items) {
    matDiff += (i.matCostB - i.matCostA) * i.quantity;
    labDiff += (i.labCostB - i.labCostA) * i.quantity;
    eqDiff  += (i.eqCostB  - i.eqCostA)  * i.quantity;
  }
  const abs = [
    { label: 'Mano de obra', val: Math.abs(labDiff) },
    { label: 'Materiales',   val: Math.abs(matDiff) },
    { label: 'Equipos',      val: Math.abs(eqDiff)  },
  ].sort((a, b) => b.val - a.val);
  return abs[0].val > 0 ? abs[0].label : null;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  projectId:      string;
  organizationId: string;
}

// ── Componente ────────────────────────────────────────────────────────────────

export function BudgetCostComparisonPanel({ projectId, organizationId }: Props) {
  const {
    dateA, setDateA,
    dateB, setDateB,
    result, loading, error,
    recalculate,
  } = useBudgetCostComparison(projectId, organizationId);

  // Top 5 por variación absoluta
  const top5 = result
    ? [...result.items]
        .filter(i => i.varPct !== null && i.unitCostA > 0)
        .sort((a, b) => Math.abs(b.varPct!) - Math.abs(a.varPct!))
        .slice(0, 5)
    : [];

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Comparación de costos</h2>
        {result && (
          <span className="text-xs text-gray-400">
            Calculado: {new Date(result.computedAt).toLocaleString('es-AR')}
          </span>
        )}
      </div>

      {/* ── Selector de fechas + botón ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Fecha base A</label>
          <input
            type="date"
            value={dateA}
            onChange={e => setDateA(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Fecha base B</label>
          <input
            type="date"
            value={dateB}
            onChange={e => setDateB(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={recalculate}
          disabled={loading || !projectId}
          className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Calculando…' : 'Recalcular'}
        </button>

        {result && (
          <div className="ml-auto text-xs text-gray-500 space-x-3">
            <span>Ítems: {result.items.length}</span>
            {result.skippedItems > 0 && (
              <span className="text-amber-600">Sin APU: {result.skippedItems}</span>
            )}
            <span className={result.fallbackResources > 0 ? 'text-amber-600' : 'text-green-600'}>
              Snapshots: {result.snapshotResources} | Fallback: {result.fallbackResources}
            </span>
          </div>
        )}
      </div>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Resumen ────────────────────────────────────────────────────────── */}
      {result && (
        <>
          {/* ── Resumen ejecutivo ─────────────────────────────────────────── */}
          <ExecutiveSummary result={result} dateA={dateA} dateB={dateB} />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard
              label={`Total ${dateA}`}
              value={`$${fmt(result.totalA)}`}
              sub="fecha A"
            />
            <SummaryCard
              label={`Total ${dateB}`}
              value={`$${fmt(result.totalB)}`}
              sub="fecha B"
            />
            <SummaryCard
              label="Diferencia"
              value={`${result.diff >= 0 ? '+' : ''}$${fmt(result.diff)}`}
              valueClass={result.diff > 0 ? 'text-red-600' : result.diff < 0 ? 'text-green-600' : 'text-gray-700'}
              sub="B − A"
            />
            <SummaryCard
              label="Variación"
              value={varLabel(result.diffPct)}
              valueClass={varColor(result.diffPct)}
              sub="porcentual"
            />
          </div>

          {/* ── Top 5 ────────────────────────────────────────────────────── */}
          {top5.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Top {top5.length} ítems con mayor variación
              </h3>
              <div className="space-y-1">
                {top5.map(item => (
                  <div key={item.key} className="flex items-center justify-between px-3 py-1.5 bg-gray-50 rounded text-sm">
                    <span className="text-gray-700 truncate max-w-xs">
                      {item.code ? <span className="font-mono text-xs text-gray-400 mr-2">{item.code}</span> : null}
                      {item.name}
                      {item.dominant && (
                        <span className="ml-2 text-xs text-gray-400 border border-gray-200 rounded px-1">
                          {DOMINANT_LABEL[item.dominant]}
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-4 shrink-0 ml-4">
                      <span className="text-gray-500 text-xs">
                        ${fmt(item.unitCostA)} → ${fmt(item.unitCostB)}
                      </span>
                      <span className={`font-medium w-16 text-right ${varColor(item.varPct)}`}>
                        {varLabel(item.varPct)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Tabla de ítems ───────────────────────────────────────────── */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Detalle por ítem</h3>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <th className="text-left px-3 py-2">Ítem</th>
                    <th className="text-right px-3 py-2">Cant.</th>
                    <th className="text-right px-3 py-2">Total A</th>
                    <th className="text-right px-3 py-2">Total B</th>
                    <th className="text-right px-3 py-2">Var %</th>
                    <th className="text-left px-3 py-2">Datos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {result.items.map(item => (
                    <ItemRow key={item.key} item={item as ComparisonItem} />
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold text-gray-700 border-t border-gray-200">
                    <td className="px-3 py-2" colSpan={2}>Total directo</td>
                    <td className="px-3 py-2 text-right">${fmt(result.totalA)}</td>
                    <td className="px-3 py-2 text-right">${fmt(result.totalB)}</td>
                    <td className={`px-3 py-2 text-right font-medium ${varColor(result.diffPct)}`}>
                      {varLabel(result.diffPct)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Estado vacío ─────────────────────────────────────────────────── */}
      {!result && !loading && !error && (
        <div className="text-center py-12 text-gray-400 text-sm">
          Elegí dos fechas y presioná <strong>Recalcular</strong> para comparar costos.
        </div>
      )}
    </div>
  );
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function SummaryCard({
  label, value, sub, valueClass = 'text-gray-900',
}: {
  label: string; value: string; sub: string; valueClass?: string;
}) {
  return (
    <div className="p-4 bg-white border border-gray-200 rounded-lg">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-semibold ${valueClass}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}

function ItemRow({ item }: { item: ComparisonItem }) {
  const badge = QUALITY_BADGE[item.costQuality];
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-3 py-2 text-gray-700">
        {item.code && (
          <span className="font-mono text-xs text-gray-400 mr-2">{item.code}</span>
        )}
        {item.name}
        {item.warnings.length > 0 && (
          <span className="ml-1 text-amber-500" title={item.warnings.join('\n')}>⚠</span>
        )}
      </td>
      <td className="px-3 py-2 text-right text-gray-600">{item.quantity}</td>
      <td className="px-3 py-2 text-right text-gray-700">${fmt(item.totalA)}</td>
      <td className="px-3 py-2 text-right text-gray-700">${fmt(item.totalB)}</td>
      <td className={`px-3 py-2 text-right font-medium ${varColor(item.varPct)}`}>
        {varLabel(item.varPct)}
      </td>
      <td className="px-3 py-2">
        <span className={`text-xs px-1.5 py-0.5 rounded ${badge.cls}`}>{badge.text}</span>
      </td>
    </tr>
  );
}

function ExecutiveSummary({
  result, dateA, dateB,
}: {
  result: ComparisonResult; dateA: string; dateB: string;
}) {
  const driver = dominantBudgetDriver(result.items);
  const pct    = result.diffPct;

  const sentence = pct === null || pct === 0
    ? `Sin variación entre ${dateA} y ${dateB}.`
    : `El presupuesto ${pct > 0 ? 'aumentó' : 'bajó'} ${varLabel(pct)} entre ${dateA} y ${dateB}.`;

  return (
    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900 flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="font-medium">{sentence}</span>
      {driver && (
        <span className="text-blue-700">
          Principal componente: <strong>{driver}</strong>.
        </span>
      )}
      {result.fallbackResources > 0 && (
        <span className="text-amber-700 ml-auto text-xs">
          {result.fallbackResources} recurso(s) sin snapshot — variación puede estar subestimada.
        </span>
      )}
    </div>
  );
}
