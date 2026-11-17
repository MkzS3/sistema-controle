import { describe, expect, test } from 'bun:test';
import {
  DomainFailureCode,
  DomainValidationError,
} from '../../src/domain/shared/errors/domain-error.js';
import {
  LedgerEntry,
  LedgerEntryKind,
} from '../../src/domain/ledger/ledger-entry.js';
import { Money } from '../../src/domain/shared/value-objects/money.js';

const createdAt = new Date('2026-01-01T00:00:00.000Z');

function createLedgerEntry(id = 'entry-1'): LedgerEntry {
  return LedgerEntry.create({
    id,
    obligationId: 'obligation-1',
    kind: LedgerEntryKind.PaymentSettled,
    source: { type: 'PAYMENT', id: 'payment-1' },
    amount: Money.from({ amount: '25.00', currency: 'BRL' }),
    createdAt,
  });
}

describe('LedgerEntry', () => {
  test('creates an immutable append-only financial fact', () => {
    const entry = createLedgerEntry();

    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry.source)).toBe(true);
    expect(entry.amount.toString()).toBe('25.00');

    const exposedDate = entry.createdAt;
    exposedDate.setUTCFullYear(2030);
    expect(entry.createdAt.toISOString()).toBe(createdAt.toISOString());
  });

  test('rejects zero and negative amounts', () => {
    for (const amount of [Money.zero('BRL'), Money.from({ amount: '-1.00', currency: 'BRL' })]) {
      try {
        LedgerEntry.create({
          id: 'entry-invalid',
          obligationId: 'obligation-1',
          kind: LedgerEntryKind.PaymentSettled,
          source: { type: 'PAYMENT', id: 'payment-1' },
          amount,
          createdAt,
        });
        throw new Error('Expected ledger validation to fail.');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainValidationError);
        expect((error as DomainValidationError).code).toBe(
          DomainFailureCode.InvalidLedgerEntry,
        );
      }
    }
  });

  test('requires the source type to match the ledger fact kind', () => {
    expect(() =>
      LedgerEntry.create({
        id: 'entry-invalid',
        obligationId: 'obligation-1',
        kind: LedgerEntryKind.PaymentSettled,
        source: { type: 'OBLIGATION', id: 'obligation-1' },
        amount: Money.from({ amount: '25.00', currency: 'BRL' }),
        createdAt,
      }),
    ).toThrow(DomainValidationError);
  });

  test('identifies duplicate financial facts by kind and source identity', () => {
    const first = createLedgerEntry('entry-1');
    const duplicate = LedgerEntry.create({
      id: 'entry-2',
      obligationId: 'different-obligation',
      kind: LedgerEntryKind.PaymentSettled,
      source: { type: 'PAYMENT', id: 'payment-1' },
      amount: Money.from({ amount: '25.00', currency: 'BRL' }),
      createdAt,
    });

    expect(first.hasSameFinancialIdentityAs(duplicate)).toBe(true);
  });

  test('rehydrates state without exposing a mutable source object', () => {
    const restored = LedgerEntry.rehydrate(createLedgerEntry().toState());
    expect(restored.source).toEqual({ type: 'PAYMENT', id: 'payment-1' });
    expect(Object.isFrozen(restored.source)).toBe(true);
  });
});
