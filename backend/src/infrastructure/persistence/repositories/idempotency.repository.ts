import { randomUUID } from 'node:crypto';
import type { EntityManager } from '@mikro-orm/core';
import { canonicalPayloadHash } from './canonical-payload-hash.js';
import { IdempotencyPayloadConflictError, PersistenceInvariantError } from './persistence-errors.js';
import { entityManagerFor, inTransaction, queryOne, queryRows } from './sql.js';
import type {
  ApplicationTransactionContext,
  IdempotentResult,
} from '../../../application/ports/persistence.ports.js';

export interface IdempotentOperation<T> {
  scope: string;
  key: string;
  payload: unknown;
  resultType: string;
  resultId: string;
  execute: (transactionalEm: EntityManager) => Promise<T>;
  loadResult: (transactionalEm: EntityManager, resultType: string, resultId: string) => Promise<T>;
}

interface ExistingIdempotencyRecord {
  payload_hash: string;
  result_type: string;
  result_id: string;
}

export class IdempotencyRepository {
  constructor(private readonly em: EntityManager) {}

  async execute<T>(
    operation: IdempotentOperation<T>,
    context?: ApplicationTransactionContext,
  ): Promise<IdempotentResult<T>> {
    if (!operation.scope.trim() || !operation.key.trim() || !operation.resultType.trim() || !operation.resultId.trim()) {
      throw new TypeError('Idempotency scope, key, and result reference must be non-empty.');
    }
    const hash = canonicalPayloadHash(operation.payload);

    const executeInTransaction = async (tx: EntityManager): Promise<IdempotentResult<T>> => {
      const insertedRows = await queryRows<{ id: string }>(
        tx,
        `INSERT INTO idempotency_records
          (id, scope, key, payload_hash, result_type, result_id, created_at)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, now())
         ON CONFLICT (scope, key) DO NOTHING
         RETURNING id`,
        [randomUUID(), operation.scope, operation.key, hash, operation.resultType, operation.resultId],
      );

      if (insertedRows.length === 1) {
        const value = await operation.execute(tx);
        return { value, replayed: false };
      }

      const previous = await queryOne<ExistingIdempotencyRecord>(
        tx,
        `SELECT payload_hash, result_type, result_id
         FROM idempotency_records WHERE scope = $1 AND key = $2 FOR UPDATE`,
        [operation.scope, operation.key],
      );
      if (!previous) {
        throw new PersistenceInvariantError('Idempotency conflict was reported but its record was not found.');
      }
      if (previous.payload_hash.trim() !== hash) {
        throw new IdempotencyPayloadConflictError(operation.scope, operation.key);
      }

      const value = await operation.loadResult(tx, previous.result_type, previous.result_id);
      return { value, replayed: true };
    };

    return context
      ? executeInTransaction(entityManagerFor(this.em, context))
      : inTransaction(this.em, executeInTransaction);
  }
}
