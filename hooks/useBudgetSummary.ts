/**
 * hooks/useBudgetSummary.ts
 *
 * Hook que computa el Cuadro Empresario completo + Coeficiente de Pase K.
 *
 * Recibe el directCost ya calculado por useProjectSchedule (itemCosts)
 * y lee businessConfig de useBudgetKStore. No duplica lógica: delega el
 * cálculo a la función pura `computeBudgetKSummary` del store.
 *
 * Uso típico:
 *   const { itemCosts } = useProjectSchedule(...);
 *   const totalCD = useMemo(() => itemCosts.reduce((s, ic) => s + ic.totalCost, 0), [itemCosts]);
 *   const summary = useBudgetSummary(project.id, totalCD, { legacyPricing: project.pricing });
 */

import { useEffect, useMemo } from 'react';
import { BudgetKSummary, BusinessConfig, PricingConfig } from '../types';
import {
  useBudgetKStore,
  selectBusinessConfig,
  computeBudgetKSummary,
} from '../store/useBudgetKStore';

interface UseBudgetSummaryOptions {
  /**
   * Si se provee, inicializa la config del proyecto desde PricingConfig legacy
   * la primera vez que se monta (solo si el proyecto no tiene config K propia).
   * Típicamente: `project.pricing`.
   */
  legacyPricing?: PricingConfig;
}

/**
 * Calcula el Cuadro Empresario y el Coeficiente de Pase K.
 *
 * @param projectId   ID del proyecto activo.
 * @param directCost  Costo Directo total (suma de itemCosts del presupuesto).
 * @param options     Opciones opcionales (ver UseBudgetSummaryOptions).
 */
export function useBudgetSummary(
  projectId: string,
  directCost: number,
  options: UseBudgetSummaryOptions = {},
): BudgetKSummary {
  const { legacyPricing } = options;

  // ── Inicialización desde pricing legacy (una sola vez por proyecto) ────────
  // initFromPricing es una acción de Zustand: referencia estable entre renders.
  const initFromPricing = useBudgetKStore(state => state.initFromPricing);

  useEffect(() => {
    initFromPricing(projectId, legacyPricing);
  }, [projectId, initFromPricing, legacyPricing]);
  // initFromPricing ya guarda internamente si el proyecto tiene config:
  // re-ejecutarlo con legacyPricing distinto es seguro (no sobreescribe).

  // ── Selector memoizado para evitar nueva función en cada render ────────────
  // Sin esto, Zustand v5 recibe un selector distinto en cada render y aunque
  // el resultado sea igual, puede disparar re-renders en versiones anteriores.
  const selector = useMemo(() => selectBusinessConfig(projectId), [projectId]);
  const config   = useBudgetKStore(selector) as BusinessConfig;

  // ── Cálculo delegado a la función pura (sin lógica duplicada) ─────────────
  return useMemo(
    () => computeBudgetKSummary(directCost, config),
    [directCost, config],
  );
}
