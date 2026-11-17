import { BeforeApplicationShutdown, Injectable, OnModuleInit } from '@nestjs/common';
import { loadMessagingConfig } from './sqs/sqs-config.js';
import { SqsQueueManager } from './sqs/sqs-queue-manager.js';
import { CommandConsumerWorker } from './commands/command-consumer.worker.js';
import { OutboxPublisherWorker } from './outbox/outbox-publisher.worker.js';
import { StructuredLogger } from './structured-logger.js';

@Injectable()
export class MessagingWorkersLifecycle implements OnModuleInit, BeforeApplicationShutdown {
  private enabled = false;

  constructor(
    private readonly queues: SqsQueueManager,
    private readonly commandConsumer: CommandConsumerWorker,
    private readonly outboxPublisher: OutboxPublisherWorker,
    private readonly logger: StructuredLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    this.enabled = process.env.WORKERS_ENABLED === 'true';
    if (!this.enabled) {
      this.logger.info('messaging_workers_disabled', { worker: 'messaging' });
      return;
    }

    const urls = await this.queues.ensureQueues();
    this.outboxPublisher.start(urls.events);
    this.commandConsumer.start(urls.command);
    this.logger.info('messaging_workers_enabled', { worker: 'messaging' });
  }

  async beforeApplicationShutdown(signal?: string): Promise<void> {
    if (!this.enabled) return;
    this.logger.info('messaging_workers_stopping', { worker: 'messaging', signal: signal ?? 'unknown' });
    await Promise.all([this.commandConsumer.stop(), this.outboxPublisher.stop()]);
    this.logger.info('messaging_workers_stopped', { worker: 'messaging' });
  }
}
