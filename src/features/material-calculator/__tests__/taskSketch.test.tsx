import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CHANDIAS_CATALOG } from '../catalog/chandiasCatalog';
import { TaskSketch } from '../TaskSketch';

describe('catálogo de Cómputo: esquemas y condiciones', () => {
  it('todas las tareas tienen esquema propio y condiciones completas', () => {
    for (const t of CHANDIAS_CATALOG) {
      expect(t.sketch, t.id).toBeDefined();
      expect(t.condiciones?.medicion.length, t.id).toBeGreaterThan(10);
      expect(t.condiciones?.incluye.length, t.id).toBeGreaterThan(10);
      expect(t.condiciones?.noIncluye.length, t.id).toBeGreaterThan(5);
    }
  });

  it('cada esquema se dibuja vacío y con medidas, sin NaN', () => {
    for (const t of CHANDIAS_CATALOG) {
      const filled = Object.fromEntries(t.dims.map(d => [d.id, '2.5']));
      for (const dv of [{}, filled]) {
        const svg = renderToStaticMarkup(<TaskSketch task={t} dimValues={dv} />);
        expect(svg.startsWith('<svg'), t.id).toBe(true);
        expect(svg.includes('NaN'), t.id).toBe(false);
      }
    }
  });

  it('las cotas usan coma decimal', () => {
    const t = CHANDIAS_CATALOG.find(x => x.id === 'MAM-003')!;
    const svg = renderToStaticMarkup(<TaskSketch task={t} dimValues={{ largo: '4.5', alto: '2.6' }} />);
    expect(svg).toContain('4,5 m');
    expect(svg).toContain('2,6 m');
  });
});
