import { Money } from '../../../domain/shared/value-objects/money.js';
import { Dividend, DividendStatus, type DividendState } from '../../../domain/dividends/dividend.js';
import { databaseDate, optionalDatabaseDate } from './date-mapping.js';
import { PersistenceInvariantError } from './persistence-errors.js';
import { entityManagerFor, inOptionalTransaction, queryOne, queryRows } from './sql.js';
import type { EntityManager } from '@mikro-orm/core';
import type {
  ApplicationTransactionContext,
  DividendRepositoryPort,
} from '../../../application/ports/persistence.ports.js';

interface DividendRow {
  id: string;
  currency: string;
  terms: Record<string, unknown>;
  declared_amount: string | null;
  status: DividendStatus;
  created_at: Date | string;
  record_date: Date | string | null;
  payment_date: Date | string | null;
  declared_at: Date | string | null;
}

export class DividendRepository implements DividendRepositoryPort {
  constructor(private readonly em: EntityManager) {}

  async create(dividend: Dividend, context?: ApplicationTransactionContext): Promise<void> {
    await inOptionalTransaction(this.em, context, async (tx) => {
      const state = dividend.toState();
      const fixed = state.terms.kind === 'FIXED_AMOUNT';
      const declaredAmount = state.terms.kind === 'FIXED_AMOUNT'
        ? state.terms.amount.toString()
        : null;
      await tx.getConnection().execute(
        `INSERT INTO dividends
          (id, currency, terms, declared_amount, status, created_at, record_date, payment_date, declared_at)
         VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9)`,
        [
          state.id,
          state.currency,
          JSON.stringify(fixed ? { kind: 'FIXED_AMOUNT' } : state.terms),
          declaredAmount,
          state.status,
          state.createdAt,
          state.recordDate ?? null,
          state.paymentDate ?? null,
          state.declaredAt ?? null,
        ],
        'run',
        tx.getTransactionContext(),
      );
    });
  }

  async findById(id: string, context?: ApplicationTransactionContext): Promise<Dividend | undefined> {
    return this.loadById(entityManagerFor(this.em, context), id);
  }

  async declare(
    id: string,
    at: Date,
    context?: ApplicationTransactionContext,
  ): Promise<Dividend | undefined> {
    return inOptionalTransaction(this.em, context, async (tx) => {
      const locked = await queryOne<{ id: string }>(
        tx,
        'SELECT id FROM dividends WHERE id = $1 FOR UPDATE',
        [id],
      );
      if (!locked) return undefined;

      const dividend = await this.loadById(tx, id);
      if (!dividend) return undefined;
      dividend.declare(at);
      const state = dividend.toState();
      const updated = await queryRows<{ id: string }>(
        tx,
        `UPDATE dividends SET status = $2, declared_at = $3
         WHERE id = $1 AND status = 'DRAFT'
         RETURNING id`,
        [id, state.status, state.declaredAt],
      );
      if (updated.length !== 1) {
        throw new PersistenceInvariantError(`Dividend ${id} changed during declaration.`);
      }
      return dividend;
    });
  }

  private async loadById(em: EntityManager, id: string): Promise<Dividend | undefined> {
    const row = await queryOne<DividendRow>(
      em,
      `SELECT id, currency, terms, declared_amount, status, created_at,
              record_date, payment_date, declared_at
       FROM dividends WHERE id = $1`,
      [id],
    );
    if (!row) return undefined;

    let terms: DividendState['terms'];
    if (row.terms.kind === 'FIXED_AMOUNT' && row.declared_amount !== null) {
      terms = {
        kind: 'FIXED_AMOUNT',
        amount: Money.from({ amount: row.declared_amount, currency: row.currency }),
      };
    } else if (row.terms.kind === 'PARAMETERS') {
      const parameters = row.terms.parameters;
      if (parameters === null || typeof parameters !== 'object' || Array.isArray(parameters)) {
        throw new PersistenceInvariantError(`Dividend ${id} contains malformed parameters.`);
      }
      terms = { kind: 'PARAMETERS', parameters: parameters as Record<string, string> };
    } else {
      throw new PersistenceInvariantError(`Dividend ${id} contains inconsistent declaration terms.`);
    }

    return Dividend.rehydrate({
      id: row.id,
      currency: row.currency,
      terms,
      status: row.status,
      createdAt: databaseDate(row.created_at, 'created_at'),
      recordDate: optionalDatabaseDate(row.record_date, 'record_date'),
      paymentDate: optionalDatabaseDate(row.payment_date, 'payment_date'),
      declaredAt: optionalDatabaseDate(row.declared_at, 'declared_at'),
    });
  }
}
