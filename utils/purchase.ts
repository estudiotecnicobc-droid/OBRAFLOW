const DISCRETE_UNITS = new Set(['u', 'un', 'unidad', 'rollo', 'bolsa', 'balde', 'barra', 'cartucho', 'lata']);

/** Insumos que se compran por pieza: si no hay unidad comercial, la compra es la cantidad redondeada hacia arriba. */
export function piecePurchase(unit: string, totalQuantity: number): number | undefined {
  if (!DISCRETE_UNITS.has(unit.trim().toLowerCase()) || !(totalQuantity > 0)) return undefined;
  return Math.ceil(totalQuantity - 1e-9);
}
