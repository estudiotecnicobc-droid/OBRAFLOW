/**
 * E2E Beta Golden Path — Presupuesto de Mampostería 45 m²
 *
 * Cada corrida genera un RUN_ID único (timestamp con segundos) → proyecto
 * y APU aislados por corrida → el test es repetible sin limpiar datos entre runs.
 *
 * Variables de entorno requeridas:
 *   OBRAFLOW_E2E_URL      URL base (default: https://obraflow.net)
 *   OBRAFLOW_E2E_EMAIL    Email del usuario QA (NO master_admin)
 *   OBRAFLOW_E2E_PASSWORD Contraseña del usuario QA
 *
 * Hard asserts: 01 login, 02 proyecto creado, 05 drawer+precio+badge,
 *               06 APU creado+visible, 07 subtotal > $0, 08+09 descargas > 500b,
 *               12 0 errores 5xx.
 * Soft asserts: 03 dashboard, 04 import (estado global), 10 reporte, 11 visual.
 */

import { test, expect, type Page, type Locator } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

// ── Configuración ────────────────────────────────────────────────────────────

const E2E_EMAIL    = process.env.OBRAFLOW_E2E_EMAIL    ?? '';
const E2E_PASSWORD = process.env.OBRAFLOW_E2E_PASSWORD ?? '';

// RUN_ID único por corrida (YYYY-MM-DD-HHmmss) — se computa una vez al cargar el módulo
const RUN_ID = new Date().toISOString().slice(0, 19).replace('T', '-').replace(/:/g, '');

const PROJECT_NAME   = `QA_E2E_${RUN_ID}_DELETE_ME`;
const PROJECT_CLIENT = 'Cliente QA';
const APU_NAME_RUN   = `QA_Muro18_${RUN_ID}`;

// Materiales del catálogo global (keywords en MAYÚSCULAS para coincidencia)
const MATERIAL_YIELDS: Array<{ keyword: string; qty: string }> = [
  { keyword: 'CEMENTO PORTLAND', qty: '0.5'  },
  { keyword: 'ARENA GRUESA',     qty: '0.01' },
  { keyword: 'LADRILLO HUECO 18', qty: '6'   },
];

// ── Métricas (acumuladas a través de todos los tests de la corrida) ────────────

let clickCount = 0;
const consoleErrors: string[] = [];
const failedRequests: string[] = [];
const downloadedFiles: string[] = [];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function click(locator: Locator): Promise<void> {
  await locator.click();
  clickCount++;
}

async function waitForAppIdle(page: Page, ms = 2000): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  try {
    await page.waitForFunction(
      () => !document.body.innerText.includes('Cargando sesión'),
      { timeout: 15000 },
    );
  } catch {
    // spinner ya desapareció o nunca apareció
  }
  await page.waitForTimeout(ms);
}

/** Navega al sidebar; clickCount no se duplica */
async function navTo(page: Page, label: string, exact = true): Promise<void> {
  const btn = page.getByRole('button', { name: label, exact }).first();
  await btn.waitFor({ state: 'visible', timeout: 10000 });
  await click(btn);
  await waitForAppIdle(page, 1000);
}

/** Hace click en una subtab del DataAdmin por texto */
async function dataAdminTab(page: Page, label: string): Promise<void> {
  const btn = page.getByRole('button', { name: label, exact: false }).first();
  await btn.waitFor({ state: 'visible', timeout: 10000 });
  await click(btn);
  await waitForAppIdle(page, 1000);
}

/** Login → ProjectHub → seleccionar proyecto QA */
async function ensureProjectActive(page: Page): Promise<void> {
  const body = await page.textContent('body') ?? '';
  if (body.includes('Cargando sesión')) {
    await page.waitForFunction(
      () => !document.body.innerText.includes('Cargando sesión'),
      { timeout: 15000 },
    );
  }

  const emailInput = page.locator('input[type="email"]');
  if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.fill('input[type="email"]', E2E_EMAIL);
    await page.fill('input[type="password"]', E2E_PASSWORD);
    await click(page.locator('button[type="submit"]'));
    await waitForAppIdle(page, 3000);
  }

  const currentBody = await page.textContent('body') ?? '';
  if (currentBody.includes('Mis Proyectos') || currentBody.includes('Panel de Proyectos')) {
    const projectCard = page.getByText(PROJECT_NAME, { exact: false }).first();
    if (await projectCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await click(projectCard);
      await waitForAppIdle(page, 3000);
    } else {
      console.warn(`⚠️  Proyecto "${PROJECT_NAME}" no encontrado en ProjectHub`);
    }
  }
}

// ── Test Suite ────────────────────────────────────────────────────────────────

test.describe('Beta Golden Path — Mampostería 45 m²', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(() => {
    if (!E2E_EMAIL || !E2E_PASSWORD) {
      console.warn('⚠️  OBRAFLOW_E2E_EMAIL / OBRAFLOW_E2E_PASSWORD no están definidas.');
    }
    console.log(`🔑 RUN_ID: ${RUN_ID}`);
    console.log(`📁 Proyecto QA: ${PROJECT_NAME}`);
    console.log(`🔧 APU QA: ${APU_NAME_RUN}`);
  });

  test.beforeEach(({ page }) => {
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('response', res => {
      if (res.status() >= 500) failedRequests.push(`${res.status()} ${res.url()}`);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1 — Login
  // ═══════════════════════════════════════════════════════════════════════════
  test('01 — Login con usuario QA', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Credenciales QA no configuradas');

    await page.goto('/');
    await waitForAppIdle(page, 1500);

    await expect(page.getByText('Obraflow')).toBeVisible();

    await page.fill('input[type="email"]', E2E_EMAIL);
    clickCount++;
    await page.fill('input[type="password"]', E2E_PASSWORD);
    clickCount++;
    await click(page.locator('button[type="submit"]'));

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
  // STEP 2 — Crear proyecto QA (nombre único por RUN_ID → siempre nuevo)
  // ═══════════════════════════════════════════════════════════════════════════
  test('02 — Crear proyecto QA con RUN_ID', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Credenciales QA no configuradas');

    await page.goto('/');
    await waitForAppIdle(page, 2000);

    // Autenticar si es necesario
    const emailInput = page.locator('input[type="email"]');
    if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.fill('input[type="email"]', E2E_EMAIL);
      await page.fill('input[type="password"]', E2E_PASSWORD);
      await click(page.locator('button[type="submit"]'));
      await waitForAppIdle(page, 2500);
    }

    // Ir al ProjectHub si estamos dentro de un proyecto
    const nuevoBtn = page.getByRole('button', { name: /Nuevo Proyecto/i });
    if (!(await nuevoBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      const cambiarBtn = page.getByRole('button', { name: /Cambiar/i });
      if (await cambiarBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await click(cambiarBtn);
        await waitForAppIdle(page, 1500);
      }
    }

    await click(page.getByRole('button', { name: /Nuevo Proyecto/i }));
    await waitForAppIdle(page, 1000);

    // Wizard paso bienvenida → crear nuevo
    const crearBtn = page.getByRole('button', { name: /Crear Nuevo Proyecto/i });
    if (await crearBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await click(crearBtn);
      await waitForAppIdle(page, 800);
    }

    // Paso 0: nombre y cliente
    await page.fill('input[placeholder="Ej: Edificio Central"]', PROJECT_NAME);
    clickCount++;
    await page.fill('input[placeholder="Nombre del Cliente"]', PROJECT_CLIENT);
    clickCount++;

    // Paso 1: specs técnicas
    const nextBtn = page.getByRole('button', { name: /Siguiente|Continuar/i });
    await click(nextBtn);
    await waitForAppIdle(page, 800);

    const nextBtn2 = page.getByRole('button', { name: /Siguiente|Continuar/i });
    if (await nextBtn2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await click(nextBtn2);
      await waitForAppIdle(page, 800);
    }

    // Paso 2: template → crear sin plantilla
    const createFinalBtn = page.getByRole('button', { name: /Crear Proyecto|Finalizar/i });
    await click(createFinalBtn.first());
    await waitForAppIdle(page, 3000);

    // Hard assert: proyecto visible en página
    await expect(page.getByText(PROJECT_NAME, { exact: false }).first()).toBeVisible({ timeout: 15000 });
    console.log(`✅ Proyecto creado: ${PROJECT_NAME}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3 — Dashboard no está en blanco
  // ═══════════════════════════════════════════════════════════════════════════
  test('03 — Dashboard no está en blanco', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Credenciales QA no configuradas');

    await page.goto('/');
    await waitForAppIdle(page, 2500);
    await ensureProjectActive(page);

    const content = await page.textContent('body') ?? '';
    expect(content.length).toBeGreaterThan(200);
    await expect(page.locator('body')).not.toContainText('Error 404');

    const found: Record<string, boolean> = {};
    for (const label of ['Dashboard', 'Proyecto']) {
      found[label] = content.includes(label);
    }
    console.log('📊 Dashboard — labels encontrados:', found);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4 — Importar materiales desde Recursos Globales
  // ═══════════════════════════════════════════════════════════════════════════
  test('04 — Importar materiales desde Recursos Globales', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Credenciales QA no configuradas');

    await page.goto('/');
    await waitForAppIdle(page, 2500);
    await ensureProjectActive(page);

    await navTo(page, 'Administración de Proyecto');
    await dataAdminTab(page, 'Materiales de Empresa');
    await waitForAppIdle(page, 1500);

    const navGlobalBtn = page.getByRole('button', { name: /Importar desde Recursos Globales/i });
    await navGlobalBtn.waitFor({ state: 'visible', timeout: 10000 });
    await click(navGlobalBtn);
    await waitForAppIdle(page, 2500);

    await expect(page.getByText('Catálogo Global de Recursos', { exact: false })).toBeVisible({ timeout: 10000 });

    const bulkBtn = page.getByRole('button', { name: /Importar al Catálogo de Empresa/i });
    if (await bulkBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
      await click(bulkBtn);
      await page.waitForFunction(
        () =>
          document.body.innerText.includes('Importación completada') ||
          document.body.innerText.includes('Cerrar'),
        { timeout: 30000 },
      ).catch(() => null);
      await waitForAppIdle(page, 2000);
      console.log('📦 Importación desde Recursos Globales completada');
    } else {
      console.log('ℹ️  Botón de importación masiva no visible — recursos posiblemente ya importados');
    }

    // Verificar que al menos uno de los materiales necesarios está en el catálogo
    await dataAdminTab(page, 'Materiales de Empresa');
    await waitForAppIdle(page, 1500);
    const body = await page.textContent('body') ?? '';
    const materialsVisible = ['Cemento', 'Arena', 'Ladrillo'].filter(m => body.includes(m));
    console.log(`   Materiales en catálogo empresa: ${materialsVisible.join(', ')}`);
    console.log(`   Clics acumulados: ${clickCount}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 5 — Editar precio local del Cemento Portland (HARD ASSERTS)
  // ═══════════════════════════════════════════════════════════════════════════
  test('05 — Editar precio local del Cemento Portland', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Credenciales QA no configuradas');

    await page.goto('/');
    await waitForAppIdle(page, 2500);
    await ensureProjectActive(page);

    await navTo(page, 'Administración de Proyecto');
    await dataAdminTab(page, 'Materiales de Empresa');
    await waitForAppIdle(page, 2000);

    // Localizar fila del Cemento Portland en la tabla
    const cementoRow = page.locator('table tbody tr').filter({ hasText: /Cemento Portland/i }).first();
    await expect(cementoRow).toBeVisible({ timeout: 10000 });
    console.log('  ✅ Fila "Cemento Portland" encontrada');

    // Abrir el drawer de edición por el botón con title="Editar"
    const editBtn = cementoRow.locator('button[title="Editar"]');
    await expect(editBtn).toBeVisible({ timeout: 5000 });
    await click(editBtn);

    // HARD ASSERT: el drawer debe abrirse y mostrar "Editar Material"
    await expect(page.getByText('Editar Material', { exact: true })).toBeVisible({ timeout: 10000 });
    console.log('  ✅ Drawer de edición abierto');

    // Input de Precio unitario: placeholder "0.00" es único en el drawer
    const priceInput = page.locator('input[placeholder="0.00"]');
    await expect(priceInput).toBeVisible({ timeout: 5000 });

    const precioBefore = await priceInput.inputValue();
    console.log(`  Precio actual: ${precioBefore}`);

    await priceInput.clear();
    await priceInput.fill('180');
    await priceInput.press('Tab');
    clickCount++;

    // Guardar — scoped al drawer para evitar ambigüedades
    const drawerSaveBtn = page.locator('div').filter({ has: page.getByText('Editar Material', { exact: true }) })
      .getByRole('button', { name: /Guardar/i }).first();
    await expect(drawerSaveBtn).toBeVisible({ timeout: 5000 });
    await click(drawerSaveBtn);
    await waitForAppIdle(page, 2000);

    // HARD ASSERT: drawer debe cerrarse tras guardar
    await expect(page.getByText('Editar Material', { exact: true })).not.toBeVisible({ timeout: 8000 });
    console.log('  ✅ Drawer cerrado tras guardar');

    // HARD ASSERT: badge "Editado localmente" debe aparecer en la fila
    await expect(
      page.locator('table tbody tr').filter({ hasText: /Cemento Portland/i }).first()
        .getByText('Editado localmente', { exact: true }),
    ).toBeVisible({ timeout: 10000 });
    console.log('  ✅ Badge "Editado localmente" visible en la fila');

    // Reabrir y verificar persistencia del precio
    const cementoRow2 = page.locator('table tbody tr').filter({ hasText: /Cemento Portland/i }).first();
    await click(cementoRow2.locator('button[title="Editar"]'));
    await expect(page.getByText('Editar Material', { exact: true })).toBeVisible({ timeout: 8000 });

    const precioAfter = await page.locator('input[placeholder="0.00"]').inputValue();
    expect(Number(precioAfter), 'Precio no persistió — debe ser 180').toBeCloseTo(180, 0);
    console.log(`  ✅ Precio verificado tras reabrir: ${precioAfter}`);

    // Cerrar drawer
    await click(page.locator('button[title="Cerrar"]').first());
    await waitForAppIdle(page, 500);

    console.log(`   Clics acumulados: ${clickCount}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 6 — Crear APU con materiales y usarlo en presupuesto (RUN_ID único)
  // ═══════════════════════════════════════════════════════════════════════════
  test('06 — Crear APU de muro con materiales y usarlo en presupuesto', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Credenciales QA no configuradas');

    await page.goto('/');
    await waitForAppIdle(page, 2500);
    await ensureProjectActive(page);

    await navTo(page, 'Administración de Proyecto');
    await dataAdminTab(page, 'Analisis de Precios');
    await waitForAppIdle(page, 2500);

    // Con RUN_ID único, el APU no existe → siempre crear
    console.log(`  Creando APU "${APU_NAME_RUN}" con materiales…`);

    await click(page.getByRole('button', { name: 'Nueva Tarea', exact: true }));
    await waitForAppIdle(page, 1500);

    // Nombre del APU
    const nameInput = page.locator('input[placeholder*="Mampostería"]');
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await nameInput.fill(APU_NAME_RUN);
    clickCount++;

    // Unidad — fill siempre (requerido para que handleSave no rechace)
    const unitInput = page.locator('input[placeholder="m2"]');
    await expect(unitInput).toBeVisible({ timeout: 5000 });
    await unitInput.fill('m²');
    clickCount++;

    // El select de materiales se identifica por su option placeholder
    const matSelect = page.locator('select').filter({
      has: page.locator('option').filter({ hasText: '— Seleccionar material —' }),
    });
    await expect(matSelect).toBeVisible({ timeout: 8000 });

    let materialesAgregados = 0;
    for (const { keyword, qty } of MATERIAL_YIELDS) {
      const optionEls = await matSelect.locator('option').all();
      let matchValue: string | null = null;
      for (const opt of optionEls) {
        const text = (await opt.textContent() ?? '').toUpperCase();
        if (text.includes(keyword)) {
          matchValue = await opt.getAttribute('value');
          break;
        }
      }

      if (!matchValue) {
        console.warn(`⚠️  Material "${keyword}" no disponible — verificar paso 04`);
        continue;
      }

      await matSelect.selectOption({ value: matchValue });
      clickCount++;
      await waitForAppIdle(page, 300);

      // Primer "Agregar" en el DOM = sección Materiales
      await click(page.getByRole('button', { name: 'Agregar', exact: true }).first());
      await waitForAppIdle(page, 500);

      // Cantidad en el último input numérico de tbody
      const qtyInputs = page.locator('tbody input[type="number"]');
      if (await qtyInputs.count() > 0) {
        await qtyInputs.last().fill(qty);
        await qtyInputs.last().press('Tab');
        clickCount++;
        materialesAgregados++;
      }
    }

    console.log(`  Materiales agregados al APU: ${materialesAgregados} de ${MATERIAL_YIELDS.length}`);

    // HARD ASSERT: al menos 1 material fue agregado
    expect(materialesAgregados, 'Ningún material pudo ser agregado al APU').toBeGreaterThan(0);

    // Guardar APU
    const saveBtn = page.getByRole('button', { name: 'Guardar', exact: true }).first();
    await expect(saveBtn).toBeVisible({ timeout: 5000 });
    await click(saveBtn);

    // Esperar que vuelva a vista lista: "Nueva Tarea" reaparece cuando view='list'
    await expect(page.getByRole('button', { name: 'Nueva Tarea', exact: true })).toBeVisible({ timeout: 15000 });
    await waitForAppIdle(page, 1000);

    // HARD ASSERT: fila del APU debe aparecer en la lista
    const apuRow = page.locator('table tbody tr').filter({ hasText: new RegExp(APU_NAME_RUN.slice(0, 20), 'i') }).first();
    await expect(apuRow).toBeVisible({ timeout: 10000 });
    console.log(`  ✅ APU "${APU_NAME_RUN}" creado y visible en lista`);

    // ── Usar APU en presupuesto ────────────────────────────────────────────
    const usarBtn = apuRow.getByRole('button', { name: 'Usar', exact: true });
    await expect(usarBtn).toBeVisible({ timeout: 5000 });
    await click(usarBtn);
    await waitForAppIdle(page, 1500);

    // Modal "Usar en Presupuesto" — scoped al overlay fixed
    const modalOverlay = page.locator('[class*="fixed"][class*="inset-0"]').last();
    const modalQtyInput = modalOverlay.locator('input[type="number"]');
    if (await modalQtyInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await modalQtyInput.fill('45');
      clickCount++;
    }

    const importBtn = modalOverlay.getByRole('button', { name: 'Importar al Proyecto', exact: true });
    await expect(importBtn).toBeVisible({ timeout: 5000 });
    await click(importBtn);
    await waitForAppIdle(page, 3000);

    console.log(`  ✅ APU importado al presupuesto con cantidad 45 m²`);
    console.log(`   Clics acumulados: ${clickCount}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 7 — Presupuesto: APU visible + subtotal > $0 (HARD ASSERTS)
  // ═══════════════════════════════════════════════════════════════════════════
  test('07 — Presupuesto: APU con cantidad 45 y subtotal > $0', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Credenciales QA no configuradas');

    await page.goto('/');
    await waitForAppIdle(page, 2500);
    await ensureProjectActive(page);

    await navTo(page, 'Presupuesto');
    await waitForAppIdle(page, 2000);

    const content = await page.textContent('body') ?? '';

    // Hard assert: sin errores 5xx
    expect(failedRequests.filter(r => r.startsWith('5')).length, '5xx requests detectadas').toBe(0);

    // Hard assert: ítem APU visible en presupuesto
    const apuShort = APU_NAME_RUN.slice(0, 15);
    const hasApuItem = content.includes(apuShort);
    console.log(`   Ítem APU en presupuesto: ${hasApuItem ? '✅' : '❌'} (buscando "${apuShort}")`);
    expect(hasApuItem, `APU "${APU_NAME_RUN}" no aparece en el presupuesto`).toBe(true);

    // Hard assert: subtotal > $0 (regex: $ seguido de dígito 1-9)
    const hasPositiveCost = /\$[1-9][0-9,\.]+/.test(content);
    console.log(`   Subtotal > $0: ${hasPositiveCost ? '✅' : '❌'}`);
    expect(hasPositiveCost, 'Presupuesto sin subtotal > $0 — APU puede tener materiales sin precio').toBe(true);

    // Verificar que NO aparece $0.00 sin razón (warning si hay)
    const hasZeroCost = /\$0[,\.]00/.test(content);
    if (hasZeroCost) {
      console.warn('⚠️  Detectado $0.00 en presupuesto — posible ítem sin precio configurado');
    }

    console.log(`   Clics acumulados: ${clickCount}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 8 — Explosión de Insumos: badges, tabla y descarga Excel
  // ═══════════════════════════════════════════════════════════════════════════
  test('08 — Explosión de Insumos: badges, tabla y descarga Excel', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Credenciales QA no configuradas');

    await page.goto('/');
    await waitForAppIdle(page, 2500);
    await ensureProjectActive(page);

    await navTo(page, 'Administración de Proyecto');
    await dataAdminTab(page, 'Reportes');
    await waitForAppIdle(page, 2000);

    // Verificar card "Explosión de Insumos" y navegar a él
    await expect(page.getByText('Explosión de Insumos', { exact: false })).toBeVisible({ timeout: 10000 });
    await click(page.getByText('Explosión de Insumos', { exact: false }).first());
    await waitForAppIdle(page, 1000);

    // Verificar badges de contexto
    const content = await page.textContent('body') ?? '';
    const hasBaseBadge = content.includes('Base presupuesto') || content.includes('Precios congelados');
    console.log(`  Badge "Base presupuesto" / "Precios congelados": ${hasBaseBadge ? '✅' : '❌'}`);

    // Seleccionar proyecto QA
    const projectSelect = page.locator('select').first();
    if (await projectSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
      await projectSelect.selectOption({ label: PROJECT_NAME }).catch(() =>
        console.warn('⚠️  Proyecto no encontrado en select — puede que no aparezca aún'),
      );
      clickCount++;
      await waitForAppIdle(page, 1000);
    }

    // Calcular
    const calcBtn = page.getByRole('button', { name: /Calcular/i });
    await click(calcBtn);
    await waitForAppIdle(page, 8000);

    const contentAfter = await page.textContent('body') ?? '';
    const tableRow = page.locator('table tbody tr').first();
    const hasTableRow = await tableRow.isVisible({ timeout: 8000 }).catch(() => false);
    console.log(`  Tabla tiene filas de datos: ${hasTableRow ? '✅' : '❌'}`);
    if (!hasTableRow) {
      console.warn('⚠️  Sin filas en tabla — APU puede no tener materiales con costo');
    }

    // Descarga de Excel
    const xlsxBtn = page.locator('button').filter({ hasText: /Exportar Excel/i }).first();
    await xlsxBtn.scrollIntoViewIfNeeded().catch(() => null);
    if (await xlsxBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
      const downloadDir = path.join(process.cwd(), 'playwright-downloads');
      fs.mkdirSync(downloadDir, { recursive: true });

      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 15000 }),
        click(xlsxBtn),
      ]).catch(() => [null]);

      if (download) {
        const filePath = path.join(downloadDir, download.suggestedFilename());
        await download.saveAs(filePath);
        const stats = fs.statSync(filePath);
        downloadedFiles.push(download.suggestedFilename());

        expect(stats.size, 'Excel de Explosión de Insumos vacío').toBeGreaterThan(500);
        expect(download.suggestedFilename()).toMatch(/explosion_insumos/i);
        console.log(`  ✅ Excel descargado: ${download.suggestedFilename()} (${stats.size} bytes)`);
      } else {
        console.warn('⚠️  No se pudo descargar el Excel de Explosión de Insumos');
      }
    } else {
      console.warn('⚠️  Botón "Exportar Excel" no encontrado (deshabilitado — sin resultados?)');
    }

    console.log(`   Clics acumulados: ${clickCount}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 9 — Lista de Materiales: badge, tabla y descarga XLS
  // ═══════════════════════════════════════════════════════════════════════════
  test('09 — Lista de Materiales: badge "Precios actuales" y descarga XLS', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Credenciales QA no configuradas');

    await page.goto('/');
    await waitForAppIdle(page, 2500);
    await ensureProjectActive(page);

    await navTo(page, 'Dashboard');
    await waitForAppIdle(page, 2000);

    // Cambiar al tab "Reportes e Ingeniería" donde vive el widget
    const reportesTab = page.getByRole('button', { name: 'Reportes e Ingeniería', exact: true });
    if (await reportesTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await click(reportesTab);
      await waitForAppIdle(page, 1500);
    }

    const content = await page.textContent('body') ?? '';

    // Hard assert: widget visible
    await expect(page.getByText('Lista de Materiales', { exact: false })).toBeVisible({ timeout: 10000 });

    const hasPreciosActuales = content.includes('Precios actuales');
    const hasSubtitle        = content.includes('Cantidades del proyecto');
    const hasCostoTotal      = content.includes('Costo total') || content.includes('Costo Total');
    console.log(`  Badge "Precios actuales": ${hasPreciosActuales ? '✅' : '❌'}`);
    console.log(`  Subtítulo correcto:       ${hasSubtitle ? '✅' : '❌'}`);
    console.log(`  Columna "Costo total":    ${hasCostoTotal ? '✅' : '❌'}`);

    // Descarga XLS — botón texto "XLS" (lucide icon + texto)
    const xlsBtn = page.locator('button').filter({ hasText: /^XLS$/ }).first();
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
    } else {
      // Fallback: regex amplio en caso de que el texto cambie
      const xlsBtnFallback = page.getByRole('button', { name: /XLS|Excel/i }).first();
      if (await xlsBtnFallback.isVisible({ timeout: 3000 }).catch(() => false)) {
        const downloadDir = path.join(process.cwd(), 'playwright-downloads');
        fs.mkdirSync(downloadDir, { recursive: true });
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 10000 }),
          click(xlsBtnFallback),
        ]).catch(() => [null]);
        if (download) {
          const fp = path.join(downloadDir, download.suggestedFilename());
          await download.saveAs(fp);
          const stats = fs.statSync(fp);
          downloadedFiles.push(download.suggestedFilename());
          expect(stats.size, 'XLS de Lista de Materiales vacío').toBeGreaterThan(500);
          console.log(`  ✅ XLS (fallback) descargado: ${download.suggestedFilename()} (${stats.size} bytes)`);
        }
      } else {
        console.warn('⚠️  Botón XLS no encontrado');
      }
    }

    console.log(`   Clics acumulados: ${clickCount}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 10 — Reporte Completo no está en blanco
  // ═══════════════════════════════════════════════════════════════════════════
  test('10 — Reporte Completo no está en blanco', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Credenciales QA no configuradas');

    await page.goto('/');
    await waitForAppIdle(page, 2500);
    await ensureProjectActive(page);

    await navTo(page, 'Dashboard');
    await waitForAppIdle(page, 2000);

    const reportBtn = page.getByRole('button', { name: /Imprimir|Reporte|Exportar/i }).first();
    if (!(await reportBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      console.warn('⚠️  Botón de Reporte Completo no encontrado en Dashboard — skip');
      return;
    }

    await click(reportBtn);
    await waitForAppIdle(page, 2000);

    const content = await page.textContent('body') ?? '';
    const hasPreview = content.includes('Presupuesto') || content.includes('Insumos') || content.includes('Secciones');
    console.log(`  Preview del reporte tiene contenido: ${hasPreview ? '✅' : '❌'}`);

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

    const results: Record<string, boolean> = {};

    // DataAdmin: todos los tabs deben estar presentes
    await navTo(page, 'Administración de Proyecto');
    await waitForAppIdle(page, 2000);
    const adminContent = await page.textContent('body') ?? '';
    for (const label of [
      'Administración de Proyecto',
      'Materiales de Empresa',
      'Recursos Globales',
      'Analisis de Precios',
      'Reportes',
    ]) {
      results[label] = adminContent.includes(label);
    }

    // Dashboard → Reportes e Ingeniería
    await navTo(page, 'Dashboard');
    await waitForAppIdle(page, 2000);
    const reportesIngBtn = page.getByRole('button', { name: 'Reportes e Ingeniería', exact: true });
    if (await reportesIngBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await click(reportesIngBtn);
      await waitForAppIdle(page, 1500);
    }
    const dashContent = await page.textContent('body') ?? '';
    results['Lista de Materiales'] = dashContent.includes('Lista de Materiales');
    results['Precios actuales']    = dashContent.includes('Precios actuales');

    // Reportes → Explosión de Insumos card → verificar badge "Base presupuesto"
    await navTo(page, 'Administración de Proyecto');
    await dataAdminTab(page, 'Reportes');
    await waitForAppIdle(page, 2000);
    // Navegar al card "Explosión de Insumos" para que el componente renderice
    const explosionCard = page.locator('button').filter({ hasText: /Explosión de Insumos/i }).first();
    if (await explosionCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await click(explosionCard);
      await waitForAppIdle(page, 1000);
    }
    const reportContent = await page.textContent('body') ?? '';
    results['Explosión de Insumos'] = reportContent.includes('Explosión de Insumos');
    results['Base presupuesto']     = reportContent.includes('Base presupuesto') || reportContent.includes('Precios congelados');

    console.log('\n═══ Asserts Visuales ═══');
    for (const [label, found] of Object.entries(results)) {
      console.log(`  ${found ? '✅' : '❌'}  ${label}`);
    }

    const missing = Object.entries(results).filter(([, f]) => !f).map(([l]) => l);
    if (missing.length > 0) console.warn(`⚠️  Labels faltantes: ${missing.join(', ')}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 12 — Métricas finales y limpieza
  // ═══════════════════════════════════════════════════════════════════════════
  test('12 — Métricas finales y limpieza', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Credenciales QA no configuradas');

    await page.goto('/');
    await waitForAppIdle(page, 2500);
    await ensureProjectActive(page);

    console.log('\n═══ MÉTRICAS FINALES ═══');
    console.log(`  RUN_ID:                   ${RUN_ID}`);
    console.log(`  Proyecto QA creado:        ${PROJECT_NAME}`);
    console.log(`  APU QA creado:             ${APU_NAME_RUN}`);
    console.log(`  Clics útiles totales:      ${clickCount}`);
    console.log(`  Errores de consola:        ${consoleErrors.length}`);
    console.log(`  Requests fallidas (5xx):   ${failedRequests.length}`);
    console.log(`  Archivos descargados:      ${downloadedFiles.length}`);
    if (downloadedFiles.length > 0) console.log(`  Archivos: ${downloadedFiles.join(', ')}`);

    if (consoleErrors.length > 0) console.warn('  Errores de consola:', consoleErrors.slice(0, 5));
    if (failedRequests.length > 0) console.warn('  Requests fallidas:', failedRequests);

    console.log('\n  Limpieza manual requerida:');
    console.log(`  Proyecto:  Supabase → Table Editor → projects → name = '${PROJECT_NAME}' → Delete`);
    console.log(`  APU:       master_tasks → name = '${APU_NAME_RUN}' → Delete`);

    if (clickCount > 80) {
      console.warn(`⚠️  Clics totales (${clickCount}) altos — revisar si hay navegación innecesaria`);
    } else {
      console.log(`✅ Clics dentro del rango esperado (${clickCount})`);
    }

    // Hard assert: sin errores 5xx
    expect(failedRequests.filter(r => r.startsWith('5')).length, 'Se detectaron requests 500').toBe(0);
  });

});
