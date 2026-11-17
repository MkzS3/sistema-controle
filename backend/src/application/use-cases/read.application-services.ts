import { Inject, Injectable } from '@nestjs/common';
import {
  BENEFICIARY_READ_REPOSITORY,
  DASHBOARD_READ_REPOSITORY,
  DIVIDEND_READ_REPOSITORY,
  LEDGER_READ_REPOSITORY,
  OBLIGATION_READ_REPOSITORY,
  PAYMENT_READ_REPOSITORY,
  type BeneficiaryListQuery,
  type BeneficiaryReadRepositoryPort,
  type DashboardReadRepositoryPort,
  type DividendListQuery,
  type DividendReadRepositoryPort,
  type LedgerListQuery,
  type LedgerReadRepositoryPort,
  type ObligationListQuery,
  type ObligationReadRepositoryPort,
  type Page,
  type PaymentListQuery,
  type PaymentReadRepositoryPort,
} from '../ports/read-model.ports.js';
import { beneficiaryResponse, dividendResponse, ledgerEntryResponse, obligationResponse, paymentResponse } from '../serializers/domain-serializers.js';

function serializePage<T, R>(page: Page<T>, serialize: (item: T) => R) {
  return { ...page, items: page.items.map(serialize) };
}

@Injectable()
export class BeneficiaryReadApplicationService {
  constructor(@Inject(BENEFICIARY_READ_REPOSITORY) private readonly repository: BeneficiaryReadRepositoryPort) {}
  async list(query: BeneficiaryListQuery) { return serializePage(await this.repository.list(query), beneficiaryResponse); }
}

@Injectable()
export class DividendReadApplicationService {
  constructor(@Inject(DIVIDEND_READ_REPOSITORY) private readonly repository: DividendReadRepositoryPort) {}
  async list(query: DividendListQuery) { return serializePage(await this.repository.list(query), dividendResponse); }
}

@Injectable()
export class ObligationReadApplicationService {
  constructor(@Inject(OBLIGATION_READ_REPOSITORY) private readonly repository: ObligationReadRepositoryPort) {}
  async list(query: ObligationListQuery) { return serializePage(await this.repository.list(query), obligationResponse); }
}

@Injectable()
export class PaymentReadApplicationService {
  constructor(@Inject(PAYMENT_READ_REPOSITORY) private readonly repository: PaymentReadRepositoryPort) {}
  async list(query: PaymentListQuery) {
    const page = await this.repository.list(query);
    return { ...page, items: page.items.map(({ payment, obligationStatus }) => ({ ...paymentResponse(payment), obligationStatus })) };
  }
}

@Injectable()
export class LedgerReadApplicationService {
  constructor(@Inject(LEDGER_READ_REPOSITORY) private readonly repository: LedgerReadRepositoryPort) {}
  async list(query: LedgerListQuery) { return serializePage(await this.repository.list(query), ledgerEntryResponse); }
}

@Injectable()
export class DashboardReadApplicationService {
  constructor(@Inject(DASHBOARD_READ_REPOSITORY) private readonly repository: DashboardReadRepositoryPort) {}
  getSummary() { return this.repository.getSummary(); }
}

