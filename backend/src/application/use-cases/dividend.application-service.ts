import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Dividend, type DividendTerms } from '../../domain/dividends/dividend.js';
import { DomainFailureCode, DomainValidationError } from '../../domain/shared/errors/domain-error.js';
import { Money } from '../../domain/shared/value-objects/money.js';
import { ApplicationNotFoundError } from '../errors/application-error.js';
import {
  DIVIDEND_REPOSITORY,
  type ApplicationTransactionContext,
  type DividendRepositoryPort,
} from '../ports/persistence.ports.js';
import { dividendResponse } from '../serializers/domain-serializers.js';
import { requestObject, requiredString } from './request-validation.js';

function parseTerms(value: unknown, currency: string): DividendTerms {
  const terms = requestObject(value, 'terms');
  if (terms.kind === 'FIXED_AMOUNT') {
    const amount = requiredString(terms.amount, 'terms.amount');
    const money = Money.from({ amount, currency });
    if ((money.toString().split('.')[1]?.length ?? 0) > 2) {
      throw new DomainValidationError(
        DomainFailureCode.InvalidMoneyAmount,
        'BRL dividend declarations may have at most two decimal places.',
      );
    }
    return { kind: 'FIXED_AMOUNT', amount: money };
  }

  if (terms.kind === 'PARAMETERS') {
    const parameters = requestObject(terms.parameters, 'terms.parameters');
    const parsed: Record<string, string> = Object.create(null) as Record<string, string>;
    for (const [key, parameterValue] of Object.entries(parameters)) {
      if (typeof parameterValue !== 'string') {
        throw new DomainValidationError(
          DomainFailureCode.InvalidDividendTerms,
          `Dividend parameter ${key} must be a string.`,
        );
      }
      parsed[key] = parameterValue;
    }
    return { kind: 'PARAMETERS', parameters: parsed };
  }

  throw new DomainValidationError(
    DomainFailureCode.InvalidDividendTerms,
    'terms.kind must be FIXED_AMOUNT or PARAMETERS.',
  );
}

@Injectable()
export class DividendApplicationService {
  constructor(
    @Inject(DIVIDEND_REPOSITORY) private readonly dividends: DividendRepositoryPort,
  ) {}

  async create(body: unknown, context?: ApplicationTransactionContext, id: string = randomUUID()) {
    const request = requestObject(body);
    const currency = requiredString(request.currency, 'currency');
    if (currency !== 'BRL') {
      throw new DomainValidationError(DomainFailureCode.InvalidCurrency, 'Only BRL is enabled for persistence.');
    }
    const terms = parseTerms(request.terms, currency);
    const dividend = Dividend.create({ id, currency, terms, createdAt: new Date() });
    await this.dividends.create(dividend, context);
    return dividendResponse(dividend);
  }

  async get(id: string, context?: ApplicationTransactionContext) {
    const dividend = await this.dividends.findById(id, context);
    if (!dividend) throw new ApplicationNotFoundError('Dividend', id);
    return dividendResponse(dividend);
  }

  async declare(id: string, context?: ApplicationTransactionContext) {
    const dividend = await this.dividends.declare(id, new Date(), context);
    if (!dividend) throw new ApplicationNotFoundError('Dividend', id);
    return dividendResponse(dividend);
  }
}
