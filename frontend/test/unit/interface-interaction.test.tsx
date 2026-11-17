import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://127.0.0.1:5173/', pretendToBeVisual: true });
const browserWindow = dom.window;
for (const [key, value] of Object.entries({
  window: browserWindow,
  document: browserWindow.document,
  navigator: browserWindow.navigator,
  HTMLElement: browserWindow.HTMLElement,
  Node: browserWindow.Node,
  Event: browserWindow.Event,
  MouseEvent: browserWindow.MouseEvent,
  KeyboardEvent: browserWindow.KeyboardEvent,
  getComputedStyle: browserWindow.getComputedStyle.bind(browserWindow),
  requestAnimationFrame: browserWindow.requestAnimationFrame.bind(browserWindow),
  cancelAnimationFrame: browserWindow.cancelAnimationFrame.bind(browserWindow),
})) {
  Object.defineProperty(globalThis, key, { configurable: true, value });
}
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true, writable: true });

const { cleanup, render, screen, waitFor, within } = await import('@testing-library/react');
const userEvent = (await import('@testing-library/user-event')).default;
const { App } = await import('../../src/app/App.js');
const { AuthSessionProvider } = await import('../../src/app/auth/session.js');
const { apiClient } = await import('../../src/app/api/api-client.js');

type RecordedRequest = { url: URL; method: string; headers: HeadersInit | undefined; body: string | undefined };
type ResponseHandler = (url: URL, request: RecordedRequest) => Response | Promise<Response>;
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const requests: RecordedRequest[] = [];
let responseHandler: ResponseHandler = defaultResponse;
const testClient = apiClient as unknown as { fetcher: Fetcher };
const originalFetcher = testClient.fetcher;
const controlledFetcher: Fetcher = async (input, init = {}) => {
  const url = new URL(String(input));
  const request = {
    url,
    method: init.method ?? 'GET',
    headers: init.headers,
    body: typeof init.body === 'string' ? init.body : undefined,
  };
  requests.push(request);
  return responseHandler(url, request);
};
testClient.fetcher = controlledFetcher;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function page(items: unknown[] = [], total = items.length, offset = 0, limit = 20): Response {
  return json({ items, total, offset, limit });
}

function defaultResponse(url: URL, request: RecordedRequest): Response {
  if (request.method === 'GET') {
    if (url.pathname === '/dashboard/summary') return json({
      dividends: 0, beneficiaries: 0, obligations: 0, payments: 0,
      obligationsByStatus: {},
      outbox: { pending: 0, processing: 0, published: 0, deadLettered: 0, byStatus: {} },
      ledgerReconciliationIssues: 0,
    });
    if (['/beneficiaries', '/dividends', '/obligations', '/payments', '/ledger'].includes(url.pathname)) {
      return page([], 0, Number(url.searchParams.get('offset') ?? 0));
    }
    return json({ statusCode: 404, code: 'RESOURCE_NOT_FOUND', message: 'Não encontrado.' }, 404);
  }
  if (url.pathname === '/beneficiaries') return json({ id: 'test-beneficiary-created', createdAt: '2026-11-16T12:00:00.000Z' }, 201);
  if (url.pathname === '/dividends') return json({ id: 'test-dividend-created', currency: 'BRL', terms: { kind: 'FIXED_AMOUNT', amount: { amount: '10.00', currency: 'BRL' } }, status: 'DRAFT', createdAt: '2026-11-16T12:00:00.000Z' }, 201);
  if (/\/declare$/.test(url.pathname)) return json({ id: url.pathname.split('/')[2], currency: 'BRL', terms: { kind: 'PARAMETERS', parameters: {} }, status: 'DECLARED', createdAt: '2026-11-16T12:00:00.000Z', declaredAt: '2026-11-16T12:00:00.000Z' });
  if (/\/obligations$/.test(url.pathname)) return json({ id: 'test-obligation-created', dividendId: 'test-dividend', beneficiaryId: 'test-beneficiary', amount: { amount: '1.00', currency: 'BRL' }, status: 'DUE', createdAt: '2026-11-16T12:00:00.000Z' }, 201);
  if (/\/payment-instructions$/.test(url.pathname)) return json({ id: 'test-payment-created', obligationId: 'test-obligation', beneficiaryId: 'test-beneficiary', idempotencyKey: 'test-key', amount: { amount: '1.00', currency: 'BRL' }, requestedAt: '2026-11-16T12:00:00.000Z', replayed: false });
  return json({ statusCode: 404, code: 'RESOURCE_NOT_FOUND', message: 'Não encontrado.' }, 404);
}

beforeEach(() => { testClient.fetcher = controlledFetcher; requests.length = 0; responseHandler = defaultResponse; });
afterEach(() => { cleanup(); });
afterAll(() => { testClient.fetcher = originalFetcher; dom.window.close(); });

describe('interactive React panel in jsdom (controlled API responses)', () => {
  test('navigates through all six screens and loads each route', async () => {
    const user = userEvent.setup({ document: browserWindow.document });
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeTruthy();

    const sections = [
      { button: 'Beneficiários', heading: 'Beneficiários', path: '/beneficiaries' },
      { button: 'Dividendos', heading: 'Dividendos', path: '/dividends' },
      { button: 'Obrigações', heading: 'Obrigações', path: '/obligations' },
      { button: 'Instruções', heading: 'Instruções de pagamento', path: '/payments' },
      { button: /Ledger financeiro/, heading: 'Ledger financeiro', path: '/ledger' },
    ];
    for (const section of sections) {
      await user.click(screen.getByRole('button', { name: section.button }));
      expect(await screen.findByRole('heading', { name: section.heading })).toBeTruthy();
      await waitFor(() => expect(requests.some((request) => request.method === 'GET' && request.url.pathname === section.path)).toBe(true));
      expect(await screen.findByRole('heading', { name: 'Nenhum registro encontrado' })).toBeTruthy();
    }

    const menu = screen.getByRole('button', { name: 'Abrir navegação' });
    await user.click(menu);
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Visão geral' }));
    expect(menu.getAttribute('aria-expanded')).toBe('false');
  });

  test('uses authenticated API permissions to hide administrative actions in the interface', async () => {
    responseHandler = (url) => {
      if (url.pathname === '/auth/session') return json({
        mode: 'oidc', authenticated: true, roles: ['viewer'],
        permissions: ['session:read', 'dashboard:read', 'beneficiaries:read', 'dividends:read', 'obligations:read', 'payments:read', 'ledger:read'],
      });
      if (url.pathname === '/dividends') return page([{
        id: 'read-only-dividend', currency: 'BRL', terms: { kind: 'PARAMETERS', parameters: {} },
        status: 'DRAFT', createdAt: '2026-11-16T12:00:00.000Z',
      }]);
      return defaultResponse(url, { method: 'GET' } as RecordedRequest);
    };
    const user = userEvent.setup({ document: browserWindow.document });
    const tokenProvider = { getAccessToken: async () => 'test-only-external-token' };
    render(<AuthSessionProvider tokenProvider={tokenProvider}><App /></AuthSessionProvider>);
    expect(await screen.findByText('Sessão autenticada')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Dividendos' }));
    expect(await screen.findByText('read-only-dividend')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Novo dividendo/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Declarar' })).toBeNull();
    expect(requests.every((request) => (request.headers as Record<string, string> | undefined)?.Authorization === 'Bearer test-only-external-token')).toBe(true);
  });

  test('moves an authenticated session to the expired state after an API 401', async () => {
    responseHandler = (url) => {
      if (url.pathname === '/auth/session') return json({ mode: 'oidc', authenticated: true, roles: ['viewer'], permissions: ['session:read', 'dashboard:read'] });
      if (url.pathname === '/dashboard/summary') return json({ code: 'ACCESS_TOKEN_EXPIRED', message: 'Token expirado.' }, 401);
      return defaultResponse(url, { method: 'GET' } as RecordedRequest);
    };
    render(<AuthSessionProvider tokenProvider={{ getAccessToken: async () => 'test-only-token' }}><App /></AuthSessionProvider>);
    expect(await screen.findByRole('heading', { name: 'Sessão expirada' })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Navegação principal' })).toBeNull();
  });

  test('shows an access-denied state after an authenticated request returns 403', async () => {
    responseHandler = (url) => {
      if (url.pathname === '/auth/session') return json({ mode: 'oidc', authenticated: true, roles: ['viewer'], permissions: ['session:read', 'dashboard:read'] });
      if (url.pathname === '/dashboard/summary') return json({ code: 'INSUFFICIENT_PERMISSION', message: 'Acesso negado.' }, 403);
      return defaultResponse(url, { method: 'GET' } as RecordedRequest);
    };
    render(<AuthSessionProvider tokenProvider={{ getAccessToken: async () => 'test-only-token' }}><App /></AuthSessionProvider>);
    expect(await screen.findByRole('heading', { name: 'Acesso negado' })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Navegação principal' })).toBeNull();
  });

  test('beneficiaries search, pagination, details, create, and API error are interactive', async () => {
    const user = userEvent.setup({ document: browserWindow.document });
    let failBeneficiaryRead = false;
    responseHandler = (url, request) => {
      if (url.pathname === '/beneficiaries' && request.method === 'GET') {
        if (failBeneficiaryRead) throw new Error('network unavailable');
        return page([{ id: 'beneficiary-alpha', createdAt: '2026-11-16T12:00:00.000Z' }], 45, Number(url.searchParams.get('offset') ?? 0));
      }
      return defaultResponse(url, request);
    };
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Beneficiários' }));
    expect(await screen.findByText('beneficiary-alpha')).toBeTruthy();

    await user.type(screen.getByRole('textbox', { name: 'Pesquisar beneficiários' }), 'alpha');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() => expect(requests.some((item) => item.url.searchParams.get('query') === 'alpha')).toBe(true));
    await user.click(screen.getByRole('button', { name: 'Próxima página' }));
    await waitFor(() => expect(requests.some((item) => item.url.searchParams.get('offset') === '20')).toBe(true));

    await user.click(screen.getByRole('button', { name: /Detalhes/ }));
    expect(await screen.findByRole('dialog', { name: 'Detalhe do beneficiário' })).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await user.click(screen.getByRole('button', { name: /Novo registro/ }));
    await user.click(screen.getByRole('button', { name: 'Criar registro' }));
    expect(await screen.findByText(/test-beneficiary-created/)).toBeTruthy();
    failBeneficiaryRead = true;
    await user.type(screen.getByRole('textbox', { name: 'Pesquisar beneficiários' }), ' offline');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText(/Não foi possível conectar ao backend/)).toBeTruthy();
  });

  test('dashboard displays API counts and unknown statuses, and handles an unavailable API', async () => {
    responseHandler = (url) => url.pathname === '/dashboard/summary'
      ? json({ dividends: 2, beneficiaries: 3, obligations: 4, payments: 1, obligationsByStatus: { DUE: 2, FUTURE_STATE: 2 }, outbox: { pending: 1, processing: 0, published: 2, deadLettered: 0, byStatus: { PAUSED: 1 } }, ledgerReconciliationIssues: 0 })
      : defaultResponse(url, { method: 'GET' } as RecordedRequest);
    render(<App />);
    expect(await screen.findByText('FUTURE_STATE')).toBeTruthy();
    expect(screen.getByText('O resumo contém estados desconhecidos')).toBeTruthy();
    expect(screen.getByText('A Outbox contém estados desconhecidos')).toBeTruthy();

    cleanup(); requests.length = 0;
    responseHandler = () => { throw new Error('network unavailable'); };
    render(<App />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText(/Não foi possível conectar ao backend/)).toBeTruthy();
  });

  test('shows an accessible loading state while the dashboard request is pending', async () => {
    let finishDashboard: ((response: Response) => void) | undefined;
    responseHandler = (url) => url.pathname === '/dashboard/summary'
      ? new Promise<Response>((resolve) => { finishDashboard = resolve; })
      : defaultResponse(url, { method: 'GET' } as RecordedRequest);
    render(<App />);
    expect(screen.getByRole('status').textContent).toContain('Carregando dados reais da API');
    await waitFor(() => expect(finishDashboard).toBeDefined());
    finishDashboard?.(json({ dividends: 0, beneficiaries: 0, obligations: 0, payments: 0, obligationsByStatus: {}, outbox: { pending: 0, processing: 0, published: 0, deadLettered: 0, byStatus: {} }, ledgerReconciliationIssues: 0 }));
    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeTruthy();
    expect(await screen.findByText('Ainda não há obrigações persistidas.')).toBeTruthy();
  });

  test('dividend create validates decimal text, confirms declaration, and cancels without posting', async () => {
    const user = userEvent.setup({ document: browserWindow.document });
    const dividend = { id: 'dividend-draft-1', currency: 'BRL', terms: { kind: 'FIXED_AMOUNT', amount: { amount: '12.00', currency: 'BRL' } }, status: 'DRAFT', createdAt: '2026-11-16T12:00:00.000Z' };
    responseHandler = (url, request) => {
      if (url.pathname === '/dividends' && request.method === 'GET') return page([dividend]);
      return defaultResponse(url, request);
    };
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Dividendos' }));
    await screen.findByText('dividend-draft-1');
    await user.click(screen.getByRole('button', { name: /Detalhes/ }));
    expect(await screen.findByRole('dialog', { name: 'Detalhes do dividendo' })).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Declarar' }));
    expect(await screen.findByRole('dialog', { name: 'Confirmar declaração' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(requests.some((item) => item.method === 'POST' && /\/declare$/.test(item.url.pathname))).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Declarar' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar declaração' }));
    expect(await screen.findByText(/Dividendo dividend-draft-1 declarado/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Novo dividendo/ }));
    const amount = screen.getByLabelText(/Valor declarado/);
    await user.type(amount, '0');
    await user.click(screen.getByRole('button', { name: 'Criar rascunho' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(requests.some((item) => item.method === 'POST' && item.url.pathname === '/dividends')).toBe(false);
    await user.clear(amount);
    await user.type(amount, '125.30');
    await user.click(screen.getByRole('button', { name: 'Criar rascunho' }));
    expect(await screen.findByText(/test-dividend-created criado como rascunho/)).toBeTruthy();
    const createdRequest = requests.find((item) => item.method === 'POST' && item.url.pathname === '/dividends');
    expect(JSON.parse(createdRequest?.body ?? '{}').terms.amount).toBe('125.30');
  });

  test('obligation form uses required fields and payment retry preserves its idempotency key', async () => {
    const user = userEvent.setup({ document: browserWindow.document });
    const obligation = { id: 'obligation-due-1', dividendId: 'dividend-1', beneficiaryId: 'beneficiary-1', amount: { amount: '25.00', currency: 'BRL' }, status: 'DUE', createdAt: '2026-11-16T12:00:00.000Z' };
    let paymentAttempts = 0;
    responseHandler = (url, request) => {
      if (url.pathname === '/obligations' && request.method === 'GET') return page([obligation]);
      if (/\/payment-instructions$/.test(url.pathname) && request.method === 'POST') {
        paymentAttempts += 1;
        return paymentAttempts === 1
          ? json({ code: 'TEMPORARY_FAILURE', message: 'API local indisponível.' }, 503)
          : json({ id: 'payment-1', obligationId: obligation.id, beneficiaryId: obligation.beneficiaryId, idempotencyKey: String((request.headers as Record<string, string>)['Idempotency-Key']), amount: obligation.amount, requestedAt: '2026-11-16T12:00:00.000Z', replayed: true });
      }
      return defaultResponse(url, request);
    };
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Obrigações' }));
    await screen.findByText('obligation-due-1');
    await user.click(screen.getByRole('button', { name: /Detalhes/ }));
    expect(await screen.findByRole('dialog', { name: 'Detalhes da obrigação' })).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Nova obrigação' }));
    const dialog = screen.getByRole('dialog', { name: 'Criar obrigação' });
    const requiredFields = dialog.querySelectorAll('input[required]');
    expect(requiredFields.length).toBe(3);
    expect((dialog.querySelector('form') as HTMLFormElement).checkValidity()).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    await user.click(screen.getByRole('button', { name: 'Solicitar instrução' }));
    expect(await screen.findByRole('dialog', { name: 'Solicitar instrução lógica' })).toBeTruthy();
    expect(screen.getByText(/Não executa transferência e não confirma liquidação/)).toBeTruthy();
    const confirmation = screen.getByRole('button', { name: 'Confirmar solicitação' });
    await user.click(confirmation);
    expect(await screen.findByText('API local indisponível.')).toBeTruthy();
    const firstKey = (requests.find((item) => item.method === 'POST' && /payment-instructions$/.test(item.url.pathname))?.headers as Record<string, string>)['Idempotency-Key'];
    await user.click(screen.getByRole('button', { name: 'Confirmar solicitação' }));
    expect(await screen.findByText(/Nenhuma transferência foi executada ou liquidada/)).toBeTruthy();
    const keys = requests.filter((item) => item.method === 'POST' && /payment-instructions$/.test(item.url.pathname)).map((item) => (item.headers as Record<string, string>)['Idempotency-Key']);
    expect(keys).toEqual([firstKey, firstKey]);
    expect(paymentAttempts).toBe(2);
  });

  test('payments distinguish pending status and ledger remains read-only with active filters', async () => {
    const user = userEvent.setup({ document: browserWindow.document });
    responseHandler = (url, request) => {
      if (url.pathname === '/payments' && request.method === 'GET') return page([{ id: 'payment-pending', obligationId: 'obligation-1', beneficiaryId: 'beneficiary-1', idempotencyKey: 'key-1', amount: { amount: '3.00', currency: 'BRL' }, requestedAt: '2026-11-16T12:00:00.000Z', obligationStatus: 'PAYMENT_REQUESTED' }]);
      if (url.pathname === '/ledger' && request.method === 'GET') return page([{ id: 'ledger-1', obligationId: 'obligation-1', kind: 'OBLIGATION_RECOGNIZED', source: { type: 'OBLIGATION', id: 'obligation-1' }, amount: { amount: '3.00', currency: 'BRL' }, createdAt: '2026-11-16T12:00:00.000Z' }]);
      return defaultResponse(url, request);
    };
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Instruções' }));
    await screen.findByText('payment-pending');
    expect(screen.getByText('Instrução solicitada')).toBeTruthy();
    expect(screen.queryByText('Liquidado')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Detalhes' }));
    expect(await screen.findByText(/não é executada por este painel/)).toBeTruthy();
    await user.keyboard('{Escape}');

    await user.selectOptions(screen.getByLabelText('Estado da obrigação'), 'PAYMENT_UNKNOWN');
    await waitFor(() => expect(requests.some((item) => item.url.pathname === '/payments' && item.url.searchParams.get('obligationStatus') === 'PAYMENT_UNKNOWN')).toBe(true));
    await user.click(screen.getByRole('button', { name: /Ledger financeiro/ }));
    await screen.findByText('ledger-1');
    expect(screen.getByText(/Reconhecimento não é liquidação/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Editar|Excluir/ })).toBeNull();
    await user.selectOptions(screen.getByLabelText('Tipo de evento'), 'PAYMENT_SETTLED');
    await user.type(screen.getByRole('textbox', { name: 'Filtrar ledger por obrigação' }), 'obligation-1');
    await user.click(screen.getByRole('button', { name: 'Filtrar' }));
    await waitFor(() => expect(requests.some((item) => item.url.pathname === '/ledger' && item.url.searchParams.get('kind') === 'PAYMENT_SETTLED' && item.url.searchParams.get('obligationId') === 'obligation-1')).toBe(true));
  });

  test('modal supports Tab, Shift+Tab, Enter, Escape, and focus restoration', async () => {
    const user = userEvent.setup({ document: browserWindow.document });
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Dividendos' }));
    const trigger = screen.getByRole('button', { name: /Novo dividendo/ });
    trigger.focus();
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog', { name: 'Novo dividendo' });
    const close = within(dialog).getByRole('button', { name: 'Fechar' });
    const submit = within(dialog).getByRole('button', { name: 'Criar rascunho' });
    await waitFor(() => expect(browserWindow.document.activeElement).toBe(close));
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(browserWindow.document.activeElement).toBe(submit);
    await user.keyboard('{Tab}');
    expect(browserWindow.document.activeElement).toBe(close);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(browserWindow.document.activeElement).toBe(trigger);
  });
});

afterEach(() => { testClient.fetcher = originalFetcher; });
