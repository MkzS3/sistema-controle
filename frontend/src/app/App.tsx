import { useState } from 'react';
import { DashboardPage } from './pages/DashboardPage.js';
import { BeneficiariesPage, DividendsPage, LedgerPage, ObligationsPage, PaymentsPage } from './pages/ResourcePages.js';
import { API_BASE_URL } from './api/api-client.js';
import { AuthStateScreen, useAuthSession } from './auth/session.js';
import type { Permission } from './auth/types.js';

const navigation = [
  { id: 'dashboard', label: 'Visão geral', icon: '▦', permission: 'dashboard:read' },
  { id: 'beneficiaries', label: 'Beneficiários', icon: '♙', permission: 'beneficiaries:read' },
  { id: 'dividends', label: 'Dividendos', icon: '◈', permission: 'dividends:read' },
  { id: 'obligations', label: 'Obrigações', icon: '▤', permission: 'obligations:read' },
  { id: 'payments', label: 'Instruções', icon: '↗', permission: 'payments:read' },
  { id: 'ledger', label: 'Ledger financeiro', icon: '⌁', permission: 'ledger:read' },
] as const;

type Section = typeof navigation[number]['id'];

export function App() {
  const { state, can, refresh } = useAuthSession();
  const [section, setSection] = useState<Section>('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  if (state.status !== 'local-development' && state.status !== 'authenticated') {
    return <AuthStateScreen state={state} onRetry={refresh} />;
  }
  const visibleNavigation = navigation.filter((item) => can(item.permission as Permission));
  if (visibleNavigation.length === 0) return <AuthStateScreen state={{ status: 'access-denied' }} onRetry={refresh} />;
  const active = visibleNavigation.find((item) => item.id === section) ?? visibleNavigation[0]!;
  const visibleSection = active.id;

  function navigate(next: Section) { setSection(next); setMobileNavOpen(false); }
  const page = visibleSection === 'dashboard' ? <DashboardPage />
    : visibleSection === 'beneficiaries' ? <BeneficiariesPage />
      : visibleSection === 'dividends' ? <DividendsPage />
        : visibleSection === 'obligations' ? <ObligationsPage />
          : visibleSection === 'payments' ? <PaymentsPage /> : <LedgerPage />;

  return <div className="app-shell">
    {mobileNavOpen && <button aria-label="Fechar navegação" className="sidebar-scrim" onClick={() => setMobileNavOpen(false)} />}
    <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`} aria-label="Navegação principal">
      <a className="brand" href="#inicio" onClick={(event) => { event.preventDefault(); navigate('dashboard'); }}>
        <span className="brand-mark" aria-hidden="true"><span /></span>
        <span className="brand-name">Dividend<span>Control</span></span>
      </a>
      <div className="workspace-label"><span className="workspace-avatar">DC</span><span><strong>Operações</strong><small>Ambiente local</small></span><span className="chevron">⌄</span></div>
      <p className="nav-caption">WORKSPACE</p>
      <nav className="nav-list">{visibleNavigation.map((item) => <button key={item.id} className={`nav-item ${visibleSection === item.id ? 'nav-active' : ''}`} aria-current={visibleSection === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><span className="nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span>{item.id === 'ledger' && <span className="nav-readonly">RO</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="local-notice"><span className="local-indicator" /><div><strong>Somente local</strong><span>{state.status === 'authenticated' ? `Perfil: ${state.roles.join(', ') || 'sem perfil'}` : 'API sem autenticação'}</span></div></div><div className="sidebar-footer"><span className="avatar">DC</span><div><strong>Dividend Control</strong><small>Painel administrativo</small></div><a href={`${API_BASE_URL}/health/live`} target="_blank" rel="noreferrer" aria-label="Abrir verificação de saúde da API">↗</a></div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><button className="mobile-menu icon-button" aria-label="Abrir navegação" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(true)}>☰</button><div className="breadcrumb"><span>Workspace</span><span aria-hidden="true">/</span><strong>{active.label}</strong></div><div className="topbar-actions"><span className="connection-pill">{state.status === 'authenticated' ? 'Sessão autenticada' : 'API local'}</span><span className="topbar-divider" /><span className="date-label">Painel administrativo</span></div></header>
      <div className="content-wrap"><div className="content-inner">{page}<footer className="content-footer"><span>Dividend Control</span><span>Sem dados de demonstração · API local configurada</span></footer></div></div>
    </main>
  </div>;
}
