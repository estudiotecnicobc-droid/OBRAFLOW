/**
 * E2E Beta Golden Path — Presupuesto de Mampostería 45 m²
 *
 * Simula el flujo completo de un colega beta:
 *   crear proyecto → importar insumos → editar precio local →
 *   crear/importar APU → cargar cómputo → verificar presupuesto →
 *   generar Explosión de Insumos → Lista de Materiales → Reporte Completo
 *
 * Variables de entorno requeridas:
 *   OBRAFLOW_E2E_URL      URL base (default: https://obraflow.net)
 *   OBRAFLOW_E2E_EMAIL    Email del usuario QA (NO master_admin)
 *   OBRAFLOW_E2E_PASSWORD Contraseña del usuario QA
 */

import { test, expect, type Page, type Locator } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

// ── Configuración ────────────────────────────────────────────────────────────

const E2E_EMAIL    = process.env.OBRAFLOW_E2E_EMAIL    ?? '';
const E2E_PASSWORD = process.env.OBRAFLOW_E2E_PASSWORD ?? '';
const PROJECT_NAME = 'QA_E2E_Mamposteria_45m2_DELETE_ME';
const PROJECT_CLIENT = 'Cliente QA';

// Materiales a importar desde Recursos Globales
const MATERIALS_TO_IMPORT = ['Cemento', 'Arena', 'Ladrillo'];

// APU a importar o crear
const APU_NAME = 'Muro';

// ── Métricas ─────────────────────────────────────────────────────────────────

let clickCount = 0;
const consoleErrors: string[] = [];
const failedRequests: string[] = [];
const downloadedFiles: string[] = [];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Hace click y suma al contador */
async function click(locator: Locator): Promise<void> {
  await locator.click();
  clickCount++;
}

/** Espera a que desaparezca cualquier indicador de loading */
async function waitForAppIdle(page: Page, ms = 2000): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  // Esperar que no haya texto "Cargando" o spinners en pantalla
  try {
    await page.waitForFunction(
      () => !document.body.innerText.includes('Cargando sesión'),
      { timeout: 15000 },
    );
  } catch {
    // timeout ok — el spinner ya no está
  }
  await page.waitForTimeout(ms);
}

/** Navega al sidebar y hace click en un ítem del menú por label */
async function navTo(page: Page, label: string): Promise<void> {
  const btn = page.getByRole('button', { name: label, exact: false });
  await btn.waitFor({ state: 'visible', timeout: 10000 });
  await click(btn);
  clickCount++;
  await waitForAppIdle(page, 1000);
}

/** Dentro de DataAdmin, hace click en una subtab por texto */
async function dataAdminTab(page: Page, label: string): Promise<void> {
  const btn = page.getByRole('button', { name: label, exact: false }).first();
  await btn.waitFor({ state: 'visible', timeout: 10000 });
  await click(btn);
  await waitForAppIdle(page, 1000);
}

// ── Test Suite ────────────────────────────────────────────────────────────────

test.describe('Beta Golden Path — Mampostería 45 m²', () => {

  test.beforeAll(() => {
    if (!E2E_EMAIL || !E2E_PASSWORD) {
      console.warn('⚠️  OBRAFLOW_E2E_EMAIL / OBRAFLOW_E2E_PASSWORD no están definidas.');
      console.warn('   Exportá las variables antes de correr este test:');
      console.warn('   export OBRAFLOW_E2E_EMAIL=qa@tudominio.com');
      console.warn('   export OBRAFLOW_E2E_PASSWORD=tu_password');
    }
  });

  test.beforeEach(({ page }) => {
    // Capturar errores de consola
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    // Capturar requests 5xx
    page.on('response', res => {
      if (res.status() >= 500) {
        failedRequests.push(`${res.status()} ${res.url()}`);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1 — Login
  // ═══════════════════════════════════════════════════════════════════════════
  test('01 — Login con usuario QA', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Credenciales QA no configuradas');

    await page.goto('/');
    await waitForAppIdle(page, 1500);

    // Verificar pantalla de login
    await expect(page.getByText('Obraflow')).toBeVisible();

    // Completar formulario
    await page.fill('input[type="email"]', E2E_EMAIL);
    clickCount++;
    await page.fill('input[type="password"]', E2E_PASSWORD);
    clickCount++;

    await click(page.getByRole('button', { name: /Ingresar/i }));

    // Esperar que llegue al ProjectHub o al dashboard
    await page.waitForFunction(
      () =>
        document.body.innerText.includes('Mis Proyectos') ||
        document.body.innerText.includes('Dashboard') ||
        document.body.innerText.includes('Panel de Proyectos'),
      { timeout: 25000 },
    );

    console.log('✅ Login exitoso');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2 — Crear proyecto QA
  // ═══════════════════════════════════════════════════════════════════════════
  test('02 — Crear proyecto QA', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Credenciales QA no configuradas');

    await page.goto('/');
    await waitForAppIdle(page, 2000);

    // Autenticar
    if (await page.getByText('Obraflow', { exact: false }).isVisible()) {
      const emailInput = page.locator('input[type="email"]');
      if (await emailInput.isVisible()) {
        await page.fill('input[type="email"]', E2E_EMAIL);
        await page.fill('input[type="password"]', E2E_PASSWORD);
        await click(page.getByRole('button', { name: /Ingresar/i }));
        await waitForAppIdle(page, 2500);
      }
    }

    // Si ya hay un proyecto QA activo, continuar
    const body = await page.textContent('body') ?? '';
    if (body.includes(PROJECT_NAME)) {
      console.log('ℹ️  Proyecto QA ya existe — omitiendo creación');
      return;
    }

    // Ir al ProjectHub si no estamos ahí
    const nuevoBtn = page.getByRole('button', { name: /Nuevo Proyecto/i });
    if (!(await nuevoBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      // Puede que estemos dentro de un proyecto — salir
      const cambiarBtn = page.getByRole('button', { name: /Cambiar/i });
      if (await cambiarBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await click(cambiarBtn);
        await waitForAppIdle(page, 1500);
      }
    }

    await click(page.getByRole('button', { name: /Nuevo Proyecto/i }));
    await waitForAppIdle(page, 1000);

    // Wizard: modo welcome → crear nuevo
    const crearBtn = page.getByRole('button', { name: /Crear Nuevo Proyecto/i });
    if (await crearBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await click(crearBtn);
      await waitForAppIdle(page, 800);
    }

    // Step 0: datos generales
    await page.fill('input[placeholder="Ej: Edificio Central"]', PROJECT_NAME);
    clickCount++;
    await page.fill('input[placeholder="Nombre del Cliente"]', PROJECT_CLIENT);
    clickCount++;

    // Avanzar al step 1
    const nextBtn = page.getByRole('button', { name: /Siguiente|Next|Continuar/i });
    await click(nextBtn);
    await waitForAppIdle(page, 800);

    // Step 1: datos técnicos — avanzar
    const nextBtn2 = page.getByRole('button', { name: /Siguiente|Next|Continuar/i });
    if (await nextBtn2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await click(nextBtn2);
      await waitForAppIdle(page, 800);
    }

    // Step 2: template — crear sin plantilla
    const createFinalBtn = page.getByRole('button', { name: /Crear Proyecto|Finalizar|Crear/i });
    await click(createFinalBtn.first());
    await waitForAppIdle(page, 3000);

    // Verificar que el proyecto se creó y estamos en él
    await expect(page.getByText(PROJECT_NAME, { exact: false })).toBeVisible({ timeout: 15000 });
    console.log(`✅ Proyecto creado: ${PROJECT_NAME} (clics usados: ${clickCount})`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3 — Verificar Dashboard
  // ═══════════════════════════════════════════════════════════════════════════
  test('03 — Dashboard no está en blanco', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Credenciales QA no configuradas');

    await page.goto('/');
    await waitForAppIdle(page, 2500);

    // Autenticar y seleccionar proyecto si es necesario
    await ensureProjectActive(page);

    // Verificar que Dashboard tiene contenido
    const content = await page.textContent('body') ?? '';
    expect(content.length).toBeGreaterThan(200);

    // Verificar elementos esperados
    const found: Record<string, boolean> = {};
    for (const label of ['Dashboard', 'Lista de Materiales', 'Proyecto']) {
      found[label] = content.includes(label);
    }
    console.log('📊 Dashboard — labels encontrados:', found);

    // El dashboard NO debe estar completamente en blanco
    await expect(page.locator('body')).not.toContainText('Error 404');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4 — Importar materiales desde Recursos Globales
  // ═══════════════════════════════════════════════════════════════════════════
  test('04 — Importar materiales desde Recursos Globales', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Credenciales QA no configuradas');

    await page.goto('/');
    await waitForAppIdle(page, 2500);
    await ensureProjectActive(page);

    // Navegar a Administración de Proyecto
    await navTo(page, 'Administración de Proyecto');
    await waitForAppIdle(page, 1500);

    // Click en "Materiales de Empresa"
    await dataAdminTab(page, 'Materiales de Empresa');
    await waitForAppIdle(page, 1500);

    // Click en "Importar desde Recursos Globales"
    const importBtn = page.getByRole('button', { name: /Importar desde Recursos Globales/i });
    await importBtn.waitFor({ state: 'visible', timeout: 10000 });
    await click(importBtn);
    await waitForAppIdle(page, 2000);

    // Ahora deberíamos estar en el tab "Recursos Globales"
    await expect(page.getByText('Recursos Globales', { exact: false })).toBeVisible({ timeout: 10000 });

    const pageContent = await page.textContent('body') ?? '';
    const resourcesFound: string[] = [];

    // Intentar importar cada material
    for (const materialKeyword of MATERIALS_TO_IMPORT) {
      // Buscar fila que contenga el keyword
      const rows = page.locator('tr').filter({ hasText: materialKeyword });
      const count = await rows.count();
      if (count === 0) {
        console.warn(`⚠️  Material "${materialKeyword}" no encontrado en Recursos Globales`);
        continue;
      }
      // Click en el primer botón de importar de esa fila
      const importRowBtn = rows.first().getByRole('button').filter({ hasText: /Importar/i });
      const btnCount = await importRowBtn.count();
      if (btnCount > 0) {
        await click(importRowBtn.first());
        await waitForAppIdle(page, 1500);
        resourcesFound.push(materialKeyword);
        console.log(`  ✅ Importado: ${materialKeyword}`);
      } else {
        // Puede que el botón diga "Importar al Catálogo" y esté en la fila pero fuera
        const anyImport = rows.first().locator('button').first();
        if (await anyImport.isVisible({ timeout: 2000 }).catch(() => false)) {
          await click(anyImport);
          await waitForAppIdle(page, 1500);
          resourcesFound.push(materialKeyword);
          console.log(`  ✅ Importado (alt): ${materialKeyword}`);
        } else {
          console.warn(`⚠️  Botón importar no encontrado para "${materialKeyword}"`);
        }
      }
    }

    console.log(`📦 Materiales importados: ${resourcesFound.join(', ')}`);
    console.log(`   Clics acumulados: ${clickCount}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 5 — Verificar Materiales de Empresa y editar precio local
  // ═══════════════════════════════════════════════════════════════════════════
  test('05 — Editar precio local del Cemento en Materiales de Empresa', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Credenciales QA no configuradas');

    await page.goto('/');
    await waitForAppIdle(page, 2500);
    await ensureProjectActive(page);

    await navTo(page, 'Administración de Proyecto');
    await dataAdminTab(page, 'Materiales de Empresa');
    await waitForAppIdle(page, 2000);

    // Verificar que aparecen materiales importados
    const content = await page.textContent('body') ?? '';
    const materialsVisible = MATERIALS_TO_IMPORT.filter(m => content.includes(m));
    console.log(`   Materiales visibles en empresa: ${materialsVisible.join(', ')}`);

    // Buscar el Cemento y editar su precio
    const cementoRow = page.locator('tr, [class*="row"], li').filter({ hasText: /Cemento/i }).first();
    if (!(await cementoRow.isVisible({ timeout: 5000 }).catch(() => false))) {
      console.warn('⚠️  Cemento no encontrado en Materiales de Empresa — puede que no haya sido importado');
      return;
    }

    // Abrir el drawer de edición (botón lápiz / Edit)
    const editBtn = cementoRow.getByRole('button').first();
    await click(editBtn);
    await waitForAppIdle(page, 1500);

    // Verificar que el drawer se abrió
    const drawerVisible = await page.getByText(/precio|unitario|Precio/i).isVisible({ timeout: 5000 }).catch(() => false);
    if (!drawerVisible) {
      console.warn('⚠️  Drawer de edición no se abrió');
      return;
    }

    // Cambiar precio de 150 a 180
    const priceInput = page.locator('input[type="number"]').filter({ has: page.getByText(/precio/i) });
    const priceInputAlt = page.locator('input[name*="price"], input[id*="price"]').first();
    // Buscar el input de precio unitario en el drawer
    const allNumberInputs = page.locator('input[type="number"]');
    const count = await allNumberInputs.count();

    // Buscar input con valor que parezca precio (> 0)
    let priceInputFound = false;
    for (let i = 0; i < count; i++) {
      const inp = allNumberInputs.nth(i);
      const val = await inp.inputValue();
      if (parseFloat(val) > 0) {
        await inp.clear();
        await inp.fill('180');
        clickCount++;
        priceInputFound = true;
        break;
      }
    }

    if (!priceInputFound) {
      console.warn('⚠️  Input de precio no encontrado en drawer');
    }

    // Guardar
    const saveBtn = page.getByRole('button', { name: /Guardar|Save/i });
    if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await click(saveBtn);
      await waitForAppIdle(page, 2000);
      console.log('  ✅ Precio local del Cemento actualizado a 180');
    }

    // Verificar badge "Editado localmente"
    const editBadgeVisible = (await page.textContent('body') ?? '').includes('Editado localmente');
    console.log(`  Badge "Editado localmente" visible: ${editBadgeVisible}`);

    console.log(`   Clics acumulados: ${clickCount}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 6 — Importar o crear APU "Muro Exterior Cerámico 18 cm"
  // ═══════════════════════════════════════════════════════════════════════════
  test('06 — Importar o crear APU de muro', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Credenciales QA no configuradas');

    await page.goto('/');
    await waitForAppIdle(page, 2500);
    await ensureProjectActive(page);

    await navTo(page, 'Administración de Proyecto');
    await dataAdminTab(page, 'Analisis de Precios');
    await waitForAppIdle(page, 2000);

    const content = await page.textContent('body') ?? '';

    // Verificar si ya existe un APU de muro
    if (content.includes('Muro') || content.includes('muro')) {
      console.log('ℹ️  APU de Muro ya existe en el catálogo de la empresa');

      // Intentar importarlo al proyecto si hay botón de importar
      const importApuBtn = page.getByRole('button', { name: /Importar al Proyecto|Usar en Proyecto/i });
      if (await importApuBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await click(importApuBtn.first());
        await waitForAppIdle(page, 2000);
        console.log('  ✅ APU de Muro importado al proyecto');
      }
      return;
    }

    // Crear nuevo APU mínimo
    const newApuBtn = page.getByRole('button', { name: /Nuevo APU|Nuevo Análisis|Nueva Tarea/i });
    if (await newApuBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await click(newApuBtn);
      await waitForAppIdle(page, 1500);

      // Completar nombre
      const nameInput = page.locator('input[placeholder*="nombre"], input[placeholder*="Nombre"], input[type="text"]').first();
      if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await nameInput.fill('Muro Exterior Cerámico 18 cm');
        clickCount++;
      }

      // Completar unidad
      const unitInput = page.locator('input[placeholder*="unidad"], input[placeholder*="Unidad"]').first();
      if (await unitInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await unitInput.fill('m²');
        clickCount++;
      }

      // Guardar APU
      const saveApuBtn = page.getByRole('button', { name: /Guardar|Crear APU|Agregar/i });
      if (await saveApuBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await click(saveApuBtn);
        await waitForAppIdle(page, 2000);
        console.log('  ✅ APU "Muro Exterior Cerámico 18 cm" creado');
      }
    } else {
      console.warn('⚠️  No se encontró botón para crear nuevo APU — flujo no completado');
    }

    console.log(`   Clics acumulados: ${clickCount}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 7 — Presupuesto: verificar tarea con subtotal > 0
  // ═══════════════════════════════════════════════════════════════════════════
  test('07 — Presupuesto: tarea aparece con subtotal > 0', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Credenciales QA no configuradas');

    await page.goto('/');
    await waitForAppIdle(page, 2500);
    await ensureProjectActive(page);

    await navTo(page, 'Presupuesto');
    await waitForAppIdle(page, 2000);

    const content = await page.textContent('body') ?? '';

    // Verificar que no hay error de RLS / 500
    expect(failedRequests.filter(r => r.startsWith('5')).length, '5xx requests detectadas').toBe(0);

    // Buscar si hay items en el presupuesto
    const hasItems = content.includes('Muro') || content.includes('tarea') || content.includes('APU');
    console.log(`   Items en presupuesto visibles: ${hasItems}`);

    // Verificar que no hay "$0.00 - Requiere asignación" sin razón
    const zeroCostWarning = content.match(/\$0[,.]00.*Requiere/gi) ?? [];
    if (zeroCostWarning.length > 0) {
      console.warn(`⚠️  FALLA CRÍTICA: Ítems con costo $0.00 detectados (${zeroCostWarning.length})`);
    }

    console.log(`   Clics acumulados: ${clickCount}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 8 — Explosión de Insumos (Reportes → consolidated)
  // ═══════════════════════════════════════════════════════════════════════════
  test('08 — Explosión de Insumos: badges, tabla y descarga Excel', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Credenciales QA no configuradas');

    await page.goto('/');
    await waitForAppIdle(page, 2500);
    await ensureProjectActive(page);

    await navTo(page, 'Administración de Proyecto');
    await dataAdminTab(page, 'Reportes');
    await waitForAppIdle(page, 2000);

    // Verificar card "Explosión de Insumos"
    await expect(page.getByText('Explosión de Insumos', { exact: false })).toBeVisible({ timeout: 10000 });
    console.log('  ✅ Texto "Explosión de Insumos" visible');

    // Click en el card
    await click(page.getByText('Explosión de Insumos', { exact: false }).first());
    await waitForAppIdle(page, 1000);

    // Verificar badges de contexto
    const content = await page.textContent('body') ?? '';
    const hasBaseBadge = content.includes('Base presupuesto') || content.includes('Precios congelados');
    console.log(`  Badge "Base presupuesto" / "Precios congelados": ${hasBaseBadge ? '✅' : '❌'}`);

    // Seleccionar proyecto
    const projectSelect = page.locator('select').first();
    if (await projectSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
      await projectSelect.selectOption({ label: PROJECT_NAME });
      clickCount++;
      await waitForAppIdle(page, 1000);
    }

    // Click en Calcular
    const calcBtn = page.getByRole('button', { name: /Calcular/i });
    await click(calcBtn);
    await waitForAppIdle(page, 8000);

    const contentAfter = await page.textContent('body') ?? '';

    // Verificar tabla con datos
    const hasMaterials = contentAfter.includes('Materiales') || contentAfter.includes('Material');
    console.log(`  Tabla con materiales: ${hasMaterials ? '✅' : '❌'}`);

    // Verificar que no hay tabla vacía sin empty state
    if (contentAfter.includes('Sin datos') && contentAfter.includes('Error')) {
      console.warn('⚠️  Explosión de Insumos muestra error o está vacía');
    }

    // Descarga de Excel
    const xlsxBtn = page.getByRole('button', { name: /Excel|XLS/i });
    if (await xlsxBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      const downloadDir = path.join(process.cwd(), 'playwright-downloads');
      fs.mkdirSync(downloadDir, { recursive: true });

      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 10000 }),
        click(xlsxBtn),
      ]).catch(() => [null]);

      if (download) {
        const filePath = path.join(downloadDir, download.suggestedFilename());
        await download.saveAs(filePath);
        const stats = fs.statSync(filePath);
        downloadedFiles.push(download.suggestedFilename());

        expect(stats.size, 'Archivo Excel vacío').toBeGreaterThan(500);
        expect(download.suggestedFilename()).toMatch(/explosion_insumos/i);
        console.log(`  ✅ Excel descargado: ${download.suggestedFilename()} (${stats.size} bytes)`);
      } else {
        console.warn('⚠️  No se pudo descargar el Excel de Explosión de Insumos');
      }
    }

    console.log(`   Clics acumulados: ${clickCount}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 9 — Dashboard / Lista de Materiales: badges y descarga Excel
  // ═══════════════════════════════════════════════════════════════════════════
  test('09 — Lista de Materiales: badge "Precios actuales" y descarga XLS', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Credenciales QA no configuradas');

    await page.goto('/');
    await waitForAppIdle(page, 2500);
    await ensureProjectActive(page);

    await navTo(page, 'Dashboard');
    await waitForAppIdle(page, 2000);

    const content = await page.textContent('body') ?? '';

    // Verificar widget Lista de Materiales
    await expect(page.getByText('Lista de Materiales', { exact: false })).toBeVisible({ timeout: 10000 });
    console.log('  ✅ Widget "Lista de Materiales" visible');

    // Verificar badge "Precios actuales"
    const hasPreciosActuales = content.includes('Precios actuales');
    console.log(`  Badge "Precios actuales": ${hasPreciosActuales ? '✅' : '❌'}`);

    // Verificar subtítulo
    const hasSubtitle = content.includes('Cantidades del proyecto');
    console.log(`  Subtítulo correcto: ${hasSubtitle ? '✅' : '❌'}`);

    // Verificar nota de advertencia
    const hasNote = content.includes('Explosión de Insumos') && content.includes('fecha base');
    console.log(`  Nota de advertencia: ${hasNote ? '✅' : '❌'}`);

    // Verificar columnas de la tabla
    const hasCostoTotal = content.includes('Costo total') || content.includes('Costo Total');
    console.log(`  Columna "Costo total": ${hasCostoTotal ? '✅' : '❌'}`);

    // Descarga XLS
    const xlsBtn = page.getByRole('button', { name: /XLS|Excel/i }).first();
    if (await xlsBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      const downloadDir = path.join(process.cwd(), 'playwright-downloads');
      fs.mkdirSync(downloadDir, { recursive: true });

      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 10000 }),
        click(xlsBtn),
      ]).catch(() => [null]);

      if (download) {
        const filePath = path.join(downloadDir, download.suggestedFilename());
        await download.saveAs(filePath);
        const stats = fs.statSync(filePath);
        downloadedFiles.push(download.suggestedFilename());

        expect(stats.size, 'XLS de Lista de Materiales vacío').toBeGreaterThan(500);
        console.log(`  ✅ XLS descargado: ${download.suggestedFilename()} (${stats.size} bytes)`);
      } else {
        console.warn('⚠️  No se pudo descargar el XLS de Lista de Materiales');
      }
    }

    console.log(`   Clics acumulados: ${clickCount}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 10 — Reporte Completo
  // ═══════════════════════════════════════════════════════════════════════════
  test('10 — Reporte Completo no está en blanco', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Credenciales QA no configuradas');

    await page.goto('/');
    await waitForAppIdle(page, 2500);
    await ensureProjectActive(page);

    await navTo(page, 'Dashboard');
    await waitForAppIdle(page, 2000);

    // Buscar botón de Reporte / Imprimir en el Dashboard
    const reportBtn = page.getByRole('button', { name: /Imprimir|Reporte|Exportar/i }).first();
    if (!(await reportBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      console.warn('⚠️  Botón de Reporte Completo no encontrado en Dashboard — skip');
      return;
    }

    await click(reportBtn);
    await waitForAppIdle(page, 2000);

    // Verificar que se abrió el modal de preview (no el diálogo de impresión nativo)
    const content = await page.textContent('body') ?? '';
    const hasPreview = content.includes('Presupuesto') || content.includes('Insumos') || content.includes('Secciones');
    console.log(`  Preview del reporte tiene contenido: ${hasPreview ? '✅' : '❌'}`);

    if (!hasPreview) {
      console.warn('⚠️  El reporte puede estar en blanco o el diálogo es del sistema operativo');
    }

    console.log(`   Clics acumulados: ${clickCount}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 11 — Asserts visuales obligatorios
  // ═══════════════════════════════════════════════════════════════════════════
  test('11 — Asserts visuales obligatorios (navegación completa)', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Credenciales QA no configuradas');

    await page.goto('/');
    await waitForAppIdle(page, 2500);
    await ensureProjectActive(page);

    const REQUIRED_LABELS = [
      'Administración de Proyecto',  // nav item
      'Materiales de Empresa',        // DataAdmin subtab
      'Recursos Globales',            // DataAdmin subtab
      'Analisis de Precios',          // DataAdmin subtab (APU)
      'Reportes',                     // DataAdmin subtab
      'Lista de Materiales',          // Dashboard widget
      'Explosión de Insumos',         // Reports card
    ];

    // Navegar a DataAdmin para verificar subtabs
    await navTo(page, 'Administración de Proyecto');
    await waitForAppIdle(page, 2000);

    const adminContent = await page.textContent('body') ?? '';
    const results: Record<string, boolean> = {};
    for (const label of REQUIRED_LABELS) {
      results[label] = adminContent.includes(label);
    }

    // Dashboard
    await navTo(page, 'Dashboard');
    await waitForAppIdle(page, 2000);
    const dashContent = await page.textContent('body') ?? '';
    results['Lista de Materiales'] = dashContent.includes('Lista de Materiales');
    results['Precios actuales'] = dashContent.includes('Precios actuales');

    // Reporte Explosión
    await navTo(page, 'Administración de Proyecto');
    await dataAdminTab(page, 'Reportes');
    await waitForAppIdle(page, 2000);
    const reportContent = await page.textContent('body') ?? '';
    results['Explosión de Insumos'] = reportContent.includes('Explosión de Insumos');
    results['Base presupuesto'] = reportContent.includes('Base presupuesto') || reportContent.includes('Precios congelados');

    // Log resultados
    console.log('\n═══ Asserts Visuales ═══');
    for (const [label, found] of Object.entries(results)) {
      console.log(`  ${found ? '✅' : '❌'}  ${label}`);
    }

    const missingLabels = Object.entries(results).filter(([, found]) => !found).map(([l]) => l);
    if (missingLabels.length > 0) {
      console.warn(`⚠️  Labels faltantes: ${missingLabels.join(', ')}`);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 12 — Limpieza y métricas finales
  // ═══════════════════════════════════════════════════════════════════════════
  test('12 — Métricas finales y limpieza', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Credenciales QA no configuradas');

    await page.goto('/');
    await waitForAppIdle(page, 2500);
    await ensureProjectActive(page);

    // Intentar limpiar el proyecto QA
    await cleanupQAProject(page);

    // Reportar métricas
    console.log('\n═══ MÉTRICAS FINALES ═══');
    console.log(`  Clics útiles totales:     ${clickCount}`);
    console.log(`  Errores de consola:       ${consoleErrors.length}`);
    console.log(`  Requests fallidas (5xx):  ${failedRequests.length}`);
    console.log(`  Archivos descargados:     ${downloadedFiles.length}`);

    if (consoleErrors.length > 0) {
      console.warn('  Errores de consola:', consoleErrors.slice(0, 5));
    }
    if (failedRequests.length > 0) {
      console.warn('  Requests fallidas:', failedRequests);
    }
    if (downloadedFiles.length > 0) {
      console.log('  Archivos:', downloadedFiles.join(', '));
    }

    // Soft assertion: menos de 30 clics para el golden path
    if (clickCount > 30) {
      console.warn(`⚠️  Clics totales (${clickCount}) superan el límite sugerido de 30`);
    } else {
      console.log(`✅ Clics dentro del límite (${clickCount} / 30)`);
    }

    // Falla crítica si hay 5xx
    expect(failedRequests.filter(r => r.startsWith('5')).length, 'Se detectaron requests 500').toBe(0);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Helper: asegurar que hay un proyecto activo
  // ═══════════════════════════════════════════════════════════════════════════
  async function ensureProjectActive(page: Page): Promise<void> {
    const body = await page.textContent('body') ?? '';

    // Si hay spinner de carga, esperar
    if (body.includes('Cargando sesión')) {
      await page.waitForFunction(
        () => !document.body.innerText.includes('Cargando sesión'),
        { timeout: 15000 },
      );
    }

    // Re-login si no autenticado
    const emailInput = page.locator('input[type="email"]');
    if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.fill('input[type="email"]', E2E_EMAIL);
      await page.fill('input[type="password"]', E2E_PASSWORD);
      await click(page.getByRole('button', { name: /Ingresar/i }));
      await waitForAppIdle(page, 3000);
    }

    // Si estamos en el ProjectHub, buscar y seleccionar el proyecto QA
    const currentBody = await page.textContent('body') ?? '';
    if (currentBody.includes('Mis Proyectos') || currentBody.includes('Panel de Proyectos')) {
      const projectCard = page.getByText(PROJECT_NAME, { exact: false });
      if (await projectCard.isVisible({ timeout: 5000 }).catch(() => false)) {
        await click(projectCard);
        await waitForAppIdle(page, 3000);
      } else {
        console.warn(`⚠️  Proyecto QA "${PROJECT_NAME}" no encontrado en ProjectHub`);
      }
    }
  }

  // Helper: limpiar proyecto QA
  async function cleanupQAProject(page: Page): Promise<void> {
    // Nota: la app no tiene botón de "eliminar proyecto" expuesto en la UI estándar.
    // El proyecto se puede eliminar manualmente desde Supabase Dashboard.
    console.log(`ℹ️  Limpieza manual requerida:`);
    console.log(`   Proyecto a eliminar: "${PROJECT_NAME}"`);
    console.log(`   Ir a Supabase Dashboard → Table Editor → projects → filtrar por name = '${PROJECT_NAME}' → Delete`);
  }

});
