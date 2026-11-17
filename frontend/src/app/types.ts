export type Page<T> = { items: T[]; total: number; limit: number; offset: number };
export type Money = { amount: string; currency: string };

export type Beneficiary = { id: string; createdAt: string };
export type Dividend = {
  id: string;
  currency: string;
  terms: { kind: 'FIXED_AMOUNT'; amount: Money } | { kind: 'PARAMETERS'; parameters: Record<string, string> };
  status: string;
  createdAt: string;
  recordDate?: string;
  paymentDate?: string;
  declaredAt?: string;
};
export type PaymentReference = {
  id: string; obligationId: string; beneficiaryId: string; idempotencyKey: string;
  amount: Money; requestedAt: string;
};
export type Obligation = {
  id: string; dividendId: string; beneficiaryId: string; amount: Money; status: string;
  createdAt: string; unknownAt?: string; paidAt?: string; payment?: PaymentReference;
};
export type Payment = PaymentReference & { obligationStatus?: string };
export type LedgerEntry = {
  id: string; obligationId: string; kind: string; source: { type: string; id: string };
  amount: Money; createdAt: string;
};
export type DashboardSummary = {
  dividends: number; beneficiaries: number; obligations: number; payments: number;
  obligationsByStatus: Record<string, number>;
  outbox: { pending: number; processing: number; published: number; deadLettered: number; byStatus: Record<string, number> };
  ledgerReconciliationIssues: number;
};
