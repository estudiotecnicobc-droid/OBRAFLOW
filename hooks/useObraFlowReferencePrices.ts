import { useEffect, useState } from 'react';
import { resourcesService } from '../services/resourcesService';
import type { ReferencePrice } from '../src/features/material-calculator/engine/chandias';

/** Precios de referencia del Catálogo ObraFlow (recursos globales tipo MATERIAL), por código. */
export function useObraFlowReferencePrices(): Map<string, ReferencePrice> {
  const [refs, setRefs] = useState<Map<string, ReferencePrice>>(() => new Map());
  useEffect(() => {
    let alive = true;
    resourcesService.listGlobal().then(list => {
      if (!alive) return;
      const map = new Map<string, ReferencePrice>();
      for (const r of list) {
        if (r.type === 'MATERIAL' && r.code && r.baseCost > 0) {
          map.set(r.code.toUpperCase(), { code: r.code, name: r.name, unit: r.unit, cost: r.baseCost });
        }
      }
      setRefs(map);
    });
    return () => { alive = false; };
  }, []);
  return refs;
}
