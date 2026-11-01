# QA — Gemini en el servidor

- [ ] En la vista previa, buscar "AIza" en los .js publicados (DevTools → Sources/Network): no aparece.
- [ ] Datos de empresa → asistente de precios: con una consulta que coincida con materiales, devuelve explicación y propuestas como antes.
- [ ] Sin sesión (llamada directa a `/api/market-prices`), responde 401.
- [ ] Con la clave rotada cargada en Vercel, el asistente sigue funcionando; con la vieja revocada, ya no.
