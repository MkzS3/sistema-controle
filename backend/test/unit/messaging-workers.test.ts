import { describe, expect, test } from 'bun:test';
import { ChangeMessageVisibilityCommand, DeleteMessageCommand, SendMessageCommand, type SQSClient } from '@aws-sdk/client-sqs';
import type { EntityManager } from '@mikro-orm/core';
import { DomainFailureCode, DomainValidationError } from '../../src/domain/shared/errors/domain-error.js';
import { InboxRepository } from '../../src/infrastructure/messaging/inbox/inbox.repository.js';
import { CommandConsumerWorker } from '../../src/infrastructure/messaging/commands/command-consumer.worker.js';
import { SqsCommandPublisher } from '../../src/infrastructure/messaging/commands/sqs-command-publisher.js';
import { SqsQueueManager } from '../../src/infrastructure/messaging/sqs/sqs-queue-manager.js';
import { OutboxPublisherWorker } from '../../src/infrastructure/messaging/outbox/outbox-publisher.worker.js';
import { MessagingMetrics } from '../../src/infrastructure/messaging/messaging-metrics.js';
import { StructuredLogger } from '../../src/infrastructure/messaging/structured-logger.js';
import { OutboxRepository } from '../../src/infrastructure/persistence/repositories/outbox.repository.js';
import { DividendApplicationService } from '../../src/application/use-cases/dividend.application-service.js';
import { ObligationApplicationService } from '../../src/application/use-cases/obligation.application-service.js';
import { PaymentInstructionApplicationService } from '../../src/application/use-cases/payment-instruction.application-service.js';

function transactionManager(): EntityManager {
  const tx = {} as EntityManager;
  return {
    fork: () => ({ transactional: async (work: (manager: EntityManager) => Promise<unknown>) => work(tx) }),
  } as unknown as EntityManager;
}

function sqsClient(send: (command: unknown) => Promise<unknown>): SQSClient {
  return { send } as unknown as SQSClient;
}

function outboxMessage(attemptCount = 1) {
  return {
    id: 'a4a8c0f9-b40a-4a8b-931a-112233445566',
    event_type: 'payment.instruction-recorded',
    aggregate_type: 'DividendObligation',
    aggregate_id: 'obligation-1',
    payload: { paymentId: 'payment-1', correlationId: 'trace-1' },
    attempt_count: attemptCount,
    lease_token: '2f63138e-8243-4a1d-bfb1-995a4a7e8901',
    claimed_until: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
}

describe('messaging workers', () => {
  test('publishes Outbox events to the event queue and marks them only after SQS accepts them', async () => {
    const events: string[] = [];
    const message = outboxMessage();
    const outbox = {
      claimBatch: async () => { events.push('claimed'); return [message]; },
      markPublished: async () => { events.push('marked'); return true; },
      releaseForRetry: async () => { events.push('released'); return true; },
      markDeadLettered: async () => { events.push('dead-lettered'); return true; },
    } as unknown as OutboxRepository;
    const client = sqsClient(async (command) => {
      if (command instanceof SendMessageCommand) {
        events.push('sent');
        expect(command.input.QueueUrl).toBe('events-url');
        expect(JSON.parse(command.input.MessageBody ?? '{}')).toMatchObject({
          messageId: message.id,
          correlationId: 'trace-1',
          type: message.event_type,
        });
      }
      return {};
    });
    const worker = new OutboxPublisherWorker(
      transactionManager(), outbox, client, new MessagingMetrics(), new StructuredLogger(() => {}),
    );

    await worker.publishBatchOnce('events-url');
    expect(events).toEqual(['claimed', 'sent', 'marked']);
  });

  test('schedules transient Outbox failures with backoff and moves exhausted rows to persistent dead-letter state', async () => {
    const message = outboxMessage(1);
    let retryDelay: number | undefined;
    let retryError = '';
    const outbox = {
      claimBatch: async () => [message],
      markPublished: async () => false,
      releaseForRetry: async (_em: unknown, _id: string, _token: string, delay: number, error: string) => { retryDelay = delay; retryError = error; return true; },
      markDeadLettered: async () => true,
    } as unknown as OutboxRepository;
    const worker = new OutboxPublisherWorker(
      transactionManager(), outbox, sqsClient(async () => { throw new Error('temporary SQS failure'); }),
      new MessagingMetrics(), new StructuredLogger(() => {}),
    );
    await worker.publishBatchOnce('events-url');
    expect(retryDelay).toBe(2);
    expect(retryError).toBe('Error; details omitted.');
    expect(retryError).not.toContain('temporary SQS failure');

    let deadLettered = false;
    const exhausted = {
      ...message,
      attempt_count: 10,
    };
    const exhaustedOutbox = {
      claimBatch: async () => [exhausted],
      markPublished: async () => false,
      releaseForRetry: async () => false,
      markDeadLettered: async () => { deadLettered = true; return true; },
    } as unknown as OutboxRepository;
    const exhaustedWorker = new OutboxPublisherWorker(
      transactionManager(), exhaustedOutbox, sqsClient(async () => { throw new Error('permanent route failure'); }),
      new MessagingMetrics(), new StructuredLogger(() => {}),
    );
    await exhaustedWorker.publishBatchOnce('events-url');
    expect(deadLettered).toBe(true);
  });

  test('submits commands only to the command queue and returns broker acceptance id', async () => {
    const client = sqsClient(async (command) => {
      expect(command).toBeInstanceOf(SendMessageCommand);
      const send = command as SendMessageCommand;
      expect(send.input.QueueUrl).toBe('commands-url');
      expect(JSON.parse(send.input.MessageBody ?? '{}').correlationId).toBe('trace-2');
      return { MessageId: 'sqs-accepted' };
    });
    const publisher = new SqsCommandPublisher(client, {
      ensureQueues: async () => ({
        command: 'commands-url', commandDlq: 'commands-dlq-url', events: 'events-url', eventDlq: 'events-dlq-url',
      }),
    } as never);

    await expect(publisher.publish({
      messageId: 'command-2',
      correlationId: 'trace-2',
      type: 'dividend.declare',
      data: { dividendId: 'dividend-2' },
    })).resolves.toEqual({ brokerMessageId: 'sqs-accepted' });
  });

  test('configures isolated SQS redrive policies for command and event destinations', async () => {
    const policies: Record<string, string>[] = [];
    const createNames: string[] = [];
    const client = sqsClient(async (command) => {
      if (command instanceof SendMessageCommand) return {};
      const candidate = command as { input?: { QueueName?: string; QueueUrl?: string; Attributes?: Record<string, string> } };
      if (candidate.input?.QueueName) {
        createNames.push(candidate.input.QueueName);
        return { QueueUrl: `url:${candidate.input.QueueName}` };
      }
      if (candidate.input?.QueueUrl && !candidate.input.Attributes) {
        return { Attributes: { QueueArn: `arn:${candidate.input.QueueUrl.slice(4)}` } };
      }
      if (candidate.input?.Attributes) policies.push(candidate.input.Attributes);
      return {};
    });
    const manager = new SqsQueueManager(client);
    const urls = await manager.ensureQueues();
    await manager.ensureQueues();

    expect(new Set(createNames).size).toBe(4);
    expect(urls.command).toBe('url:dividend-commands');
    expect(urls.events).toBe('url:dividend-events');
    expect(policies).toHaveLength(2);
    expect(JSON.parse(policies[0]?.RedrivePolicy ?? '{}')).toMatchObject({ maxReceiveCount: '5' });
    expect(policies.some((attributes) => attributes.RedrivePolicy?.includes('dividend-commands-dlq'))).toBe(true);
    expect(policies.some((attributes) => attributes.RedrivePolicy?.includes('dividend-events-dlq'))).toBe(true);
  });

  test('acknowledges a command only after the transactional Inbox handler completes', async () => {
    const order: string[] = [];
    const tx = {} as EntityManager;
    const inbox = {
      processOnce: async (_consumer: string, _id: string, _payload: unknown, handler: (manager: EntityManager) => Promise<void>) => {
        await handler(tx);
        order.push('inbox-committed');
        return { processed: true };
      },
    } as unknown as InboxRepository;
    const client = sqsClient(async (command) => {
      if (command instanceof DeleteMessageCommand) order.push('ack');
      return {};
    });
    const dividends = {
      create: async () => { order.push('domain-persisted'); },
      declare: async () => { order.push('domain-persisted'); },
    } as unknown as DividendApplicationService;
    const worker = new CommandConsumerWorker(
      transactionManager(), inbox, dividends,
      {} as ObligationApplicationService, {} as PaymentInstructionApplicationService,
      client, new MessagingMetrics(), new StructuredLogger(() => {}),
    );

    await worker.processMessage('commands-url', {
      MessageId: 'broker-1', ReceiptHandle: 'receipt-1',
      Body: JSON.stringify({ messageId: 'command-1', correlationId: 'trace-1', type: 'dividend.declare', data: { dividendId: 'dividend-1' } }),
      Attributes: { ApproximateReceiveCount: '1' },
    });
    expect(order).toEqual(['domain-persisted', 'inbox-committed', 'ack']);
  });

  test('acknowledges persistent duplicate deliveries without invoking the application handler again', async () => {
    let handlerCalls = 0;
    let acknowledgements = 0;
    const inbox = {
      processOnce: async () => ({ processed: false }),
    } as unknown as InboxRepository;
    const client = sqsClient(async (command) => {
      if (command instanceof DeleteMessageCommand) acknowledgements += 1;
      return {};
    });
    const dividends = {
      declare: async () => { handlerCalls += 1; },
    } as unknown as DividendApplicationService;
    const worker = new CommandConsumerWorker(
      transactionManager(), inbox, dividends,
      {} as ObligationApplicationService, {} as PaymentInstructionApplicationService,
      client, new MessagingMetrics(), new StructuredLogger(() => {}),
    );

    await worker.processMessage('commands-url', {
      MessageId: 'broker-2', ReceiptHandle: 'receipt-2',
      Body: JSON.stringify({ messageId: 'command-1', type: 'dividend.declare', data: { dividendId: 'dividend-1' } }),
    });
    expect(handlerCalls).toBe(0);
    expect(acknowledgements).toBe(1);
  });

  test('backs off transient failures and sends permanent business failures toward configured DLQ redrive', async () => {
    const visibilityTimeouts: number[] = [];
    let acknowledgements = 0;
    const inbox = {
      processOnce: async () => { throw new Error('database connection reset'); },
    } as unknown as InboxRepository;
    const client = sqsClient(async (command) => {
      if (command instanceof ChangeMessageVisibilityCommand) visibilityTimeouts.push(command.input.VisibilityTimeout ?? -1);
      if (command instanceof DeleteMessageCommand) acknowledgements += 1;
      return {};
    });
    const worker = new CommandConsumerWorker(
      transactionManager(), inbox, {} as DividendApplicationService,
      {} as ObligationApplicationService, {} as PaymentInstructionApplicationService,
      client, new MessagingMetrics(), new StructuredLogger(() => {}),
    );
    const message = {
      MessageId: 'broker-3', ReceiptHandle: 'receipt-3',
      Body: JSON.stringify({ messageId: 'command-3', type: 'dividend.declare', data: { dividendId: 'dividend-3' } }),
      Attributes: { ApproximateReceiveCount: '3' },
    };
    await worker.processMessage('commands-url', message);
    expect(visibilityTimeouts.at(-1)).toBe(8);
    expect(acknowledgements).toBe(0);

    const businessFailureInbox = {
      processOnce: async () => {
        throw new DomainValidationError(DomainFailureCode.InvalidDividendTerms, 'Invalid request.');
      },
    } as unknown as InboxRepository;
    const businessWorker = new CommandConsumerWorker(
      transactionManager(), businessFailureInbox, {} as DividendApplicationService,
      {} as ObligationApplicationService, {} as PaymentInstructionApplicationService,
      client, new MessagingMetrics(), new StructuredLogger(() => {}),
    );
    await businessWorker.processMessage('commands-url', message);
    expect(visibilityTimeouts.at(-1)).toBe(0);
  });
});
