import { supabase } from './supabaseClient';

/**
 * SELECT * FROM <table> WHERE <column> IN (<ids>) sin romper por tamaño.
 *
 * PostgREST arma el filtro `.in()` en la URL: con cientos de UUIDs la URL
 * supera el límite y la API responde 400 Bad Request. Además, cada request
 * devuelve como máximo 1000 filas. Este helper parte los IDs en lotes y
 * pagina cada lote con `.range()` hasta traer todas las filas.
 */
export async function selectInChunks(
  table: string,
  column: string,
  ids: string[],
  {
    chunkSize = 150,
    pageSize = 1000,
    orderBy = ['id'],
  }: { chunkSize?: number; pageSize?: number; orderBy?: string[] } = {}
): Promise<{ data: Record<string, any>[]; error: { message: string } | null }> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += chunkSize) {
    chunks.push(unique.slice(i, i + chunkSize));
  }

  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const rows: Record<string, any>[] = [];
      for (let from = 0; ; from += pageSize) {
        // Orden estable para que la paginación no repita ni saltee filas.
        let query = supabase.from(table).select('*').in(column, chunk);
        for (const col of orderBy) query = query.order(col, { ascending: true });
        const { data, error } = await query.range(from, from + pageSize - 1);
        if (error) return { rows, error };
        rows.push(...(data ?? []));
        if (!data || data.length < pageSize) break;
      }
      return { rows, error: null as { message: string } | null };
    })
  );

  const data = results.flatMap((r) => r.rows);
  const error = results.find((r) => r.error)?.error ?? null;
  return { data, error };
}
