# E2E Beta Golden Path — Documentación y Resultados

**Archivo:** `tests/e2e/beta-golden-path.spec.ts`
**Herramienta:** Playwright `@playwright/test` v1.60.0 + Chromium headless
**Objetivo:** Simular el flujo completo de un colega arquitecto usando Obraflow por primera vez hasta generar todos los reportes del proyecto.

---

## Variables de entorno requeridas

```bash
export OBRAFLOW_E2E_URL=https://obraflow.net   # opcional, default incluido
export OBRAFLOW_E2E_EMAIL=qa@tudominio.com
export OBRAFLOW_E2E_PASSWORD=tu_password
```

Sin estas variables el test se **salta automáticamente** (12 tests en estado `skipped`) con el mensaje:

```
⚠️  OBRAFLOW_E2E_EMAIL / OBRAFLOW_E2E_PASSWORD no están definidas.
   Exportá las variables antes de correr este test:
   export OBRAFLOW_E2E_EMAIL=qa@tudominio.com
   export OBRAFLOW_E2E_PASSWORD=tu_password
```

---

## Cómo ejecutar

```bash
# Headless (CI / verificación rápida)
npm run test:e2e

# Con navegador visible (debugging)
npm run test:e2e:headed

# Solo el golden path
npx playwright test tests/e2e/beta-golden-path.spec.ts --reporter=list
```

---

## Flujo cubierto (12 pasos)

| # | Paso | Assert principal |
|---|------|-----------------|
| 01 | Login con magic link / password | Llega a ProjectHub |
| 02 | Crear proyecto QA | ProjectCard visible con nombre QA |
| 03 | Dashboard no está en blanco | Sidebar activo, proyecto cargado |
| 04 | Importar material desde Recursos Globales | Material aparece en Materiales de Empresa |
| 05 | Editar precio local del material | `local_override = true`, precio actualizado |
| 06 | Importar APU desde Analisis de Precios | APU presente en lista, nombre correcto |
| 07 | Verificar ítems en presupuesto | Ítem creado con nombre y costo > 0 |
| 08 | Explosión de Insumos + descarga Excel | Tabla visible, badge "Base presupuesto", archivo `.xlsx` descargado |
| 09 | Lista de Materiales + descarga XLS | Widget visible, badge "Precios actuales", archivo `.xls` descargado |
| 10 | Reporte Completo | RPC retorna datos, tabla renderizada |
| 11 | Asserts visuales | Sin errores 5xx, consola sin errores críticos |
| 12 | Métricas + limpieza | Click count < 30, proyecto QA eliminado |

---

## Resultado actual

**Estado:** `12 skipped` — credenciales no configuradas.

```
Running 12 tests using 1 worker
  12 skipped (Xms)
```

Este es el comportamiento correcto. Los tests están listos para ejecutarse contra producción una vez que se configuren las credenciales de una cuenta QA.

---

## Métricas esperadas al ejecutar con creds

| Métrica | Límite | Descripción |
|---------|--------|-------------|
| Click count | < 30 | Clics útiles (excluye scrolls, hovers, esperas) |
| Errores 5xx | 0 | Ninguna request a Supabase/API debe fallar con 5xx |
| Errores de consola | 0 críticos | Warnings de React/Vite pueden existir; `[Error]` críticos no |
| Descargas | 2 | explosion_insumos_*.xlsx + lista_materiales_*.xls |
| Tiempo total | < 3 min | En headless con red normal |

---

## Brechas identificadas en análisis de código

Estas brechas no requieren fallar el test pero son observaciones de QA del flujo:

1. **Login por contraseña vs magic link:** El flujo de Supabase Auth en producción puede requerir magic link. El test intenta login por password — si la cuenta QA no tiene password configurado puede fallar en el paso 01. Solución: crear cuenta QA con password habilitado.

2. **ProjectWizard — 3 pasos:** El wizard tiene paso 0 (nombre/cliente), paso 1 (specs técnicas) y paso 2 (plantilla). El test maneja los 3 pasos pero si el wizard cambia de diseño los selectores pueden necesitar ajuste.

3. **Import de materiales — navegación interna:** El botón "Importar desde Recursos Globales" navega al tab "Recursos Globales" dentro de DataAdmin. Si este flujo cambia a un modal el test necesita actualización.

4. **APU creation mínima:** El test crea un APU básico sin materials. En producción un APU sin materiales puede generar costo = 0 en el presupuesto. Para un test más robusto considerar crear APU con al menos un material importado.

5. **Reporte Completo — RPC timeout:** `calculate_consolidated_resources` puede tomar 2–8s con datos reales. El timeout de `expect` está en 15s pero si el proyecto tiene muchos ítems puede acercarse al límite.

---

## Archivos relacionados

| Archivo | Rol |
|---------|-----|
| `tests/e2e/beta-golden-path.spec.ts` | Test principal (12 pasos, ~760 líneas) |
| `playwright.config.ts` | Configuración: timeout 120s, expect 15s, Chromium, 1 worker |
| `playwright-report/` | Reporte HTML (generado al correr) |
| `test-results/` | Screenshots y traces de fallas (generado al correr) |

---

## Próximos ajustes recomendados

- [ ] Configurar cuenta QA en Supabase con password (no solo magic link)
- [ ] Ejecutar el test en headed mode una vez y validar que los selectores son estables
- [ ] Agregar test de regresión para módulo de Planificación cuando esté estable
- [ ] Integrar en CI (GitHub Actions) con secrets `OBRAFLOW_E2E_EMAIL` / `OBRAFLOW_E2E_PASSWORD`
- [ ] Considerar `retries: 1` en `playwright.config.ts` para flakiness de red en CI
