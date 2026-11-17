import { useEffect, useState } from 'react';
import { dividendApi } from '../api/dividend-api.js';
import type { DashboardSummary } from '../types.js';
import { MetricCard, PageHeading, LoadingState, ErrorState, StatusBadge } from '../components/ui.js';

const knownObligationStates = new Set(['DUE', 'PAYMENT_REQUESTED', 'PAYMENT_UNKNOWN', 'PAID']);
const knownOutboxStates = new Set(['PENDING', 'PROCESSING', 'PUBLISHED', 'DEAD_LETTERED']);
const statusOrder = ['DUE', 'PAYMENT_REQUESTED', 'PAYMENT_UNKNOWN', 'PAID'];

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    dividendApi.summary().then((data) => { if (active) setSummary(data); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Falha inesperada.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);

  const retry = () => setRefresh((value) => value + 1);
  const statuses = summary ? [...statusOrder, ...Object.keys(summary.obligationsByStatus).filter((key) => !knownObligationStates.has(key))] : [];
  const unknownStates = summary ? Object.keys(summary.obligationsByStatus).filter((key) => !knownObligationStates.has(key)) : [];
  const unknownOutboxStates = summary ? Object.keys(summary.outbox.byStatus).filter((key) => !knownOutboxStates.has(key)) : [];

  return <>
    <PageHeading eyebrow="Painel administrativo" title="Visão geral" description="Indicadores atuais consultados diretamente no PostgreSQL pela API." action={<button className="button button-secondary" onClick={retry}><span aria-hidden="true">↻</span> Atualizar</button>} />
    {loading && !summary ? <LoadingState /> : error && !summary ? <ErrorState message={error} retry={retry} /> : summary ? <>
      {error && <div className="inline-alert" role="status">A atualização falhou. Exibindo a última resposta recebida da API. <button onClick={retry}>Atualizar</button></div>}
      <section className="metric-grid" aria-label="Totais do sistema">
        <MetricCard label="Dividendos" value={summary.dividends} hint="Registros persistidos" icon="◈" />
        <MetricCard label="Beneficiários" value={summary.beneficiaries} hint="Cadastros persistidos" icon="♙" />
        <MetricCard label="Obrigações" value={summary.obligations} hint="Valores reconhecidos" icon="▤" />
        <MetricCard label="Instruções" value={summary.payments} hint="Instruções lógicas registradas" icon="↗" />
      </section>
      <section className="dashboard-grid">
        <article className="panel status-panel">
          <div className="panel-heading"><div><p className="eyebrow">Processamento</p><h2>Obrigações por estado</h2></div><span className="subtle-tag">Dados reais</span></div>
          <div className="status-chart" role="list" aria-label="Quantidade de obrigações por estado">
            {statuses.map((status) => {
              const count = summary.obligationsByStatus[status] ?? 0;
              const width = summary.obligations ? `${Math.max(count > 0 ? 3 : 0, (count / summary.obligations) * 100)}%` : '0%';
              return <div className="status-chart-row" role="listitem" key={status}>
                <StatusBadge status={status} /><div className="bar-track"><span style={{ width }} /></div><strong>{count}</strong>
              </div>;
            })}
            {summary.obligations === 0 && <p className="chart-empty">Ainda não há obrigações persistidas.</p>}
          </div>
          <div className="panel-footnote">“Instrução solicitada” representa uma solicitação lógica; não confirma liquidação.</div>
        </article>
        <article className="panel outbox-panel">
          <div className="panel-heading"><div><p className="eyebrow">Mensageria</p><h2>Transactional Outbox</h2></div><span className="panel-icon">⌁</span></div>
          <div className="outbox-stats">
            <div><span>Pendentes</span><strong>{summary.outbox.pending}</strong></div>
            <div><span>Em processamento</span><strong>{summary.outbox.processing}</strong></div>
            <div><span>Publicados</span><strong>{summary.outbox.published}</strong></div>
            <div className={summary.outbox.deadLettered > 0 ? 'attention-value' : ''}><span>Fila de falhas</span><strong>{summary.outbox.deadLettered}</strong></div>
          </div>
          <p className="muted-copy">Contagens consultadas no banco. A publicação de eventos não representa pagamento.</p>
        </article>
        <article className={`panel audit-panel ${summary.ledgerReconciliationIssues > 0 ? 'panel-alert' : ''}`}>
          <div className="panel-heading"><div><p className="eyebrow">Integridade financeira</p><h2>Reconciliação operacional</h2></div><span className="audit-icon" aria-hidden="true">✓</span></div>
          <div className="audit-number">{summary.ledgerReconciliationIssues}</div>
          <p>{summary.ledgerReconciliationIssues === 1 ? 'divergência encontrada' : 'divergências encontradas'} entre obrigações reconhecidas e registros do ledger.</p>
          <small>Este indicador não calcula saldos nem representa posição contábil.</small>
        </article>
      </section>
      {summary.outbox.deadLettered > 0 && <div className="alert-banner" role="alert"><span>!</span><div><strong>Há registros Outbox em estado de falha</strong><p>Revise os eventos persistidos antes de considerar o processamento concluído.</p></div></div>}
      {summary.ledgerReconciliationIssues > 0 && <div className="alert-banner alert-danger" role="alert"><span>!</span><div><strong>Foram encontradas divergências de reconciliação</strong><p>Consulte o ledger e as obrigações relacionadas para investigação.</p></div></div>}
      {unknownStates.length > 0 && <div className="alert-banner" role="alert"><span>?</span><div><strong>O resumo contém estados desconhecidos</strong><p>{unknownStates.join(', ')}</p></div></div>}
      {unknownOutboxStates.length > 0 && <div className="alert-banner" role="alert"><span>?</span><div><strong>A Outbox contém estados desconhecidos</strong><p>{unknownOutboxStates.join(', ')}</p></div></div>}
    </> : null}
  </>;
}
