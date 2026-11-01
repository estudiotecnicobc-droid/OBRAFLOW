import { describe, it, expect } from 'vitest';
import { detailFamily, rubroImage, rubroNumber } from '../catalogMedia';

describe('catalogMedia', () => {
  it('toma el número de rubro aunque varíe el acento', () => {
    expect(rubroNumber('06 MAMPOSTERIA, Y OTROS CERRAMIENTOS')).toBe('06');
    expect(rubroNumber('06 MAMPOSTERÍA, Y OTROS CERRAMIENTOS')).toBe('06');
    expect(rubroNumber('INSTALACIONES')).toBeNull();
    expect(rubroNumber(null)).toBeNull();
  });

  it('solo devuelve imagen de rubro si existe', () => {
    expect(rubroImage('13 CIELORRASOS')).toBe('/catalogo/rubros/13.svg');
    expect(rubroImage('34 PINTURA')).toBeNull();
  });

  it('asigna la familia de detalle de las tareas en seco', () => {
    expect(detailFamily({ name: 'Pared divisoria Estándar (placa 12,5, montantes c/0,40) (Durlock)', category: '06 MAMPOSTERÍA, Y OTROS CERRAMIENTOS' })).toBe('tabique');
    expect(detailFamily({ name: 'Tabique de placa de yeso 70 mm', category: '06 MAMPOSTERÍA, Y OTROS CERRAMIENTOS' })).toBe('tabique');
    expect(detailFamily({ name: 'Cielorraso suspendido de placa de yeso', category: '13 CIELORRASOS' })).toBe('cielorraso');
    expect(detailFamily({ name: 'Revoque Seco (placa pegada) (Durlock)', category: '14 REVESTIMIENTOS' })).toBe('revestimiento');
    expect(detailFamily({ name: 'Revestimiento de placa de yeso sobre muro', category: '06 MAMPOSTERÍA, Y OTROS CERRAMIENTOS' })).toBe('revestimiento');
  });

  it('no asigna detalle a tareas que no son en seco', () => {
    expect(detailFamily({ name: 'Muro de ladrillo hueco 18', category: '06 MAMPOSTERÍA, Y OTROS CERRAMIENTOS' })).toBeNull();
    expect(detailFamily({ name: 'Pintura látex interior', category: '34 PINTURA' })).toBeNull();
  });
});
