import React from 'react';
import { usePlan } from '../hooks/usePlan';
import { FeatureKey } from '../types';
import { UpgradePrompt } from './UpgradePrompt';

// ─── Componente ───────────────────────────────────────────────────────────────

interface Props {
  feature:   FeatureKey;
  /** Contenido alternativo cuando la feature no está disponible.
   *  Si no se provee, se muestra <UpgradePrompt>. */
  fallback?: React.ReactNode;
  children:  React.ReactNode;
  /** Acción al hacer click en "Ver planes" dentro del UpgradePrompt */
  onUpgrade?: () => void;
}

/**
 * Bloquea su contenido si la organización no tiene acceso a `feature`.
 * - Mientras carga: no renderiza nada (evita flash de contenido bloqueado).
 * - Si feature no habilitada: muestra `fallback` o `<UpgradePrompt>`.
 * - Si feature habilitada: renderiza `children` normalmente.
 */
export const FeatureGate: React.FC<Props> = ({ feature, fallback, children, onUpgrade }) => {
  const { hasFeature, loading } = usePlan();

  // Esperar sin mostrar nada hasta saber el plan (evita flash)
  if (loading) return null;

  if (!hasFeature(feature)) {
    return (
      <>
        {fallback ?? <UpgradePrompt feature={feature} onUpgrade={onUpgrade} />}
      </>
    );
  }

  return <>{children}</>;
};
