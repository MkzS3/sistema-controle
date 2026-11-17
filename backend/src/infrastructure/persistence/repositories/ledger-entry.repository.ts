import { LedgerEntry, LedgerEntryKind } from '../../../domain/ledger/ledger-entry.js';
import { Money } from '../../../domain/shared/value-objects/money.js';
import type { EntityManager } from '@mikro-orm/core';
import { PersistenceInvariantError } from './persistence-errors.js';
import { entityManagerFor, executeSql, queryOne } from './sql.js';
import { databaseDate } from './date-mapping.js';
import type {
  ApplicationTransactionContext,
  LedgerEntryRepositoryPort,
} from '../../../application/ports/persistence.ports.js';

interface LedgerEntryRow {
  id: string;
  obligation_id: string;
  kind: LedgerEntryKind;
  source_type: 'OBLIGATION' | 'PAYMENT' | 'REVERSAL';
  source_id: string;
  amount: string;
  currency: string;
  created_at: Date | string;
}

export class LedgerEntryRepository implements LedgerEntryRepositoryPort {
  constructor(private readonly em: EntityManager) {}

  /** Only obligation recognition can be recorded in this stage. */
  async recordObligationRecognitionInTransaction(
    em: EntityManager,
    entry: LedgerEntry,
  ): Promise<void> {
    if (
      entry.kind !== LedgerEntryKind.ObligationRecognized ||
      entry.source.type !== 'OBLIGATION' ||
      entry.source.id !== entry.obligationId
    ) {
      throw new PersistenceInvariantError(
        'Etapa 3 only permits recording the fact that an obligation was recognized.',
      );
    }

    await executeSql(
      em,
      `INSERT INTO ledger_entries
        (id, obligation_id, kind, source_type, source_id, amount, currency, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        entry.id,
        entry.obligationId,
        entry.kind,
        entry.source.type,
        entry.source.id,
        entry.amount.toString(),
        entry.amount.currency,
        entry.createdAt,
      ],
    );
  }

  async findById(id: string, context?: ApplicationTransactionContext): Promise<LedgerEntry | undefined> {
    const row = await queryOne<LedgerEntryRow>(
      entityManagerFor(this.em, context),
      `SELECT id, obligation_id, kind, source_type, source_id, amount, currency, created_at
       FROM ledger_entries WHERE id = $1`,
      [id],
    );
    if (!row) return undefined;

    return LedgerEntry.rehydrate({
      id: row.id,
      obligationId: row.obligation_id,
      kind: row.kind,
      source: { type: row.source_type, id: row.source_id },
      amount: Money.from({ amount: row.amount, currency: row.currency }),
      createdAt: databaseDate(row.created_at, 'created_at'),
    });
  }
}
