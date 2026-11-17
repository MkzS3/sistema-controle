import { Controller, Get } from '@nestjs/common';
import { DashboardReadApplicationService } from '../../../application/use-cases/read.application-services.js';
import { RequirePermission } from '../security/security-metadata.js';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardReadApplicationService) {}

  @Get('summary')
  @RequirePermission('dashboard:read')
  summary() {
    return this.dashboard.getSummary();
  }
}
