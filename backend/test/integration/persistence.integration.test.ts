import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import type { EntityManager } from '@mikro-orm/core';
import { MikroORM } from '@mikro-orm/postgresql';
import { Beneficiary } from '../../src/domain/beneficiaries/beneficiary.js';
import { Dividend, DividendStatus } from '../../src/domain/dividends/dividend.js';
import { DividendObligation, DividendObligationStatus } from '../../src/domain/obligations/dividend-obligation.js';
import { Money } from '../../src/domain/shared/value-objects/money.js';
import { mikroOrmOptions } from '../../src/infrastructure/persistence/mikro-orm.options.js';
import { isSamePostgresDatabase } from '../support/test-database-target.js';
import { BeneficiaryRepository } from '../../src/infrastructure/persistence/repositories/beneficiary.repository.js';
import { DividendObligationRepository } from '../../src/infrastructure/persistence/repositories/dividend-obligation.repository.js';
import { DividendRepository } from '../../src/infrastructure/persistence/repositories/dividend.repository.js';
import { OutboxRepository } from '../../src/infrastructure/persistence/repositories/outbox.repository.js';
import { PaymentRepository } from '../../src/infrastructure/persistence/repositories/payment.repository.js';
import { InboxRepository } from '../../src/infrastructure/messaging/inbox/inbox.repository.js';
import { queryOne } from '../../src/infrastructure/persistence/repositories/sql.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const applicationDatabaseUrl = process.env.DATABASE_URL
  ?? 'postgresql://dividend_app:local_dev_only_change_me@127.0.0.1:5432/dividend_control';
const testDatabaseIsIsolated = testDatabaseUrl
  ? !isSamePostgresDatabase(testDatabaseUrl, applicationDatabaseUrl)
  : false;
const integrationDescribe = testDatabaseUrl && testDatabaseIsIsolated ? describe : describe.skip;

interface CountRow {
  count: string;
}

describe('PostgreSQL integration suite configuration', () => {
  test('requires TEST_DATABASE_URL for real database verification', () => {
    if (!testDatabaseUrl) {
      console.warn('PostgreSQL integration tests skipped: set TEST_DATABASE_URL to a dedicated real PostgreSQL database.');
    }
    expect(true).toBe(true);
  });

  test('requires TEST_DATABASE_URL to target a database separate from DATABASE_URL', () => {
    if (testDatabaseUrl && !testDatabaseIsIsolated) {
      throw new Error('TEST_DATABASE_URL points to the application database; refusing to apply test migrations or data there.');
    }
    expect(testDatabaseIsIsolated).toBe(testDatabaseUrl !== undefined);
  });
});

integrationDescribe('PostgreSQL persistence guarantees', () => {
  let orm: MikroORM;
  const run = randomUUID();

  beforeAll(async () => {
    orm = await MikroORM.init({
      ...mikroOrmOptions,
      clientUrl: testDatabaseUrl as string,
      debug: false,
    });
    await orm.migrator.up();
  });

  afterAll(async () => {
    await orm?.close(true);
  });

  function createDeclaredDividend(id = `dividend-${run}`): Dividend {
    const dividend = Dividend.create({
      id,
      currency: 'BRL',
      terms: {
        kind: 'FIXED_AMOUNT',
        amount: Money.from({ amount: '100.00', currency: 'BRL' }),
      },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    dividend.declare(new Date('2026-01-02T00:00:00.000Z'));
    return dividend;
  }

  async function createObligationFixture(suffix: string) {
    const em = orm.em.fork({ clear: true });
    const dividend = createDeclaredDividend(`dividend-${run}-${suffix}`);
    const beneficiary = Beneficiary.create({
      id: `beneficiary-${run}-${suffix}`,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    await new DividendRepository(em).create(dividend);
    await new BeneficiaryRepository(em).create(beneficiary);
    const obligation = DividendObligation.create({
      id: `obligation-${run}-${suffix}`,
      dividendId: dividend.id,
      beneficiaryId: beneficiary.id,
      amount: Money.from({ amount: '42.75', currency: 'BRL' }),
      createdAt: new Date('2026-01-03T00:00:00.000Z'),
    });
    await new DividendObligationRepository(em).create(obligation, {
      ledgerEntryId: `ledger-${run}-${suffix}`,
    });
    return { em, dividend, beneficiary, obligation };
  }

  async function count(em: MikroORM['em'], sql: string, parameters: readonly unknown[] = []): Promise<number> {
    const row = await queryOne<CountRow>(em, sql, parameters);
    return Number(row?.count ?? '0');
  }

  test('persists obligations with exactly one matching recognition entry and outbox event', async () => {
    const { em, obligation } = await createObligationFixture('atomic-create');
    expect(await count(em, 'SELECT count(*)::text AS count FROM dividend_obligations WHERE id = $1', [obligation.id])).toBe(1);
    expect(await count(em, `SELECT count(*)::text AS count FROM ledger_entries WHERE obligation_id = $1 AND kind = 'OBLIGATION_RECOGNIZED'`, [obligation.id])).toBe(1);
    expect(await count(em, `SELECT count(*)::text AS count FROM transactional_outbox WHERE aggregate_id = $1 AND event_type = 'dividend-obligation.recognized'`, [obligation.id])).toBe(1);
  });

  test('uses the unique business key to reject concurrent duplicate obligations', async () => {
    const em = orm.em.fork({ clear: true });
    const dividend = createDeclaredDividend(`dividend-${run}-duplicate`);
    const beneficiary = Beneficiary.create({
      id: `beneficiary-${run}-duplicate`,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    await new DividendRepository(em).create(dividend);
    await new BeneficiaryRepository(em).create(beneficiary);

    const obligation = (id: string) => DividendObligation.create({
      id,
      dividendId: dividend.id,
      beneficiaryId: beneficiary.id,
      amount: Money.from({ amount: '12.34', currency: 'BRL' }),
      createdAt: new Date('2026-01-03T00:00:00.000Z'),
    });
    const repository = new DividendObligationRepository(em);
    const attempts = await Promise.allSettled([
      repository.create(obligation(`obligation-${run}-duplicate-a`), { ledgerEntryId: `ledger-${run}-duplicate-a` }),
      repository.create(obligation(`obligation-${run}-duplicate-b`), { ledgerEntryId: `ledger-${run}-duplicate-b` }),
    ]);

    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await count(em, 'SELECT count(*)::text AS count FROM dividend_obligations WHERE dividend_id = $1 AND beneficiary_id = $2', [dividend.id, beneficiary.id])).toBe(1);
    expect(await count(em, 'SELECT count(*)::text AS count FROM ledger_entries WHERE obligation_id IN ($1, $2)', [`obligation-${run}-duplicate-a`, `obligation-${run}-duplicate-b`])).toBe(1);
  });

  test('serializes concurrent payment requests and replays the original result for one key', async () => {
    const { em, obligation } = await createObligationFixture('payment-replay');
    const repository = new PaymentRepository(em);
    const shared = {
      obligationId: obligation.id,
      idempotencyScope: `payment-request-${run}`,
      idempotencyKey: `key-${run}-replay`,
      requestedAt: new Date('2026-01-04T00:00:00.000Z'),
    };
    const [first, second] = await Promise.all([
      repository.requestForObligation({ ...shared, paymentId: `payment-${run}-first` }),
      repository.requestForObligation({ ...shared, paymentId: `payment-${run}-second` }),
    ]);

    expect(first.value.id).toBe(second.value.id);
    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
    expect(await count(em, 'SELECT count(*)::text AS count FROM payments WHERE obligation_id = $1', [obligation.id])).toBe(1);
    expect(await count(em, `SELECT count(*)::text AS count FROM transactional_outbox WHERE aggregate_id = $1 AND event_type = 'payment.instruction-recorded'`, [obligation.id])).toBe(1);
  });

  test('rejects a second idempotency payload and rolls back its reservation', async () => {
    const first = await createObligationFixture('idempotency-first');
    const second = await createObligationFixture('idempotency-second');
    const repository = new PaymentRepository(first.em);
    const command = {
      obligationId: first.obligation.id,
      paymentId: `payment-${run}-idem-a`,
      idempotencyScope: `payment-request-${run}`,
      idempotencyKey: `key-${run}-payload-conflict`,
      requestedAt: new Date('2026-01-04T00:00:00.000Z'),
    };
    await repository.requestForObligation(command);

    await expect(repository.requestForObligation({
      ...command,
      obligationId: second.obligation.id,
      paymentId: `payment-${run}-idem-b`,
    })).rejects.toThrow(/different payload/);
    expect(await count(first.em, 'SELECT count(*)::text AS count FROM payments WHERE obligation_id = $1', [second.obligation.id])).toBe(0);
  });

  test('rolls back payment state, payment row, and idempotency reservation when Outbox insert fails', async () => {
    const { em, obligation } = await createObligationFixture('payment-rollback');
    const outboxEventId = randomUUID();
    await new OutboxRepository().enqueue(em, {
      id: outboxEventId,
      eventType: 'test.reserved',
      aggregateType: 'Test',
      aggregateId: 'payment-rollback',
      payload: {},
    });
    const scope = `payment-request-${run}`;
    const key = `key-${run}-payment-rollback`;

    await expect(new PaymentRepository(em).requestForObligation({
      obligationId: obligation.id,
      paymentId: `payment-${run}-rollback`,
      idempotencyScope: scope,
      idempotencyKey: key,
      requestedAt: new Date(),
      outboxEventId,
    })).rejects.toThrow();

    const restored = await new DividendObligationRepository(em).findById(obligation.id);
    expect(restored?.status).toBe(DividendObligationStatus.Due);
    expect(await count(em, 'SELECT count(*)::text AS count FROM payments WHERE obligation_id = $1', [obligation.id])).toBe(0);
    expect(await count(em, 'SELECT count(*)::text AS count FROM idempotency_records WHERE scope = $1 AND key = $2', [scope, key])).toBe(0);
  });

  test('rolls back obligation, ledger, and outbox together when event persistence fails', async () => {
    const em = orm.em.fork({ clear: true });
    const dividend = createDeclaredDividend(`dividend-${run}-rollback`);
    const firstBeneficiary = Beneficiary.create({ id: `beneficiary-${run}-rollback-a`, createdAt: new Date() });
    const secondBeneficiary = Beneficiary.create({ id: `beneficiary-${run}-rollback-b`, createdAt: new Date() });
    await new DividendRepository(em).create(dividend);
    await new BeneficiaryRepository(em).create(firstBeneficiary);
    await new BeneficiaryRepository(em).create(secondBeneficiary);

    const duplicateEventId = randomUUID();
    const outbox = new OutboxRepository();
    await outbox.enqueue(em, {
      id: duplicateEventId,
      eventType: 'test.reserved',
      aggregateType: 'Test',
      aggregateId: 'reservation',
      payload: {},
    });
    const repository = new DividendObligationRepository(em);
    const first = DividendObligation.create({
      id: `obligation-${run}-rollback-a`, dividendId: dividend.id, beneficiaryId: firstBeneficiary.id,
      amount: Money.from({ amount: '10.00', currency: 'BRL' }), createdAt: new Date(),
    });
    const second = DividendObligation.create({
      id: `obligation-${run}-rollback-b`, dividendId: dividend.id, beneficiaryId: secondBeneficiary.id,
      amount: Money.from({ amount: '11.00', currency: 'BRL' }), createdAt: new Date(),
    });
    await repository.create(first, { ledgerEntryId: `ledger-${run}-rollback-a`, outboxEventId: randomUUID() });
    await expect(repository.create(second, {
      ledgerEntryId: `ledger-${run}-rollback-b`, outboxEventId: duplicateEventId,
    })).rejects.toThrow();

    expect(await count(em, 'SELECT count(*)::text AS count FROM dividend_obligations WHERE id = $1', [second.id])).toBe(0);
    expect(await count(em, 'SELECT count(*)::text AS count FROM ledger_entries WHERE id = $1', [`ledger-${run}-rollback-b`])).toBe(0);
    expect(await count(em, 'SELECT count(*)::text AS count FROM transactional_outbox WHERE id = $1::uuid', [duplicateEventId])).toBe(1);
  });

  test('processes an inbox message once under concurrent duplicate delivery', async () => {
    const em = orm.em.fork({ clear: true });
    const inbox = new InboxRepository(em);
    const messageId = `message-${run}-inbox`;
    const consumer = `consumer-${run}`;
    const eventId = randomUUID();
    let calls = 0;
    const handler = async (tx: EntityManager) => {
      calls += 1;
      await new OutboxRepository().enqueue(tx, {
        id: eventId,
        eventType: 'inbox.effect',
        aggregateType: 'InboxTest',
        aggregateId: messageId,
        payload: { messageId },
      });
    };
    const results = await Promise.all([
      inbox.processOnce(consumer, messageId, { value: 'same' }, handler),
      inbox.processOnce(consumer, messageId, { value: 'same' }, handler),
    ]);

    expect(calls).toBe(1);
    expect(results.map((result) => result.processed).sort()).toEqual([false, true]);
  });

  test('claims separate Outbox rows concurrently with leases and worker ownership', async () => {
    const em = orm.em.fork({ clear: true });
    const outbox = new OutboxRepository();
    await Promise.all([0, 1].map((index) => outbox.enqueue(em, {
      id: randomUUID(),
      eventType: 'test.concurrent-claim',
      aggregateType: 'OutboxTest',
      aggregateId: `${run}-${index}`,
      payload: { run, index },
    })));

    const [first, second] = await Promise.all([
      outbox.claimBatch(em, 1, 120),
      outbox.claimBatch(em, 1, 120),
    ]);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0]?.id).not.toBe(second[0]?.id);
    expect(first[0]?.lease_token).not.toBe(second[0]?.lease_token);
    expect(await outbox.markPublished(em, first[0]!.id, first[0]!.lease_token)).toBe(true);
    expect(await outbox.markPublished(em, second[0]!.id, randomUUID())).toBe(false);
    expect(await outbox.markPublished(em, second[0]!.id, second[0]!.lease_token)).toBe(true);
  });

  test('prevents UPDATE, DELETE, and TRUNCATE on the ledger in PostgreSQL', async () => {
    const { em, obligation } = await createObligationFixture('immutable-ledger');
    await expect(em.getConnection().execute(
      'UPDATE ledger_entries SET amount = 0 WHERE obligation_id = $1', [obligation.id], 'run',
    )).rejects.toThrow(/append-only/);
    await expect(em.getConnection().execute(
      'DELETE FROM ledger_entries WHERE obligation_id = $1', [obligation.id], 'run',
    )).rejects.toThrow(/append-only/);
    await expect(em.getConnection().execute('TRUNCATE ledger_entries', [], 'run')).rejects.toThrow(/append-only/);
  });

  test('enforces one ledger fact per source and kind', async () => {
    const { em, obligation } = await createObligationFixture('ledger-unique');
    await expect(em.getConnection().execute(
      `INSERT INTO ledger_entries
        (id, obligation_id, kind, source_type, source_id, amount, currency, created_at)
       VALUES ($1, $2, 'OBLIGATION_RECOGNIZED', 'OBLIGATION', $2, 42.75, 'BRL', now())`,
      [`ledger-${run}-ledger-unique-duplicate`, obligation.id], 'run',
    )).rejects.toThrow();
    expect(await count(em, `SELECT count(*)::text AS count FROM ledger_entries WHERE obligation_id = $1 AND kind = 'OBLIGATION_RECOGNIZED'`, [obligation.id])).toBe(1);
  });

  test('rejects unsupported stored currency and fractional precision in PostgreSQL', async () => {
    const { em, obligation } = await createObligationFixture('brl-precision');
    const dividend = await new DividendRepository(em).findById(obligation.dividendId);
    expect(dividend?.status).toBe(DividendStatus.Declared);
    await expect(em.getConnection().execute(
      `INSERT INTO dividend_obligations
        (id, dividend_id, beneficiary_id, amount, currency, status, created_at)
       VALUES ($1, $2, $3, 1.001, 'BRL', 'DUE', now())`,
      [`obligation-${run}-fractional`, obligation.dividendId, obligation.beneficiaryId], 'run',
    )).rejects.toThrow();
    await expect(em.getConnection().execute(
      `INSERT INTO dividend_obligations
        (id, dividend_id, beneficiary_id, amount, currency, status, created_at)
       VALUES ($1, $2, $3, 1.00, 'USD', 'DUE', now())`,
      [`obligation-${run}-foreign-currency`, obligation.dividendId, obligation.beneficiaryId], 'run',
    )).rejects.toThrow();
    expect(await count(em, `SELECT count(*)::text AS count FROM obligation_ledger_reconciliation WHERE obligation_id = $1 AND reconciliation_status = 'MATCHED'`, [obligation.id])).toBe(1);
  });
});
