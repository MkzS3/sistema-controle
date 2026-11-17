import { ListQueuesCommand, type SQSClient } from '@aws-sdk/client-sqs';
import { MikroORM } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import { SQS_CLIENT } from '../../../infrastructure/messaging/sqs/sqs-client.token.js';
import type { ReadinessReport } from './health.types.js';

@Injectable()
export class HealthService {
  constructor(
    private readonly orm: MikroORM,
    @Inject(SQS_CLIENT) private readonly sqs: SQSClient,
  ) {}

  async readiness(): Promise<ReadinessReport> {
    const [databaseResult, sqsResult] = await Promise.allSettled([
      this.orm.checkConnection(),
      this.sqs.send(new ListQueuesCommand({ MaxResults: 1 })),
    ]);

    const postgres: ReadinessReport['checks']['postgres'] =
      databaseResult.status === 'fulfilled' && databaseResult.value.ok
        ? 'up'
        : 'down';
    const sqs: ReadinessReport['checks']['sqs'] =
      sqsResult.status === 'fulfilled' ? 'up' : 'down';

    return {
      status: postgres === 'up' && sqs === 'up' ? 'ok' : 'error',
      checks: { postgres, sqs },
    };
  }
}
