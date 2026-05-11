import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || supabaseUrl.includes('tu-proyecto')) {
  console.warn('[Supabase] VITE_SUPABASE_URL no configurada. Editar .env.local antes de usar la base maestra.');
}

// DEBUG: interceptor temporal para identificar header con carácter inválido
const _nativeFetch = globalThis.fetch;
globalThis.fetch = async function debugFetch(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.headers) {
    const entries = init.headers instanceof Headers
      ? [...init.headers.entries()]
      : Object.entries(init.headers as Record<string, string>);
    for (const [k, v] of entries) {
      for (let i = 0; i < v.length; i++) {
        if (v.charCodeAt(i) > 255) {
          console.error(`[fetch-debug] Header inválido: "${k}" contiene char U+${v.charCodeAt(i).toString(16).toUpperCase()} en pos ${i}: "${v.slice(Math.max(0, i-10), i+10)}"`);
        }
      }
    }
  }
  return _nativeFetch(input, init);
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
