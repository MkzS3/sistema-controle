import { describe, expect, test } from 'bun:test';
import { Beneficiary } from '../../src/domain/beneficiaries/beneficiary.js';
import { Dividend, DividendStatus } from '../../src/domain/dividends/dividend.js';
import {
  DomainFailureCode,
  DomainValidationError,
  DuplicateDividendObligationError,
  InvalidStateTransitionError,
} from '../../src/domain/shared/errors/domain-error.js';
import { Money } from '../../src/domain/shared/value-objects/money.js';

const createdAt = new Date('2026-01-01T00:00:00.000Z');
const declaredAt = new Date('2026-01-02T00:00:00.000Z');

function createDividend(id = 'dividend-1'): Dividend {
  return Dividend.create({
    id,
    currency: 'BRL',
    terms: {
      kind: 'FIXED_AMOUNT',
      amount: Money.from({ amount: '100.00', currency: 'BRL' }),
    },
    createdAt,
  });
}

describe('Dividend', () => {
  test('starts as draft and can be declared once', () => {
    const dividend = createDividend();
    expect(dividend.status).toBe(DividendStatus.Draft);

    dividend.declare(declaredAt);

    expect(dividend.status).toBe(DividendStatus.Declared);
    expect(dividend.declaredAt?.toISOString()).toBe(declaredAt.toISOString());
  });

  test('does not expose mutable date instances', () => {
    const dividend = createDividend();
    const exposedCreatedAt = dividend.createdAt;
    exposedCreatedAt.setUTCFullYear(2030);
    expect(dividend.createdAt.toISOString()).toBe(createdAt.toISOString());
  });

  test('rejects a second declaration transition with a stable failure code', () => {
    const dividend = createDividend();
    dividend.declare(declaredAt);

    try {
      dividend.declare(new Date('2026-01-03T00:00:00.000Z'));
      throw new Error('Expected invalid transition to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidStateTransitionError);
      expect((error as InvalidStateTransitionError).code).toBe(
        DomainFailureCode.InvalidDividendState,
      );
    }
  });

  test('does not issue obligations before declaration', () => {
    const dividend = createDividend();
    const beneficiary = Beneficiary.create({ id: 'beneficiary-1', createdAt });

    expect(() =>
      dividend.issueObligation({
        id: 'obligation-1',
        beneficiary,
        amount: Money.from({ amount: '10.00', currency: 'BRL' }),
        createdAt,
      }),
    ).toThrow(InvalidStateTransitionError);
  });

  test('accepts opaque declaration parameters without calculating a dividend', () => {
    const parameters = { sourceReference: 'declaration-77', batch: 'final' };
    const dividend = Dividend.create({
      id: 'dividend-parameters',
      currency: 'BRL',
      terms: { kind: 'PARAMETERS', parameters },
      createdAt,
    });
    parameters.batch = 'mutated-outside';

    expect(dividend.terms).toEqual({
      kind: 'PARAMETERS',
      parameters: { sourceReference: 'declaration-77', batch: 'final' },
    });
  });

  test('requires a fixed amount to match the declaration currency', () => {
    expect(() =>
      Dividend.create({
        id: 'dividend-usd',
        currency: 'BRL',
        terms: {
          kind: 'FIXED_AMOUNT',
          amount: Money.from({ amount: '5.00', currency: 'USD' }),
        },
        createdAt,
      }),
    ).toThrow(DomainValidationError);
  });

  test('requires positive fixed dividend amounts', () => {
    expect(() =>
      Dividend.create({
        id: 'dividend-zero',
        currency: 'BRL',
        terms: {
          kind: 'FIXED_AMOUNT',
          amount: Money.zero('BRL'),
        },
        createdAt,
      }),
    ).toThrow(DomainValidationError);
  });

  test('rejects a duplicate obligation for the same dividend and beneficiary', () => {
    const dividend = createDividend();
    const beneficiary = Beneficiary.create({ id: 'beneficiary-1', createdAt });
    dividend.declare(declaredAt);

    dividend.issueObligation({
      id: 'obligation-1',
      beneficiary,
      amount: Money.from({ amount: '25.00', currency: 'BRL' }),
      createdAt,
    });

    expect(() =>
      dividend.issueObligation({
        id: 'obligation-2',
        beneficiary,
        amount: Money.from({ amount: '25.00', currency: 'BRL' }),
        createdAt,
      }),
    ).toThrow(DuplicateDividendObligationError);
    expect(dividend.obligations).toHaveLength(1);
  });

  test('allows different beneficiaries and the same beneficiary under another dividend', () => {
    const first = createDividend('dividend-1');
    const second = createDividend('dividend-2');
    const beneficiary1 = Beneficiary.create({ id: 'beneficiary-1', createdAt });
    const beneficiary2 = Beneficiary.create({ id: 'beneficiary-2', createdAt });
    first.declare(declaredAt);
    second.declare(declaredAt);

    first.issueObligation({
      id: 'obligation-1', beneficiary: beneficiary1,
      amount: Money.from({ amount: '10.00', currency: 'BRL' }), createdAt,
    });
    first.issueObligation({
      id: 'obligation-2', beneficiary: beneficiary2,
      amount: Money.from({ amount: '20.00', currency: 'BRL' }), createdAt,
    });
    second.issueObligation({
      id: 'obligation-3', beneficiary: beneficiary1,
      amount: Money.from({ amount: '30.00', currency: 'BRL' }), createdAt,
    });

    expect(first.obligations).toHaveLength(2);
    expect(second.obligations).toHaveLength(1);
  });

  test('rehydrates a declared state without replaying declare()', () => {
    const declared = createDividend();
    declared.declare(declaredAt);
    const rehydrated = Dividend.rehydrate(declared.toState());

    expect(rehydrated.status).toBe(DividendStatus.Declared);
    expect(rehydrated.declaredAt?.toISOString()).toBe(declaredAt.toISOString());
  });
});
