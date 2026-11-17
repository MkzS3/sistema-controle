import { Controller, Get, Header } from '@nestjs/common';
import { MessagingMetrics } from '../../infrastructure/messaging/messaging-metrics.js';
import { RequirePermission } from './security/security-metadata.js';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MessagingMetrics) {}

  @Get()
  @RequirePermission('system:metrics:read')
  @Header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
  getMetrics(): string {
    return this.metrics.toPrometheusText();
  }
}
