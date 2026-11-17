import { Module, OnApplicationShutdown, Inject, Injectable } from '@nestjs/common';
import type { SQSClient } from '@aws-sdk/client-sqs';
import { createSqsClient } from './sqs-client.provider.js';
import { SQS_CLIENT } from './sqs-client.token.js';
import { SqsQueueManager } from './sqs-queue-manager.js';

@Injectable()
class SqsClientLifecycle implements OnApplicationShutdown {
  constructor(@Inject(SQS_CLIENT) private readonly client: SQSClient) {}

  onApplicationShutdown(): void {
    this.client.destroy();
  }
}

@Module({
  providers: [
    { provide: SQS_CLIENT, useFactory: createSqsClient },
    SqsQueueManager,
    SqsClientLifecycle,
  ],
  exports: [SQS_CLIENT, SqsQueueManager],
})
export class AwsSqsModule {}
