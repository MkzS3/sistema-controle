import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { DividendApplicationService } from '../../../application/use-cases/dividend.application-service.js';
import { ObligationApplicationService } from '../../../application/use-cases/obligation.application-service.js';
import { DividendReadApplicationService } from '../../../application/use-cases/read.application-services.js';
import { DIVIDEND_STATUSES, parseOptionalEnum, parseOptionalText, parsePageQuery } from './read-query.js';
import { AuditAction, RequirePermission } from '../security/security-metadata.js';

@Controller('dividends')
export class DividendsController {
  constructor(
    private readonly dividends: DividendApplicationService,
    private readonly obligations: ObligationApplicationService,
    private readonly reads: DividendReadApplicationService,
  ) {}

  @Get()
  @RequirePermission('dividends:read')
  list(@Query() query: Record<string, unknown>) {
    return this.reads.list({
      ...parsePageQuery(query),
      query: parseOptionalText(query.query, 'query'),
      status: parseOptionalEnum(query.status, 'status', DIVIDEND_STATUSES),
    });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('dividends:create')
  @AuditAction('dividend.create', 'dividend')
  create(@Body() body: unknown) {
    return this.dividends.create(body);
  }

  @Get(':id')
  @RequirePermission('dividends:read')
  get(@Param('id') id: string) {
    return this.dividends.get(id);
  }

  @Post(':id/declare')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('dividends:declare')
  @AuditAction('dividend.declare', 'dividend')
  declare(@Param('id') id: string) {
    return this.dividends.declare(id);
  }

  @Post(':id/obligations')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('obligations:create')
  @AuditAction('obligation.create', 'obligation')
  createObligation(@Param('id') id: string, @Body() body: unknown) {
    return this.obligations.createForDividend(id, body);
  }
}
