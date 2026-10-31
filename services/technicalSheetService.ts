import { supabase } from './supabaseClient';
import type { TechnicalSheet } from '../types';

function sheetFromJson(raw: unknown): TechnicalSheet | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  return {
    version:       Number(r.version ?? 1),
    ficha:         String(r.ficha ?? ''),
    gremio:        r.gremio ?? undefined,
    titulo:        String(r.titulo ?? ''),
    esquemaSvg:    typeof r.esquemaSvg === 'string' ? r.esquemaSvg : undefined,
    pie:           r.pie ?? undefined,
    descripcion:   r.descripcion ?? undefined,
    datosTecnicos: Array.isArray(r.datosTecnicos) ? r.datosTecnicos : [],
    notas:         Array.isArray(r.notas) ? r.notas : [],
    fuente:        r.fuente ?? undefined,
    relacionadas:  Array.isArray(r.relacionadas) ? r.relacionadas : [],
  };
}

/** Columna ausente = migración 066 todavía no aplicada: se trata como "sin ficha". */
function isMissingColumn(message?: string): boolean {
  return !!message && message.includes('technical_sheet');
}

/**
 * Ficha técnica del APU. Si es una copia de empresa sin ficha propia,
 * usa la del APU del catálogo general con el mismo código.
 */
export async function getTechnicalSheet(masterTaskId: string, code?: string): Promise<TechnicalSheet | null> {
  const own = await supabase
    .from('master_tasks')
    .select('technical_sheet')
    .eq('id', masterTaskId)
    .maybeSingle();
  if (own.error) {
    if (isMissingColumn(own.error.message)) return null;
    throw own.error;
  }
  const sheet = sheetFromJson(own.data?.technical_sheet);
  if (sheet || !code) return sheet;

  const global = await supabase
    .from('master_tasks')
    .select('technical_sheet')
    .is('organization_id', null)
    .eq('code', code)
    .not('technical_sheet', 'is', null)
    .limit(1)
    .maybeSingle();
  if (global.error) {
    if (isMissingColumn(global.error.message)) return null;
    throw global.error;
  }
  return sheetFromJson(global.data?.technical_sheet);
}
