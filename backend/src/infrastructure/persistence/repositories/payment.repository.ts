import type { EntityManager } from '@mikro-orm/core';
import { DividendObligation, DividendObligationStatus } from '../../../domain/obligations/dividend-obligation.js';
import { DomainFailureCode, InvalidStateTransitionError } from '../../../domain/shared/errors/domain-error.js';
import { Money } from '../../../domain/shared/value-objects/money.js';
import { Payment } from '../../../domain/payments/payment.js';
import { databaseDate } from './date-mapping.js';
import { IdempotencyRepository } from './idempotency.repository.js';
import { PersistenceInvariantError } from './persistence-errors.js';
import { entityManagerFor, queryOne, queryRows } from './sql.js';
import { OutboxRepository } from './outbox.repository.js';
import type {
  ApplicationTransactionContext,
  IdempotentResult,
  PaymentRepositoryPort,
  PersistPaymentInstruction,
} from '../../../application/ports/persistence.ports.js';

interface ObligationForPaymentRow {
  id: string;
  dividend_id: string;
  beneficiary_id: string;
  amount: string;
  currency: string;
  status: DividendObligationStatus;
  created_at: Date | string;
}

interface PaymentRow {
  id: string;
  obligation_id: string;
  beneficiary_id: string;
  idempotency_key: string;
  amount: string;
  currency: string;
  requested_at: Date | string;
}

export class PaymentRepository implements PaymentRepositoryPort {
  private readonly idempotency: IdempotencyRepository;
  private readonly outbox: OutboxRepository;

  constructor(private readonly em: EntityManager) {
    this.idempotency = new IdempotencyRepository(em);
    this.outbox = new OutboxRepository();
  }

  async requestForObligation(
    command: PersistPaymentInstruction,
    context?: ApplicationTransactionContext,
  ): Promise<IdempotentResult<Payment>> {
    return this.idempotency.execute({
      scope: command.idempotencyScope,
      key: command.idempotencyKey,
      payload: { action: 'REQUEST_PAYMENT', obligationId: command.obligationId },
      resultType: 'PAYMENT',
      resultId: command.paymentId,
      execute: async (tx) => {
        const row = await queryOne<ObligationForPaymentRow>(
          tx,
          `SELECT id, dividend_id, beneficiary_id, amount, currency, status, created_at
           FROM dividend_obligations WHERE id = $1 FOR UPDATE`,
          [command.obligationId],
        );
        if (!row) {
          throw new PersistenceInvariantError(`Obligation ${command.obligationId} does not exist.`);
        }
        if (row.status !== DividendObligationStatus.Due) {
          throw new InvalidStateTransitionError(
            'DividendObligation',
            row.status,
            'REQUEST_PAYMENT',
            DomainFailureCode.InvalidObligationState,
          );
        }

        const obligation = DividendObligation.create({
          id: row.id,
          dividendId: row.dividend_id,
          beneficiaryId: row.beneficiary_id,
          amount: Money.from({ amount: row.amount, currency: row.currency }),
          createdAt: databaseDate(row.created_at, 'created_at'),
        });
        const payment = obligation.requestPayment({
          id: command.paymentId,
          idempotencyKey: command.idempotencyKey,
          requestedAt: command.requestedAt,
        });

        const updated = await queryRows<{ id: string }>(
          tx,
          `UPDATE dividend_obligations
           SET status = 'PAYMENT_REQUESTED'
           WHERE id = $1 AND status = 'DUE'
           RETURNING id`,
          [row.id],
        );
        if (updated.length !== 1) {
          throw new PersistenceInvariantError(`Obligation ${row.id} changed while being locked.`);
        }
        await tx.getConnection().execute(
          `INSERT INTO payments
            (id, obligation_id, beneficiary_id, idempotency_scope, idempotency_key, amount, currency, requested_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            payment.id,
            payment.obligationId,
            payment.beneficiaryId,
            command.idempotencyScope,
            payment.idempotencyKey,
            payment.amount.toString(),
            payment.amount.currency,
            payment.requestedAt,
          ],
          'run',
          tx.getTransactionContext(),
        );
        await this.outbox.enqueue(tx, {
          id: command.outboxEventId,
          eventType: 'payment.instruction-recorded',
          aggregateType: 'DividendObligation',
          aggregateId: row.id,
          createdAt: payment.requestedAt,
          payload: {
            paymentId: payment.id,
            obligationId: payment.obligationId,
            beneficiaryId: payment.beneficiaryId,
            amount: payment.amount.toString(),
            currency: payment.amount.currency,
            ...(command.correlationId ? { correlationId: command.correlationId } : {}),
          },
        });

        return payment;
      },
      loadResult: async (tx, resultType, resultId) => {
        if (resultType !== 'PAYMENT') {
          throw new PersistenceInvariantError(`Idempotency result type ${resultType} is not a payment.`);
        }
        const payment = await this.loadById(tx, resultId);
        if (!payment) throw new PersistenceInvariantError(`Idempotent payment ${resultId} was not found.`);
        return payment;
      },
    }, context);
  }

  async findById(id: string, context?: ApplicationTransactionContext): Promise<Payment | undefined> {
    return this.loadById(entityManagerFor(this.em, context), id);
  }

  private async loadById(em: EntityManager, id: string): Promise<Payment | undefined> {
    const row = await queryOne<PaymentRow>(
      em,
      `SELECT id, obligation_id, beneficiary_id, idempotency_key, amount, currency, requested_at
       FROM payments WHERE id = $1`,
      [id],
    );
    if (!row) return undefined;

    return Payment.rehydrate({
      id: row.id,
      obligationId: row.obligation_id,
      beneficiaryId: row.beneficiary_id,
      idempotencyKey: row.idempotency_key,
      amount: Money.from({ amount: row.amount, currency: row.currency }),
      requestedAt: databaseDate(row.requested_at, 'requested_at'),
    });
  }
}
