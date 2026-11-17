import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { PaymentInstructionApplicationService } from '../../../application/use-cases/payment-instruction.application-service.js';
import { requiredString } from '../../../application/use-cases/request-validation.js';
import { AuditAction, RequirePermission } from '../security/security-metadata.js';
import type { SecuredRequest } from '../security/security.types.js';
import { effectiveIdempotencyScope } from '../security/idempotency-scope.js';

@Controller('obligations')
export class PaymentInstructionsController {
  constructor(private readonly payments: PaymentInstructionApplicationService) {}

  @Post(':id/payment-instructions')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('payments:request')
  @AuditAction('payment_instruction.request', 'payment_instruction')
  request(
    @Param('id') obligationId: string,
    @Headers('idempotency-scope') idempotencyScope: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: SecuredRequest,
  ) {
    const effectiveScope = effectiveIdempotencyScope(request, idempotencyScope);
    return this.payments.request(
      obligationId,
      effectiveScope,
      requiredString(idempotencyKey, 'Idempotency-Key'),
    );
  }
}
