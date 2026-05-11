import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || supabaseUrl.includes('tu-proyecto')) {
  console.warn('[Supabase] VITE_SUPABASE_URL no configurada. Editar .env.local antes de usar la base maestra.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
