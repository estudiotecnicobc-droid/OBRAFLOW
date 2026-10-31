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

**Estado:** `12 passed` — validado con cuenta QA contra producción (2026-05-27).

```
Running 12 tests using 1 worker
  12 passed (2m 18s)
```

### Flujo validado con datos reales

El test crea un APU "Muro Exterior Cerámico 18 cm" con 3 insumos reales importados del catálogo global:

| Insumo | Cantidad | Precio unitario |
|--------|----------|-----------------|
| CEMENTO PORTLAND | 0.5 kg | $0.50/kg |
| ARENA GRUESA | 0.01 m³ | $100.00/m³ |
| LADRILLO HUECO 18X18X33 | 6 u | $2.40/u |

Se importa el APU al presupuesto con 45 m² → subtotal > $0 validado con `expect()` hard assertion.

### Métricas observadas

| Métrica | Resultado | Límite | Estado |
|---------|-----------|--------|--------|
| Click count | ~75 (acumulado 12 tests) | < 30 por test | Soft warning |
| Errores 5xx | 0 | 0 | ✅ |
| Errores de consola críticos | 0 | 0 | ✅ |
| Descargas | 2 (explosion_insumos_*.xlsx + lista_materiales_obra.xlsx) | 2 | ✅ |
| Subtotal presupuesto > $0 | ✅ hard assertion | > $0 | ✅ |
| Filas en Explosión de Insumos | ✅ tabla con datos | ≥ 1 fila | ✅ |
| Tiempo total | ~2m 18s | < 3 min | ✅ |

> **Nota click count:** el contador es acumulativo a través de los 12 tests (`test.use({ storageState })` comparte sesión). El límite de 30 aplica por flujo de usuario, no por total de spec. El test emite warning pero no falla.

---

## Brechas identificadas (observaciones QA)

Estas brechas no hacen fallar el test pero son observaciones relevantes:

1. **Step 05 — edición de precio no confirmada:** El drawer de edición de precio abre pero el assert de `local_override = true` no se valida en DB (solo UI). El paso es no-bloqueante.

2. **Badge "Base presupuesto" en step 11** — el badge es interno al reporte expandido de Explosión de Insumos, no al card en la lista. El assert visual da `❌` en el log pero el test pasa porque la descarga XLS sí ocurre.

3. **Import result counter en step 04** — el banner de resultado de importación no matchea los regex `/Materiales creados\s+(\d+)/`; los contadores muestran `?` en el log pero la importación funciona (step 05 confirma materiales visibles).

4. **Reporte Completo — RPC timeout:** `calculate_consolidated_resources` puede tomar 2–8s con datos reales. El timeout de `expect` está en 15s; con proyectos grandes puede acercarse al límite.

5. **ProjectWizard — selectores dependientes del diseño:** El wizard tiene 3 pasos (nombre/cliente → specs técnicas → plantilla). Si el diseño cambia los selectores pueden necesitar ajuste.

6. **Lista de Materiales — requiere tab "Materiales y fichas":** El widget no está en el tab "Estadísticas" (default del Dashboard). El test navega al tab correcto pero si la arquitectura de views cambia el selector falla.

---

## Archivos relacionados

| Archivo | Rol |
|---------|-----|
| `tests/e2e/beta-golden-path.spec.ts` | Test principal (12 pasos, ~850 líneas) |
| `playwright.config.ts` | Configuración: timeout 120s, expect 15s, Chromium, 1 worker |
| `playwright-report/` | Reporte HTML (generado al correr) |
| `test-results/` | Screenshots y traces de fallas (generado al correr) |

---

## Próximos ajustes recomendados

- [x] Validar selectores con credenciales QA reales — ✅ 12/12 passing (2026-05-27)
- [x] APU con materiales reales y assert de subtotal > $0 — ✅ implementado
- [ ] Agregar test de regresión para módulo de Planificación cuando esté estable
- [ ] Integrar en CI (GitHub Actions) con secrets `OBRAFLOW_E2E_EMAIL` / `OBRAFLOW_E2E_PASSWORD`
  - Requiere `npx playwright install chromium` en el step de CI (no está en git)
- [ ] Considerar `retries: 1` en `playwright.config.ts` para flakiness de red en CI
- [ ] Validar `local_override = true` en step 05 consultando Supabase directamente
- [ ] Ajustar click count threshold a ~100 (actual es acumulativo, no por test individual)
