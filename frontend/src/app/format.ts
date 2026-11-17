export function formatMoney(value: { amount: string; currency: string }): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.amount);
  if (!match) return `${value.currency} ${value.amount}`;
  const sign = match[1] ?? '';
  const integer = (match[2] ?? '0').replace(/^0+(?=\d)/, '');
  const fraction = (match[3] ?? '').padEnd(2, '0');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const symbol = value.currency === 'BRL' ? 'R$' : value.currency;
  return `${sign}${symbol}\u00a0${grouped},${fraction}`;
}

export function formatDate(value: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data desconhecida';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

const labels: Record<string, string> = {
  DRAFT: 'Rascunho', DECLARED: 'Declarado', DUE: 'A pagar', PAYMENT_REQUESTED: 'Instrução solicitada',
  PAYMENT_UNKNOWN: 'Resultado de pagamento desconhecido', PAID: 'Liquidado', OBLIGATION_RECOGNIZED: 'Obrigação reconhecida',
  PAYMENT_SETTLED: 'Pagamento liquidado', PAYMENT_REVERSED: 'Pagamento estornado',
};

export function statusLabel(status: string): string {
  return Object.hasOwn(labels, status) ? labels[status]! : `Estado desconhecido (${status || 'sem valor'})`;
}

export function isKnownStatus(status: string): boolean {
  return Object.hasOwn(labels, status);
}
