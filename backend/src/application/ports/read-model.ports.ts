import type { DividendStatus } from '../../domain/dividends/dividend.js';
import type { DividendObligationStatus } from '../../domain/obligations/dividend-obligation.js';
import type { LedgerEntryKind } from '../../domain/ledger/ledger-entry.js';
import type { Beneficiary } from '../../domain/beneficiaries/beneficiary.js';
import type { Dividend } from '../../domain/dividends/dividend.js';
import type { DividendObligation } from '../../domain/obligations/dividend-obligation.js';
import type { Payment } from '../../domain/payments/payment.js';
import type { LedgerEntry } from '../../domain/ledger/ledger-entry.js';

export interface PageQuery {
  limit: number;
  offset: number;
}

export interface Page<T> extends PageQuery {
  items: T[];
  total: number;
}

export interface BeneficiaryListQuery extends PageQuery {
  query?: string;
}

export interface DividendListQuery extends PageQuery {
  query?: string;
  status?: DividendStatus;
}

export interface ObligationListQuery extends PageQuery {
  status?: DividendObligationStatus;
  dividendId?: string;
  beneficiaryId?: string;
}

export interface PaymentListQuery extends PageQuery {
  obligationStatus?: DividendObligationStatus;
}

export interface LedgerListQuery extends PageQuery {
  kind?: LedgerEntryKind;
  obligationId?: string;
}

export interface PaymentReadItem {
  payment: Payment;
  obligationStatus: DividendObligationStatus | string;
}

export interface DashboardSummary {
  dividends: number;
  beneficiaries: number;
  obligations: number;
  payments: number;
  obligationsByStatus: Record<string, number>;
  outbox: { pending: number; processing: number; published: number; deadLettered: number; byStatus: Record<string, number> };
  ledgerReconciliationIssues: number;
}

export interface BeneficiaryReadRepositoryPort {
  list(query: BeneficiaryListQuery): Promise<Page<Beneficiary>>;
}
export interface DividendReadRepositoryPort {
  list(query: DividendListQuery): Promise<Page<Dividend>>;
}
export interface ObligationReadRepositoryPort {
  list(query: ObligationListQuery): Promise<Page<DividendObligation>>;
}
export interface PaymentReadRepositoryPort {
  list(query: PaymentListQuery): Promise<Page<PaymentReadItem>>;
}
export interface LedgerReadRepositoryPort {
  list(query: LedgerListQuery): Promise<Page<LedgerEntry>>;
}
export interface DashboardReadRepositoryPort {
  getSummary(): Promise<DashboardSummary>;
}

export const BENEFICIARY_READ_REPOSITORY = Symbol('BENEFICIARY_READ_REPOSITORY');
export const DIVIDEND_READ_REPOSITORY = Symbol('DIVIDEND_READ_REPOSITORY');
export const OBLIGATION_READ_REPOSITORY = Symbol('OBLIGATION_READ_REPOSITORY');
export const PAYMENT_READ_REPOSITORY = Symbol('PAYMENT_READ_REPOSITORY');
export const LEDGER_READ_REPOSITORY = Symbol('LEDGER_READ_REPOSITORY');
export const DASHBOARD_READ_REPOSITORY = Symbol('DASHBOARD_READ_REPOSITORY');
