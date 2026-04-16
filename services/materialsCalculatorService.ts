import type {
  MasterTask,
  MasterMaterial,
  LaborCategory,
  Tool,
  CalcItem,
  ResourceLine,
  APUCalcResult,
  AggregatedResourceLine,
  MaterialsCalculationResult,
} from '../types';

const WORKDAY_HOURS = 9;

function aggregateLines(
  lines: ResourceLine[],
): AggregatedResourceLine[] {
  const map = new Map<string, AggregatedResourceLine>();
  for (const line of lines) {
    const existing = map.get(line.key);
    if (existing) {
      existing.totalQuantity += line.totalQuantity;
      existing.totalCost += line.totalCost;
      if (!existing.sources.includes(line.sourceTaskName)) {
        existing.sources.push(line.sourceTaskName);
      }
    } else {
      map.set(line.key, {
        key: line.key,
        name: line.name,
        unit: line.unit,
        totalQuantity: line.totalQuantity,
        unitPrice: line.unitPrice,
        totalCost: line.totalCost,
        sources: [line.sourceTaskName],
        conversionFactor: line.conversionFactor,
        commercialUnit:   line.commercialUnit,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function calculateMaterials(
  items: CalcItem[],
  masterTasksMap: Record<string, MasterTask>,
  masterMaterialsMap: Record<string, MasterMaterial>,
  laborCategoriesMap: Record<string, LaborCategory>,
  toolsMap: Record<string, Tool>,
): MaterialsCalculationResult {
  const apuResults: APUCalcResult[] = [];
  const allMaterials: ResourceLine[] = [];
  const allLabor: ResourceLine[] = [];
  const allEquipment: ResourceLine[] = [];

  let totalMaterial = 0;
  let totalLabor = 0;
  let totalEquipment = 0;
  let totalFixed = 0;

  for (const item of items) {
    const task = masterTasksMap[item.masterTaskId];
    if (!task) continue;

    const materialLines: ResourceLine[] = [];
    const laborLines: ResourceLine[] = [];
    const equipmentLines: ResourceLine[] = [];

    // ── Materiales ──────────────────────────────────────────────────────────
    let unitMaterialCost = 0;
    for (const m of task.materials) {
      const livePrice = m.masterMaterialId
        ? masterMaterialsMap[m.masterMaterialId]?.unitPrice
        : undefined;
      const unitPrice = livePrice ?? m.lastKnownUnitPrice ?? 0;
      const waste = m.wastePercent ?? 0;
      const wasteFactor = 1 + waste / 100;
      const qtyPerUnit = m.quantity * wasteFactor;
      const totalQty = qtyPerUnit * item.quantity;
      const totalCost = unitPrice * totalQty;
      unitMaterialCost += unitPrice * qtyPerUnit;

      const key = m.masterMaterialId ?? m.materialName.toLowerCase().trim();
      const line: ResourceLine = {
        key,
        name: m.materialName,
        unit: m.unit,
        quantityPerUnit: qtyPerUnit,
        totalQuantity: totalQty,
        unitPrice,
        totalCost,
        wastePercent: waste,
        sourceTaskId: task.id,
        sourceTaskName: task.name,
        conversionFactor: m.conversionFactor,
        commercialUnit:   (m as { commercialUnit?: string }).commercialUnit,
      };
      materialLines.push(line);
      allMaterials.push(line);
    }

    // ── Mano de Obra ────────────────────────────────────────────────────────
    let unitLaborCost = 0;
    if ((task.dailyYield ?? 0) > 0) {
      for (const l of task.labor) {
        const cat = laborCategoriesMap[l.laborCategoryId];
        if (!cat) continue;
        const rate =
          (cat.basicHourlyRate || 0) *
          (1 + ((cat.socialChargesPercent || 0) + (cat.insurancePercent || 0)) / 100);
        const hoursPerUnit = (l.quantity * WORKDAY_HOURS) / task.dailyYield;
        const totalHH = hoursPerUnit * item.quantity;
        const unitPricePerHH = rate;
        const totalCost = rate * totalHH;
        unitLaborCost += rate * hoursPerUnit;

        const key = l.laborCategoryId;
        const line: ResourceLine = {
          key,
          name: l.laborCategoryName,
          unit: 'HH',
          quantityPerUnit: hoursPerUnit,
          totalQuantity: totalHH,
          unitPrice: unitPricePerHH,
          totalCost,
          wastePercent: 0,
          sourceTaskId: task.id,
          sourceTaskName: task.name,
        };
        laborLines.push(line);
        allLabor.push(line);
      }
    }

    // ── Equipos ─────────────────────────────────────────────────────────────
    let unitEquipmentCost = 0;
    for (const e of task.equipment) {
      const tool = toolsMap[e.toolId];
      const costPerHour = tool?.costPerHour ?? 0;
      const totalHM = e.hoursPerUnit * item.quantity;
      const totalCost = costPerHour * totalHM;
      unitEquipmentCost += costPerHour * e.hoursPerUnit;

      const key = e.toolId;
      const line: ResourceLine = {
        key,
        name: e.toolName,
        unit: 'HM',
        quantityPerUnit: e.hoursPerUnit,
        totalQuantity: totalHM,
        unitPrice: costPerHour,
        totalCost,
        wastePercent: 0,
        sourceTaskId: task.id,
        sourceTaskName: task.name,
      };
      equipmentLines.push(line);
      allEquipment.push(line);
    }

    const fixedUnit = task.fixedCost ?? 0;
    const unitTotal = unitMaterialCost + unitLaborCost + unitEquipmentCost + fixedUnit;

    totalMaterial += unitMaterialCost * item.quantity;
    totalLabor += unitLaborCost * item.quantity;
    totalEquipment += unitEquipmentCost * item.quantity;
    totalFixed += fixedUnit * item.quantity;

    apuResults.push({
      masterTaskId: task.id,
      name: task.name,
      unit: task.unit,
      quantity: item.quantity,
      unitCosts: {
        material: +unitMaterialCost.toFixed(2),
        labor: +unitLaborCost.toFixed(2),
        equipment: +unitEquipmentCost.toFixed(2),
        fixed: +fixedUnit.toFixed(2),
        total: +unitTotal.toFixed(2),
      },
      resources: {
        materials: materialLines,
        labor: laborLines,
        equipment: equipmentLines,
      },
    });
  }

  return {
    apuResults,
    aggregated: {
      materials: aggregateLines(allMaterials),
      labor: aggregateLines(allLabor),
      equipment: aggregateLines(allEquipment),
    },
    totals: {
      material: +totalMaterial.toFixed(2),
      labor: +totalLabor.toFixed(2),
      equipment: +totalEquipment.toFixed(2),
      fixed: +totalFixed.toFixed(2),
      total: +(totalMaterial + totalLabor + totalEquipment + totalFixed).toFixed(2),
    },
  };
}
