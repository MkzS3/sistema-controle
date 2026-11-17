import { Controller, Get, Param, Query } from '@nestjs/common';
import { LedgerApplicationService } from '../../../application/use-cases/ledger.application-service.js';
import { LedgerReadApplicationService } from '../../../application/use-cases/read.application-services.js';
import { LEDGER_KINDS, parseOptionalEnum, parseOptionalText, parsePageQuery } from './read-query.js';
import { RequirePermission } from '../security/security-metadata.js';

@Controller('ledger')
export class LedgerController {
  constructor(private readonly ledger: LedgerApplicationService, private readonly reads: LedgerReadApplicationService) {}

  @Get()
  @RequirePermission('ledger:read')
  list(@Query() query: Record<string, unknown>) {
    return this.reads.list({
      ...parsePageQuery(query),
      kind: parseOptionalEnum(query.kind, 'kind', LEDGER_KINDS),
      obligationId: parseOptionalText(query.obligationId, 'obligationId'),
    });
  }

  @Get(':id')
  @RequirePermission('ledger:read')
  get(@Param('id') id: string) {
    return this.ledger.get(id);
  }
}
