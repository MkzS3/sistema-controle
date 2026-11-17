import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Beneficiary } from '../../domain/beneficiaries/beneficiary.js';
import { ApplicationNotFoundError } from '../errors/application-error.js';
import {
  BENEFICIARY_REPOSITORY,
  type ApplicationTransactionContext,
  type BeneficiaryRepositoryPort,
} from '../ports/persistence.ports.js';
import { beneficiaryResponse } from '../serializers/domain-serializers.js';

@Injectable()
export class BeneficiaryApplicationService {
  constructor(
    @Inject(BENEFICIARY_REPOSITORY) private readonly beneficiaries: BeneficiaryRepositoryPort,
  ) {}

  async create(context?: ApplicationTransactionContext) {
    const beneficiary = Beneficiary.create({ id: randomUUID(), createdAt: new Date() });
    await this.beneficiaries.create(beneficiary, context);
    return beneficiaryResponse(beneficiary);
  }

  async get(id: string, context?: ApplicationTransactionContext) {
    const beneficiary = await this.beneficiaries.findById(id, context);
    if (!beneficiary) throw new ApplicationNotFoundError('Beneficiary', id);
    return beneficiaryResponse(beneficiary);
  }
}
