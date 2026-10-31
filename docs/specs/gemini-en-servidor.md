# Gemini en el servidor (clave fuera del navegador)

## Problema
`vite.config.ts` inyectaba `GEMINI_API_KEY` en el bundle (`process.env.API_KEY`) y `DataAdmin.tsx` llamaba a Gemini desde el navegador: cualquiera podía leer la clave en el JS publicado.

## Cambio
- `api/market-prices.ts` (función de Vercel): recibe `{ query, candidates }`, verifica la sesión de Supabase (`/auth/v1/user`), arma el mismo prompt de antes y llama a Gemini con `GEMINI_API_KEY` del servidor. Límites: consulta ≤ 300 caracteres, ≤ 60 materiales.
- `DataAdmin.tsx` llama a `/api/market-prices` con el token de sesión; la respuesta (`{ text }`) se procesa igual que antes.
- `vite.config.ts` ya no define `process.env.API_KEY` ni `GEMINI_API_KEY`.

## Acciones manuales
1. Rotar la clave en Google AI Studio (la actual estuvo publicada en el bundle).
2. Cargar la clave nueva en Vercel como `GEMINI_API_KEY` (Production y Preview).
3. En desarrollo local, `/api` requiere `vercel dev` (con `vite` solo, el asistente devuelve error).
