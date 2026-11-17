import { describe, expect, test } from 'bun:test';
import {
  CurrencyMismatchError,
  DomainFailureCode,
  DomainValidationError,
} from '../../src/domain/shared/errors/domain-error.js';
import { Money } from '../../src/domain/shared/value-objects/money.js';

describe('Money', () => {
  test('uses exact decimal arithmetic without floating point rounding', () => {
    const sum = Money.from({ amount: '0.10', currency: 'BRL' }).add(
      Money.from({ amount: '0.20', currency: 'BRL' }),
    );

    expect(sum.toJSON()).toEqual({ amount: '0.30', currency: 'BRL' });
  });

  test('supports exact amounts beyond JavaScript integer precision', () => {
    const sum = Money.from({
      amount: '90071992547409931234567890.123456',
      currency: 'BRL',
    }).add(Money.from({ amount: '0.000001', currency: 'BRL' }));

    expect(sum.toString()).toBe('90071992547409931234567890.123457');
  });

  test('retains decimal scale for serialization while comparing numeric value', () => {
    const oneDecimal = Money.from({ amount: '1.2', currency: 'USD' });
    const threeDecimals = Money.from({ amount: '1.200', currency: 'USD' });

    expect(oneDecimal.equals(threeDecimals)).toBe(true);
    expect(threeDecimals.toString()).toBe('1.200');
  });

  test('accepts leading zeroes and serializes a canonical exact decimal', () => {
    expect(Money.from({ amount: '0001.20', currency: 'BRL' }).toString()).toBe('1.20');
  });

  test('subtracts exactly and allows signed values for ledger facts', () => {
    const difference = Money.from({ amount: '1.00', currency: 'BRL' }).subtract(
      Money.from({ amount: '1.23', currency: 'BRL' }),
    );

    expect(difference.toString()).toBe('-0.23');
    expect(difference.isNegative()).toBe(true);
    expect(difference.negate().toString()).toBe('0.23');
  });

  test('supports zero and comparisons', () => {
    const zero = Money.zero('BRL', 2);
    const positive = Money.from({ amount: '0.01', currency: 'BRL' });

    expect(zero.toString()).toBe('0.00');
    expect(zero.isZero()).toBe(true);
    expect(positive.isPositive()).toBe(true);
    expect(positive.isGreaterThan(zero)).toBe(true);
    expect(zero.isLessThan(positive)).toBe(true);
  });

  test.each([
    '',
    ' ',
    'NaN',
    'Infinity',
    '-Infinity',
    '1e3',
    '1,25',
    '.25',
    '25.',
    '+1.00',
  ])('rejects malformed amount %j', (amount) => {
    expect(() => Money.from({ amount, currency: 'BRL' })).toThrow(
      DomainValidationError,
    );
  });

  test('rejects number values instead of decimal strings', () => {
    expect(() =>
      Money.from({ amount: 12.5 as unknown as string, currency: 'BRL' }),
    ).toThrow(DomainValidationError);
  });

  test('rejects a missing props object', () => {
    expect(() =>
      Money.from(null as unknown as { amount: string; currency: string }),
    ).toThrow(DomainValidationError);
  });

  test.each(['brl', 'US', 'BRL ', '123'])('rejects invalid currency %j', (currency) => {
    try {
      Money.from({ amount: '1.00', currency });
      throw new Error('Expected currency validation to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainValidationError);
      expect((error as DomainValidationError).code).toBe(
        DomainFailureCode.InvalidCurrency,
      );
    }
  });

  test('rejects arithmetic and ordering comparisons between currencies', () => {
    const brl = Money.from({ amount: '1.00', currency: 'BRL' });
    const usd = Money.from({ amount: '1.00', currency: 'USD' });

    expect(() => brl.add(usd)).toThrow(CurrencyMismatchError);
    expect(() => brl.subtract(usd)).toThrow(CurrencyMismatchError);
    expect(() => brl.isLessThan(usd)).toThrow(CurrencyMismatchError);
    expect(brl.equals(usd)).toBe(false);
  });

  test('is structurally immutable', () => {
    const money = Money.from({ amount: '12.34', currency: 'BRL' });
    expect(Object.isFrozen(money)).toBe(true);
  });
});
