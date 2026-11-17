import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DomainFailureCode, DomainValidationError } from '../../domain/shared/errors/domain-error.js';
import { Money } from '../../domain/shared/value-objects/money.js';
import { ApplicationNotFoundError } from '../errors/application-error.js';
import {
  BENEFICIARY_REPOSITORY,
  DIVIDEND_OBLIGATION_REPOSITORY,
  DIVIDEND_REPOSITORY,
  type ApplicationTransactionContext,
  type BeneficiaryRepositoryPort,
  type DividendObligationRepositoryPort,
  type DividendRepositoryPort,
} from '../ports/persistence.ports.js';
import { obligationResponse } from '../serializers/domain-serializers.js';
import { requestObject, requiredString } from './request-validation.js';

function obligationMoney(amount: unknown, currency: string): Money {
  const decimal = requiredString(amount, 'amount');
  if (currency !== 'BRL') {
    throw new DomainValidationError(DomainFailureCode.InvalidCurrency, 'Only BRL is enabled for persistence.');
  }
  const money = Money.from({ amount: decimal, currency });
  const fractionalDigits = money.toString().split('.')[1]?.length ?? 0;
  if (fractionalDigits > 2) {
    throw new DomainValidationError(
      DomainFailureCode.InvalidMoneyAmount,
      'BRL obligation amounts may have at most two decimal places.',
    );
  }
  return money;
}

@Injectable()
export class ObligationApplicationService {
  constructor(
    @Inject(DIVIDEND_REPOSITORY) private readonly dividends: DividendRepositoryPort,
    @Inject(BENEFICIARY_REPOSITORY) private readonly beneficiaries: BeneficiaryRepositoryPort,
    @Inject(DIVIDEND_OBLIGATION_REPOSITORY) private readonly obligations: DividendObligationRepositoryPort,
  ) {}

  async createForDividend(
    dividendId: string,
    body: unknown,
    context?: ApplicationTransactionContext,
    correlationId?: string,
  ) {
    const request = requestObject(body);
    const beneficiaryId = requiredString(request.beneficiaryId, 'beneficiaryId');
    const dividend = await this.dividends.findById(dividendId, context);
    if (!dividend) throw new ApplicationNotFoundError('Dividend', dividendId);
    const beneficiary = await this.beneficiaries.findById(beneficiaryId, context);
    if (!beneficiary) throw new ApplicationNotFoundError('Beneficiary', beneficiaryId);

    const obligation = dividend.issueObligation({
      id: randomUUID(),
      beneficiary,
      amount: obligationMoney(request.amount, dividend.currency),
      createdAt: new Date(),
    });
    const persisted = await this.obligations.create(obligation, {
      ledgerEntryId: randomUUID(),
      outboxEventId: randomUUID(),
      correlationId,
    }, context);
    return obligationResponse(persisted);
  }

  async get(id: string, context?: ApplicationTransactionContext) {
    const obligation = await this.obligations.findById(id, context);
    if (!obligation) throw new ApplicationNotFoundError('Dividend obligation', id);
    return obligationResponse(obligation);
  }
}
