import { Module } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import {
  BENEFICIARY_REPOSITORY,
  DIVIDEND_OBLIGATION_REPOSITORY,
  DIVIDEND_REPOSITORY,
  LEDGER_ENTRY_REPOSITORY,
  PAYMENT_REPOSITORY,
} from '../../application/ports/persistence.ports.js';
import {
  BENEFICIARY_READ_REPOSITORY,
  DASHBOARD_READ_REPOSITORY,
  DIVIDEND_READ_REPOSITORY,
  LEDGER_READ_REPOSITORY,
  OBLIGATION_READ_REPOSITORY,
  PAYMENT_READ_REPOSITORY,
} from '../../application/ports/read-model.ports.js';
import { InboxRepository } from '../messaging/inbox/inbox.repository.js';
import { BeneficiaryRepository } from './repositories/beneficiary.repository.js';
import { DividendObligationRepository } from './repositories/dividend-obligation.repository.js';
import { DividendRepository } from './repositories/dividend.repository.js';
import { IdempotencyRepository } from './repositories/idempotency.repository.js';
import { LedgerEntryRepository } from './repositories/ledger-entry.repository.js';
import { OutboxRepository } from './repositories/outbox.repository.js';
import { PaymentRepository } from './repositories/payment.repository.js';
import { AdminReadRepository } from './repositories/admin-read.repository.js';

@Module({
  providers: [
    {
      provide: BeneficiaryRepository,
      useFactory: (em: EntityManager) => new BeneficiaryRepository(em),
      inject: [EntityManager],
    },
    {
      provide: DividendRepository,
      useFactory: (em: EntityManager) => new DividendRepository(em),
      inject: [EntityManager],
    },
    {
      provide: DividendObligationRepository,
      useFactory: (em: EntityManager) => new DividendObligationRepository(em),
      inject: [EntityManager],
    },
    {
      provide: PaymentRepository,
      useFactory: (em: EntityManager) => new PaymentRepository(em),
      inject: [EntityManager],
    },
    { provide: DIVIDEND_REPOSITORY, useExisting: DividendRepository },
    { provide: BENEFICIARY_REPOSITORY, useExisting: BeneficiaryRepository },
    { provide: DIVIDEND_OBLIGATION_REPOSITORY, useExisting: DividendObligationRepository },
    { provide: PAYMENT_REPOSITORY, useExisting: PaymentRepository },
    {
      provide: IdempotencyRepository,
      useFactory: (em: EntityManager) => new IdempotencyRepository(em),
      inject: [EntityManager],
    },
    {
      provide: InboxRepository,
      useFactory: (em: EntityManager) => new InboxRepository(em),
      inject: [EntityManager],
    },
    {
      provide: LedgerEntryRepository,
      useFactory: (em: EntityManager) => new LedgerEntryRepository(em),
      inject: [EntityManager],
    },
    { provide: LEDGER_ENTRY_REPOSITORY, useExisting: LedgerEntryRepository },
    {
      provide: BENEFICIARY_READ_REPOSITORY,
      useFactory: (em: EntityManager) => ({ list: (query: Parameters<AdminReadRepository['listBeneficiaries']>[0]) => new AdminReadRepository(em).listBeneficiaries(query) }),
      inject: [EntityManager],
    },
    {
      provide: DIVIDEND_READ_REPOSITORY,
      useFactory: (em: EntityManager) => ({ list: (query: Parameters<AdminReadRepository['listDividends']>[0]) => new AdminReadRepository(em).listDividends(query) }),
      inject: [EntityManager],
    },
    {
      provide: OBLIGATION_READ_REPOSITORY,
      useFactory: (em: EntityManager) => ({ list: (query: Parameters<AdminReadRepository['listObligations']>[0]) => new AdminReadRepository(em).listObligations(query) }),
      inject: [EntityManager],
    },
    {
      provide: PAYMENT_READ_REPOSITORY,
      useFactory: (em: EntityManager) => ({ list: (query: Parameters<AdminReadRepository['listPayments']>[0]) => new AdminReadRepository(em).listPayments(query) }),
      inject: [EntityManager],
    },
    {
      provide: LEDGER_READ_REPOSITORY,
      useFactory: (em: EntityManager) => ({ list: (query: Parameters<AdminReadRepository['listLedger']>[0]) => new AdminReadRepository(em).listLedger(query) }),
      inject: [EntityManager],
    },
    {
      provide: DASHBOARD_READ_REPOSITORY,
      useFactory: (em: EntityManager) => ({ getSummary: () => new AdminReadRepository(em).getSummary() }),
      inject: [EntityManager],
    },
    OutboxRepository,
  ],
  exports: [
    BeneficiaryRepository,
    DividendRepository,
    DividendObligationRepository,
    PaymentRepository,
    IdempotencyRepository,
    InboxRepository,
    LedgerEntryRepository,
    OutboxRepository,
    DIVIDEND_REPOSITORY,
    BENEFICIARY_REPOSITORY,
    DIVIDEND_OBLIGATION_REPOSITORY,
    PAYMENT_REPOSITORY,
    LEDGER_ENTRY_REPOSITORY,
    BENEFICIARY_READ_REPOSITORY,
    DIVIDEND_READ_REPOSITORY,
    OBLIGATION_READ_REPOSITORY,
    PAYMENT_READ_REPOSITORY,
    LEDGER_READ_REPOSITORY,
    DASHBOARD_READ_REPOSITORY,
  ],
})
export class PersistenceModule {}
