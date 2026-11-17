import { Module } from '@nestjs/common';
import { AwsSqsModule } from '../../../infrastructure/messaging/sqs/aws-sqs.module.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

@Module({
  imports: [AwsSqsModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
