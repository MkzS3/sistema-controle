import { SendMessageCommand, type SQSClient } from '@aws-sdk/client-sqs';
import { EntityManager } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import { SQS_CLIENT } from '../sqs/sqs-client.token.js';
import { loadMessagingConfig } from '../sqs/sqs-config.js';
import { exponentialBackoffSeconds } from '../retry-policy.js';
import { MessagingMetrics } from '../messaging-metrics.js';
import { StructuredLogger } from '../structured-logger.js';
import { safeErrorSummary } from '../safe-error-summary.js';
import { ClaimedOutboxMessage, OutboxRepository } from '../../persistence/repositories/outbox.repository.js';
import { inTransaction } from '../../persistence/repositories/sql.js';

const PUBLISHABLE_EVENT_TYPES = new Set([
  'dividend-obligation.recognized',
  'payment.instruction-recorded',
]);

class PermanentOutboxPublishingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

@Injectable()
export class OutboxPublisherWorker {
  private stopRequested = false;
  private running: Promise<void> | undefined;
  private readonly config = loadMessagingConfig();

  constructor(
    private readonly em: EntityManager,
    private readonly outbox: OutboxRepository,
    @Inject(SQS_CLIENT) private readonly sqs: SQSClient,
    private readonly metrics: MessagingMetrics,
    private readonly logger: StructuredLogger,
  ) {}

  start(eventsQueueUrl: string): void {
    if (this.running) return;
    this.stopRequested = false;
    this.running = this.runLoop(eventsQueueUrl);
  }

  async stop(): Promise<void> {
    this.stopRequested = true;
    await this.running;
    this.running = undefined;
  }

  async publishBatchOnce(eventsQueueUrl: string): Promise<number> {
    const messages = await inTransaction(this.em, (tx) =>
      this.outbox.claimBatch(tx, this.config.outboxBatchSize, this.config.outboxLeaseSeconds));
    this.metrics.increment('outbox_claimed_total', messages.length);
    await Promise.all(messages.map((message) => this.publishOne(eventsQueueUrl, message)));
    return messages.length;
  }

  private async runLoop(eventsQueueUrl: string): Promise<void> {
    this.logger.info('outbox_worker_started', { worker: 'transactional-outbox-publisher' });
    while (!this.stopRequested) {
      try {
        const count = await this.publishBatchOnce(eventsQueueUrl);
        if (count === 0) await this.delay(this.config.pollIntervalMs);
      } catch (error) {
        this.logger.error('outbox_poll_failed', { worker: 'transactional-outbox-publisher', error: this.errorMessage(error) });
        await this.delay(this.config.pollIntervalMs);
      }
    }
    this.logger.info('outbox_worker_stopped', { worker: 'transactional-outbox-publisher' });
  }

  private async publishOne(queueUrl: string, message: ClaimedOutboxMessage): Promise<void> {
    try {
      if (!PUBLISHABLE_EVENT_TYPES.has(message.event_type)) {
        throw new PermanentOutboxPublishingError(`No event queue route is configured for ${message.event_type}.`);
      }
      const correlationId = typeof message.payload.correlationId === 'string'
        ? message.payload.correlationId
        : message.id;
      const body = JSON.stringify({
        messageId: message.id,
        correlationId,
        type: message.event_type,
        aggregateType: message.aggregate_type,
        aggregateId: message.aggregate_id,
        occurredAt: new Date(message.created_at).toISOString(),
        data: message.payload,
      });
      await this.sqs.send(new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: body,
        MessageAttributes: {
          correlationId: { DataType: 'String', StringValue: correlationId },
          eventType: { DataType: 'String', StringValue: message.event_type },
        },
      }));

      const marked = await inTransaction(this.em, (tx) =>
        this.outbox.markPublished(tx, message.id, message.lease_token));
      if (!marked) {
        this.logger.warn('outbox_lease_lost_after_send', {
          worker: 'transactional-outbox-publisher',
          messageId: message.id,
          correlationId,
        });
        return;
      }
      this.metrics.increment('outbox_published_total');
      this.logger.info('outbox_event_published', {
        worker: 'transactional-outbox-publisher',
        messageId: message.id,
        eventType: message.event_type,
        correlationId,
      });
    } catch (error) {
      const errorMessage = this.errorMessage(error);
      if (error instanceof PermanentOutboxPublishingError || message.attempt_count >= this.config.outboxMaxAttempts) {
        const deadLettered = await inTransaction(this.em, (tx) =>
          this.outbox.markDeadLettered(tx, message.id, message.lease_token, errorMessage));
        if (deadLettered) {
          this.metrics.increment('outbox_dead_lettered_total');
          this.logger.error('outbox_event_dead_lettered', {
            worker: 'transactional-outbox-publisher',
            messageId: message.id,
            eventType: message.event_type,
            attempt: message.attempt_count,
            error: errorMessage,
          });
        }
        return;
      }

      const delaySeconds = exponentialBackoffSeconds(
        message.attempt_count,
        this.config.retryBaseSeconds,
        this.config.retryMaxSeconds,
      );
      const released = await inTransaction(this.em, (tx) =>
        this.outbox.releaseForRetry(tx, message.id, message.lease_token, delaySeconds, errorMessage));
      if (released) {
        this.metrics.increment('outbox_retried_total');
        this.logger.warn('outbox_event_retry_scheduled', {
          worker: 'transactional-outbox-publisher',
          messageId: message.id,
          eventType: message.event_type,
          attempt: message.attempt_count,
          delaySeconds,
          error: errorMessage,
        });
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private errorMessage(error: unknown): string {
    return safeErrorSummary(error);
  }
}
