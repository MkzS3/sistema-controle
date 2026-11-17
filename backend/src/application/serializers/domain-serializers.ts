import type { Beneficiary } from '../../domain/beneficiaries/beneficiary.js';
import type { Dividend } from '../../domain/dividends/dividend.js';
import type { DividendObligation } from '../../domain/obligations/dividend-obligation.js';
import type { Payment } from '../../domain/payments/payment.js';
import type { LedgerEntry } from '../../domain/ledger/ledger-entry.js';

export function beneficiaryResponse(beneficiary: Beneficiary) {
  return { id: beneficiary.id, createdAt: beneficiary.createdAt.toISOString() };
}

export function dividendResponse(dividend: Dividend) {
  const state = dividend.toState();
  return {
    id: state.id,
    currency: state.currency,
    terms: state.terms.kind === 'FIXED_AMOUNT'
      ? { kind: state.terms.kind, amount: state.terms.amount.toJSON() }
      : { kind: state.terms.kind, parameters: state.terms.parameters },
    status: state.status,
    createdAt: state.createdAt.toISOString(),
    recordDate: state.recordDate?.toISOString(),
    paymentDate: state.paymentDate?.toISOString(),
    declaredAt: state.declaredAt?.toISOString(),
  };
}

export function obligationResponse(obligation: DividendObligation) {
  const payment = obligation.payment;
  return {
    id: obligation.id,
    dividendId: obligation.dividendId,
    beneficiaryId: obligation.beneficiaryId,
    amount: obligation.amount.toJSON(),
    status: obligation.status,
    createdAt: obligation.createdAt.toISOString(),
    unknownAt: obligation.unknownAt?.toISOString(),
    paidAt: obligation.paidAt?.toISOString(),
    payment: payment
      ? {
          id: payment.id,
          obligationId: payment.obligationId,
          beneficiaryId: payment.beneficiaryId,
          idempotencyKey: payment.idempotencyKey,
          amount: payment.amount.toJSON(),
          requestedAt: payment.requestedAt.toISOString(),
        }
      : undefined,
  };
}

export function paymentResponse(payment: Payment) {
  return {
    id: payment.id,
    obligationId: payment.obligationId,
    beneficiaryId: payment.beneficiaryId,
    idempotencyKey: payment.idempotencyKey,
    amount: payment.amount.toJSON(),
    requestedAt: payment.requestedAt.toISOString(),
  };
}

export function ledgerEntryResponse(entry: LedgerEntry) {
  return {
    id: entry.id,
    obligationId: entry.obligationId,
    kind: entry.kind,
    source: entry.source,
    amount: entry.amount.toJSON(),
    createdAt: entry.createdAt.toISOString(),
  };
}
