# Landing previa a la plataforma

## Objetivo
Que la página pública de obraflow.net muestre lo que la plataforma hace hoy y lleve a crear una cuenta.

## Alcance
- `components/LandingPage.tsx` rediseñada:
  - tipografías Archivo (texto) e IBM Plex Mono (etiquetas técnicas), cargadas desde Google Fonts en `index.html`;
  - portada con propuesta concreta y dos botones: "Crear cuenta gratis" y "Ya tengo cuenta";
  - franja con datos del producto: ≈ 590 APU, 40 rubros, 51 plantillas, CAC e ICC automáticos;
  - cinco funciones con maquetas dibujadas en código (datos de ejemplo, sin capturas reales): catálogo, presupuesto rápido, plan de trabajos, actualización por índice y panel de proyectos;
  - "Cómo empezar" en tres pasos, bloque de base de empresa y cierre de beta gratuita;
  - aviso de que precios y rendimientos son de referencia y que las pantallas son ilustrativas;
  - se quitan las cifras sectoriales externas (McKinsey, Procore, BID).
- `Login` acepta `initialMode` (`signin` | `signup`). "Crear cuenta" abre el formulario de registro y "Ingresar" el de ingreso.
- Páginas públicas `/terminos` y `/privacidad` (`src/features/legal/LegalPage.tsx`), con o sin sesión, enlazadas desde el pie de la landing. Los textos están en `src/content/legal/*.md` y se muestran con un intérprete de Markdown mínimo. Los campos entre corchetes en mayúsculas se resaltan en amarillo mientras no se completen.

## Fuera de alcance
- Casilla de aceptación de términos en el registro y registro de la aceptación en `profiles` (requiere migración).
- Contacto en la landing.
