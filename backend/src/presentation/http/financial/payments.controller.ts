import { Controller, Get, Param, Query } from '@nestjs/common';
import { PaymentInstructionApplicationService } from '../../../application/use-cases/payment-instruction.application-service.js';
import { PaymentReadApplicationService } from '../../../application/use-cases/read.application-services.js';
import { OBLIGATION_STATUSES, parseOptionalEnum, parsePageQuery } from './read-query.js';
import { RequirePermission } from '../security/security-metadata.js';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentInstructionApplicationService, private readonly reads: PaymentReadApplicationService) {}

  @Get()
  @RequirePermission('payments:read')
  list(@Query() query: Record<string, unknown>) {
    return this.reads.list({
      ...parsePageQuery(query),
      obligationStatus: parseOptionalEnum(query.obligationStatus, 'obligationStatus', OBLIGATION_STATUSES),
    });
  }

  @Get(':id')
  @RequirePermission('payments:read')
  get(@Param('id') id: string) {
    return this.payments.get(id);
  }
}
