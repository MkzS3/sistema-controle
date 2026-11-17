import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from '../../src/app/App.js';
import { DataTable, EmptyState, ErrorState, Modal, Pagination, StatusBadge } from '../../src/app/components/ui.js';
import { DashboardPage } from '../../src/app/pages/DashboardPage.js';
import { BeneficiariesPage, DividendsPage, LedgerPage, ObligationsPage, PaymentsPage } from '../../src/app/pages/ResourcePages.js';

describe('reusable dashboard components', () => {
  test('renders an accessible unknown status label', () => {
    const markup = renderToStaticMarkup(<StatusBadge status="UNRECOGNIZED" />);
    expect(markup).toContain('Estado desconhecido (UNRECOGNIZED)');
    expect(markup).toContain('status-warning');
  });

  test('renders empty state copy without inventing records', () => {
    const markup = renderToStaticMarkup(<EmptyState title="Sem dados" description="A API não retornou registros." />);
    expect(markup).toContain('Sem dados');
    expect(markup).toContain('A API não retornou registros.');
    expect(markup).not.toContain('R$');
  });

  test('lists the six administrative sections without claiming the API is connected', () => {
    const markup = renderToStaticMarkup(<App />);

    for (const section of ['Visão geral', 'Beneficiários', 'Dividendos', 'Obrigações', 'Instruções', 'Ledger financeiro']) {
      expect(markup).toContain(section);
    }
    expect(markup).toContain('API local');
    expect(markup).toContain('Sem dados de demonstração');
    expect(markup).not.toContain('Dados operacionais carregados da API local');
  });

  test('renders all six administrative screen headings in an honest loading state', () => {
    const screens = [
      ['Visão geral', <DashboardPage />],
      ['Beneficiários', <BeneficiariesPage />],
      ['Dividendos', <DividendsPage />],
      ['Obrigações', <ObligationsPage />],
      ['Instruções de pagamento', <PaymentsPage />],
      ['Ledger financeiro', <LedgerPage />],
    ] as const;

    for (const [heading, screen] of screens) {
      const markup = renderToStaticMarkup(screen);
      expect(markup).toContain(`<h1>${heading}</h1>`);
      expect(markup).toContain('role="status"');
      expect(markup).not.toContain('R$');
    }
  });

  test('exposes semantic navigation, error, and empty states', () => {
    const app = renderToStaticMarkup(<App />);
    expect((app.match(/aria-current="page"/g) ?? []).length).toBe(1);
    expect(app).toContain('aria-label="Navegação principal"');
    expect(app).toContain('aria-label="Abrir navegação"');

    const error = renderToStaticMarkup(<ErrorState message="API local indisponível" retry={() => {}} />);
    expect(error).toContain('role="alert"');
    expect(error).toContain('API local indisponível');

    const emptyTable = renderToStaticMarkup(<DataTable headers={['Identificador']} empty>{null}</DataTable>);
    expect(emptyTable).toContain('<th scope="col">Identificador</th>');
    expect(emptyTable).toContain('Nenhum registro encontrado');
  });

  test('renders pagination boundaries and an accessible modal contract', () => {
    const firstPage = renderToStaticMarkup(<Pagination offset={0} limit={20} total={0} onChange={() => {}} />);
    expect(firstPage).toContain('0–0 de 0');
    expect(firstPage.match(/disabled=""/g)?.length).toBe(2);
    const middlePage = renderToStaticMarkup(<Pagination offset={20} limit={20} total={45} onChange={() => {}} />);
    expect(middlePage).toContain('21–40 de 45');
    expect(middlePage).not.toContain('disabled=""');

    const modal = renderToStaticMarkup(<Modal title="Confirmar ação" onClose={() => {}}><p>Confirmação explícita</p></Modal>);
    expect(modal).toContain('role="dialog"');
    expect(modal).toContain('aria-modal="true"');
    expect(modal).toContain('aria-labelledby="modal-title"');
    expect(modal).toContain('aria-label="Fechar"');
  });

  test('keeps payment instructions distinct from settlement and ledger read-only', () => {
    const payments = renderToStaticMarkup(<PaymentsPage />);
    expect(payments).toContain('Instruções de pagamento');
    expect(payments).toContain('estado atual da obrigação');
    expect(payments).not.toContain('Liquidado');

    const ledger = renderToStaticMarkup(<LedgerPage />);
    expect(ledger).toContain('somente leitura');
    expect(ledger).toContain('imutáveis');
    expect(ledger).not.toContain('Editar');
    expect(ledger).not.toContain('Excluir');
  });
});
