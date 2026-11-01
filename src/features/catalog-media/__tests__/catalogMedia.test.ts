import { describe, it, expect } from 'vitest';
import { findFicha, rubroFicha, rubroNumber } from '../catalogMedia';
import fichas from '../fichas.json';

const f = (name: string, category: string) => findFicha({ name, category })?.slug ?? null;

describe('catalogMedia', () => {
  it('carga las 44 fichas', () => { expect(fichas).toHaveLength(44); });

  it('toma el número de rubro aunque varíe el acento', () => {
    expect(rubroNumber('06 MAMPOSTERIA, Y OTROS CERRAMIENTOS')).toBe('06');
    expect(rubroNumber('06 MAMPOSTERÍA, Y OTROS CERRAMIENTOS')).toBe('06');
    expect(rubroNumber('INSTALACIONES')).toBeNull();
  });

  it('asigna fichas de construcción en seco', () => {
    expect(f('Pared divisoria Estándar (placa 12,5, montantes c/0,40) (Durlock)', '06 MAMPOSTERÍA, Y OTROS CERRAMIENTOS')).toBe('cs-tab-70-1x12');
    expect(f('Cielorraso suspendido de placa de yeso', '13 CIELORRASOS')).toBe('cs-cie-jt-12');
    expect(f('Revoque Seco (placa pegada) (Durlock)', '14 REVESTIMIENTOS')).toBe('cs-rev-om-12');
    expect(f('Revestimiento de placa de yeso sobre muro', '06 MAMPOSTERÍA, Y OTROS CERRAMIENTOS')).toBe('cs-rev-om-12');
  });

  it('asigna fichas de obra húmeda e instalaciones', () => {
    expect(f('Muro de ladrillo cerámico hueco 18', '06 MAMPOSTERÍA, Y OTROS CERRAMIENTOS')).toBe('mam-hue12');
    expect(f('Revoque grueso y fino interior', '08 REVOQUES')).toBe('rev-int');
    expect(f('Revoque exterior completo', '08 REVOQUES')).toBe('rev-ext');
    expect(f('Colocación de inodoro', '23 INSTALACIÓN SANITARIA')).toBe('san-ino');
    expect(f('Pintura látex interior', '34 PINTURA')).toBe('pin-lat');
  });

  it('no inventa ficha si no hay coincidencia', () => {
    expect(f('Limpieza final de obra', '02 TRABAJOS PRELIMINARES')).toBeNull();
    expect(f('Pintura látex interior', '06 MAMPOSTERÍA, Y OTROS CERRAMIENTOS')).toBeNull();
  });

  it('tiene imagen representativa por rubro', () => {
    expect(rubroFicha('13 CIELORRASOS')?.slug).toBe('cs-cie-jt-12');
    expect(rubroFicha('02 TRABAJOS PRELIMINARES')).toBeNull();
  });
});
