import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ApplicationNotFoundError } from '../errors/application-error.js';
import {
  DIVIDEND_OBLIGATION_REPOSITORY,
  PAYMENT_REPOSITORY,
  type ApplicationTransactionContext,
  type DividendObligationRepositoryPort,
  type PaymentRepositoryPort,
} from '../ports/persistence.ports.js';
import { paymentResponse } from '../serializers/domain-serializers.js';

@Injectable()
export class PaymentInstructionApplicationService {
  constructor(
    @Inject(DIVIDEND_OBLIGATION_REPOSITORY) private readonly obligations: DividendObligationRepositoryPort,
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepositoryPort,
  ) {}

  async request(
    obligationId: string,
    idempotencyScope: string,
    idempotencyKey: string,
    context?: ApplicationTransactionContext,
    correlationId?: string,
  ) {
    const obligation = await this.obligations.findById(obligationId, context);
    if (!obligation) throw new ApplicationNotFoundError('Dividend obligation', obligationId);

    const result = await this.payments.requestForObligation({
      obligationId,
      paymentId: randomUUID(),
      idempotencyScope,
      idempotencyKey,
      requestedAt: new Date(),
      outboxEventId: randomUUID(),
      correlationId,
    }, context);
    return { ...paymentResponse(result.value), replayed: result.replayed };
  }

  async get(paymentId: string, context?: ApplicationTransactionContext) {
    const payment = await this.payments.findById(paymentId, context);
    if (!payment) throw new ApplicationNotFoundError('Payment instruction', paymentId);
    return paymentResponse(payment);
  }
}
