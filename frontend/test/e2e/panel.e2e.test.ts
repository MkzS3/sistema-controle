import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';

const frontendDirectory = resolve(import.meta.dir, '../..');
const edgeExecutable = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const serverUrl = 'http://127.0.0.1:5197/';
const viewportSizes = [
  { width: 1440, height: 1000, label: 'desktop' },
  { width: 768, height: 1024, label: 'tablet' },
  { width: 390, height: 844, label: 'mobile-390' },
  { width: 360, height: 800, label: 'mobile-360' },
] as const;
const longId = `beneficiary-${'x'.repeat(64)}`;

let server: Bun.Subprocess | undefined;
let browser: Browser | undefined;
let page: Page | undefined;
let apiOffline = false;
let paymentAttempts = 0;
const apiRequests: string[] = [];
const paymentRequestKeys: string[] = [];

function json(body: unknown, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) };
}

function list(items: unknown[], requestUrl: URL) {
  const limit = Number(requestUrl.searchParams.get('limit') ?? 20);
  const offset = Number(requestUrl.searchParams.get('offset') ?? 0);
  return json({ items, total: items.length, limit, offset });
}

function routeData(path: string, requestUrl: URL) {
  if (path === '/auth/session') return json({ mode: 'local-development', authenticated: false, roles: [], permissions: [] });
  if (path === '/dashboard/summary') return json({
    dividends: 1, beneficiaries: 1, obligations: 1, payments: 1,
    obligationsByStatus: { DUE: 1 },
    outbox: { pending: 1, processing: 0, published: 0, deadLettered: 0, byStatus: { PENDING: 1 } },
    ledgerReconciliationIssues: 0,
  });
  if (path === '/beneficiaries') return list([{ id: longId, createdAt: '2026-11-16T12:00:00.000Z' }], requestUrl);
  if (path === '/dividends') return list([{ id: 'dividend-browser', currency: 'BRL', terms: { kind: 'FIXED_AMOUNT', amount: { amount: '12.00', currency: 'BRL' } }, status: 'DRAFT', createdAt: '2026-11-16T12:00:00.000Z' }], requestUrl);
  if (path === '/obligations') return list([{ id: 'obligation-browser', dividendId: 'dividend-browser', beneficiaryId: longId, amount: { amount: '12.00', currency: 'BRL' }, status: 'DUE', createdAt: '2026-11-16T12:00:00.000Z' }], requestUrl);
  if (path === '/payments') return list([{ id: 'payment-browser', obligationId: 'obligation-browser', beneficiaryId: longId, idempotencyKey: 'browser-test-key', amount: { amount: '12.00', currency: 'BRL' }, requestedAt: '2026-11-16T12:00:00.000Z', obligationStatus: 'PAYMENT_REQUESTED' }], requestUrl);
  if (path === '/ledger') return list([{ id: 'ledger-browser', obligationId: 'obligation-browser', kind: 'OBLIGATION_RECOGNIZED', source: { type: 'OBLIGATION', id: 'obligation-browser' }, amount: { amount: '12.00', currency: 'BRL' }, createdAt: '2026-11-16T12:00:00.000Z' }], requestUrl);
  if (path.endsWith('/obligations')) return list([], requestUrl);
  return json({ statusCode: 404, code: 'RESOURCE_NOT_FOUND', message: 'Não encontrado.' }, 404);
}

async function waitForServer(): Promise<void> {
  const timeoutAt = Date.now() + 20_000;
  while (Date.now() < timeoutAt) {
    try {
      const response = await fetch(serverUrl);
      if (response.ok) return;
    } catch { /* The Vite process is still starting. */ }
    await Bun.sleep(100);
  }
  throw new Error('Vite did not become ready at the loopback test URL.');
}

async function assertNoHorizontalOverflow(width: number, screenName: string): Promise<void> {
  const measurements = await page!.evaluate(() => ({
    viewport: window.innerWidth,
    scrollX: window.scrollX,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(measurements.viewport).toBe(width);
  expect(measurements.scrollX).toBe(0);
  expect(measurements.document).toBeLessThanOrEqual(width);
  expect(measurements.body).toBeLessThanOrEqual(width);
  if (measurements.document > width || measurements.body > width) {
    throw new Error(`${screenName} overflows at ${width}px: ${JSON.stringify(measurements)}`);
  }
}

beforeAll(async () => {
  if (!(await Bun.file(edgeExecutable).exists())) throw new Error(`Installed Edge browser was not found at ${edgeExecutable}.`);
  server = Bun.spawn([
    process.execPath, 'run', 'vite', '--host', '127.0.0.1', '--port', '5197', '--strictPort',
  ], { cwd: frontendDirectory, stdout: 'ignore', stderr: 'ignore' });
  await waitForServer();

  browser = await chromium.launch({ executablePath: edgeExecutable, headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.port !== '3000' || !['localhost', '127.0.0.1', '[::1]'].includes(requestUrl.hostname)) {
      await route.continue();
      return;
    }
    apiRequests.push(`${route.request().method()} ${route.request().url()}`);
    if (apiOffline) {
      await route.abort('failed');
      return;
    }
    const corsHeaders = {
      'Access-Control-Allow-Origin': new URL(serverUrl).origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Scope, Idempotency-Key, X-Correlation-Id',
    };
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (route.request().method() === 'POST' && requestUrl.pathname.endsWith('/payment-instructions')) {
      paymentAttempts += 1;
      const key = route.request().headers()['idempotency-key'] ?? '';
      paymentRequestKeys.push(key);
      if (paymentAttempts === 1) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
        await route.fulfill({ ...json({ code: 'TEMPORARY_FAILURE', message: 'Falha transitória controlada.' }, 503), headers: corsHeaders });
        return;
      }
      await route.fulfill({
        ...json({ id: 'payment-after-retry', obligationId: 'obligation-browser', beneficiaryId: longId, idempotencyKey: key, amount: { amount: '12.00', currency: 'BRL' }, requestedAt: '2026-11-16T12:00:00.000Z', obligationStatus: 'PAYMENT_REQUESTED', replayed: true }, 201),
        headers: corsHeaders,
      });
      return;
    }
    if (route.request().method() !== 'GET') {
      await route.fulfill({ ...json({ id: 'browser-action', status: 'DRAFT' }, 201), headers: corsHeaders });
      return;
    }
    await route.fulfill({
      ...routeData(requestUrl.pathname, requestUrl),
      headers: corsHeaders,
    });
  });
});

beforeEach(() => { apiOffline = false; paymentAttempts = 0; apiRequests.length = 0; paymentRequestKeys.length = 0; });

afterAll(async () => {
  await browser?.close();
  if (server) {
    server.kill();
    await server.exited;
  }
});

describe('real-browser panel checks (installed Edge, local Vite, controlled API)', () => {
  test('renders all screens and avoids page overflow at each requested viewport', { timeout: 60_000 }, async () => {
    const sections = [
      { label: 'Visão geral', heading: 'Visão geral' },
      { label: 'Beneficiários', heading: 'Beneficiários' },
      { label: 'Dividendos', heading: 'Dividendos' },
      { label: 'Obrigações', heading: 'Obrigações' },
      { label: 'Instruções', heading: 'Instruções de pagamento' },
      { label: /Ledger financeiro/, heading: 'Ledger financeiro' },
    ];

    for (const viewport of viewportSizes) {
      await page!.setViewportSize({ width: viewport.width, height: viewport.height });
      await page!.goto(serverUrl, { waitUntil: 'networkidle' });
      const menu = page!.getByRole('button', { name: 'Abrir navegação' });
      if (viewport.width <= 760) expect(await menu.isVisible()).toBe(true);
      else expect(await menu.isVisible()).toBe(false);

      for (const section of sections) {
        if (viewport.width <= 760) await menu.click();
        await page!.getByRole('button', { name: section.label }).click();
        await page!.getByRole('heading', { name: section.heading }).waitFor();
        await page!.waitForLoadState('networkidle');
        const descriptionSize = await page!.locator('.page-description').first().evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
        expect(descriptionSize).toBeGreaterThanOrEqual(12);
        if (section.heading === 'Visão geral') {
          await page!.locator('.metric-card').first().waitFor();
          expect(await page!.locator('.metric-card').count()).toBe(4);
          const chartLabelsStayClear = await page!.locator('.status-chart-row').evaluateAll((rows) => rows.every((row) => {
            const badge = row.querySelector('.status-badge')?.getBoundingClientRect();
            const track = row.querySelector('.bar-track')?.getBoundingClientRect();
            return badge && track ? badge.right <= track.left + 1 : false;
          }));
          expect(chartLabelsStayClear).toBe(true);
        } else {
          const table = page!.locator('.table-wrap');
          await table.locator('tbody tr').first().waitFor();
          expect(await page!.locator('.table-wrap tbody tr').count()).toBe(1);
          const cellTextSize = await page!.locator('.table-wrap tbody td').first().evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
          expect(cellTextSize).toBeGreaterThanOrEqual(11);
          if (section.heading === 'Dividendos' && viewport.width <= 390) {
            const tableMetrics = await table.evaluate((element) => ({ overflowX: getComputedStyle(element).overflowX, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
            expect(tableMetrics.overflowX).toBe('auto');
            expect(tableMetrics.scrollWidth).toBeGreaterThan(tableMetrics.clientWidth);
            await table.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
            expect(await table.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
          }
        }
        if (Bun.env.PANEL_SCREENSHOT_DIR && [1440, 768].includes(viewport.width) && section.heading === 'Visão geral') {
          await page!.screenshot({ path: resolve(Bun.env.PANEL_SCREENSHOT_DIR, `dividend-panel-${viewport.label}.png`), fullPage: true });
        }
        await assertNoHorizontalOverflow(viewport.width, section.heading);
        if (viewport.width <= 760) expect(await menu.getAttribute('aria-expanded')).toBe('false');
      }

      if (viewport.width <= 760) await menu.click();
      await page!.getByRole('button', { name: 'Dividendos' }).click();
      await page!.getByRole('heading', { name: 'Dividendos' }).waitFor();
      const trigger = page!.getByRole('button', { name: /Novo dividendo/ });
      await trigger.click();
      const dialog = page!.getByRole('dialog', { name: 'Novo dividendo' });
      await dialog.waitFor();
      expect(await dialog.getByRole('textbox', { name: /Valor declarado/ }).count()).toBe(1);
      const modalBounds = await dialog.boundingBox();
      expect(modalBounds).not.toBeNull();
      expect(modalBounds!.x).toBeGreaterThanOrEqual(0);
      expect(modalBounds!.x + modalBounds!.width).toBeLessThanOrEqual(viewport.width + 1);
      await page!.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      await page!.waitForTimeout(250);
      await assertNoHorizontalOverflow(viewport.width, 'modal closed');
      if (Bun.env.PANEL_SCREENSHOT_DIR && viewport.width <= 390) {
        await page!.screenshot({ path: resolve(Bun.env.PANEL_SCREENSHOT_DIR, `dividend-panel-${viewport.label}.png`), fullPage: true });
      }
    }
  });

  test('supports real keyboard focus in the confirmation dialog and keeps payment state explicit', { timeout: 30_000 }, async () => {
    await page!.setViewportSize({ width: 1440, height: 1000 });
    await page!.goto(serverUrl, { waitUntil: 'networkidle' });
    const dividendNav = page!.getByRole('button', { name: 'Dividendos' });
    await dividendNav.click();
    await page!.getByRole('button', { name: /Novo dividendo/ }).focus();
    await page!.keyboard.press('Enter');
    const dialog = page!.getByRole('dialog', { name: 'Novo dividendo' });
    await dialog.waitFor();
    expect(await page!.locator('[role="dialog"] button[aria-label="Fechar"]').evaluate((element) => element === document.activeElement)).toBe(true);
    await page!.keyboard.press('Shift+Tab');
    expect(await page!.getByRole('button', { name: 'Criar rascunho' }).evaluate((element) => element === document.activeElement)).toBe(true);
    await page!.keyboard.press('Tab');
    expect(await page!.locator('[role="dialog"] button[aria-label="Fechar"]').evaluate((element) => element === document.activeElement)).toBe(true);
    await page!.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    expect(await page!.getByRole('button', { name: /Novo dividendo/ }).evaluate((element) => element === document.activeElement)).toBe(true);

    await page!.getByRole('button', { name: 'Instruções' }).click();
    await page!.getByRole('heading', { name: 'Instruções de pagamento' }).waitFor();
    await page!.getByText('payment-browser').waitFor();
    expect(await page!.getByText('Instrução solicitada').count()).toBeGreaterThan(0);
    expect(await page!.getByText('Liquidado').count()).toBe(0);
    await page!.getByRole('button', { name: 'Detalhes' }).click();
    await page!.getByText(/não é executada por este painel/).waitFor();
  });

  test('shows connection failure in the browser without replacement/demo data', async () => {
    apiOffline = true;
    await page!.setViewportSize({ width: 390, height: 844 });
    await page!.goto(serverUrl, { waitUntil: 'domcontentloaded' });
    await page!.getByRole('heading', { name: 'Não foi possível verificar a sessão' }).waitFor();
    expect(await page!.getByText(/Não foi possível conectar ao backend/).count()).toBeGreaterThan(0);
    expect(await page!.getByText('Sem dados de demonstração · API local configurada').count()).toBe(0);
    expect(await page!.locator('.metric-card').count()).toBe(0);
  });

  test('retries a logical payment instruction with the same idempotency key and blocks duplicate clicks', async () => {
    await page!.setViewportSize({ width: 390, height: 844 });
    await page!.goto(serverUrl, { waitUntil: 'networkidle' });
    await page!.getByRole('button', { name: 'Abrir navegação' }).click();
    await page!.getByRole('button', { name: 'Obrigações' }).click();
    await page!.getByText('obligation-browser').waitFor();
    await page!.getByRole('button', { name: 'Solicitar instrução' }).click();
    await page!.getByRole('dialog', { name: 'Solicitar instrução lógica' }).waitFor();

    await page!.getByRole('button', { name: 'Confirmar solicitação' }).click();
    const sending = page!.getByRole('button', { name: 'Enviando solicitação…' });
    await sending.waitFor();
    expect(await sending.isDisabled()).toBe(true);
    await page!.keyboard.press('Enter');
    await page!.getByText('Falha transitória controlada.', { exact: true }).waitFor();
    expect(paymentAttempts).toBe(1);

    await page!.getByRole('button', { name: 'Confirmar solicitação' }).click();
    await page!.getByText(/Nenhuma transferência foi executada ou liquidada/).waitFor();
    expect(paymentAttempts).toBe(2);
    expect(paymentRequestKeys[0]).not.toBe('');
    expect(paymentRequestKeys[1]).toBe(paymentRequestKeys[0]);
    expect(await page!.getByText('Liquidado').count()).toBe(0);
  });
});
