# Exportación a PDF — especificación preliminar

**Estado:** especificación de producto, sin implementación
**Objetivo:** permitir exportar a PDF documentos de ejemplo (presupuestos, APU, certificaciones) para casos de prueba y, eventualmente, para uso real de clientes.
**Prioridad:** en cola. No se implementa hasta cerrar las prioridades vigentes de `.claude/CLAUDE.md` / `AGENTS.md` (1. vulnerabilidades RPC cross-tenant, 2. errores TypeScript, 3. gate de CI, 4. higiene del repositorio).

## 1. Estado actual (verificado en código)

- No existe ninguna librería de generación de PDF en el proyecto. `pdfjs-dist` está presente en `package.json`, pero es para **leer/renderizar** PDFs, no para crearlos.
- Los reportes actuales exportan a Excel (`services/` + componentes de reportes), no a PDF.
- No hay ningún endpoint, servicio ni componente que produzca un PDF hoy.

## 2. Alcance propuesto (a discutir antes de implementar)

- Definir qué documentos necesitan salida PDF primero (candidatos: presupuesto de proyecto, detalle de APU, certificación de avance).
- Decidir generación client-side (ej. `@react-pdf/renderer`, `jspdf`) vs. server-side (Supabase Edge Function u otro servicio), considerando que no hay backend propio fuera de Supabase.
- Definir si el PDF es solo de lectura/impresión o si necesita firma/validez legal (en cuyo caso cruzar con `legal-compliance-reviewer`).

## 3. Relación con datos de prueba

El agente `demo-data-curator` (`.opencode/agents/demo-data-curator.md`) puede armar los casos de ejemplo (proyecto, presupuesto, APU) sobre los que probar la exportación una vez que esta función exista — pero no debe simular una salida PDF falsa antes de que la función esté implementada.

## 4. Siguiente paso

No implementar todavía. Cuando se decida subir la prioridad: elegir el primer documento a exportar, confirmar la librería, y recién ahí escribir la spec definitiva + migración (si aplica) + prompt de referencia + checklist QA, siguiendo la convención de trabajo del proyecto.
