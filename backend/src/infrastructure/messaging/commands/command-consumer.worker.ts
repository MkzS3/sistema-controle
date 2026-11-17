import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  type Message,
  type SQSClient,
} from '@aws-sdk/client-sqs';
import { EntityManager } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import { ApplicationInputError, ApplicationNotFoundError } from '../../../application/errors/application-error.js';
import type { ApplicationTransactionContext } from '../../../application/ports/persistence.ports.js';
import { DividendApplicationService } from '../../../application/use-cases/dividend.application-service.js';
import { ObligationApplicationService } from '../../../application/use-cases/obligation.application-service.js';
import { PaymentInstructionApplicationService } from '../../../application/use-cases/payment-instruction.application-service.js';
import { DomainError } from '../../../domain/shared/errors/domain-error.js';
import { InboxRepository } from '../inbox/inbox.repository.js';
import { InboxPayloadConflictError, IdempotencyPayloadConflictError, PersistenceInvariantError } from '../../persistence/repositories/persistence-errors.js';
import { SQS_CLIENT } from '../sqs/sqs-client.token.js';
import { loadMessagingConfig } from '../sqs/sqs-config.js';
import { exponentialBackoffSeconds, type ProcessingFailureKind } from '../retry-policy.js';
import { MessagingMetrics } from '../messaging-metrics.js';
import { StructuredLogger } from '../structured-logger.js';
import { safeErrorSummary } from '../safe-error-summary.js';
import { InvalidCommandMessageError, parseDividendCommand, requiredCommandString } from './command-envelope.js';

export const DIVIDEND_COMMAND_CONSUMER = 'dividend-command-consumer-v1';

@Injectable()
export class CommandConsumerWorker {
  private stopRequested = false;
  private running: Promise<void> | undefined;
  private readonly config = loadMessagingConfig();

  constructor(
    private readonly em: EntityManager,
    private readonly inbox: InboxRepository,
    private readonly dividends: DividendApplicationService,
    private readonly obligations: ObligationApplicationService,
    private readonly payments: PaymentInstructionApplicationService,
    @Inject(SQS_CLIENT) private readonly sqs: SQSClient,
    private readonly metrics: MessagingMetrics,
    private readonly logger: StructuredLogger,
  ) {}

  start(commandQueueUrl: string): void {
    if (this.running) return;
    this.stopRequested = false;
    this.running = this.runLoop(commandQueueUrl);
  }

  async stop(): Promise<void> {
    this.stopRequested = true;
    await this.running;
    this.running = undefined;
  }

  async receiveBatchOnce(commandQueueUrl: string): Promise<number> {
    const response = await this.sqs.send(new ReceiveMessageCommand({
      QueueUrl: commandQueueUrl,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 20,
      VisibilityTimeout: this.config.visibilityTimeoutSeconds,
      MessageSystemAttributeNames: ['ApproximateReceiveCount'],
    }));
    const messages = response.Messages ?? [];
    await Promise.all(messages.map((message) => this.processMessage(commandQueueUrl, message)));
    return messages.length;
  }

  async processMessage(commandQueueUrl: string, message: Message): Promise<void> {
    const startedAt = Date.now();
    const brokerMessageId = message.MessageId ?? 'unknown';
    let correlationId = brokerMessageId;
    this.metrics.increment('sqs_received_total');

    try {
      if (!message.Body) throw new InvalidCommandMessageError('SQS command message has no body.');
      const envelope = parseDividendCommand(message.Body);
      correlationId = envelope.correlationId;
      const contextFromInbox = async (transactionalEm: EntityManager): Promise<void> => {
        const context: ApplicationTransactionContext = { persistenceContext: transactionalEm };
        await this.dispatch(envelope.type, envelope.data, context, envelope.correlationId);
      };
      const result = await this.inbox.processOnce(
        DIVIDEND_COMMAND_CONSUMER,
        envelope.messageId,
        envelope,
        contextFromInbox,
      );

      if (result.processed) {
        this.metrics.increment('sqs_processed_total');
        this.logger.info('command_processed', {
          worker: DIVIDEND_COMMAND_CONSUMER,
          messageId: envelope.messageId,
          commandType: envelope.type,
          correlationId,
        });
      } else {
        this.metrics.increment('sqs_duplicate_total');
        this.logger.info('command_duplicate_acknowledged', {
          worker: DIVIDEND_COMMAND_CONSUMER,
          messageId: envelope.messageId,
          commandType: envelope.type,
          correlationId,
        });
      }

      if (message.ReceiptHandle) {
        try {
          await this.sqs.send(new DeleteMessageCommand({
            QueueUrl: commandQueueUrl,
            ReceiptHandle: message.ReceiptHandle,
          }));
        } catch (error) {
          this.metrics.increment('sqs_ack_failure_total');
          this.logger.error('command_ack_failed_after_commit', {
            worker: DIVIDEND_COMMAND_CONSUMER,
            messageId: envelope.messageId,
            correlationId,
            error: this.errorMessage(error),
          });
          // Leave it unacknowledged; a later delivery will hit the persistent Inbox and be harmless.
        }
      }
    } catch (error) {
      const kind = this.classify(error);
      const attempt = this.receiveCount(message);
      const delaySeconds = kind === 'TRANSIENT'
        ? exponentialBackoffSeconds(attempt, this.config.retryBaseSeconds, this.config.retryMaxSeconds)
        : 0;
      if (kind !== 'TRANSIENT') this.metrics.increment('sqs_permanent_failure_total');
      else this.metrics.increment('sqs_retried_total');

      if (message.ReceiptHandle) {
        try {
          await this.sqs.send(new ChangeMessageVisibilityCommand({
            QueueUrl: commandQueueUrl,
            ReceiptHandle: message.ReceiptHandle,
            VisibilityTimeout: delaySeconds,
          }));
        } catch (visibilityError) {
          this.logger.error('command_retry_visibility_update_failed', {
            worker: DIVIDEND_COMMAND_CONSUMER,
            messageId: brokerMessageId,
            correlationId,
            error: this.errorMessage(visibilityError),
          });
          // The queue's configured default visibility remains the fallback.
        }
      }
      this.logger.warn('command_processing_failed', {
        worker: DIVIDEND_COMMAND_CONSUMER,
        messageId: brokerMessageId,
        correlationId,
        attempt,
        failureKind: kind,
        retryDelaySeconds: delaySeconds,
        errorCode: this.errorCode(error),
        error: this.errorMessage(error),
      });
    } finally {
      this.metrics.observeProcessingDuration((Date.now() - startedAt) / 1000);
    }
  }

  private async dispatch(
    type: ReturnType<typeof parseDividendCommand>['type'],
    data: Record<string, unknown>,
    context: ApplicationTransactionContext,
    correlationId: string,
  ): Promise<void> {
    switch (type) {
      case 'dividend.create': {
        const dividendId = requiredCommandString(data, 'dividendId');
        await this.dividends.create({ currency: data.currency, terms: data.terms }, context, dividendId);
        return;
      }
      case 'dividend.declare':
        await this.dividends.declare(requiredCommandString(data, 'dividendId'), context);
        return;
      case 'dividend-obligation.create':
        await this.obligations.createForDividend(
          requiredCommandString(data, 'dividendId'),
          { beneficiaryId: data.beneficiaryId, amount: data.amount },
          context,
          correlationId,
        );
        return;
      case 'payment-instruction.request':
        await this.payments.request(
          requiredCommandString(data, 'obligationId'),
          'sqs:payment-instruction',
          requiredCommandString(data, 'idempotencyKey'),
          context,
          correlationId,
        );
        return;
      default: {
        const unreachable: never = type;
        throw new InvalidCommandMessageError(`Unsupported command type ${unreachable}.`);
      }
    }
  }

  private classify(error: unknown): ProcessingFailureKind {
    if (error instanceof InvalidCommandMessageError) return 'PERMANENT';
    if (
      error instanceof ApplicationInputError ||
      error instanceof ApplicationNotFoundError ||
      error instanceof DomainError ||
      error instanceof InboxPayloadConflictError ||
      error instanceof IdempotencyPayloadConflictError ||
      error instanceof PersistenceInvariantError
    ) return 'BUSINESS';
    const databaseCode = this.databaseErrorCode(error);
    if (databaseCode?.startsWith('23')) return 'BUSINESS';
    return 'TRANSIENT';
  }

  private databaseErrorCode(error: unknown): string | undefined {
    if (error === null || typeof error !== 'object') return undefined;
    const candidate = error as { code?: unknown; cause?: unknown };
    if (typeof candidate.code === 'string') return candidate.code;
    if (candidate.cause && candidate.cause !== error) return this.databaseErrorCode(candidate.cause);
    return undefined;
  }

  private receiveCount(message: Message): number {
    const value = message.Attributes?.ApproximateReceiveCount;
    const count = Number(value ?? 1);
    return Number.isSafeInteger(count) && count > 0 ? count : 1;
  }

  private errorMessage(error: unknown): string {
    return safeErrorSummary(error);
  }

  private errorCode(error: unknown): string {
    if (error instanceof DomainError) return error.code;
    if (error instanceof ApplicationInputError) return error.code;
    if (error instanceof Error) return error.name;
    return 'UNKNOWN_ERROR';
  }

  private async runLoop(commandQueueUrl: string): Promise<void> {
    this.logger.info('command_consumer_started', { worker: DIVIDEND_COMMAND_CONSUMER });
    while (!this.stopRequested) {
      try {
        const received = await this.receiveBatchOnce(commandQueueUrl);
        if (received === 0) continue;
      } catch (error) {
        if (!this.stopRequested) {
          this.logger.error('command_receive_failed', {
            worker: DIVIDEND_COMMAND_CONSUMER,
            error: this.errorMessage(error),
          });
          await new Promise<void>((resolve) => setTimeout(resolve, this.config.pollIntervalMs));
        }
      }
    }
    this.logger.info('command_consumer_stopped', { worker: DIVIDEND_COMMAND_CONSUMER });
  }
}
