import { Module } from '@nestjs/common';
import { ApplicationServicesModule } from '../../../infrastructure/wiring/application-services.module.js';
import { BeneficiariesController } from './beneficiaries.controller.js';
import { DividendsController } from './dividends.controller.js';
import { LedgerController } from './ledger.controller.js';
import { ObligationsController } from './obligations.controller.js';
import { PaymentInstructionsController } from './payment-instructions.controller.js';
import { PaymentsController } from './payments.controller.js';
import { DashboardController } from './dashboard.controller.js';
import { AuthSessionController } from '../security/auth-session.controller.js';

@Module({
  imports: [ApplicationServicesModule],
  controllers: [
    BeneficiariesController,
    DividendsController,
    ObligationsController,
    PaymentInstructionsController,
    PaymentsController,
    LedgerController,
    DashboardController,
    AuthSessionController,
  ],
})
export class FinancialApiModule {}
