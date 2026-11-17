import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HealthService } from './health.service.js';
import type { ReadinessReport } from './health.types.js';
import { PublicRoute } from '../security/security-metadata.js';

@Controller('health')
@PublicRoute()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<ReadinessReport> {
    const report = await this.healthService.readiness();
    if (report.status === 'error') {
      throw new ServiceUnavailableException(report);
    }

    return report;
  }
}
