import { useEffect, useRef, useState, type FormEvent } from 'react';
import { dividendApi } from '../api/dividend-api.js';
import { formatDate, formatMoney } from '../format.js';
import { isPositiveBrlAmount, parseStringParameters } from '../validation.js';
import type { Beneficiary, Dividend, LedgerEntry, Obligation, Page, Payment } from '../types.js';
import { DataTable, DateCell, EmptyState, ErrorState, LoadingState, Modal, PageHeading, Pagination, StatusBadge } from '../components/ui.js';
import { runSingleFlight } from '../single-flight.js';
import { useAuthSession } from '../auth/session.js';

const PAGE_SIZE = 20;
const knownObligationStatuses = ['', 'DUE', 'PAYMENT_REQUESTED', 'PAYMENT_UNKNOWN', 'PAID'];
function failureMessage(error: unknown) { return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.'; }

export function BeneficiariesPage() {
  const { can } = useAuthSession();
  const actionLock = useRef(false);
  const [page, setPage] = useState<Page<Beneficiary>>(); const [offset, setOffset] = useState(0);
  const [term, setTerm] = useState(''); const [query, setQuery] = useState(''); const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false); const [selected, setSelected] = useState<Beneficiary>(); const [notice, setNotice] = useState('');
  useEffect(() => { let active = true; setPage(undefined); setLoading(true); setError('');
    dividendApi.beneficiaries(query, PAGE_SIZE, offset).then((result) => { if (active) setPage(result); })
      .catch((reason: unknown) => { if (active) setError(failureMessage(reason)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, offset, refresh]);
  async function create() { await runSingleFlight(actionLock, async () => { setSaving(true); setError(''); try { const created = await dividendApi.createBeneficiary(); setCreateOpen(false); setNotice(`Registro criado. Identificador: ${created.id}`); setOffset(0); setRefresh((x) => x + 1); } catch (reason) { setError(failureMessage(reason)); } finally { setSaving(false); } }); }
  return <>
    <PageHeading eyebrow="Cadastros" title="Beneficiários" description="Registros persistidos. O modelo atual armazena identificador e data de criação, sem dados cadastrais pessoais." action={can('beneficiaries:create') ? <button className="button button-primary" onClick={() => { setNotice(''); setCreateOpen(true); }}><span aria-hidden="true">＋</span> Novo registro</button> : undefined} />
    {notice && <div className="success-banner" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Fechar aviso">×</button></div>}
    <section className="panel data-panel"><form className="toolbar" onSubmit={(event) => { event.preventDefault(); setOffset(0); setQuery(term.trim()); }}><label className="search-field"><span aria-hidden="true">⌕</span><input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Pesquisar pelo identificador" aria-label="Pesquisar beneficiários" /><button type="submit">Buscar</button></label><span className="record-count">{page ? `${page.total} registros` : '—'}</span></form>
      {error && !page ? <ErrorState message={error} retry={() => setRefresh((x) => x + 1)} /> : loading && !page ? <LoadingState /> : page ? <>
        {error && <div className="inline-alert" role="status">Falha ao atualizar: {error}<button onClick={() => setRefresh((x) => x + 1)}>Tentar novamente</button></div>}
        <DataTable headers={['Identificador', 'Criado em', '']} empty={page.items.length === 0}>{page.items.map((person) => <tr key={person.id}><td><code>{person.id}</code></td><td><DateCell value={person.createdAt} /></td><td className="table-actions"><button className="text-button" onClick={() => setSelected(person)}>Detalhes <span aria-hidden="true">↗</span></button></td></tr>)}</DataTable>
        <Pagination offset={offset} limit={page.limit} total={page.total} onChange={setOffset} />
      </> : null}
    </section>
    {createOpen && <Modal title="Criar registro de beneficiário" onClose={() => !saving && setCreateOpen(false)} footer={<><button className="button button-secondary" disabled={saving} onClick={() => setCreateOpen(false)}>Cancelar</button><button className="button button-primary" disabled={saving} onClick={create}>{saving ? 'Salvando…' : 'Criar registro'}</button></>}><div className="notice-card"><span aria-hidden="true">ⓘ</span><p>O endpoint disponível cria apenas um identificador interno. Nome, documento e dados de contato ainda não fazem parte do contrato da API.</p></div>{error && <p className="form-error" role="alert">{error}</p>}</Modal>}
    {selected && <Modal title="Detalhe do beneficiário" onClose={() => setSelected(undefined)}><dl className="detail-list"><dt>Identificador interno</dt><dd><code>{selected.id}</code></dd><dt>Criado em</dt><dd>{formatDate(selected.createdAt)}</dd></dl><p className="muted-copy">Não há outros dados cadastrais disponíveis no backend atual.</p></Modal>}
  </>;
}

export function DividendsPage() {
  const { can } = useAuthSession();
  const actionLock = useRef(false);
  const [page, setPage] = useState<Page<Dividend>>(); const [offset, setOffset] = useState(0); const [refresh, setRefresh] = useState(0);
  const [term, setTerm] = useState(''); const [query, setQuery] = useState(''); const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Dividend>(); const [declareTarget, setDeclareTarget] = useState<Dividend>(); const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(''); const [kind, setKind] = useState<'FIXED_AMOUNT' | 'PARAMETERS'>('FIXED_AMOUNT');
  const [amount, setAmount] = useState(''); const [parameters, setParameters] = useState('{\n  "referencia": ""\n}');
  const [detailObligations, setDetailObligations] = useState<Page<Obligation>>(); const [detailOffset, setDetailOffset] = useState(0); const [detailRefresh, setDetailRefresh] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false); const [detailError, setDetailError] = useState('');
  useEffect(() => { let active = true; setPage(undefined); setLoading(true); setError('');
    dividendApi.dividends(query, statusFilter, PAGE_SIZE, offset).then((result) => { if (active) setPage(result); })
      .catch((reason: unknown) => { if (active) setError(failureMessage(reason)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, statusFilter, offset, refresh]);
  useEffect(() => { if (!selected) return; let active = true; setDetailLoading(true); setDetailError(''); setDetailObligations(undefined);
    dividendApi.obligations({ dividendId: selected.id }, PAGE_SIZE, detailOffset).then((result) => { if (active) setDetailObligations(result); })
      .catch((reason: unknown) => { if (active) setDetailError(failureMessage(reason)); }).finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selected, detailOffset, detailRefresh]);
  async function create(event: FormEvent) {
    event.preventDefault(); setError('');
    let terms: unknown;
    if (kind === 'FIXED_AMOUNT') { if (!isPositiveBrlAmount(amount)) { setError('Informe um valor BRL positivo com até duas casas decimais.'); return; } terms = { kind, amount }; }
    else { const parsed = parseStringParameters(parameters); if (!parsed) { setError('Os parâmetros devem ser um objeto JSON cujos valores sejam strings.'); return; } terms = { kind, parameters: parsed }; }
    await runSingleFlight(actionLock, async () => { setSaving(true); try { const created = await dividendApi.createDividend({ currency: 'BRL', terms }); setCreateOpen(false); setAmount(''); setNotice(`Dividendo ${created.id} criado como rascunho.`); setOffset(0); setRefresh((x) => x + 1); } catch (reason) { setError(failureMessage(reason)); } finally { setSaving(false); } });
  }
  async function declare() { if (!declareTarget) return; await runSingleFlight(actionLock, async () => { setSaving(true); setError(''); try { const result = await dividendApi.declareDividend(declareTarget.id); setNotice(`Dividendo ${result.id} declarado.`); setDeclareTarget(undefined); setRefresh((x) => x + 1); } catch (reason) { setError(failureMessage(reason)); } finally { setSaving(false); } }); }
  return <>
    <PageHeading eyebrow="Distribuições" title="Dividendos" description="Declarações registradas e seu estado de negócio." action={can('dividends:create') ? <button className="button button-primary" onClick={() => { setError(''); setCreateOpen(true); }}><span aria-hidden="true">＋</span> Novo dividendo</button> : undefined} />
    {notice && <div className="success-banner" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Fechar aviso">×</button></div>}
    <section className="panel data-panel"><div className="toolbar"><form className="search-field" onSubmit={(event) => { event.preventDefault(); setOffset(0); setQuery(term.trim()); }}><span aria-hidden="true">⌕</span><input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Buscar por identificador" aria-label="Buscar dividendos" /><button>Buscar</button></form><label className="select-field"><span>Status</span><select value={statusFilter} onChange={(event) => { setOffset(0); setStatusFilter(event.target.value); }}><option value="">Todos</option><option value="DRAFT">Rascunho</option><option value="DECLARED">Declarado</option></select></label></div>
      {error && !page ? <ErrorState message={error} retry={() => setRefresh((x) => x + 1)} /> : loading && !page ? <LoadingState /> : page ? <>
      {error && <div className="inline-alert" role="status">Falha ao atualizar: {error}<button onClick={() => setRefresh((x) => x + 1)}>Tentar novamente</button></div>}
      <DataTable headers={['Identificador', 'Termos declarados', 'Status', 'Criado em', 'Ações']} empty={page.items.length === 0}>{page.items.map((dividend) => <tr key={dividend.id}><td><code>{dividend.id}</code></td><td>{dividend.terms.kind === 'FIXED_AMOUNT' ? formatMoney(dividend.terms.amount) : <span className="muted-copy">Parâmetros informados</span>}</td><td><StatusBadge status={dividend.status} /></td><td><DateCell value={dividend.createdAt} /></td><td className="table-actions"><button className="text-button" onClick={() => { setDetailOffset(0); setSelected(dividend); }}>Detalhes</button>{can('dividends:declare') && dividend.status === 'DRAFT' && <button className="text-button" onClick={() => setDeclareTarget(dividend)}>Declarar</button>}</td></tr>)}</DataTable>
        <Pagination offset={offset} limit={page.limit} total={page.total} onChange={setOffset} />
      </> : null}
    </section>
    {createOpen && <Modal title="Novo dividendo" onClose={() => !saving && setCreateOpen(false)}><form className="form-stack" onSubmit={create}><label>Tipo de declaração<select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="FIXED_AMOUNT">Valor fixo informado</option><option value="PARAMETERS">Parâmetros informados</option></select></label><div className="readonly-field"><span>Moeda</span><strong>BRL · Real brasileiro</strong><small>A moeda inicial definida para esta etapa.</small></div>{kind === 'FIXED_AMOUNT' ? <label>Valor declarado<input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" aria-describedby="amount-help" /><small id="amount-help">Use ponto como separador decimal. O valor é enviado como texto.</small></label> : <label>Parâmetros JSON<textarea rows={7} value={parameters} onChange={(event) => setParameters(event.target.value)} spellCheck={false} /><small>Todos os valores do objeto precisam ser strings; o sistema não calcula montantes.</small></label>}{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="button button-secondary" disabled={saving} onClick={() => setCreateOpen(false)}>Cancelar</button><button className="button button-primary" disabled={saving}>{saving ? 'Salvando…' : 'Criar rascunho'}</button></div></form></Modal>}
    {declareTarget && <Modal title="Confirmar declaração" onClose={() => !saving && setDeclareTarget(undefined)} footer={<><button className="button button-secondary" disabled={saving} onClick={() => setDeclareTarget(undefined)}>Voltar</button><button className="button button-primary" disabled={saving} onClick={declare}>{saving ? 'Declarando…' : 'Confirmar declaração'}</button></>}><div className="confirm-card"><span className="confirm-symbol">!</span><div><strong>Declarar este dividendo?</strong><p>Esta transição registra a declaração e permite a criação de obrigações. Confira o identificador antes de confirmar.</p><code>{declareTarget.id}</code></div></div>{error && <p className="form-error" role="alert">{error}</p>}</Modal>}
    {selected && <Modal title="Detalhes do dividendo" onClose={() => setSelected(undefined)}><dl className="detail-list"><dt>Identificador</dt><dd><code>{selected.id}</code></dd><dt>Status</dt><dd><StatusBadge status={selected.status} /></dd><dt>Termos</dt><dd>{selected.terms.kind === 'FIXED_AMOUNT' ? formatMoney(selected.terms.amount) : <pre>{JSON.stringify(selected.terms.parameters, null, 2)}</pre>}</dd><dt>Criado em</dt><dd>{formatDate(selected.createdAt)}</dd><dt>Declarado em</dt><dd>{formatDate(selected.declaredAt)}</dd></dl><div className="detail-section"><h3>Obrigações relacionadas</h3>{detailLoading ? <LoadingState label="Carregando obrigações…" /> : detailError ? <ErrorState message={detailError} retry={() => setDetailRefresh((value) => value + 1)} /> : detailObligations ? detailObligations.items.length > 0 ? <>{detailObligations.items.map((item) => <div className="compact-row" key={item.id}><code>{item.id}</code><StatusBadge status={item.status} /><strong>{formatMoney(item.amount)}</strong></div>)}<Pagination offset={detailOffset} limit={detailObligations.limit} total={detailObligations.total} onChange={setDetailOffset} /></> : <EmptyState title="Nenhuma obrigação" description="Nenhuma obrigação foi registrada para este dividendo." /> : null}</div></Modal>}
  </>;
}

export function ObligationsPage() {
  const { can } = useAuthSession();
  const actionLock = useRef(false);
  const [page, setPage] = useState<Page<Obligation>>(); const [offset, setOffset] = useState(0); const [refresh, setRefresh] = useState(0);
  const [status, setStatus] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false); const [dividendId, setDividendId] = useState(''); const [beneficiaryId, setBeneficiaryId] = useState(''); const [amount, setAmount] = useState(''); const [saving, setSaving] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<{ obligation: Obligation; idempotencyKey: string }>(); const [notice, setNotice] = useState(''); const [selected, setSelected] = useState<Obligation>();
  useEffect(() => { let active = true; setPage(undefined); setLoading(true); setError('');
    dividendApi.obligations({ status: status || undefined }, PAGE_SIZE, offset).then((result) => { if (active) setPage(result); })
      .catch((reason: unknown) => { if (active) setError(failureMessage(reason)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [status, offset, refresh]);
  async function create(event: FormEvent) { event.preventDefault(); if (!isPositiveBrlAmount(amount)) { setError('Informe um valor BRL positivo com até duas casas decimais.'); return; } await runSingleFlight(actionLock, async () => { setSaving(true); setError('');
    try { const created = await dividendApi.createObligation(dividendId.trim(), { beneficiaryId: beneficiaryId.trim(), amount }); setCreateOpen(false); setNotice(`Obrigação ${created.id} criada. O valor foi informado e reconhecido no ledger.`); setOffset(0); setRefresh((x) => x + 1); }
    catch (reason) { setError(failureMessage(reason)); } finally { setSaving(false); }
  });
  }
  async function requestPayment() { if (!paymentTarget) return; await runSingleFlight(actionLock, async () => { setSaving(true); setError(''); try { const payment = await dividendApi.requestPayment(paymentTarget.obligation.id, paymentTarget.idempotencyKey); const result = payment.replayed ? `A instrução existente ${payment.id} foi recuperada pela chave de idempotência.` : `Instrução lógica ${payment.id} registrada.`; setNotice(`${result} Nenhuma transferência foi executada ou liquidada.`); setPaymentTarget(undefined); setRefresh((x) => x + 1); } catch (reason) { setError(failureMessage(reason)); } finally { setSaving(false); } }); }
  function closePaymentRequest() { if (saving) return; setPaymentTarget(undefined); setRefresh((x) => x + 1); }
  return <>
    <PageHeading eyebrow="Valores devidos" title="Obrigações" description="Acompanhe valores informados, seus beneficiários e o estado de processamento." action={can('obligations:create') ? <button className="button button-primary" onClick={() => { setError(''); setCreateOpen(true); }}><span aria-hidden="true">＋</span> Nova obrigação</button> : undefined} />
    {notice && <div className="success-banner" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Fechar aviso">×</button></div>}
    <section className="panel data-panel"><div className="toolbar"><label className="select-field"><span>Filtrar por estado</span><select value={status} onChange={(event) => { setStatus(event.target.value); setOffset(0); }}>{knownObligationStatuses.map((item) => <option key={item} value={item}>{item ? item.replaceAll('_', ' ') : 'Todos os estados'}</option>)}</select></label><span className="record-count">{page ? `${page.total} registros` : '—'}</span></div>
      {error && !page ? <ErrorState message={error} retry={() => setRefresh((x) => x + 1)} /> : loading && !page ? <LoadingState /> : page ? <>
        {error && !paymentTarget && <div className="inline-alert" role="status">Falha ao atualizar: {error}<button onClick={() => setRefresh((x) => x + 1)}>Tentar novamente</button></div>}
        <DataTable headers={['Obrigação', 'Beneficiário', 'Valor', 'Estado', 'Criado em', 'Ações']} empty={page.items.length === 0}>{page.items.map((item) => <tr key={item.id}><td><code>{item.id}</code></td><td><code>{item.beneficiaryId}</code></td><td className="amount-cell">{formatMoney(item.amount)}</td><td><StatusBadge status={item.status} /></td><td><DateCell value={item.createdAt} /></td><td className="table-actions"><button className="text-button" onClick={() => setSelected(item)}>Detalhes</button>{can('payments:request') && item.status === 'DUE' && <button className="text-button" onClick={() => setPaymentTarget({ obligation: item, idempotencyKey: crypto.randomUUID() })}>Solicitar instrução</button>}</td></tr>)}</DataTable>
        <Pagination offset={offset} limit={page.limit} total={page.total} onChange={setOffset} />
      </> : null}
    </section>
    {createOpen && <Modal title="Criar obrigação" onClose={() => !saving && setCreateOpen(false)}><form className="form-stack" onSubmit={create}><label>Identificador do dividendo declarado<input required value={dividendId} onChange={(event) => setDividendId(event.target.value)} /></label><label>Identificador do beneficiário<input required value={beneficiaryId} onChange={(event) => setBeneficiaryId(event.target.value)} /></label><label>Valor devido em BRL<input required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" /><small>Valor fornecido explicitamente; o sistema não calcula automaticamente a distribuição.</small></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="button button-secondary" disabled={saving} onClick={() => setCreateOpen(false)}>Cancelar</button><button className="button button-primary" disabled={saving}>{saving ? 'Salvando…' : 'Criar obrigação'}</button></div></form></Modal>}
    {paymentTarget && <Modal title="Solicitar instrução lógica" onClose={closePaymentRequest} footer={<><button className="button button-secondary" disabled={saving} onClick={closePaymentRequest}>Cancelar</button><button className="button button-primary" disabled={saving} onClick={requestPayment}>{saving ? 'Enviando solicitação…' : 'Confirmar solicitação'}</button></>}><div className="confirm-card"><span className="confirm-symbol">↗</span><div><strong>Registrar uma instrução de pagamento?</strong><p>Esta ação registra uma instrução lógica idempotente. Não executa transferência e não confirma liquidação.</p><code>{paymentTarget.obligation.id}</code><p className="subtle-copy">A chave de idempotência será reutilizada se a solicitação precisar ser repetida.</p></div></div>{error && <p className="form-error" role="alert">{error}</p>}</Modal>}
    {selected && <Modal title="Detalhes da obrigação" onClose={() => setSelected(undefined)}><dl className="detail-list"><dt>Identificador</dt><dd><code>{selected.id}</code></dd><dt>Dividendo</dt><dd><code>{selected.dividendId}</code></dd><dt>Beneficiário</dt><dd><code>{selected.beneficiaryId}</code></dd><dt>Valor informado</dt><dd>{formatMoney(selected.amount)}</dd><dt>Estado</dt><dd><StatusBadge status={selected.status} /></dd><dt>Instrução lógica</dt><dd>{selected.payment ? <code>{selected.payment.id}</code> : 'Ainda não registrada'}</dd><dt>Reconhecimento</dt><dd>Obrigação reconhecida no ledger; não significa pagamento.</dd></dl></Modal>}
  </>;
}

export function PaymentsPage() {
  const [page, setPage] = useState<Page<Payment>>(); const [offset, setOffset] = useState(0); const [refresh, setRefresh] = useState(0); const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [selected, setSelected] = useState<Payment>();
  useEffect(() => { let active = true; setPage(undefined); setLoading(true); setError('');
    dividendApi.payments(status, PAGE_SIZE, offset).then((result) => { if (active) setPage(result); }).catch((reason: unknown) => { if (active) setError(failureMessage(reason)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [status, offset, refresh]);
  return <><PageHeading eyebrow="Processamento" title="Instruções de pagamento" description="Instruções lógicas persistidas e o estado atual da obrigação relacionada." />
    <section className="panel data-panel"><div className="toolbar"><label className="select-field"><span>Estado da obrigação</span><select value={status} onChange={(event) => { setStatus(event.target.value); setOffset(0); }}>{knownObligationStatuses.map((item) => <option key={item} value={item}>{item ? item.replaceAll('_', ' ') : 'Todos'}</option>)}</select></label><span className="record-count">{page ? `${page.total} instruções` : '—'}</span></div>
      {error && !page ? <ErrorState message={error} retry={() => setRefresh((x) => x + 1)} /> : loading && !page ? <LoadingState /> : page ? <>{error && <div className="inline-alert" role="status">Falha ao atualizar: {error}<button onClick={() => setRefresh((x) => x + 1)}>Tentar novamente</button></div>}<DataTable headers={['Instrução', 'Obrigação', 'Beneficiário', 'Valor', 'Estado da obrigação', 'Solicitada em', '']} empty={page.items.length === 0}>{page.items.map((item) => <tr key={item.id}><td><code>{item.id}</code></td><td><code>{item.obligationId}</code></td><td><code>{item.beneficiaryId}</code></td><td className="amount-cell">{formatMoney(item.amount)}</td><td><StatusBadge status={item.obligationStatus ?? 'UNKNOWN'} /></td><td><DateCell value={item.requestedAt} /></td><td className="table-actions"><button className="text-button" onClick={() => setSelected(item)}>Detalhes</button></td></tr>)}</DataTable><Pagination offset={offset} limit={page.limit} total={page.total} onChange={setOffset} /></> : null}
    </section>
    {selected && <Modal title="Detalhes da instrução" onClose={() => setSelected(undefined)}><div className="notice-card"><span aria-hidden="true">ⓘ</span><p>Este registro confirma apenas a criação da instrução lógica. A liquidação depende de confirmação autoritativa e não é executada por este painel.</p></div><dl className="detail-list"><dt>Identificador</dt><dd><code>{selected.id}</code></dd><dt>Obrigação</dt><dd><code>{selected.obligationId}</code></dd><dt>Beneficiário</dt><dd><code>{selected.beneficiaryId}</code></dd><dt>Valor da instrução</dt><dd>{formatMoney(selected.amount)}</dd><dt>Estado da obrigação</dt><dd><StatusBadge status={selected.obligationStatus ?? 'UNKNOWN'} /></dd><dt>Criada em</dt><dd>{formatDate(selected.requestedAt)}</dd><dt>Referência idempotente</dt><dd><code>{selected.idempotencyKey}</code></dd></dl></Modal>}
  </>;
}

export function LedgerPage() {
  const [page, setPage] = useState<Page<LedgerEntry>>(); const [offset, setOffset] = useState(0); const [refresh, setRefresh] = useState(0); const [kind, setKind] = useState(''); const [obligationId, setObligationId] = useState(''); const [filterId, setFilterId] = useState('');
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { let active = true; setPage(undefined); setLoading(true); setError(''); dividendApi.ledger({ kind: kind || undefined, obligationId: filterId || undefined }, PAGE_SIZE, offset).then((result) => { if (active) setPage(result); }).catch((reason: unknown) => { if (active) setError(failureMessage(reason)); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [kind, filterId, offset, refresh]);
  return <><PageHeading eyebrow="Histórico financeiro" title="Ledger financeiro" description="Registro operacional somente leitura. Esta tela não exibe a trilha de auditoria administrativa. Lançamentos financeiros são imutáveis e não podem ser editados ou removidos." />
    <section className="panel data-panel"><div className="toolbar"><label className="select-field"><span>Tipo de evento</span><select value={kind} onChange={(event) => { setKind(event.target.value); setOffset(0); }}><option value="">Todos</option><option value="OBLIGATION_RECOGNIZED">Obrigação reconhecida</option><option value="PAYMENT_SETTLED">Pagamento liquidado</option><option value="PAYMENT_REVERSED">Pagamento estornado</option></select></label><form className="search-field compact-search" onSubmit={(event) => { event.preventDefault(); setOffset(0); setFilterId(obligationId.trim()); }}><span aria-hidden="true">⌕</span><input value={obligationId} onChange={(event) => setObligationId(event.target.value)} placeholder="Filtrar por obrigação" aria-label="Filtrar ledger por obrigação" /><button>Filtrar</button></form><span className="record-count">{page ? `${page.total} lançamentos` : '—'}</span></div>
      <div className="ledger-explainer"><span aria-hidden="true">ⓘ</span><p><strong>Reconhecimento não é liquidação.</strong> O tipo “Obrigação reconhecida” registra o valor informado como devido. Somente uma confirmação externa autoritativa poderá originar um fato futuro de liquidação.</p></div>
      {error && !page ? <ErrorState message={error} retry={() => setRefresh((x) => x + 1)} /> : loading && !page ? <LoadingState /> : page ? <>{error && <div className="inline-alert" role="status">Falha ao atualizar: {error}<button onClick={() => setRefresh((x) => x + 1)}>Tentar novamente</button></div>}<DataTable headers={['Lançamento', 'Evento', 'Obrigação', 'Valor', 'Origem', 'Data', 'Imutável']} empty={page.items.length === 0}>{page.items.map((entry) => <tr key={entry.id}><td><code>{entry.id}</code></td><td><StatusBadge status={entry.kind} /></td><td><code>{entry.obligationId}</code></td><td className="amount-cell">{formatMoney(entry.amount)}</td><td>{entry.source.type} · <code>{entry.source.id}</code></td><td><DateCell value={entry.createdAt} /></td><td><span className="lock-label" title="Somente leitura">▣ Somente leitura</span></td></tr>)}</DataTable><Pagination offset={offset} limit={page.limit} total={page.total} onChange={setOffset} /></> : null}
    </section>
  </>;
}
