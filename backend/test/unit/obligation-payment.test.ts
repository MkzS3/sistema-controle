import { describe, expect, test } from 'bun:test';
import {
  DomainFailureCode,
  DomainValidationError,
  InvalidStateTransitionError,
} from '../../src/domain/shared/errors/domain-error.js';
import { Money } from '../../src/domain/shared/value-objects/money.js';
import {
  DividendObligation,
  DividendObligationStatus,
} from '../../src/domain/obligations/dividend-obligation.js';

const createdAt = new Date('2026-01-01T00:00:00.000Z');
const requestedAt = new Date('2026-01-02T00:00:00.000Z');
const paidAt = new Date('2026-01-03T00:00:00.000Z');

function createObligation(): DividendObligation {
  return DividendObligation.create({
    id: 'obligation-1',
    dividendId: 'dividend-1',
    beneficiaryId: 'beneficiary-1',
    amount: Money.from({ amount: '42.75', currency: 'BRL' }),
    createdAt,
  });
}

describe('DividendObligation and Payment', () => {
  test('uses dividend and beneficiary ids as its business identity', () => {
    const first = createObligation();
    const sameIdentity = DividendObligation.create({
      id: 'another-internal-id',
      dividendId: 'dividend-1',
      beneficiaryId: 'beneficiary-1',
      amount: Money.from({ amount: '42.75', currency: 'BRL' }),
      createdAt,
    });
    const differentBeneficiary = DividendObligation.create({
      id: 'obligation-3',
      dividendId: 'dividend-1',
      beneficiaryId: 'beneficiary-2',
      amount: Money.from({ amount: '42.75', currency: 'BRL' }),
      createdAt,
    });

    expect(first.businessIdentity).toEqual({
      dividendId: 'dividend-1',
      beneficiaryId: 'beneficiary-1',
    });
    expect(first.hasSameBusinessIdentity(sameIdentity)).toBe(true);
    expect(first.hasSameBusinessIdentity(differentBeneficiary)).toBe(false);
  });

  test('requires a positive amount', () => {
    expect(() =>
      DividendObligation.create({
        id: 'obligation-zero',
        dividendId: 'dividend-1',
        beneficiaryId: 'beneficiary-1',
        amount: Money.zero('BRL'),
        createdAt,
      }),
    ).toThrow(DomainValidationError);
  });

  test('creates one immutable logical payment instruction using the obligation amount', () => {
    const obligation = createObligation();
    const payment = obligation.requestPayment({
      id: 'payment-1',
      idempotencyKey: 'payment-request-1',
      requestedAt,
    });

    expect(payment.amount.equals(obligation.amount)).toBe(true);
    expect(payment.obligationId).toBe(obligation.id);
    expect(payment.beneficiaryId).toBe(obligation.beneficiaryId);
    expect(Object.isFrozen(payment)).toBe(true);
    expect(obligation.status).toBe(DividendObligationStatus.PaymentRequested);

    const exposedDate = payment.requestedAt;
    exposedDate.setUTCFullYear(2030);
    expect(payment.requestedAt.toISOString()).toBe(requestedAt.toISOString());
  });

  test('does not expose a mutable obligation creation date', () => {
    const obligation = createObligation();
    const exposedDate = obligation.createdAt;
    exposedDate.setUTCFullYear(2030);
    expect(obligation.createdAt.toISOString()).toBe(createdAt.toISOString());
  });

  test('does not allow a second payment instruction for an obligation', () => {
    const obligation = createObligation();
    obligation.requestPayment({
      id: 'payment-1', idempotencyKey: 'key-1', requestedAt,
    });

    expect(() =>
      obligation.requestPayment({
        id: 'payment-2', idempotencyKey: 'key-2', requestedAt,
      }),
    ).toThrow(InvalidStateTransitionError);
  });

  test('rejects a blank idempotency key for a payment instruction', () => {
    expect(() =>
      createObligation().requestPayment({
        id: 'payment-1', idempotencyKey: ' ', requestedAt,
      }),
    ).toThrow(DomainValidationError);
  });

  test('allows the requested payment to become unknown and later confirmed paid', () => {
    const obligation = createObligation();
    const payment = obligation.requestPayment({
      id: 'payment-1', idempotencyKey: 'key-1', requestedAt,
    });
    obligation.markPaymentUnknown(payment.id, requestedAt);
    expect(obligation.status).toBe(DividendObligationStatus.PaymentUnknown);

    obligation.markPaid(payment.id, paidAt);

    expect(obligation.status).toBe(DividendObligationStatus.Paid);
    expect(obligation.paidAt?.toISOString()).toBe(paidAt.toISOString());
  });

  test('does not settle or change an obligation with a different payment id', () => {
    const obligation = createObligation();
    obligation.requestPayment({
      id: 'payment-1', idempotencyKey: 'key-1', requestedAt,
    });

    try {
      obligation.markPaid('payment-from-another-obligation', paidAt);
      throw new Error('Expected payment correlation validation to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainValidationError);
      expect((error as DomainValidationError).code).toBe(
        DomainFailureCode.InvalidPayment,
      );
    }
    expect(obligation.status).toBe(DividendObligationStatus.PaymentRequested);
  });

  test('does not permit settlement before a payment request', () => {
    expect(() => createObligation().markPaid('payment-1', paidAt)).toThrow(
      DomainValidationError,
    );
  });

  test('does not reopen a paid obligation or allow another payment', () => {
    const obligation = createObligation();
    const payment = obligation.requestPayment({
      id: 'payment-1', idempotencyKey: 'key-1', requestedAt,
    });
    obligation.markPaid(payment.id, paidAt);

    expect(() =>
      obligation.requestPayment({
        id: 'payment-2', idempotencyKey: 'key-2', requestedAt,
      }),
    ).toThrow(InvalidStateTransitionError);
  });

  test('rehydrates payment state without applying another transition', () => {
    const obligation = createObligation();
    const payment = obligation.requestPayment({
      id: 'payment-1', idempotencyKey: 'key-1', requestedAt,
    });
    obligation.markPaid(payment.id, paidAt);

    const restored = DividendObligation.rehydrate(obligation.toState());
    expect(restored.status).toBe(DividendObligationStatus.Paid);
    expect(restored.payment?.id).toBe(payment.id);
  });
});
