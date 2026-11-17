import { randomUUID } from 'node:crypto';
import type { EntityManager } from '@mikro-orm/core';
import { queryRows } from './sql.js';

export interface NewOutboxMessage {
  id?: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  createdAt?: Date;
}

export interface ClaimedOutboxMessage {
  id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
  attempt_count: number;
  lease_token: string;
  claimed_until: Date | string;
  created_at: Date | string;
}

export class OutboxRepository {
  async enqueue(em: EntityManager, message: NewOutboxMessage): Promise<string> {
    const id = message.id ?? randomUUID();
    await em.getConnection().execute(
      `INSERT INTO transactional_outbox
        (id, event_type, aggregate_type, aggregate_id, payload, status, attempt_count, available_at, created_at)
       VALUES ($1::uuid, $2, $3, $4, $5::jsonb, 'PENDING', 0, COALESCE($6, now()), COALESCE($6, now()))`,
      [id, message.eventType, message.aggregateType, message.aggregateId, JSON.stringify(message.payload), message.createdAt ?? null],
      'run',
      em.getTransactionContext(),
    );
    return id;
  }

  async claimBatch(
    em: EntityManager,
    limit: number,
    leaseSeconds: number,
  ): Promise<ClaimedOutboxMessage[]> {
    if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(leaseSeconds) || leaseSeconds < 1) {
      throw new RangeError('Outbox claim limit and lease must be positive integers.');
    }

    return queryRows<ClaimedOutboxMessage>(
      em,
      `WITH available AS (
         SELECT id
         FROM transactional_outbox
         WHERE (status = 'PENDING' AND available_at <= now())
            OR (status = 'PROCESSING' AND claimed_until <= now())
         ORDER BY created_at, id
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE transactional_outbox AS outbox
       SET status = 'PROCESSING',
           attempt_count = outbox.attempt_count + 1,
           lease_token = gen_random_uuid(),
           claimed_until = now() + make_interval(secs => $2)
       FROM available
       WHERE outbox.id = available.id
       RETURNING outbox.id, outbox.event_type, outbox.aggregate_type, outbox.aggregate_id,
                 outbox.payload, outbox.attempt_count, outbox.lease_token, outbox.claimed_until,
                 outbox.created_at`,
      [limit, leaseSeconds],
    );
  }

  async markPublished(em: EntityManager, id: string, leaseToken: string): Promise<boolean> {
    const rows = await queryRows<{ id: string }>(
      em,
      `UPDATE transactional_outbox
       SET status = 'PUBLISHED', published_at = now(), claimed_until = NULL, lease_token = NULL, last_error = NULL
       WHERE id = $1::uuid AND status = 'PROCESSING' AND lease_token = $2::uuid
       RETURNING id`,
      [id, leaseToken],
    );
    return rows.length === 1;
  }

  async releaseForRetry(
    em: EntityManager,
    id: string,
    leaseToken: string,
    delaySeconds: number,
    error: string,
  ): Promise<boolean> {
    if (!Number.isInteger(delaySeconds) || delaySeconds < 0) {
      throw new RangeError('Outbox retry delay must be a non-negative integer.');
    }
    const rows = await queryRows<{ id: string }>(
      em,
      `UPDATE transactional_outbox
       SET status = 'PENDING', available_at = now() + make_interval(secs => $3),
           claimed_until = NULL, lease_token = NULL, last_error = $4
       WHERE id = $1::uuid AND status = 'PROCESSING' AND lease_token = $2::uuid
       RETURNING id`,
      [id, leaseToken, delaySeconds, error.slice(0, 4000)],
    );
    return rows.length === 1;
  }

  async markDeadLettered(
    em: EntityManager,
    id: string,
    leaseToken: string,
    error: string,
  ): Promise<boolean> {
    const rows = await queryRows<{ id: string }>(
      em,
      `UPDATE transactional_outbox
       SET status = 'DEAD_LETTERED', dead_lettered_at = now(),
           claimed_until = NULL, lease_token = NULL, last_error = $3
       WHERE id = $1::uuid AND status = 'PROCESSING' AND lease_token = $2::uuid
       RETURNING id`,
      [id, leaseToken, error.slice(0, 4000)],
    );
    return rows.length === 1;
  }
}
