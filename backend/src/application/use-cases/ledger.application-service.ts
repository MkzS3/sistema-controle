import { Inject, Injectable } from '@nestjs/common';
import { ApplicationNotFoundError } from '../errors/application-error.js';
import {
  LEDGER_ENTRY_REPOSITORY,
  type ApplicationTransactionContext,
  type LedgerEntryRepositoryPort,
} from '../ports/persistence.ports.js';
import { ledgerEntryResponse } from '../serializers/domain-serializers.js';

@Injectable()
export class LedgerApplicationService {
  constructor(
    @Inject(LEDGER_ENTRY_REPOSITORY) private readonly ledgerEntries: LedgerEntryRepositoryPort,
  ) {}

  async get(id: string, context?: ApplicationTransactionContext) {
    const entry = await this.ledgerEntries.findById(id, context);
    if (!entry) throw new ApplicationNotFoundError('Ledger entry', id);
    return ledgerEntryResponse(entry);
  }
}
