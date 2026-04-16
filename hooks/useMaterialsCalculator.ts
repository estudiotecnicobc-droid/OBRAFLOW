import { useState, useMemo } from 'react';
import { useMasterTasks } from './useMasterTasks';
import { useUnifiedMaterials } from './useUnifiedMaterials';
import { useERP } from '../context/ERPContext';
import { calculateMaterials } from '../services/materialsCalculatorService';
import { generateId } from '../utils/generateId';
import { normalizeStr } from '../utils/normalizeStr';
import type { CalcItem, MasterTask, MaterialsCalculationResult } from '../types';

export function useMaterialsCalculator(organizationId: string) {
  const { tasks: masterTasks, loading: tasksLoading, error: tasksError } = useMasterTasks(organizationId);
  const { masterMaterialsMap, list, loading: matsLoading, error: matsError } = useUnifiedMaterials(organizationId);
  const { laborCategoriesMap, toolsMap } = useERP();

  const [items, setItems] = useState<CalcItem[]>([]);

  /**
   * Índice de precio/conversión por código o nombre normalizado.
   * Construido desde useUnifiedMaterials.list — incluye master_materials y resources.
   * Usado como fallback para materiales sin FK (masterMaterialId = null).
   */
  const nameIndex = useMemo(() => {
    const m = new Map<string, { cost: number; commercialUnit?: string; conversionFactor?: number }>();
    for (const u of list) {
      const entry = { cost: u.cost, commercialUnit: u.commercialUnit, conversionFactor: u.conversionFactor };
      if (u.code) m.set(normalizeStr(u.code), entry);
      m.set(normalizeStr(u.name), entry);
    }
    return m;
  }, [list]);

  /**
   * masterTasksMap enriquecido con precios de la lista unificada.
   * Solo actúa sobre materiales sin masterMaterialId (sin FK a master_materials).
   * Materiales con FK siguen obteniendo su precio de masterMaterialsMap (ruta UUID).
   * Inyecta: lastKnownUnitPrice, commercialUnit, conversionFactor.
   */
  const masterTasksMap = useMemo(() => {
    const base: Record<string, MasterTask> = Object.fromEntries(masterTasks.map(t => [t.id, t]));
    if (nameIndex.size === 0) return base;

    const result: Record<string, MasterTask> = {};
    for (const [id, task] of Object.entries(base)) {
      const needsEnrichment = task.materials.some(
        m => !m.masterMaterialId && (m.lastKnownUnitPrice == null || !m.commercialUnit),
      );
      if (!needsEnrichment) { result[id] = task; continue; }

      result[id] = {
        ...task,
        materials: task.materials.map(m => {
          if (m.masterMaterialId) return m; // FK activo → precio resuelto por masterMaterialsMap
          const match = nameIndex.get(normalizeStr(m.materialName));
          if (!match) return m;
          return {
            ...m,
            lastKnownUnitPrice: match.cost > 0 ? match.cost : m.lastKnownUnitPrice,
            commercialUnit:     m.commercialUnit   ?? match.commercialUnit,
            conversionFactor:   m.conversionFactor ?? match.conversionFactor,
          };
        }),
      };
    }
    return result;
  }, [masterTasks, nameIndex]);

  const result = useMemo<MaterialsCalculationResult | null>(() => {
    if (items.length === 0) return null;
    return calculateMaterials(
      items,
      masterTasksMap,
      masterMaterialsMap,
      laborCategoriesMap,
      toolsMap,
    );
  }, [items, masterTasksMap, masterMaterialsMap, laborCategoriesMap, toolsMap]);

  const addItem = (masterTaskId: string, quantity: number) => {
    const id = generateId();
    setItems(prev => [...prev, { id, masterTaskId, quantity }]);
  };

  const updateItem = (id: string, qty: number) =>
    setItems(prev => prev.map(i => (i.id === id ? { ...i, quantity: qty } : i)));

  const removeItem = (id: string) =>
    setItems(prev => prev.filter(i => i.id !== id));

  const clear = () => setItems([]);

  return {
    items,
    result,
    loading: tasksLoading || matsLoading,
    error: tasksError ?? matsError ?? null,
    masterTasks,
    addItem,
    updateItem,
    removeItem,
    clear,
  };
}
