import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { BeneficiaryApplicationService } from '../../../application/use-cases/beneficiary.application-service.js';
import { BeneficiaryReadApplicationService } from '../../../application/use-cases/read.application-services.js';
import { parseOptionalText, parsePageQuery } from './read-query.js';
import { AuditAction, RequirePermission } from '../security/security-metadata.js';

@Controller('beneficiaries')
export class BeneficiariesController {
  constructor(private readonly service: BeneficiaryApplicationService, private readonly reads: BeneficiaryReadApplicationService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('beneficiaries:create')
  @AuditAction('beneficiary.create', 'beneficiary')
  create() {
    return this.service.create();
  }

  @Get()
  @RequirePermission('beneficiaries:read')
  list(@Query() query: Record<string, unknown>) {
    return this.reads.list({ ...parsePageQuery(query), query: parseOptionalText(query.query, 'query') });
  }

  @Get(':id')
  @RequirePermission('beneficiaries:read')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }
}
