import { Module } from '@nestjs/common';
import { ApplicationServicesModule } from '../wiring/application-services.module.js';
import { PersistenceModule } from '../persistence/persistence.module.js';
import { AwsSqsModule } from './sqs/aws-sqs.module.js';
import { OutboxPublisherWorker } from './outbox/outbox-publisher.worker.js';
import { CommandConsumerWorker } from './commands/command-consumer.worker.js';
import { SqsCommandPublisher } from './commands/sqs-command-publisher.js';
import { MessagingMetrics } from './messaging-metrics.js';
import { StructuredLogger } from './structured-logger.js';
import { MessagingWorkersLifecycle } from './messaging-workers.lifecycle.js';
import { MetricsController } from '../../presentation/http/metrics.controller.js';

@Module({
  imports: [ApplicationServicesModule, PersistenceModule, AwsSqsModule],
  controllers: [MetricsController],
  providers: [
    OutboxPublisherWorker,
    CommandConsumerWorker,
    SqsCommandPublisher,
    MessagingWorkersLifecycle,
    { provide: MessagingMetrics, useFactory: () => new MessagingMetrics() },
    { provide: StructuredLogger, useFactory: () => new StructuredLogger() },
  ],
  exports: [SqsCommandPublisher, MessagingMetrics],
})
export class MessagingModule {}
