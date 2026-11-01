// Asistente de precios de mercado (Gemini con búsqueda). Corre en el servidor para que
// GEMINI_API_KEY no viaje al navegador. Solo usuarios logueados en ObraFlow.
import { GoogleGenAI } from '@google/genai';

type Candidate = { id: string; name: string; currentPrice: number; unit: string };

const MAX_QUERY = 300;
const MAX_CANDIDATES = 60;

async function isLoggedUser(token: string): Promise<boolean> {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !anon || !token) return false;
  const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
  return r.ok;
}

function buildPrompt(query: string, candidates: Candidate[]): string {
  return `
            Actúa como el "Asistente de Inteligencia de Mercado" de Obraflow.

            OBJETIVO:
            Tu tarea es buscar precios de mercado actualizados en Argentina para los siguientes materiales de construcción.
            Prioriza buscar en 'mercadolibre.com.ar', 'cifras.com.ar', 'construar.com.ar' o sitios de corralones grandes.

            MATERIALES A CONSULTAR (Contexto interno):
            ${JSON.stringify(candidates)}

            CONSULTA DEL USUARIO: "${query}"

            REGLAS:
            1. Busca el precio actual de mercado (minorista promedio) para cada material.
            2. Si hay mucha volatilidad, aplica un margen de seguridad del 5% sobre el precio encontrado.
            3. RESPONDE UNICAMENTE CON UN BLOQUE JSON VALIDO. No incluyas texto antes ni después del bloque JSON.

            FORMATO JSON ESPERADO:
            {
              "explanation": "Resumen técnico del análisis de precios y fuentes consultadas.",
              "updates": [
                {
                  "id": "ID_DEL_MATERIAL_ORIGINAL",
                  "name": "Nombre",
                  "current_price": 100,
                  "new_price": 120,
                  "source": "Nombre Fuente",
                  "date": "YYYY-MM-DD"
                }
              ]
            }
          `;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }
  const token = String(req.headers?.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!(await isLoggedUser(token))) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Falta GEMINI_API_KEY en el servidor' });
    return;
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
  const query = String(body.query ?? '').trim().slice(0, MAX_QUERY);
  const candidates: Candidate[] = (Array.isArray(body.candidates) ? body.candidates : [])
    .slice(0, MAX_CANDIDATES)
    .map((c: any) => ({
      id: String(c?.id ?? ''),
      name: String(c?.name ?? '').slice(0, 200),
      currentPrice: Number(c?.currentPrice) || 0,
      unit: String(c?.unit ?? '').slice(0, 20),
    }));
  if (!query || candidates.length === 0) {
    res.status(400).json({ error: 'Faltan la consulta o los materiales' });
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: buildPrompt(query, candidates),
      config: { tools: [{ googleSearch: {} }] },
    });
    res.status(200).json({ text: response.text ?? '' });
  } catch (err: any) {
    res.status(502).json({ error: String(err?.message ?? 'Error del servicio de IA') });
  }
}
