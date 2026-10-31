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
    concurrency = 4,
  }: { chunkSize?: number; pageSize?: number; orderBy?: string[]; concurrency?: number } = {}
): Promise<{ data: Record<string, any>[]; error: { message: string } | null }> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += chunkSize) {
    chunks.push(unique.slice(i, i + chunkSize));
  }

  const fetchChunk = async (chunk: string[]) => {
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
  };

  // Concurrencia limitada para no saturar la API con catálogos grandes.
  const results: Awaited<ReturnType<typeof fetchChunk>>[] = [];
  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = await Promise.all(chunks.slice(i, i + concurrency).map(fetchChunk));
    results.push(...batch);
    if (batch.some((r) => r.error)) break;
  }

  // Si falla un lote no se devuelven datos parciales: un cálculo con yields
  // incompletos daría costos incorrectos sin aviso.
  const error = results.find((r) => r.error)?.error ?? null;
  if (error) return { data: [], error };
  return { data: results.flatMap((r) => r.rows), error: null };
}
