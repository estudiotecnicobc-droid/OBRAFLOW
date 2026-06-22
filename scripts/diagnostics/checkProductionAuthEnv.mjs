#!/usr/bin/env node
/**
 * Diagnóstico de variables de entorno de autenticación Supabase.
 * No muestra claves completas. Solo metadatos seguros.
 */

const url = process.env.VITE_SUPABASE_URL ?? '';
const key = process.env.VITE_SUPABASE_ANON_KEY ?? '';

console.log('\n=== checkProductionAuthEnv ===\n');

// --- URL ---
const urlPresent = url.length > 0;
console.log(`VITE_SUPABASE_URL presente:      ${urlPresent ? 'SÍ' : 'NO ❌'}`);

if (urlPresent) {
  let host = '';
  let isHttps = false;
  let projectRef = '';
  try {
    const parsed = new URL(url);
    host = parsed.hostname;
    isHttps = parsed.protocol === 'https:';
    const parts = host.split('.');
    projectRef = parts[0] ?? '';
  } catch {
    console.log('  URL parse error: formato inválido ❌');
  }
  console.log(`  Host:                          ${host || '(vacío) ❌'}`);
  console.log(`  HTTPS válido:                  ${isHttps ? 'SÍ' : 'NO ❌'}`);
  console.log(`  Project ref:                   ${projectRef || '(vacío) ❌'}`);
  console.log(`  Espacios iniciales/finales:    ${url !== url.trim() ? 'SÍ ❌' : 'no'}`);
  console.log(`  Saltos de línea:               ${url.includes('\n') || url.includes('\r') ? 'SÍ ❌' : 'no'}`);
  console.log(`  Contiene "undefined":          ${url.includes('undefined') ? 'SÍ ❌' : 'no'}`);
  console.log(`  Contiene "tu-proyecto":        ${url.includes('tu-proyecto') ? 'SÍ ❌' : 'no'}`);
} else {
  console.log('  (no hay URL para inspeccionar)');
}

// --- Key ---
const keyPresent = key.length > 0;
console.log(`\nVITE_SUPABASE_ANON_KEY presente: ${keyPresent ? 'SÍ' : 'NO ❌'}`);

if (keyPresent) {
  console.log(`  Longitud:                      ${key.length} chars`);
  console.log(`  Espacios iniciales/finales:    ${key !== key.trim() ? 'SÍ ❌' : 'no'}`);
  console.log(`  Saltos de línea:               ${key.includes('\n') || key.includes('\r') ? 'SÍ ❌' : 'no'}`);
  console.log(`  Empieza con "eyJ":             ${key.startsWith('eyJ') ? 'SÍ' : 'NO ❌'}`);

  // Decode JWT payload to extract project ref (without revealing the key)
  try {
    const parts = key.split('.');
    if (parts.length === 3) {
      const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = payloadB64.padEnd(Math.ceil(payloadB64.length / 4) * 4, '=');
      const decoded = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
      const refInKey = decoded.ref ?? '(ausente)';
      console.log(`  Project ref en JWT:            ${refInKey}`);
      console.log(`  Role en JWT:                   ${decoded.role ?? '(ausente)'}`);

      // Cross-check with URL ref
      if (url.length > 0) {
        try {
          const urlRef = new URL(url).hostname.split('.')[0];
          const match = urlRef === refInKey;
          console.log(`  URL ref === JWT ref:           ${match ? 'SÍ ✓' : `NO ❌ (URL="${urlRef}" vs JWT="${refInKey}")`}`);
        } catch {/* already reported */}
      }
    } else {
      console.log('  JWT mal formado (no tiene 3 partes) ❌');
    }
  } catch (e) {
    console.log(`  Error decodificando JWT: ${e.message}`);
  }
} else {
  console.log('  (no hay key para inspeccionar)');
}

console.log('\n=== fin diagnóstico ===\n');
