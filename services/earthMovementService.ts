import { EARTH_MOVEMENT_COEFFS } from '../constants';

/**
 * Parámetros de cálculo para APUs de Movimiento de Suelos (Chandías).
 *
 * Fuente: planilla de movimiento de suelos normalizada.
 * Estos valores son constantes de ingeniería — no dependen del tenant ni del proyecto.
 *
 * Uso futuro:
 *   - APUs de excavación: calcular volumen de extracción y transporte (m³ suelto)
 *   - APUs de relleno: calcular volumen de material compactado necesario
 */

export const { COEF_ESPONJ, COEF_RECOMP } = EARTH_MOVEMENT_COEFFS;

/**
 * Volumen suelto (esponjado) a partir del volumen neto excavado.
 * Aplica cuando se calcula material a transportar o cargar en camión.
 *
 * @param volNeto  Volumen en banco (m³ medido en perfil de terreno)
 * @returns        Volumen esponjado (m³)
 */
export function volumenEsponjado(volNeto: number): number {
  return +(volNeto * COEF_ESPONJ).toFixed(4);
}

/**
 * Volumen de material compactado necesario para un relleno dado.
 * Aplica cuando se calcula material de préstamo o relleno a compactar.
 *
 * @param volNeto  Volumen final requerido en banco (m³)
 * @returns        Volumen a proveer antes de compactar (m³)
 */
export function volumenRecompactado(volNeto: number): number {
  return +(volNeto * COEF_RECOMP).toFixed(4);
}

/**
 * Convierte volumen esponjado de vuelta a volumen neto.
 * Útil para verificar cantidades o hacer el camino inverso.
 *
 * @param volEsponjado  Volumen suelto (m³)
 * @returns             Volumen neto equivalente (m³)
 */
export function volumenNetoDesdeEsponjado(volEsponjado: number): number {
  return +(volEsponjado / COEF_ESPONJ).toFixed(4);
}
