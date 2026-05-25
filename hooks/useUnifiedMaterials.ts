/**
 * useUnifiedMaterials — fuente unificada de materiales para la UI.
 *
 * Fusiona 3 fuentes en orden de prioridad ascendente:
 *   1. resources tipo MATERIAL (Supabase global/org — prioridad mínima, seleccionables)
 *   2. materials (ERPContext — proyecto, prioridad baja)
 *   3. master_materials (Supabase org catalog — prioridad alta, sobreescribe)
 *
 * Precio técnico unitario:
 *   · Si hay match en resources → resources.baseCost (ya es técnico)
 *   · Si hay conversionFactor y NO hay match en resources →
 *       technicalPrice = unitPrice / conversionFactor
 *     (convención: unitPrice en master_materials es el PRECIO COMERCIAL cuando
 *      conversionFactor está definido; el APU siempre usa precio técnico)
 *   · Sin conversionFactor → unitPrice tal cual
 *
 * Devuelve:
 *   · list              — materiales unificados, cost = precio TÉCNICO
 *                         (compatible con OrgMaterialLookup del motor Chandías)
 *   · masterMaterialsMap — Record<uuid, MasterMaterial> con unitPrice = precio TÉCNICO
 *                          (para calculateMasterTaskCost / calculateMaterials)
 *   · getUnifiedMaterial — lookup por code o nombre normalizado
 *   · loading / error
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { MasterMaterial, Resource } from '../types';
import { masterMaterialsService } from '../services/masterMaterialsService';
import { resourcesService } from '../services/resourcesService';
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
      //   · Si hay conversionFactor → master_materials.unitPrice es el PRECIO COMERCIAL.
      //     La división técnica se aplica en masterMaterialsMap (useMemo) y en list().
      //     El resource NO overridea materiales con CF (Resource carece de conversionFactor).
      //   · Sin conversionFactor → si hay resource, usar su baseCost (precio técnico directo).
      //   unitPrice en el estado queda como precio COMERCIAL para CF materials;
      //   la conversión se aplica al construir masterMaterialsMap y list.
      const enriched = mats.map(m => {
        const hasConversion = !!(m.conversionFactor && m.conversionFactor > 1);

        // CF material: mantener precio comercial tal cual; no aplicar override de resource
        if (hasConversion) return m;

        // Sin CF: usar precio técnico del resource si existe
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

  // UUID-keyed map con unitPrice = precio TÉCNICO
  // Usado por calculateMasterTaskCost / calculateMaterials — NO tocar su interfaz.
  // Aplica división por CF aquí (unitPrice en DB es comercial cuando CF > 1).
  const masterMaterialsMap = useMemo(
    () => Object.fromEntries(
      masterMaterials.map(m => {
        if (m.conversionFactor && m.conversionFactor > 1 && m.unitPrice > 0) {
          return [m.id, { ...m, unitPrice: m.unitPrice / m.conversionFactor }];
        }
        return [m.id, m];
      }),
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

    // 1. Materiales de proyecto (prioridad baja)
    for (const m of projectMaterials) {
      const tech = m.conversionFactor && m.conversionFactor > 1
        ? m.cost / m.conversionFactor
        : m.cost;
      map.set(normalizeStr(m.name), {
        code: m.code,
        name: m.name,
        unit: m.unit ?? '',
        cost: tech,
        commercialUnit: m.commercialUnit,
        conversionFactor: m.conversionFactor,
        commercialPrice: m.conversionFactor && m.conversionFactor > 1 ? m.cost : undefined,
        source: 'materials',
      });
    }

    // 2. Materiales maestros (prioridad alta — sobreescribe)
    //    mm.unitPrice = precio COMERCIAL cuando CF > 1 (sin dividir, lo hace mapMaterialToReal).
    //    cost en UnifiedMaterial = precio TÉCNICO (dividido aquí para display correcto).
    //    commercialPrice = precio comercial original (para mapMaterialToReal y display).
    for (const mm of masterMaterials) {
      const hasConversion = !!(mm.conversionFactor && mm.conversionFactor > 1);
      const techCost   = hasConversion ? mm.unitPrice / mm.conversionFactor! : mm.unitPrice;
      const commPrice  = hasConversion ? mm.unitPrice : undefined;

      // Acero comercial (unit='barra', CF>1): la unidad TÉCNICA es kg.
      // DB almacena $/barra → techCost ya es $/kg. Exponer 'kg' como unit
      // evita que MasterTasksPanel muestre "barra" y el usuario ingrese
      // cantidades en barras multiplicadas por $/kg (resultado absurdo).
      // La unidad comercial de compra sigue disponible en commercialUnit.
      const n = normalizeStr(mm.name);
      const isSteelCommercialBar = hasConversion &&
        mm.unit !== 'kg' &&
        (n.includes('hierro') || n.includes('acero'));
      const displayUnit = isSteelCommercialBar ? 'kg' : mm.unit;

      map.set(normalizeStr(mm.name), {
        masterId: mm.id,
        code: mm.code,
        name: mm.name,
        unit: displayUnit,       // 'kg' para acero comercial; mm.unit para el resto
        cost: techCost,          // precio TÉCNICO para display y nameIndex
        commercialUnit: mm.commercialUnit,
        conversionFactor: mm.conversionFactor,
        commercialPrice: commPrice, // precio comercial original para mapMaterialToReal
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
