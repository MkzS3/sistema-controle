import { describe, expect, test } from 'bun:test';
import { Beneficiary } from '../../src/domain/beneficiaries/beneficiary.js';
import { DomainFailureCode, DomainValidationError } from '../../src/domain/shared/errors/domain-error.js';

const createdAt = new Date('2026-01-01T10:00:00.000Z');

describe('Beneficiary', () => {
  test('creates an identity-only beneficiary and compares identity by id', () => {
    const beneficiary = Beneficiary.create({ id: 'beneficiary-1', createdAt });
    const sameBeneficiary = Beneficiary.rehydrate({
      id: 'beneficiary-1',
      createdAt,
    });

    expect(beneficiary.equals(sameBeneficiary)).toBe(true);
    expect(beneficiary.toState().id).toBe('beneficiary-1');
    expect(Object.isFrozen(beneficiary)).toBe(true);
  });

  test('rejects a blank identity', () => {
    try {
      Beneficiary.create({ id: '  ', createdAt });
      throw new Error('Expected beneficiary validation to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainValidationError);
      expect((error as DomainValidationError).code).toBe(
        DomainFailureCode.InvalidEntityId,
      );
    }
  });

  test('copies dates so the caller cannot mutate stored state', () => {
    const inputDate = new Date(createdAt);
    const beneficiary = Beneficiary.create({ id: 'beneficiary-2', createdAt: inputDate });
    inputDate.setUTCFullYear(2030);

    expect(beneficiary.createdAt.toISOString()).toBe(createdAt.toISOString());

    const exposedDate = beneficiary.createdAt;
    exposedDate.setUTCFullYear(2032);
    expect(beneficiary.createdAt.toISOString()).toBe(createdAt.toISOString());
  });
});
