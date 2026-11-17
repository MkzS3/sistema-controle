import { apiClient, type QueryValue } from './api-client.js';
import type { Beneficiary, DashboardSummary, Dividend, LedgerEntry, Obligation, Page, Payment, PaymentReference } from '../types.js';

const pageQuery = (limit: number, offset: number, extra: Record<string, QueryValue> = {}) => ({ limit, offset, ...extra });

export const dividendApi = {
  summary: () => apiClient.get<DashboardSummary>('/dashboard/summary'),
  beneficiaries: (query: string, limit = 20, offset = 0) => apiClient.get<Page<Beneficiary>>('/beneficiaries', pageQuery(limit, offset, { query })),
  createBeneficiary: () => apiClient.post<Beneficiary>('/beneficiaries'),
  dividends: (query: string, status: string, limit = 20, offset = 0) => apiClient.get<Page<Dividend>>('/dividends', pageQuery(limit, offset, { query, status })),
  dividend: (id: string) => apiClient.get<Dividend>(`/dividends/${encodeURIComponent(id)}`),
  createDividend: (body: unknown) => apiClient.post<Dividend>('/dividends', body),
  declareDividend: (id: string) => apiClient.post<Dividend>(`/dividends/${encodeURIComponent(id)}/declare`),
  obligations: (filters: { status?: string; dividendId?: string; beneficiaryId?: string }, limit = 20, offset = 0) =>
    apiClient.get<Page<Obligation>>('/obligations', pageQuery(limit, offset, filters)),
  createObligation: (dividendId: string, body: unknown) => apiClient.post<Obligation>(`/dividends/${encodeURIComponent(dividendId)}/obligations`, body),
  payments: (obligationStatus: string, limit = 20, offset = 0) => apiClient.get<Page<Payment>>('/payments', pageQuery(limit, offset, { obligationStatus })),
  requestPayment: (obligationId: string, idempotencyKey: string) => apiClient.post<PaymentReference & { replayed: boolean }>(
    `/obligations/${encodeURIComponent(obligationId)}/payment-instructions`, undefined,
    { 'Idempotency-Scope': 'local-admin-ui', 'Idempotency-Key': idempotencyKey },
  ),
  ledger: (filters: { kind?: string; obligationId?: string }, limit = 20, offset = 0) => apiClient.get<Page<LedgerEntry>>('/ledger', pageQuery(limit, offset, filters)),
  payment: (id: string) => apiClient.get<Payment>(`/payments/${encodeURIComponent(id)}`),
};
