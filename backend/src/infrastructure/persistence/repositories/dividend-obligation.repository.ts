import { randomUUID } from 'node:crypto';
import { DividendObligation, DividendObligationStatus } from '../../../domain/obligations/dividend-obligation.js';
import { LedgerEntry, LedgerEntryKind } from '../../../domain/ledger/ledger-entry.js';
import { DividendStatus } from '../../../domain/dividends/dividend.js';
import { DomainFailureCode, InvalidStateTransitionError } from '../../../domain/shared/errors/domain-error.js';
import { Money } from '../../../domain/shared/value-objects/money.js';
import { databaseDate, optionalDatabaseDate } from './date-mapping.js';
import { PersistenceInvariantError } from './persistence-errors.js';
import { entityManagerFor, inOptionalTransaction, queryOne } from './sql.js';
import { LedgerEntryRepository } from './ledger-entry.repository.js';
import { OutboxRepository } from './outbox.repository.js';
import type { EntityManager } from '@mikro-orm/core';
import type {
  DividendObligationRepositoryPort,
  ApplicationTransactionContext,
  PersistObligationOptions,
} from '../../../application/ports/persistence.ports.js';

interface DividendGuardRow {
  id: string;
  currency: string;
  status: DividendStatus;
}

interface ObligationRow {
  id: string;
  dividend_id: string;
  beneficiary_id: string;
  amount: string;
  currency: string;
  status: string;
  created_at: Date | string;
  unknown_at: Date | string | null;
  paid_at: Date | string | null;
  payment_id: string | null;
  idempotency_scope: string | null;
  idempotency_key: string | null;
  requested_at: Date | string | null;
}

export class DividendObligationRepository implements DividendObligationRepositoryPort {
  constructor(
    private readonly em: EntityManager,
    private readonly ledgerEntries = new LedgerEntryRepository(em),
    private readonly outbox = new OutboxRepository(),
  ) {}

  async create(
    obligation: DividendObligation,
    options: PersistObligationOptions,
    context?: ApplicationTransactionContext,
  ): Promise<DividendObligation> {
    if (obligation.status !== DividendObligationStatus.Due || obligation.payment !== undefined) {
      throw new PersistenceInvariantError('Only a new DUE obligation can be persisted.');
    }

    return inOptionalTransaction(this.em, context, async (tx) => {
      const dividend = await queryOne<DividendGuardRow>(
        tx,
        'SELECT id, currency, status FROM dividends WHERE id = $1 FOR SHARE',
        [obligation.dividendId],
      );
      if (!dividend) {
        throw new PersistenceInvariantError(`Dividend ${obligation.dividendId} does not exist.`);
      }
      if (dividend.status !== DividendStatus.Declared) {
        throw new InvalidStateTransitionError(
          'Dividend',
          dividend.status,
          'ISSUE_OBLIGATION',
          DomainFailureCode.InvalidDividendState,
        );
      }
      if (dividend.currency !== obligation.amount.currency) {
        throw new PersistenceInvariantError('Obligation currency must match its dividend currency.');
      }

      const beneficiary = await queryOne<{ id: string }>(
        tx,
        'SELECT id FROM beneficiaries WHERE id = $1 FOR KEY SHARE',
        [obligation.beneficiaryId],
      );
      if (!beneficiary) {
        throw new PersistenceInvariantError(`Beneficiary ${obligation.beneficiaryId} does not exist.`);
      }

      await tx.getConnection().execute(
        `INSERT INTO dividend_obligations
          (id, dividend_id, beneficiary_id, amount, currency, status, created_at, unknown_at, paid_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL)`,
        [
          obligation.id,
          obligation.dividendId,
          obligation.beneficiaryId,
          obligation.amount.toString(),
          obligation.amount.currency,
          obligation.status,
          obligation.createdAt,
        ],
        'run',
        tx.getTransactionContext(),
      );

      const ledgerEntry = LedgerEntry.create({
        id: options.ledgerEntryId,
        obligationId: obligation.id,
        kind: LedgerEntryKind.ObligationRecognized,
        source: { type: 'OBLIGATION', id: obligation.id },
        amount: obligation.amount,
        createdAt: obligation.createdAt,
      });
      await this.ledgerEntries.recordObligationRecognitionInTransaction(tx, ledgerEntry);

      await this.outbox.enqueue(tx, {
        id: options.outboxEventId,
        eventType: 'dividend-obligation.recognized',
        aggregateType: 'DividendObligation',
        aggregateId: obligation.id,
        createdAt: obligation.createdAt,
        payload: {
          obligationId: obligation.id,
          dividendId: obligation.dividendId,
          beneficiaryId: obligation.beneficiaryId,
          amount: obligation.amount.toString(),
          currency: obligation.amount.currency,
          ...(options.correlationId ? { correlationId: options.correlationId } : {}),
        },
      });

      return obligation;
    });
  }

  async findById(id: string, context?: ApplicationTransactionContext): Promise<DividendObligation | undefined> {
    const row = await queryOne<ObligationRow>(
      entityManagerFor(this.em, context),
      `SELECT o.id, o.dividend_id, o.beneficiary_id, o.amount, o.currency, o.status,
              o.created_at, o.unknown_at, o.paid_at, p.id AS payment_id,
              p.idempotency_scope, p.idempotency_key, p.requested_at
       FROM dividend_obligations AS o
       LEFT JOIN payments AS p ON p.obligation_id = o.id
       WHERE o.id = $1`,
      [id],
    );
    if (!row) return undefined;

    const payment = row.payment_id
      ? {
          id: row.payment_id,
          obligationId: row.id,
          beneficiaryId: row.beneficiary_id,
          idempotencyKey: row.idempotency_key ?? '',
          amount: Money.from({ amount: row.amount, currency: row.currency }),
          requestedAt: databaseDate(row.requested_at ?? '', 'requested_at'),
        }
      : undefined;
    if (row.payment_id && row.idempotency_scope === null) {
      throw new PersistenceInvariantError(`Payment for obligation ${id} has no idempotency scope.`);
    }

    return DividendObligation.rehydrate({
      id: row.id,
      dividendId: row.dividend_id,
      beneficiaryId: row.beneficiary_id,
      amount: Money.from({ amount: row.amount, currency: row.currency }),
      status: row.status as DividendObligationStatus,
      createdAt: databaseDate(row.created_at, 'created_at'),
      unknownAt: optionalDatabaseDate(row.unknown_at, 'unknown_at'),
      paidAt: optionalDatabaseDate(row.paid_at, 'paid_at'),
      payment,
    });
  }
}
