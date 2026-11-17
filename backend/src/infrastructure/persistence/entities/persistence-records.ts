import type { DividendStatus } from '../../../domain/dividends/dividend.js';
import type { DividendObligationStatus } from '../../../domain/obligations/dividend-obligation.js';
import type { LedgerEntryKind } from '../../../domain/ledger/ledger-entry.js';

export interface DividendRecord {
  id: string;
  currency: string;
  terms: Record<string, unknown>;
  declaredAmount: string | null;
  status: DividendStatus;
  createdAt: Date;
  recordDate: Date | null;
  paymentDate: Date | null;
  declaredAt: Date | null;
}

export interface BeneficiaryRecord {
  id: string;
  createdAt: Date;
}

export interface DividendObligationRecord {
  id: string;
  dividendId: string;
  beneficiaryId: string;
  amount: string;
  currency: string;
  status: DividendObligationStatus;
  createdAt: Date;
  unknownAt: Date | null;
  paidAt: Date | null;
}

export interface PaymentRecord {
  id: string;
  obligationId: string;
  beneficiaryId: string;
  idempotencyScope: string;
  idempotencyKey: string;
  amount: string;
  currency: string;
  requestedAt: Date;
}

export interface LedgerEntryRecord {
  id: string;
  obligationId: string;
  kind: LedgerEntryKind;
  sourceType: string;
  sourceId: string;
  amount: string;
  currency: string;
  createdAt: Date;
}

export interface IdempotencyRecord {
  id: string;
  scope: string;
  key: string;
  payloadHash: string;
  resultType: string;
  resultId: string;
  createdAt: Date;
}

export interface InboxMessageRecord {
  id: string;
  consumerName: string;
  messageId: string;
  payloadHash: string;
  status: string;
  attemptCount: number;
  receivedAt: Date;
  processedAt: Date | null;
  lastError: string | null;
}

export interface OutboxMessageRecord {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  status: string;
  attemptCount: number;
  availableAt: Date;
  claimedUntil: Date | null;
  leaseToken: string | null;
  publishedAt: Date | null;
  deadLetteredAt: Date | null;
  lastError: string | null;
  createdAt: Date;
}
