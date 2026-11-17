import { Beneficiary } from '../../../domain/beneficiaries/beneficiary.js';
import { databaseDate } from './date-mapping.js';
import { entityManagerFor, inOptionalTransaction, queryOne } from './sql.js';
import type { EntityManager } from '@mikro-orm/core';
import type {
  ApplicationTransactionContext,
  BeneficiaryRepositoryPort,
} from '../../../application/ports/persistence.ports.js';

interface BeneficiaryRow {
  id: string;
  created_at: Date | string;
}

export class BeneficiaryRepository implements BeneficiaryRepositoryPort {
  constructor(private readonly em: EntityManager) {}

  async create(beneficiary: Beneficiary, context?: ApplicationTransactionContext): Promise<void> {
    await inOptionalTransaction(this.em, context, async (tx) => {
      await tx.getConnection().execute(
        'INSERT INTO beneficiaries (id, created_at) VALUES ($1, $2)',
        [beneficiary.id, beneficiary.createdAt],
        'run',
        tx.getTransactionContext(),
      );
    });
  }

  async findById(id: string, context?: ApplicationTransactionContext): Promise<Beneficiary | undefined> {
    const row = await queryOne<BeneficiaryRow>(
      entityManagerFor(this.em, context),
      'SELECT id, created_at FROM beneficiaries WHERE id = $1',
      [id],
    );
    return row
      ? Beneficiary.rehydrate({ id: row.id, createdAt: databaseDate(row.created_at, 'created_at') })
      : undefined;
  }
}
