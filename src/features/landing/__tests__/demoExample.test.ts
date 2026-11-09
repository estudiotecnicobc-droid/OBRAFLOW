import { describe, expect, it } from 'vitest';
import { RUBRO_TEMPLATES } from '../../quickBudget/rubroTemplates';
import { rubroCategory } from '../../quickBudget/engine';
import { buildDemoRows, buildSheetLines, DEMO_SHEETS } from '../../demo/demoHouse';
import { BUDGET_GROUPS, COST_SPLIT, DIRECT_COST, ITEM_COUNT, RUBRO_COUNT, WALL_CODE, WALL_SHEET, wallQuantity, wallUnitCost } from '../demoExample';

const rows = buildDemoRows(RUBRO_TEMPLATES);

describe('ejemplo de la landing', () => {
  it('coincide con la obra de ejemplo de la plataforma', () => {
    expect(rows).toHaveLength(ITEM_COUNT);
    expect(new Set(rows.map(r => rubroCategory(r.rubro))).size).toBe(RUBRO_COUNT);
    const wall = rows.find(r => r.task.code === WALL_CODE);
    expect(wall?.quantity).toBeCloseTo(wallQuantity(), 2);
  });

  it('la planilla del muro es la misma que la de la obra de ejemplo', () => {
    let n = 0;
    const { lines } = buildSheetLines(DEMO_SHEETS[WALL_CODE], () => `l${n++}`);
    expect(lines.map(l => l.subtotal)).toEqual(WALL_SHEET.map(l => l.subtotal));
  });

  it('los montos cierran', () => {
    expect(DIRECT_COST).toBe(96828296);
    expect(COST_SPLIT.materials + COST_SPLIT.labor + COST_SPLIT.other).toBe(DIRECT_COST);
    expect(Math.round(wallUnitCost())).toBe(46486);
    expect(Math.round(wallUnitCost() * wallQuantity())).toBe(3935017);
    expect(BUDGET_GROUPS).toHaveLength(10);
  });
});
