import { randomUUID } from 'node:crypto';
import type { EntityManager } from '@mikro-orm/core';
import { canonicalPayloadHash } from '../../persistence/repositories/canonical-payload-hash.js';
import { InboxPayloadConflictError, PersistenceInvariantError } from '../../persistence/repositories/persistence-errors.js';
import { inTransaction, queryOne } from '../../persistence/repositories/sql.js';

interface InboxRow {
  id: string;
  payload_hash: string;
  status: 'RECEIVED' | 'PROCESSING' | 'PROCESSED';
}

/**
 * Records and handles one message in a single database transaction.
 * Handlers must perform database work only; external delivery belongs after commit.
 */
export class InboxRepository {
  constructor(private readonly em: EntityManager) {}

  async processOnce(
    consumerName: string,
    messageId: string,
    payload: unknown,
    handler: (transactionalEm: EntityManager) => Promise<void>,
  ): Promise<{ processed: boolean }> {
    if (!consumerName.trim() || !messageId.trim()) {
      throw new TypeError('Inbox consumer name and message ID must be non-empty.');
    }
    const hash = canonicalPayloadHash(payload);

    try {
      return await inTransaction(this.em, async (tx) => {
        const inserted = await queryOne<{ id: string }>(
          tx,
          `INSERT INTO inbox_messages
            (id, consumer_name, message_id, payload_hash, status, attempt_count, received_at)
           VALUES ($1::uuid, $2, $3, $4, 'PROCESSING', 1, now())
           ON CONFLICT (consumer_name, message_id) DO NOTHING
           RETURNING id`,
          [randomUUID(), consumerName, messageId, hash],
        );

        if (!inserted) {
          const previous = await queryOne<InboxRow>(
            tx,
            `SELECT id, payload_hash, status FROM inbox_messages
             WHERE consumer_name = $1 AND message_id = $2 FOR UPDATE`,
            [consumerName, messageId],
          );
          if (!previous) {
            throw new PersistenceInvariantError('Inbox conflict was reported but its message was not found.');
          }
          if (previous.payload_hash.trim() !== hash) {
            throw new InboxPayloadConflictError(consumerName, messageId);
          }
          if (previous.status === 'PROCESSED') return { processed: false };

          await tx.getConnection().execute(
            `UPDATE inbox_messages
             SET status = 'PROCESSING', attempt_count = attempt_count + 1, last_error = NULL
             WHERE id = $1::uuid`,
            [previous.id],
            'run',
            tx.getTransactionContext(),
          );
        }

        await handler(tx);
        const updated = await queryOne<{ id: string }>(
          tx,
          `UPDATE inbox_messages
           SET status = 'PROCESSED', processed_at = now(), last_error = NULL
           WHERE consumer_name = $1 AND message_id = $2
           RETURNING id`,
          [consumerName, messageId],
        );
        if (!updated) throw new PersistenceInvariantError('Inbox message disappeared before commit.');
        return { processed: true };
      });
    } catch (error) {
      if (!(error instanceof InboxPayloadConflictError)) {
        const message = error instanceof Error ? error.message.slice(0, 4000) : 'Unknown inbox processing failure.';
        await inTransaction(this.em, async (tx) => {
          await queryOne<{ id: string }>(
            tx,
            `INSERT INTO inbox_messages
              (id, consumer_name, message_id, payload_hash, status, attempt_count, received_at, last_error)
             VALUES ($1::uuid, $2, $3, $4, 'RECEIVED', 1, now(), $5)
             ON CONFLICT (consumer_name, message_id) DO UPDATE
             SET status = 'RECEIVED', attempt_count = inbox_messages.attempt_count + 1,
                 last_error = EXCLUDED.last_error
             WHERE inbox_messages.status <> 'PROCESSED'
             RETURNING id`,
            [randomUUID(), consumerName, messageId, hash, message],
          );
        });
      }
      throw error;
    }
  }
}
