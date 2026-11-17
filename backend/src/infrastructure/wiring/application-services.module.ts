import { Module } from '@nestjs/common';
import { PersistenceModule } from '../persistence/persistence.module.js';
import { BeneficiaryApplicationService } from '../../application/use-cases/beneficiary.application-service.js';
import { DividendApplicationService } from '../../application/use-cases/dividend.application-service.js';
import { LedgerApplicationService } from '../../application/use-cases/ledger.application-service.js';
import { ObligationApplicationService } from '../../application/use-cases/obligation.application-service.js';
import { PaymentInstructionApplicationService } from '../../application/use-cases/payment-instruction.application-service.js';
import {
  BeneficiaryReadApplicationService,
  DashboardReadApplicationService,
  DividendReadApplicationService,
  LedgerReadApplicationService,
  ObligationReadApplicationService,
  PaymentReadApplicationService,
} from '../../application/use-cases/read.application-services.js';

@Module({
  imports: [PersistenceModule],
  providers: [
    BeneficiaryApplicationService,
    DividendApplicationService,
    ObligationApplicationService,
    PaymentInstructionApplicationService,
    LedgerApplicationService,
    BeneficiaryReadApplicationService,
    DividendReadApplicationService,
    ObligationReadApplicationService,
    PaymentReadApplicationService,
    LedgerReadApplicationService,
    DashboardReadApplicationService,
  ],
  exports: [
    BeneficiaryApplicationService,
    DividendApplicationService,
    ObligationApplicationService,
    PaymentInstructionApplicationService,
    LedgerApplicationService,
    BeneficiaryReadApplicationService,
    DividendReadApplicationService,
    ObligationReadApplicationService,
    PaymentReadApplicationService,
    LedgerReadApplicationService,
    DashboardReadApplicationService,
  ],
})
export class ApplicationServicesModule {}
