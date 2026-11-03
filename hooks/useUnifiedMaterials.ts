/**
 * useUnifiedMaterials — fuente unificada de materiales para la UI.
 *
 * Fusiona 3 fuentes en orden de prioridad ascendente:
 *   1. resources tipo MATERIAL (Supabase global/org — prioridad mínima, seleccionables)
 *   2. materials (ERPContext — proyecto, prioridad baja)
 *   3. master_materials (Supabase org catalog — prioridad alta, sobreescribe)
 *
 * Criterio de unidades (migración 20261103100100): `master_materials.unit_price`
 * está SIEMPRE en unidad técnica. `conversionFactor` queda como evidencia para
 * compras y para derivar un precio comercial (`unitPrice × conversionFactor`)
 * cuando la UI lo necesita como etiqueta. No se divide nada en este hook.
 *
 * Devuelve:
 *   · list              — materiales unificados, cost = precio TÉCNICO
 *                         (compatible con OrgMaterialLookup del motor Chandías)
 *   · masterMaterialsMap — Record<uuid, MasterMaterial> con unitPrice tal cual (técnico)
 *                          (para calculateMasterTaskCost / calculateMaterials)
 *   · getUnifiedMaterial — lookup por code o nombre normalizado
 *   · loading / error
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { MasterMaterial, Resource } from '../types';
import { masterMaterialsService } from '../services/masterMaterialsService';
import { resourcesService } from '../services/resourcesService';
import { technicalUnitPrice, commercialUnitPrice } from '../services/pricing/technicalUnitPrice';
import { useERP } from '../context/ERPContext';
import { normalizeStr } from '../utils/normalizeStr';

// ─── Tipo público ──────────────────────────────────────────────────────────────

export interface UnifiedMaterial {
  masterId?: string;       // master_materials.id UUID — para FK lookups
  code?: string;
  name: string;
  unit: string;            // unidad técnica (kg, m3, m2, etc.)
  cost: number;            // precio TÉCNICO unitario (ya aplicado conversionFactor)
  commercialUnit?: string; // etiqueta de compra. Ej: "bolsa 50 kg"
  conversionFactor?: number; // 1 unidad comercial = N unidades técnicas
  commercialPrice?: number;  // precio COMERCIAL original (unitPrice sin dividir)
  source: 'resources' | 'master_materials' | 'materials';
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

interface UseUnifiedMaterialsReturn {
  list: UnifiedMaterial[];
  masterMaterialsMap: Record<string, MasterMaterial>;
  /** Busca por código exacto (case-insensitive), luego por nombre normalizado. */
  getUnifiedMaterial: (codeOrName: string) => UnifiedMaterial | undefined;
  loading: boolean;
  error: string | null;
  /** Recarga materiales desde Supabase y resources. Útil para el botón "Actualizar precios". */
  refetch: () => Promise<void>;
}

export function useUnifiedMaterials(organizationId: string): UseUnifiedMaterialsReturn {
  const { materials: projectMaterials } = useERP();
  const [masterMaterials, setMasterMaterials] = useState<MasterMaterial[]>([]);
  const [resourceMaterials, setResourceMaterials] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      // Cargar en paralelo; resources falla silenciosamente (puede no existir para org legacy)
      const [mats, resources] = await Promise.all([
        masterMaterialsService.list(organizationId),
        resourcesService.listForOrg(organizationId).catch(() => []),
      ]);

      // Construir mapa de precios técnicos por resources (code y name normalizados)
      // resources.baseCost ya es precio técnico (nunca comercial)
      const resourcePriceByNorm = new Map<string, number>();
      for (const r of resources) {
        if (r.type === 'MATERIAL' && r.baseCost > 0) {
          if (r.code) resourcePriceByNorm.set(normalizeStr(r.code), r.baseCost);
          resourcePriceByNorm.set(normalizeStr(r.name), r.baseCost);
        }
      }

      // Enriquecer master_materials:
      //   · Sin factor (o factor ≤ 1): si hay resource con precio técnico, se usa como override.
      //   · Con conversionFactor > 1: NO se pisa con resources (resources carece de factor;
      //     usar su baseCost rompería la convención — resources.baseCost es técnico pero el
      //     master puede estar en estado 'commercial_legacy' donde su propio unitPrice todavía
      //     es comercial). technicalUnitPrice()/commercialUnitPrice() resuelven ambos estados.
      const enriched = mats.map(m => {
        const hasConversion = !!(m.conversionFactor && m.conversionFactor > 1);
        if (hasConversion) return m;

        const keyCode = m.code ? normalizeStr(m.code) : null;
        const keyName = normalizeStr(m.name);
        const rCost = (keyCode && resourcePriceByNorm.get(keyCode)) || resourcePriceByNorm.get(keyName);
        if (rCost != null && rCost > 0) {
          return { ...m, unitPrice: rCost };
        }
        return m;
      });

      setMasterMaterials(enriched);
      // Guardar recursos seleccionables (tipo MATERIAL, activos, con precio)
      setResourceMaterials(resources.filter(r => r.type === 'MATERIAL' && r.isActive && r.baseCost > 0));
    } catch (e: any) {
      setError(e.message ?? 'Error al cargar materiales');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  // UUID-keyed map con unitPrice = precio TÉCNICO.
  // Usado por calculateMasterTaskCost / calculateMaterials — NO tocar su interfaz.
  // Aplica technicalUnitPrice() para cubrir ambos estados: 'technical' (post-migración,
  // devuelve el valor tal cual) y commercial_legacy / NULL con factor > 1 (divide).
  const masterMaterialsMap = useMemo(
    () => Object.fromEntries(
      masterMaterials.map(m => [m.id, { ...m, unitPrice: technicalUnitPrice(m) }]),
    ),
    [masterMaterials],
  );

  // Lista unificada (precio técnico en cost, unit poblado)
  const list = useMemo((): UnifiedMaterial[] => {
    const map = new Map<string, UnifiedMaterial>();

    // 0. Resources tipo MATERIAL (prioridad mínima — seleccionables aunque no estén en master_materials)
    for (const r of resourceMaterials) {
      map.set(normalizeStr(r.name), {
        code: r.code,
        name: r.name,
        unit: r.unit,
        cost: r.baseCost,
        source: 'resources',
      });
    }

    // 1. Materiales de proyecto (prioridad baja). `m.cost` ya es técnico.
    for (const m of projectMaterials) {
      const hasConversion = !!(m.conversionFactor && m.conversionFactor > 1);
      map.set(normalizeStr(m.name), {
        code: m.code,
        name: m.name,
        unit: m.unit ?? '',
        cost: m.cost,
        commercialUnit: m.commercialUnit,
        conversionFactor: m.conversionFactor,
        commercialPrice: hasConversion ? m.cost * m.conversionFactor! : undefined,
        source: 'materials',
      });
    }

    // 2. Materiales maestros (prioridad alta — sobreescribe).
    //    `cost` = precio técnico resuelto vía technicalUnitPrice() (soporta
    //    'technical' y 'commercial_legacy'/NULL con factor > 1).
    //    `commercialPrice` = precio comercial derivado para display y mapMaterialToReal.
    for (const mm of masterMaterials) {
      const techCost  = technicalUnitPrice(mm);
      const commPrice = commercialUnitPrice(mm);

      map.set(normalizeStr(mm.name), {
        masterId: mm.id,
        code: mm.code,
        name: mm.name,
        unit: mm.unit,
        cost: techCost,
        commercialUnit: mm.commercialUnit,
        conversionFactor: mm.conversionFactor,
        commercialPrice: commPrice,
        source: mm.unitPrice > 0 ? 'master_materials' : 'materials',
      });
    }

    return Array.from(map.values());
  }, [projectMaterials, masterMaterials, resourceMaterials]);

  // Índices O(1) para getUnifiedMaterial
  const byCode = useMemo(() => {
    const m = new Map<string, UnifiedMaterial>();
    for (const u of list) {
      if (u.code) m.set(normalizeStr(u.code), u);
    }
    return m;
  }, [list]);

  const byName = useMemo(() => {
    const m = new Map<string, UnifiedMaterial>();
    for (const u of list) m.set(normalizeStr(u.name), u);
    return m;
  }, [list]);

  const getUnifiedMaterial = useCallback(
    (codeOrName: string): UnifiedMaterial | undefined => {
      const key = normalizeStr(codeOrName);
      return byCode.get(key) ?? byName.get(key);
    },
    [byCode, byName],
  );

  return { list, masterMaterialsMap, getUnifiedMaterial, loading, error, refetch: load };
}
