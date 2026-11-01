import React from 'react';
import { Ruler, Shapes, Pencil, AlertTriangle } from 'lucide-react';
import type { QuantitySource } from '../utils/quantitySource';

interface Props {
  source: QuantitySource;
  onClick?: () => void;
}

const fmt = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 2 });

export const QuantitySourceBadge: React.FC<Props> = ({ source, onClick }) => {
  let cls = 'bg-slate-100 text-slate-500 border-slate-200';
  let icon = <Pencil size={9} />;
  let label = 'Manual';
  let title = 'Cantidad cargada a mano. Clic para medirla con una planilla.';

  if (source.kind === 'medido') {
    if (source.outOfSync) {
      cls = 'bg-amber-50 text-amber-700 border-amber-300';
      icon = <AlertTriangle size={9} />;
      label = 'Medido ≠';
      title = `La cantidad no coincide con la planilla (${fmt(source.sheet?.totalQuantity ?? 0)}). Clic para revisar.`;
    } else {
      cls = 'bg-emerald-50 text-emerald-700 border-emerald-200';
      icon = <Ruler size={9} />;
      label = 'Medido';
      title = `Sale de la planilla de medición (${source.sheet?.lines.length ?? 0} líneas). Clic para abrirla.`;
    }
  } else if (source.kind === 'calculador') {
    cls = 'bg-teal-50 text-teal-700 border-teal-200';
    icon = <Shapes size={9} />;
    label = 'Calculador';
    title = 'Cargada desde el Calculador de cómputo. Clic para medirla con una planilla.';
  }

  const base = `inline-flex items-center gap-0.5 px-1.5 py-px rounded-full border text-[9px] font-semibold leading-tight whitespace-nowrap ${cls}`;
  if (!onClick) return <span title={title} className={base}>{icon}{label}</span>;
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick(); }}
      title={title}
      className={`${base} hover:brightness-95 cursor-pointer`}
    >
      {icon}{label}
    </button>
  );
};
