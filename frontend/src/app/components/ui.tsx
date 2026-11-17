import { useEffect, useRef, type ReactNode } from 'react';
import { formatDate, statusLabel, isKnownStatus } from '../format.js';

export function StatusBadge({ status }: { status: string }) {
  const known = isKnownStatus(status);
  const tone = status === 'PAID' || status === 'DECLARED' ? 'success'
    : status === 'PAYMENT_UNKNOWN' || !known ? 'warning'
      : status === 'DRAFT' ? 'neutral' : 'info';
  return <span className={`status-badge status-${tone}`}>{statusLabel(status)}</span>;
}

export function MetricCard({ label, value, hint, icon }: { label: string; value: number | string; hint: string; icon: string }) {
  return <article className="metric-card"><div className="metric-heading"><span>{label}</span><span className="metric-icon" aria-hidden="true">{icon}</span></div><strong>{value}</strong><small>{hint}</small></article>;
}

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{action && <div className="heading-action">{action}</div>}</div>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="empty-state"><span className="empty-mark" aria-hidden="true">⌕</span><h3>{title}</h3><p>{description}</p></div>;
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="error-state" role="alert"><div><strong>Não foi possível carregar os dados</strong><p>{message}</p></div>{retry && <button className="button button-secondary" onClick={retry}>Tentar novamente</button>}</div>;
}

export function LoadingState({ label = 'Carregando dados reais da API…' }: { label?: string }) {
  return <div className="loading-state" role="status"><span className="spinner" aria-hidden="true" />{label}</div>;
}

export function Pagination({ offset, limit, total, onChange }: { offset: number; limit: number; total: number; onChange: (offset: number) => void }) {
  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + limit, total);
  return <div className="pagination"><span>{start}–{end} de {total}</span><div><button className="icon-button" aria-label="Página anterior" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>‹</button><button className="icon-button" aria-label="Próxima página" disabled={offset + limit >= total} onClick={() => onChange(offset + limit)}>›</button></div></div>;
}

export function DataTable({ headers, children, empty }: { headers: string[]; children: ReactNode; empty: boolean }) {
  return <div className="table-wrap"><table><thead><tr>{headers.map((header) => <th key={header} scope="col">{header}</th>)}</tr></thead>{empty ? null : <tbody>{children}</tbody>}</table>{empty && <EmptyState title="Nenhum registro encontrado" description="Os dados aparecerão aqui quando existirem na API." />}</div>;
}

export function Modal({ title, children, onClose, footer }: { title: string; children: ReactNode; onClose: () => void; footer?: ReactNode }) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>('button:not([disabled]), input, select, textarea, [href]')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); closeRef.current(); return; }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]')];
      if (focusable.length === 0) { event.preventDefault(); return; }
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); if (previouslyFocused?.isConnected) previouslyFocused.focus(); };
  }, []);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1}><header><div><p className="eyebrow">Controle de dividendos</p><h2 id="modal-title">{title}</h2></div><button className="icon-button" aria-label="Fechar" onClick={onClose}>×</button></header><div className="modal-body">{children}</div>{footer && <footer>{footer}</footer>}</section></div>;
}

export function DateCell({ value }: { value?: string }) { return <time dateTime={value}>{formatDate(value)}</time>; }
