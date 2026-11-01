/**
 * Cómputo Paramétrico — módulo unificado
 *
 * Fusiona dos modos de cálculo en un solo panel:
 *   · Por Dimensiones  → ChandiasCalculator (catálogo tipado, fórmulas paramétricas)
 *   · Por APU          → MaterialsCalculator (APUs de la org, MO, equipos)
 *
 * Estrategia de unificación: thin wrapper.
 * Los módulos subyacentes NO se modifican — solo se encapsulan.
 * Esto permite validar el módulo unificado sin riesgo para los componentes existentes.
 *
 * Para agregar nuevas fuentes de cálculo (ej: catálogo propio, RPC, etc.):
 * → añadir un nuevo valor a `Mode` y renderizar el componente correspondiente.
 * → NO tocar ChandiasCalculator ni MaterialsCalculator.
 */

import React, { useState } from 'react';
import { Ruler, Calculator, Info } from 'lucide-react';
import { ChandiasCalculator } from '../material-calculator/ChandiasCalculator';
import { MaterialsCalculator } from '../../../components/MaterialsCalculator';
import { CalcErrorBoundary } from '../../../components/CalcErrorBoundary';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Mode = 'dimensiones' | 'apu';

const MODES: { id: Mode; label: string; icon: React.ReactNode; description: string; color: string; activeColor: string }[] = [
  {
    id: 'dimensiones',
    label: 'Por Dimensiones',
    icon: <Ruler size={15} />,
    description: 'Catálogo Chandías — ingresá largo, ancho, espesor y el sistema calcula materiales automáticamente.',
    color: 'text-teal-700',
    activeColor: 'text-teal-700 bg-white shadow-sm',
  },
  {
    id: 'apu',
    label: 'Por APU',
    icon: <Calculator size={15} />,
    description: 'APUs de tu organización — ingresá cantidad de cada análisis de precio unitario.',
    color: 'text-amber-700',
    activeColor: 'text-amber-700 bg-white shadow-sm',
  },
];

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props {
  organizationId: string;
  /** Navegación del módulo Presupuesto (para «Ver en presupuesto»). */
  onNavigate?: (tab: string) => void;
}

export const ParametricCalculator: React.FC<Props> = ({ organizationId, onNavigate }) => {
  const [mode, setMode] = useState<Mode>('dimensiones');

  const activeMode = MODES.find(m => m.id === mode)!;

  return (
    <div className="space-y-5">

      {/* Selector de modo */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                mode === m.id ? m.activeColor : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {m.icon}
              {m.label}
            </button>
          ))}
        </div>

        {/* Descripción del modo activo */}
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <Info size={12} />
          {activeMode.description}
        </span>
      </div>

      {/* Contenido del modo activo */}
      {mode === 'dimensiones' && (
        <ChandiasCalculator onNavigate={onNavigate} />
      )}

      {mode === 'apu' && (
        <CalcErrorBoundary>
          <MaterialsCalculator organizationId={organizationId} />
        </CalcErrorBoundary>
      )}
    </div>
  );
};
