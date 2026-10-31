import { supabase } from './supabaseClient';

const IDS_PER_REQUEST = 100;
const ROWS_PER_PAGE = 1000;

/**
 * SELECT * FROM table WHERE column IN (ids), partido en tandas de IDs y paginado.
 * Evita el 400 de PostgREST por URL demasiado larga y el tope de 1000 filas por respuesta.
 * orderBy debe identificar cada fila de forma única (para paginar sin saltear ni repetir).
 */
export async function selectInChunks(
  table: string,
  column: string,
  ids: string[],
  orderBy: string[],
): Promise<Record<string, any>[]> {
  const rows: Record<string, any>[] = [];
  for (let i = 0; i < ids.length; i += IDS_PER_REQUEST) {
    const chunk = ids.slice(i, i + IDS_PER_REQUEST);
    for (let from = 0; ; from += ROWS_PER_PAGE) {
      let query = supabase.from(table).select('*').in(column, chunk);
      for (const col of orderBy) query = query.order(col);
      const { data, error } = await query.range(from, from + ROWS_PER_PAGE - 1);
      if (error) throw new Error(`[${table}] ${error.message}`);
      rows.push(...(data ?? []));
      if (!data || data.length < ROWS_PER_PAGE) break;
    }
  }
  return rows;
}
