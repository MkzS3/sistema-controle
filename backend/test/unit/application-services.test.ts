import { describe, expect, test } from 'bun:test';
import { Beneficiary } from '../../src/domain/beneficiaries/beneficiary.js';
import { Dividend, DividendStatus } from '../../src/domain/dividends/dividend.js';
import { DividendObligation, DividendObligationStatus } from '../../src/domain/obligations/dividend-obligation.js';
import { Payment } from '../../src/domain/payments/payment.js';
import { Money } from '../../src/domain/shared/value-objects/money.js';
import type {
  BeneficiaryRepositoryPort,
  DividendObligationRepositoryPort,
  DividendRepositoryPort,
  PaymentRepositoryPort,
} from '../../src/application/ports/persistence.ports.js';
import { DividendApplicationService } from '../../src/application/use-cases/dividend.application-service.js';
import { ObligationApplicationService } from '../../src/application/use-cases/obligation.application-service.js';
import { PaymentInstructionApplicationService } from '../../src/application/use-cases/payment-instruction.application-service.js';

const now = new Date('2026-01-01T00:00:00.000Z');

describe('application services', () => {
  test('creates a draft dividend from an exact decimal string', async () => {
    let stored: Dividend | undefined;
    const repository: DividendRepositoryPort = {
      create: async (dividend) => { stored = dividend; },
      findById: async () => stored,
      declare: async () => stored,
    };

    const response = await new DividendApplicationService(repository).create({
      currency: 'BRL',
      terms: { kind: 'FIXED_AMOUNT', amount: '125.30' },
    });

    expect(response.status).toBe(DividendStatus.Draft);
    expect(response.terms).toEqual({
      kind: 'FIXED_AMOUNT',
      amount: { amount: '125.30', currency: 'BRL' },
    });
    expect(stored?.status).toBe(DividendStatus.Draft);
  });

  test('rejects floating-point amounts and currencies outside the provisional BRL scope', async () => {
    const repository: DividendRepositoryPort = {
      create: async () => {},
      findById: async () => undefined,
      declare: async () => undefined,
    };
    const service = new DividendApplicationService(repository);

    await expect(service.create({
      currency: 'BRL', terms: { kind: 'FIXED_AMOUNT', amount: 12.34 },
    })).rejects.toThrow(/non-empty string/);
    await expect(service.create({
      currency: 'USD', terms: { kind: 'PARAMETERS', parameters: {} },
    })).rejects.toThrow(/Only BRL/);
  });

  test('issues obligations only through a declared dividend with an existing beneficiary', async () => {
    const dividend = Dividend.create({
      id: 'dividend-app-test',
      currency: 'BRL',
      terms: { kind: 'PARAMETERS', parameters: {} },
      createdAt: now,
    });
    dividend.declare(now);
    const beneficiary = Beneficiary.create({ id: 'beneficiary-app-test', createdAt: now });
    let persisted: DividendObligation | undefined;
    const dividendRepository: DividendRepositoryPort = {
      create: async () => {}, findById: async () => dividend, declare: async () => dividend,
    };
    const beneficiaryRepository: BeneficiaryRepositoryPort = {
      create: async () => {}, findById: async () => beneficiary,
    };
    const obligationRepository: DividendObligationRepositoryPort = {
      create: async (obligation) => { persisted = obligation; return obligation; },
      findById: async () => persisted,
    };

    const response = await new ObligationApplicationService(
      dividendRepository,
      beneficiaryRepository,
      obligationRepository,
    ).createForDividend(dividend.id, { beneficiaryId: beneficiary.id, amount: '4.25' });

    expect(response.amount).toEqual({ amount: '4.25', currency: 'BRL' });
    expect(persisted?.status).toBe(DividendObligationStatus.Due);
  });

  test('requests only a logical instruction and preserves an idempotent replay result', async () => {
    const obligation = DividendObligation.create({
      id: 'obligation-app-test',
      dividendId: 'dividend-app-test',
      beneficiaryId: 'beneficiary-app-test',
      amount: Money.from({ amount: '4.25', currency: 'BRL' }),
      createdAt: now,
    });
    const payment = Payment.create({
      id: 'payment-app-test',
      obligationId: obligation.id,
      beneficiaryId: obligation.beneficiaryId,
      idempotencyKey: 'request-app-test',
      amount: obligation.amount,
      requestedAt: now,
    });
    let recordedScope = '';
    const obligationRepository: DividendObligationRepositoryPort = {
      create: async (value) => value,
      findById: async () => obligation,
    };
    const paymentRepository: PaymentRepositoryPort = {
      requestForObligation: async (command) => {
        recordedScope = command.idempotencyScope;
        return { value: payment, replayed: true };
      },
      findById: async () => payment,
    };

    const response = await new PaymentInstructionApplicationService(
      obligationRepository,
      paymentRepository,
    ).request(obligation.id, 'caller-scope', 'request-app-test');

    expect(recordedScope).toBe('caller-scope');
    expect(response.id).toBe(payment.id);
    expect(response.replayed).toBe(true);
    expect(obligation.status).toBe(DividendObligationStatus.Due);
  });
});
