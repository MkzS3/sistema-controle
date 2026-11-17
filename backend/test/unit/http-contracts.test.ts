import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { Module, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Beneficiary } from '../../src/domain/beneficiaries/beneficiary.js';
import { Dividend } from '../../src/domain/dividends/dividend.js';
import type { DividendObligation } from '../../src/domain/obligations/dividend-obligation.js';
import { Payment } from '../../src/domain/payments/payment.js';
import { DomainFailureCode } from '../../src/domain/shared/errors/domain-error.js';
import { ApplicationNotFoundError } from '../../src/application/errors/application-error.js';
import {
  BENEFICIARY_REPOSITORY,
  DIVIDEND_OBLIGATION_REPOSITORY,
  DIVIDEND_REPOSITORY,
  LEDGER_ENTRY_REPOSITORY,
  PAYMENT_REPOSITORY,
  type BeneficiaryRepositoryPort,
  type DividendObligationRepositoryPort,
  type DividendRepositoryPort,
  type LedgerEntryRepositoryPort,
  type PaymentRepositoryPort,
} from '../../src/application/ports/persistence.ports.js';
import {
  BENEFICIARY_READ_REPOSITORY,
  DASHBOARD_READ_REPOSITORY,
  DIVIDEND_READ_REPOSITORY,
  LEDGER_READ_REPOSITORY,
  OBLIGATION_READ_REPOSITORY,
  PAYMENT_READ_REPOSITORY,
  type BeneficiaryReadRepositoryPort,
  type DashboardReadRepositoryPort,
  type DividendReadRepositoryPort,
  type LedgerReadRepositoryPort,
  type ObligationReadRepositoryPort,
  type Page,
  type PaymentReadRepositoryPort,
} from '../../src/application/ports/read-model.ports.js';
import { BeneficiaryApplicationService } from '../../src/application/use-cases/beneficiary.application-service.js';
import { DividendApplicationService } from '../../src/application/use-cases/dividend.application-service.js';
import { LedgerApplicationService } from '../../src/application/use-cases/ledger.application-service.js';
import { ObligationApplicationService } from '../../src/application/use-cases/obligation.application-service.js';
import { PaymentInstructionApplicationService } from '../../src/application/use-cases/payment-instruction.application-service.js';
import {
  BeneficiaryReadApplicationService,
  DashboardReadApplicationService,
  DividendReadApplicationService,
  LedgerReadApplicationService,
  ObligationReadApplicationService,
  PaymentReadApplicationService,
} from '../../src/application/use-cases/read.application-services.js';
import { IdempotencyPayloadConflictError } from '../../src/infrastructure/persistence/repositories/persistence-errors.js';
import { DomainHttpExceptionFilter } from '../../src/presentation/http/filters/domain-http-exception.filter.js';
import { HealthController } from '../../src/presentation/http/health/health.controller.js';
import { HealthService } from '../../src/presentation/http/health/health.service.js';
import { MetricsController } from '../../src/presentation/http/metrics.controller.js';
import { MessagingMetrics } from '../../src/infrastructure/messaging/messaging-metrics.js';
import { BeneficiariesController } from '../../src/presentation/http/financial/beneficiaries.controller.js';
import { DashboardController } from '../../src/presentation/http/financial/dashboard.controller.js';
import { DividendsController } from '../../src/presentation/http/financial/dividends.controller.js';
import { LedgerController } from '../../src/presentation/http/financial/ledger.controller.js';
import { ObligationsController } from '../../src/presentation/http/financial/obligations.controller.js';
import { PaymentInstructionsController } from '../../src/presentation/http/financial/payment-instructions.controller.js';
import { PaymentsController } from '../../src/presentation/http/financial/payments.controller.js';

const at = new Date('2026-01-01T00:00:00.000Z');
const dividends = new Map<string, Dividend>();
const beneficiaries = new Map<string, Beneficiary>();
const obligations = new Map<string, DividendObligation>();
const payments = new Map<string, Payment>();
const idempotency = new Map<string, { obligationId: string; payment: Payment }>();
const listQueries = new Map<string, unknown>();
let summaryFailure: unknown;
let readinessFailure = false;
let forceUniqueConflict = false;
let baseUrl = '';
let app: INestApplication;

function emptyPage<T>(query: { limit: number; offset: number }): Page<T> {
  return { items: [], total: 0, limit: query.limit, offset: query.offset };
}

const dividendRepository: DividendRepositoryPort = {
  create: async (dividend) => { dividends.set(dividend.id, dividend); },
  findById: async (id) => dividends.get(id),
  declare: async (id, declaredAt) => {
    const dividend = dividends.get(id);
    dividend?.declare(declaredAt);
    return dividend;
  },
};
const beneficiaryRepository: BeneficiaryRepositoryPort = {
  create: async (beneficiary) => { beneficiaries.set(beneficiary.id, beneficiary); },
  findById: async (id) => beneficiaries.get(id),
};
const obligationRepository: DividendObligationRepositoryPort = {
  create: async (obligation) => {
    if (forceUniqueConflict) throw Object.assign(new Error('sensitive persistence detail'), { code: '23505' });
    obligations.set(obligation.id, obligation);
    return obligation;
  },
  findById: async (id) => obligations.get(id),
};
const paymentRepository: PaymentRepositoryPort = {
  requestForObligation: async (command) => {
    const scopedKey = `${command.idempotencyScope}\u0000${command.idempotencyKey}`;
    const existing = idempotency.get(scopedKey);
    if (existing) {
      if (existing.obligationId !== command.obligationId) {
        throw new IdempotencyPayloadConflictError(command.idempotencyScope, command.idempotencyKey);
      }
      return { value: existing.payment, replayed: true };
    }
    const obligation = obligations.get(command.obligationId);
    if (!obligation) throw new ApplicationNotFoundError('Dividend obligation', command.obligationId);
    const payment = obligation.requestPayment({ id: command.paymentId, idempotencyKey: command.idempotencyKey, requestedAt: command.requestedAt });
    payments.set(payment.id, payment);
    idempotency.set(scopedKey, { obligationId: command.obligationId, payment });
    return { value: payment, replayed: false };
  },
  findById: async (id) => payments.get(id),
};
const ledgerRepository: LedgerEntryRepositoryPort = { findById: async () => undefined };

const beneficiaryReads: BeneficiaryReadRepositoryPort = { list: async (query) => { listQueries.set('beneficiaries', query); return emptyPage(query); } };
const dividendReads: DividendReadRepositoryPort = { list: async (query) => { listQueries.set('dividends', query); return emptyPage(query); } };
const obligationReads: ObligationReadRepositoryPort = { list: async (query) => { listQueries.set('obligations', query); return emptyPage(query); } };
const paymentReads: PaymentReadRepositoryPort = { list: async (query) => { listQueries.set('payments', query); return emptyPage(query); } };
const ledgerReads: LedgerReadRepositoryPort = { list: async (query) => { listQueries.set('ledger', query); return emptyPage(query); } };
const dashboardReads: DashboardReadRepositoryPort = {
  getSummary: async () => {
    if (summaryFailure) throw summaryFailure;
    return { dividends: 0, beneficiaries: 0, obligations: 0, payments: 0, obligationsByStatus: {}, outbox: { pending: 0, processing: 0, published: 0, deadLettered: 0, byStatus: {} }, ledgerReconciliationIssues: 0 };
  },
};

@Module({
  controllers: [BeneficiariesController, DividendsController, ObligationsController, PaymentInstructionsController, PaymentsController, LedgerController, DashboardController, HealthController, MetricsController],
  providers: [
    { provide: DIVIDEND_REPOSITORY, useValue: dividendRepository },
    { provide: BENEFICIARY_REPOSITORY, useValue: beneficiaryRepository },
    { provide: DIVIDEND_OBLIGATION_REPOSITORY, useValue: obligationRepository },
    { provide: PAYMENT_REPOSITORY, useValue: paymentRepository },
    { provide: LEDGER_ENTRY_REPOSITORY, useValue: ledgerRepository },
    { provide: BENEFICIARY_READ_REPOSITORY, useValue: beneficiaryReads },
    { provide: DIVIDEND_READ_REPOSITORY, useValue: dividendReads },
    { provide: OBLIGATION_READ_REPOSITORY, useValue: obligationReads },
    { provide: PAYMENT_READ_REPOSITORY, useValue: paymentReads },
    { provide: LEDGER_READ_REPOSITORY, useValue: ledgerReads },
    { provide: DASHBOARD_READ_REPOSITORY, useValue: dashboardReads },
    { provide: HealthService, useValue: { readiness: async () => ({ status: readinessFailure ? 'error' : 'ok', checks: { postgres: readinessFailure ? 'down' : 'up', sqs: 'up' } }) } },
    { provide: MessagingMetrics, useValue: new MessagingMetrics() },
    BeneficiaryApplicationService,
    DividendApplicationService,
    ObligationApplicationService,
    PaymentInstructionApplicationService,
    LedgerApplicationService,
    BeneficiaryReadApplicationService,
    DividendReadApplicationService,
    ObligationReadApplicationService,
    PaymentReadApplicationService,
    LedgerReadApplicationService,
    DashboardReadApplicationService,
  ],
})
class HttpContractTestModule {}

async function call(path: string, init?: RequestInit): Promise<Response> {
  return fetch(new URL(path, baseUrl), init);
}

async function post(path: string, body?: unknown, headers?: Record<string, string>): Promise<Response> {
  return call(path, {
    method: 'POST',
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } }),
    ...(body === undefined && headers ? { headers } : {}),
  });
}

beforeAll(async () => {
  app = await NestFactory.create(HttpContractTestModule, { logger: false });
  app.useGlobalFilters(new DomainHttpExceptionFilter());
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
});

beforeEach(() => {
  dividends.clear(); beneficiaries.clear(); obligations.clear(); payments.clear(); idempotency.clear(); listQueries.clear();
  summaryFailure = undefined;
  readinessFailure = false;
  forceUniqueConflict = false;
});

afterAll(async () => { await app?.close(); });

describe('isolated Nest HTTP contracts (test repositories; no persistence guarantee)', () => {
  test('boots all controllers with application-service DI and exposes the read routes', async () => {
    const liveness = await call('/health/live');
    expect(liveness.status).toBe(200);
    expect(await liveness.json()).toEqual({ status: 'ok' });

    const readiness = await call('/health/ready');
    expect(readiness.status).toBe(200);
    expect(await readiness.json()).toMatchObject({ status: 'ok', checks: { postgres: 'up', sqs: 'up' } });
    readinessFailure = true;
    const unavailable = await call('/health/ready');
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toMatchObject({ status: 'error', checks: { postgres: 'down', sqs: 'up' } });
    readinessFailure = false;

    const metrics = await call('/metrics');
    expect(metrics.status).toBe(200);
    expect(metrics.headers.get('content-type')).toContain('text/plain');
    expect(await metrics.text()).toContain('sqs_received_total 0');

    const summaryResponse = await call('/dashboard/summary');
    expect(summaryResponse.status).toBe(200);
    expect(await summaryResponse.json()).toMatchObject({ dividends: 0, obligations: 0, outbox: { pending: 0 } });

    for (const [path, key, expectedQuery] of [
      ['/beneficiaries?query=person&limit=5&offset=10', 'beneficiaries', { limit: 5, offset: 10, query: 'person' }],
      ['/dividends?status=DRAFT', 'dividends', { limit: 20, offset: 0, status: 'DRAFT' }],
      ['/obligations?status=DUE&dividendId=d-1&beneficiaryId=b-1', 'obligations', { limit: 20, offset: 0, status: 'DUE', dividendId: 'd-1', beneficiaryId: 'b-1' }],
      ['/payments?obligationStatus=PAYMENT_UNKNOWN', 'payments', { limit: 20, offset: 0, obligationStatus: 'PAYMENT_UNKNOWN' }],
      ['/ledger?kind=OBLIGATION_RECOGNIZED&obligationId=o-1', 'ledger', { limit: 20, offset: 0, kind: 'OBLIGATION_RECOGNIZED', obligationId: 'o-1' }],
    ] as const) {
      const response = await call(path);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ items: [], total: 0, limit: expectedQuery.limit, offset: expectedQuery.offset });
      expect(listQueries.get(key)).toEqual(expectedQuery);
    }
  });

  test('validates read filters and pagination before calling repositories', async () => {
    for (const path of ['/beneficiaries?limit=0', '/dividends?status=FUTURE', '/obligations?offset=-1', '/payments?obligationStatus=PAID&limit=1.5', '/ledger?kind=UNKNOWN', '/beneficiaries?query=%20%20']) {
      const response = await call(path);
      expect(response.status).toBe(400);
      expect(listQueries.size).toBe(0);
    }
    const upperBound = await call('/beneficiaries?limit=100&offset=2147483647');
    expect(upperBound.status).toBe(200);
    expect(listQueries.get('beneficiaries')).toEqual({ limit: 100, offset: 2_147_483_647, query: undefined });
    const tooLarge = await call('/beneficiaries?limit=101');
    expect(tooLarge.status).toBe(400);
  });

  test('creates and declares dividends, validates exact decimal input, and returns business conflicts', async () => {
    const invalid = await post('/dividends', { currency: 'BRL', terms: { kind: 'FIXED_AMOUNT', amount: 12.34 } });
    expect(invalid.status).toBe(400);

    const created = await post('/dividends', { currency: 'BRL', terms: { kind: 'FIXED_AMOUNT', amount: '125.30' } });
    expect(created.status).toBe(201);
    const draft = await created.json() as { id: string; status: string; terms: { amount: { amount: string } } };
    expect(draft.status).toBe('DRAFT');
    expect(draft.terms.amount.amount).toBe('125.30');

    const declaredResponse = await post(`/dividends/${draft.id}/declare`);
    expect(declaredResponse.status).toBe(200);
    expect((await declaredResponse.json()).status).toBe('DECLARED');
    const repeated = await post(`/dividends/${draft.id}/declare`);
    expect(repeated.status).toBe(409);
    expect((await repeated.json()).code).toBe(DomainFailureCode.InvalidDividendState);

    const missing = await post('/dividends/absent/declare');
    expect(missing.status).toBe(404);
  });

  test('creates obligations only for existing declared dividends and rejects same aggregate identity', async () => {
    const beneficiaryResponse = await post('/beneficiaries');
    expect(beneficiaryResponse.status).toBe(201);
    const beneficiary = await beneficiaryResponse.json() as { id: string };
    const dividendResponse = await post('/dividends', { currency: 'BRL', terms: { kind: 'PARAMETERS', parameters: { reference: 'known' } } });
    const dividend = await dividendResponse.json() as { id: string };

    const beforeDeclaration = await post(`/dividends/${dividend.id}/obligations`, { beneficiaryId: beneficiary.id, amount: '25.00' });
    expect(beforeDeclaration.status).toBe(409);
    expect((await beforeDeclaration.json()).code).toBe(DomainFailureCode.InvalidDividendState);
    await post(`/dividends/${dividend.id}/declare`);

    const created = await post(`/dividends/${dividend.id}/obligations`, { beneficiaryId: beneficiary.id, amount: '25.00' });
    expect(created.status).toBe(201);
    const first = await created.json() as { id: string; status: string };
    expect(first.status).toBe('DUE');
    const duplicate = await post(`/dividends/${dividend.id}/obligations`, { beneficiaryId: beneficiary.id, amount: '25.00' });
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).code).toBe(DomainFailureCode.DuplicateDividendObligation);

    const invalidAmount = await post(`/dividends/${dividend.id}/obligations`, { beneficiaryId: beneficiary.id, amount: 25.5 });
    expect(invalidAmount.status).toBe(400);
    const absentBeneficiary = await post(`/dividends/${dividend.id}/obligations`, { beneficiaryId: 'absent', amount: '5.00' });
    expect(absentBeneficiary.status).toBe(404);
  });

  test('requires non-empty idempotency headers, returns repeat result, and maps payload conflict', async () => {
    const beneficiaryResponse = await post('/beneficiaries');
    const beneficiary = await beneficiaryResponse.json() as { id: string };
    const dividendResponse = await post('/dividends', { currency: 'BRL', terms: { kind: 'PARAMETERS', parameters: {} } });
    const dividend = await dividendResponse.json() as { id: string };
    await post(`/dividends/${dividend.id}/declare`);
    const createObligation = async (beneficiaryId: string) => post(`/dividends/${dividend.id}/obligations`, { beneficiaryId, amount: '2.50' });
    const firstObligationResponse = await createObligation(beneficiary.id);
    const firstObligation = await firstObligationResponse.json() as { id: string };
    const secondBeneficiaryResponse = await post('/beneficiaries');
    const secondBeneficiary = await secondBeneficiaryResponse.json() as { id: string };
    const secondObligationResponse = await createObligation(secondBeneficiary.id);
    const secondObligation = await secondObligationResponse.json() as { id: string };

    const path = `/obligations/${firstObligation.id}/payment-instructions`;
    expect((await post(path)).status).toBe(400);
    expect((await post(path, undefined, { 'Idempotency-Scope': '   ', 'Idempotency-Key': 'key-1' })).status).toBe(400);
    expect((await post(path, undefined, { 'Idempotency-Scope': 'admin', 'Idempotency-Key': '\t' })).status).toBe(400);

    const headers = { 'Idempotency-Scope': 'admin', 'Idempotency-Key': 'key-1' };
    const firstResponse = await post(path, undefined, headers);
    expect(firstResponse.status).toBe(200);
    const first = await firstResponse.json() as { id: string; replayed: boolean };
    expect(first.replayed).toBe(false);
    const replayResponse = await post(path, undefined, headers);
    const replay = await replayResponse.json() as { id: string; replayed: boolean };
    expect(replayResponse.status).toBe(200);
    expect(replay).toMatchObject({ id: first.id, replayed: true });

    const conflict = await post(`/obligations/${secondObligation.id}/payment-instructions`, undefined, headers);
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).code).toBe('IDEMPOTENCY_PAYLOAD_CONFLICT');
  });

  test('returns not-found and sanitized dependency errors, and maps persistence unique conflicts', async () => {
    for (const path of ['/beneficiaries/absent', '/dividends/absent', '/obligations/absent', '/payments/absent', '/ledger/absent']) {
      const response = await call(path);
      expect(response.status).toBe(404);
      expect((await response.json()).code).toBe('RESOURCE_NOT_FOUND');
    }

    summaryFailure = new Error('database password and SQL details');
    const dependencyFailure = await call('/dashboard/summary');
    const failureBody = await dependencyFailure.text();
    expect(dependencyFailure.status).toBe(500);
    expect(failureBody).toContain('Unexpected internal server error.');
    expect(failureBody).not.toContain('database password');

    const person = await post('/beneficiaries');
    const beneficiary = await person.json() as { id: string };
    const declaration = await post('/dividends', { currency: 'BRL', terms: { kind: 'PARAMETERS', parameters: {} } });
    const dividend = await declaration.json() as { id: string };
    await post(`/dividends/${dividend.id}/declare`);
    forceUniqueConflict = true;
    const collision = await post(`/dividends/${dividend.id}/obligations`, { beneficiaryId: beneficiary.id, amount: '1.00' });
    const collisionBody = await collision.text();
    expect(collision.status).toBe(409);
    expect(collisionBody).toContain('PERSISTENCE_UNIQUE_CONFLICT');
    expect(collisionBody).not.toContain('sensitive persistence detail');
  });
});
