/**
 * Hook de estado para la Calculadora Consolidada (server-side).
 *
 * Patrón: cálculo EXPLÍCITO (botón "Calcular") — no reactivo.
 * Ventaja: evita llamadas RPC en cada keystroke, muestra estado de carga claro.
 *
 * Flujo:
 *   1. addItem / updateItem / removeItem → actualiza items locales, marca isDirty
 *   2. calculate() → llama RPC, setResult, isDirty=false
 *   3. clear() → resetea todo
 */
import { useState, useCallback, useEffect } from 'react';
import { useMasterTasks } from './useMasterTasks';
import { calculateConsolidatedResources } from '../services/consolidatedCalculatorService';
import { generateId } from '../utils/generateId';
import type { CalcItem, RpcConsolidatedResult } from '../types';

export function useConsolidatedCalculator(organizationId: string) {
  const { tasks: masterTasks, loading: tasksLoading, error: tasksError } = useMasterTasks(organizationId);

  const [items,       setItems]       = useState<CalcItem[]>([]);
  const [result,      setResult]      = useState<RpcConsolidatedResult | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  /** true cuando los items cambiaron desde el último cálculo exitoso */
  const [isDirty,     setIsDirty]     = useState(false);

  // Limpiar resultado cuando no quedan items (sin llamar setState dentro de updater)
  useEffect(() => {
    if (items.length === 0) {
      setResult(null);
      setIsDirty(false);
    }
  }, [items.length]);

  const calculate = useCallback(async () => {
    if (items.length === 0) return;
    setCalculating(true);
    setError(null);
    try {
      const res = await calculateConsolidatedResources({ items, organizationId });
      setResult(res);
      setIsDirty(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al calcular');
    } finally {
      setCalculating(false);
    }
  }, [items, organizationId]);

  const addItem = (masterTaskId: string, quantity: number) => {
    const id = generateId();
    setItems(prev => [...prev, { id, masterTaskId, quantity }]);
    setIsDirty(true);
  };

  const updateItem = (id: string, qty: number) => {
    setItems(prev => prev.map(i => (i.id === id ? { ...i, quantity: qty } : i)));
    setIsDirty(true);
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    setIsDirty(true);
  };

  const clear = () => {
    setItems([]);
    setResult(null);
    setIsDirty(false);
    setError(null);
  };

  return {
    items,
    result,
    error:       tasksError ?? error,
    isDirty,
    loading:     tasksLoading,
    calculating,
    masterTasks,
    addItem,
    updateItem,
    removeItem,
    clear,
    calculate,
  };
}
