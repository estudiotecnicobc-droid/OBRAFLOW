import React from 'react';
import { Lock, ArrowUpCircle } from 'lucide-react';
import { FeatureKey, PlanId } from '../types';

// ─── Mapa de labels por feature ───────────────────────────────────────────────

const FEATURE_LABELS: Partial<Record<FeatureKey, { name: string; plan: PlanId; planLabel: string }>> = {
  apu_maestros:           { name: 'APUs Maestros',           plan: 'professional', planLabel: 'Professional' },
  computo_parametrico:    { name: 'Cómputo Paramétrico',     plan: 'professional', planLabel: 'Professional' },
  reportes_centralizados: { name: 'Reportes Centralizados',  plan: 'professional', planLabel: 'Professional' },
  comparacion_costos:     { name: 'Comparación de Costos',   plan: 'business',     planLabel: 'Business' },
  branding_reportes:      { name: 'Branding en Reportes',    plan: 'professional', planLabel: 'Professional' },
  sincronizacion_viva:    { name: 'Sincronización Automática', plan: 'professional', planLabel: 'Professional' },
};

// ─── Componente ───────────────────────────────────────────────────────────────

interface Props {
  feature: FeatureKey;
  /** Acción al hacer click en "Ver planes". Por defecto no hace nada. */
  onUpgrade?: () => void;
}

export const UpgradePrompt: React.FC<Props> = ({ feature, onUpgrade }) => {
  const meta = FEATURE_LABELS[feature];
  const featureName = meta?.name ?? feature;
  const planLabel   = meta?.planLabel ?? 'Professional';

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[320px] px-8 text-center">
      <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm max-w-sm w-full">
        {/* Icono */}
        <div className="flex items-center justify-center w-14 h-14 bg-slate-100 rounded-full mx-auto mb-4">
          <Lock size={24} className="text-slate-400" />
        </div>

        {/* Texto */}
        <h3 className="text-lg font-bold text-slate-800 mb-2">
          {featureName}
        </h3>
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          Esta función está disponible a partir del plan{' '}
          <span className="font-semibold text-blue-600">{planLabel}</span>.
          Actualiza tu plan para desbloquearlo.
        </p>

        {/* CTA */}
        {onUpgrade && (
          <button
            onClick={onUpgrade}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
          >
            <ArrowUpCircle size={16} />
            Ver planes
          </button>
        )}
        {!onUpgrade && (
          <p className="text-xs text-slate-400">
            Contacta con el administrador de tu organización para actualizar.
          </p>
        )}
      </div>
    </div>
  );
};
