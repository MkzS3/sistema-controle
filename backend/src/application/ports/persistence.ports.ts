import type { Beneficiary } from '../../domain/beneficiaries/beneficiary.js';
import type { Dividend } from '../../domain/dividends/dividend.js';
import type { DividendObligation } from '../../domain/obligations/dividend-obligation.js';
import type { Payment } from '../../domain/payments/payment.js';
import type { LedgerEntry } from '../../domain/ledger/ledger-entry.js';

/** Opaque adapter transaction propagated by application use cases. */
export interface ApplicationTransactionContext {
  readonly persistenceContext: unknown;
}

export interface PersistObligationOptions {
  ledgerEntryId: string;
  outboxEventId?: string;
  correlationId?: string;
}

export interface PersistPaymentInstruction {
  obligationId: string;
  paymentId: string;
  idempotencyScope: string;
  idempotencyKey: string;
  requestedAt: Date;
  outboxEventId?: string;
  correlationId?: string;
}

export interface IdempotentResult<T> {
  value: T;
  replayed: boolean;
}

export interface DividendRepositoryPort {
  create(dividend: Dividend, context?: ApplicationTransactionContext): Promise<void>;
  findById(id: string, context?: ApplicationTransactionContext): Promise<Dividend | undefined>;
  declare(id: string, at: Date, context?: ApplicationTransactionContext): Promise<Dividend | undefined>;
}

export interface BeneficiaryRepositoryPort {
  create(beneficiary: Beneficiary, context?: ApplicationTransactionContext): Promise<void>;
  findById(id: string, context?: ApplicationTransactionContext): Promise<Beneficiary | undefined>;
}

export interface DividendObligationRepositoryPort {
  create(
    obligation: DividendObligation,
    options: PersistObligationOptions,
    context?: ApplicationTransactionContext,
  ): Promise<DividendObligation>;
  findById(id: string, context?: ApplicationTransactionContext): Promise<DividendObligation | undefined>;
}

export interface PaymentRepositoryPort {
  requestForObligation(
    command: PersistPaymentInstruction,
    context?: ApplicationTransactionContext,
  ): Promise<IdempotentResult<Payment>>;
  findById(id: string, context?: ApplicationTransactionContext): Promise<Payment | undefined>;
}

export interface LedgerEntryRepositoryPort {
  findById(id: string, context?: ApplicationTransactionContext): Promise<LedgerEntry | undefined>;
}

export const DIVIDEND_REPOSITORY = Symbol('DIVIDEND_REPOSITORY');
export const BENEFICIARY_REPOSITORY = Symbol('BENEFICIARY_REPOSITORY');
export const DIVIDEND_OBLIGATION_REPOSITORY = Symbol('DIVIDEND_OBLIGATION_REPOSITORY');
export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');
export const LEDGER_ENTRY_REPOSITORY = Symbol('LEDGER_ENTRY_REPOSITORY');
