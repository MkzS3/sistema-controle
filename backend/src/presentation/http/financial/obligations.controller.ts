import { Controller, Get, Param, Query } from '@nestjs/common';
import { ObligationApplicationService } from '../../../application/use-cases/obligation.application-service.js';
import { ObligationReadApplicationService } from '../../../application/use-cases/read.application-services.js';
import { OBLIGATION_STATUSES, parseOptionalEnum, parseOptionalText, parsePageQuery } from './read-query.js';
import { RequirePermission } from '../security/security-metadata.js';

@Controller('obligations')
export class ObligationsController {
  constructor(private readonly obligations: ObligationApplicationService, private readonly reads: ObligationReadApplicationService) {}

  @Get()
  @RequirePermission('obligations:read')
  list(@Query() query: Record<string, unknown>) {
    return this.reads.list({
      ...parsePageQuery(query),
      status: parseOptionalEnum(query.status, 'status', OBLIGATION_STATUSES),
      dividendId: parseOptionalText(query.dividendId, 'dividendId'),
      beneficiaryId: parseOptionalText(query.beneficiaryId, 'beneficiaryId'),
    });
  }

  @Get(':id')
  @RequirePermission('obligations:read')
  get(@Param('id') id: string) {
    return this.obligations.get(id);
  }
}
